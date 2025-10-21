import { Root } from "mdast";
import { readFile, writeFile, mkdir, readdir, unlink, stat } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { randomUUID } from "crypto";

export interface ResourceMetadata {
  created: string;
  expires: string;
  source?: {
    type: "text" | "file" | "url" | "mdast";
    value?: string;
  };
  operations?: Array<{
    timestamp: string;
    tool: string;
    operation: string;
  }>;
}

export interface Resource {
  uid: string;
  mdast: Root;
  metadata: ResourceMetadata;
}

export interface ResourceInfo {
  uri: string;
  name: string;
  mimeType: string;
  created: string;
  expires: string;
  size?: number;
}

export class ResourceManager {
  private storagePath: string;
  private maxResources = 1000;
  private maxStorageSize = 100 * 1024 * 1024; // 100MB
  private maxTTL = 30 * 24 * 60 * 60; // 30 days in seconds

  constructor(customPath?: string) {
    this.storagePath =
      customPath || join(homedir(), ".local", "share", "mcp-mdast", "resources");
  }

  /**
   * Initialize storage directory
   */
  async initialize(): Promise<void> {
    if (!existsSync(this.storagePath)) {
      await mkdir(this.storagePath, { recursive: true });
    }
  }

  /**
   * Save MDAST as a resource
   */
  async save(
    mdast: Root,
    metadata: Partial<ResourceMetadata> = {},
    ttlSeconds: number = 86400
  ): Promise<string> {
    await this.initialize();

    // Validate TTL
    const validTTL = Math.min(Math.max(ttlSeconds, 60), this.maxTTL);

    const uid = randomUUID();
    const now = new Date();
    const expires = new Date(now.getTime() + validTTL * 1000);

    const resource: Resource = {
      uid,
      mdast,
      metadata: {
        created: now.toISOString(),
        expires: expires.toISOString(),
        ...metadata,
      },
    };

    const filePath = join(this.storagePath, `${uid}.json`);
    await writeFile(filePath, JSON.stringify(resource, null, 2), "utf-8");

    // Cleanup old resources if needed
    await this.cleanupIfNeeded();

    return uid;
  }

  /**
   * Load MDAST resource by UID
   */
  async load(uid: string): Promise<Resource | null> {
    const filePath = join(this.storagePath, `${uid}.json`);

    if (!existsSync(filePath)) {
      return null;
    }

    try {
      const content = await readFile(filePath, "utf-8");
      const resource: Resource = JSON.parse(content);

      // Check expiration
      const now = new Date();
      const expires = new Date(resource.metadata.expires);

      if (now > expires) {
        // Resource expired, delete it
        await unlink(filePath);
        return null;
      }

      return resource;
    } catch (error) {
      console.error(`Failed to load resource ${uid}:`, error);
      return null;
    }
  }

  /**
   * List all available resources
   */
  async list(): Promise<ResourceInfo[]> {
    await this.initialize();

    const files = await readdir(this.storagePath);
    const resources: ResourceInfo[] = [];

    for (const file of files) {
      if (!file.endsWith(".json")) continue;

      const uid = file.replace(".json", "");
      const filePath = join(this.storagePath, file);

      try {
        const content = await readFile(filePath, "utf-8");
        const resource: Resource = JSON.parse(content);

        // Check expiration
        const now = new Date();
        const expires = new Date(resource.metadata.expires);

        if (now > expires) {
          // Expired, skip and delete
          await unlink(filePath);
          continue;
        }

        const stats = await stat(filePath);
        const sourceName = resource.metadata.source?.value || uid;

        resources.push({
          uri: `mdast://${uid}`,
          name: `${sourceName} (processed)`,
          mimeType: "application/vnd.mdast+json",
          created: resource.metadata.created,
          expires: resource.metadata.expires,
          size: stats.size,
        });
      } catch (error) {
        console.error(`Failed to read resource ${uid}:`, error);
      }
    }

    return resources;
  }

  /**
   * Delete a resource by UID
   */
  async delete(uid: string): Promise<boolean> {
    const filePath = join(this.storagePath, `${uid}.json`);

    if (!existsSync(filePath)) {
      return false;
    }

    try {
      await unlink(filePath);
      return true;
    } catch (error) {
      console.error(`Failed to delete resource ${uid}:`, error);
      return false;
    }
  }

  /**
   * Cleanup expired resources
   */
  async cleanup(): Promise<number> {
    await this.initialize();

    const files = await readdir(this.storagePath);
    let deletedCount = 0;
    const now = new Date();

    for (const file of files) {
      if (!file.endsWith(".json")) continue;

      const filePath = join(this.storagePath, file);

      try {
        const content = await readFile(filePath, "utf-8");
        const resource: Resource = JSON.parse(content);
        const expires = new Date(resource.metadata.expires);

        if (now > expires) {
          await unlink(filePath);
          deletedCount++;
        }
      } catch (error) {
        console.error(`Failed to cleanup ${file}:`, error);
      }
    }

    return deletedCount;
  }

  /**
   * Cleanup if storage limits are exceeded
   */
  private async cleanupIfNeeded(): Promise<void> {
    const files = await readdir(this.storagePath);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));

    // Check resource count limit
    if (jsonFiles.length > this.maxResources) {
      // Delete oldest resources
      const filesWithStats = await Promise.all(
        jsonFiles.map(async (file) => {
          const filePath = join(this.storagePath, file);
          const stats = await stat(filePath);
          return { file, mtime: stats.mtime };
        })
      );

      filesWithStats.sort((a, b) => a.mtime.getTime() - b.mtime.getTime());

      const toDelete = filesWithStats.slice(
        0,
        jsonFiles.length - this.maxResources
      );
      for (const { file } of toDelete) {
        await unlink(join(this.storagePath, file));
      }
    }

    // Check storage size limit
    const totalSize = await this.getTotalStorageSize();
    if (totalSize > this.maxStorageSize) {
      // Delete oldest resources until under limit
      const filesWithStats = await Promise.all(
        jsonFiles.map(async (file) => {
          const filePath = join(this.storagePath, file);
          const stats = await stat(filePath);
          return { file, mtime: stats.mtime, size: stats.size };
        })
      );

      filesWithStats.sort((a, b) => a.mtime.getTime() - b.mtime.getTime());

      let currentSize = totalSize;
      for (const { file, size } of filesWithStats) {
        if (currentSize <= this.maxStorageSize * 0.8) break; // Delete until 80% of limit
        await unlink(join(this.storagePath, file));
        currentSize -= size;
      }
    }
  }

  /**
   * Get total storage size in bytes
   */
  private async getTotalStorageSize(): Promise<number> {
    const files = await readdir(this.storagePath);
    let totalSize = 0;

    for (const file of files) {
      const filePath = join(this.storagePath, file);
      const stats = await stat(filePath);
      totalSize += stats.size;
    }

    return totalSize;
  }

  /**
   * Parse mdast:// URI to extract UID
   */
  static parseUri(uri: string): string | null {
    const match = uri.match(/^mdast:\/\/([a-f0-9-]+)$/i);
    return match ? match[1] : null;
  }

  /**
   * Create mdast:// URI from UID
   */
  static createUri(uid: string): string {
    return `mdast://${uid}`;
  }
}

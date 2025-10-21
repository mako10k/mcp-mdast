import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { homedir } from "os";
import { resolve } from "path";
import { ResourceManager, Resource } from "./resource-manager.js";

export interface InputSpec {
  source: "text" | "file" | "url" | "mdast";
  value?: string; // for text
  path?: string; // for file
  url?: string; // for url
  uri?: string; // for mdast
}

export class InputResolver {
  private resourceManager: ResourceManager;
  private httpTimeout = 30000; // 30 seconds
  private maxHttpSize = 10 * 1024 * 1024; // 10MB

  constructor(resourceManager: ResourceManager) {
    this.resourceManager = resourceManager;
  }

  /**
   * Resolve input to Markdown string
   */
  async resolve(input: InputSpec | string): Promise<string> {
    // Backward compatibility: if string, treat as inline text
    if (typeof input === "string") {
      return input;
    }

    switch (input.source) {
      case "text":
        return this.resolveText(input.value);

      case "file":
        return this.resolveFile(input.path);

      case "url":
        return this.resolveUrl(input.url);

      case "mdast":
        return this.resolveMdast(input.uri);

      default:
        throw new Error(`Unknown input source: ${(input as any).source}`);
    }
  }

  /**
   * Resolve inline text
   */
  private resolveText(value?: string): string {
    if (!value) {
      throw new Error("Text value is required for text source");
    }
    return value;
  }

  /**
   * Resolve file path to Markdown content
   */
  private async resolveFile(path?: string): Promise<string> {
    if (!path) {
      throw new Error("Path is required for file source");
    }

    // Security: resolve to absolute path
    const absolutePath = resolve(path);

    // Security: only allow access to home directory
    const home = homedir();
    if (!absolutePath.startsWith(home)) {
      throw new Error(
        `Access denied: file must be within home directory (${home})`
      );
    }

    if (!existsSync(absolutePath)) {
      throw new Error(`File not found: ${path}`);
    }

    try {
      const content = await readFile(absolutePath, "utf-8");
      return content;
    } catch (error) {
      throw new Error(
        `Failed to read file ${path}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Resolve HTTP(S) URL to Markdown content
   */
  private async resolveUrl(url?: string): Promise<string> {
    if (!url) {
      throw new Error("URL is required for url source");
    }

    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch (error) {
      throw new Error(`Invalid URL: ${url}`);
    }

    // Security: only allow http/https
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error(
        `Unsupported protocol: ${parsedUrl.protocol}. Only http: and https: are allowed.`
      );
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.httpTimeout);

      const response = await fetch(url, {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "User-Agent": "mcp-mdast/1.0",
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Check content length
      const contentLength = response.headers.get("content-length");
      if (contentLength && parseInt(contentLength) > this.maxHttpSize) {
        throw new Error(
          `Content too large: ${contentLength} bytes (max ${this.maxHttpSize})`
        );
      }

      const content = await response.text();

      // Double-check size after download
      if (content.length > this.maxHttpSize) {
        throw new Error(
          `Content too large: ${content.length} bytes (max ${this.maxHttpSize})`
        );
      }

      return content;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new Error(`Request timeout after ${this.httpTimeout}ms`);
        }
        throw new Error(`Failed to fetch URL: ${error.message}`);
      }
      throw new Error(`Failed to fetch URL: ${String(error)}`);
    }
  }

  /**
   * Resolve MDAST resource URI to Markdown content
   */
  private async resolveMdast(uri?: string): Promise<string> {
    if (!uri) {
      throw new Error("URI is required for mdast source");
    }

    const uid = ResourceManager.parseUri(uri);
    if (!uid) {
      throw new Error(`Invalid mdast URI: ${uri}`);
    }

    const resource = await this.resourceManager.load(uid);
    if (!resource) {
      throw new Error(`Resource not found or expired: ${uri}`);
    }

    // Convert MDAST back to Markdown
    // This will be done using the processor's stringify method
    // For now, we'll return the MDAST as JSON string
    // The caller (processor) will handle the conversion
    return JSON.stringify(resource.mdast);
  }

  /**
   * Get resource metadata if input is mdast URI
   */
  async getResourceMetadata(input: InputSpec | string): Promise<Resource | null> {
    if (typeof input === "string") {
      return null;
    }

    if (input.source !== "mdast" || !input.uri) {
      return null;
    }

    const uid = ResourceManager.parseUri(input.uri);
    if (!uid) {
      return null;
    }

    return this.resourceManager.load(uid);
  }
}

import { Root } from "mdast";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { homedir } from "os";
import { ResourceManager, ResourceMetadata } from "./resource-manager.js";

export interface OutputSpec {
  type: "text" | "file" | "mdast";
  path?: string; // for file
  ttl?: number; // for mdast (seconds)
}

export interface OutputResult {
  type: "text" | "file" | "mdast";
  content?: string; // for text
  path?: string; // for file
  uri?: string; // for mdast
  expires?: string; // for mdast
  message?: string;
}

export class OutputHandler {
  private resourceManager: ResourceManager;

  constructor(resourceManager: ResourceManager) {
    this.resourceManager = resourceManager;
  }

  /**
   * Handle output based on specification
   */
  async handle(
    markdown: string,
    mdast: Root,
    output?: OutputSpec,
    sourceMetadata?: Partial<ResourceMetadata>
  ): Promise<OutputResult> {
    // Default: text output
    if (!output || output.type === "text") {
      return {
        type: "text",
        content: markdown,
      };
    }

    switch (output.type) {
      case "file":
        return this.handleFile(markdown, output.path);

      case "mdast":
        return this.handleMdast(mdast, output.ttl, sourceMetadata);

      default:
        throw new Error(`Unknown output type: ${(output as any).type}`);
    }
  }

  /**
   * Handle file output
   */
  private async handleFile(
    markdown: string,
    path?: string
  ): Promise<OutputResult> {
    if (!path) {
      throw new Error("Path is required for file output");
    }

    // Security: resolve to absolute path
    const absolutePath = resolve(path);

    // Security: only allow writing to home directory
    const home = homedir();
    if (!absolutePath.startsWith(home)) {
      throw new Error(
        `Access denied: file must be within home directory (${home})`
      );
    }

    try {
      // Create directory if it doesn't exist
      const dir = dirname(absolutePath);
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }

      await writeFile(absolutePath, markdown, "utf-8");

      return {
        type: "file",
        path: absolutePath,
        message: `Successfully wrote to ${absolutePath}`,
      };
    } catch (error) {
      throw new Error(
        `Failed to write file ${path}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Handle MDAST resource output
   */
  private async handleMdast(
    mdast: Root,
    ttl?: number,
    sourceMetadata?: Partial<ResourceMetadata>
  ): Promise<OutputResult> {
    const ttlSeconds = ttl || 86400; // Default: 1 day

    const uid = await this.resourceManager.save(mdast, sourceMetadata, ttlSeconds);
    const uri = ResourceManager.createUri(uid);

    const resource = await this.resourceManager.load(uid);
    if (!resource) {
      throw new Error("Failed to load saved resource");
    }

    return {
      type: "mdast",
      uri,
      expires: resource.metadata.expires,
      message: `Saved as MDAST resource: ${uri}`,
    };
  }
}

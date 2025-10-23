#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { MDProcessor } from "./processor.js";
import { ResourceManager } from "./resource-manager.js";

const server = new Server(
  {
    name: "mcp-mdast",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

const processor = new MDProcessor();

// Initialize processor
processor.initialize().catch(console.error);

// ツールリストハンドラー
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "mdast-query",
        description:
          "Parse Markdown to MDAST and perform query/manipulation operations with CSS-style selectors. Supports select/insert/update/remove/replace operations. Input: text/file/url/mdast, Output: text/file/mdast",
        inputSchema: {
          type: "object",
          properties: {
            markdown: {
              type: "object",
              description: "Input specification",
              properties: {
                source: {
                  type: "string",
                  enum: ["text", "file", "url", "mdast"],
                  description: "Input source type",
                },
                value: {
                  type: "string",
                  description: "text: Markdown string",
                },
                path: {
                  type: "string",
                  description: "file: File path (within home directory)",
                },
                url: {
                  type: "string",
                  description: "url: HTTP(S) URL",
                },
                uri: {
                  type: "string",
                  description: "mdast: Resource URI (mdast://...)",
                },
              },
              required: ["source"],
            },
            operation: {
              type: "string",
              enum: ["select", "insert", "update", "remove", "replace"],
              description: "Operation type to perform",
            },
            selector: {
              type: "string",
              description:
                "CSS-style selector (e.g., 'heading[depth=\"1\"]', 'paragraph > strong')",
            },
            content: {
              type: "string",
              description: "Content to insert/update (Markdown format)",
            },
            position: {
              type: "string",
              enum: ["before", "after", "prepend", "append", "replace"],
              description: "Position specification for insertion",
            },
            index: {
              type: "number",
              description: "Index specification for multiple matches (0-based)",
            },
            output: {
              type: "object",
              description: "Output destination specification",
              properties: {
                type: {
                  type: "string",
                  enum: ["text", "file", "mdast"],
                  description: "Output type",
                },
                path: {
                  type: "string",
                  description: "file: Save path (within home directory)",
                },
                ttl: {
                  type: "number",
                  description: "mdast: TTL in seconds (default 86400=1 day)",
                },
              },
              required: ["type"],
            },
          },
          required: ["operation"]
        },
      },
      {
        name: "mdast-transform",
        description:
          "Apply custom transformation logic. Supports wrap/unwrap/rename/clone operations. Input: text/file/url/mdast, Output: text/file/mdast",
        inputSchema: {
          type: "object",
          properties: {
            markdown: {
              type: "object",
              description: "Input specification",
              properties: {
                source: {
                  type: "string",
                  enum: ["text", "file", "url", "mdast"],
                  description: "Input source type",
                },
                value: {
                  type: "string",
                  description: "text: Markdown string",
                },
                path: {
                  type: "string",
                  description: "file: File path",
                },
                url: {
                  type: "string",
                  description: "url: HTTP(S) URL",
                },
                uri: {
                  type: "string",
                  description: "mdast: Resource URI",
                },
              },
              required: ["source"],
            },
            transforms: {
              type: "array",
              description: "List of transformations to apply",
              items: {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    enum: ["wrap", "unwrap", "rename", "clone"],
                    description: "Transformation type",
                  },
                  selector: {
                    type: "string",
                    description: "CSS-style selector for target nodes",
                  },
                  wrapper: {
                    type: "string",
                    description: "Wrapper type for wrap operation (e.g., 'blockquote')",
                  },
                  newType: {
                    type: "string",
                    description: "New node type for rename operation",
                  },
                  depth: {
                    type: "number",
                    description: "Heading depth for rename operation (1-6)",
                  },
                  targetSelector: {
                    type: "string",
                    description: "Target selector for clone insertion",
                  },
                },
                required: ["type", "selector"],
              },
            },
            output: {
              type: "object",
              description: "Output destination specification",
              properties: {
                type: {
                  type: "string",
                  enum: ["text", "file", "mdast"],
                  description: "Output type",
                },
                path: {
                  type: "string",
                  description: "file: 保存先パス",
                },
                ttl: {
                  type: "number",
                  description: "mdast: 有効期限（秒）",
                },
              },
              required: ["type"],
            },
          },
          required: ["transforms"]
        },
      },
      {
        name: "mdast-analyze",
        description:
          "Analyze document structure and retrieve statistics. Supports structure/stats/links/headings/toc analysis. Input: text/file/url/mdast",
        inputSchema: {
          type: "object",
          properties: {
            markdown: {
              type: "object",
              description: "Input specification",
              properties: {
                source: {
                  type: "string",
                  enum: ["text", "file", "url", "mdast"],
                  description: "Input source type",
                },
                value: {
                  type: "string",
                  description: "text: Markdown string",
                },
                path: {
                  type: "string",
                  description: "file: File path",
                },
                url: {
                  type: "string",
                  description: "url: HTTP(S) URL",
                },
                uri: {
                  type: "string",
                  description: "mdast: Resource URI",
                },
              },
              required: ["source"],
            },
            analysis: {
              type: "array",
              description: "List of analysis types to perform",
              items: {
                type: "string",
                enum: ["structure", "stats", "links", "headings", "toc"],
              },
            },
          }
        },
      },
    ],
  };
});

// ツール実行ハンドラー
server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "mdast-query": {
        // Get input from args
        let input = args.markdown;
        if (!input) {
          throw new Error("'markdown' parameter is required");
        }
        
        // If markdown is a stringified JSON, parse it
        if (typeof input === "string" && input.trim().startsWith("{")) {
          try {
            input = JSON.parse(input);
          } catch {
            // Not JSON, use as-is
          }
        }
        
        // Parse output if it's a stringified JSON
        let output = args.output;
        if (output && typeof output === "string" && output.trim().startsWith("{")) {
          try {
            output = JSON.parse(output);
          } catch {
            // Not JSON, use as-is
          }
        }
        
        const result = await processor.queryExtended(
          input,
          args.operation as any,
          args.selector as string | undefined,
          args.content as string | undefined,
          args.position as any,
          args.index as number | undefined,
          output as any
        );
        
        // Type guard for OutputResult
        if ('type' in result && result.type === "text") {
          return {
            content: [
              {
                type: "text",
                text: result.content || JSON.stringify(result, null, 2),
              },
            ],
          };
        } else if ('type' in result && result.type === "file") {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  message: result.message,
                  path: result.path,
                }, null, 2),
              },
            ],
          };
        } else if ('type' in result && result.type === "mdast") {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  uri: result.uri,
                  expires: result.expires,
                  message: result.message,
                }, null, 2),
              },
            ],
          };
        }
        
        // Fallback for QueryResult
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "mdast-transform": {
        // Determine input: markdown can be string or object (InputSpec)
        let input = args.markdown;
        if (!input) {
          throw new Error("'markdown' parameter is required");
        }
        
        // If markdown is a stringified JSON, parse it
        if (typeof input === "string" && input.trim().startsWith("{")) {
          try {
            input = JSON.parse(input);
          } catch {
            // Not JSON, use as-is
          }
        }
        
        // Parse output if it's a stringified JSON
        let output = args.output;
        if (output && typeof output === "string" && output.trim().startsWith("{")) {
          try {
            output = JSON.parse(output);
          } catch {
            // Not JSON, use as-is
          }
        }
        
        const result = await processor.transformExtended(
          input,
          args.transforms as any[],
          output as any
        );
        
        // Type guard for OutputResult
        if ('type' in result && result.type === "text") {
          return {
            content: [
              {
                type: "text",
                text: result.content || JSON.stringify(result, null, 2),
              },
            ],
          };
        } else if ('type' in result && result.type === "file") {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  message: result.message,
                  path: result.path,
                }, null, 2),
              },
            ],
          };
        } else if ('type' in result && result.type === "mdast") {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  uri: result.uri,
                  expires: result.expires,
                  message: result.message,
                }, null, 2),
              },
            ],
          };
        }
        
        // Fallback for TransformResult
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "mdast-analyze": {
        // Determine input: markdown can be string or object (InputSpec)
        let input = args.markdown;
        if (!input) {
          throw new Error("'markdown' parameter is required");
        }
        
        // If markdown is a stringified JSON, parse it
        if (typeof input === "string" && input.trim().startsWith("{")) {
          try {
            input = JSON.parse(input);
          } catch {
            // Not JSON, use as-is
          }
        }
        
        const result = await processor.analyzeExtended(
          input,
          args.analysis as string[]
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ success: false, error: errorMessage }, null, 2),
        },
      ],
      isError: true,
    };
  }
});

// Resource list handler
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  try {
    const resourceManager = processor.getResourceManager();
    const resources = await resourceManager.list();
    
    return {
      resources: resources.map((r) => ({
        uri: r.uri,
        name: r.name,
        mimeType: r.mimeType,
        description: `Created: ${new Date(r.created).toLocaleString()}, Expires: ${new Date(r.expires).toLocaleString()}`,
      })),
    };
  } catch (error) {
    console.error("Error listing resources:", error);
    return { resources: [] };
  }
});

// Resource read handler
server.setRequestHandler(ReadResourceRequestSchema, async (request: any) => {
  try {
    const { uri } = request.params;
    
    if (!uri.startsWith("mdast://")) {
      throw new Error(`Invalid URI scheme: ${uri}`);
    }
    
    const uid = ResourceManager.parseUri(uri);
    if (!uid) {
      throw new Error(`Invalid mdast URI: ${uri}`);
    }
    
    const resourceManager = processor.getResourceManager();
    const resource = await resourceManager.load(uid);
    
    if (!resource) {
      throw new Error(`Resource not found or expired: ${uri}`);
    }
    
    // Convert MDAST to Markdown for reading
    const markdown = processor["stringify"](resource.mdast);
    
    return {
      contents: [
        {
          uri,
          mimeType: "text/markdown",
          text: markdown,
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read resource: ${errorMessage}`);
  }
});

// サーバー起動
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // eslint-disable-next-line no-console
  console.error("MCP MDAST Server running on stdio");
}

main().catch((error: Error) => {
  // eslint-disable-next-line no-console
  console.error("Fatal error:", error);
  process.exit(1);
});

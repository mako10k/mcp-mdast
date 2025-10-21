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
          "MarkdownをMDASTに解析し、CSS風セレクタでクエリ・操作を行う統合ツール。select/insert/update/remove/replace操作をサポート。入力: text/file/url/mdast、出力: text/file/mdast",
        inputSchema: {
          type: "object",
          properties: {
            markdown: {
              type: "string",
              description: "操作対象のMarkdownテキスト（後方互換性）",
            },
            input: {
              type: "object",
              description: "柔軟な入力指定",
              properties: {
                source: {
                  type: "string",
                  enum: ["text", "file", "url", "mdast"],
                  description: "入力ソースタイプ",
                },
                value: {
                  type: "string",
                  description: "text: Markdown文字列",
                },
                path: {
                  type: "string",
                  description: "file: ファイルパス（ホームディレクトリ内）",
                },
                url: {
                  type: "string",
                  description: "url: HTTP(S) URL",
                },
                uri: {
                  type: "string",
                  description: "mdast: リソースURI (mdast://...)",
                },
              },
              required: ["source"],
            },
            operation: {
              type: "string",
              enum: ["select", "insert", "update", "remove", "replace"],
              description: "実行する操作タイプ",
            },
            selector: {
              type: "string",
              description:
                "CSS風セレクタ (例: 'heading[depth=\"1\"]', 'paragraph > strong')",
            },
            content: {
              type: "string",
              description: "挿入/更新するコンテンツ (Markdown形式)",
            },
            position: {
              type: "string",
              enum: ["before", "after", "prepend", "append", "replace"],
              description: "挿入位置の指定",
            },
            index: {
              type: "number",
              description: "複数マッチ時のインデックス指定 (0始まり)",
            },
            output: {
              type: "object",
              description: "出力先指定",
              properties: {
                type: {
                  type: "string",
                  enum: ["text", "file", "mdast"],
                  description: "出力タイプ",
                },
                path: {
                  type: "string",
                  description: "file: 保存先パス（ホームディレクトリ内）",
                },
                ttl: {
                  type: "number",
                  description: "mdast: 有効期限（秒、デフォルト86400=1日）",
                },
              },
              required: ["type"],
            },
          },
          required: ["operation"],
        },
      },
      {
        name: "mdast-transform",
        description:
          "カスタム変換ロジックを適用。wrap/unwrap/rename/clone操作をサポート。入力: text/file/url/mdast、出力: text/file/mdast",
        inputSchema: {
          type: "object",
          properties: {
            markdown: {
              type: "string",
              description: "変換対象のMarkdownテキスト（後方互換性）",
            },
            input: {
              type: "object",
              description: "柔軟な入力指定",
              properties: {
                source: {
                  type: "string",
                  enum: ["text", "file", "url", "mdast"],
                  description: "入力ソースタイプ",
                },
                value: {
                  type: "string",
                  description: "text: Markdown文字列",
                },
                path: {
                  type: "string",
                  description: "file: ファイルパス",
                },
                url: {
                  type: "string",
                  description: "url: HTTP(S) URL",
                },
                uri: {
                  type: "string",
                  description: "mdast: リソースURI",
                },
              },
              required: ["source"],
            },
            transforms: {
              type: "array",
              description: "適用する変換のリスト",
              items: {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    enum: ["wrap", "unwrap", "rename", "clone"],
                    description: "変換タイプ",
                  },
                  selector: {
                    type: "string",
                    description: "対象ノードのCSS風セレクタ",
                  },
                  wrapper: {
                    type: "string",
                    description: "wrap時のラッパータイプ (例: 'blockquote')",
                  },
                  newType: {
                    type: "string",
                    description: "rename時の新しいノードタイプ",
                  },
                  targetSelector: {
                    type: "string",
                    description: "clone時の挿入先セレクタ",
                  },
                },
                required: ["type", "selector"],
              },
            },
            output: {
              type: "object",
              description: "出力先指定",
              properties: {
                type: {
                  type: "string",
                  enum: ["text", "file", "mdast"],
                  description: "出力タイプ",
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
          required: ["transforms"],
        },
      },
      {
        name: "mdast-analyze",
        description:
          "ドキュメント構造の分析と統計情報の取得。structure/stats/links/headings/toc分析をサポート。入力: text/file/url/mdast",
        inputSchema: {
          type: "object",
          properties: {
            markdown: {
              type: "string",
              description: "分析対象のMarkdownテキスト（後方互換性）",
            },
            input: {
              type: "object",
              description: "柔軟な入力指定",
              properties: {
                source: {
                  type: "string",
                  enum: ["text", "file", "url", "mdast"],
                  description: "入力ソースタイプ",
                },
                value: {
                  type: "string",
                  description: "text: Markdown文字列",
                },
                path: {
                  type: "string",
                  description: "file: ファイルパス",
                },
                url: {
                  type: "string",
                  description: "url: HTTP(S) URL",
                },
                uri: {
                  type: "string",
                  description: "mdast: リソースURI",
                },
              },
              required: ["source"],
            },
            analysis: {
              type: "array",
              description: "実行する分析タイプのリスト",
              items: {
                type: "string",
                enum: ["structure", "stats", "links", "headings", "toc"],
              },
            },
          },
          required: ["analysis"],
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
        // Determine input (backward compatible)
        const input = args.input || args.markdown;
        
        const result = await processor.queryExtended(
          input,
          args.operation as any,
          args.selector as string | undefined,
          args.content as string | undefined,
          args.position as any,
          args.index as number | undefined,
          args.output as any
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
        // Determine input (backward compatible)
        const input = args.input || args.markdown;
        
        const result = await processor.transformExtended(
          input,
          args.transforms as any[],
          args.output as any
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
        // Determine input (backward compatible)
        const input = args.input || args.markdown;
        
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

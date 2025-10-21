#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { MDProcessor } from "./processor.js";

const server = new Server(
  {
    name: "mcp-mdast",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const processor = new MDProcessor();

// ツールリストハンドラー
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "mdast-query",
        description:
          "MarkdownをMDASTに解析し、CSS風セレクタでクエリ・操作を行う統合ツール。select/insert/update/remove/replace操作をサポート。",
        inputSchema: {
          type: "object",
          properties: {
            markdown: {
              type: "string",
              description: "操作対象のMarkdownテキスト",
            },
            operation: {
              type: "string",
              enum: ["select", "insert", "update", "remove", "replace"],
              description: "実行する操作タイプ",
            },
            selector: {
              type: "string",
              description:
                "CSS風セレクタ (例: 'heading[depth=1]', 'paragraph > strong')",
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
          },
          required: ["markdown", "operation"],
        },
      },
      {
        name: "mdast-transform",
        description:
          "カスタム変換ロジックを適用。wrap/unwrap/rename/clone操作をサポート。",
        inputSchema: {
          type: "object",
          properties: {
            markdown: {
              type: "string",
              description: "変換対象のMarkdownテキスト",
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
          },
          required: ["markdown", "transforms"],
        },
      },
      {
        name: "mdast-analyze",
        description:
          "ドキュメント構造の分析と統計情報の取得。structure/stats/links/headings/toc分析をサポート。",
        inputSchema: {
          type: "object",
          properties: {
            markdown: {
              type: "string",
              description: "分析対象のMarkdownテキスト",
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
          required: ["markdown", "analysis"],
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
        const result = await processor.query(
          args.markdown as string,
          args.operation as any,
          args.selector as string | undefined,
          args.content as string | undefined,
          args.position as any,
          args.index as number | undefined
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

      case "mdast-transform": {
        const result = await processor.transform(
          args.markdown as string,
          args.transforms as any[]
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

      case "mdast-analyze": {
        const result = await processor.analyze(
          args.markdown as string,
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

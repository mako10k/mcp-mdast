# MCP MDAST Server

Markdown抽象構文木(MDAST)を操作するためのModel Context Protocol (MCP) サーバー。
DOMのようなマニピュレーションAPIと、CSS風セレクタによる直感的なノード選択を提供します。

## 特徴

- 🎯 **CSS風セレクタ**: `heading[depth="1"]`、`paragraph > strong`のような直感的な選択
- 🔧 **統合操作**: select、insert、update、remove、replaceを1つのツールで
- 📊 **分析機能**: 文書構造、統計、目次生成など
- ⚡ **高性能**: unified/remarkエコシステムによる高速処理
- 🎨 **柔軟な変換**: カスタム変換ロジックの適用

## インストール

```bash
npm install
npm run build
```

## 使用方法

### MCPサーバーとして起動

```bash
node dist/index.js
```

### MCP Inspectorでテスト

```bash
npm run inspector
```

### Claude Desktopでの設定

`claude_desktop_config.json`に以下を追加:

```json
{
  "mcpServers": {
    "mdast": {
      "command": "node",
      "args": ["/path/to/mcp-mdast/dist/index.js"]
    }
  }
}
```

## ツール

### 1. mdast-query

Markdownを解析し、CSS風セレクタでクエリ・操作を行う統合ツール。

**操作例:**

```typescript
// 見出しの選択
{
  markdown: "# Title\n## Section",
  operation: "select",
  selector: "heading[depth=\"2\"]"
}

// コンテンツの挿入
{
  markdown: "# Title\nContent",
  operation: "insert",
  selector: "heading[depth=\"1\"]",
  content: "## New Section\n\nNew content.",
  position: "after"
}

// ノードの更新
{
  markdown: "Old text",
  operation: "update",
  selector: "paragraph",
  content: "New text"
}

// ノードの削除
{
  markdown: "# Title\n- item1\n- item2",
  operation: "remove",
  selector: "list"
}
```

### 2. mdast-transform

カスタム変換ロジックを適用。

```typescript
{
  markdown: "# Title\n\nParagraph",
  transforms: [{
    type: "wrap",
    selector: "paragraph",
    wrapper: "blockquote"
  }]
}
```

### 3. mdast-analyze

文書構造の分析と統計情報の取得。

```typescript
{
  markdown: "# Title\n\n## Section 1\n\n[Link](url)",
  analysis: ["stats", "headings", "links", "toc"]
}
```

## CSS風セレクタ

### 基本セレクタ
- `heading` - すべてのheading要素
- `paragraph` - すべてのparagraph要素
- `link`, `image`, `code`, `list`, etc.

### 属性セレクタ
- `heading[depth="1"]` - h1見出しのみ
- `link[url^="https"]` - httpsで始まるリンク
- `code[lang="javascript"]` - JavaScript言語のコードブロック

### 構造セレクタ
- `paragraph > strong` - 段落の直下の太字
- `list listItem` - リスト内のアイテム
- `blockquote paragraph` - 引用内の段落

### 疑似セレクタ
- `:first-child` - 最初の子要素
- `:last-child` - 最後の子要素
- `:nth-child(n)` - n番目の子要素

## アーキテクチャ

詳細な設計については[DESIGN.md](./DESIGN.md)を参照してください。

## ライセンス

MIT

# MCP MDAST Server 使用例

このドキュメントでは、MCP MDAST Serverの具体的な使用例を示します。

## セットアップ

### Claude Desktop での設定

`claude_desktop_config.json`に以下を追加:

```json
{
  "mcpServers": {
    "mdast": {
      "command": "node",
      "args": ["/home/mako10k/mcp-mdast/dist/index.js"]
    }
  }
}
```

## ツール1: mdast-query

### 例1: 見出しの選択

すべてのh2見出しを取得:

```json
{
  "markdown": "# タイトル\n\n## セクション1\n\n内容\n\n## セクション2\n\n内容2",
  "operation": "select",
  "selector": "heading[depth=\"2\"]"
}
```

**結果:**
```json
{
  "success": true,
  "selected": [
    {
      "type": "heading",
      "position": { "line": 3, "column": 1 },
      "content": "セクション1",
      "metadata": { "depth": 2 }
    },
    {
      "type": "heading",
      "position": { "line": 7, "column": 1 },
      "content": "セクション2",
      "metadata": { "depth": 2 }
    }
  ]
}
```

### 例2: コンテンツの挿入

h1見出しの後に新しいセクションを挿入:

```json
{
  "markdown": "# タイトル\n\n既存の内容",
  "operation": "insert",
  "selector": "heading[depth=\"1\"]",
  "content": "## 新しいセクション\n\nこれは新しいセクションです。",
  "position": "after"
}
```

**結果:**
```json
{
  "success": true,
  "result": "# タイトル\n\n## 新しいセクション\n\nこれは新しいセクションです。\n\n既存の内容\n"
}
```

### 例3: 特定インデックスの更新

最初の段落を更新:

```json
{
  "markdown": "古いテキスト\n\n別の段落",
  "operation": "update",
  "selector": "paragraph",
  "content": "新しいテキスト",
  "index": 0
}
```

**結果:**
```json
{
  "success": true,
  "result": "新しいテキスト\n\n別の段落\n"
}
```

### 例4: リンクの選択

httpsで始まるすべてのリンクを取得:

```json
{
  "markdown": "[安全なリンク](https://example.com)\n[HTTPリンク](http://old.com)",
  "operation": "select",
  "selector": "link[url^='https']"
}
```

### 例5: ノードの削除

すべてのリストを削除:

```json
{
  "markdown": "# タイトル\n\n- アイテム1\n- アイテム2\n\nテキスト",
  "operation": "remove",
  "selector": "list"
}
```

**結果:**
```json
{
  "success": true,
  "result": "# タイトル\n\nテキスト\n"
}
```

### 例6: コードブロックの選択

特定言語のコードブロックを選択:

```json
{
  "markdown": "```javascript\nconst x = 1;\n```\n\n```python\ny = 2\n```",
  "operation": "select",
  "selector": "code[lang='javascript']"
}
```

## ツール2: mdast-transform

### 例1: 段落をブロック引用でラップ

```json
{
  "markdown": "# タイトル\n\n通常のテキスト",
  "transforms": [
    {
      "type": "wrap",
      "selector": "paragraph",
      "wrapper": "blockquote"
    }
  ]
}
```

**結果:**
```json
{
  "success": true,
  "result": "# タイトル\n\n> 通常のテキスト\n",
  "applied": 1
}
```

### 例2: 複数の変換を連鎖

```json
{
  "markdown": "# タイトル\n\n段落1\n\n段落2",
  "transforms": [
    {
      "type": "wrap",
      "selector": "paragraph:first-child",
      "wrapper": "blockquote"
    },
    {
      "type": "clone",
      "selector": "paragraph:last-child",
      "targetSelector": "heading"
    }
  ]
}
```

### 例3: 強調を太字にリネーム

```json
{
  "markdown": "*斜体* と **太字**",
  "transforms": [
    {
      "type": "rename",
      "selector": "emphasis",
      "newType": "strong"
    }
  ]
}
```

## ツール3: mdast-analyze

### 例1: 統計情報の取得

```json
{
  "markdown": "# タイトル\n\n段落です。複数の単語があります。\n\n## セクション\n\n[リンク](url)\n\n![画像](img.png)",
  "analysis": ["stats"]
}
```

**結果:**
```json
{
  "stats": {
    "wordCount": 4,
    "headingCount": {
      "1": 1,
      "2": 1
    },
    "linkCount": 1,
    "imageCount": 1,
    "codeBlockCount": 0
  }
}
```

### 例2: リンクの抽出

```json
{
  "markdown": "[GitHub](https://github.com)\n[ドキュメント](https://docs.example.com 'ドキュメント')",
  "analysis": ["links"]
}
```

**結果:**
```json
{
  "links": [
    {
      "url": "https://github.com",
      "title": null,
      "line": 1
    },
    {
      "url": "https://docs.example.com",
      "title": "ドキュメント",
      "line": 2
    }
  ]
}
```

### 例3: 見出しと目次の生成

```json
{
  "markdown": "# メインタイトル\n\n## セクション1\n\n### サブセクション1.1\n\n## セクション2",
  "analysis": ["headings", "toc"]
}
```

**結果:**
```json
{
  "headings": [
    { "depth": 1, "text": "メインタイトル", "line": 1 },
    { "depth": 2, "text": "セクション1", "line": 3 },
    { "depth": 3, "text": "サブセクション1.1", "line": 5 },
    { "depth": 2, "text": "セクション2", "line": 7 }
  ],
  "toc": "- [メインタイトル](#メインタイトル)\n  - [セクション1](#セクション1)\n    - [サブセクション1.1](#サブセクション1.1)\n  - [セクション2](#セクション2)"
}
```

### 例4: 包括的な分析

```json
{
  "markdown": "# ドキュメント\n\n段落\n\n## セクション\n\n[リンク](url)",
  "analysis": ["structure", "stats", "links", "headings", "toc"]
}
```

## 高度な使用例

### セレクタの組み合わせ

#### 引用内の段落を選択

```json
{
  "markdown": "> 引用内の段落\n>\n> 別の段落\n\n通常の段落",
  "operation": "select",
  "selector": "blockquote paragraph"
}
```

#### リストアイテムを選択

```json
{
  "markdown": "- アイテム1\n- アイテム2\n  - ネストされたアイテム",
  "operation": "select",
  "selector": "list listItem"
}
```

#### 最初の子要素のみ

```json
{
  "markdown": "段落1\n\n段落2\n\n段落3",
  "operation": "select",
  "selector": "paragraph:first-child"
}
```

### エラーハンドリング

#### 存在しないセレクタ

```json
{
  "markdown": "# タイトル",
  "operation": "select",
  "selector": "table"
}
```

**結果:**
```json
{
  "success": true,
  "selected": []
}
```

#### 必須パラメータの欠落

```json
{
  "markdown": "テキスト",
  "operation": "insert",
  "selector": "paragraph"
}
```

**結果:**
```json
{
  "success": false,
  "error": "Content is required for insert operation"
}
```

## ベストプラクティス

1. **セレクタの特定性**: より具体的なセレクタを使用して意図しないノードの選択を避ける
2. **インデックスの使用**: 複数マッチがある場合は`index`パラメータで対象を明確化
3. **段階的な変換**: 複雑な変換は複数のステップに分割
4. **分析後の操作**: まず`mdast-analyze`で構造を把握してから操作を実行
5. **エラーチェック**: `success`フィールドを常にチェック

## トラブルシューティング

### セレクタが機能しない

- セレクタの構文を確認（`unist-util-select`の仕様に準拠）
- 対象ノードのタイプを`structure`分析で確認

### 予期しない結果

- `select`操作で対象ノードを確認
- `index`パラメータで特定のノードを指定

### 変換が適用されない

- `transforms`配列の各要素に必須パラメータが含まれているか確認
- `applied`カウントで実際に適用された変換数を確認

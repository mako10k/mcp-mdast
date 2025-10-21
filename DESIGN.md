# MCP MDAST Server 設計ドキュメント

## 概要

Unified/Remarkエコシステムを活用した、Markdown抽象構文木(MDAST)を操作するためのModel Context Protocol (MCP) サーバー。
DOMのようなマニピュレーションAPIを提供し、CSS風セレクタによるノード選択をサポートします。

## 技術スタック

### コアライブラリ
- **unified**: テキスト処理のための統一インターフェース
- **remark-parse**: MarkdownをMDASTに変換
- **remark-stringify**: MDASTをMarkdownに変換
- **unist-util-select**: CSS風セレクタによるノード選択
- **unist-util-visit**: ASTトラバーサル
- **unist-builder**: ノード構築ヘルパー

### MCP関連
- **@modelcontextprotocol/sdk**: MCP Server SDK

## アーキテクチャ

### 主要コンポーネント

1. **MDParser**: Markdownテキストの解析
2. **MDSerializer**: MDASTからMarkdownへの変換
3. **MDSelector**: CSS風セレクタによるノード選択
4. **MDManipulator**: ノードの追加・削除・更新

### MDAST構造の理解

MDASTは以下のような階層構造を持つ:
- **Root**: ドキュメントのルートノード
- **Block要素**: paragraph, heading, list, code, blockquote等
- **Inline要素**: text, emphasis, strong, link, image等

## MCPツール設計

最小限のツール数で最大限の機能を提供するため、以下の3つのツールに集約:

### 1. `mdast-query` - MDAST操作の統合ツール

Markdownを解析し、CSS風セレクタでクエリ・操作を行う統合ツール。

**入力パラメータ:**
```typescript
{
  markdown: string,           // 操作対象のMarkdownテキスト
  operation: 'select' | 'insert' | 'update' | 'remove' | 'replace',
  selector?: string,          // CSS風セレクタ (例: 'heading[depth=1]', 'paragraph > strong')
  content?: string,           // 挿入/更新するコンテンツ (Markdown形式)
  position?: 'before' | 'after' | 'prepend' | 'append' | 'replace',
  index?: number              // 複数マッチ時のインデックス指定
}
```

**出力:**
```typescript
{
  success: boolean,
  result?: string,            // 操作後のMarkdown (insert/update/remove/replace時)
  selected?: Array<{          // select時の選択結果
    type: string,
    position: {line: number, column: number},
    content: string,
    metadata: object
  }>,
  error?: string
}
```

**操作例:**
- `select`: `{operation: 'select', selector: 'heading[depth="2"]'}` → すべてのh2見出しを取得
- `insert`: `{operation: 'insert', selector: 'heading[depth="1"]', content: '## New Section', position: 'after'}` → h1の後にh2を挿入
- `update`: `{operation: 'update', selector: 'paragraph:first-child', content: 'Updated text'}` → 最初の段落を更新
- `remove`: `{operation: 'remove', selector: 'list'}` → すべてのリストを削除
- `replace`: `{operation: 'replace', selector: 'emphasis', content: '**bold**'}` → 斜体を太字に置換

### 2. `mdast-transform` - カスタム変換の適用

remarkプラグインのような変換ロジックを適用。

**入力パラメータ:**
```typescript
{
  markdown: string,
  transforms: Array<{
    type: 'wrap' | 'unwrap' | 'rename' | 'clone',
    selector: string,
    wrapper?: string,         // wrap時のラッパータイプ
    newType?: string,         // rename時の新しいタイプ
    targetSelector?: string   // clone時の挿入先
  }>
}
```

**出力:**
```typescript
{
  success: boolean,
  result?: string,
  applied: number,            // 適用された変換の数
  error?: string
}
```

**変換例:**
- コードブロックを引用で囲む
- リスト項目を段落に変換
- 特定セクションを複製

### 3. `mdast-analyze` - 構造分析とメタデータ抽出

ドキュメント構造の分析と統計情報の取得。

**入力パラメータ:**
```typescript
{
  markdown: string,
  analysis: Array<'structure' | 'stats' | 'links' | 'headings' | 'toc'>
}
```

**出力:**
```typescript
{
  structure?: object,         // AST構造の概要
  stats?: {                   // 統計情報
    wordCount: number,
    headingCount: {[depth: number]: number},
    linkCount: number,
    imageCount: number,
    codeBlockCount: number
  },
  links?: Array<{url: string, title: string, line: number}>,
  headings?: Array<{depth: number, text: string, line: number}>,
  toc?: string                // 目次(Markdown形式)
}
```

## CSS風セレクタの仕様

`unist-util-select`を活用した強力なセレクタ機能:

### 基本セレクタ
- `heading` - すべてのheading要素
- `paragraph` - すべてのparagraph要素
- `link` - すべてのlink要素

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

## 実装計画

### Phase 1: 基盤構築
1. プロジェクトのセットアップ
2. unified/remarkの統合
3. 基本的なMDASTパース・シリアライズ

### Phase 2: コア機能
1. `mdast-query`ツールの実装
2. セレクタエンジンの統合
3. CRUD操作の実装

### Phase 3: 拡張機能
1. `mdast-transform`ツールの実装
2. `mdast-analyze`ツールの実装
3. エラーハンドリングの強化

### Phase 4: テストと最適化
1. ユニットテスト
2. 統合テスト
3. パフォーマンス最適化

## 使用例

### 例1: 見出しの抽出
```json
{
  "markdown": "# Title\n\n## Section 1\n\n## Section 2",
  "operation": "select",
  "selector": "heading[depth=\"2\"]"
}
```

### 例2: 新しいセクションの挿入
```json
{
  "markdown": "# Title\n\nContent",
  "operation": "insert",
  "selector": "heading[depth=1]",
  "content": "## New Section\n\nNew content here.",
  "position": "after"
}
```

### 例3: リンクの一括更新
```json
{
  "markdown": "[link](http://old.com)",
  "operation": "update",
  "selector": "link[url='http://old.com']",
  "content": "[link](https://new.com)"
}
```

### 例4: 目次の生成
```json
{
  "markdown": "# Title\n\n## Section 1\n\n### Subsection\n\n## Section 2",
  "analysis": ["toc", "stats"]
}
```

## 技術的考慮事項

### エラーハンドリング
- 不正なMarkdown構文のハンドリング
- 無効なセレクタのバリデーション
- 操作失敗時の詳細エラーメッセージ

### パフォーマンス
- 大規模ドキュメントの処理最適化
- セレクタキャッシング
- 変換パイプラインの効率化

### 拡張性
- カスタム変換関数の追加
- プラグイン機構の検討
- 追加のセレクタタイプのサポート

## まとめ

このMCP Serverは、unified/remarkエコシステムの強力な機能を活用しながら、
最小限のツール数(3つ)でMDASTの包括的な操作を可能にします。
CSS風セレクタにより直感的な操作が可能で、複雑なMarkdown変換タスクを
簡潔に表現できます。

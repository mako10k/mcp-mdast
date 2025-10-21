# MCP MDAST Server - 入出力拡張設計

## 概要

入出力を柔軟化し、永続化されたMDASTリソースを管理する機能を追加します。

## 入力の拡張

### 入力ソースタイプ

1. **インラインテキスト** (既存)
   ```json
   {
     "markdown": "# Title\n\nContent"
   }
   ```

2. **ファイルパス**
   ```json
   {
     "input": {
       "source": "file",
       "path": "/path/to/document.md"
     }
   }
   ```

3. **HTTP(S) URL**
   ```json
   {
     "input": {
       "source": "url",
       "url": "https://example.com/document.md"
     }
   }
   ```

4. **MDASTリソース**
   ```json
   {
     "input": {
       "source": "mdast",
       "uri": "mdast://abc123-def456"
     }
   }
   ```

### 後方互換性

既存の`markdown`パラメータは引き続きサポート（内部的にinline textとして処理）

## 出力の拡張

### 出力タイプ

1. **テキスト出力** (既存 - デフォルト)
   ```json
   {
     "output": {
       "type": "text"
     }
   }
   ```
   結果: ツールレスポンスにMarkdownテキスト

2. **ファイル保存**
   ```json
   {
     "output": {
       "type": "file",
       "path": "/path/to/output.md"
     }
   }
   ```
   結果: ファイルに書き込み、成功メッセージ返却

3. **MDASTリソース保存**
   ```json
   {
     "output": {
       "type": "mdast",
       "ttl": 86400  // オプション: 秒単位（デフォルト86400=1日）
     }
   }
   ```
   結果: `mdast://<uid>` URIを返却

## MDASTリソース管理

### リソースURI形式

```
mdast://<uid>
```

- `<uid>`: UUID v4形式の一意識別子

### ストレージ

**場所**: `~/.local/share/mcp-mdast/resources/`

**ファイル形式**: `<uid>.json`

```json
{
  "uid": "abc123-def456",
  "mdast": {
    "type": "root",
    "children": [...]
  },
  "metadata": {
    "created": "2025-10-21T07:00:00.000Z",
    "expires": "2025-10-22T07:00:00.000Z",
    "source": {
      "type": "file",
      "path": "/path/to/original.md"
    },
    "operations": [
      {
        "timestamp": "2025-10-21T07:00:00.000Z",
        "tool": "mdast-query",
        "operation": "insert"
      }
    ]
  }
}
```

### 有効期限管理

- **デフォルトTTL**: 24時間（86400秒）
- **最大TTL**: 30日（2592000秒）
- **自動クリーンアップ**: サーバー起動時、または定期的に期限切れリソースを削除

## MCP Resource API

### 1. リソース一覧取得

```typescript
resources/list
```

**応答**:
```json
{
  "resources": [
    {
      "uri": "mdast://abc123-def456",
      "name": "document.md (processed)",
      "mimeType": "application/vnd.mdast+json",
      "created": "2025-10-21T07:00:00.000Z",
      "expires": "2025-10-22T07:00:00.000Z"
    }
  ]
}
```

### 2. リソース読み込み

```typescript
resources/read
```

**パラメータ**:
```json
{
  "uri": "mdast://abc123-def456"
}
```

**応答**:
```json
{
  "contents": [
    {
      "uri": "mdast://abc123-def456",
      "mimeType": "application/vnd.mdast+json",
      "text": "# Processed Content\n\n..."
    }
  ]
}
```

### 3. リソース削除（ツールとして実装）

```typescript
mdast-resource-delete
```

**パラメータ**:
```json
{
  "uri": "mdast://abc123-def456"
}
```

## 実装クラス設計

### 1. ResourceManager

```typescript
class ResourceManager {
  private storagePath: string;
  
  async save(mdast: Root, metadata: ResourceMetadata): Promise<string>
  async load(uid: string): Promise<Resource | null>
  async list(): Promise<ResourceInfo[]>
  async delete(uid: string): Promise<boolean>
  async cleanup(): Promise<number>  // 削除した件数を返す
}
```

### 2. InputResolver

```typescript
class InputResolver {
  async resolve(input: InputSpec): Promise<string>
  // file://, https://, mdast:// を統一的に処理
}
```

### 3. OutputHandler

```typescript
class OutputHandler {
  async handle(content: string, output: OutputSpec): Promise<OutputResult>
  // text, file, mdast を統一的に処理
}
```

## パラメータスキーマ拡張

### mdast-query

```typescript
{
  // 入力（どちらか必須）
  markdown?: string,  // 後方互換性
  input?: {
    source: 'text' | 'file' | 'url' | 'mdast',
    value: string,    // text: Markdown文字列
    path?: string,    // file: ファイルパス
    url?: string,     // url: HTTP(S) URL
    uri?: string      // mdast: mdast://uid
  },
  
  // 操作パラメータ（既存）
  operation: 'select' | 'insert' | 'update' | 'remove' | 'replace',
  selector?: string,
  content?: string,
  position?: string,
  index?: number,
  
  // 出力（オプション）
  output?: {
    type: 'text' | 'file' | 'mdast',
    path?: string,    // file: 保存先パス
    ttl?: number      // mdast: 有効期限（秒）
  }
}
```

### mdast-transform, mdast-analyze も同様

## 使用例

### 例1: ファイルを読み込み、処理して保存

```json
{
  "input": {
    "source": "file",
    "path": "/home/user/docs/input.md"
  },
  "operation": "insert",
  "selector": "heading[depth=\"1\"]",
  "content": "## Table of Contents",
  "position": "after",
  "output": {
    "type": "file",
    "path": "/home/user/docs/output.md"
  }
}
```

### 例2: URLから取得、処理してMDASTリソースとして保存

```json
{
  "input": {
    "source": "url",
    "url": "https://raw.githubusercontent.com/user/repo/main/README.md"
  },
  "operation": "select",
  "selector": "heading",
  "output": {
    "type": "mdast",
    "ttl": 172800  // 2日間
  }
}
```

応答:
```json
{
  "success": true,
  "uri": "mdast://abc123-def456",
  "expires": "2025-10-23T07:00:00.000Z"
}
```

### 例3: MDASTリソースを再処理

```json
{
  "input": {
    "source": "mdast",
    "uri": "mdast://abc123-def456"
  },
  "operation": "update",
  "selector": "paragraph",
  "content": "Updated content",
  "index": 0
}
```

## セキュリティ考慮事項

1. **ファイルアクセス制限**
   - ホームディレクトリ配下のみアクセス許可
   - シンボリックリンクの検証

2. **HTTP(S) アクセス**
   - タイムアウト設定（30秒）
   - サイズ制限（10MB）
   - リダイレクト制限（最大5回）

3. **リソースストレージ**
   - ディスク使用量制限（最大100MB）
   - リソース数制限（最大1000件）
   - 自動クリーンアップ

## 実装順序

1. **Phase 1**: ResourceManager実装
   - ストレージディレクトリ作成
   - CRUD操作
   - クリーンアップ

2. **Phase 2**: InputResolver実装
   - ファイル読み込み
   - HTTP取得
   - MDASTリソース読み込み

3. **Phase 3**: OutputHandler実装
   - ファイル書き込み
   - MDASTリソース保存

4. **Phase 4**: MCP Resource API実装
   - resources/list
   - resources/read

5. **Phase 5**: 既存ツールの統合
   - パラメータスキーマ拡張
   - 後方互換性テスト

6. **Phase 6**: ドキュメント更新

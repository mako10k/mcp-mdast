# Contributing to MCP MDAST Server

このプロジェクトへの貢献を歓迎します！

## 開発環境のセットアップ

```bash
# リポジトリのクローン
git clone <repository-url>
cd mcp-mdast

# 依存関係のインストール
npm install

# ビルド
npm run build

# 開発モード（ウォッチモード）
npm run dev
```

## プロジェクト構造

```
mcp-mdast/
├── src/
│   ├── index.ts       # MCPサーバーのエントリーポイント
│   └── processor.ts   # MDAST処理ロジック
├── dist/              # ビルド成果物
├── DESIGN.md          # 設計ドキュメント
├── EXAMPLES.md        # 使用例
├── README.md          # プロジェクト概要
└── package.json       # プロジェクト設定
```

## コーディングスタイル

- TypeScriptの厳密モードを使用
- ESLintルールに従う
- 明確なコメントを記述

## テスト

```bash
# MCP Inspectorでテスト
npm run inspector
```

## プルリクエスト

1. フォークしてブランチを作成
2. 変更を実装
3. ビルドが成功することを確認
4. プルリクエストを作成

## ライセンス

MIT

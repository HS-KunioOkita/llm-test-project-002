# 中小卸売業向け受発注管理システム — MVP

`docs/requirements.md` 〜 `docs/schema.md` に基づいた MVP バックエンド実装。  
詳細な実装方針・スコープ絞り込みの根拠は `docs/decisions.md` を参照。

## MVP 対象

- 認証 (ログイン / ログアウト / 現在ユーザー取得)
- 取引先 CRUD
- 商品 CRUD
- 受注登録・承認・一覧検索・単票取得
- PostgreSQL マイグレーション (Prisma)
- 単体テスト (Vitest)

MVP 外: フロントエンド、CSV 入出力、日次売上バッチ、出荷ステータス API、監査ログ閲覧画面、OpenAPI 自動生成、ユーザー管理 API。

## 構成

```
/workspace
├─ apps/api/          # バックエンド (Node.js + Fastify + Prisma)
├─ docs/              # 要件・設計・意思決定
├─ docker-compose.yml # PostgreSQL 16
```

## 必要なもの

- Node.js 20+
- npm 10+
- Docker / Docker Compose (PostgreSQL 起動用)

## セットアップ手順

### 1. PostgreSQL を起動

```bash
cd /workspace
docker compose up -d db
```

### 2. 依存関係のインストール

```bash
cd /workspace/apps/api
npm install
```

### 3. 環境変数ファイル作成

```bash
cp .env.example .env
# COOKIE_SECRET を 32 文字以上のランダム文字列に書き換える
# 例: openssl rand -hex 32
```

### 4. Prisma マイグレーション適用 + シード投入

```bash
npm run prisma:generate
npm run prisma:migrate -- --name init   # 初回のみ
npm run db:seed
```

シード投入後のサンプルアカウント (パスワードは全て `P@ssw0rd!`):

| loginId | role    |
|---------|---------|
| admin   | admin   |
| orderer | orderer |
| sales   | sales   |
| viewer  | viewer  |

### 5. 起動

```bash
npm run dev
# → http://localhost:3000 で API が起動
```

本番ビルド:

```bash
npm run build
npm run start
```

## 動作確認

```bash
# ログイン (セッション Cookie を取得)
curl -i -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"loginId":"orderer","password":"P@ssw0rd!"}'

# 自分自身を取得
curl -b cookies.txt http://localhost:3000/api/auth/me

# 取引先一覧
curl -b cookies.txt http://localhost:3000/api/customers

# 受注登録 → 承認
curl -b cookies.txt -X POST http://localhost:3000/api/orders \
  -H 'Content-Type: application/json' \
  -d '{"customerId":"<cus_...>","items":[{"productId":"<prd_...>","quantity":10}]}'
```

## トラブルシュート

### `prisma generate` が `binaries.prisma.sh` へ到達できない

本リポジトリ同梱の devcontainer は network allowlist 方式で、初期設定に `binaries.prisma.sh` が含まれていませんでした。`/workspace/.devcontainer/init-firewall.sh` の allowlist に追加済ですが、反映するには devcontainer を **Rebuild Container** する必要があります。再ビルド後に `npm run prisma:generate` を実行してください。

再ビルド前でも `npm test` と `npm run typecheck` は動作します (Prisma 名前空間型に依存しないよう実装しているため)。

## テスト

```bash
cd /workspace/apps/api
npm test
```

単体テスト (純粋関数レベル) のみで、DB は不要。  
結合テストは将来課題 (`docs/decisions.md` 参照)。

## 型チェック

```bash
npm run typecheck
```

## ディレクトリ構造 (api)

```
apps/api/
├─ prisma/
│  ├─ schema.prisma      # DB スキーマ
│  └─ seed.ts             # 初期データ投入
├─ src/
│  ├─ app.ts              # Fastify インスタンス構築 (テストで再利用可)
│  ├─ main.ts             # エントリポイント
│  ├─ config/env.ts       # 環境変数の型付き読込
│  ├─ db/prisma.ts        # Prisma クライアント
│  ├─ lib/                # 共通ユーティリティ (errors, ids, pagination)
│  ├─ middlewares/        # auth, errorHandler
│  └─ modules/
│     ├─ auth/            # 認証 + RBAC 設定
│     ├─ audit/           # 監査ログ書込ヘルパ
│     ├─ customers/       # 取引先
│     ├─ products/        # 商品
│     └─ orders/          # 受注 (routes / service / schema / state)
├─ test/unit/             # Vitest 単体テスト
├─ package.json
└─ tsconfig.json
```

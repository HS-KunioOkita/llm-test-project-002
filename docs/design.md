# 設計書: 中小卸売業向け受発注管理システム

対象: `docs/requirements.md`, `docs/analysis.md`
本書は実装に直結する設計レベルの決定事項を記述する。ER 図と詳細テーブル定義は `docs/schema.md`、API 仕様は `docs/api.md` に分離する。

---

## 1. システム構成

### 1.1 全体構成

```
                 ┌─────────────────────────────────────┐
                 │        ブラウザ (Chrome/Edge)        │
                 └─────────────────┬───────────────────┘
                                   │ HTTPS (同一ドメイン)
                 ┌─────────────────▼───────────────────┐
                 │  Nginx (リバースプロキシ / 静的配信)  │
                 │   - /        → web (静的)            │
                 │   - /api/*   → api (Node.js)         │
                 └──────┬──────────────────┬────────────┘
                        │                  │
          ┌─────────────▼───┐   ┌──────────▼────────────┐
          │  web (SPA)      │   │  api (Node.js + TS)   │
          │  React + Vite   │   │  Fastify + Prisma     │
          │  静的ビルド成果物 │   │  REST + セッション      │
          └─────────────────┘   └──────────┬────────────┘
                                           │
                               ┌───────────▼────────────┐
                               │  PostgreSQL 16          │
                               │  - アプリ DB             │
                               │  - 監査ログ（同一 DB 内）│
                               └────────────────────────┘

          ┌────────────────────────────────────────┐
          │  batch (api と同一イメージ)             │
          │  cron / docker 経由で日次実行           │
          │  node dist/batch/daily-summary.js      │
          └────────────────────────────────────────┘
```

### 1.2 コンテナ構成（Docker Compose）

| サービス名 | 役割 | 備考 |
|------------|------|------|
| `web`      | React ビルド成果物の静的配信 | dev 時は Vite dev server、prod 時は Nginx |
| `api`      | REST API / セッション管理 / 監査ログ書込 | Node.js 20 + Fastify |
| `batch`    | 日次売上集計バッチ | `api` と同一イメージを別コマンドで起動 |
| `db`       | PostgreSQL 16 | データ永続化は named volume |
| `proxy`    | Nginx | prod 構成のみ。dev では省略可 |

Compose は `docker-compose.yml`（開発）と `docker-compose.prod.yml`（本番想定）を分離し、差分のみ上書きする。

### 1.3 採用スタック

| 層 | 技術 | 選定理由 |
|------|------|---------|
| FE | React 18 + TypeScript + Vite | SPA として軽量、チーム親和性 |
| FE 状態管理 | React Query (TanStack Query) | サーバ状態と同期しやすく、独自状態を最小化 |
| FE フォーム / 検証 | React Hook Form + Zod | BE と Zod スキーマ共有 |
| BE | Node.js 20 + TypeScript + Fastify | 軽量・高速・拡張容易。NestJS は小規模には重い |
| ORM | Prisma | マイグレーション・型安全性のバランス |
| 検証 | Zod | FE/BE 共有、型推論 |
| 認証 | セッション Cookie (`@fastify/secure-session`) | 社内利用を前提に、SPA に対してシンプル |
| ロガー | pino | 構造化ログ、性能 |
| テスト | Vitest + Supertest + Playwright | FE/BE で共通、E2E は最低限 |
| Lint | ESLint + Prettier | 標準的構成 |
| CI | GitHub Actions | lint / typecheck / test / build |

外部 SaaS は使わない。認証もセルフホスト。

---

## 2. ディレクトリ構成

pnpm workspaces によるモノレポ。過剰な分割を避け、2 アプリ + 1 共有パッケージに留める。

```
/
├─ apps/
│  ├─ api/                    # バックエンド (Node.js + Fastify)
│  │  ├─ prisma/
│  │  │  ├─ schema.prisma
│  │  │  ├─ migrations/
│  │  │  └─ seed.ts
│  │  ├─ src/
│  │  │  ├─ main.ts            # エントリポイント (HTTP サーバ起動)
│  │  │  ├─ app.ts             # Fastify インスタンス構築（テスト用に export）
│  │  │  ├─ config/            # 環境変数読み込み・型付き設定
│  │  │  ├─ db/                # Prisma クライアントのシングルトン
│  │  │  ├─ modules/           # ドメインごとのモジュール
│  │  │  │  ├─ auth/
│  │  │  │  │  ├─ auth.routes.ts
│  │  │  │  │  ├─ auth.service.ts
│  │  │  │  │  └─ password.ts
│  │  │  │  ├─ users/
│  │  │  │  ├─ customers/
│  │  │  │  ├─ products/
│  │  │  │  ├─ orders/
│  │  │  │  │  ├─ orders.routes.ts
│  │  │  │  │  ├─ orders.service.ts
│  │  │  │  │  ├─ orders.repo.ts
│  │  │  │  │  ├─ orders.state.ts   # 状態遷移ルール（純粋関数）
│  │  │  │  │  └─ orders.schema.ts  # Zod
│  │  │  │  ├─ shipments/
│  │  │  │  ├─ csv/                 # CSV インポート
│  │  │  │  ├─ sales/               # 売上集計閲覧 API
│  │  │  │  └─ audit/               # 監査ログ閲覧 API
│  │  │  ├─ middlewares/
│  │  │  │  ├─ auth.ts              # セッション検証
│  │  │  │  ├─ rbac.ts              # ロール検査
│  │  │  │  ├─ audit.ts             # 監査ログ書込
│  │  │  │  ├─ requestId.ts
│  │  │  │  └─ errorHandler.ts
│  │  │  ├─ batch/
│  │  │  │  └─ daily-summary.ts     # 日次売上集計
│  │  │  ├─ lib/                    # 横断ユーティリティ
│  │  │  └─ types/
│  │  ├─ test/
│  │  │  ├─ unit/
│  │  │  └─ integration/
│  │  ├─ Dockerfile
│  │  ├─ package.json
│  │  └─ tsconfig.json
│  │
│  └─ web/                    # フロントエンド (React + Vite)
│     ├─ src/
│     │  ├─ main.tsx
│     │  ├─ App.tsx
│     │  ├─ routes/            # React Router 構成
│     │  ├─ pages/             # 画面単位
│     │  │  ├─ login/
│     │  │  ├─ customers/
│     │  │  ├─ products/
│     │  │  ├─ orders/
│     │  │  ├─ shipments/
│     │  │  ├─ sales/
│     │  │  └─ admin/
│     │  ├─ components/        # 汎用 UI
│     │  ├─ features/          # 画面横断の機能ロジック (API client, hooks)
│     │  │  ├─ auth/
│     │  │  ├─ orders/
│     │  │  └─ ...
│     │  ├─ api/               # fetch ラッパ・エラー正規化
│     │  ├─ lib/
│     │  └─ styles/
│     ├─ public/
│     ├─ test/
│     ├─ Dockerfile
│     ├─ vite.config.ts
│     ├─ package.json
│     └─ tsconfig.json
│
├─ packages/
│  └─ shared/                  # FE/BE 共有 (Zod スキーマ・型)
│     ├─ src/
│     │  ├─ schemas/
│     │  │  ├─ order.ts
│     │  │  ├─ customer.ts
│     │  │  └─ product.ts
│     │  └─ index.ts
│     ├─ package.json
│     └─ tsconfig.json
│
├─ docker/
│  ├─ nginx/default.conf
│  └─ postgres/init.sql
├─ docker-compose.yml
├─ docker-compose.prod.yml
├─ .env.example
├─ pnpm-workspace.yaml
├─ package.json
├─ tsconfig.base.json
├─ README.md
└─ docs/
   ├─ requirements.md
   ├─ analysis.md
   ├─ design.md
   ├─ api.md
   └─ schema.md
```

**方針**

- 1 ドメイン = 1 モジュール（`modules/<domain>/`）。モジュール内に routes / service / repo / schema / state を揃え、他ドメインからの参照は service 経由のみとする。
- ドメイン間の循環参照を避けるため、共通ユーティリティは `lib/`、共有型は `packages/shared` に置く。
- FE の `pages/` は画面単位、`features/` は画面横断の機能コード。テスト容易性のため hooks と UI を分離。

---

## 3. モジュール責務

### 3.1 バックエンドモジュール一覧

| モジュール | 責務 | 主なエンティティ | 権限主体 |
|------------|------|-----------------|---------|
| `auth`       | ログイン / ログアウト / セッション発行・破棄 / パスワードハッシュ | `User`, `Session` | 全ロール |
| `users`      | ユーザーと役割の CRUD（管理機能） | `User`, `Role` | 管理者 |
| `customers`  | 取引先マスタの CRUD / 検索 | `Customer` | 受注・管理・（読み取りは全員） |
| `products`   | 商品マスタの CRUD / 検索 | `Product` | 受注・管理・（読み取りは全員） |
| `orders`     | 受注の登録・更新・承認・キャンセル / 受注一覧検索 / 状態遷移ガード | `Order`, `OrderLine` | 営業（登録）、受注・管理（承認・キャンセル） |
| `shipments`  | 出荷ステータスの遷移管理（未出荷 / 出荷済み / キャンセル） | `Order.shipmentStatus` | 受注・管理 |
| `csv`        | 取引先・商品 CSV インポート（ドライラン・エラー行レポート） | - | 管理者 |
| `sales`      | 日次売上集計結果の閲覧 API（バッチで生成した結果を読むのみ） | `DailySalesSummary` | 管理者・閲覧 |
| `audit`      | 監査ログ書込ヘルパ / 監査ログ閲覧 API | `AuditLog` | 書込は全モジュール、閲覧は管理者 |
| `batch`      | 日次売上集計バッチのエントリポイント | - | cron 実行 |

### 3.2 レイヤ構成（BE 単一モジュール内）

```
Controller (Fastify Route)
  └─ Service  … ユースケース、トランザクション境界、監査ログ書込
       └─ Domain (純粋関数) … 状態遷移・バリデーション
       └─ Repository (Prisma) … 永続化、ドメインの外に SQL を閉じ込める
```

- **Controller**: HTTP の入出力のみ。Zod で検証し、Service を呼び、結果を整形する。
- **Service**: 1 API = 1 ユースケース。トランザクション境界。Service 内で Repository と Domain を組み合わせ、最後に監査ログを書く。
- **Domain**: 状態遷移（例: `orders.state.ts` の `canApprove(order, actor)` / `nextShipmentStatus(current, event)`）を純粋関数で表現。単体テストが容易。
- **Repository**: Prisma 呼び出しのみ。SELECT は必要な列だけ返す。N+1 を避け、`include` を明示する。

### 3.3 フロントエンドモジュール責務

| 層 | 責務 |
|----|------|
| `pages/` | ルーティングに結びつく画面。データ取得とレイアウトを決定 |
| `features/<domain>/` | API 呼び出し、React Query hooks、画面横断のロジック。UI には依存しない |
| `components/` | 汎用 UI（Button, Table, Modal など）。ドメインを知らない |
| `api/` | `fetch` ラッパ、エラー正規化、セッション切れ 401 時のリダイレクト |
| `lib/` | 日付・数値フォーマット、Zod ヘルパ、定数 |

---

## 4. API 一覧

詳細は `docs/api.md` を参照。ここでは俯瞰のみ。

| カテゴリ | 代表エンドポイント |
|----------|-------------------|
| 認証     | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` |
| ユーザー | `GET/POST/PATCH/DELETE /api/users` |
| 取引先   | `GET/POST/PATCH/DELETE /api/customers` |
| 商品     | `GET/POST/PATCH/DELETE /api/products` |
| 受注     | `GET /api/orders`, `POST /api/orders`, `GET /api/orders/:id`, `PATCH /api/orders/:id`, `POST /api/orders/:id/approve`, `POST /api/orders/:id/cancel` |
| 出荷     | `POST /api/orders/:id/shipment` (ステータス更新) |
| CSV      | `POST /api/csv/customers/import`, `POST /api/csv/products/import` |
| 売上     | `GET /api/sales/daily` |
| 監査ログ | `GET /api/audit-logs` |
| ヘルス   | `GET /healthz`, `GET /readyz` |

共通規約:
- パス: `/api/<domain>`
- 入出力: JSON (UTF-8)
- 日付: ISO 8601 (`2026-04-15T10:00:00+09:00`)
- ページング: `?page=1&pageSize=50` （最大 200）
- 並び順: `?sort=createdAt:desc`
- エラー形式: `{ error: { code: string, message: string, details?: object } }`（詳細は api.md）

---

## 5. 認証・認可方式

### 5.1 認証

- **方式**: セッション Cookie。SPA と API が同一オリジンで配信されるため、CSRF リスクと実装コストのバランスで最良。
- **実装**: Fastify の `@fastify/secure-session`。Cookie は `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`。
- **パスワード**: argon2id でハッシュ化。ストレッチング・ソルトはライブラリ任せ。
- **ログイン失敗対策**: 同一ユーザー 5 回連続失敗で 15 分ロック。IP 別レート制限は Fastify の `@fastify/rate-limit` で `/api/auth/login` に適用。
- **セッション有効期限**: 既定 8 時間のアイドルタイムアウト + 絶対 24 時間上限。

### 5.2 認可（RBAC）

- ロール: `admin`, `sales`, `orderer`, `viewer` の 4 種。DB 上は `users.role` 列に列挙型で保持。
- ミドルウェア `requireRole(...roles)` をルート単位で付与する。URL マトリクスで一元管理：

| リソース / 操作 | admin | orderer (受注) | sales (営業) | viewer (閲覧) |
|-----------------|:-----:|:-------------:|:-----------:|:------------:|
| 取引先 読取   | ○ | ○ | ○ | ○ |
| 取引先 登録更新 | ○ | ○ | ✕ | ✕ |
| 取引先 削除   | ○ | ✕ | ✕ | ✕ |
| 商品 読取    | ○ | ○ | ○ | ○ |
| 商品 登録更新 | ○ | ○ | ✕ | ✕ |
| 受注 登録    | ○ | ○ | ○ | ✕ |
| 受注 更新（下書き） | ○ | ○ | ○（自分のもの）| ✕ |
| 受注 承認    | ○ | ○ | ✕ | ✕ |
| 受注 キャンセル | ○ | ○ | ✕ | ✕ |
| 出荷ステータス更新 | ○ | ○ | ✕ | ✕ |
| CSV インポート | ○ | ✕ | ✕ | ✕ |
| 売上閲覧    | ○ | ○ | ○ | ○ |
| 監査ログ閲覧 | ○ | ✕ | ✕ | ✕ |
| ユーザー管理 | ○ | ✕ | ✕ | ✕ |

- 「受注 更新（下書き）」のように**オブジェクト単位**の権限は、ルートミドルウェアでは判断できないため Service 層で `assertOwnershipOrRole(order, actor)` として検査する。
- FE は同マトリクスに従って UI の表示/非表示を切り替える（`features/auth/permissions.ts`）。**ただし実体としての拒否は BE のみで行い、FE は UX のための補助**。

### 5.3 CSRF / その他

- `SameSite=Lax` + 更新系 API に対する明示的な `Origin` チェックで二重に防御する。
- Helmet 相当のセキュリティヘッダは `@fastify/helmet` で設定。
- 本番環境では `HTTPS` 必須（Nginx で終端）。

---

## 6. 監査ログ方針

### 6.1 対象

**すべての更新系操作**（POST / PATCH / DELETE、および承認・キャンセル・状態遷移などの業務アクション）を対象とする。GET は対象外。

### 6.2 記録項目

| 項目 | 内容 |
|------|------|
| `id`              | UUID |
| `occurredAt`      | サーバ時刻 (UTC 保存、表示は JST) |
| `actorUserId`     | 操作ユーザー ID（未認証は `null`） |
| `actorRole`       | 操作時点のロール |
| `requestId`       | 相関 ID |
| `ipAddress`       | クライアント IP |
| `userAgent`       | ブラウザ UA |
| `resourceType`    | `order` / `customer` / ... |
| `resourceId`      | 対象リソース ID |
| `action`          | `create` / `update` / `delete` / `approve` / `cancel` / `ship` / `import` |
| `beforeJson`      | 変更前スナップショット（JSONB、存在する場合） |
| `afterJson`       | 変更後スナップショット（JSONB、存在する場合） |
| `metadata`        | 自由記述 JSONB（CSV 取込件数など） |

### 6.3 書込方式

- **書込はアプリケーション層の Service 内で同一トランザクション**で行う。ビジネスデータと監査ログの整合性を最優先。
- Service から呼ぶ `auditLogger.record(tx, {...})` を共通ヘルパとして提供。
- 追記専用。UPDATE / DELETE を付与しないよう、DB ユーザーの GRANT で INSERT のみ許可。
- パスワード、セッション、ハッシュ値は絶対に `beforeJson` / `afterJson` に含めない（Service 側でホワイトリストを定義）。

### 6.4 保持・閲覧

- 保持期間: 初版は **2 年**（要件未定義のため暫定。schema に含める `occurredAt` へのインデックスで期間削除しやすくする）。
- 閲覧: 管理者のみ。`GET /api/audit-logs` で期間・リソース・ユーザーで絞り込み可能。
- パーティショニングは初版では採用せず、月次で DB サイズを監視して必要になれば `PARTITION BY RANGE(occurredAt)` へ移行する（後述「変更に強い設計上の工夫」参照）。

---

## 7. バッチ設計

### 7.1 種類

- **日次売上集計バッチ** (`dailySummary`)
  - 毎日 02:00 (JST) 実行。
  - 対象: 前日 00:00〜23:59 (JST) の間に `approvedAt` が存在する受注の明細を集計。
  - 集計粒度: **(対象日, 取引先, 商品)** の 3 軸。`DailySalesSummary` テーブルへ UPSERT。
  - キャンセル済み受注は集計対象外（`shipmentStatus != 'cancelled'` かつ `status = 'approved'`）。

### 7.2 起動方式

- バッチは `api` と**同じビルド成果物**を使う（コード共有・型共有のため）。
- Compose では `batch` サービスを別コンテナとして定義し、cron ではなく**ホスト側の cron もしくは `docker compose run --rm batch`** で起動する。
  - 初版: 開発では `pnpm --filter api batch:daily -- --date=YYYY-MM-DD` を手動実行可。
  - 本番: ホスト cron or Kubernetes CronJob で `docker compose run --rm batch node dist/batch/daily-summary.js` を叩く。

### 7.3 冪等性

- `DailySalesSummary` は `(summary_date, customer_id, product_id)` をユニークキーとし、UPSERT で再実行可能。
- CLI オプション `--date=YYYY-MM-DD` で対象日を指定可能。デフォルトは「実行日の前日」。
- 実行履歴は `BatchExecution` テーブルに記録（開始・終了・件数・エラー）。

### 7.4 失敗・再実行

- 失敗時はプロセス終了コード 1 + pino ログに `level=error`。
- 冪等なので再実行は同一コマンドで OK。
- 通知は要件未定義のため初版は**ログ出力のみ**。監視ハブ（Zabbix 等）連携は将来拡張で対応。

---

## 8. テスト戦略

### 8.1 ピラミッド

| 層 | 対象 | ツール | 実行環境 |
|----|------|--------|---------|
| 単体   | ドメイン純粋関数（状態遷移、金額計算）、Service のモック利用、FE hooks | Vitest | ローカル / CI |
| 結合   | API エンドポイント + 実 DB（PostgreSQL） | Vitest + Supertest + testcontainers | CI |
| E2E    | 主要フロー（ログイン→受注登録→承認→出荷） | Playwright | CI (nightly) |

### 8.2 カバレッジ目標

- BE ドメイン層: **90%**
- BE Service 層: **80%**
- FE features 層: **70%**
- FE UI コンポーネント: カバレッジ目標なし（E2E で担保）

### 8.3 テストデータ

- `apps/api/prisma/seed.ts` に開発用最小データ（各ロールのユーザー、取引先・商品サンプル、受注サンプル）。
- 統合テストは各テストで **txn ロールバック戦略**（各テスト関数で BEGIN → テスト → ROLLBACK）。

### 8.4 必須で書くテスト（リスク駆動）

- 受注の状態遷移: 全組合せ（未承認→承認→キャンセル→出荷…）を決定的に網羅
- 権限マトリクス: 各ロールで各エンドポイントを呼び、期待通り 200/403 になるかを表形式テスト
- CSV インポート: 空行・文字コード違反・重複キー・必須欠落 の 4 パターン
- 日次バッチの冪等性: 同一対象日で 2 回実行しても結果が変わらないこと
- 監査ログ: 更新系 API を叩いた後に必ず 1 行入っていること（`beforeJson`/`afterJson` の形）

---

## 9. 変更に強い設計上の工夫

過剰設計を避けつつ、後で効く分離点を最低限入れる。

### 9.1 状態遷移をドメイン純粋関数に閉じ込める

受注承認ルールや出荷ステータス遷移を `orders.state.ts` / `shipments.state.ts` に集約し、Controller / Service から参照する。将来「多段承認」「金額閾値承認」が追加されても、変更箇所はこのファイルとテストに限定される。

```ts
// orders.state.ts
export type OrderStatus = 'draft' | 'approved' | 'cancelled';
export type ShipmentStatus = 'pending' | 'shipped' | 'cancelled';

export function canApprove(order: Order, actor: Actor): Result;
export function nextShipmentStatus(
  current: ShipmentStatus,
  event: ShipmentEvent,
): ShipmentStatus | Error;
```

### 9.2 Zod スキーマを FE/BE で共有

`packages/shared/schemas` に Zod スキーマを集約し、FE のフォーム検証と BE のリクエスト検証で同じ定義を使う。スキーマ変更が 1 箇所で済む。

### 9.3 RBAC を「設定」として一元管理

`apps/api/src/middlewares/rbac.ts` に**ロール×リソース×操作**の許可マトリクスをデータ構造で持ち、各ルートは `requireRole(resource, action)` を付けるだけ。新ロール追加はマトリクス編集のみで済む。

### 9.4 監査ログの書込を共通ラッパで強制

更新系 Service は原則 `withAudit(tx, meta, async () => { ... })` を経由するか、Service 内で明示的に `auditLogger.record()` を呼ぶ規約にする。抜け漏れは統合テストで検知（「PATCH 叩いたら監査ログが 1 行増えること」）。

### 9.5 パーティショニング前提のスキーマ

`audit_logs` は将来のパーティショニングを見越して、主キーを `(id, occurred_at)` 複合にするのではなく、`occurred_at` に単独インデックスを張り、参照系クエリは必ず期間指定を要求する API 設計にする。実装は単一テーブルから始め、データ量が実測で問題になってから RANGE パーティション化する。

### 9.6 CSV・バッチの I/O 境界を薄く保つ

- CSV インポートは Service 層で「パース → 検証 → トランザクションで書込」の 3 段階に分け、パース層（`csv.parser.ts`）だけを差し替えれば将来 Excel 対応もできる。
- バッチは「集計ロジック（純粋関数）」と「DB 読み書きアダプタ」を分離し、集計ロジック単体を Vitest で回せる。

### 9.7 ページング仕様の統一

全一覧 API は `{ items, page, pageSize, total }` の共通レスポンス型で返す。後続で「カーソルページング」へ差し替えるとしても、FE 側は `items` だけ読んでいれば UI に影響がない。

### 9.8 OpenAPI を「書かずに生成」

Fastify の JSON Schema + Zod 連携（`@fastify/swagger` + `fastify-type-provider-zod`）で、ルート定義から OpenAPI を自動生成する。ドキュメントと実装の乖離を防ぐ。

### 9.9 モノリスで始める・分割点だけ作っておく

分析文書の通りモジュラモノリスで開始する。モジュール間参照は `service` 経由のみ、リポジトリ層を他モジュールから直接呼ばない。このルールだけ守れば、将来「バッチを別サービス化」「商品マスタを分離」するときに移設コストが最小になる。

### 9.10 環境設定は型付き

`apps/api/src/config/env.ts` で Zod により環境変数を検証し、型付きオブジェクトとして export。`.env.example` を常に更新。起動時に失敗すれば早期に気づける。

---

## 10. 参考: 初期実装順序

`analysis.md` セクション 7 の Phase 定義に準拠する。本書で決定した具体度で以下を優先:

1. Docker Compose（api / web / db）＋ pnpm workspace の土台
2. Prisma スキーマと初期マイグレーション（`schema.md` 参照）
3. 認証（セッション）＋ RBAC ミドルウェア＋監査ログ共通ラッパ
4. 取引先・商品 CRUD
5. 受注登録 → 承認 → 出荷ステータス遷移
6. 受注一覧検索＋ページング
7. CSV インポート（取引先・商品）
8. 日次集計バッチ
9. 管理機能（ユーザー管理・監査ログ閲覧）
10. E2E テスト・性能計測

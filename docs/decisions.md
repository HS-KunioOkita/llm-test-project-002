# 実装上の意思決定メモ

MVP 実装時に設計書 (`docs/design.md` / `docs/schema.md` / `docs/api.md`) から意図的に乖離した点、および未解決の曖昧点について記録する。後続フェーズで見直しの対象。

---

## D-001 ID 列幅: CHAR(26) → VARCHAR(32)

### 状況
- `docs/schema.md` 冒頭は全テーブルで `CHAR(26)` (= ULID の長さ) と記述。
- 一方で各所の例示 (`ord_01H...` / `cus_01H...`) はプレフィックス付きで 26 文字に収まらない。
- `docs/review/spec_review_result.md` 指摘 #1 で矛盾として挙げられている。

### 判断
プレフィックスの可読性を優先し、全テーブルの ID を `VARCHAR(32)` とする。

- `u_` / `cus_` / `prd_` / `ord_` / `oli_` / `log_` / `att_` / `ses_` の最長 4 文字プレフィックス + `_` + ULID 26 文字 = 31 文字 → 32 文字幅で十分。
- `apps/api/prisma/schema.prisma` に反映済み。
- `docs/schema.md` 側の記述は未更新 (将来の正式改訂で揃える)。

## D-002 パスワードハッシュ: argon2id → bcryptjs

### 状況
`docs/design.md` 5.1 は argon2id を指定。

### 判断
MVP ではネイティブビルド不要な `bcryptjs` を採用。以下の理由。

- Docker や CI 環境での argon2 ネイティブビルドに伴う手間を排除。
- bcryptjs コスト 10 で実用上の安全域。
- 将来 argon2 に置き換える場合も `apps/api/src/modules/auth/password.ts` の 2 関数を差し替えるだけで済む。

## D-003 セッション: secure-session (Cookie 暗号化) → DB セッションテーブル

### 状況
`docs/design.md` 5.1 は `@fastify/secure-session` を指定。

### 判断
`sessions` テーブルを新設し、Cookie には署名付き不透明 ID のみ格納する方式を採用。

- サーバ側で即時失効が可能 (logout や強制ログアウト運用に有利)。
- Cookie に秘密情報を載せない。
- `@fastify/secure-session` のキーファイル運用を回避し、Compose 起動を単純化。
- `schema.prisma` に `Session` モデルを追加 (schema.md には未記載 — 将来の改訂対象)。

トレードオフ: 認証チェックごとに 1 クエリ発生。規模要件 (100 同時) では問題ない想定。

## D-004 ロック機構 (ログイン失敗)

- 同一ユーザー連続 5 回失敗で 15 分ロック (`users.locked_until`)。設計書通り。
- IP 別レート制限は MVP では未実装 (`@fastify/rate-limit` 導入は将来タスク)。

## D-005 MVP スコープ絞り込み

以下は実装対象外とする。該当するテーブル・エンドポイント・ルーティングは未定義のまま残す。

| 項目 | 状況 | 理由 |
|------|------|------|
| フロントエンド (React + Vite) | 対象外 | バックエンド MVP 完了後に着手 |
| CSV インポート (`/api/csv/*`) | 対象外 | 文字コード・件数上限など仕様確定事項 (分析文書 2.3) が多い |
| 日次売上バッチ・`daily_sales_summary` | 対象外 | 集計粒度が仕様未確定 (analysis R6 / 2.3) |
| 出荷 API (`POST /orders/:id/shipment`) | 対象外 | 承認までで業務コア動線が成立。MVP+α |
| 受注キャンセル API | 未実装 (ドメイン関数は用意済) | `canCancel` までで、HTTP エンドポイントは未配線 |
| 受注更新 (`PATCH /orders/:id`) | 未実装 (ドメイン関数は用意済) | 同上 |
| 監査ログ閲覧 API | 対象外 | review #3 の DB 権限分離方針が未確定 |
| ユーザー管理 API | 対象外 | 初期ユーザーは seed で作成 |
| `@fastify/swagger` による OpenAPI 自動生成 | 対象外 | 依存追加を最小化 |

## D-006 監査ログ閲覧時の DB 権限分離

`docs/review/spec_review_result.md` 指摘 #3 の論点 — アプリ接続に SELECT を許可するか、read 専用接続を分離するか — は未解決。MVP ではアプリ接続で INSERT のみ実施し、閲覧 API 自体を実装しないことで回避している。

## D-007 受注合計金額のロジック

- `order_lines.amount = quantity * unitPrice + floor(quantity * unitPrice * taxRate)`
- すなわち税込額。`docs/schema.md` 2.5 備考の `floor(quantity * unit_price * (1 + tax_rate))` と同値。
- `orders.total_amount` は明細の税込額合計、`total_tax_amount` は税額合計を保持 (サービス層で計算)。

## D-008 pnpm → npm

設計書は pnpm workspace によるモノレポを想定するが、実行環境に pnpm が無いため npm 単一パッケージ構成に変更。  
将来的に `packages/shared`・`apps/web` を追加する際に workspace 化する余地はある。

## D-009 CHECK 制約

Prisma schema では CHECK 制約 (`status IN (...)`) を表現できない。MVP では Zod 検証 + `varchar` 運用で代替。必要ならマイグレーション生成後に raw SQL を追記する運用。

## D-010 Prisma 型依存を最小化 (`Prisma.TransactionClient` / `Prisma.InputJsonValue` など不使用)

### 状況
MVP 実装時、本環境 (devcontainer) の firewall が `binaries.prisma.sh` をブロックしており、`npx prisma generate` が schema-engine / query-engine をダウンロードできなかった。結果、`node_modules/.prisma/client` には型情報ゼロのスタブが生成され、`Prisma.TransactionClient` / `Prisma.InputJsonValue` / `Prisma.CustomerWhereInput` などの名前空間型が解決できず strict typecheck が通らなくなった。

### 対応
- `/workspace/.devcontainer/init-firewall.sh` の allowlist に `binaries.prisma.sh` を追加 (行 29)。**ただし firewall の再適用には root 権限が必要で、完全反映は devcontainer 再ビルド後**。
- アプリケーションコードは Prisma 名前空間型に依存しないリファクタリングを実施:
  - `PrismaClient` を狭めた `Tx` 型 (`apps/api/src/db/prisma.ts`) をトランザクションクライアント用に定義。
  - JSON ペイロードは `JsonLike` 型で受ける。
  - `where` 句は `Record<string, unknown>` で一旦受け、Prisma 実行時に解釈させる。

### 影響
- typecheck / 単体テストは green。
- devcontainer 再ビルド後は `npm run prisma:generate` で完全な型が生成され、上記リファクタリングは安全に維持できる (より厳密にしたければ `Tx` を `Prisma.TransactionClient` に差し替え可)。

## D-011 `req.currentUser.role` の型

`SessionUser.role` は `'admin' | 'orderer' | 'sales' | 'viewer'` (`Role`) に制約済み。`orders.routes.ts` では `orders.state.ts` の `Role` 型に合わせて一度キャストしているが、同値の union type であることを ensure するために将来 `packages/shared` へロール定義を集約すべき。

---

## 未解決の曖昧点 (今後の確認対象)

1. 受注番号の採番ロジック (同年内最大値+1) は現状アプリ層で非原子的。高並列ケースでは `order_number` ユニーク制約違反で再試行が必要 → 別途シーケンス管理を検討。
2. 税率 10.0% を超えるケース (軽減税率複数税率など) の扱い。
3. `updated_at` の自動更新は Prisma `@updatedAt` に任せているが、DB トリガへ切り替えるか要判断。
4. 論理削除 (`active=false`) と一意制約の両立 — 同じ `code` を再利用したい場合、物理削除か部分一意制約 (`WHERE active`) のいずれが要件に合うか。

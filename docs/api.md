# API 仕様: 中小卸売業向け受発注管理システム

- ベース URL: `/api`
- 形式: REST / JSON (UTF-8)
- 認証: セッション Cookie（`@fastify/secure-session`）
- 日付: ISO 8601 (`2026-04-15T10:00:00+09:00`)
- 文字コード: UTF-8
- 対応メソッド: `GET` / `POST` / `PATCH` / `DELETE`

本書は主要エンドポイントの一覧と代表的なリクエスト/レスポンス例を示す。完全なスキーマは実装から OpenAPI (`/api/docs`) を自動生成する。

---

## 1. 共通仕様

### 1.1 認証

- ログイン後、サーバは `sid` Cookie を発行する（`HttpOnly`, `Secure`, `SameSite=Lax`）。
- 認証必須 API で `sid` 不正・期限切れの場合は `401 Unauthorized`。
- 権限不足の場合は `403 Forbidden`。

### 1.2 ページング

一覧取得エンドポイントは以下のクエリを共通で受け付ける。

| パラメータ | 型 | デフォルト | 備考 |
|------------|------|-----------|------|
| `page`     | int  | 1  | 1 始まり |
| `pageSize` | int  | 50 | 上限 200 |
| `sort`     | str  | 各 API 規定 | `field:asc` / `field:desc` 形式 |

レスポンスは次の共通形を取る:

```json
{
  "items": [ ... ],
  "page": 1,
  "pageSize": 50,
  "total": 234
}
```

### 1.3 エラー形式

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "入力値が不正です",
    "details": {
      "fields": [
        { "path": "items[0].quantity", "message": "1 以上を指定してください" }
      ]
    }
  }
}
```

| HTTP | `code` | 用途 |
|------|--------|------|
| 400  | `VALIDATION_ERROR`    | Zod 検証失敗 |
| 401  | `UNAUTHENTICATED`     | 未ログイン / セッション切れ |
| 403  | `FORBIDDEN`           | 権限不足 |
| 404  | `NOT_FOUND`           | リソース未存在 |
| 409  | `CONFLICT`            | 状態遷移違反 / 一意制約違反 |
| 422  | `BUSINESS_RULE_ERROR` | 業務ルール違反（例: 下書き以外の更新） |
| 429  | `RATE_LIMITED`        | レート制限 |
| 500  | `INTERNAL_ERROR`      | サーバ内部エラー |

### 1.4 監査ログ

`POST` / `PATCH` / `DELETE` および承認・キャンセル・出荷 API はすべて `audit_logs` に 1 行記録される。呼び出し側は意識不要。

---

## 2. 認証 `/api/auth`

### `POST /api/auth/login`

リクエスト:
```json
{ "loginId": "sato", "password": "P@ssw0rd!" }
```

レスポンス `200 OK`:
```json
{
  "user": {
    "id": "u_01HX...",
    "loginId": "sato",
    "displayName": "佐藤 太郎",
    "role": "orderer"
  }
}
```
`Set-Cookie: sid=...; HttpOnly; Secure; SameSite=Lax`

失敗: `401 UNAUTHENTICATED`。5 回連続失敗で `423 LOCKED` 扱い（`code: "ACCOUNT_LOCKED"`）。

### `POST /api/auth/logout`

認証必須。セッション破棄。`204 No Content`。

### `GET /api/auth/me`

認証必須。ログイン中のユーザー情報を返す。

```json
{
  "id": "u_01HX...",
  "loginId": "sato",
  "displayName": "佐藤 太郎",
  "role": "orderer",
  "permissions": ["customers:read", "products:write", "orders:approve", ...]
}
```

---

## 3. ユーザー `/api/users`（管理者のみ）

| メソッド | パス | 説明 |
|----------|------|------|
| GET      | `/api/users`           | 一覧（`?q=` で loginId/displayName 部分一致、`?role=` で絞り込み） |
| POST     | `/api/users`           | 新規作成（初期パスワードはサーバ生成でレスポンス返却） |
| GET      | `/api/users/:id`       | 取得 |
| PATCH    | `/api/users/:id`       | 更新（displayName / role / active） |
| POST     | `/api/users/:id/reset-password` | パスワード再発行 |
| DELETE   | `/api/users/:id`       | 論理削除（`active=false`） |

`POST /api/users` リクエスト例:
```json
{
  "loginId": "yamada",
  "displayName": "山田 花子",
  "role": "sales",
  "email": "yamada@example.co.jp"
}
```

レスポンス `201`:
```json
{
  "id": "u_01HY...",
  "loginId": "yamada",
  "displayName": "山田 花子",
  "role": "sales",
  "email": "yamada@example.co.jp",
  "active": true,
  "initialPassword": "Tmp-8xQz..."
}
```

---

## 4. 取引先 `/api/customers`

| メソッド | パス | 権限 |
|----------|------|------|
| GET      | `/api/customers`       | 全ロール |
| GET      | `/api/customers/:id`   | 全ロール |
| POST     | `/api/customers`       | admin / orderer |
| PATCH    | `/api/customers/:id`   | admin / orderer |
| DELETE   | `/api/customers/:id`   | admin（論理削除） |

検索クエリ（一覧）:
- `q`: 名称・コード部分一致
- `active`: `true`/`false`
- `sort`: `name:asc`（デフォルト）

`POST /api/customers` リクエスト:
```json
{
  "code": "C0001",
  "name": "株式会社サンプル",
  "contactName": "鈴木 一郎",
  "email": "suzuki@sample.co.jp",
  "phone": "03-1234-5678",
  "postalCode": "100-0001",
  "address": "東京都千代田区..."
}
```

レスポンス `201`:
```json
{
  "id": "cus_01HZ...",
  "code": "C0001",
  "name": "株式会社サンプル",
  "contactName": "鈴木 一郎",
  "email": "suzuki@sample.co.jp",
  "phone": "03-1234-5678",
  "postalCode": "100-0001",
  "address": "東京都千代田区...",
  "active": true,
  "createdAt": "2026-04-15T10:00:00+09:00",
  "updatedAt": "2026-04-15T10:00:00+09:00"
}
```

---

## 5. 商品 `/api/products`

| メソッド | パス | 権限 |
|----------|------|------|
| GET      | `/api/products`       | 全ロール |
| GET      | `/api/products/:id`   | 全ロール |
| POST     | `/api/products`       | admin / orderer |
| PATCH    | `/api/products/:id`   | admin / orderer |
| DELETE   | `/api/products/:id`   | admin（論理削除） |

`POST /api/products` リクエスト:
```json
{
  "code": "SKU-001",
  "name": "A4 コピー用紙 500 枚",
  "unit": "箱",
  "unitPrice": 1800,
  "taxRate": 0.10
}
```

`unitPrice` は税抜（整数、単位: 円）。`taxRate` は小数（例: `0.10`）。

---

## 6. 受注 `/api/orders`

### 6.1 受注一覧

`GET /api/orders`

クエリ:
- `q`: 取引先名・受注番号 部分一致
- `status`: `draft` / `approved` / `cancelled`
- `shipmentStatus`: `pending` / `shipped` / `cancelled`
- `customerId`: 取引先で絞り込み
- `dateFrom` / `dateTo`: `orderedAt` 範囲
- `assigneeId`: 営業担当者 ID
- `page`, `pageSize`, `sort` (デフォルト `orderedAt:desc`)

レスポンス `200`:
```json
{
  "items": [
    {
      "id": "ord_01HZ...",
      "orderNumber": "2026-0000123",
      "customer": { "id": "cus_...", "code": "C0001", "name": "株式会社サンプル" },
      "status": "approved",
      "shipmentStatus": "pending",
      "orderedAt": "2026-04-14T15:20:00+09:00",
      "approvedAt": "2026-04-14T16:00:00+09:00",
      "totalAmount": 19800,
      "assignee": { "id": "u_...", "displayName": "佐藤 太郎" },
      "lineCount": 3
    }
  ],
  "page": 1,
  "pageSize": 50,
  "total": 1234
}
```

### 6.2 受注取得

`GET /api/orders/:id`

レスポンス（明細含む）:
```json
{
  "id": "ord_01HZ...",
  "orderNumber": "2026-0000123",
  "customer": { "id": "cus_...", "code": "C0001", "name": "株式会社サンプル" },
  "status": "approved",
  "shipmentStatus": "pending",
  "orderedAt": "2026-04-14T15:20:00+09:00",
  "approvedAt": "2026-04-14T16:00:00+09:00",
  "cancelledAt": null,
  "shippedAt": null,
  "note": "午前指定",
  "assignee": { "id": "u_...", "displayName": "佐藤 太郎" },
  "approver": { "id": "u_...", "displayName": "田中 次郎" },
  "items": [
    {
      "id": "oli_01HZ...",
      "productId": "prd_...",
      "productCode": "SKU-001",
      "productName": "A4 コピー用紙",
      "quantity": 10,
      "unitPrice": 1800,
      "taxRate": 0.10,
      "amount": 19800
    }
  ],
  "totalAmount": 19800,
  "totalTaxAmount": 1800,
  "createdAt": "2026-04-14T15:20:00+09:00",
  "updatedAt": "2026-04-14T16:00:00+09:00"
}
```

### 6.3 受注登録

`POST /api/orders` （権限: admin / orderer / sales）

リクエスト:
```json
{
  "customerId": "cus_01HZ...",
  "orderedAt": "2026-04-14T15:20:00+09:00",
  "note": "午前指定",
  "items": [
    { "productId": "prd_...", "quantity": 10, "unitPrice": 1800, "taxRate": 0.10 }
  ]
}
```

- `unitPrice`・`taxRate` は省略時、商品マスタの値を採用する。
- 明細は **1 受注あたり最大 200 行**。
- レスポンス `201` は 6.2 と同じ形。`status` は `draft`。

### 6.4 受注更新

`PATCH /api/orders/:id` （権限: admin / orderer / sales（自分が登録したもの）。`status=draft` のみ）

リクエストは受注登録と同形（部分更新可）。

### 6.5 受注承認

`POST /api/orders/:id/approve` （権限: admin / orderer）

- 現ステータス `draft` のみ可。`approved` / `cancelled` では `409 CONFLICT`。
- 成功時: `status=approved`, `approvedAt` 更新, `approverId` 設定。
- レスポンス: 更新後の受注（6.2 形式）。

### 6.6 受注キャンセル

`POST /api/orders/:id/cancel` （権限: admin / orderer）

リクエスト:
```json
{ "reason": "顧客都合によるキャンセル" }
```

- `status` が `draft` / `approved` で、かつ `shipmentStatus` が `pending` の場合のみ可。出荷済みからのキャンセル（返品）は **対象外**。
- 成功時: `status=cancelled`, `shipmentStatus=cancelled`, `cancelledAt` 更新。

### 6.7 出荷ステータス更新

`POST /api/orders/:id/shipment` （権限: admin / orderer）

リクエスト:
```json
{ "action": "ship", "shippedAt": "2026-04-15T09:00:00+09:00" }
```

`action`: `ship` / `cancel`

状態遷移:

| 現状態 | action | 遷移先 | 追加条件 |
|--------|--------|--------|---------|
| `pending`  | `ship`   | `shipped`   | 受注 `status=approved` 必須 |
| `pending`  | `cancel` | `cancelled` | 受注側 `cancel` と連動（通常はこちら単独で使わない） |
| `shipped`  | 任意     | 不可        | `409 CONFLICT` |
| `cancelled`| 任意     | 不可        | `409 CONFLICT` |

レスポンス: 更新後の受注。

---

## 7. CSV インポート `/api/csv`

管理者のみ。`multipart/form-data`。

| メソッド | パス | 説明 |
|----------|------|------|
| POST     | `/api/csv/customers/import` | 取引先 CSV 取込 |
| POST     | `/api/csv/products/import`  | 商品 CSV 取込 |

### 7.1 共通仕様

- 文字コード: **UTF-8 (BOM 可)** のみ対応
- 区切り: カンマ
- ヘッダ行: **必須**
- 最大行数: **10,000 行** / 1 ファイル
- フォームフィールド:
  - `file`: CSV ファイル（必須）
  - `dryRun`: `true`/`false`（既定 `false`）。`true` のとき検証のみ行い、DB は変更しない
  - `updateStrategy`: `upsert`（既定） / `skipExisting` / `errorOnConflict`

### 7.2 取引先 CSV フォーマット

```csv
code,name,contactName,email,phone,postalCode,address,active
C0001,株式会社サンプル,鈴木 一郎,suzuki@example.co.jp,03-1234-5678,100-0001,東京都千代田区...,true
```

`code` がユニークキー。

### 7.3 商品 CSV フォーマット

```csv
code,name,unit,unitPrice,taxRate,active
SKU-001,A4 コピー用紙,箱,1800,0.10,true
```

`code` がユニークキー。

### 7.4 レスポンス

```json
{
  "dryRun": false,
  "total": 1000,
  "created": 820,
  "updated": 170,
  "skipped": 5,
  "errors": [
    { "row": 42, "code": "C9999", "message": "emailの形式が不正です" },
    { "row": 78, "code": "C8888", "message": "必須項目 name が空です" }
  ]
}
```

- エラー行が 1 件でもあり `updateStrategy=errorOnConflict` の場合は**全体ロールバック**し `422 BUSINESS_RULE_ERROR`。
- それ以外はエラー行をスキップして成功行をコミット。

---

## 8. 売上集計 `/api/sales`

日次バッチで生成された結果を閲覧する読み取り専用 API。

### `GET /api/sales/daily`

クエリ:
- `dateFrom`, `dateTo`: 対象日範囲（必須）
- `customerId`: 任意
- `productId`: 任意
- `groupBy`: `date` / `customer` / `product` / `date_customer` 等（既定 `date`）
- `page`, `pageSize`

レスポンス例（`groupBy=date`）:
```json
{
  "items": [
    { "date": "2026-04-14", "orderCount": 12, "quantity": 230, "amount": 456000 },
    { "date": "2026-04-13", "orderCount": 9,  "quantity": 180, "amount": 321000 }
  ],
  "page": 1,
  "pageSize": 50,
  "total": 31
}
```

---

## 9. 監査ログ `/api/audit-logs`（管理者のみ）

### `GET /api/audit-logs`

クエリ:
- `occurredFrom`, `occurredTo`（必須）
- `actorUserId`
- `resourceType`: `order` / `customer` / `product` / `user` / `csv`
- `resourceId`
- `action`: `create` / `update` / `delete` / `approve` / `cancel` / `ship` / `import`
- `page`, `pageSize`, `sort` (既定 `occurredAt:desc`)

レスポンス:
```json
{
  "items": [
    {
      "id": "log_01HZ...",
      "occurredAt": "2026-04-14T16:00:00+09:00",
      "actor": { "id": "u_...", "loginId": "tanaka", "role": "orderer" },
      "requestId": "req_01HZ...",
      "ipAddress": "10.0.0.12",
      "resourceType": "order",
      "resourceId": "ord_01HZ...",
      "action": "approve",
      "beforeJson": { "status": "draft" },
      "afterJson":  { "status": "approved", "approvedAt": "2026-04-14T16:00:00+09:00" },
      "metadata": null
    }
  ],
  "page": 1,
  "pageSize": 50,
  "total": 873
}
```

---

## 10. ヘルスチェック

| メソッド | パス | 説明 |
|----------|------|------|
| GET | `/healthz` | プロセス生存確認（常に 200） |
| GET | `/readyz`  | DB 接続を含む準備完了確認（失敗時 503） |

どちらも認証不要。

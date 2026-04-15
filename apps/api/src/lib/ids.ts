import { ulid } from 'ulid';

// プレフィックス付き ID 採番。
// schema.md の CHAR(26) 記述との整合は docs/decisions.md 参照。
// 生成例: "ord_01HY..." (4 文字プレフィックス + ULID 26 文字 = 30 文字)
export function newId(prefix: 'u' | 'cus' | 'prd' | 'ord' | 'oli' | 'log' | 'att' | 'ses'): string {
  return `${prefix}_${ulid()}`;
}

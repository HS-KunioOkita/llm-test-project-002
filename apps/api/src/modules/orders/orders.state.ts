// 受注の状態遷移ルール (純粋関数)。
// 業務コア動線 (登録 → 承認 → キャンセル) をこのモジュールに閉じ込める。
// 変更はここと単体テストだけで済ませる。

export type OrderStatus = 'draft' | 'approved' | 'cancelled';
export type ShipmentStatus = 'pending' | 'shipped' | 'cancelled';
export type Role = 'admin' | 'orderer' | 'sales' | 'viewer';

export type StateResult = { ok: true } | { ok: false; reason: string };

export interface ApprovalActor {
  role: Role;
}

export interface OrderSnapshot {
  status: OrderStatus;
  shipmentStatus: ShipmentStatus;
  assigneeUserId: string;
}

export function canApprove(order: OrderSnapshot, actor: ApprovalActor): StateResult {
  if (actor.role !== 'admin' && actor.role !== 'orderer') {
    return { ok: false, reason: '承認権限がありません' };
  }
  if (order.status !== 'draft') {
    return { ok: false, reason: `status=${order.status} からは承認できません` };
  }
  if (order.shipmentStatus !== 'pending') {
    return { ok: false, reason: `shipmentStatus=${order.shipmentStatus} からは承認できません` };
  }
  return { ok: true };
}

export function canCancel(order: OrderSnapshot, actor: ApprovalActor): StateResult {
  if (actor.role !== 'admin' && actor.role !== 'orderer') {
    return { ok: false, reason: 'キャンセル権限がありません' };
  }
  if (order.status === 'cancelled') {
    return { ok: false, reason: 'すでにキャンセル済みです' };
  }
  if (order.shipmentStatus === 'shipped') {
    return { ok: false, reason: '出荷済みの受注はキャンセルできません' };
  }
  return { ok: true };
}

export function canUpdateDraft(
  order: OrderSnapshot,
  actor: { role: Role; userId: string },
): StateResult {
  if (order.status !== 'draft') {
    return { ok: false, reason: '下書き以外は更新できません' };
  }
  if (actor.role === 'admin' || actor.role === 'orderer') return { ok: true };
  if (actor.role === 'sales' && order.assigneeUserId === actor.userId) return { ok: true };
  return { ok: false, reason: '自分が登録した下書きのみ更新できます' };
}

// 金額計算 (明細単位)。税込金額 = floor(quantity * unitPrice * (1 + taxRate))。
export function calcLineAmount(
  quantity: number,
  unitPrice: number,
  taxRate: number,
): { amount: number; taxAmount: number } {
  const base = quantity * unitPrice;
  const tax = Math.floor(base * taxRate);
  return { amount: base + tax, taxAmount: tax };
}

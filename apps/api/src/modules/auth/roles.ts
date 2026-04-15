export const ROLES = ['admin', 'orderer', 'sales', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export function isRole(v: string): v is Role {
  return (ROLES as readonly string[]).includes(v);
}

// ロール × リソース × 操作の権限マトリクス。
// rbac ミドルウェアはこの設定のみを参照する。
// 「オブジェクト単位 (自分の下書きだけ更新可)」は Service 層で追加判定する。
export type Action = 'read' | 'write' | 'delete' | 'approve' | 'cancel';
export type Resource = 'customers' | 'products' | 'orders' | 'audit_logs' | 'users';

const MATRIX: Record<Resource, Partial<Record<Action, readonly Role[]>>> = {
  customers: {
    read: ['admin', 'orderer', 'sales', 'viewer'],
    write: ['admin', 'orderer'],
    delete: ['admin'],
  },
  products: {
    read: ['admin', 'orderer', 'sales', 'viewer'],
    write: ['admin', 'orderer'],
    delete: ['admin'],
  },
  orders: {
    read: ['admin', 'orderer', 'sales', 'viewer'],
    write: ['admin', 'orderer', 'sales'],
    approve: ['admin', 'orderer'],
    cancel: ['admin', 'orderer'],
  },
  audit_logs: {
    read: ['admin'],
  },
  users: {
    read: ['admin'],
    write: ['admin'],
    delete: ['admin'],
  },
};

export function hasPermission(role: Role, resource: Resource, action: Action): boolean {
  return MATRIX[resource][action]?.includes(role) ?? false;
}

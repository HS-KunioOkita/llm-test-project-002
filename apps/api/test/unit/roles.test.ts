import { describe, expect, it } from 'vitest';
import { hasPermission, isRole } from '../../src/modules/auth/roles';

describe('roles.hasPermission', () => {
  it('viewer は顧客読取可', () => {
    expect(hasPermission('viewer', 'customers', 'read')).toBe(true);
  });
  it('viewer は顧客書き込み不可', () => {
    expect(hasPermission('viewer', 'customers', 'write')).toBe(false);
  });
  it('sales は受注登録可、承認不可', () => {
    expect(hasPermission('sales', 'orders', 'write')).toBe(true);
    expect(hasPermission('sales', 'orders', 'approve')).toBe(false);
  });
  it('orderer は受注承認可', () => {
    expect(hasPermission('orderer', 'orders', 'approve')).toBe(true);
  });
  it('admin は監査ログ閲覧可、それ以外は不可', () => {
    expect(hasPermission('admin', 'audit_logs', 'read')).toBe(true);
    expect(hasPermission('orderer', 'audit_logs', 'read')).toBe(false);
    expect(hasPermission('sales', 'audit_logs', 'read')).toBe(false);
    expect(hasPermission('viewer', 'audit_logs', 'read')).toBe(false);
  });
});

describe('roles.isRole', () => {
  it.each(['admin', 'orderer', 'sales', 'viewer'])('%s は正しいロール', (v) => {
    expect(isRole(v)).toBe(true);
  });
  it('未定義ロールは拒否', () => {
    expect(isRole('superuser')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  calcLineAmount,
  canApprove,
  canCancel,
  canUpdateDraft,
  type OrderSnapshot,
} from '../../src/modules/orders/orders.state';

const snapshot = (overrides: Partial<OrderSnapshot> = {}): OrderSnapshot => ({
  status: 'draft',
  shipmentStatus: 'pending',
  assigneeUserId: 'u_1',
  ...overrides,
});

describe('orders.state.canApprove', () => {
  it('admin が draft+pending を承認できる', () => {
    expect(canApprove(snapshot(), { role: 'admin' })).toEqual({ ok: true });
  });

  it('orderer が draft+pending を承認できる', () => {
    expect(canApprove(snapshot(), { role: 'orderer' })).toEqual({ ok: true });
  });

  it('sales は承認できない', () => {
    const r = canApprove(snapshot(), { role: 'sales' });
    expect(r.ok).toBe(false);
  });

  it('viewer は承認できない', () => {
    const r = canApprove(snapshot(), { role: 'viewer' });
    expect(r.ok).toBe(false);
  });

  it('すでに承認済みは承認できない', () => {
    const r = canApprove(snapshot({ status: 'approved' }), { role: 'admin' });
    expect(r.ok).toBe(false);
  });

  it('キャンセル済みは承認できない', () => {
    const r = canApprove(snapshot({ status: 'cancelled' }), { role: 'admin' });
    expect(r.ok).toBe(false);
  });

  it('出荷済みは承認できない', () => {
    const r = canApprove(snapshot({ shipmentStatus: 'shipped' }), { role: 'admin' });
    expect(r.ok).toBe(false);
  });
});

describe('orders.state.canCancel', () => {
  it('draft+pending はキャンセル可', () => {
    expect(canCancel(snapshot(), { role: 'orderer' })).toEqual({ ok: true });
  });

  it('approved+pending もキャンセル可', () => {
    expect(canCancel(snapshot({ status: 'approved' }), { role: 'orderer' })).toEqual({
      ok: true,
    });
  });

  it('shipped はキャンセル不可', () => {
    const r = canCancel(snapshot({ status: 'approved', shipmentStatus: 'shipped' }), {
      role: 'admin',
    });
    expect(r.ok).toBe(false);
  });

  it('sales はキャンセル不可', () => {
    const r = canCancel(snapshot(), { role: 'sales' });
    expect(r.ok).toBe(false);
  });
});

describe('orders.state.canUpdateDraft', () => {
  it('sales は自分の下書きを更新可', () => {
    const r = canUpdateDraft(snapshot({ assigneeUserId: 'u_1' }), { role: 'sales', userId: 'u_1' });
    expect(r.ok).toBe(true);
  });

  it('sales は他人の下書きは更新不可', () => {
    const r = canUpdateDraft(snapshot({ assigneeUserId: 'u_X' }), { role: 'sales', userId: 'u_1' });
    expect(r.ok).toBe(false);
  });

  it('orderer は誰の下書きでも更新可', () => {
    const r = canUpdateDraft(snapshot({ assigneeUserId: 'u_X' }), {
      role: 'orderer',
      userId: 'u_1',
    });
    expect(r.ok).toBe(true);
  });

  it('approved は更新不可', () => {
    const r = canUpdateDraft(snapshot({ status: 'approved' }), { role: 'admin', userId: 'u_1' });
    expect(r.ok).toBe(false);
  });
});

describe('orders.state.calcLineAmount', () => {
  it('税率10% で税込/税額が正しく計算される', () => {
    const r = calcLineAmount(10, 1800, 0.1);
    // 10 * 1800 = 18000, tax = floor(18000 * 0.1) = 1800, amount = 19800
    expect(r).toEqual({ amount: 19800, taxAmount: 1800 });
  });

  it('税率 0 のとき税額は 0', () => {
    expect(calcLineAmount(3, 100, 0)).toEqual({ amount: 300, taxAmount: 0 });
  });

  it('端数は切り捨て', () => {
    // 7 * 123 = 861, tax = floor(861 * 0.08) = floor(68.88) = 68
    expect(calcLineAmount(7, 123, 0.08)).toEqual({ amount: 861 + 68, taxAmount: 68 });
  });
});

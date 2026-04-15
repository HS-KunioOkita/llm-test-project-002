import { prisma, type JsonLike, type Tx } from '../../db/prisma';
import { conflict, notFound, validationError } from '../../lib/errors';
import { newId } from '../../lib/ids';
import { writeAudit } from '../audit/audit';
import type { OrderCreateInput } from './orders.schema';
import { calcLineAmount, canApprove } from './orders.state';
import type { Role } from './orders.state';

type Actor = { id: string; role: Role };
type AuditCtx = { requestId?: string; ipAddress?: string; userAgent?: string | null };

const orderInclude = {
  customer: { select: { id: true, code: true, name: true } },
  assignee: { select: { id: true, loginId: true, displayName: true } },
  approver: { select: { id: true, loginId: true, displayName: true } },
  items: { orderBy: { lineNo: 'asc' as const } },
};

function toJson(row: unknown): JsonLike {
  return JSON.parse(JSON.stringify(row)) as JsonLike;
}

// 受注番号: YYYY-連番 6桁。同年内の最大値+1 で採番。
// 競合時は P2002 で API 層が 409 に変換する。
async function nextOrderNumber(tx: Tx, orderedAt: Date): Promise<string> {
  const year = orderedAt.getUTCFullYear();
  const prefix = `${year}-`;
  const last = await tx.order.findFirst({
    where: { orderNumber: { startsWith: prefix } },
    orderBy: { orderNumber: 'desc' },
    select: { orderNumber: true },
  });
  const seq = last ? Number(last.orderNumber.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(seq).padStart(6, '0')}`;
}

export async function createOrder(input: OrderCreateInput, actor: Actor, ctx: AuditCtx = {}) {
  return prisma.$transaction(async (tx: Tx) => {
    const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
    if (!customer || !customer.active) {
      throw validationError('取引先が無効または存在しません');
    }

    // 商品マスタを一括取得しスナップショット作成
    const productIds = [...new Set(input.items.map((i) => i.productId))];
    const products = await tx.product.findMany({
      where: { id: { in: productIds }, active: true },
    });
    type ProductRow = { id: string; unitPrice: number; taxRate: { toNumber(): number } | number };
    const productMap = new Map<string, ProductRow>(
      products.map((p: ProductRow) => [p.id, p]),
    );

    let totalAmount = 0;
    let totalTaxAmount = 0;
    const lineData = input.items.map((item, idx) => {
      const product = productMap.get(item.productId);
      if (!product) throw validationError(`商品が無効または存在しません: ${item.productId}`);
      const unitPrice = item.unitPrice ?? product.unitPrice;
      const taxRateRaw = product.taxRate;
      const productTaxRate =
        typeof taxRateRaw === 'number' ? taxRateRaw : taxRateRaw.toNumber();
      const taxRate = item.taxRate ?? productTaxRate;
      const { amount, taxAmount } = calcLineAmount(item.quantity, unitPrice, taxRate);
      totalAmount += amount;
      totalTaxAmount += taxAmount;
      return {
        id: newId('oli'),
        productId: item.productId,
        lineNo: idx + 1,
        quantity: item.quantity,
        unitPrice,
        taxRate,
        amount,
      };
    });

    const orderedAt = input.orderedAt ? new Date(input.orderedAt) : new Date();
    const orderNumber = await nextOrderNumber(tx, orderedAt);
    const orderId = newId('ord');

    const order = await tx.order.create({
      data: {
        id: orderId,
        orderNumber,
        customerId: input.customerId,
        assigneeUserId: actor.id,
        status: 'draft',
        shipmentStatus: 'pending',
        orderedAt,
        note: input.note ?? null,
        totalAmount,
        totalTaxAmount,
        items: { create: lineData },
      },
      include: orderInclude,
    });

    await writeAudit(
      {
        actorUserId: actor.id,
        actorRole: actor.role,
        requestId: ctx.requestId,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent ?? null,
        resourceType: 'order',
        resourceId: orderId,
        action: 'create',
        afterJson: toJson(order),
      },
      tx,
    );

    return order;
  });
}

export async function approveOrder(id: string, actor: Actor, ctx: AuditCtx = {}) {
  return prisma.$transaction(async (tx: Tx) => {
    const before = await tx.order.findUnique({ where: { id } });
    if (!before) throw notFound();

    const verdict = canApprove(
      {
        status: before.status as 'draft' | 'approved' | 'cancelled',
        shipmentStatus: before.shipmentStatus as 'pending' | 'shipped' | 'cancelled',
        assigneeUserId: before.assigneeUserId,
      },
      { role: actor.role },
    );
    if (!verdict.ok) throw conflict(verdict.reason);

    const after = await tx.order.update({
      where: { id },
      data: {
        status: 'approved',
        approvedAt: new Date(),
        approverUserId: actor.id,
      },
      include: orderInclude,
    });

    await writeAudit(
      {
        actorUserId: actor.id,
        actorRole: actor.role,
        requestId: ctx.requestId,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent ?? null,
        resourceType: 'order',
        resourceId: id,
        action: 'approve',
        beforeJson: toJson(before),
        afterJson: toJson(after),
      },
      tx,
    );
    return after;
  });
}

export async function getOrder(id: string) {
  const row = await prisma.order.findUnique({ where: { id }, include: orderInclude });
  if (!row) throw notFound();
  return row;
}

export async function listOrders(query: {
  q?: string;
  status?: 'draft' | 'approved' | 'cancelled';
  shipmentStatus?: 'pending' | 'shipped' | 'cancelled';
  customerId?: string;
  assigneeId?: string;
  dateFrom?: string;
  dateTo?: string;
  page: number;
  pageSize: number;
}) {
  const where: Record<string, unknown> = {};
  if (query.status) where.status = query.status;
  if (query.shipmentStatus) where.shipmentStatus = query.shipmentStatus;
  if (query.customerId) where.customerId = query.customerId;
  if (query.assigneeId) where.assigneeUserId = query.assigneeId;
  if (query.dateFrom || query.dateTo) {
    const range: Record<string, Date> = {};
    if (query.dateFrom) range.gte = new Date(query.dateFrom);
    if (query.dateTo) range.lte = new Date(query.dateTo);
    where.orderedAt = range;
  }
  if (query.q) {
    where.OR = [
      { orderNumber: { contains: query.q, mode: 'insensitive' } },
      { customer: { name: { contains: query.q, mode: 'insensitive' } } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: [{ orderedAt: 'desc' }],
      include: {
        customer: { select: { id: true, code: true, name: true } },
        assignee: { select: { id: true, displayName: true } },
        _count: { select: { items: true } },
      },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.order.count({ where }),
  ]);
  return { items, total };
}

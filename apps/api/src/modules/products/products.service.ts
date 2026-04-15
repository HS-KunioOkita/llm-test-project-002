import { prisma, type JsonLike, type Tx } from '../../db/prisma';
import { notFound } from '../../lib/errors';
import { newId } from '../../lib/ids';
import { writeAudit } from '../audit/audit';
import type { ProductCreateInput, ProductUpdateInput } from './products.schema';

type Actor = { id: string; role: string };
type AuditCtx = { requestId?: string; ipAddress?: string; userAgent?: string | null };

function toJson(row: unknown): JsonLike {
  return JSON.parse(JSON.stringify(row)) as JsonLike;
}

export async function createProduct(input: ProductCreateInput, actor: Actor, ctx: AuditCtx = {}) {
  return prisma.$transaction(async (tx: Tx) => {
    const row = await tx.product.create({
      data: {
        id: newId('prd'),
        code: input.code,
        name: input.name,
        unit: input.unit,
        unitPrice: input.unitPrice,
        taxRate: input.taxRate ?? 0.1,
        active: input.active ?? true,
      },
    });
    await writeAudit(
      {
        actorUserId: actor.id,
        actorRole: actor.role,
        requestId: ctx.requestId,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent ?? null,
        resourceType: 'product',
        resourceId: row.id,
        action: 'create',
        afterJson: toJson(row),
      },
      tx,
    );
    return row;
  });
}

export async function updateProduct(
  id: string,
  input: ProductUpdateInput,
  actor: Actor,
  ctx: AuditCtx = {},
) {
  return prisma.$transaction(async (tx: Tx) => {
    const before = await tx.product.findUnique({ where: { id } });
    if (!before) throw notFound();
    const after = await tx.product.update({
      where: { id },
      data: {
        code: input.code ?? before.code,
        name: input.name ?? before.name,
        unit: input.unit ?? before.unit,
        unitPrice: input.unitPrice ?? before.unitPrice,
        taxRate: input.taxRate ?? before.taxRate,
        active: input.active ?? before.active,
      },
    });
    await writeAudit(
      {
        actorUserId: actor.id,
        actorRole: actor.role,
        requestId: ctx.requestId,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent ?? null,
        resourceType: 'product',
        resourceId: id,
        action: 'update',
        beforeJson: toJson(before),
        afterJson: toJson(after),
      },
      tx,
    );
    return after;
  });
}

export async function deleteProduct(id: string, actor: Actor, ctx: AuditCtx = {}) {
  return prisma.$transaction(async (tx: Tx) => {
    const before = await tx.product.findUnique({ where: { id } });
    if (!before) throw notFound();
    const after = await tx.product.update({ where: { id }, data: { active: false } });
    await writeAudit(
      {
        actorUserId: actor.id,
        actorRole: actor.role,
        requestId: ctx.requestId,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent ?? null,
        resourceType: 'product',
        resourceId: id,
        action: 'delete',
        beforeJson: toJson(before),
        afterJson: toJson(after),
      },
      tx,
    );
    return after;
  });
}

export async function getProduct(id: string) {
  const row = await prisma.product.findUnique({ where: { id } });
  if (!row) throw notFound();
  return row;
}

export async function listProducts(query: {
  q?: string;
  active?: boolean;
  page: number;
  pageSize: number;
}) {
  const where: Record<string, unknown> = {};
  if (query.active !== undefined) where.active = query.active;
  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: 'insensitive' } },
      { code: { contains: query.q, mode: 'insensitive' } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: [{ name: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.product.count({ where }),
  ]);
  return { items, total };
}

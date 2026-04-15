import { prisma, type JsonLike, type Tx } from '../../db/prisma';
import { notFound } from '../../lib/errors';
import { newId } from '../../lib/ids';
import { writeAudit } from '../audit/audit';
import type { CustomerCreateInput, CustomerUpdateInput } from './customers.schema';

type Actor = { id: string; role: string };
type AuditCtx = { requestId?: string; ipAddress?: string; userAgent?: string | null };

function toJson(row: unknown): JsonLike {
  return JSON.parse(JSON.stringify(row)) as JsonLike;
}

export async function createCustomer(
  input: CustomerCreateInput,
  actor: Actor,
  ctx: AuditCtx = {},
) {
  return prisma.$transaction(async (tx: Tx) => {
    const row = await tx.customer.create({
      data: {
        id: newId('cus'),
        code: input.code,
        name: input.name,
        contactName: input.contactName ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        postalCode: input.postalCode ?? null,
        address: input.address ?? null,
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
        resourceType: 'customer',
        resourceId: row.id,
        action: 'create',
        afterJson: toJson(row),
      },
      tx,
    );
    return row;
  });
}

export async function updateCustomer(
  id: string,
  input: CustomerUpdateInput,
  actor: Actor,
  ctx: AuditCtx = {},
) {
  return prisma.$transaction(async (tx: Tx) => {
    const before = await tx.customer.findUnique({ where: { id } });
    if (!before) throw notFound();
    const after = await tx.customer.update({
      where: { id },
      data: {
        code: input.code ?? before.code,
        name: input.name ?? before.name,
        contactName: input.contactName ?? before.contactName,
        email: input.email ?? before.email,
        phone: input.phone ?? before.phone,
        postalCode: input.postalCode ?? before.postalCode,
        address: input.address ?? before.address,
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
        resourceType: 'customer',
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

export async function deleteCustomer(id: string, actor: Actor, ctx: AuditCtx = {}) {
  return prisma.$transaction(async (tx: Tx) => {
    const before = await tx.customer.findUnique({ where: { id } });
    if (!before) throw notFound();
    const after = await tx.customer.update({
      where: { id },
      data: { active: false },
    });
    await writeAudit(
      {
        actorUserId: actor.id,
        actorRole: actor.role,
        requestId: ctx.requestId,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent ?? null,
        resourceType: 'customer',
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

export async function getCustomer(id: string) {
  const row = await prisma.customer.findUnique({ where: { id } });
  if (!row) throw notFound();
  return row;
}

export async function listCustomers(query: {
  q?: string;
  active?: boolean;
  page: number;
  pageSize: number;
}) {
  // where 句は Prisma の型に合わせるが、Prisma 生成前でも通るよう広めの型にする。
  const where: Record<string, unknown> = {};
  if (query.active !== undefined) where.active = query.active;
  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: 'insensitive' } },
      { code: { contains: query.q, mode: 'insensitive' } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: [{ name: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.customer.count({ where }),
  ]);
  return { items, total };
}

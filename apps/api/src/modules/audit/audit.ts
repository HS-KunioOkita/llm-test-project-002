import { prisma as defaultPrisma, type JsonLike, type Tx } from '../../db/prisma';
import { newId } from '../../lib/ids';

// 監査ログ書込の共通ヘルパ。
// サービス層は原則このヘルパを通して audit_logs に行を追加する。
// トランザクション内で書きたい場合は tx を渡す。
export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'approve'
  | 'cancel'
  | 'ship'
  | 'import'
  | 'login'
  | 'logout';

export type AuditInput = {
  actorUserId: string | null;
  actorRole: string | null;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  resourceType: string;
  resourceId: string | null;
  action: AuditAction;
  beforeJson?: JsonLike | null;
  afterJson?: JsonLike | null;
  metadata?: JsonLike | null;
};

export async function writeAudit(
  input: AuditInput,
  tx: Tx = defaultPrisma,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      id: newId('log'),
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      requestId: input.requestId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      action: input.action,
      beforeJson: input.beforeJson ?? undefined,
      afterJson: input.afterJson ?? undefined,
      metadata: input.metadata ?? undefined,
    },
  });
}

import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { ApiError } from '../lib/errors';

export function errorHandler(
  err: FastifyError | Error,
  _req: FastifyRequest,
  reply: FastifyReply,
): void {
  if (err instanceof ApiError) {
    reply.code(err.statusCode).send({
      error: { code: err.code, message: err.message, details: err.details ?? undefined },
    });
    return;
  }
  if (err instanceof ZodError) {
    reply.code(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: '入力値が不正です',
        details: {
          fields: err.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        },
      },
    });
    return;
  }
  // Prisma 既知エラーの一部を変換 (本格ハンドリングは後続課題)
  const anyErr = err as { code?: string; message?: string };
  if (anyErr.code === 'P2002') {
    reply.code(409).send({
      error: { code: 'CONFLICT', message: '一意制約違反です' },
    });
    return;
  }
  if (anyErr.code === 'P2025') {
    reply.code(404).send({
      error: { code: 'NOT_FOUND', message: '対象が見つかりません' },
    });
    return;
  }

  reply.code(500).send({
    error: { code: 'INTERNAL_ERROR', message: '内部エラーが発生しました' },
  });
}

import type { FastifyReply, FastifyRequest } from 'fastify';
import { findSessionUser, type SessionUser } from '../modules/auth/session-store';
import { forbidden, unauthenticated } from '../lib/errors';
import { hasPermission, type Action, type Resource } from '../modules/auth/roles';

export const SESSION_COOKIE = 'sid';

declare module 'fastify' {
  interface FastifyRequest {
    currentUser?: SessionUser;
  }
}

export async function requireAuth(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const raw = req.cookies[SESSION_COOKIE];
  if (!raw) throw unauthenticated();
  const unsigned = req.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) throw unauthenticated();
  const user = await findSessionUser(unsigned.value);
  if (!user) throw unauthenticated();
  req.currentUser = user;
}

export function requirePermission(resource: Resource, action: Action) {
  return async function (req: FastifyRequest, _reply: FastifyReply): Promise<void> {
    // 前段の requireAuth が動いている前提
    if (!req.currentUser) throw unauthenticated();
    if (!hasPermission(req.currentUser.role, resource, action)) {
      throw forbidden();
    }
  };
}

import { randomBytes } from 'crypto';
import { prisma } from '../../db/prisma';
import type { Role } from './roles';
import { isRole } from './roles';

export interface SessionUser {
  id: string;
  loginId: string;
  displayName: string;
  role: Role;
}

export async function createSession(userId: string, ttlSeconds: number): Promise<string> {
  const id = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  await prisma.session.create({ data: { id, userId, expiresAt } });
  return id;
}

export async function findSessionUser(sessionId: string): Promise<SessionUser | null> {
  const s = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });
  if (!s || s.expiresAt.getTime() <= Date.now()) return null;
  if (!s.user.active) return null;
  if (!isRole(s.user.role)) return null;
  return {
    id: s.user.id,
    loginId: s.user.loginId,
    displayName: s.user.displayName,
    role: s.user.role,
  };
}

export async function destroySession(sessionId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id: sessionId } });
}

export async function purgeExpiredSessions(): Promise<number> {
  const r = await prisma.session.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  return r.count;
}

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { login, logout } from './auth.service';
import { SESSION_COOKIE, requireAuth } from '../../middlewares/auth';
import { writeAudit } from '../audit/audit';

const LoginBody = z.object({
  loginId: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/login', async (req, reply) => {
    const body = LoginBody.parse(req.body);
    const { sessionId, user } = await login({
      loginId: body.loginId,
      password: body.password,
      ipAddress: req.ip,
      ttlSeconds: app.config.SESSION_TTL_SECONDS,
    });
    reply.setCookie(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: app.config.NODE_ENV === 'production',
      path: '/',
      maxAge: app.config.SESSION_TTL_SECONDS,
      signed: true,
    });
    await writeAudit({
      actorUserId: user.id,
      actorRole: user.role,
      requestId: req.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
      resourceType: 'auth',
      resourceId: user.id,
      action: 'login',
    });
    return reply.code(200).send({ user });
  });

  app.post('/api/auth/logout', { preHandler: requireAuth }, async (req, reply) => {
    const raw = req.cookies[SESSION_COOKIE];
    if (raw) {
      const unsigned = req.unsignCookie(raw);
      if (unsigned.valid && unsigned.value) await logout(unsigned.value);
    }
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    await writeAudit({
      actorUserId: req.currentUser?.id ?? null,
      actorRole: req.currentUser?.role ?? null,
      requestId: req.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
      resourceType: 'auth',
      resourceId: req.currentUser?.id ?? null,
      action: 'logout',
    });
    return reply.code(204).send();
  });

  app.get('/api/auth/me', { preHandler: requireAuth }, async (req) => {
    return { user: req.currentUser };
  });
}

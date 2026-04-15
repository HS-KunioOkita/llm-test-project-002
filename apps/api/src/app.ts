import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { loadEnv, type AppEnv } from './config/env';
import { errorHandler } from './middlewares/errorHandler';
import { authRoutes } from './modules/auth/auth.routes';
import { customerRoutes } from './modules/customers/customers.routes';
import { productRoutes } from './modules/products/products.routes';
import { orderRoutes } from './modules/orders/orders.routes';
import { prisma } from './db/prisma';

declare module 'fastify' {
  interface FastifyInstance {
    config: AppEnv;
  }
}

export async function buildApp(envOverride?: Partial<NodeJS.ProcessEnv>): Promise<FastifyInstance> {
  const env = loadEnv({ ...process.env, ...envOverride });

  const app = Fastify({
    logger:
      env.NODE_ENV === 'development'
        ? { transport: { target: 'pino-pretty' } }
        : { level: env.NODE_ENV === 'test' ? 'silent' : 'info' },
    disableRequestLogging: env.NODE_ENV === 'test',
    genReqId: () => `req_${cryptoRandom()}`,
  });

  app.decorate('config', env);

  await app.register(cookie, {
    secret: env.COOKIE_SECRET,
    parseOptions: {},
  });

  // ヘルスチェック (認証不要)
  app.get('/healthz', async () => ({ status: 'ok' }));
  app.get('/readyz', async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch {
      return reply.code(503).send({ status: 'error' });
    }
  });

  await app.register(authRoutes);
  await app.register(customerRoutes);
  await app.register(productRoutes);
  await app.register(orderRoutes);

  app.setErrorHandler(errorHandler);

  return app;
}

function cryptoRandom(): string {
  // request id 用の軽量ランダム文字列
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

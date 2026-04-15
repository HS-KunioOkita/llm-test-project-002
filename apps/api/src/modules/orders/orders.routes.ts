import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { OrderCreate, OrderListQuery } from './orders.schema';
import { approveOrder, createOrder, getOrder, listOrders } from './orders.service';
import { requireAuth, requirePermission } from '../../middlewares/auth';
import { pageResponse } from '../../lib/pagination';
import type { Role } from './orders.state';

const IdParam = z.object({ id: z.string().min(1) });

export async function orderRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.get('/api/orders', { preHandler: requirePermission('orders', 'read') }, async (req) => {
    const q = OrderListQuery.parse(req.query);
    const { items, total } = await listOrders(q);
    return pageResponse(items, total, { page: q.page, pageSize: q.pageSize });
  });

  app.get('/api/orders/:id', { preHandler: requirePermission('orders', 'read') }, async (req) => {
    const { id } = IdParam.parse(req.params);
    return getOrder(id);
  });

  app.post(
    '/api/orders',
    { preHandler: requirePermission('orders', 'write') },
    async (req, reply) => {
      const body = OrderCreate.parse(req.body);
      const user = req.currentUser!;
      const row = await createOrder(
        body,
        { id: user.id, role: user.role as Role },
        {
          requestId: req.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'] ?? null,
        },
      );
      reply.code(201);
      return row;
    },
  );

  app.post(
    '/api/orders/:id/approve',
    { preHandler: requirePermission('orders', 'approve') },
    async (req) => {
      const { id } = IdParam.parse(req.params);
      const user = req.currentUser!;
      return approveOrder(
        id,
        { id: user.id, role: user.role as Role },
        {
          requestId: req.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'] ?? null,
        },
      );
    },
  );
}

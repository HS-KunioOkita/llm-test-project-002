import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  CustomerCreate,
  CustomerListQuery,
  CustomerUpdate,
} from './customers.schema';
import {
  createCustomer,
  deleteCustomer,
  getCustomer,
  listCustomers,
  updateCustomer,
} from './customers.service';
import { requireAuth, requirePermission } from '../../middlewares/auth';
import { pageResponse } from '../../lib/pagination';

const IdParam = z.object({ id: z.string().min(1) });

export async function customerRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.get('/api/customers', { preHandler: requirePermission('customers', 'read') }, async (req) => {
    const q = CustomerListQuery.parse(req.query);
    const { items, total } = await listCustomers(q);
    return pageResponse(items, total, { page: q.page, pageSize: q.pageSize });
  });

  app.get(
    '/api/customers/:id',
    { preHandler: requirePermission('customers', 'read') },
    async (req) => {
      const { id } = IdParam.parse(req.params);
      return getCustomer(id);
    },
  );

  app.post(
    '/api/customers',
    { preHandler: requirePermission('customers', 'write') },
    async (req, reply) => {
      const body = CustomerCreate.parse(req.body);
      const row = await createCustomer(body, req.currentUser!, {
        requestId: req.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
      });
      reply.code(201);
      return row;
    },
  );

  app.patch(
    '/api/customers/:id',
    { preHandler: requirePermission('customers', 'write') },
    async (req) => {
      const { id } = IdParam.parse(req.params);
      const body = CustomerUpdate.parse(req.body);
      return updateCustomer(id, body, req.currentUser!, {
        requestId: req.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
      });
    },
  );

  app.delete(
    '/api/customers/:id',
    { preHandler: requirePermission('customers', 'delete') },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      await deleteCustomer(id, req.currentUser!, {
        requestId: req.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
      });
      reply.code(204).send();
    },
  );
}

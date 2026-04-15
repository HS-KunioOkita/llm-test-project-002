import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ProductCreate, ProductListQuery, ProductUpdate } from './products.schema';
import {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  updateProduct,
} from './products.service';
import { requireAuth, requirePermission } from '../../middlewares/auth';
import { pageResponse } from '../../lib/pagination';

const IdParam = z.object({ id: z.string().min(1) });

export async function productRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.get('/api/products', { preHandler: requirePermission('products', 'read') }, async (req) => {
    const q = ProductListQuery.parse(req.query);
    const { items, total } = await listProducts(q);
    return pageResponse(items, total, { page: q.page, pageSize: q.pageSize });
  });

  app.get(
    '/api/products/:id',
    { preHandler: requirePermission('products', 'read') },
    async (req) => {
      const { id } = IdParam.parse(req.params);
      return getProduct(id);
    },
  );

  app.post(
    '/api/products',
    { preHandler: requirePermission('products', 'write') },
    async (req, reply) => {
      const body = ProductCreate.parse(req.body);
      const row = await createProduct(body, req.currentUser!, {
        requestId: req.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
      });
      reply.code(201);
      return row;
    },
  );

  app.patch(
    '/api/products/:id',
    { preHandler: requirePermission('products', 'write') },
    async (req) => {
      const { id } = IdParam.parse(req.params);
      const body = ProductUpdate.parse(req.body);
      return updateProduct(id, body, req.currentUser!, {
        requestId: req.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
      });
    },
  );

  app.delete(
    '/api/products/:id',
    { preHandler: requirePermission('products', 'delete') },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      await deleteProduct(id, req.currentUser!, {
        requestId: req.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
      });
      reply.code(204).send();
    },
  );
}

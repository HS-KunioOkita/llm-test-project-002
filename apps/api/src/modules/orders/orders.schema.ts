import { z } from 'zod';

export const OrderLineInput = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().int().min(0).optional(),
  taxRate: z.number().min(0).max(0.999).optional(),
});

export const OrderCreate = z.object({
  customerId: z.string().min(1),
  orderedAt: z.string().datetime({ offset: true }).optional(),
  note: z.string().max(2000).optional(),
  items: z.array(OrderLineInput).min(1).max(200),
});

export const OrderListQuery = z.object({
  q: z.string().optional(),
  status: z.enum(['draft', 'approved', 'cancelled']).optional(),
  shipmentStatus: z.enum(['pending', 'shipped', 'cancelled']).optional(),
  customerId: z.string().optional(),
  assigneeId: z.string().optional(),
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export type OrderCreateInput = z.infer<typeof OrderCreate>;

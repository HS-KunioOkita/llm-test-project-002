import { z } from 'zod';

export const ProductCreate = z.object({
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(256),
  unit: z.string().min(1).max(16),
  unitPrice: z.number().int().min(0),
  taxRate: z.number().min(0).max(0.999).optional(),
  active: z.boolean().optional(),
});

export const ProductUpdate = ProductCreate.partial();

export const ProductListQuery = z.object({
  q: z.string().optional(),
  active: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export type ProductCreateInput = z.infer<typeof ProductCreate>;
export type ProductUpdateInput = z.infer<typeof ProductUpdate>;

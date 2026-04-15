import { z } from 'zod';

export const CustomerCreate = z.object({
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(256),
  contactName: z.string().max(128).optional(),
  email: z.string().email().max(256).optional(),
  phone: z.string().max(32).optional(),
  postalCode: z.string().max(16).optional(),
  address: z.string().max(512).optional(),
  active: z.boolean().optional(),
});

export const CustomerUpdate = CustomerCreate.partial();

export const CustomerListQuery = z.object({
  q: z.string().optional(),
  active: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export type CustomerCreateInput = z.infer<typeof CustomerCreate>;
export type CustomerUpdateInput = z.infer<typeof CustomerUpdate>;

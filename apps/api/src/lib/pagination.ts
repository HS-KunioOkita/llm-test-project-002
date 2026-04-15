import { z } from 'zod';

export const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export type Pagination = z.infer<typeof PaginationQuery>;

export function buildSkipTake(p: Pagination): { skip: number; take: number } {
  return { skip: (p.page - 1) * p.pageSize, take: p.pageSize };
}

export type Paged<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};

export function pageResponse<T>(items: T[], total: number, p: Pagination): Paged<T> {
  return { items, total, page: p.page, pageSize: p.pageSize };
}

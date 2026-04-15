import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  global.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}

// Prisma のトランザクションクライアント型。`Prisma` 名前空間型は `prisma generate`
// 実施環境でのみ正しく解決されるため、MVP ではアプリ側で最小限の型で受ける。
// 実運用では `Prisma.TransactionClient` に置き換えてよい。
export type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

// 監査ログなどに渡す JSON。Prisma.InputJsonValue が使えない環境向けの代替。
export type JsonLike =
  | string
  | number
  | boolean
  | null
  | JsonLike[]
  | { [k: string]: JsonLike };

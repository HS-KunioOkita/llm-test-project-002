import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url().or(z.string().startsWith('postgres')),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  COOKIE_SECRET: z.string().min(32, 'COOKIE_SECRET は 32 文字以上必須'),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(8 * 60 * 60),
});

export type AppEnv = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const fmt = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`環境変数の読み込みに失敗しました:\n${fmt}`);
  }
  return parsed.data;
}

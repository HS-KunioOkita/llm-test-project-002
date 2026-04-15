import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env';

describe('config.loadEnv', () => {
  it('有効な値で読み込める', () => {
    const env = loadEnv({
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      COOKIE_SECRET: 'x'.repeat(32),
      PORT: '4000',
      NODE_ENV: 'test',
    } as NodeJS.ProcessEnv);
    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('test');
    expect(env.SESSION_TTL_SECONDS).toBe(8 * 60 * 60);
  });

  it('COOKIE_SECRET が短いと例外', () => {
    expect(() =>
      loadEnv({
        DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
        COOKIE_SECRET: 'short',
      } as NodeJS.ProcessEnv),
    ).toThrow();
  });

  it('DATABASE_URL 未指定で例外', () => {
    expect(() =>
      loadEnv({ COOKIE_SECRET: 'x'.repeat(32) } as NodeJS.ProcessEnv),
    ).toThrow();
  });
});

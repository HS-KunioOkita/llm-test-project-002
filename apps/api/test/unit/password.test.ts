import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/modules/auth/password';

describe('auth.password', () => {
  it('正しいパスワードを検証できる', async () => {
    const h = await hashPassword('abcdef123!');
    expect(h).not.toEqual('abcdef123!');
    expect(await verifyPassword('abcdef123!', h)).toBe(true);
  });

  it('異なるパスワードは弾く', async () => {
    const h = await hashPassword('abcdef123!');
    expect(await verifyPassword('wrong', h)).toBe(false);
  });

  it('毎回ハッシュ値は異なる (ソルト確認)', async () => {
    const h1 = await hashPassword('same');
    const h2 = await hashPassword('same');
    expect(h1).not.toEqual(h2);
  });
});

import bcrypt from 'bcryptjs';

// 設計書は argon2id を指定しているが、ネイティブビルドが不要な
// bcryptjs を MVP では採用 (docs/decisions.md 参照)。
const COST = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

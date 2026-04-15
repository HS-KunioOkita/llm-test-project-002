import { prisma } from '../../db/prisma';
import { ApiError, unauthenticated } from '../../lib/errors';
import { newId } from '../../lib/ids';
import { verifyPassword } from './password';
import { createSession, destroySession, type SessionUser } from './session-store';
import { isRole, type Role } from './roles';

// ログイン失敗ロック閾値
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export async function login(input: {
  loginId: string;
  password: string;
  ipAddress?: string;
  ttlSeconds: number;
}): Promise<{ sessionId: string; user: SessionUser }> {
  const user = await prisma.user.findUnique({ where: { loginId: input.loginId } });

  // ログイン試行ログは成否問わず必ず記録
  await prisma.loginAttempt.create({
    data: {
      id: newId('att'),
      loginId: input.loginId,
      ipAddress: input.ipAddress ?? null,
      success: false, // 後段で上書き相当の判断
    },
  });

  if (!user || !user.active) throw unauthenticated('ログインIDまたはパスワードが不正です');

  // ロック中判定
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    throw new ApiError('ACCOUNT_LOCKED', 'アカウントは一時ロック中です');
  }

  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) {
    const nextFailed = user.failedLoginCount + 1;
    const shouldLock = nextFailed >= MAX_FAILED;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: nextFailed,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000) : null,
      },
    });
    if (shouldLock) throw new ApiError('ACCOUNT_LOCKED', 'アカウントがロックされました');
    throw unauthenticated('ログインIDまたはパスワードが不正です');
  }

  if (!isRole(user.role)) {
    throw unauthenticated('ロール設定が不正です');
  }
  const role: Role = user.role;

  // ログイン成功: カウンタリセット、last_login_at 更新、成功フラグでログ書き換え
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  await prisma.loginAttempt.create({
    data: {
      id: newId('att'),
      loginId: input.loginId,
      ipAddress: input.ipAddress ?? null,
      success: true,
    },
  });

  const sessionId = await createSession(user.id, input.ttlSeconds);

  return {
    sessionId,
    user: {
      id: user.id,
      loginId: user.loginId,
      displayName: user.displayName,
      role,
    },
  };
}

export async function logout(sessionId: string): Promise<void> {
  await destroySession(sessionId);
}

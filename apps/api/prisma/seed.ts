import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/modules/auth/password';
import { newId } from '../src/lib/ids';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const passwordHash = await hashPassword('P@ssw0rd!');

  const users = [
    { loginId: 'admin', displayName: '管理者', role: 'admin' },
    { loginId: 'orderer', displayName: '受注担当', role: 'orderer' },
    { loginId: 'sales', displayName: '営業担当', role: 'sales' },
    { loginId: 'viewer', displayName: '閲覧', role: 'viewer' },
  ] as const;

  for (const u of users) {
    await prisma.user.upsert({
      where: { loginId: u.loginId },
      update: { displayName: u.displayName, role: u.role, passwordHash, active: true },
      create: {
        id: newId('u'),
        loginId: u.loginId,
        displayName: u.displayName,
        role: u.role,
        passwordHash,
        active: true,
      },
    });
  }

  const customer = await prisma.customer.upsert({
    where: { code: 'C0001' },
    update: {},
    create: {
      id: newId('cus'),
      code: 'C0001',
      name: '株式会社サンプル',
      contactName: '鈴木 一郎',
      email: 'suzuki@example.co.jp',
      active: true,
    },
  });

  await prisma.product.upsert({
    where: { code: 'SKU-001' },
    update: {},
    create: {
      id: newId('prd'),
      code: 'SKU-001',
      name: 'A4 コピー用紙 500 枚',
      unit: '箱',
      unitPrice: 1800,
      taxRate: 0.1,
      active: true,
    },
  });

  // eslint-disable-next-line no-console
  console.log(`seed done. sample customer id=${customer.id}`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcrypt';
import { env } from '@config/env';
import { createContextLogger } from '@config/logger';

const prisma = new PrismaClient();
const log = createContextLogger('SeedAdmin');

const main = async (): Promise<void> => {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set before running admin:seed');
  }

  const adminEmail = env.ADMIN_EMAIL.toLowerCase();
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (existingAdmin) {
    log.info({ adminEmail }, 'Administrator already exists');
    return;
  }

  const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, env.BCRYPT_SALT_ROUNDS);
  await prisma.user.create({
    data: {
      email: adminEmail,
      passwordHash,
      role: Role.ADMIN,
      verificationStatus: 'APPROVED',
      isEmailVerified: true,
      isActive: true,
    },
  });

  log.info({ adminEmail }, 'Administrator created');
};

main()
  .catch((error: unknown) => {
    log.error({ error }, 'Unable to seed administrator');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

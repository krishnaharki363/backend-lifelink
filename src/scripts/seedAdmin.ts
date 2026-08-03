import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = 'admin@lifelink.app';
  const plainPassword = 'AdminSecurePass123!';

  // Check if admin already exists
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (existingAdmin) {
    console.log(`Admin user already exists with email: ${adminEmail}`);
    return;
  }

  // Hash the password
  const saltRounds = 12;
  const passwordHash = await bcrypt.hash(plainPassword, saltRounds);

  // Create the admin user
  await prisma.user.create({
    data: {
      email: adminEmail,
      passwordHash,
      role: Role.ADMIN,
      isEmailVerified: true,
      isActive: true,
    },
  });

  console.log('--------------------------------------------------');
  console.log('Successfully seeded administrator account.');
  console.log(`Email:    ${adminEmail}`);
  console.log(`Password: ${plainPassword}`);
  console.log('--------------------------------------------------');
}

main()
  .catch((e: unknown) => {
    console.error('Error seeding admin user:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

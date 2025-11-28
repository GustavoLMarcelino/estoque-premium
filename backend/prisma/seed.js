import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function run() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@estoquepremium.com';
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';

  const exists = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!exists) {
    const hash = await bcrypt.hash(adminPass, 10);
    await prisma.user.create({
      data: {
        name: 'Admin',
        email: adminEmail,
        password: hash,
        role: 'admin',
      },
    });
    console.log(`Usuário admin criado: ${adminEmail}`);
  } else {
    console.log('Admin já existe, seed ignorado.');
  }
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

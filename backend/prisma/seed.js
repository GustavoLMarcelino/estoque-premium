import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function run() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@estoquepremium.com';
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';

  // Marcas iniciais (idempotente — upsert por nome)
  for (const nome of ['Acdelco', 'Moura']) {
    await prisma.marca.upsert({ where: { nome }, update: {}, create: { nome } });
  }
  console.log('Marcas iniciais garantidas: Acdelco, Moura');

  // Classes de som iniciais (idempotente por nome). Mesmos valores da produção.
  // 'Isento' (0) cobre produtos de som sem mão de obra. Não sobrescreve o valor
  // se a classe já existir (o lojista pode ter ajustado).
  const classesSom = [
    ['Mídia', 150], ['Câmera', 100], ['Autofalante', 60], ['Sensor de ré', 150],
    ['Alarme', 200], ['Anti-furto', 80], ['Vidro', 50], ['Rádio', 50],
    ['Trava 2 portas', 150], ['Trava 4 portas', 200], ['Isento', 0],
  ];
  for (const [nome, valor_mao_obra] of classesSom) {
    await prisma.classe_som.upsert({ where: { nome }, update: {}, create: { nome, valor_mao_obra } });
  }
  console.log(`Classes de som garantidas: ${classesSom.length}`);

  const exists = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!exists) {
    const hash = await bcrypt.hash(adminPass, 12);
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

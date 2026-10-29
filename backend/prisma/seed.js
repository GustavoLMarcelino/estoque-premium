import 'dotenv/config';
import bcrypt from 'bcryptjs';

// Mesma decisão de client-sqlite × client-mysql de src/config/prisma.js —
// ver o comentário lá e docs/ARQUITETURA.md#dual-schema-sqlite-e-mysql.
const { PrismaClient } = process.env.NODE_ENV === 'production'
  ? await import('../../node_modules/.prisma/client-mysql/index.js')
  : await import('../../node_modules/.prisma/client-sqlite/index.js');

const prisma = new PrismaClient();

async function run() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@estoquepremium.com';
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';

  // Marcas iniciais (idempotente — upsert por nome)
  for (const nome of ['Acdelco', 'Moura']) {
    await prisma.marca.upsert({ where: { nome }, update: {}, create: { nome } });
  }
  console.log('Marcas iniciais garantidas: Acdelco, Moura');

  // Config de comissão (singleton): cria com padrões se ainda não existir.
  // Não sobrescreve valores já ajustados pela gestão.
  const cfg = await prisma.comissao_config.findFirst();
  if (!cfg) {
    await prisma.comissao_config.create({ data: { valor_bateria: 15, percentual_mao_obra: 30 } });
    console.log('Config de comissão criada: R$15/bateria, 30% mão de obra');
  } else {
    console.log('Config de comissão já existe, mantida.');
  }

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

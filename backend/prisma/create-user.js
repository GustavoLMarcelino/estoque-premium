import 'dotenv/config';
import bcrypt from 'bcryptjs';

// Mesma decisão de client-sqlite × client-mysql de src/config/prisma.js —
// ver o comentário lá e docs/ARQUITETURA.md#dual-schema-sqlite-e-mysql.
const { PrismaClient } = process.env.NODE_ENV === 'production'
  ? await import('../../node_modules/.prisma/client-mysql/index.js')
  : await import('../../node_modules/.prisma/client-sqlite/index.js');

const prisma = new PrismaClient();

async function main() {
  const [, , rawName, rawEmail, rawPassword, rawRole] = process.argv;
  if (!rawName || !rawEmail || !rawPassword) {
    console.error('Uso: node prisma/create-user.js "Nome" "email@dominio.com" "senha" [role]');
    process.exit(1);
  }

  const name = String(rawName).trim();
  const email = String(rawEmail).toLowerCase().trim();
  const password = String(rawPassword);
  const role = rawRole ? String(rawRole).trim() : 'user';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.error('E-mail já cadastrado, nenhum usuário criado.');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name, email, password: hash, role },
  });

  console.log(`Usuário criado: id=${user.id}, email=${user.email}, role=${user.role}`);
}

main()
  .catch((err) => {
    console.error('Erro ao criar usuário:', err.message || err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

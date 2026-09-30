// Produção usa o client MySQL (schema.mysql.prisma); dev e teste usam o
// SQLite (schema.prisma). Os dois têm `output` PRÓPRIO agora (ver o
// comentário em schema.prisma) — importar pelo caminho certo, e não do
// `@prisma/client` genérico, é o que garante que o ambiente errado nunca
// conecta no banco errado, não importa qual dos dois foi gerado por último
// numa máquina de dev. Mesma variável que já decide o resto deste arquivo.
//
// Caminho RELATIVO, e não o especificador "bare" (`.prisma/client-sqlite`):
// o resolvedor do Vite/Vitest não sobe por node_modules do mesmo jeito que o
// Node puro, e falhava em achar o client nos testes. Relativo funciona igual
// nos dois.
const { PrismaClient } = process.env.NODE_ENV === 'production'
  ? await import('../../../node_modules/.prisma/client-mysql/index.js')
  : await import('../../../node_modules/.prisma/client-sqlite/index.js');

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

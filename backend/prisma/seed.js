import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  await prisma.produto.createMany({
    data: [
      { codigo: 'BAT60', descricao: 'Bateria 60Ah', qtdMinima: 2, estoqueAtual: 10 },
      { codigo: 'BAT70', descricao: 'Bateria 70Ah', qtdMinima: 2, estoqueAtual: 5 }
    ],
    skipDuplicates: true
  });
}
run().finally(() => prisma.$disconnect());

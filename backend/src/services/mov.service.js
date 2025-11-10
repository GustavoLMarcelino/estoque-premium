import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/**
 * body esperado:
 *  { produto_id, tipo: 'ENTRADA' | 'SAIDA', quantidade, valor_final?, data_movimentacao? }
 */
export async function registrarMovimentacao(body) {
  const { produto_id, tipo, quantidade, valor_final, data_movimentacao } = body;

  if (!produto_id || !tipo || !quantidade || Number(quantidade) <= 0) {
    const e = new Error('produto_id, tipo e quantidade (>0) são obrigatórios.'); e.status = 400; throw e;
  }
  const isEntrada = String(tipo).toUpperCase() === 'ENTRADA';
  const isSaida   = String(tipo).toUpperCase() === 'SAIDA';
  if (!isEntrada && !isSaida) { const e = new Error('tipo deve ser ENTRADA ou SAIDA'); e.status = 400; throw e; }

  return prisma.$transaction(async (tx) => {
    const prod = await tx.estoque.findUnique({ where: { id: Number(produto_id) } });
    if (!prod) { const e = new Error('Produto não encontrado'); e.status = 404; throw e; }

    let entradas = prod.entradas ?? 0;
    let saidas   = prod.saidas   ?? 0;
    let emEstoque= prod.em_estoque ?? 0;

    if (isEntrada) {
      entradas += Number(quantidade);
      emEstoque += Number(quantidade);
    } else {
      if (emEstoque < Number(quantidade)) {
        const e = new Error('Estoque insuficiente para SAÍDA'); e.status = 409; throw e;
      }
      saidas += Number(quantidade);
      emEstoque -= Number(quantidade);
    }

    const mov = await tx.movimentacoes.create({
      data: {
        produto_id: Number(produto_id),
        tipo: isEntrada ? 'ENTRADA' : 'SAIDA',
        quantidade: Number(quantidade),
        valor_final, // opcional
        data_movimentacao: data_movimentacao ? new Date(data_movimentacao) : undefined,
      },
    });

    await tx.estoque.update({
      where: { id: Number(produto_id) },
      data: { entradas, saidas, em_estoque: emEstoque },
    });

    return mov;
  });
}

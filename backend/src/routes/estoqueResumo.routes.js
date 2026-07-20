// Custo imobilizado no estoque = Σ (custo × quantidade em estoque), por linha.
//
// A soma é feita AQUI, no servidor: o front recebe só os três totais, nunca o
// custo item a item (que é dado sensível e vive atrás de ver_custo). Por isso
// esta rota não reaproveita /api/estoque — lá o custo é removido por
// sanitizeCusto e a Home não teria como somar.
import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { podeVerCusto, podeVerLinha } from '../utils/permissoes.js';
import { round2 } from '../utils/taxas.js';

export const estoqueResumoRouter = Router();

/** em_estoque atual (coluna gerada no MySQL; em dev pode vir nula).
 *  Piso em 0: saldo negativo é inconsistência de dados e não pode ABATER o
 *  imobilizado — viraria um total menor do que a realidade. */
const emEstoqueDe = (p) => {
  const bruto = p?.em_estoque != null
    ? Number(p.em_estoque)
    : Number(p?.qtd_inicial ?? 0) + Number(p?.entradas ?? 0) - Number(p?.saidas ?? 0);
  return Number.isFinite(bruto) ? Math.max(0, bruto) : 0;
};

/** Soma o custo imobilizado de um estoque. Lê só as colunas necessárias e
 *  agrega em memória — o catálogo da loja é de centenas de linhas, não de
 *  milhões; troca por $queryRaw só se isso mudar de ordem de grandeza. */
async function somaCusto(delegate) {
  const rows = await delegate.findMany({
    select: { custo: true, em_estoque: true, qtd_inicial: true, entradas: true, saidas: true },
  });
  let valor = 0;
  let itens = 0;
  for (const r of rows) {
    const qtd = emEstoqueDe(r);
    valor += Number(r.custo || 0) * qtd;
    itens += qtd;
  }
  return { valor: round2(valor), itens, produtos: rows.length };
}

/** GET /api/estoque-resumo/custo
 *  { data: { total, baterias, som } } — cada um { valor, itens, produtos }.
 *  Linha fora do escopo do usuário vem null e NÃO entra no total. Os três
 *  valores vão juntos: a Home troca de face sem bater na API de novo. */
estoqueResumoRouter.get('/custo', async (req, res, next) => {
  try {
    // Gate server-side: sem ver_custo o número não sai daqui. Esconder só no
    // front deixaria o valor exposto para quem abrisse a resposta da API.
    if (!podeVerCusto(req.user)) {
      return res.status(403).json({ error: true, message: 'Sem permissão para ver custo.' });
    }

    const verBaterias = podeVerLinha(req.user, 'baterias');
    const verSom = podeVerLinha(req.user, 'som');

    const [baterias, som] = await Promise.all([
      verBaterias ? somaCusto(prisma.estoque) : Promise.resolve(null),
      verSom ? somaCusto(prisma.estoque_som) : Promise.resolve(null),
    ]);

    const total = {
      valor: round2((baterias?.valor ?? 0) + (som?.valor ?? 0)),
      itens: (baterias?.itens ?? 0) + (som?.itens ?? 0),
      produtos: (baterias?.produtos ?? 0) + (som?.produtos ?? 0),
    };

    res.json({ data: { total, baterias, som } });
  } catch (e) {
    console.error('GET /api/estoque-resumo/custo ERRO:', e);
    next(e);
  }
});

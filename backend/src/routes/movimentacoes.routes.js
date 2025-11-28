import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const movimentacoesRouter = Router();

/* helpers */
const toInt = (v, def = 0) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
};
const toMoneyStr = (v, def = '0.00') => {
  if (v === null || v === undefined || v === '') return def;
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : def;
};

/** GET /api/movimentacoes?produto_id=&page=&pageSize= */
movimentacoesRouter.get('/', async (req, res, next) => {
  try {
    const produtoId = req.query.produto_id ? Number(req.query.produto_id) : undefined;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize) || 10, 1), 100);

    const where = produtoId ? { produto_id: produtoId } : undefined;

    const [total, data] = await Promise.all([
      prisma.movimentacoes.count({ where }),
      prisma.movimentacoes.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    res.json({ page, pageSize, total, pages: Math.ceil(total / pageSize), data });
  } catch (e) {
    console.error('GET /api/movimentacoes ERRO:', e);
    next(e);
  }
});

/** POST /api/movimentacoes
 * body: { produto_id, tipo: 'entrada'|'saida', quantidade, valor_final? }
 */
movimentacoesRouter.post('/', async (req, res, next) => {
  try {
    const produto_id = Number(req.body?.produto_id);
    const quantidade = toInt(req.body?.quantidade, 0);

    // normaliza tipo vindo do front para o valor exato do ENUM no MySQL
    const tipoRaw = String(req.body?.tipo || '').trim().toLowerCase();
    let tipoDbValue = null;
    if (tipoRaw === 'entrada') tipoDbValue = 'ENTRADA'; // troque para 'entrada' se seu ENUM for minúsculo
    if (tipoRaw === 'saida')   tipoDbValue = 'SAIDA';   // troque para 'saida'   se seu ENUM for minúsculo

    if (!produto_id) return res.status(400).json({ error: true, message: 'produto_id inválido ou ausente.' });
    if (!tipoDbValue) {
      return res.status(400).json({ error: true, message: `tipo inválido. Envie 'entrada' ou 'saida'. Recebido: ${req.body?.tipo}` });
    }
    if (!(quantidade > 0)) return res.status(400).json({ error: true, message: 'quantidade deve ser > 0.' });

    // se vier vazio, use "0.00" (coluna é NOT NULL no seu schema)
    const valor_final = toMoneyStr(req.body?.valor_final, '0.00');

    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const prod = await tx.estoque.findUnique({ where: { id: produto_id } });
      if (!prod) throw new Error('Produto não encontrado');

      const emEstoque = Number(
        prod.em_estoque ??
          (Number(prod.qtd_inicial || 0) + Number(prod.entradas || 0) - Number(prod.saidas || 0))
      );

      if (tipoDbValue === 'SAIDA' && quantidade > emEstoque) {
        throw Object.assign(new Error('Quantidade de saída excede o estoque atual'), { statusCode: 409 });
      }

      // cria movimentação conectando o relacionamento obrigatório
      const mov = await tx.movimentacoes.create({
        data: {
          // ajuste o nome do relation aqui se no schema não for "estoque"
          estoque: { connect: { id: produto_id } },
          tipo: tipoDbValue,            // ENUM ('ENTRADA' | 'SAIDA') ou minúsculo se seu ENUM for minúsculo
          quantidade,
          valor_final,                  // NUNCA nulo (usa "0.00" por padrão)
          data_movimentacao: now,
        },
      });

      // atualiza agregados
      if (tipoDbValue === 'ENTRADA') {
        await tx.estoque.update({
          where: { id: produto_id },
          data: { entradas: (prod.entradas ?? 0) + quantidade },
        });
      } else {
        await tx.estoque.update({
          where: { id: produto_id },
          data: { saidas: (prod.saidas ?? 0) + quantidade },
        });
      }

      return mov;
    });

    res.status(201).json(result);
  } catch (e) {
    const status = e?.statusCode || (e?.code === 'P2003' ? 409 : 500);
    const message = e?.message || 'Erro ao registrar movimentação';
    if (status !== 500) return res.status(status).json({ error: true, message });
    console.error('POST /api/movimentacoes ERRO:', e);
    next(e);
  }
});

/** DELETE /api/movimentacoes/:id
 * Desfaz agregados e remove a movimentação.
 */
movimentacoesRouter.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await prisma.$transaction(async (tx) => {
      const mov = await tx.movimentacoes.findUnique({ where: { id } });
      if (!mov) return;

      const prod = await tx.estoque.findUnique({ where: { id: mov.produto_id } });
      if (!prod) return;

      const tipo = String(mov.tipo).toUpperCase(); // 'ENTRADA' | 'SAIDA'
      if (tipo === 'ENTRADA') {
        await tx.estoque.update({
          where: { id: mov.produto_id },
          data: { entradas: Math.max(0, (prod.entradas ?? 0) - mov.quantidade) },
        });
      } else {
        await tx.estoque.update({
          where: { id: mov.produto_id },
          data: { saidas: Math.max(0, (prod.saidas ?? 0) - mov.quantidade) },
        });
      }

      await tx.movimentacoes.delete({ where: { id } });
    });

    res.status(204).end();
  } catch (e) {
    console.error('DELETE /api/movimentacoes/:id ERRO:', e);
    next(e);
  }
});

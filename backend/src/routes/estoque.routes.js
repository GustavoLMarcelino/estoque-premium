import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const estoqueRouter = Router();

/**
 * GET /api/estoque?q=texto&page=1&pageSize=10
 */
estoqueRouter.get('/', async (req, res, next) => {
  try {
    const q = (req.query.q || '').toString().trim();
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize) || 10, 1), 100);

    const where = q
      ? {
          OR: [
            { produto: { contains: q } },
            { modelo: { contains: q } },
          ],
        }
      : undefined;

    const [total, data] = await Promise.all([
      prisma.estoque.count({ where }),
      prisma.estoque.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    res.json({ page, pageSize, total, pages: Math.ceil(total / pageSize), data });
  } catch (e) { next(e); }
});

/** GET /api/estoque/:id */
estoqueRouter.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const item = await prisma.estoque.findUnique({ where: { id } });
    if (!item) return res.status(404).json({ error: true, message: 'Item não encontrado' });
    res.json(item);
  } catch (e) { next(e); }
});

/** POST /api/estoque
 * body: { produto, modelo, custo?, valor_venda?, percentual_lucro?, qtd_minima?, garantia?, qtd_inicial? }
 */
estoqueRouter.post('/', async (req, res, next) => {
  try {
    const {
      produto, modelo,
      custo, valor_venda, percentual_lucro,
      qtd_minima = 0, garantia = 0, qtd_inicial = 0,
    } = req.body;

    if (!produto || !modelo) {
      return res.status(400).json({ error: true, message: 'produto e modelo são obrigatórios' });
    }

    const novo = await prisma.estoque.create({
      data: {
        produto, modelo,
        custo, valor_venda, percentual_lucro,
        qtd_minima, garantia, qtd_inicial,
        entradas: 0, saidas: 0, em_estoque: Number(qtd_inicial) || 0,
      },
    });
    res.status(201).json(novo);
  } catch (e) { next(e); }
});

/** PUT /api/estoque/:id */
estoqueRouter.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const {
      produto, modelo,
      custo, valor_venda, percentual_lucro,
      qtd_minima, garantia,
    } = req.body;

    const atualizado = await prisma.estoque.update({
      where: { id },
      data: { produto, modelo, custo, valor_venda, percentual_lucro, qtd_minima, garantia },
    });
    res.json(atualizado);
  } catch (e) { next(e); }
});

/** DELETE /api/estoque/:id */
estoqueRouter.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await prisma.estoque.delete({ where: { id } });
    res.status(204).end();
  } catch (e) { next(e); }
});

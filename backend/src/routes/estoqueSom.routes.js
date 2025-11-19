import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const estoqueSomRouter = Router();

/* helpers */
const toInt = (v, def = 0) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
};
const toMoneyStr = (v) => {
  if (v === null || v === undefined || v === '') return '0.00';
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
};
const fmtGarantia = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim().toLowerCase();
  if (s.includes('mes')) return s;
  const n = parseInt(s, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return `${n} meses`;
};

/** GET /api/estoque-som?q=&page=&pageSize= */
estoqueSomRouter.get('/', async (req, res, next) => {
  try {
    const q = (req.query.q || '').toString().trim();
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize) || 10, 1), 100);

    const where = q ? { OR: [{ produto: { contains: q } }, { modelo: { contains: q } }] } : undefined;

    const [total, data] = await Promise.all([
      prisma.estoque_som.count({ where }),
      prisma.estoque_som.findMany({ where, orderBy: { id: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);

    res.json({ page, pageSize, total, pages: Math.ceil(total / pageSize), data });
  } catch (e) {
    console.error('GET /api/estoque-som ERRO:', e);
    next(e);
  }
});

/** GET /api/estoque-som/:id */
estoqueSomRouter.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const item = await prisma.estoque_som.findUnique({ where: { id } });
    if (!item) return res.status(404).json({ error: true, message: 'Item não encontrado' });
    res.json(item);
  } catch (e) {
    console.error('GET /api/estoque-som/:id ERRO:', e);
    next(e);
  }
});

/** POST /api/estoque-som (não enviar em_estoque — coluna gerada) */
estoqueSomRouter.post('/', async (req, res, next) => {
  try {
    const { produto, modelo, custo, valor_venda, percentual_lucro, qtd_minima = 0, garantia = null, qtd_inicial = 0 } = req.body;

    if (!produto || !modelo) {
      return res.status(400).json({ error: true, message: 'produto e modelo são obrigatórios' });
    }

    const data = {
      produto: String(produto).trim(),
      modelo: String(modelo).trim(),
      custo: toMoneyStr(custo),
      valor_venda: toMoneyStr(valor_venda),
      percentual_lucro: percentual_lucro != null ? toMoneyStr(percentual_lucro) : undefined,
      qtd_minima: toInt(qtd_minima, 0),
      garantia: fmtGarantia(garantia),
      qtd_inicial: toInt(qtd_inicial, 0),
      entradas: 0,
      saidas: 0,
    };

    if (Number(data.custo) <= 0 || Number(data.valor_venda) <= 0) {
      return res.status(400).json({ error: true, message: 'custo e valor_venda devem ser > 0' });
    }

    const novo = await prisma.estoque_som.create({ data });
    res.status(201).json(novo);
  } catch (e) {
    console.error('POST /api/estoque-som ERRO:', e);
    next(e);
  }
});

/** PUT /api/estoque-som/:id (não atualizar em_estoque aqui) */
estoqueSomRouter.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { produto, modelo, custo, valor_venda, percentual_lucro, qtd_minima, garantia } = req.body;

    const data = {
      ...(produto != null ? { produto: String(produto).trim() } : {}),
      ...(modelo  != null ? { modelo:  String(modelo).trim() } : {}),
      ...(custo   != null ? { custo:   toMoneyStr(custo) } : {}),
      ...(valor_venda != null ? { valor_venda: toMoneyStr(valor_venda) } : {}),
      ...(percentual_lucro != null ? { percentual_lucro: toMoneyStr(percentual_lucro) } : {}),
      ...(qtd_minima != null ? { qtd_minima: toInt(qtd_minima, 0) } : {}),
      ...(garantia  != null ? { garantia: fmtGarantia(garantia) } : {}),
    };

    const atualizado = await prisma.estoque_som.update({ where: { id }, data });
    res.json(atualizado);
  } catch (e) {
    console.error('PUT /api/estoque-som/:id ERRO:', e);
    next(e);
  }
});

/** DELETE /api/estoque-som/:id (com tratamento de FK) */
estoqueSomRouter.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await prisma.estoque_som.delete({ where: { id } });
    res.status(204).end();
  } catch (e) {
    if (e?.code === 'P2003') {
      // FK constraint
      return res.status(409).json({
        error: true,
        message: 'Não é possível remover: existem movimentações vinculadas a este produto.',
      });
    }
    console.error('DELETE /api/estoque-som/:id ERRO:', e);
    next(e);
  }
});

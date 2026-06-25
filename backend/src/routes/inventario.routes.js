import { Router } from 'express';
import { prisma } from '../config/prisma.js';

export const inventarioRouter = Router();

/* ===== helpers ===== */
const LINHAS = ['BATERIAS', 'SOM'];

/** Normaliza e valida o parâmetro de linha. Retorna null se inválido. */
const parseLinha = (raw) => {
  const s = String(raw || '').trim().toUpperCase();
  return LINHAS.includes(s) ? s : null;
};

/** Delegate do Prisma do estoque correspondente à linha. */
const estoqueDelegate = (linha) =>
  linha === 'SOM' ? prisma.estoque_som : prisma.estoque;

/** em_estoque atual (coluna gerada; em dev pode vir nula). */
const emEstoqueDe = (p) => {
  if (p?.em_estoque !== null && p?.em_estoque !== undefined) return p.em_estoque;
  return Number(p?.qtd_inicial ?? 0) + Number(p?.entradas ?? 0) - Number(p?.saidas ?? 0);
};

const toInt = (v, def = 0) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
};

/** Anexa dados do produto (produto, modelo, em_estoque) a cada item da conferência. */
async function hydrateItens(linha, itens) {
  if (!itens?.length) return [];
  const ids = [...new Set(itens.map((i) => i.produto_id))];
  const produtos = await estoqueDelegate(linha).findMany({
    where: { id: { in: ids } },
    select: { id: true, produto: true, modelo: true, em_estoque: true, qtd_inicial: true, entradas: true, saidas: true },
  });
  const byId = new Map(produtos.map((p) => [p.id, p]));
  return itens.map((it) => {
    const p = byId.get(it.produto_id);
    return {
      id: it.id,
      conferencia_id: it.conferencia_id,
      produto_id: it.produto_id,
      linha: it.linha,
      qtd_sistema: it.qtd_sistema,
      conferido: it.conferido,
      conferido_at: it.conferido_at,
      produto: p?.produto ?? null,
      modelo: p?.modelo ?? null,
      em_estoque: p ? emEstoqueDe(p) : null,
    };
  });
}

/**
 * GET /api/inventario/:linha/ativa
 * Retorna a conferência EM_ANDAMENTO da linha com itens + dados do produto.
 * Se não existir, retorna { data: null }.
 */
inventarioRouter.get('/:linha/ativa', async (req, res, next) => {
  try {
    const linha = parseLinha(req.params.linha);
    if (!linha) return res.status(400).json({ error: true, message: 'Linha inválida (use BATERIAS ou SOM).' });

    const conf = await prisma.conferencia_estoque.findFirst({
      where: { linha, status: 'EM_ANDAMENTO' },
      orderBy: { created_at: 'desc' },
      include: { itens: true },
    });

    if (!conf) return res.json({ data: null });

    const itens = await hydrateItens(linha, conf.itens);
    res.json({ data: { ...conf, itens } });
  } catch (e) {
    console.error('GET /api/inventario/:linha/ativa ERRO:', e);
    next(e);
  }
});

/**
 * POST /api/inventario/:linha/iniciar
 * Cria nova conferência EM_ANDAMENTO com snapshot de todos os produtos da linha.
 * 409 se já houver uma ativa.
 */
inventarioRouter.post('/:linha/iniciar', async (req, res, next) => {
  try {
    const linha = parseLinha(req.params.linha);
    if (!linha) return res.status(400).json({ error: true, message: 'Linha inválida (use BATERIAS ou SOM).' });

    const ativa = await prisma.conferencia_estoque.findFirst({
      where: { linha, status: 'EM_ANDAMENTO' },
    });
    if (ativa) {
      return res.status(409).json({ error: true, message: 'Já existe um inventário em andamento para esta linha.' });
    }

    const produtos = await estoqueDelegate(linha).findMany({
      select: { id: true, produto: true, modelo: true, em_estoque: true, qtd_inicial: true, entradas: true, saidas: true },
      orderBy: { id: 'asc' },
    });

    const conf = await prisma.conferencia_estoque.create({
      data: {
        linha,
        status: 'EM_ANDAMENTO',
        user_id: toInt(req.user?.id, 0),
        created_by: String(req.user?.name || req.user?.email || 'desconhecido').slice(0, 120),
        itens: {
          create: produtos.map((p) => ({
            produto_id: p.id,
            linha,
            qtd_sistema: emEstoqueDe(p),
          })),
        },
      },
      include: { itens: true },
    });

    const itens = await hydrateItens(linha, conf.itens);
    res.status(201).json({ data: { ...conf, itens } });
  } catch (e) {
    console.error('POST /api/inventario/:linha/iniciar ERRO:', e);
    next(e);
  }
});

/**
 * PATCH /api/inventario/item/:itemId/conferir
 * Marca um item como conferido.
 */
inventarioRouter.patch('/item/:itemId/conferir', async (req, res, next) => {
  try {
    const itemId = Number(req.params.itemId);
    if (!Number.isFinite(itemId)) return res.status(400).json({ error: true, message: 'Item inválido.' });

    const item = await prisma.conferencia_item.update({
      where: { id: itemId },
      data: { conferido: true, conferido_at: new Date() },
    });
    res.json({ data: item });
  } catch (e) {
    if (e?.code === 'P2025') return res.status(404).json({ error: true, message: 'Item não encontrado.' });
    console.error('PATCH /api/inventario/item/:itemId/conferir ERRO:', e);
    next(e);
  }
});

/**
 * PATCH /api/inventario/item/:itemId/desconferir
 * Desmarca um item.
 */
inventarioRouter.patch('/item/:itemId/desconferir', async (req, res, next) => {
  try {
    const itemId = Number(req.params.itemId);
    if (!Number.isFinite(itemId)) return res.status(400).json({ error: true, message: 'Item inválido.' });

    const item = await prisma.conferencia_item.update({
      where: { id: itemId },
      data: { conferido: false, conferido_at: null },
    });
    res.json({ data: item });
  } catch (e) {
    if (e?.code === 'P2025') return res.status(404).json({ error: true, message: 'Item não encontrado.' });
    console.error('PATCH /api/inventario/item/:itemId/desconferir ERRO:', e);
    next(e);
  }
});

/**
 * POST /api/inventario/:conferencia_id/finalizar
 * Muda status para FINALIZADA e grava finalizada_at.
 */
inventarioRouter.post('/:conferencia_id/finalizar', async (req, res, next) => {
  try {
    const id = Number(req.params.conferencia_id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: true, message: 'Conferência inválida.' });

    const conf = await prisma.conferencia_estoque.findUnique({ where: { id } });
    if (!conf) return res.status(404).json({ error: true, message: 'Conferência não encontrada.' });
    if (conf.status !== 'EM_ANDAMENTO') {
      return res.status(409).json({ error: true, message: 'Esta conferência não está em andamento.' });
    }

    const atualizada = await prisma.conferencia_estoque.update({
      where: { id },
      data: { status: 'FINALIZADA', finalizada_at: new Date() },
    });
    res.json({ data: atualizada });
  } catch (e) {
    console.error('POST /api/inventario/:conferencia_id/finalizar ERRO:', e);
    next(e);
  }
});

/**
 * DELETE /api/inventario/:conferencia_id/cancelar
 * Deleta a conferência (cascade nos itens). Só EM_ANDAMENTO.
 */
inventarioRouter.delete('/:conferencia_id/cancelar', async (req, res, next) => {
  try {
    const id = Number(req.params.conferencia_id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: true, message: 'Conferência inválida.' });

    const conf = await prisma.conferencia_estoque.findUnique({ where: { id } });
    if (!conf) return res.status(404).json({ error: true, message: 'Conferência não encontrada.' });
    if (conf.status !== 'EM_ANDAMENTO') {
      return res.status(409).json({ error: true, message: 'Só é possível cancelar conferências em andamento.' });
    }

    await prisma.conferencia_estoque.delete({ where: { id } });
    res.status(204).end();
  } catch (e) {
    console.error('DELETE /api/inventario/:conferencia_id/cancelar ERRO:', e);
    next(e);
  }
});

/**
 * GET /api/inventario/:linha/historico?page=&pageSize=
 * Lista conferências FINALIZADAS da linha, com totais de itens e conferidos.
 */
inventarioRouter.get('/:linha/historico', async (req, res, next) => {
  try {
    const linha = parseLinha(req.params.linha);
    if (!linha) return res.status(400).json({ error: true, message: 'Linha inválida (use BATERIAS ou SOM).' });

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize) || 10, 1), 100);

    const where = { linha, status: 'FINALIZADA' };

    const [total, rows] = await Promise.all([
      prisma.conferencia_estoque.count({ where }),
      prisma.conferencia_estoque.findMany({
        where,
        orderBy: { finalizada_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { itens: { select: { conferido: true } } },
      }),
    ]);

    const data = rows.map((c) => ({
      id: c.id,
      created_by: c.created_by,
      created_at: c.created_at,
      finalizada_at: c.finalizada_at,
      total_itens: c.itens.length,
      total_conferidos: c.itens.filter((i) => i.conferido).length,
    }));

    res.json({ page, pageSize, total, pages: Math.ceil(total / pageSize), data });
  } catch (e) {
    console.error('GET /api/inventario/:linha/historico ERRO:', e);
    next(e);
  }
});

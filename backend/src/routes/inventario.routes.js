import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { podeVerLinha } from '../utils/permissoes.js';
import { requireAdmin } from '../middlewares/auth.js';

export const inventarioRouter = Router();

/* ===== helpers ===== */
const LINHAS = ['BATERIAS', 'SOM'];

/** Normaliza e valida o parâmetro de linha. Retorna null se inválido. */
const parseLinha = (raw) => {
  const s = String(raw || '').trim().toUpperCase();
  return LINHAS.includes(s) ? s : null;
};

/** Escopo de linha por REQUEST (o inventário serve as duas linhas). Recebe a
 *  linha em MAIÚSCULA (BATERIAS|SOM) já resolvida do path ou do registro.
 *  Responde 403 e retorna false quando o usuário não opera a linha. */
function permiteLinha(req, res, linhaUpper) {
  if (podeVerLinha(req.user, linhaUpper === 'SOM' ? 'som' : 'baterias')) return true;
  res.status(403).json({ error: true, message: `Sem acesso à linha de ${linhaUpper === 'SOM' ? 'som' : 'baterias'}.` });
  return false;
}

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
      // Sem isto a tela perderia a contagem ao recarregar (pausar/retomar).
      qtd_contada: it.qtd_contada ?? null,
      conferido: it.conferido,
      conferido_at: it.conferido_at,
      produto: p?.produto ?? null,
      modelo: p?.modelo ?? null,
      em_estoque: p ? emEstoqueDe(p) : null,
    };
  });
}

/**
 * GET /api/inventario/historico?page=&pageSize=
 * Histórico COMPLETO (as duas linhas juntas) com autor da finalização e o
 * resumo de divergências. Restrito a admin — gate SERVER-SIDE: esconder no
 * front deixaria os números acessíveis a quem chamasse a API direto.
 *
 * Rota de segmento único: não conflita com /:linha/historico (dois segmentos),
 * que segue aberta ao operador com a lista simples da linha dele.
 */
inventarioRouter.get('/historico', requireAdmin, async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize) || 20, 1), 100);
    const where = { status: 'FINALIZADA' };

    // Sem include dos itens: os totais estão congelados na própria linha.
    const [total, rows] = await Promise.all([
      prisma.conferencia_estoque.count({ where }),
      prisma.conferencia_estoque.findMany({
        where,
        orderBy: { finalizada_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const data = rows.map((c) => ({
      id: c.id,
      linha: c.linha,
      created_by: c.created_by,
      created_at: c.created_at,
      finalizada_at: c.finalizada_at,
      // Conferências anteriores a esta feature não têm autor da finalização
      // nem totais: vão como null e a tela mostra "—" (nada é inventado).
      finalizada_por: c.finalizada_por,
      total_itens: c.total_itens,
      total_conferidos: c.total_conferidos,
      total_divergencias: c.total_divergencias,
    }));

    res.json({ page, pageSize, total, pages: Math.ceil(total / pageSize), data });
  } catch (e) {
    console.error('GET /api/inventario/historico ERRO:', e);
    next(e);
  }
});

/**
 * GET /api/inventario/:linha/ativa
 * Retorna a conferência EM_ANDAMENTO da linha com itens + dados do produto.
 * Se não existir, retorna { data: null }.
 */
inventarioRouter.get('/:linha/ativa', async (req, res, next) => {
  try {
    const linha = parseLinha(req.params.linha);
    if (!linha) return res.status(400).json({ error: true, message: 'Linha inválida (use BATERIAS ou SOM).' });
    if (!permiteLinha(req, res, linha)) return;

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
    if (!permiteLinha(req, res, linha)) return;

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
 * Marca um item como conferido, gravando a quantidade REAL contada.
 * body: { qtd_contada? } — ausente = "bateu" (grava qtd_contada = qtd_sistema).
 * O toque rápido continua sendo um toque; só quem diverge digita um número.
 */
inventarioRouter.patch('/item/:itemId/conferir', async (req, res, next) => {
  try {
    const itemId = Number(req.params.itemId);
    if (!Number.isFinite(itemId)) return res.status(400).json({ error: true, message: 'Item inválido.' });

    const item = await prisma.conferencia_item.findUnique({
      where: { id: itemId },
      include: { conferencia: { select: { status: true } } },
    });
    if (!item) return res.status(404).json({ error: true, message: 'Item não encontrado.' });
    if (!permiteLinha(req, res, item.linha)) return;
    if (item.conferencia?.status !== 'EM_ANDAMENTO') {
      return res.status(409).json({ error: true, message: 'Conferência não está em andamento.' });
    }

    // Ausente/vazio = bateu com o sistema. Presente = contagem real do conferente.
    const bruto = req.body?.qtd_contada;
    let qtdContada = item.qtd_sistema;
    if (bruto !== undefined && bruto !== null && bruto !== '') {
      const n = Number(bruto);
      if (!Number.isInteger(n) || n < 0) {
        return res.status(400).json({ error: true, message: 'Quantidade contada inválida (inteiro >= 0).' });
      }
      qtdContada = n;
    }

    const atualizado = await prisma.conferencia_item.update({
      where: { id: itemId },
      data: { conferido: true, conferido_at: new Date(), qtd_contada: qtdContada },
    });
    res.json({ data: atualizado });
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

    const item = await prisma.conferencia_item.findUnique({
      where: { id: itemId },
      include: { conferencia: { select: { status: true } } },
    });
    if (!item) return res.status(404).json({ error: true, message: 'Item não encontrado.' });
    if (!permiteLinha(req, res, item.linha)) return;
    if (item.conferencia?.status !== 'EM_ANDAMENTO') {
      return res.status(409).json({ error: true, message: 'Conferência não está em andamento.' });
    }

    // Desconferir zera a contagem junto: item não conferido não pode carregar
    // uma quantidade contada de uma marcação anterior.
    const atualizado = await prisma.conferencia_item.update({
      where: { id: itemId },
      data: { conferido: false, conferido_at: null, qtd_contada: null },
    });
    res.json({ data: atualizado });
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
    if (!permiteLinha(req, res, conf.linha)) return;
    if (conf.status !== 'EM_ANDAMENTO') {
      return res.status(409).json({ error: true, message: 'Esta conferência não está em andamento.' });
    }

    // Congela o resumo na finalização: os totais continuam verdadeiros para
    // sempre e a listagem do histórico não precisa carregar os itens.
    // Tudo numa transação — ou grava status + autor + totais, ou nada.
    // AUDITORIA PURA: em_estoque NÃO é tocado aqui. A divergência é só
    // registrada; a correção segue pelo fluxo de Entrada/Saída.
    const atualizada = await prisma.$transaction(async (tx) => {
      const atual = await tx.conferencia_estoque.findUnique({
        where: { id },
        include: { itens: { select: { conferido: true, qtd_sistema: true, qtd_contada: true } } },
      });
      // Recheca dentro da transação: barra a finalização dupla em corrida.
      if (!atual || atual.status !== 'EM_ANDAMENTO') {
        throw Object.assign(new Error('Esta conferência não está em andamento.'), { statusCode: 409 });
      }

      const itens = atual.itens;
      const conferidos = itens.filter((i) => i.conferido);
      // Divergência só faz sentido em item conferido e com contagem gravada:
      // itens de conferências antigas (qtd_contada NULL) não viram divergência.
      const divergencias = conferidos.filter(
        (i) => i.qtd_contada != null && i.qtd_contada !== i.qtd_sistema,
      );

      return tx.conferencia_estoque.update({
        where: { id },
        data: {
          status: 'FINALIZADA',
          finalizada_at: new Date(),
          finalizada_por_id: req.user?.id ?? null,
          finalizada_por: String(req.user?.name || req.user?.email || 'desconhecido').slice(0, 120),
          total_itens: itens.length,
          total_conferidos: conferidos.length,
          total_divergencias: divergencias.length,
        },
      });
    });

    res.json({ data: atualizada });
  } catch (e) {
    if (e?.statusCode) return res.status(e.statusCode).json({ error: true, message: e.message });
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
    if (!permiteLinha(req, res, conf.linha)) return;
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
    if (!permiteLinha(req, res, linha)) return;

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

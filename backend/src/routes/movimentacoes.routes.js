import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { requireAdmin } from '../middlewares/auth.js';
import { validate, idParams } from '../middlewares/validate.js';
import { criarMovimentacaoBody } from '../schemas/movimentacoes.schema.js';

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

/** GET /api/movimentacoes/resumo
 * Agregados de vendas para o dashboard, calculados sobre TODAS as saídas
 * (sem paginação) com o custo do produto resolvido via relação — evita o
 * truncamento em 100 movimentações e o custo zerado de produtos fora da
 * primeira página. valor_final é UNITÁRIO (receita = valor_final × quantidade).
 * `saidas` volta como [{ id, receita }] para o front aplicar as taxas de
 * máquina (a forma de pagamento hoje vive no navegador, não no banco).
 */
movimentacoesRouter.get('/resumo', async (req, res, next) => {
  try {
    const rows = await prisma.movimentacoes.findMany({
      // garantia_id só é preenchido nas movimentações de EMPRÉSTIMO de garantia
      // (a SAÍDA da ida e a ENTRADA da devolução). Empréstimo não é venda nem
      // perda — é saída temporária — então fica FORA de faturamento/custo/lucro.
      // Sem isto, a SAÍDA do empréstimo (valor_final 0, custo > 0) entrava como
      // prejuízo e nunca era compensada (o /resumo só olha SAÍDA).
      where: { tipo: 'SAIDA', garantia_id: null },
      select: {
        id: true,
        quantidade: true,
        valor_final: true,
        data_movimentacao: true,
        estoque: { select: { custo: true } },
      },
    });

    let vendasBrutas = 0, custoVendido = 0, qtdVendas = 0;
    const porDia = new Map();
    const saidas = [];

    for (const mv of rows) {
      const qtd = Number(mv.quantidade || 0);
      const receita = Number(mv.valor_final || 0) * qtd;
      vendasBrutas += receita;
      custoVendido += Number(mv.estoque?.custo || 0) * qtd;
      qtdVendas += qtd;
      saidas.push({ id: mv.id, receita });
      if (mv.data_movimentacao) {
        const dia = mv.data_movimentacao.toISOString().slice(0, 10); // YYYY-MM-DD
        porDia.set(dia, (porDia.get(dia) || 0) + receita);
      }
    }

    const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
    const isAdmin = req.user?.role === 'admin';
    res.json({
      data: {
        vendasBrutas: round2(vendasBrutas),
        qtdVendas,
        seriePorDia: [...porDia.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([dia, receita]) => ({ dia, receita: round2(receita) })),
        saidas,
        // custoVendido/lucroBruto derivam do custo dos produtos — campo que as
        // rotas de estoque omitem para não-admin (sanitizeForRole); espelha aqui.
        ...(isAdmin
          ? { custoVendido: round2(custoVendido), lucroBruto: round2(vendasBrutas - custoVendido) }
          : {}),
      },
    });
  } catch (e) {
    console.error('GET /api/movimentacoes/resumo ERRO:', e);
    next(e);
  }
});

/** GET /api/movimentacoes?produto_id=&page=&pageSize= */
movimentacoesRouter.get('/', async (req, res, next) => {
  try {
    const produtoId = req.query.produto_id ? Number(req.query.produto_id) : undefined;
    const q = (req.query.q || '').toString().trim();
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize) || 10, 1), 100);

    const and = [];
    if (produtoId) and.push({ produto_id: produtoId });
    if (q) and.push({ estoque: { OR: [{ produto: { contains: q } }, { modelo: { contains: q } }] } });
    const where = and.length ? { AND: and } : undefined;

    const [total, data] = await Promise.all([
      prisma.movimentacoes.count({ where }),
      prisma.movimentacoes.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { estoque: { select: { produto: true, modelo: true } } },
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
movimentacoesRouter.post('/', validate({ body: criarMovimentacaoBody }), async (req, res, next) => {
  try {
    const produto_id = Number(req.body?.produto_id);
    const quantidade = toInt(req.body?.quantidade, 0);

    // normaliza tipo vindo do front para o valor exato do ENUM no MySQL
    const tipoRaw = String(req.body?.tipo || '').trim().toLowerCase();
    let tipoDbValue = null;
    if (tipoRaw === 'entrada') tipoDbValue = 'ENTRADA';
    if (tipoRaw === 'saida')   tipoDbValue = 'SAIDA';

    if (!produto_id) return res.status(400).json({ error: true, message: 'produto_id inválido ou ausente.' });
    if (!tipoDbValue) {
      return res.status(400).json({ error: true, message: `tipo inválido. Envie 'entrada' ou 'saida'. Recebido: ${req.body?.tipo}` });
    }
    if (!(quantidade > 0)) return res.status(400).json({ error: true, message: 'quantidade deve ser > 0.' });

    // se vier vazio, use "0.00" (coluna é NOT NULL no seu schema)
    const valor_final = toMoneyStr(req.body?.valor_final, '0.00');

    // vendedor: aplicável apenas em saídas
    const vendedorRaw = req.body?.vendedor;
    const vendedor = tipoDbValue === 'SAIDA' && vendedorRaw
      ? String(vendedorRaw).trim().slice(0, 50)
      : null;

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
          vendedor,                     // somente em saídas (null caso contrário)
          data_movimentacao: now,
          user_id: req.user.id,         // trilha de auditoria (vem do requireAuth)
          created_by: req.user.email,
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
 * Desfaz agregados e remove a movimentação. Apenas admin (trilha de auditoria).
 */
movimentacoesRouter.delete('/:id', requireAdmin, validate({ params: idParams }), async (req, res, next) => {
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

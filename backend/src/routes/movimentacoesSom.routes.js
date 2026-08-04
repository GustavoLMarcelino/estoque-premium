import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { requireAdmin, requirePermission } from '../middlewares/auth.js';
import { validate, idParams } from '../middlewares/validate.js';
import { criarMovimentacaoBody } from '../schemas/movimentacoes.schema.js';
import { checarMargemMinima } from '../utils/margem.js';
import { dadosEstorno, ehMovimentacaoDePedido } from '../utils/estorno.js';

export const movimentacoesSomRouter = Router();

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

/** GET /api/movimentacoes-som?produto_id=&page=&pageSize= */
movimentacoesSomRouter.get('/', async (req, res, next) => {
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
      prisma.movimentacoes_som.count({ where }),
      prisma.movimentacoes_som.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { estoque: { select: { produto: true, modelo: true } } },
      }),
    ]);

    res.json({ page, pageSize, total, pages: Math.ceil(total / pageSize), data });
  } catch (e) {
    console.error('GET /api/movimentacoes-som ERRO:', e);
    next(e);
  }
});

/** POST /api/movimentacoes-som
 * body: { produto_id, tipo: 'entrada'|'saida', quantidade, valor_final? }
 */
movimentacoesSomRouter.post('/', requirePermission('entrada_saida'), validate({ body: criarMovimentacaoBody }), async (req, res, next) => {
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

    // se vier vazio, use "0.00" (coluna NÃO NOT NULL no seu schema)
    const valor_final = toMoneyStr(req.body?.valor_final, '0.00');

    // ENTRADA pode repor o custo e corrigir os preços de venda no mesmo request.
    // Mexer em custo/preço continua sendo privilégio de admin (é o mesmo que
    // PUT /api/estoque-som exige) — a permissão 'entrada_saida' sozinha não basta.
    const mexeEmPrecoOuCusto = ['custo', 'valor_vista', 'valor_parcelado']
      .some((k) => req.body?.[k] != null && req.body[k] !== '');
    if (mexeEmPrecoOuCusto) {
      if (tipoDbValue !== 'ENTRADA') {
        return res.status(400).json({ error: true, message: 'Custo e preços só podem ser alterados numa entrada.' });
      }
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: true, message: 'Apenas administradores podem alterar custo e preços.' });
      }
    }

    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const prod = await tx.estoque_som.findUnique({ where: { id: produto_id } });
      if (!prod) throw new Error('Produto não encontrado');

      const emEstoque = Number(
        prod.em_estoque ??
          (Number(prod.qtd_inicial || 0) + Number(prod.entradas || 0) - Number(prod.saidas || 0))
      );

      if (tipoDbValue === 'SAIDA' && quantidade > emEstoque) {
        throw Object.assign(new Error('Quantidade de saída excede o estoque atual'), { statusCode: 409 });
      }

      // Trava anti-prejuízo da ENTRADA: subir o custo não pode deixar nenhum
      // dos dois preços abaixo de 10% de margem líquida. A checagem roda ANTES
      // de qualquer escrita e dentro da transação — reprovou, nada é gravado
      // (nem a movimentação, nem o custo). O usuário corrige o preço na tela e
      // reenvia; não existe forçar abaixo do mínimo.
      const precoFinal = {};
      if (mexeEmPrecoOuCusto) {
        const custoFinal = req.body.custo != null && req.body.custo !== ''
          ? toMoneyStr(req.body.custo) : prod.custo;
        // valor_venda espelha o à vista no resto do sistema; mantém o espelho.
        const vistaFinal = req.body.valor_vista != null && req.body.valor_vista !== ''
          ? toMoneyStr(req.body.valor_vista) : prod.valor_vista;
        const parceladoFinal = req.body.valor_parcelado != null && req.body.valor_parcelado !== ''
          ? toMoneyStr(req.body.valor_parcelado) : prod.valor_parcelado;

        const erroMargem = checarMargemMinima({
          custo: custoFinal,
          valor_venda: vistaFinal ?? prod.valor_venda,
          valor_vista: vistaFinal,
          valor_parcelado: parceladoFinal,
        });
        if (erroMargem) throw Object.assign(new Error(erroMargem), { statusCode: 400 });

        precoFinal.custo = custoFinal;
        if (req.body.valor_vista != null && req.body.valor_vista !== '') {
          precoFinal.valor_vista = vistaFinal;
          precoFinal.valor_venda = vistaFinal;
        }
        if (req.body.valor_parcelado != null && req.body.valor_parcelado !== '') {
          precoFinal.valor_parcelado = parceladoFinal;
        }
      }

      // cria movimentação conectando o relacionamento obrigatório
      const mov = await tx.movimentacoes_som.create({
        data: {
          estoque: { connect: { id: produto_id } },
          tipo: tipoDbValue,
          quantidade,
          valor_final,
          data_movimentacao: now,
          user_id: req.user.id,         // trilha de auditoria (vem do requireAuth)
          created_by: req.user.email,
        },
      });

      // atualiza agregados
      if (tipoDbValue === 'ENTRADA') {
        // custo/preços vão no MESMO update dos agregados: um só write atômico.
        await tx.estoque_som.update({
          where: { id: produto_id },
          data: { entradas: (prod.entradas ?? 0) + quantidade, ...precoFinal },
        });
      } else {
        await tx.estoque_som.update({
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
    console.error('POST /api/movimentacoes-som ERRO:', e);
    next(e);
  }
});

/** DELETE /api/movimentacoes-som/:id
 * Desfaz agregados e remove a movimentação. Apenas admin (trilha de auditoria).
 * Só movimentação AVULSA (entrada/saída lançada pelo modal do Estoque).
 *
 * Movimentação gerada por pedido (motivo 'Pedido Som #N') é recusada: apagá-la
 * aqui estornaria o estoque e deixaria o pedido intacto, ainda apontando itens
 * com baixa_estoque=true. Excluir o pedido depois estornaria DE NOVO os mesmos
 * itens — o estoque terminava inflado, sem erro nenhum. A baixa do pedido se
 * desfaz pelo DELETE /api/pedido-som/:id, que reverte tudo de uma vez.
 */
movimentacoesSomRouter.delete('/:id', requireAdmin, validate({ params: idParams }), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await prisma.$transaction(async (tx) => {
      const mov = await tx.movimentacoes_som.findUnique({ where: { id } });
      if (!mov) throw Object.assign(new Error('Movimentação não encontrada.'), { statusCode: 404 });

      if (ehMovimentacaoDePedido(mov.motivo)) {
        throw Object.assign(
          new Error(`Esta movimentação pertence a um pedido (${mov.motivo}). Exclua o pedido para reverter a baixa.`),
          { statusCode: 409 },
        );
      }

      const prod = await tx.estoque_som.findUnique({ where: { id: mov.produto_id } });
      if (!prod) throw Object.assign(new Error('Produto da movimentação não encontrado.'), { statusCode: 409 });

      // Falha (rollback) em vez de truncar em zero; decrement é atômico no SQL.
      const data = dadosEstorno({
        tipo: mov.tipo,
        quantidade: mov.quantidade,
        produto: prod,
        rotulo: [prod.produto, prod.modelo].filter(Boolean).join(' - '),
      });
      if (data) await tx.estoque_som.update({ where: { id: mov.produto_id }, data });

      await tx.movimentacoes_som.delete({ where: { id } });
    });

    res.status(204).end();
  } catch (e) {
    const status = e?.statusCode || 500;
    if (status !== 500) return res.status(status).json({ error: true, message: e.message });
    console.error('DELETE /api/movimentacoes-som/:id ERRO:', e);
    next(e);
  }
});

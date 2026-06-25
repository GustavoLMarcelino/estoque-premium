import { Router } from 'express';
import { prisma } from '../config/prisma.js';

export const pedidoSomRouter = Router();

/* ===== helpers ===== */
const TIPOS_ITEM = ['PRODUTO', 'MAO_OBRA'];
const COMISSAO_JOEL = 0.30; // 30% do valor da mão de obra

const toInt = (v, def = 0) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
};
const toMoneyStr = (v, def = '0.00') => {
  if (v === null || v === undefined || v === '') return def;
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : def;
};
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function isHoje(date) {
  const d = new Date(date);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/**
 * POST /api/pedido-som
 * body: { veiculo?, forma_pagamento?, itens: [{ tipo, produto_id?, descricao, quantidade, valor_unit }] }
 */
pedidoSomRouter.post('/', async (req, res, next) => {
  try {
    const { veiculo, forma_pagamento, itens } = req.body || {};

    if (!Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ error: true, message: 'Informe ao menos um item.' });
    }

    // normaliza + valida itens
    const normItens = [];
    for (const it of itens) {
      const tipo = String(it?.tipo || '').trim().toUpperCase();
      if (!TIPOS_ITEM.includes(tipo)) {
        return res.status(400).json({ error: true, message: `tipo de item inválido: ${it?.tipo}` });
      }
      const quantidade = tipo === 'MAO_OBRA' ? 1 : toInt(it?.quantidade, 0);
      if (!(quantidade > 0)) {
        return res.status(400).json({ error: true, message: 'quantidade deve ser > 0.' });
      }
      const valorUnit = Number(it?.valor_unit);
      if (!(valorUnit > 0)) {
        return res.status(400).json({ error: true, message: 'valor_unit deve ser > 0.' });
      }
      const produtoId = tipo === 'PRODUTO' && it?.produto_id ? Number(it.produto_id) : null;
      const descricao = String(it?.descricao || '').trim();
      if (tipo === 'MAO_OBRA' && !descricao) {
        return res.status(400).json({ error: true, message: 'descrição da mão de obra é obrigatória.' });
      }
      normItens.push({
        tipo,
        produto_id: produtoId,
        descricao,
        quantidade,
        valor_unit: valorUnit,
        valor_total: round2(quantidade * valorUnit),
        baixa_estoque: tipo === 'PRODUTO' && !!produtoId,
      });
    }

    const valorTotalPedido = round2(normItens.reduce((acc, i) => acc + i.valor_total, 0));
    const valorMaoObra = round2(
      normItens.filter((i) => i.tipo === 'MAO_OBRA').reduce((acc, i) => acc + i.valor_total, 0),
    );
    const comissaoJoel = round2(valorMaoObra * COMISSAO_JOEL);

    const now = new Date();

    const created = await prisma.$transaction(async (tx) => {
      const pedido = await tx.pedido_som.create({
        data: {
          veiculo: veiculo ? String(veiculo).trim().slice(0, 100) : null,
          valor_total: toMoneyStr(valorTotalPedido),
          valor_mao_obra: valorMaoObra > 0 ? toMoneyStr(valorMaoObra) : null,
          comissao_joel: valorMaoObra > 0 ? toMoneyStr(comissaoJoel) : null,
          forma_pagamento: forma_pagamento ? String(forma_pagamento).trim().slice(0, 50) : null,
          user_id: req.user?.id ?? null,
          created_by: req.user?.email ?? null,
          created_at: now,
        },
      });

      for (const it of normItens) {
        let descricao = it.descricao;

        // baixa de estoque para itens de produto (igual ao lançamento simples)
        if (it.tipo === 'PRODUTO' && it.produto_id) {
          const prod = await tx.estoque_som.findUnique({ where: { id: it.produto_id } });
          if (!prod) {
            throw Object.assign(new Error(`Produto ${it.produto_id} não encontrado`), { statusCode: 404 });
          }
          if (!descricao) descricao = [prod.produto, prod.modelo].filter(Boolean).join(' - ');

          const emEstoque = Number(
            prod.em_estoque ??
              (Number(prod.qtd_inicial || 0) + Number(prod.entradas || 0) - Number(prod.saidas || 0)),
          );
          if (it.quantidade > emEstoque) {
            throw Object.assign(
              new Error(`Estoque insuficiente para "${descricao}". Atual: ${emEstoque}`),
              { statusCode: 409 },
            );
          }

          await tx.movimentacoes_som.create({
            data: {
              estoque: { connect: { id: it.produto_id } },
              tipo: 'SAIDA',
              quantidade: it.quantidade,
              valor_final: toMoneyStr(it.valor_unit),
              motivo: `Pedido Som #${pedido.id}`,
              data_movimentacao: now,
              user_id: req.user?.id ?? null,
              created_by: req.user?.email ?? null,
            },
          });

          await tx.estoque_som.update({
            where: { id: it.produto_id },
            data: { saidas: (prod.saidas ?? 0) + it.quantidade },
          });
        }

        await tx.pedido_som_item.create({
          data: {
            pedido_id: pedido.id,
            tipo: it.tipo,
            produto_id: it.produto_id,
            descricao: (descricao || '').slice(0, 150),
            quantidade: it.quantidade,
            valor_unit: toMoneyStr(it.valor_unit),
            valor_total: toMoneyStr(it.valor_total),
            baixa_estoque: it.baixa_estoque,
          },
        });
      }

      return tx.pedido_som.findUnique({ where: { id: pedido.id }, include: { itens: true } });
    });

    res.status(201).json({ data: created });
  } catch (e) {
    const status = e?.statusCode || 500;
    if (status !== 500) return res.status(status).json({ error: true, message: e.message });
    console.error('POST /api/pedido-som ERRO:', e);
    next(e);
  }
});

/**
 * GET /api/pedido-som?page=&pageSize=
 */
pedidoSomRouter.get('/', async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize) || 20, 1), 100);

    const [total, data] = await Promise.all([
      prisma.pedido_som.count(),
      prisma.pedido_som.findMany({
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { itens: true },
      }),
    ]);

    res.json({ page, pageSize, total, pages: Math.ceil(total / pageSize), data });
  } catch (e) {
    console.error('GET /api/pedido-som ERRO:', e);
    next(e);
  }
});

/**
 * GET /api/pedido-som/:id
 */
pedidoSomRouter.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const pedido = await prisma.pedido_som.findUnique({ where: { id }, include: { itens: true } });
    if (!pedido) return res.status(404).json({ error: true, message: 'Pedido não encontrado.' });
    res.json({ data: pedido });
  } catch (e) {
    console.error('GET /api/pedido-som/:id ERRO:', e);
    next(e);
  }
});

/**
 * DELETE /api/pedido-som/:id
 * Só pode deletar pedidos criados hoje. Reverte baixas de estoque dos itens PRODUTO.
 */
pedidoSomRouter.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const pedido = await prisma.pedido_som.findUnique({ where: { id }, include: { itens: true } });
    if (!pedido) return res.status(404).json({ error: true, message: 'Pedido não encontrado.' });
    if (!isHoje(pedido.created_at)) {
      return res.status(403).json({ error: true, message: 'Só é possível excluir pedidos do dia atual.' });
    }

    await prisma.$transaction(async (tx) => {
      // reverte agregados de saída dos itens de produto
      for (const it of pedido.itens) {
        if (it.tipo === 'PRODUTO' && it.baixa_estoque && it.produto_id) {
          const prod = await tx.estoque_som.findUnique({ where: { id: it.produto_id } });
          if (prod) {
            await tx.estoque_som.update({
              where: { id: it.produto_id },
              data: { saidas: Math.max(0, (prod.saidas ?? 0) - it.quantidade) },
            });
          }
        }
      }
      // remove as movimentações de saída geradas por este pedido
      await tx.movimentacoes_som.deleteMany({ where: { motivo: `Pedido Som #${id}` } });
      // deleta o pedido (cascade remove os itens)
      await tx.pedido_som.delete({ where: { id } });
    });

    res.status(204).end();
  } catch (e) {
    console.error('DELETE /api/pedido-som/:id ERRO:', e);
    next(e);
  }
});

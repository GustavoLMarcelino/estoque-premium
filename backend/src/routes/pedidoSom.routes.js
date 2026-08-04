import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { requireAdmin, requirePermission } from '../middlewares/auth.js';
import { validate, idParams } from '../middlewares/validate.js';
import { criarPedidoBody, editarPedidoBody } from '../schemas/pedidoSom.schema.js';
// REGRA ÚNICA de "é crédito?" — a MESMA função que decide a base de preço nas
// duas telas, então rótulo salvo e parcelas nunca divergem. Aceita as grafias
// do Pedido Som ("Crédito 10x", "Crédito parcelado") e a de Baterias
// ('credito'). Import cross-boundary como em utils/margem.js: o deploy sobe o
// repo inteiro via git pull.
import { usaPrecoParcelado, parcelasDoRotulo } from '../../../frontend/src/utils/precos.js';
import { dadosEstorno } from '../utils/estorno.js';
import { registrarAuditoria, ACOES, ENTIDADES } from '../utils/auditoria.js';

// Comissão é dado exclusivo de admin. Omite dos pedidos os campos derivados de
// comissão/mão de obra para não-admin — SEGUNDA superfície de vazamento, além
// de /api/comissao (mesmo padrão do sanitizeCusto do estoque).
const CAMPOS_COMISSAO = ['comissao_joel', 'valor_mao_obra', 'valor_mao_obra_insulfilme'];
function sanitizePedidoComissao(pedido, user) {
  if (!pedido || user?.role === 'admin') return pedido;
  const limpo = { ...pedido };
  for (const c of CAMPOS_COMISSAO) delete limpo[c];
  return limpo;
}

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

/**
 * POST /api/pedido-som
 * body: { veiculo?, forma_pagamento?, itens: [{ tipo, produto_id?, descricao, quantidade, valor_unit }] }
 */
// Pedido de Instalação é criado pelo fluxo de Lançamento (PedidoSomForm vive
// na tela Entrada e Saída) — mesma permissão das movimentações.
pedidoSomRouter.post('/', requirePermission('entrada_saida'), validate({ body: criarPedidoBody }), async (req, res, next) => {
  try {
    const { veiculo, forma_pagamento, itens } = req.body || {};

    if (!Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ error: true, message: 'Informe ao menos um item.' });
    }

    // parcelas só fazem sentido no crédito (zod já limitou a 1–10); nas demais
    // formas fica null, como movimentacoes.parcelas em Baterias. NÃO entra em
    // nenhum cálculo abaixo: preço, total e comissão são idênticos com 2x ou 10x.
    const parcelas = usaPrecoParcelado(forma_pagamento)
      ? toInt(req.body?.parcelas, 1) || 1
      : null;

    // normaliza + valida itens. Dois tipos:
    //  PRODUTO   — produto do Estoque Som; preço = valor_unit×qtd; a mão de obra
    //              vem AUTOMÁTICA da classe do próprio produto (igual Orçamento).
    //  MAO_OBRA  — serviço avulso: por classe (mão de obra = classe.valor_mao_obra)
    //              ou fallback manual (valor_unit = a própria mão de obra).
    const normItens = [];
    for (const it of itens) {
      const tipo = String(it?.tipo || '').trim().toUpperCase();
      if (!TIPOS_ITEM.includes(tipo)) {
        return res.status(400).json({ error: true, message: `tipo de item inválido: ${it?.tipo}` });
      }

      // override opcional da mão de obra (Zod garante >= 0 quando presente)
      const maoObraOverride = it?.mao_obra_unit != null ? Number(it.mao_obra_unit) : null;

      if (tipo === 'PRODUTO') {
        const produtoId = it?.produto_id ? Number(it.produto_id) : null;
        if (!produtoId) {
          return res.status(400).json({ error: true, message: 'produto_id é obrigatório em item de produto.' });
        }
        const quantidade = toInt(it?.quantidade, 0);
        if (!(quantidade > 0)) {
          return res.status(400).json({ error: true, message: 'quantidade deve ser > 0.' });
        }
        const valorUnit = Number(it?.valor_unit);
        if (!(valorUnit > 0)) {
          return res.status(400).json({ error: true, message: 'valor_unit deve ser > 0 no produto.' });
        }
        normItens.push({
          tipo, produto_id: produtoId, classe_id: null,
          descricao: String(it?.descricao || '').trim(),
          quantidade, valor_unit: valorUnit,
          mao_obra_override: maoObraOverride,
        });
      } else {
        // MAO_OBRA (serviço avulso)
        const quantidade = toInt(it?.quantidade, 1) || 1;
        const classeId = it?.classe_id ? Number(it.classe_id) : null;
        const descricao = String(it?.descricao || '').trim();
        let maoObraManual = null;
        if (!classeId) {
          // fallback manual: sem classe, o valor_unit É a mão de obra
          maoObraManual = Number(it?.valor_unit);
          if (!(maoObraManual > 0)) {
            return res.status(400).json({ error: true, message: 'no serviço avulso, informe a classe ou um valor de mão de obra > 0.' });
          }
          if (!descricao) {
            return res.status(400).json({ error: true, message: 'descrição da mão de obra é obrigatória.' });
          }
        }
        normItens.push({
          tipo, produto_id: null, classe_id: classeId,
          descricao, quantidade, mao_obra_manual: maoObraManual,
          mao_obra_override: maoObraOverride,
        });
      }
    }

    const now = new Date();

    const created = await prisma.$transaction(async (tx) => {
      const pedido = await tx.pedido_som.create({
        data: {
          veiculo: veiculo ? String(veiculo).trim().slice(0, 100) : null,
          // valores reais preenchidos após montar os itens (update no fim)
          valor_total: '0.00',
          forma_pagamento: forma_pagamento ? String(forma_pagamento).trim().slice(0, 50) : null,
          parcelas,
          user_id: req.user?.id ?? null,
          created_by: req.user?.email ?? null,
          created_at: now,
        },
      });

      let totalProdutos = 0;
      let totalMaoObra = 0;
      let totalMaoObraInsulfilme = 0;

      for (const it of normItens) {
        let descricao = it.descricao;
        let valorUnit = 0; // preço de produto (0 em serviço)
        let maoObraUnit = 0; // mão de obra unitária (classe ou manual)
        let itemCategoria = 'SOM'; // SOM | INSULFILME (só Insulfilme muda o %)

        if (it.tipo === 'PRODUTO') {
          const prod = await tx.estoque_som.findUnique({
            where: { id: it.produto_id },
            include: { classe: true },
          });
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

          valorUnit = it.valor_unit;
          // mão de obra: override do item quando informado; senão, valor da
          // classe do produto (0 se o produto não tem classe).
          maoObraUnit = it.mao_obra_override != null
            ? it.mao_obra_override
            : Number(prod.classe?.valor_mao_obra ?? 0) || 0;
          if (prod.classe?.categoria === 'INSULFILME') itemCategoria = 'INSULFILME';

          await tx.movimentacoes_som.create({
            data: {
              estoque: { connect: { id: it.produto_id } },
              tipo: 'SAIDA',
              quantidade: it.quantidade,
              valor_final: toMoneyStr(valorUnit),
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
        } else if (it.classe_id) {
          // serviço por classe
          const classe = await tx.classe_som.findUnique({ where: { id: it.classe_id } });
          if (!classe) {
            throw Object.assign(new Error(`Classe ${it.classe_id} não encontrada`), { statusCode: 404 });
          }
          // override do item quando informado; senão, valor da classe
          maoObraUnit = it.mao_obra_override != null
            ? it.mao_obra_override
            : Number(classe.valor_mao_obra ?? 0) || 0;
          if (classe.categoria === 'INSULFILME') itemCategoria = 'INSULFILME';
          if (!descricao) descricao = classe.nome;
        } else {
          // serviço manual (fallback sem classe)
          maoObraUnit = it.mao_obra_manual;
        }

        const valorTotalItem = round2(it.quantidade * valorUnit);
        const maoObraTotalItem = round2(it.quantidade * maoObraUnit);
        totalProdutos += valorTotalItem;
        totalMaoObra += maoObraTotalItem;
        if (itemCategoria === 'INSULFILME') totalMaoObraInsulfilme += maoObraTotalItem;

        await tx.pedido_som_item.create({
          data: {
            pedido_id: pedido.id,
            tipo: it.tipo,
            produto_id: it.produto_id,
            classe_id: it.classe_id,
            descricao: (descricao || '').slice(0, 150),
            quantidade: it.quantidade,
            valor_unit: toMoneyStr(valorUnit),
            valor_total: toMoneyStr(valorTotalItem),
            mao_obra_unit: maoObraUnit > 0 ? toMoneyStr(maoObraUnit) : null,
            mao_obra_total: maoObraTotalItem > 0 ? toMoneyStr(maoObraTotalItem) : null,
            baixa_estoque: it.tipo === 'PRODUTO',
          },
        });
      }

      const valorMaoObra = round2(totalMaoObra);
      const valorInsulfilme = round2(totalMaoObraInsulfilme);
      const valorTotalPedido = round2(totalProdutos + valorMaoObra);
      // percentuais da comissão do Joel vêm da config editável (fallback 30/25).
      const cfg = await tx.comissao_config.findFirst({ orderBy: { id: 'asc' } });
      const pctSom = cfg ? Number(cfg.percentual_mao_obra) : COMISSAO_JOEL * 100;
      const pctInsulf = cfg ? Number(cfg.percentual_insulfilme) : 25;
      const baseSom = round2(valorMaoObra - valorInsulfilme);
      const comissaoJoel = round2((baseSom * pctSom) / 100 + (valorInsulfilme * pctInsulf) / 100);

      await tx.pedido_som.update({
        where: { id: pedido.id },
        data: {
          valor_total: toMoneyStr(valorTotalPedido),
          valor_mao_obra: valorMaoObra > 0 ? toMoneyStr(valorMaoObra) : null,
          valor_mao_obra_insulfilme: valorInsulfilme > 0 ? toMoneyStr(valorInsulfilme) : null,
          comissao_joel: valorMaoObra > 0 ? toMoneyStr(comissaoJoel) : null,
        },
      });

      return tx.pedido_som.findUnique({ where: { id: pedido.id }, include: { itens: true } });
    });

    res.status(201).json({ data: sanitizePedidoComissao(created, req.user) });
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

    res.json({
      page, pageSize, total, pages: Math.ceil(total / pageSize),
      data: data.map((p) => sanitizePedidoComissao(p, req.user)),
    });
  } catch (e) {
    console.error('GET /api/pedido-som ERRO:', e);
    next(e);
  }
});

/**
 * GET /api/pedido-som/:id
 */
pedidoSomRouter.get('/:id', validate({ params: idParams }), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const pedido = await prisma.pedido_som.findUnique({ where: { id }, include: { itens: true } });
    if (!pedido) return res.status(404).json({ error: true, message: 'Pedido não encontrado.' });
    res.json({ data: sanitizePedidoComissao(pedido, req.user) });
  } catch (e) {
    console.error('GET /api/pedido-som/:id ERRO:', e);
    next(e);
  }
});

/**
 * PUT /api/pedido-som/:id — Fase C: edita SÓ o cabeçalho que não cascateia.
 * Apenas admin, transacional, com auditoria (mesma disciplina do DELETE).
 *
 * O QUE ENTRA: veiculo, forma_pagamento, parcelas. Nada mais — o editarPedidoBody
 * é .strict(), então created_at/itens/valor_total/comissao_joel viram 400.
 *
 * POR QUE ISTO É UM UPDATE SIMPLES: nenhum dos três campos participa de estoque
 * nem de comissão. Estoque só se move pelos itens PRODUTO (movimentacoes_som), e
 * a comissão do Joel é apurada de valor_mao_obra/valor_mao_obra_insulfilme por
 * created_at — nada disso é editável aqui. Logo: nenhum estorno, nenhum toque em
 * pedido_som_item, movimentacoes_som ou estoque_som. Mão de obra fica para a
 * Fase C2, porque é DERIVADA dos itens (Σ item.mao_obra_total) e editá-la
 * exigiria reagregar o pedido inteiro.
 *
 * NÃO RE-PRECIFICA: valor_total continua o que o cliente pagou. A forma registra
 * COMO ele pagou; a taxa de maquininha é calculada na leitura (/vendas-resumo) e
 * se ajusta sozinha no próximo carregamento.
 *
 * Quinzena fechada NÃO é checada de propósito: como nenhum campo editável entra
 * na comissão, bloquear a correção de um pedido antigo só impediria consertar o
 * registro sem proteger dinheiro nenhum.
 */
pedidoSomRouter.put('/:id', requireAdmin, validate({ params: idParams, body: editarPedidoBody }), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const body = req.body || {};
    const mexeu = (campo) => Object.prototype.hasOwnProperty.call(body, campo);

    const atualizado = await prisma.$transaction(async (tx) => {
      const antes = await tx.pedido_som.findUnique({ where: { id }, include: { itens: true } });
      if (!antes) throw Object.assign(new Error('Pedido não encontrado.'), { statusCode: 404 });

      // Forma RESULTANTE: a nova quando veio no body, senão a que já está lá.
      // É ela que decide se parcelas fazem sentido — trocar Crédito→PIX tem que
      // zerar o número, senão sobra parcela em venda que não é parcelada.
      const formaFinal = mexeu('forma_pagamento')
        ? (body.forma_pagamento ? String(body.forma_pagamento).trim().slice(0, 50) : null)
        : antes.forma_pagamento;

      let parcelasFinal = null;
      if (usaPrecoParcelado(formaFinal)) {
        const informada = mexeu('parcelas') && body.parcelas != null ? toInt(body.parcelas, 0) : null;
        const atual = antes.parcelas != null ? Number(antes.parcelas) : null;
        parcelasFinal = informada ?? atual;

        // NÃO defaulta 1x, ao contrário do POST (onde a tela sempre manda o
        // número). Assumir 1x numa venda que foi 10x erraria a taxa em ~9 pontos
        // percentuais com cara de número exato — é o mesmo perigo que
        // creditoSemParcelas existe para não deixar passar calado.
        if (parcelasFinal == null) {
          throw Object.assign(
            new Error('Informe o número de parcelas (1–10) ao gravar a forma como crédito.'),
            { statusCode: 400 },
          );
        }

        // Rótulo e número têm que contar a mesma história: "Crédito 10x" com
        // parcelas=2 faria a tela dizer uma coisa e a taxa calcular outra.
        const noRotulo = parcelasDoRotulo(formaFinal);
        if (noRotulo != null && noRotulo !== parcelasFinal) {
          throw Object.assign(
            new Error(`Forma "${formaFinal}" não confere com ${parcelasFinal} parcela(s).`),
            { statusCode: 400 },
          );
        }
      }

      // Diário ANTES do update, na MESMA transação: se o update falhar, o
      // registro some junto no rollback (ver utils/auditoria.js).
      await registrarAuditoria(tx, {
        linha: 'som',
        entidade: ENTIDADES.PEDIDO_SOM,
        entidadeId: antes.id,
        acao: ACOES.EDICAO,
        conteudoAnterior: {
          pedido: { ...antes, itens: undefined },
          itens: antes.itens,
        },
        user: req.user,
      });

      const data = { forma_pagamento: formaFinal, parcelas: parcelasFinal };
      if (mexeu('veiculo')) {
        data.veiculo = body.veiculo ? String(body.veiculo).trim().slice(0, 100) : null;
      }
      await tx.pedido_som.update({ where: { id }, data });

      return tx.pedido_som.findUnique({ where: { id }, include: { itens: true } });
    });

    res.json({ data: sanitizePedidoComissao(atualizado, req.user) });
  } catch (e) {
    const status = e?.statusCode || 500;
    if (status !== 500) return res.status(status).json({ error: true, message: e.message });
    console.error('PUT /api/pedido-som/:id ERRO:', e);
    next(e);
  }
});

/**
 * DELETE /api/pedido-som/:id
 * Apenas admin. Reverte as baixas de estoque dos itens PRODUTO.
 *
 * SEM janela de tempo: antes só permitia pedidos do dia atual, o que deixava o
 * lojista sem saída para um pedido lançado errado e descoberto no dia seguinte.
 * A reversão não depende da data — é sempre "devolve o que este pedido baixou".
 */
pedidoSomRouter.delete('/:id', requireAdmin, validate({ params: idParams }), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const pedido = await prisma.pedido_som.findUnique({ where: { id }, include: { itens: true } });
    if (!pedido) return res.status(404).json({ error: true, message: 'Pedido não encontrado.' });

    await prisma.$transaction(async (tx) => {
      // Diário ANTES de destruir, na MESMA transação: se o estorno abaixo
      // reprovar, o log some junto no rollback. As movimentações vinculadas são
      // lidas AGORA porque o deleteMany lá embaixo as faz sumir — sem isto o
      // snapshot não seria reconstruível.
      const movsVinculadas = await tx.movimentacoes_som.findMany({
        where: { motivo: `Pedido Som #${id}` },
      });
      await registrarAuditoria(tx, {
        linha: 'som',
        entidade: ENTIDADES.PEDIDO_SOM,
        entidadeId: pedido.id,
        acao: ACOES.EXCLUSAO,
        // Pedido inteiro: cabeçalho (com totais e comissão), itens e as baixas
        // de estoque que ele gerou.
        conteudoAnterior: {
          pedido: { ...pedido, itens: undefined },
          itens: pedido.itens,
          movimentacoes: movsVinculadas,
        },
        user: req.user,
      });

      // reverte agregados de saída dos itens de produto. Falha (rollback) se o
      // estorno não couber no acumulado, em vez de truncar em zero.
      for (const it of pedido.itens) {
        if (it.tipo === 'PRODUTO' && it.baixa_estoque && it.produto_id) {
          const prod = await tx.estoque_som.findUnique({ where: { id: it.produto_id } });
          if (!prod) {
            throw Object.assign(
              new Error(`Produto ${it.produto_id} do item "${it.descricao}" não existe mais. Nada foi alterado.`),
              { statusCode: 409 },
            );
          }
          const data = dadosEstorno({
            tipo: 'SAIDA',
            quantidade: it.quantidade,
            produto: prod,
            rotulo: [prod.produto, prod.modelo].filter(Boolean).join(' - '),
          });
          if (data) await tx.estoque_som.update({ where: { id: it.produto_id }, data });
        }
      }
      // remove as movimentações de saída geradas por este pedido
      await tx.movimentacoes_som.deleteMany({ where: { motivo: `Pedido Som #${id}` } });
      // deleta o pedido (cascade remove os itens)
      await tx.pedido_som.delete({ where: { id } });
    });

    res.status(204).end();
  } catch (e) {
    const status = e?.statusCode || 500;
    if (status !== 500) return res.status(status).json({ error: true, message: e.message });
    console.error('DELETE /api/pedido-som/:id ERRO:', e);
    next(e);
  }
});

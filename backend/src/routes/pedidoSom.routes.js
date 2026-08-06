import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { paginacao, envelope } from '../utils/paginacao.js';
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
import { inicioDosPeriodosFechados, marcarPeriodoFechado } from '../utils/comissao.js';

// Comissão é dado exclusivo de admin. Omite dos pedidos os campos derivados de
// comissão/mão de obra para não-admin — SEGUNDA superfície de vazamento, além
// de /api/comissao (mesmo padrão do sanitizeCusto do estoque).
const CAMPOS_COMISSAO = ['comissao_joel', 'valor_mao_obra', 'valor_mao_obra_insulfilme'];
// Mão de obra POR ITEM é a mesma informação, só que desmontada: somar
// itens[].mao_obra_total reconstrói valor_mao_obra inteiro. Limpar só o
// cabeçalho deixava a base da comissão do Joel visível para qualquer usuário
// com linha Som — o pedido-fixture do teste de escopo não tinha itens, então o
// vazamento passou despercebido.
const CAMPOS_COMISSAO_ITEM = ['mao_obra_unit', 'mao_obra_total'];
function sanitizePedidoComissao(pedido, user) {
  if (!pedido || user?.role === 'admin') return pedido;
  const limpo = { ...pedido };
  for (const c of CAMPOS_COMISSAO) delete limpo[c];
  if (Array.isArray(pedido.itens)) {
    limpo.itens = pedido.itens.map((it) => {
      const item = { ...it };
      for (const c of CAMPOS_COMISSAO_ITEM) delete item[c];
      return item;
    });
  }
  return limpo;
}

// inicioDosPeriodosFechados e marcarPeriodoFechado saíram daqui para
// utils/comissao.js quando a edição de venda de Baterias precisou do MESMO
// aviso de quinzena fechada. Duplicá-las faria a regra de fuso divergir entre
// as duas linhas — e é regra de dinheiro.

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
const num = (v) => (v == null ? 0 : Number(String(v)) || 0);

/**
 * Recalcula os DERIVADOS do cabeçalho a partir dos itens que estão no banco.
 * Mesma fórmula do POST — é a razão de existir: com duas rotas escrevendo
 * valor_mao_obra, duas cópias da conta divergiriam em poucos meses.
 *
 * De onde vem cada parcela:
 *   totalProdutos — Σ item.valor_total dos itens PRODUTO, LIDOS do banco. Nunca
 *     re-derivado do preço atual do produto: o pedido registra o que foi
 *     cobrado, não o que a tabela de preços diz hoje.
 *   totalMaoObra  — Σ item.mao_obra_total de TODOS os itens (serviços e também
 *     produto legado, de quando o produto carregava classe).
 *   insulfilme    — idem, filtrando categoria INSULFILME.
 *
 * A CATEGORIA é re-derivada da classe a cada vez, e isso é seguro: o
 * PATCH /api/classes-som só aceita nome, valor_mao_obra e ativo — categoria é
 * imutável depois de criada. Já o VALOR jamais é relido da classe aqui; ele vem
 * de item.mao_obra_total, congelado no item. Reler o valor reprecificaria em
 * silêncio todo pedido antigo assim que alguém corrigisse a tabela de classes.
 */
async function reagregarPedido(tx, pedidoId) {
  const itens = await tx.pedido_som_item.findMany({ where: { pedido_id: pedidoId } });

  const classeIds = [...new Set(itens.map((i) => i.classe_id).filter(Boolean))];
  const produtoIds = [...new Set(
    itens.filter((i) => i.tipo === 'PRODUTO' && i.produto_id != null).map((i) => i.produto_id),
  )];

  const [classes, produtos] = await Promise.all([
    classeIds.length
      ? tx.classe_som.findMany({ where: { id: { in: classeIds } }, select: { id: true, categoria: true } })
      : [],
    produtoIds.length
      ? tx.estoque_som.findMany({
        where: { id: { in: produtoIds } },
        select: { id: true, classe: { select: { categoria: true } } },
      })
      : [],
  ]);
  const catClasse = new Map(classes.map((c) => [c.id, c.categoria]));
  const catProduto = new Map(produtos.map((p) => [p.id, p.classe?.categoria ?? 'SOM']));

  let totalProdutos = 0;
  let totalMaoObra = 0;
  let totalMaoObraInsulfilme = 0;

  for (const it of itens) {
    if (it.tipo === 'PRODUTO') totalProdutos += num(it.valor_total);
    const mo = num(it.mao_obra_total);
    if (!mo) continue;
    totalMaoObra += mo;
    const categoria = it.classe_id
      ? catClasse.get(it.classe_id)
      : (it.tipo === 'PRODUTO' ? catProduto.get(it.produto_id) : 'SOM');
    if (categoria === 'INSULFILME') totalMaoObraInsulfilme += mo;
  }

  const valorMaoObra = round2(totalMaoObra);
  const valorInsulfilme = round2(totalMaoObraInsulfilme);
  const valorTotalPedido = round2(round2(totalProdutos) + valorMaoObra);
  // percentuais da comissão do Joel vêm da config editável (fallback 30/25).
  const cfg = await tx.comissao_config.findFirst({ orderBy: { id: 'asc' } });
  const pctSom = cfg ? Number(cfg.percentual_mao_obra) : COMISSAO_JOEL * 100;
  const pctInsulf = cfg ? Number(cfg.percentual_insulfilme) : 25;
  const baseSom = round2(valorMaoObra - valorInsulfilme);
  const comissaoJoel = round2((baseSom * pctSom) / 100 + (valorInsulfilme * pctInsulf) / 100);

  await tx.pedido_som.update({
    where: { id: pedidoId },
    data: {
      valor_total: toMoneyStr(valorTotalPedido),
      valor_mao_obra: valorMaoObra > 0 ? toMoneyStr(valorMaoObra) : null,
      valor_mao_obra_insulfilme: valorInsulfilme > 0 ? toMoneyStr(valorInsulfilme) : null,
      comissao_joel: valorMaoObra > 0 ? toMoneyStr(comissaoJoel) : null,
    },
  });
}

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

          // increment atômico (SET saidas = saidas + n), não read-modify-write:
          // dois pedidos criados ao mesmo tempo com o mesmo produto liam o
          // MESMO prod.saidas e um dos incrementos se perdia. Mesma correção
          // que a Fase A fez no estorno e a Fase D na edição.
          await tx.estoque_som.update({
            where: { id: it.produto_id },
            data: { saidas: { increment: it.quantidade } },
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
    const { page, pageSize, pageSizeSolicitado, skip, take } = paginacao(req.query, { padrao: 20, teto: 100 });

    const [total, data] = await Promise.all([
      prisma.pedido_som.count(),
      prisma.pedido_som.findMany({
        orderBy: { created_at: 'desc' },
        skip,
        take,
        include: { itens: true },
      }),
    ]);

    const fechados = await inicioDosPeriodosFechados(prisma, req.user);

    res.json(envelope({
      page, pageSize, pageSizeSolicitado, total,
      data: data.map((p) => marcarPeriodoFechado(sanitizePedidoComissao(p, req.user), fechados)),
    }));
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
    const fechados = await inicioDosPeriodosFechados(prisma, req.user);
    res.json({ data: marcarPeriodoFechado(sanitizePedidoComissao(pedido, req.user), fechados) });
  } catch (e) {
    console.error('GET /api/pedido-som/:id ERRO:', e);
    next(e);
  }
});

/**
 * PUT /api/pedido-som/:id — edita o pedido SEM tocar estoque.
 * Apenas admin, transacional, com auditoria (mesma disciplina do DELETE).
 *
 * O QUE ENTRA:
 *   Fase C  — veiculo, forma_pagamento, parcelas (cabeçalho puro).
 *   Fase C2 — itens_servico (lista desejada de serviços) e mao_obra_produtos
 *             (só o valor da mão de obra de item PRODUTO legado).
 *   Fase D  — itens_produto (lista desejada de produtos). ÚNICA chave que move
 *             estoque.
 * Nada mais: editarPedidoBody é .strict(), então created_at, valor_total,
 * comissao_joel e o nome genérico "itens" viram 400 nomeando a chave.
 *
 * ORDEM DA TRANSAÇÃO: auditoria → produtos → serviços → mão de obra legada →
 * reagregação (uma vez) → cabeçalho. Produtos primeiro entre as escritas porque
 * é o passo que pode dar 409; falhar cedo evita trabalho jogado fora. As três
 * fases convivem no MESMO request de propósito: separá-las daria duas linhas de
 * auditoria para uma edição só, permitiria um pedido meio-editado (produto
 * trocado, serviço não) e obrigaria a reagregar duas vezes.
 *
 * O QUE ESTA ROTA MOVE, DE PROPÓSITO: mão de obra e produtos entram em
 * valor_total, então editá-los muda a receita de Som e a base da taxa no
 * dashboard, além da comissão do Joel. Não é "só comissão" — é o valor da venda
 * mudando porque o que foi cobrado mudou.
 *
 * NÃO RE-PRECIFICA produto: valor_total dos itens PRODUTO é o que foi cobrado,
 * lido do banco. A forma de pagamento registra COMO o cliente pagou; a taxa de
 * maquininha é calculada na leitura (/vendas-resumo) e se ajusta sozinha.
 *
 * QUINZENA FECHADA não bloqueia. O snapshot de comissao_periodo_item é linha
 * persistida e fecharPeriodosPendentes() nunca reabre período fechado — o que
 * já foi pago não muda, faça-se o que se fizer aqui. Bloquear só impediria
 * corrigir o registro. O pedido passa a divergir daquela apuração, e é
 * intencional: o front avisa antes de salvar (periodo_fechado no GET).
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

      // Diário ANTES de qualquer escrita, na MESMA transação: se qualquer passo
      // abaixo falhar, o registro some junto no rollback (ver utils/auditoria.js).
      // As movimentações entram no snapshot porque a Fase D as apaga e recria —
      // sem isso o estado anterior de estoque não seria reconstruível.
      const movsAntes = await tx.movimentacoes_som.findMany({
        where: { motivo: `Pedido Som #${id}` },
      });
      await registrarAuditoria(tx, {
        linha: 'som',
        entidade: ENTIDADES.PEDIDO_SOM,
        entidadeId: antes.id,
        acao: ACOES.EDICAO,
        conteudoAnterior: {
          pedido: { ...antes, itens: undefined },
          itens: antes.itens,
          movimentacoes: movsAntes,
        },
        user: req.user,
      });

      let mexeuNosItens = false;

      // ── Fase D: itens de PRODUTO (o único caminho que MOVE ESTOQUE) ──
      //
      // ESTORNA TUDO E REAPLICA, e não um delta por item: movimentacoes_som se
      // liga ao pedido só pelo motivo 'Pedido Som #N', sem vínculo com o item.
      // Dois itens do mesmo produto geram movimentações indistinguíveis, então
      // "desfazer a movimentação daquele item" não é implementável. O caminho
      // uniforme também é o que a Fase A já provou no DELETE.
      if (mexeu('itens_produto') && body.itens_produto != null) {
        // 1) Estorno das baixas atuais. Falha (409 + rollback) se não couber no
        //    acumulado, em vez de truncar em zero — utils/estorno.js.
        for (const it of antes.itens) {
          if (it.tipo !== 'PRODUTO' || !it.baixa_estoque || !it.produto_id) continue;
          const prod = await tx.estoque_som.findUnique({ where: { id: it.produto_id } });
          if (!prod) {
            throw Object.assign(
              new Error(`Produto ${it.produto_id} do item "${it.descricao}" não existe mais. Nada foi alterado.`),
              { statusCode: 409 },
            );
          }
          const estorno = dadosEstorno({
            tipo: 'SAIDA',
            quantidade: it.quantidade,
            produto: prod,
            rotulo: [prod.produto, prod.modelo].filter(Boolean).join(' - '),
          });
          if (estorno) await tx.estoque_som.update({ where: { id: it.produto_id }, data: estorno });
        }

        // 2) Fora as baixas e os itens antigos. O deleteMany é por motivo: não
        //    existe seletividade por item, e não faz falta — tudo é recriado.
        await tx.movimentacoes_som.deleteMany({ where: { motivo: `Pedido Som #${id}` } });
        await tx.pedido_som_item.deleteMany({ where: { pedido_id: id, tipo: 'PRODUTO' } });

        // 3) Reaplica sobre o saldo JÁ ESTORNADO. A ordem é o ponto todo: subir
        //    um item de 2 para 3 un. num produto zerado É válido, porque as 2
        //    deste mesmo pedido voltaram no passo 1. Validar antes daria 409
        //    indevido.
        for (const it of body.itens_produto) {
          const produtoId = Number(it.produto_id);
          const quantidade = toInt(it.quantidade, 0);
          const valorUnit = Number(it.valor_unit);

          // Releitura DENTRO do laço: se o mesmo produto aparecer em dois itens,
          // o segundo precisa enxergar a baixa do primeiro (validação cumulativa).
          const prod = await tx.estoque_som.findUnique({ where: { id: produtoId } });
          if (!prod) {
            throw Object.assign(new Error(`Produto ${produtoId} não encontrado`), { statusCode: 404 });
          }
          const descricao = [prod.produto, prod.modelo].filter(Boolean).join(' - ');
          const emEstoque = Number(
            prod.em_estoque ??
              (Number(prod.qtd_inicial || 0) + Number(prod.entradas || 0) - Number(prod.saidas || 0)),
          );
          if (quantidade > emEstoque) {
            throw Object.assign(
              new Error(`Estoque insuficiente para "${descricao}". Atual: ${emEstoque}`),
              { statusCode: 409 },
            );
          }

          await tx.movimentacoes_som.create({
            data: {
              estoque: { connect: { id: produtoId } },
              tipo: 'SAIDA',
              quantidade,
              valor_final: toMoneyStr(valorUnit),
              motivo: `Pedido Som #${id}`,
              // Data do PEDIDO, não a de agora: recriar com a data de hoje faria
              // uma venda de julho aparecer como saída de estoque desta semana.
              data_movimentacao: antes.created_at,
              user_id: req.user?.id ?? null,
              created_by: req.user?.email ?? null,
            },
          });

          // increment atômico (SET saidas = saidas + n), não read-modify-write:
          // mesma correção de concorrência que a Fase A fez no decrement.
          await tx.estoque_som.update({
            where: { id: produtoId },
            data: { saidas: { increment: quantidade } },
          });

          await tx.pedido_som_item.create({
            data: {
              pedido_id: id,
              tipo: 'PRODUTO',
              produto_id: produtoId,
              classe_id: null,
              descricao: descricao.slice(0, 150),
              quantidade,
              // Preço vem do PAYLOAD. O backend nunca puxa o preço atual do
              // produto: mudar a quantidade de um pedido antigo não pode
              // reprecificá-lo pela tabela de hoje (mesma regra da mão de obra).
              valor_unit: toMoneyStr(valorUnit),
              valor_total: toMoneyStr(round2(quantidade * valorUnit)),
              mao_obra_unit: null,
              mao_obra_total: null,
              baixa_estoque: true,
            },
          });
        }
        mexeuNosItens = true;
      }

      // ── Fase C2: itens de SERVIÇO ──
      // Substituição em bloco: a lista do body passa a ser a lista do pedido.
      // Os itens PRODUTO não entram no deleteMany nem são reescritos — só serão
      // LIDOS na reagregação, para somar. Nenhuma movimentação de estoque é
      // criada ou desfeita aqui.
      if (mexeu('itens_servico') && body.itens_servico != null) {
        const novos = [];
        for (const it of body.itens_servico) {
          const quantidade = toInt(it?.quantidade, 0);
          if (!(quantidade > 0)) {
            throw Object.assign(new Error('quantidade do serviço deve ser > 0.'), { statusCode: 400 });
          }
          let descricao = String(it?.descricao || '').trim();
          let maoObraUnit;

          if (it?.classe_id) {
            const classe = await tx.classe_som.findUnique({ where: { id: Number(it.classe_id) } });
            if (!classe) {
              throw Object.assign(new Error(`Classe ${it.classe_id} não encontrada`), { statusCode: 404 });
            }
            // Valor da classe SÓ quando o body não informa — a tela manda o
            // mao_obra_unit gravado de cada item existente, então item não
            // tocado nunca é reprecificado pela tabela de hoje.
            maoObraUnit = it?.mao_obra_unit != null ? Number(it.mao_obra_unit) : Number(classe.valor_mao_obra ?? 0) || 0;
            if (!descricao) descricao = classe.nome;
          } else {
            // Serviço manual: sem classe, o valor tem que vir e a descrição é a
            // única coisa que identifica o serviço no histórico.
            maoObraUnit = it?.mao_obra_unit != null ? Number(it.mao_obra_unit) : 0;
            if (!(maoObraUnit > 0)) {
              throw Object.assign(
                new Error('no serviço avulso, informe a classe ou um valor de mão de obra > 0.'),
                { statusCode: 400 },
              );
            }
            if (!descricao) {
              throw Object.assign(new Error('descrição da mão de obra é obrigatória.'), { statusCode: 400 });
            }
          }

          const maoObraTotal = round2(quantidade * maoObraUnit);
          novos.push({
            pedido_id: id,
            tipo: 'MAO_OBRA',
            produto_id: null,
            classe_id: it?.classe_id ? Number(it.classe_id) : null,
            descricao: descricao.slice(0, 150),
            quantidade,
            // Serviço não tem preço de peça: o dinheiro dele vive em mao_obra_*
            // (mesmo formato que o POST grava).
            valor_unit: '0.00',
            valor_total: '0.00',
            mao_obra_unit: maoObraUnit > 0 ? toMoneyStr(maoObraUnit) : null,
            mao_obra_total: maoObraTotal > 0 ? toMoneyStr(maoObraTotal) : null,
            baixa_estoque: false,
          });
        }

        await tx.pedido_som_item.deleteMany({ where: { pedido_id: id, tipo: 'MAO_OBRA' } });
        for (const novo of novos) await tx.pedido_som_item.create({ data: novo });
        mexeuNosItens = true;
      }

      // ── Fase C2: mão de obra de item PRODUTO legado (pedidos pré-M2) ──
      // Só o valor. produto_id, quantidade e baixa_estoque ficam como estão, e
      // por isso estoque continua fora do alcance desta rota.
      if (mexeu('mao_obra_produtos') && body.mao_obra_produtos != null) {
        for (const alvo of body.mao_obra_produtos) {
          const item = antes.itens.find((i) => i.id === Number(alvo.item_id));
          if (!item || item.tipo !== 'PRODUTO') {
            throw Object.assign(
              new Error(`Item ${alvo.item_id} não é um item de produto deste pedido.`),
              { statusCode: 400 },
            );
          }
          const unit = Number(alvo.mao_obra_unit) || 0;
          const total = round2(Number(item.quantidade || 0) * unit);
          await tx.pedido_som_item.update({
            where: { id: item.id },
            data: {
              mao_obra_unit: unit > 0 ? toMoneyStr(unit) : null,
              mao_obra_total: total > 0 ? toMoneyStr(total) : null,
            },
          });
        }
        mexeuNosItens = true;
      }

      // Reagregação ÚNICA, depois de produtos e serviços: o invariante
      // (cabeçalho = Σ itens) só precisa valer no fim da transação, e rodar duas
      // vezes deixaria um estado intermediário incoerente se algo falhasse entre
      // elas. Só roda quando os itens mudaram — uma edição de forma/veículo
      // (Fase C) não pode mexer em valor_total nem em comissão.
      if (mexeuNosItens) await reagregarPedido(tx, id);

      // Cabeçalho por último: é o passo que não pode falhar, e deixá-lo no fim
      // mantém a ordem "primeiro o que dá 409".
      const data = { forma_pagamento: formaFinal, parcelas: parcelasFinal };
      if (mexeu('veiculo')) {
        data.veiculo = body.veiculo ? String(body.veiculo).trim().slice(0, 100) : null;
      }
      await tx.pedido_som.update({ where: { id }, data });

      return tx.pedido_som.findUnique({ where: { id }, include: { itens: true } });
    }, {
      // A Fase D faz várias idas ao banco por item (estorno, releitura,
      // movimentação, agregado, item). O default do Prisma é 5s, e o modo de
      // falha seria péssimo: timeout DEPOIS de já ter estornado estoque. O teto
      // de 50 itens do Zod e este tempo maior atacam o mesmo risco pelas duas
      // pontas. Só aqui — o default global segue intocado.
      timeout: 15000,
      maxWait: 5000,
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

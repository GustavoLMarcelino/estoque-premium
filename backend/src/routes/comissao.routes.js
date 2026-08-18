import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { requireAdmin } from '../middlewares/auth.js';
import { validate, idParams } from '../middlewares/validate.js';
import { editarConfigBody } from '../schemas/comissao.schema.js';
import {
  VENDEDORES_BATERIA, VENDEDOR_MAO_OBRA, periodoDe, rotuloPeriodo,
} from '../utils/comissao.js';

export const comissaoRouter = Router();

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const toMoneyStr = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
};

/** Config é um singleton; se não existir, cria com os padrões (R$15 / 30%).
 *  Assim produção funciona sem depender do seed rodar no deploy. */
async function getConfig(client = prisma) {
  const existente = await client.comissao_config.findFirst({ orderBy: { id: 'asc' } });
  if (existente) return existente;
  return client.comissao_config.create({
    data: { valor_bateria: '15.00', percentual_mao_obra: '30.00', percentual_insulfilme: '25.00' },
  });
}

/** Apura a comissão de cada vendedor no intervalo [inicio, proximoInicio).
 *  Usado tanto para o período atual (ao vivo) quanto para fechar períodos
 *  passados (o resultado é então persistido). Não toca o banco de escrita. */
async function apurar(client, inicio, proximoInicio, config) {
  const valorBateria = Number(config.valor_bateria) || 0;
  // Fallback para item sem percentual_comissao gravado (anterior à migração de
  // 17/08/2026). Depois do backfill não deveria existir nenhum.
  const pctFallback = Number(config.percentual_mao_obra) || 0;

  // Baterias: soma de quantidade por vendedor (exclui empréstimo de garantia).
  const grupos = await client.movimentacoes.groupBy({
    by: ['vendedor'],
    where: {
      tipo: 'SAIDA',
      garantia_id: null,
      vendedor: { in: VENDEDORES_BATERIA },
      data_movimentacao: { gte: inicio, lt: proximoInicio },
    },
    _sum: { quantidade: true },
  });
  const qtdPorVendedor = new Map(grupos.map((g) => [g.vendedor, Number(g._sum.quantidade || 0)]));

  const baterias = VENDEDORES_BATERIA.map((nome) => {
    const qtd = qtdPorVendedor.get(nome) || 0;
    return {
      vendedor: nome,
      tipo: 'BATERIA',
      qtd_baterias: qtd,
      base_mao_obra: 0,
      valor_comissao: round2(qtd * valorBateria),
    };
  });

  // Joel: cada item de mão de obra tem a SUA própria %, congelada na venda.
  // A conta é Σ (mao_obra_total × percentual_comissao / 100) — sem categoria,
  // sem balde global. O cabeçalho pedido_som.valor_mao_obra deixou de ser a
  // fonte da apuração: ele continua sendo o total exibido no pedido, mas a
  // comissão depende da % de cada linha, que só existe no item.
  //
  // SEM FILTRO POR TIPO, de propósito: item PRODUTO com mao_obra_total > 0
  // existe no histórico (legado de quando o produto carregava classe) e sempre
  // contou na base. Filtrar por tipo='MAO_OBRA' encolheria a comissão do
  // passado em silêncio — há teste de regressão cobrindo exatamente isto.
  const itensMaoObra = await client.pedido_som_item.findMany({
    where: {
      mao_obra_total: { not: null },
      pedido: { created_at: { gte: inicio, lt: proximoInicio } },
    },
    select: { mao_obra_total: true, percentual_comissao: true },
  });

  let baseTotal = 0;
  let comissaoAcc = 0;
  for (const it of itensMaoObra) {
    const mo = Number(it.mao_obra_total) || 0;
    if (!mo) continue;
    const pct = it.percentual_comissao != null ? Number(it.percentual_comissao) : pctFallback;
    baseTotal += mo;
    comissaoAcc += (mo * pct) / 100;
  }

  const joel = {
    vendedor: VENDEDOR_MAO_OBRA,
    tipo: 'MAO_OBRA',
    qtd_baterias: 0,
    base_mao_obra: round2(baseTotal),
    // Arredonda UMA vez, no fim: item a item afastaria este total da soma dos
    // comissao_joel gravados nos cabeçalhos.
    valor_comissao: round2(comissaoAcc),
  };

  return [...baterias, joel];
}

/** Persiste o snapshot de um período fechado (período + itens por vendedor). */
async function fecharPeriodo(client, p, config) {
  const itens = await apurar(client, p.inicio, p.proximoInicio, config);
  await client.comissao_periodo.create({
    data: {
      data_inicio: p.inicio,
      data_fim: p.fim,
      itens: {
        create: itens.map((i) => ({
          vendedor: i.vendedor,
          qtd_baterias: i.qtd_baterias,
          base_mao_obra: toMoneyStr(i.base_mao_obra),
          valor_comissao: toMoneyStr(i.valor_comissao),
          snap_valor_bateria: toMoneyStr(config.valor_bateria),
          // Média ponderada do período: com % por item não existe mais um
          // percentual único a congelar. Base 0 (bateria) fica null — não há
          // percentual a exibir ali.
          snap_percentual_efetivo: Number(i.base_mao_obra) > 0
            ? toMoneyStr((Number(i.valor_comissao) / Number(i.base_mao_obra)) * 100)
            : null,
          // Campos legados do modelo de dois baldes: não são mais escritos. O
          // @default(0) do schema preenche — snap_percentual é NOT NULL no RDS.
        })),
      },
    },
  });
}

/** Fechamento preguiçoso (sem cron): ao acessar, fecha todo período anterior ao
 *  atual que ainda não tem snapshot. Idempotente — para no primeiro já fechado
 *  (o fechamento é contíguo). Na primeira execução faz o backfill do histórico
 *  até a data mais antiga com movimento/pedido. */
async function fecharPeriodosPendentes(hoje = new Date()) {
  const config = await getConfig(prisma);
  const atual = periodoDe(hoje);

  const [movMin, pedMin] = await Promise.all([
    prisma.movimentacoes.aggregate({ _min: { data_movimentacao: true } }),
    prisma.pedido_som.aggregate({ _min: { created_at: true } }),
  ]);
  const datas = [movMin._min.data_movimentacao, pedMin._min.created_at]
    .filter(Boolean)
    .map((d) => new Date(d).getTime());
  if (datas.length === 0) return;
  const earliest = Math.min(...datas);

  let cursorFim = new Date(atual.inicio.getTime() - 1); // fim do período anterior
  // trava de segurança contra loop infinito (máx. ~10 anos de quinzenas)
  let guarda = 0;
  while (cursorFim.getTime() >= earliest && guarda < 260) {
    guarda += 1;
    const p = periodoDe(cursorFim);
    const existe = await prisma.comissao_periodo.findFirst({ where: { data_inicio: p.inicio } });
    if (existe) break;
    await fecharPeriodo(prisma, p, config);
    cursorFim = new Date(p.inicio.getTime() - 1);
  }
}

/** GET /api/comissao/config */
comissaoRouter.get('/config', async (req, res, next) => {
  try {
    const cfg = await getConfig();
    res.json({ data: cfg });
  } catch (e) {
    console.error('GET /api/comissao/config ERRO:', e);
    next(e);
  }
});

/** PUT /api/comissao/config — apenas admin. */
comissaoRouter.put('/config', requireAdmin, validate({ body: editarConfigBody }), async (req, res, next) => {
  try {
    const atual = await getConfig();
    const data = { updated_by: req.user?.email ?? null };
    if (req.body.valor_bateria != null) data.valor_bateria = toMoneyStr(req.body.valor_bateria);
    if (req.body.percentual_mao_obra != null) data.percentual_mao_obra = toMoneyStr(req.body.percentual_mao_obra);
    if (req.body.percentual_insulfilme != null) data.percentual_insulfilme = toMoneyStr(req.body.percentual_insulfilme);
    const cfg = await prisma.comissao_config.update({ where: { id: atual.id }, data });
    res.json({ data: cfg });
  } catch (e) {
    console.error('PUT /api/comissao/config ERRO:', e);
    next(e);
  }
});

/** GET /api/comissao/painel — período atual (ao vivo) + fecha pendências. */
comissaoRouter.get('/painel', async (req, res, next) => {
  try {
    await fecharPeriodosPendentes();
    const config = await getConfig();
    const atual = periodoDe(new Date());
    const vendedores = await apurar(prisma, atual.inicio, atual.proximoInicio, config);
    res.json({
      data: {
        periodo: {
          inicio: atual.inicio,
          fim: atual.fim,
          rotulo: rotuloPeriodo(atual.inicio, atual.fim),
        },
        config: {
          valor_bateria: config.valor_bateria,
          percentual_mao_obra: config.percentual_mao_obra,
          percentual_insulfilme: config.percentual_insulfilme,
        },
        vendedores,
      },
    });
  } catch (e) {
    console.error('GET /api/comissao/painel ERRO:', e);
    next(e);
  }
});

/** GET /api/comissao/periodos — histórico de períodos fechados (mais recente 1º). */
comissaoRouter.get('/periodos', async (req, res, next) => {
  try {
    const data = await prisma.comissao_periodo.findMany({
      orderBy: { data_inicio: 'desc' },
      include: { itens: true },
    });
    const comRotulo = data.map((p) => ({ ...p, rotulo: rotuloPeriodo(p.data_inicio, p.data_fim) }));
    res.json({ data: comRotulo });
  } catch (e) {
    console.error('GET /api/comissao/periodos ERRO:', e);
    next(e);
  }
});

/** GET /api/comissao/periodos/:id — detalhe de um período fechado. */
comissaoRouter.get('/periodos/:id', validate({ params: idParams }), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const p = await prisma.comissao_periodo.findUnique({ where: { id }, include: { itens: true } });
    if (!p) return res.status(404).json({ error: true, message: 'Período não encontrado.' });
    res.json({ data: { ...p, rotulo: rotuloPeriodo(p.data_inicio, p.data_fim) } });
  } catch (e) {
    console.error('GET /api/comissao/periodos/:id ERRO:', e);
    next(e);
  }
});

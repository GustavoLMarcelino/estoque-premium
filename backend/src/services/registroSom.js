// Registro de Movimentação do Som — uma linha por PEDIDO, agrupada por dia.
//
// Os pedidos (pedido_som) e as saídas avulsas/entradas (movimentacoes_som) vivem
// em tabelas diferentes, e as saídas que um pedido gerou (motivo 'Pedido Som
// #N') são só a baixa de estoque dele — mostrá-las ao lado do pedido duplicaria
// a informação. Esta camada junta as duas fontes, esconde as filhas e devolve
// tudo já recortado por DIA, com os totais calculados no servidor.
//
// DIA: calculado em America/Sao_Paulo (UTC−3 fixo desde 2019, sem horário de
// verão — mesma premissa de utils/comissao.js). Os limites são instantes UTC
// exatos e a consulta filtra por intervalo [início, fim), então uma venda às
// 23h30 de Brasília cai no dia certo mesmo com o servidor em UTC.
//
// NUNCA ordena por id: a edição de produtos de um pedido recria as
// movimentações com ids novos, então id não representa cronologia.

import { ehMovimentacaoDePedido } from '../utils/estorno.js';
import { inicioDosPeriodosFechados, marcarPeriodoFechado } from '../utils/comissao.js';
import { diaBRT, inicioDoDiaBRT } from '../utils/fusoBrasilia.js';

export { diaBRT }; // os testes e a rota importam daqui
const DIA_MS = 24 * 60 * 60 * 1000;

export const FILTROS = ['tudo', 'pedidos', 'entradas', 'avulsas'];
export const DIAS_POR_BLOCO = 31;
// Teto do intervalo pedido. O resumo do período é agregado no banco (barato),
// mas cada bloco de 31 dias lê linhas; 366 dias cobre "o ano" sem deixar um
// de=2000-01-01 varrer a tabela inteira.
export const MAX_DIAS_INTERVALO = 366;

const SO_DATA = /^\d{4}-\d{2}-\d{2}$/;

const num = (v) => (v == null ? 0 : Number(String(v)) || 0);
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** true quando `s` é 'YYYY-MM-DD' E uma data que existe (rejeita 2026-02-30). */
export function dataValida(s) {
  if (typeof s !== 'string' || !SO_DATA.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Soma `n` dias (pode ser negativo) a uma data 'YYYY-MM-DD'. Aritmética em UTC:
 *  sem horário de verão no meio, dia é sempre 24h. */
export function somaDias(ymd, n) {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10);
}

/** Dias entre duas datas, inclusivo nas duas pontas (de == ate → 1). */
export function diasNoIntervalo(de, ate) {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / DIA_MS) + 1;
}

/** Instante UTC de 00:00 (Brasília) do dia `ymd`. */
export const inicioDoDia = inicioDoDiaBRT;

/** Intervalo [gte, lt) em UTC que cobre os dias de..ate (Brasília) inteiros. */
function intervalo(de, ate) {
  return { gte: inicioDoDia(de), lt: inicioDoDia(somaDias(ate, 1)) };
}

/** Divide de..ate no bloco que esta chamada devolve e no que sobra.
 *  Os 31 dias MAIS RECENTES vêm primeiro; proximoAte é o dia anterior ao
 *  último devolvido, ou null quando o intervalo acabou. */
export function blocoDoIntervalo(de, ate) {
  if (de > ate) {
    throw new Error('A data inicial não pode ser maior que a final');
  }
  const blocoDe = diasNoIntervalo(de, ate) > DIAS_POR_BLOCO
    ? somaDias(ate, -(DIAS_POR_BLOCO - 1))
    : de;
  return { blocoDe, proximoAte: blocoDe > de ? somaDias(blocoDe, -1) : null };
}

const contem = (q) => ({ contains: q });

function wherePedidos(de, ate, q) {
  const where = { created_at: intervalo(de, ate) };
  if (q) {
    where.OR = [
      { veiculo: contem(q) },
      { itens: { some: { descricao: contem(q) } } },
    ];
  }
  return where;
}

function whereMovs(de, ate, q, filtro) {
  const where = { data_movimentacao: intervalo(de, ate) };
  if (filtro === 'entradas') where.tipo = 'ENTRADA';
  if (filtro === 'avulsas') where.tipo = 'SAIDA';
  if (q) where.estoque = { OR: [{ produto: contem(q) }, { modelo: contem(q) }] };
  return where;
}

const incluiPedidos = (filtro) => filtro === 'tudo' || filtro === 'pedidos';
const incluiMovs = (filtro) => filtro !== 'pedidos';

/**
 * Totais do intervalo INTEIRO (não só do bloco devolvido), respeitando filtro e
 * q. Agregado no banco: não carrega os pedidos de um ano para somar.
 * Só pedidos entram — saída/entrada avulsa não tem receita registrada.
 */
async function resumoDoPeriodo(client, { de, ate, q, filtro, admin }) {
  let pedidos = 0;
  let total = 0;
  let comissao = 0;
  if (incluiPedidos(filtro)) {
    const agg = await client.pedido_som.aggregate({
      where: wherePedidos(de, ate, q),
      _count: { _all: true },
      _sum: { valor_total: true, comissao_joel: true },
    });
    pedidos = agg._count._all;
    total = round2(num(agg._sum.valor_total));
    comissao = round2(num(agg._sum.comissao_joel));
  }
  return { pedidos, total, ...(admin ? { comissao } : {}) };
}

/**
 * @param {object} client  prisma (ou tx)
 * @param {object} p
 * @param {string} p.de, p.ate  'YYYY-MM-DD' (Brasília), já validados, de <= ate
 * @param {string} p.filtro     tudo | pedidos | entradas | avulsas
 * @param {string} p.q
 * @param {object} p.user       req.user — define o que sai (comissão só admin)
 * @param {function} p.sanitizar  remoção de campos de comissão para não-admin
 *                                (a MESMA de GET /pedido-som, injetada para não duplicar)
 */
export async function montarRegistro(client, { de, ate, filtro, q, user, sanitizar }) {
  const admin = user?.role === 'admin';
  const { blocoDe, proximoAte } = blocoDoIntervalo(de, ate);

  const [resumoPeriodo, pedidos, movs, fechados] = await Promise.all([
    resumoDoPeriodo(client, { de, ate, q, filtro, admin }),
    incluiPedidos(filtro)
      ? client.pedido_som.findMany({
          where: wherePedidos(blocoDe, ate, q),
          orderBy: { created_at: 'desc' },
          include: { itens: true },
        })
      : [],
    incluiMovs(filtro)
      ? client.movimentacoes_som.findMany({
          where: whereMovs(blocoDe, ate, q, filtro),
          orderBy: { data_movimentacao: 'desc' },
          include: { estoque: { select: { produto: true, modelo: true } } },
        })
      : [],
    inicioDosPeriodosFechados(client, user),
  ]);

  // Filha de pedido = motivo no formato do pedido E o pedido existe. Sem pedido
  // (apagado por um caminho antigo) a movimentação é estoque saindo sem dono, e
  // sumir com ela esconderia isso: volta como avulsa, marcada órfã.
  const idsCitados = [...new Set(
    movs.filter((m) => ehMovimentacaoDePedido(m.motivo))
      .map((m) => Number(String(m.motivo).trim().match(/\d+$/)[0])),
  )];
  const existentes = idsCitados.length
    ? new Set((await client.pedido_som.findMany({
        where: { id: { in: idsCitados } }, select: { id: true },
      })).map((p) => p.id))
    : new Set();

  const linhas = [];

  for (const p of pedidos) {
    linhas.push({
      kind: 'pedido',
      key: `p-${p.id}`,
      data: p.created_at,
      pedido: marcarPeriodoFechado(sanitizar(p, user), fechados),
    });
  }

  for (const m of movs) {
    let orfa = false;
    if (ehMovimentacaoDePedido(m.motivo)) {
      const pedidoId = Number(String(m.motivo).trim().match(/\d+$/)[0]);
      if (existentes.has(pedidoId)) continue;
      orfa = true;
    }
    const unitario = num(m.valor_final);
    linhas.push({
      kind: 'mov',
      key: `m-${m.id}`,
      data: m.data_movimentacao,
      mov: {
        id: m.id,
        tipo: String(m.tipo).toUpperCase() === 'ENTRADA' ? 'ENTRADA' : 'SAIDA',
        produto: m.estoque?.produto ?? '—',
        modelo: m.estoque?.modelo ?? '',
        quantidade: Number(m.quantidade) || 0,
        valor_unitario: unitario,
        // valor_final é UNITÁRIO; o que a linha mostra é o total da saída.
        valor: round2(unitario * (Number(m.quantidade) || 0)),
        orfa,
      },
    });
  }

  // Sort estável: empate de instante preserva a ordem de inserção (pedidos
  // antes de movimentações), sem desempatar por id.
  linhas.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

  const porDia = new Map();
  for (const l of linhas) {
    const dia = diaBRT(new Date(l.data));
    if (!porDia.has(dia)) porDia.set(dia, []);
    porDia.get(dia).push(l);
  }

  const dias = [...porDia.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([data, doDia]) => {
      const peds = doDia.filter((l) => l.kind === 'pedido');
      const resumo = {
        pedidos: peds.length,
        total: round2(peds.reduce((s, l) => s + num(l.pedido.valor_total), 0)),
      };
      if (admin) resumo.comissao = round2(peds.reduce((s, l) => s + num(l.pedido.comissao_joel), 0));
      return { data, resumo, linhas: doDia };
    });

  return { dias, proximoAte, resumoPeriodo };
}

// Regras de período da comissão quinzenal e constantes de vendedores.
// Período: dia 1–15 e dia 16 até o último dia do mês. Funções puras (sem banco)
// para facilitar teste unitário; a apuração/fechamento que toca o banco fica na
// rota (comissao.routes.js).
//
// FUSO: o corte é ancorado em America/Sao_Paulo (horário de Brasília), NÃO no
// fuso do servidor. Isso importa porque comissão é dinheiro: uma venda às 23h30
// (BRT) do dia 15 tem que cair na 1ª quinzena mesmo que o servidor rode em UTC
// (onde já seria dia 16). São Paulo é fixo UTC−3 desde 2019 (sem horário de
// verão), então usamos o offset fixo -03:00 para construir instantes exatos.

const TZ = 'America/Sao_Paulo';
const OFFSET_BRT = '-03:00';

// Vendedores que ganham por bateria vendida (R$ fixos por unidade).
export const VENDEDORES_BATERIA = ['Gustavo', 'Ismael'];
// Vendedor que ganha % sobre a mão de obra de instalação de som.
export const VENDEDOR_MAO_OBRA = 'Joel';

/** Componentes de data (ano, mês 1-12, dia) do instante `date` no fuso de SP. */
function ymdBRT(date) {
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date); // "YYYY-MM-DD"
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

/** Instante UTC correspondente à meia-noite (00:00 BRT) de y-m-d. */
function meiaNoiteBRT(y, m, d) {
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return new Date(`${y}-${mm}-${dd}T00:00:00.000${OFFSET_BRT}`);
}

/** Período quinzenal (em horário de Brasília) que contém `date`.
 *  Retorna instantes: `inicio` (00:00 BRT do 1º dia da quinzena) e `fim`
 *  (último milissegundo da quinzena) inclusivos, e `proximoInicio` (00:00 BRT
 *  da quinzena seguinte) para usar como limite exclusivo em queries
 *  (`>= inicio` e `< proximoInicio`). */
export function periodoDe(date) {
  const { y, m, d } = ymdBRT(date);

  if (d <= 15) {
    const inicio = meiaNoiteBRT(y, m, 1);
    const proximoInicio = meiaNoiteBRT(y, m, 16);
    return { inicio, fim: new Date(proximoInicio.getTime() - 1), proximoInicio };
  }
  const inicio = meiaNoiteBRT(y, m, 16);
  // 1º dia do mês seguinte = fim da 2ª quinzena (cobre 28/29/30/31 sem cálculo).
  const proximoInicio = m === 12 ? meiaNoiteBRT(y + 1, 1, 1) : meiaNoiteBRT(y, m + 1, 1);
  return { inicio, fim: new Date(proximoInicio.getTime() - 1), proximoInicio };
}

/** Período imediatamente anterior ao que começa em `inicio`. */
export function periodoAnterior(inicio) {
  return periodoDe(new Date(inicio.getTime() - 1));
}

/** "01/07 a 15/07" — rótulo curto do período, formatado em horário de Brasília. */
export function rotuloPeriodo(inicio, fim) {
  const fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' });
  return `${fmt.format(new Date(inicio))} a ${fmt.format(new Date(fim))}`;
}

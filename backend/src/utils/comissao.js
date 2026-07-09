// Regras de período da comissão quinzenal e constantes de vendedores.
// Período: dia 1–15 e dia 16 até o último dia do mês. Funções puras (sem banco)
// para facilitar teste unitário; a apuração/fechamento que toca o banco fica na
// rota (comissao.routes.js).

// Vendedores que ganham por bateria vendida (R$ fixos por unidade).
export const VENDEDORES_BATERIA = ['Gustavo', 'Ismael'];
// Vendedor que ganha % sobre a mão de obra de instalação de som.
export const VENDEDOR_MAO_OBRA = 'Joel';

/** Período quinzenal que contém `date`.
 *  Retorna limites como Date: `inicio` (00:00:00) e `fim` (23:59:59.999)
 *  inclusivos, e `proximoInicio` (00:00:00 do período seguinte) para usar como
 *  limite exclusivo em queries (`>= inicio` e `< proximoInicio`). */
export function periodoDe(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = d.getMonth();
  const dia = d.getDate();

  if (dia <= 15) {
    return {
      inicio: new Date(y, m, 1, 0, 0, 0, 0),
      fim: new Date(y, m, 15, 23, 59, 59, 999),
      proximoInicio: new Date(y, m, 16, 0, 0, 0, 0),
    };
  }
  const ultimoDia = new Date(y, m + 1, 0).getDate(); // dia 0 do mês seguinte = último deste
  return {
    inicio: new Date(y, m, 16, 0, 0, 0, 0),
    fim: new Date(y, m, ultimoDia, 23, 59, 59, 999),
    proximoInicio: new Date(y, m + 1, 1, 0, 0, 0, 0),
  };
}

/** Período imediatamente anterior ao que começa em `inicio`. */
export function periodoAnterior(inicio) {
  return periodoDe(new Date(inicio.getTime() - 1));
}

/** "01/07 a 15/07" — rótulo curto do período (dd/mm). */
export function rotuloPeriodo(inicio, fim) {
  const dd = (x) => String(x.getDate()).padStart(2, '0');
  const mm = (x) => String(x.getMonth() + 1).padStart(2, '0');
  return `${dd(inicio)}/${mm(inicio)} a ${dd(fim)}/${mm(fim)}`;
}

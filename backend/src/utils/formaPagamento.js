// Normalização da FORMA DE PAGAMENTO para as chaves que src/utils/taxas.js
// entende ('dinheiro' | 'pix' | 'debito' | 'credito').
//
// POR QUE EXISTE: as duas linhas gravam a forma em formatos diferentes.
// Baterias (movimentacoes.forma_pagamento) já é a chave, validada por z.enum.
// Som (pedido_som.forma_pagamento) é VARCHAR livre, escrito pela tela em
// português com acento e, no crédito, com o nº de parcelas embutido:
//   "Crédito à vista" | "Crédito 2x".."Crédito 10x"   (a partir da Fase 0)
//   "Crédito parcelado"                                (histórico anterior)
//   "Dinheiro" | "Débito" | "PIX"                      (e minúsculas, via API)
// Sem normalizar, o switch de intermediacaoPct cai no default e TODO pedido de
// Som viraria "sem forma de pagamento".
//
// Reusa semAcento (fonte única da regra acento-insensível) e a mesma detecção
// por prefixo que usaPrecoParcelado já faz em precos.js — assim a forma que
// escolhe o PREÇO e a que escolhe a TAXA nunca divergem. Import cross-boundary
// como em utils/margem.js: o deploy sobe o repo inteiro via git pull.
import { semAcento } from '../../../frontend/src/utils/texto.js';

// Prefixo → chave. Ordem não importa (os prefixos não se sobrepõem).
const PREFIXOS = [
  ['dinheiro', 'dinheiro'],
  ['pix', 'pix'],
  ['debito', 'debito'],
  ['credito', 'credito'],
];

/** Chave de taxa da forma informada, ou null quando ausente/desconhecida.
 *  null NUNCA vira taxa 0 silenciosa: quem chama tem que sinalizar (o
 *  dashboard conta em vendasSemForma). */
export function normalizarForma(forma) {
  const s = semAcento(forma).trim();
  if (!s) return null;
  const hit = PREFIXOS.find(([prefixo]) => s.startsWith(prefixo));
  return hit ? hit[1] : null;
}

/** true quando a forma é crédito mas o nº de parcelas não foi capturado
 *  (pedidos de Som anteriores à Fase 0, que não tinham a coluna).
 *
 *  É um caso que PRECISA ser tratado à parte: taxas.js faz
 *  `Math.trunc(Number(parcelas) || 1)`, então parcelas null cairia
 *  silenciosamente na faixa de 1x (intermediação ~3,43%, SEM antecipação) —
 *  quando a venda pode ter sido 10x (~12,75%). Seria um erro de até ~9,3
 *  pontos percentuais com cara de número exato. Sem o nº real, o certo é
 *  admitir que não dá para calcular e sinalizar. */
export function creditoSemParcelas(formaNormalizada, parcelas) {
  return formaNormalizada === 'credito' && (parcelas == null || parcelas === '');
}

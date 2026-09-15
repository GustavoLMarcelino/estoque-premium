// Espelho em JS puro do motor de taxas do cartão do backend
// (backend/src/utils/taxas.js) — mantido sincronizado de propósito: usa as
// MESMAS faixas de parcelas (à vista / 2–6x / 7–12x) e a mesma fórmula de
// antecipação já usadas no dashboard financeiro, para o orçamento nunca
// prometer ao cliente um valor diferente do que a maquininha realmente cobra.

/** Fração (0–1) descontada pela antecipação de N parcelas a i% ao mês. */
export function antecipacaoFrac(parcelas, taxaMesPct) {
  const n = Math.trunc(Number(parcelas) || 0);
  const i = Number(taxaMesPct) / 100;
  if (n <= 1 || !(i > 0)) return 0;
  let soma = 0;
  for (let k = 1; k <= n; k += 1) soma += 1 / (1 + i) ** k;
  return 1 - soma / n;
}

function intermediacaoCreditoPct(parcelas, cfg) {
  const n = Math.trunc(Number(parcelas) || 1);
  if (n <= 1) return Number(cfg?.credito_avista_pct) || 0;
  if (n <= 6) return Number(cfg?.credito_2a6_pct) || 0;
  return Number(cfg?.credito_7a12_pct) || 0;
}

/** Taxa efetiva (%) do crédito parcelado: intermediação da faixa + antecipação. */
export function taxaCreditoEfetivaPct(parcelas, cfg) {
  const base = intermediacaoCreditoPct(parcelas, cfg);
  const extra = antecipacaoFrac(parcelas, cfg?.antecipacao_mes_pct) * 100;
  return base + extra;
}

/** Preço de venda para uma base (custo+margem) fechar líquido igual à base,
 *  dado o nº de parcelas no crédito. Mesmo multiplicador 1/(1−taxa) usado em
 *  todo o resto do sistema (ver TAXA_DEBITO/TAXA_PARCELADO em utils/precos.js). */
export function precoPorParcelas(base, parcelas, cfg) {
  const taxaPct = taxaCreditoEfetivaPct(parcelas, cfg);
  return base / (1 - taxaPct / 100);
}

// Taxas de maquininha (Plano Essencial, Visa/Master — pior caso).
// Config vive na tabela taxas_config (percentuais 0–100, ex.: 1.36 = 1,36%).
//
// Crédito parcelado = intermediação da faixa + ANTECIPAÇÃO. A antecipação NÃO
// é juro simples: é desconto composto a valor presente das parcelas, validado
// contra o simulador real da maquininha (R$100 em 10x → recebe R$87,26):
//   antecipacao(N) = 1 − (1/N) × Σ(n=1..N) 1/(1+i)^n,  i = % ao mês / 100
// Cada componente (intermediação e antecipação) é TRUNCADO ao centavo em
// separado — é assim que o simulador fecha os R$87,26 (9,98653% → R$9,98).

/** Trunca ao centavo (piso), com guarda de ponto flutuante. */
export const trunc2 = (n) => Math.floor((Number(n) + 1e-9) * 100) / 100;
export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Fração (0–1) descontada pela antecipação de N parcelas a i% ao mês. */
export function antecipacaoFrac(parcelas, taxaMesPct) {
  const n = Math.trunc(Number(parcelas) || 0);
  const i = Number(taxaMesPct) / 100;
  if (n <= 1 || !(i > 0)) return 0;
  let soma = 0;
  for (let k = 1; k <= n; k += 1) soma += 1 / (1 + i) ** k;
  return 1 - soma / n;
}

/** Intermediação (%) da forma/parcelas, sem antecipação. null = não tabelada. */
function intermediacaoPct(forma, parcelas, cfg) {
  switch (forma) {
    case 'dinheiro': return 0;
    case 'pix':      return Number(cfg.pix_pct) || 0;
    case 'debito':   return Number(cfg.debito_pct) || 0;
    case 'credito': {
      const n = Math.trunc(Number(parcelas) || 1);
      if (n <= 1) return Number(cfg.credito_avista_pct) || 0;
      if (n <= 6) return Number(cfg.credito_2a6_pct) || 0;
      return Number(cfg.credito_7a12_pct) || 0;
    }
    default: return null; // forma não informada/desconhecida
  }
}

/** Taxa efetiva total (%) — intermediação + antecipação. null = não informada. */
export function taxaEfetivaPct(forma, parcelas, cfg) {
  const base = intermediacaoPct(forma, parcelas, cfg);
  if (base == null) return null;
  const extra = forma === 'credito'
    ? antecipacaoFrac(parcelas, cfg.antecipacao_mes_pct) * 100
    : 0;
  return round2(base + extra);
}

/** Taxa em R$ sobre uma receita. { valor, informada } — informada=false quando
 *  a movimentação não tem forma de pagamento (taxa 0, mas sinalizada). */
export function taxaSobreReceita(receita, forma, parcelas, cfg) {
  const r = Number(receita) || 0;
  const base = intermediacaoPct(forma, parcelas, cfg);
  if (base == null) return { valor: 0, informada: false };
  const intermediacao = trunc2(r * (base / 100));
  const antecipacao = forma === 'credito'
    ? trunc2(r * antecipacaoFrac(parcelas, cfg.antecipacao_mes_pct))
    : 0;
  return { valor: round2(intermediacao + antecipacao), informada: true };
}

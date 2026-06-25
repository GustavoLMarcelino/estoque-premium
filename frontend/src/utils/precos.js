// Cálculo automático de preços de venda a partir de custo + % lucro.
// Valor à vista inclui taxa de débito; parcelado inclui taxa de parcelamento (10x).
export const TAXA_DEBITO = 1.0109; // +1,09%
export const TAXA_PARCELADO = 1.1119; // +11,19%

export function calcularPrecos(custo, percentualLucro) {
  const c = Number(custo) || 0;
  const l = Number(percentualLucro) || 0;
  const base = c * (1 + l / 100);
  return {
    valor_vista: +(base * TAXA_DEBITO).toFixed(2),
    valor_parcelado: +(base * TAXA_PARCELADO).toFixed(2),
  };
}

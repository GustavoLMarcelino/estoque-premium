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

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Preço exibido na Tabela de Preços — aba SOM. Soma a mão de obra da classe
 * (valor CHEIO, nunca descontado) tanto no Parcelado quanto no À Vista, quando
 * o produto tem classe. Sem classe: só o preço da peça, como Baterias.
 * row: linha do estoque_som (inclui row.classe.valor_mao_obra quando há classe). */
export function precoTabelaSom(row) {
  const pecaParcelado = num(row?.valor_parcelado ?? row?.valor_venda);
  const pecaVista = num(row?.valor_vista ?? row?.valor_venda);
  const maoObra = num(row?.classe?.valor_mao_obra);
  return {
    valorParcelado: +(pecaParcelado + maoObra).toFixed(2),
    valorVista: +(pecaVista + maoObra).toFixed(2),
  };
}

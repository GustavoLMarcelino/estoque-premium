// Cálculo automático de preços de venda a partir de custo + % lucro.
// Valor à vista embute a taxa de débito; parcelado embute a taxa de crédito
// no PIOR caso (10x). Multiplicador = 1/(1−taxa), NUNCA (1+taxa): marcar
// +12,75% e depois a maquininha descontar 12,75% não devolve o valor original
// (ex.: 100×1,1275 = 112,75 → −12,75% = 98,37). Com 1/(1−t) o líquido fecha.
//
// Taxas reais (maquininha, Plano Essencial, Visa/Master — pior caso):
//   débito 1,36%; crédito 10x = intermediação 2,76% + antecipação 9,99% = 12,75%
//   (antecipação = desconto composto a valor presente a 1,96% a.m.).
// ATENÇÃO: estes valores são CONGELADOS em valor_vista/valor_parcelado do
// produto ao salvar — mudar aqui não recalcula o estoque existente.
export const TAXA_DEBITO = 1 / (1 - 0.0136); // ≈1,0138
export const TAXA_PARCELADO = 1 / (1 - 0.1275); // ≈1,1461

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

/** REGRA ÚNICA de base de preço por forma de pagamento (Baterias e Som):
 *  crédito (1x a 10x, inclusive "Crédito à vista") → valor_parcelado;
 *  dinheiro/débito/pix → valor_vista. Aceita as grafias das duas telas
 *  ('credito' na Venda Simples, 'Crédito parcelado/à vista' no Pedido Som). */
export function usaPrecoParcelado(formaPagamento) {
  const f = String(formaPagamento || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  return f.startsWith('credito');
}

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

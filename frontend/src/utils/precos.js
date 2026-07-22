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

// ---------------------------------------------------------------------------
// Trava anti-prejuízo: margem líquida mínima ao salvar um produto.
// O que a maquininha DEPOSITA (preço − taxa) tem que ser, no mínimo,
// custo + 10%. Cada preço é conferido contra a taxa dele: valor_vista contra
// a taxa de débito, valor_parcelado contra a de crédito 10x. Como o preço
// mínimo é a MESMA conta de calcularPrecos com lucro = 10%, o preço sugerido
// pela tela com 10% de lucro passa raspando (nunca é reprovado por si mesmo).
// ---------------------------------------------------------------------------
export const MARGEM_MINIMA_PCT = 10;

/** Preços mínimos de venda ({ valor_vista, valor_parcelado }) para o líquido
 *  pós-taxa fechar em custo + MARGEM_MINIMA_PCT. */
export function precosMinimos(custo) {
  return calcularPrecos(custo, MARGEM_MINIMA_PCT);
}

const brl = (n) => `R$ ${Number(n).toFixed(2).replace('.', ',')}`;

/** Margem líquida (%) que sobra em cada preço depois da taxa da maquininha.
 *  O líquido é preço ÷ multiplicador — o inverso exato de calcularPrecos, então
 *  reusa TAXA_DEBITO/TAXA_PARCELADO sem repetir 1,36%/12,75% em lugar nenhum.
 *  null quando não dá para calcular (sem custo). */
export function margemLiquidaPct({ custo, valorVista, valorParcelado }) {
  const c = Number(custo) || 0;
  if (!(c > 0)) return { vista: null, parcelado: null };
  const pct = (valor, taxa) => {
    const v = Number(valor);
    if (!Number.isFinite(v)) return null;
    return ((v / taxa - c) / c) * 100;
  };
  return {
    vista: pct(valorVista, TAXA_DEBITO),
    parcelado: pct(valorParcelado, TAXA_PARCELADO),
  };
}

/** Lucro líquido (R$) de um item de estoque no PIOR caso entre à vista e
 *  parcelado. Base líquida = preço ÷ multiplicador da taxa — o inverso exato de
 *  calcularPrecos, então reusa TAXA_DEBITO/TAXA_PARCELADO (as MESMAS constantes
 *  congeladas nos preços, nunca a taxas_config). É a versão em R$ e no pior caso
 *  do que margemLiquidaPct já faz por preço em %.
 *
 *  Bordas:
 *   - preço ausente/0/NaN → ignorado (NÃO vira −custo); o pior caso cai no outro.
 *   - custo ≤ 0 ou nulo → percent 0 (sem divisão por zero); o lucro em R$ segue.
 *   - nenhum preço válido → lucro null, percent 0.
 *
 *  Retorna { lucro, percent, lucroVista, lucroParcelado }. Os dois últimos (por
 *  preço, ou null quando o preço falta) alimentam o tooltip da tela de estoque. */
export function lucroLiquidoEstoque({ custo, valorVista, valorParcelado }) {
  const c = Number(custo) || 0;
  const liquido = (valor, taxa) => {
    const v = Number(valor);
    if (!Number.isFinite(v) || v <= 0) return null;
    return +(v / taxa - c).toFixed(2);
  };

  const lucroVista = liquido(valorVista, TAXA_DEBITO);
  const lucroParcelado = liquido(valorParcelado, TAXA_PARCELADO);

  const candidatos = [lucroVista, lucroParcelado].filter((x) => x != null);
  const lucro = candidatos.length ? Math.min(...candidatos) : null;
  const percent = c > 0 && lucro != null ? (lucro / c) * 100 : 0;

  return { lucro, percent, lucroVista, lucroParcelado };
}

/** Valida os DOIS preços contra o mínimo, cada um com a taxa dele. Passar num
 *  e falhar no outro reprova. custo <= 0 não é assunto daqui (já barrado
 *  antes), então passa direto. Retorna { ok, erros: [{campo, minimo}], message }. */
export function validarMargemMinima({ custo, valorVista, valorParcelado }) {
  const c = Number(custo) || 0;
  if (!(c > 0)) return { ok: true, erros: [], message: '' };

  const min = precosMinimos(c);
  const erros = [];
  const checar = (campo, label, valor, minimo) => {
    const v = Number(valor);
    // +1e-9 absorve ruído de ponto flutuante na igualdade exata do mínimo.
    if (!Number.isFinite(v) || v + 1e-9 < minimo) {
      erros.push({
        campo,
        minimo,
        valor: Number.isFinite(v) ? v : 0,
        message: `${label} abaixo do mínimo: precisa ser ≥ ${brl(minimo)} para ${MARGEM_MINIMA_PCT}% de margem após a taxa.`,
      });
    }
  };

  checar('valor_vista', 'Preço à vista', valorVista, min.valor_vista);
  checar('valor_parcelado', 'Preço parcelado (10x)', valorParcelado, min.valor_parcelado);

  return { ok: erros.length === 0, erros, message: erros.map((e) => e.message).join(' ') };
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

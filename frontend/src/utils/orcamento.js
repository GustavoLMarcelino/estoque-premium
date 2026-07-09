// Cálculo do orçamento de som automotivo (tela Orçamento — nada é persistido).
//
// Cada item carrega os DOIS preços já cadastrados no produto:
//   precoParcelado — custo+lucro com taxa de cartão parcelado (11,19%);
//   precoVista     — custo+lucro com taxa de débito (1,09%).
// O modo escolhe qual preço somar. NÃO é um desconto percentual fixo sobre o
// parcelado: são duas bases de cálculo distintas, e o valor_vista armazenado
// no produto (o mesmo da Tabela de Preços) é a fonte da verdade do modo à
// vista. O "desconto" exibido é a diferença real entre as duas somas.
// Mão de obra NUNCA sofre desconto, em nenhum modo.

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** itens: [{ precoParcelado, precoVista, qtd, maoObraUnit }].
 *   maoObraUnit = valor_mao_obra da CLASSE do produto (0 se sem classe). A mão
 *   de obra do item é qtd × maoObraUnit e NUNCA sofre desconto à vista.
 * modo: 'parcelado' | 'vista'. maoDeObra: número (mão de obra avulsa/manual).
 * Retorna { subtotalItens, desconto, totalItens, maoObraItens, maoObraAvulsa,
 *   maoDeObra (total = itens + avulsa), total }. */
export function calcularOrcamento(itens, maoDeObra, modo) {
  let cheio = 0; // soma pelo parcelado
  let vista = 0; // soma pelo valor_vista armazenado
  let maoObraItens = 0; // soma automática (classe × quantidade), sem desconto
  for (const it of itens ?? []) {
    const qtd = Number(it?.qtd) || 0;
    cheio += (Number(it?.precoParcelado) || 0) * qtd;
    vista += (Number(it?.precoVista) || 0) * qtd;
    maoObraItens += (Number(it?.maoObraUnit) || 0) * qtd;
  }
  const totalItens = modo === 'vista' ? vista : cheio;
  const desconto = modo === 'vista' ? cheio - vista : 0;
  const avulsa = Number(maoDeObra) || 0;
  const maoDeObraTotal = maoObraItens + avulsa;
  return {
    subtotalItens: round2(cheio),
    desconto: round2(desconto),
    totalItens: round2(totalItens),
    maoObraItens: round2(maoObraItens),
    maoObraAvulsa: round2(avulsa),
    maoDeObra: round2(maoDeObraTotal),
    total: round2(totalItens + maoDeObraTotal),
  };
}

/** Mão de obra de um item no orçamento (qtd × valor da classe), sem desconto. */
export function maoObraDoItem(item) {
  return round2((Number(item?.maoObraUnit) || 0) * (Number(item?.qtd) || 0));
}

/** Preço unitário exibido para um item no modo atual. */
export function precoUnitario(item, modo) {
  const p = modo === 'vista' ? item?.precoVista : item?.precoParcelado;
  return round2(Number(p) || 0);
}

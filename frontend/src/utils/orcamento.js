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

/** itens: [{ precoParcelado, precoVista, qtd }].
 * modo: 'parcelado' | 'vista'. maoDeObra: número (sempre sem desconto).
 * Retorna { subtotalItens, desconto, totalItens, maoDeObra, total }
 * (subtotalItens = soma pelo preço parcelado, base da transparência). */
export function calcularOrcamento(itens, maoDeObra, modo) {
  let cheio = 0; // soma pelo parcelado
  let vista = 0; // soma pelo valor_vista armazenado
  for (const it of itens ?? []) {
    const qtd = Number(it?.qtd) || 0;
    cheio += (Number(it?.precoParcelado) || 0) * qtd;
    vista += (Number(it?.precoVista) || 0) * qtd;
  }
  const totalItens = modo === 'vista' ? vista : cheio;
  const desconto = modo === 'vista' ? cheio - vista : 0;
  const mo = Number(maoDeObra) || 0;
  return {
    subtotalItens: round2(cheio),
    desconto: round2(desconto),
    totalItens: round2(totalItens),
    maoDeObra: round2(mo),
    total: round2(totalItens + mo),
  };
}

/** Preço unitário exibido para um item no modo atual. */
export function precoUnitario(item, modo) {
  const p = modo === 'vista' ? item?.precoVista : item?.precoParcelado;
  return round2(Number(p) || 0);
}

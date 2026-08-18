// Regra ÚNICA da % sugerida ao lançar um serviço, compartilhada pelas duas
// telas que lançam mão de obra (PedidoSomForm e a edição de pedido no Registro
// de Movimentações). Duplicá-la faria as duas telas sugerirem valores
// diferentes para o mesmo serviço — e é % de dinheiro.
//
// É SÓ SUGESTÃO DE UI: nada de categoria é gravado. O que vai para o banco é o
// número que ficar no campo, editável pelo usuário. Depois que ele mexe na %,
// a tela para de sugerir (flag pctTocado por item) — senão renomear o serviço
// sobrescreveria uma escolha deliberada.

/** Percentual sugerido a partir do nome digitado.
 *  Insulfilme tem % própria por convenção do negócio; o resto usa a de Som.
 *  Os dois valores vêm da config de comissão, então ajustar lá muda a sugestão
 *  sem tocar em código. */
export function sugerirPercentual(nome, { pctSom = 30, pctInsulfilme = 25 } = {}) {
  return /insulfilme/i.test(String(nome || "")) ? pctInsulfilme : pctSom;
}

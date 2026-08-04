// Estorno de agregado de estoque ao excluir uma movimentação — FONTE ÚNICA das
// duas linhas (baterias e som, movimentação avulsa e item de pedido).
//
// POR QUE EXISTE: os três DELETE (movimentacoes, movimentacoes-som, pedido-som)
// repetiam `saidas: Math.max(0, (prod.saidas ?? 0) - qtd)`. Esse clamp em zero
// era a falha mais grave da exclusão: quando o estorno levaria o agregado a
// negativo — sinal de que os dados JÁ estavam inconsistentes — ele truncava em
// silêncio, gravava um estoque errado e devolvia 204. Ninguém ficava sabendo.
// Enquanto o Som só apagava pedidos do mesmo dia isso quase não acontecia;
// liberar a exclusão a qualquer momento transformaria o clamp na porta de
// entrada de inconsistência.
//
// DUAS CORREÇÕES, JUNTAS:
//  1. FALHA EM VEZ DE TRUNCAR: se o estorno não couber no acumulado, lança com
//     statusCode 409 → a transação faz rollback → nada é apagado nem alterado.
//     Estado inconsistente vira erro visível, não estoque errado.
//  2. DECREMENT ATÔMICO: `{ decrement: n }` vira `SET saidas = saidas - n` no
//     banco, em vez de ler o valor e reescrever a diferença. Duas exclusões
//     simultâneas no mesmo produto não perdem mais uma das atualizações
//     (lost update) — o read-modify-write anterior era vulnerável.
//
// em_estoque NÃO aparece aqui: é coluna GERADA no MySQL
// (qtd_inicial + entradas − saidas) e nunca escrita pelo app. Acertar
// entradas/saidas já acerta o saldo.

/** Campo de agregado que uma movimentação alimenta. */
const campoDe = (tipo) => (String(tipo).toUpperCase() === 'ENTRADA' ? 'entradas' : 'saidas');

/**
 * Monta o `data` do update que desfaz UMA movimentação, validando antes que o
 * estorno cabe no acumulado atual do produto.
 *
 * @param  {object} p
 * @param  {string} p.tipo        'ENTRADA' | 'SAIDA'
 * @param  {number} p.quantidade  unidades a estornar
 * @param  {object} p.produto     linha de estoque/estoque_som (lida na transação)
 * @param  {string} p.rotulo      nome do produto, para a mensagem de erro
 * @return {object|null}          data do update, ou null quando não há o que fazer
 * @throws {Error} statusCode 409 quando o estorno deixaria o agregado negativo
 */
export function dadosEstorno({ tipo, quantidade, produto, rotulo }) {
  const qtd = Number(quantidade || 0);
  if (!(qtd > 0)) return null; // nada a estornar (não deveria existir; não falha)

  const campo = campoDe(tipo);
  const acumulado = Number(produto?.[campo] ?? 0);

  if (qtd > acumulado) {
    const nome = rotulo || `produto ${produto?.id ?? '?'}`;
    throw Object.assign(
      new Error(
        `Não foi possível excluir: o estorno de ${qtd} un. de "${nome}" deixaria ` +
        `${campo} em ${acumulado - qtd}. O estoque deste produto está inconsistente — ` +
        `confira antes de excluir. Nada foi alterado.`,
      ),
      { statusCode: 409 },
    );
  }

  return { [campo]: { decrement: qtd } };
}

// Movimentações geradas por um pedido de Som gravam este motivo. É o vínculo
// (por string) entre pedido_som e movimentacoes_som — ver pedidoSom.routes.js.
const MOTIVO_PEDIDO = /^Pedido Som #\d+$/;

/** true quando a movimentação de Som pertence a um pedido (não é avulsa). */
export function ehMovimentacaoDePedido(motivo) {
  return MOTIVO_PEDIDO.test(String(motivo || '').trim());
}

// Baixa de estoque ATÔMICA — fonte única das duas linhas (Baterias e Som).
//
// POR QUE EXISTE: as rotas liam `saidas`, somavam em JS e gravavam o total
// (`saidas: (prod.saidas ?? 0) + quantidade`), e decidiam "cabe?" com essa mesma
// leitura. No MySQL (REPEATABLE READ) o SELECT lê um snapshot do começo da
// transação, e o UPDATE enxerga o valor mais novo. Dois lançamentos do último
// item liam o mesmo saldo, os dois passavam, e um dos incrementos se perdia.
//
// A CORREÇÃO, em duas partes juntas:
//  1. `increment` vira `SET saidas = saidas + n` no banco — não depende de
//     nenhuma leitura anterior (e o UPDATE trava a linha até o commit).
//  2. O saldo é conferido na linha DEVOLVIDA pelo próprio update, que já reflete
//     o valor travado. Negativo → lança, e a transação desfaz tudo (movimentação
//     incluída). A leitura anterior continua servindo só para falhar cedo e
//     para a mensagem; quem garante o saldo é este teste.
//
// O saldo é qtd_inicial + entradas − saidas. `em_estoque` NÃO entra: no RDS é
// coluna comum e NULL (o app nunca a escreve), então ler dela devolveria um
// número que não acompanha o increment.

/** Saldo de uma linha de estoque/estoque_som. */
export const saldoDe = (p) =>
  Number(p?.qtd_inicial || 0) + Number(p?.entradas || 0) - Number(p?.saidas || 0);

/**
 * Soma `quantidade` a `saidas` de forma atômica e confere o saldo resultante.
 *
 * @param delegate        tx.estoque ou tx.estoque_som (DENTRO da transação)
 * @param produtoId
 * @param quantidade      unidades a baixar (> 0)
 * @param erroSemSaldo    (disponivel, produto) => Error — o erro que a rota já
 *                        usa para "estoque insuficiente"; `disponivel` é o saldo
 *                        que havia ANTES desta baixa
 * @returns a linha atualizada
 */
export async function baixarEstoque(delegate, produtoId, quantidade, erroSemSaldo) {
  const produto = await delegate.update({
    where: { id: produtoId },
    data: { saidas: { increment: quantidade } },
  });
  const saldo = saldoDe(produto);
  if (saldo < 0) throw erroSemSaldo(saldo + quantidade, produto);
  return produto;
}

// Diário append-only de exclusão/edição de venda — gravação ÚNICA dos três
// caminhos destrutivos (venda de Baterias, movimentação avulsa de Som, pedido
// de Som) e, desde a entrada com custo, de UM caminho que não destrói nada:
// a ENTRADA de Baterias que reescreve custo/preços (ver ACOES.CRIACAO).
//
// POR QUE EXISTE: excluir venda é hard-delete. A linha some e, sem isto, não
// resta rastro de quem apagou nem do que havia ali. Num sistema que apura
// faturamento e comissão, "nunca existiu" e "foi apagado ontem" são coisas
// diferentes — e o banco não sabia distinguir.
//
// TABELA À PARTE, não soft-delete: um `deleted_at` na venda obrigaria todo
// leitor (dashboard, comissão, listagens) a filtrar, e esquecer um filtro faria
// número de dinheiro sair errado em silêncio. Append-only não muda leitor nenhum.
//
// ATOMICIDADE: recebe o `tx` da transação que está excluindo — nunca o cliente
// global. Se o log falhar, a exclusão inteira faz rollback; se a exclusão
// falhar (ex.: estorno que não cabe), o log some junto. Não existe "apagou mas
// não registrou" nem "registrou uma exclusão que não aconteceu".

export const ACOES = {
  EXCLUSAO: 'EXCLUSAO',
  EDICAO: 'EDICAO', // pedido de Som (Fases C/C2/D) e venda de Baterias
  /** ENTRADA de Baterias que reescreve custo/preços do produto.
   *
   *  Fora do padrão das outras duas de propósito: aqui não há nada sendo
   *  destruído nem editado — a linha nasce. O que se registra é o estado do
   *  PRODUTO um instante antes, porque esse valor não sobrevive em lugar
   *  nenhum: `estoque` guarda só o custo de agora. Ver o bloco no POST de
   *  movimentacoes.routes.js. */
  CRIACAO: 'CRIACAO',
};

export const ENTIDADES = {
  MOVIMENTACAO: 'movimentacoes',
  MOVIMENTACAO_SOM: 'movimentacoes_som',
  PEDIDO_SOM: 'pedido_som',
};

/**
 * Acrescenta UMA linha ao diário. Só INSERT: a tabela nunca é atualizada nem
 * apagada pelo app.
 *
 * @param {object} tx      cliente da transação em curso (obrigatório)
 * @param {object} p
 * @param {string} p.linha             'baterias' | 'som'
 * @param {string} p.entidade          uma de ENTIDADES
 * @param {number} p.entidadeId        id que o registro TINHA antes de sumir
 * @param {string} p.acao              uma de ACOES
 * @param {object} p.conteudoAnterior  snapshot do estado anterior (vira JSON)
 * @param {object} [p.user]            req.user — id e email de quem fez
 */
export async function registrarAuditoria(tx, {
  linha, entidade, entidadeId, acao, conteudoAnterior, user,
}) {
  await tx.venda_auditoria.create({
    data: {
      linha,
      entidade,
      entidade_id: Number(entidadeId),
      acao,
      // Serializado aqui, e não no banco: a coluna é String nos DOIS schemas
      // (o SQLite de dev não tem escalar Json). Decimal do Prisma tem toJSON e
      // vira string "150.00"; Date vira ISO. Ver a nota no schema.mysql.prisma.
      conteudo_anterior: JSON.stringify(conteudoAnterior),
      user_id: user?.id ?? null,
      feito_por: user?.email ?? null,
    },
  });
}

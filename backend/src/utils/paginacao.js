// Paginação das rotas de listagem — FONTE ÚNICA do clamp e do envelope.
//
// POR QUE EXISTE: as 8 rotas paginadas repetiam
//   Math.min(Math.max(parseInt(req.query.pageSize) || N, 1), TETO)
// e o clamp era SILENCIOSO. Quem pedia 500 recebia 100 e não tinha como saber:
// nem erro, nem aviso, nem campo. Foi assim que três cards da Home passaram
// meses somando sobre listas truncadas — o "Valor Total" vinha R$ 20 mil menor
// e 3 produtos críticos de Som simplesmente não existiam para a tela.
//
// A CORREÇÃO NÃO É RECUSAR: devolver 400 quando o pedido excede o teto
// quebraria quem hoje pede alto de propósito, contando com o clamp. O envelope
// passa a CONTAR o que aconteceu, e quem quiser detectar compara dois campos.
//
// Com o clamp num lugar só, uma 9ª rota de listagem herda o aviso de graça —
// que é o ponto: o bug original não foi ninguém errar a conta, foi a conta
// estar copiada em oito lugares sem ninguém olhando para o conjunto.

/** Lê page/pageSize da query e aplica o clamp.
 *
 *  @param {object} query          req.query
 *  @param {object} [opcoes]
 *  @param {number} [opcoes.padrao] pageSize quando a query não traz um válido
 *  @param {number} [opcoes.teto]   máximo que a rota aceita servir
 *  @return {{page, pageSize, pageSizeSolicitado, skip, take}}
 */
export function paginacao(query, { padrao = 10, teto = 100 } = {}) {
  const page = Math.max(parseInt(query?.page, 10) || 1, 1);

  // `|| padrao` (e não ?? ) mantém o comportamento das rotas: pageSize=0 ou
  // lixo não numérico caem no padrão, como sempre caíram.
  const solicitado = parseInt(query?.pageSize, 10) || padrao;
  const pageSize = Math.min(Math.max(solicitado, 1), teto);

  return {
    page,
    pageSize,
    pageSizeSolicitado: solicitado,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

/** Monta o envelope padrão de listagem.
 *
 *  pageSizeSolicitado vai SEMPRE, não só quando houve corte: um campo que
 *  aparece apenas na anomalia é fácil de esquecer de checar e chato de testar
 *  por ausência. Presente sempre, detectar truncamento é uma comparação:
 *  `pageSizeSolicitado > pageSize`.
 */
export function envelope({ page, pageSize, pageSizeSolicitado, total, data }) {
  return {
    page,
    pageSize,
    pageSizeSolicitado,
    total,
    pages: Math.ceil(total / pageSize),
    data,
  };
}

import { z } from 'zod';
import { VENDEDORES_BATERIA } from '../utils/comissao.js';

// Compartilhado por movimentacoes e movimentacoes-som (mesmo contrato de body).
export const criarMovimentacaoBody = z.object({
  produto_id: z.coerce.number().int().positive(),
  // o handler normaliza caixa/espaços — aqui só garante que é um dos dois
  tipo: z.string().refine((v) => ['entrada', 'saida'].includes(String(v).trim().toLowerCase()), {
    message: "use 'entrada' ou 'saida'",
  }),
  quantidade: z.coerce.number().int().positive(),
  // front envia string "12.34" (toFixed) ou omite; coerção aceita ambos
  valor_final: z.coerce.number().nullish(),
  vendedor: z.string().nullish(), // usado só em baterias; ignorado no som
  // Venda (saída) de baterias: forma de pagamento + parcelas (só crédito, 1–10).
  forma_pagamento: z.enum(['dinheiro', 'pix', 'debito', 'credito']).nullish(),
  parcelas: z.coerce.number().int().min(1).max(10).nullish(),
  // ENTRADA pode repor o custo e, junto, corrigir os preços de venda — tudo na
  // MESMA transação da movimentação, para estoque e custo nunca dessincronizarem
  // (antes o custo ia num PUT separado, depois da movimentação já gravada).
  //
  // custo continua OPCIONAL (omitir = manter o atual), mas quando vem tem que
  // ser > 0 — a mesma regra do Cadastro de Produto. Antes era nonnegative(), e
  // custo: 0 passava: zerava o custo do produto e envenenava qualquer apuração
  // de lucro (o zero passa batido também na trava de margem, que só age com
  // custo > 0). Vale para AS DUAS LINHAS — este schema é compartilhado por
  // /movimentacoes e /movimentacoes-som.
  //
  // refine (e não .positive()) porque o validate.js traduz too_small para uma
  // mensagem genérica e só repassa o texto original em issues 'custom'.
  custo: z.coerce.number().nullish().refine((v) => v == null || v > 0, {
    message: 'custo deve ser maior que zero',
  }),
  valor_vista: z.coerce.number().nonnegative().nullish(),
  valor_parcelado: z.coerce.number().nonnegative().nullish(),
});

/** POST /api/movimentacoes — só BATERIAS.
 *
 *  Extend em vez de acrescentar ao body compartilhado porque Som não tem venda
 *  fiado: lá a venda é o pedido, e a movimentação é baixa de estoque. Como o
 *  body compartilhado NÃO é .strict(), incluir os campos nele faria
 *  /movimentacoes-som passar a aceitar chaves que o handler de lá descarta em
 *  silêncio — um contrato que mente.
 *
 *  status_pagamento é opcional: ausente = PAGO, o caso normal. data_pagamento
 *  não é aceito na criação (quitar é sempre um segundo ato, via PUT) — ele está
 *  aqui só para que mandá-lo seja um erro explícito de contrato, e não uma
 *  chave silenciosamente ignorada.
 *
 *  ATENÇÃO: o .refine() abaixo transforma isto num ZodEffects, que NÃO aceita
 *  .extend(). Quem precisar de um terceiro schema em cima deste tem que
 *  estender o objeto ANTES do refine, não o resultado.
 */
export const criarMovimentacaoBateriaBody = criarMovimentacaoBody.extend({
  status_pagamento: z.enum(['PAGO', 'FIADO']).nullish(),
  data_pagamento: z.coerce.date().nullish(),
  /** Texto livre: não há cadastro de cliente. min(1) depois do trim para que
   *  "   " não passe como nome — espaço em branco satisfaria um required
   *  ingênuo e produziria exatamente a dívida anônima que este campo evita. */
  cliente_fiado: z.string().trim().min(1).max(150).nullish(),
})
  /** Fiado sem dono é uma dívida que ninguém sabe cobrar.
   *
   *  Olha SÓ o status, sem replicar a checagem de tipo que o handler faz (lá,
   *  apenas SAIDA vira FIADO de fato). Duplicar a regra criaria duas cópias
   *  para manter em sincronia; recusar `tipo: entrada + status: FIADO` é
   *  aceitável — é um payload incoerente, ainda que o handler fosse ignorá-lo. */
  .refine((b) => !(b.status_pagamento === 'FIADO' && !b.cliente_fiado), {
    message: 'Informe o nome do cliente na venda fiado.',
    path: ['cliente_fiado'],
  });

/** PUT /api/movimentacoes/:id — edição de venda de Baterias (só SAIDA).
 *
 *  .strict() é o guard de verdade: qualquer chave fora destas seis vira 400
 *  nomeando o campo. É assim que data_movimentacao fica PROIBIDA — editá-la
 *  reclassificaria a quinzena da comissão E o período do dashboard de uma venda
 *  possivelmente já paga. Pelo mesmo caminho caem tipo (uma venda não vira
 *  compra), garantia_id e motivo (o vínculo com o empréstimo não se digita),
 *  e user_id/created_by (quem lançou é histórico, não campo). Sem o .strict()
 *  o Zod descartaria essas chaves em silêncio e o usuário acharia que funcionou.
 *
 *  Ausente = não mexe. Cada campo é nullish para permitir edição parcial.
 */
export const editarMovimentacaoBody = z.object({
  produto_id: z.coerce.number().int().positive().nullish(),
  quantidade: z.coerce.number().int().positive().nullish(),
  // UNITÁRIO, como em toda a base (o dashboard faz valor_final × quantidade).
  // Obrigatório quando quantidade ou produto mudam — regra no handler.
  valor_final: z.coerce.number().nonnegative().nullish(),
  /** enum, e não string livre como no POST: apurar() casa o vendedor por
   *  IGUALDADE EXATA contra VENDEDORES_BATERIA. Um "ismael" minúsculo ou com
   *  espaço sobrando tiraria a venda da comissão sem erro nenhum. O POST segue
   *  livre (é o histórico), mas um campo que a tela agora deixa EDITAR não pode
   *  ter essa armadilha. */
  vendedor: z.enum(VENDEDORES_BATERIA).nullish(),
  forma_pagamento: z.enum(['dinheiro', 'pix', 'debito', 'credito']).nullish(),
  parcelas: z.coerce.number().int().min(1).max(10).nullish(),
  /** O fluxo principal do fiado: marcar como pago depois.
   *
   *  Diferente de data_movimentacao (que o .strict() proíbe), data_pagamento
   *  NÃO reclassifica quinzena de comissão nem período de dashboard — a venda
   *  continua pertencendo ao dia em que saiu. Por isso é editável. */
  status_pagamento: z.enum(['PAGO', 'FIADO']).nullish(),
  data_pagamento: z.coerce.date().nullish(),
  /** Corrigir o nome depois ("João" que era "João da esquina"). Sem refine
   *  exigindo-o: o schema não enxerga a linha, e reabrir um fiado que JÁ tem
   *  nome gravado seria recusado à toa. Quem sabe se o nome existe é o handler,
   *  que lê o `antes` — é lá que a trava mora. */
  cliente_fiado: z.string().trim().min(1).max(150).nullish(),
})
  .strict()
  /** Mandar FIADO e uma data de pagamento no MESMO payload é contradição: se
   *  foi pago, o status é PAGO. Não atrapalha o preenchimento automático que o
   *  handler faz ao mudar para PAGO (lá a data não vem do body) — barra só a
   *  combinação digitada à mão, que sem isto gravaria "em aberto, quitado em". */
  .refine((b) => !(b.status_pagamento === 'FIADO' && b.data_pagamento != null), {
    message: 'data_pagamento só faz sentido quando status_pagamento é PAGO',
    path: ['data_pagamento'],
  });

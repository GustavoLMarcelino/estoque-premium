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
}).strict();

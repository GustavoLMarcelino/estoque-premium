import { z } from 'zod';

const itemSchema = z.object({
  tipo: z.string().refine((v) => ['PRODUTO', 'MAO_OBRA'].includes(String(v).trim().toUpperCase()), {
    message: "use 'PRODUTO' ou 'MAO_OBRA'",
  }),
  produto_id: z.coerce.number().int().positive().nullish(),
  descricao: z.string().nullish(), // obrigatória p/ MAO_OBRA — regra do handler
  quantidade: z.coerce.number().nullish(), // regras por tipo ficam no handler
  // Opcional aqui: PRODUTO exige > 0 e MAO_OBRA exige > 0 (é a própria mão de
  // obra). Regras por tipo ficam no handler.
  valor_unit: z.coerce.number().nullish(),
  // Override opcional da mão de obra do item. >= 0 permite zerar.
  mao_obra_unit: z.coerce.number().nonnegative().nullish(),
  // % da comissão do Joel neste item, digitada no lançamento. Ausente = cai no
  // percentual_mao_obra da config (compatibilidade com cliente antigo).
  percentual_comissao: z.coerce.number().min(0).max(100).nullish(),
});

/** PUT /api/pedido-som/:id — Fase C: só o cabeçalho que NÃO toca estoque nem
 *  comissão. As mesmas regras de campo do criarPedidoBody, e nada além.
 *
 *  .strict() é o guard de verdade: qualquer chave fora destas três vira 400
 *  nomeando o campo (o validate.js repassa a mensagem do Zod). É assim que
 *  created_at fica PROIBIDO — editá-lo reclassificaria a quinzena da comissão
 *  do Joel, mexendo em dinheiro possivelmente já pago. Pelo mesmo caminho caem
 *  itens, valor_total, valor_mao_obra e comissao_joel: todos derivados, e
 *  derivado não se edita, se recalcula. Sem o .strict() o Zod descartaria essas
 *  chaves em silêncio e o usuário acharia que a edição funcionou. */
const itemServicoSchema = z.object({
  descricao: z.string().nullish(), // obrigatória — regra do handler
  quantidade: z.coerce.number().int().positive(),
  // >= 0 permite zerar a mão de obra de um serviço sem apagar o item.
  mao_obra_unit: z.coerce.number().nonnegative().nullish(),
  // Precisa estar DECLARADO aqui: o .strict() abaixo transforma chave
  // desconhecida em 400, então sem esta linha a tela de edição não conseguiria
  // reenviar a % gravada de cada item.
  percentual_comissao: z.coerce.number().min(0).max(100).nullish(),
}).strict();

export const editarPedidoBody = z.object({
  veiculo: z.string().nullish(),
  forma_pagamento: z.string().nullish(),
  parcelas: z.coerce.number().int().min(1).max(10).nullish(),
  /** Fase C2 — lista DESEJADA de itens de serviço (o pedido fica com estes).
   *  Ausente = não mexe nos serviços. [] = remove todos.
   *
   *  O nome é itens_servico, e não "itens", de propósito: item de PRODUTO não
   *  tem por onde entrar. Estoque só se move por produto_id/quantidade de item
   *  PRODUTO, e essas chaves simplesmente não existem neste contrato — o corte
   *  é estrutural, não uma validação que alguém possa esquecer de rodar. Editar
   *  produto/quantidade é a Fase D. */
  itens_servico: z.array(itemServicoSchema).nullish(),
  /** Mão de obra de item de PRODUTO legado (pedidos anteriores ao M2, quando o
   *  produto carregava classe). Só o valor: produto_id, quantidade e
   *  baixa_estoque continuam intocáveis, então nada de estoque se move. */
  mao_obra_produtos: z.array(z.object({
    item_id: z.coerce.number().int().positive(),
    mao_obra_unit: z.coerce.number().nonnegative(),
  }).strict()).nullish(),
  /** Fase D — lista DESEJADA de itens de produto. Esta é a única chave do
   *  contrato que MOVE ESTOQUE: o pedido estorna as baixas atuais e reaplica as
   *  desta lista. Ausente = não mexe nos produtos. [] = remove todos.
   *
   *  valor_unit é OBRIGATÓRIO e vem da tela: o backend nunca puxa o preço atual
   *  do produto. Mudar a quantidade de um pedido de julho não pode reprecificá-lo
   *  pela tabela de hoje — a mesma regra que a Fase C2 aplica à mão de obra.
   *
   *  O teto de 50 protege a transação: o estorno + a reaplicação fazem várias
   *  idas ao banco por item, e uma lista sem limite poderia estourar o tempo
   *  DEPOIS de já ter mexido em estoque. Pedido real não chega perto disso. */
  itens_produto: z.array(z.object({
    item_id: z.coerce.number().int().positive().nullish(), // ausente = item novo
    produto_id: z.coerce.number().int().positive(),
    quantidade: z.coerce.number().int().positive(),
    valor_unit: z.coerce.number().nonnegative(),
  }).strict()).max(50, { message: 'máximo de 50 itens de produto por pedido' }).nullish(),
}).strict();

export const criarPedidoBody = z.object({
  veiculo: z.string().nullish(),
  forma_pagamento: z.string().nullish(),
  // Nº de parcelas do crédito (1–10) — mesma regra da Venda Simples de Baterias
  // (movimentacoes.schema.js). O handler ignora nas formas sem parcelamento.
  parcelas: z.coerce.number().int().min(1).max(10).nullish(),
  itens: z.array(itemSchema).min(1, { message: 'informe ao menos um item' }),
});

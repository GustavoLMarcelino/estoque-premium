import { z } from 'zod';

const itemSchema = z.object({
  tipo: z.string().refine((v) => ['PRODUTO', 'MAO_OBRA'].includes(String(v).trim().toUpperCase()), {
    message: "use 'PRODUTO' ou 'MAO_OBRA'",
  }),
  produto_id: z.coerce.number().int().positive().nullish(),
  classe_id: z.coerce.number().int().positive().nullish(), // serviço guiado por classe
  descricao: z.string().nullish(), // obrigatória p/ MAO_OBRA manual — regra do handler
  quantidade: z.coerce.number().nullish(), // regras por tipo ficam no handler
  // Opcional: PRODUTO exige > 0; MAO_OBRA por classe dispensa (mão de obra vem
  // da classe); MAO_OBRA manual exige > 0. Regras por tipo ficam no handler.
  valor_unit: z.coerce.number().nullish(),
  // Override opcional da mão de obra do item (produto ou serviço por classe):
  // quando ausente, usa o valor automático da classe. >= 0 permite zerar.
  mao_obra_unit: z.coerce.number().nonnegative().nullish(),
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
  classe_id: z.coerce.number().int().positive().nullish(), // ausente = serviço manual
  descricao: z.string().nullish(), // obrigatória no manual — regra do handler
  quantidade: z.coerce.number().int().positive(),
  // >= 0 permite zerar a mão de obra de um serviço sem apagar o item.
  mao_obra_unit: z.coerce.number().nonnegative().nullish(),
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
}).strict();

export const criarPedidoBody = z.object({
  veiculo: z.string().nullish(),
  forma_pagamento: z.string().nullish(),
  // Nº de parcelas do crédito (1–10) — mesma regra da Venda Simples de Baterias
  // (movimentacoes.schema.js). O handler ignora nas formas sem parcelamento.
  parcelas: z.coerce.number().int().min(1).max(10).nullish(),
  itens: z.array(itemSchema).min(1, { message: 'informe ao menos um item' }),
});

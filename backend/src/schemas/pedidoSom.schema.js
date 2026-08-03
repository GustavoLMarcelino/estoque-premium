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

export const criarPedidoBody = z.object({
  veiculo: z.string().nullish(),
  forma_pagamento: z.string().nullish(),
  // Nº de parcelas do crédito (1–10) — mesma regra da Venda Simples de Baterias
  // (movimentacoes.schema.js). O handler ignora nas formas sem parcelamento.
  parcelas: z.coerce.number().int().min(1).max(10).nullish(),
  itens: z.array(itemSchema).min(1, { message: 'informe ao menos um item' }),
});

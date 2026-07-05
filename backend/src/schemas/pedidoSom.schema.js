import { z } from 'zod';

const itemSchema = z.object({
  tipo: z.string().refine((v) => ['PRODUTO', 'MAO_OBRA'].includes(String(v).trim().toUpperCase()), {
    message: "use 'PRODUTO' ou 'MAO_OBRA'",
  }),
  produto_id: z.coerce.number().int().positive().nullish(),
  descricao: z.string().nullish(), // obrigatória p/ MAO_OBRA — regra do handler
  quantidade: z.coerce.number().nullish(), // regras por tipo ficam no handler
  valor_unit: z.coerce.number().positive({ message: 'valor_unit deve ser > 0' }),
});

export const criarPedidoBody = z.object({
  veiculo: z.string().nullish(),
  forma_pagamento: z.string().nullish(),
  itens: z.array(itemSchema).min(1, { message: 'informe ao menos um item' }),
});

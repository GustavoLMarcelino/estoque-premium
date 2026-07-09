import { z } from 'zod';

// Edição da configuração de comissão. Ambos opcionais (aplica os enviados),
// mas exige ao menos um campo. percentual_mao_obra é PERCENTUAL (30 = 30%).
export const editarConfigBody = z
  .object({
    valor_bateria: z.coerce.number().nonnegative().nullish(),
    percentual_mao_obra: z.coerce.number().nonnegative().max(100).nullish(),
  })
  .refine((b) => b.valor_bateria != null || b.percentual_mao_obra != null, {
    message: 'informe valor_bateria e/ou percentual_mao_obra',
  });

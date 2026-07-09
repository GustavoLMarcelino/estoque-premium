import { z } from 'zod';

// Valor de mão de obra: número >= 0 (aceita string numérica). z.any()+refine
// em vez de z.coerce pra mensagem de erro amigável via tradutor do validate.js.
const valorMaoObra = z
  .any()
  .refine((v) => v != null && v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0, {
    message: 'Valor de mão de obra inválido (informe um número ≥ 0)',
  });

export const criarClasseBody = z.object({
  nome: z.string().min(2).max(80),
  valor_mao_obra: valorMaoObra,
});

export const editarClasseBody = z.object({
  nome: z.string().min(2).max(80).nullish(),
  valor_mao_obra: valorMaoObra.nullish(),
  ativo: z.boolean().nullish(),
});

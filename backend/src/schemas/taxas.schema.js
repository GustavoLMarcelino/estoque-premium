import { z } from 'zod';

// Edição da config de taxas de maquininha. Percentuais 0–100 (1.36 = 1,36%).
// Todos opcionais (aplica os enviados), mas exige ao menos um.
const pct = z.coerce.number().nonnegative().max(100).nullish();

export const editarTaxasBody = z
  .object({
    pix_pct: pct,
    debito_pct: pct,
    credito_avista_pct: pct,
    credito_2a6_pct: pct,
    credito_7a12_pct: pct,
    antecipacao_mes_pct: pct,
  })
  .refine((b) => Object.values(b).some((v) => v != null), {
    message: 'informe ao menos um campo de taxa',
  });

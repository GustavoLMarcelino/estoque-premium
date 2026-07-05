import { z } from 'zod';

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
});

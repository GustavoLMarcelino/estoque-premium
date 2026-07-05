import { z } from 'zod';

// Compartilhado por estoque e estoque-som (mesmo contrato de body).

// Número ou string numérica, SEM transformar: '' precisa chegar intacto ao
// handler (em valor_vista/valor_parcelado, '' significa "limpar para null").
const numLike = z
  .union([z.number(), z.string()])
  .refine((v) => v === '' || Number.isFinite(Number(v)), { message: 'valor numérico inválido' });

export const criarProdutoBody = z.object({
  produto: z.string().min(1),
  modelo: z.string().min(1),
  custo: numLike,
  valor_venda: numLike,
  valor_vista: numLike.nullish(),
  valor_parcelado: numLike.nullish(),
  percentual_lucro: numLike.nullish(),
  qtd_minima: numLike.nullish(),
  qtd_inicial: numLike.nullish(),
  garantia: z.union([z.string(), z.number()]).nullish(), // fmtGarantia aceita os dois
});

// PUT: todos opcionais/anuláveis (o handler só aplica o que vier != null).
export const editarProdutoBody = z.object({
  produto: z.string().min(1).nullish(),
  modelo: z.string().min(1).nullish(),
  custo: numLike.nullish(),
  valor_venda: numLike.nullish(),
  valor_vista: numLike.nullish(),
  valor_parcelado: numLike.nullish(),
  percentual_lucro: numLike.nullish(),
  qtd_minima: numLike.nullish(),
  qtd_inicial: numLike.nullish(),
  garantia: z.union([z.string(), z.number()]).nullish(),
});

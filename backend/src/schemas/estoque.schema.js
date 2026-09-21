import { z } from 'zod';

// Compartilhado por estoque e estoque-som (mesmo contrato de body).

// Número ou string numérica, SEM transformar: '' precisa chegar intacto ao
// handler (em valor_vista/valor_parcelado, '' significa "limpar para null").
const numLike = z
  .union([z.number(), z.string()])
  .refine((v) => v === '' || Number.isFinite(Number(v)), { message: 'valor numérico inválido' });

// Como numLike, mas barra negativos — usado nos campos que representam
// quantidade ou dinheiro físico (não faz sentido "estoque mínimo -5").
const numLikeNaoNegativo = numLike.refine(
  (v) => v === '' || Number(v) >= 0,
  { message: 'valor não pode ser negativo' }
);

// marca_id com mensagens amigáveis para quem consome a API direto
// (refine em vez de coerce: o tradutor do validate.js repassa a mensagem).
const marcaIdObrigatoria = z
  .any()
  .refine((v) => v != null && String(v).trim() !== '', { message: 'Marca é obrigatória' })
  .refine((v) => v == null || String(v).trim() === '' || (Number.isInteger(Number(v)) && Number(v) > 0), {
    message: 'Marca inválida',
  });

// .optional() por último: chave ausente é aceita direto; valor presente passa
// pelo refine (a ordem inversa faria o Zod v4 exigir a chave no PUT).
const marcaIdOpcional = z
  .any()
  .refine((v) => v == null || (Number.isInteger(Number(v)) && Number(v) > 0), { message: 'Marca inválida' })
  .optional();

export const criarProdutoBody = z.object({
  produto: z.string().min(1),
  modelo: z.string().min(1),
  marca_id: marcaIdObrigatoria,
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
  marca_id: marcaIdOpcional,
  custo: numLike.nullish(),
  valor_venda: numLike.nullish(),
  valor_vista: numLike.nullish(),
  valor_parcelado: numLike.nullish(),
  percentual_lucro: numLike.nullish(),
  qtd_minima: numLike.nullish(),
  qtd_inicial: numLike.nullish(),
  garantia: z.union([z.string(), z.number()]).nullish(),
});

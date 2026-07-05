import { z } from 'zod';

// Mesmos valores do enum garantias_status no schema.mysql.prisma —
// valor fora disso virava erro 500 opaco do Prisma em produção.
export const STATUS_GARANTIA = ['ABERTA', 'EM_ANALISE', 'APROVADA', 'REPROVADA', 'FINALIZADA'];

// Data como string parseável; ''/null/undefined passam (o handler já trata
// como "não informado" — new Date() só roda em valor truthy).
const dataStr = z
  .string()
  .refine((s) => s === '' || !Number.isNaN(new Date(s).getTime()), { message: 'data inválida' })
  .nullish();

// '' é ignorado pelo handler (if (garantia.status)) — mantido válido.
// Enum único (em vez de union) para o erro 400 listar os valores aceitos.
const statusStr = z.enum([...STATUS_GARANTIA, '']).nullish();

const clienteSchema = z.object({
  nome: z.string().min(1),
  documento: z.string().min(1),
  telefone: z.string().min(1),
  endereco: z.string().nullish(),
});

const produtoSchema = z.object({
  codigo: z.string().min(1),
  descricao: z.string().min(1),
});

const garantiaSchema = z.object({
  dataAbertura: dataStr,
  dataLimite: dataStr,
  dataContato: dataStr,
  dataCompra: dataStr,
  status: statusStr,
  descricaoProblema: z.string().nullish(),
});

export const criarGarantiaBody = z.object({
  cliente: clienteSchema,
  produto: produtoSchema,
  garantia: garantiaSchema.nullish(),
  emprestimo: z
    .object({
      ativo: z.coerce.boolean().nullish(),
      produtoCodigo: z.string().nullish(),
      quantidade: z.coerce.number().int().positive().nullish(),
    })
    .nullish(),
});

// PATCH: cada bloco é opcional; quando presente, vale a mesma regra do POST.
export const editarGarantiaBody = z.object({
  cliente: clienteSchema.nullish(),
  produto: produtoSchema.nullish(),
  garantia: garantiaSchema.nullish(),
});

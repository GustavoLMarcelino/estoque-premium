import { z } from 'zod';

// Mesmos valores do enum garantias_status no schema.mysql.prisma —
// valor fora disso virava erro 500 opaco do Prisma em produção.
// Fases físicas do processo: aguardando envio -> recolhida -> em loja -> finalizada.
export const STATUS_GARANTIA = ['AGUARDANDO_ENVIO', 'RECOLHIDA', 'EM_LOJA', 'FINALIZADA'];

// Resultado do teste da distribuidora quando a bateria volta (fase EM_LOJA).
export const RESULTADO_GARANTIA = ['NOVA', 'MESMA'];

// Data como string parseável; ''/null/undefined passam (o handler já trata
// como "não informado" — new Date() só roda em valor truthy).
const dataStr = z
  .string()
  .refine((s) => s === '' || !Number.isNaN(new Date(s).getTime()), { message: 'data inválida' })
  .nullish();

// '' é ignorado pelo handler (if (garantia.status)) — mantido válido.
// Enum único (em vez de union) para o erro 400 listar os valores aceitos.
const statusStr = z.enum([...STATUS_GARANTIA, '']).nullish();

// resultado do teste — '' passa (handler trata como "não informado").
const resultadoStr = z.enum([...RESULTADO_GARANTIA, '']).nullish();

const clienteSchema = z.object({
  nome: z.string().min(1),
  // OPCIONAL desde 18/08/2026. Sem .min(1) de propósito: string vazia é o que a
  // tela manda quando o usuário não preenche, e o handler a normaliza para null.
  // Formato (dígito verificador de CPF/CNPJ) nunca foi validado aqui — a
  // checagem vive no GarantiaCadastro, e só barra quando há algo digitado.
  documento: z.string().nullish(),
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
  resultado: resultadoStr,
  laudo: z.string().nullish(),
});

// Bloco de empréstimo — reaproveitado por POST e PATCH. Obrigatoriedade de
// produto_id quando ativo é validada no handler (400 explícito).
const emprestimoSchema = z
  .object({
    ativo: z.coerce.boolean().nullish(),
    produto_id: z.coerce.number().int().positive().nullish(),
    quantidade: z.coerce.number().int().positive().nullish(),
  })
  .nullish();

export const criarGarantiaBody = z.object({
  cliente: clienteSchema,
  produto: produtoSchema,
  garantia: garantiaSchema.nullish(),
  emprestimo: emprestimoSchema,
});

// PATCH: cada bloco é opcional; quando presente, vale a mesma regra do POST.
// Aceita emprestimo para permitir ATIVAR o empréstimo na edição (dispara a
// mesma baixa da criação). Sem este campo, ativar empréstimo ao editar não
// tinha efeito nenhum no estoque.
export const editarGarantiaBody = z.object({
  cliente: clienteSchema.nullish(),
  produto: produtoSchema.nullish(),
  garantia: garantiaSchema.nullish(),
  emprestimo: emprestimoSchema,
});

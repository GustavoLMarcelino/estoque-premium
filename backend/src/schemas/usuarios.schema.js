import { z } from 'zod';
import { PERMISSOES_VALIDAS } from '../utils/permissoes.js';

/** Objeto {chave: boolean} onde TODA chave precisa existir no catálogo —
 * rejeita chave desconhecida para o catálogo do backend seguir fonte única. */
const permissoesBody = z
  .record(z.string(), z.boolean())
  .superRefine((obj, ctx) => {
    for (const k of Object.keys(obj)) {
      if (!PERMISSOES_VALIDAS.has(k)) {
        ctx.addIssue({ code: 'custom', message: `permissão desconhecida: ${k}` });
      }
    }
  });

export const criarUsuarioBody = z.object({
  name: z.string().trim().min(2, { message: 'nome deve ter pelo menos 2 caracteres' }),
  email: z
    .string()
    .trim()
    .refine((v) => /\S+@\S+\.\S+/.test(v), { message: 'email inválido' }),
  password: z.string().min(8, { message: 'a senha deve ter pelo menos 8 caracteres' }),
  permissoes: permissoesBody.optional().default({}),
});

export const editarUsuarioBody = z
  .object({
    name: z.string().trim().min(2, { message: 'nome deve ter pelo menos 2 caracteres' }).optional(),
    permissoes: permissoesBody.optional(),
  })
  .refine((b) => b.name !== undefined || b.permissoes !== undefined, {
    message: 'informe name e/ou permissoes',
  });

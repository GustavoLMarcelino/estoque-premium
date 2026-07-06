import { z } from 'zod';

export const esqueciSenhaBody = z.object({
  email: z
    .string()
    .refine((v) => /\S+@\S+\.\S+/.test(v), { message: 'email inválido' }),
});

export const redefinirSenhaBody = z.object({
  token: z.string().min(16, { message: 'token inválido' }),
  senha: z.string().min(8, { message: 'a nova senha deve ter pelo menos 8 caracteres' }),
});

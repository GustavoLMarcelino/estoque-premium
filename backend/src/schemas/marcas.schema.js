import { z } from 'zod';

export const criarMarcaBody = z.object({
  nome: z.string().min(2).max(80),
});

export const editarMarcaBody = z.object({
  nome: z.string().min(2).max(80).nullish(),
  ativo: z.boolean().nullish(),
});

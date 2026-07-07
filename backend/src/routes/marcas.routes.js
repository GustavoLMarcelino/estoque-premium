import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { requireAdmin } from '../middlewares/auth.js';
import { validate, idParams } from '../middlewares/validate.js';
import { criarMarcaBody, editarMarcaBody } from '../schemas/marcas.schema.js';

export const marcasRouter = Router();

/** Duplicidade case-insensitive no app: unique do SQLite é case-sensitive e o
 * do MySQL (collation padrão) não — normalizar aqui garante o mesmo
 * comportamento em dev e produção ("moura" conflita com "Moura"). */
async function achaDuplicada(nome, ignorarId = null) {
  const alvo = nome.trim().toLowerCase();
  const todas = await prisma.marca.findMany({ select: { id: true, nome: true } });
  return todas.find((m) => m.nome.trim().toLowerCase() === alvo && m.id !== ignorarId) ?? null;
}

/** GET /api/marcas?todas=1
 * Padrão: só ativas (para o dropdown). ?todas=1 inclui desativadas (gestão). */
marcasRouter.get('/', async (req, res, next) => {
  try {
    const incluirInativas = req.query.todas === '1';
    const data = await prisma.marca.findMany({
      where: incluirInativas ? undefined : { ativo: true },
      orderBy: { nome: 'asc' },
    });
    res.json({ data });
  } catch (e) {
    next(e);
  }
});

/** POST /api/marcas — apenas admin (mesma régua do cadastro de produto). */
marcasRouter.post('/', requireAdmin, validate({ body: criarMarcaBody }), async (req, res, next) => {
  try {
    const nome = String(req.body.nome).trim();
    const dup = await achaDuplicada(nome);
    if (dup) {
      return res.status(409).json({ error: true, message: `Marca já cadastrada: ${dup.nome}` });
    }
    const nova = await prisma.marca.create({ data: { nome } });
    res.status(201).json(nova);
  } catch (e) {
    next(e);
  }
});

/** PATCH /api/marcas/:id — renomear e/ou ativar/desativar. Apenas admin.
 * Desativar não afeta produtos existentes; só esconde do dropdown. */
marcasRouter.patch('/:id', requireAdmin, validate({ params: idParams, body: editarMarcaBody }), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { nome, ativo } = req.body;

    const data = {};
    if (nome != null) {
      const novoNome = String(nome).trim();
      const dup = await achaDuplicada(novoNome, id);
      if (dup) {
        return res.status(409).json({ error: true, message: `Marca já cadastrada: ${dup.nome}` });
      }
      data.nome = novoNome;
    }
    if (ativo != null) data.ativo = Boolean(ativo);

    const atualizada = await prisma.marca.update({ where: { id }, data });
    res.json(atualizada);
  } catch (e) {
    if (e?.code === 'P2025') return res.status(404).json({ error: true, message: 'Marca não encontrada.' });
    next(e);
  }
});

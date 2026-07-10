import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { requireAdmin } from '../middlewares/auth.js';
import { validate, idParams } from '../middlewares/validate.js';
import { criarClasseBody, editarClasseBody } from '../schemas/classesSom.schema.js';

export const classesSomRouter = Router();

const toMoneyStr = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
};

/** Duplicidade case-insensitive no app (mesmo motivo da Marca: unique do SQLite
 * é case-sensitive; o do MySQL depende da collation — normalizar aqui garante o
 * mesmo comportamento em dev e produção). */
async function achaDuplicada(nome, ignorarId = null) {
  const alvo = nome.trim().toLowerCase();
  const todas = await prisma.classe_som.findMany({ select: { id: true, nome: true } });
  return todas.find((c) => c.nome.trim().toLowerCase() === alvo && c.id !== ignorarId) ?? null;
}

/** GET /api/classes-som?todas=1&categoria=SOM
 * Padrão: só ativas (para o dropdown). ?todas=1 inclui desativadas (gestão).
 * ?categoria=SOM|INSULFILME filtra por categoria (ex.: dropdown de produto = SOM). */
classesSomRouter.get('/', async (req, res, next) => {
  try {
    const incluirInativas = req.query.todas === '1';
    const categoria = String(req.query.categoria || '').trim().toUpperCase();
    const where = {};
    if (!incluirInativas) where.ativo = true;
    if (categoria === 'SOM' || categoria === 'INSULFILME') where.categoria = categoria;
    const data = await prisma.classe_som.findMany({
      where: Object.keys(where).length ? where : undefined,
      orderBy: { nome: 'asc' },
    });
    res.json({ data });
  } catch (e) {
    next(e);
  }
});

/** POST /api/classes-som — apenas admin. */
classesSomRouter.post('/', requireAdmin, validate({ body: criarClasseBody }), async (req, res, next) => {
  try {
    const nome = String(req.body.nome).trim();
    const dup = await achaDuplicada(nome);
    if (dup) {
      return res.status(409).json({ error: true, message: `Classe já cadastrada: ${dup.nome}` });
    }
    const categoria = req.body.categoria === 'INSULFILME' ? 'INSULFILME' : 'SOM';
    const nova = await prisma.classe_som.create({
      data: { nome, valor_mao_obra: toMoneyStr(req.body.valor_mao_obra), categoria },
    });
    res.status(201).json(nova);
  } catch (e) {
    next(e);
  }
});

/** PATCH /api/classes-som/:id — renomear, ajustar valor e/ou ativar/desativar.
 * Apenas admin. Desativar não afeta produtos existentes; só esconde do dropdown. */
classesSomRouter.patch('/:id', requireAdmin, validate({ params: idParams, body: editarClasseBody }), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { nome, valor_mao_obra, ativo } = req.body;

    const data = {};
    if (nome != null) {
      const novoNome = String(nome).trim();
      const dup = await achaDuplicada(novoNome, id);
      if (dup) {
        return res.status(409).json({ error: true, message: `Classe já cadastrada: ${dup.nome}` });
      }
      data.nome = novoNome;
    }
    if (valor_mao_obra != null) data.valor_mao_obra = toMoneyStr(valor_mao_obra);
    if (ativo != null) data.ativo = Boolean(ativo);

    const atualizada = await prisma.classe_som.update({ where: { id }, data });
    res.json(atualizada);
  } catch (e) {
    if (e?.code === 'P2025') return res.status(404).json({ error: true, message: 'Classe não encontrada.' });
    next(e);
  }
});

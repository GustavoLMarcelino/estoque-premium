import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const produtosRouter = Router();

produtosRouter.get('/', async (req, res, next) => {
  try {
    const q = (req.query.q || '').toString().toLowerCase();
    const itens = await prisma.produto.findMany({
      where: q
        ? { OR: [
            { codigo: { contains: q } },
            { descricao: { contains: q } }
          ] }
        : undefined,
      orderBy: { id: 'desc' }
    });
    res.json(itens);
  } catch (e) { next(e); }
});

produtosRouter.post('/', async (req, res, next) => {
  try {
    const { codigo, descricao, qtdMinima = 0, precoCusto, precoVenda } = req.body;
    if (!codigo || !descricao) {
      return res.status(400).json({ error: true, message: 'codigo e descricao são obrigatórios' });
    }
    const novo = await prisma.produto.create({
      data: { codigo, descricao, qtdMinima, precoCusto, precoVenda }
    });
    res.status(201).json(novo);
  } catch (e) { next(e); }
});

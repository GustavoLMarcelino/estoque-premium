import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { registrarMovimentacao } from '../services/mov.service.js';

const prisma = new PrismaClient();
export const movRouter = Router();

/** GET /api/movimentacoes */
movRouter.get('/', async (req, res, next) => {
  try {
    const itens = await prisma.movimentacoes.findMany({
      orderBy: { id: 'desc' },
      include: {
        estoque: { select: { id: true, produto: true, modelo: true } } // relação FK (estoque <- movimentacoes.produto_id)
      },
    });
    res.json(itens);
  } catch (e) { next(e); }
});

/** POST /api/movimentacoes */
movRouter.post('/', async (req, res, next) => {
  try {
    const mov = await registrarMovimentacao(req.body);
    res.status(201).json(mov);
  } catch (e) { next(e); }
});

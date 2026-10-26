import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { sanitizePedidoComissao } from './pedidoSom.routes.js';
import {
  FILTROS, MAX_DIAS_INTERVALO, dataValida, diaBRT, diasNoIntervalo, montarRegistro, somaDias,
} from '../services/registroSom.js';

export const somRegistroRouter = Router();

const erro400 = (res, message) => res.status(400).json({ error: true, message });

/**
 * GET /api/som/registro?de=&ate=&filtro=&q=
 *
 * Alimenta o Registro de Movimentação do Som: pedidos + entradas/saídas
 * avulsas, agrupados por dia (Brasília). de/ate são 'YYYY-MM-DD'.
 *   ate    default: hoje.   de default: 6 dias antes de ate (7 dias).
 *   filtro tudo (default) | pedidos | entradas | avulsas
 *   q      produto/modelo (movimentações) · veículo/descrição de item (pedidos)
 *
 * Devolve no máximo 31 dias por chamada (os mais recentes do intervalo);
 * proximoAte é o `ate` da chamada seguinte, ou null quando o intervalo acabou.
 * resumoPeriodo cobre o intervalo INTEIRO, não só o bloco.
 *
 * Mount: requireAuth + requireLinha('som') + requirePermission('reg_movimentacao').
 */
somRegistroRouter.get('/', async (req, res, next) => {
  try {
    const hoje = diaBRT(new Date());
    const ate = req.query.ate ? String(req.query.ate) : hoje;
    const de = req.query.de ? String(req.query.de) : somaDias(ate, -6);
    const filtro = req.query.filtro ? String(req.query.filtro) : 'tudo';
    const q = (req.query.q || '').toString().trim();

    if (!dataValida(ate)) return erro400(res, "ate inválido — use YYYY-MM-DD.");
    if (!dataValida(de)) return erro400(res, "de inválido — use YYYY-MM-DD.");
    if (de > ate) return erro400(res, 'de não pode ser depois de ate.');
    if (diasNoIntervalo(de, ate) > MAX_DIAS_INTERVALO) {
      return erro400(res, `Intervalo máximo de ${MAX_DIAS_INTERVALO} dias.`);
    }
    if (!FILTROS.includes(filtro)) {
      return erro400(res, `filtro inválido — use: ${FILTROS.join(', ')}.`);
    }

    const data = await montarRegistro(prisma, {
      de, ate, filtro, q, user: req.user, sanitizar: sanitizePedidoComissao,
    });
    res.json(data);
  } catch (e) {
    console.error('GET /api/som/registro ERRO:', e);
    next(e);
  }
});

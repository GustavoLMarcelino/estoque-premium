import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { requireAdmin } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { editarTaxasBody } from '../schemas/taxas.schema.js';

export const taxasRouter = Router();

const toPctStr = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
};

// Valores confirmados da maquininha (Plano Essencial, Visa/Master, pior caso).
const TAXAS_INICIAIS = {
  pix_pct: '0.50',
  debito_pct: '1.36',
  credito_avista_pct: '3.43',
  credito_2a6_pct: '2.36',
  credito_7a12_pct: '2.76',
  antecipacao_mes_pct: '1.96',
};

/** Config é um singleton; se não existir, cria com os valores confirmados —
 *  mesmo padrão da comissao_config (produção funciona sem depender de seed). */
export async function getTaxasConfig(client = prisma) {
  const existente = await client.taxas_config.findFirst({ orderBy: { id: 'asc' } });
  if (existente) return existente;
  return client.taxas_config.create({ data: TAXAS_INICIAIS });
}

/** GET /api/taxas/config — qualquer autenticado. */
taxasRouter.get('/config', async (req, res, next) => {
  try {
    const cfg = await getTaxasConfig();
    res.json({ data: cfg });
  } catch (e) {
    console.error('GET /api/taxas/config ERRO:', e);
    next(e);
  }
});

/** PUT /api/taxas/config — apenas admin. */
taxasRouter.put('/config', requireAdmin, validate({ body: editarTaxasBody }), async (req, res, next) => {
  try {
    const atual = await getTaxasConfig();
    const data = { updated_by: req.user?.email ?? null };
    for (const campo of Object.keys(TAXAS_INICIAIS)) {
      if (req.body[campo] != null) data[campo] = toPctStr(req.body[campo]);
    }
    const cfg = await prisma.taxas_config.update({ where: { id: atual.id }, data });
    res.json({ data: cfg });
  } catch (e) {
    console.error('PUT /api/taxas/config ERRO:', e);
    next(e);
  }
});

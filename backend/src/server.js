import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { estoqueRouter } from './routes/estoque.routes.js';
import { movimentacoesRouter } from './routes/movimentacoes.routes.js';
import { garantiasRouter } from './routes/garantias.routes.js';
import { estoqueSomRouter } from './routes/estoqueSom.routes.js';
import { movimentacoesSomRouter } from './routes/movimentacoesSom.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { requireAuth } from './middlewares/auth.js';

const app = express();
const prisma = new PrismaClient();
// CORS liberado para front-ends em outros hosts
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Health check com ping no banco para diagnóstico em produção
app.get('/api/health', async (_, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('Health check DB ERRO:', err);
    res.status(503).json({ status: 'error', db: 'disconnected', timestamp: new Date().toISOString() });
  }
});
app.use('/api/auth', authRouter);

app.use('/api/estoque', requireAuth, estoqueRouter);
app.use('/api/movimentacoes', requireAuth, movimentacoesRouter);
app.use('/api/estoque-som', requireAuth, estoqueSomRouter);
app.use('/api/movimentacoes-som', requireAuth, movimentacoesSomRouter);
app.use('/api/garantias', requireAuth, garantiasRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: true, message: err.message || 'Erro interno' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { prisma } from './config/prisma.js';
import { estoqueRouter } from './routes/estoque.routes.js';
import { movimentacoesRouter } from './routes/movimentacoes.routes.js';
import { garantiasRouter } from './routes/garantias.routes.js';
import { estoqueSomRouter } from './routes/estoqueSom.routes.js';
import { movimentacoesSomRouter } from './routes/movimentacoesSom.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { inventarioRouter } from './routes/inventario.routes.js';
import { pedidoSomRouter } from './routes/pedidoSom.routes.js';
import { requireAuth } from './middlewares/auth.js';

const app = express();

// Origens permitidas (allowlist). Configurável via FRONTEND_URL (separadas por vírgula).
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173,http://localhost:5174')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(helmet());
app.use(
  cors({
    origin(origin, cb) {
      // Permite requests sem Origin (curl, health check, proxy same-origin do Vite)
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('Origem não permitida pelo CORS'));
    },
    credentials: true,
  })
);
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
app.use('/api/inventario', requireAuth, inventarioRouter);
app.use('/api/pedido-som', requireAuth, pedidoSomRouter);

app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  const isProd = process.env.NODE_ENV === 'production';
  res.status(status).json({
    error: true,
    message: isProd && status === 500 ? 'Erro interno do servidor.' : (err.message || 'Erro interno'),
    ...(isProd ? {} : { stack: err.stack })
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));

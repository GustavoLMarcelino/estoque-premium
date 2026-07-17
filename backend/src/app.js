import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { prisma } from './config/prisma.js';
import { estoqueRouter } from './routes/estoque.routes.js';
import { movimentacoesRouter } from './routes/movimentacoes.routes.js';
import { garantiasRouter } from './routes/garantias.routes.js';
import { estoqueSomRouter } from './routes/estoqueSom.routes.js';
import { movimentacoesSomRouter } from './routes/movimentacoesSom.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { inventarioRouter } from './routes/inventario.routes.js';
import { pedidoSomRouter } from './routes/pedidoSom.routes.js';
import { marcasRouter } from './routes/marcas.routes.js';
import { classesSomRouter } from './routes/classesSom.routes.js';
import { comissaoRouter } from './routes/comissao.routes.js';
import { taxasRouter } from './routes/taxas.routes.js';
import { usuariosRouter } from './routes/usuarios.routes.js';
import { requireAuth, requireAdmin } from './middlewares/auth.js';

// App Express sem listen — o server.js sobe a porta; os testes usam via Supertest.
export const app = express();

// Atrás de um único proxy reverso (Nginx na mesma EC2, publicando 443/80 →
// Node em 3000). Faz o Express usar o X-Forwarded-For do Nginx como req.ip
// real — necessário para o rate limiting contar por cliente, não pelo IP do
// proxy. '1' = confia em exatamente 1 salto; não usar 'true' (permissivo,
// permitiria um cliente forjar o header e furar o limite).
app.set('trust proxy', 1);

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

// Rede de segurança global contra abuso/loop de cliente ou token comprometido
// martelando a API. Brando de propósito: os dispositivos da loja saem por um
// único IP (NAT), então o teto precisa acomodar todos os funcionários juntos —
// inclusive picos legítimos como uma conferência de inventário inteira (um PATCH
// por item). Os limites estritos ficam onde de fato importam, na superfície não
// autenticada: login (10/15min) e esqueci-senha (5/15min), em auth.routes.js.
// Fica depois do /api/health para não limitar monitoramento/uptime.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 1000,                // por IP (com trust proxy, IP real do cliente)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: true, message: 'Muitas requisições. Aguarde alguns minutos e tente novamente.' },
});
app.use('/api', apiLimiter);

app.use('/api/auth', authRouter);

app.use('/api/estoque', requireAuth, estoqueRouter);
app.use('/api/movimentacoes', requireAuth, movimentacoesRouter);
app.use('/api/estoque-som', requireAuth, estoqueSomRouter);
app.use('/api/movimentacoes-som', requireAuth, movimentacoesSomRouter);
app.use('/api/garantias', requireAuth, garantiasRouter);
app.use('/api/inventario', requireAuth, inventarioRouter);
app.use('/api/pedido-som', requireAuth, pedidoSomRouter);
app.use('/api/marcas', requireAuth, marcasRouter);
app.use('/api/classes-som', requireAuth, classesSomRouter);
app.use('/api/comissao', requireAuth, comissaoRouter);
app.use('/api/taxas', requireAuth, taxasRouter);
app.use('/api/usuarios', requireAuth, requireAdmin, usuariosRouter);

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

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { estoqueRouter } from './routes/estoque.routes.js';
import { movimentacoesRouter } from './routes/movimentacoes.routes.js';
import { garantiasRouter } from './routes/garantias.routes.js';
import { estoqueSomRouter } from './routes/estoqueSom.routes.js';
import { movimentacoesSomRouter } from './routes/movimentacoesSom.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { requireAuth } from './middlewares/auth.js';

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// ROTA PROTEGIDA PARA TESTES
app.get('/api/protected', requireAuth, (req, res) => {
  return res.status(200).json({
    message: 'Acesso permitido',
    user: req.user
  });
});

app.get('/api/health', (_, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);

app.use('/api/estoque', requireAuth, estoqueRouter);
app.use('/api/movimentacoes', requireAuth, movimentacoesRouter);
app.use('/api/estoque-som', requireAuth, estoqueSomRouter);
app.use('/api/movimentacoes-som', requireAuth, movimentacoesSomRouter);
app.use('/api/garantias', requireAuth, garantiasRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: true,
    message: err.message || 'Erro interno'
  });
});

export default app;
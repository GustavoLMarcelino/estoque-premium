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
// CORS liberado para front-ends em outros hosts (em produção filtre domínios permitidos)
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get('/api/health', (_, res) => res.json({ ok: true }));
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

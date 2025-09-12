import express from 'express';
import cors from 'cors';
import { estoqueRouter } from './routes/estoque.routes.js';
import { movRouter } from './routes/movimentacoes.routes.js';

const app = express();
app.use(cors({ origin: ['http://localhost:5173'], credentials: true }));
app.use(express.json());

app.get('/api/health', (_, res) => res.json({ ok: true }));

app.use('/api/estoque', estoqueRouter);
app.use('/api/movimentacoes', movRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: true, message: err.message || 'Erro interno' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));

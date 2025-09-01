// src/backend/server.js
import express from 'express';
import cors from 'cors';
import produtosRoutes from '../routes/estoque.js';

const app = express();
app.use(cors());
app.use(express.json());

// Rotas
app.use('/produtos', produtosRoutes);

// Start
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});

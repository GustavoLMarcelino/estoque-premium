import { Router } from 'express';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// stockmind/ é irmão de backend/ na raiz do repo — sem lógica, sem cálculo,
// só leitura do JSON pré-calculado (gerado sob demanda por
// stockmind/scripts/gerar_previsao_producao.py, rodando na própria EC2).
const PREVISAO_PATH = path.join(__dirname, '..', '..', '..', 'stockmind', 'saida', 'previsao_atual.json');

export const stockmindRouter = Router();

/** GET /api/stockmind/previsao — admin-only (montado com requireAdmin no app.js). */
stockmindRouter.get('/previsao', async (req, res, next) => {
  try {
    const conteudo = await readFile(PREVISAO_PATH, 'utf-8');
    res.type('application/json').send(conteudo);
  } catch (e) {
    if (e.code === 'ENOENT') {
      return res.status(404).json({
        error: true,
        message: 'Previsão ainda não foi gerada — rode gerar_previsao_producao.py.',
      });
    }
    console.error('GET /api/stockmind/previsao ERRO:', e);
    next(e);
  }
});

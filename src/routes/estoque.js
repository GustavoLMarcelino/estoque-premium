// src/backend/routes/produtos.js
import express from 'express';
import pool from '../backend/db.js';

const router = express.Router();

// GET todos os produtos
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM estoque');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET todas movimentações
router.get('/movimentacoes', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM movimentacoes');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

export default router;

import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { signToken, requireAuth } from '../middlewares/auth.js';

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10,                   // máx 10 tentativas por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: true, message: 'Muitas tentativas. Tente novamente em 15 minutos.' }
});

authRouter.post('/register', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: true, message: 'Acesso negado.' });
    }
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: true, message: 'name, email e password são obrigatórios' });
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: true, message: 'E-mail já cadastrado' });
    }
    const hash = await bcrypt.hash(String(password), 12);
    const user = await prisma.user.create({
      data: { name: String(name).trim(), email: String(email).toLowerCase().trim(), password: hash, role: 'user' },
    });
    const token = signToken(user);
    res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: true, message: 'Email e senha são obrigatórios' });

    const user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase().trim() } });
    if (!user) return res.status(401).json({ error: true, message: 'Credenciais inválidas' });

    const ok = await bcrypt.compare(String(password), user.password);
    if (!ok) return res.status(401).json({ error: true, message: 'Credenciais inválidas' });

    const token = signToken(user);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (e) {
    next(e);
  }
});

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, name: true, email: true, role: true } });
    res.json({ user });
  } catch (e) {
    next(e);
  }
});

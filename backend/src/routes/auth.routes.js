import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { signToken, requireAuth } from '../middlewares/auth.js';

const prisma = new PrismaClient();
export const authRouter = Router();

authRouter.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, role = 'user' } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: true, message: 'name, email e password são obrigatórios' });
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: true, message: 'E-mail já cadastrado' });
    }
    const hash = await bcrypt.hash(String(password), 10);
    const user = await prisma.user.create({
      data: { name: String(name).trim(), email: String(email).toLowerCase().trim(), password: hash, role },
    });
    const token = signToken(user);
    res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/login', async (req, res, next) => {
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

import { Router } from 'express';
import crypto from 'node:crypto';
import { prisma } from '../config/prisma.js';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { signToken, requireAuth } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { esqueciSenhaBody, redefinirSenhaBody } from '../schemas/auth.schema.js';
import { enviarEmailResetSenha } from '../services/mailer.js';

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10,                   // máx 10 tentativas por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: true, message: 'Muitas tentativas. Tente novamente em 15 minutos.' }
});

// Mais restrito que o login: cada pedido dispara um email.
const esqueciSenhaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: true, message: 'Muitas solicitações. Tente novamente em 15 minutos.' }
});

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hora
const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

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

/** POST /api/auth/esqueci-senha — body: { email }
 * Resposta SEMPRE genérica (mesma para email existente ou não), para não
 * permitir enumeração de usuários. O email sai de forma assíncrona (falha de
 * SMTP é logada, nunca vaza na resposta nem altera o tempo de resposta).
 */
authRouter.post('/esqueci-senha', esqueciSenhaLimiter, validate({ body: esqueciSenhaBody }), async (req, res, next) => {
  try {
    const email = String(req.body.email).toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      await prisma.user.update({
        where: { id: user.id },
        data: {
          // guarda só o hash: um vazamento do banco não expõe tokens utilizáveis
          reset_token: hashToken(token),
          reset_token_expira: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        },
      });
      // FRONTEND_URL é a mesma allowlist do CORS (pode ter várias origens
      // separadas por vírgula) — o link de redefinição usa a primeira.
      const base = (process.env.FRONTEND_URL || 'https://premiumbateriasbv.com.br')
        .split(',')[0]
        .trim()
        .replace(/\/+$/, '');
      enviarEmailResetSenha(email, `${base}/redefinir-senha?token=${token}`).catch((e) =>
        console.error('Falha ao enviar email de redefinição:', e)
      );
    }

    res.json({ error: false, message: 'Se esse email existir em nossa base, você receberá um link de redefinição.' });
  } catch (e) {
    next(e);
  }
});

/** POST /api/auth/redefinir-senha — body: { token, senha }
 * Token de uso único: é anulado junto com a troca da senha.
 */
authRouter.post('/redefinir-senha', validate({ body: redefinirSenhaBody }), async (req, res, next) => {
  try {
    const { token, senha } = req.body;
    const user = await prisma.user.findFirst({ where: { reset_token: hashToken(token) } });

    if (!user || !user.reset_token_expira || user.reset_token_expira < new Date()) {
      return res.status(400).json({ error: true, message: 'Link de redefinição inválido ou expirado. Solicite um novo.' });
    }

    const hash = await bcrypt.hash(String(senha), 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hash, reset_token: null, reset_token_expira: null },
    });

    res.json({ error: false, message: 'Senha redefinida com sucesso.' });
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

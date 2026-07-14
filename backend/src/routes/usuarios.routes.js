import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma.js';
import { validate, idParams } from '../middlewares/validate.js';
import { criarUsuarioBody, editarUsuarioBody } from '../schemas/usuarios.schema.js';
import { parsePermissoes } from '../utils/permissoes.js';

// Gerenciamento de usuários e permissões. TODO o router é montado com
// requireAuth + requireAdmin no app.js — só admin chega aqui.
export const usuariosRouter = Router();

const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  permissoes: parsePermissoes(u.permissoes),
  created_at: u.created_at,
});

/** GET /api/usuarios — lista sem hash de senha. */
usuariosRouter.get('/', async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, name: true, email: true, role: true, permissoes: true, created_at: true },
    });
    res.json({ data: users.map(publicUser) });
  } catch (e) {
    next(e);
  }
});

/** POST /api/usuarios — cria usuário comum (role=user) com permissões. */
usuariosRouter.post('/', validate({ body: criarUsuarioBody }), async (req, res, next) => {
  try {
    const { name, email, password, permissoes } = req.body;
    const emailNorm = String(email).toLowerCase().trim();

    const existing = await prisma.user.findUnique({ where: { email: emailNorm } });
    if (existing) return res.status(409).json({ error: true, message: 'E-mail já cadastrado' });

    const hash = await bcrypt.hash(String(password), 12);
    const user = await prisma.user.create({
      data: {
        name,
        email: emailNorm,
        password: hash,
        role: 'user',
        permissoes: JSON.stringify(permissoes || {}),
      },
    });
    res.status(201).json({ data: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

/** PATCH /api/usuarios/:id — edita permissões e/ou nome. */
usuariosRouter.patch('/:id', validate({ params: idParams, body: editarUsuarioBody }), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const alvo = await prisma.user.findUnique({ where: { id } });
    if (!alvo) return res.status(404).json({ error: true, message: 'Usuário não encontrado' });

    const { name, permissoes } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (permissoes !== undefined) data.permissoes = JSON.stringify(permissoes);

    const user = await prisma.user.update({ where: { id }, data });
    res.json({ data: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

/** DELETE /api/usuarios/:id — não exclui a si próprio nem o último admin. */
usuariosRouter.delete('/:id', validate({ params: idParams }), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const alvo = await prisma.user.findUnique({ where: { id } });
    if (!alvo) return res.status(404).json({ error: true, message: 'Usuário não encontrado' });

    if (alvo.id === req.user.id) {
      return res.status(400).json({ error: true, message: 'Você não pode excluir o próprio usuário.' });
    }
    if (alvo.role === 'admin') {
      const admins = await prisma.user.count({ where: { role: 'admin' } });
      if (admins <= 1) {
        return res.status(400).json({ error: true, message: 'Não é possível excluir o último administrador.' });
      }
    }

    await prisma.user.delete({ where: { id } });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

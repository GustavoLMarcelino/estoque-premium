import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma.js';
import { parsePermissoes, temPermissao, podeVerLinha } from '../utils/permissoes.js';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET ausente ou fraco. Abortando.');
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Autentica pelo JWT e carrega o usuário FRESCO do banco (não confia no
 * payload além do id). Permissões editadas pelo admin e exclusão de usuário
 * valem imediatamente, sem esperar o token de 2h expirar. Custo: um findUnique
 * por PK por request — desprezível na escala da loja.
 */
export async function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const [, token] = auth.split(' ');
    if (!token) return res.status(401).json({ error: true, message: 'Token ausente' });

    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    const user = await prisma.user.findUnique({
      where: { id: Number(payload.id) },
      select: { id: true, name: true, email: true, role: true, permissoes: true },
    });
    if (!user) return res.status(401).json({ error: true, message: 'Token inválido ou expirado' });

    req.user = { ...user, permissoes: parsePermissoes(user.permissoes) };
    next();
  } catch (err) {
    if (err?.name === 'JsonWebTokenError' || err?.name === 'TokenExpiredError' || err?.name === 'NotBeforeError') {
      return res.status(401).json({ error: true, message: 'Token inválido ou expirado' });
    }
    next(err);
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: true, message: 'Acesso restrito a administradores.' });
  }
  next();
}

/**
 * Exige QUALQUER uma das permissões do catálogo (OR). Admin bypassa.
 * Uso: router.post('/', requirePermission('entrada_saida'), ...)
 */
export function requirePermission(...keys) {
  return (req, res, next) => {
    if (temPermissao(req.user, ...keys)) return next();
    return res.status(403).json({ error: true, message: 'Você não tem permissão para esta ação.' });
  };
}

/**
 * Exige que o usuário opere a LINHA de produto ('baterias'|'som'). Admin
 * bypassa. Montado no nível do grupo de rotas de uma linha, torna o escopo
 * REAL (não só esconder o toggle no front). Ex.:
 *   app.use('/api/estoque-som', requireAuth, requireLinha('som'), estoqueSomRouter)
 */
export function requireLinha(linha) {
  return (req, res, next) => {
    if (podeVerLinha(req.user, linha)) return next();
    return res.status(403).json({ error: true, message: `Sem acesso à linha de ${linha}.` });
  };
}

export function signToken(user) {
  // Payload mínimo de propósito: as permissões NÃO vão no token (ficariam
  // defasadas até 2h) — requireAuth as busca frescas do banco a cada request.
  const payload = { id: user.id, email: user.email, role: user.role || 'user' };
  return jwt.sign(payload, JWT_SECRET, { algorithm: 'HS256', expiresIn: '2h' });
}

import jwt from 'jsonwebtoken';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET ausente ou fraco. Abortando.');
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;

export function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const [, token] = auth.split(' ');
    if (!token) return res.status(401).json({ error: true, message: 'Token ausente' });

    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: true, message: 'Token inválido ou expirado' });
  }
}

export function signToken(user) {
  const payload = { id: user.id, email: user.email, role: user.role || 'user' };
  return jwt.sign(payload, JWT_SECRET, { algorithm: 'HS256', expiresIn: '2h' });
}

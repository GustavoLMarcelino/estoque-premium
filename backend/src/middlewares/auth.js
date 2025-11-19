import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

export function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const [, token] = auth.split(' ');
    if (!token) return res.status(401).json({ error: true, message: 'Token ausente' });

    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: true, message: 'Token inválido ou expirado' });
  }
}

export function signToken(user) {
  const payload = { id: user.id, email: user.email, role: user.role || 'user' };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '2h' });
}

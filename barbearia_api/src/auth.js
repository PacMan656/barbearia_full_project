// barbearia_api/src/auth.js
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db as authDb } from './db.js';

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing_token' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'invalid_token' });
  }
}

export function ensureAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  next();
}

export function ensureAdminUser() {
  const email = process.env.ADMIN_EMAIL;
  const pwd = process.env.ADMIN_PASSWORD;
  if (!email || !pwd) return;

  // Verifica se já existe
  const exists = authDb.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (!exists) {
    const hash = bcrypt.hashSync(pwd, 10);

    // ✅ Usa parâmetros (nada de "admin" com aspas duplas)
    authDb.prepare(
      'INSERT INTO users (email, password_hash, role, created_at) VALUES (?, ?, ?, ?)'
    ).run(email, hash, 'admin', Date.now());

    console.log(`[seed] Admin criado: ${email}`);
  }
}

export function verifyPassword(hash, plain) {
  return bcrypt.compareSync(plain, hash);
}

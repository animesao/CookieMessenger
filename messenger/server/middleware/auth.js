const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

if (!process.env.JWT_SECRET) {
  console.error('[SECURITY] WARNING: JWT_SECRET not set in environment! Using default insecure key.');
}

/**
 * Standard auth middleware — verifies JWT from Authorization header OR HttpOnly cookie
 * and checks if user is banned.
 */
function auth(req, res, next) {
  // Try Authorization header first (backward compatibility)
  let token = req.headers.authorization?.split(' ')[1];
  
  // If no header token, try cookie
  if (!token && req.cookies?.auth_token) {
    token = req.cookies.auth_token;
  }
  
  if (!token) return res.status(401).json({ error: 'Нет токена' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError')
      return res.status(401).json({ error: 'Токен истёк, войдите снова' });
    return res.status(401).json({ error: 'Неверный токен' });
  }

  // Check if user is banned on every request
  const user = db.prepare('SELECT is_banned, ban_reason FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(401).json({ error: 'Пользователь не найден' });
  if (user.is_banned)
    return res.status(403).json({ error: `Аккаунт заблокирован: ${user.ban_reason || 'Нарушение правил'}` });

  next();
}

module.exports = auth;

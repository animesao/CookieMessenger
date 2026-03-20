const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Нет токена' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Неверный токен' });
  }
}

// GET /api/profile/me
router.get('/me', auth, (req, res) => {
  const user = db.prepare('SELECT id, username, email, display_name, bio, avatar, banner, accent_color, profile_completed FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  res.json(user);
});

// PUT /api/profile/update
router.put('/update', auth, (req, res) => {
  const { display_name, bio, avatar, banner, accent_color } = req.body;
  db.prepare(`
    UPDATE users SET
      display_name = ?,
      bio = ?,
      avatar = ?,
      banner = ?,
      accent_color = ?,
      profile_completed = 1
    WHERE id = ?
  `).run(display_name || null, bio || null, avatar || null, banner || null, accent_color || '#ffffff', req.user.id);

  const updated = db.prepare('SELECT id, username, email, display_name, bio, avatar, banner, accent_color, profile_completed FROM users WHERE id = ?').get(req.user.id);
  res.json(updated);
});

module.exports = router;

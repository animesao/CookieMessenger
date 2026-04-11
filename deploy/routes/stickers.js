const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

// ── Init tables ───────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS sticker_packs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    cover TEXT,
    is_public INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS stickers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pack_id INTEGER NOT NULL,
    image TEXT NOT NULL,
    emoji TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pack_id) REFERENCES sticker_packs(id) ON DELETE CASCADE
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS user_sticker_packs (
    user_id INTEGER NOT NULL,
    pack_id INTEGER NOT NULL,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, pack_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (pack_id) REFERENCES sticker_packs(id) ON DELETE CASCADE
  )
`);

// ── GET /api/stickers/my — get user's added packs with stickers ───────────────
router.get('/my', auth, (req, res) => {
  const packs = db.prepare(`
    SELECT sp.*, u.username as owner_username,
      (SELECT COUNT(*) FROM stickers WHERE pack_id = sp.id) as sticker_count
    FROM sticker_packs sp
    JOIN user_sticker_packs usp ON usp.pack_id = sp.id
    JOIN users u ON u.id = sp.owner_id
    WHERE usp.user_id = ?
    ORDER BY usp.added_at DESC
  `).all(req.user.id);

  const result = packs.map(pack => ({
    ...pack,
    stickers: db.prepare('SELECT * FROM stickers WHERE pack_id = ? ORDER BY id').all(pack.id),
  }));
  res.json(result);
});

// ── GET /api/stickers/public — browse public packs ────────────────────────────
router.get('/public', auth, (req, res) => {
  const { q } = req.query;
  let packs;
  if (q) {
    packs = db.prepare(`
      SELECT sp.*, u.username as owner_username,
        (SELECT COUNT(*) FROM stickers WHERE pack_id = sp.id) as sticker_count,
        (SELECT 1 FROM user_sticker_packs WHERE user_id = ? AND pack_id = sp.id) as added
      FROM sticker_packs sp
      JOIN users u ON u.id = sp.owner_id
      WHERE sp.is_public = 1 AND sp.name LIKE ?
      ORDER BY sp.created_at DESC LIMIT 20
    `).all(req.user.id, `%${q}%`);
  } else {
    packs = db.prepare(`
      SELECT sp.*, u.username as owner_username,
        (SELECT COUNT(*) FROM stickers WHERE pack_id = sp.id) as sticker_count,
        (SELECT 1 FROM user_sticker_packs WHERE user_id = ? AND pack_id = sp.id) as added
      FROM sticker_packs sp
      JOIN users u ON u.id = sp.owner_id
      WHERE sp.is_public = 1
      ORDER BY sp.created_at DESC LIMIT 20
    `).all(req.user.id);
  }

  const result = packs.map(pack => ({
    ...pack,
    preview: db.prepare('SELECT image FROM stickers WHERE pack_id = ? LIMIT 4').all(pack.id).map(s => s.image),
  }));
  res.json(result);
});

// ── POST /api/stickers/packs — create pack ────────────────────────────────────
router.post('/packs', auth, (req, res) => {
  const { name, description, is_public = 1 } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Название обязательно' });
  if (name.length > 64) return res.status(400).json({ error: 'Название слишком длинное' });

  const count = db.prepare('SELECT COUNT(*) as c FROM sticker_packs WHERE owner_id = ?').get(req.user.id).c;
  if (count >= 20) return res.status(400).json({ error: 'Максимум 20 паков' });

  const result = db.prepare(
    'INSERT INTO sticker_packs (owner_id, name, description, is_public) VALUES (?, ?, ?, ?)'
  ).run(req.user.id, name.trim(), description?.trim() || null, is_public ? 1 : 0);

  // Auto-add to own collection
  db.prepare('INSERT OR IGNORE INTO user_sticker_packs (user_id, pack_id) VALUES (?, ?)').run(req.user.id, result.lastInsertRowid);

  const pack = db.prepare('SELECT * FROM sticker_packs WHERE id = ?').get(result.lastInsertRowid);
  res.json({ ...pack, stickers: [] });
});

// ── POST /api/stickers/packs/:id/stickers — add sticker to pack ───────────────
router.post('/packs/:id/stickers', auth, (req, res) => {
  const pack = db.prepare('SELECT * FROM sticker_packs WHERE id = ?').get(req.params.id);
  if (!pack) return res.status(404).json({ error: 'Пак не найден' });
  if (pack.owner_id !== req.user.id) return res.status(403).json({ error: 'Нет прав' });

  const { image, emoji } = req.body;
  if (!image) return res.status(400).json({ error: 'Изображение обязательно' });

  const count = db.prepare('SELECT COUNT(*) as c FROM stickers WHERE pack_id = ?').get(pack.id).c;
  if (count >= 120) return res.status(400).json({ error: 'Максимум 120 стикеров в паке' });

  // Max ~2MB per sticker
  if (image.startsWith('data:') && Math.ceil((image.length * 3) / 4) > 2 * 1024 * 1024)
    return res.status(400).json({ error: 'Стикер не более 2MB' });

  const result = db.prepare('INSERT INTO stickers (pack_id, image, emoji) VALUES (?, ?, ?)').run(pack.id, image, emoji || null);
  const sticker = db.prepare('SELECT * FROM stickers WHERE id = ?').get(result.lastInsertRowid);
  res.json(sticker);
});

// ── DELETE /api/stickers/packs/:id/stickers/:sid — remove sticker ─────────────
router.delete('/packs/:id/stickers/:sid', auth, (req, res) => {
  const pack = db.prepare('SELECT * FROM sticker_packs WHERE id = ?').get(req.params.id);
  if (!pack) return res.status(404).json({ error: 'Пак не найден' });
  if (pack.owner_id !== req.user.id) return res.status(403).json({ error: 'Нет прав' });
  db.prepare('DELETE FROM stickers WHERE id = ? AND pack_id = ?').run(req.params.sid, pack.id);
  res.json({ ok: true });
});

// ── DELETE /api/stickers/packs/:id — delete pack ─────────────────────────────
router.delete('/packs/:id', auth, (req, res) => {
  const pack = db.prepare('SELECT * FROM sticker_packs WHERE id = ?').get(req.params.id);
  if (!pack) return res.status(404).json({ error: 'Пак не найден' });
  if (pack.owner_id !== req.user.id) return res.status(403).json({ error: 'Нет прав' });
  db.prepare('DELETE FROM sticker_packs WHERE id = ?').run(pack.id);
  res.json({ ok: true });
});

// ── POST /api/stickers/packs/:id/add — add pack to collection ────────────────
router.post('/packs/:id/add', auth, (req, res) => {
  const pack = db.prepare('SELECT * FROM sticker_packs WHERE id = ? AND is_public = 1').get(req.params.id);
  if (!pack) return res.status(404).json({ error: 'Пак не найден' });
  db.prepare('INSERT OR IGNORE INTO user_sticker_packs (user_id, pack_id) VALUES (?, ?)').run(req.user.id, pack.id);
  res.json({ ok: true });
});

// ── DELETE /api/stickers/packs/:id/remove — remove from collection ────────────
router.delete('/packs/:id/remove', auth, (req, res) => {
  db.prepare('DELETE FROM user_sticker_packs WHERE user_id = ? AND pack_id = ?').run(req.user.id, req.params.id);
  res.json({ ok: true });
});

module.exports = router;

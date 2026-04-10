const express = require('express');
const db = require('../db');
const ws = require('../ws');
const auth = require('../middleware/auth');

const router = express.Router();

// Clean expired stories
function cleanExpired() {
  db.prepare("DELETE FROM stories WHERE expires_at < datetime('now')").run();
}

// ── GET /api/stories — get active stories for feed (friends + self) ───────────
router.get('/', auth, (req, res) => {
  cleanExpired();
  const me = req.user.id;

  // Get stories from self + friends
  const stories = db.prepare(`
    SELECT s.*, u.username, u.display_name, u.avatar, u.accent_color, u.animated_name,
      (SELECT COUNT(*) FROM story_views WHERE story_id = s.id) as views_count,
      (SELECT 1 FROM story_views WHERE story_id = s.id AND user_id = ?) as viewed
    FROM stories s
    JOIN users u ON u.id = s.user_id
    WHERE s.expires_at > datetime('now')
      AND (
        s.user_id = ?
        OR s.user_id IN (
          SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END
          FROM friendships WHERE (requester_id = ? OR addressee_id = ?) AND status = 'accepted'
        )
      )
    ORDER BY s.user_id = ? DESC, s.created_at DESC
  `).all(me, me, me, me, me, me);

  // Group by user
  const usersMap = new Map();
  for (const s of stories) {
    if (!usersMap.has(s.user_id)) {
      usersMap.set(s.user_id, {
        user_id: s.user_id,
        username: s.username,
        display_name: s.display_name,
        avatar: s.avatar,
        accent_color: s.accent_color,
        animated_name: s.animated_name,
        stories: [],
        has_unseen: false,
      });
    }
    const u = usersMap.get(s.user_id);
    u.stories.push(s);
    if (!s.viewed) u.has_unseen = true;
  }

  res.json(Array.from(usersMap.values()));
});

// ── POST /api/stories — create story ─────────────────────────────────────────
router.post('/', auth, (req, res) => {
  const { media, media_type = 'image', text, duration = 5 } = req.body;
  if (!media) return res.status(400).json({ error: 'Медиа обязательно' });

  // Max 5MB
  if (media.startsWith('data:') && Math.ceil((media.length * 3) / 4) > 5 * 1024 * 1024)
    return res.status(400).json({ error: 'Файл слишком большой. Максимум 5MB' });

  // Max 10 active stories per user
  const count = db.prepare("SELECT COUNT(*) as c FROM stories WHERE user_id = ? AND expires_at > datetime('now')").get(req.user.id).c;
  if (count >= 10) return res.status(400).json({ error: 'Максимум 10 активных историй' });

  const result = db.prepare(
    'INSERT INTO stories (user_id, media, media_type, text, duration) VALUES (?, ?, ?, ?, ?)'
  ).run(req.user.id, media, media_type, text || null, duration);

  const story = db.prepare(`
    SELECT s.*, u.username, u.display_name, u.avatar, u.accent_color
    FROM stories s JOIN users u ON u.id = s.user_id WHERE s.id = ?
  `).get(result.lastInsertRowid);

  ws.broadcast('new_story', { userId: req.user.id, story });
  res.json(story);
});

// ── POST /api/stories/:id/view — mark as viewed ───────────────────────────────
router.post('/:id/view', auth, (req, res) => {
  const storyId = parseInt(req.params.id);
  if (isNaN(storyId)) return res.status(400).json({ error: 'Неверный ID' });
  try {
    db.prepare('INSERT OR IGNORE INTO story_views (story_id, user_id) VALUES (?, ?)').run(storyId, req.user.id);
  } catch {}
  const views = db.prepare('SELECT COUNT(*) as c FROM story_views WHERE story_id = ?').get(storyId).c;
  res.json({ ok: true, views });
});

// ── DELETE /api/stories/:id — delete own story ────────────────────────────────
router.delete('/:id', auth, (req, res) => {
  const story = db.prepare('SELECT * FROM stories WHERE id = ?').get(req.params.id);
  if (!story) return res.status(404).json({ error: 'История не найдена' });
  if (story.user_id !== req.user.id) return res.status(403).json({ error: 'Нет прав' });
  db.prepare('DELETE FROM stories WHERE id = ?').run(story.id);
  res.json({ ok: true });
});

// ── GET /api/stories/:id/viewers — who viewed (own stories only) ──────────────
router.get('/:id/viewers', auth, (req, res) => {
  const story = db.prepare('SELECT * FROM stories WHERE id = ?').get(req.params.id);
  if (!story) return res.status(404).json({ error: 'История не найдена' });
  if (story.user_id !== req.user.id) return res.status(403).json({ error: 'Нет прав' });

  const viewers = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar, u.accent_color, sv.viewed_at
    FROM story_views sv JOIN users u ON u.id = sv.user_id
    WHERE sv.story_id = ? ORDER BY sv.viewed_at DESC
  `).all(story.id);
  res.json(viewers);
});

module.exports = router;

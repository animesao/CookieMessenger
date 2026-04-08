const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

// POST /api/reports — submit a report
router.post('/', auth, (req, res) => {
  try {
    const { target_type, target_id, reason } = req.body;

    if (!['channel', 'group', 'post', 'user'].includes(target_type))
      return res.status(400).json({ error: 'Неверный тип объекта' });
    if (!reason?.trim())
      return res.status(400).json({ error: 'Укажите причину жалобы' });
    if (!target_id)
      return res.status(400).json({ error: 'Неверный ID объекта' });

    const tid = parseInt(target_id);
    if (isNaN(tid)) return res.status(400).json({ error: 'Неверный ID объекта' });

    // Prevent duplicate pending reports from same user
    const existing = db.prepare(
      'SELECT id FROM reports WHERE reporter_id = ? AND target_type = ? AND target_id = ? AND status = "pending"'
    ).get(req.user.id, target_type, tid);

    if (existing)
      return res.status(409).json({ error: 'Вы уже отправили жалобу на этот объект' });

    db.prepare(
      'INSERT INTO reports (reporter_id, target_type, target_id, reason) VALUES (?, ?, ?, ?)'
    ).run(req.user.id, target_type, tid, reason.trim().slice(0, 500));

    res.json({ ok: true });
  } catch (err) {
    console.error('[REPORTS]', err.message);
    res.status(500).json({ error: 'Ошибка сервера: ' + err.message });
  }
});

module.exports = router;

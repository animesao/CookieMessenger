const express = require('express');
const db = require('../db');
const ws = require('../ws');
const auth = require('../middleware/auth');
const { validateLengths, postLimiter } = require('../middleware/security');

const router = express.Router();

function parseMentions(text) {
  if (!text) return [];
  const matches = [...text.matchAll(/@([a-zA-Z0-9_]+)/g)];
  const usernames = [...new Set(matches.map(m => m[1].toLowerCase()))];
  return usernames
    .map(u => db.prepare('SELECT id FROM users WHERE LOWER(username) = ?').get(u))
    .filter(Boolean)
    .map(u => u.id);
}

function notify(userId, actorId, type, postId = null, commentId = null) {
  if (userId === actorId) return;
  const result = db.prepare(
    'INSERT INTO notifications (user_id, actor_id, type, post_id, comment_id) VALUES (?, ?, ?, ?, ?)'
  ).run(userId, actorId, type, postId, commentId);

  // Send real-time notification
  const notif = db.prepare(`
    SELECT n.*,
      u.username as actor_username, u.display_name as actor_display_name,
      u.avatar as actor_avatar, u.accent_color as actor_accent_color,
      u.animated_name as actor_animated_name,
      p.content as post_content, p.type as post_type
    FROM notifications n
    JOIN users u ON u.id = n.actor_id
    LEFT JOIN posts p ON p.id = n.post_id
    WHERE n.id = ?
  `).get(result.lastInsertRowid);

  if (notif) ws.sendTo(userId, 'notification', notif);
}

function enrichPosts(posts, userId) {
  if (!posts.length) return [];

  const ids = posts.map(p => p.id);
  const placeholders = ids.map(() => '?').join(',');

  // Batch: likes count per post
  const likesRows = db.prepare(
    `SELECT post_id, COUNT(*) as c FROM likes WHERE post_id IN (${placeholders}) GROUP BY post_id`
  ).all(...ids);
  const likesMap = Object.fromEntries(likesRows.map(r => [r.post_id, r.c]));

  // Batch: user liked
  const likedRows = db.prepare(
    `SELECT post_id FROM likes WHERE post_id IN (${placeholders}) AND user_id = ?`
  ).all(...ids, userId);
  const likedSet = new Set(likedRows.map(r => r.post_id));

  // Batch: comments count
  const commentsRows = db.prepare(
    `SELECT post_id, COUNT(*) as c FROM comments WHERE post_id IN (${placeholders}) GROUP BY post_id`
  ).all(...ids);
  const commentsMap = Object.fromEntries(commentsRows.map(r => [r.post_id, r.c]));

  // Batch: views count
  const viewsRows = db.prepare(
    `SELECT post_id, COUNT(*) as c FROM post_views WHERE post_id IN (${placeholders}) GROUP BY post_id`
  ).all(...ids);
  const viewsMap = Object.fromEntries(viewsRows.map(r => [r.post_id, r.c]));

  // Batch: poll options for poll posts
  const pollIds = posts.filter(p => p.type === 'poll').map(p => p.id);
  let pollOptionsMap = {};
  let pollVotesMap = {};
  let userVotesMap = {};

  if (pollIds.length) {
    const pollPlaceholders = pollIds.map(() => '?').join(',');
    const options = db.prepare(
      `SELECT * FROM poll_options WHERE post_id IN (${pollPlaceholders})`
    ).all(...pollIds);
    options.forEach(o => {
      if (!pollOptionsMap[o.post_id]) pollOptionsMap[o.post_id] = [];
      pollOptionsMap[o.post_id].push(o);
    });

    const optionIds = options.map(o => o.id);
    if (optionIds.length) {
      const optPlaceholders = optionIds.map(() => '?').join(',');
      const votes = db.prepare(
        `SELECT option_id, COUNT(*) as c FROM poll_votes WHERE option_id IN (${optPlaceholders}) GROUP BY option_id`
      ).all(...optionIds);
      pollVotesMap = Object.fromEntries(votes.map(v => [v.option_id, v.c]));

      const userVotes = db.prepare(
        `SELECT pv.option_id, po.post_id FROM poll_votes pv
         JOIN poll_options po ON po.id = pv.option_id
         WHERE po.post_id IN (${pollPlaceholders}) AND pv.user_id = ?`
      ).all(...pollIds, userId);
      userVotes.forEach(v => { userVotesMap[v.post_id] = v.option_id; });
    }
  }

  return posts.map(post => {
    let poll = null;
    if (post.type === 'poll' && pollOptionsMap[post.id]) {
      poll = pollOptionsMap[post.id].map(o => ({
        ...o,
        votes: pollVotesMap[o.id] || 0,
        voted: userVotesMap[post.id] === o.id,
      }));
    }
    return {
      ...post,
      likes: likesMap[post.id] || 0,
      liked: likedSet.has(post.id),
      commentsCount: commentsMap[post.id] || 0,
      views: viewsMap[post.id] || 0,
      poll,
    };
  });
}

// Keep single-post enrichment for backwards compat
function enrichPost(post, userId) {
  return enrichPosts([post], userId)[0];
}

// ─── Feed ────────────────────────────────────────────────────────────────────

const VALID_MODES = ['all', 'friends', 'channels', 'people'];

function getFriendIds(userId) {
  return db.prepare(`
    SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END as friend_id
    FROM friendships WHERE (requester_id = ? OR addressee_id = ?) AND status = 'accepted'
  `).all(userId, userId, userId).map(r => r.friend_id);
}

router.get('/', auth, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = 20;
  const offset = (page - 1) * limit;
  const mode = VALID_MODES.includes(req.query.mode) ? req.query.mode : 'all';
  const me = req.user.id;

  if (mode === 'channels') {
    const subscribedChannels = db.prepare(
      'SELECT channel_id FROM channel_subscribers WHERE user_id = ?'
    ).all(me).map(r => r.channel_id);

    if (!subscribedChannels.length) {
      return res.json({ posts: [], hasMore: false });
    }

    const placeholders = subscribedChannels.map(() => '?').join(',');
    const channelPosts = db.prepare(`
      SELECT cp.id, cp.channel_id, cp.author_id as user_id, cp.content, cp.media,
             cp.created_at, cp.views,
             u.username, u.display_name, u.avatar, u.accent_color, u.animated_name, u.verified
      FROM channel_posts cp
      JOIN users u ON u.id = cp.author_id
      WHERE cp.channel_id IN (${placeholders})
      ORDER BY cp.created_at DESC LIMIT ? OFFSET ?
    `).all(...subscribedChannels, limit, offset);

    const total = db.prepare(
      `SELECT COUNT(*) as c FROM channel_posts WHERE channel_id IN (${placeholders})`
    ).get(...subscribedChannels).c;

    const normalized = channelPosts.map(cp => ({
      ...cp,
      type: 'text',
      likes: 0, liked: false, commentsCount: 0, views: cp.views || 0,
      poll: null,
      isChannelPost: true,
    }));

    return res.json({ posts: normalized, hasMore: offset + limit < total });
  }

  let whereClause = '';
  let params = [];

  if (mode === 'friends') {
    const friendIds = getFriendIds(me);
    if (!friendIds.length) return res.json({ posts: [], hasMore: false });
    const ph = friendIds.map(() => '?').join(',');
    whereClause = `WHERE p.user_id IN (${ph})`;
    params = friendIds;
  } else if (mode === 'people') {
    const friendIds = getFriendIds(me);
    if (friendIds.length) {
      const ph = friendIds.map(() => '?').join(',');
      whereClause = `WHERE p.user_id NOT IN (${ph}) AND p.user_id != ?`;
      params = [...friendIds, me];
    } else {
      whereClause = 'WHERE p.user_id != ?';
      params = [me];
    }
  }

  const posts = db.prepare(`
    SELECT p.*, u.username, u.display_name, u.avatar, u.accent_color, u.animated_name, u.verified
    FROM posts p JOIN users u ON u.id = p.user_id
    ${whereClause}
    ORDER BY p.created_at DESC LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  const total = db.prepare(
    `SELECT COUNT(*) as c FROM posts p ${whereClause}`
  ).get(...params).c;

  res.json({ posts: enrichPosts(posts, me), hasMore: offset + limit < total });
});

router.post('/', auth, postLimiter, validateLengths({ content: 2000 }), (req, res) => {
  const { type, content, media, poll_options } = req.body;
  if (!type || !['text', 'image', 'video', 'poll'].includes(type))
    return res.status(400).json({ error: 'Неверный тип поста' });
  if (type !== 'poll' && !content && !media) return res.status(400).json({ error: 'Пустой пост' });
  if (type === 'poll' && (!poll_options || poll_options.length < 2))
    return res.status(400).json({ error: 'Минимум 2 варианта' });
  if (type === 'poll' && poll_options.length > 10)
    return res.status(400).json({ error: 'Максимум 10 вариантов' });
  if (type === 'poll' && poll_options.some(o => typeof o !== 'string' || o.length > 200))
    return res.status(400).json({ error: 'Вариант слишком длинный' });

  const result = db.prepare(
    'INSERT INTO posts (user_id, type, content, media) VALUES (?, ?, ?, ?)'
  ).run(req.user.id, type, content || null, media || null);

  const postId = result.lastInsertRowid;

  if (type === 'poll') {
    const ins = db.prepare('INSERT INTO poll_options (post_id, text) VALUES (?, ?)');
    poll_options.forEach(opt => ins.run(postId, opt));
  }

  parseMentions(content).forEach(uid => notify(uid, req.user.id, 'mention', postId));

  const post = db.prepare(`
    SELECT p.*, u.username, u.display_name, u.avatar, u.accent_color, u.animated_name, u.verified
    FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = ?
  `).get(postId);

  const enriched = enrichPost(post, req.user.id);

  // Broadcast new post to ALL connected users
  ws.broadcast('new_post', enriched);

  res.json(enriched);
});

// ─── Specific routes BEFORE /:id ─────────────────────────────────────────────

router.get('/notifications', auth, (req, res) => {
  const notifs = db.prepare(`
    SELECT n.*,
      u.username as actor_username, u.display_name as actor_display_name,
      u.avatar as actor_avatar, u.accent_color as actor_accent_color,
      u.animated_name as actor_animated_name,
      p.content as post_content, p.type as post_type
    FROM notifications n
    JOIN users u ON u.id = n.actor_id
    LEFT JOIN posts p ON p.id = n.post_id
    WHERE n.user_id = ?
    ORDER BY n.created_at DESC
    LIMIT 50
  `).all(req.user.id);
  res.json(notifs);
});

router.get('/notifications/unread-count', auth, (req, res) => {
  const count = db.prepare(
    'SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND read = 0'
  ).get(req.user.id).c;
  res.json({ count });
});

router.post('/notifications/read-all', auth, (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.user.id);
  res.json({ ok: true });
});

router.get('/mention-search', auth, (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  if (!q) {
    const users = db.prepare(
      'SELECT id, username, display_name, avatar, accent_color FROM users LIMIT 6'
    ).all();
    return res.json(users);
  }
  const users = db.prepare(`
    SELECT id, username, display_name, avatar, accent_color
    FROM users WHERE LOWER(username) LIKE ? OR LOWER(display_name) LIKE ?
    LIMIT 6
  `).all(`${q}%`, `${q}%`);
  res.json(users);
});

router.post('/poll/:optionId/vote', auth, (req, res) => {
  const optionId = parseInt(req.params.optionId);
  if (isNaN(optionId)) return res.status(400).json({ error: 'Неверный ID опции' });

  const option = db.prepare('SELECT * FROM poll_options WHERE id = ?').get(optionId);
  if (!option) return res.status(404).json({ error: 'Вариант не найден' });

  // Check post still exists
  const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(option.post_id);
  if (!post) return res.status(404).json({ error: 'Пост удалён' });

  const existing = db.prepare(`
    SELECT pv.* FROM poll_votes pv
    JOIN poll_options po ON po.id = pv.option_id
    WHERE po.post_id = ? AND pv.user_id = ?
  `).get(option.post_id, req.user.id);

  if (existing) {
    if (existing.option_id === optionId) {
      db.prepare('DELETE FROM poll_votes WHERE option_id = ? AND user_id = ?').run(optionId, req.user.id);
    } else {
      db.prepare('DELETE FROM poll_votes WHERE option_id = ? AND user_id = ?').run(existing.option_id, req.user.id);
      db.prepare('INSERT INTO poll_votes (option_id, user_id) VALUES (?, ?)').run(optionId, req.user.id);
    }
  } else {
    db.prepare('INSERT INTO poll_votes (option_id, user_id) VALUES (?, ?)').run(optionId, req.user.id);
  }

  const options = db.prepare('SELECT * FROM poll_options WHERE post_id = ?').all(option.post_id);
  const userVote = db.prepare(`
    SELECT pv.option_id FROM poll_votes pv
    JOIN poll_options po ON po.id = pv.option_id
    WHERE po.post_id = ? AND pv.user_id = ?
  `).get(option.post_id, req.user.id);

  const updatedPoll = options.map(o => ({
    ...o,
    votes: db.prepare('SELECT COUNT(*) as c FROM poll_votes WHERE option_id = ?').get(o.id).c,
    voted: userVote?.option_id === o.id,
  }));

  // Broadcast poll update to all
  ws.broadcast('poll_update', { postId: option.post_id, poll: updatedPoll });

  res.json(updatedPoll);
});

// ─── Parametric /:id ─────────────────────────────────────────────────────────

router.delete('/:id', auth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Не найден' });
  if (post.user_id !== req.user.id) return res.status(403).json({ error: 'Нет доступа' });
  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  ws.broadcast('delete_post', { postId: parseInt(req.params.id) });
  res.json({ ok: true });
});

router.post('/:id/like', auth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Не найден' });

  const liked = db.prepare('SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (liked) {
    db.prepare('DELETE FROM likes WHERE post_id = ? AND user_id = ?').run(req.params.id, req.user.id);
  } else {
    db.prepare('INSERT INTO likes (post_id, user_id) VALUES (?, ?)').run(req.params.id, req.user.id);
    notify(post.user_id, req.user.id, 'like', post.id);
  }
  const count = db.prepare('SELECT COUNT(*) as c FROM likes WHERE post_id = ?').get(req.params.id).c;

  // Broadcast like update to all
  ws.broadcast('like_update', { postId: parseInt(req.params.id), liked: !liked, count, actorId: req.user.id });

  res.json({ liked: !liked, count });
});

// Register post view (unique per user) — rate limited
const viewCooldown = new Map();
router.post('/:id/view', auth, (req, res) => {
  const postId = parseInt(req.params.id);
  if (isNaN(postId)) return res.status(400).json({ error: 'Неверный ID' });

  // Rate limit: max 1 view registration per post per 10 seconds per user
  const key = `${req.user.id}:${postId}`;
  const now = Date.now();
  if (viewCooldown.has(key) && now - viewCooldown.get(key) < 10_000) {
    return res.json({ views: 0 }); // silently ignore
  }
  viewCooldown.set(key, now);
  
  const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(postId);
  if (!post) return res.status(404).json({ error: 'Пост не найден' });
  
  try {
    db.prepare('INSERT INTO post_views (post_id, user_id) VALUES (?, ?)').run(postId, req.user.id);
  } catch (err) {
    // Already viewed - ignore
  }
  
  const views = db.prepare('SELECT COUNT(*) as c FROM post_views WHERE post_id = ?').get(postId).c;
  res.json({ views });
});

router.get('/:id/comments', auth, (req, res) => {
  const comments = db.prepare(`
    SELECT c.*, u.username, u.display_name, u.avatar, u.accent_color, u.animated_name, u.verified
    FROM comments c JOIN users u ON u.id = c.user_id
    WHERE c.post_id = ? ORDER BY c.created_at ASC
  `).all(req.params.id);
  res.json(comments);
});

router.post('/:id/comments', auth, postLimiter, validateLengths({ content: 1000 }), (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Пустой комментарий' });

  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Пост не найден' });

  const result = db.prepare(
    'INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)'
  ).run(req.params.id, req.user.id, content.trim());

  const commentId = result.lastInsertRowid;

  notify(post.user_id, req.user.id, 'comment', post.id, commentId);
  parseMentions(content).forEach(uid => notify(uid, req.user.id, 'mention', post.id, commentId));

  const comment = db.prepare(`
    SELECT c.*, u.username, u.display_name, u.avatar, u.accent_color, u.animated_name, u.verified
    FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?
  `).get(commentId);

  // Broadcast new comment to all (they'll add it if they have that post open)
  ws.broadcast('new_comment', { postId: parseInt(req.params.id), comment });

  res.json(comment);
});

module.exports = router;

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const https = require('https');
const db = require('../db');
const { authLimiter, validateRegistration } = require('../middleware/security');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || 'http://213.152.43.207/api/auth/discord/callback';

// ── Helpers ───────────────────────────────────────────────────────────────────
function httpsPost(url, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const body = typeof data === 'string' ? data : new URLSearchParams(data).toString();
    const urlObj = new URL(url);
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body), ...headers },
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    https.get({ hostname: urlObj.hostname, path: urlObj.pathname + urlObj.search, headers }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    }).on('error', reject);
  });
}

function makeToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
}

// Set secure HttpOnly cookie with token
function setAuthCookie(res, token) {
  res.cookie('auth_token', token, {
    httpOnly: true,  // Cannot be accessed by JavaScript
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    sameSite: 'strict', // CSRF protection
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  });
}

// Generate CSRF token
function generateCSRFToken() {
  return require('crypto').randomBytes(32).toString('hex');
}

function userPayload(user) {
  return {
    id: user.id, username: user.username, email: user.email,
    display_name: user.display_name, bio: user.bio,
    avatar: user.avatar, banner: user.banner,
    accent_color: user.accent_color, profile_completed: user.profile_completed,
    created_at: user.created_at, discord_verified: user.discord_verified,
  };
}

// ── In-memory captcha store (server-side) ────────────────────────────────────
const captchaStore = new Map(); // token -> { answer, expiresAt }

function generateServerCaptcha() {
  const ops = ['+', '-', '*'];
  const op = ops[Math.floor(Math.random() * ops.length)];
  let a, b;
  if (op === '+') { a = Math.floor(Math.random() * 20) + 1; b = Math.floor(Math.random() * 20) + 1; }
  else if (op === '-') { a = Math.floor(Math.random() * 20) + 10; b = Math.floor(Math.random() * a) + 1; }
  else { a = Math.floor(Math.random() * 9) + 2; b = Math.floor(Math.random() * 9) + 2; }
  const answer = op === '+' ? a + b : op === '-' ? a - b : a * b;
  const token = require('crypto').randomBytes(16).toString('hex');
  captchaStore.set(token, { answer, expiresAt: Date.now() + 10 * 60_000 }); // 10 min TTL
  // Cleanup expired
  for (const [k, v] of captchaStore) { if (Date.now() > v.expiresAt) captchaStore.delete(k); }
  return { token, question: `${a} ${op} ${b}` };
}

function verifyCaptchaToken(token, answer) {
  const entry = captchaStore.get(token);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) { captchaStore.delete(token); return false; }
  const ok = parseInt(answer) === entry.answer;
  captchaStore.delete(token); // one-time use
  return ok;
}

// ── Discord OAuth state store (prevent CSRF) ──────────────────────────────────
const discordStateStore = new Map(); // state -> { mode, expiresAt }

function createDiscordState(mode) {
  const state = require('crypto').randomBytes(16).toString('hex') + '_' + mode;
  discordStateStore.set(state, { mode, expiresAt: Date.now() + 10 * 60_000 });
  return state;
}

function verifyDiscordState(state) {
  const entry = discordStateStore.get(state);
  if (!entry || Date.now() > entry.expiresAt) { discordStateStore.delete(state); return null; }
  discordStateStore.delete(state);
  return entry.mode;
}

// ── Discord token temp store (avoid passing in URL) ───────────────────────────
const discordTempStore = new Map(); // tempKey -> { token, user, expiresAt }

function storeDiscordTemp(data) {
  const key = require('crypto').randomBytes(16).toString('hex');
  discordTempStore.set(key, { ...data, expiresAt: Date.now() + 5 * 60_000 }); // 5 min
  for (const [k, v] of discordTempStore) { if (Date.now() > v.expiresAt) discordTempStore.delete(k); }
  return key;
}

function getDiscordTemp(key) {
  const entry = discordTempStore.get(key);
  if (!entry || Date.now() > entry.expiresAt) { discordTempStore.delete(key); return null; }
  discordTempStore.delete(key); // one-time use
  return entry;
}

// ── GET /api/auth/captcha — get server-side captcha ──────────────────────────
router.get('/captcha', (req, res) => {
  const { token, question } = generateServerCaptcha();
  res.json({ token, question });
});

// ── POST /api/auth/register ───────────────────────────────────────────────────
router.post('/register', authLimiter, validateRegistration, async (req, res) => {
  const { username, email, password, captchaToken, captchaAnswer, discordKey } = req.body;

  // Verify server-side captcha
  if (!verifyCaptchaToken(captchaToken, captchaAnswer))
    return res.status(400).json({ error: 'Неверный ответ на капчу или капча устарела' });

  // Verify Discord — required
  if (!discordKey) return res.status(400).json({ error: 'Требуется подтверждение через Discord' });
  const discordData = getDiscordTemp(discordKey);
  if (!discordData) return res.status(400).json({ error: 'Discord сессия истекла. Авторизуйтесь снова.' });

  const discordId = discordData.discordId;
  const existing = db.prepare('SELECT id FROM users WHERE discord_id = ?').get(discordId);
  if (existing) return res.status(409).json({ error: 'Этот Discord аккаунт уже привязан' });

  try {
    const hashed = await bcrypt.hash(password, 12);
    db.prepare('INSERT INTO users (username, email, password, discord_id, discord_verified) VALUES (?, ?, ?, ?, 1)')
      .run(username, email.toLowerCase().trim(), hashed, discordId);
    res.json({ message: 'Регистрация успешна' });
  } catch (err) {
    if (err.message.includes('UNIQUE'))
      return res.status(409).json({ error: 'Пользователь уже существует' });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Заполните все поля' });

  const normalizedEmail = email.toLowerCase().trim();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);

  const dummyHash = '$2a$12$invalidhashfortimingprotection000000000000000000000000';
  const valid = user
    ? await bcrypt.compare(password, user.password)
    : await bcrypt.compare(password, dummyHash).then(() => false);

  if (!user || !valid) return res.status(401).json({ error: 'Неверный email или пароль' });
  if (user.is_banned) return res.status(403).json({ error: `Аккаунт заблокирован. Причина: ${user.ban_reason || 'Нарушение правил'}` });

  const token = makeToken(user);
  const csrfToken = generateCSRFToken();
  
  // Set HttpOnly cookie
  setAuthCookie(res, token);
  
  // Also return token for backward compatibility (will remove later)
  res.json({ 
    token, // Keep for now
    csrfToken, // Client must include this in requests
    user: userPayload(user) 
  });
});

// ── GET /api/auth/discord — redirect to Discord OAuth ────────────────────────
router.get('/discord', (req, res) => {
  const { mode = 'register' } = req.query;
  if (!DISCORD_CLIENT_ID) return res.status(500).json({ error: 'Discord OAuth не настроен' });

  const state = createDiscordState(mode);
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify email',
    state,
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

// ── GET /api/auth/discord/callback ───────────────────────────────────────────
router.get('/discord/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.redirect('/register?error=discord_cancelled');

  // Verify state to prevent CSRF
  const mode = verifyDiscordState(state);
  if (!mode) return res.redirect('/register?error=invalid_state');

  try {
    const tokenData = await httpsPost('https://discord.com/api/oauth2/token', {
      client_id: DISCORD_CLIENT_ID,
      client_secret: DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: DISCORD_REDIRECT_URI,
    });

    if (!tokenData.access_token) return res.redirect('/register?error=discord_token_failed');

    const discordUser = await httpsGet('https://discord.com/api/users/@me', {
      Authorization: `Bearer ${tokenData.access_token}`,
    });

    if (!discordUser.id) return res.redirect('/register?error=discord_user_failed');

    if (mode === 'register') {
      // Store Discord data server-side, pass only a temp key to frontend
      const tempKey = storeDiscordTemp({
        discordId: discordUser.id,
        username: discordUser.username,
        email: discordUser.email || '',
        avatar: discordUser.avatar
          ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
          : '',
      });
      return res.redirect(`/register?dk=${tempKey}`);
    }

    res.redirect('/profile');
  } catch (err) {
    console.error('Discord OAuth error:', err.message);
    res.redirect('/register?error=discord_error');
  }
});

// ── POST /api/auth/discord/session — get discord user info by temp key ────────
router.post('/discord/session', authLimiter, (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ error: 'Нет ключа' });
  const data = getDiscordTemp(key);
  if (!data) return res.status(400).json({ error: 'Сессия истекла. Авторизуйтесь через Discord снова.' });
  // Re-store since we consumed it — client needs it for registration too
  const newKey = storeDiscordTemp(data);
  res.json({
    key: newKey,
    username: data.username,
    email: data.email,
    avatar: data.avatar,
  });
});

// ── POST /api/auth/logout — clear auth cookie ─────────────────────────────────
router.post('/logout', (req, res) => {
  res.clearCookie('auth_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  });
  res.json({ message: 'Logged out' });
});

// ── WebSocket ticket store (one-time use) ─────────────────────────────────────
const wsTicketStore = new Map(); // ticket -> { userId, expiresAt }

function createWsTicket(userId) {
  const ticket = require('crypto').randomBytes(32).toString('hex');
  wsTicketStore.set(ticket, { userId, expiresAt: Date.now() + 30_000 }); // 30 sec TTL
  // Cleanup expired
  for (const [k, v] of wsTicketStore) {
    if (Date.now() > v.expiresAt) wsTicketStore.delete(k);
  }
  return ticket;
}

function verifyWsTicket(ticket) {
  const entry = wsTicketStore.get(ticket);
  if (!entry || Date.now() > entry.expiresAt) {
    wsTicketStore.delete(ticket);
    return null;
  }
  wsTicketStore.delete(ticket); // one-time use
  return entry.userId;
}

// ── POST /api/auth/ws-ticket — get one-time WebSocket ticket ─────────────────
router.post('/ws-ticket', require('../middleware/auth'), (req, res) => {
  const ticket = createWsTicket(req.user.id);
  res.json({ ticket });
});

module.exports = { router, verifyWsTicket };

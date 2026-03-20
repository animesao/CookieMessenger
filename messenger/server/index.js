const http = require('http');
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const settingsRoutes = require('./routes/settings');
const feedRoutes = require('./routes/feed');
const friendsRoutes = require('./routes/friends');
const messagesRoutes = require('./routes/messages');
const usersRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');
const ws = require('./ws');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/feed', feedRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/admin', adminRoutes);

// ── GIF proxy via Tenor (uses built-in https, no extra deps) ─────────────────
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? require('https') : require('http');
    lib.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (r) => {
      // Follow redirects
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        return httpsGet(r.headers.location).then(resolve).catch(reject);
      }
      let body = '';
      r.on('data', chunk => body += chunk);
      r.on('end', () => {
        try { resolve({ status: r.statusCode, data: JSON.parse(body) }); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

app.get('/api/gifs', async (req, res) => {
  try {
    const { q, limit = 24 } = req.query;

    // Tenor v1 — works with anonymous key
    const key = 'LIVDSRZULELA';
    const base = 'https://api.tenor.com/v1';
    const url = q
      ? `${base}/search?q=${encodeURIComponent(q)}&key=${key}&limit=${limit}&media_filter=minimal&contentfilter=medium&locale=ru_RU`
      : `${base}/trending?key=${key}&limit=${limit}&media_filter=minimal&contentfilter=medium&locale=ru_RU`;

    const { status, data } = await httpsGet(url);

    if (status === 200 && data.results && data.results.length > 0) {
      const results = data.results.map(item => ({
        id: item.id,
        title: item.title || '',
        preview: item.media?.[0]?.tinygif?.url || item.media?.[0]?.gif?.url || '',
        url: item.media?.[0]?.gif?.url || item.media?.[0]?.tinygif?.url || '',
      })).filter(r => r.preview);
      return res.json({ results });
    }

    res.json({ results: [] });
  } catch (err) {
    console.error('GIF proxy error:', err.message);
    res.json({ results: [] });
  }
});

ws.setup(server);

server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

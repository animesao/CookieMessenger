const { WebSocketServer, WebSocket } = require('ws');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';
const clients = new Map(); // userId -> Set<ws>

function setup(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');

    let userId = null;
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      userId = payload.id;
    } catch {
      ws.close(4001, 'Unauthorized');
      return;
    }

    if (!clients.has(userId)) clients.set(userId, new Set());
    clients.get(userId).add(ws);
    broadcast('user_online', { userId });

    // Handle WebRTC signaling messages from client
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        // Relay signaling messages to target user
        if (['call_offer', 'call_answer', 'call_ice', 'call_reject', 'call_end', 'call_busy'].includes(msg.event)) {
          sendTo(msg.to, msg.event, { ...msg.data, from: userId });
        }
      } catch {}
    });

    ws.on('close', () => {
      clients.get(userId)?.delete(ws);
      if (clients.get(userId)?.size === 0) {
        clients.delete(userId);
        broadcast('user_offline', { userId });
      }
    });

    ws.on('error', () => {});
  });
}

function sendTo(userIds, event, data) {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  const msg = JSON.stringify({ event, data });
  ids.forEach(uid => {
    clients.get(uid)?.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    });
  });
}

function broadcast(event, data) {
  const msg = JSON.stringify({ event, data });
  clients.forEach(sockets => {
    sockets.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    });
  });
}

function getOnlineUsers() {
  return [...clients.keys()];
}

module.exports = { setup, sendTo, broadcast, getOnlineUsers };

# AGENTS.md — CookieMessenger

## Developer Commands

### Install deps (both packages, separate installs)
```bash
cd messenger/server && npm install
cd ../client && npm install
```

### Start dev (two terminals)
```bash
# Terminal 1 — API + WS server (port 3001)
cd messenger/server && node index.js
# or with auto-reload:
cd messenger/server && npm run dev   # uses nodemon

# Terminal 2 — React dev server (port 5173)
cd messenger/client && npm run dev
```

### Build client for production
```bash
cd messenger/client && npm run build
# Output → messenger/client/dist/
```

### Setup env
```bash
cp messenger/server/.env.example messenger/server/.env
# Must set: JWT_SECRET (min 32 chars)
# Optional: DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI
```

## Architecture

Two independent npm packages with separate `node_modules/`:

| Path | Role | Stack |
|------|------|-------|
| `messenger/server/` | Express API + SQLite + WebSocket server | Node.js, better-sqlite3, ws, JWT |
| `messenger/client/` | React SPA | React 18, Vite, react-router-dom |
| `deploy/` | Production snapshot — server code + prebuilt client `dist/` | Copy of server with `client/dist/` |

### Entry points
- **Server**: `messenger/server/index.js` — mounts all `/api/*` routes, serves `../client/dist/` statically if it exists, attaches WebSocket at `/ws`
- **Client**: `messenger/client/src/` — Vite dev entry, built to `dist/`

### Server routes (all under `/api`)
`auth`, `profile`, `settings`, `feed`, `friends`, `messages`, `users`, `admin`, `roles`, `groups`, `channels`, `bookmarks`, `reports`, `stories`, `calls`, `stickers`, `gifs` (Tenor proxy), `status`

### Key files
- `messenger/server/db.js` — SQLite schema + migrations (creates `messenger.db` on first run)
- `messenger/server/ws.js` — WebSocket server (signaling for calls, real-time messages, notifications, online status)
- `messenger/server/middleware/security.js` — rate limiting (10 login/15min, 500 req/min API), XSS sanitization, security headers
- `messenger/server/middleware/auth.js` — JWT cookie validation + ban check on every request

## Important Gotchas

- **No `dotenv` dependency** — `.env` is parsed manually in `index.js` via `fs.readFileSync`. Changes to `.env` require a server restart.
- **Admin user** is hardcoded to email `yamekel0@gmail.com` — only this account can access `/api/admin` routes.
- **`deploy/` folder** is a production artifact, not a separate app. It mirrors `messenger/server/` and contains a prebuilt `client/dist/`. Update by copying from `messenger/client/dist/`.
- **PM2 process name on VDS is `rlc`** (not `cookiemessenger`). Update command: `pm2 restart rlc`.
- **No test runner configured** — plain JS project without jest/vitest.
- **No linter or type checker** — plain JS, no ESLint, no TypeScript.
- **WebSocket URL** in `messenger/client/src/hooks/useWebSocket.js` connects to `localhost:3001/ws` for dev. For production behind Nginx, remove the port and use `/ws` (proxied).
- **Body size limit** is 100mb on both JSON and urlencoded — set for media uploads.

## Deployment Flow

### VDS (Ubuntu)
1. `git pull origin main`
2. `cd messenger/client && npm run build`
3. Copy server files + `client/dist/` to `/var/www/CookieMessenger/`
4. `cd messenger/server && npm install`
5. Configure `.env` with server port and JWT_SECRET
6. `pm2 start index.js --name rlc && pm2 save`
7. Nginx proxies `/api/` → `localhost:3001`, `/ws` → `localhost:3001`, serves `dist/` for `/`

### Pterodactyl
- Upload `messenger/server/` contents to container root, place `messenger/client/dist/` as `client/dist/`
- Startup command: `node index.js`
- Port from Pterodactyl panel, set in `.env`

### Scripts in `scripts/`
- `build-and-deploy.sh` — git pull, build client, copy to `deploy/`, `pm2 restart rlc`
- `backup.sh` / `restore.sh` — SQLite + project backup to `/root/backups/messenger/`
- `check-deploy.sh` — verify deployed features are present in build
- `setup-ssl.sh` / `setup-turn.sh` — SSL and TURN server setup for WebRTC

## Voice/Video Calls

### How it works
- **`messenger/client/src/components/CallManager.jsx`** — single global component, mounted once in `Profile.jsx`. Handles all WebRTC logic: P2P audio/video calls, screen sharing, ICE management, retry, ringtone.
- **Signaling**: WebSocket events (`call_offer`, `call_answer`, `call_ice`, `call_reject`, `call_end`, `call_busy`) forwarded server-side by `messenger/server/ws.js`.
- **ICE servers**: Google STUN + openrelayproject TURN (public, may be unreliable). For production, use your own coturn (`scripts/setup-turn.sh`).
- **Call trigger**: `window.__startCall(user, 'audio'|'video')` — exposed globally by CallManager for calling from any component.
- **Call buttons**: Present in Messages chat header, Friends page (accepted friends), and UserProfile page.
- **Privacy**: Call privacy checked server-side in `ws.js` — respects `privacy_who_can_call` setting (`everyone`, `friends`, `nobody`).

### Call buttons added to
- `Messages.jsx` — chat header (audio + video)
- `Friends.jsx` — accepted friend cards (audio + video)
- `UserProfile.jsx` — next to "Написать" button (audio + video)

### Dead code removed
- CallEngine library (`src/lib/CallEngine.js`, `SignalingAdapter.js`), `useCallEngine` hook, `SimpleCallUI` component, and all associated docs/tests — were never integrated.

## DB
SQLite file at `messenger/server/messenger.db` — gitignored. Schema auto-created on first server start via `db.js`. Includes `.db-shm` and `.db-wal` journal files.

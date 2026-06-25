# Server Deployment Guide

## Quick Start

```bash
cd server/web
cp .env.example .env   # or edit .env directly
# Edit .env — set JWT_SECRET, DATABASE_URL, ADMIN_EMAIL
npm install
npm start              # starts Express + WebSocket on PORT (default 3300)
```

On first run, `runMigrations()` automatically:
- Creates the `fb_crawler` database if missing
- Creates all tables (`CREATE TABLE IF NOT EXISTS`)
- Adds new columns to existing tables (idempotent `ALTER ADD`)
- Creates the `remote_commands` table (new in this release)
- Seeds default keyword lists, price sources, and prompt profiles
- Promotes the `ADMIN_EMAIL` user to role `admin` / status `approved`
- Backfills all legacy `pending` users to `approved`

---

## Environment Variables (`web/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | `mysql://root:@localhost:3306/fb_crawler` | MySQL connection URL (`mysql://user:pass@host:port/db`) |
| `JWT_SECRET` | **Yes (prod)** | `dev-secret` (dev only) | Secret key for signing JWT tokens. Must be set in production. |
| `JWT_EXPIRES` | No | `30d` | Token expiry duration |
| `PORT` | No | `3300` | HTTP + WebSocket listen port |
| `ADMIN_EMAIL` | No | — | Email of the first admin account (auto-promoted on migration) |
| `NODE_ENV` | No | — | Set to `production` for prod; affects debug routes |

---

## New in This Release: WebSocket Real-Time Push

The server now serves **both HTTP API and WebSocket** on the **same port** (default 3300). The WebSocket endpoint is:

```
ws://<host>:<port>/ws/commands?token=<JWT>
```

### How It Works

- Chrome extension connects via WebSocket after login
- When a command is created from the web UI, the server **pushes it instantly** to the connected extension
- The extension also polls every 30s as a fallback (hybrid model)
- Heartbeat: server pings every 30s, terminates dead sockets
- One user can have multiple connections (multiple browser profiles)

### Key Files

| File | Purpose |
|------|---------|
| `web/realtime.js` | WebSocket server — auth, connection registry, fan-out push |
| `web/server.js` | Creates `http.Server` wrapping Express, attaches WS upgrade handler |
| `web/remote-commands.js` | REST API for commands; calls `pushCommand()` after INSERT |
| `web/schema.js` | Creates `remote_commands` table on migration |

---

## Reverse Proxy Configuration (Nginx)

If the server runs behind Nginx, you **must** configure WebSocket upgrade headers:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # API + WebSocket
    location / {
        proxy_pass http://127.0.0.1:3300;
        proxy_http_version 1.1;

        # WebSocket upgrade support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Preserve client info
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeout for long-lived WebSocket connections
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

### Caddy Example

```
your-domain.com {
    reverse_proxy 127.0.0.1:3300
    # Caddy handles WebSocket upgrade automatically
}
```

### Cloudflare

If using Cloudflare, ensure **WebSockets** is enabled in the network settings (it is by default on Pro/Business/Enterprise). No special config needed on free tier if using Cloudflare Tunnel.

---

## Web UI (Next.js Dashboard)

The modern dashboard is a separate Next.js app in `server/web-ui/`.

```bash
cd server/web-ui
cp .env.local.example .env.local   # or edit directly
# .env.local: API_ORIGIN=http://localhost:3300
npm install
npm run build
npm start                          # runs on port 3000 by default
```

The Next.js app proxies `/api/*` requests to the Express backend via `next.config.ts` rewrites. For production, you can either:

1. **Run both** — Next.js on port 3000, Express on port 3300, proxy via Nginx
2. **Serve the static legacy dashboard** — Express serves `web/public/` at `/` (already built-in)

---

## Systemd Service Example

```ini
[Unit]
Description=FB Crawler Web Backend
After=network.target mysql.service

[Service]
Type=simple
WorkingDirectory=/opt/fb-ui/web
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
EnvironmentFile=/opt/fb-ui/web/.env

[Install]
WantedBy=multi-user.target
```

Or use **PM2**:

```bash
cd server/web
pm2 start server.js --name fb-web-api
pm2 save
pm2 startup
```

---

## Verification Checklist

After deploying, verify the new features:

### 1. API Health
```bash
curl http://localhost:3300/api/auth/login
# Should return 400 (missing body) — confirms server is running
```

### 2. WebSocket Upgrade
```bash
# Get a token first
TOKEN=$(curl -s -X POST http://localhost:3300/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"..."}' | jq -r '.token')

# Test WebSocket connection (requires wscat or similar)
npx wscat -c "ws://localhost:3300/ws/commands?token=$TOKEN"
# Should receive: {"type":"connected"}
```

### 3. Remote Commands Table
```sql
SHOW TABLES LIKE 'remote_commands';
DESCRIBE remote_commands;
```

Expected columns: `id`, `user_id`, `type`, `payload`, `status`, `result`, `error`, `created_at`, `updated_at`

### 4. Run Tests
```bash
cd server/web && npm test
# Should pass all tests including realtime WS tests

cd ../../ && npm test  # extension tests
# 76 tests, all passing
```

---

## Architecture Diagram

```
┌─────────────┐     HTTP/WS      ┌──────────────────────┐
│   Chrome     │ ◄──────────────► │  Express + WS Server │
│   Extension  │   port 3300      │  (web/server.js)     │
│              │                   │                      │
│  remote-     │   REST: /api/    │  /api/remote-commands│
│  commands.js │   WS: /ws/commands│  realtime.js (WS)   │
└─────────────┘                   └──────────┬───────────┘
                                             │
                                    ┌────────▼───────────┐
┌─────────────┐   HTTP (proxy)     │   MySQL Database    │
│   Web UI     │ ──────────────────►│   (fb_crawler)     │
│   (Next.js)  │   /api/*          │                     │
│   port 3000  │                   │  remote_commands    │
└─────────────┘                   │  users, posts, ...  │
                                   └─────────────────────┘
```

---

## What Changed (Commit `b174509`)

**10 files changed, 1020 insertions(+), 30 deletions(-)**

- ✅ `web/realtime.js` — NEW: WebSocket server with JWT auth, heartbeat, fan-out push
- ✅ `web/remote-commands.js` — NEW: REST API for remote commands + WS push after INSERT
- ✅ `web/server.js` — Changed to `http.createServer(app)` for shared port with WS
- ✅ `web/schema.js` — Added `remote_commands` table DDL + migration
- ✅ `web/package.json` — Added `ws@8.18.0` dependency
- ✅ `web/README.md` — Updated documentation
- ✅ `web-ui/` — New remote commands page, auto-refresh, WS status indicator
- ✅ `web-ui/src/lib/nav.ts`, `types.ts` — Updated for remote commands nav + types

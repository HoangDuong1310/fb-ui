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
- Creates the `remote_commands` table
- Adds AI config columns to `users` table (`ai_api_base`, `ai_api_key`, `ai_model`)
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
| `AI_API_BASE` | No | `https://danglamgiau.com/v1` | Default AI API base URL (overridden per-user in Settings) |
| `AI_MODEL` | No | `claude-opus-4.8` | Default AI model name (overridden per-user in Settings) |

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

## AI Configuration (Per-User API Keys)

AI-powered features (intent classification, advisory drafting, conversation replies, post spinning) are now available in the Web UI. **Each user configures their own API key** — there is no shared server-side AI key.

### How It Works

1. Each user sets their AI API key, base URL, and model via the **Settings** page in the Web UI
2. Keys are stored in the `users` table columns: `ai_api_base`, `ai_api_key`, `ai_model`
3. When the API key is read back (`GET /api/me/ai-config`), the key is **masked** (only last 4 chars shown)
4. If a user leaves fields empty, the server falls back to `AI_API_BASE` and `AI_MODEL` from `.env`
5. **No `AI_API_KEY` in `.env`** — the server never stores or needs a global AI key

### AI Endpoints (all require authentication)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/me/ai-config` | GET | Read current user's AI config (key masked) |
| `/api/me/ai-config` | PUT | Update current user's AI config |
| `/api/ai/classify` | POST | Classify message intent (buy/sell/support) |
| `/api/ai/draft-advisory` | POST | Draft a product advisory reply |
| `/api/ai/draft-conversation` | POST | Draft a conversation reply |
| `/api/ai/spin-post` | POST | Spin/rewrite post content |
| `/api/ai/approve-advisory` | POST | Approve advisory (save to DB) |
| `/api/ai/analyze` | POST | General AI analysis |

### Web UI Pages

The Next.js dashboard mirrors all extension functionality:

| Page | Route | Purpose |
|------|-------|---------|
| Settings | `/settings` | Per-user AI key/base/model configuration |
| Autopost | `/autopost` | AI spin post content |
| Autocomment | `/autocomment` | AI spin comment content |
| Advisory | `/advisory` | AI analyze + draft product advisories |
| Conversations | `/conversations` | AI draft conversation replies |
| Products | `/products` | Product catalog management |
| Keywords | `/keywords` | Buy/sell/support keyword management |
| Sources | `/sources` | Price source configuration |
| Sharing | `/sharing` | Auto-share toggle preferences |
| Profiles | `/profiles` | Prompt profile management |
| Build | `/build` | Product categorization + AI build proposals |
| My Store | `/mystore` | Store price management |

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

### 4. AI Config Endpoint
```bash
# Get token first (same as step 2)
# Read AI config — should return masked key
curl -s http://localhost:3300/api/me/ai-config \
  -H "Authorization: Bearer $TOKEN" | jq .
# Expected: {"aiApiBase":"...","aiApiKey":"sk-...xxxx","aiModel":"..."}

# Update AI config
curl -s -X PUT http://localhost:3300/api/me/ai-config \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"aiApiKey":"sk-your-key-here","aiModel":"claude-opus-4.8"}' | jq .
# Expected: {"ok":true,"message":"AI config updated"}
```

### 5. AI Generation Endpoints (requires valid API key)
```bash
# Classify a message intent
curl -s -X POST http://localhost:3300/api/ai/classify \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"How much for iPhone 15?"}' | jq .
# Expected: {"intent":"buy","confidence":...}
```

### 6. Run Tests
```bash
cd server/web && npm test
# Should pass all tests including realtime WS + AI tests

cd ../../ && npm test  # extension tests
# 76 tests, all passing
```

---

## Architecture Diagram

```
┌─────────────┐     HTTP/WS      ┌──────────────────────┐     AI API      ┌──────────────┐
│   Chrome     │ ◄──────────────► │  Express + WS Server │ ◄────────────► │  AI Provider (per-user key)     │
│   Extension  │   port 3300      │  (web/server.js)     │   per-user key │  Compatible   │
│              │                   │                      │                │  API          │
│  remote-     │   REST: /api/    │  /api/remote-commands│                └──────────────┘
│  commands.js │   WS: /ws/commands│  realtime.js (WS)   │
└─────────────┘                   │  /api/ai/* (AI)      │
                                  │  /api/me/ai-config   │
                                  └──────────┬───────────┘
                                             │
                                    ┌────────▼───────────┐
┌─────────────┐   HTTP (proxy)     │   MySQL Database    │
│   Web UI     │ ──────────────────►│   (fb_crawler)     │
│   (Next.js)  │   /api/*          │                     │
│   port 3000  │                   │  remote_commands    │
│   12 pages   │                   │  users (+ai keys)   │
└─────────────┘                   │  keywords, products │
                                   └─────────────────────┘
```

---

## What Changed

### Previous Release — WebSocket + Remote Commands

- ✅ `web/realtime.js` — NEW: WebSocket server with JWT auth, heartbeat, fan-out push
- ✅ `web/remote-commands.js` — NEW: REST API for remote commands + WS push after INSERT
- ✅ `web/server.js` — Changed to `http.createServer(app)` for shared port with WS
- ✅ `web/schema.js` — Added `remote_commands` table DDL + migration
- ✅ `web/package.json` — Added `ws@8.18.0` dependency
- ✅ `web-ui/` — New remote commands page, auto-refresh, WS status indicator

### Current Release — AI Web Backend + Full Web UI

**Server (web/):**
- ✅ `web/ai.js` — NEW: AI engine (classify, draft advisory, draft conversation, spin post) with per-user API key resolution
- ✅ `web/routes.js` — Added AI endpoints + `GET/PUT /api/me/ai-config` (masked key)
- ✅ `web/schema.js` — Added `ai_api_base`, `ai_api_key`, `ai_model` columns to `users` table
- ✅ `web/config.js` — Added `AI_API_BASE` and `AI_MODEL` env var defaults (fallback only)

**Web UI (web-ui/) — 12 new pages:**
- ✅ Settings — Per-user AI key/base/model configuration
- ✅ Autopost — AI spin post content
- ✅ Autocomment — AI spin comment content
- ✅ Advisory — AI analyze + draft product advisories
- ✅ Conversations — AI draft conversation replies
- ✅ Products — Product catalog management
- ✅ Keywords — Buy/sell/support keyword management (tabbed UI)
- ✅ Sources — Price source configuration
- ✅ Sharing — Auto-share toggle preferences
- ✅ Profiles — Prompt profile management (CRUD + activate)
- ✅ Build — Product categorization + AI build proposals
- ✅ My Store — Store price management

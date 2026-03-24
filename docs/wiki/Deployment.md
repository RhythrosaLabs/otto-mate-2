# Deployment & PM2

## Development

```bash
# Start everything (Next.js + all sub-apps)
npm run dev:all

# Or start just Next.js
npm run dev

# Start sub-apps individually
npm run dev:opendaw          # openDAW on :8080
cd bolt-diy && pnpm run dev  # App Builder on :5173
cd blockbench && npm run serve  # Blockbench on :3001
node scripts/code-server-proxy.mjs  # Code Companion proxy on :3100
```

---

## Production Build

```bash
npm run build
npm run start
```

---

## PM2 (Recommended for Production)

PM2 manages all 5 processes as a single ecosystem, with auto-restart and log management.

### Process Table

| Name | Command | Port |
|---|---|---|
| `next` | `next dev` (or `next start` for prod) | 3000 |
| `bolt-diy` | `pnpm run dev` | 5173 |
| `blockbench` | `node ./build.js --target=web --serve` | 3001 |
| `opendaw` | `npm run dev:studio` | 8080 |
| `code-server-proxy` | `node scripts/code-server-proxy.mjs` | 3100 |

### PM2 Commands

```bash
# Start all
pm2 start pm2.config.cjs

# Status
pm2 status

# Stop all
pm2 stop all

# Restart all
pm2 restart all

# Live logs (all processes)
pm2 logs

# Logs for one app
pm2 logs next

# Dashboard
pm2 monit

# Persist across machine reboot
pm2 save && pm2 startup
```

### pm2.config.cjs

The pm2 ecosystem file lives at the project root. All processes:
- `watch: false` — no file watching (avoids restarts on build files)
- `autorestart: true`
- `max_restarts: 10`
- `restart_delay` 2–3 seconds

---

## Reverse Proxy (nginx)

For production with a public domain, run nginx in front of Next.js:

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # Required for SSE streaming
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

**Important for SSE:** set `proxy_buffering off` and `proxy_read_timeout 300s` (or higher) so task streams don't get cut off.

---

## Environment for Production

Update `.env.local` for production:

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-...

# Security
OTTOMATE_AUTH_TOKEN=your-strong-random-token
WEBHOOK_SECRET=your-webhook-secret

# Public URL (update OAuth provider callbacks to match)
APP_URL=https://your-domain.com

# Optional: custom database location
DATABASE_PATH=/data/ottomate.db
```

Update all OAuth redirect URIs from `http://localhost:3000/...` to `https://your-domain.com/...` in each provider's developer console.

---

## Docker (Community)

A Dockerfile is not included in this repo, but the app can be containerized:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

Note: `better-sqlite3` requires native compilation — the Docker image must include `python3`, `make`, and `g++` build tools, or use a Debian-based image instead of Alpine.

---

## Database Backup

The entire application state is in a single SQLite file:
```bash
# Default location
./perplexity-computer.db

# Custom location (if set)
$DATABASE_PATH
```

Back it up:
```bash
# Simple copy
cp perplexity-computer.db perplexity-computer-backup-$(date +%Y%m%d).db

# Online backup (SQLite hot backup — safe while running)
sqlite3 perplexity-computer.db ".backup perplexity-computer-backup.db"
```

The `task-files/` directory contains all generated files — back this up too:
```bash
tar -czf task-files-backup-$(date +%Y%m%d).tar.gz task-files/
```

---

## Upgrading

```bash
git pull origin main
npm install
# If there are schema changes, they're applied automatically on next server start
npm run build
pm2 restart all
```

Schema migrations are handled in `db.ts` via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` and `CREATE TABLE IF NOT EXISTS` statements — upgrades are non-destructive.

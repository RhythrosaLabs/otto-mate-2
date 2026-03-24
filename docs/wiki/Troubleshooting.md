# Troubleshooting

## App Won't Start

### `Error: Cannot find module 'better-sqlite3'`
Native module not compiled. Rebuild it:
```bash
npm rebuild better-sqlite3
```
or reinstall:
```bash
rm -rf node_modules && npm install
```

### Port 3000 already in use
Find and kill the process:
```bash
lsof -ti :3000 | xargs kill -9
```
Or specify a different port:
```bash
PORT=3001 npm run dev
```

### `SyntaxError: Unexpected token` / TypeScript compile error
Must use Node 18+:
```bash
node --version
nvm use 20
```

---

## Authentication & API Keys

### "Authentication required" on every request
The `OTTOMATE_AUTH_TOKEN` in `.env.local` must match the token used in the browser. Clear your browser's localStorage and log in again via the login page.

### `Error: Missing API key for model X`
- Go to **Settings → API Keys**
- Enter the key for the provider the model uses (Anthropic, OpenAI, Google, Perplexity, etc.)
- Keys are stored encrypted in the database

### Tasks fail immediately with "model not found"
The selected model requires a specific API key. Check **Settings → Models** to see which provider each model requires. Switch to a free OpenRouter model if you don't have the key.

### "You exceeded your current quota"
Your API key has run out of credits. Add credits on the provider's platform, or switch to a free-tier model via **Settings → Models → Free OpenRouter Models**.

---

## OAuth Connectors

### `redirect_uri_mismatch` error (Google, GitHub, Notion, Dropbox, Microsoft)
The OAuth redirect URI in the provider's developer console must exactly match your `APP_URL`. For local development, add:
```
http://localhost:3000/api/auth/callback/<provider>
```
For production, add:
```
https://your-domain.com/api/auth/callback/<provider>
```

### "OAuth callback received but session not found"
Session cookies require the `APP_URL` to be set correctly, and cookies must not be blocked. Check that `APP_URL` in `.env.local` matches the actual URL in your browser.

### Connector shows as connected but tool calls fail
Re-authorize the connector — the access token may have expired. Go to **Connectors**, disconnect, and reconnect.

---

## Tasks & Agent

### Task stuck at "running" indefinitely
1. Check **Analytics → Audit Trail** for the last tool call — it may have hung on a network request
2. Cancel the task using the stop button in the task header
3. Check server logs: `pm2 logs next`
4. If the scheduler is stuck, restart: `pm2 restart next`

### Agent ignores instructions / uses wrong tool
The model context window may be full. Start a new session or reduce the number of prior tasks in the session. The context compaction logic (in `agent.ts`) summarizes old messages but very long single messages can't be reduced.

### Sub-agent never returns
Sub-agents run asynchronously and are tracked in the `sub_agents` table. If a sub-agent is stuck, check the audit trail — the parent task ID is linked. Cancelling the parent task will stop the sub-agent.

### `execute_code` / Python execution fails
The sandbox runs a child Node.js/Python process. Ensure the required runtime is installed:
```bash
python3 --version
node --version
```
The sandbox has no internet access by default and executes inside a temp directory.

---

## Sub-Applications

### App Builder (bolt-diy) page is blank
1. Check that bolt-diy is running: `pm2 status`
2. The app runs on port 5173. Visit http://localhost:5173 directly to see error output
3. It uses WebContainers — requires a browser that supports `SharedArrayBuffer`. Check for the COOP/COEP headers (see Architecture wiki)
4. Try: `pm2 restart bolt-diy`

### Code Companion (code-server) won't load
code-server requires a separate install:
```bash
curl -fsSL https://code-server.dev/install.sh | sh
# Start code-server on :3101
code-server --port 3101 --auth none
# The proxy at :3100 will forward to it
node scripts/code-server-proxy.mjs
```

### Blockbench shows "Connection refused"
```bash
cd blockbench && npm install && npm run serve
# Or via pm2:
pm2 restart blockbench
```

### openDAW won't load audio
openDAW uses the Web Audio API and requires HTTPS for microphone access in production. Locally this works over `localhost`. Also ensure `SharedArrayBuffer` is available (requires COOP/COEP headers — Next.js sets these via `next.config.ts`).

---

## WebContainers / SharedArrayBuffer Issues

SubApps like bolt-diy require `SharedArrayBuffer`, which requires cross-origin isolation. The app sets these headers globally:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

These are set in `next.config.ts`. If you've deployed behind a reverse proxy, ensure it doesn't strip these headers.

**Symptoms if COOP/COEP are missing:**
- bolt-diy terminal shows "SharedArrayBuffer is not defined"
- openDAW audio processing fails silently
- Certain iframes break

---

## Database

### "database is locked"
SQLite WAL mode allows concurrent reads but only one writer. This usually means a long-running write operation is in progress. If it persists:
```bash
# Check for other processes holding the DB
fuser perplexity-computer.db
# Or restart the app
pm2 restart next
```

### DB file not found at startup
The `DATABASE_PATH` env var controls the file location. If unset, it defaults to `./perplexity-computer.db` (project root). The app creates the DB on first run — ensure the directory is writable.

### Data appears to reset after restart
If the DB is being created fresh each time, check that `DATABASE_PATH` (if set) points to a persistent volume, not a temp directory.

---

## File Uploads

### "File too large" error
Next.js default request body limit is `4mb`. The app overrides this in `next.config.ts` with a larger limit, but if you've added your own middleware that re-imposes a limit, it may conflict.

### Uploaded files not appearing in Files page
Files are stored in `task-files/<task-id>/` relative to the project root. Check that the directory is writable:
```bash
ls -la task-files/
```

---

## Scheduling

### Scheduled tasks not running
1. The scheduler polls every minute inside the Next.js server process. It requires the server to be running.
2. Check `pm2 logs next` for scheduler errors
3. Verify the schedule is set correctly via the task's edit panel — cron expressions use 5-field UTC format

### Cron expression reference

| Pattern | Meaning |
|---|---|
| `0 * * * *` | Every hour |
| `0 9 * * 1-5` | 9 AM Mon–Fri |
| `*/15 * * * *` | Every 15 minutes |
| `0 0 * * *` | Daily at midnight UTC |

---

## Channels (Telegram / Slack / Discord / WhatsApp)

### Telegram bot not responding
1. Check that `TELEGRAM_BOT_TOKEN` is set
2. Verify the webhook is registered: `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`
3. Your server must be publicly reachable over HTTPS for Telegram webhooks

### Webhook signature verification fails
Ensure `WEBHOOK_SECRET` matches the secret set on the provider side. For Slack, this is the Signing Secret from the app settings.

---

## Logs

```bash
# All pm2 logs
pm2 logs

# Follow Next.js logs only
pm2 logs next --lines 100

# Log files location
~/.pm2/logs/

# Clear logs
pm2 flush
```

---

## Getting More Help

1. Check the server-side logs first — most errors are logged with a full stack trace
2. Check the **Audit Trail** (Analytics page) for tool-level errors
3. Inspect browser DevTools console and Network tab for 4xx/5xx API responses
4. File an issue at the GitHub repo with the error message and relevant log lines

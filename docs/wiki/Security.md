# Security

## Authentication

### Optional API Auth (Bearer Token)

By default, all API routes are open — suitable for local development on a private machine.

To secure the API in a multi-user or networked environment, set `OTTOMATE_AUTH_TOKEN` in `.env.local`:
```
OTTOMATE_AUTH_TOKEN=your-secret-token-here
```

Once set, all `/api/*` requests must include the token:
```http
Authorization: Bearer your-secret-token-here
# or
x-ottomate-token: your-secret-token-here
```

**Public paths** (always open):
- `GET /api/health` — health checks
- `POST /api/hooks` — inbound webhooks (has its own HMAC validation)
- `/api/auth/callback/*` — OAuth provider return URLs
- `/api/channels/telegram`, `/api/channels/slack`, `/api/channels/discord` — inbound messaging webhooks

### OAuth Token Storage

OAuth access tokens and refresh tokens for connected services (Google, Microsoft, GitHub, Notion, Dropbox) are stored in the `connector_configs` SQLite table alongside the database file on your local filesystem.

Tokens are **not transmitted anywhere** except to the respective service APIs when the agent makes requests on your behalf.

---

## Cross-Origin Isolation (COOP / COEP)

bolt-diy (the App Builder) uses **WebContainers** which require `SharedArrayBuffer`. This browser API is only available when cross-origin isolation is active. The following headers are applied:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
```

Applied to:
- All `/computer/*` pages (excluding `/computer/coding-companion`)
- Proxy routes `/bolt/:path*` and `/kilocode/:path*`

`COEP: credentialless` (rather than `require-corp`) is used so cross-origin images/videos/fonts can still load without needing CORP headers.

---

## Webhook Security

Inbound webhooks support HMAC validation when `WEBHOOK_SECRET` is set:

- **WhatsApp:** validates `X-Hub-Signature-256` header (HMAC-SHA256 of body with `WEBHOOK_SECRET`)
- **Generic webhooks** (`/api/hooks`): validates `X-Webhook-Signature` header

Without `WEBHOOK_SECRET`, webhooks accept all inbound requests — this is fine for local development but should be locked down in production.

---

## Code Execution Security

When the agent uses the `execute_code` or `sandbox_execute` tools, code runs via `child_process.exec`. Security measures:

1. **Content validation** — `sandbox-executor.ts` scans code for dangerous patterns before executing (blocks `rm -rf`, network calls external to sandboxed tools, secret exfiltration attempts, etc.)
2. **Timeout** — execution is killed after `timeout` seconds (default 30, max configurable)
3. **No root** — code runs as the same user as the Node.js process (not elevated)
4. **Output capture** — stdout/stderr are captured and returned; the agent sees the output, not arbitrary file access

Even with these mitigations, code execution is an inherently powerful capability. Only use Ottomate in a trusted environment.

---

## Injection Prevention

### SQL Injection

All database access uses **parameterized queries** via `better-sqlite3`'s prepared statement API:
```typescript
const stmt = db.prepare("SELECT * FROM tasks WHERE id = ?");
const task = stmt.get(taskId); // taskId is parameterized, never interpolated
```

Raw string interpolation into SQL is not used anywhere in `db.ts`.

### XSS

- All React output is automatically escaped (JSX prevents innerHTML injection)
- User-provided content rendered as Markdown goes through `react-markdown` which sanitizes by default
- No use of `dangerouslySetInnerHTML` except where content is from the AI (treated as trusted within the app)

### SSRF Prevention

The `browse_web` and `scrape_url` tools accept arbitrary URLs. For production deployments on internal networks:
- Configure a firewall rule preventing the Node.js process from reaching internal IP ranges (10.x, 192.168.x, 172.16–31.x)
- Or set `ALLOWED_URL_PATTERNS` (if implemented) to an allowlist of external domains

---

## Credential Security

- `.env.local` is in `.gitignore` — API keys are never committed
- Credentials in the SQLite database are stored as-is (not encrypted at rest by default)
- For production: consider encrypting the SQLite file with [SQLCipher](https://www.zetetic.net/sqlcipher/) or running on an encrypted disk volume
- OAuth refresh tokens have limited scope — only the permissions explicitly granted during the OAuth flow

---

## OWASP Top 10 Mapping

| Risk | Mitigation |
|---|---|
| A01 Broken Access Control | Optional bearer token middleware; OAuth scopes grant minimum required permissions |
| A02 Cryptographic Failures | HTTPS required for all external API calls; `env.local` keeps secrets out of source |
| A03 Injection | Parameterized SQL; React JSX escaping; `sandbox-executor.ts` code scanning |
| A04 Insecure Design | Code execution sandboxed; tool permissions limited per skill |
| A05 Security Misconfiguration | COOP/COEP headers for cross-origin isolation; public paths explicitly listed |
| A06 Vulnerable Components | Keep `npm` dependencies updated; run `npm audit` regularly |
| A07 Auth Failures | Optional bearer token; webhook HMAC; OAuth tokens stored locally only |
| A08 Software Integrity | No external CDNs; all deps from npm with lockfile |
| A09 Logging Failures | Every agent action logged in `agent_analytics`; audit trail available |
| A10 SSRF | `browse_web` tool calls arbitrary URLs — restrict with network-level firewall in production |

---

## Production Hardening Checklist

- [ ] Set `OTTOMATE_AUTH_TOKEN` to a strong random string
- [ ] Set `WEBHOOK_SECRET` for inbound webhook HMAC validation
- [ ] Run behind a reverse proxy (nginx/Caddy) with TLS
- [ ] Set `APP_URL` to your public HTTPS domain
- [ ] Update OAuth redirect URIs from `http://localhost:3000` to `https://your-domain.com`
- [ ] Configure firewall to block internal IP ranges from the Node process
- [ ] Back up `perplexity-computer.db` regularly (it contains all your data)
- [ ] Run `npm audit` and update vulnerable packages
- [ ] Consider encrypting the database file at rest

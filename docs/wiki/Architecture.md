# Architecture

## Directory Structure

```
perplexity-computer/
├── src/
│   ├── middleware.ts                   # Auth + COOP/COEP headers
│   ├── app/
│   │   ├── api/                        # All API routes (Next.js Route Handlers)
│   │   │   ├── tasks/                  # Task CRUD + SSE stream
│   │   │   │   ├── route.ts            # GET (list) / POST (create)
│   │   │   │   └── [taskId]/
│   │   │   │       ├── route.ts        # GET / DELETE
│   │   │   │       ├── run/route.ts    # POST → start agent loop
│   │   │   │       ├── stop/route.ts   # POST → AbortController
│   │   │   │       ├── message/route.ts# POST → follow-up chat
│   │   │   │       └── approve/route.ts# POST → resume from user-input pause
│   │   │   ├── tasks/events/route.ts   # GET → SSE stream
│   │   │   ├── auth/                   # OAuth initiation + callbacks
│   │   │   ├── connectors/             # Connector config CRUD
│   │   │   ├── files/                  # File listing + serving + save-generation
│   │   │   ├── gallery/                # Gallery items CRUD
│   │   │   ├── memory/                 # Memory CRUD
│   │   │   ├── skills/                 # Skills CRUD + convert
│   │   │   ├── documents/              # Documents CRUD + AI assist
│   │   │   ├── pipelines/              # Pipeline execution
│   │   │   ├── scheduled-tasks/        # Scheduler engine
│   │   │   ├── analytics/              # Analytics aggregation
│   │   │   ├── audit/                  # Audit log query
│   │   │   ├── sessions/               # Session management
│   │   │   ├── templates/              # Template CRUD
│   │   │   ├── settings/               # Global settings CRUD
│   │   │   ├── context/                # Context management
│   │   │   ├── usage/                  # Token+cost usage tracking
│   │   │   ├── health/                 # Health + code-server health
│   │   │   ├── hooks/                  # Inbound webhook handler
│   │   │   ├── channels/               # Telegram / Slack / Discord webhooks
│   │   │   ├── whatsapp/               # WhatsApp Cloud API + send
│   │   │   ├── voice/                  # STT (Whisper) + TTS
│   │   │   ├── replicate/              # Replicate model runner
│   │   │   ├── luma/                   # Luma Dream Machine
│   │   │   ├── dreamscape/             # Dreamscape generation
│   │   │   ├── huggingface/            # HuggingFace inference
│   │   │   ├── generate/               # Generic generation
│   │   │   ├── app-builder/            # App builder SSE stream
│   │   │   ├── firefly/                # Nova Creative Suite APIs
│   │   │   │   ├── generate-image/     # Image generation
│   │   │   │   ├── edit-image/         # Image editing
│   │   │   │   ├── generate-video/     # Video generation
│   │   │   │   ├── generate-soundtrack/# Music generation
│   │   │   │   ├── generate-speech/    # TTS
│   │   │   │   └── models/             # Available model list
│   │   │   └── social-auth/            # Social media OAuth (browser profiles)
│   │   └── computer/                   # All UI page routes
│   │       ├── layout.tsx              # Persistent iframe mounts
│   │       ├── page.tsx                # Onboarding redirect
│   │       ├── (home)/page.tsx         # Home / task creation
│   │       ├── tasks/                  # Tasks list + task detail
│   │       ├── files/                  # File browser
│   │       ├── documents/              # Documents + editor
│   │       ├── connectors/             # Connectors marketplace
│   │       ├── skills/                 # Skills browser + editor
│   │       ├── gallery/                # Example gallery
│   │       ├── firefly/                # Nova Creative Suite
│   │       ├── dreamscape/             # Dreamscape + Video Studio
│   │       ├── audio-studio/           # AI Audio Studio
│   │       ├── image-studio/           # AI Image Studio
│   │       ├── channels/               # Messaging channels
│   │       ├── memory/                 # Memory viewer
│   │       ├── sessions/               # Sessions
│   │       ├── templates/              # Templates
│   │       ├── scheduled/              # Scheduler
│   │       ├── analytics/              # Analytics dashboard
│   │       ├── audit/                  # Audit trail
│   │       ├── pipelines/              # Pipeline builder
│   │       ├── settings/               # Settings
│   │       └── onboarding/             # First-run wizard
│   ├── lib/
│   │   ├── agent.ts                    # Core agent (~7,700 lines)
│   │   ├── db.ts                       # SQLite schema + all DB operations
│   │   ├── types.ts                    # All TypeScript types
│   │   ├── models.ts                   # Model configs + free OpenRouter list
│   │   ├── constants.ts                # NAV_ITEMS + API helpers
│   │   ├── connectors-data.ts          # 190+ connector definitions
│   │   ├── skill-catalog.ts            # 270+ pre-built skills
│   │   ├── model-fallback.ts           # Multi-provider failover logic
│   │   ├── scheduler.ts                # Cron/interval scheduler
│   │   ├── replicate.ts                # Replicate API client
│   │   ├── huggingface.ts              # HuggingFace client
│   │   ├── steel-client.ts             # Steel browser client (cloud/self-hosted)
│   │   ├── whatsapp.ts                 # WhatsApp Cloud API client
│   │   ├── social-media-browser.ts     # Social media Playwright automation
│   │   ├── personas.ts                 # 8 agent persona definitions
│   │   ├── themes.ts                   # 14 UI theme definitions
│   │   ├── schemas.ts                  # Zod validation schemas
│   │   ├── background-ops.ts           # Background task tracking
│   │   ├── running-tasks.ts            # Global AbortController map
│   │   ├── skill-converters.ts         # Skill format conversion utils
│   │   └── utils.ts                    # Shared utilities (cn, formatBytes, etc.)
│   └── components/
│       ├── sidebar.tsx                  # Main navigation sidebar
│       ├── persistent-layout.tsx        # LRU keep-alive panel manager
│       ├── bolt-persistent-iframe.tsx   # App Builder iframe (port 5173)
│       ├── kilocode-persistent-iframe.tsx # Code Companion iframe (port 3100)
│       ├── blender-persistent-iframe.tsx  # 3D Studio iframe (port 3001)
│       ├── lmms-persistent-iframe.tsx     # openDAW iframe (port 8080)
│       ├── command-palette.tsx           # ⌘K command palette
│       ├── keyboard-shortcuts.tsx        # Global keyboard shortcut handler
│       └── background-status.tsx         # Background task status indicator
├── scripts/
│   ├── code-server-proxy.mjs           # Proxies port 3100 → 3101 (VS Code)
│   ├── gen-skills.js                   # Skill catalog generator
│   └── take-screenshots.js             # Screenshot automation
├── tests/                              # Playwright E2E tests
├── pm2.config.cjs                      # pm2 process definitions
├── next.config.ts                      # Next.js config (rewrites, headers)
└── .env.local                          # API keys (not committed)
```

---

## Core Patterns

### SSE Streaming

Long-running tasks stream progress to the browser via Server-Sent Events:

```
GET /api/tasks/events?taskId=<id>
Content-Type: text/event-stream

data: {"type":"step","step":{...}}
data: {"type":"message","content":"..."}
data: {"type":"complete","summary":"..."}
```

The browser shows each step in real time without polling. The stream closes when the task completes or is cancelled.

`/api/app-builder` and `/api/documents/{id}/ai` also use SSE for their respective streaming operations.

### Persistent Iframe Architecture

Four embedded sub-applications (bolt-diy, code-server, Blockbench, openDAW) stay **permanently mounted** in the DOM regardless of which page is active.

```tsx
// In layout.tsx — always mounted
<BoltPersistentIframe />        // port 5173
<CodeServerPersistentIframe />  // port 3100
<BlenderPersistentIframe />     // port 3001
<LmmsPersistentIframe />        // port 8080
```

When **inactive:** `position: fixed; top: -200vh; inset-inline: 0; height: 100vh` + `inert` attribute — off-screen and not focusable, but JS state is preserved.

When **active:** `top: 0` — slides into view.

Each iframe component:
1. Starts with `status: "checking"`
2. Fires a `fetch` health check (or server-side API call for code-server)
3. Transitions to `status: "running"` (shows iframe) or `status: "stopped"` (shows fallback with start instructions)
4. Polls health every 30s while active

### LRU Page Cache

`PersistentLayout` wraps all `/computer/*` pages and keeps rendered React trees alive for up to **20 pages** using a Least Recently Used cache.

- Pages are hidden with `display: none` when not active
- No re-render or state loss when navigating back
- When the cache is full (>20), the least recently visited page is unmounted

This allows, for example, a Dreamscape storyboard with 20 shots to stay in memory while you check analytics and come back without losing any work.

### Multi-Provider Failover

```
async function callWithFallback(messages, tools, model) {
  for (const provider of ["anthropic", "openai", "google", "openrouter", "perplexity"]) {
    try {
      return await callProvider(provider, messages, tools, model);
    } catch (err) {
      if (isRetryable(err)) {
        await sleep(backoff[attempt]); // 2s, 5s, 15s
        continue;
      }
      throw err;
    }
  }
}
```

### Context Compaction

When the conversation history grows large (approaching the context window), the engine:
1. Keeps the **first 2 messages** (original task context)
2. Keeps the **last 8 messages** (recent context)
3. Summarizes everything in between into a single compressed summary message
4. Continues with the compacted history

This allows tasks with many tool calls to run without hitting token limits.

### Token Budget Tracking

Every API call records into `token_usage`:
- `prompt_tokens`, `completion_tokens`, `total_tokens`
- `estimated_cost_usd` (calculated from model pricing tables)
- Provider and model used

The task detail view shows a live token bar. Settings lets you configure a max-token budget and daily cost ceiling.

### Background Operations

Long-running background operations (file processing, batch generations) use `useSyncExternalStore` to share state across components without a global store like Redux. An external store (`background-ops.ts`) holds the state; components subscribe and re-render automatically when it changes.

---

## Database Schema

SQLite file: `./perplexity-computer.db` (configurable via `DATABASE_PATH`).
Mode: **WAL** (Write-Ahead Logging) with foreign keys enabled.

| Table | Purpose |
|---|---|
| `tasks` | Task records: title, prompt, status, model, priority, tags, metadata |
| `agent_steps` | Tool calls and results per task — type, title, content, tool_name, input, result, duration |
| `messages` | Chat messages per task — role (user/assistant), content |
| `task_files` | Files attached to tasks — name, path, size, mime_type, folder_id |
| `file_folders` | Folder hierarchy for the file manager — name, parent_id, color |
| `sub_tasks` | Spawned sub-agent records — parent_task_id, agent_type, result |
| `skills` | Skill definitions — instructions, category, triggers, preset_type, model, limits |
| `gallery_items` | Generated media items — type, url, prompt, model |
| `connector_configs` | Service credentials — JSON blob per connector ID |
| `memory` | Agent long-term memory — key, value, tags, importance_score |
| `token_usage` | Per-call token + cost tracking — model, prompt/completion/total tokens, cost |
| `scheduled_tasks` | Cron/interval schedules — type, config, next_run, last_run, enabled |
| `task_templates` | Reusable task presets — prompt, model, skill, category |
| `agent_learnings` | Patterns the agent learns — outcome, context, lesson |
| `agent_analytics` | Every agent action (audit trail) — event_type, tool_name, duration, success |
| `settings` | Global config (key-value) |
| `sessions` | Conversation session groupings — name, task_ids |
| `pipelines` | DAG pipeline definitions — nodes and edges as JSON |
| `documents` | Text/spreadsheet documents — content, type, created/updated |

---

## API Authentication

**Development (default):** all routes open — no auth required.

**Production (optional):** set `OTTOMATE_AUTH_TOKEN` in `.env.local`. All `/api/*` routes require:
```
Authorization: Bearer <OTTOMATE_AUTH_TOKEN>
# or
x-ottomate-token: <OTTOMATE_AUTH_TOKEN>
```

**Public paths** (always open even when auth is configured):
- `GET /api/health`
- `POST /api/hooks` (has its own HMAC webhook-secret auth)
- `/api/auth/callback/*` (OAuth provider callbacks)
- `/api/channels/telegram`, `/api/channels/slack`, `/api/channels/discord` (inbound webhooks)

---

## Security Headers

### COOP + COEP (for bolt-diy WebContainers)

bolt-diy uses WebContainers which require `SharedArrayBuffer`, which requires cross-origin isolation:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
```

Applied to:
- All `/computer/*` pages (except `/computer/coding-companion` which has its own needs)
- `/bolt/:path*` proxy
- `/kilocode/:path*` proxy

The `/computer/coding-companion` exclusion ensures the code-server iframe can load cross-origin content normally.

---

## Next.js Configuration

```typescript
// next.config.ts (key settings)
{
  serverExternalPackages: ["better-sqlite3", "playwright"],  // native modules
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
  rewrites: {
    "/bolt/:path*"      → "http://localhost:5173/:path*",   // App Builder
    "/kilocode/:path*"  → "http://localhost:3100/:path*",   // Code Companion
  }
}
```

`serverExternalPackages` prevents Next.js from bundling `better-sqlite3` (requires native `.node` binaries) and `playwright` (large binary) — they're loaded from `node_modules` at runtime instead.

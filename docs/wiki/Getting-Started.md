# Getting Started

## Prerequisites

| Requirement | Notes |
|---|---|
| **Node.js 18+** | Run `node -v` to check |
| **npm** | Comes with Node.js |
| **Anthropic API key** | [console.anthropic.com](https://console.anthropic.com) — the only required key |

All other API keys are optional and unlock additional models and features.

---

## Install & Run

```bash
git clone https://github.com/RhythrosaLabs/otto-mate-2.git
cd otto-mate-2
npm install

# Add your Anthropic key
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local

# Start
npm run dev
```

Open **http://localhost:3000** — the onboarding wizard guides you through first-time setup.

---

## npm Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start Next.js dev server on port 3000 |
| `npm run dev:all` | Start Next.js + all sub-apps with pm2 |
| `npm run dev:opendaw` | Start openDAW on port 8080 |
| `npm run build` | Production build |
| `npm run start` | Production server |
| `npm run lint` | ESLint |
| `pm2 start pm2.config.cjs` | Start all services with pm2 (production-style) |
| `pm2 logs` | Live logs from all processes |
| `pm2 monit` | pm2 dashboard |

---

## Environment Variables

Create a `.env.local` file in the project root. Only `ANTHROPIC_API_KEY` is required.

### AI Providers

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | **Yes** | Claude models — [console.anthropic.com](https://console.anthropic.com) |
| `OPENAI_API_KEY` | No | GPT-4o, GPT-4.1, DALL-E 3, Whisper |
| `GOOGLE_AI_API_KEY` | No | Gemini 1.5 Pro/Flash, Gemini 2.0 Flash |
| `OPENROUTER_API_KEY` | No | 200+ models via OpenRouter |
| `PERPLEXITY_API_KEY` | No | Real-time web-augmented search via Sonar |
| `GROQ_API_KEY` | No | Llama / Mixtral at speed via Groq |

### Media Generation

| Variable | Notes |
|---|---|
| `REPLICATE_API_TOKEN` | FLUX, MusicGen, video models, face-swap, upscale |
| `LUMA_API_KEY` | Luma Dream Machine — Ray 3, Ray Flash 2, Photon 1 |
| `ELEVENLABS_API_KEY` | Multilingual TTS — 10k chars/month free tier |
| `RUNWAY_API_KEY` | Runway ML Gen-3 Alpha Turbo video generation |
| `KLING_API_KEY` | Kling AI text-to-video and image-to-video |

### Search

| Variable | Notes |
|---|---|
| `BRAVE_API_KEY` | Brave Search API |
| `SERPER_API_KEY` | Google results via Serper |
| `TAVILY_API_KEY` | AI-powered web research search |

### Browser Automation

| Variable | Notes |
|---|---|
| `STEEL_API_KEY` | Cloud Chrome via steel.dev (CAPTCHA solving, anti-bot) |
| `STEEL_BASE_URL` | Self-hosted Steel instance URL |

### Messaging

| Variable | Notes |
|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | Meta Business Cloud API phone number ID |
| `WHATSAPP_ACCESS_TOKEN` | Meta permanent access token |
| `TELEGRAM_BOT_TOKEN` | From BotFather |
| `DISCORD_BOT_TOKEN` | Discord bot token |
| `SLACK_BOT_TOKEN` | Slack `xoxb-...` bot token |

### Email

| Variable | Notes |
|---|---|
| `RESEND_API_KEY` | Send email via Resend |
| `SENDGRID_API_KEY` | Send email via SendGrid |

### Finance

| Variable | Notes |
|---|---|
| `FINNHUB_API_KEY` | Stock quotes and financial data |
| `ALPHA_VANTAGE_API_KEY` | Equity / forex / crypto data |
| `POLYGON_API_KEY` | Market data via Polygon.io |

### OAuth (for Connectors)

| Variable | Notes |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Gmail, Drive, Sheets, Docs, Calendar |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | Outlook, OneDrive, Teams |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth |
| `NOTION_CLIENT_ID` / `NOTION_CLIENT_SECRET` | Notion OAuth |
| `DROPBOX_CLIENT_ID` / `DROPBOX_CLIENT_SECRET` | Dropbox OAuth |

### Application

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_PATH` | `./perplexity-computer.db` | SQLite file location |
| `APP_URL` | `http://localhost:3000` | Public URL (used in OAuth callbacks) |
| `OTTOMATE_AUTH_TOKEN` | (unset) | Optional Bearer token to protect all `/api/*` routes |
| `WEBHOOK_SECRET` | (unset) | HMAC secret for validating inbound webhooks |

---

## First-Run Onboarding

On first launch (`http://localhost:3000`) the onboarding wizard:

1. Pings `/api/health` and shows which providers are configured
2. Lets you pick a default AI model
3. Walks you through a guided intro task
4. Redirects to the main task page

The wizard only appears once. It can be re-run from **Settings → Reset onboarding**.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `⌘J` / `Ctrl+J` | Open/close command palette |
| `⌘N` / `Ctrl+N` | New task (navigate to home) |
| `⌘,` / `Ctrl+,` | Open Settings |
| `Escape` | Close command palette |

---

## Health Check

```
GET /api/health                  # quick status (configured providers, uptime)
GET /api/health?detailed=true    # full service ping with latency
```

Returns JSON with `status`, `version`, per-service `configured`/`healthy`/`degraded`/`down`, uptime, Node version, memory usage, and PID.

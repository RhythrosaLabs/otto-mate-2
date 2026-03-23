<p align="center">
  <h1 align="center">Ottomate</h1>
  <p align="center">
    <strong>Self-hosted multi-model AI agent platform.</strong><br/>
    Describe a goal — Ottomate plans, codes, browses, generates media, builds apps, and orchestrates 190+ services autonomously.
  </p>
  <p align="center">
    Built with Next.js 15 · Claude · GPT-4.1 · Gemini 2.0 · Replicate · Luma Dream Machine · Adobe Firefly
  </p>
  <p align="center">
    Created by <a href="https://github.com/RhythrosaLabs"><strong>Dan Sheils</strong></a>
  </p>
  <p align="center">
    <img alt="Next.js" src="https://img.shields.io/badge/Next.js-15-black?logo=next.js"/>
    <img alt="Claude" src="https://img.shields.io/badge/Claude-Anthropic-orange"/>
    <img alt="GPT-4.1" src="https://img.shields.io/badge/GPT--4.1-OpenAI-74aa9c?logo=openai"/>
    <img alt="License" src="https://img.shields.io/badge/license-MIT-blue?logo=opensourceinitiative"/>
    <img alt="self-hosted" src="https://img.shields.io/badge/self--hosted-✓-green"/>
  </p>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#features">Features</a> •
  <a href="#screenshots">Screenshots</a> •
  <a href="#pages">Pages</a> •
  <a href="#models">Models</a> •
  <a href="#connectors">Connectors</a> •
  <a href="#architecture">Architecture</a>
</p>

---

## What is Ottomate?

Ottomate is a **self-hosted, multi-model AI agent platform** built with Next.js 15.  
Describe a goal in plain English — the agent plans multi-step workflows, writes and executes code, searches the web, talks to 190+ external services, generates images, video, and audio, and saves every artifact it produces.

It ships as a single `npm install` with zero external infrastructure. A SQLite database is created on first launch.

**Key capabilities:**

- **Autonomous task execution** — plans, reasons, and iterates with tool use until the goal is met
- **Multi-model orchestration** — Claude Opus/Sonnet, GPT-4o/4.1, Gemini 2.0, Perplexity Sonar, OpenRouter, with automatic failover
- **Code execution** — runs Python, Node.js, and shell scripts in-process with captured output
- **Web browsing** — searches (Brave, Perplexity, Serper, Tavily), scrapes pages, and automates browsers via Playwright
- **190+ connectors** — Gmail, Slack, GitHub, Jira, Stripe, Notion, HubSpot, WhatsApp, and many more
- **Nova AI creative suite** — generate images, video, soundtracks, speech, and edit images with AI — all from one unified hub
- **Dreamscape Video Studio** — 17-mode AI creative studio built around Luma Dream Machine with storyboards, camera presets, and an AI Director
- **AI Audio Studio** — generate music (MusicGen), professional voiceovers (OpenAI TTS / ElevenLabs), and record audio — all from one interface
- **Image Studio** — standalone AI image generation and editing powered by Replicate and Adobe Firefly
- **AI media generation** — Luma Dream Machine (video/image), Replicate (1000s of models), DALL-E 3, ElevenLabs (voice)
- **Sub-agents** — spawns specialized child agents for parallel work
- **Persistent memory** — key-value store the agent reads/writes across tasks
- **Scheduled tasks** — cron expressions, intervals, daily/weekly recurrence
- **Visual pipelines** — DAG builder for chaining tasks with dependencies
- **Skills marketplace** — 270+ pre-built skill templates across 10 categories
- **Voice input** — dictate tasks via Whisper or browser speech recognition
- **Slash commands** — `/image`, `/research`, `/code`, `/email`, `/video`, `/scrape`, and more

---

## Quick Start

### Prerequisites

| Requirement | Notes |
|---|---|
| **Node.js 18+** | `node -v` to check |
| **Anthropic API key** | [console.anthropic.com](https://console.anthropic.com) — this is the only required key |

### Install & run

```bash
git clone https://github.com/RhythrosaLabs/otto-mate-2.git
cd otto-mate-2
npm install

# Add your API key
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local

# Start
npm run dev
```

Open **http://localhost:3000** — the onboarding wizard will walk you through first-time setup.

> **Optional keys** unlock more models and features. See [Environment Variables](#environment-variables) below.

---

## Features

### Task Engine
The core loop: you describe a goal → the agent creates a plan → executes steps (tool calls, code, API requests, sub-agents) → streams results back in real time. Tasks support follow-up chat, file attachments, voice input, and slash commands.

### Multi-Model Failover
The agent picks the best model automatically or you choose manually. If a provider is down or rate-limited, it fails over through the chain: **Anthropic → OpenAI → Google → OpenRouter (DeepSeek) → Perplexity** with exponential backoff.

### Dreamscape Video Studio
A **17-mode AI creative studio** built around **Luma Dream Machine** (Ray 3, Ray Flash 2, Photon 1, Photon Flash 1) with **Replicate** model support and **MusicGen/Bark** audio generation. Organize work into storyboards, artboards, and moodboards — each containing individual shots you can generate, extend, remix, and chain together.

**Generation modes:** text-to-video, image-to-video, extend, reverse-extend, interpolate, text-to-image, image reference, character reference (persistent identity across shots), style reference, modify video, modify video with keyframes, modify image, reframe (change aspect ratio of existing media), music generation (MusicGen), sound effects (Bark), voiceover, and lip-sync.

**Production controls:** 20 camera motion presets (pan, zoom, orbit, crane, dolly, tracking, handheld, static, arc, dutch tilt, whip pan — each with directional variants), 9 modify intensity levels (adhere → flex → reimagine), 4 resolutions (540p → 4K), 7 aspect ratios (1:1, 3:4, 4:3, 9:16, 16:9, 9:21, 21:9), 5s/9s durations, HDR output (EXR), loop toggle, batch generation (up to 4 variants), and a draft/hi-fi phase workflow with auto-upgrade from Flash to full models.

**Auto-model intelligence:** Recommends the optimal model per generation mode — e.g., Flash models for fast text-to-video drafts, full Ray 3 / Photon 1 for character consistency, style transfer, and modify operations.

**AI Director:** A built-in chat agent (brainstorm, create, or brief modes) that interprets natural language into multi-step command chains with dependency ordering, continuity sheets (style anchors, character references, setting references), and concept pill word-swapping for rapid prompt iteration.

**Additional features:** Shot tagging, likes, and bookmarks for organization. Annotation overlay system (arrows, rectangles, text) that feeds spatial context into prompts. Board export/import as JSON. Per-shot media preview with mute controls. Search and filter across all shots.

### Nova — AI Creative Suite
A full-featured **AI media generation hub** with six creation modes accessible from a polished home page with a unified prompt bar. Generate from text, edit existing media, and browse community creations — all in one place.

**Generate Image:** Text-to-image with Nova Image 4, Nova Image 4 Ultra, Nova Image 5 (Preview), FLUX Schnell, FLUX 1.1 Pro, and DALL-E 3. Supports 6 aspect ratios, negative prompts, style references, structure references with adjustable strength, seed control, and batch generation (1–4 images). Inline quick actions: edit, generative fill, animate to video, upscale, save to gallery.

**Generate Video:** Text-to-video and image-to-video generation with multiple model options. Supports aspect ratio selection, duration control, and direct download.

**Generate Soundtrack:** AI music generation for video content. Describe a mood, genre, or scene and generate studio-quality soundtracks — licensed to use anywhere.

**Generate Speech:** Professional AI voiceovers and narration. Choose from multiple voice profiles with speed and style controls.

**Edit Image:** Full image editing suite — remove backgrounds, replace backgrounds, upscale, expand, generative fill, and prompt-based editing. Upload or paste an image and apply AI transformations.

**Gallery:** Browse, filter, and manage all generated creations (images, videos, soundtracks, speech) in a unified media gallery with type filtering and quick actions.

### Audio Studio
An AI-powered audio production studio with three modes:

**Compose:** Generate music tracks from text prompts using MusicGen (via Replicate). Control genre, mood, BPM, key, duration (up to 60s), tempo, energy, instruments, and model variant (stereo-melody-large, stereo-large, melody, etc.). Advanced parameters include temperature and CFG scale. Progress tracked in real time.

**Speech:** Generate professional AI voiceovers from text. Supports multiple voice profiles (Alloy, Echo, Fable, Onyx, Nova, Shimmer) via OpenAI TTS. Configure speed and download instantly.

**Record:** Record audio directly in the browser with real-time waveform visualization. Preview and download recordings.

All generated audio is saved to Files with full playback support.

### Image Studio
A dedicated AI image generation and editing workspace powered by **Replicate** and **Adobe Firefly**. Generate from text prompts, upload images for inpainting or editing, and save results directly to the gallery. Supports multiple models and aspect ratios.

### Pipelines
A visual DAG (directed acyclic graph) builder for chaining tasks. Add nodes with prompts, draw dependency edges on a canvas, and run the entire pipeline — nodes execute in topological (dependency) order with per-node status tracking. Supports connecting any node to any other as a dependency.

### Connectors Marketplace
190+ integrations across 28 categories: communication, storage, development, project management, CRM, data, AI (LLMs, image, video, audio, speech, code, design, search, 3D, vector), analytics, automation, browser, cloud, ecommerce, finance, marketing, music, productivity, security, and social media. OAuth flows for Google/Microsoft/GitHub/Notion/Dropbox; API key entry for everything else. 135+ connectors have a completely free tier.

### Skills & Templates
**Skills** are reusable instruction sets (like Custom GPTs). Browse 270+ pre-built skills across 10 categories (code, writing, research, data, automation, architecture, infrastructure, security, testing, custom) in the marketplace or create your own. **Templates** are one-click task presets — create a template, hit Run, and the agent executes it instantly.

### Scheduling
Schedule any task to run automatically. Supports one-time (with optional delete-after-run), recurring intervals, daily, weekly, and full cron expressions. Enable/disable individual schedules and see next-run timestamps.

### Memory
A persistent key-value store with tags that the agent reads and writes during task execution. Stored facts, preferences, and context carry over across tasks. You can search, add, tag, or delete entries manually.

### Analytics & Audit
**Analytics** shows KPIs: total tasks, success rate, average duration, top tools (with per-tool success rates), model usage (with average cost per call), daily task volume (last 30 days), and recent errors. **Audit Trail** is a paginated log of every agent action — tool calls, model invocations, and task events — with duration, metadata, search, and filters (event type, tool, success status).

---

## Tutorial

<video src="https://github.com/RhythrosaLabs/otto-mate-2/raw/main/docs/videos/tutorial-walkthrough.webm" controls width="100%">
  Your browser does not support the video tag. <a href="docs/videos/tutorial-walkthrough.webm">Download the walkthrough video</a>.
</video>

---

## Screenshots

### Home
The main prompt interface — type a goal, use slash commands, attach files, or pick from the prompt gallery.

![Home](docs/screenshots/home.png)

### Connectors
190+ integrations — connect Gmail, Slack, GitHub, Stripe, Notion, and more with OAuth or API keys.

![Connectors](docs/screenshots/connectors.png)

### Dreamscape Video Studio
17-mode AI creative studio with storyboards, camera presets, and the AI Director chat.

![Dreamscape](docs/screenshots/dreamscape.png)

### Nova — Generate
AI-powered creative hub — generate images, video, soundtracks, speech, and edit images from one unified interface.

![Nova](docs/screenshots/nova.png)

### Skills Marketplace
270+ pre-built skills across 10 categories — or create your own.

![Skills](docs/screenshots/skills.png)

<details>
<summary><strong>More screenshots</strong></summary>

### Pipelines
![Pipelines](docs/screenshots/pipelines.png)

### Templates
![Templates](docs/screenshots/templates.png)

### Scheduled Tasks
![Scheduled](docs/screenshots/scheduled.png)

</details>

---

## Pages

| Page | Description |
|---|---|
| **Home** | Centered prompt input with slash commands, voice input, file attachments, and prompt gallery |
| **Tasks** | List all tasks with status filters (running/completed/failed), search, sort, calendar view |
| **Task Detail** | Live agent execution with Steps, Chat, Files, and Preview tabs — streaming output, token tracking, context budget |
| **Files** | Finder-style file browser with icon/list/gallery views, 50+ format support, folders, preview pane, and source filters |
| **Documents** | Create and manage text documents with AI writing assistance |
| **Connectors** | Integration marketplace — connect 190+ services via OAuth or API key |
| **Skills** | Create, edit, and install reusable agent behaviors; 270+ in the marketplace |
| **Gallery** | Browse community example tasks, filter by category, one-click run |
| **Video Studio** | 17-mode AI creative studio — Luma Dream Machine video/image/audio generation organized into storyboards with 20 camera presets, character identity persistence, 9 modify intensities, draft/hi-fi phases, and an AI Director chat |
| **Audio Studio** | AI music generation (MusicGen via Replicate), AI voiceover (OpenAI TTS / ElevenLabs), and in-browser recording with waveform visualization |
| **Image Studio** | AI image generation and editing — Replicate models, Adobe Firefly, DALL-E 3, inpainting, and gallery saving |
| **Creative Suite (Nova)** | AI creative hub — generate images (6 models), video, soundtracks, speech, edit images (remove/replace BG, upscale, expand, generative fill), and browse all creations in a unified gallery |
| **Channels** | Configure inbound messaging (Telegram, Discord, Slack, WhatsApp) with webhook URLs |
| **Pipelines** | Visual DAG pipeline builder — chain tasks with dependencies |
| **Templates** | Reusable one-click task presets by category |
| **Scheduled** | Cron-based task scheduler with interval, daily, weekly, and cron modes |
| **Sessions** | Group related tasks into conversation sessions with shared context |
| **Memory** | View, search, add, and delete agent memory entries |
| **Analytics** | Performance dashboard — KPIs, tool popularity, model costs, error patterns |
| **Audit Trail** | Paginated log of every agent action with filters and metadata |
| **Settings** | Default model, token/cost budgets, themes, verbose mode, health check |
| **Onboarding** | First-run setup wizard — health check, model selection, guided intro |

---

## Models

Ottomate supports **17 model options** across 5 providers, plus a free tier:

| Model | Provider | Best for |
|---|---|---|
| Claude Opus 4.6 | Anthropic | Complex reasoning, multi-step orchestration |
| Claude Sonnet 4.6 | Anthropic | Balanced speed/quality, follow-ups |
| Claude 3.5 Haiku | Anthropic | Ultra-fast, cheapest Claude |
| GPT-4o | OpenAI | Long-context recall, broad knowledge |
| GPT-4o Mini | OpenAI | Lightweight speed tasks |
| GPT-4.1 | OpenAI | Strong reasoning, coding |
| GPT-4.1 Mini | OpenAI | Fast, good balance of cost and capability |
| GPT-4.1 Nano | OpenAI | Ultra-cheap for simple tasks |
| Gemini 1.5 Pro | Google | Deep research, long documents |
| Gemini 1.5 Flash | Google | Ultra-fast responses |
| Gemini 2.0 Flash | Google | Latest fast Gemini, very affordable |
| Sonar | Perplexity | Real-time web-augmented search |
| Sonar Pro | Perplexity | Deeper web-augmented analysis |
| Sonar Reasoning Pro | Perplexity | Multi-step reasoning + web search |
| OpenRouter (Any Model) | OpenRouter | Route to 200+ models (DeepSeek, Llama, Mistral, Qwen, etc.) |
| Free (OpenRouter) | OpenRouter | Zero-cost inference via Nemotron, Qwen, Llama, Gemma & more |

Set `auto` to let the agent pick the best model per task.

---

## Environment Variables

Create a `.env.local` file in the project root:

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | **Yes** | Claude models — [console.anthropic.com](https://console.anthropic.com) |
| `OPENAI_API_KEY` | No | GPT-4o, GPT-4.1, DALL-E 3 |
| `GOOGLE_GEMINI_API_KEY` | No | Gemini 1.5/2.0 |
| `GROQ_API_KEY` | No | Llama / Mixtral via Groq |
| `OPENROUTER_API_KEY` | No | Access 200+ models including free tier via OpenRouter |
| `PERPLEXITY_API_KEY` | No | Real-time web search via Perplexity Sonar |
| `BRAVE_SEARCH_API_KEY` | No | Web search via Brave |
| `SERPER_API_KEY` | No | Google search via Serper |
| `TAVILY_API_KEY` | No | AI-powered web search |
| `REPLICATE_API_TOKEN` | No | Run 1000s of ML models on Replicate |
| `LUMA_API_KEY` | No | Luma Dream Machine video/image generation |
| `ELEVENLABS_API_KEY` | No | Text-to-speech via ElevenLabs |
| `DATABASE_PATH` | No | SQLite DB path (default: `./perplexity-computer.db`) |
| `APP_URL` | No | Public URL (default: `http://localhost:3000`) |
| `GOOGLE_CLIENT_ID` / `SECRET` | No | OAuth for Gmail, Drive, Sheets, Docs, Calendar |
| `MICROSOFT_CLIENT_ID` / `SECRET` | No | OAuth for Outlook, OneDrive, Teams |
| `GITHUB_CLIENT_ID` / `SECRET` | No | GitHub OAuth |
| `NOTION_CLIENT_ID` / `SECRET` | No | Notion OAuth |
| `DROPBOX_CLIENT_ID` / `SECRET` | No | Dropbox OAuth |

---

## Connectors

Navigate to **Connectors** in the sidebar. Click **Connect** on any service to begin setup.

- **OAuth connectors** — click "Sign in with [Provider]" and authorize in the popup
- **API key connectors** — paste your token and click Connect
- **Free** badge = no credit card required

### Free-tier connectors (135+)

| Connector | Auth | Notes |
|---|---|---|
| Gmail / Google Calendar / Drive / Sheets / Docs | OAuth | Free with Google account |
| Outlook / OneDrive / Microsoft Calendar | OAuth | Free with Microsoft account |
| Slack | API key | Free workspace available |
| Discord | API key | Free bot token |
| Telegram | API key | Free via BotFather |
| Dropbox | OAuth | 2 GB free |
| Box | API key | 10 GB free |
| GitHub | OAuth | Free public + private repos |
| GitLab | API key | Free on GitLab.com |
| Vercel | API key | Free Hobby plan |
| Sentry | API key | Free Developer plan |
| Linear | API key | Free personal plan |
| Jira / Confluence | API key | Free up to 10 users |
| Asana | API key | Free up to 10 teammates |
| ClickUp | API key | Free Forever plan |
| Monday.com | API key | Free 2 seats |
| HubSpot | API key | Free CRM |
| Notion | OAuth | Free personal plan |
| Airtable | API key | Free unlimited bases |
| Supabase | API key | Free 500 MB |
| PostgreSQL | Conn. string | Self-hosted or cloud free tier |
| Figma | API key | Free Starter plan |
| Calendly | API key | Free Basic plan |
| WordPress / Webflow / Wix | API key | Free tiers available |
| Hugging Face | API key | Free (rate limited) |
| ElevenLabs | API key | 10k chars/month free |
| Stripe | API key | Free test mode |
| Mailchimp / Klaviyo | API key | Free up to 500 contacts |

<details>
<summary><strong>Communication connector setup</strong></summary>

#### Gmail + Google Calendar
**Auth:** OAuth (Google) | **Free:** Yes

1. Click **Sign in with Google** in the connector modal
2. For your own OAuth app: go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials), create an OAuth 2.0 Client ID, add `http://localhost:3000/api/auth/callback/google` as redirect URI
3. Enable APIs: Gmail, Calendar, Drive, Sheets, Docs
4. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to `.env.local`

#### Outlook + Microsoft Calendar
**Auth:** OAuth (Microsoft) | **Free:** Yes

1. Click **Sign in with Microsoft** in the connector modal
2. For your own OAuth app: [Azure Portal → App registrations](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade), add redirect URI `http://localhost:3000/api/auth/callback/microsoft`
3. Add `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET` to `.env.local`

#### Slack
1. [api.slack.com/apps](https://api.slack.com/apps) → Create New App → add Bot Token Scopes: `chat:write`, `channels:read`, `channels:history`
2. Install to Workspace → copy Bot User OAuth Token (`xoxb-...`)

#### Discord
1. [discord.com/developers/applications](https://discord.com/developers/applications) → New Application → Bot → Reset Token
2. OAuth2 URL Generator: `bot` scope + `Send Messages` permission → invite bot

#### Telegram
1. Message [@BotFather](https://t.me/BotFather) → `/newbot` → copy the token

#### Zoom
[Zoom Marketplace](https://marketplace.zoom.us/) → Server-to-Server OAuth → generate token

#### Twilio
[twilio.com](https://www.twilio.com/) → Console → copy Account SID + Auth Token

</details>

<details>
<summary><strong>Storage connector setup</strong></summary>

#### Google Drive / Sheets / Docs
Connected automatically when you sign in with Google OAuth.

#### OneDrive
Connected automatically when you sign in with Microsoft OAuth.

#### Dropbox
1. [dropbox.com/developers/apps](https://www.dropbox.com/developers/apps) → Create app → Scoped access
2. Add redirect URI: `http://localhost:3000/api/auth/callback/dropbox`
3. Add `DROPBOX_CLIENT_ID` and `DROPBOX_CLIENT_SECRET` to `.env.local`

#### Box
[app.box.com/developers/console](https://app.box.com/developers/console) → Create New App → generate Developer Token

</details>

<details>
<summary><strong>Development connector setup</strong></summary>

#### GitHub
**Option A (OAuth):** [github.com/settings/developers](https://github.com/settings/developers) → OAuth Apps → callback URL `http://localhost:3000/api/auth/callback/github` → add to `.env.local`

**Option B (PAT):** [github.com/settings/tokens/new](https://github.com/settings/tokens/new) → scopes `repo`, `user` → paste in connector modal

#### Vercel
[vercel.com](https://vercel.com) → Account Settings → Tokens → Create Token

#### GitLab
[gitlab.com](https://gitlab.com) → User Settings → Access Tokens → scopes `api`, `read_repository`, `write_repository`

#### Sentry
[sentry.io](https://sentry.io) → Settings → Auth Tokens → scopes `project:read`, `event:read`, `event:write`

#### Datadog
[app.datadoghq.com](https://app.datadoghq.com/organization-settings/api-keys) → API Keys + Application Keys

</details>

<details>
<summary><strong>Project management connector setup</strong></summary>

#### Linear
[linear.app/settings/api](https://linear.app/settings/api) → Create key

#### Jira
[id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens) → Create API token → enter as `email:token@domain`

#### Asana
[app.asana.com/0/my-apps](https://app.asana.com/0/my-apps) → Create new token

#### ClickUp
Avatar → Settings → Apps → Generate API Key

#### Monday.com
Avatar → Developers → My Access Tokens

#### Confluence
Uses the same Atlassian API token as Jira.

</details>

<details>
<summary><strong>CRM connector setup</strong></summary>

#### HubSpot
Settings → Integrations → Private Apps → Create → select CRM scopes → copy access token

#### Salesforce
[Developer Edition](https://developer.salesforce.com/signup) (free) → Setup → Connected App → copy Access Token

#### Zendesk
Admin Center → APIs → Zendesk API → enable Token Access → create API token

</details>

<details>
<summary><strong>Data connector setup</strong></summary>

#### Airtable
[airtable.com/create/tokens](https://airtable.com/create/tokens) → Create token → scopes `data.records:read`, `data.records:write`

#### Supabase
[supabase.com](https://supabase.com) → Project Settings → API → copy `service_role` key

#### PostgreSQL
Paste connection string: `postgresql://user:pass@host:5432/dbname` (works with [Neon](https://neon.tech), Railway, Render, or self-hosted)

#### Snowflake
Enter `accountidentifier:username:password`

</details>

<details>
<summary><strong>Productivity connector setup</strong></summary>

#### Notion
**OAuth:** [notion.so/my-integrations](https://www.notion.so/my-integrations) → New integration → enable Public → redirect URI `http://localhost:3000/api/auth/callback/notion`

**Token:** Copy Internal Integration Token (`secret_...`) → share pages with the integration

#### Figma
Account Settings → Personal access tokens → create token

#### Calendly
[calendly.com/integrations/api_webhooks](https://calendly.com/integrations/api_webhooks) → Generate New Token

#### WordPress.com
Me → Security → enable 2FA → Application Passwords → enter as `username:apppassword`

#### Webflow
Project Settings → Integrations → API Access → Generate API Token

#### Wix
[manage.wix.com/account/api-keys](https://manage.wix.com/account/api-keys) → Generate API Key

</details>

<details>
<summary><strong>AI service connector setup</strong></summary>

#### OpenAI
[platform.openai.com/api-keys](https://platform.openai.com/api-keys) → Create new secret key (`sk-...`)

#### Hugging Face
[huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) → Read token (`hf_...`)

#### ElevenLabs
[elevenlabs.io](https://elevenlabs.io) → Profile → API Key

#### Replicate
[replicate.com/account/api-tokens](https://replicate.com/account/api-tokens) → copy token (`r8_...`)

</details>

<details>
<summary><strong>Finance & marketing connector setup</strong></summary>

#### Stripe
[dashboard.stripe.com](https://dashboard.stripe.com) → Developers → API keys → copy Secret key (`sk_test_...` or `sk_live_...`)

#### Shopify
Admin → Settings → Apps → Develop apps → configure scopes → copy Admin API access token

#### Mailchimp
Account → Extras → API keys → Create A Key (includes datacenter: `abc123-us1`)

#### Klaviyo
Settings → API Keys → Create Private API Key

</details>

<details>
<summary><strong>OAuth setup (Google, Microsoft, GitHub, Notion, Dropbox)</strong></summary>

#### Google OAuth
Connects Gmail, Drive, Sheets, Docs, and Calendar in one click.

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com)
2. Enable APIs: Gmail, Calendar, Drive, Sheets, Docs
3. APIs & Services → Credentials → OAuth client ID (Web) → redirect URI `http://localhost:3000/api/auth/callback/google`
4. Configure consent screen with test users
5. Add to `.env.local`:
   ```
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-...
   ```

#### Microsoft OAuth
Connects Outlook, OneDrive, Teams, and SharePoint.

1. [Azure Portal → App registrations](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade) → New registration
2. Redirect URI: `http://localhost:3000/api/auth/callback/microsoft`
3. API permissions → Microsoft Graph: `Mail.ReadWrite`, `Mail.Send`, `Calendars.ReadWrite`, `Files.ReadWrite`, `offline_access`
4. Certificates & secrets → New client secret
5. Add to `.env.local`:
   ```
   MICROSOFT_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   MICROSOFT_CLIENT_SECRET=your-secret-value
   ```

#### GitHub OAuth
1. [github.com/settings/developers](https://github.com/settings/developers) → OAuth Apps → callback URL `http://localhost:3000/api/auth/callback/github`
2. Add to `.env.local`:
   ```
   GITHUB_CLIENT_ID=your-client-id
   GITHUB_CLIENT_SECRET=your-client-secret
   ```

#### Notion OAuth
1. [notion.so/my-integrations](https://www.notion.so/my-integrations) → New integration → enable Public → redirect URI `http://localhost:3000/api/auth/callback/notion`
2. Add to `.env.local`:
   ```
   NOTION_CLIENT_ID=your-client-id
   NOTION_CLIENT_SECRET=your-client-secret
   ```

#### Dropbox OAuth
1. [dropbox.com/developers/apps](https://www.dropbox.com/developers/apps) → Create app → redirect URI `http://localhost:3000/api/auth/callback/dropbox`
2. Add to `.env.local`:
   ```
   DROPBOX_CLIENT_ID=your-app-key
   DROPBOX_CLIENT_SECRET=your-app-secret
   ```

</details>

---

## Architecture

```
src/
├── app/
│   ├── api/                        # API routes
│   │   ├── auth/                   # OAuth initiation + callback
│   │   ├── tasks/                  # Task CRUD + SSE streaming
│   │   ├── connectors/             # Connector config CRUD
│   │   ├── files/                  # File listing + serving
│   │   ├── gallery/                # Gallery items
│   │   ├── memory/                 # Memory CRUD
│   │   ├── skills/                 # Skills CRUD
│   │   ├── pipelines/              # Pipeline execution
│   │   ├── scheduled-tasks/        # Scheduler engine
│   │   ├── analytics/              # Usage analytics
│   │   ├── sessions/               # Session grouping
│   │   ├── templates/              # Template CRUD
│   │   ├── audit/                  # Audit log
│   │   ├── replicate/              # Replicate model runner
│   │   ├── dreamscape/             # Luma Dream Machine
│   │   ├── huggingface/            # HuggingFace inference
│   │   ├── luma/                   # Luma Dream Machine API
│   │   ├── firefly/                # Nova creative suite APIs (image/video/audio/speech/models)
│   │   ├── generate/               # Generic model generation
│   │   ├── health/                 # Health check + service health (code-server, etc.)
│   │   ├── context/                # Context management
│   │   ├── usage/                  # Usage tracking
│   │   ├── hooks/                  # Webhook handlers
│   │   ├── channels/               # Channel config (Telegram, Discord, etc.)
│   │   ├── settings/               # Global settings CRUD
│   │   ├── social-auth/            # Social media OAuth
│   │   ├── whatsapp/               # WhatsApp Cloud API
│   │   └── voice/                  # Whisper transcription
│   └── computer/                   # All UI pages (25+ routes)
│       ├── firefly/                # Nova creative suite (generate, edit, gallery)
│       ├── dreamscape/             # Dreamscape + Video Studio
│       ├── audio-studio/           # AI Audio Studio (MusicGen, TTS, recording)
│       ├── image-studio/           # AI Image Studio (Replicate, Firefly)
│       └── ...                     # Tasks, Files, Documents, Connectors, Skills, etc.
├── lib/
│   ├── agent.ts                    # Core AI agent (~7,500 lines)
│   ├── db.ts                       # SQLite via better-sqlite3
│   ├── types.ts                    # TypeScript types (~440 lines)
│   ├── connectors-data.ts          # 190+ connector definitions
│   ├── skill-catalog.ts            # 270+ pre-built skills
│   ├── model-fallback.ts           # Multi-provider failover
│   ├── scheduler.ts                # Cron/interval scheduler
│   ├── replicate.ts                # Replicate API client
│   ├── huggingface.ts              # HuggingFace client
│   ├── social-media-browser.ts     # Social media automation
│   ├── personas.ts                 # Agent personality presets
│   ├── models.ts                   # Model configurations & free model list
│   ├── schemas.ts                  # Zod validation schemas
│   ├── constants.ts                # App-wide constants (NAV_ITEMS, API helpers)
│   ├── background-ops.ts           # Background task operations
│   ├── steel-client.ts             # Steel browser client
│   ├── whatsapp.ts                 # WhatsApp Cloud API client
│   ├── running-tasks.ts            # Global AbortController map for live tasks
│   ├── skill-converters.ts         # Skill format converters
│   ├── themes.ts                   # UI theme definitions
│   └── utils.ts                    # Shared utilities
├── components/
│   ├── sidebar.tsx                  # Navigation sidebar
│   ├── persistent-layout.tsx        # LRU keep-alive panel manager (up to 20 pages)
│   ├── bolt-persistent-iframe.tsx   # Persistent bolt.diy iframe (App Builder, port 5173)
│   ├── kilocode-persistent-iframe.tsx # Persistent code-server iframe (Coding Companion, port 3100)
│   ├── blender-persistent-iframe.tsx  # Persistent Blockbench iframe (3D Studio, port 3001)
│   ├── lmms-persistent-iframe.tsx     # Persistent openDAW iframe (port 8080)
│   ├── command-palette.tsx          # ⌘K command palette
│   ├── keyboard-shortcuts.tsx       # Global keyboard shortcuts
│   └── background-status.tsx        # Floating background task status indicator
└── tests/                           # Playwright E2E tests
```

### Database (SQLite via better-sqlite3)

| Table | Purpose |
|---|---|
| `tasks` | Task records with status, model, messages, priority |
| `agent_steps` | Tool calls and results per task |
| `messages` | Chat messages per task |
| `task_files` | Files produced by tasks |
| `file_folders` | Folder hierarchy for the file manager |
| `sub_tasks` | Spawned sub-agent tasks |
| `skills` | Saved skill definitions |
| `gallery_items` | Generated media |
| `connector_configs` | Service credentials (API keys, OAuth tokens) |
| `memory` | Agent long-term memory (key-value + tags) |
| `token_usage` | Per-call token and cost tracking |
| `scheduled_tasks` | Cron/interval schedules |
| `task_templates` | Reusable task presets |
| `agent_learnings` | Patterns the agent learns over time |
| `agent_analytics` | Every agent action logged (audit trail) |
| `settings` | Global configuration |
| `sessions` | Conversation session groupings |
| `pipelines` | DAG pipeline definitions (nodes stored as JSON) |

### Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15.1 (App Router) |
| Language | TypeScript |
| UI | Tailwind CSS · Radix UI · Framer Motion · Lucide React |
| Database | SQLite (`better-sqlite3`) |
| Validation | Zod |
| AI SDKs | `@anthropic-ai/sdk` · `openai` · `@google/generative-ai` |
| AI Providers | Anthropic · OpenAI · Google · Perplexity · OpenRouter |
| Image Generation | Replicate · Adobe Firefly · DALL-E 3 |
| Video Generation | Luma Dream Machine (Ray 3, Ray Flash 2, Photon 1) · Replicate |
| Audio Generation | MusicGen via Replicate · OpenAI TTS · ElevenLabs |
| Speech-to-Text | OpenAI Whisper · Web Speech API |
| Web Scraping | Playwright · Cheerio · node-fetch |
| Auth | Custom OAuth 2.0 (Google · Microsoft · GitHub · Notion · Dropbox) |
| Scheduling | Node.js cron (custom scheduler in `lib/scheduler.ts`) |
| State | React 19 hooks · `uuid` for IDs |
| Markdown | react-markdown + remark-gfm |
| Testing | Playwright E2E |
| Process management | pm2 (`pm2.config.cjs`) |

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Tasks not running / "model not found" | Ensure `ANTHROPIC_API_KEY` is set in `.env.local` and restart the dev server |
| OAuth "redirect_uri_mismatch" | Add the exact URI (including `http://` and port) in the provider's developer console |
| "GOOGLE_CLIENT_ID not configured" | Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to `.env.local`, restart |
| Google "Access blocked: request is invalid" | Configure the OAuth consent screen and add test users at [APIs & Services → OAuth consent screen](https://console.cloud.google.com/apis/auth/consent) |
| Code execution fails | Python runs via `python3` — ensure it's installed. macOS `timeout` is handled automatically |
| Files not showing | Files are stored in `./task-files/<taskId>/` — ensure the directory is writable |
| Connector API calls failing | Re-check the token (no extra spaces). OAuth tokens may need re-authorization |
| Database errors | Delete `perplexity-computer.db` to reset (loses history). Schema is recreated on startup |

---

## Author

- GitHub: [@RhythrosaLabs](https://github.com/RhythrosaLabs)
- Portfolio: [danielsheils.myportfolio.com](https://danielsheils.myportfolio.com)

---

## Topics

`ai-agent` `autonomous-agent` `multi-model` `next-js` `self-hosted` `anthropic` `claude` `gpt-4` `gemini` `openai` `perplexity` `openrouter` `ai-tools` `task-automation` `code-generation` `web-scraping` `image-generation` `video-generation` `audio-generation` `text-to-speech` `musicgen` `replicate` `luma-dream-machine` `adobe-firefly` `sqlite` `typescript` `tailwindcss` `playwright`

---

## License

[MIT](LICENSE) © 2026 [Dan Sheils](https://github.com/RhythrosaLabs)

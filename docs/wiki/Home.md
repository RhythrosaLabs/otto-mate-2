# Ottomate Wiki

**Ottomate** is a self-hosted, multi-model AI agent platform built with Next.js 15. Describe a goal in plain English and the agent plans, researches, codes, browses the web, generates media, connects to 190+ services, and orchestrates everything autonomously.

---

## Quick Navigation

| Section | Description |
|---|---|
| [Getting Started](Getting-Started) | Installation, prerequisites, first run, environment variables |
| [Task Engine](Task-Engine) | How tasks work, steps, streaming, context budget, sub-agents |
| [AI Models](AI-Models) | All models, pricing, failover chain, personas |
| [Tools Reference](Tools-Reference) | Complete list of every agent tool with descriptions |
| [Slash Commands](Slash-Commands) | Power-user input shortcuts |
| [Connectors](Connectors) | 190+ integrations — setup, categories, OAuth flows |
| [Media Generation](Media-Generation) | Image Studio, Video Studio, Audio Studio, Nova Creative Suite |
| [Pages Reference](Pages-Reference) | Every page in the app described |
| [Files](Files) | File browser, sources, formats, folders |
| [Documents](Documents) | Rich text editor, spreadsheet editor, AI assistant |
| [Memory & Knowledge](Memory-and-Knowledge) | Persistent memory system, semantic storage |
| [Pipelines](Pipelines) | Visual DAG pipeline builder |
| [Skills & Templates](Skills-and-Templates) | Skills marketplace, custom skills, templates |
| [Scheduling](Scheduling) | Cron, intervals, daily/weekly recurrence |
| [Channels](Channels) | Inbound messaging — Telegram, Slack, Discord, WhatsApp |
| [Analytics & Audit](Analytics-and-Audit) | Performance dashboard, audit trail |
| [Sessions](Sessions) | Grouping related tasks into conversations |
| [Settings](Settings) | Themes, personas, model selection, cost budgets |
| [Architecture](Architecture) | Code structure, SSE streaming, persistent iframes, LRU cache |
| [Sub-Applications](Sub-Applications) | bolt-diy, Blockbench, openDAW, code-server |
| [Security](Security) | Auth middleware, COOP/COEP, code sandboxing, OWASP notes |
| [Deployment & PM2](Deployment) | Process management, production setup |
| [Troubleshooting](Troubleshooting) | Common issues and fixes |

---

## At a Glance

| Fact | Value |
|---|---|
| Framework | Next.js 15.1.4 (App Router) |
| Version | 2.0.0 |
| Database | SQLite (WAL mode, `better-sqlite3`) |
| Only required env var | `ANTHROPIC_API_KEY` |
| Supported providers | Anthropic, OpenAI, Google, Perplexity, OpenRouter (200+ models) |
| AI tools available | 25+ (web search, code exec, image gen, video gen, email, memory, …) |
| Connectors | 190+ across 28 categories |
| Free-tier connectors | 135+ |
| UI themes | 14 |
| Agent personas | 8 |
| Skills in marketplace | 270+ |
| Pages | 25+ |
| Lines of code in agent | ~7,700 |

---

## Core Capabilities

- **Autonomous task execution** — the agent creates a plan, calls tools, handles errors, iterates, and streams all progress in real time
- **Multi-model orchestration** — Claude Opus/Sonnet, GPT-4.1, Gemini 2.0, Perplexity Sonar, OpenRouter with automatic failover
- **Code execution** — runs Python, Node.js, and shell scripts in-process with captured output and a security sandbox
- **Web browsing** — web search (Brave, Perplexity, Serper, Tavily), full-page scraping (Playwright + Cheerio), Steel cloud Chrome with CAPTCHA solving
- **190+ connectors** — Gmail, Slack, GitHub, Stripe, Notion, HubSpot, WhatsApp, Discord, Telegram, and many more
- **Media generation** — images (FLUX, DALL-E 3, Adobe Firefly), video (Luma Dream Machine, Runway ML, Kling AI), music (MusicGen), speech (OpenAI TTS, ElevenLabs)
- **Nova creative suite** — unified AI media hub with 6 creation modes
- **Dreamscape Video Studio** — 17-mode video production environment with AI Director
- **Persistent memory** — key-value store the agent reads/writes across tasks
- **Visual pipelines** — DAG builder for chained task dependencies
- **Sub-agents** — spawns specialized child agents for parallel work
- **Computer use** — control macOS desktop with `screencapture` + `cliclick` + AppleScript

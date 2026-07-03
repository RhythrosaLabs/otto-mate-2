<div align="center">

# ⚡ Ottomate

**Self-hosted multi-model AI agent platform — 190+ connectors, 200+ skills, full computer control**

![Next.js](https://img.shields.io/badge/Next.js-15-000000?style=flat&logo=next.js&logoColor=white)
![Claude](https://img.shields.io/badge/Claude-Anthropic-orange?style=flat)
![OpenAI](https://img.shields.io/badge/OpenAI-412991?style=flat&logo=openai&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=flat)

</div>

---

Ottomate is a self-hosted, multi-model AI agent platform. Describe a goal in plain English — the agent plans multi-step workflows, writes and executes code, searches the web, controls your computer, generates media, and talks to 190+ services autonomously. Ships as a single `npm install` with a SQLite database on first launch.

## ✨ Key Capabilities

- **Autonomous execution** — plans, reasons, and iterates with tool use until the goal is met
- **Computer Control** — full desktop automation via Anthropic computer use: screenshots, mouse, keyboard, bash, file editing
- **Multi-model orchestration** — Claude Opus/Sonnet, GPT-4o/4.1, Gemini 2.0, Perplexity Sonar, with automatic failover
- **Code execution** — runs Python, Node.js, and shell scripts with captured output
- **Web browsing** — Brave, Perplexity, Serper, Tavily search + Playwright browser automation
- **190+ connectors** — Gmail, Slack, GitHub, Jira, Stripe, Notion, HubSpot, WhatsApp, and many more
- **Nova AI creative suite** — FLUX, DALL-E 3 images; Minimax, Kling, Wan video; MusicGen audio; 12-voice TTS; image editing with canvas masking
- **Dreamscape Video Studio** — 17-mode studio built on Luma Dream Machine (Ray 2, Photon 1) with storyboards, 20 camera presets, AI Director
- **Cron scheduler** — schedule any workflow to run automatically
- **Visual pipelines** — drag-and-drop pipeline builder

## 🚀 Quick Start

```bash
git clone https://github.com/RhythrosaLabs/otto-mate-2.git
cd otto-mate-2
npm install
cp .env.example .env.local  # add your API keys
npm run dev
# Open http://localhost:3000
```

## 🛠️ Tech Stack

- **Next.js 15** — full-stack React framework
- **Anthropic Claude** — primary reasoning model
- **OpenAI / Gemini / Perplexity** — additional models
- **Replicate / Luma / HuggingFace** — media generation
- **Playwright** — browser automation
- **SQLite** — local database, zero external infrastructure

## 🤝 Contributing

PRs welcome. Open an issue first for major changes.

## 📄 License

MIT

## 💛 Support

If Ottomate runs your workflows, consider supporting development:

👉 [Donate via PayPal](https://paypal.me/noodlebake) — @noodlebake

---
<div align="center">Made with ❤️ by <a href="https://github.com/RhythrosaLabs">RhythrosaLabs</a></div>

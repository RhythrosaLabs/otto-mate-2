# Deep Technical Research: Four Repos for the Universal AI Computer

## Table of Contents
1. [Otto-Mate (Otto Chat)](#1-otto-mate--otto-chat)
2. [Project N.O.M.A.D.](#2-project-nomad)
3. [Brainstormer 4](#3-brainstormer-4)
4. [Node Mode](#4-node-mode)
5. [Cross-Cutting Analysis](#5-cross-cutting-analysis)
6. [Relevance to Universal AI Computer](#6-relevance-to-universal-ai-computer)

---

## 1. Otto-Mate / Otto Chat

**Repo:** [RhythrosaLabs/otto-mate](https://github.com/RhythrosaLabs/otto-mate)  
**Tagline:** "Universal AI Assistant — Control everything through conversation"  
**Author:** RhythrosaLabs (Danny Saturn) — the user's OWN project  
**Language split:** Python 64%, HTML 32.6%, CSS 1.9%, JS 1.1%

### 1.1 Architecture Overview

Otto Chat is a **full-stack autonomous AI platform** built as a Python monolith on **FastAPI**. It combines a conversational AI front-end with 100+ integrated tools, multi-agent orchestration, and a built-in HTML/JS web UI served directly from the FastAPI server.

```
┌─────────────────────────────────────────────────┐
│                  Web UI (chat.html)              │
│        19K+ line single-page HTML app            │
│            14 themes, gradient UI                │
├───────────────────┬─────────────────────────────┤
│   REST API        │    WebSocket Gateway         │
│   30+ routers     │    Unified control plane     │
│   FastAPI         │    Multi-channel support     │
├───────────────────┴─────────────────────────────┤
│              CORE ENGINE (65 modules)            │
│  ┌──────────────┐ ┌───────────┐ ┌────────────┐  │
│  │ Agent        │ │ Super     │ │ Execution  │  │
│  │ Orchestrator │ │ Planning  │ │ Agent      │  │
│  │ (1825 lines) │ │ Agent     │ │            │  │
│  └──────┬───────┘ └─────┬─────┘ └──────┬─────┘  │
│         │               │              │         │
│  ┌──────▼───────────────▼──────────────▼──────┐  │
│  │           Tool Registry (40 modules)       │  │
│  │  Image | Video | Audio | Research | Code   │  │
│  │  Printify | Shopify | Browser | Email      │  │
│  └────────────────────────────────────────────┘  │
│  ┌────────────┐ ┌───────────┐ ┌──────────────┐  │
│  │ Plugin     │ │ Skills    │ │ Memory       │  │
│  │ System     │ │ (17 pkgs) │ │ (ChromaDB)   │  │
│  └────────────┘ └───────────┘ └──────────────┘  │
├─────────────────────────────────────────────────┤
│  CHANNELS: Web | Telegram | Discord | Slack     │
│            WhatsApp | REST API | WebSocket      │
├─────────────────────────────────────────────────┤
│  INFRA: SQLite/PostgreSQL | Redis | ChromaDB    │
│         Docker Compose (5 services)             │
└─────────────────────────────────────────────────┘
```

### 1.2 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Python 3.11+ |
| **Web Framework** | FastAPI 0.109+ with Uvicorn |
| **AI Primary** | Claude (Anthropic) — Opus 4 for planning, Sonnet for chat |
| **AI Fallback** | GPT-4 Turbo (OpenAI) |
| **Image Gen** | Replicate (Flux Pro 1.1, SDXL, Recraft V3, Ideogram V2, etc.) — 15+ models |
| **Video Gen** | Runway Gen-3 Alpha, Luma Dream Machine, Minimax, Kling — 5+ models |
| **Audio** | MusicGen, ElevenLabs TTS, OpenAI Whisper STT |
| **Database** | SQLAlchemy ORM + Alembic (SQLite default, PostgreSQL production) |
| **Vector Store** | ChromaDB |
| **Cache/Sessions** | Redis |
| **Task Scheduling** | APScheduler |
| **Browser Automation** | Playwright (stealth mode) |
| **Search** | Serper API (Google) |
| **E-Commerce** | Printify API, Shopify API |
| **Messaging** | Telegram, Discord, Slack, WhatsApp bots |
| **Email** | SendGrid / SMTP |
| **Auth** | JWT tokens |
| **Voice** | OpenAI Whisper + ElevenLabs |
| **Frontend** | Vanilla HTML/CSS/JS served by FastAPI (19K+ line chat.html) |
| **Deployment** | Docker Compose (5 services: API, Postgres, Redis, ChromaDB, Nginx) |

### 1.3 Core Abstractions

#### Multi-Agent System
The heart of Otto is a **four-stage agent pipeline**:

1. **Orchestrator** (`agent_orchestrator.py` — 1,825 lines): The "central brain." Receives user messages, determines intent, selects execution strategy, and coordinates between all other agents. This is the single most important file.

2. **Super Planning Agent** (`super_planning_agent.py`): Uses Claude Opus 4 to break complex tasks into parallel and sequential execution plans. Creates dependency graphs between steps (e.g., "generate image" → "upload to Printify" → "create product").

3. **Execution Agent** (`execution_agent.py`): Takes individual plan steps and executes them by invoking the appropriate tools. Handles parallel execution for independent steps.

4. **Verifier Agent** (`verifier_agent.py`): Validates outputs against the original intent. Implements a self-improvement loop that learns from outcomes.

Additionally:
- **Unified Agent System** (`unified_agent_system.py`): Framework for Orchestrator, Planner, Executor, Researcher, Verifier roles with inter-agent communication
- **Autonomous Orchestrator** (`autonomous_orchestrator.py`): Fully autonomous mode for complex multi-step business workflows
- **Enhanced Intelligence** (`enhanced_intelligence.py`): Advanced reasoning layer with multi-strategy reasoning

#### Modality-First Model Selection
```
User message → Determine output modality (text/image/video/audio/code)
            → Select optimal model for that modality
            → Priority: Local models → Remote APIs → Replicate (cost optimization)
```
The `modality_system.py` determines the output type BEFORE selecting which AI model to use, ensuring the cheapest appropriate model is always chosen.

#### Tool Registry Pattern
Tools are registered via **Python decorators** on functions. The `tool_registry.py` module provides `@register_tool(category="image")` style registration with:
- Dynamic discovery at startup
- Category-based filtering
- Auto-generated tool descriptions for the LLM
- 40 tool implementation modules across image, video, audio, e-commerce, research, browser, content, code, and more

#### Plugin System
Drop-in plugins in `/plugins/` with:
```
plugins/my_plugin/
├── plugin.json    # Metadata: name, version, type, settings schema
├── main.py        # Entry point
└── requirements.txt
```
Types: Tool, Integration, Agent, Processor, UI, Workflow. Hot-reload supported. 8 built-in plugins.

#### Skill Packages
Modular capability packages in `/skills/` — 17 domains including business_operations, content_creation, ecommerce_automation, video_production, etc. Skills are higher-level composable workflows built on top of tools.

#### Channel Abstraction
The **Gateway** (`gateway.py`) provides a unified WebSocket control plane. All channels (Web, Telegram, Discord, Slack, WhatsApp) route through the same AI pipeline via `channel_manager.py`. Same brain, different interfaces.

### 1.4 API Patterns

**REST API Structure** (34 route modules):
- Core: `POST /chat`, `POST /chat/stream` (SSE), `GET /tools`, `GET /capabilities`
- WebSocket: `/ws` (real-time chat + voice), `/gateway` (unified control)
- Resources: `/api/settings`, `/api/files`, `/api/agents`, `/api/workflows`, `/api/tasks`, `/api/projects`, etc.
- AI Editing: `POST /api/ai/edit`, `/api/ai/review`, `/api/ai/refactor`, `/api/ai/fix`
- Media: `POST /api/media/edit`, `GET /api/media/capabilities`
- Messaging: `/api/telegram`, `/api/discord`, `/api/whatsapp`
- Voice: `POST /voice` (full duplex: Speech→Text→AI→Text→Speech), `POST /transcribe`

**Streaming:** SSE for `/chat/stream` endpoint. Real-time progress tracking for multi-step operations.

**Chat Request:**
```json
POST /chat
{
  "message": "Create a tall portrait image of a mountain landscape using Flux Pro",
  "conversation_id": "...",
  "mode": "autonomous"
}
```

### 1.5 UI/UX Approach

- **Single monolithic HTML file** (`chat.html` — 19K+ lines) with embedded CSS/JS
- 14 visual themes (Aurora, Light, Dark, Midnight, Sunset, Ocean, etc.)
- Gradient sidebars with purple/pink/teal animations
- A/B Editor Preview for side-by-side Original vs Result comparison
- Real-time progress indicators for multi-step operations
- Keyboard shortcuts (⌘+Enter send, ⌘+, settings, etc.)
- Slash commands: `/image`, `/video`, `/music`, `/research`, `/help`
- Task queue visualization with pending/running/completed states
- Calendar view for scheduled tasks
- Settings page, file browser, agent management UI, workflow builder
- First-run onboarding wizard

### 1.6 Key Design Decisions

1. **Python monolith over microservices**: Everything in one process for simplicity. Docker Compose only adds infra services (DB, Redis, ChromaDB).
2. **Anthropic-first AI strategy**: Claude is the primary brain; everything else is fallback. This is unusual — most platforms are OpenAI-first.
3. **Vanilla HTML over React/Vue**: The 19K-line chat.html is a deliberate choice for zero build step, instant deployment, and no frontend framework dependency.
4. **Replicate as the model hub**: Rather than integrating each image/video model provider individually, Otto heavily uses Replicate as a unified API for dozens of models.
5. **Decorator-based tool registration**: Extensible without modifying core code. Tools self-register.
6. **Modality-first selection**: Cost optimization by routing to the cheapest model that can produce the required output type.
7. **Self-improvement loop**: The system learns from each interaction to improve future responses — a form of in-session fine-tuning via memory.

---

## 2. Project N.O.M.A.D.

**Repo:** [Crosstalk-Solutions/project-nomad](https://github.com/Crosstalk-Solutions/project-nomad)  
**Tagline:** "Node for Offline Media, Archives, and Data — Knowledge That Never Goes Offline"  
**Stars:** 6,500+ | **Forks:** 601 | **Contributors:** 9 | **Releases:** 51  
**Language split:** TypeScript 91.2%, Shell 7.7%

### 2.1 Architecture Overview

Project N.O.M.A.D. is fundamentally an **orchestrator** — a management UI ("Command Center") and API that manages a collection of **containerized tools** via Docker. It does NOT implement AI, education, or maps itself — it installs, configures, starts/stops, and updates other open-source projects packaged as Docker containers.

```
┌─────────────────────────────────────────────────┐
│            Browser (http://localhost:8080)        │
│         Inertia.js + React Frontend (SSR)        │
│                                                   │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌────────┐ │
│  │ Home │ │ Chat │ │ Maps │ │ Docs │ │Settings│ │
│  └──────┘ └──────┘ └──────┘ └──────┘ └────────┘ │
├───────────────────────────────────────────────────┤
│         AdonisJS 6 Backend (Node.js)              │
│  ┌────────────────────────────────────────────┐   │
│  │ Controllers                                 │   │
│  │  benchmark | chats | downloads | easy_setup │   │
│  │  maps | ollama | rag | settings | system    │   │
│  │  zim | collection_updates | docs            │   │
│  ├────────────────────────────────────────────┤   │
│  │ Services                                    │   │
│  │  docker_service | download_service          │   │
│  │  ollama_service | rag_service               │   │
│  │  benchmark_service | map_service            │   │
│  │  system_service | queue_service             │   │
│  │  zim_service | zim_extraction_service       │   │
│  │  container_registry_service                 │   │
│  │  collection_manifest_service                │   │
│  ├────────────────────────────────────────────┤   │
│  │ Jobs (BullMQ)                               │   │
│  │  downloads | model-downloads | benchmarks   │   │
│  │  embeddings                                 │   │
│  └────────────────────────────────────────────┘   │
├───────────────────────────────────────────────────┤
│         Managed Containers (Docker)               │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ Kiwix    │ │ Kolibri  │ │ Open WebUI +     │  │
│  │ (Wiki/   │ │ (Educ-   │ │ Ollama (AI Chat) │  │
│  │  Library)│ │  ation)  │ │                   │  │
│  ├──────────┤ ├──────────┤ ├──────────────────┤  │
│  │ CyberChef│ │ FlatNotes│ │ ProtoMaps        │  │
│  │ (Data)   │ │ (Notes)  │ │ (Offline Maps)   │  │
│  └──────────┘ └──────────┘ └──────────────────┘  │
├───────────────────────────────────────────────────┤
│  Infrastructure                                    │
│  MySQL | Redis (BullMQ) | Qdrant (Vector Store)   │
│  Sidecar: disk-collector | sidecar-updater        │
└───────────────────────────────────────────────────┘
```

### 2.2 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend Framework** | AdonisJS 6 (Node.js TypeScript framework — like Laravel for Node) |
| **Frontend Framework** | Inertia.js + React (SSR with React pages) |
| **Styling** | Tailwind CSS |
| **Build Tool** | Vite |
| **Container Orchestration** | Docker (direct API via `docker_service.ts`) |
| **Database** | MySQL |
| **Job Queue** | BullMQ (Redis-backed) with queues: downloads, model-downloads, benchmarks, embeddings |
| **Vector Store** | Qdrant (for RAG embeddings) |
| **AI** | Ollama (local LLM inference) |
| **RAG** | Custom implementation with Qdrant vectors + Ollama embeddings |
| **Maps** | ProtoMaps (self-hosted tile server) |
| **Wiki/Library** | Kiwix (ZIM file reader) |
| **Education** | Kolibri (Khan Academy offline) |
| **Data Tools** | CyberChef |
| **Notes** | FlatNotes |
| **Server-Side Rendering** | Inertia.js (AdonisJS → React, no traditional API layer for UI) |
| **Deployment** | Docker multi-stage build → node:22-slim |

### 2.3 Core Abstractions

#### Container Orchestration Pattern
NOMAD's central abstraction is the **managed container**. The `docker_service.ts` is the core service that:
- Creates/starts/stops/restarts containers
- Manages port allocation and networking
- Handles GPU passthrough (NVIDIA runtime detection, GPU type persisted to KV store)
- Pulls images from container registries
- Monitors container health and status

Each "tool" (Kiwix, Kolibri, Ollama, CyberChef, etc.) is a Docker container that NOMAD manages through its UI. Users don't touch Docker directly.

#### Collection & Content Management
- **Collection Manifest Service** (`collection_manifest_service.ts`): Manages curated content collections (Wikipedia subsets, medical references, survival guides, ebooks)
- **ZIM Service** (`zim_service.ts`): Manages Kiwix ZIM files — the offline Wikipedia format. Includes extraction service for embedding ZIM content into the RAG vector store.
- **Download Service** (`download_service.ts`): Manages large file downloads with stall detection, progress tracking, failure recovery, and user-dismissable failed downloads

#### RAG Pipeline
- **Ollama Service** (`ollama_service.ts`): Manages local LLM models — download, delete, list, force-refresh
- **RAG Service** (`rag_service.ts`): Document upload → chunking → embedding via Ollama → storage in Qdrant → semantic search at query time
- **Chat Service** (`chat_service.ts`): AI chat with knowledge base integration, state management, custom AI Assistant naming
- **Embedding Pipeline**: BullMQ job queue for async embedding with progress tracking, retry storm prevention

#### Easy Setup Wizard
The **Easy Setup Controller** (`easy_setup_controller.ts`) provides a guided first-time configuration flow with:
- Hardware detection (CPU, RAM, GPU, storage)
- Curated content collection selection
- Tool installation recommendations based on hardware

#### System Services
- **System Service** (`system_service.ts`): Hardware info, disk space, GPU detection, system health
- **Benchmark Service** (`benchmark_service.ts`): Hardware scoring with HMAC-signed results submitted to a community leaderboard
- **System Update Service** (`system_update_service.ts`): Self-update mechanism for the NOMAD Command Center container

### 2.4 API Patterns

NOMAD uses **Inertia.js** — this means there's no traditional REST API for the UI. Instead:
- Controllers return `inertia.render('page-name', { props })` which server-side renders React components
- Navigation is SPA-like (partial page updates via XHR), but every page is a React component rendered server-side first
- SSE (Server-Sent Events) for real-time updates (download progress, embedding queue status, container status changes)
- Conventional AdonisJS routing with controller actions

**Key Routes inferred from controllers:**
- `/` → Home (dashboard with installed tools, system status)
- `/chat` → AI Chat with RAG
- `/maps` → Offline Maps
- `/docs` → Documentation viewer
- `/settings/*` → System settings, themes, GPU config
- `/easy-setup/*` → First-run wizard
- `/benchmark` → Hardware benchmark
- API endpoints for download management, ZIM management, Ollama model management

### 2.5 UI/UX Approach

- **Inertia.js + React**: Server-rendered React pages with SPA-like navigation
- **Tailwind CSS** styling
- **Night Ops dark mode** with theme toggle (recently added)
- **SSE-based real-time updates**: Download progress, embedding queue status, container states — all live-updating without polling
- **"Command Center" metaphor**: Dashboard showing all installed tools, their status, quick launch links
- **Easy Setup Wizard**: Guided onboarding for first-time users
- **Benchmark page**: Hardware scoring with community leaderboard integration
- **Support the Project page**: Recently added settings page
- **Debug Info modal**: For bug reporting

### 2.6 Key Design Decisions

1. **Orchestrator, not implementor**: NOMAD doesn't implement AI, maps, or education — it orchestrates existing open-source Docker containers. This is the defining architectural choice.
2. **Offline-first**: Zero telemetry, zero internet requirement after install. Privacy is a first-class concern.
3. **AdonisJS over Express/Fastify**: Choosing a batteries-included framework (like Laravel for Node) over minimal frameworks. Gives them ORM, validation, job queues, routing, middleware all built-in.
4. **Inertia.js over API + SPA**: No separate frontend build. The React pages are part of the AdonisJS app, rendered server-side. This eliminates the API layer for UI concerns.
5. **Docker as the package manager**: Every tool is a container. Installation = `docker pull`. Updates = `docker pull` + `docker restart`. Uninstall = `docker rm`.
6. **BullMQ for background jobs**: Downloads, model downloads, benchmarks, and embeddings all run as background jobs with progress tracking and retry logic.
7. **No authentication by design**: NOMAD is intended for single-user local use. Network-level access control is recommended instead.
8. **Sidecar containers**: Disk collector and updater run as sibling containers for system monitoring and self-updating.

---

## 3. Brainstormer 4

**Repo:** [RhythrosaLabs/brainstormer-4](https://github.com/RhythrosaLabs/brainstormer-4)  
**Tagline:** "AI-powered creative suite — chat, image editor, audio DAW, video editor, 3D viewer, code editor & more"  
**Author:** RhythrosaLabs (Danny Saturn) — same author as Otto  
**Language split:** TypeScript 99.3%

### 3.1 Architecture Overview

Brainstormer 4 is a **browser-based creative suite** — a single React SPA that packages a dozen professional tools (image editor, audio DAW, video editor, code editor, 3D viewer, etc.) behind one unified interface, with every feature supercharged by AI. It's a pure client-side app: zero backend, all API calls go directly from the browser to AI provider endpoints.

```
┌─────────────────────────────────────────────────────────┐
│                    React SPA (Vite)                       │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │                    App Shell                         │ │
│  │  ┌──────────┐  ┌──────────────────────────────────┐ │ │
│  │  │ Sidebar  │  │          Active Tool View         │ │ │
│  │  │          │  │                                    │ │ │
│  │  │ • Chat   │  │  ┌────────────────────────────┐  │ │ │
│  │  │ • Image  │  │  │   Tool-specific UI          │  │ │ │
│  │  │ • Video  │  │  │   (Canvas / Timeline /      │  │ │ │
│  │  │ • Audio  │  │  │    Piano Roll / Editor)     │  │ │ │
│  │  │ • 3D     │  │  │                              │  │ │ │
│  │  │ • Code   │  │  └────────────────────────────┘  │ │ │
│  │  │ • Docs   │  │                                    │ │ │
│  │  │ • Sheets │  │                                    │ │ │
│  │  │ • Charts │  │                                    │ │ │
│  │  │ • Files  │  │                                    │ │ │
│  │  │ • Board  │  │                                    │ │ │
│  │  │ • Cal    │  │                                    │ │ │
│  │  │ • ⚙️     │  │                                    │ │ │
│  │  └──────────┘  └──────────────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │                  Services Layer                       │ │
│  │  ai.ts | chat.ts | images.ts | openai.ts            │ │
│  │  stability.ts | replicate.ts | commands.ts           │ │
│  │         (Direct browser → API provider calls)         │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌─────────────────────────────────────┐                 │
│  │  State: localStorage (API keys,     │                 │
│  │         projects, preferences)       │                 │
│  └─────────────────────────────────────┘                 │
└─────────────────────────────────────────────────────────┘
```

### 3.2 Tech Stack

| Layer | Technology |
|-------|-----------|
| **UI Framework** | React 18 |
| **Language** | TypeScript |
| **Build Tool** | Vite |
| **Styling** | Tailwind CSS |
| **State** | localStorage (no state management library visible from repo structure) |
| **AI Chat** | GPT-4o (OpenAI), Claude Sonnet (Anthropic), Llama 3 (Replicate) |
| **Image AI** | DALL·E 3 (OpenAI), Stable Diffusion 3 (Stability AI), Flux Pro (Replicate) |
| **Video AI** | Dream Machine (Luma AI), Stable Video Diffusion (Stability AI), Kling (Replicate) |
| **Audio AI** | MusicGen (Replicate), Stable Audio (Stability AI) |
| **3D AI** | Stable Fast 3D (Stability AI) |
| **Backend** | **NONE** — pure client-side |

### 3.3 Core Features & How They Work

| Tool | Component | Capabilities |
|------|-----------|-------------|
| **AI Chat** | `Chat.tsx`, `ChatInput.tsx`, `ChatMessage.tsx`, `ChatHistory.tsx`, `ChatSidebar.tsx` | Multi-model chat (GPT-4o, Claude, Llama 3), file attachments, code highlighting, model switching mid-thread |
| **Image Editor** | `ImageEditor.tsx`, `image-editor/` directory | Layer-based canvas editor with brushes, tools, AI generation (DALL·E 3, SD, Flux), inpainting, adjustments, text overlay, export |
| **Video Editor** | `VideoEditor.tsx`, `video-editor/` directory | Timeline editor, AI video generation (Luma, Kling, Stable Video), effects |
| **Audio DAW** | `AudioEditor.tsx`, `audio-editor/` directory | Multi-track recording/sequencing/mixing, piano roll for MIDI, AI music generation (MusicGen, Stable Audio), effects chain |
| **3D Viewer** | `ThreeDViewer.tsx`, `three-editor/` directory | AI 3D model generation (Stable Fast 3D), textures, scene composition |
| **Code Editor** | `CodeEditor.tsx`, `code-editor/` directory | Syntax highlighting, AI pair programmer (explain, refactor, extend), terminal, live preview |
| **Document Editor** | `DocumentEditor.tsx` | Rich text + markdown, AI writing assistant |
| **Spreadsheet** | `SpreadsheetEditor.tsx`, `SpreadsheetEditor/` directory | Formulas, charts, AI data analysis |
| **Chart Builder** | `ChartEditor.tsx`, `ChartViewer.tsx` | 10+ chart types, AI-generated insights |
| **File Manager** | `FileManager.tsx`, `FileViewer.tsx`, `FileUpload.tsx` | Drag-and-drop, multi-format viewer |
| **Project Board** | `ProjectBoard.tsx` | Kanban board, AI task breakdown |
| **Calendar** | `Calendar.tsx` | Event management, AI scheduling |

### 3.4 API Patterns

**No backend API.** All AI calls are made directly from the browser to the provider's REST API:

```typescript
// services/openai.ts
fetch('https://api.openai.com/v1/chat/completions', {
  headers: { 'Authorization': `Bearer ${apiKey}` },
  body: JSON.stringify({ model: 'gpt-4o', messages: [...] })
})
```

Service modules:
- `ai.ts` — Unified AI interface / router
- `chat.ts` — Chat-specific service logic
- `images.ts` — Image generation routing
- `openai.ts` — OpenAI API wrapper
- `stability.ts` — Stability AI API wrapper
- `replicate.ts` — Replicate API wrapper
- `commands.ts` — Command palette actions

**API keys stored in localStorage only.** Never transmitted to any server other than the AI provider directly.

### 3.5 UI/UX Approach

- **Dark theme by default** — professional creative suite aesthetic
- **Sidebar navigation** — switch between tools (Chat, Image, Video, Audio, 3D, Code, Docs, Sheets, Charts, Files, Board, Calendar, Settings)
- **Command palette** (⌘/Ctrl+K) — quick-access to any action, like VS Code
- **Tool-specific UIs**: Each tool has its own specialized interface (canvas for image editor, timeline for video, piano roll for audio DAW, syntax-highlighted editor for code)
- **MediaSelector** and **MediaToolbar** components for cross-tool content sharing
- **Settings panel** in sidebar for API key management
- **`BrAInstormerText.tsx`** — branded text component for consistent branding
- **Toast notifications** via `Toast.tsx`
- **Help overlay** via `Help.tsx`

### 3.6 Key Design Decisions

1. **Zero backend**: All API calls go directly from browser to AI providers. No server, no data collection, no CORS proxy. This is a **radical privacy decision** — nothing is stored on any server the developer controls.
2. **One app, many tools**: Rather than separate apps for each capability, everything is integrated into one SPA. The sidebar acts as a tool switcher.
3. **AI-native, not AI-added**: Every tool is designed around AI from the ground up. The image editor doesn't just have an "AI generate" button — AI is woven into brushes, inpainting, adjustments, etc.
4. **localStorage as the database**: No database at all. Projects, API keys, preferences — all in the browser's localStorage.
5. **Multi-model support in chat**: Users can switch between GPT-4o, Claude, and Llama 3 mid-conversation, comparing outputs.
6. **Bolt.new heritage**: The `.bolt` directory in the repo root suggests this was initially scaffolded or developed using Bolt.new (StackBlitz's AI dev tool).

---

## 4. Node Mode

**Repo:** [RhythrosaLabs/node-mode](https://github.com/RhythrosaLabs/node-mode)  
**Tagline:** "Visual node-based canvas for chaining AI models into generation pipelines"  
**Author:** RhythrosaLabs (Danny Saturn) — same author as Otto and Brainstormer  
**Language split:** TypeScript 99%

### 4.1 Architecture Overview

Node Mode is a **visual pipeline builder** — an infinite canvas where you drag, drop, and connect AI model nodes to build multi-step generation pipelines. Like ComfyUI but for any AI model (not just Stable Diffusion). Pure client-side, zero backend.

```
┌────────────────────────────────────────────────────────────┐
│                     React SPA (Vite)                        │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ ExecutionControls: [▶ Run] [⏹ Stop] [💾 Save] [📂 Load]││
│  │                    [⏰ Schedule] [⚙ Settings]            ││
│  └─────────────────────────────────────────────────────────┘│
│  ┌──────────────────────────────────────────┐  ┌──────────┐│
│  │              Infinite Canvas              │  │ Config   ││
│  │   ┌──────────┐    ┌──────────┐           │  │ Panel    ││
│  │   │OpenAI    │───▶│Stability │           │  │          ││
│  │   │Text      │    │Image     │           │  │ Model:   ││
│  │   │"write    │    │"use text │           │  │ [dropdown]││
│  │   │ sci-fi"  │    │ as prompt│           │  │ Prompt:  ││
│  │   │[output]  │    │[preview] │           │  │ [textarea]││
│  │   └──────────┘    └────┬─────┘           │  │ Temp:    ││
│  │                        │                  │  │ [slider] ││
│  │                   ┌────▼─────┐           │  │ Size:    ││
│  │                   │3D Viewer │           │  │ [select] ││
│  │                   │[preview] │           │  │          ││
│  │                   └──────────┘           │  └──────────┘│
│  │           Grid background + DnD          │               │
│  └──────────────────────────────────────────┘               │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                    Zustand Stores                       │ │
│  │  nodeStore     — nodes, connections, undo/redo          │ │
│  │  executionStore — pipeline execution engine             │ │
│  │  fileStore     — generated file management              │ │
│  │  schedulerStore — cron scheduling                       │ │
│  │  settingsStore — API keys (persisted to localStorage)   │ │
│  │  themeStore    — light/dark mode                        │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              AI Service Layer (Direct API)              │ │
│  │  openAIService | anthropicService | googleAIService     │ │
│  │  stabilityAIService | perplexityService | lumaService   │ │
│  │  runwayService | replicateService                       │ │
│  └────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

### 4.2 Tech Stack

| Layer | Technology |
|-------|-----------|
| **UI Framework** | React 18 |
| **Language** | TypeScript |
| **Build Tool** | Vite |
| **State Management** | **Zustand** (6 separate stores) |
| **Drag & Drop** | @dnd-kit |
| **Animations** | Framer Motion |
| **3D Rendering** | Three.js / @react-three/fiber |
| **Styling** | Tailwind CSS |
| **Icons** | Lucide React |
| **Notifications** | Sonner |
| **AI Providers** | OpenAI, Anthropic, Google AI, Stability AI, Perplexity, Luma AI, Runway ML, Replicate |
| **Backend** | **NONE** — pure client-side |

### 4.3 Core Abstractions

#### Node Graph Model
The fundamental data structure is a **directed acyclic graph (DAG)** of nodes and connections:

```typescript
// types/node.ts
interface PipelineNode {
  id: string;
  type: NodeType;        // 'openai-text' | 'stability-image' | 'luma-video' | etc.
  position: { x: number; y: number };
  config: NodeConfig;     // model, prompt, temperature, size, etc.
  output?: any;           // Generated result (text, image URL, audio URL, etc.)
  status: 'idle' | 'running' | 'done' | 'error';
}

interface Connection {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourcePort: 'output';
  targetPort: 'input';
}
```

#### Zustand Store Architecture
Six separate stores for separation of concerns:

1. **`nodeStore.ts`**: Nodes array, connections array, selected node, undo/redo history stack. All canvas mutations go through here.
2. **`executionStore.ts`**: Pipeline execution engine. Topologically sorts the DAG, resolves dependencies, executes nodes in the correct order. Handles parallel execution of independent branches.
3. **`fileStore.ts`**: Tracks all generated outputs (images, videos, audio files). Allows browsing, downloading, and deleting.
4. **`schedulerStore.ts`**: Cron-based scheduling. Stores schedule definitions and triggers pipeline execution on schedule.
5. **`settingsStore.ts`**: API keys for all providers, persisted to localStorage.
6. **`themeStore.ts`**: Light/dark mode toggle.

#### Execution Engine
The execution flow:
```
User clicks ▶ Run
  → executionStore.execute()
    → Topological sort of the node graph
    → For each node in order:
        → Resolve input (from connected parent node's output, or from config prompt)
        → Dispatch to appropriate AI service (executionUtils.ts switch on node type)
        → Store output on the node
        → Update status: idle → running → done/error
    → Independent branches execute in parallel
```

The `executionUtils.ts` has a big switch statement dispatching each node type to its corresponding service:
```typescript
switch (node.type) {
  case 'openai-text': return openAIService.generateText(...)
  case 'stability-image': return stabilityAIService.generateImage(...)
  case 'luma-video': return lumaService.generateVideo(...)
  // ... 13+ cases
}
```

#### Node Templates
`nodeTemplates.ts` defines `NODE_TYPES` constants and `createNodeTemplate(type)` factory:
- Each template specifies default config (model, prompt placeholder, parameters)
- Categories: Text Generation, Image Generation, Video Generation, Audio & Speech, 3D

#### Connection System
- Nodes have green **output ports** and blue **input ports**
- Click output → click input to connect
- Connections rendered as **Bezier SVG curves** (`ConnectionLine.tsx`)
- Validation prevents cycles (DAG enforcement)

### 4.4 Node Types (13+)

| Category | Node Type | Provider | Description |
|----------|-----------|----------|-------------|
| **Text** | OpenAI Text | OpenAI | GPT-4o, GPT-4 Turbo, GPT-3.5 Turbo |
| **Text** | Anthropic Text | Anthropic | Claude 3.5 Sonnet, Opus, Haiku |
| **Text** | Google AI Text | Google | Gemini 1.5 Pro, Flash |
| **Text** | Perplexity Text | Perplexity | Sonar Large/Small (internet-connected) |
| **Image** | OpenAI Image | OpenAI | DALL·E 3 |
| **Image** | Stability Image | Stability AI | SDXL 1.0 with negative prompts |
| **Image** | Google AI Image | Google | Imagen |
| **Image** | Runway Image | Runway ML | Gen-2 |
| **Video** | Luma Video | Luma AI | Dream Machine |
| **Video** | Runway Video | Runway ML | Gen-2 |
| **Audio** | Audio Generation | Replicate | MusicGen |
| **Speech** | Text to Speech | Replicate | Bark |
| **3D** | 3D Model Gen | Replicate | Shap·E |
| **3D** | Model 3D Viewer | Three.js | Interactive 3D preview |

### 4.5 API Patterns

**Zero backend.** Same pattern as Brainstormer — direct browser-to-provider API calls.

Each AI service is a standalone module in `services/ai/`:
```typescript
// services/ai/openAIService.ts
export async function generateText(config: TextConfig): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    headers: { Authorization: `Bearer ${settingsStore.getState().openaiKey}` },
    body: JSON.stringify({ model: config.model, messages: [...] })
  });
  return response.json();
}
```

8 service modules, one per provider: OpenAI, Anthropic, Google AI, Stability AI, Perplexity, Luma, Runway, Replicate.

### 4.6 UI/UX Approach

- **Infinite canvas** with dot-grid background (`Grid.tsx`)
- **Drag & drop** via @dnd-kit — move nodes freely on plane  
- **Node cards** (`Node.tsx`) showing: type icon, name, status badge, inline output preview, input/output ports
- **Config panel** slides in from the right when a node is clicked (`NodeConfig.tsx`)
- **Bezier connection lines** with smooth curves between ports
- **Node search** (`NodeSearch.tsx`) — searchable picker categorized by Text/Image/Video/Audio/3D
- **Inline previews** (`NodePreview.tsx`) — generated images, videos, audio players, text shown directly on the node card
- **File manager modal** — browse/download/delete all generated outputs
- **Schedule modal** — set cron schedules for automated pipeline runs
- **Light/dark theme** toggle
- **Undo/redo** (Ctrl+Z / Ctrl+Shift+Z) — full history stack
- **Keyboard shortcuts**: Ctrl+Enter (run), Esc (abort), Delete (remove node), Ctrl+Scroll (zoom)

### 4.7 Key Design Decisions

1. **Zustand over Redux/Context**: Lightweight, minimal boilerplate, perfect for a canvas app where many components need to read/write shared state. Six separate stores prevents one megastore.
2. **Topological sort execution**: The graph is properly sorted before execution, ensuring dependencies are resolved correctly. This is the key algorithmic choice.
3. **Inline previews**: Instead of showing outputs in a separate panel, each node card shows its output inline. This gives visual feedback directly on the canvas.
4. **@dnd-kit over react-beautiful-dnd**: @dnd-kit is more flexible for free-form canvas positioning (not just list sorting).
5. **No ComfyUI**: Despite the similar concept, Node Mode is built from scratch with React/Zustand, not forking ComfyUI. This gives it a modern web-native UX but means it starts from zero.
6. **Workflow persistence as JSON**: The entire canvas (nodes, connections, positions, configs) serializes to a single JSON file. Simple, portable, version-controllable.
7. **Adding new nodes is a 5-step recipe**: Well-documented extension points: nodeTemplates → NodeSearch → executionUtils → AINodeConfig → NodePreview.

---

## 5. Cross-Cutting Analysis

### 5.1 Architectural Patterns Comparison

| Aspect | Otto-Mate | Project NOMAD | Brainstormer 4 | Node Mode |
|--------|-----------|---------------|-----------------|-----------|
| **Architecture** | Python monolith | Docker orchestrator | Client-side SPA | Client-side SPA |
| **Backend** | FastAPI (Python) | AdonisJS (Node.js) | NONE | NONE |
| **Frontend** | Vanilla HTML/JS | Inertia.js + React | React + Vite | React + Vite |
| **State Mgmt** | Server-side (DB) | Server-side (MySQL) | localStorage | Zustand + localStorage |
| **AI Execution** | Server-side | Server-side (Ollama) | Client-side (direct) | Client-side (direct) |
| **Deployment** | Docker Compose | Docker Compose | Static hosting | Static hosting |
| **Privacy Model** | Keys on server | Fully local/offline | Keys in browser only | Keys in browser only |
| **Scale** | 65+ core modules, 40+ tools | ~15 services, manages N containers | 12 tools, 7 services | 13+ nodes, 8 services |
| **Primary Author** | Danny Saturn | Crosstalk team (9 contributors) | Danny Saturn | Danny Saturn |

### 5.2 Shared Patterns Across All Four

1. **Multi-model AI**: All four support multiple AI models/providers, not locked to one vendor
2. **Settings-based API key management**: User brings their own API keys
3. **Task/Workflow orchestration**: Otto has the planning agent, NOMAD has BullMQ jobs, Node Mode has the execution engine, Brainstormer has commands
4. **Dark-themed UIs**: All four default to or include dark mode
5. **Docker somewhere**: Otto and NOMAD use Docker for deployment; Brainstormer and Node Mode don't need it

### 5.3 Unique Strengths

| Repo | Unique Strength |
|------|----------------|
| **Otto-Mate** | Deepest agent orchestration — 4-stage agent pipeline with planning, execution, verification, self-improvement. Most comprehensive tool catalog (100+). Multi-channel (Web, Telegram, Discord, Slack, WhatsApp). |
| **NOMAD** | Only project that works **fully offline**. Docker-based tool management is the most production-ready pattern. 6,500 stars prove real-world adoption. Hardware benchmark with community leaderboard. |
| **Brainstormer 4** | Most **breadth of creative tools** in a single app. Full image editor with layers, full audio DAW with piano roll, full video editor with timeline — all AI-native. Zero backend is a radical privacy/simplicity choice. |
| **Node Mode** | Only project with a **visual pipeline builder**. The DAG execution engine with topological sort is unique. Allows non-programmers to chain AI models visually. The "Combine outputs" pattern. |

---

## 6. Relevance to Building a "Universal AI Computer"

### 6.1 What a Universal AI Computer Needs

A "universal AI computer" is the convergence of all four projects' capabilities:

| Capability | Primary Source |
|-----------|---------------|
| **Conversational AI interface** | Otto-Mate |
| **Multi-agent task planning & execution** | Otto-Mate |
| **Offline-first knowledge base** | Project NOMAD |
| **Docker-based tool orchestration** | Project NOMAD |
| **Creative suite (image/video/audio/code/docs)** | Brainstormer 4 |
| **Visual AI pipeline builder** | Node Mode |
| **E-commerce automation** | Otto-Mate |
| **Browser automation** | Otto-Mate |
| **Education platform** | Project NOMAD |
| **Offline maps & data tools** | Project NOMAD |
| **Hardware-aware optimization** | Project NOMAD |

### 6.2 Architecture Synthesis

The ideal architecture borrows from each:

```
┌─────────────────────────────────────────────────────────────┐
│                    Universal AI Computer                      │
│                                                               │
│  ┌──────────── Presentation Layer ─────────────────────────┐ │
│  │  React SPA with Sidebar Navigation (from Brainstormer)   │ │
│  │  + Infinite Canvas Mode (from Node Mode)                  │ │
│  │  + Chat Interface (from Otto-Mate)                        │ │
│  │  + Command Palette (from Brainstormer)                    │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌──────────── Agent Layer ────────────────────────────────┐ │
│  │  Orchestrator → Planner → Executor → Verifier            │ │
│  │  (from Otto-Mate's multi-agent pipeline)                  │ │
│  │  + Visual Pipeline Builder (from Node Mode)               │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌──────────── Tool Layer ─────────────────────────────────┐ │
│  │  Creative Tools: Image Editor, Audio DAW, Video Editor,   │ │
│  │                  Code Editor, 3D Viewer (from Brainstormer)│ │
│  │  Business Tools: E-commerce, Email, Social (from Otto)    │ │
│  │  Knowledge Tools: Wiki, Education, Maps (from NOMAD)      │ │
│  │  AI Pipeline: Visual node graph (from Node Mode)          │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌──────────── Infrastructure Layer ───────────────────────┐ │
│  │  Docker Container Orchestration (from NOMAD)              │ │
│  │  + BullMQ Job Queue (from NOMAD)                          │ │
│  │  + Ollama for Local AI (from NOMAD)                       │ │
│  │  + RAG with Vector Store (from NOMAD + Otto)              │ │
│  │  + Offline-First Design (from NOMAD)                      │ │
│  └──────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 6.3 Key Takeaways for Implementation

1. **Otto's agent pipeline is the brain**. The Orchestrator → Planner → Executor → Verifier pattern is the most sophisticated approach to task decomposition. The modality-first model selection and tool registry patterns are production-proven.

2. **NOMAD's Docker orchestration is the deployment model**. Having the system manage its own containers via a UI is far superior to asking users to configure Docker themselves. The sidecar pattern for system monitoring and self-updating is mature.

3. **Brainstormer's tool breadth defines the creative surface**. 12 professional tools in one app shows what's possible. The zero-backend approach proves AI tools can be purely client-side.

4. **Node Mode's visual pipeline is the power-user interface**. The DAG execution engine, Zustand store architecture, and topological sort execution are clean, well-structured implementations of complex concepts.

5. **NOMAD is the only project with real traction** (6.5K stars, 601 forks, 51 releases, 9 contributors). Its patterns around community engagement, hardware benchmarking, and curated content collections are validated.

6. **All three RhythrosaLabs projects share a "zero backend" philosophy** for client-side tools. This is a strong design principle — user data never touches a server the developer controls.

7. **The missing piece across all four**: None have a unified **workspace** concept where outputs from one tool become inputs to another seamlessly. Otto has the planning agent that chains tools, and Node Mode has visual piping, but neither has a full creative workspace where the image editor's output automatically becomes available in the video editor's timeline.

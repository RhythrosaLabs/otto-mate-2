# Deep Technical Research: vllm-omni, awesome-openclaw-skills, awesome-claude-code-subagents

**Date:** March 21, 2026

---

## 1. vllm-project/vllm-omni

> **3.5k stars · 586 forks · 136 contributors · Apache-2.0**
> "A framework for efficient model inference with omni-modality models"

### 1.1 What It Is

vLLM-Omni extends the original vLLM (designed for text-only autoregressive LLM serving) to support **omni-modality model inference and serving**. It handles:

- **Omni-modality I/O**: Text, image, video, and audio
- **Non-autoregressive architectures**: Diffusion Transformers (DiT) alongside standard AR models
- **Heterogeneous outputs**: A single request can produce text, then audio, then images across pipeline stages
- **Fully disaggregated serving**: Stages run on separate GPU pools, connected via shared-memory or IPC connectors

### 1.2 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    AsyncOmniEngine                              │
│  (Main thread: accepts requests, returns final outputs)         │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                  Orchestrator                              │  │
│  │  (Background thread with own asyncio loop)                 │  │
│  │                                                            │  │
│  │  ┌──────────┐    ┌──────────┐    ┌──────────┐             │  │
│  │  │ Stage 0  │───▶│ Stage 1  │───▶│ Stage 2  │             │  │
│  │  │ (Thinker)│    │ (Talker) │    │(Code2Wav)│             │  │
│  │  │  LLM/AR  │    │  LLM/AR  │    │Generation │             │  │
│  │  └──────────┘    └──────────┘    └──────────┘             │  │
│  │       │                │               │                   │  │
│  │  StageEngineCore  StageEngineCore  StageEngineCore         │  │
│  │  Client           Client           Client                  │  │
│  │                                                            │  │
│  │  OutputProcessor  OutputProcessor  OutputProcessor          │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  OmniConnectors (SharedMemory / IPC for inter-stage transfer)   │
└─────────────────────────────────────────────────────────────────┘
```

#### The Multi-Stage Pipeline

The core architectural innovation is the **heterogeneous pipeline abstraction**. Every model is decomposed into numbered **stages** (0, 1, 2, ...) defined by a `pipeline.yaml` file. Each stage:

- Has its own **StageType**: `LLM` (autoregressive) or `DIFFUSION`
- Runs its own **engine, scheduler, and worker**
- Can be placed on **different GPUs** (configured via `runtime.devices`)
- Communicates outputs to the next stage via **OmniConnector** (shared memory) or queue-based forwarding

**Example: Qwen3-Omni-MoE 3-stage pipeline:**

| Stage | Name | Type | Function | Output |
|-------|------|------|----------|--------|
| 0 | Thinker | LLM/AR | Multimodal understanding + text generation | Hidden states (latent) + text |
| 1 | Talker | LLM/AR | Text embeddings → 8-layer RVQ codec codes | Codec codes |
| 2 | Code2Wav | Generation | RVQ codes → audio waveform | Audio |

**Example: Bagel (image generation) 2-stage pipeline:**

| Stage | Name | Type | Function | Output |
|-------|------|------|----------|--------|
| 0 | Thinker | LLM/AR | Multimodal understanding + text generation | Text + KV cache |
| 1 | DiT | DIFFUSION | KV cache → diffusion image generation | Image |

### 1.3 Key Abstractions

#### `StageConfig` / `ModelPipeline` (config/stage_config.py)

The foundational configuration abstraction. Each `StageConfig` carries:

```python
@dataclass
class StageConfig:
    stage_id: int
    model_stage: str              # "thinker", "talker", "code2wav", "dit"
    stage_type: StageType         # LLM or DIFFUSION
    input_sources: list[int]      # Which stage IDs feed into this one
    custom_process_input_func: str # Module path for inter-stage data transform
    final_output: bool            # Does this stage produce user-visible output?
    final_output_type: str        # "text", "audio", "image"
    worker_type: str              # "ar" or "generation"
    scheduler_cls: str            # Custom scheduler class path
    yaml_engine_args: dict        # Per-stage engine settings
    yaml_runtime: dict            # Device placement, process config
    yaml_extras: dict             # Sampling params, connector config, TTS args
    runtime_overrides: dict       # CLI overrides (take precedence)
```

`ModelPipeline` wraps the full pipeline:
```python
@dataclass
class ModelPipeline:
    model_type: str
    stages: list[StageConfig]
    async_chunk: bool             # Enable streaming inter-stage transfer
    connectors: dict | None       # SharedMemory / IPC connector config
    edges: list[dict] | None      # DAG edges between stages
```

#### `StageConfigFactory`

Auto-detects model type from HuggingFace config, loads the matching `pipeline.yaml`, merges CLI overrides. Maps model types to pipeline directories:

```python
PIPELINE_MODELS = {
    "qwen3_omni_moe": "qwen3_omni",
    "qwen2_5_omni": "qwen2_5_omni",
    "bagel": "bagel",
    "qwen3_tts": "qwen3_tts",
    "voxtral_tts": "voxtral_tts",
    "mimo_audio": "mimo_audio",
    "glm-image": "glm_image",
    "cosyvoice3": "cosyvoice3",
    "mammothmoda2": "mammoth_moda2",
}
```

#### `Orchestrator` (engine/orchestrator.py)

The brain of the runtime. Runs in a **background thread** with its own asyncio event loop. Responsibilities:

1. **Request handling**: Receives `add_request` messages, creates `OrchestratorRequestState` per-request
2. **Stage polling**: Continuously polls all stage clients for outputs (both LLM `EngineCoreOutputs` and diffusion `OmniRequestOutput`)
3. **Output routing**: When a stage finishes, forwards output to the next stage via `_forward_to_next_stage()`
4. **CFG companion tracking**: For classifier-free guidance (Bagel), tracks companion requests (text-unconditional, image-unconditional) alongside the main request, deferring parent forwarding until all companions complete
5. **Async chunk prewarm**: In streaming mode, pre-arms downstream stages at request start
6. **Metrics**: Per-stage token counts, generation time, batch stats

Key orchestration loop:
```
poll_stage_raw() → process_stage_outputs() → route_output()
  ├── If final stage: send to main thread
  ├── If intermediate: forward_to_next_stage()
  └── If CFG companion: track and defer
```

#### `OmniConnector` / Adapter (distributed/omni_connectors/)

The disaggregation layer. Instead of passing massive tensors through queues, connectors use **shared memory** for zero-copy transfer between stages:

```python
# Put data from stage 0 to stage 1
connector.put(str(stage_id), str(next_stage_id), str(req_id), payload_data)

# Get data at receiving stage
payload = connector.get(from_stage, to_stage, str(rid), metadata=connector_metadata)
```

Payload structure:
```python
{
    "engine_inputs": next_inputs,       # Token IDs, embeddings, etc.
    "sampling_params": sampling_params,
    "metadata": {
        "original_prompt": safe_prompt,
        "stage_transition": "0->1",
        "timestamp": time.time(),
    },
}
```

#### `DiffusionModelRegistry` (diffusion/registry.py)

A lazy-loading registry mapping architecture names to pipeline classes. Supports 25+ diffusion models:

- **Image**: QwenImage, GlmImage, ZImage, OvisImage, Flux, Flux2, SD3, OmniGen2, Helios, HunyuanImage3, LongCat, Bagel
- **Video**: Wan2.2, LTX2, HunyuanVideo-1.5 (T2V and I2V)
- **Audio**: StableAudio

Each model registers pre/post-process functions for input/output transformation.

#### Stage Input Processors (model_executor/stage_input_processors/)

Custom functions that transform data between stages. E.g.:
- `thinker2talker`: Extracts hidden states from thinker output, formats for talker input
- `talker2code2wav`: Converts codec codes to waveform generation input
- `expand_cfg_prompts`: Creates classifier-free guidance companion prompts for Bagel

### 1.4 Key Patterns

1. **YAML-driven pipeline definition**: Model developers define topology at integration time, not runtime. Each model directory contains a `pipeline.yaml` specifying stages, their types, device placement, and data flow.

2. **Stage-type polymorphism**: Both LLM (autoregressive) and DIFFUSION stages coexist in the same pipeline. The orchestrator handles them uniformly but with type-specific logic (e.g., diffusion stages use `add_request_async(req_id, prompt, params)` while LLM stages use `add_request_async(request)`).

3. **Fully disaggregated execution**: Stages can run on different GPU pools with different memory utilization, tensor parallelism, and scheduling strategies. Shared memory connectors minimize data transfer overhead.

4. **Async chunk streaming**: For TTS models (Qwen3-Omni), the `async_chunk` mode pre-arms all downstream stages at request start, allowing streaming data flow through chunk adapters rather than waiting for each stage to fully complete.

5. **CFG companion pattern**: For diffusion models with classifier-free guidance, the orchestrator spawns companion requests (unconditional variants) alongside the main request and synchronizes their completion before forwarding to the diffusion stage.

6. **OpenAI-compatible API**: The entrypoints module provides OpenAI-compatible serving for all modalities, making it a drop-in replacement for existing LLM serving infrastructure.

### 1.5 Supported Models (as of v0.16.0)

| Category | Models |
|----------|--------|
| Omni-modal | Qwen3-Omni-MoE, Qwen2.5-Omni, MammothModa2 |
| Text-to-Speech | Qwen3-TTS, Voxtral-TTS, Fish Speech, CosyVoice3 |
| Text-to-Image | QwenImage, GlmImage, Flux, Flux2, SD3, OmniGen2, HunyuanImage3, Helios, LongCat |
| Image-to-Image | QwenImageEdit, BagelImg2Img, LongCatEdit |
| Text-to-Video | Wan2.2, LTX2, HunyuanVideo-1.5 |
| Image-to-Video | Wan2.2 I2V, LTX2 I2V, HunyuanVideo-1.5 I2V |
| Audio Generation | StableAudio |
| Audio Understanding | MiMo-Audio |

### 1.6 Integration Points

To integrate vLLM-Omni into another system:

1. **As an OpenAI-compatible server**: Start `vllm-omni serve` and hit the HTTP API — simplest integration
2. **As a Python library**: Use `AsyncOmniEngine` directly for programmatic inference
3. **Add a new model**: Create a `pipeline.yaml` in `model_executor/models/<model>/`, implement model code, register in `StageConfigFactory.PIPELINE_MODELS`
4. **Custom stage processors**: Implement `custom_process_input_func` modules for inter-stage data transformation
5. **Extend connectors**: Implement new `OmniConnector` backends beyond shared memory

---

## 2. VoltAgent/awesome-openclaw-skills

> **40.5k stars · 3.9k forks · 52 contributors · MIT**
> "The awesome collection of OpenClaw skills. 5,400+ skills"

### 2.1 What It Is

A **curated catalog** of 5,200+ community-built skills for **OpenClaw**, a locally-running AI assistant. OpenClaw (formerly known as "Clawdbot") operates directly on the user's machine, and skills extend its capabilities to interact with external services, automate workflows, and perform specialized tasks.

This repo is **not** the skills themselves — it's a curated list of links to skills hosted in the official `github.com/openclaw/skills` repository and registered on **ClawHub** (the public skills registry with 13,729+ total skills).

### 2.2 Architecture

#### Ecosystem Architecture
```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│   OpenClaw   │────▶│  Local Skills │────▶│  External APIs   │
│  (AI Agent)  │     │  Directory   │     │  (GitHub, Slack,  │
│              │     │              │     │   Gmail, etc.)    │
│  25+ LLM    │     │ ~/.openclaw/ │     └──────────────────┘
│  providers   │     │   skills/    │
└──────────────┘     └──────────────┘
        │
        ▼
┌──────────────┐     ┌──────────────┐
│   ClawHub    │     │awesome-openclaw│
│  (Registry)  │◀───│   -skills     │
│  13,729+     │     │  (Curation)  │
│  skills      │     │  5,200+      │
└──────────────┘     └──────────────┘
```

#### Skill Installation Hierarchy

| Priority | Location | Scope |
|----------|----------|-------|
| Highest | `<project>/skills/` | Workspace-specific |
| Medium | `~/.openclaw/skills/` (Local) | User-global |
| Lowest | Bundled | System defaults |

Installation methods:
```bash
# ClawHub CLI (recommended)
clawhub install <skill-slug>

# Manual: copy skill folder to ~/.openclaw/skills/
# Paste GitHub link into assistant chat (auto-setup)
```

### 2.3 Skill Structure

Each skill lives in the official OpenClaw skills repo at `github.com/openclaw/skills/tree/main/skills/<author>/<skill-name>/`. Required file:

- **`SKILL.md`** — The skill definition document containing instructions, capabilities, and configuration

Skills are essentially **prompt-based capability extensions** — markdown documents that the OpenClaw agent loads to understand how to perform specialized tasks. They can also include:
- Helper scripts (shell, Python)
- Configuration files
- API integration code

### 2.4 Categories of Capabilities (5,211 skills across 28 categories)

| Category | Count | Description |
|----------|-------|-------------|
| **Coding Agents & IDEs** | 1,184 | IDE integration, code generation, agent tools |
| **Web & Frontend Development** | 919 | React, Vue, Angular, CSS frameworks |
| **DevOps & Cloud** | 393 | AWS, GCP, Azure, Docker, K8s, CI/CD |
| **Search & Research** | 345 | Academic papers, web search, data gathering |
| **Browser & Automation** | 322 | Headless browsers, web scraping, CAPTCHA solving |
| **Productivity & Tasks** | 203 | Task management, planners, note-taking |
| **CLI Utilities** | 179 | Terminal tools, shell helpers, file processing |
| **AI & LLMs** | 176 | Model providers, prompt engineering, agent orchestration |
| **Git & GitHub** | 167 | PR automation, commit workflows, repo management |
| **Image & Video Generation** | 164 | AI image generation, video editing, 3D models |
| **Communication** | 146 | Email, Slack, Discord, messaging |
| **Transportation** | 110 | Maps, routing, travel planning |
| **PDF & Documents** | 105 | Document parsing, PDF manipulation |
| **Marketing & Sales** | 102 | SEO, ad automation, CRM integration |
| **Health & Fitness** | 87 | Health tracking, medical info |
| **Media & Streaming** | 85 | Music, podcasts, video streaming |
| **Notes & PKM** | 70 | Obsidian, Notion, knowledge management |
| **Calendar & Scheduling** | 65 | Calendar integration, meeting scheduling |
| **Security & Passwords** | 53 | Password management, security audits |
| **Shopping & E-commerce** | 51 | Product search, price tracking |
| **Personal Development** | 50 | Learning, habit tracking |
| **Speech & Transcription** | 45 | TTS, STT, live transcription |
| **Apple Apps & Services** | 44 | macOS/iOS automation |
| **Smart Home & IoT** | 41 | Home automation, device control |
| **Clawdbot Tools** | 37 | Agent-specific utilities |
| **Gaming** | 35 | Game development, game automation |
| **Self-Hosted & Automation** | 33 | Self-hosting tools |
| **Moltbook** | 29 | Notebook integration |
| **iOS & macOS Development** | 29 | Swift, Xcode, Apple platform dev |
| **Data & Analytics** | 28 | Data visualization, analytics tools |

### 2.5 Key Patterns

1. **Registry-based distribution**: Skills are published to the official OpenClaw skills repo, registered on ClawHub, and then curated here. The awesome-list is a quality filter — it excluded ~7,200 skills from ClawHub for spam, duplicates, low quality, crypto/finance, and malicious content.

2. **Security scanning**: ClawHub partners with VirusTotal for automated security scanning. The repo also recommends Snyk and Agent Trust Hub for additional vetting.

3. **Skills as prompt extensions**: At their core, skills are markdown documents that instruct the AI agent on how to behave. They can include:
   - Trigger conditions (when to activate)
   - Tool definitions (APIs to call)
   - Step-by-step workflows
   - Error handling patterns

4. **Multi-provider support**: OpenClaw works with 25+ LLM providers (Anthropic, OpenAI, etc.) and skills are provider-agnostic.

5. **External service integration**: Through Composio and similar middleware, skills can manage OAuth tokens, scoped permissions, and logged tool calls across 1000+ external apps.

### 2.6 Integration Into Another System

1. **As a skill catalog**: Parse the README.md or category files to build a searchable index of 5,200+ capabilities
2. **Skill format adoption**: Use the SKILL.md format as a template for defining capabilities in your own agent system
3. **ClawHub API**: Install skills programmatically via `clawhub install <slug>`
4. **Category taxonomy**: Adopt the 28-category taxonomy for organizing your own skill/capability system
5. **Quality filtering methodology**: Apply similar filtering criteria (anti-spam, dedup, security scanning) to your own skill registries

---

## 3. VoltAgent/awesome-claude-code-subagents

> **14.7k stars · 1.6k forks · 21 contributors · MIT**
> "A collection of 100+ specialized Claude Code subagents"

### 3.1 What It Is

A **curated collection of 127+ subagent definitions** for Claude Code — specialized AI assistants that Claude Code can invoke for domain-specific tasks. Unlike OpenClaw skills (which are prompt extensions for a separate agent), these are **subagent definitions** that Claude Code spawns as isolated child agents with their own context windows.

### 3.2 Architecture

#### How Subagents Work in Claude Code

```
┌─────────────────────────────────────────────┐
│              Claude Code (Parent)            │
│                                              │
│  "Have the backend-developer subagent        │
│   analyze my API endpoints"                  │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │     Subagent: backend-developer        │  │
│  │     (Isolated Context Window)          │  │
│  │                                        │  │
│  │  Tools: Read, Write, Edit, Bash,       │  │
│  │         Glob, Grep                     │  │
│  │  Model: sonnet                         │  │
│  │                                        │  │
│  │  ┌──────────────────────────────────┐  │  │
│  │  │ System Prompt:                   │  │  │
│  │  │ "You are a senior backend dev    │  │  │
│  │  │  specializing in Node.js 18+,    │  │  │
│  │  │  Python 3.11+, and Go 1.21+..." │  │  │
│  │  └──────────────────────────────────┘  │  │
│  └────────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

Key properties of subagents:
- **Isolated context windows**: Each runs in its own context, preventing cross-contamination
- **Domain-specific intelligence**: Carefully crafted system prompts for specialized domains
- **Shared across projects**: Install globally (`~/.claude/agents/`) or per-project (`.claude/agents/`)
- **Granular tool permissions**: Each subagent specifies exactly which tools it can use
- **Auto-selection**: Claude Code automatically engages the right subagent based on description matching

#### Storage and Priority

| Type | Path | Scope | Priority |
|------|------|-------|----------|
| Project | `.claude/agents/` | Current project only | Higher |
| Global | `~/.claude/agents/` | All projects | Lower |

Project subagents override global ones with the same name.

### 3.3 Subagent Definition Format

Every subagent is a **Markdown file with YAML frontmatter**:

```yaml
---
name: backend-developer
description: "Use this agent when building server-side APIs, microservices,
  and backend systems that require robust architecture, scalability planning,
  and production-ready implementation."
tools: Read, Write, Edit, Bash, Glob, Grep
model: sonnet
---

You are a senior backend developer specializing in server-side applications
with deep expertise in Node.js 18+, Python 3.11+, and Go 1.21+...

[Agent-specific checklists, patterns, guidelines]

## Communication Protocol
[Inter-agent communication specs with JSON message formats]

## Development Workflow
### 1. System Analysis
### 2. Service Development
### 3. Production Readiness
```

#### Frontmatter Fields

| Field | Purpose | Examples |
|-------|---------|---------|
| `name` | Identifier for invocation | `backend-developer`, `security-auditor` |
| `description` | Trigger condition (Claude uses this for auto-selection) | "Use when building server-side APIs..." |
| `tools` | Comma-separated Claude Code tool permissions | `Read, Write, Edit, Bash, Glob, Grep` |
| `model` | Claude model routing | `opus`, `sonnet`, `haiku`, `inherit` |

#### Tool Assignment by Role Type

| Role | Tools | Rationale |
|------|-------|-----------|
| Read-only (reviewers, auditors) | `Read, Grep, Glob` | Analyze without modifying |
| Research (analysts) | `Read, Grep, Glob, WebFetch, WebSearch` | Gather information |
| Code writers (developers) | `Read, Write, Edit, Bash, Glob, Grep` | Create and execute |
| Documentation (writers) | `Read, Write, Edit, Glob, Grep, WebFetch, WebSearch` | Document with research |

#### Smart Model Routing

| Model | Use Case | Examples |
|-------|----------|---------|
| `opus` | Deep reasoning — architecture reviews, security audits | security-auditor, architect-reviewer |
| `sonnet` | Everyday coding — writing, debugging, refactoring | python-pro, backend-developer |
| `haiku` | Quick tasks — docs, search, dependency checks | documentation-engineer, seo-specialist |
| `inherit` | Uses whatever model the main conversation uses | — |

### 3.4 Communication Protocol Pattern

Subagents define structured JSON communication for inter-agent coordination:

```json
{
  "requesting_agent": "backend-developer",
  "request_type": "get_backend_context",
  "payload": {
    "query": "Require backend system overview: service architecture,
              data stores, API gateway config, auth providers..."
  }
}
```

Status updates during execution:
```json
{
  "agent": "backend-developer",
  "status": "developing",
  "phase": "Service implementation",
  "completed": ["Data models", "Business logic", "Auth layer"],
  "pending": ["Cache integration", "Queue setup", "Performance tuning"]
}
```

### 3.5 Categories (10 categories, 127+ subagents)

| # | Category | Plugin Name | Count | Key Subagents |
|---|----------|-------------|-------|---------------|
| 01 | Core Development | `voltagent-core-dev` | 10 | api-designer, backend-developer, frontend-developer, fullstack-developer, graphql-architect, microservices-architect, mobile-developer, ui-designer, websocket-engineer, electron-pro |
| 02 | Language Specialists | `voltagent-lang` | 25+ | typescript-pro, python-pro, rust-engineer, golang-pro, java-architect, react-specialist, nextjs-developer, vue-expert, angular-architect, kotlin-specialist, swift-expert, laravel-specialist, rails-expert, spring-boot-engineer, etc. |
| 03 | Infrastructure | `voltagent-infra` | 15+ | cloud-architect, kubernetes-specialist, terraform-engineer, docker-expert, devops-engineer, sre-engineer, platform-engineer, network-engineer, security-engineer, database-administrator, etc. |
| 04 | Quality & Security | `voltagent-qa-sec` | 12+ | code-reviewer, security-auditor, qa-expert, penetration-tester, accessibility-tester, chaos-engineer, debugger, error-detective, performance-engineer, architect-reviewer, compliance-auditor, test-automator |
| 05 | Data & AI | `voltagent-data-ai` | 12+ | ai-engineer, ml-engineer, data-engineer, data-scientist, llm-architect, nlp-engineer, mlops-engineer, prompt-engineer, postgres-pro, database-optimizer, data-analyst |
| 06 | Developer Experience | `voltagent-dev-exp` | 12+ | mcp-developer, refactoring-specialist, legacy-modernizer, documentation-engineer, git-workflow-manager, cli-developer, build-engineer, tooling-engineer, dx-optimizer, slack-expert, dependency-manager |
| 07 | Specialized Domains | `voltagent-domains` | 10+ | blockchain-developer, fintech-engineer, game-developer, iot-engineer, embedded-systems, seo-specialist, payment-integration, m365-admin, quant-analyst, risk-manager |
| 08 | Business & Product | `voltagent-biz` | 10+ | product-manager, project-manager, scrum-master, business-analyst, technical-writer, ux-researcher, content-marketer, sales-engineer, legal-advisor, wordpress-master, customer-success-manager |
| 09 | Meta & Orchestration | `voltagent-meta` | 10+ | multi-agent-coordinator, agent-organizer, context-manager, workflow-orchestrator, task-distributor, error-coordinator, knowledge-synthesizer, performance-monitor, agent-installer, it-ops-orchestrator |
| 10 | Research & Analysis | `voltagent-research` | 7+ | research-analyst, search-specialist, trend-analyst, competitive-analyst, market-researcher, data-researcher, scientific-literature-researcher |

### 3.6 Distribution Mechanisms

#### As Claude Code Plugins (Primary)
```bash
claude plugin marketplace add VoltAgent/awesome-claude-code-subagents
claude plugin install voltagent-lang     # Language specialists
claude plugin install voltagent-infra    # Infrastructure & DevOps
```

Plugin versioning is tracked in `.claude-plugin/marketplace.json` and per-category `plugin.json` files.

#### As Standalone Files
```bash
# Interactive installer
git clone https://github.com/VoltAgent/awesome-claude-code-subagents.git
./install-agents.sh

# Remote installer (no clone)
curl -sO https://raw.githubusercontent.com/.../install-agents.sh
./install-agents.sh

# Meta-agent installer (use Claude Code itself to install)
curl -s .../agent-installer.md -o ~/.claude/agents/agent-installer.md
# Then: "Use the agent-installer to show me available categories"
```

#### Discovery Tool (`subagent-catalog`)

A Claude Code skill for browsing the catalog:
```
/subagent-catalog:search <query>     # Find agents by name/description/category
/subagent-catalog:fetch <name>       # Get full agent definition
/subagent-catalog:list               # Browse all categories
/subagent-catalog:invalidate         # Refresh cache
```

### 3.7 Key Patterns

1. **YAML frontmatter + markdown body**: The format is designed for human readability AND machine consumption. The frontmatter is structured metadata while the body is natural language instruction.

2. **Role-based tool scoping**: Read-only agents can't write. Developers can execute code. Research agents can fetch web content. This principle of least privilege is enforced by the `tools` field.

3. **Model routing for cost optimization**: Expensive `opus` model is reserved for deep reasoning (security audits, architecture reviews). Day-to-day coding uses `sonnet`. Quick lookups use `haiku`.

4. **Structured development workflows**: Every subagent follows a 3-phase pattern:
   - Phase 1: Context gathering / analysis
   - Phase 2: Implementation / execution
   - Phase 3: Validation / delivery

5. **Inter-agent communication protocol**: JSON-based message passing with `requesting_agent`, `request_type`, `payload`, and `status` fields. This enables multi-agent coordination via the meta-orchestration subagents.

6. **Integration declarations**: Each subagent explicitly lists which other subagents it collaborates with (e.g., backend-developer receives specs from api-designer, provides endpoints to frontend-developer).

### 3.8 Integration Into Another System

1. **Parse subagent definitions**: Read the `.md` files, extract YAML frontmatter + body text to create agent configs in your system
2. **Adopt the format**: Use the `name/description/tools/model` schema as a universal agent definition format
3. **Category taxonomy**: Use the 10-category system as a framework for organizing your own agent library
4. **Communication protocol**: Implement the JSON-based inter-agent message passing in your orchestration layer
5. **Tool permission model**: Map the Claude Code tool set (`Read, Write, Edit, Bash, Glob, Grep, WebFetch, WebSearch`) to your own tool/capability system
6. **Model routing**: Implement tiered model selection (powerful/standard/fast) based on task complexity

---

## Cross-Repo Comparison

| Dimension | vllm-omni | awesome-openclaw-skills | awesome-claude-code-subagents |
|-----------|-----------|------------------------|-------------------------------|
| **Type** | Inference framework (Python library) | Skill catalog (curated links) | Agent definition library (markdown files) |
| **Core abstraction** | Pipeline stages (`StageConfig`) | Skills (SKILL.md in OpenClaw repo) | Subagents (YAML+MD files in .claude/agents/) |
| **Organization** | Per-model YAML pipelines | 28 capability categories | 10 role-based categories |
| **Runtime** | GPU-accelerated model inference | OpenClaw local agent | Claude Code IDE agent |
| **Scale** | ~25 model architectures | 5,200+ skills | 127+ subagents |
| **Distribution** | pip install + model download | ClawHub CLI / manual copy | Claude plugin marketplace / manual copy |
| **Isolation** | Physical stage disaggregation (separate GPU workers) | Skill-level capability extension | Context window isolation (separate subagent contexts) |
| **Configuration** | YAML pipeline files | SKILL.md per skill | YAML frontmatter + markdown |
| **Inter-component communication** | SharedMemory OmniConnectors | API calls to external services | JSON inter-agent protocol |
| **License** | Apache-2.0 | MIT | MIT |

### Key Architectural Insight

All three repos solve the same fundamental problem — **decomposing complex AI capabilities into composable, specialized units** — but at very different layers:

- **vllm-omni** decomposes at the **model inference layer**: A single model becomes multiple GPU-bound stages (thinker → talker → code2wav) orchestrated by a central `Orchestrator`
- **awesome-openclaw-skills** decomposes at the **capability layer**: A single agent gains thousands of specialized capabilities through skill documents
- **awesome-claude-code-subagents** decomposes at the **agent layer**: A single Claude Code session delegates to isolated sub-agents with domain expertise

The pattern is consistent: **define a unit of specialization, register it in a catalog, and let an orchestrator route work to the right specialist**.

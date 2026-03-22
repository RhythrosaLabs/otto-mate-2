# Deep Technical Research: Kilo-Org/kilocode & agentscope-ai/ReMe

---

## 1. Kilo-Org/kilocode

**17k+ stars | 890+ contributors | MIT License | TypeScript 94.9% | Fork of OpenCode**

### Architecture Overview

Kilo is a **Turborepo + Bun workspaces monorepo** built around a single core engine (`packages/opencode/`) that all client products consume via HTTP + SSE using a generated SDK (`@kilocode/sdk`).

```
┌─────────────────────────────────────────────────────┐
│                    Client Layer                      │
│  ┌──────────┐  ┌────────────┐  ┌────────┐  ┌─────┐ │
│  │ VS Code  │  │  CLI/TUI   │  │Desktop │  │ Web │ │
│  │Extension │  │  kilo run  │  │ Tauri  │  │ App │ │
│  └────┬─────┘  └─────┬──────┘  └───┬────┘  └──┬──┘ │
│       │              │              │           │    │
│       └──────────┬───┴──────────────┴───────────┘    │
│                  ▼                                    │
│         HTTP + SSE (kilo serve)                       │
│                  │                                    │
│  ┌───────────────┴───────────────────────────────┐   │
│  │          Core Engine (packages/opencode/)      │   │
│  │  ┌─────────┐ ┌────────┐ ┌──────┐ ┌────────┐  │   │
│  │  │ Session │ │ Agent  │ │ Tool │ │Provider│  │   │
│  │  │ Manager │ │ System │ │ Reg. │ │ Layer  │  │   │
│  │  └─────────┘ └────────┘ └──────┘ └────────┘  │   │
│  │  ┌─────────┐ ┌────────┐ ┌──────┐ ┌────────┐  │   │
│  │  │Permission│ │Snapshot│ │ MCP  │ │ Plugin │  │   │
│  │  │ System  │ │ System │ │Server│ │ System │  │   │
│  │  └─────────┘ └────────┘ └──────┘ └────────┘  │   │
│  └───────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

#### Key Packages

| Package | Name | Purpose |
|---------|------|---------|
| `packages/opencode/` | `@kilocode/cli` | **Core engine** — agents, tools, sessions, server, TUI. This is where most work happens. |
| `packages/sdk/js/` | `@kilocode/sdk` | Auto-generated TypeScript SDK (client for server API). Generated from server endpoints. |
| `packages/kilo-vscode/` | `kilo-code` | VS Code extension with sidebar chat + Agent Manager (multi-session orchestration with git worktree isolation). |
| `packages/kilo-gateway/` | `@kilocode/kilo-gateway` | Kilo auth, provider routing, API integration. |
| `packages/kilo-telemetry/` | `@kilocode/kilo-telemetry` | PostHog analytics + OpenTelemetry. |
| `packages/kilo-i18n/` | `@kilocode/kilo-i18n` | Internationalization / translations. |
| `packages/kilo-ui/` | `@kilocode/kilo-ui` | Shared SolidJS component library for webviews. |
| `packages/plugin/` | `@kilocode/plugin` | Plugin/tool interface definitions. |
| `packages/desktop/` | `@opencode-ai/desktop` | Standalone Tauri native app (not actively maintained). |
| `packages/app/` | `@opencode-ai/app` | Shared SolidJS frontend for desktop and `kilo web`. |

#### Client-Server Architecture

All products are **clients** of the CLI core engine:
- **VS Code Extension** — Bundles the CLI binary, spawns `kilo serve` as a child process. Includes the **Agent Manager** for multi-session orchestration with git worktree isolation.
- **CLI/TUI** — `kilo run` for single tasks, `kilo serve` for headless server, `kilo web` for browser UI.
- **Desktop** — Tauri native app, bundles CLI as sidecar.
- **Web** — SolidJS frontend served by `kilo web`.

Communication uses HTTP + SSE for real-time streaming via `@kilocode/sdk`.

---

### Core Abstractions and APIs

#### 1. Agent System (`packages/opencode/src/agent/agent.ts`)

The agent system uses a **namespace pattern** with Zod schemas for type-safe definitions. Agents are registered as named presets with different permission rulesets and tool access.

```typescript
Agent.Info = z.object({
  name: z.string(),
  description: z.string().optional(),
  mode: z.enum(["subagent", "primary", "all"]),
  permission: PermissionNext.Ruleset,
  model: z.object({ modelID: z.string(), providerID: z.string() }).optional(),
  prompt: z.string().optional(),
  temperature: z.number().optional(),
  steps: z.number().int().positive().optional(),
  // ...
})
```

**Built-in agents:**

| Agent | Mode | Description | Key Permissions |
|-------|------|-------------|-----------------|
| `code` | primary | Default agent. Executes tools based on configured permissions. | Full tool access, question + plan_enter allowed |
| `plan` | primary | Planning mode. Disallows all edit tools. | Read-only + writes to `.kilo/plans/*.md` only |
| `debug` | primary | Systematic debugging methodology. | Full tool access |
| `orchestrator` | primary | Coordinates complex tasks by delegating to specialized agents in parallel. | Read + search + `task` tool for delegation, no direct edits |
| `ask` | primary | Get answers without making changes. | Read-only: grep, glob, list, read, websearch |
| `general` | subagent | General-purpose for parallel sub-tasks. | Full tool access minus todo |
| `explore` | subagent | Fast codebase exploration. | Read-only + bash + search |
| `compaction` | primary (hidden) | Context compaction agent. | No tools (summarization only) |
| `title` | primary (hidden) | Generate session titles. | No tools |
| `summary` | primary (hidden) | Generate session summaries. | No tools |

**Custom agents** are loaded from markdown files in config directories (`{agent,agents}/**/*.md`) and from YAML `.kilocodemodes` files. Users can also generate agents via `Agent.generate()` which prompts an LLM.

#### 2. Tool System (`packages/opencode/src/tool/`)

Tools are defined via a `Tool.define()` factory that wraps execution with:
- **Zod parameter validation** with custom error formatting
- **Automatic output truncation** via `Truncate`
- **Permission gating** via `ctx.ask()` before execution

```typescript
Tool.Info<Parameters, Metadata> = {
  id: string
  init: (ctx?: InitContext) => Promise<{
    description: string
    parameters: Parameters
    execute(args, ctx: Context): Promise<{
      title: string
      metadata: Metadata
      output: string
      attachments?: FilePart[]
    }>
  }>
}
```

**Built-in tools:**

| Tool | File | Function |
|------|------|----------|
| `bash` | `bash.ts` | Terminal command execution with tree-sitter parsing for permission analysis |
| `edit` | `edit.ts` | Find-and-replace file editing with 9 fallback replacement strategies |
| `write` | `write.ts` | Create new files |
| `read` | `read.ts` | Read file contents (also handles directories) |
| `grep` | `grep.ts` | Search file contents via regex |
| `glob` | `glob.ts` | Find files by pattern |
| `ls` | `ls.ts` | List directory contents |
| `task` | `task.ts` | Spawn sub-agent tasks (for orchestrator/parallel work) |
| `batch` | `batch.ts` | Execute multiple tool calls in parallel (experimental) |
| `question` | `question.ts` | Ask the user a question |
| `apply_patch` | `apply_patch.ts` | Apply unified diff patches (used for GPT models) |
| `multiedit` | `multiedit.ts` | Multiple edits in one call |
| `webfetch` | `webfetch.ts` | Fetch web page content |
| `websearch` | `websearch.ts` | Web search via Exa API |
| `codesearch` | `codesearch.ts` | Semantic code search via Exa |
| `codebase_search` | `warpgrep.ts` | AI-powered WarpGrep codebase search (experimental) |
| `skill` | `skill.ts` | Execute stored skill files |
| `lsp` | `lsp.ts` | Language Server Protocol diagnostics (experimental) |
| `todo` | `todo.ts` | Read/write TODO lists |
| `plan` | `plan.ts` | Enter/exit plan mode |

**Tool Registry** (`registry.ts`) assembles all tools, filtering by:
- Model compatibility (GPT models get `apply_patch` instead of `edit`/`write`)
- Feature flags (`experimental.codebase_search`, `experimental.batch_tool`)
- Provider type (websearch/codesearch requires Kilo/OpenRouter or flag)

Custom tools are loaded from `{tool,tools}/*.{js,ts}` in config directories and from plugins.

#### 3. How File Editing Works

The `EditTool` implements a **cascading replacement strategy** with 9 different replacers, tried in order until one succeeds:

1. **SimpleReplacer** — Exact string match
2. **LineTrimmedReplacer** — Match after trimming whitespace from each line
3. **BlockAnchorReplacer** — Match first/last lines as anchors, fuzzy-match middle using Levenshtein distance
4. **WhitespaceNormalizedReplacer** — Collapse whitespace for matching
5. **IndentationFlexibleReplacer** — Remove common indentation before comparing
6. **EscapeNormalizedReplacer** — Handle escaped characters (`\n`, `\t`, etc.)
7. **TrimmedBoundaryReplacer** — Trim leading/trailing whitespace from find string
8. **ContextAwareReplacer** — Use first/last lines as context anchors with 50% similarity threshold
9. **MultiOccurrenceReplacer** — Yield all exact matches for `replaceAll` mode

Each replacement:
- Normalizes line endings
- Generates a unified diff (`createTwoFilesPatch`)
- Requests permission via `ctx.ask(permission: "edit")`
- Writes the file via `Filesystem.write()`
- Publishes file events (edited, watcher update) via the event bus
- Runs LSP diagnostics on the edited file and reports errors back to the agent

#### 4. How Terminal Access Works (`BashTool`)

The bash tool is the most sophisticated permission-gated tool:

1. **Command Parsing** — Uses **tree-sitter** with `tree-sitter-bash` WASM to parse the command into an AST
2. **Path Analysis** — Resolves all paths in destructive commands (`rm`, `cp`, `mv`, `mkdir`, etc.) to detect external directory access
3. **Permission Hierarchy** — Builds hierarchical permission rules (e.g., `npm`, `npm install`, `npm install lodash`) via `BashHierarchy`
4. **External Directory Check** — Any path outside the project worktree triggers an `external_directory` permission request
5. **Command Permission** — Each command pattern triggers a `bash` permission request with `always` patterns for future auto-approval
6. **Execution** — Spawns via `child_process.spawn()` with:
   - Configurable shell (detected via `Shell.acceptable()`)
   - Plugin-injected environment variables (`shell.env` hook)
   - Separate `StringDecoder` instances for stdout/stderr (handles multi-byte UTF-8)
   - Configurable timeout (default 2 minutes)
   - Process tree killing on abort/timeout
   - Metadata streaming (live output updates to UI)

#### 5. Permission System (`packages/opencode/src/permission/next.ts`)

Kilo's permission system is a **rule-based pattern matching** engine:

```typescript
Rule = { permission: string, pattern: string, action: "allow" | "deny" | "ask" }
Ruleset = Rule[]  // evaluated last-match-wins using wildcard patterns
```

**Permission resolution flow:**
1. Each tool call triggers `PermissionNext.ask()` with a permission type and pattern
2. Rules are evaluated against the agent's ruleset + globally stored approvals
3. Last matching rule wins (supports `*` wildcards via `Wildcard.match()`)
4. Actions: `allow` (proceed), `deny` (throw `DeniedError`), `ask` (prompt user)
5. User can reply: `once` (allow this call), `always` (persist rule), `reject` (halt)
6. "Always" rules persist to global config file
7. **Drain covered**: After saving rules, automatically resolves any pending permissions that are now covered

**Permission types:** `bash`, `edit`, `write`, `read`, `external_directory`, `doom_loop`, `question`, `plan_enter`, `plan_exit`, `webfetch`, `websearch`, `codesearch`, etc.

#### 6. Session System (`packages/opencode/src/session/`)

Sessions are the core orchestration unit, persisted in **SQLite** (via Drizzle ORM):

- **Session** → has many **Messages** → has many **Parts** (text, reasoning, tool calls, step markers, patches, compaction markers)
- Messages are either `user` or `assistant` type
- Parts have types: `text`, `reasoning`, `tool`, `step-start`, `step-finish`, `patch`, `compaction`, `file`

**Session Processing Loop** (`processor.ts`):
```
while (true) {
  stream = LLM.stream(input)
  for await (value of stream.fullStream) {
    switch (value.type) {
      case "reasoning-start/delta/end" → update reasoning parts
      case "tool-call" → check doom loop → execute tool → store result
      case "tool-result" → update part with output
      case "text-start/delta/end" → build text response
      case "start-step" → create snapshot
      case "finish-step" → track usage, check compaction, summarize
    }
  }
  if (needsCompaction) return "compact"
  if (blocked) return "stop"
  return "continue"
}
```

**Doom Loop Detection**: If the last 3 tool calls are identical (same tool, same input), triggers a `doom_loop` permission prompt.

#### 7. Context Compaction (`packages/opencode/src/session/compaction.ts`)

When token usage exceeds the model's context limit, Kilo:
1. Creates a `compaction` assistant message using the hidden `compaction` agent
2. Feeds all conversation history to the compaction agent
3. Agent generates a structured summary using a template:
   - `## Goal` — What the user is trying to accomplish
   - `## Instructions` — Important user instructions, plans, specs
   - `## Discoveries` — Notable learnings
   - `## Accomplished` — Completed/in-progress/remaining work
   - `## Relevant files / directories` — Structured file list
4. Marks the summary message with `summary: true`
5. **Prune optimization**: Goes backwards through parts, skips the last 40K tokens of tool calls, erases output from older completed tool calls

**Auto-continue**: After compaction, automatically sends "Continue if you have next steps" to resume work.

#### 8. Snapshot System

Before each LLM step, `Snapshot.track()` captures the git state. After the step, `Snapshot.patch()` generates a diff of files changed. This enables:
- File change tracking per step
- Revert to any step's snapshot
- Session-level diff summaries (additions/deletions/files)

#### 9. Plugin System

Plugins can:
- Register custom tools via `ToolDefinition` interface
- Hook into events: `experimental.chat.system.transform`, `experimental.text.complete`, `experimental.session.compacting`
- Inject shell environment variables (`shell.env`)
- Transform tool definitions (`tool.definition`)

---

### Key Design Decisions

1. **Fork architecture**: Kilo is a fork of OpenCode. All Kilo-specific changes are marked with `// kilocode_change` comments for easy upstream merge conflict resolution. Kilo-only code lives in `packages/opencode/src/kilocode/`.

2. **Server-first**: All products are thin clients over HTTP+SSE. This allows the same agent engine to power CLI, VS Code, desktop, and web interfaces.

3. **Pattern-based permissions**: Instead of simple allow/deny per tool, uses wildcard pattern matching on both permission types and specific patterns (file paths, command strings). Last-match-wins semantics allow layered overrides.

4. **Cascading edit strategies**: Rather than requiring exact string matches, the edit tool tries 9 progressively fuzzier matching strategies. This dramatically improves LLM edit success rates.

5. **Tree-sitter for bash analysis**: Parsing bash commands into ASTs enables fine-grained permission control — separate rules for `npm install`, `npm install lodash`, `rm -rf /`, etc.

6. **Bun runtime**: Uses Bun for speed — both as the build system (Turborepo) and runtime. Bun-specific APIs like `Bun.file()` and `$` shell are used throughout.

7. **Model-adaptive tooling**: GPT models get `apply_patch` tool (unified diff format), while Claude/Gemini get `edit`/`write` (find-and-replace). This adapts to each model family's strengths.

8. **SQLite for persistence**: Sessions, messages, parts all stored in SQLite via Drizzle ORM. Fast, single-file, works everywhere.

---

## 2. agentscope-ai/ReMe

**2.4k stars | 13 contributors | Apache-2.0 License | Python 100% | Built on AgentScope**

### Architecture Overview

ReMe is a **dual-system memory framework** with two independent but complementary memory systems:

```
┌──────────────────────────────────────────────────────────┐
│                         ReMe                              │
│                                                           │
│  ┌─────────────────────────┐  ┌─────────────────────────┐│
│  │  ReMeLight (File-Based) │  │   ReMe (Vector-Based)   ││
│  │                         │  │                          ││
│  │  ┌──────────────────┐   │  │  ┌───────────────────┐  ││
│  │  │  ContextChecker  │   │  │  │  ReMeSummarizer   │  ││
│  │  │  (token counting)│   │  │  │  (delegation hub)  │  ││
│  │  └──────────────────┘   │  │  └────────┬──────────┘  ││
│  │  ┌──────────────────┐   │  │           │              ││
│  │  │   Compactor      │   │  │  ┌────────┴──────────┐  ││
│  │  │  (ReAct summary) │   │  │  │    DelegateTask   │  ││
│  │  └──────────────────┘   │  │  └─┬──────┬────────┬─┘  ││
│  │  ┌──────────────────┐   │  │    │      │        │     ││
│  │  │   Summarizer     │   │  │    ▼      ▼        ▼     ││
│  │  │  (ReAct + files) │   │  │ Personal Procedural Tool ││
│  │  └──────────────────┘   │  │ Summarizer Summarizer Sum.││
│  │  ┌──────────────────┐   │  │    │      │        │     ││
│  │  │ToolResultCompact │   │  │    ▼      ▼        ▼     ││
│  │  │ (truncation)     │   │  │ ┌──────────────────────┐ ││
│  │  └──────────────────┘   │  │ │    Vector Store      │ ││
│  │  ┌──────────────────┐   │  │ │ (local/chroma/qdrant)│ ││
│  │  │  MemorySearch    │   │  │ └──────────────────────┘ ││
│  │  │ (vector + BM25)  │   │  │                          ││
│  │  └──────────────────┘   │  │  ┌───────────────────┐  ││
│  │  ┌──────────────────┐   │  │  │  ReMeRetriever    │  ││
│  │  │ReMeInMemoryMemory│   │  │  │  (multi-type)     │  ││
│  │  │ (session memory) │   │  │  └───────────────────┘  ││
│  │  └──────────────────┘   │  │                          ││
│  └─────────────────────────┘  └─────────────────────────┘│
│                                                           │
│  ┌───────────────────────────────────────────────────────┐│
│  │              Core Application Layer                    ││
│  │  ServiceContext │ RegistryFactory │ ConfigParser       ││
│  │  LLMs │ EmbeddingModels │ VectorStores │ FileStores   ││
│  │  FileWatchers │ TokenCounters │ MCP Servers            ││
│  └───────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────┘
```

### File System Layout

```
working_dir/
├── MEMORY.md              # Long-term memory: persistent info (user preferences, etc.)
├── memory/
│   └── YYYY-MM-DD.md      # Daily journal: auto-written after each conversation
├── dialog/
│   └── YYYY-MM-DD.jsonl   # Raw conversation records (full dialog before compression)
└── tool_result/
    └── <uuid>.txt          # Cache for long tool outputs (auto-managed, expired auto-cleaned)
```

---

### Core Abstractions and APIs

#### 1. Application Layer (`reme/core/application.py`)

The `Application` class is the root orchestrator. It uses a **registry-based dependency injection** pattern:

```python
class Application:
    def __init__(self, ...):
        self.service_context = ServiceContext(...)
        self.init_flows()

    async def start(self):
        # Initialize all registered components in order:
        # as_llms → as_llm_formatters → as_token_counters → llms →
        # embedding_models → token_counters → vector_stores →
        # file_stores → file_watchers → mcp_servers
```

**RegistryFactory** (`R`) is a global registry where backends register themselves:
- `R.as_llms` — AgentScope LLM backends
- `R.embedding_models` — Embedding model backends
- `R.vector_stores` — Vector store backends (local, Chroma, Qdrant, Elasticsearch)
- `R.file_stores` — File store backends (with FTS and vector indexing)
- `R.file_watchers` — File change watchers
- `R.flows` — Processing flows
- `R.services` — Service backends (HTTP, MCP, CMD)

**ServiceContext** holds all initialized instances and is passed through the system:
```python
class ServiceContext:
    as_llms: dict[str, AgentScope LLM]
    embedding_models: dict[str, BaseEmbeddingModel]
    vector_stores: dict[str, BaseVectorStore]
    file_stores: dict[str, BaseFileStore]
    file_watchers: dict[str, BaseFileWatcher]
    token_counters: dict[str, BaseTokenCounter]
    flows: dict[str, BaseFlow]
    memory_target_type_mapping: dict[str, MemoryType]
```

#### 2. ReMeLight — File-Based Memory System (`reme/reme_light.py`)

ReMeLight is the **pragmatic, file-centric** memory system. Its philosophy: **"Memory as files, files as memory"** — readable, editable, and copyable.

##### Core Components:

**a) ContextChecker** (`context_checker.py`)
- Token-counts messages using `HuggingFaceTokenCounter`
- Splits messages into "to compact" (older) and "to keep" (recent) groups
- Respects `memory_compact_reserve` to keep recent messages
- **Integrity guarantee**: Never splits user-assistant turns or tool_use/tool_result pairs

**b) Compactor** (`compactor.py`)
- Uses a **ReActAgent** (from AgentScope) to generate structured summaries
- Produces **context checkpoints** with sections:
  - `## Goal` — User goals
  - `## Constraints` — Constraints and preferences
  - `## Progress` — Task progress
  - `## Key Decisions` — Key decisions
  - `## Next Steps` — Next step plans
  - `## Critical Context` — File paths, function names, error messages
- Supports **incremental updates**: When `previous_summary` is provided, merges new conversations into existing summary
- Token counting before/after for logging compression ratios

**c) Summarizer** (`summarizer.py`)
- Uses **ReAct + file tools** pattern — the AI agent decides what to write and where
- Has access to `FileIO` tools: `read`, `write`, `edit`
- Writes to `memory/YYYY-MM-DD.md` files
- Can update existing `MEMORY.md` with long-term persistent information
- Runs **asynchronously** in the background during conversation

**d) ToolResultCompactor** (`tool_result_compactor.py`)
- Addresses context bloat from large tool outputs
- Two thresholds: `old_threshold` (500 chars) for old messages, `recent_threshold` (30K chars) for recent
- Truncates large outputs in-place, saves full content to `tool_result/<uuid>.txt`
- Auto-cleanup: Expired files (older than `retention_days`) deleted during `start`/`close`/`compact_tool_result`

**e) MemorySearch** (`memory_search.py`)
- **Hybrid retrieval**: Vector similarity (weight 0.7) + BM25 keyword search (weight 0.3)
- Searches across `MEMORY.md` and `memory/*.md` files
- Uses `file_store.hybrid_search()` with configurable `candidate_multiplier` (3.0x)
- Results filtered by `min_score` threshold
- Returns JSON with file paths, line numbers, scores

**f) ReMeInMemoryMemory** (`reme_in_memory_memory.py`)
- Extends AgentScope's `InMemoryMemory`
- Token-aware memory management with `estimate_tokens()`
- Key methods:
  - `get_memory()` — Filter messages by compression mark, auto-append summary
  - `mark_messages_compressed()` — Mark messages and persist to `dialog/YYYY-MM-DD.jsonl`
  - `clear_content()` — Persist all messages before clearing
  - `state_dict()`/`load_state_dict()` — Serialize/deserialize for session persistence

##### Pre-Reasoning Hook

The `pre_reasoning_hook()` is the **unified entry point** called before each reasoning step:

```python
async def pre_reasoning_hook(self, messages, system_prompt, compressed_summary, ...):
    # 1. Compact tool results (truncate large outputs)
    await self.compact_tool_result(compact_msgs)
    
    # 2. Check context size
    messages_to_compact, messages_to_keep, is_valid = await self.check_context(
        messages, memory_compact_threshold=left_compact_threshold
    )
    
    # 3. If compaction needed:
    if messages_to_compact:
        # 3a. Launch async summary task (background, writes to memory/ files)
        self.add_async_summary_task(messages_to_compact, ...)
        
        # 3b. Generate compact summary (synchronous, returns checkpoint text)
        compressed_summary = await self.compact_memory(messages_to_compact, ...)
    
    return messages_to_keep, compressed_summary
```

#### 3. ReMe — Vector-Based Memory System (`reme/reme.py`)

The vector-based system manages **three types of memory**, each with specialized agents:

| Memory Type | Purpose | Agent Pair |
|-------------|---------|------------|
| **Personal** | User preferences, habits, background | `PersonalSummarizer` + `PersonalRetriever` |
| **Procedural** | Task execution patterns, success/failure experience | `ProceduralSummarizer` + `ProceduralRetriever` |
| **Tool** | Tool usage experience, parameter tuning | `ToolSummarizer` + `ToolRetriever` |

##### Memory Architecture (Vector-Based):

**Summarization Pipeline:**
```
Messages → ReMeSummarizer
              │
              ├─ DelegateTask → PersonalSummarizer
              │                    ├─ AddDraftAndRetrieveSimilarMemory (find duplicates)
              │                    ├─ AddMemory (store new memories)
              │                    ├─ ReadAllProfiles (optional)
              │                    └─ UpdateProfilesV1 (optional)
              │
              ├─ DelegateTask → ProceduralSummarizer
              │                    └─ AddMemory
              │
              └─ DelegateTask → ToolSummarizer
                                   └─ AddMemory
```

**Retrieval Pipeline:**
```
Query → ReMeRetriever
           │
           ├─ DelegateTask → PersonalRetriever
           │                    ├─ ReadAllProfiles (optional)
           │                    ├─ RetrieveMemory (vector search)
           │                    └─ ReadHistory (conversation history)
           │
           ├─ DelegateTask → ProceduralRetriever
           │                    ├─ RetrieveMemory
           │                    └─ ReadHistory
           │
           └─ DelegateTask → ToolRetriever
                                ├─ RetrieveMemory
                                └─ ReadHistory
```

##### Core Vector Operations:

```python
class ReMe(Application):
    # Target resolution: exactly one of user_name/task_name/tool_name must be specified
    def _resolve_memory_target(user_name, task_name, tool_name) -> (MemoryType, target)
    
    # CRUD operations via MemoryHandler (wraps vector store)
    async def add_memory(memory_content, user_name="", task_name="", tool_name="")
    async def get_memory(memory_id)
    async def update_memory(memory_id, memory_content, ...)
    async def delete_memory(memory_id)
    async def list_memory(user_name="", task_name="", tool_name="", filters, limit, sort_key)
    
    # Agent-powered operations
    async def summarize_memory(messages, user_name, task_name, tool_name)
    async def retrieve_memory(query, user_name, task_name, tool_name)
```

**MemoryNode** schema:
```python
class MemoryNode:
    memory_id: str
    memory_content: str
    when_to_use: str       # Context hint for retrieval
    memory_type: MemoryType
    memory_target: str     # user/task/tool name
    time_created: str
    author: str
    score: float
    ref_memory_id: str     # Link to related memory
```

##### Profile System

Optional **profile** support for personal memory:
- `ProfileHandler` manages per-user profile files in `profile/` directory
- `ReadAllProfiles` tool reads user profiles
- `UpdateProfilesV1` tool updates profiles based on conversation
- Provides structured user preference tracking beyond vector memories

---

### How Memory Works: Storage, Retrieval, Compression

#### Storage

**File-Based (ReMeLight):**
- `MEMORY.md` — Agent-editable long-term memory file
- `memory/YYYY-MM-DD.md` — Daily journals written by Summarizer agent
- `dialog/YYYY-MM-DD.jsonl` — Raw conversation logs (one JSON message per line)
- `tool_result/<uuid>.txt` — Cached large tool outputs
- All indexed by `FileStore` for hybrid search

**Vector-Based (ReMe):**
- Vector store backends: local (FAISS-like), Chroma, Qdrant, Elasticsearch
- Each memory stored as `MemoryNode` with embedding + metadata
- Namespaced by `memory_target` (user name, task name, or tool name)

#### Retrieval

**File-Based:**
- `memory_search()` uses `file_store.hybrid_search()`:
  - **Vector search** (weight 0.7): Embed query → cosine similarity on file chunks
  - **BM25 search** (weight 0.3): Keyword/term frequency matching
  - **Fusion**: Weighted combination, `candidate_multiplier=3.0` for over-fetching before re-ranking
  - Results include file path + line numbers for precise reference

**Vector-Based:**
- `retrieve_memory()` uses ReAct agents that call `RetrieveMemory` tool
- Supports time-based filtering (`enable_time_filter`)
- Agents can also call `ReadHistory` to access raw conversation logs
- Multi-type retrieval: Personal + Procedural + Tool memories searched in parallel via `DelegateTask`

#### Compression

**Context Compaction (pre_reasoning_hook):**
1. **Tool result compaction**: Truncate outputs > threshold, save full content to files
2. **Context checking**: Token-count all messages, split at threshold preserving conversation integrity
3. **Compact memory**: ReAct agent generates structured "context checkpoint" summary
4. **Summary memory**: Background async task writes detailed journal to `memory/` files

**Compression results:** Test logs show 223,838 tokens → 1,105 tokens (99.5% compression).

---

### Integration Patterns

#### Using ReMeLight with an Agent

```python
reme = ReMeLight(default_as_llm_config={"model_name": "qwen3.5-35b-a3b"})
await reme.start()

# Before each reasoning step:
messages, summary = await reme.pre_reasoning_hook(
    messages=messages,
    system_prompt="...",
    compressed_summary=previous_summary,
    max_input_length=128000,
    compact_ratio=0.7,
)

# Search past memories:
result = await reme.memory_search(query="user preference for Python version")

# Use in-session memory:
memory = reme.get_in_memory_memory()
await memory.add(msg)
```

#### Using ReMe Vector Memory

```python
reme = ReMe(
    default_vector_store_config={"backend": "local"},
    default_embedding_model_config={"model_name": "text-embedding-v4"},
)
await reme.start()

# After conversation: extract and store memories
await reme.summarize_memory(messages, user_name="alice")

# Before responding: retrieve relevant memories
memories = await reme.retrieve_memory(query="Python preferences", user_name="alice")
```

#### CoPaw Integration

CoPaw (a coding agent framework) inherits from `ReMeLight` via `MemoryManager`, demonstrating the primary intended integration:
```python
class MemoryManager(ReMeLight):
    # Integrates memory capabilities into agent reasoning loop
    # Calls pre_reasoning_hook before each LLM call
```

---

### Key Design Decisions

1. **"Memory as files" philosophy**: File-based memory uses readable Markdown files instead of opaque databases. This means memories are human-readable, directly editable, and trivially portable (just copy the directory).

2. **Dual memory systems**: ReMeLight handles **session-level** context management (compaction, tool result truncation), while ReMe handles **cross-session** memory (user preferences, task experience). They can be used independently or together.

3. **ReAct agent-driven memory operations**: Both the Compactor and Summarizer are themselves ReAct agents. The Summarizer uses file tools to decide what to write and where — it's not a rigid template but an AI-driven decision.

4. **Async background summarization**: Summary tasks run asynchronously via `asyncio.Task`, so memory persistence doesn't block the main conversation flow. `await_summary_tasks()` is called at shutdown.

5. **Three memory types with delegation**: The vector system separates Personal, Procedural, and Tool memories, each with specialized summarizer/retriever agents. A top-level `ReMeSummarizer`/`ReMeRetriever` delegates to the appropriate specialist via `DelegateTask`.

6. **Hybrid search scoring**: 70% vector + 30% BM25 balances semantic understanding with exact keyword matching. The `candidate_multiplier=3.0` over-fetches candidates before applying the fusion scoring.

7. **Built on AgentScope**: All agents use AgentScope's `ReActAgent`, formatters, and message types. This makes ReMe compatible with the broader AgentScope ecosystem.

8. **Token-aware everything**: Token counting is deeply integrated — context checking, compaction thresholds, memory estimation, and the pre-reasoning hook all operate in token space. Uses `HuggingFaceTokenCounter` (rule-based) for fast local counting.

9. **Conversation integrity preservation**: The `ContextChecker` never splits user-assistant turns or tool_use/tool_result pairs — this prevents broken context that would confuse the LLM.

10. **Auto-cleanup lifecycle**: Tool result files are cleaned up during `start()`, `close()`, and `compact_tool_result()`. Embedding caches are persisted on close. File watchers keep indexes in sync.

---

## Comparison Summary

| Dimension | Kilo | ReMe |
|-----------|------|------|
| **Language** | TypeScript (94.9%) | Python (100%) |
| **Primary use case** | Coding agent (IDE/CLI) | Memory management for any agent |
| **Architecture** | Monorepo with client-server | Library with dual memory systems |
| **Memory model** | Session-based (SQLite) + compaction | File-based + Vector-based cross-session |
| **Compaction strategy** | LLM summarization with template | ReAct agent with structured checkpoints |
| **Tool system** | 20+ built-in tools with cascading edit strategies | FileIO (read/write/edit) + memory search |
| **Permission model** | Fine-grained pattern-matching rulesets | N/A (library, not an agent) |
| **LLM integration** | Vercel AI SDK (`ai` package) | AgentScope + direct API |
| **Persistence** | SQLite (Drizzle ORM) | Files (Markdown, JSONL) + Vector stores |
| **Search** | Grep, glob, LSP, semantic (Exa/WarpGrep) | Hybrid vector + BM25 |
| **Key innovation** | 9-strategy cascading edit, tree-sitter bash parsing | Dual file/vector memory with ReAct-driven persistence |
| **Scale** | 25T+ tokens processed, 1.5M+ users | SOTA on LoCoMo (86.23) and HaluMem (88.78) benchmarks |

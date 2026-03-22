# Deep Technical Research: Steel Browser & Stagehand

---

## 1. steel-dev/steel-browser

**"Open Source Browser API for AI Agents & Apps"**  
Stars: 6.7k | License: Apache 2.0 | Language: TypeScript (85%)

### Architecture Overview

Steel is a **server-side browser infrastructure** — a Fastify HTTP/WebSocket API that manages Chrome instances via Puppeteer and CDP (Chrome DevTools Protocol). It is purpose-built as the **browser backend** for AI agents, not an AI framework itself. It provides the raw browser sandbox that AI tools connect to.

```
┌─────────────────────────────────────────────────┐
│                  Docker Container                │
│                                                  │
│  ┌──────────┐   ┌─────────────────────────────┐ │
│  │  nginx   │──▸│     Fastify API Server       │ │
│  │ (proxy)  │   │        (port 3000)           │ │
│  └──────────┘   │                               │ │
│                  │  steel-browser-plugin         │ │
│                  │  ┌─────────────────────────┐ │ │
│                  │  │  CDPService             │ │ │
│                  │  │  (Puppeteer-core)       │ │ │
│                  │  │  ┌───────────────────┐  │ │ │
│                  │  │  │  Chrome Process    │  │ │ │
│                  │  │  │  (headless/headed) │  │ │ │
│                  │  │  └───────────────────┘  │ │ │
│                  │  ├─────────────────────────┤ │ │
│                  │  │  SessionService         │ │ │
│                  │  │  SeleniumService        │ │ │
│                  │  │  FileService            │ │ │
│                  │  │  WebSocketRegistry      │ │ │
│                  │  │  PluginManager          │ │ │
│                  │  └─────────────────────────┘ │ │
│                  │                               │ │
│                  │  Routes: /v1/sessions         │ │
│                  │          /v1/scrape           │ │
│                  │          /v1/screenshot       │ │
│                  │          /v1/pdf              │ │
│                  │          /v1/search           │ │
│                  │          /v1/logs             │ │
│                  └─────────────────────────────┘ │
│  ┌─────────┐                                     │
│  │  UI     │  (React/Vite on port 5173)          │
│  └─────────┘                                     │
└─────────────────────────────────────────────────┘
```

### Package Structure

```
steel-browser/
├── api/                          # Core API server (Fastify)
│   ├── src/
│   │   ├── index.ts             # Server entrypoint (Fastify setup)
│   │   ├── routes.ts            # Route barrel exports
│   │   ├── steel-browser-plugin.ts  # Main Fastify plugin (registers everything)
│   │   ├── config.ts            # Logging configuration
│   │   ├── env.ts               # Environment variable parsing
│   │   ├── modules/             # Route handlers organized by domain
│   │   │   ├── actions/         # /v1/scrape, /v1/screenshot, /v1/pdf, /v1/search
│   │   │   ├── sessions/        # /v1/sessions CRUD + debug viewer
│   │   │   ├── cdp/             # /v1/cdp WebSocket proxy
│   │   │   ├── files/           # /v1/files upload/download
│   │   │   ├── logs/            # /v1/logs query interface
│   │   │   └── selenium/        # Selenium WebDriver protocol compat
│   │   ├── services/            # Core business logic
│   │   │   ├── cdp/             # CDPService — the heart of the system
│   │   │   │   ├── cdp.service.ts       # Chrome lifecycle, fingerprinting, proxying
│   │   │   │   ├── instrumentation/     # Request/network logging via CDP
│   │   │   │   ├── plugins/             # Plugin system for CDP hooks
│   │   │   │   ├── errors/              # Categorized launch error types
│   │   │   │   └── utils/               # Config validation, error handlers
│   │   │   ├── context/         # Chrome session data (cookies, localStorage, etc.)
│   │   │   ├── session.service.ts       # Session lifecycle management
│   │   │   ├── selenium.service.ts      # Selenium adapter
│   │   │   ├── file.service.ts          # File storage for downloads/uploads
│   │   │   └── websocket-registry.service.ts
│   │   ├── plugins/             # Fastify plugin wiring
│   │   │   ├── browser.ts              # CDPService instantiation + DuckDB logging
│   │   │   ├── browser-session.ts      # SessionService instantiation
│   │   │   ├── browser-socket/         # WebSocket upgrade handling
│   │   │   ├── selenium.ts             # Selenium service wiring
│   │   │   ├── file-storage.ts         # File service setup
│   │   │   └── schemas.ts              # OpenAPI schema definitions
│   │   ├── types/               # TypeScript interfaces
│   │   ├── utils/               # Browser path detection, proxy, request filtering
│   │   ├── scripts/             # Fingerprint injection scripts
│   │   └── templates/           # EJS templates for debug viewer
│   ├── extensions/recorder/     # Chrome extension for session recording
│   ├── selenium/                # Selenium WebDriver server
│   └── openapi/                 # OpenAPI spec
├── ui/                          # React dashboard for viewing/debugging sessions
├── repl/                        # Interactive REPL for testing
├── Dockerfile                   # Combined Docker image
├── docker-compose.yml           # Production compose
└── nginx.conf                   # Reverse proxy config
```

### Core Abstractions

#### 1. `CDPService` (The Heart)
**File**: `api/src/services/cdp/cdp.service.ts`

The central class managing the Chrome browser lifecycle. It extends `EventEmitter` and wraps `puppeteer-core`.

```typescript
class CDPService extends EventEmitter {
  // Core state
  private browserInstance: Browser | null;
  private wsEndpoint: string | null;
  private fingerprintData: BrowserFingerprintWithHeaders | null;
  private primaryPage: Page | null;
  private pluginManager: PluginManager;
  private targetInstrumentationManager: TargetInstrumentationManager;
  
  // Key methods
  launch(config?: BrowserLauncherOptions): Promise<Browser>;
  shutdown(): Promise<void>;
  startNewSession(sessionConfig: BrowserLauncherOptions): Promise<Browser>;
  endSession(): Promise<void>;
  proxyWebSocket(req, socket, head): Promise<void>;
  getBrowserState(): Promise<SessionData>;
  createPage(): Promise<Page>;
  getCookies(): Promise<Cookie[]>;
}
```

**Key behaviors**:
- Launches Chrome with extensive anti-detection flags (~50 Chrome args)
- Generates browser fingerprints via `fingerprint-generator` and injects them via CDP
- Manages a proxy server chain for WebSocket proxying
- Implements browser instance reuse (`isSimilarConfig` check) — avoids re-launching if config is compatible
- Has a full plugin system (`PluginManager`) with lifecycle hooks: `onBrowserLaunch`, `onBrowserReady`, `onPageCreated`, `onPageNavigate`, `onBrowserClose`, `onShutdown`, `onSessionEnd`
- Request interception for ad blocking, resource optimization (block images/media/stylesheets), and host blocking
- Fingerprint injection via both `FingerprintInjector` library and a custom safer method using CDP commands directly

#### 2. `SessionService`
**File**: `api/src/services/session.service.ts`

Manages browser session lifecycle as a stateful service. **Importantly, Steel runs ONE active session at a time** — this is a single-tenant model.

```typescript
class SessionService {
  public activeSession: Session;
  public pastSessions: Session[];
  
  startSession(options: SessionOptions): Promise<SessionDetails>;
  endSession(): Promise<SessionDetails>;
}
```

**Session options include**: proxy URL, user agent, session context (cookies/localStorage/sessionStorage), extensions, fingerprint, timezone, dimensions, ad blocking, bandwidth optimization, Selenium mode, headless mode, credentials, and user preferences.

#### 3. `SteelBrowserPlugin` (Fastify Plugin)
**File**: `api/src/steel-browser-plugin.ts`

The main Fastify plugin that wires everything together. It follows the **Fastify plugin pattern**: decorates the server with services, registers sub-plugins for browser instance management, WebSocket handling, file storage, Selenium support, and mounts all routes.

```typescript
interface SteelBrowserConfig {
  fileStorage?: { maxSizePerSession?: number };
  customWsHandlers?: WebSocketHandler[];
  logging?: {
    enableStorage?: boolean;
    storagePath?: string;
    enableConsoleLogging?: boolean;
    enableLogsRoutes?: boolean;
  };
}
```

### How Browser Sessions Work

1. **Cold start**: On server boot, `CDPService.launch()` is called automatically via the `onListen` Fastify hook, starting a default Chrome instance
2. **Session creation** (`POST /v1/sessions`): Calls `SessionService.startSession()` → which calls `CDPService.startNewSession()` → which shuts down the existing browser and launches a new one with the requested config
3. **Client connects**: After session creation, the client receives a WebSocket URL and connects via Playwright/Puppeteer/Selenium using the CDP WebSocket
4. **WebSocket proxying**: `CDPService.proxyWebSocket()` uses `http-proxy` to forward client CDP messages to the actual Chrome DevTools WebSocket
5. **Session end** (`POST /v1/sessions/:id/release`): Dumps browser state (cookies, localStorage, sessionStorage, IndexedDB), shuts down the session browser, and relaunches a default idle browser

### Session Context Persistence

Steel captures and restores full browser state:
- **Cookies** via `Network.getAllCookies` / `Network.setCookies`
- **localStorage/sessionStorage** via CDP page evaluation
- **IndexedDB** via CDP evaluation
- **Chrome LevelDB files** via `ChromeContextService` (direct file parsing from `userDataDir`)

### AI Integration

**Steel itself has NO AI/LLM integration.** It is purely browser infrastructure. The AI happens in the client/consumer code. Steel provides:
- Clean APIs for Puppeteer/Playwright/Selenium to connect
- Python and Node SDKs (`steel-sdk`) that wrap the REST API
- Page-to-markdown conversion (`/v1/scrape`) for LLM consumption
- Screenshot/PDF generation for vision models

### Anti-Detection & Fingerprinting

This is a major differentiator. Steel implements:
1. **Fingerprint generation** via `fingerprint-generator` (realistic browser/device/OS fingerprint profiles)
2. **Fingerprint injection** via custom CDP commands (`Page.setDeviceMetricsOverride`, `Emulation.setUserAgentOverride`) plus evaluating scripts that override `navigator`, `WebGL`, `AudioContext`, `deviceMemory`, etc.
3. **Anti-automation stealth**: Extensive Chrome flags to disable automation signals (`--disable-blink-features=AutomationControlled`, hiding `navigator.webdriver`, etc.)
4. **Proxy chain management**: Built-in `ProxyServer` class for IP rotation with tx/rx byte tracking

### Key Design Patterns

1. **Single-tenant sessions**: Only one active browser session at a time (simplifies resource management)
2. **Plugin architecture**: `PluginManager` with `BasePlugin` abstract class — hooks into browser lifecycle
3. **Fastify plugin composition**: Everything is a Fastify plugin, registered in order (browser → selenium → session → routes)
4. **Retry with categorized errors**: `RetryManager` with typed error classes (`LaunchTimeoutError`, `BrowserProcessError`, `FingerprintError`, `NetworkError`, etc.)
5. **Three-tier error handling**: `executeCritical` (must succeed), `executeBestEffort` (log and continue), `executeOptional` (ignore failures)
6. **Log storage**: DuckDB for production log storage, in-memory for development; network instrumentation via Chrome's Network domain
7. **WebSocket proxy**: `http-proxy` for transparent CDP WebSocket forwarding

### SDK Pattern

```typescript
// Node SDK
import Steel from 'steel-sdk';
const client = new Steel({ baseURL: "http://localhost:3000" });
const session = await client.sessions.create({ blockAds: true });
// Then connect with Playwright/Puppeteer using the session's WebSocket URL
```

### What Makes Steel Unique
- **Infrastructure-only**: Doesn't try to be an AI framework — just the browser backend
- **Full browser state capture/restore**: Cookie, localStorage, sessionStorage, IndexedDB persistence
- **Production-grade anti-detection**: Fingerprinting, stealth, proxy chains
- **Multi-protocol**: CDP (Puppeteer/Playwright) and Selenium WebDriver support
- **Self-hostable**: Docker image, Railway/Render 1-click deploy
- **Debug tools**: Built-in session viewer UI, request logging with DuckDB storage

---

## 2. browserbase/stagehand

**"The AI Browser Automation Framework"**  
Stars: 21.7k | License: MIT | Language: TypeScript (76%)

### Architecture Overview

Stagehand is an **AI-powered browser automation framework** that sits on top of CDP (Chrome DevTools Protocol). Unlike Steel (which is infrastructure), Stagehand IS the AI layer — it uses LLMs to interpret natural language instructions and translate them into precise browser actions. It manages its own CDP connections (either to local Chrome or to Browserbase's hosted browser service).

```
┌──────────────────────────────────────────────────────────────┐
│                         Stagehand V3                          │
│                                                               │
│  ┌─────────────────────────────────┐                         │
│  │       V3 (main orchestrator)    │                         │
│  │  ┌──────────┐ ┌──────────────┐  │                         │
│  │  │ ActHandler│ │ExtractHandler│  │                         │
│  │  └──────────┘ └──────────────┘  │                         │
│  │  ┌──────────────┐ ┌──────────┐  │                         │
│  │  │ObserveHandler │ │AgentHandler│ │                         │
│  │  └──────────────┘ └──────────┘  │                         │
│  │  ┌──────────────┐               │                         │
│  │  │   ActCache   │  AgentCache   │                         │
│  │  └──────────────┘               │                         │
│  └─────────────┬───────────────────┘                         │
│                │                                              │
│  ┌─────────────▼───────────────────┐                         │
│  │          LLMProvider            │                         │
│  │  ┌────────┐ ┌────────────────┐  │                         │
│  │  │OpenAI  │ │Anthropic       │  │                         │
│  │  │Client  │ │Client          │  │                         │
│  │  └────────┘ └────────────────┘  │                         │
│  │  ┌────────┐ ┌────────┐         │                         │
│  │  │Google  │ │AI SDK  │ ...     │                         │
│  │  │Client  │ │Client  │         │                         │
│  │  └────────┘ └────────┘         │                         │
│  └─────────────────────────────────┘                         │
│                                                               │
│  ┌─────────────────────────────────┐                         │
│  │         V3Context (CDP)         │                         │
│  │  ┌──────────────┐              │                         │
│  │  │  CdpConnection│              │                         │
│  │  └───────┬──────┘              │                         │
│  │          │                      │                         │
│  │  ┌───────▼──────┐              │                         │
│  │  │   Page(s)    │ FrameRegistry│                         │
│  │  └──────────────┘              │                         │
│  └─────────────────────────────────┘                         │
│                                                               │
│  Launch Target:                                               │
│  ┌──────────────┐  OR  ┌───────────────────┐                │
│  │ Local Chrome  │      │ Browserbase Cloud │                │
│  │ (chrome-launcher)    │ (hosted browsers) │                │
│  └──────────────┘      └───────────────────┘                │
└──────────────────────────────────────────────────────────────┘
```

### Package Structure (Monorepo)

```
stagehand/                           # Turborepo monorepo
├── packages/
│   ├── core/                       # Main SDK (@browserbasehq/stagehand)
│   │   ├── lib/
│   │   │   ├── v3/                 # V3 implementation (current)
│   │   │   │   ├── v3.ts          # V3 class — main orchestrator
│   │   │   │   ├── index.ts       # Public API exports
│   │   │   │   ├── api.ts         # StagehandAPIClient for server-side mode
│   │   │   │   ├── handlers/      # Core operation handlers
│   │   │   │   │   ├── actHandler.ts       # act() implementation
│   │   │   │   │   ├── extractHandler.ts   # extract() implementation
│   │   │   │   │   ├── observeHandler.ts   # observe() implementation
│   │   │   │   │   ├── v3AgentHandler.ts   # agent() AISDK tool-mode
│   │   │   │   │   └── v3CuaAgentHandler.ts # agent() CUA (Computer Use Agent) mode
│   │   │   │   ├── agent/         # Agent system
│   │   │   │   │   ├── AgentProvider.ts    # Agent client factory
│   │   │   │   │   ├── AgentClient.ts      # Abstract agent base
│   │   │   │   │   ├── OpenAICUAClient.ts  # OpenAI computer-use
│   │   │   │   │   ├── AnthropicCUAClient.ts # Anthropic computer-use
│   │   │   │   │   ├── GoogleCUAClient.ts  # Google Gemini computer-use
│   │   │   │   │   ├── MicrosoftCUAClient.ts # Microsoft Fara
│   │   │   │   │   └── tools/              # Agent tool definitions
│   │   │   │   ├── llm/           # LLM client layer
│   │   │   │   │   ├── LLMClient.ts        # Abstract LLM client
│   │   │   │   │   ├── LLMProvider.ts       # Provider factory + AI SDK integration
│   │   │   │   │   ├── OpenAIClient.ts
│   │   │   │   │   ├── AnthropicClient.ts
│   │   │   │   │   ├── GoogleClient.ts
│   │   │   │   │   ├── GroqClient.ts
│   │   │   │   │   ├── CerebrasClient.ts
│   │   │   │   │   └── aisdk.ts            # Vercel AI SDK unified client
│   │   │   │   ├── understudy/    # CDP wrapper / "browser engine"
│   │   │   │   │   ├── context.ts          # V3Context — CDP session manager
│   │   │   │   │   ├── page.ts             # Page abstraction over CDP targets
│   │   │   │   │   ├── cdp.ts              # CdpConnection WebSocket transport
│   │   │   │   │   ├── piercer.ts          # DOM piercing injection
│   │   │   │   │   └── a11y/snapshot/      # Accessibility tree snapshots
│   │   │   │   ├── dom/           # DOM processing scripts (injected into pages)
│   │   │   │   ├── cache/         # Action caching system
│   │   │   │   │   ├── ActCache.ts
│   │   │   │   │   ├── AgentCache.ts
│   │   │   │   │   └── CacheStorage.ts
│   │   │   │   ├── launch/        # Browser launch strategies
│   │   │   │   │   ├── local.ts            # chrome-launcher integration
│   │   │   │   │   └── browserbase.ts      # Browserbase session creation
│   │   │   │   ├── shutdown/      # Cleanup & crash supervisor
│   │   │   │   ├── mcp/           # Model Context Protocol integration
│   │   │   │   ├── flowlogger/    # Event logging/tracing system
│   │   │   │   ├── types/         # TypeScript types
│   │   │   │   │   ├── public/    # Exported API types
│   │   │   │   │   └── private/   # Internal types
│   │   │   │   └── zodCompat.ts   # Zod v3/v4 compatibility layer
│   │   │   ├── inference.ts       # LLM inference functions (act, extract, observe)
│   │   │   ├── prompt.ts          # System/user prompt builders
│   │   │   ├── utils.ts           # Schema validation, Gemini conversion, etc.
│   │   │   └── modelUtils.ts      # Model name parsing
│   │   ├── examples/              # Example scripts
│   │   └── tests/                 # Test suite
│   ├── cli/                       # `browse` CLI package
│   ├── evals/                     # Evaluation framework
│   ├── docs/                      # Documentation site (MDX)
│   ├── server-v3/                 # Fastify server wrapping core (for non-JS clients)
│   └── server-v4/                 # Next-gen server
├── .env.example                   # API keys template
├── turbo.json                     # Turborepo config
└── pnpm-workspace.yaml
```

### Core Abstractions

#### 1. `V3` Class (Main Orchestrator)
**File**: `packages/core/lib/v3/v3.ts`

The primary class that users interact with. It manages the full lifecycle: initialization, browser connection, LLM client resolution, and three core operations.

```typescript
class V3 {
  // State machine
  private state: InitState;  // "UNINITIALIZED" | "LOCAL" | "BROWSERBASE"
  
  // Handlers (created on init)
  private actHandler: ActHandler | null;
  private extractHandler: ExtractHandler | null;
  private observeHandler: ObserveHandler | null;
  
  // Browser context
  private ctx: V3Context | null;
  
  // LLM
  public llmClient: LLMClient;
  private llmProvider: LLMProvider;
  
  // Caching
  private actCache: ActCache;
  private agentCache: AgentCache;
  
  // Metrics tracking
  public stagehandMetrics: StagehandMetrics;
  
  // Core API
  async init(): Promise<void>;
  async act(instruction: string, options?: ActOptions): Promise<ActResult>;
  async extract<T>(instruction: string, schema: T, options?: ExtractOptions): Promise<T>;
  async observe(instruction?: string, options?: ObserveOptions): Promise<Action[]>;
  agent(options?: AgentConfig): { execute: (instruction) => Promise<AgentResult> };
  async close(): Promise<void>;
}
```

**Constructor flow**:
1. Parses model configuration (default: `openai/gpt-4.1-mini`)
2. Creates `LLMProvider` → resolves to specific `LLMClient` (OpenAI, Anthropic, Google, etc.)
3. Sets up `CacheStorage`, `ActCache`, `AgentCache`
4. Creates `EventStore` and `FlowLogger` for event tracing

**`init()` flow**:
1. Creates `ActHandler`, `ExtractHandler`, `ObserveHandler`
2. Based on `env` option:
   - **LOCAL**: Launches Chrome via `chrome-launcher`, gets CDP WebSocket URL
   - **BROWSERBASE**: Creates a Browserbase session via their API, gets CDP WebSocket URL
3. Creates `V3Context` from the WebSocket URL (connects to Chrome via CDP)
4. Optionally starts a shutdown supervisor process (crash cleanup)

#### 2. The Three Core Operations + Agent

##### `act(instruction)` — Execute Browser Actions
1. Waits for DOM/network to settle
2. Captures a **hybrid accessibility tree snapshot** (`captureHybridSnapshot`) — merging DOM and a11y tree
3. Builds a prompt with the instruction + accessibility tree + supported actions
4. Calls LLM (`actInference`) which returns: `{ elementId, method, arguments, twoStep }`
5. Resolves `elementId` to an XPath selector via the snapshot's `xpathMap`
6. Executes the action via `performUnderstudyMethod()` (CDP-based Playwright-like actions)
7. If `twoStep: true` (e.g., dropdown), takes a second snapshot, diffs it, asks LLM again
8. **Self-healing**: If action fails, re-snapshots and retries with fresh LLM call

##### `extract(instruction, schema)` — Structured Data Extraction
1. Uses Zod schemas for type-safe extraction
2. Sends DOM elements + instruction to LLM with `response_model` (structured output)
3. Follows up with a **metadata call** to assess progress/completion
4. Returns typed data matching the Zod schema

##### `observe(instruction)` — Find Elements
1. Snapshots accessibility tree
2. Asks LLM to find matching elements
3. Returns `Action[]` with selectors, methods, and descriptions
4. Can be chained: `const actions = await stagehand.observe("find the login button")` → `await stagehand.act(actions[0])`

##### `agent(options)` — Multi-Step AI Agent
Two modes:
- **DOM mode** (default): Uses AI SDK tool-calling pattern. The LLM gets tools: `act`, `extract`, `goto`, `wait`, `navback`, `refresh`, `close`. It plans and executes steps autonomously.
- **CUA mode**: Computer Use Agent — uses provider-native computer-use APIs (OpenAI `computer-use-preview`, Anthropic Claude computer-use, Google Gemini computer-use, Microsoft Fara). Takes screenshots and uses pixel-level actions.

#### 3. `V3Context` — CDP Session Manager
**File**: `packages/core/lib/v3/understudy/context.ts`

Owns the root CDP connection and manages target/page lifecycle. This is Stagehand's custom CDP client (not using Playwright or Puppeteer as runtime dependencies).

```typescript
class V3Context {
  readonly conn: CdpConnection;
  
  static async create(wsUrl: string, opts?): Promise<V3Context>;
  
  pages(): Page[];                              // All top-level pages
  activePage(): Page | undefined;               // Most recently active
  awaitActivePage(): Promise<Page>;             // Wait for active (popup-aware)
  newPage(url?: string): Promise<Page>;         // Create new tab
  resolvePageByMainFrameId(frameId): Page | undefined;
  
  // Cookie management
  cookies(urls?: string[]): Promise<Cookie[]>;
  addCookies(cookies: CookieParam[]): Promise<void>;
  clearCookies(options?: ClearCookieOptions): Promise<void>;
  
  // Lifecycle
  addInitScript(script): Promise<void>;
  setExtraHTTPHeaders(headers): Promise<void>;
  close(): Promise<void>;
}
```

**Key internals**:
- **Custom CDP WebSocket transport** (`CdpConnection`) — not relying on Playwright/Puppeteer for CDP communication
- **Target auto-attach**: Monitors `Target.attachedToTarget` and `Target.detachedFromTarget` to track all pages/iframes
- **OOPIF (Out-of-Process iFrame) handling**: Correctly adopts child process sessions into parent Page objects
- **Init script injection**: Scripts are registered via `Page.addScriptToEvaluateOnNewDocument` before targets resume (using `waitForDebuggerOnStart`)
- **Piercer**: A custom DOM instrumentation script injected into every page for accessibility tree traversal

#### 4. `LLMProvider` / `LLMClient` — Multi-Provider LLM Layer
**File**: `packages/core/lib/v3/llm/LLMProvider.ts`, `LLMClient.ts`

```typescript
abstract class LLMClient {
  type: "openai" | "anthropic" | "cerebras" | "groq" | string;
  modelName: AvailableModel;
  hasVision: boolean;
  
  abstract createChatCompletion<T>(options): Promise<T>;
  
  // AI SDK pass-throughs
  generateObject = generateObject;
  generateText = generateText;
  streamText = streamText;
  streamObject = streamObject;
}
```

**Supported providers** (via Vercel AI SDK):
- OpenAI (GPT-4.1, GPT-4.1-mini, GPT-4.1-nano, o3, o4-mini, GPT-4o, GPT-4.5)
- Anthropic (Claude Sonnet 4, Claude Opus 4.5/4.6, Claude Haiku 4.5)
- Google (Gemini 2.0 Flash, Gemini 2.5 Flash/Pro)
- Groq, Cerebras (fast inference)
- Azure, AWS Bedrock, Vertex AI
- DeepSeek, Mistral, Perplexity, Ollama, Together AI, XAI
- Any provider via the `provider/model` format

**Provider resolution**: Model names follow `provider/model` format (e.g., `openai/gpt-4.1-mini`). The `LLMProvider.getClient()` factory creates the appropriate `LLMClient` subclass. Legacy short names (e.g., `gpt-4o`) are mapped via `modelToProviderMap`.

#### 5. `AgentProvider` — Computer Use Agent Clients
**File**: `packages/core/lib/v3/agent/AgentProvider.ts`

Separate from the `LLMProvider`, this handles computer-use agent models:

```typescript
// Supported CUA models → providers
modelToAgentProviderMap = {
  "computer-use-preview": "openai",
  "claude-sonnet-4-*": "anthropic",
  "claude-opus-4-*": "anthropic",
  "gemini-*-computer-use-*": "google",
  "fara-7b": "microsoft",
};
```

Each provider has a dedicated client (`OpenAICUAClient`, `AnthropicCUAClient`, `GoogleCUAClient`, `MicrosoftCUAClient`) that handles the provider-specific computer-use API format.

### How Prompts Work

#### Act Prompt
```
System: "You are helping the user automate the browser by finding elements 
based on what action the user wants to take on the page. You will be given:
1. a user defined instruction about what action to take
2. a hierarchical accessibility tree showing the semantic structure of the page."

User: "instruction: {instruction}
Accessibility Tree: {domElements}"
```

The LLM returns a structured response with Zod schema:
```typescript
{ elementId: "3-42", method: "click", arguments: [], description: "...", twoStep: false }
```

#### Extract Prompt
```
System: "You are extracting content on behalf of a user..."
User: "Instruction: {instruction}  DOM: {domElements}"
→ LLM returns: structured data matching the user's Zod schema

Metadata follow-up:
"Analyze the extraction response and determine if the task is completed..."
→ LLM returns: { completed: true/false, progress: "..." }
```

#### Agent Prompt (DOM mode)
```
System: "You are a general-purpose agent whose job is to accomplish the user's goal.
Available tools: act, extract, goto, wait, navback, refresh, close
CRITICAL: You MUST use the provided tools to take actions."
```

### Caching System

Stagehand has a sophisticated **action caching** system:

1. **`ActCache`**: Caches individual `act()` results. On cache hit, replays the action deterministically without LLM inference.
2. **`AgentCache`**: Caches entire agent execution sequences (replay steps). Can replay a full agent workflow from cache.
3. **Cache key**: Based on instruction text + page state hash + variables
4. **Self-healing integration**: If a cached action fails (page changed), falls back to live LLM inference
5. **Agent cache wrapping**: For streaming agent results, wraps the stream to capture steps for caching

### Browser Session Management

**Local mode**:
1. Uses `chrome-launcher` to start a local Chrome process
2. Gets CDP WebSocket URL from Chrome's debug port
3. Creates a temp user data directory (optionally persisted)
4. Manages Chrome process lifecycle (kill on close, crash supervisor)

**Browserbase mode**:
1. Creates a session via Browserbase's REST API (`bb.sessions.create()`)
2. Gets a CDP WebSocket URL for the cloud browser
3. Supports `keepAlive` sessions that persist beyond the script's lifecycle
4. CAPTCHA auto-solving when `browserSettings.solveCaptchas` is enabled
5. Advanced stealth mode (`advancedStealth`)

**Shutdown supervisor**: A separate child process (`startShutdownSupervisor`) that monitors the main process and cleans up (kills Chrome/ends Browserbase sessions) if it crashes without calling `close()`.

### Key Design Patterns

1. **Hybrid accessibility tree**: Merges DOM tree with accessibility (a11y) tree for richer context. Includes diffing between snapshots for two-step actions.
2. **Provider/model naming**: `openai/gpt-4.1-mini` — provider is extracted, model is resolved, client is created per-provider
3. **State machine initialization**: `V3` has states `UNINITIALIZED → LOCAL | BROWSERBASE` 
4. **Page resolution**: Normalizes Playwright, Puppeteer, and Patchright page objects into internal `Page` type via CDP frameId resolution
5. **Self-healing**: When `act()` fails, automatically re-captures the DOM and asks the LLM for an alternative selector
6. **Two-step actions**: For complex interactions (e.g., dropdowns), the LLM signals `twoStep: true`, Stagehand executes step 1 (expand), diffs the tree, then executes step 2 (select)
7. **FlowLogger**: Event-based tracing system using `EventEmitter` → `EventStore` → multiple sinks (stderr, JSON files)
8. **Zod schema compatibility**: Custom `zodCompat.ts` handles both Zod v3 and v4 schemas
9. **API/local duality**: Same `V3` class works in local mode (all logic runs locally) or API mode (delegates to Stagehand's server API for inference)
10. **Variable substitution**: `%variableName%` tokens in act instructions are replaced at execution time

### What Makes Stagehand Unique

1. **Code + Natural Language hybrid**: Unlike pure agent frameworks, developers choose when to use AI vs. precise code
2. **Three-level abstraction**: `act()` for single actions, `observe()` for finding elements, `agent()` for autonomous multi-step
3. **Auto-caching**: Actions are automatically cached and replayed without LLM calls — "write once, run forever"
4. **Self-healing selectors**: When selectors break, AI automatically finds alternatives
5. **Multi-provider CUA support**: OpenAI, Anthropic, Google, and Microsoft computer-use APIs unified under one interface
6. **Custom CDP engine**: Doesn't depend on Playwright/Puppeteer at runtime — has its own CDP client with full OOPIF and multi-tab support
7. **Browserbase integration**: Native cloud browser support with captcha solving, stealth mode, session persistence

---

## Comparison: Steel vs. Stagehand

| Aspect | Steel Browser | Stagehand |
|--------|--------------|-----------|
| **Layer** | Infrastructure (browser backend) | Framework (AI automation) |
| **AI Integration** | None — provides browser API for AI to use | Deep — LLMs drive every operation |
| **Browser Management** | Single-tenant Fastify server managing Chrome | Client-side library launching/connecting to Chrome |
| **CDP Usage** | Via Puppeteer-core (server-side) | Custom CDP client (no Puppeteer/Playwright dependency) |
| **Session Model** | One active session at a time, REST API | Multiple pages/tabs, client-side orchestration |
| **Client Protocol** | REST API + WebSocket (connect with any CDP client) | Direct TypeScript SDK (npm package) |
| **Anti-Detection** | Extensive (fingerprinting, stealth, proxy chains) | Relies on Browserbase for stealth, basic local mode |
| **State Persistence** | Full browser state capture/restore | Cookie management, user data dirs |
| **Target Users** | AI agent builders who need browser infra | Developers building browser automations |
| **Self-Hosted** | Yes (Docker) | Local Chrome or Browserbase cloud |
| **License** | Apache 2.0 | MIT |
| **Key Strength** | Production browser infrastructure | AI-powered automation intelligence |

### How They Could Work Together

Steel provides the browser infrastructure that Stagehand could connect to. A typical production setup might use:
1. **Steel** as the browser backend (manages Chrome, proxies, fingerprinting, anti-detection)
2. **Stagehand** as the AI layer (connects to Steel's CDP endpoint, uses LLMs to drive actions)

Stagehand's `localBrowserLaunchOptions.cdpUrl` option allows connecting to an existing CDP endpoint — which could be a Steel instance.

# Deep Technical Research: crewAI vs Eko

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Core Abstractions](#core-abstractions)
4. [Multi-Agent Orchestration](#multi-agent-orchestration)
5. [AI Model Integration](#ai-model-integration)
6. [Tools & Skills System](#tools--skills-system)
7. [Task Delegation & Execution](#task-delegation--execution)
8. [Memory & State Management](#memory--state-management)
9. [Key Design Patterns](#key-design-patterns)
10. [What Makes Each Unique](#what-makes-each-unique)
11. [Comparison Matrix](#comparison-matrix)

---

## Executive Summary

| | **crewAI** | **Eko** |
|---|---|---|
| **Language** | Python | TypeScript |
| **Version** | 1.11.0 | ~0.x |
| **License** | MIT | MIT |
| **GitHub Stars** | 46k+ | 4k+ |
| **Paradigm** | Role-playing agent crews + event-driven flows | Natural language → XML workflow planning |
| **Key Innovation** | Crew/Flow dual orchestration with role-based agents | LLM-generated dependency-aware workflow DAGs |
| **Runtime** | Python (server-side) | Browser extension, Node.js, Web |

---

## Architecture Overview

### crewAI Architecture

```
┌──────────────────────────────────────────────────┐
│                    Flow Layer                      │
│  @start → @listen → @router → @listen             │
│  Event-driven state machine with typed state       │
│  OR/AND conditions, racing groups, human feedback  │
├──────────────────────────────────────────────────┤
│                    Crew Layer                       │
│  Sequential / Hierarchical process execution       │
│  Manager agent (hierarchical), task delegation     │
│  Planning, training, testing, replay               │
├──────────────────────────────────────────────────┤
│                   Agent Layer                       │
│  Role/Goal/Backstory persona, LLM-powered          │
│  Tool use, delegation, code execution              │
│  Memory recall, knowledge/RAG, guardrails          │
├──────────────────────────────────────────────────┤
│                   Task Layer                        │
│  Description + expected output, context chaining   │
│  Output formats (raw/JSON/Pydantic), guardrails    │
│  File I/O, async execution, callbacks              │
├──────────────────────────────────────────────────┤
│               Infrastructure Layer                  │
│  Memory (unified), Knowledge/RAG, MCP, A2A         │
│  Events/Telemetry, Security, Streaming             │
└──────────────────────────────────────────────────┘
```

**Source layout**: `lib/crewai/src/crewai/` — monolithic Python package.

Key modules: `agent/`, `crew.py`, `task.py`, `flow/`, `memory/`, `knowledge/`, `tools/`, `mcp/`, `llm/`, `events/`, `security/`, `a2a/`, `telemetry/`.

### Eko Architecture

```
┌──────────────────────────────────────────────────┐
│                  Platform Layer                     │
│  eko-extension (Chrome), eko-nodejs, eko-web       │
│  Platform-specific tools + browser agents          │
├──────────────────────────────────────────────────┤
│                  Eko Core (eko-core)                │
│                                                     │
│  ┌─────────────┐  ┌──────────────┐                 │
│  │   Planner    │  │ Eko (runner)  │                │
│  │ NL → XML     │  │ Workflow exec │                │
│  │ Workflow gen  │  │ Agent tree    │                │
│  └──────┬───────┘  └──────┬───────┘                │
│         │                  │                        │
│  ┌──────▼──────────────────▼──────┐                │
│  │          Agent (ReAct)          │                │
│  │  System prompt + tool loop      │                │
│  │  MCP tools, parallel calls      │                │
│  │  Memory management              │                │
│  └────────────────────────────────┘                │
│                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │  Memory   │ │   LLM    │ │  Tools   │           │
│  │ EkoMemory │ │ RLM+ReAct│ │ Wrapper  │           │
│  └──────────┘ └──────────┘ └──────────┘           │
│                                                     │
│  Chain (observability) + MCP client                 │
└──────────────────────────────────────────────────┘
```

**Source layout**: pnpm monorepo with packages:
- `eko-core/src/` — agent, chat, common, config, llm, mcp, memory, prompt, service, tools, types
- `eko-extension/` — Chrome extension platform
- `eko-nodejs/` — Node.js platform
- `eko-web/` — Web platform

---

## Core Abstractions

### crewAI Core Abstractions

#### 1. Agent (`agent/core.py`)
A **Pydantic BaseModel** representing a role-playing AI entity:

```python
class Agent(BaseAgent):
    role: str              # "Senior Data Analyst"
    goal: str              # "Analyze data and provide insights"
    backstory: str         # "You are a seasoned analyst with 15+ years..."
    llm: BaseLLM | str     # Model to use
    tools: list[BaseTool]  # Available tools
    memory: bool           # Enable agent-level memory
    knowledge: dict        # RAG knowledge sources
    allow_delegation: bool # Can delegate to other agents
    allow_code_execution: bool
    max_iter: int = 25     # Max reasoning iterations
    max_rpm: int | None    # Rate limiting
    guardrail: Callable    # Output validation
    mcps: list[MCPServerAdapter]  # MCP tool servers
    a2a: AgentCard | None  # Agent-to-Agent protocol
```

Key methods:
- **`execute_task(task, context, tools)`** — Crew-based execution. Retrieves memories, prepares tools, builds prompt, calls LLM with retry/timeout.
- **`kickoff(messages, response_format)`** — Standalone execution without a Crew. Auto-detects async context.

#### 2. Task (`task.py`)
A **Pydantic BaseModel** defining a unit of work:

```python
class Task(BaseModel):
    description: str           # What to do
    expected_output: str       # What the result should look like
    agent: BaseAgent | None    # Who does it
    context: list[Task] | None # Tasks whose output feeds this one
    tools: list[BaseTool]      # Task-specific tools
    output_json: type[BaseModel] | None   # Structured JSON output
    output_pydantic: type[BaseModel] | None  # Structured Pydantic output
    output_file: str | None    # Save to file
    async_execution: bool      # Run async in thread
    human_input: bool          # Require human review
    guardrail: GuardrailCallable | str  # Output validation
    guardrails: list[GuardrailCallable] # Multiple guardrails
    guardrail_max_retries: int = 3
    callback: Callable | None  # Post-completion callback
    input_files: dict[str, FileInput]
```

Key features:
- **Context chaining**: Tasks can reference other tasks' outputs as context
- **Structured output**: Output can be validated against Pydantic models or JSON schemas
- **Guardrails**: Functions or LLM-based validators that retry agent execution if output fails validation
- **Template interpolation**: `{variable}` syntax in descriptions, resolved at execution time

#### 3. Crew (`crew.py`)
The **orchestrator** that runs agents on tasks:

```python
class Crew(BaseModel):
    agents: list[BaseAgent]
    tasks: list[Task]
    process: Process          # sequential | hierarchical
    memory: Memory | None     # Shared memory across agents
    knowledge: list[Any]      # Crew-level knowledge sources
    manager_llm: str | None   # LLM for hierarchical manager
    manager_agent: Agent | None
    planning: bool            # Enable pre-execution planning
    stream: bool              # Enable streaming output
    max_rpm: int | None       # Global rate limit
    embedder: dict | None     # Embedding config
```

Key methods:
- **`kickoff(inputs)`** → `CrewOutput` — Main entry point. Routes to sequential or hierarchical execution.
- **`train(n_iterations, inputs, filename)`** — Train crew with human feedback
- **`test(n_iterations, inputs)`** — Evaluate crew with `CrewEvaluator`
- **`replay(task_id)`** — Re-execute from a specific task

#### 4. Flow (`flow/flow.py`)
An **event-driven state machine** for multi-crew orchestration:

```python
class Flow(Generic[T], metaclass=FlowMeta):
    initial_state: type[T] | T | None  # dict or BaseModel
    memory: Memory | None
    stream: bool

    @start()
    def begin(self):
        return "started"

    @listen("begin")
    def process(self, result):
        # Triggered when begin() completes
        pass

    @router("process")
    def decide(self, result):
        if condition:
            return "path_a"
        return "path_b"

    @listen("path_a")
    def handle_a(self): ...

    @listen(or_("path_a", "path_b"))
    def handle_either(self): ...

    @listen(and_("step1", "step2"))
    def handle_both(self): ...
```

The Flow system features:
- **`@start`**: Entry points (unconditional or conditional)
- **`@listen(condition)`**: React to method completions
- **`@router(condition)`**: Branch execution based on return values
- **`or_()` / `and_()`**: Compose complex trigger conditions (nestable)
- **Thread-safe state**: `StateProxy` with `LockedListProxy`/`LockedDictProxy`
- **Parallel execution**: Racing groups with first-wins semantics for OR listeners
- **Persistence**: `FlowPersistence` for saving/restoring flow state (SQLite default)
- **Human feedback**: `@human_feedback` decorator, `self.ask()` for interactive HITL
- **`self.recall()` / `self.remember()`**: Memory integration directly in flows

#### 5. Process (enum)
```python
class Process(str, Enum):
    sequential = "sequential"
    hierarchical = "hierarchical"
    # consensual = "consensual"  # TODO
```

### Eko Core Abstractions

#### 1. Eko (`agent/eko.ts`)
The **main orchestrator** — plans and executes workflows:

```typescript
class Eko {
    config: EkoConfig  // { llms, agents, planLlms, callback, defaultMcpClient, a2aClient }

    async generate(taskPrompt: string): Promise<Workflow>
    async modify(taskId: string, modifyTaskPrompt: string): Promise<Workflow>
    async execute(taskId: string): Promise<EkoResult>
    async run(taskPrompt: string): Promise<EkoResult>  // generate + execute

    pauseTask(taskId: string): void
    abortTask(taskId: string): void
    deleteTask(taskId: string): void
}
```

#### 2. Workflow (type)
An **XML-parsed structure** representing a plan:

```typescript
interface Workflow {
    taskId: string
    name: string
    thought: string        // LLM's reasoning about the plan
    agents: WorkflowAgent[]
    xml: string            // Raw XML source
}

interface WorkflowAgent {
    id: string
    name: string
    task: string           // Natural language task description
    dependsOn: string[]    // Agent IDs this depends on (DAG edges)
    nodes: WorkflowNode[]  // Sub-task nodes
    parallel: boolean      // Can run in parallel with siblings?
    status: string
    xml: string
}
```

The workflow XML schema:
```xml
<workflow name="Research Task">
  <agent id="1" name="Researcher" dependsOn="" tools="search,read">
    <task>Search for information about AI agents</task>
    <node type="text">Find relevant papers</node>
    <node type="foreach" items="${results}">
      <text>Summarize paper: ${item}</text>
    </node>
  </agent>
  <agent id="2" name="Writer" dependsOn="1" tools="write">
    <task>Write a summary report</task>
  </agent>
</workflow>
```

#### 3. Agent (`agent/base.ts`)
A **ReAct-loop executor** with tools:

```typescript
class Agent {
    name: string
    description: string
    tools: Tool[]
    llms: LLMs
    mcpClient?: McpClient
    planDescription: string  // From workflow XML

    async run(context: TaskContext, agentChain: AgentChain): Promise<void>
    // Internal ReAct loop:
    // 1. Build system + user prompts
    // 2. Call LLM with tools
    // 3. If tool calls → execute tools → loop
    // 4. If text response → done
}
```

Key features:
- **Max iterations**: Configurable loop limit (default 15)
- **Parallel tool calls**: `Promise.all()` for multiple tool calls in one LLM response
- **Auto-tools**: `VariableStorageTool`, `ForeachTaskTool`, `WatchTriggerTool`, `HumanInteractTool` auto-injected based on workflow XML
- **MCP integration**: Tools fetched from MCP servers via `listTools()`, wrapped as `McpTool`
- **Browser agents**: `BaseBrowserAgent`, `BaseBrowserLabelsAgent`, `BaseBrowserScreenAgent` for browser automation

#### 4. Planner (`agent/plan.ts`)
Converts **natural language → XML workflow** via LLM:

```typescript
class Planner {
    async plan(taskPrompt: string): Promise<Workflow>
    async replan(taskPrompt: string): Promise<Workflow>  // Modify existing plan
}
```
- Uses `RetryLanguageModel` for fault-tolerant streaming
- 3 retry attempts
- Parses XML via `parseWorkflow()` utility
- Stream callbacks for real-time planning UI

#### 5. Chain (`agent/chain.ts`)
**Observability layer** — records execution traces:

```typescript
class Chain {
    planRequest: string
    planResult: Workflow
    agents: AgentChain[]       // Per-agent execution records
}

class AgentChain {
    tools: ToolChain[]         // Per-tool-call records
}

class ToolChain {
    params: Record<string, unknown>
    result: any
}
```
Uses pub/sub for real-time event updates.

#### 6. EkoMemory (`memory/memory.ts`)
**Conversation-based context manager**:

```typescript
class EkoMemory {
    systemPrompt?: string
    messages: EkoMessage[]
    memoryConfig: MemoryConfig  // { maxMessageNum, maxInputTokens, enableCompression, ... }

    addMessages(messages: EkoMessage[]): Promise<void>
    buildMessages(): LanguageModelV2Prompt
    getEstimatedTokens(): number
    manageCapacity(): Promise<void>  // Trim + compress
    fixDiscontinuousMessages(): void // Repair broken message sequences
}
```

---

## Multi-Agent Orchestration

### crewAI Orchestration

**Two execution models:**

#### Sequential Process
Tasks execute one-by-one in list order. Each task's output can feed the next via `context`:

```
Task 1 (Agent A) → Task 2 (Agent B, context=[Task1]) → Task 3 (Agent C, context=[Task1, Task2])
```

Implementation in `crew.py`:
1. Iterate tasks in order
2. For each task, aggregate context from referenced tasks' outputs
3. Call `task.execute_sync(agent, context, tools)` or `task.execute_async(...)` for async tasks
4. Wait for all async tasks before proceeding to tasks that depend on them
5. Each task returns `TaskOutput` with raw/JSON/Pydantic result

#### Hierarchical Process
A **manager agent** coordinates by delegating tasks to worker agents:

1. `_create_manager_agent()` builds a manager with i18n-configured role/goal/backstory
2. Manager gets `AgentTools` — delegation tools that allow it to assign work to other agents
3. Manager decides which agent should handle each task and delegates via tool calls
4. Workers execute and return results to manager
5. Manager synthesizes final output

#### Flow Orchestration (Multi-Crew)
Flows wire multiple Crews together with event-driven logic:

```python
class ResearchFlow(Flow[ResearchState]):
    @start()
    def gather_requirements(self):
        crew = RequirementsCrew().crew()
        return crew.kickoff(inputs={"topic": self.state.topic})

    @listen("gather_requirements")
    def do_research(self, requirements):
        crew = ResearchCrew().crew()
        return crew.kickoff(inputs={"requirements": requirements})

    @router("do_research")
    def quality_check(self, research):
        if research.quality_score > 0.8:
            return "approved"
        return "needs_revision"

    @listen("approved")
    def write_report(self, research):
        crew = WritingCrew().crew()
        return crew.kickoff(inputs={"research": research})
```

**Flow execution internals:**
- `FlowMeta` metaclass scans for `@start`, `@listen`, `@router` decorators at class creation
- `kickoff_async()` executes all start methods, then cascades through listeners
- **Parallel execution**: OR listeners race; first to complete wins (others cancelled via `asyncio.cancel()`)
- **AND conditions**: Track pending triggers per listener; fire only when all satisfied
- **Cyclic support**: Methods can re-trigger after completion; OR listener sets cleared per cycle
- **Max method calls**: `max_method_calls=100` prevents infinite loops

### Eko Orchestration

**Single model: dependency-aware agent tree**

1. **Planning phase**: `Planner.plan(taskPrompt)` generates XML workflow via LLM streaming
2. **Tree building**: `doRunWorkflow()` parses workflow into `AgentNode[]` — a tree of `NormalAgentNode | ParallelAgentNode`
3. **Dependency resolution**: Agents with `dependsOn` run after their dependencies
4. **Parallel groups**: Agents without inter-dependencies form `ParallelAgentNode` groups, executed via `Promise.all()`
5. **Sequential fallback**: Agents with dependencies execute sequentially

```
Workflow XML
    ↓ parseWorkflow()
AgentNode[] tree:
    ├── NormalAgentNode(agent1)
    ├── ParallelAgentNode
    │   ├── NormalAgentNode(agent2)  ← parallel
    │   └── NormalAgentNode(agent3)  ← parallel
    └── NormalAgentNode(agent4, dependsOn=[2,3])
```

**Execution loop per agent:**
```
Agent.run(context, agentChain)
  ↓
runWithContext()  ← ReAct loop
  ↓ iteration:
  1. Build messages (system + user prompt + history)
  2. callWithReAct(rlm, request, toolCallCallback, streamCallback)
  3. LLM responds with text or tool calls
  4. If tool calls → execute tools (parallel via Promise.all) → add results to messages → loop
  5. If text only → done, store result
```

**Re-planning**: In expert mode, `checkTaskReplan()` evaluates whether the workflow needs modification after partial execution, and `replanWorkflow()` regenerates the remaining plan.

**Task lifecycle controls**: `pauseTask()`, `abortTask()`, `deleteTask()` — each modifies a global `taskMap` storing `TaskContext` per task ID.

---

## AI Model Integration

### crewAI LLM Integration

**`LLM` class** (`llm/`) wraps any LiteLLM-compatible model string:

```python
agent = Agent(
    role="Analyst",
    llm="gpt-4o",              # or "anthropic/claude-3.5-sonnet"
    # llm=LLM(model="gpt-4o", temperature=0.7)
)
```

- **LiteLLM backend**: Supports 100+ providers (OpenAI, Anthropic, Google, Azure, Ollama, etc.)
- **BaseLLM abstract class**: Custom LLM implementations can subclass this
- **Per-component LLMs**: Agent LLM, manager LLM, planning LLM can all differ
- **Multimodal**: `agent.multimodal=True` enables image/file input
- **Structured output**: `response_model` parameter for Pydantic-validated responses
- **Rate limiting**: `max_rpm` per agent with RPM controller

### Eko LLM Integration

**`@ai-sdk/provider` abstraction** — uses Vercel AI SDK's `LanguageModelV2` interface:

```typescript
const config: EkoConfig = {
    llms: {
        default: openai("gpt-4o"),       // LanguageModelV2 instance
        planning: anthropic("claude-3"),  // Different model for planning
    }
}
```

- **RetryLanguageModel (RLM)**: Wraps any `LanguageModelV2` with configurable retry logic (`config.maxRetryNum`)
- **Streaming-first**: All LLM calls use streaming (`callStream()`) for real-time output
- **callLLM()**: Low-level streaming call that parses chunks (text, tool calls, reasoning, files, errors, finish)
- **callWithReAct()**: Higher-level ReAct loop — calls LLM, processes tool results, loops until no more tool calls or max iterations (15)

Key difference: crewAI has broad model support via LiteLLM; Eko uses the Vercel AI SDK provider interface which is more TypeScript-native but requires compatible provider packages.

---

## Tools & Skills System

### crewAI Tools

**`BaseTool`** (Pydantic model) — the tool interface:

```python
class BaseTool(BaseModel):
    name: str
    description: str

    def _run(self, **kwargs) -> str:
        """Override this"""
        ...
```

**Tool categories in crewAI:**

| Category | Examples |
|---|---|
| **Core tools** | Delegation tools (`AgentTools`), code execution |
| **Platform tools** | File read/write, directory listing |
| **MCP tools** | Dynamically loaded from MCP servers |
| **Multimodal tools** | Image analysis, file processing |
| **Memory tools** | MemoryReadTool, MemoryWriteTool (via Knowledge/RAG) |
| **crewai-tools package** | 60+ tools: SerperSearch, ScrapeWebsite, PDFReader, etc. |

**Tool preparation flow** (`crew.py`):
1. Task-level tools merged with agent-level tools
2. Delegation tools added if `allow_delegation=True`
3. Code execution tools added if `allow_code_execution=True`
4. MCP tools loaded from `agent.mcps` servers
5. Platform tools (file I/O) added
6. Memory tools added if memory enabled
7. De-duplicated and passed to agent executor

### Eko Tools

**`Tool` interface:**

```typescript
interface Tool {
    name: string
    description?: string
    parameters: JSONSchema7

    execute(
        args: Record<string, unknown>,
        agentContext: AgentContext,
        toolCall: LanguageModelV2ToolCallPart
    ): Promise<ToolResult>
}
```

**`ToolWrapper`** wraps `ToolSchema + ToolExecuter` into `LanguageModelV2FunctionTool` for LLM consumption.

**Tool categories in Eko:**

| Category | Description |
|---|---|
| **Auto tools** | `VariableStorageTool` (cross-agent data), `ForeachTaskTool` (iteration), `WatchTriggerTool` (event watching), `HumanInteractTool` (human-in-the-loop) |
| **MCP tools** | `McpTool` — fetched from MCP servers, wrapped as `ToolWrapper` |
| **Platform tools** | Browser tools (extension), Node.js tools (file I/O, shell), Web tools |
| **Task node tools** | `TaskNodeStatusTool` — marks workflow nodes as complete |

**Auto-tool injection** (`system_auto_tools()` in `base.ts`):
- Scans workflow XML for `<foreach>`, `<watch>`, `<variable>` nodes
- Automatically adds relevant tools to the agent without manual configuration
- This is a key differentiator — tools are contextually injected based on the workflow plan

---

## Task Delegation & Execution

### crewAI Task Delegation

**Two mechanisms:**

#### 1. Direct delegation via `allow_delegation`
When `Agent.allow_delegation=True`, the agent gets `DelegateWorkTool` and `AskQuestionTool`:
- **DelegateWorkTool**: Passes a task to a coworker agent with specific context
- **AskQuestionTool**: Asks a coworker a specific question

The agent's LLM decides when and to whom to delegate based on its reasoning.

#### 2. Hierarchical manager delegation
In hierarchical process, the manager agent:
1. Receives all tasks
2. Decides which worker agent should handle each
3. Uses `AgentTools` to delegate with instructions
4. Receives results and may re-delegate or synthesize

**A2A (Agent-to-Agent) protocol**: Remote agent delegation via `agent.a2a = AgentCard(url=...)`. Enables cross-service agent communication following Google's A2A spec.

### Eko Task Delegation

**No runtime delegation** — task assignment is determined at planning time:

1. **Planner** generates workflow XML assigning tasks to named agents
2. Each `WorkflowAgent` has a fixed task description
3. Agents execute their assigned task via ReAct loop
4. Dependencies ensure data flows correctly between agents

**Cross-agent data sharing**: `VariableStorageTool` allows agents to store/retrieve variables:
```
Agent 1 stores: variable_storage.set("research_results", data)
Agent 2 reads:  variable_storage.get("research_results")
```

**A2A support**: `a2aClient.listAgents()` discovers remote agents that can be included in workflow planning.

---

## Memory & State Management

### crewAI Memory System

**Unified Memory** (`memory/unified_memory.py`) — a sophisticated multi-layer system:

| Layer | Purpose | Backend |
|---|---|---|
| **Short-term** | Current execution context | In-memory |
| **Long-term** | Cross-execution persistence | LanceDB (vector) |
| **Entity** | Named entity tracking | LanceDB (vector) |

**Memory in Agent execution:**
```python
# Before task execution:
memories = self.memory.recall(query=task_prompt, scope=..., limit=...)

# After task execution:
self.memory.remember(content=result, scope=..., categories=[...])
```

**Memory in Flows:**
```python
class MyFlow(Flow[MyState]):
    memory = Memory()  # Auto-created if not specified

    @start()
    def step(self):
        # Query memories
        context = self.recall("What do we know about X?")
        # Store memories
        self.remember("Key finding: Y correlates with Z")
        # Batch store
        self.remember(["fact 1", "fact 2", "fact 3"])
        # Extract memories from content
        memories = self.extract_memories(long_text)
```

**MemoryScope / MemorySlice**: Scoped memory access patterns for fine-grained control.

**Knowledge system** (`knowledge/`): RAG integration for injecting domain knowledge:
- Crew-level and agent-level knowledge sources
- LLM-based query rewriting for better retrieval
- Supports various document formats

### Eko Memory System

**`EkoMemory`** — conversation-based context buffer:

```typescript
class EkoMemory {
    messages: EkoMessage[]           // Chat history
    memoryConfig: MemoryConfig       // Capacity settings

    // Config:
    // maxMessageNum: 50             // Max messages to keep
    // maxInputTokens: 100000        // Max token budget
    // enableCompression: true       // Compress old messages
    // compressionThreshold: 30      // Start compressing after N messages
    // compressionMaxLength: 2000    // Max chars per message after compression
}
```

**Capacity management** (`manageCapacity()`):
1. Drop oldest messages if count exceeds `maxMessageNum`
2. Compress long assistant/tool messages beyond `compressionMaxLength` (truncation with marker)
3. Drop oldest messages until total tokens under `maxInputTokens`
4. `fixDiscontinuousMessages()`: Repair broken message sequences (e.g., tool result without preceding tool call)

**Token estimation**: Simple heuristic — Chinese characters = 1 token each, other characters = 1 token per 4 characters.

**Key difference**: crewAI has a multi-layer semantic memory system (short/long-term with embeddings); Eko has a simpler conversation buffer with compression. crewAI's memory persists across executions; Eko's is per-execution.

---

## Key Design Patterns

### crewAI Design Patterns

1. **Role-Playing Pattern**: Agents have `role`, `goal`, `backstory` — the LLM adopts a persona, improving task-specific performance through character prompting.

2. **Pydantic-Everywhere Pattern**: Every major abstraction (Agent, Task, Crew, Flow state) is a Pydantic model with validators, enabling strong typing, serialization, and configuration validation.

3. **Decorator-Based DSL**: Flows use `@start`, `@listen`, `@router` decorators with `FlowMeta` metaclass to build an execution DAG at class definition time.

4. **Thread-Safe State Proxies**: `StateProxy`, `LockedListProxy`, `LockedDictProxy` — thread-safe wrappers that allow parallel Flow listeners to safely mutate shared state.

5. **Event Bus**: `crewai_event_bus` pub/sub for decoupled emission of execution events (task started/completed/failed, flow started/paused/finished, etc.).

6. **Guardrail Retry Loop**: Tasks and agents have guardrails that validate output. On failure, the agent re-executes with error context, up to `guardrail_max_retries` times.

7. **Context Aggregation**: Task outputs cascade through `context` references, building up a chain of accumulated results.

8. **I18N-Driven Prompts**: All system prompts come from `I18N` module, making them configurable and localizable without code changes.

9. **Lazy Loading**: Heavy dependencies (LanceDB for memory) are lazy-imported to reduce startup time.

10. **Training/Testing/Replay**: Built-in methods for iterative crew improvement (`train()`), evaluation (`test()`), and debugging (`replay(task_id)`).

### Eko Design Patterns

1. **Plan-Then-Execute Pattern**: LLM generates a structured XML workflow before any execution begins. This separates planning from execution, enabling inspection and modification.

2. **ReAct Loop Pattern**: Agents follow Reasoning + Acting — LLM reasons, calls tools, observes results, repeats until the task is solved or max iterations reached.

3. **Dependency DAG**: Workflow agents form a directed acyclic graph via `dependsOn`. The executor builds a tree and runs independent branches in parallel.

4. **Auto-Tool Injection**: Tools are contextually added based on workflow XML analysis — `<foreach>` triggers `ForeachTaskTool`, `<watch>` triggers `WatchTriggerTool`, etc.

5. **MCP-Native Architecture**: MCP (Model Context Protocol) is a first-class citizen. Tools from MCP servers are automatically discovered and wrapped.

6. **Streaming-First LLM**: All LLM interactions use streaming. The `callLLM()` function processes chunk-by-chunk for real-time UI updates.

7. **RetryLanguageModel (RLM)**: Wraps any LLM provider with retry logic, exponential backoff, and error handling.

8. **Platform Abstraction**: Core logic is platform-agnostic. `eko-extension`, `eko-nodejs`, `eko-web` provide platform-specific tools and runtime environments.

9. **Observability Chain**: `Chain → AgentChain → ToolChain` hierarchy records every decision and tool call for debugging and visualization.

10. **Pause/Resume/Abort**: First-class execution lifecycle controls via `TaskContext` global map. Any running workflow can be paused, resumed, or cancelled.

---

## What Makes Each Unique

### crewAI's Unique Strengths

1. **Dual Orchestration Model (Crew + Flow)**: No other framework combines role-playing agent crews with an event-driven Flow state machine. Crews handle structured multi-agent tasks; Flows handle complex, branching, multi-crew pipelines.

2. **Deep Role-Playing**: The `role/goal/backstory` triplet is more than prompting — it's a design philosophy based on research showing that persona prompting significantly improves LLM task performance.

3. **Hierarchical Process with Auto-Manager**: The hierarchical mode automatically creates a manager agent that uses delegation tools to coordinate workers — genuine emergent multi-agent coordination.

4. **Training & Evaluation**: `crew.train()` with human feedback and `crew.test()` with `CrewEvaluator` enable iterative improvement of agent teams — a unique production-readiness feature.

5. **Flow State Machines**: `@start`, `@listen`, `@router` with `or_()` / `and_()` conditions, racing groups, persistence, and human feedback create a powerful event-driven orchestration layer that no comparable framework offers at this sophistication level.

6. **Guardrail System**: Both task-level and agent-level guardrails with automatic retry. Guards can be functions or natural language descriptions (auto-converted to `LLMGuardrail`).

7. **Massive Ecosystem**: 46k+ stars, 60+ tools in `crewai-tools`, enterprise features, CLI tooling, training data collection.

### Eko's Unique Strengths

1. **LLM-Generated Workflow Plans**: The user provides a natural language task; the LLM generates a structured XML workflow with agents, dependencies, and tools. This is fundamentally different from manually defining agent structures.

2. **Cross-Platform Runtime**: Runs in Chrome extensions (browser automation), Node.js (server-side), and web browsers. The same core logic, different platform toolkits.

3. **Browser-Native Agents**: `BaseBrowserAgent`, `BaseBrowserLabelsAgent`, `BaseBrowserScreenAgent` — purpose-built agents that can interact with web pages, not just API calls.

4. **Dependency-Aware Parallel Execution**: The workflow DAG enables automatic parallelization — agents without dependencies run simultaneously, a natural optimization from the planning approach.

5. **Auto-Tool Injection**: Tools are added to agents based on the workflow plan's XML structure. If the plan uses `<foreach>`, the agent automatically gets `ForeachTaskTool`. This reduces configuration overhead.

6. **Live Re-Planning**: In expert mode, the system can evaluate partial results and regenerate the remaining workflow, adapting to unexpected outcomes mid-execution.

7. **Execution Lifecycle Controls**: `pauseTask()`, `abortTask()` provide fine-grained control over running workflows — essential for interactive applications.

8. **Lightweight Memory**: The simpler conversation-buffer memory with compression is better suited for browser/extension environments where persistent vector databases aren't available.

---

## Comparison Matrix

| Dimension | crewAI | Eko |
|---|---|---|
| **Language** | Python 3.10+ | TypeScript/JavaScript |
| **Architecture** | Crew (multi-agent team) + Flow (event-driven state machine) | Planner (NL→XML) + Executor (dependency DAG) |
| **Agent Definition** | Declarative (role/goal/backstory) via Pydantic | Dynamic (planned by LLM from task description) |
| **Task Definition** | Explicit `Task` model with description + expected output | LLM-planned `WorkflowAgent` with task description |
| **Orchestration** | Sequential/Hierarchical processes + Flow decorators | Dependency-aware DAG with parallel groups |
| **LLM Support** | 100+ providers via LiteLLM | Vercel AI SDK (`@ai-sdk/provider`) |
| **Tool System** | `BaseTool` Pydantic model + 60+ built-in tools | `Tool` interface + MCP-native + auto-injection |
| **MCP Support** | ✅ Via `MCPServerAdapter` | ✅ First-class, used for tool discovery |
| **A2A Protocol** | ✅ Google A2A spec | ✅ Agent discovery |
| **Memory** | Multi-layer (short/long-term, entity) with embeddings | Conversation buffer with compression |
| **Streaming** | ✅ Crew/Flow streaming output | ✅ Streaming-first (all LLM calls) |
| **Human-in-the-Loop** | `human_input`, `@human_feedback`, `self.ask()` | `HumanInteractTool`, `HumanCallback` |
| **Guardrails** | ✅ Task + agent level, callable or LLM-based | ❌ Not built-in (expert mode quality check) |
| **Parallel Execution** | Flow racing groups + async tasks | DAG-based parallel agent groups |
| **Persistence** | Flow state persistence (SQLite), long-term memory | ❌ No built-in persistence |
| **Training/Eval** | ✅ `train()`, `test()`, `replay()` | ❌ Not built-in |
| **Browser Automation** | ❌ Not built-in | ✅ Chrome extension + browser agents |
| **Re-Planning** | ❌ Static task list (planning is pre-execution) | ✅ Dynamic re-planning during execution |
| **Code Execution** | ✅ Safe (Docker) + unsafe modes | ❌ Not built-in |
| **Output Formats** | Raw, JSON, Pydantic, file | Text results via ToolChain |
| **State Management** | Thread-safe `StateProxy` in Flows | `VariableStorageTool` for cross-agent data |
| **Observability** | Event bus + telemetry | Chain/AgentChain/ToolChain + listeners |
| **Runtime Targets** | Server-side Python | Browser, Node.js, Chrome extension |
| **Maturity** | v1.11.0, 46k+ stars, enterprise-ready | Newer, 4k+ stars, growing |

---

## Summary

**crewAI** is a mature, production-grade Python framework with a rich dual orchestration model. Its Crew layer handles structured multi-agent teamwork (sequential or hierarchical), while its Flow layer enables complex event-driven pipelines with state machines, human feedback, persistence, and sophisticated condition logic. The role-playing agent design, guardrail system, and training/evaluation loop make it well-suited for enterprise AI applications.

**Eko** takes a fundamentally different approach: let the LLM plan the workflow. Users describe tasks in natural language, and the Planner generates an XML workflow with agents, dependencies, and tools. This plan-then-execute model enables automatic parallelization, dynamic re-planning, and minimal configuration. Its cross-platform runtime (browser extension, Node.js, web) and browser-native agents make it uniquely suited for interactive, UI-driven automation tasks.

**Choose crewAI when you need:**
- Production-grade multi-agent orchestration in Python
- Complex event-driven workflows with state management
- Role-based agent specialization with memory/RAG
- Training, evaluation, and iterative improvement
- Enterprise features (guardrails, security, telemetry)

**Choose Eko when you need:**
- Natural language → automated workflow generation
- Browser automation and Chrome extension integration
- Cross-platform (browser/node/web) execution
- Dynamic re-planning and adaptive execution
- Minimal configuration / rapid prototyping with TypeScript

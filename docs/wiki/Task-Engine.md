# Task Engine

The task engine is the heart of Ottomate. It takes a natural language goal and orchestrates a multi-step AI agent loop until the goal is met.

---

## How a Task Works

```
User submits prompt
        │
        ▼
  Task record created (SQLite)
        │
        ▼
  Agent loop begins (SSE stream → browser)
        │
        ├── Think: model generates reasoning + tool calls
        │
        ├── Execute tools in parallel (Promise.all for parallelizable calls)
        │
        ├── Stream results back to UI → Steps tab
        │
        └── Repeat until complete_task tool is called or max steps reached
```

All intermediate steps (tool calls, reasoning, results, errors) are stored in `agent_steps` and streamed to the browser via Server-Sent Events (SSE) on `GET /api/tasks/events?taskId=<id>`.

---

## Creating a Task

**From the home page:**
- Type a goal in the prompt bar
- Optionally: attach files, use a slash command, enable voice input
- Choose a model (or leave on Auto)
- Press Enter or click the send button

**From templates:** navigate to Templates → click Run on any template

**From the API:**
```http
POST /api/tasks
Content-Type: application/json
{
  "prompt": "Research the top 5 competitors of OpenAI and write a report",
  "model": "claude-sonnet-4-6",
  "priority": "medium"
}
```

**Via webhook:** `POST /api/hooks` with your webhook payload (requires `WEBHOOK_SECRET`)

---

## Task Status Lifecycle

```
pending → running → completed
                 → failed
                 → cancelled
```

| Status | Description |
|---|---|
| `pending` | Created but not yet started |
| `running` | Agent loop is actively executing |
| `completed` | `complete_task` tool was called successfully |
| `failed` | Unrecoverable error (max retries exceeded, API down, etc.) |
| `cancelled` | User clicked Stop |

---

## Steps Tab

Every tool call the agent makes is shown in the **Steps** tab of the task detail view:

| Step type | What it shows |
|---|---|
| `tool_call` | Tool name, inputs, and result |
| `message` | Agent reasoning text |
| `error` | Caught exceptions |
| `sub_agent` | Spawned child agent reference |

Each step has: title, status (running / succeeded / failed), duration in ms, and full content expandable on click.

---

## Chat Tab

After a task completes (or while it's running), you can send follow-up messages. The conversation history is appended and the agent continues — re-using the same task context, files, and memory.

---

## Files Tab

Any file the agent writes (`write_file` tool) is attached to the task and shown here with type-aware preview (code, image, audio, video, PDF, markdown, CSV, JSON, …).

---

## Context Budget

Ottomate tracks token usage per task and displays a live **context budget** indicator:

- **Context used** — tokens consumed so far (prompt + tool results + output)
- **Budget** — configurable max token ceiling (set in Settings)
- **Compaction** — when context grows large, the engine automatically summarizes the middle of the conversation (keeps first 2 + last 8 messages) to stay within budget while retaining key facts

Token counts and costs per call are stored in `token_usage` table and surfaced in Analytics.

---

## Priorities

Tasks have four priority levels that affect queue ordering:

| Priority | Use for |
|---|---|
| `low` | Background / non-urgent work |
| `medium` | Default |
| `high` | Time-sensitive tasks |
| `critical` | Urgent — runs first |

---

## Task Sources

| Source | Origin |
|---|---|
| `manual` | User typed it |
| `scheduled` | Triggered by the scheduler |
| `webhook` | Inbound webhook (`/api/hooks`) |
| `template` | Launched from a template |

---

## Sub-Agents

When the primary agent uses the `create_sub_agent` tool, it spawns a child agent with:
- A specialized role (`research`, `code`, `writing`, `data_analysis`, `web_scraper`, `planner`, `reviewer`, `creative`, `general`)
- A focused set of allowed tools
- Its own model selection (role-optimized: research → Gemini 2.0, code → Claude Sonnet, etc.)
- An isolated step log under the parent task

Sub-agents run to completion and return their result as a tool result to the parent agent.

---

## Stopping a Task

Click **Stop** in the task detail view — this calls `POST /api/tasks/{taskId}/stop` which triggers the `AbortController` for that task's running requests. The task status becomes `cancelled`.

---

## Request User Input

The agent can pause and ask for clarification using the `request_user_input` tool. When this happens:
- The task shows a prompt UI in the Chat tab
- The agent pauses until the user replies
- On reply, the conversation resumes from where it paused

---

## Parallel Tool Execution

When the agent returns multiple independent tool calls in a single model response, they are executed with `Promise.all` — simultaneously, not sequentially. This means a task that needs to web search 5 topics runs all 5 queries in parallel, completing ~5x faster.

---

## API Routes for Tasks

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/tasks` | Create a task |
| `GET` | `/api/tasks` | List all tasks (with filters) |
| `GET` | `/api/tasks/{id}` | Get a single task with all steps |
| `POST` | `/api/tasks/{id}/run` | Start / restart a task |
| `POST` | `/api/tasks/{id}/stop` | Cancel a running task |
| `POST` | `/api/tasks/{id}/message` | Send a follow-up chat message |
| `POST` | `/api/tasks/{id}/approve` | Approve a pending user-input pause |
| `DELETE` | `/api/tasks/{id}` | Delete a task and all its data |
| `GET` | `/api/tasks/events` | SSE stream for live task updates |

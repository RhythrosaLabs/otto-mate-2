# Memory & Knowledge

The memory system gives the agent persistent knowledge that survives across tasks, sessions, and restarts.

---

## How Memory Works

Memory is a **key-value store** with tags and importance scoring, backed by the `memory` SQLite table.

The agent interacts with memory using five tools:

| Tool | Description |
|---|---|
| `memory_store` | Store a new fact |
| `memory_recall` | Semantic search for relevant memories |
| `memory_list` | List all memories |
| `memory_update` | Update an existing entry |
| `memory_delete` | Delete an entry |

---

## Memory Table Schema

```sql
CREATE TABLE memory (
  id       TEXT PRIMARY KEY,
  key      TEXT NOT NULL,
  value    TEXT NOT NULL,
  tags     TEXT DEFAULT '[]',     -- JSON array
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

---

## When the Agent Uses Memory

The agent proactively:
- **Reads** memory at the start of tasks (via `memory_recall` with the task topic)
- **Writes** important facts discovered during research or task execution
- **Deletes** outdated or contradicted facts
- **Updates** values when newer information supersedes older

Example automatic memory entries:
- User preferences: `"prefer-output-format": "markdown tables"`
- Facts: `"company:acme-ceo": "John Smith as of 2025"`
- Outcomes: `"best-approach:scraping-cloudflare": "use Steel with stealth mode"`
- Recurring context: `"my-github-username": "JaneDoe"`

---

## Memory Page

The **Memory** page (`/computer/memory`) lets you manage the store manually:

- **Search** — full-text search across keys and values
- **Filter by tag** — click a tag to filter
- **Add entry** — create a key/value/tags entry manually
- **Edit** — update any entry inline
- **Delete** — remove individual entries or bulk-delete

---

## Semantic Memory Engine

The `memory_recall` tool performs semantic search (not just exact key match). The agent passes a natural language query and gets back the most relevant memories ranked by conceptual match.

Memory entries have an **importance score** used to prioritize what to keep during context compaction. High-importance memories (user preferences, critical facts, established patterns) are retained; low-importance transient notes are candidates for deletion.

---

## Agent Learnings

Separate from the user-facing memory store, the agent also maintains an `agent_learnings` table:

| Column | Description |
|---|---|
| `context` | What situation the learning applies to |
| `lesson` | What the agent learned |
| `outcome` | `success`, `partial_success`, `failure`, `error`, `user_correction` |
| `created_at` | When it was learned |

These are used internally to improve tool selection and approach over time.

---

## Memory API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/memory` | List all memories (with optional `search` query param) |
| `POST` | `/api/memory` | Create a memory entry |
| `PUT` | `/api/memory/{id}` | Update a memory entry |
| `DELETE` | `/api/memory/{id}` | Delete a memory entry |

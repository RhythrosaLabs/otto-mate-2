# Sessions

Sessions group related tasks into a named conversation context, allowing the agent to maintain continuity across multiple tasks.

---

## What is a Session?

A session is a named container for tasks that share a common goal or context. Think of it like a project — all tasks in the session can reference each other's outputs, and the agent carries memory of previous tasks in the session forward.

---

## Creating a Session

1. Navigate to **Sessions** (`/computer/sessions`)
2. Click **New Session**
3. Give it a name (e.g., "Q1 Blog Launch", "Customer Analysis Project")
4. Optionally add a description

---

## Adding Tasks to a Session

- When creating a task from the home page: optionally select a session from the session picker
- From a session's detail view: use **Add Task** to create a new task within it
- From an existing task: move it to a session via the task detail menu

---

## Session Context

When a task runs within a session, the agent can:
- Reference outputs from previous tasks in the same session
- Access session-level notes
- Build on prior research, code, or content without repeating work

---

## Sessions Page

Shows all sessions with:
- Name and description
- Task count (total, running, completed, failed)
- Last activity timestamp
- Quick actions: open, rename, delete

---

## Storage

Sessions are stored in the `sessions` SQLite table:

| Column | Description |
|---|---|
| `id` | UUID |
| `name` | Session name |
| `description` | Optional description |
| `task_ids` | JSON array of task IDs in this session |
| `created_at` | — |
| `updated_at` | — |

---

## Session API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/sessions` | List all sessions |
| `POST` | `/api/sessions` | Create a session |
| `PUT` | `/api/sessions/{id}` | Update a session |
| `DELETE` | `/api/sessions/{id}` | Delete a session |

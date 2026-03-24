# Pages Reference

Complete reference for all 25+ pages in the Ottomate application.

---

## Home (`/computer`)

The main task creation interface.

**Prompt bar features:**
- Multi-line text input with `Enter` to submit, `Shift+Enter` for newlines
- File attachment (click paperclip or drag-and-drop)
- Slash command autocomplete (type `/`)
- Voice input (Whisper STT or browser Web Speech API)
- Model picker
- Persona picker

**Gallery examples:** 5 thematic categories ("Build a business", "Create a prototype", "Organize my life", "Help me learn", "Monitor the situation") with 15 pre-written prompt examples. Click any to populate the prompt bar.

**Recent tasks:** Quick links to the last few tasks.

---

## Tasks (`/computer/tasks`)

List of all tasks with:
- **Status filters:** All, Running, Completed, Failed, Pending
- **Search:** full-text search across task titles
- **Sort:** created_at, updated_at, priority
- **Calendar view:** tasks plotted on a monthly calendar by created date
- **Priority indicators:** colored badges
- **Quick actions:** open, delete, re-run

---

## Task Detail (`/computer/tasks/{id}`)

Live execution view with four tabs:

### Steps Tab
Scrolling log of every agent step — tool calls with inputs/outputs, reasoning text, errors, sub-agent spawns. Each step shows: title, status badge, duration, full expandable content.

### Chat Tab
Follow-up conversation — send additional messages to the task. The agent continues from current context. Also shows the `request_user_input` prompt when the agent is waiting.

### Files Tab
All files the agent created — type-aware preview:
- Images: inline preview
- Video/audio: inline player
- Code: syntax-highlighted
- Markdown: rendered
- PDF: iframe viewer
- CSV/JSON: formatted table / tree

### Preview Tab
Full-screen preview of the most recently generated file.

**Token counter:** live tokens used / budget ceiling with a color-coded bar.

---

## Files (`/computer/files`)

Finder-style file browser for all files across all tasks.

**Views:** Icon grid, List, Gallery (media-only)

**Formats supported:** 50+ including PNG, JPG, WEBP, GIF, SVG, MP4, MOV, WEBM, MP3, WAV, OGG, PDF, MD, TXT, HTML, CSS, JS, TS, TSX, JSON, CSV, YAML, ZIP, and more.

**Sidebar filters:**
- All Files
- Images
- Videos
- Audio
- Code
- Documents
- Archives
- Dreamscape (dream-* files)
- Nova / Firefly (nova-*, firefly-* files)
- Uploaded

**Folders:** Create named folders with custom colors, move files into folders. Folder hierarchy is displayed in a collapsible tree.

**Preview pane:** click any file to open a slide-over preview with metadata (size, type, created, source task).

**Source tracking:** Each file knows its `FileSource` — `upload`, `chat`, `agent`, `playground`, `dreamscape`, `app-builder`, `gallery`, `api`.

---

## Documents (`/computer/documents`)

Create and manage text documents with:
- **Rich text editor** (with formatting toolbar: bold, italic, headings, lists, code blocks, links)
- **Spreadsheet editor** (editable data grid)
- **AI writing assistant** — opens a side panel where you can ask the AI to: draft content, edit a selection, summarize, translate, change tone, expand, or condense

Documents are stored in the `documents` SQLite table and are independent of tasks.

---

## Connectors (`/computer/connectors`)

Integration marketplace. See [Connectors](Connectors) wiki page for full documentation.

---

## Skills (`/computer/skills`)

### Browse
270+ pre-built skills across 10 categories:

| Category | Description |
|---|---|
| `code` | Code generation, review, refactor, test writing |
| `writing` | Blog posts, emails, copy, documentation |
| `research` | Deep research, competitive analysis, market research |
| `data` | Data analysis, visualization, ETL, SQL |
| `automation` | Workflow automation, scheduling, webhooks |
| `architecture` | System design, diagrams, technical specs |
| `infrastructure` | DevOps, CI/CD, cloud setup |
| `security` | Pen testing assistance, code audit, compliance |
| `testing` | Test plans, unit tests, E2E tests |
| `custom` | User-created skills |

### Create / Edit
Each skill has:
- **Name** and **description**
- **Instructions** — the system prompt modifier the agent appends when the skill is active
- **Category** — one of the 10 categories above
- **Triggers** — keywords that auto-activate the skill
- **Preset type** — `fast-search`, `pro-search`, `deep-research`, `advanced-deep-research`, or `custom`
- **Model override** — force a specific model
- **Tool restrictions** — limit which tools are available
- **Max steps / Max tokens** — resource limits

### Using Skills
- In the agent prompt, mention the skill name or use a trigger keyword
- The `list_skills` tool lets the agent discover and apply skills programmatically
- Skills can be toggled active/inactive without deleting them

---

## Gallery (`/computer/gallery`)

Community example tasks — pre-built demonstrations of what Ottomate can do. Filter by category, click **Run** to execute immediately.

---

## Video Studio (`/computer/dreamscape/studio`)

See [Media Generation → Dreamscape](Media-Generation#dreamscape--video-studio).

---

## Audio Studio (`/computer/audio-studio`)

See [Media Generation → Audio Studio](Media-Generation#audio-studio).

---

## Image Studio (`/computer/image-studio`)

See [Media Generation → Image Studio](Media-Generation#image-studio).

---

## Creative Suite / Nova (`/computer/firefly`)

See [Media Generation → Nova](Media-Generation#nova--creative-suite).

---

## Channels (`/computer/channels`)

Configure inbound messaging integrations. Each channel, when active, listens for incoming messages and creates a new task automatically.

| Channel | Setup |
|---|---|
| **Telegram** | Enter bot token + webhook URL → Ottomate registers the webhook with Telegram |
| **Discord** | Enter bot token + channel ID → Ottomate listens for mentions |
| **Slack** | Enter bot token + channel ID / Event Subscription URL |
| **WhatsApp** | Enter phone number ID + access token + verify token |

Inbound messages arrive at `/api/channels/{provider}` and trigger task creation.

---

## Pipelines (`/computer/pipelines`)

Visual DAG (directed acyclic graph) pipeline builder.

**Building a pipeline:**
1. Click **Add Node** — enter a task prompt for that node
2. Draw dependency edges by dragging from one node to another
3. Click **Run Pipeline**

Nodes execute in topological order — nodes with no unsatisfied dependencies run in parallel. Each node shows live status (pending → running → completed → failed).

Pipelines are stored in the `pipelines` SQLite table as a JSON graph.

---

## Templates (`/computer/templates`)

Reusable one-click task presets organized by category. Each template has:
- Title and description
- Pre-filled prompt
- Optional model and skill overrides
- Category tag

Click **Run** on any template to execute it immediately as a new task.

---

## Scheduled Tasks (`/computer/scheduled`)

Schedule tasks to run automatically.

| Schedule type | Config |
|---|---|
| **Once** | Date + time (optional delete-after-run) |
| **Interval** | Every N minutes/hours |
| **Daily** | HH:MM time each day |
| **Weekly** | Day of week + HH:MM |
| **Cron** | Full cron expression (e.g. `0 9 * * MON-FRI`) |

Each schedule shows: next run timestamp, last run status, enable/disable toggle.

---

## Memory (`/computer/memory`)

View and manage the agent's long-term memory store.

- **Search:** full-text search across keys and values
- **Add:** manually create memory entries with key, value, and tags
- **Edit / Delete:** update or remove any entry
- **Tags:** filter by tag

Memories are stored in the `memory` SQLite table and retrieved during task execution via the `memory_recall` tool.

---

## Sessions (`/computer/sessions`)

Group related tasks into a named conversation session with shared context.

- Create a session → assign tasks to it
- Session context carries over — tasks within a session can reference outputs of previous tasks
- Sessions are stored in the `sessions` table

---

## Analytics (`/computer/analytics`)

Performance dashboard showing:

- **KPIs:** total tasks, success rate, average duration, total cost estimate
- **Top tools:** usage count and success rate per tool
- **Model usage:** calls per model, average cost per call
- **Daily volume:** bar chart of task count for the last 30 days
- **Recent errors:** last N failed tasks with error messages

Data source: `agent_analytics` table (every agent action logged) + `token_usage` table.

---

## Audit Trail (`/computer/audit`)

Paginated log of every agent action:

- **Filters:** event type, specific tool, success/failure
- **Search:** full-text search across action details
- **Columns:** timestamp, task ID, event type, tool name, duration, success, metadata
- **Export:** download as CSV

Data source: `agent_analytics` table.

---

## Settings (`/computer/settings`)

Global configuration:

| Setting | Description |
|---|---|
| Default model | Model used when task doesn't specify one |
| Max tokens | Context budget ceiling per task |
| Daily cost limit | Soft cap on spend (USD) — warns when exceeded |
| Verbose mode | Show all tool inputs/outputs inline in Steps tab |
| Theme | 14 visual themes (see [Settings → Themes](Settings#themes)) |
| Persona | Default agent persona |
| Health check | Ping `/api/health?detailed=true` and show service status |
| Reset onboarding | Re-run the first-launch wizard |

---

## Onboarding (`/computer/onboarding`)

First-launch wizard:
1. Environment health check (green/yellow/red per provider key)
2. Model selection walkthrough
3. Guided first task
4. Navigation tour

Skipped after first completion. Can be reset from Settings.

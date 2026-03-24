# Analytics & Audit

## Analytics

**URL:** `/computer/analytics`

The analytics dashboard provides visibility into agent performance, resource usage, and error patterns.

---

### KPI Cards

| Metric | Description |
|---|---|
| Total tasks | Number of tasks created in the selected period |
| Success rate | Percentage of tasks with status `completed` |
| Average duration | Mean time from task start to completion |
| Total cost | Estimated total token spend (USD) |

---

### Top Tools

Bar chart showing:
- Usage count per tool (top N by usage)
- Success rate per tool (green = high, red = low)

Useful for identifying bottlenecks (tools that frequently fail) or over-reliance on expensive tools.

---

### Model Usage

Table showing per-model breakdown:
- Number of calls
- Average cost per call
- Total cost contribution
- Average latency

---

### Daily Task Volume

Bar chart of task counts for the **last 30 days**, grouped by day. Shows task volume trends and usage patterns.

---

### Recent Errors

List of the most recent failed tasks with:
- Task title
- Failure time
- Error message / reason

---

## Audit Trail

**URL:** `/computer/audit`

A paginated, searchable log of **every agent action** — every tool call, every model invocation, every task event.

---

### Columns

| Column | Description |
|---|---|
| Timestamp | When the action occurred |
| Task ID | Which task this action belongs to |
| Event type | `tool_call`, `model_call`, `task_start`, `task_complete`, `task_failed`, etc. |
| Tool name | Which tool was called (for `tool_call` events) |
| Duration | How long the action took (ms) |
| Success | ✓ / ✗ |
| Metadata | Expandable JSON with full inputs/outputs |

---

### Filters

- **Event type** — filter to show only tool calls, model calls, etc.
- **Tool** — filter to a specific tool name
- **Status** — success only / failure only / all
- **Search** — full-text search across action details and metadata

---

### Pagination

Results are paginated (50 per page by default). Use Previous/Next buttons or jump to page.

---

### Export

Click **Export CSV** to download the full audit log as a CSV file.

---

## Data Sources

| Dashboard section | Source table |
|---|---|
| KPIs | `tasks` |
| Top tools | `agent_analytics` (event_type = tool_call) |
| Model usage | `token_usage` |
| Daily volume | `tasks` (grouped by date) |
| Recent errors | `tasks` (status = failed) |
| Audit trail | `agent_analytics` |

---

## API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/analytics` | Get aggregated analytics summary |
| `GET` | `/api/audit` | List audit log entries (with filters + pagination) |
| `GET` | `/api/usage` | Get token usage summary |

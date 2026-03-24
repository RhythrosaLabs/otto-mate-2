# Tools Reference

The agent has access to 25 built-in tools. These are defined in `src/lib/agent.ts` and dispatched via JSON-schema function calling on all supported providers.

Parallelizable tools are batched with `Promise.all` — the agent can call multiple tools simultaneously in a single turn.

---

## Web & Research

### `web_search`
Performs a web search using the best available provider (Brave → Serper → Tavily → DuckDuckGo fallback).

| Input | Type | Description |
|---|---|---|
| `query` | string | Search query |
| `num_results` | number | Number of results to return (default 5) |
| `search_type` | string | `"general"`, `"news"`, `"images"` |

### `scrape_url`
Fetches a URL and returns the cleaned text content. Uses Cheerio for HTML parsing server-side.

| Input | Type | Description |
|---|---|---|
| `url` | string | URL to fetch |
| `selector` | string? | CSS selector to extract (optional) |

### `browse_web`
Full browser automation using Playwright (or Steel cloud Chrome). Supports multi-step action sequences.

| Input | Type | Description |
|---|---|---|
| `url` | string | Starting URL |
| `actions` | array? | Sequence of browser actions (see below) |
| `extract_selector` | string? | CSS selector to extract after actions |
| `screenshot` | boolean | Take a screenshot and return it |

**Browser action types:** `goto`, `click`, `type`, `fill`, `select`, `wait`, `scroll`, `press`, `hover`, `evaluate`, `extract`, `screenshot`, `pdf`, `wait_for_navigation`, `back`, `forward`, `reload`

### `deep_research`
Spawns a focused research sub-agent that performs exhaustive multi-source research and synthesizes a structured report.

| Input | Type | Description |
|---|---|---|
| `topic` | string | Research topic |
| `depth` | string | `"quick"`, `"standard"`, `"deep"` (default `"deep"`) |
| `focus_areas` | string[] | Specific aspects to focus on |
| `output_format` | string | `"report"`, `"bullets"`, `"table"` |

### `finance_data`
Fetches real-time and historical financial data.

| Input | Type | Description |
|---|---|---|
| `query_type` | string | `"stock_quote"`, `"company_financials"`, `"earnings"`, `"economic_indicator"`, `"forex"`, `"crypto"` |
| `symbol` | string | Ticker symbol (e.g. `"AAPL"`) |
| `query` | string | Natural language query (for economic indicators) |
| `period` | string | Time period (e.g. `"1mo"`, `"1y"`) |

---

## Code & Files

### `execute_code`
Runs code in a subprocess and returns stdout/stderr. Supports Python, Node.js, and shell.

| Input | Type | Description |
|---|---|---|
| `language` | string | `"python"`, `"javascript"`, `"shell"` |
| `code` | string | Code to execute |
| `timeout` | number | Timeout in seconds (default 30) |

> Security: code runs through `sandbox-executor.ts` which validates content and rejects dangerous patterns before execution.

### `sandbox_execute`
Execute code in a stricter sandbox with additional security validation (same languages, more restrictive).

### `write_file`
Creates or overwrites a file attached to the current task. Saved to `./task-files/{taskId}/`.

| Input | Type | Description |
|---|---|---|
| `filename` | string | File name (e.g. `"report.md"`) |
| `content` | string | File content |
| `mime_type` | string? | MIME type (auto-detected if omitted) |

### `read_file`
Reads a file attached to the current task.

| Input | Type | Description |
|---|---|---|
| `filename` | string | File name to read |

### `list_files`
Returns a list of all files attached to the current task.

### `organize_files`
Create folders, move files into folders, or list all files with folder structure.

| Input | Type | Description |
|---|---|---|
| `action` | string | `"create_folder"`, `"move_to_folder"`, `"list_all_files"` |
| `folder_name` | string? | Name for new folder |
| `parent_folder_id` | string? | Parent folder ID |
| `file_names` | string[]? | Files to move |
| `target_folder_id` | string? | Destination folder |

---

## Media Generation

### `generate_image`
Generates an image using DALL-E 3 (or falls back to Replicate FLUX Schnell).

| Input | Type | Description |
|---|---|---|
| `prompt` | string | Image description |
| `size` | string | `"1024x1024"`, `"1792x1024"`, `"1024x1792"` |
| `style` | string | `"vivid"` or `"natural"` |
| `filename` | string | Output filename |

### `replicate_run`
Run any Replicate model by name with custom parameters. Used for FLUX variants, MusicGen, video models, face-swap, upscale, background removal, etc.

| Input | Type | Description |
|---|---|---|
| `prompt` | string | Model prompt |
| `model` | string? | Replicate model ID (e.g. `"black-forest-labs/flux-schnell"`) |
| `params` | object? | Additional model-specific parameters |

### `dream_machine`
Generate video using Luma Dream Machine. Supports multi-shot production workflows with storyboards.

| Input | Type | Description |
|---|---|---|
| `board_name` | string | Storyboard name |
| `shots` | DreamShot[] | Array of shot definitions |
| `provider` | string | `"luma"`, `"replicate"`, or `"auto"` |

---

## Memory

### `memory_store`
Store a key-value fact in long-term memory. Persists across tasks.

| Input | Type | Description |
|---|---|---|
| `key` | string | Memory key |
| `value` | string | Value to store |
| `tags` | string[] | Tags for organization |

### `memory_recall`
Semantic search over stored memories.

| Input | Type | Description |
|---|---|---|
| `query` | string | What to search for |
| `limit` | number | Max results (default 5) |

### `memory_list`
Returns all memory entries (up to a limit).

### `memory_delete`
Deletes a memory entry by ID.

| Input | Type | Description |
|---|---|---|
| `id` | string | Memory entry ID |
| `reason` | string | Reason for deletion (logged) |

### `memory_update`
Updates an existing memory entry.

| Input | Type | Description |
|---|---|---|
| `key` | string | Key to update |
| `value` | string | New value |
| `tags` | string[]? | Updated tags |

---

## Communication

### `send_email`
Send an email via connected email provider (Gmail, Outlook, Resend, SendGrid).

| Input | Type | Description |
|---|---|---|
| `to` | string | Recipient email |
| `subject` | string | Subject line |
| `body` | string | Email body (HTML or plain text) |
| `from` | string? | Sender (optional, uses account default) |

### `social_media_post`
Post to social media (Twitter/X, LinkedIn, Facebook, Instagram, Reddit, TikTok, Pinterest) via browser automation or API.

---

## Connectors & Services

### `connector_call`
Invoke any configured connector action. This is the universal bridge to all 190+ integrated services.

| Input | Type | Description |
|---|---|---|
| `connector_id` | string | Connector ID (e.g. `"slack"`, `"github"`, `"stripe"`) |
| `action` | string | Action name specific to the connector |
| `params` | object | Action parameters |

### `execute_connector`
Lower-level connector execution with direct HTTP request support for custom/unlisted connectors.

---

## Agent Control

### `create_sub_agent`
Spawn a specialized child agent for focused parallel work.

| Input | Type | Description |
|---|---|---|
| `title` | string | Sub-task title |
| `agent_type` | string | Role: `"research"`, `"code"`, `"writing"`, `"data_analysis"`, `"web_scraper"`, `"planner"`, `"reviewer"`, `"creative"`, `"general"` |
| `instructions` | string | Detailed instructions for the sub-agent |
| `context` | string? | Context to pass |
| `model` | string? | Override model (defaults to role-optimal) |

### `list_skills`
Returns the list of installed skills the agent can use as behavior templates.

### `request_user_input`
Pause the task and ask the user a question before continuing.

| Input | Type | Description |
|---|---|---|
| `question` | string | Question to ask the user |
| `options` | string[]? | Optional predefined answer options |
| `context` | string? | Context to explain why input is needed |

### `complete_task`
Signal task completion. Always the final tool call.

| Input | Type | Description |
|---|---|---|
| `summary` | string | Human-readable summary of what was done |
| `files_created` | string[] | Names of files created |
| `add_to_gallery` | boolean | Whether to add to the gallery |

---

## Computer Use

### `computer_use`
Control the macOS (or Linux) desktop directly.

| Input | Type | Description |
|---|---|---|
| `action` | string | `"screenshot"`, `"click"`, `"type"`, `"key"`, `"scroll"`, `"move"`, `"run_script"` |
| `x`, `y` | number? | Screen coordinates |
| `text` | string? | Text to type |
| `script` | string? | AppleScript or shell script to run |

**macOS tools used:** `screencapture` (screenshots), `cliclick` (mouse/keyboard), AppleScript (app control)  
**Linux tools used:** `scrot` (screenshots), `xdotool` (mouse/keyboard)

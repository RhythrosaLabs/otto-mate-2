# Skills & Templates

## Skills

Skills are reusable agent behavior configurations — like custom system prompts that modify how the agent approaches a task.

---

### What a Skill Contains

| Field | Description |
|---|---|
| `name` | Display name |
| `description` | What the skill does |
| `instructions` | System prompt modifier — appended to the agent's base prompt |
| `category` | One of 10 categories (see below) |
| `triggers` | Keywords that auto-activate the skill during a task |
| `preset_type` | `fast-search`, `pro-search`, `deep-research`, `advanced-deep-research`, `custom` |
| `model` | Optional model override (forces a specific model when skill is active) |
| `tools` | Optional tool whitelist (restricts which tools are available) |
| `max_steps` | Optional step limit for the skill |
| `max_tokens` | Optional token budget for the skill |

---

### Skill Categories

| Category | Examples |
|---|---|
| `code` | Code generation, refactoring, code review, test writing, debugging |
| `writing` | Blog posts, marketing copy, email drafting, documentation |
| `research` | Market research, competitive analysis, literature review, fact-checking |
| `data` | Data analysis, SQL generation, CSV parsing, dashboard creation |
| `automation` | Workflow automation, API integrations, scheduling, webhook setup |
| `architecture` | System design, ERD diagrams, technical specifications, ADRs |
| `infrastructure` | CI/CD pipelines, Docker setup, cloud configuration, DevOps |
| `security` | Security audits, OWASP review, pen testing guidance, dependency scanning |
| `testing` | Test plans, unit tests, E2E test scripts, load testing |
| `custom` | User-created skills |

---

### Marketplace

274+ pre-built skills are available in the marketplace (`/computer/skills`). Browse by category, search by name, and install any skill with one click. Installed skills are saved to your local `skills` SQLite table.

---

### Creating a Custom Skill

1. Navigate to **Skills** → click **New Skill**
2. Fill in name, description, and instructions
3. Choose category
4. Optionally set triggers, model override, tool restrictions, and resource limits
5. Click **Save**

The agent will use the skill's instructions when activated.

---

### Activating a Skill

Three ways:
1. **Mention it** — type the skill name in a task prompt
2. **Trigger keywords** — if the prompt contains a trigger keyword, the skill auto-applies
3. **`list_skills` tool** — the agent can list and select skills programmatically
4. **Manual selection** — in the prompt bar skill picker (if shown)

Multiple skills can be active simultaneously — their instructions are concatenated.

---

### Skill API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/skills` | List all skills |
| `POST` | `/api/skills` | Create a skill |
| `GET` | `/api/skills/{id}` | Get a skill |
| `PUT` | `/api/skills/{id}` | Update a skill |
| `DELETE` | `/api/skills/{id}` | Delete a skill |
| `POST` | `/api/skills/convert` | Convert skill format (between presets) |

---

## Templates

Templates are one-click task presets. They're like saved prompts with optional configuration overrides.

---

### What a Template Contains

| Field | Description |
|---|---|
| `title` | Template name |
| `description` | What it does |
| `prompt` | Pre-filled task prompt |
| `category` | Organizational tag |
| `model` | Optional model override |
| `skill_id` | Optional skill to activate |
| `tags` | Searchable tags |

---

### Using Templates

1. Navigate to **Templates** (`/computer/templates`)
2. Browse or search for a template
3. Click **Run** — a new task is created immediately with the template's prompt and config

---

### Creating Templates

From the Templates page → **New Template** → fill in prompt and config.

You can also save any task as a template from the task detail view.

---

### Template API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/templates` | List all templates |
| `POST` | `/api/templates` | Create a template |
| `DELETE` | `/api/templates/{id}` | Delete a template |

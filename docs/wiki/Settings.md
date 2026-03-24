# Settings

**URL:** `/computer/settings`

---

## Agent Settings

| Setting | Description | Default |
|---|---|---|
| Default model | Model used when a task doesn't specify one | `auto` |
| Default persona | Agent persona applied to all tasks | `balanced` |
| Max tokens per task | Context budget ceiling | (provider default) |
| Daily cost limit | Soft cap on estimated spend in USD — shows warning when exceeded | (unlimited) |
| Verbose mode | Show full tool input/output in the Steps tab (instead of collapsed) | off |

---

## Themes

14 built-in visual themes. Select via the theme picker in Settings (or the dropdown in the sidebar header).

| Theme | Style |
|---|---|
| **Default** | Nova-inspired violet gradient (dark) |
| **Midnight** | Deep dark blue-black |
| **Matrix** | Terminal green on black |
| **Aurora** | Purple/teal aurora borealis |
| **Monochrome** | Grayscale, minimal |
| **Sunset** | Warm orange/pink gradients |
| **Ocean** | Cool blues and teals |
| **Forest** | Deep greens |
| **Cherry Blossom** | Soft pink and white |
| **Lavender** | Purple/lavender pastel |
| **Neon Nights** | Vivid neon on dark |
| **Retro Terminal** | Amber/green CRT terminal look |
| **Nordic** | Cool Scandinavian blues and greys |
| **Light** | Clean bright white |

Theme preference is stored in `localStorage` under `ottomate_theme` and applied via CSS custom properties on `<html data-theme="...">`.

### Theme CSS Variables

Each theme defines these CSS custom properties:
```css
--bg           /* Page background */
--sidebar      /* Sidebar background */
--card         /* Card/panel background */
--border       /* Border color */
--text         /* Primary text */
--muted        /* Secondary/muted text */
--accent       /* Accent/interactive color */
--accent-hover /* Hover state for accent */
```

---

## Personas

Select your default agent persona from the persona picker in Settings or the prompt bar. See [AI Models → Agent Personas](AI-Models#agent-personas) for full descriptions.

| Persona | Icon |
|---|---|
| Balanced | ⚖️ |
| Creative | 🎨 |
| Analytical | 🔬 |
| Concise | ⚡ |
| Code Expert | 💻 |
| Deep Researcher | 🔍 |
| Teacher | 📚 |
| Executive | 👔 |

Persona preference is stored in `localStorage` under `ottomate_persona`.

---

## Health Check

The Settings page includes a live **Health Check** panel (or navigate to `/api/health?detailed=true` directly):

- Pings all configured providers
- Shows `healthy` / `degraded` / `down` / `unconfigured` per service
- Displays latency for services that support it
- Shows system info: Node version, memory usage, process ID, uptime

---

## Onboarding Reset

Click **Reset onboarding** to re-run the first-launch wizard. Useful for new team members or reviewing initial setup.

---

## Settings Storage

Global settings are stored as key-value entries in the `settings` SQLite table.

| Key | Description |
|---|---|
| `default_model` | Default model ID |
| `default_persona` | Default persona ID |
| `max_tokens` | Token budget |
| `daily_cost_limit` | Daily cost ceiling |
| `verbose_mode` | `"true"` / `"false"` |
| `onboarding_complete` | `"true"` once wizard is done |

---

## Settings API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/settings` | Get all settings as key-value object |
| `POST` | `/api/settings` | Update one or more settings |

# Scheduling

Ottomate includes a built-in scheduler that runs tasks automatically on a configurable cadence.

---

## Schedule Types

| Type | Description | Config |
|---|---|---|
| `once` | Run one time at a specific datetime | ISO datetime string; optional `delete_after_run` |
| `interval` | Run every N minutes or hours | `interval_minutes` (e.g. 60 = every hour) |
| `daily` | Run every day at a specific time | `time` in `HH:MM` format |
| `weekly` | Run on a specific weekday + time | `day_of_week` (0=Sun–6=Sat) + `time` |
| `cron` | Full cron expression | Standard 5-field cron (`0 9 * * MON-FRI`) |

---

## Creating a Scheduled Task

1. Navigate to **Scheduled** (`/computer/scheduled`)
2. Click **New Schedule**
3. Enter the task prompt
4. Choose schedule type and configure timing
5. Optionally choose a model, skill, or priority
6. Save

---

## Managing Schedules

Each schedule in the list shows:
- **Name / prompt** — what task will run
- **Schedule** — human-readable description (e.g. "Daily at 09:00")
- **Next run** — exact datetime of the next execution
- **Last run** — datetime + status of the most recent run
- **Enable/Disable toggle** — pause without deleting

---

## How the Scheduler Works

The scheduler is implemented in `src/lib/scheduler.ts`. It:
1. Runs as a background polling loop when the Next.js server is active
2. On each tick, queries all enabled `scheduled_tasks` where `next_run <= now()`
3. For each due task: creates a new `Task` record and starts the agent loop
4. Updates `last_run`, `last_run_status`, and computes `next_run` based on the schedule type

The scheduler starts automatically with the Next.js dev/prod server — no separate process needed.

---

## Cron Expression Reference

```
┌───────── minute (0–59)
│ ┌─────── hour (0–23)
│ │ ┌───── day of month (1–31)
│ │ │ ┌─── month (1–12)
│ │ │ │ ┌─ day of week (0–6, Sun=0)
│ │ │ │ │
* * * * *
```

| Example | Meaning |
|---|---|
| `0 9 * * MON-FRI` | 9am every weekday |
| `0 */4 * * *` | Every 4 hours |
| `30 8 1 * *` | 8:30am on the 1st of each month |
| `0 0 * * 0` | Midnight every Sunday |
| `*/15 * * * *` | Every 15 minutes |

---

## Scheduled Task API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/scheduled-tasks` | List all schedules |
| `POST` | `/api/scheduled-tasks` | Create a schedule |
| `PUT` | `/api/scheduled-tasks/{id}` | Update a schedule |
| `DELETE` | `/api/scheduled-tasks/{id}` | Delete a schedule |
| `PATCH` | `/api/scheduled-tasks/{id}/toggle` | Enable/disable |

---

## Storage

Schedules are stored in the `scheduled_tasks` table:

| Column | Description |
|---|---|
| `id` | UUID |
| `name` | Display name |
| `prompt` | Task prompt to execute |
| `schedule_type` | `once`, `interval`, `daily`, `weekly`, `cron` |
| `config` | JSON blob with type-specific config |
| `enabled` | 1/0 |
| `next_run` | ISO datetime of next execution |
| `last_run` | ISO datetime of last execution |
| `last_run_status` | `completed`, `failed`, `running` |
| `created_at` | — |

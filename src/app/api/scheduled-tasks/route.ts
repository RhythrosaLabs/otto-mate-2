import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import {
  createScheduledTask,
  listScheduledTasks,
  getDueScheduledTasks,
  updateScheduledTaskLastRun,
  deleteScheduledTask,
  toggleScheduledTask,
  createTask,
} from "@/lib/db";
import { runAgent } from "@/lib/agent";
import type { ScheduledTask } from "@/lib/types";

// GET /api/scheduled-tasks — list all scheduled tasks
export async function GET() {
  try {
    const tasks = listScheduledTasks();
    return NextResponse.json(tasks);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST /api/scheduled-tasks — create a new scheduled task
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, prompt, schedule_type, schedule_expr, next_run_at, model, delete_after_run } = body;

    if (!name || !prompt) {
      return NextResponse.json({ error: "name and prompt are required" }, { status: 400 });
    }

    const scheduledTask = createScheduledTask({
      id: uuidv4(),
      name,
      prompt,
      schedule_type: schedule_type || "once",
      schedule_expr: schedule_expr || undefined,
      next_run_at: next_run_at || new Date().toISOString(),
      enabled: true,
      model: model || "auto",
      delete_after_run: delete_after_run || false,
    });

    return NextResponse.json(scheduledTask, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// PATCH /api/scheduled-tasks — toggle or run due tasks
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, id, enabled } = body;

    if (action === "toggle" && id !== undefined) {
      toggleScheduledTask(id, enabled ?? true);
      return NextResponse.json({ ok: true });
    }

    if (action === "run-due") {
      const dueTasks = getDueScheduledTasks();
      const results: Array<{ id: string; name: string; task_id: string }> = [];

      for (const st of dueTasks) {
        // Create a real task from the scheduled task
        const taskId = uuidv4();
        const now = new Date().toISOString();
        createTask({
          id: taskId,
          title: `[Scheduled] ${st.name}`,
          prompt: st.prompt,
          description: st.prompt,
          status: "pending",
          priority: "medium",
          model: (st.model || "auto") as "auto",
          created_at: now,
          updated_at: now,
        });

        // Compute next run time
        const nextRun = computeNextRun(st);
        updateScheduledTaskLastRun(st.id, nextRun);

        // Delete if one-shot and configured to delete
        if (st.delete_after_run && st.schedule_type === "once") {
          deleteScheduledTask(st.id);
        }

        // Fire and forget the agent run
        runAgent({ taskId, userMessage: st.prompt, model: st.model as "auto" }).catch(() => {});

        results.push({ id: st.id, name: st.name, task_id: taskId });
      }

      return NextResponse.json({ ran: results.length, results });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// DELETE /api/scheduled-tasks — delete a scheduled task
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    deleteScheduledTask(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// Helper: compute next run time based on schedule type
function computeNextRun(st: ScheduledTask): string | null {
  const now = Date.now();
  switch (st.schedule_type) {
    case "once":
      return null; // One-shot, disable after run
    case "interval": {
      const intervalMs = parseInt(st.schedule_expr || "3600000", 10); // default 1 hour
      return new Date(now + intervalMs).toISOString();
    }
    case "daily": {
      // Run at the same time tomorrow
      const next = new Date(now + 24 * 60 * 60 * 1000);
      if (st.schedule_expr) {
        // schedule_expr is "HH:MM" format
        const [h, m] = st.schedule_expr.split(":").map(Number);
        next.setHours(h, m, 0, 0);
        if (next.getTime() <= now) next.setDate(next.getDate() + 1);
      }
      return next.toISOString();
    }
    case "weekly": {
      return new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
    }
    case "cron": {
      // Simple cron: just add 1 hour as fallback (full cron parsing would need a library)
      return new Date(now + 60 * 60 * 1000).toISOString();
    }
    default:
      return null;
  }
}

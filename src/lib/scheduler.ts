/**
 * Background Task Scheduler
 * 
 * Automatically polls for due scheduled tasks and executes them.
 * Inspired by Perplexity Computer's long-running workflow capability —
 * "entire workflows, capable of running for hours or months."
 * 
 * This runs as a singleton interval in the Node.js process.
 */

import { getDueScheduledTasks, updateScheduledTaskLastRun, deleteScheduledTask, createTask, getDb } from "./db";
import { runAgent } from "./agent";
import { v4 as uuidv4 } from "uuid";
import type { ScheduledTask } from "./types";

const POLL_INTERVAL_MS = 60_000; // Check every 60 seconds
let schedulerInterval: ReturnType<typeof setInterval> | null = null;

function computeNextRun(st: ScheduledTask): string | null {
  const now = Date.now();
  switch (st.schedule_type) {
    case "once":
      return null;
    case "interval": {
      const intervalMs = parseInt(st.schedule_expr || "3600000", 10);
      return new Date(now + intervalMs).toISOString();
    }
    case "daily": {
      const next = new Date(now + 24 * 60 * 60 * 1000);
      if (st.schedule_expr) {
        const [h, m] = st.schedule_expr.split(":").map(Number);
        next.setHours(h, m, 0, 0);
        if (next.getTime() <= now) next.setDate(next.getDate() + 1);
      }
      return next.toISOString();
    }
    case "weekly":
      return new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
    case "cron":
      return new Date(now + 60 * 60 * 1000).toISOString();
    default:
      return null;
  }
}

async function runDueTasks(): Promise<void> {
  // Use database-level locking to prevent overlapping runs across concurrent invocations
  const db = getDb();
  const acquired = db.transaction(() => {
    // Create lock table if not exists
    db.exec(`CREATE TABLE IF NOT EXISTS scheduler_lock (id INTEGER PRIMARY KEY CHECK(id = 1), locked_at TEXT)`);
    const row = db.prepare("SELECT locked_at FROM scheduler_lock WHERE id = 1").get() as { locked_at: string } | undefined;
    if (row) {
      // If lock is older than 5 minutes, assume stale and reclaim
      const lockedAt = new Date(row.locked_at).getTime();
      if (Date.now() - lockedAt < 5 * 60 * 1000) return false;
    }
    db.prepare("INSERT OR REPLACE INTO scheduler_lock (id, locked_at) VALUES (1, ?)").run(new Date().toISOString());
    return true;
  })();

  if (!acquired) return;

  try {
    const dueTasks = getDueScheduledTasks();

    console.log(`[scheduler] Found ${dueTasks.length} due task(s). Executing...`);

    for (const st of dueTasks) {
      try {
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

        const nextRun = computeNextRun(st);
        updateScheduledTaskLastRun(st.id, nextRun);

        if (st.delete_after_run && st.schedule_type === "once") {
          deleteScheduledTask(st.id);
        }

        // Run agent in background
        runAgent({ taskId, userMessage: st.prompt, model: st.model as "auto" }).catch((err) => {
          console.error(`[scheduler] Task ${taskId} (${st.name}) failed:`, err);
        });

        console.log(`[scheduler] Started task ${taskId} for scheduled: "${st.name}"`);
      } catch (err) {
        console.error(`[scheduler] Error processing scheduled task ${st.id}:`, err);
      }
    }
  } catch (err) {
    console.error("[scheduler] Error in runDueTasks:", err);
  } finally {
    // Release the database lock
    try { getDb().prepare("DELETE FROM scheduler_lock WHERE id = 1").run(); } catch { /* best-effort */ }
  }
}

/**
 * Start the background scheduler. Safe to call multiple times — only one interval runs.
 */
export function startScheduler(): void {
  if (schedulerInterval) return;

  console.log(`[scheduler] Starting background scheduler (poll every ${POLL_INTERVAL_MS / 1000}s)`);
  schedulerInterval = setInterval(runDueTasks, POLL_INTERVAL_MS);

  // Also run immediately on startup
  runDueTasks().catch(console.error);
}

/**
 * Stop the background scheduler.
 */
export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("[scheduler] Background scheduler stopped");
  }
}

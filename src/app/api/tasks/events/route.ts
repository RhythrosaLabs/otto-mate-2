import { NextRequest } from "next/server";
import { listTasksSummary } from "@/lib/db";
import type { TaskSummary } from "@/lib/db";
import { startScheduler } from "@/lib/scheduler";

export const dynamic = "force-dynamic";

// Start background scheduler on first import (singleton)
startScheduler();

// GET /api/tasks/events — Global SSE endpoint for task status changes
// Clients connect and receive updates whenever a task status changes
export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let closed = false;

  function send(data: object) {
    if (closed) return;
    try {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    } catch {
      closed = true;
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      controller = ctrl;

      // Send initial snapshot (lightweight — no N+1 hydration)
      const active = listTasksSummary(100);
      send({ type: "snapshot", tasks: active });

      // Poll DB for changes every 1.5s and push diffs
      let lastStates = new Map<string, string>(
        active.map((t) => [t.id, `${t.status}:${t.steps_count}:${t.files_count}`])
      );

      const interval = setInterval(() => {
        if (closed) {
          clearInterval(interval);
          return;
        }
        try {
          const current = listTasksSummary(100);
          const currentIds = new Set<string>();

          for (const t of current) {
            currentIds.add(t.id);
            const key = `${t.status}:${t.steps_count}:${t.files_count}`;
            const prev = lastStates.get(t.id);
            if (prev === undefined) {
              // New task
              send({ type: "new", task: t });
            } else if (prev !== key) {
              // Updated task
              send({ type: "update", task: t });
            }
          }

          // Detect deleted tasks
          for (const [id] of lastStates) {
            if (!currentIds.has(id)) {
              send({ type: "deleted", id });
            }
          }

          lastStates = new Map(current.map((t) => [t.id, `${t.status}:${t.steps_count}:${t.files_count}`]));
        } catch {
          // DB error — skip this tick
        }
      }, 1500);

      // Heartbeat every 15s to keep connection alive
      const heartbeat = setInterval(() => {
        if (closed) {
          clearInterval(heartbeat);
          return;
        }
        send({ type: "heartbeat", ts: Date.now() });
      }, 15000);
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

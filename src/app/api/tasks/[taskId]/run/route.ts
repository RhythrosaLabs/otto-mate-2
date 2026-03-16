import { NextRequest } from "next/server";
import { getTask, updateTaskStatus, listSkills } from "@/lib/db";
import { runAgent } from "@/lib/agent";
import { runningTasks } from "@/lib/running-tasks";
import type { AgentStep, ModelId } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min max on serverless; for local dev this is unlimited

// POST /api/tasks/[taskId]/run — starts agent and streams steps via SSE
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const task = getTask(taskId);
  if (!task) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }

  const body = await req.json().catch(() => ({})) as { message?: string; model?: ModelId };
  const userMessage = body.message || task.prompt;
  const model = body.model;

  // Build skills context string from active skills
  const activeSkills = listSkills().filter(s => s.is_active);
  const skills = activeSkills.length > 0
    ? activeSkills.map(s => `${s.name}: ${s.description}`).join("\n")
    : undefined;

  // Create AbortController for this run
  const abortController = new AbortController();
  runningTasks.set(taskId, abortController);

  // Mark task as running (agent will also do this, but signal early)
  updateTaskStatus(taskId, "running");

  // Set up SSE stream
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;

  function send(data: object) {
    try {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    } catch { /* client disconnected */ }
  }

  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      controller = ctrl;
    },
    cancel() {
      // Client disconnected — abort the agent run
      abortController.abort();
      runningTasks.delete(taskId);
    },
  });

  // Run agent asynchronously
  (async () => {
    try {
      await runAgent({
        taskId,
        userMessage,
        skills,
        model,
        signal: abortController.signal,
        onStep: (step: AgentStep) => {
          send({ type: "step", step });
        },
        onToken: (token: string) => {
          send({ type: "token", token });
        },
      });
      // Agent completed (status already updated inside runAgent)
      const finalTask = getTask(taskId);
      if (finalTask) send({ type: "update", task: finalTask });
    } catch (err) {
      if (abortController.signal.aborted) {
        updateTaskStatus(taskId, "paused");
        const updatedTask = getTask(taskId);
        if (updatedTask) send({ type: "update", task: updatedTask });
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        send({ type: "error", error: msg });
        updateTaskStatus(taskId, "failed");
        const updatedTask = getTask(taskId);
        if (updatedTask) send({ type: "update", task: updatedTask });
      }
    } finally {
      runningTasks.delete(taskId);
      try {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch { /* stream already closed */ }
    }
  })();

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

import { NextRequest } from "next/server";
import { getTask, updateTaskStatus, listSkills, incrementTaskUsage, getUserApiKeysRaw } from "@/lib/db";
import { runAgent } from "@/lib/agent";
import { runningTasks, registerRunningTask, unregisterRunningTask } from "@/lib/running-tasks";
import type { AgentStep, ModelId } from "@/lib/types";
import { getSessionFromRequest, decryptApiKey } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min max on serverless; for local dev this is unlimited

// POST /api/tasks/[taskId]/run — starts agent and streams steps via SSE
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const session = await getSessionFromRequest(req);
  const userId = session?.userId;

  const task = await getTask(taskId);
  if (!task) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }

  // Prevent concurrent runs on the same task
  if (task.status === "running" || runningTasks.has(taskId)) {
    return new Response(JSON.stringify({ error: "Task is already running" }), { status: 409 });
  }

  // Tier limit check
  if (userId) {
    const usage = await incrementTaskUsage(userId);
    if (!usage.allowed) {
      return new Response(JSON.stringify({
        error: `Monthly task limit reached (${usage.limit} tasks). Upgrade your plan at /pricing.`,
      }), { status: 429 });
    }
  }

  const body = await req.json().catch(() => ({})) as { message?: string; model?: ModelId };
  const userMessage = body.message || task.prompt;
  const model = body.model;

  // Build skills context string from active skills
  const activeSkills = (await listSkills(userId)).filter(s => s.is_active);
  const skills = activeSkills.length > 0
    ? activeSkills.map(s => `${s.name}: ${s.description}`).join("\n")
    : undefined;

  // Load user's own API keys (decrypt them)
  let apiKeys: Record<string, string> = {};
  if (userId) {
    const raw = await getUserApiKeysRaw(userId);
    for (const [k, v] of Object.entries(raw)) {
      try { apiKeys[k] = decryptApiKey(v); } catch { /* skip malformed */ }
    }
  }

  // Create AbortController for this run
  const abortController = new AbortController();
  registerRunningTask(taskId, abortController);

  // Mark task as running (agent will also do this, but signal early)
  await updateTaskStatus(taskId, "running");

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
      unregisterRunningTask(taskId);
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
        apiKeys,
        onStep: (step: AgentStep) => {
          send({ type: "step", step });
        },
        onToken: (token: string) => {
          send({ type: "token", token });
        },
      });
      // Agent completed (status already updated inside runAgent)
      const finalTask = await getTask(taskId);
      if (finalTask) send({ type: "update", task: finalTask });
    } catch (err) {
      if (abortController.signal.aborted) {
        await updateTaskStatus(taskId, "paused");
        const updatedTask = await getTask(taskId);
        if (updatedTask) send({ type: "update", task: updatedTask });
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        send({ type: "error", error: msg });
        await updateTaskStatus(taskId, "failed");
        const updatedTask = await getTask(taskId);
        if (updatedTask) send({ type: "update", task: updatedTask });
      }
    } finally {
      unregisterRunningTask(taskId);
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

import { NextRequest, NextResponse } from "next/server";
import { createTask, listTasks, listTasksBySource, getTask } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import type { ModelId, TaskPriority, TaskSource } from "@/lib/types";
import { callLLMLightweight } from "@/lib/model-fallback";
import { CreateTaskSchema, parseBody } from "@/lib/schemas";
import { safeErrorMessage } from "@/lib/constants";

export const dynamic = "force-dynamic";

/**
 * Generate a concise task title from the prompt using a lightweight LLM call.
 * Uses the centralized fallback system — tries all available providers.
 * Falls back to truncated prompt if all providers fail.
 */
async function generateTitle(prompt: string): Promise<string> {
  const fallback = prompt.length > 80 ? prompt.slice(0, 77) + "..." : prompt;
  try {
    const title = await callLLMLightweight({
      system: "Generate a concise 3-8 word task title for the following request. Return ONLY the title, no quotes or punctuation.",
      userMessage: prompt.slice(0, 500),
      maxTokens: 30,
    });
    return title && title.length > 0 && title.length < 100 ? title : fallback;
  } catch {
    return fallback;
  }
}

// GET /api/tasks — list all tasks (supports ?source= filter for session isolation)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? undefined;
  const source = searchParams.get("source") ?? undefined;
  const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : undefined;
  
  if (source) {
    const tasks = listTasksBySource(source, limit);
    return NextResponse.json(tasks);
  }
  
  const tasks = listTasks(status ?? undefined, limit);
  return NextResponse.json(tasks);
}

// POST /api/tasks — create a new task (does NOT run it yet; running is done via SSE route)
export async function POST(req: NextRequest) {
  const { data, error } = await parseBody(req, CreateTaskSchema);
  if (error) return error;

  const { prompt, title, model, priority, tags, depends_on, metadata, source } = data;

  // Validate depends_on if provided
  if (depends_on) {
    const depTask = getTask(depends_on);
    if (!depTask) {
      return NextResponse.json({ error: "depends_on task not found" }, { status: 400 });
    }
  }

  // Generate an AI title if none provided (Perplexity Computer-style smart titles)
  const taskTitle = title?.trim() || await generateTitle(prompt);

  try {
    const id = uuidv4();
    const task = createTask({
      id,
      title: taskTitle,
      prompt,
      description: prompt,
      status: depends_on ? "queued" : "pending",
      priority: priority || "medium",
      model: model || "auto",
      source: source || "manual",
      tags: tags || [],
      metadata: metadata || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      depends_on,
    });

    return NextResponse.json(task, { status: 201 });
  } catch (err) {
    console.error("[POST /api/tasks] createTask failed:", err);
    return NextResponse.json(
      { error: safeErrorMessage(err) },
      { status: 500 }
    );
  }
}

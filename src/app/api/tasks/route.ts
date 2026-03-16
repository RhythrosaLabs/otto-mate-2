import { NextRequest, NextResponse } from "next/server";
import { createTask, listTasks, listTasksBySource, getTask } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import type { ModelId, TaskPriority, TaskSource } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Generate a concise task title from the prompt using a lightweight LLM call.
 * Falls back to truncated prompt on failure.
 */
async function generateTitle(prompt: string): Promise<string> {
  const fallback = prompt.length > 80 ? prompt.slice(0, 77) + "..." : prompt;
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return fallback;
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 30,
        messages: [
          { role: "system", content: "Generate a concise 3-8 word task title for the following request. Return ONLY the title, no quotes or punctuation." },
          { role: "user", content: prompt.slice(0, 500) },
        ],
      }),
    });
    if (!resp.ok) return fallback;
    const data = await resp.json();
    const title = data.choices?.[0]?.message?.content?.trim();
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
  const body = await req.json() as {
    prompt: string; title?: string; model?: ModelId; priority?: TaskPriority;
    depends_on?: string; tags?: string[]; metadata?: Record<string, unknown>; source?: TaskSource;
  };
  const { prompt, title, model, priority, depends_on, tags, metadata, source } = body;

  if (!prompt?.trim()) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

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
      { error: "Failed to create task", detail: String(err) },
      { status: 500 }
    );
  }
}

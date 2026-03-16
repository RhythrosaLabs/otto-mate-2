import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { addTaskFile } from "@/lib/db";
import {
  searchHFModels,
  getHFModel,
  detectHFTaskType,
  runHFTask,
} from "@/lib/huggingface";

// GET /api/huggingface?action=search&q=...&pipeline_tag=...
// GET /api/huggingface?action=model&id=...
// GET /api/huggingface?action=detect&prompt=...
export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action") || "search";

  try {
    if (action === "search") {
      const q = req.nextUrl.searchParams.get("q") || "popular";
      const pipelineTag = req.nextUrl.searchParams.get("pipeline_tag") || undefined;
      const models = await searchHFModels(q, { pipelineTag, limit: 20 });
      return NextResponse.json({
        models: models.slice(0, 20).map(m => ({
          id: m.id,
          modelId: m.id,
          author: m.id.split("/")[0] || "",
          name: m.id.split("/")[1] || m.id,
          fullName: m.id,
          description: (m.pipeline_tag ? `[${m.pipeline_tag}] ` : "") + (m.tags?.slice(0, 5).join(", ") || ""),
          downloads: m.downloads || 0,
          likes: m.likes || 0,
          pipeline_tag: m.pipeline_tag || "",
          library_name: m.library_name || "",
          tags: m.tags || [],
        })),
      });
    }

    if (action === "model") {
      const id = req.nextUrl.searchParams.get("id");
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      const model = await getHFModel(id);
      return NextResponse.json({ model });
    }

    if (action === "detect") {
      const prompt = req.nextUrl.searchParams.get("prompt") || "";
      const result = detectHFTaskType(prompt);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}

// POST /api/huggingface — Run a model
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      prompt: string;
      model?: string;
      params?: Record<string, unknown>;
      taskId?: string;
    };

    if (!body.prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const { ensureFilesDir } = await import("@/lib/db");
    const fs = await import("fs");
    const path = await import("path");
    const taskId = body.taskId || `huggingface-${Date.now()}`;
    const filesDir = path.join(ensureFilesDir(), taskId);
    if (!fs.existsSync(filesDir)) fs.mkdirSync(filesDir, { recursive: true });

    const result = await runHFTask({
      prompt: body.prompt,
      model: body.model,
      params: body.params,
      filesDir,
    });

    // Register files in DB so they appear in Files page
    for (const f of result.files) {
      try {
        addTaskFile({
          id: uuidv4(),
          task_id: taskId,
          name: f.filename,
          path: f.filePath || `${filesDir}/${f.filename}`,
          size: f.size,
          mime_type: f.mimeType,
          created_at: new Date().toISOString(),
        });
      } catch { /* ignore duplicate */ }
    }

    return NextResponse.json({
      model: result.model,
      modelReason: result.modelReason,
      taskType: result.taskType,
      status: result.status,
      computeTime: result.computeTime,
      files: result.files.map(f => ({
        filename: f.filename,
        size: f.size,
        mimeType: f.mimeType,
      })),
      textOutput: result.textOutput,
    });
  } catch (err) {
    return NextResponse.json(
      { error: String(err instanceof Error ? err.message : err) },
      { status: 500 }
    );
  }
}

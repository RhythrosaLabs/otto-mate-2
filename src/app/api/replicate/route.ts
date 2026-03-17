import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { addTaskFile } from "@/lib/db";
import {
  searchModels,
  getModel,
  getModelInputSchema,
  runReplicateTask,
  detectReplicateTaskType,
} from "@/lib/replicate";

// GET /api/replicate?action=search&q=...
// GET /api/replicate?action=model&owner=...&name=...
// GET /api/replicate?action=schema&owner=...&name=...
// GET /api/replicate?action=detect&prompt=...
export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action") || "search";
  const token = req.nextUrl.searchParams.get("token") || undefined;

  try {
    if (action === "search") {
      const q = req.nextUrl.searchParams.get("q") || "popular";
      const models = await searchModels(q, token);
      return NextResponse.json({
        models: models.slice(0, 20).map(m => ({
          owner: m.owner,
          name: m.name,
          fullName: `${m.owner}/${m.name}`,
          description: (m.description || "").slice(0, 200),
          run_count: m.run_count || 0,
          url: m.url,
          cover_image_url: m.cover_image_url,
        })),
      });
    }

    if (action === "model") {
      const owner = req.nextUrl.searchParams.get("owner");
      const name = req.nextUrl.searchParams.get("name");
      if (!owner || !name) return NextResponse.json({ error: "owner and name are required" }, { status: 400 });
      const model = await getModel(owner, name, token);
      return NextResponse.json({ model });
    }

    if (action === "schema") {
      const owner = req.nextUrl.searchParams.get("owner");
      const name = req.nextUrl.searchParams.get("name");
      if (!owner || !name) return NextResponse.json({ error: "owner and name are required" }, { status: 400 });
      const schema = await getModelInputSchema(owner, name, token);
      return NextResponse.json({ schema });
    }

    if (action === "detect") {
      const prompt = req.nextUrl.searchParams.get("prompt") || "";
      const result = detectReplicateTaskType(prompt);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}

// POST /api/replicate — Run a model
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

    // Determine files dir
    const { ensureFilesDir } = await import("@/lib/db");
    const fs = await import("fs");
    const path = await import("path");
    const taskId = body.taskId || `replicate-${Date.now()}`;
    const filesDir = path.join(ensureFilesDir(), taskId);
    if (!fs.existsSync(filesDir)) fs.mkdirSync(filesDir, { recursive: true });

    const result = await runReplicateTask({
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
          source: "playground",
          created_at: new Date().toISOString(),
        });
      } catch { /* ignore duplicate */ }
    }

    return NextResponse.json({
      model: result.model,
      modelReason: result.modelReason,
      taskType: result.taskType,
      status: result.prediction.status,
      predictTime: result.prediction.metrics?.predict_time,
      files: result.files.map(f => ({
        filename: f.filename,
        size: f.size,
        mimeType: f.mimeType,
      })),
      textOutput: result.textOutput,
      predictionId: result.prediction.id,
    });
  } catch (err) {
    return NextResponse.json(
      { error: String(err instanceof Error ? err.message : err) },
      { status: 500 }
    );
  }
}

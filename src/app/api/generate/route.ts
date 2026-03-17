import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { addTaskFile } from "@/lib/db";
import { safeErrorMessage } from "@/lib/constants";
import { GenerateSchema, parseBody } from "@/lib/schemas";

export const dynamic = "force-dynamic";

// ─── Unified Generate API with Auto-Fallback ─────────────────────────────────
// POST /api/generate — Run a generation with automatic cross-provider fallback
// GET  /api/generate?action=history — List recent generations

interface GenerateRequest {
  prompt: string;
  model?: string;
  provider?: "auto" | "replicate" | "huggingface";
  params?: Record<string, unknown>;
  imageUrl?: string;        // For image-to-video, img2img, upscale, etc.
  fileUrl?: string;         // For document analysis, audio transcription, etc.
  taskType?: string;        // Force a specific task type
}

interface GenerateResult {
  id: string;
  model: string;
  modelReason: string;
  taskType: string;
  status: string;
  provider: "replicate" | "huggingface";
  predictTime?: number;
  computeTime?: number;
  files: Array<{ filename: string; size: number; mimeType: string; url: string }>;
  textOutput?: string;
  fallbackUsed?: boolean;
  fallbackReason?: string;
  error?: string;
}

// Known error patterns that should trigger a fallback
const FALLBACK_TRIGGERS = [
  /model.*not found/i,
  /model.*loading/i,
  /503/,
  /502/,
  /504/,
  /timeout/i,
  /rate.?limit/i,
  /quota/i,
  /exceeded/i,
  /capacity/i,
  /overloaded/i,
  /unavailable/i,
  /currently.*down/i,
  /failed.*start/i,
  /inference.*failed/i,
  /CUDA.*out of memory/i,
  /out of memory/i,
  /hardware.*error/i,
  /model.*too large/i,
  /endpoint.*not.*found/i,
  /internal server error/i,
];

function shouldFallback(error: string): boolean {
  return FALLBACK_TRIGGERS.some(pattern => pattern.test(error));
}

export async function POST(req: NextRequest) {
  try {
    const { data: body, error: validationError } = await parseBody(req, GenerateSchema);
    if (validationError) return validationError;

    const { ensureFilesDir } = await import("@/lib/db");
    const fsModule = await import("fs");
    const pathModule = await import("path");
    const taskId = `gen-${Date.now()}-${uuidv4().slice(0, 8)}`;
    const filesDir = pathModule.join(ensureFilesDir(), taskId);
    if (!fsModule.existsSync(filesDir))
      fsModule.mkdirSync(filesDir, { recursive: true });

    // Merge imageUrl into params if provided
    const params = { ...body.params };
    if (body.imageUrl) {
      params.image = body.imageUrl;
      params.image_url = body.imageUrl;
      params.input_image = body.imageUrl;
    }
    if (body.fileUrl) {
      params.file = body.fileUrl;
      params.audio = body.fileUrl;
    }

    // Determine provider order
    const providerOrder = getProviderOrder(body.provider || "auto", body.prompt);

    let lastError = "";
    let fallbackUsed = false;
    let fallbackReason = "";

    for (let i = 0; i < providerOrder.length; i++) {
      const provider = providerOrder[i];
      try {
        const result = await runWithProvider(provider, {
          prompt: body.prompt,
          model: body.model,
          params,
          filesDir,
          taskId,
        });

        // Build file URLs and register in DB so they appear in Files page
        const files = result.files.map(
          (f: {
            filename: string;
            size: number;
            mimeType: string;
            filePath?: string;
          }) => {
            // Register file in task_files DB
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
            return {
              filename: f.filename,
              size: f.size,
              mimeType: f.mimeType,
              url: `/api/files/${taskId}/${f.filename}`,
            };
          }
        );

        return NextResponse.json({
          id: taskId,
          model: result.model,
          modelReason: result.modelReason,
          taskType: result.taskType,
          status: result.status || "succeeded",
          provider,
          predictTime: result.predictTime,
          computeTime: result.computeTime,
          files,
          textOutput: result.textOutput,
          fallbackUsed,
          fallbackReason: fallbackUsed ? fallbackReason : undefined,
        } satisfies GenerateResult);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        lastError = errorMsg;

        // If this isn't the last provider, try the next one
        if (i < providerOrder.length - 1) {
          fallbackUsed = true;
          fallbackReason = `${provider} failed: ${errorMsg.slice(0, 100)}. Falling back to ${providerOrder[i + 1]}.`;
          continue; // Try next provider
        }
      }
    }

    // All providers failed — show the most useful error (first non-token error)
    const allErrors = fallbackReason ? `${fallbackReason} ${lastError}` : lastError;
    // Prefer showing the original (first provider) error, as the fallback error is often just "no token"
    const primaryError = fallbackReason
      ? fallbackReason.replace(/\. Falling back to.*/, "")
      : lastError;
    return NextResponse.json(
      {
        error: primaryError || lastError || "All providers failed",
        details: allErrors,
        fallbackUsed,
        fallbackReason,
      },
      { status: 500 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err) },
      { status: 500 }
    );
  }
}

// Decide provider order based on user preference and task type
function getProviderOrder(
  preference: "auto" | "replicate" | "huggingface",
  prompt: string
): Array<"replicate" | "huggingface"> {
  if (preference === "replicate") return ["replicate", "huggingface"];
  if (preference === "huggingface") return ["huggingface", "replicate"];

  // Auto: choose best primary based on task type
  const promptLower = prompt.toLowerCase();

  // HuggingFace is generally better for: text generation, translation, summarization, NLP
  const hfPreferred =
    /\b(translat|summariz|text.?generat|llm|language.?model|classify|sentiment|fill.?mask|qa|question.?answer|feature.?extract|write|essay|poem|story|explain|answer|tell.?me|rewrite|paragraph|sentence|lyrics|script|blog|article|code|program|function|list\b(?!.*image))(?!.*(image|photo|picture))/i;

  // Replicate is generally better for: image gen, video, audio, 3D, upscale
  const repPreferred =
    /\b(image|video|photo|picture|draw|paint|render|upscale|3d|music|speech|voice|face|background|style)\b/i;

  if (hfPreferred.test(promptLower)) return ["huggingface", "replicate"];
  if (repPreferred.test(promptLower)) return ["replicate", "huggingface"];

  // Default: Replicate first (generally better model availability for generative tasks)
  return ["replicate", "huggingface"];
}

// Run generation with a specific provider
async function runWithProvider(
  provider: "replicate" | "huggingface",
  options: {
    prompt: string;
    model?: string;
    params?: Record<string, unknown>;
    filesDir: string;
    taskId: string;
  }
): Promise<{
  model: string;
  modelReason: string;
  taskType: string;
  status: string;
  predictTime?: number;
  computeTime?: number;
  files: Array<{
    filename: string;
    filePath: string;
    size: number;
    mimeType: string;
  }>;
  textOutput?: string;
}> {
  if (provider === "replicate") {
    const { runReplicateTask } = await import("@/lib/replicate");
    const result = await runReplicateTask({
      prompt: options.prompt,
      model: options.model,
      params: options.params,
      filesDir: options.filesDir,
    });
    return {
      model: result.model,
      modelReason: result.modelReason,
      taskType: result.taskType,
      status: result.prediction.status,
      predictTime: result.prediction.metrics?.predict_time,
      files: result.files,
      textOutput: result.textOutput,
    };
  } else {
    const { runHFTask } = await import("@/lib/huggingface");
    const result = await runHFTask({
      prompt: options.prompt,
      model: options.model,
      params: options.params,
      filesDir: options.filesDir,
    });
    return {
      model: result.model,
      modelReason: result.modelReason,
      taskType: result.taskType,
      status: result.status,
      computeTime: result.computeTime,
      files: result.files,
      textOutput: result.textOutput,
    };
  }
}

// GET /api/generate?action=history — List generation history
export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action") || "history";

  if (action === "history") {
    try {
      const { listAllFiles } = await import("@/lib/db");
      const files = listAllFiles(200);
      // Group files by task_id, filter to gen- tasks
      const generations = new Map<
        string,
        {
          id: string;
          files: Array<{
            name: string;
            size: number;
            mime_type: string;
            created_at: string;
          }>;
          created_at: string;
        }
      >();

      for (const f of files as Array<{
        task_id: string;
        name: string;
        size: number;
        mime_type: string;
        created_at: string;
      }>) {
        if (
          !f.task_id?.startsWith("gen-") &&
          !f.task_id?.startsWith("replicate-") &&
          !f.task_id?.startsWith("huggingface-")
        )
          continue;
        if (!generations.has(f.task_id)) {
          generations.set(f.task_id, {
            id: f.task_id,
            files: [],
            created_at: f.created_at,
          });
        }
        generations.get(f.task_id)!.files.push({
          name: f.name,
          size: f.size,
          mime_type: f.mime_type,
          created_at: f.created_at,
        });
      }

      const items = Array.from(generations.values()).sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      return NextResponse.json({ generations: items });
    } catch {
      return NextResponse.json({ generations: [] });
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

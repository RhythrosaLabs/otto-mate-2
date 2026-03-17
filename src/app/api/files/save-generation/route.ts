import { NextRequest, NextResponse } from "next/server";
import { addTaskFile, ensureFilesDir, createTask, getTask } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";

export const dynamic = "force-dynamic";

// Infer MIME type from URL or content-type header
function inferMimeType(url: string, contentType?: string): string {
  if (contentType && contentType !== "application/octet-stream") return contentType.split(";")[0].trim();
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase();
  const extMap: Record<string, string> = {
    mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
    mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", flac: "audio/flac", aac: "audio/aac",
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
    html: "text/html", css: "text/css", js: "application/javascript", json: "application/json",
    pdf: "application/pdf", zip: "application/zip",
    glb: "model/gltf-binary", gltf: "model/gltf+json",
  };
  return extMap[ext || ""] || "application/octet-stream";
}

// Extract filename from URL
function filenameFromUrl(url: string, mime: string): string {
  try {
    const pathname = new URL(url).pathname;
    const baseName = pathname.split("/").pop();
    if (baseName && /\.\w{2,5}$/.test(baseName)) return baseName;
  } catch { /* ignore */ }
  // Generate a name from mime type
  const extMap: Record<string, string> = {
    "video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov",
    "audio/mpeg": ".mp3", "audio/wav": ".wav", "audio/ogg": ".ogg",
    "image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif", "image/webp": ".webp",
    "text/html": ".html", "text/css": ".css", "application/javascript": ".js",
    "application/json": ".json", "application/pdf": ".pdf",
  };
  const ext = extMap[mime] || "";
  return `generated-${Date.now()}${ext}`;
}

/**
 * POST /api/files/save-generation
 * 
 * Saves a generated file from a URL or direct content to the files system.
 * Used by Dreamscape (Video Producer), App Builder, and any other UI that generates content.
 * 
 * Body:
 * - url?: string        — external URL to download
 * - content?: string     — direct file content (for text/code files)
 * - filename?: string    — desired filename
 * - mimeType?: string    — MIME type override
 * - source: string       — origin: "playground" | "dreamscape" | "app-builder" | "chat" | "gallery" | "api"
 * - taskId?: string      — link to existing task, or auto-generated
 * - prompt?: string      — the prompt that generated this (stored as memory)
 * - metadata?: object    — additional context
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      url, content, filename, mimeType, source = "unknown",
      taskId, prompt, metadata,
    } = body as {
      url?: string;
      content?: string;
      filename?: string;
      mimeType?: string;
      source?: string;
      taskId?: string;
      prompt?: string;
      metadata?: Record<string, unknown>;
    };

    if (!url && !content) {
      return NextResponse.json({ error: "url or content required" }, { status: 400 });
    }

    const generationTaskId = taskId || `${source}-${Date.now()}-${uuidv4().slice(0, 8)}`;
    const filesDir = ensureFilesDir();
    const taskDir = path.join(filesDir, generationTaskId);
    if (!fs.existsSync(taskDir)) {
      fs.mkdirSync(taskDir, { recursive: true });
    }

    let buffer: Buffer;
    let resolvedMime: string;
    let resolvedName: string;

    if (url) {
      // Download from external URL
      const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (!res.ok) {
        return NextResponse.json({ error: `Failed to download: ${res.status}` }, { status: 502 });
      }
      const contentType = res.headers.get("content-type") || undefined;
      buffer = Buffer.from(await res.arrayBuffer());
      resolvedMime = mimeType || inferMimeType(url, contentType);
      resolvedName = filename || filenameFromUrl(url, resolvedMime);
    } else {
      // Direct content
      buffer = Buffer.from(content!, "utf-8");
      resolvedMime = mimeType || "text/plain";
      resolvedName = filename || `file-${Date.now()}.txt`;
    }

    // Sanitize filename
    resolvedName = path.basename(resolvedName).replace(/[^a-zA-Z0-9._-]/g, "_");

    const filePath = path.join(taskDir, resolvedName);
    fs.writeFileSync(filePath, buffer);

    // Ensure the task exists (FK constraint requires it)
    const existingTask = getTask(generationTaskId);
    if (!existingTask) {
      const now = new Date().toISOString();
      createTask({
        id: generationTaskId,
        title: prompt ? `${source}: ${prompt.slice(0, 80)}` : `${source} generation`,
        prompt: prompt || "",
        description: `Auto-created for ${source} file generation`,
        status: "completed",
        priority: "medium",
        model: "auto",
        tags: [source, "file-generation"],
        metadata: metadata || {},
        source: "manual",
        created_at: now,
        updated_at: now,
      });
    }

    const fileRecord = {
      id: uuidv4(),
      task_id: generationTaskId,
      name: resolvedName,
      path: filePath,
      size: buffer.length,
      mime_type: resolvedMime,
      source: source as import("@/lib/types").FileSource,
      created_at: new Date().toISOString(),
    };

    addTaskFile(fileRecord);

    return NextResponse.json({
      ok: true,
      file: {
        id: fileRecord.id,
        taskId: generationTaskId,
        name: resolvedName,
        url: `/api/files/${generationTaskId}/${resolvedName}`,
        size: buffer.length,
        mimeType: resolvedMime,
        source,
      },
    }, { status: 201 });
  } catch (err) {
    console.error("[save-generation] Error:", err);
    return NextResponse.json(
      { error: String(err instanceof Error ? err.message : err) },
      { status: 500 },
    );
  }
}

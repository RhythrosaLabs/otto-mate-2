import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";

export const dynamic = "force-dynamic";

const FILES_DIR = process.env.FILES_DIR || path.join(process.cwd(), "task-files");

// GET /api/files/[taskId]/[...filename] — serve a task file
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string; filename: string[] }> }
) {
  const { taskId, filename } = await params;
  const fileName = filename.join("/");

  // Sanitize - prevent path traversal
  const safeName = path.basename(fileName);
  const filePath = path.join(FILES_DIR, taskId, safeName);

  // Ensure path is within FILES_DIR
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(FILES_DIR))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const fileBuffer = fs.readFileSync(filePath);
  const ext = path.extname(safeName).toLowerCase();
  const contentType = getContentType(ext);

  const { searchParams } = new URL(req.url);
  const isDownload = searchParams.get("download") === "1";

  return new NextResponse(fileBuffer, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": isDownload
        ? `attachment; filename="${safeName}"`
        : `inline; filename="${safeName}"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}

function getContentType(ext: string): string {
  const map: Record<string, string> = {
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".ts": "application/typescript",
    ".json": "application/json",
    ".csv": "text/csv",
    ".xml": "application/xml",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".tiff": "image/tiff",
    ".ico": "image/x-icon",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".mkv": "video/x-matroska",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
    ".aac": "audio/aac",
    ".m4a": "audio/mp4",
    ".wma": "audio/x-ms-wma",
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json",
    ".obj": "text/plain",
    ".stl": "model/stl",
    ".fbx": "application/octet-stream",
    ".zip": "application/zip",
    ".py": "text/plain",
    ".sh": "text/plain",
    ".yaml": "text/yaml",
    ".yml": "text/yaml",
    ".bin": "application/octet-stream",
  };
  return map[ext] || "application/octet-stream";
}

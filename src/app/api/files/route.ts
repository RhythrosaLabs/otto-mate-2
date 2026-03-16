import { NextRequest, NextResponse } from "next/server";
import { listAllFiles, addTaskFile, ensureFilesDir, listFolders, createFolder, renameFolder, deleteFolder, updateFileFolder } from "@/lib/db";
import type { FileFolder } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";

export const dynamic = "force-dynamic";

// GET /api/files — list all files (optionally filtered by ?taskId=)
// GET /api/files?action=folders — list all folders
export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action");

  if (action === "folders") {
    const folders = listFolders();
    return NextResponse.json(folders);
  }

  const taskId = req.nextUrl.searchParams.get("taskId");
  const files = listAllFiles(500);
  const filtered = taskId ? files.filter((f: { task_id: string }) => f.task_id === taskId) : files;
  return NextResponse.json(filtered);
}

// POST /api/files — upload file(s) to a task
// POST /api/files?action=createFolder — create a folder
// POST /api/files?action=renameFolder — rename a folder
// POST /api/files?action=moveToFolder — move file(s) to a folder
export async function POST(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action");

  // ── Folder actions ──
  if (action === "createFolder") {
    const body = await req.json() as { name: string; parentId?: string; color?: string };
    const folder: FileFolder = {
      id: uuidv4(),
      name: body.name || "New Folder",
      parent_id: body.parentId,
      color: body.color || "#5e9cf0",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    createFolder(folder);
    return NextResponse.json(folder, { status: 201 });
  }

  if (action === "renameFolder") {
    const body = await req.json() as { id: string; name: string };
    if (!body.id || !body.name) return NextResponse.json({ error: "id and name required" }, { status: 400 });
    renameFolder(body.id, body.name);
    return NextResponse.json({ ok: true });
  }

  if (action === "moveToFolder") {
    const body = await req.json() as { fileIds: string[]; folderId: string | null };
    if (!body.fileIds) return NextResponse.json({ error: "fileIds required" }, { status: 400 });
    for (const fid of body.fileIds) {
      updateFileFolder(fid, body.folderId);
    }
    return NextResponse.json({ ok: true, moved: body.fileIds.length });
  }

  // ── File upload ──
  const formData = await req.formData();
  const taskId = (formData.get("taskId") as string) || `upload-${Date.now()}-${uuidv4().slice(0, 8)}`;

  // Accept both "file" (singular) and "files" (plural) keys
  let files = formData.getAll("files") as File[];
  if (files.length === 0) {
    const singleFile = formData.get("file") as File | null;
    if (singleFile) files = [singleFile];
  }
  if (files.length === 0) {
    return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
  }

  const filesDir = ensureFilesDir();
  const taskDir = path.join(filesDir, taskId);
  if (!fs.existsSync(taskDir)) {
    fs.mkdirSync(taskDir, { recursive: true });
  }

  const uploadedFiles = [];
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const safeName = path.basename(file.name);
    const filePath = path.join(taskDir, safeName);
    fs.writeFileSync(filePath, buffer);

    const fileRecord = {
      id: uuidv4(),
      task_id: taskId,
      name: safeName,
      path: filePath,
      size: buffer.length,
      mime_type: file.type || "application/octet-stream",
      created_at: new Date().toISOString(),
    };
    addTaskFile(fileRecord);
    uploadedFiles.push(fileRecord);
  }

  // Return url for the first file (for single-file uploads) plus the full list
  const firstFile = uploadedFiles[0];
  return NextResponse.json({
    url: `/api/files/${taskId}/${firstFile?.name}`,
    taskId,
    files: uploadedFiles,
  }, { status: 201 });
}

// DELETE /api/files?action=deleteFolder&id=xxx
export async function DELETE(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action");
  const id = req.nextUrl.searchParams.get("id");

  if (action === "deleteFolder" && id) {
    deleteFolder(id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

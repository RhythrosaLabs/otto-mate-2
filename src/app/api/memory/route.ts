import { NextRequest } from "next/server";
import { listMemory, memoryStore, memoryRecall, deleteMemory, updateMemory } from "@/lib/db";
import { safeErrorMessage } from "@/lib/constants";
import { StoreMemorySchema, parseBody } from "@/lib/schemas";
import { v4 as uuidv4 } from "uuid";
import { getSessionFromRequest } from "@/lib/auth";

// GET /api/memory?q=search+query
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  const userId = session?.userId;
  const q = req.nextUrl.searchParams.get("q") || "";
  const limit = Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") || "50", 10) || 50);
  try {
    const entries = q ? await memoryRecall(q, limit, userId) : await listMemory(limit, userId);
    return Response.json({ entries });
  } catch (err) {
    return Response.json({ error: safeErrorMessage(err) }, { status: 500 });
  }
}

// POST /api/memory — store a new entry
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  const { data: body, error: validationError } = await parseBody(req, StoreMemorySchema);
  if (validationError) return validationError;

  try {
    const now = new Date().toISOString();
    await memoryStore({
      id: uuidv4(),
      key: body.key,
      value: body.value,
      source_task_id: body.source_task_id,
      tags: body.tags,
      user_id: session?.userId,
      created_at: now,
      updated_at: now,
    });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: safeErrorMessage(err) }, { status: 500 });
  }
}

// DELETE /api/memory?id=xxx — delete a memory entry
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }
  try {
    await deleteMemory(id);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: safeErrorMessage(err) }, { status: 500 });
  }
}

// PATCH /api/memory — update an existing memory entry
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json() as { id?: string; key?: string; value?: string; tags?: string[] };
    if (!body.id) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }
    await updateMemory(body.id, { key: body.key, value: body.value, tags: body.tags });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: safeErrorMessage(err) }, { status: 500 });
  }
}

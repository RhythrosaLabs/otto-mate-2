import { NextRequest } from "next/server";
import { listMemory, memoryStore, memoryRecall, deleteMemory } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

// GET /api/memory?q=search+query
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "";
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "50", 10);
  try {
    const entries = q ? memoryRecall(q, limit) : listMemory(limit);
    return Response.json({ entries });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

// POST /api/memory — store a new entry
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      key: string;
      value: string;
      source_task_id?: string;
      tags?: string[];
    };
    if (!body.key || !body.value) {
      return Response.json({ error: "key and value are required" }, { status: 400 });
    }
    const now = new Date().toISOString();
    memoryStore({
      id: uuidv4(),
      key: body.key,
      value: body.value,
      source_task_id: body.source_task_id,
      tags: body.tags || [],
      created_at: now,
      updated_at: now,
    });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

// DELETE /api/memory?id=xxx — delete a memory entry
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }
  try {
    deleteMemory(id);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

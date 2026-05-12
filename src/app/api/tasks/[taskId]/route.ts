import { NextRequest, NextResponse } from "next/server";
import { getTask, deleteTask, updateTaskTitle } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/tasks/[taskId]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const task = await getTask(taskId);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(task);
}

// PATCH /api/tasks/[taskId] — update title
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  let body: { title?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (body.title) {
    await updateTaskTitle(taskId, body.title);
  }
  const task = await getTask(taskId);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(task);
}

// DELETE /api/tasks/[taskId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const task = await getTask(taskId);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await deleteTask(taskId);
  return NextResponse.json({ success: true });
}

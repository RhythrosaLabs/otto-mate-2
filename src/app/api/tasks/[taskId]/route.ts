import { NextRequest, NextResponse } from "next/server";
import { getTask, deleteTask, updateTaskTitle } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/tasks/[taskId]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const task = getTask(taskId);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(task);
}

// PATCH /api/tasks/[taskId] — update title
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const body = await req.json() as { title?: string };
  if (body.title) {
    updateTaskTitle(taskId, body.title);
  }
  const task = getTask(taskId);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(task);
}

// DELETE /api/tasks/[taskId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const task = getTask(taskId);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  deleteTask(taskId);
  return NextResponse.json({ success: true });
}

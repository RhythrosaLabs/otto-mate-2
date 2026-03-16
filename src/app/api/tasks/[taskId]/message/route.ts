import { NextRequest, NextResponse } from "next/server";
import { getTask, addMessage, updateTaskStatus } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export const dynamic = "force-dynamic";

// POST /api/tasks/[taskId]/message — send a follow-up message while task is waiting
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const task = getTask(taskId);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json() as { content: string };
  if (!body.content?.trim()) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  addMessage({
    id: uuidv4(),
    task_id: taskId,
    role: "user",
    content: body.content.trim(),
    created_at: new Date().toISOString(),
  });

  // If task was waiting for input, resume it
  if (task.status === "waiting_for_input") {
    updateTaskStatus(taskId, "pending");
  }

  return NextResponse.json({ success: true });
}

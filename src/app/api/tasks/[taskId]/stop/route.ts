import { NextRequest } from "next/server";
import { getTask, updateTaskStatus } from "@/lib/db";
import { runningTasks, unregisterRunningTask } from "@/lib/running-tasks";

export const dynamic = "force-dynamic";

// POST /api/tasks/[taskId]/stop — stops a running agent
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const task = await getTask(taskId);
  if (!task) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const controller = runningTasks.get(taskId);
  if (controller) {
    controller.abort();
    unregisterRunningTask(taskId);
  }

  // Update status to paused regardless (in case the map was already cleared)
  if (task.status === "running") {
    await updateTaskStatus(taskId, "paused");
  }

  const updatedTask = await getTask(taskId);
  return Response.json({ success: true, task: updatedTask });
}

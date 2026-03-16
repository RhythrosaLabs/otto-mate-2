import { NextRequest, NextResponse } from "next/server";
import { getTask, updateTaskStatus, updateTaskMetadata, updateAgentStep } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/tasks/:taskId/approve — Approve or deny a pending sensitive action.
 * 
 * Body: { approval_id: string; approved: boolean }
 * 
 * When approved, clears the pending approval and resumes the task.
 * When denied, marks the approval as denied and updates the task.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const body = await req.json().catch(() => ({}));
  const { approval_id, approved } = body as { approval_id?: string; approved?: boolean };

  if (!approval_id || typeof approved !== "boolean") {
    return NextResponse.json(
      { error: "approval_id (string) and approved (boolean) are required" },
      { status: 400 }
    );
  }

  const task = getTask(taskId);
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const meta = task.metadata || {};
  const pendingApprovals = (meta.pending_approvals as Array<Record<string, unknown>>) || [];
  const approvalIdx = pendingApprovals.findIndex((a) => a.id === approval_id);

  if (approvalIdx === -1) {
    return NextResponse.json({ error: "Approval not found" }, { status: 404 });
  }

  const approval = pendingApprovals[approvalIdx];

  // Update the approval step status and title in the DB so UI reflects the decision
  updateAgentStep(approval_id, { 
    status: approved ? "completed" : "failed",
    title: approved ? "✅ Approved" : "❌ Denied",
  });

  if (approved) {
    // Remove the approval from pending list
    pendingApprovals.splice(approvalIdx, 1);
    const updatedMeta = {
      ...meta,
      pending_approvals: pendingApprovals,
      approved_actions: [
        ...((meta.approved_actions as Array<Record<string, unknown>>) || []),
        { ...approval, approved_at: new Date().toISOString() },
      ],
    };

    updateTaskMetadata(taskId, updatedMeta);

    // Resume the task
    updateTaskStatus(taskId, "running");

    return NextResponse.json({
      message: "Action approved",
      remaining_approvals: pendingApprovals.length,
      approval,
    });
  } else {
    // Denied — remove from pending, record denial, and mark task ready to resume
    pendingApprovals.splice(approvalIdx, 1);
    const updatedMeta = {
      ...meta,
      pending_approvals: pendingApprovals,
      denied_actions: [
        ...((meta.denied_actions as Array<Record<string, unknown>>) || []),
        { ...approval, denied_at: new Date().toISOString() },
      ],
    };

    updateTaskMetadata(taskId, updatedMeta);
    // Set to running so agent can resume and handle the denial
    updateTaskStatus(taskId, "running");

    return NextResponse.json({
      message: "Action denied",
      remaining_approvals: pendingApprovals.length,
      approval,
    });
  }
}

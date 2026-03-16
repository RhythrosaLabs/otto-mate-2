import { NextRequest, NextResponse } from "next/server";
import { getTaskTokenUsage, getGlobalTokenUsage } from "@/lib/db";

// GET /api/usage?taskId=xxx — Get token usage for a task or global
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("taskId");

    if (taskId) {
      const usage = getTaskTokenUsage(taskId);
      return NextResponse.json(usage);
    }

    const global = getGlobalTokenUsage();
    return NextResponse.json(global);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

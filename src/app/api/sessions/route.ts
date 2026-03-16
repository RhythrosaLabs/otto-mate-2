import { NextRequest, NextResponse } from "next/server";
import { getSessions, createSession, getSession, updateSession, deleteSession, addTaskToSession } from "@/lib/db";

export async function GET() {
  try {
    const sessions = getSessions();
    return NextResponse.json({ sessions });
  } catch (err) {
    console.error("[sessions] Error:", err);
    return NextResponse.json({ error: "Failed to fetch sessions" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { name: string; description?: string; persona_id?: string; action?: string; session_id?: string; task_id?: string };

    if (body.action === "add_task" && body.session_id && body.task_id) {
      addTaskToSession(body.session_id, body.task_id);
      const session = getSession(body.session_id);
      return NextResponse.json(session);
    }

    if (!body.name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const id = createSession(body.name, body.description, body.persona_id);
    const session = getSession(id);
    return NextResponse.json(session, { status: 201 });
  } catch (err) {
    console.error("[sessions] Error:", err);
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json() as { id: string; name?: string; description?: string; persona_id?: string; context_summary?: string; pinned?: boolean };
    if (!body.id) return NextResponse.json({ error: "ID required" }, { status: 400 });
    updateSession(body.id, body);
    const session = getSession(body.id);
    return NextResponse.json(session);
  } catch (err) {
    console.error("[sessions] Error:", err);
    return NextResponse.json({ error: "Failed to update session" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
    deleteSession(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[sessions] Error:", err);
    return NextResponse.json({ error: "Failed to delete session" }, { status: 500 });
  }
}

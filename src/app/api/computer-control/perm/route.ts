import { NextRequest } from "next/server";
import { computerSessions } from "@/lib/computer-control-sessions";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as {
    sessionId?: string;
    approved?: boolean;
  };

  const { sessionId, approved = false } = body;
  if (!sessionId) {
    return new Response(JSON.stringify({ error: "sessionId is required" }), { status: 400 });
  }

  const session = computerSessions.get(sessionId);
  if (!session) {
    return new Response(JSON.stringify({ error: "Session not found" }), { status: 404 });
  }

  if (session.permissionResolve) {
    session.permissionResolve(approved);
    session.permissionResolve = undefined;
    session.pendingApp = undefined;
    session.status = "running";
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
}

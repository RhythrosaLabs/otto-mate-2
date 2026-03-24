import { NextRequest } from "next/server";
import { computerSessions } from "@/lib/computer-control-sessions";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { sessionId?: string };
  const { sessionId } = body;

  if (!sessionId) {
    return new Response(JSON.stringify({ error: "sessionId is required" }), { status: 400 });
  }

  const session = computerSessions.get(sessionId);
  if (!session) {
    return new Response(JSON.stringify({ error: "Session not found" }), { status: 404 });
  }

  session.abortController.abort();
  // If waiting on permission, resolve it as denied
  if (session.permissionResolve) {
    session.permissionResolve(false);
    session.permissionResolve = undefined;
  }
  computerSessions.delete(sessionId);

  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
}

import { NextRequest, NextResponse } from "next/server";
import { computerSessions } from "@/lib/computer-control-sessions";

export const dynamic = "force-dynamic";

/**
 * POST /api/computer-control/stream
 * Reconnect handler for the Computer Control SSE stream.
 *
 * The original stream is bound to the HTTP response object of the first request
 * and cannot be truly "reconnected" over a new HTTP connection. If the session
 * is still alive we return 503 so the client shows a clear error; otherwise 404.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => ({})) as { sessionId?: string };
  const { sessionId } = body;

  if (sessionId) {
    const session = computerSessions.get(sessionId);
    if (session && session.status === "running") {
      return NextResponse.json(
        { error: "Session is still running but SSE streams cannot be reconnected. Start a new session to continue." },
        { status: 503 }
      );
    }
  }

  return NextResponse.json(
    { error: "Session not found or already completed. Start a new Computer Control session." },
    { status: 404 }
  );
}

/**
 * GET /api/health/code-server
 * Server-side check — does a real fetch to code-server on port 3101.
 * Returns 200 {"ok":true} if reachable, 503 {"ok":false} if not.
 * Used by the Coding Companion iframe instead of a no-cors browser fetch,
 * which can't reliably distinguish "proxy up but code-server down" from "all good".
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch("http://127.0.0.1:3101/healthz", {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);
    if (res.ok || res.status < 500) {
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: false, status: res.status }, { status: 503 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}

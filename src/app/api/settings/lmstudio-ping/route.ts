import { NextRequest, NextResponse } from "next/server";

// GET /api/settings/lmstudio-ping?base=http://localhost:1234
// Pings the LM Studio server from the server side to avoid CORS issues.
// Accepts base URL with or without /v1 suffix — normalizes internally.
export async function GET(req: NextRequest) {
  const rawBase = req.nextUrl.searchParams.get("base") || "http://localhost:1234";
  // Normalize: strip any trailing /v1 or /v1/ so we always control the path
  const base = rawBase.replace(/\/v1\/?$/, "");

  // Sanitize: only allow http/https to localhost or private IPs to prevent SSRF
  let parsed: URL;
  try { parsed = new URL(base); } catch {
    return NextResponse.json({ ok: false, error: "Invalid URL" }, { status: 400 });
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return NextResponse.json({ ok: false, error: "Invalid protocol" }, { status: 400 });
  }
  const hostname = parsed.hostname;
  const isLocal =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    /^192\.168\.\d+\.\d+$/.test(hostname) ||
    /^10\.\d+\.\d+\.\d+$/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(hostname);
  if (!isLocal) {
    return NextResponse.json({ ok: false, error: "Only local LM Studio servers are supported" }, { status: 400 });
  }

  try {
    const res = await fetch(`${base}/v1/models`, {
      headers: { Authorization: "Bearer lm-studio" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `LM Studio returned HTTP ${res.status}` });
    }
    const data = await res.json() as { data?: Array<{ id: string }> };
    const models = data.data?.map(m => m.id) ?? [];
    return NextResponse.json({ ok: true, models });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const friendly = msg.includes("ECONNREFUSED") || msg.includes("fetch failed")
      ? `LM Studio not reachable at ${base} — is it running?`
      : msg;
    return NextResponse.json({ ok: false, error: friendly });
  }
}

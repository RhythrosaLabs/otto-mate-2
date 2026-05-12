import { NextRequest, NextResponse } from "next/server";
import { getAllSettings, setSetting, getSystemHealth } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/settings — get all settings + health check
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const section = searchParams.get("section");

  if (section === "health") {
    const session = await getSessionFromRequest(req);
    return NextResponse.json(await getSystemHealth(session?.userId));
  }

  const session = await getSessionFromRequest(req);
  const settings = await getAllSettings(session?.userId);
  return NextResponse.json(settings);
}

// PUT /api/settings — update settings (body: { key: string, value: string } or { settings: Record<string, string> })
export async function PUT(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  const userId = session?.userId;

  let body: { key?: string; value?: string; settings?: Record<string, string> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.settings) {
    for (const [k, v] of Object.entries(body.settings)) {
      setSetting(k, v, userId);
    }
    return NextResponse.json({ ok: true, updated: Object.keys(body.settings).length });
  }

  if (body.key && body.value !== undefined) {
    setSetting(body.key, body.value, userId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Provide { key, value } or { settings }" }, { status: 400 });
}

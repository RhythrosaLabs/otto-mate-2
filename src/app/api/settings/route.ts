import { NextRequest, NextResponse } from "next/server";
import { getAllSettings, setSetting, getSystemHealth } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/settings — get all settings + health check
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const section = searchParams.get("section");

  if (section === "health") {
    return NextResponse.json(getSystemHealth());
  }

  const settings = getAllSettings();
  return NextResponse.json(settings);
}

// PUT /api/settings — update settings (body: { key: string, value: string } or { settings: Record<string, string> })
export async function PUT(req: NextRequest) {
  const body = await req.json() as { key?: string; value?: string; settings?: Record<string, string> };

  if (body.settings) {
    for (const [k, v] of Object.entries(body.settings)) {
      setSetting(k, v);
    }
    return NextResponse.json({ ok: true, updated: Object.keys(body.settings).length });
  }

  if (body.key && body.value !== undefined) {
    setSetting(body.key, body.value);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Provide { key, value } or { settings }" }, { status: 400 });
}

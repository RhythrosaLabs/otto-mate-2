import { NextRequest, NextResponse } from "next/server";
import { listConnectorConfigs, setConnectorConfig } from "@/lib/db";
import { ALL_CONNECTORS } from "@/lib/connectors-data";
import { getSessionFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/connectors
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  const userId = session?.userId;
  const configs = await listConnectorConfigs(userId);
  const connectedIds = new Set(configs.map((c) => c.connector_id));
  const result = ALL_CONNECTORS.map((c) => ({
    ...c,
    connected: connectedIds.has(c.id),
  }));
  return NextResponse.json(result);
}

// POST /api/connectors — connect
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  const userId = session?.userId;
  let body: { id: string; api_key?: string; [key: string]: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { id, ...rest } = body;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const connector = ALL_CONNECTORS.find((c) => c.id === id);
  if (!connector) return NextResponse.json({ error: "Unknown connector" }, { status: 404 });

  await setConnectorConfig(id, { ...rest, connected: true }, userId);
  return NextResponse.json({ success: true, connector_id: id });
}

import { NextRequest, NextResponse } from "next/server";
import { listConnectorConfigs, setConnectorConfig } from "@/lib/db";
import { ALL_CONNECTORS } from "@/lib/connectors-data";

export const dynamic = "force-dynamic";

// GET /api/connectors
export async function GET() {
  const configs = listConnectorConfigs();
  const connectedIds = new Set(configs.map((c) => c.connector_id));
  const result = ALL_CONNECTORS.map((c) => ({
    ...c,
    connected: connectedIds.has(c.id),
  }));
  return NextResponse.json(result);
}

// POST /api/connectors — connect
export async function POST(req: NextRequest) {
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

  setConnectorConfig(id, { ...rest, connected: true });
  return NextResponse.json({ success: true, connector_id: id });
}

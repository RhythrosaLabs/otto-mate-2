import { NextRequest, NextResponse } from "next/server";
import { getConnectorConfig, setConnectorConfig, disconnectConnector } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/connectors/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const config = getConnectorConfig(id);
  if (!config) return NextResponse.json({ error: "Not connected" }, { status: 404 });
  return NextResponse.json(config);
}

// PUT /api/connectors/[id] — update config
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json() as Record<string, unknown>;
  setConnectorConfig(id, { ...body, connected: true });
  return NextResponse.json({ success: true });
}

// DELETE /api/connectors/[id] — disconnect
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  disconnectConnector(id);
  return NextResponse.json({ success: true });
}

import { NextRequest, NextResponse } from "next/server";
import { getConnectorConfig, setConnectorConfig, disconnectConnector } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/connectors/[id]
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSessionFromRequest(req);
  const config = await getConnectorConfig(id, session?.userId);
  if (!config) return NextResponse.json({ error: "Not connected" }, { status: 404 });
  return NextResponse.json(config);
}

// PUT /api/connectors/[id] — update config
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSessionFromRequest(req);
  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  await setConnectorConfig(id, { ...body, connected: true }, session?.userId);
  return NextResponse.json({ success: true });
}

// DELETE /api/connectors/[id] — disconnect
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSessionFromRequest(req);
  await disconnectConnector(id, session?.userId);
  return NextResponse.json({ success: true });
}

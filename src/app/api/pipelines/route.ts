import { NextRequest, NextResponse } from "next/server";
import { getPipelines, createPipeline, getPipeline, updatePipelineNodes, deletePipeline } from "@/lib/db";

export async function GET() {
  try {
    const pipelines = getPipelines();
    return NextResponse.json({ pipelines });
  } catch (err) {
    console.error("[pipelines] Error:", err);
    return NextResponse.json({ error: "Failed to fetch pipelines" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { name: string; description?: string };
    if (!body.name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    const id = createPipeline(body.name, body.description);
    const pipeline = getPipeline(id);
    return NextResponse.json(pipeline, { status: 201 });
  } catch (err) {
    console.error("[pipelines] Error:", err);
    return NextResponse.json({ error: "Failed to create pipeline" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json() as { id: string; nodes: unknown[] };
    if (!body.id) return NextResponse.json({ error: "ID required" }, { status: 400 });
    updatePipelineNodes(body.id, body.nodes);
    const pipeline = getPipeline(body.id);
    return NextResponse.json(pipeline);
  } catch (err) {
    console.error("[pipelines] Error:", err);
    return NextResponse.json({ error: "Failed to update pipeline" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
    deletePipeline(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[pipelines] Error:", err);
    return NextResponse.json({ error: "Failed to delete pipeline" }, { status: 500 });
  }
}

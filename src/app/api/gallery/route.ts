import { NextRequest, NextResponse } from "next/server";
import { listGallery, addGalleryItem, deleteGalleryItem } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export const dynamic = "force-dynamic";

// GET /api/gallery
export async function GET() {
  return NextResponse.json(listGallery());
}

// POST /api/gallery — add item
export async function POST(req: NextRequest) {
  const body = await req.json() as {
    title: string;
    description: string;
    prompt: string;
    category?: string;
    preview_url?: string;
    is_featured?: boolean;
  };

  if (!body.title || !body.prompt) {
    return NextResponse.json({ error: "title and prompt are required" }, { status: 400 });
  }

  const item = {
    id: uuidv4(),
    title: body.title,
    description: body.description || "",
    prompt: body.prompt,
    category: body.category || "coding",
    preview_url: body.preview_url ?? "",
    task_id: undefined,
    is_featured: body.is_featured || false,
    created_at: new Date().toISOString(),
  };

  try {
    addGalleryItem(item);
    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/gallery?id=xxx
export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const deleted = deleteGalleryItem(id);
  if (!deleted) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}

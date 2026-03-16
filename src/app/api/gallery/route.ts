import { NextRequest, NextResponse } from "next/server";
import { listGallery, addGalleryItem } from "@/lib/db";
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
    preview_url: body.preview_url,
    task_id: undefined,
    is_featured: body.is_featured || false,
    created_at: new Date().toISOString(),
  };

  addGalleryItem(item);
  return NextResponse.json(item, { status: 201 });
}

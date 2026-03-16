import { NextRequest, NextResponse } from "next/server";
import { listSkills, createSkill } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export const dynamic = "force-dynamic";

// GET /api/skills
export async function GET() {
  return NextResponse.json(listSkills());
}

// POST /api/skills
export async function POST(req: NextRequest) {
  const body = await req.json() as {
    name: string;
    description?: string;
    instructions?: string;
    category?: string;
  };

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const skill = createSkill({
    id: uuidv4(),
    name: body.name.trim(),
    description: body.description?.trim() || "",
    instructions: body.instructions?.trim() || "",
    category: body.category || "custom",
    triggers: [],
    is_active: true,
  });

  return NextResponse.json(skill, { status: 201 });
}

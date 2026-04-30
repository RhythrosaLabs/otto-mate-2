import { NextRequest, NextResponse } from "next/server";
import { listSkills, createSkill } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { getSessionFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/skills
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  return NextResponse.json(listSkills(session?.userId));
}

// POST /api/skills
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  let body: {
    name: string;
    description?: string;
    instructions?: string;
    category?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

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
    user_id: session?.userId,
  });

  return NextResponse.json(skill, { status: 201 });
}

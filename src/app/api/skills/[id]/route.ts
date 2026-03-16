import { NextRequest, NextResponse } from "next/server";
import { listSkills, updateSkill, deleteSkill } from "@/lib/db";

export const dynamic = "force-dynamic";

// PUT /api/skills/[id]
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json() as {
    name?: string;
    description?: string;
    instructions?: string;
    category?: string;
    is_active?: boolean;
  };
  updateSkill(id, body);
  const skills = listSkills();
  const updated = skills.find((s) => s.id === id);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated);
}

// DELETE /api/skills/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  deleteSkill(id);
  return NextResponse.json({ success: true });
}

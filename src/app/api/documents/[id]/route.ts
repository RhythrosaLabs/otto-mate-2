import { NextRequest } from "next/server";
import { apiError, apiSuccess, safeErrorMessage } from "@/lib/constants";
import { getDocument, updateDocument, deleteDocument } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const doc = getDocument(id);
    if (!doc) return apiError("Document not found", 404);
    return apiSuccess(doc);
  } catch (err) {
    return apiError(safeErrorMessage(err), 500);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const doc = getDocument(id);
    if (!doc) return apiError("Document not found", 404);

    const body = await req.json();
    const updates: { title?: string; content?: string } = {};
    if (typeof body.title === "string") updates.title = body.title;
    if (typeof body.content === "string") updates.content = body.content;

    updateDocument(id, updates);
    const updated = getDocument(id);
    return apiSuccess(updated);
  } catch (err) {
    return apiError(safeErrorMessage(err), 500);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const doc = getDocument(id);
    if (!doc) return apiError("Document not found", 404);
    deleteDocument(id);
    return apiSuccess({ deleted: true });
  } catch (err) {
    return apiError(safeErrorMessage(err), 500);
  }
}

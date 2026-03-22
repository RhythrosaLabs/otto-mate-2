import { NextRequest } from "next/server";
import { apiError, apiSuccess, safeErrorMessage } from "@/lib/constants";
import { createDocument, listDocuments } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") as "document" | "spreadsheet" | null;
    const docs = listDocuments(type || undefined);
    return apiSuccess(docs);
  } catch (err) {
    return apiError(safeErrorMessage(err), 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const title = typeof body.title === "string" ? body.title.trim() : "Untitled";
    const type = body.type === "spreadsheet" ? "spreadsheet" : "document";
    const content = typeof body.content === "string" ? body.content : undefined;
    const doc = createDocument({ title, type, content });
    return apiSuccess(doc, 201);
  } catch (err) {
    return apiError(safeErrorMessage(err), 500);
  }
}

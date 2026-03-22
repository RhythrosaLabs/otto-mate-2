import type { Metadata } from "next";
import { getDocument } from "@/lib/db";
import { DocumentEditorClient } from "./editor-client";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Editor — Ottomate" };
export const dynamic = "force-dynamic";

export default async function DocumentEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let doc;
  try {
    doc = getDocument(id);
  } catch (err) {
    console.error("[document-editor] Failed to load:", err);
  }
  if (!doc) notFound();
  return <DocumentEditorClient initialDoc={doc} />;
}

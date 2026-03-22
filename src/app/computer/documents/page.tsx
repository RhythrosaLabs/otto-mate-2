import type { Metadata } from "next";
import { listDocuments } from "@/lib/db";
import { DocumentsListClient } from "./documents-client";

export const metadata: Metadata = { title: "Documents — Ottomate" };
export const dynamic = "force-dynamic";

export default function DocumentsPage() {
  let docs: ReturnType<typeof listDocuments> = [];
  try {
    docs = listDocuments();
  } catch (err) {
    console.error("[documents] Failed to load documents:", err);
  }
  return <DocumentsListClient initialDocs={docs} />;
}

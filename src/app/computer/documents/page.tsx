import type { Metadata } from "next";
import { listDocuments } from "@/lib/db";
import { DocumentsListClient } from "./documents-client";

export const metadata: Metadata = { title: "Documents — Ottomate" };
export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  let docs: Awaited<ReturnType<typeof listDocuments>> = [];
  try {
    docs = await listDocuments();
  } catch (err) {
    console.error("[documents] Failed to load documents:", err);
  }
  return <DocumentsListClient initialDocs={docs} />;
}

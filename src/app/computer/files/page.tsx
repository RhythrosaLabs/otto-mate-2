import type { Metadata } from "next";
import { listAllFiles, listFolders, getFilesStats } from "@/lib/db";
import { FilesClient } from "./files-client";

export const metadata: Metadata = { title: "Files — Ottomate" };
export const dynamic = "force-dynamic";

export default async function FilesPage() {
  let files: Awaited<ReturnType<typeof listAllFiles>> = [];
  let folders: Awaited<ReturnType<typeof listFolders>> = [];
  let stats: Awaited<ReturnType<typeof getFilesStats>> = { total: 0, bySource: {}, byType: {}, totalSize: 0 };
  try {
    files = await listAllFiles(500);
    folders = await listFolders();
    stats = await getFilesStats();
  } catch (err) {
    console.error("[files] Failed to load files:", err);
  }
  return <FilesClient files={files} initialFolders={folders} stats={stats} />;
}

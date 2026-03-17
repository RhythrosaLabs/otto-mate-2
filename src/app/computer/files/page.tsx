import type { Metadata } from "next";
import { listAllFiles, listFolders, getFilesStats } from "@/lib/db";
import { FilesClient } from "./files-client";

export const metadata: Metadata = { title: "Files — Ottomate" };
export const dynamic = "force-dynamic";

export default function FilesPage() {
  let files: ReturnType<typeof listAllFiles> = [];
  let folders: ReturnType<typeof listFolders> = [];
  let stats: ReturnType<typeof getFilesStats> = { total: 0, bySource: {}, byType: {}, totalSize: 0 };
  try {
    files = listAllFiles(500);
    folders = listFolders();
    stats = getFilesStats();
  } catch (err) {
    console.error("[files] Failed to load files:", err);
  }
  return <FilesClient files={files} initialFolders={folders} stats={stats} />;
}

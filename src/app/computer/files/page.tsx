import { listAllFiles, listFolders } from "@/lib/db";
import { FilesClient } from "./files-client";

export const dynamic = "force-dynamic";

export default function FilesPage() {
  const files = listAllFiles(500);
  const folders = listFolders();
  return <FilesClient files={files} initialFolders={folders} />;
}

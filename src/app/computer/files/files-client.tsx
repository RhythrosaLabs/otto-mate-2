"use client";

import { useState, useMemo, useCallback, useEffect, useRef, ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft, ChevronRight, Search, Grid3X3, List, LayoutGrid,
  FolderOpen, ImageIcon, FileText, Globe, Code2, Table2, Archive, File,
  Download, ExternalLink, Eye, ChevronDown, ChevronUp, HardDrive,
  Music, Video, Box, FileJson, FileCode, FileSpreadsheet, Loader2,
  FolderPlus, Pencil, Trash2, X, Check, FolderClosed, CornerDownRight,
  Monitor, MessageSquare, Sparkles, Cpu, Camera, Palette,
  Wand2, Link2, Upload, Film, AppWindow, Zap, Database,
} from "lucide-react";
import { formatBytes, formatRelativeTime } from "@/lib/utils";
import type { TaskFile, FileFolder } from "@/lib/types";
import { cn } from "@/lib/utils";

// ─── types ────────────────────────────────────────────────────────────────────

interface FilesWithTask extends TaskFile {
  task_title?: string;
}

type ViewMode  = "icons" | "list" | "gallery";
type SortKey   = "name" | "date" | "size" | "kind";
type SortDir   = "asc" | "desc";
type SidebarFilter = "all" | "images" | "video" | "audio" | "documents" | "webpages" | "code" | "data" | "models" | "archives" | "fonts" | "folder" | "browser" | "generated"
  | "src-playground" | "src-dreamscape" | "src-app-builder" | "src-agent" | "src-upload" | "src-chat" | "src-gallery" | "src-api" | "src-unknown";
type FileSource = "chat" | "browser" | "skill" | "generate" | "code" | "social" | "upload" | "playground" | "dreamscape" | "app-builder" | "agent" | "unknown";

// ─── mime helpers ─────────────────────────────────────────────────────────────

const isImage   = (m: string)            => m.startsWith("image/");
const isVideo   = (m: string, n: string) => m.startsWith("video/")  || /\.(mp4|webm|ogg|mov|avi|mkv|m4v|wmv|flv|f4v|3gp|3g2|mpg|mpeg|ts|mts|m2ts)$/i.test(n);
const isAudio   = (m: string, n: string) => m.startsWith("audio/")  || /\.(mp3|wav|ogg|flac|aac|m4a|opus|wma|aiff|aif|alac|amr|ape|au|mid|midi)$/i.test(n);
const is3D      = (m: string, n: string) => m.startsWith("model/")  || /\.(glb|gltf|stl|obj|fbx|dae|3ds|ply|usdz|usdc|usda|usd|blend|max|maya|ma|mb|c4d|hdr|exr)$/i.test(n);
const isPDF     = (m: string)            => m === "application/pdf";
const isHTML    = (m: string)            => m === "text/html";
const isArchive = (m: string, n: string) => m.includes("zip") || m.includes("archive") || m.includes("compressed") || /\.(zip|rar|7z|tar|gz|bz2|xz|dmg|iso|pkg)$/i.test(n);
const isFont    = (m: string, n: string) => m.startsWith("font/") || /\.(ttf|otf|woff|woff2|eot)$/i.test(n);
const isText    = (m: string, n: string) =>
  m.startsWith("text/") ||
  ["application/json", "application/javascript", "application/x-sh"].includes(m) ||
  /\.(md|txt|json|csv|js|ts|py|sh|yaml|yml|toml|xml|rs|go|java|c|cpp|h|cs|rb|php|sql|swift|kt|r|lua|pl|ex|exs|hs|ml|scala|dart|v|zig|nim|cr|jl)$/i.test(n);

const isBrowserScreenshot = (n: string) => /^screenshot[_-]/i.test(n) || /browser[_-]screenshot/i.test(n);
const isGenerated = (n: string) => /^(generated|dall-?e|replicate|dream)/i.test(n);

const canPreview = (m: string, n: string) =>
  isImage(m) || isVideo(m, n) || isAudio(m, n) || is3D(m, n) ||
  isPDF(m) || isHTML(m) || isText(m, n);

function getFileSource(name: string, taskTitle?: string, dbSource?: string): FileSource {
  // Prefer DB-stored source
  if (dbSource && dbSource !== "unknown") return dbSource as FileSource;
  if (isBrowserScreenshot(name)) return "browser";
  if (/^(generated|dall-?e)/i.test(name)) return "generate";
  if (/^replicate/i.test(name) || /^dream/i.test(name)) return "generate";
  if (/social[_-]?media|confirmation/i.test(name)) return "social";
  if (/^(output|result|plot|chart|figure)/i.test(name)) return "code";
  if (taskTitle && /chat|conversation/i.test(taskTitle)) return "chat";
  return "unknown";
}

const SOURCE_META: Record<FileSource, { label: string; color: string; icon: typeof Monitor }> = {
  browser:      { label: "Browser",       color: "#60a5fa", icon: Monitor },
  chat:         { label: "Chat",          color: "#34d399", icon: MessageSquare },
  skill:        { label: "Skill",         color: "#a78bfa", icon: Sparkles },
  generate:     { label: "Generated",     color: "#f472b6", icon: Palette },
  code:         { label: "Code",          color: "#fbbf24", icon: Cpu },
  social:       { label: "Social",        color: "#fb923c", icon: Link2 },
  upload:       { label: "Upload",        color: "#6b7280", icon: Upload },
  playground:   { label: "Playground",    color: "#c084fc", icon: Palette },
  dreamscape:   { label: "Video Studio",  color: "#a78bfa", icon: Film },
  "app-builder": { label: "App Builder", color: "#34d399", icon: AppWindow },
  agent:        { label: "Agent",         color: "#60a5fa", icon: Zap },
  unknown:      { label: "Task",          color: "#6b7280", icon: File },
};

function getFileCategory(m: string, n: string): SidebarFilter {
  if (isBrowserScreenshot(n)) return "browser";
  if (isGenerated(n)) return "generated";
  if (isImage(m))        return "images";
  if (isVideo(m, n))     return "video";
  if (isAudio(m, n))     return "audio";
  if (is3D(m, n))        return "models";
  if (isArchive(m, n))   return "archives";
  if (isFont(m, n))      return "fonts";
  if (isHTML(m))         return "webpages";
  if (m === "text/csv" || m.includes("spreadsheet")) return "data";
  if (
    m.includes("python") || m.includes("javascript") || m.includes("typescript") ||
    m === "text/x-python" || m === "application/x-sh" ||
    /\.(py|js|ts|jsx|tsx|sh|rb|go|rs|java|c|cpp|h|cs|php|sql|swift|kt|r|lua)$/i.test(n)
  ) return "code";
  return "documents";
}

function getFinderIcon(m: string, n: string, size = 16): ReactNode {
  if (isImage(m))       return <ImageIcon      size={size} className="text-blue-400" />;
  if (isVideo(m, n))    return <Video          size={size} className="text-violet-400" />;
  if (isAudio(m, n))    return <Music          size={size} className="text-pink-400" />;
  if (is3D(m, n))       return <Box            size={size} className="text-cyan-400" />;
  if (isPDF(m))         return <FileText       size={size} className="text-red-400" />;
  if (isHTML(m))        return <Globe          size={size} className="text-orange-400" />;
  if (isArchive(m, n))  return <Archive        size={size} className="text-purple-400" />;
  if (isFont(m, n))     return <FileText       size={size} className="text-amber-400" />;
  if (m === "application/json") return <FileJson size={size} className="text-yellow-400" />;
  if (m === "text/csv" || m.includes("spreadsheet")) return <FileSpreadsheet size={size} className="text-emerald-400" />;
  if (m.includes("python") || m.includes("javascript") || /\.(py|js|ts|sh|rb|go|rs)$/i.test(n))
    return <FileCode size={size} className="text-green-400" />;
  if (m.includes("document") || m.includes("word")) return <FileText size={size} className="text-blue-400" />;
  if (m.startsWith("text/")) return <FileText size={size} className="text-gray-400" />;
  void Code2; void Table2;
  return <File size={size} className="text-gray-400" />;
}

// ─── file thumbnail ────────────────────────────────────────────────────────────

function FileThumbnail({
  file, sizeClass = "w-14 h-14", iconSize = 26,
}: {
  file: FilesWithTask; sizeClass?: string; iconSize?: number;
}) {
  const url = `/api/files/${file.task_id}/${file.name}`;
  if (isImage(file.mime_type)) {
    return (
      <div className={cn(sizeClass, "rounded-lg overflow-hidden bg-white/[0.06] shadow-[0_1px_3px_rgba(0,0,0,0.3)] flex-shrink-0 ring-1 ring-white/[0.04]")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" className="w-full h-full object-cover" />
      </div>
    );
  }
  if (isVideo(file.mime_type, file.name)) {
    return (
      <div className={cn(sizeClass, "rounded-lg overflow-hidden bg-black shadow-[0_1px_3px_rgba(0,0,0,0.3)] flex-shrink-0 ring-1 ring-white/[0.04] relative")}>
        <video src={url} className="w-full h-full object-cover" muted preload="metadata" />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-5 h-5 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
            <Video size={10} className="text-white" />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className={cn(sizeClass, "rounded-xl bg-gradient-to-b from-white/[0.08] to-white/[0.03] flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.2)] flex-shrink-0 ring-1 ring-white/[0.04]")}>
      {getFinderIcon(file.mime_type, file.name, iconSize)}
    </div>
  );
}

// ─── text / csv / json fetching preview ───────────────────────────────────────

function TextPreviewContent({ url, mime }: { url: string; mime: string }) {
  const [body,    setBody]    = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState(false);

  useEffect(() => {
    setBody(null); setLoading(true); setErr(false);
    fetch(url)
      .then((r) => r.text())
      .then((t) => { setBody(t); setLoading(false); })
      .catch(() => { setErr(true); setLoading(false); });
  }, [url]);

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <Loader2 size={18} className="animate-spin text-white/30" />
    </div>
  );
  if (err || !body) return (
    <p className="p-6 text-sm text-white/30">Unable to load file content.</p>
  );

  if (mime === "text/csv" || url.toLowerCase().endsWith(".csv")) {
    const rows = body.split("\n").filter((r) => r.trim()).map((r) =>
      (r.match(/(".*?"|[^,]+)/g) ?? [r]).map((c) => c.replace(/^"|"$/g, "").trim())
    );
    const header = rows[0] ?? [];
    const data   = rows.slice(1);
    return (
      <div className="overflow-auto max-h-[70vh] text-xs">
        <table className="w-full border-collapse">
          <thead>
            <tr style={{ background: "#2a2a2d" }}>
              {header.map((h, i) => (
                <th key={i} className="text-left px-3 py-2 text-white/50 font-medium border-b border-white/[0.07] whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 300).map((row, ri) => (
              <tr key={ri} className={ri % 2 === 0 ? "bg-white/[0.015]" : ""}>
                {row.map((cell, ci) => (
                  <td key={ci} className="px-3 py-1.5 text-white/60 border-b border-white/[0.04] whitespace-nowrap max-w-[240px] truncate">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {data.length > 300 && (
          <p className="px-3 py-2 text-[11px] text-white/25">{data.length - 300} more rows not shown</p>
        )}
      </div>
    );
  }

  if (mime === "application/json" || url.toLowerCase().endsWith(".json")) {
    let pretty = body;
    try { pretty = JSON.stringify(JSON.parse(body), null, 2); } catch { /* leave raw */ }
    return (
      <pre className="p-5 text-[12px] leading-relaxed text-emerald-300/80 font-mono overflow-auto max-h-[70vh] whitespace-pre-wrap break-all">
        {pretty}
      </pre>
    );
  }

  return (
    <pre className="p-5 text-[12px] leading-relaxed text-white/70 font-mono overflow-auto max-h-[70vh] whitespace-pre-wrap break-all">
      {body}
    </pre>
  );
}

// ─── model-viewer ──────────────────────────────────────────────────────────────

function ModelViewerPreview({ url }: { url: string }) {
  const divRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!document.querySelector("#mv-script")) {
      const s = document.createElement("script");
      s.id = "mv-script"; s.type = "module";
      s.src = "https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js";
      document.head.appendChild(s);
    }
  }, []);
  useEffect(() => {
    if (!divRef.current) return;
    divRef.current.innerHTML = `
      <model-viewer src="${url}" auto-rotate camera-controls shadow-intensity="1"
        style="width:100%;height:520px;background:#111113;--poster-color:#111113"
        loading="eager"></model-viewer>`;
  }, [url]);
  return <div ref={divRef} />;
}

// ─── preview content ──────────────────────────────────────────────────────────

function PreviewContent({ file }: { file: FilesWithTask }) {
  const url = `/api/files/${file.task_id}/${file.name}`;
  const m = file.mime_type;
  const n = file.name;

  if (isImage(m)) return (
    <div className="flex items-center justify-center p-6 min-h-64" style={{ background: "#111113" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={n} className="max-w-full max-h-[75vh] object-contain rounded shadow-2xl" />
    </div>
  );
  if (isVideo(m, n)) return (
    <div className="flex items-center justify-center" style={{ background: "#000" }}>
      <video src={url} controls autoPlay className="max-w-full max-h-[75vh] w-full" style={{ outline: "none" }} />
    </div>
  );
  if (isAudio(m, n)) return (
    <div className="flex flex-col items-center justify-center py-16 px-8 gap-6" style={{ background: "#111113" }}>
      <div className="w-28 h-28 rounded-3xl bg-gradient-to-br from-pink-500/20 to-violet-500/20 border border-white/10 flex items-center justify-center">
        <Music size={44} className="text-pink-400/80" />
      </div>
      <p className="text-sm font-medium text-white/60 text-center">{n}</p>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio controls src={url} autoPlay className="w-full max-w-md" style={{ colorScheme: "dark" }} />
    </div>
  );
  if (isPDF(m)) return (
    <iframe src={`${url}#toolbar=1`} className="w-full border-0 bg-white" style={{ height: "80vh" }} title={n} />
  );
  if (isHTML(m)) return (
    <iframe src={url} className="w-full border-0 bg-white" style={{ height: "80vh" }} sandbox="allow-scripts allow-same-origin" title={n} />
  );
  if (is3D(m, n)) {
    if (/\.(glb|gltf)$/i.test(n) || m === "model/gltf-binary" || m === "model/gltf+json") return (
      <div style={{ background: "#111113" }}>
        <ModelViewerPreview url={url} />
        <p className="px-4 py-2 text-[11px] text-white/25 text-center">Drag to rotate · Scroll to zoom</p>
      </div>
    );
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4" style={{ background: "#111113" }}>
        <div className="w-24 h-24 rounded-2xl bg-cyan-500/10 border border-white/10 flex items-center justify-center">
          <Box size={40} className="text-cyan-400/70" />
        </div>
        <p className="text-sm text-white/50">{n}</p>
        <p className="text-xs text-white/25">Direct in-browser preview not available for this 3D format.</p>
        <a href={url} download className="mt-2 px-4 py-2 rounded-lg bg-white/8 hover:bg-white/12 text-xs text-white/60 hover:text-white transition-colors flex items-center gap-2">
          <Download size={13} /> Download to open in your 3D app
        </a>
      </div>
    );
  }
  if (isText(m, n)) return (
    <div style={{ background: "#0d0d0f" }}>
      <TextPreviewContent url={url} mime={m} />
    </div>
  );
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4" style={{ background: "#111113" }}>
      {getFinderIcon(m, n, 44)}
      <p className="text-sm text-white/40">No preview available</p>
      <a href={url} download className="px-4 py-2 rounded-lg bg-white/8 hover:bg-white/12 text-xs text-white/60 hover:text-white transition-colors flex items-center gap-2">
        <Download size={13} /> Download
      </a>
    </div>
  );
}

// ─── folder thumbnail ──────────────────────────────────────────────────────────

function FolderThumbnail({ folder, sizeClass = "w-14 h-14", iconSize = 26 }: { folder: FileFolder; sizeClass?: string; iconSize?: number }) {
  return (
    <div className={cn(sizeClass, "rounded-xl flex items-center justify-center flex-shrink-0")}>
      <FolderClosed size={iconSize} style={{ color: folder.color || "#5e9cf0" }} />
    </div>
  );
}

// ─── main component ────────────────────────────────────────────────────────────

export function FilesClient({ files, initialFolders, stats }: {
  files: FilesWithTask[];
  initialFolders: FileFolder[];
  stats?: { total: number; bySource: Record<string, number>; byType: Record<string, number>; totalSize: number };
}) {
  const router = useRouter();
  const [search,           setSearch]           = useState("");
  const [previewFile,      setPreviewFile]      = useState<FilesWithTask | null>(null);
  const [viewMode,         setViewMode]         = useState<ViewMode>("icons");
  const [sidebarFilter,    setSidebarFilter]    = useState<SidebarFilter>("all");
  const [sortKey,          setSortKey]          = useState<SortKey>("date");
  const [sortDir,          setSortDir]          = useState<SortDir>("desc");
  const [selectedFile,     setSelectedFile]     = useState<FilesWithTask | null>(null);
  const [folders,          setFolders]          = useState<FileFolder[]>(initialFolders);
  const [currentFolderId,  setCurrentFolderId]  = useState<string | null>(null);
  const [folderHistory,    setFolderHistory]    = useState<(string | null)[]>([null]);
  const [historyIndex,     setHistoryIndex]     = useState(0);
  const [creatingFolder,   setCreatingFolder]   = useState(false);
  const [newFolderName,    setNewFolderName]    = useState("untitled folder");
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameValue,      setRenameValue]      = useState("");
  const [contextMenu,      setContextMenu]      = useState<{ x: number; y: number; fileId?: string; folderId?: string } | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // ── Navigate into folder ──
  const navigateToFolder = useCallback((folderId: string | null) => {
    setFolderHistory(prev => [...prev.slice(0, historyIndex + 1), folderId]);
    setHistoryIndex(prev => prev + 1);
    setCurrentFolderId(folderId);
    setSelectedFile(null);
    setSelectedFolderId(null);
    if (folderId) setSidebarFilter("all");
  }, [historyIndex]);

  const goBack = useCallback(() => {
    if (historyIndex > 0) {
      const newIdx = historyIndex - 1;
      setHistoryIndex(newIdx);
      setCurrentFolderId(folderHistory[newIdx]);
    }
  }, [historyIndex, folderHistory]);

  const goForward = useCallback(() => {
    if (historyIndex < folderHistory.length - 1) {
      const newIdx = historyIndex + 1;
      setHistoryIndex(newIdx);
      setCurrentFolderId(folderHistory[newIdx]);
    }
  }, [historyIndex, folderHistory]);

  // ── Create folder ──
  const handleCreateFolder = useCallback(async () => {
    const name = newFolderName.trim() || "untitled folder";
    try {
      const res = await fetch("/api/files?action=createFolder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parentId: currentFolderId }),
      });
      const folder = await res.json();
      setFolders(prev => [...prev, folder]);
    } catch { /* ignore */ }
    setCreatingFolder(false);
    setNewFolderName("untitled folder");
  }, [newFolderName, currentFolderId]);

  // ── Rename folder ──
  const handleRenameFolder = useCallback(async (id: string, name: string) => {
    try {
      await fetch("/api/files?action=renameFolder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name }),
      });
      setFolders(prev => prev.map(f => f.id === id ? { ...f, name } : f));
    } catch { /* ignore */ }
    setRenamingFolderId(null);
  }, []);

  // ── Delete folder ──
  const handleDeleteFolder = useCallback(async (id: string) => {
    try {
      await fetch(`/api/files?action=deleteFolder&id=${id}`, { method: "DELETE" });
      setFolders(prev => prev.filter(f => f.id !== id));
      if (currentFolderId === id) navigateToFolder(null);
    } catch { /* ignore */ }
  }, [currentFolderId, navigateToFolder]);

  // ── Move file to folder ──
  const handleMoveToFolder = useCallback(async (fileIds: string[], folderId: string | null) => {
    try {
      await fetch("/api/files?action=moveToFolder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds, folderId }),
      });
      window.location.reload();
    } catch { /* ignore */ }
  }, []);

  // Focus inputs
  useEffect(() => {
    if (creatingFolder && newFolderInputRef.current) {
      newFolderInputRef.current.focus();
      newFolderInputRef.current.select();
    }
  }, [creatingFolder]);

  useEffect(() => {
    if (renamingFolderId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingFolderId]);

  // Close context menu
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [contextMenu]);

  const counts = useMemo(() => {
    const c: Record<SidebarFilter, number> = {
      all: files.length, images: 0, video: 0, audio: 0,
      documents: 0, webpages: 0, code: 0, data: 0, models: 0,
      archives: 0, fonts: 0, folder: 0, browser: 0, generated: 0,
      "src-playground": 0, "src-dreamscape": 0, "src-app-builder": 0,
      "src-agent": 0, "src-upload": 0, "src-chat": 0, "src-gallery": 0,
      "src-api": 0, "src-unknown": 0,
    };
    files.forEach(f => {
      c[getFileCategory(f.mime_type, f.name)]++;
      const src = f.source || "unknown";
      const srcKey = `src-${src}` as SidebarFilter;
      if (srcKey in c) c[srcKey]++;
    });
    c.folder = folders.length;
    return c;
  }, [files, folders]);

  const currentSubFolders = useMemo(() => {
    return folders.filter(f => (f.parent_id || null) === currentFolderId);
  }, [folders, currentFolderId]);

  const filtered = useMemo(() => {
    let list = [...files];

    if (currentFolderId) {
      list = list.filter(f => f.folder_id === currentFolderId);
    } else if (sidebarFilter === "all") {
      if (!search) list = list.filter(f => !f.folder_id);
    }

    if (sidebarFilter !== "all" && sidebarFilter !== "folder" && sidebarFilter !== "browser" && sidebarFilter !== "generated"
      && !sidebarFilter.startsWith("src-")) {
      list = list.filter(f => getFileCategory(f.mime_type, f.name) === sidebarFilter);
    }

    if (sidebarFilter === "browser") {
      list = list.filter(f => isBrowserScreenshot(f.name));
    }
    if (sidebarFilter === "generated") {
      list = list.filter(f => isGenerated(f.name) || f.source === "playground" || f.source === "dreamscape");
    }
    // Source-based filters
    if (sidebarFilter.startsWith("src-")) {
      const srcValue = sidebarFilter.replace("src-", "");
      list = list.filter(f => (f.source || "unknown") === srcValue);
    }

    if (search) {
      const q = search.toLowerCase();
      list = files.filter(f =>
        f.name.toLowerCase().includes(q) ||
        f.task_title?.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "date") cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      else if (sortKey === "size") cmp = a.size - b.size;
      else if (sortKey === "kind") cmp = a.mime_type.localeCompare(b.mime_type);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [files, sidebarFilter, search, sortKey, sortDir, currentFolderId]);

  const totalSize = useMemo(() => filtered.reduce((acc, f) => acc + f.size, 0), [filtered]);

  const handleSort = useCallback((key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }, [sortKey]);

  const breadcrumb = useMemo(() => {
    const parts: Array<{ id: string | null; name: string }> = [];
    let current = currentFolderId;
    const visited = new Set<string>();
    while (current) {
      if (visited.has(current)) break;
      visited.add(current);
      const folder = folders.find(f => f.id === current);
      if (folder) {
        parts.unshift({ id: folder.id, name: folder.name });
        current = folder.parent_id || null;
      } else break;
    }
    parts.unshift({ id: null, name: "Files" });
    return parts;
  }, [currentFolderId, folders]);

  const folderFileCount = useCallback((folderId: string): number => {
    const direct = files.filter(f => f.folder_id === folderId).length;
    const childFolders = folders.filter(f => f.parent_id === folderId);
    return direct + childFolders.reduce((acc, cf) => acc + folderFileCount(cf.id), 0);
  }, [files, folders]);

  const sidebarItems: Array<{ key: SidebarFilter; label: string; icon: ReactNode }> = [
    { key: "all",       label: "All Files",       icon: <FolderOpen      size={13} className="text-[#5e9cf0]" /> },
    { key: "browser",   label: "Browser Sessions", icon: <Monitor        size={13} className="text-[#60a5fa]" /> },
    { key: "generated", label: "Generated",        icon: <Wand2          size={13} className="text-[#f472b6]" /> },
    { key: "images",    label: "Images",           icon: <ImageIcon      size={13} className="text-[#f27a54]" /> },
    { key: "video",     label: "Video",            icon: <Video          size={13} className="text-[#b085f5]" /> },
    { key: "audio",     label: "Audio",            icon: <Music          size={13} className="text-[#f48db4]" /> },
    { key: "models",    label: "3D Objects",       icon: <Box            size={13} className="text-[#4dd0e1]" /> },
    { key: "documents", label: "Documents",        icon: <FileText       size={13} className="text-[#6abcf7]" /> },
    { key: "webpages",  label: "Web Pages",        icon: <Globe          size={13} className="text-[#f7c06a]" /> },
    { key: "code",      label: "Code",             icon: <FileCode       size={13} className="text-[#74d990]" /> },
    { key: "data",      label: "Data",             icon: <FileSpreadsheet size={13} className="text-[#74d990]" /> },
    { key: "archives",  label: "Archives",         icon: <Archive        size={13} className="text-[#c084fc]" /> },
    { key: "fonts",     label: "Fonts",            icon: <FileText       size={13} className="text-[#fbbf24]" /> },
  ];

  const sourceFilterItems: Array<{ key: SidebarFilter; label: string; icon: ReactNode }> = [
    { key: "src-playground",   label: "Playground",    icon: <Palette       size={13} className="text-[#c084fc]" /> },
    { key: "src-dreamscape",   label: "Video Studio",  icon: <Film          size={13} className="text-[#a78bfa]" /> },
    { key: "src-app-builder",  label: "App Builder",   icon: <AppWindow     size={13} className="text-[#34d399]" /> },
    { key: "src-agent",        label: "Ottomate Agent",icon: <Zap           size={13} className="text-[#60a5fa]" /> },
    { key: "src-chat",         label: "Chat",          icon: <MessageSquare size={13} className="text-[#34d399]" /> },
    { key: "src-gallery",      label: "Gallery",       icon: <Palette       size={13} className="text-[#f27a54]" /> },
    { key: "src-api",          label: "API",           icon: <Database      size={13} className="text-[#fbbf24]" /> },
    { key: "src-upload",       label: "Uploads",       icon: <Upload        size={13} className="text-[#6b7280]" /> },
    { key: "src-unknown",      label: "Other",         icon: <FileText      size={13} className="text-[#6b7280]" /> },
  ];

  const handleContextMenu = useCallback((e: React.MouseEvent, fileId?: string, folderId?: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, fileId, folderId });
  }, []);

  // ── Folder renderers ──

  const renderFolderIcon = (folder: FileFolder) => (
    <button
      key={`folder-${folder.id}`}
      onClick={() => { setSelectedFolderId(selectedFolderId === folder.id ? null : folder.id); setSelectedFile(null); }}
      onDoubleClick={() => navigateToFolder(folder.id)}
      onContextMenu={(e) => handleContextMenu(e, undefined, folder.id)}
      className={cn(
        "flex flex-col items-center gap-1 p-2 rounded-lg transition-colors text-center",
        selectedFolderId === folder.id ? "bg-white/[0.08] ring-1 ring-white/[0.12] shadow-[0_2px_8px_rgba(0,0,0,0.3)]" : "hover:bg-white/[0.04]"
      )}
    >
      {renamingFolderId === folder.id ? (
        <>
          <FolderThumbnail folder={folder} />
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={() => handleRenameFolder(folder.id, renameValue)}
            onKeyDown={(e) => { if (e.key === "Enter") handleRenameFolder(folder.id, renameValue); if (e.key === "Escape") setRenamingFolderId(null); }}
            className="text-[10px] text-white/80 bg-white/10 border border-white/20 rounded px-1 py-0.5 w-full text-center outline-none focus:border-[#5e9cf0]"
            onClick={(e) => e.stopPropagation()}
          />
        </>
      ) : (
        <>
          <FolderThumbnail folder={folder} />
          <span className="text-[10px] text-white/60 leading-tight line-clamp-2 w-full break-all">{folder.name}</span>
        </>
      )}
    </button>
  );

  const renderFolderList = (folder: FileFolder) => (
    <div
      key={`folder-${folder.id}`}
      onClick={() => { setSelectedFolderId(selectedFolderId === folder.id ? null : folder.id); setSelectedFile(null); }}
      onDoubleClick={() => navigateToFolder(folder.id)}
      onContextMenu={(e) => handleContextMenu(e, undefined, folder.id)}
      className={cn(
        "flex items-center gap-3 px-4 py-[7px] cursor-pointer group border-b border-white/[0.04] transition-colors",
        selectedFolderId === folder.id ? "bg-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]" : "hover:bg-white/[0.025]"
      )}
    >
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <FolderClosed size={14} style={{ color: folder.color || "#5e9cf0" }} className="flex-shrink-0" />
        {renamingFolderId === folder.id ? (
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={() => handleRenameFolder(folder.id, renameValue)}
            onKeyDown={(e) => { if (e.key === "Enter") handleRenameFolder(folder.id, renameValue); if (e.key === "Escape") setRenamingFolderId(null); }}
            className="text-xs text-white/80 bg-white/10 border border-white/20 rounded px-1.5 py-0.5 outline-none focus:border-[#5e9cf0] flex-1"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="text-xs text-white/80 truncate">{folder.name}</span>
        )}
      </div>
      <div className="w-28 flex-shrink-0 text-[11px] text-white/35">{formatRelativeTime(folder.created_at)}</div>
      <div className="w-20 flex-shrink-0 text-[11px] text-white/35 text-right">&mdash;</div>
      <div className="w-32 flex-shrink-0 text-[11px] text-white/35 truncate">Folder</div>
      <div className="w-20 flex-shrink-0 flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={(e) => { e.stopPropagation(); setRenamingFolderId(folder.id); setRenameValue(folder.name); }}
          className="p-1.5 rounded text-white/40 hover:text-white/85 hover:bg-white/8 transition-colors"><Pencil size={12} /></button>
        <button onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id); }}
          className="p-1.5 rounded text-white/40 hover:text-red-400 hover:bg-white/8 transition-colors"><Trash2 size={12} /></button>
      </div>
    </div>
  );

  const renderFolderGallery = (folder: FileFolder) => (
    <button
      key={`folder-${folder.id}`}
      onClick={() => { setSelectedFolderId(selectedFolderId === folder.id ? null : folder.id); setSelectedFile(null); }}
      onDoubleClick={() => navigateToFolder(folder.id)}
      onContextMenu={(e) => handleContextMenu(e, undefined, folder.id)}
      className={cn(
        "flex flex-col items-center gap-1.5 p-2.5 rounded-xl transition-colors text-center",
        selectedFolderId === folder.id ? "bg-white/[0.08] ring-1 ring-white/[0.12] shadow-[0_2px_8px_rgba(0,0,0,0.3)]" : "hover:bg-white/[0.04]"
      )}
    >
      <FolderThumbnail folder={folder} sizeClass="w-16 h-16" iconSize={30} />
      <span className="text-[10px] text-white/65 leading-tight line-clamp-2 w-full px-0.5">{folder.name}</span>
      <span className="text-[9px] text-white/25">{folderFileCount(folder.id)} items</span>
    </button>
  );

  return (
    <div className="h-screen flex flex-col overflow-hidden p-4">
      {/* ── Finder Window ── */}
      <div className="flex-1 flex flex-col overflow-hidden rounded-xl border border-white/[0.08] finder-window finder-animate-in">

        {/* ── Toolbar ── */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.06] select-none finder-toolbar">
          <div className="flex items-center gap-1.5 mr-1 flex-shrink-0">
            <div className="w-3 h-3 rounded-full bg-[#ff5f57] border border-[#e0443e] shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]" />
            <div className="w-3 h-3 rounded-full bg-[#febc2e] border border-[#d4a017] shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]" />
            <div className="w-3 h-3 rounded-full bg-[#28c840] border border-[#1daa2e] shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]" />
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button onClick={goBack} disabled={historyIndex <= 0}
              className={cn("p-1.5 rounded-md transition-all", historyIndex > 0 ? "text-white/50 hover:text-white/80 hover:bg-white/[0.06]" : "text-white/15")}>
              <ChevronLeft size={14} />
            </button>
            <button onClick={goForward} disabled={historyIndex >= folderHistory.length - 1}
              className={cn("p-1.5 rounded-md transition-all", historyIndex < folderHistory.length - 1 ? "text-white/50 hover:text-white/80 hover:bg-white/[0.06]" : "text-white/15")}>
              <ChevronRight size={14} />
            </button>
          </div>
          <div className="flex items-center rounded-lg overflow-hidden border border-white/[0.08] flex-shrink-0 finder-view-switcher">
            {([
              { mode: "icons" as const, Icon: Grid3X3, title: "Icon View" },
              { mode: "list" as const, Icon: List, title: "List View" },
              { mode: "gallery" as const, Icon: LayoutGrid, title: "Gallery View" },
            ]).map(({ mode, Icon, title }, i) => (
              <button key={mode} onClick={() => setViewMode(mode)} title={title}
                className={cn("px-2.5 py-1.5 transition-all", i > 0 && "border-l border-white/[0.08]",
                  viewMode === mode ? "bg-white/[0.12] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" : "text-white/40 hover:text-white/70 hover:bg-white/[0.04]")}>
                <Icon size={13} />
              </button>
            ))}
          </div>

          {/* Breadcrumb */}
          <div className="flex-1 flex items-center justify-center gap-0.5 min-w-0">
            {breadcrumb.map((crumb, i) => (
              <span key={crumb.id ?? "root"} className="flex items-center gap-0.5 min-w-0">
                {i > 0 && <ChevronRight size={10} className="text-white/20 flex-shrink-0" />}
                <button onClick={() => navigateToFolder(crumb.id)}
                  className={cn("text-xs font-medium truncate max-w-32 transition-colors",
                    i === breadcrumb.length - 1 ? "text-white/70" : "text-white/35 hover:text-white/60")}>
                  {crumb.name}
                </button>
              </span>
            ))}
          </div>

          <button onClick={() => { setCreatingFolder(true); setNewFolderName("untitled folder"); }} title="New Folder"
            className="p-1.5 rounded-md text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-all flex-shrink-0">
            <FolderPlus size={14} />
          </button>

          <div className="relative flex-shrink-0">
            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search"
              className="w-44 text-xs bg-white/[0.05] border border-white/[0.08] rounded-lg pl-7 pr-3 py-1.5 text-white/80 placeholder:text-white/25 outline-none focus:bg-white/[0.09] focus:border-white/20 focus:shadow-[0_0_0_3px_rgba(94,156,240,0.08)] transition-all" />
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 flex overflow-hidden">
          {/* ── Sidebar ── */}
          <div className="w-48 flex-shrink-0 border-r border-white/[0.06] overflow-y-auto py-3 finder-sidebar">
            <p className="px-3 mb-1.5 finder-sidebar-section-label">Favorites</p>
            {sidebarItems.filter(item => item.key === "all" || counts[item.key] > 0).map(item => (
              <button key={item.key}
                onClick={() => { setSidebarFilter(item.key); if (item.key !== "all") setCurrentFolderId(null); }}
                className={cn("w-[calc(100%-10px)] mx-[5px] flex items-center gap-2 px-2.5 py-[5px] rounded-lg transition-all group text-left",
                  sidebarFilter === item.key && !currentFolderId
                    ? "bg-white/[0.1] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_1px_2px_rgba(0,0,0,0.2)]"
                    : "text-white/50 hover:bg-white/[0.04] hover:text-white/75")}>
                {item.icon}
                <span className="text-[11px] font-medium flex-1 truncate">{item.label}</span>
                {counts[item.key] > 0 && <span className="text-[10px] text-white/20 group-hover:text-white/35 flex-shrink-0 tabular-nums">{counts[item.key]}</span>}
              </button>
            ))}

            {folders.length > 0 && (
              <>
                <p className="px-3 mt-4 mb-1.5 finder-sidebar-section-label">Folders</p>
                {folders.filter(f => !f.parent_id).map(folder => (
                  <button key={folder.id}
                    onClick={() => { setSidebarFilter("all"); navigateToFolder(folder.id); }}
                    className={cn("w-[calc(100%-10px)] mx-[5px] flex items-center gap-2 px-2.5 py-[5px] rounded-lg transition-all group text-left",
                      currentFolderId === folder.id
                        ? "bg-white/[0.1] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_1px_2px_rgba(0,0,0,0.2)]"
                        : "text-white/50 hover:bg-white/[0.04] hover:text-white/75")}>
                    <FolderClosed size={13} style={{ color: folder.color || "#5e9cf0" }} />
                    <span className="text-[11px] font-medium flex-1 truncate">{folder.name}</span>
                    <span className="text-[10px] text-white/20 group-hover:text-white/35 flex-shrink-0 tabular-nums">{folderFileCount(folder.id)}</span>
                  </button>
                ))}
              </>
            )}

            {/* ── Integration Links ── */}
            <p className="px-3 mt-4 mb-1.5 finder-sidebar-section-label">Generation Sources</p>
            {sourceFilterItems.filter(item => counts[item.key] > 0).map(item => (
              <button key={item.key}
                onClick={() => { setSidebarFilter(item.key); setCurrentFolderId(null); }}
                className={cn("w-[calc(100%-10px)] mx-[5px] flex items-center gap-2 px-2.5 py-[5px] rounded-lg transition-all group text-left",
                  sidebarFilter === item.key
                    ? "bg-white/[0.1] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_1px_2px_rgba(0,0,0,0.2)]"
                    : "text-white/50 hover:bg-white/[0.04] hover:text-white/75")}>
                {item.icon}
                <span className="text-[11px] font-medium flex-1 truncate">{item.label}</span>
                <span className="text-[10px] text-white/20 group-hover:text-white/35 flex-shrink-0 tabular-nums">{counts[item.key]}</span>
              </button>
            ))}



            <div className="mx-3 mt-4 mb-2 border-t border-white/[0.05]" />
            <p className="px-3 mb-1.5 finder-sidebar-section-label">Storage</p>
            <div className="px-3">
              <div className="flex items-center gap-2 text-white/30 mb-1.5">
                <HardDrive size={11} />
                <span className="text-[11px]">{stats?.total || files.length} files</span>
              </div>
              <div className="h-[3px] bg-white/[0.06] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{
                  width: `${Math.min(100, ((stats?.totalSize || files.reduce((a, f) => a + f.size, 0)) / (500 * 1024 * 1024)) * 100)}%`,
                  background: "linear-gradient(90deg, #5e9cf0, #818cf8)",
                }} />
              </div>
              <p className="text-[10px] text-white/20 mt-1">{formatBytes(stats?.totalSize || files.reduce((a, f) => a + f.size, 0))} used</p>
              {stats?.bySource && Object.keys(stats.bySource).length > 1 && (
                <div className="mt-2 space-y-0.5">
                  {Object.entries(stats.bySource).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([src, count]) => (
                    <div key={src} className="flex items-center justify-between">
                      <span className="text-[9px] text-white/20 capitalize">{src === "unknown" ? "other" : src}</span>
                      <span className="text-[9px] text-white/15 tabular-nums">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Main Content ── */}
          <div className="flex-1 flex flex-col overflow-hidden" onContextMenu={(e) => handleContextMenu(e)}>
            {filtered.length === 0 && currentSubFolders.length === 0 && !creatingFolder ? (
              <div className="flex-1 flex flex-col items-center justify-center text-white/25">
                <FolderOpen size={44} className="mb-3 opacity-40" />
                <p className="text-sm font-medium">No Files</p>
                <p className="text-xs mt-1 opacity-60">
                  {search ? "No files match your search" : currentFolderId ? "This folder is empty" : "Files from tasks will appear here"}
                </p>
                {!search && (
                  <button onClick={() => { setCreatingFolder(true); setNewFolderName("untitled folder"); }}
                    className="mt-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.10] text-xs text-white/45 hover:text-white/70 transition-colors">
                    <FolderPlus size={13} /> New Folder
                  </button>
                )}
              </div>

            ) : viewMode === "list" ? (
              <div className="flex-1 overflow-auto">
                <div className="sticky top-0 flex items-center px-4 py-1.5 border-b border-white/[0.06] text-[11px] font-medium text-white/30 select-none z-10 finder-list-header">
                  {([
                    { key: "name" as SortKey, label: "Name", cls: "flex-1 min-w-0" },
                    { key: "date" as SortKey, label: "Date Modified", cls: "w-28 flex-shrink-0" },
                    { key: "size" as SortKey, label: "Size", cls: "w-20 flex-shrink-0 text-right" },
                    { key: "kind" as SortKey, label: "Kind", cls: "w-32 flex-shrink-0" },
                  ] as const).map(col => (
                    <button key={col.key} onClick={() => handleSort(col.key)}
                      className={cn("flex items-center gap-0.5 hover:text-white/60 transition-all", col.cls,
                        sortKey === col.key && "text-white/50")}>
                      {col.label}
                      {sortKey === col.key && (sortDir === "asc" ? <ChevronUp size={9} /> : <ChevronDown size={9} />)}
                    </button>
                  ))}
                  <div className="w-24 flex-shrink-0" />
                </div>

                {creatingFolder && (
                  <div className="flex items-center gap-3 px-4 py-[7px] bg-white/[0.04] border-b border-white/[0.04]">
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <FolderClosed size={14} className="text-[#5e9cf0] flex-shrink-0" />
                      <input ref={newFolderInputRef} value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
                        onBlur={handleCreateFolder}
                        onKeyDown={(e) => { if (e.key === "Enter") handleCreateFolder(); if (e.key === "Escape") setCreatingFolder(false); }}
                        className="text-xs text-white/80 bg-white/10 border border-white/20 rounded px-1.5 py-0.5 outline-none focus:border-[#5e9cf0] flex-1" />
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={handleCreateFolder} className="p-1 rounded text-green-400 hover:bg-white/10"><Check size={12} /></button>
                      <button onClick={() => setCreatingFolder(false)} className="p-1 rounded text-white/40 hover:bg-white/10"><X size={12} /></button>
                    </div>
                  </div>
                )}

                {currentSubFolders.map(renderFolderList)}

                {filtered.map(file => {
                  const source = getFileSource(file.name, file.task_title, file.source);
                  const srcMeta = SOURCE_META[source];
                  return (
                  <div key={file.id}
                    onClick={() => { setSelectedFile(selectedFile?.id === file.id ? null : file); setSelectedFolderId(null); }}
                    onContextMenu={(e) => handleContextMenu(e, file.id)}
                    className={cn("flex items-center gap-3 px-4 py-[7px] cursor-pointer group border-b border-white/[0.03] transition-all",
                      selectedFile?.id === file.id ? "bg-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]" : "hover:bg-white/[0.025]")}>
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <FileThumbnail file={file} sizeClass="w-5 h-5" iconSize={13} />
                      <span className="text-xs text-white/80 truncate">{file.name}</span>
                      {source !== "unknown" && (
                        <span className="finder-source-badge" style={{ background: `${srcMeta.color}15`, color: srcMeta.color }}>
                          {srcMeta.label}
                        </span>
                      )}
                    </div>
                    <div className="w-28 flex-shrink-0 text-[11px] text-white/30 tabular-nums">{formatRelativeTime(file.created_at)}</div>
                    <div className="w-20 flex-shrink-0 text-[11px] text-white/30 text-right tabular-nums">{formatBytes(file.size)}</div>
                    <div className="w-32 flex-shrink-0 text-[11px] text-white/30 truncate capitalize">
                      {file.mime_type.split("/")[1]?.replace(/x-/, "") ?? file.mime_type}
                    </div>
                    <div className="w-24 flex-shrink-0 flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {canPreview(file.mime_type, file.name) && (
                        <button onClick={(e) => { e.stopPropagation(); setPreviewFile(file); }}
                          className="p-1.5 rounded-md text-white/35 hover:text-white/85 hover:bg-white/[0.06] transition-all"><Eye size={12} /></button>
                      )}
                      <a href={`/api/files/${file.task_id}/${file.name}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                        className="p-1.5 rounded-md text-white/35 hover:text-white/85 hover:bg-white/[0.06] transition-all"><ExternalLink size={12} /></a>
                      <a href={`/api/files/${file.task_id}/${file.name}?download=1`} onClick={(e) => e.stopPropagation()}
                        className="p-1.5 rounded-md text-white/35 hover:text-white/85 hover:bg-white/[0.06] transition-all"><Download size={12} /></a>
                    </div>
                  </div>
                  );
                })}
              </div>

            ) : viewMode === "gallery" ? (
              <div className="flex-1 flex overflow-hidden">
                <div className="flex-1 overflow-auto p-4">
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-4">
                    {creatingFolder && (
                      <div className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl bg-white/[0.04] text-center">
                        <FolderClosed size={30} className="text-[#5e9cf0] mt-3 mb-1" />
                        <input ref={newFolderInputRef} value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
                          onBlur={handleCreateFolder}
                          onKeyDown={(e) => { if (e.key === "Enter") handleCreateFolder(); if (e.key === "Escape") setCreatingFolder(false); }}
                          className="text-[10px] text-white/80 bg-white/10 border border-white/20 rounded px-1 py-0.5 w-full text-center outline-none focus:border-[#5e9cf0]" />
                      </div>
                    )}
                    {currentSubFolders.map(renderFolderGallery)}
                    {filtered.map(file => {
                      const gSrc = getFileSource(file.name, file.task_title, file.source);
                      const gMeta = SOURCE_META[gSrc];
                      return (
                      <button key={file.id}
                        onClick={() => { setSelectedFile(selectedFile?.id === file.id ? null : file); setSelectedFolderId(null); }}
                        onDoubleClick={() => canPreview(file.mime_type, file.name) && setPreviewFile(file)}
                        onContextMenu={(e) => handleContextMenu(e, file.id)}
                        className={cn("flex flex-col items-center gap-1.5 p-2.5 rounded-xl transition-all text-center relative",
                          selectedFile?.id === file.id ? "bg-white/[0.08] ring-1 ring-white/[0.12] shadow-[0_2px_8px_rgba(0,0,0,0.3)]" : "hover:bg-white/[0.04]")}>
                        <FileThumbnail file={file} sizeClass="w-16 h-16" iconSize={26} />
                        <span className="text-[10px] text-white/60 leading-tight line-clamp-2 w-full px-0.5">{file.name}</span>
                        <span className="text-[9px] text-white/20 tabular-nums">{formatBytes(file.size)}</span>
                        {gSrc !== "unknown" && (
                          <span className="absolute top-1.5 right-1.5 w-3.5 h-3.5 rounded-full flex items-center justify-center" style={{ background: `${gMeta.color}20` }} title={gMeta.label}>
                            <gMeta.icon size={7} style={{ color: gMeta.color }} />
                          </span>
                        )}
                      </button>
                      );
                    })}
                  </div>
                </div>

                {(selectedFile || selectedFolderId) && (
                  <div className="w-60 flex-shrink-0 border-l border-white/[0.06] flex flex-col overflow-hidden finder-sidebar">
                    {selectedFile ? (
                      <>
                        <div className="p-4 border-b border-white/[0.06] flex flex-col items-center gap-3">
                          <FileThumbnail file={selectedFile} sizeClass="w-24 h-24" iconSize={40} />
                          <p className="text-xs font-semibold text-white/80 text-center break-all leading-snug px-2">{selectedFile.name}</p>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-1">
                          <p className="finder-sidebar-section-label mb-2">File Info</p>
                          {[
                            { label: "Size", value: formatBytes(selectedFile.size) },
                            { label: "Kind", value: (selectedFile.mime_type.split("/")[1] ?? selectedFile.mime_type).replace(/x-/, "") },
                            { label: "Created", value: formatRelativeTime(selectedFile.created_at) },
                            { label: "Source", value: SOURCE_META[getFileSource(selectedFile.name, selectedFile.task_title, selectedFile.source)].label },
                            ...(selectedFile.task_title ? [{ label: "Task", value: selectedFile.task_title }] : []),
                          ].map(row => (
                            <div key={row.label} className="flex gap-2 py-0.5">
                              <span className="text-[11px] text-white/25 w-14 flex-shrink-0 font-medium">{row.label}</span>
                              <span className="text-[11px] text-white/55 truncate">{row.value}</span>
                            </div>
                          ))}
                        </div>
                        <div className="p-3 border-t border-white/[0.06] flex gap-2">
                          {canPreview(selectedFile.mime_type, selectedFile.name) && (
                            <button onClick={() => setPreviewFile(selectedFile)}
                              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs text-white/50 hover:text-white bg-white/[0.05] hover:bg-white/[0.09] transition-all">
                              <Eye size={12} /> Preview
                            </button>
                          )}
                          <a href={`/api/files/${selectedFile.task_id}/${selectedFile.name}?download=1`}
                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs text-white/50 hover:text-white bg-white/[0.05] hover:bg-white/[0.09] transition-all">
                            <Download size={12} /> Save
                          </a>
                        </div>
                      </>
                    ) : selectedFolderId ? (
                      <>
                        <div className="p-4 border-b border-white/[0.06] flex flex-col items-center gap-3">
                          <FolderClosed size={48} className="text-[#5e9cf0]" />
                          <p className="text-xs font-semibold text-white/80 text-center break-all leading-snug px-2">
                            {folders.find(f => f.id === selectedFolderId)?.name}
                          </p>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-1">
                          <p className="finder-sidebar-section-label mb-2">Folder Info</p>
                          <div className="flex gap-2 py-0.5">
                            <span className="text-[11px] text-white/30 w-14 flex-shrink-0 font-medium">Items</span>
                            <span className="text-[11px] text-white/60">{folderFileCount(selectedFolderId)}</span>
                          </div>
                          <div className="flex gap-2 py-0.5">
                            <span className="text-[11px] text-white/30 w-14 flex-shrink-0 font-medium">Created</span>
                            <span className="text-[11px] text-white/60">{formatRelativeTime(folders.find(f => f.id === selectedFolderId)?.created_at || "")}</span>
                          </div>
                        </div>
                        <div className="p-3 border-t border-white/[0.06] flex gap-2">
                          <button onClick={() => navigateToFolder(selectedFolderId)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs text-white/50 hover:text-white bg-white/[0.05] hover:bg-white/[0.09] transition-all">
                            <FolderOpen size={12} /> Open
                          </button>
                          <button onClick={() => { setRenamingFolderId(selectedFolderId); setRenameValue(folders.find(f => f.id === selectedFolderId)?.name || ""); }}
                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs text-white/50 hover:text-white bg-white/[0.05] hover:bg-white/[0.09] transition-all">
                            <Pencil size={12} /> Rename
                          </button>
                        </div>
                      </>
                    ) : null}
                  </div>
                )}
              </div>

            ) : (
              /* ── Icon View ── */
              <div className="flex-1 overflow-auto p-4">
                <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-9 lg:grid-cols-11 xl:grid-cols-13 gap-2">
                  {creatingFolder && (
                    <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-white/[0.04] text-center">
                      <FolderClosed size={26} className="text-[#5e9cf0] mt-2 mb-1" />
                      <input ref={newFolderInputRef} value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
                        onBlur={handleCreateFolder}
                        onKeyDown={(e) => { if (e.key === "Enter") handleCreateFolder(); if (e.key === "Escape") setCreatingFolder(false); }}
                        className="text-[10px] text-white/80 bg-white/10 border border-white/20 rounded px-1 py-0.5 w-full text-center outline-none focus:border-[#5e9cf0]" />
                    </div>
                  )}
                  {currentSubFolders.map(renderFolderIcon)}
                  {filtered.map(file => (
                    <button key={file.id}
                      onClick={() => { setSelectedFile(selectedFile?.id === file.id ? null : file); setSelectedFolderId(null); }}
                      onDoubleClick={() => canPreview(file.mime_type, file.name) && setPreviewFile(file)}
                      onContextMenu={(e) => handleContextMenu(e, file.id)}
                      className={cn("flex flex-col items-center gap-1 p-2 rounded-lg transition-all text-center",
                        selectedFile?.id === file.id ? "bg-white/[0.08] ring-1 ring-white/[0.12] shadow-[0_2px_8px_rgba(0,0,0,0.3)]" : "hover:bg-white/[0.04]")}>
                      <FileThumbnail file={file} sizeClass="w-14 h-14" iconSize={26} />
                      <span className="text-[10px] text-white/55 leading-tight line-clamp-2 w-full break-all">{file.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Status Bar ── */}
            <div className="flex items-center justify-between px-4 py-1.5 border-t border-white/[0.06] text-[11px] text-white/25 flex-shrink-0 select-none finder-statusbar">
              <span className="tabular-nums">{filtered.length} item{filtered.length !== 1 ? "s" : ""}{currentSubFolders.length > 0 ? `, ${currentSubFolders.length} folder${currentSubFolders.length !== 1 ? "s" : ""}` : ""}</span>
              <span className="tabular-nums">{formatBytes(totalSize)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Context Menu ── */}
      {contextMenu && (
        <div className="fixed z-[60] min-w-[190px] rounded-xl border border-white/[0.1] py-1.5 finder-context-menu finder-animate-in"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={() => setContextMenu(null)}>
          {contextMenu.fileId && (() => {
            const ctxFile = files.find(f => f.id === contextMenu.fileId);
            if (!ctxFile) return null;
            return (
              <>
                {canPreview(ctxFile.mime_type, ctxFile.name) && (
                  <button onClick={() => setPreviewFile(ctxFile)}
                    className="w-full flex items-center gap-2.5 px-3.5 py-[6px] text-xs text-white/70 hover:bg-white/[0.07] hover:text-white transition-all text-left rounded-lg mx-0">
                    <Eye size={12} /> Quick Look
                  </button>
                )}
                <a href={`/api/files/${ctxFile.task_id}/${ctxFile.name}`} target="_blank" rel="noopener noreferrer"
                  className="w-full flex items-center gap-2.5 px-3.5 py-[6px] text-xs text-white/70 hover:bg-white/[0.07] hover:text-white transition-all">
                  <ExternalLink size={12} /> Open in New Tab
                </a>
                <a href={`/api/files/${ctxFile.task_id}/${ctxFile.name}?download=1`}
                  className="w-full flex items-center gap-2.5 px-3.5 py-[6px] text-xs text-white/70 hover:bg-white/[0.07] hover:text-white transition-all">
                  <Download size={12} /> Download
                </a>
                {folders.length > 0 && (
                  <>
                    <div className="border-t border-white/[0.06] my-1.5 mx-2" />
                    <div className="px-3.5 py-1 text-[10px] text-white/25 uppercase font-semibold tracking-wider">Move to Folder</div>
                    {currentFolderId && (
                      <button onClick={() => handleMoveToFolder([contextMenu.fileId!], null)}
                        className="w-full flex items-center gap-2.5 px-3.5 py-[6px] text-xs text-white/70 hover:bg-white/[0.07] hover:text-white transition-all text-left">
                        <CornerDownRight size={12} /> Root
                      </button>
                    )}
                    {folders.filter(f => f.id !== currentFolderId).map(folder => (
                      <button key={folder.id} onClick={() => handleMoveToFolder([contextMenu.fileId!], folder.id)}
                        className="w-full flex items-center gap-2.5 px-3.5 py-[6px] text-xs text-white/70 hover:bg-white/[0.07] hover:text-white transition-all text-left">
                        <FolderClosed size={12} style={{ color: folder.color }} /> {folder.name}
                      </button>
                    ))}
                  </>
                )}
              </>
            );
          })()}
          {contextMenu.folderId && (
            <>
              <button onClick={() => navigateToFolder(contextMenu.folderId!)}
                className="w-full flex items-center gap-2.5 px-3.5 py-[6px] text-xs text-white/70 hover:bg-white/[0.07] hover:text-white transition-all text-left">
                <FolderOpen size={12} /> Open
              </button>
              <button onClick={() => {
                const folder = folders.find(f => f.id === contextMenu.folderId);
                if (folder) { setRenamingFolderId(folder.id); setRenameValue(folder.name); }
              }}
                className="w-full flex items-center gap-2.5 px-3.5 py-[6px] text-xs text-white/70 hover:bg-white/[0.07] hover:text-white transition-all text-left">
                <Pencil size={12} /> Rename
              </button>
              <div className="border-t border-white/[0.06] my-1.5 mx-2" />
              <button onClick={() => handleDeleteFolder(contextMenu.folderId!)}
                className="w-full flex items-center gap-2.5 px-3.5 py-[6px] text-xs text-red-400/80 hover:bg-red-500/[0.08] hover:text-red-400 transition-all text-left">
                <Trash2 size={12} /> Delete
              </button>
            </>
          )}
          {!contextMenu.fileId && !contextMenu.folderId && (
            <>
              <button onClick={() => { setCreatingFolder(true); setNewFolderName("untitled folder"); }}
                className="w-full flex items-center gap-2.5 px-3.5 py-[6px] text-xs text-white/70 hover:bg-white/[0.07] hover:text-white transition-all text-left">
                <FolderPlus size={12} /> New Folder
              </button>
              <button onClick={() => { setSortKey("name"); setSortDir("asc"); }}
                className="w-full flex items-center gap-2.5 px-3.5 py-[6px] text-xs text-white/70 hover:bg-white/[0.07] hover:text-white transition-all text-left">
                <List size={12} /> Sort by Name
              </button>
              <button onClick={() => { setSortKey("date"); setSortDir("desc"); }}
                className="w-full flex items-center gap-2.5 px-3.5 py-[6px] text-xs text-white/70 hover:bg-white/[0.07] hover:text-white transition-all text-left">
                <List size={12} /> Sort by Date
              </button>
              <button onClick={() => { setSortKey("kind"); setSortDir("asc"); }}
                className="w-full flex items-center gap-2.5 px-3.5 py-[6px] text-xs text-white/70 hover:bg-white/[0.07] hover:text-white transition-all text-left">
                <List size={12} /> Sort by Kind
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Preview Modal ── */}
      {previewFile && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-6 backdrop-blur-md"
          onClick={() => setPreviewFile(null)}>
          <div className="relative max-w-5xl max-h-[90vh] w-full rounded-2xl overflow-hidden border border-white/[0.1] finder-animate-in"
            style={{ background: "rgba(24,24,28,0.9)", backdropFilter: "blur(40px) saturate(1.4)", boxShadow: "0 0 0 0.5px rgba(255,255,255,0.06), 0 25px 80px rgba(0,0,0,0.7), 0 0 120px rgba(0,0,0,0.2)" }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] finder-toolbar">
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button onClick={() => setPreviewFile(null)} className="w-3 h-3 rounded-full bg-[#ff5f57] border border-[#e0443e] shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] hover:opacity-75 transition-opacity" />
                <div className="w-3 h-3 rounded-full bg-[#febc2e] border border-[#d4a017] shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]" />
                <div className="w-3 h-3 rounded-full bg-[#28c840] border border-[#1daa2e] shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]" />
              </div>
              <div className="flex items-center gap-1.5">{getFinderIcon(previewFile.mime_type, previewFile.name, 13)}</div>
              <div className="flex-1 text-center text-xs font-medium text-white/50 truncate px-2">{previewFile.name}</div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-[11px] text-white/20 mr-1 tabular-nums">{formatBytes(previewFile.size)}</span>
                <a href={`/api/files/${previewFile.task_id}/${previewFile.name}`} target="_blank" rel="noopener noreferrer"
                  className="p-1.5 rounded-md text-white/35 hover:text-white/85 hover:bg-white/[0.06] transition-all"><ExternalLink size={13} /></a>
                <a href={`/api/files/${previewFile.task_id}/${previewFile.name}?download=1`}
                  className="p-1.5 rounded-md text-white/35 hover:text-white/85 hover:bg-white/[0.06] transition-all"><Download size={13} /></a>
              </div>
            </div>
            <div className="overflow-auto max-h-[calc(90vh-52px)]">
              <PreviewContent file={previewFile} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { addBackgroundOp, updateBackgroundOp, removeBackgroundOp } from "@/lib/background-ops";
import {
  Search, Play, Loader2, Sparkles, Image as ImageIcon, Video, Music, Mic2,
  Box, Wand2, Scissors, ZoomIn, AlertCircle, Type, Upload, X, RotateCcw,
  Shuffle, Download, ExternalLink, Clock, FileText, Volume2, Maximize2,
  Share2, Pen, Film, CuboidIcon, RefreshCw, Palette, Copy, Sliders,
  ChevronDown, Plus, Columns, Trash2, ChevronRight, Settings2, ArrowRight,
  History, Star, Zap, MoreHorizontal, Check, Eye, Grid, List, ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

type RunProvider = "auto" | "replicate" | "huggingface";
type GalleryFilter = "all" | "image" | "video" | "audio" | "3d" | "text";
type ViewMode = "grid" | "list";
type SortField = "date" | "name" | "type";

interface ModelResult {
  owner: string;
  name: string;
  fullName: string;
  description: string;
  run_count: number;
  downloads?: number;
  likes?: number;
  url: string;
  cover_image_url?: string;
  provider: "replicate" | "huggingface";
  pipeline_tag?: string;
}

interface GeneratedFile {
  filename: string;
  size: number;
  mimeType: string;
  url?: string;
}

interface RunResult {
  id?: string;
  model: string;
  modelReason: string;
  taskType: string;
  status: string;
  predictTime?: number;
  computeTime?: number;
  files: GeneratedFile[];
  textOutput?: string;
  predictionId?: string;
  provider: "replicate" | "huggingface";
  fallbackUsed?: boolean;
  fallbackReason?: string;
  prompt?: string;
  createdAt?: string;
}

interface UploadedFile {
  name: string;
  size: number;
  type: string;
  url: string;
  preview?: string;
}

interface PlaygroundColumn {
  id: string;
  model: string;
  provider: RunProvider;
  running: boolean;
  result: RunResult | null;
  error: string;
  params: Record<string, unknown>;
}

// ─── Quick-pick models ──────────────────────────────────────────────────────

const FEATURED_MODELS = [
  { fullName: "black-forest-labs/flux-schnell", label: "FLUX Schnell", provider: "replicate" as const, tag: "Fast" },
  { fullName: "black-forest-labs/flux-dev", label: "FLUX Dev", provider: "replicate" as const, tag: "Quality" },
  { fullName: "black-forest-labs/flux-1.1-pro", label: "FLUX 1.1 Pro", provider: "replicate" as const, tag: "Pro" },
  { fullName: "black-forest-labs/flux-2-pro", label: "FLUX 2 Pro", provider: "replicate" as const, tag: "Best" },
  { fullName: "stabilityai/stable-diffusion-xl-base-1.0", label: "SDXL (HF)", provider: "huggingface" as const, tag: "Classic" },
  { fullName: "bytedance/seedance-1-lite", label: "Seedance Lite", provider: "replicate" as const, tag: "Video" },
  { fullName: "facebook/musicgen-small", label: "MusicGen (HF)", provider: "huggingface" as const, tag: "Music" },
  { fullName: "recraft-ai/recraft-remove-background", label: "Remove BG", provider: "replicate" as const, tag: "Tool" },
  { fullName: "recraft-ai/recraft-crisp-upscale", label: "Crisp Upscale", provider: "replicate" as const, tag: "Upscale" },
  { fullName: "meta/meta-llama-3-70b-instruct", label: "Llama 3 70B", provider: "replicate" as const, tag: "Text" },
];

const ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9"];

// ─── Helpers ────────────────────────────────────────────────────────────────

const fmt = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
};

const getMimeCategory = (mime: string): GalleryFilter => {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.includes("gltf") || mime.includes("glb") || mime.includes("obj") || mime.includes("stl")) return "3d";
  return "text";
};

const timeAgo = (d: string) => {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
};

let colIdCounter = 0;
const newColId = () => "col-" + (++colIdCounter) + "-" + Date.now();

// ─── Provider Badge ─────────────────────────────────────────────────────────

function ProviderBadge({ provider }: { provider: "replicate" | "huggingface" }) {
  return (
    <span className={cn(
      "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0",
      provider === "replicate"
        ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
        : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
    )}>
      {provider === "replicate" ? "Replicate" : "HuggingFace"}
    </span>
  );
}

// ─── File Upload Zone ───────────────────────────────────────────────────────

function FileUploadZone({
  onFileUploaded,
  uploadedFile,
  onClear,
  compact,
}: {
  onFileUploaded: (f: UploadedFile) => void;
  uploadedFile: UploadedFile | null;
  onClear: () => void;
  compact?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/files", { method: "POST", body: form });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      const url = data.url || data.path || "";
      onFileUploaded({
        name: file.name,
        size: file.size,
        type: file.type,
        url,
        preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
      });
    } catch (e) {
      console.error("Upload error:", e);
    } finally {
      setUploading(false);
    }
  };

  if (uploadedFile) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-lg bg-[#161618] border border-[#2a2a2e]">
        {uploadedFile.preview ? (
          <img src={uploadedFile.preview} alt="" className="w-10 h-10 rounded object-cover" />
        ) : (
          <div className="w-10 h-10 rounded bg-[#1c1c1f] flex items-center justify-center">
            <FileText className="w-4 h-4 text-[#8b8b94]" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-[#e8e8ea] truncate">{uploadedFile.name}</p>
          <p className="text-[10px] text-[#8b8b94]">{(uploadedFile.size / 1024).toFixed(1)} KB</p>
        </div>
        <button onClick={onClear} className="p-1 rounded text-[#8b8b94] hover:text-[#e8e8ea] hover:bg-white/5">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files[0];
        if (f) void upload(f);
      }}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "flex items-center gap-2 rounded-lg border border-dashed cursor-pointer transition-all",
        compact ? "p-2" : "p-3",
        dragging
          ? "border-[#8b5cf6] bg-[#8b5cf6]/5"
          : "border-[#2a2a2e] hover:border-[#8b5cf6]/40 bg-[#0f0f10]/50"
      )}
    >
      {uploading ? (
        <Loader2 className="w-4 h-4 text-[#8b5cf6] animate-spin" />
      ) : (
        <Upload className="w-4 h-4 text-[#8b8b94]" />
      )}
      <span className="text-[11px] text-[#8b8b94]">
        {uploading ? "Uploading..." : compact ? "Upload file" : "Drop a file or click to upload (img2vid, upscale, 3D, etc.)"}
      </span>
      <input ref={inputRef} type="file" className="hidden" onChange={e => {
        const f = e.target.files?.[0];
        if (f) void upload(f);
      }} />
    </div>
  );
}

// ─── Quick Action Types ─────────────────────────────────────────────────────

type QuickAction =
  | "upscale" | "retry" | "different-model" | "edit-text" | "image-to-video"
  | "social-post" | "make-3d" | "remove-bg" | "style-transfer" | "variations";

interface ActionButton {
  action: QuickAction;
  label: string;
  icon: React.ElementType;
  color: string;
}

const IMAGE_ACTIONS: ActionButton[] = [
  { action: "upscale", label: "Upscale", icon: ZoomIn, color: "text-green-400 hover:bg-green-400/10 border-green-500/20" },
  { action: "edit-text", label: "Edit", icon: Pen, color: "text-blue-400 hover:bg-blue-400/10 border-blue-500/20" },
  { action: "image-to-video", label: "Animate", icon: Film, color: "text-purple-400 hover:bg-purple-400/10 border-purple-500/20" },
  { action: "make-3d", label: "Make 3D", icon: CuboidIcon, color: "text-yellow-400 hover:bg-yellow-400/10 border-yellow-500/20" },
  { action: "remove-bg", label: "Remove BG", icon: Scissors, color: "text-orange-400 hover:bg-orange-400/10 border-orange-500/20" },
  { action: "style-transfer", label: "Restyle", icon: Palette, color: "text-pink-400 hover:bg-pink-400/10 border-pink-500/20" },
  { action: "variations", label: "Variations", icon: Copy, color: "text-cyan-400 hover:bg-cyan-400/10 border-cyan-500/20" },
  { action: "different-model", label: "Try Other", icon: Shuffle, color: "text-indigo-400 hover:bg-indigo-400/10 border-indigo-500/20" },
  { action: "social-post", label: "Social Post", icon: Share2, color: "text-rose-400 hover:bg-rose-400/10 border-rose-500/20" },
  { action: "retry", label: "Retry", icon: RefreshCw, color: "text-[#8b8b94] hover:bg-[#8b8b94]/10 border-[#2a2a2e]" },
];

const VIDEO_ACTIONS: ActionButton[] = [
  { action: "upscale", label: "Upscale", icon: ZoomIn, color: "text-green-400 hover:bg-green-400/10 border-green-500/20" },
  { action: "edit-text", label: "Edit", icon: Pen, color: "text-blue-400 hover:bg-blue-400/10 border-blue-500/20" },
  { action: "social-post", label: "Social Post", icon: Share2, color: "text-rose-400 hover:bg-rose-400/10 border-rose-500/20" },
  { action: "different-model", label: "Try Other", icon: Shuffle, color: "text-indigo-400 hover:bg-indigo-400/10 border-indigo-500/20" },
  { action: "retry", label: "Retry", icon: RefreshCw, color: "text-[#8b8b94] hover:bg-[#8b8b94]/10 border-[#2a2a2e]" },
];

const AUDIO_ACTIONS: ActionButton[] = [
  { action: "edit-text", label: "Edit", icon: Pen, color: "text-blue-400 hover:bg-blue-400/10 border-blue-500/20" },
  { action: "different-model", label: "Try Other", icon: Shuffle, color: "text-indigo-400 hover:bg-indigo-400/10 border-indigo-500/20" },
  { action: "social-post", label: "Social Post", icon: Share2, color: "text-rose-400 hover:bg-rose-400/10 border-rose-500/20" },
  { action: "retry", label: "Retry", icon: RefreshCw, color: "text-[#8b8b94] hover:bg-[#8b8b94]/10 border-[#2a2a2e]" },
];

const MODEL3D_ACTIONS: ActionButton[] = [
  { action: "different-model", label: "Try Other", icon: Shuffle, color: "text-indigo-400 hover:bg-indigo-400/10 border-indigo-500/20" },
  { action: "retry", label: "Retry", icon: RefreshCw, color: "text-[#8b8b94] hover:bg-[#8b8b94]/10 border-[#2a2a2e]" },
];

function getActionsForMime(mime: string): ActionButton[] {
  if (mime.startsWith("image/")) return IMAGE_ACTIONS;
  if (mime.startsWith("video/")) return VIDEO_ACTIONS;
  if (mime.startsWith("audio/")) return AUDIO_ACTIONS;
  if (mime.includes("gltf") || mime.includes("glb") || mime.includes("obj") || mime.includes("stl")) return MODEL3D_ACTIONS;
  return [{ action: "retry", label: "Retry", icon: RefreshCw, color: "text-[#8b8b94] hover:bg-[#8b8b94]/10 border-[#2a2a2e]" }];
}

// ─── Model Search Dropdown ──────────────────────────────────────────────────

function ModelSelector({
  value,
  onChange,
  provider,
  onProviderChange,
}: {
  value: string;
  onChange: (model: string, provider: RunProvider) => void;
  provider: RunProvider;
  onProviderChange: (p: RunProvider) => void;
}) {
  const [open, setOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [results, setResults] = useState<ModelResult[]>([]);
  const [searching, setSearching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    const all: ModelResult[] = [];
    try {
      const [repRes, hfRes] = await Promise.all([
        fetch("/api/replicate?action=search&q=" + encodeURIComponent(q)).then(r => r.ok ? r.json() : { models: [] }).catch(() => ({ models: [] })),
        fetch("/api/huggingface?action=search&q=" + encodeURIComponent(q)).then(r => r.ok ? r.json() : { models: [] }).catch(() => ({ models: [] })),
      ]);
      for (const m of (repRes.models || [])) {
        all.push({
          owner: m.owner || "", name: m.name || "", fullName: m.fullName || "",
          description: m.description || "", run_count: m.run_count || 0,
          url: m.url || "", cover_image_url: m.cover_image_url || undefined,
          provider: "replicate",
        });
      }
      for (const m of (hfRes.models || [])) {
        all.push({
          owner: m.author || (m.fullName || "").split("/")[0] || "",
          name: m.name || (m.fullName || "").split("/")[1] || m.fullName || "",
          fullName: m.fullName || "", description: m.description || "",
          run_count: m.downloads || 0, downloads: m.downloads || 0, likes: m.likes || 0,
          url: "https://huggingface.co/" + (m.fullName || ""),
          provider: "huggingface", pipeline_tag: m.pipeline_tag || undefined,
        });
      }
      all.sort((a, b) => (b.run_count || 0) - (a.run_count || 0));
    } catch {}
    setResults(all);
    setSearching(false);
  }, []);

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleInput = (val: string) => {
    setSearchQ(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => void doSearch(val), 300);
  };

  const filtered = useMemo(() => {
    if (!searchQ.trim()) return FEATURED_MODELS;
    return results;
  }, [searchQ, results]);

  const displayName = value || "Auto-select best model";

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => { setOpen(!open); setTimeout(() => inputRef.current?.focus(), 50); }}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all text-sm",
          open
            ? "border-[#8b5cf6] bg-[#161618]"
            : "border-[#2a2a2e] bg-[#161618] hover:border-[#3a3a3e]"
        )}
      >
        <Sparkles className="w-3.5 h-3.5 text-[#8b5cf6] shrink-0" />
        <span className={cn("flex-1 truncate", value ? "text-[#e8e8ea]" : "text-[#8b8b94]")}>
          {displayName}
        </span>
        <ChevronDown className={cn("w-3.5 h-3.5 text-[#8b8b94] transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[#1c1c1f] border border-[#2a2a2e] rounded-xl shadow-2xl z-50 overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-[#2a2a2e]">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8b8b94]" />
              <input
                ref={inputRef}
                type="text"
                value={searchQ}
                onChange={e => handleInput(e.target.value)}
                placeholder="Search models..."
                className="w-full pl-8 pr-3 py-2 rounded-lg bg-[#0f0f10] border border-[#2a2a2e] text-[#e8e8ea] text-xs focus:outline-none focus:border-[#8b5cf6] placeholder:text-[#8b8b94]/50"
              />
            </div>
            {/* Provider tabs */}
            <div className="flex items-center gap-1 mt-2">
              {(["auto", "replicate", "huggingface"] as const).map(p => (
                <button key={p} onClick={() => onProviderChange(p)}
                  className={cn(
                    "px-2 py-1 rounded text-[10px] font-medium transition-all",
                    provider === p
                      ? "bg-[#8b5cf6] text-white"
                      : "text-[#8b8b94] hover:text-[#e8e8ea] hover:bg-white/5"
                  )}>
                  {p === "auto" ? "Auto" : p === "replicate" ? "Replicate" : "Hugging Face"}
                </button>
              ))}
            </div>
          </div>

          {/* Results */}
          <div className="max-h-[300px] overflow-y-auto">
            {searching && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-4 h-4 text-[#8b5cf6] animate-spin" />
              </div>
            )}

            {!searching && !searchQ.trim() && (
              <>
                <div className="px-3 py-1.5">
                  <span className="text-[10px] font-medium text-[#8b8b94] uppercase tracking-wider">Featured Models</span>
                </div>
                {FEATURED_MODELS.map(m => (
                  <button key={m.fullName + m.provider}
                    onClick={() => {
                      onChange(m.fullName, m.provider);
                      setOpen(false);
                      setSearchQ("");
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 hover:bg-white/5 transition-colors text-left",
                      value === m.fullName && "bg-[#8b5cf6]/5"
                    )}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[#e8e8ea] font-medium truncate">{m.label}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#0f0f10] text-[#8b8b94] border border-[#2a2a2e]">{m.tag}</span>
                      </div>
                      <span className="text-[10px] text-[#8b8b94] font-mono">{m.fullName}</span>
                    </div>
                    <ProviderBadge provider={m.provider} />
                    {value === m.fullName && <Check className="w-3.5 h-3.5 text-[#8b5cf6]" />}
                  </button>
                ))}
              </>
            )}

            {!searching && searchQ.trim() && results.length === 0 && (
              <div className="py-6 text-center text-xs text-[#8b8b94]">No models found</div>
            )}

            {!searching && searchQ.trim() && results.map(m => (
              <button key={m.provider + "-" + m.fullName}
                onClick={() => {
                  onChange(m.fullName, m.provider);
                  setOpen(false);
                  setSearchQ("");
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 hover:bg-white/5 transition-colors text-left",
                  value === m.fullName && "bg-[#8b5cf6]/5"
                )}>
                {m.cover_image_url ? (
                  <img src={m.cover_image_url} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded bg-[#0f0f10] flex items-center justify-center shrink-0">
                    <Sparkles className="w-3 h-3 text-[#8b8b94]" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#e8e8ea] font-medium truncate">{m.fullName}</span>
                    {m.pipeline_tag && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#0f0f10] text-[#8b8b94] border border-[#2a2a2e]">{m.pipeline_tag}</span>
                    )}
                  </div>
                  <span className="text-[10px] text-[#8b8b94] line-clamp-1">{m.description}</span>
                </div>
                <div className="text-[10px] text-[#8b8b94] shrink-0">{fmt(m.run_count)} runs</div>
                <ProviderBadge provider={m.provider} />
              </button>
            ))}
          </div>

          {/* Clear + Manual */}
          <div className="p-2 border-t border-[#2a2a2e] flex items-center gap-2">
            <button
              onClick={() => { onChange("", "auto"); setOpen(false); setSearchQ(""); }}
              className="text-[10px] text-[#8b8b94] hover:text-[#e8e8ea] transition-colors"
            >
              Reset to Auto
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Output Media Viewer ────────────────────────────────────────────────────

function OutputViewer({
  file,
  onAction,
}: {
  file: GeneratedFile;
  onAction?: (action: QuickAction, file: GeneratedFile) => void;
}) {
  const url = file.url || "";
  const mime = file.mimeType || "";
  const actions = getActionsForMime(mime);

  const actionBar = onAction && actions.length > 0 ? (
    <div className="flex flex-wrap gap-1 mt-2">
      {actions.map(a => (
        <button key={a.action} onClick={() => onAction(a.action, file)}
          className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-medium transition-all", a.color)}>
          <a.icon className="w-2.5 h-2.5" />
          {a.label}
        </button>
      ))}
    </div>
  ) : null;

  if (mime.startsWith("image/")) {
    return (
      <div>
        <div className="relative group rounded-lg overflow-hidden bg-black/20">
          <img src={url} alt={file.filename} className="w-full max-h-[600px] object-contain" />
          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <a href={url} target="_blank" rel="noopener noreferrer"
              className="p-1.5 rounded-md bg-black/70 text-white hover:bg-black/90 backdrop-blur-sm">
              <Maximize2 className="w-3 h-3" />
            </a>
            <a href={url} download={file.filename}
              className="p-1.5 rounded-md bg-black/70 text-white hover:bg-black/90 backdrop-blur-sm">
              <Download className="w-3 h-3" />
            </a>
          </div>
        </div>
        {actionBar}
      </div>
    );
  }

  if (mime.startsWith("video/")) {
    return (
      <div>
        <video src={url} controls className="w-full rounded-lg max-h-[600px] bg-black/20" />
        {actionBar}
      </div>
    );
  }

  if (mime.startsWith("audio/")) {
    return (
      <div>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-[#161618] border border-[#2a2a2e]">
          <Volume2 className="w-4 h-4 text-[#8b5cf6] shrink-0" />
          <audio src={url} controls className="w-full h-8" />
        </div>
        {actionBar}
      </div>
    );
  }

  if (mime.includes("gltf") || mime.includes("glb") || mime.includes("obj") || mime.includes("stl")) {
    return (
      <div>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-[#161618] border border-[#2a2a2e]">
          <Box className="w-4 h-4 text-yellow-400 shrink-0" />
          <div className="flex-1">
            <p className="text-xs text-[#e8e8ea]">{file.filename}</p>
            <p className="text-[10px] text-[#8b8b94]">3D Model</p>
          </div>
          <a href={url} download={file.filename}
            className="px-2.5 py-1 rounded-md bg-[#8b5cf6]/10 text-[#8b5cf6] text-[10px] font-medium hover:bg-[#8b5cf6]/20">
            Download
          </a>
        </div>
        {actionBar}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 p-3 rounded-lg bg-[#161618] border border-[#2a2a2e]">
        <FileText className="w-4 h-4 text-[#8b8b94] shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-[#e8e8ea] truncate">{file.filename}</p>
          <p className="text-[10px] text-[#8b8b94]">{mime}</p>
        </div>
        <a href={url} download={file.filename}
          className="px-2.5 py-1 rounded-md bg-[#1c1c1f] border border-[#2a2a2e] text-[#e8e8ea] text-[10px] hover:border-[#8b5cf6]/40">
          Download
        </a>
      </div>
      {actionBar}
    </div>
  );
}

// ─── Playground Column Panel ────────────────────────────────────────────────

function PlaygroundColumnPanel({
  column,
  prompt,
  uploadedFile,
  onRun,
  onUpdateColumn,
  onRemove,
  onQuickAction,
  onRunWithProvider,
  isOnly,
}: {
  column: PlaygroundColumn;
  prompt: string;
  uploadedFile: UploadedFile | null;
  onRun: (colId: string) => void;
  onUpdateColumn: (colId: string, updates: Partial<PlaygroundColumn>) => void;
  onRemove: (colId: string) => void;
  onQuickAction: (action: QuickAction, file: GeneratedFile) => void;
  onRunWithProvider?: (colId: string, provider: "replicate" | "huggingface") => void;
  isOnly: boolean;
}) {
  const [showParams, setShowParams] = useState(false);

  return (
    <div className="flex flex-col h-full min-w-0">
      {/* Column header - model selector */}
      <div className="shrink-0 p-3 border-b border-[#2a2a2e] bg-[#161618]">
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <ModelSelector
              value={column.model}
              provider={column.provider}
              onChange={(model, provider) =>
                onUpdateColumn(column.id, { model, provider })
              }
              onProviderChange={p => onUpdateColumn(column.id, { provider: p })}
            />
          </div>
          {!isOnly && (
            <button onClick={() => onRemove(column.id)}
              className="p-1.5 rounded-md text-[#8b8b94] hover:text-red-400 hover:bg-red-400/10 transition-colors shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Params toggle */}
        <div className="flex items-center gap-2">
          <button onClick={() => setShowParams(!showParams)}
            className="flex items-center gap-1 text-[10px] text-[#8b8b94] hover:text-[#e8e8ea] transition-colors">
            <Settings2 className="w-3 h-3" />
            Parameters
            <ChevronRight className={cn("w-3 h-3 transition-transform", showParams && "rotate-90")} />
          </button>
          <ProviderBadge provider={column.provider === "auto" ? "replicate" : column.provider} />
        </div>

        {/* Parameters panel */}
        {showParams && (
          <div className="mt-2 space-y-2 p-2 rounded-lg bg-[#0f0f10] border border-[#2a2a2e]">
            <div>
              <label className="text-[10px] text-[#8b8b94] block mb-1">Aspect Ratio</label>
              <div className="flex flex-wrap gap-1">
                {ASPECT_RATIOS.map(ar => (
                  <button key={ar}
                    onClick={() => onUpdateColumn(column.id, { params: { ...column.params, aspect_ratio: ar } })}
                    className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-medium transition-all border",
                      column.params.aspect_ratio === ar
                        ? "border-[#8b5cf6] bg-[#8b5cf6]/10 text-[#8b5cf6]"
                        : "border-[#2a2a2e] text-[#8b8b94] hover:text-[#e8e8ea]"
                    )}>
                    {ar}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] text-[#8b8b94] block mb-1">
                Inference Steps: {(column.params.num_inference_steps as number) || 4}
              </label>
              <input type="range" min={1} max={50} step={1}
                value={(column.params.num_inference_steps as number) || 4}
                onChange={e => onUpdateColumn(column.id, {
                  params: { ...column.params, num_inference_steps: Number(e.target.value) }
                })}
                className="w-full h-1 bg-[#2a2a2e] rounded-lg appearance-none cursor-pointer accent-[#8b5cf6]"
              />
            </div>
            <div>
              <label className="text-[10px] text-[#8b8b94] block mb-1">Seed (blank for random)</label>
              <input type="number" placeholder="Random"
                value={(column.params.seed as string) || ""}
                onChange={e => onUpdateColumn(column.id, {
                  params: { ...column.params, seed: e.target.value ? Number(e.target.value) : undefined }
                })}
                className="w-full px-2 py-1 rounded-md bg-[#161618] border border-[#2a2a2e] text-[#e8e8ea] text-[10px] focus:outline-none focus:border-[#8b5cf6] placeholder:text-[#8b8b94]/50"
              />
            </div>
            <div>
              <label className="text-[10px] text-[#8b8b94] block mb-1">Output Format</label>
              <div className="flex gap-1">
                {["webp", "png", "jpg"].map(f => (
                  <button key={f}
                    onClick={() => onUpdateColumn(column.id, { params: { ...column.params, output_format: f } })}
                    className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-medium transition-all border",
                      column.params.output_format === f
                        ? "border-[#8b5cf6] bg-[#8b5cf6]/10 text-[#8b5cf6]"
                        : "border-[#2a2a2e] text-[#8b8b94] hover:text-[#e8e8ea]"
                    )}>
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] text-[#8b8b94] block mb-1">
                Quality: {(column.params.output_quality as number) || 80}
              </label>
              <input type="range" min={1} max={100} step={1}
                value={(column.params.output_quality as number) || 80}
                onChange={e => onUpdateColumn(column.id, {
                  params: { ...column.params, output_quality: Number(e.target.value) }
                })}
                className="w-full h-1 bg-[#2a2a2e] rounded-lg appearance-none cursor-pointer accent-[#8b5cf6]"
              />
            </div>
            <div>
              <label className="text-[10px] text-[#8b8b94] block mb-1">
                Num Outputs: {(column.params.num_outputs as number) || 1}
              </label>
              <input type="range" min={1} max={4} step={1}
                value={(column.params.num_outputs as number) || 1}
                onChange={e => onUpdateColumn(column.id, {
                  params: { ...column.params, num_outputs: Number(e.target.value) }
                })}
                className="w-full h-1 bg-[#2a2a2e] rounded-lg appearance-none cursor-pointer accent-[#8b5cf6]"
              />
            </div>
          </div>
        )}
      </div>

      {/* Output area */}
      <div className="flex-1 overflow-y-auto p-3">
        {column.running && (
          <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-3">
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-2 border-[#2a2a2e] border-t-[#8b5cf6] animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-xs text-[#e8e8ea] font-medium">Generating...</p>
              <p className="text-[10px] text-[#8b8b94] mt-1">
                {column.model || "Finding best model"}
              </p>
            </div>
            <div className="w-32 h-1 bg-[#2a2a2e] rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-violet-500 via-pink-500 to-orange-500 rounded-full animate-pulse" style={{ width: "60%" }} />
            </div>
          </div>
        )}

        {column.error && (
          <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/5">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className="w-3.5 h-3.5 text-red-400" />
              <span className="text-xs font-medium text-red-400">Error</span>
            </div>
            <p className="text-[11px] text-red-300 mb-2">{column.error}</p>
            <div className="flex items-center gap-2">
              <button onClick={() => onRun(column.id)}
                className="px-2.5 py-1 rounded-md bg-red-500/10 text-red-400 text-[10px] font-medium hover:bg-red-500/20 flex items-center gap-1">
                <RotateCcw className="w-3 h-3" /> Retry
              </button>
              {onRunWithProvider && (
                <button onClick={() => onRunWithProvider(column.id, column.provider === "replicate" ? "huggingface" : "replicate")}
                  className="px-2.5 py-1 rounded-md bg-[#1c1c1f] border border-[#2a2a2e] text-[#8b8b94] text-[10px] font-medium hover:text-[#e8e8ea] flex items-center gap-1 transition-colors">
                  <Shuffle className="w-3 h-3" /> Try other provider
                </button>
              )}
            </div>
          </div>
        )}

        {column.result && !column.running && (
          <div className="space-y-3">
            {/* Metadata */}
            <div className="flex items-center gap-2 flex-wrap">
              <ProviderBadge provider={column.result.provider} />
              {column.result.fallbackUsed && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-orange-500/10 text-orange-400 border border-orange-500/20">
                  <Shuffle className="w-2 h-2" /> Fallback
                </span>
              )}
              {(column.result.predictTime || column.result.computeTime) && (
                <span className="text-[10px] text-[#8b8b94] flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" />
                  {(column.result.predictTime || column.result.computeTime || 0).toFixed(1)}s
                </span>
              )}
            </div>

            {/* Model info */}
            <div className="text-[10px] space-y-0.5">
              <div className="flex gap-1.5">
                <span className="text-[#8b8b94]">Model:</span>
                <span className="text-[#e8e8ea] font-mono truncate">{column.result.model}</span>
              </div>
              <div className="flex gap-1.5">
                <span className="text-[#8b8b94]">Type:</span>
                <span className="text-[#e8e8ea]">{(column.result.taskType || "").replace(/[_-]/g, " ")}</span>
              </div>
              {column.result.modelReason && (
                <p className="text-[10px] text-[#8b8b94] italic mt-1">{column.result.modelReason}</p>
              )}
            </div>

            {/* Files */}
            {column.result.files.length > 0 && (
              <div className="space-y-2">
                {column.result.files.map((f, i) => (
                  <OutputViewer key={i} file={f} onAction={onQuickAction} />
                ))}
              </div>
            )}

            {/* Text output */}
            {column.result.textOutput && (
              <div>
                <p className="text-[10px] text-[#8b8b94] mb-1">Output:</p>
                <pre className="text-xs text-[#e8e8ea] bg-[#0f0f10] p-3 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-[300px] overflow-y-auto border border-[#2a2a2e]">
                  {column.result.textOutput.slice(0, 3000)}
                </pre>
              </div>
            )}
          </div>
        )}

        {!column.running && !column.error && !column.result && (
          <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-2 opacity-40">
            <Sparkles className="w-8 h-8 text-[#8b8b94]" />
            <p className="text-xs text-[#8b8b94] text-center">Output will appear here</p>
            <p className="text-[10px] text-[#8b8b94] text-center">Type a prompt and hit Run</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── History Rail ───────────────────────────────────────────────────────────

function HistoryRail({
  history,
  onSelect,
  onClear,
}: {
  history: RunResult[];
  onSelect: (r: RunResult) => void;
  onClear: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [galleryFilter, setGalleryFilter] = useState<GalleryFilter>("all");
  const [sortField, setSortField] = useState<SortField>("date");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const filteredHistory = useMemo(() => {
    let items = [...history];
    if (galleryFilter !== "all") {
      items = items.filter(r =>
        r.files.some(f => getMimeCategory(f.mimeType) === galleryFilter) ||
        (galleryFilter === "text" && r.textOutput)
      );
    }
    items.sort((a, b) => {
      if (sortField === "date") return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      if (sortField === "name") return (a.model || "").localeCompare(b.model || "");
      if (sortField === "type") return (a.taskType || "").localeCompare(b.taskType || "");
      return 0;
    });
    return items;
  }, [history, galleryFilter, sortField]);

  if (history.length === 0) return null;

  return (
    <div className={cn(
      "border-t border-[#2a2a2e] bg-[#161618] transition-all overflow-hidden",
      expanded ? "max-h-[280px]" : "h-[48px]"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-[48px] cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2">
          <History className="w-3.5 h-3.5 text-[#8b8b94]" />
          <span className="text-xs font-medium text-[#e8e8ea]">History</span>
          <span className="text-[10px] text-[#8b8b94]">({history.length})</span>
        </div>
        <div className="flex items-center gap-2">
          {expanded && (
            <>
              {/* Filter by media type */}
              <div className="flex items-center gap-0.5 bg-[#0f0f10] rounded-md p-0.5 border border-[#2a2a2e]" onClick={e => e.stopPropagation()}>
                {(["all", "image", "video", "audio", "text"] as const).map(f => (
                  <button key={f} onClick={() => setGalleryFilter(f)}
                    className={cn(
                      "px-1.5 py-0.5 rounded text-[9px] font-medium transition-all capitalize",
                      galleryFilter === f ? "bg-[#8b5cf6] text-white" : "text-[#8b8b94] hover:text-[#e8e8ea]"
                    )}>
                    {f}
                  </button>
                ))}
              </div>
              {/* Sort */}
              <select value={sortField} onClick={e => e.stopPropagation()} onChange={e => setSortField(e.target.value as SortField)}
                className="px-1.5 py-0.5 rounded-md bg-[#0f0f10] border border-[#2a2a2e] text-[#8b8b94] text-[9px] focus:outline-none">
                <option value="date">Newest</option>
                <option value="name">Model</option>
                <option value="type">Type</option>
              </select>
              {/* View mode */}
              <div className="flex items-center gap-0.5 bg-[#0f0f10] rounded-md p-0.5 border border-[#2a2a2e]" onClick={e => e.stopPropagation()}>
                <button onClick={() => setViewMode("grid")}
                  className={cn("p-0.5 rounded transition-all", viewMode === "grid" ? "bg-[#8b5cf6] text-white" : "text-[#8b8b94] hover:text-[#e8e8ea]")}>
                  <Grid className="w-3 h-3" />
                </button>
                <button onClick={() => setViewMode("list")}
                  className={cn("p-0.5 rounded transition-all", viewMode === "list" ? "bg-[#8b5cf6] text-white" : "text-[#8b8b94] hover:text-[#e8e8ea]")}>
                  <List className="w-3 h-3" />
                </button>
              </div>
            </>
          )}
          <button onClick={e => { e.stopPropagation(); onClear(); }}
            className="text-[10px] text-[#8b8b94] hover:text-red-400 transition-colors">
            Clear
          </button>
          <ChevronDown className={cn("w-3.5 h-3.5 text-[#8b8b94] transition-transform", expanded && "rotate-180")} />
        </div>
      </div>

      {/* History items - Grid (horizontal scroll) */}
      {expanded && viewMode === "grid" && (
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto">
          {filteredHistory.map((r, i) => {
            const imgFile = r.files.find(f => f.mimeType.startsWith("image/"));
            const vidFile = r.files.find(f => f.mimeType.startsWith("video/"));
            const previewFile = imgFile || vidFile;
            return (
              <div key={i}
                onClick={() => onSelect(r)}
                className="shrink-0 w-[140px] rounded-lg border border-[#2a2a2e] bg-[#1c1c1f] overflow-hidden cursor-pointer hover:border-[#8b5cf6]/40 transition-all group">
                {previewFile?.url ? (
                  imgFile ? (
                    <img src={previewFile.url} alt="" className="w-full h-20 object-cover" />
                  ) : (
                    <video src={previewFile.url} className="w-full h-20 object-cover" muted />
                  )
                ) : (
                  <div className="w-full h-20 bg-[#0f0f10] flex items-center justify-center">
                    {r.textOutput ? <Type className="w-5 h-5 text-[#8b8b94]/30" /> : <Sparkles className="w-5 h-5 text-[#8b8b94]/30" />}
                  </div>
                )}
                <div className="p-2">
                  <p className="text-[10px] text-[#e8e8ea] truncate">{r.prompt || r.model}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      r.provider === "replicate" ? "bg-blue-400" : "bg-yellow-400"
                    )} />
                    <span className="text-[9px] text-[#8b8b94]">{r.createdAt ? timeAgo(r.createdAt) : ""}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* History items - List view */}
      {expanded && viewMode === "list" && (
        <div className="overflow-y-auto max-h-[220px] px-4 pb-3 space-y-1">
          {filteredHistory.map((r, i) => (
            <div key={i}
              onClick={() => onSelect(r)}
              className="flex items-center gap-3 p-2 rounded-lg border border-[#2a2a2e] bg-[#1c1c1f] hover:border-[#8b5cf6]/40 cursor-pointer transition-all">
              <div className="w-8 h-8 rounded bg-[#0f0f10] flex items-center justify-center shrink-0">
                {r.files.some(f => f.mimeType.startsWith("image/")) ? <ImageIcon className="w-3.5 h-3.5 text-purple-400" /> :
                 r.files.some(f => f.mimeType.startsWith("video/")) ? <Video className="w-3.5 h-3.5 text-blue-400" /> :
                 r.files.some(f => f.mimeType.startsWith("audio/")) ? <Volume2 className="w-3.5 h-3.5 text-cyan-400" /> :
                 <Type className="w-3.5 h-3.5 text-[#8b8b94]" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-[#e8e8ea] truncate">{r.prompt || r.model}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[9px] text-[#8b8b94] font-mono truncate">{r.model}</span>
                  <span className="text-[9px] text-[#8b8b94]">{(r.taskType || "").replace(/[_-]/g, " ")}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <ProviderBadge provider={r.provider} />
                <span className="text-[9px] text-[#8b8b94]">{r.createdAt ? timeAgo(r.createdAt) : ""}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Main Playground Component ──────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

export function PlaygroundClient() {
  const router = useRouter();

  // ─── State ──────────────────────────────────────────────────────────────
  const [prompt, setPrompt] = useState("");
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [columns, setColumns] = useState<PlaygroundColumn[]>([
    { id: newColId(), model: "", provider: "auto", running: false, result: null, error: "", params: {} },
  ]);
  const [history, setHistory] = useState<RunResult[]>([]);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  // ─── Background ops tracking ─────────────────────────────────────────────
  useEffect(() => {
    const runningCols = columns.filter(c => c.running);
    if (runningCols.length > 0) {
      addBackgroundOp({
        id: "playground-gen",
        type: "generation",
        label: "Playground",
        status: "running",
        href: "/computer/playground",
        startedAt: Date.now(),
        detail: `${runningCols.length} model${runningCols.length > 1 ? "s" : ""} running`,
      });
    } else {
      removeBackgroundOp("playground-gen");
    }
  }, [columns]);

  // Load history
  useEffect(() => {
    try {
      const saved = localStorage.getItem("playground-history");
      if (saved) setHistory(JSON.parse(saved));
    } catch {}
  }, []);

  const saveHistory = useCallback((items: RunResult[]) => {
    const trimmed = items.slice(0, 100);
    setHistory(trimmed);
    try { localStorage.setItem("playground-history", JSON.stringify(trimmed)); } catch {}
  }, []);

  // ─── Column management ─────────────────────────────────────────────────
  const addColumn = () => {
    if (columns.length >= 4) return;
    setColumns(prev => [...prev, {
      id: newColId(), model: "", provider: "auto", running: false, result: null, error: "", params: {},
    }]);
  };

  const removeColumn = (colId: string) => {
    setColumns(prev => prev.filter(c => c.id !== colId));
  };

  const updateColumn = (colId: string, updates: Partial<PlaygroundColumn>) => {
    setColumns(prev => prev.map(c => c.id === colId ? { ...c, ...updates } : c));
  };

  // ─── Run generation ───────────────────────────────────────────────────
  const runColumn = useCallback(async (colId: string) => {
    if (!prompt.trim()) return;
    const col = columns.find(c => c.id === colId);
    if (!col) return;

    setColumns(prev => prev.map(c => c.id === colId ? { ...c, running: true, error: "", result: null } : c));

    try {
      const body: Record<string, unknown> = { prompt: prompt.trim() };
      if (col.model) body.model = col.model;
      if (col.provider && col.provider !== "auto") body.provider = col.provider;
      if (uploadedFile?.url) {
        body.imageUrl = uploadedFile.url;
        body.fileUrl = uploadedFile.url;
      }
      // Pass any extra params
      if (Object.keys(col.params).length > 0) body.params = col.params;

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        setColumns(prev => prev.map(c => c.id === colId ? { ...c, running: false, error: data.error || "Generation failed" } : c));
      } else {
        const result: RunResult = {
          ...data,
          prompt: prompt.trim(),
          createdAt: new Date().toISOString(),
          predictTime: data.predictTime || data.computeTime,
        };
        setColumns(prev => prev.map(c => c.id === colId ? { ...c, running: false, result } : c));
        saveHistory([result, ...history]);
      }
    } catch (err) {
      setColumns(prev => prev.map(c => c.id === colId ? {
        ...c, running: false, error: err instanceof Error ? err.message : String(err)
      } : c));
    }
  }, [prompt, columns, uploadedFile, history, saveHistory]);

  const runAll = useCallback(() => {
    if (!prompt.trim()) return;
    for (const col of columns) {
      void runColumn(col.id);
    }
  }, [prompt, columns, runColumn]);

  const runColumnWithProvider = useCallback(async (colId: string, provider: "replicate" | "huggingface") => {
    if (!prompt.trim()) return;
    setColumns(prev => prev.map(c => c.id === colId ? { ...c, running: true, error: "", result: null, provider } : c));
    try {
      const body: Record<string, unknown> = { prompt: prompt.trim(), provider };
      const col = columns.find(c => c.id === colId);
      if (col?.model) body.model = col.model;
      if (uploadedFile?.url) { body.imageUrl = uploadedFile.url; body.fileUrl = uploadedFile.url; }
      if (col && Object.keys(col.params).length > 0) body.params = col.params;
      const res = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) {
        setColumns(prev => prev.map(c => c.id === colId ? { ...c, running: false, error: data.error || "Generation failed" } : c));
      } else {
        const result: RunResult = { ...data, prompt: prompt.trim(), createdAt: new Date().toISOString(), predictTime: data.predictTime || data.computeTime };
        setColumns(prev => prev.map(c => c.id === colId ? { ...c, running: false, result } : c));
        saveHistory([result, ...history]);
      }
    } catch (err) {
      setColumns(prev => prev.map(c => c.id === colId ? { ...c, running: false, error: err instanceof Error ? err.message : String(err) } : c));
    }
  }, [prompt, columns, uploadedFile, history, saveHistory]);

  const handleRunAsTask = useCallback(() => {
    const col = columns[0];
    const model = col?.model;
    const p = model
      ? "Use replicate_run to run " + model + ": " + prompt
      : "Use replicate_run: " + prompt;
    router.push("/computer?prompt=" + encodeURIComponent(p));
  }, [prompt, columns, router]);

  // ─── Quick actions ────────────────────────────────────────────────────
  const handleQuickAction = useCallback((action: QuickAction, file: GeneratedFile) => {
    const currentPrompt = prompt || "";
    const fileUrl = file.url || "";

    switch (action) {
      case "upscale":
        setPrompt("Upscale this image to high resolution: " + currentPrompt);
        if (fileUrl) setUploadedFile({ name: file.filename, size: file.size, type: file.mimeType, url: fileUrl });
        break;
      case "retry":
        void runAll();
        break;
      case "different-model":
        setColumns(prev => prev.map(c => ({ ...c, model: "", provider: "auto" as RunProvider })));
        void runAll();
        break;
      case "edit-text":
        setPrompt("Edit this image: [describe your edit]. Original: " + currentPrompt);
        if (fileUrl) setUploadedFile({ name: file.filename, size: file.size, type: file.mimeType, url: fileUrl });
        break;
      case "image-to-video":
        setPrompt("Animate this image into a video: " + currentPrompt);
        if (fileUrl) setUploadedFile({ name: file.filename, size: file.size, type: file.mimeType, url: fileUrl });
        break;
      case "social-post":
        setPrompt("Create a social media post version (1080x1080, vibrant): " + currentPrompt);
        if (fileUrl) setUploadedFile({ name: file.filename, size: file.size, type: file.mimeType, url: fileUrl });
        break;
      case "make-3d":
        setPrompt("Convert this image to a 3D model: " + currentPrompt);
        if (fileUrl) setUploadedFile({ name: file.filename, size: file.size, type: file.mimeType, url: fileUrl });
        break;
      case "remove-bg":
        setPrompt("Remove the background from this image");
        if (fileUrl) setUploadedFile({ name: file.filename, size: file.size, type: file.mimeType, url: fileUrl });
        break;
      case "style-transfer":
        setPrompt("Apply artistic style transfer to this image: " + currentPrompt);
        if (fileUrl) setUploadedFile({ name: file.filename, size: file.size, type: file.mimeType, url: fileUrl });
        break;
      case "variations":
        setPrompt("Generate variations of: " + currentPrompt);
        if (fileUrl) setUploadedFile({ name: file.filename, size: file.size, type: file.mimeType, url: fileUrl });
        break;
    }
    promptRef.current?.focus();
  }, [prompt, runAll]);

  const handleHistorySelect = useCallback((r: RunResult) => {
    if (r.prompt) setPrompt(r.prompt);
    setColumns(prev => {
      const updated = [...prev];
      if (updated.length > 0) {
        updated[0] = { ...updated[0], result: r, error: "", running: false };
      }
      return updated;
    });
  }, []);

  const isRunning = columns.some(c => c.running);

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* ═══ Top Bar ═══ */}
      <div className="shrink-0 h-[52px] border-b border-[#2a2a2e] bg-[#161618] flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#8b5cf6]" />
            <h1 className="text-sm font-semibold text-[#e8e8ea]">Multimedia Playground</h1>
          </div>
          <span className="text-[10px] text-[#8b8b94] bg-[#0f0f10] px-2 py-0.5 rounded border border-[#2a2a2e]">
            Compare &amp; iterate on AI models
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={addColumn} disabled={columns.length >= 4}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#2a2a2e] text-[#8b8b94] text-xs hover:text-[#e8e8ea] hover:border-[#3a3a3e] disabled:opacity-30 transition-all">
            <Columns className="w-3.5 h-3.5" />
            Compare ({columns.length}/4)
          </button>
        </div>
      </div>

      {/* ═══ Main Area: Input panel + Output columns ═══ */}
      <div className="flex-1 flex overflow-hidden">

        {/* ─── Left Panel: Prompt & Config ─── */}
        <div className="w-[360px] shrink-0 border-r border-[#2a2a2e] bg-[#161618] flex flex-col">
          {/* Prompt section */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Prompt label */}
            <div>
              <label className="text-xs font-medium text-[#e8e8ea] flex items-center gap-1.5 mb-2">
                <Type className="w-3.5 h-3.5 text-[#8b5cf6]" />
                Prompt
              </label>
              <textarea
                ref={promptRef}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void runAll();
                  }
                }}
                placeholder="Describe what you want to generate...&#10;&#10;Shift+Enter for new line"
                rows={6}
                className="w-full px-3 py-2.5 rounded-lg bg-[#0f0f10] border border-[#2a2a2e] text-[#e8e8ea] text-sm resize-none focus:outline-none focus:border-[#8b5cf6] placeholder:text-[#8b8b94]/40 leading-relaxed"
              />
              <p className="text-[10px] text-[#8b8b94] mt-1">Press Enter to run &middot; Shift+Enter for new line</p>
            </div>

            {/* File upload */}
            <div>
              <label className="text-xs font-medium text-[#e8e8ea] flex items-center gap-1.5 mb-2">
                <Upload className="w-3.5 h-3.5 text-[#8b5cf6]" />
                Input File
              </label>
              <FileUploadZone
                uploadedFile={uploadedFile}
                onFileUploaded={setUploadedFile}
                onClear={() => setUploadedFile(null)}
                compact
              />
            </div>

            {/* Quick categories */}
            <div>
              <label className="text-xs font-medium text-[#e8e8ea] flex items-center gap-1.5 mb-2">
                <Sparkles className="w-3.5 h-3.5 text-[#8b5cf6]" />
                Quick Start
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { label: "Image", icon: ImageIcon, prompt: "Generate a beautiful image of ", color: "text-purple-400" },
                  { label: "Video", icon: Video, prompt: "Create a short video of ", color: "text-blue-400" },
                  { label: "Music", icon: Music, prompt: "Compose a ", color: "text-pink-400" },
                  { label: "Speech", icon: Mic2, prompt: "Say the following in a natural voice: ", color: "text-cyan-400" },
                  { label: "3D Model", icon: Box, prompt: "Create a 3D model of ", color: "text-yellow-400" },
                  { label: "Upscale", icon: ZoomIn, prompt: "Upscale this image to high resolution", color: "text-green-400" },
                  { label: "Remove BG", icon: Scissors, prompt: "Remove the background from this image", color: "text-orange-400" },
                  { label: "Text", icon: Type, prompt: "Write a ", color: "text-emerald-400" },
                ].map(cat => (
                  <button key={cat.label}
                    onClick={() => {
                      setPrompt(cat.prompt);
                      promptRef.current?.focus();
                    }}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-[#2a2a2e] bg-[#1c1c1f] hover:border-[#8b5cf6]/30 transition-all text-left">
                    <cat.icon className={cn("w-3.5 h-3.5", cat.color)} />
                    <span className="text-[11px] text-[#e8e8ea]">{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Helpful tips */}
            <div className="p-3 rounded-lg bg-[#0f0f10] border border-[#2a2a2e]">
              <p className="text-[10px] font-medium text-[#e8e8ea] mb-1.5">Tips</p>
              <ul className="space-y-1 text-[10px] text-[#8b8b94]">
                <li>&bull; Use "Compare" to test the same prompt across multiple models</li>
                <li>&bull; Upload an image for img2vid, upscaling, background removal, etc.</li>
                <li>&bull; Set models per-column for side-by-side comparison</li>
                <li>&bull; All media types supported: image, video, audio, 3D, text</li>
                <li>&bull; Works with both Replicate and Hugging Face models</li>
              </ul>
            </div>
          </div>

          {/* Run button */}
          <div className="shrink-0 p-4 border-t border-[#2a2a2e] space-y-2">
            <button
              onClick={() => void runAll()}
              disabled={isRunning || !prompt.trim()}
              className={cn(
                "w-full py-3 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2",
                isRunning || !prompt.trim()
                  ? "bg-[#2a2a2e] text-[#8b8b94] cursor-not-allowed"
                  : "bg-[#8b5cf6] hover:bg-[#7c3aed] text-white shadow-lg shadow-[#8b5cf6]/20"
              )}
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Run{columns.length > 1 ? ` (${columns.length} models)` : ""}
                </>
              )}
            </button>
            <button
              onClick={handleRunAsTask}
              disabled={!prompt.trim()}
              className="w-full py-2 rounded-lg border border-[#2a2a2e] text-[#8b8b94] text-xs hover:text-[#e8e8ea] hover:border-[#3a3a3e] transition-colors flex items-center justify-center gap-1.5 disabled:opacity-30"
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              Run as Task
            </button>
          </div>
        </div>

        {/* ─── Right Panels: Output Columns ─── */}
        <div className="flex-1 flex overflow-hidden">
          {columns.map((col, idx) => (
            <div key={col.id} className={cn(
              "flex-1 min-w-0 flex flex-col",
              idx > 0 && "border-l border-[#2a2a2e]"
            )}>
              <PlaygroundColumnPanel
                column={col}
                prompt={prompt}
                uploadedFile={uploadedFile}
                onRun={runColumn}
                onUpdateColumn={updateColumn}
                onRemove={removeColumn}
                onQuickAction={handleQuickAction}
                onRunWithProvider={runColumnWithProvider}
                isOnly={columns.length === 1}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ═══ History Rail ═══ */}
      <HistoryRail
        history={history}
        onSelect={handleHistorySelect}
        onClear={() => saveHistory([])}
      />
    </div>
  );
}

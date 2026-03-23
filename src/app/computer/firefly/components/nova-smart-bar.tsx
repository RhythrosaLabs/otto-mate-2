"use client";

/**
 * NovaSmartBar — Universal AI generation bar for Nova.
 *
 * • Auto-detects output type (image / video / audio / 3D / text) from the prompt
 * • Live model search across both Replicate AND HuggingFace simultaneously
 * • Inline result rendering — images, video, audio, 3D download, text
 * • Smart post-generation actions (Animate → video, Upscale, Make 3D)
 */

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  Sparkles, Image as ImageIcon, Video, Music, Box, Type,
  Search, ChevronDown, Loader2, X, Upload, Zap, Globe,
  Download, Maximize2, Volume2, AlertCircle, RotateCcw,
  Check, FileText, Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────

type OutputType = "auto" | "image" | "video" | "audio" | "3d" | "text";

interface ModelResult {
  id: string;
  fullName: string;
  label: string;
  description: string;
  provider: "replicate" | "huggingface";
  tag?: string;
  featured?: boolean;
  run_count?: number;
  downloads?: number;
  cover_image_url?: string;
  pipeline_tag?: string;
}

interface GenerationResult {
  id?: string;
  model: string;
  taskType: string;
  provider: "replicate" | "huggingface";
  files: Array<{ filename: string; size: number; mimeType: string; url: string }>;
  textOutput?: string;
  predictTime?: number;
}

interface UploadedFile {
  name: string;
  size: number;
  type: string;
  url: string;
  preview?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────

const OUTPUT_TYPES: Array<{
  id: OutputType;
  label: string;
  icon: React.ElementType;
  accent: string;
  category: string;
  placeholder: string;
}> = [
  {
    id: "auto",
    label: "Auto",
    icon: Sparkles,
    accent: "violet",
    category: "general",
    placeholder: "Describe what you want to create — image, video, music, 3D, text…",
  },
  {
    id: "image",
    label: "Image",
    icon: ImageIcon,
    accent: "violet",
    category: "image-generation",
    placeholder: "Describe an image to generate — style, subject, mood, lighting…",
  },
  {
    id: "video",
    label: "Video",
    icon: Video,
    accent: "cyan",
    category: "video-generation",
    placeholder: "Describe a video — motion, scene, duration, cinematic style…",
  },
  {
    id: "audio",
    label: "Audio",
    icon: Music,
    accent: "amber",
    category: "music-generation",
    placeholder: "Describe music or sound — genre, mood, tempo, instruments…",
  },
  {
    id: "3d",
    label: "3D",
    icon: Box,
    accent: "orange",
    category: "3d-generation",
    placeholder: "Describe a 3D object or upload a reference image…",
  },
  {
    id: "text",
    label: "Text",
    icon: Type,
    accent: "emerald",
    category: "general",
    placeholder: "What would you like to write, translate, or summarize?",
  },
];

/** Keywords used to auto-detect the output type from the prompt */
const TYPE_KEYWORDS: Partial<Record<OutputType, string[]>> = {
  video: ["video", "animate", "animation", "motion", "movie", "film", "clip", "cinema", "footage", "reel", "looping"],
  audio: ["music", "song", "beat", "melody", "audio", "sound", "jingle", "track", "compose", "tune", "rhythm", "instrumental", "soundtrack"],
  "3d": ["3d", "three-d", "three dimensional", "mesh", "sculpt", "3-dimensional", "low poly", "voxel"],
  text: ["write", "story", "poem", "essay", "summarize", "translate", "code", "explain", "describe", "analyze", "blog", "caption"],
};

/** Featured models per category — these show when no search query is typed */
const FEATURED_BY_CATEGORY: Record<string, ModelResult[]> = {
  "image-generation": [
    { id: "black-forest-labs/flux-schnell", fullName: "black-forest-labs/flux-schnell", label: "FLUX Schnell", description: "Fast, high quality image generation", provider: "replicate", tag: "Fast", featured: true },
    { id: "black-forest-labs/flux-1.1-pro", fullName: "black-forest-labs/flux-1.1-pro", label: "FLUX 1.1 Pro", description: "Professional quality images", provider: "replicate", tag: "Pro", featured: true },
    { id: "black-forest-labs/flux-2-pro", fullName: "black-forest-labs/flux-2-pro", label: "FLUX 2 Pro", description: "Highest quality FLUX model", provider: "replicate", tag: "Ultra", featured: true },
    { id: "stability-ai/sdxl", fullName: "stability-ai/sdxl", label: "SDXL", description: "Stable Diffusion XL — fast & versatile", provider: "replicate", tag: "Classic", featured: true },
    { id: "ideogram-ai/ideogram-v2-turbo", fullName: "ideogram-ai/ideogram-v2-turbo", label: "Ideogram v2 Turbo", description: "Best-in-class text in images", provider: "replicate", tag: "Text", featured: true },
    { id: "recraft-ai/recraft-v3", fullName: "recraft-ai/recraft-v3", label: "Recraft v3", description: "Vector & raster design generation", provider: "replicate", tag: "Design", featured: true },
    { id: "stabilityai/stable-diffusion-xl-base-1.0", fullName: "stabilityai/stable-diffusion-xl-base-1.0", label: "SDXL (HF)", description: "SDXL on HuggingFace Inference", provider: "huggingface", tag: "HF", featured: true },
  ],
  "video-generation": [
    { id: "minimax/video-01", fullName: "minimax/video-01", label: "Minimax Video-01", description: "High quality text-to-video", provider: "replicate", tag: "Best", featured: true },
    { id: "tencent/hunyuan-video", fullName: "tencent/hunyuan-video", label: "Hunyuan Video", description: "Tencent's video generation model", provider: "replicate", tag: "Quality", featured: true },
    { id: "wavespeedai/wan-2.1-t2v-480p", fullName: "wavespeedai/wan-2.1-t2v-480p", label: "Wan 2.1 (480p)", description: "Fast video gen by WaveSpeed", provider: "replicate", tag: "Fast", featured: true },
    { id: "kwaivgi/kling-v2.0-master-text-to-video", fullName: "kwaivgi/kling-v2.0-master-text-to-video", label: "Kling v2.0", description: "Cinematic text-to-video", provider: "replicate", tag: "Cinematic", featured: true },
    { id: "bytedance/seedance-1-lite", fullName: "bytedance/seedance-1-lite", label: "Seedance Lite", description: "ByteDance lightweight video model", provider: "replicate", tag: "New", featured: true },
  ],
  "music-generation": [
    { id: "meta/musicgen", fullName: "meta/musicgen", label: "MusicGen", description: "Meta's stereo music generation", provider: "replicate", tag: "Best", featured: true },
    { id: "zsxkib/stable-audio", fullName: "zsxkib/stable-audio", label: "Stable Audio", description: "Stability AI music & sound effects", provider: "replicate", tag: "Quality", featured: true },
    { id: "suno-ai/bark", fullName: "suno-ai/bark", label: "Bark", description: "Realistic audio & voice synthesis", provider: "replicate", tag: "Voice+Music", featured: true },
    { id: "facebook/musicgen-small", fullName: "facebook/musicgen-small", label: "MusicGen (HF)", description: "MusicGen on HuggingFace Inference", provider: "huggingface", tag: "HF", featured: true },
    { id: "jaaari/kokoro-82m", fullName: "jaaari/kokoro-82m", label: "Kokoro TTS", description: "Lightweight expressive text-to-speech", provider: "replicate", tag: "Speech", featured: true },
  ],
  "3d-generation": [
    { id: "stability-ai/triposr", fullName: "stability-ai/triposr", label: "TripoSR", description: "Instant 3D object from a single image", provider: "replicate", tag: "Fast", featured: true },
    { id: "camenduru/instantmesh", fullName: "camenduru/instantmesh", label: "InstantMesh", description: "High-quality image → 3D mesh", provider: "replicate", tag: "Quality", featured: true },
    { id: "ndreca/unique3d", fullName: "ndreca/unique3d", label: "Unique3D", description: "Unique 3D object generation", provider: "replicate", tag: "New", featured: true },
  ],
  general: [
    { id: "black-forest-labs/flux-schnell", fullName: "black-forest-labs/flux-schnell", label: "FLUX Schnell", description: "Fast image generation", provider: "replicate", tag: "Image", featured: true },
    { id: "black-forest-labs/flux-2-pro", fullName: "black-forest-labs/flux-2-pro", label: "FLUX 2 Pro", description: "Highest quality images", provider: "replicate", tag: "Image ★", featured: true },
    { id: "minimax/video-01", fullName: "minimax/video-01", label: "Minimax Video", description: "Text to video", provider: "replicate", tag: "Video", featured: true },
    { id: "kwaivgi/kling-v2.0-master-text-to-video", fullName: "kwaivgi/kling-v2.0-master-text-to-video", label: "Kling v2.0", description: "Cinematic video", provider: "replicate", tag: "Video ★", featured: true },
    { id: "meta/musicgen", fullName: "meta/musicgen", label: "MusicGen", description: "Music & audio generation", provider: "replicate", tag: "Audio", featured: true },
    { id: "jaaari/kokoro-82m", fullName: "jaaari/kokoro-82m", label: "Kokoro TTS", description: "Text to speech", provider: "replicate", tag: "Speech", featured: true },
    { id: "stability-ai/triposr", fullName: "stability-ai/triposr", label: "TripoSR", description: "Image to 3D", provider: "replicate", tag: "3D", featured: true },
    { id: "meta/meta-llama-3-70b-instruct", fullName: "meta/meta-llama-3-70b-instruct", label: "Llama 3 70B", description: "Meta's open LLM", provider: "replicate", tag: "LLM", featured: true },
    { id: "recraft-ai/recraft-v3-svg", fullName: "recraft-ai/recraft-v3-svg", label: "Recraft SVG", description: "Vector SVG generation", provider: "replicate", tag: "Vector", featured: true },
  ],
};

const ACCENT_COLORS: Record<string, {
  ring: string;
  btn: string;
  chip: string;
  chipActive: string;
  tag: string;
}> = {
  violet: {
    ring: "ring-violet-500/30",
    btn: "from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 shadow-violet-500/20",
    chip: "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 border-transparent",
    chipActive: "bg-zinc-700 text-white border-zinc-600",
    tag: "bg-violet-600/20 text-violet-400",
  },
  cyan: {
    ring: "ring-cyan-500/30",
    btn: "from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 shadow-cyan-500/20",
    chip: "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 border-transparent",
    chipActive: "bg-zinc-700 text-white border-zinc-600",
    tag: "bg-cyan-600/20 text-cyan-400",
  },
  amber: {
    ring: "ring-amber-500/30",
    btn: "from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 shadow-amber-500/20",
    chip: "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 border-transparent",
    chipActive: "bg-zinc-700 text-white border-zinc-600",
    tag: "bg-amber-600/20 text-amber-400",
  },
  orange: {
    ring: "ring-orange-500/30",
    btn: "from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 shadow-orange-500/20",
    chip: "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 border-transparent",
    chipActive: "bg-zinc-700 text-white border-zinc-600",
    tag: "bg-orange-600/20 text-orange-400",
  },
  emerald: {
    ring: "ring-emerald-500/30",
    btn: "from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 shadow-emerald-500/20",
    chip: "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 border-transparent",
    chipActive: "bg-zinc-700 text-white border-zinc-600",
    tag: "bg-emerald-600/20 text-emerald-400",
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────

function detectType(prompt: string): OutputType {
  const lower = prompt.toLowerCase();
  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
    if (keywords?.some((k) => lower.includes(k))) return type as OutputType;
  }
  return "image"; // default
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "k";
  return String(n);
}

// ── Sub-components ─────────────────────────────────────────────────────────

function ProviderBadge({ provider, tiny }: { provider: "replicate" | "huggingface"; tiny?: boolean }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded font-medium shrink-0 leading-none",
      tiny ? "px-1 py-0.5 text-[9px]" : "px-1.5 py-0.5 text-[10px]",
      provider === "replicate"
        ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
        : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
    )}>
      {provider === "replicate" ? "Replicate" : "HF"}
    </span>
  );
}

function InlineOutput({
  files,
  textOutput,
  generating,
  onAnimate,
  onUpscale,
  onMake3D,
}: {
  files: GenerationResult["files"];
  textOutput?: string;
  generating?: boolean;
  onAnimate?: (url: string) => void;
  onUpscale?: (url: string) => void;
  onMake3D?: (url: string) => void;
}) {
  if (generating) {
    return (
      <div className="mt-4 flex flex-col items-center justify-center py-16 gap-3">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border-2 border-zinc-800 border-t-violet-500 animate-spin" />
        </div>
        <p className="text-xs text-zinc-400">Generating…</p>
        <div className="w-28 h-1 bg-zinc-800 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-violet-500 via-pink-500 to-orange-500 animate-pulse rounded-full w-2/3" />
        </div>
      </div>
    );
  }

  if (textOutput) {
    return (
      <div className="mt-3 p-4 rounded-xl bg-zinc-800/40 border border-zinc-700/40">
        <pre className="text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed max-h-[320px] overflow-y-auto font-sans">
          {textOutput.slice(0, 6000)}
        </pre>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      {files.map((file, i) => {
        const url = file.url || "";
        if (file.mimeType.startsWith("image/")) {
          return (
            <div key={i} className="space-y-2">
              <div className="relative group rounded-xl overflow-hidden bg-black/20">
                <img src={url} alt={file.filename} className="w-full max-h-[480px] object-contain rounded-xl" />
                <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <a href={url} target="_blank" rel="noopener noreferrer"
                    className="p-1.5 rounded-lg bg-black/70 text-white hover:bg-black/90 backdrop-blur-sm">
                    <Maximize2 className="w-3.5 h-3.5" />
                  </a>
                  <a href={url} download={file.filename}
                    className="p-1.5 rounded-lg bg-black/70 text-white hover:bg-black/90 backdrop-blur-sm">
                    <Download className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
              {/* Smart post-generation actions */}
              <div className="flex flex-wrap gap-1.5">
                {onAnimate && (
                  <button onClick={() => onAnimate(url)}
                    className="px-2.5 py-1 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-xs hover:bg-cyan-500/20 transition-colors flex items-center gap-1">
                    <Video className="w-3 h-3" /> Animate to Video
                  </button>
                )}
                {onUpscale && (
                  <button onClick={() => onUpscale(url)}
                    className="px-2.5 py-1 rounded-lg bg-green-500/10 text-green-400 border border-green-500/20 text-xs hover:bg-green-500/20 transition-colors flex items-center gap-1">
                    <Wand2 className="w-3 h-3" /> Upscale 4×
                  </button>
                )}
                {onMake3D && (
                  <button onClick={() => onMake3D(url)}
                    className="px-2.5 py-1 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20 text-xs hover:bg-orange-500/20 transition-colors flex items-center gap-1">
                    <Box className="w-3 h-3" /> Make 3D
                  </button>
                )}
              </div>
            </div>
          );
        }

        if (file.mimeType.startsWith("video/")) {
          return (
            <div key={i}>
              <video src={url} controls className="w-full rounded-xl max-h-[400px] bg-black" />
              <a href={url} download={file.filename}
                className="mt-1.5 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-300 text-xs hover:bg-zinc-700 transition-colors">
                <Download className="w-3 h-3" /> Download video
              </a>
            </div>
          );
        }

        if (file.mimeType.startsWith("audio/")) {
          return (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-zinc-800/50 border border-zinc-700/50">
              <Volume2 className="w-4 h-4 text-amber-400 shrink-0" />
              <audio src={url} controls className="flex-1 h-8 min-w-0" />
              <a href={url} download={file.filename}
                className="p-1.5 shrink-0 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors">
                <Download className="w-3.5 h-3.5" />
              </a>
            </div>
          );
        }

        if (file.mimeType.includes("gltf") || file.mimeType.includes("glb") || file.mimeType.includes("obj")) {
          return (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-zinc-800/50 border border-zinc-700/50">
              <Box className="w-5 h-5 text-orange-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white">{file.filename}</p>
                <p className="text-xs text-zinc-500">3D Model · {(file.size / 1024).toFixed(1)} KB</p>
              </div>
              <a href={url} download={file.filename}
                className="px-3 py-1.5 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20 text-xs hover:bg-orange-500/20 transition-colors">
                Download
              </a>
            </div>
          );
        }

        return (
          <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-zinc-800/50 border border-zinc-700/50">
            <FileText className="w-4 h-4 text-zinc-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white truncate">{file.filename}</p>
              <p className="text-[10px] text-zinc-500">{file.mimeType}</p>
            </div>
            <a href={url} download={file.filename}
              className="px-2.5 py-1 rounded text-xs bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors">
              Download
            </a>
          </div>
        );
      })}
    </div>
  );
}

// ── Universal Model Search Dropdown ────────────────────────────────────────

function ModelPicker({
  value,
  onSelect,
  category,
  accent,
}: {
  value: ModelResult | null;
  onSelect: (m: ModelResult | null) => void;
  category: string;
  accent: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [liveResults, setLiveResults] = useState<ModelResult[]>([]);
  const [searching, setSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const colors = ACCENT_COLORS[accent] || ACCENT_COLORS.violet;
  const featured = FEATURED_BY_CATEGORY[category] || FEATURED_BY_CATEGORY.general;

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setLiveResults([]); setSearching(false); return; }
    setSearching(true);
    try {
      const [repRes, hfRes] = await Promise.all([
        fetch("/api/replicate?action=search&q=" + encodeURIComponent(q))
          .then(r => r.ok ? r.json() : { models: [] })
          .catch(() => ({ models: [] })),
        fetch("/api/huggingface?action=search&q=" + encodeURIComponent(q))
          .then(r => r.ok ? r.json() : { models: [] })
          .catch(() => ({ models: [] })),
      ]);

      const combined: ModelResult[] = [];
      for (const m of (repRes.models || [])) {
        combined.push({
          id: m.fullName || m.name || "",
          fullName: m.fullName || "",
          label: m.fullName || m.name || "",
          description: m.description || "",
          provider: "replicate",
          run_count: m.run_count || 0,
          cover_image_url: m.cover_image_url,
        });
      }
      for (const m of (hfRes.models || [])) {
        combined.push({
          id: m.fullName || "",
          fullName: m.fullName || "",
          label: m.fullName || "",
          description: m.description || "",
          provider: "huggingface",
          downloads: m.downloads || 0,
          pipeline_tag: m.pipeline_tag,
        });
      }
      // Sort by popularity
      combined.sort((a, b) => ((b.run_count || b.downloads || 0) - (a.run_count || a.downloads || 0)));
      setLiveResults(combined);
    } catch {
      // silently ignore search errors
    }
    setSearching(false);
  }, []);

  const handleInput = (q: string) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runSearch(q), 320);
  };

  const displayList: ModelResult[] = query.trim() ? liveResults : featured;

  const SelectedIcon = value
    ? (value.provider === "replicate" ? Zap : Globe)
    : Sparkles;

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        onClick={() => {
          setOpen(!open);
          if (!open) setTimeout(() => inputRef.current?.focus(), 80);
        }}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all text-left",
          open
            ? "bg-zinc-800 border-zinc-600 text-white"
            : "bg-zinc-800/50 border-zinc-700/50 hover:border-zinc-600 text-white"
        )}
      >
        <SelectedIcon className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
        <span className="flex-1 truncate text-sm">
          {value
            ? value.label
            : <span className="text-zinc-500">Auto-select best model</span>
          }
        </span>
        {value?.tag && (
          <span className={cn("px-1.5 py-0.5 rounded text-[10px] shrink-0", colors.tag)}>
            {value.tag}
          </span>
        )}
        <ChevronDown className={cn("w-3.5 h-3.5 text-zinc-500 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl shadow-black/60 z-[100] overflow-hidden min-w-[300px]">
          {/* Live search input */}
          <div className="px-3 py-2.5 border-b border-zinc-800 flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => handleInput(e.target.value)}
              placeholder="Search Replicate + HuggingFace live…"
              className="flex-1 bg-transparent text-sm text-white placeholder:text-zinc-600 outline-none"
            />
            {searching && <Loader2 className="w-3.5 h-3.5 text-zinc-500 animate-spin shrink-0" />}
            {query && !searching && (
              <button onClick={() => { setQuery(""); setLiveResults([]); }} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Model list */}
          <div className="max-h-[360px] overflow-y-auto">
            {/* Section label */}
            <div className="px-3 py-1.5 text-[10px] text-zinc-600 uppercase tracking-wider font-semibold bg-zinc-800/40 sticky top-0">
              {query ? "Live search results" : "Featured for this type"}
            </div>

            {displayList.length === 0 && !searching && (
              <div className="py-10 text-center text-xs text-zinc-600">
                {query ? "No models found. Try a different term." : "No featured models."}
              </div>
            )}

            {displayList.map((m) => {
              const isSelected = value?.id === m.id && value?.provider === m.provider;
              const popularity = m.run_count || m.downloads || 0;
              return (
                <button
                  key={m.provider + "-" + m.id}
                  onClick={() => { onSelect(m); setOpen(false); setQuery(""); setLiveResults([]); }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-800/60 transition-colors text-left",
                    isSelected && "bg-zinc-800/30"
                  )}
                >
                  {m.cover_image_url ? (
                    <img src={m.cover_image_url} alt="" className="w-8 h-8 rounded-md object-cover shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-md bg-zinc-800 flex items-center justify-center shrink-0">
                      {m.provider === "replicate"
                        ? <Zap className="w-3.5 h-3.5 text-zinc-500" />
                        : <Globe className="w-3.5 h-3.5 text-zinc-500" />
                      }
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-medium text-white truncate">{m.label}</span>
                      {m.tag && (
                        <span className={cn("px-1 py-0.5 rounded text-[9px] shrink-0 font-medium", colors.tag)}>
                          {m.tag}
                        </span>
                      )}
                      {m.pipeline_tag && !m.featured && (
                        <span className="px-1 py-0.5 rounded text-[9px] bg-zinc-800 text-zinc-500 border border-zinc-700 shrink-0">
                          {m.pipeline_tag}
                        </span>
                      )}
                    </div>
                    {m.description && (
                      <p className="text-[10px] text-zinc-500 line-clamp-1 mt-0.5">{m.description}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                    <ProviderBadge provider={m.provider} tiny />
                    {popularity > 0 && (
                      <span className="text-[9px] text-zinc-600">{fmtCount(popularity)}</span>
                    )}
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-violet-400 shrink-0 ml-1" />}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-zinc-800">
            <span className="text-[10px] text-zinc-600 flex items-center gap-1">
              <Zap className="w-2.5 h-2.5 text-blue-500" /> Replicate
              <span className="mx-1 text-zinc-700">+</span>
              <Globe className="w-2.5 h-2.5 text-yellow-500" /> HuggingFace — live
            </span>
            {value && (
              <button
                onClick={() => { onSelect(null); setOpen(false); }}
                className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Reset to Auto
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main NovaSmartBar ──────────────────────────────────────────────────────

export function NovaSmartBar() {
  const [prompt, setPrompt] = useState("");
  const [outputType, setOutputType] = useState<OutputType>("auto");
  const [model, setModel] = useState<ModelResult | null>(null);
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-detect type from typing (debounced)
  const detectedType = useMemo<OutputType>(() => {
    if (outputType !== "auto") return outputType;
    if (!prompt.trim()) return "image";
    return detectType(prompt);
  }, [prompt, outputType]);

  const effectiveType = outputType === "auto" ? detectedType : outputType;
  const typeConfig = OUTPUT_TYPES.find(t => t.id === effectiveType) || OUTPUT_TYPES[0];
  const category = typeConfig.category;
  const accent = typeConfig.accent;
  const colors = ACCENT_COLORS[accent] || ACCENT_COLORS.violet;

  // Upload file
  const uploadFile = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/files", { method: "POST", body: form });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setUploadedFile({
        name: file.name,
        size: file.size,
        type: file.type,
        url: data.url || data.path || "",
        preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
      });
    } catch (e) {
      console.error("Upload error:", e);
    } finally {
      setUploading(false);
    }
  }, []);

  // Generate
  const generate = useCallback(async () => {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    setError("");
    setResult(null);

    try {
      const body: Record<string, unknown> = { prompt: prompt.trim() };
      if (model?.fullName) body.model = model.fullName;
      if (model?.provider === "huggingface") body.provider = "huggingface";

      // Map type to the ReplicateTaskType strings used in replicate.ts
      const taskTypeMap: Partial<Record<OutputType, string>> = {
        image: "image_generation",
        video: "video_generation",
        audio: "music_generation",
        "3d": "3d_generation",
        text: "text_generation",
      };
      if (effectiveType !== "auto") body.taskType = taskTypeMap[effectiveType];

      if (uploadedFile?.url) {
        body.imageUrl = uploadedFile.url;
        body.fileUrl = uploadedFile.url;
      }

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Generation failed");
      } else {
        setResult(data as GenerationResult);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }, [prompt, model, effectiveType, uploadedFile, generating]);

  // Smart post-generation handlers
  const handleAnimate = useCallback((url: string) => {
    setPrompt("Animate into a video: " + prompt);
    setOutputType("video");
    setModel(null);
    setUploadedFile({ name: "reference.png", size: 0, type: "image/png", url, preview: url });
    setResult(null);
    setError("");
  }, [prompt]);

  const handleUpscale = useCallback((url: string) => {
    setPrompt("Upscale to 4× resolution: " + prompt);
    setOutputType("image");
    setModel({ id: "philz1337x/clarity-upscaler", fullName: "philz1337x/clarity-upscaler", label: "Clarity Upscaler", description: "AI upscaling", provider: "replicate", tag: "Upscale" });
    setUploadedFile({ name: "upscale-input.png", size: 0, type: "image/png", url, preview: url });
    setResult(null);
    setError("");
  }, [prompt]);

  const handleMake3D = useCallback((url: string) => {
    setPrompt("Create a 3D model from this image");
    setOutputType("3d");
    setModel({ id: "stability-ai/triposr", fullName: "stability-ai/triposr", label: "TripoSR", description: "3D from image", provider: "replicate", tag: "3D" });
    setUploadedFile({ name: "3d-input.png", size: 0, type: "image/png", url, preview: url });
    setResult(null);
    setError("");
  }, []);

  const canGenerate = prompt.trim().length > 0 && !generating;

  return (
    <div className="max-w-3xl mx-auto">
      {/* ── Type selector chips ── */}
      <div className="flex items-center gap-1 mb-3 flex-wrap">
        {OUTPUT_TYPES.map((t) => {
          const Icon = t.icon;
          const isSelected = outputType === t.id;
          // Highlight the auto-detected type when "Auto" is selected
          const isAutoDetected = outputType === "auto" && detectedType === t.id && t.id !== "auto";
          return (
            <button
              key={t.id}
              onClick={() => {
                setOutputType(t.id);
                setModel(null); // reset model when type changes
              }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                isSelected
                  ? colors.chipActive
                  : isAutoDetected
                  ? "bg-zinc-800/60 text-zinc-200 border-zinc-600/40"
                  : colors.chip
              )}
            >
              <Icon className="w-3 h-3" />
              {t.label}
              {isAutoDetected && (
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse shrink-0" />
              )}
            </button>
          );
        })}
        {outputType !== "auto" && (
          <span className="ml-1 text-[10px] text-zinc-600">
            Auto-detect:{" "}
            <button
              onClick={() => { setOutputType("auto"); setModel(null); }}
              className="text-violet-400 hover:text-violet-300 underline underline-offset-2"
            >
              on
            </button>
          </span>
        )}
      </div>

      {/* ── Main input card ── */}
      <div className={cn(
        "bg-zinc-900/80 border border-zinc-700/50 rounded-2xl backdrop-blur-sm shadow-2xl shadow-black/20 transition-all duration-200",
        generating && `ring-2 ${colors.ring}`
      )}>
        {/* Prompt textarea */}
        <div className="px-4 pt-4 pb-2">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canGenerate) {
                e.preventDefault();
                void generate();
              }
            }}
            placeholder={typeConfig.placeholder}
            rows={2}
            className="w-full bg-transparent text-white placeholder:text-zinc-500 text-sm outline-none resize-none leading-relaxed"
          />
        </div>

        {/* Uploaded file preview */}
        {uploadedFile && (
          <div className="mx-4 mb-2 flex items-center gap-2 p-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
            {uploadedFile.preview ? (
              <img src={uploadedFile.preview} alt="" className="w-8 h-8 rounded-md object-cover shrink-0" />
            ) : (
              <FileText className="w-4 h-4 text-zinc-400 shrink-0" />
            )}
            <span className="text-xs text-zinc-300 flex-1 truncate">{uploadedFile.name}</span>
            <button onClick={() => setUploadedFile(null)} className="text-zinc-500 hover:text-zinc-300 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Bottom: model picker + upload + generate */}
        <div className="flex items-center gap-2 px-4 pb-3 flex-wrap sm:flex-nowrap">
          {/* Model picker (flex-1) */}
          <div className="w-full sm:flex-1 sm:min-w-0">
            <ModelPicker
              value={model}
              onSelect={setModel}
              category={category}
              accent={accent}
            />
          </div>

          {/* Upload */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            title="Upload reference image or file"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-700/50 text-zinc-400 hover:text-white hover:border-zinc-600 text-xs transition-all bg-zinc-800/50 whitespace-nowrap shrink-0"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Upload</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,audio/*,video/*"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) void uploadFile(f);
            }}
          />

          {/* Generate */}
          <button
            onClick={() => void generate()}
            disabled={!canGenerate}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap shrink-0",
              canGenerate
                ? `bg-gradient-to-r ${colors.btn} text-white shadow-lg`
                : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
            )}
          >
            {generating
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Sparkles className="w-4 h-4" />
            }
            {generating ? "Generating…" : "Generate"}
          </button>
        </div>
      </div>

      {/* Hint line */}
      <p className="text-center text-[10px] text-zinc-600 mt-1.5">
        ⌘↵ to generate · live search across Replicate + HuggingFace
      </p>

      {/* ── Error state ── */}
      {error && !generating && (
        <div className="mt-4 p-3 rounded-xl border border-red-500/30 bg-red-500/5 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="flex-1 text-sm text-red-300">{error}</p>
          <button
            onClick={() => void generate()}
            className="px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 text-xs flex items-center gap-1 hover:bg-red-500/20 transition-colors shrink-0"
          >
            <RotateCcw className="w-3 h-3" /> Retry
          </button>
        </div>
      )}

      {/* ── Generation in progress ── */}
      {generating && (
        <InlineOutput files={[]} generating />
      )}

      {/* ── Result ── */}
      {result && !generating && (
        <div className="mt-4 p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/50 backdrop-blur-sm">
          {/* Metadata row */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <ProviderBadge provider={result.provider} />
            <span className="text-[10px] text-zinc-500 font-mono truncate max-w-[200px]">{result.model}</span>
            <span className="text-[10px] text-zinc-600">
              {(result.taskType || "").replace(/_/g, " ")}
            </span>
            {result.predictTime && (
              <span className="text-[10px] text-zinc-600 ml-auto">{result.predictTime.toFixed(1)}s</span>
            )}
          </div>
          <InlineOutput
            files={result.files}
            textOutput={result.textOutput}
            onAnimate={result.files.some(f => f.mimeType.startsWith("image/")) ? handleAnimate : undefined}
            onUpscale={result.files.some(f => f.mimeType.startsWith("image/")) ? handleUpscale : undefined}
            onMake3D={result.files.some(f => f.mimeType.startsWith("image/")) ? handleMake3D : undefined}
          />
        </div>
      )}
    </div>
  );
}

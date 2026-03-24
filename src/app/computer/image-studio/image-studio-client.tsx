"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  Sparkles, Image as ImageIcon, Wand2, Eraser, Expand, ZoomIn,
  Paintbrush, Loader2, Download, Undo2, RotateCcw, Type, Layers,
  Scissors, X, Check, Brush, MousePointer, Upload, Settings2,
  Camera, Palette, Grid, RefreshCw, Heart, Copy, Maximize2,
  ChevronDown, ChevronRight, Plus, Trash2, Star, ArrowRight, Film,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ModelSearchSelector } from "@/app/computer/firefly/components/model-search-selector";
import {
  saveToGallery,
  saveMultipleToGallery,
  loadGallery,
  toggleGalleryFavorite,
  removeFromGallery,
  type GalleryItem,
} from "@/app/computer/firefly/lib/gallery-store";
import { useHandoff, STUDIO_MAP, studiosForItem } from "@/components/handoff-context";
import { inferMimeCategory } from "@/lib/handoff-store";

/* ══════════════════════════════════════════════════════════════════
   Types
══════════════════════════════════════════════════════════════════ */

type Tab = "generate" | "edit" | "gallery";
type EditMode = "select" | "brush" | "eraser" | "expand" | "prompt-edit";
type EditOperation =
  | "generative-fill"
  | "remove"
  | "replace-background"
  | "expand"
  | "upscale"
  | "remove-bg"
  | "prompt-edit";

interface GeneratedImage {
  id: string;
  url: string;
  width: number;
  height: number;
}

interface GenerationResult {
  id: string;
  prompt: string;
  model: string;
  images: GeneratedImage[];
  settings: Record<string, unknown>;
  createdAt: string;
}

/* ══════════════════════════════════════════════════════════════════
   Constants
══════════════════════════════════════════════════════════════════ */

const ASPECT_RATIOS = [
  { id: "1:1",  label: "1:1",  desc: "Square",    w: 1,  h: 1  },
  { id: "16:9", label: "16:9", desc: "Landscape",  w: 16, h: 9  },
  { id: "9:16", label: "9:16", desc: "Portrait",   w: 9,  h: 16 },
  { id: "4:3",  label: "4:3",  desc: "Standard",   w: 4,  h: 3  },
  { id: "3:4",  label: "3:4",  desc: "Portrait",   w: 3,  h: 4  },
  { id: "3:2",  label: "3:2",  desc: "Photo",      w: 3,  h: 2  },
  { id: "21:9", label: "21:9", desc: "Ultrawide",  w: 21, h: 9  },
];

const STYLE_PRESETS = [
  "None","Cinematic","Anime","Digital Art","Fantasy","Neon Punk","Photographic",
  "Comic Book","Line Art","Watercolor","Oil Painting","3D Render","Pixel Art",
  "Surrealism","Pop Art","Minimalist","Impressionism","Cubism","Art Deco",
  "Steampunk","Vintage","Low Poly","Isometric","Origami","Stained Glass",
];

const LIGHTING_PRESETS = [
  "None","Golden Hour","Dramatic","Studio","Neon","Backlit","Natural","Moody","High Key",
];

const CAMERA_ANGLES = [
  "None","Close-up","Wide Angle","Aerial","Low Angle","Eye Level","Dutch Angle","Overhead",
];

const EDIT_TOOLS: { id: EditMode; label: string; icon: typeof Brush; shortcut: string }[] = [
  { id: "select",       label: "Select",       icon: MousePointer, shortcut: "V" },
  { id: "brush",        label: "Brush",        icon: Brush,        shortcut: "B" },
  { id: "eraser",       label: "Erase",        icon: Eraser,       shortcut: "E" },
  { id: "expand",       label: "Expand",       icon: Expand,       shortcut: "X" },
  { id: "prompt-edit",  label: "Prompt Edit",  icon: Type,         shortcut: "T" },
];

const EDIT_OPERATIONS: { id: EditOperation; label: string; icon: typeof Wand2; description: string }[] = [
  { id: "generative-fill",    label: "Generative Fill",    icon: Paintbrush, description: "Add or replace objects in masked area" },
  { id: "remove",             label: "Remove Object",      icon: Eraser,     description: "Remove unwanted objects seamlessly"   },
  { id: "replace-background", label: "Replace Background", icon: Layers,     description: "Replace background with AI generation" },
  { id: "expand",             label: "Generative Expand",  icon: Expand,     description: "Expand canvas and fill with AI"        },
  { id: "upscale",            label: "Upscale",            icon: ZoomIn,     description: "Enhance resolution 2× or 4×"           },
  { id: "remove-bg",          label: "Remove Background",  icon: Scissors,   description: "Remove background entirely"            },
  { id: "prompt-edit",        label: "Prompt to Edit",     icon: Wand2,      description: "Describe your edit in plain language"  },
];

const OP_CATEGORY: Record<EditOperation, string> = {
  "generative-fill":    "inpainting",
  "remove":             "inpainting",
  "replace-background": "background-removal",
  "expand":             "outpainting",
  "upscale":            "image-upscale",
  "remove-bg":          "background-removal",
  "prompt-edit":        "image-editing",
};

/* ══════════════════════════════════════════════════════════════════
   MaskCanvas — canvas-based brush masking
══════════════════════════════════════════════════════════════════ */

function MaskCanvas({
  imageUrl,
  brushSize,
  tool,
  onMaskGenerated,
}: {
  imageUrl: string;
  brushSize: number;
  tool: EditMode;
  onMaskGenerated: (mask: string) => void;
}) {
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing]           = useState(false);
  const [imgDims, setImgDims]           = useState({ w: 0, h: 0 });
  const naturalDims = useRef({ w: 0, h: 0 });
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      naturalDims.current = { w: img.naturalWidth, h: img.naturalHeight };
      const maxW = 900, maxH = 650;
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      setImgDims({ w, h });

      const c = canvasRef.current;
      if (c) { c.width = w; c.height = h; c.getContext("2d")?.drawImage(img, 0, 0, w, h); }

      const mc = maskCanvasRef.current;
      if (mc) {
        mc.width = w; mc.height = h;
        const ctx = mc.getContext("2d");
        if (ctx) { ctx.fillStyle = "black"; ctx.fillRect(0, 0, w, h); }
      }
    };
    img.src = imageUrl;
  }, [imageUrl]);

  const getPos = (e: React.MouseEvent) => {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };

  const paint = useCallback((x: number, y: number) => {
    const mc = maskCanvasRef.current;
    const dc = canvasRef.current;
    if (!mc || !dc) return;
    const mCtx = mc.getContext("2d");
    const dCtx = dc.getContext("2d");
    if (!mCtx || !dCtx) return;
    const erase = tool === "eraser";

    mCtx.globalCompositeOperation = "source-over";
    mCtx.fillStyle = erase ? "black" : "white";
    mCtx.beginPath(); mCtx.arc(x, y, brushSize / 2, 0, Math.PI * 2); mCtx.fill();
    if (lastPoint.current) {
      mCtx.strokeStyle = erase ? "black" : "white";
      mCtx.lineWidth = brushSize; mCtx.lineCap = "round";
      mCtx.beginPath(); mCtx.moveTo(lastPoint.current.x, lastPoint.current.y); mCtx.lineTo(x, y); mCtx.stroke();
    }

    dCtx.globalCompositeOperation = "source-over";
    dCtx.fillStyle = erase ? "rgba(0,0,0,0.3)" : "rgba(147,51,234,0.4)";
    dCtx.beginPath(); dCtx.arc(x, y, brushSize / 2, 0, Math.PI * 2); dCtx.fill();

    lastPoint.current = { x, y };
  }, [brushSize, tool]);

  const clearMask = () => {
    const mc = maskCanvasRef.current;
    if (mc) { const ctx = mc.getContext("2d"); if (ctx) { ctx.fillStyle = "black"; ctx.fillRect(0, 0, mc.width, mc.height); } }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = canvasRef.current;
      if (c) { const ctx = c.getContext("2d"); if (ctx) { ctx.clearRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height); } }
    };
    img.src = imageUrl;
  };

  const exportMask = () => {
    const mc = maskCanvasRef.current;
    if (!mc) return;
    const { w: nw, h: nh } = naturalDims.current;
    if (nw > 0 && nh > 0 && (nw !== mc.width || nh !== mc.height)) {
      // Scale mask up to match source image natural dimensions
      const offscreen = document.createElement("canvas");
      offscreen.width = nw; offscreen.height = nh;
      const ctx = offscreen.getContext("2d");
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(mc, 0, 0, nw, nh);
        onMaskGenerated(offscreen.toDataURL("image/png"));
        return;
      }
    }
    onMaskGenerated(mc.toDataURL("image/png"));
  };

  return (
    <div className="relative inline-block">
      <canvas
        ref={canvasRef}
        className={cn("rounded-xl shadow-2xl max-w-full", (tool === "brush" || tool === "eraser") && "cursor-crosshair")}
        style={{ maxWidth: "100%", maxHeight: "65vh" }}
        onMouseDown={(e) => {
          if (tool !== "brush" && tool !== "eraser") return;
          setDrawing(true); lastPoint.current = null;
          const p = getPos(e); paint(p.x, p.y);
        }}
        onMouseMove={(e) => {
          if (!drawing) return;
          const p = getPos(e); paint(p.x, p.y);
        }}
        onMouseUp={() => { setDrawing(false); lastPoint.current = null; exportMask(); }}
        onMouseLeave={() => { setDrawing(false); lastPoint.current = null; exportMask(); }}
      />
      <canvas ref={maskCanvasRef} className="hidden" />
      {(tool === "brush" || tool === "eraser") && (
        <button
          onClick={clearMask}
          className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-sm text-xs text-white hover:bg-black/80 transition-colors flex items-center gap-1.5"
        >
          <RotateCcw className="w-3 h-3" /> Clear Mask
        </button>
      )}
      {imgDims.w > 0 && (
        <div className="absolute bottom-3 left-3 px-2 py-0.5 rounded bg-black/60 text-[10px] text-zinc-400">
          {imgDims.w} × {imgDims.h}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Generate Tab
══════════════════════════════════════════════════════════════════ */

function GenerateTab({ onEditImage }: { onEditImage: (url: string) => void }) {
  const { addToShelf, sendToStudio } = useHandoff();
  const [prompt,          setPrompt]          = useState("");
  const [negPrompt,       setNegPrompt]       = useState("");
  const [model,           setModel]           = useState("");
  const [aspectRatio,     setAspectRatio]     = useState("1:1");
  const [stylePreset,     setStylePreset]     = useState("None");
  const [lighting,        setLighting]        = useState("None");
  const [cameraAngle,     setCameraAngle]     = useState("None");
  const [numImages,       setNumImages]       = useState(1);
  const [seed,            setSeed]            = useState("");
  const [generating,      setGenerating]      = useState(false);
  const [error,           setError]           = useState("");
  const [results,         setResults]         = useState<GenerationResult[]>([]);
  const [showSettings,    setShowSettings]    = useState(true);
  const [favorites,       setFavorites]       = useState<Set<string>>(new Set());
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function generate() {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        prompt: prompt.trim(),
        model: model || undefined,
        aspectRatio,
        numImages,
        stylePreset:  stylePreset  !== "None" ? stylePreset  : undefined,
        lighting:     lighting     !== "None" ? lighting     : undefined,
        cameraAngle:  cameraAngle  !== "None" ? cameraAngle  : undefined,
        negativePrompt: negPrompt.trim() || undefined,
        seed: seed.trim() ? Number(seed) : undefined,
      };
      const res = await fetch("/api/firefly/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as GenerationResult & { error?: string };
      if (!res.ok) { setError(data.error || "Generation failed"); return; }

      const result = data;
      setResults(prev => [result, ...prev]);

      saveMultipleToGallery(
        (result.images || []).map((img: GeneratedImage) => ({
          type: "image" as const,
          url: img.url,
          prompt: prompt.trim(),
          model: model || "default",
          metadata: { aspectRatio, stylePreset, lighting, cameraAngle },
        }))
      );

      // Add generated images to the global media shelf for handoff
      for (const img of result.images || []) {
        addToShelf({
          url: img.url,
          name: `nova-image-${Date.now()}.png`,
          mimeType: "image/png",
          mimeCategory: "image",
          source: "image-studio",
          prompt: prompt.trim(),
        });
      }
    } catch (err) {
      setError((err as Error).message || "Network error");
    } finally {
      setGenerating(false);
    }
  }

  const toggleFav = (url: string) => {
    setFavorites(prev => { const s = new Set(prev); s.has(url) ? s.delete(url) : s.add(url); return s; });
  };

  const downloadImage = async (url: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `nova-image-${Date.now()}.png`;
      a.click();
    } catch { /* ignore */ }
  };

  return (
    <div className="flex h-full min-h-0">
      {/* Settings Sidebar */}
      <div className={cn("shrink-0 border-r border-zinc-800 flex flex-col transition-all duration-200", showSettings ? "w-72" : "w-0 overflow-hidden border-r-0")}>
        <div className="flex-1 overflow-y-auto p-4 space-y-5 text-sm">
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium uppercase tracking-wider">
            <Settings2 className="w-3.5 h-3.5" /> Generation Settings
          </div>

          {/* Model */}
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400 font-medium">Model</label>
            <ModelSearchSelector category="image-generation" value={model} onChange={(id) => setModel(id)} accent="pink" />
          </div>

          {/* Aspect Ratio */}
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400 font-medium">Aspect Ratio</label>
            <div className="grid grid-cols-4 gap-1.5">
              {ASPECT_RATIOS.map((ar) => (
                <button key={ar.id} onClick={() => setAspectRatio(ar.id)}
                  className={cn("flex flex-col items-center gap-0.5 p-1.5 rounded-lg text-[10px] transition-all",
                    aspectRatio === ar.id
                      ? "bg-pink-600/20 border border-pink-500/30 text-pink-300"
                      : "bg-zinc-800/50 border border-zinc-700/30 text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  <div className="border border-current rounded-sm" style={{ width: Math.round(16 * ar.w / Math.max(ar.w, ar.h)), height: Math.round(16 * ar.h / Math.max(ar.w, ar.h)) }} />
                  {ar.label}
                </button>
              ))}
            </div>
          </div>

          {/* Style Preset */}
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400 font-medium">Style Preset</label>
            <div className="relative">
              <select value={stylePreset} onChange={(e) => setStylePreset(e.target.value)}
                className="w-full bg-zinc-800/60 border border-zinc-700/50 rounded-lg px-3 py-2 text-xs text-zinc-200 appearance-none cursor-pointer focus:outline-none focus:border-pink-500/50"
              >
                {STYLE_PRESETS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Lighting */}
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400 font-medium">Lighting</label>
            <div className="relative">
              <select value={lighting} onChange={(e) => setLighting(e.target.value)}
                className="w-full bg-zinc-800/60 border border-zinc-700/50 rounded-lg px-3 py-2 text-xs text-zinc-200 appearance-none cursor-pointer focus:outline-none focus:border-pink-500/50"
              >
                {LIGHTING_PRESETS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Camera Angle */}
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400 font-medium">Camera Angle</label>
            <div className="relative">
              <select value={cameraAngle} onChange={(e) => setCameraAngle(e.target.value)}
                className="w-full bg-zinc-800/60 border border-zinc-700/50 rounded-lg px-3 py-2 text-xs text-zinc-200 appearance-none cursor-pointer focus:outline-none focus:border-pink-500/50"
              >
                {CAMERA_ANGLES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Num Images */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-zinc-400 font-medium">Images</label>
              <span className="text-xs text-pink-400 font-medium">{numImages}</span>
            </div>
            <input type="range" min={1} max={4} value={numImages} onChange={(e) => setNumImages(Number(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-zinc-700 accent-pink-500" />
            <div className="flex justify-between text-[10px] text-zinc-600">
              {[1,2,3,4].map(n => <span key={n}>{n}</span>)}
            </div>
          </div>

          {/* Negative Prompt */}
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400 font-medium">Negative Prompt</label>
            <textarea value={negPrompt} onChange={(e) => setNegPrompt(e.target.value)} rows={2}
              placeholder="What to avoid: blur, noise, watermark…"
              className="w-full bg-zinc-800/60 border border-zinc-700/50 rounded-lg px-3 py-2 text-xs text-zinc-200 resize-none focus:outline-none focus:border-pink-500/50 placeholder:text-zinc-600"
            />
          </div>

          {/* Seed */}
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400 font-medium">Seed (optional)</label>
            <input type="number" value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="Leave empty for random"
              className="w-full bg-zinc-800/60 border border-zinc-700/50 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-pink-500/50 placeholder:text-zinc-600" />
          </div>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Prompt Bar */}
        <div className="px-6 py-4 border-b border-zinc-800 shrink-0">
          <div className="flex gap-3 items-end">
            <button onClick={() => setShowSettings(s => !s)}
              className="p-2 rounded-lg bg-zinc-800/50 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors shrink-0"
              title="Toggle settings">
              <Settings2 className="w-4 h-4" />
            </button>
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); generate(); } }}
                rows={2}
                placeholder="Describe the image you want to create — subject, style, lighting, mood, camera angle…"
                className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-3 pr-10 text-sm text-zinc-100 resize-none focus:outline-none focus:border-pink-500/50 placeholder:text-zinc-600"
              />
              {prompt && (
                <button onClick={() => setPrompt("")} className="absolute right-3 top-3 text-zinc-600 hover:text-zinc-400 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              onClick={generate}
              disabled={!prompt.trim() || generating}
              className="px-5 py-3 rounded-xl bg-gradient-to-r from-pink-600 to-fuchsia-600 hover:from-pink-500 hover:to-fuchsia-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold flex items-center gap-2 transition-all shrink-0 shadow-lg shadow-pink-900/30"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {generating ? "Generating…" : "Generate"}
            </button>
          </div>
          {error && (
            <p className="mt-2 text-xs text-red-400 flex items-center gap-1.5">
              <X className="w-3.5 h-3.5" /> {error}
            </p>
          )}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-6">
          {results.length === 0 && !generating && (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-pink-600/20 to-fuchsia-600/20 border border-pink-500/20 flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-pink-400" />
              </div>
              <div>
                <p className="text-zinc-300 font-medium mb-1">Ready to generate</p>
                <p className="text-sm text-zinc-600 max-w-sm">
                  Describe an image in the prompt bar. Choose a style, adjust settings, and hit Generate.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center mt-2">
                {[
                  "A cinematic portrait of a cyberpunk cityscape at night",
                  "Abstract watercolor painting of a mountain sunrise",
                  "Photorealistic macro shot of a dew-covered spider web",
                ].map(s => (
                  <button key={s} onClick={() => setPrompt(s)}
                    className="px-3 py-1.5 rounded-full bg-zinc-800/60 hover:bg-zinc-700 border border-zinc-700/50 text-xs text-zinc-400 hover:text-zinc-200 transition-colors">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {generating && results.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-pink-400 animate-spin" />
                <p className="text-zinc-400 text-sm">Generating your image…</p>
              </div>
            </div>
          )}

          <div className="space-y-8">
            {results.map((result) => (
              <div key={result.id}>
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-xs text-zinc-500 flex-1 truncate">{result.prompt}</p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">{result.model || "default"}</span>
                </div>
                <div className={cn("grid gap-3", result.images?.length === 1 ? "grid-cols-1 max-w-lg" : "grid-cols-2")}>
                  {(result.images || []).map((img) => (
                    <div key={img.id} className="group relative rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800">
                      <img src={img.url} alt={result.prompt} className="w-full object-cover" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                        <div className="flex items-center gap-2">
                          <button onClick={() => downloadImage(img.url)}
                            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors" title="Download">
                            <Download className="w-4 h-4" />
                          </button>
                          <button onClick={() => onEditImage(img.url)}
                            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors" title="Edit in Image Studio">
                            <Wand2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => toggleFav(img.url)}
                            className={cn("p-2 rounded-lg transition-colors", favorites.has(img.url) ? "bg-pink-600/40 text-pink-300" : "bg-white/10 hover:bg-white/20 text-white")} title="Favorite">
                            <Heart className="w-4 h-4" />
                          </button>
                        </div>
                        {/* Handoff: send to Video Studio */}
                        <button
                          onClick={() => {
                            const item = {
                              url: img.url,
                              name: `nova-image-${Date.now()}.png`,
                              mimeType: "image/png" as const,
                              mimeCategory: "image" as const,
                              source: "image-studio",
                              prompt: result.prompt,
                            };
                            sendToStudio(addToShelf(item), "dreamscape");
                          }}
                          className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-600/70 hover:bg-violet-500/80 text-white text-[11px] font-medium transition-colors"
                          title="Animate in Video Studio"
                        >
                          <Film className="w-3 h-3" /> Animate in Video Studio
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Edit Tab
══════════════════════════════════════════════════════════════════ */

function EditTab({ initialImageUrl }: { initialImageUrl?: string }) {
  const { addToShelf } = useHandoff();
  const [imageUrl,        setImageUrl]        = useState(initialImageUrl || "");
  const [maskDataUrl,     setMaskDataUrl]     = useState<string | null>(null);
  const [operation,       setOperation]       = useState<EditOperation>("prompt-edit");
  const [tool,            setTool]            = useState<EditMode>("brush");
  const [prompt,          setPrompt]          = useState("");
  const [brushSize,       setBrushSize]       = useState(30);
  const [processing,      setProcessing]      = useState(false);
  const [error,           setError]           = useState("");
  const [resultUrl,       setResultUrl]       = useState<string | null>(null);
  const [history,         setHistory]         = useState<{ url: string; op: string }[]>([]);
  const [expandRatio,     setExpandRatio]     = useState("16:9");
  const [expandDirection, setExpandDirection] = useState<"all"|"left"|"right"|"up"|"down">("all");
  const [upscaleFactor,   setUpscaleFactor]   = useState(2);
  const [editModel,       setEditModel]       = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Update canvas when initialImageUrl changes (from Generate tab)
  useEffect(() => {
    if (initialImageUrl) setImageUrl(initialImageUrl);
  }, [initialImageUrl]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    if (file.size > 100 * 1024 * 1024) { setError("File must be under 100 MB"); return; }
    const reader = new FileReader();
    reader.onload = () => { setImageUrl(reader.result as string); setResultUrl(null); setError(""); };
    reader.readAsDataURL(file);
  }

  async function applyEdit() {
    if (!imageUrl || processing) return;
    if (operation === "prompt-edit" && !prompt.trim()) { setError("Describe what you want to change"); return; }
    if ((operation === "generative-fill" || operation === "remove") && !maskDataUrl) { setError("Brush over the area to edit first"); return; }

    setProcessing(true); setError("");
    try {
      const body: Record<string, unknown> = { imageUrl, operation, prompt: prompt || undefined, model: editModel || undefined };
      if (maskDataUrl && ["generative-fill","remove","replace-background"].includes(operation)) body.maskUrl = maskDataUrl;
      if (operation === "expand") { body.expandDirection = expandDirection; body.expandRatio = expandRatio; }
      if (operation === "upscale") body.upscaleFactor = upscaleFactor;

      const res = await fetch("/api/firefly/edit-image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json() as Record<string, unknown>;
      if (!res.ok) { setError((data.error as string) || "Edit failed"); return; }

      const url = (data.result as { url: string }).url;
      setResultUrl(url);
      setHistory(prev => [{ url: resultUrl || imageUrl, op: operation }, ...prev].slice(0, 20));
      saveToGallery({ type: "image", url, prompt: `${operation}: ${prompt || ""}`, model: editModel || "default", metadata: { operation } });
      // Add edited result to shelf
      addToShelf({
        url,
        name: `nova-edit-${Date.now()}.png`,
        mimeType: "image/png",
        mimeCategory: "image",
        source: "image-studio",
        prompt: `${operation}: ${prompt || ""}`,
      });
    } catch (err) {
      setError((err as Error).message || "Network error");
    } finally {
      setProcessing(false);
    }
  }

  const applyResult = () => { if (resultUrl) { setImageUrl(resultUrl); setResultUrl(null); setMaskDataUrl(null); } };

  const downloadResult = async () => {
    const url = resultUrl || imageUrl;
    if (!url) return;
    const res = await fetch(url);
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `nova-edit-${Date.now()}.png`;
    a.click();
  };

  return (
    <div className="flex h-full min-h-0">
      {/* Tool Strip */}
      <div className="w-14 border-r border-zinc-800 flex flex-col items-center py-3 gap-1 shrink-0">
        {EDIT_TOOLS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTool(t.id)}
              title={`${t.label} (${t.shortcut})`}
              className={cn("w-10 h-10 rounded-lg flex items-center justify-center transition-all",
                tool === t.id ? "bg-fuchsia-600/20 text-fuchsia-400" : "text-zinc-500 hover:text-white hover:bg-zinc-800"
              )}>
              <Icon className="w-4 h-4" />
            </button>
          );
        })}
        <div className="flex-1" />
        <button onClick={() => fileInputRef.current?.click()}
          className="w-10 h-10 rounded-lg flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors" title="Upload Image">
          <Upload className="w-4 h-4" />
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>

      {/* Canvas */}
      <div className="flex-1 flex flex-col items-center justify-center bg-zinc-950 overflow-auto p-6 min-w-0 relative">
        {!imageUrl ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-zinc-700 flex items-center justify-center">
              <Upload className="w-7 h-7 text-zinc-600" />
            </div>
            <div>
              <p className="text-zinc-300 font-medium mb-1">Upload an image to edit</p>
              <p className="text-sm text-zinc-600">Or generate one on the Generate tab, then click the edit icon</p>
            </div>
            <button onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm text-zinc-200 transition-colors flex items-center gap-2">
              <Upload className="w-4 h-4" /> Choose Image
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 w-full">
            {/* Action Bar */}
            <div className="flex items-center gap-2">
              {resultUrl && (
                <>
                  <button onClick={applyResult}
                    className="px-3 py-1.5 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors">
                    <Check className="w-3.5 h-3.5" /> Apply
                  </button>
                  <button onClick={() => setResultUrl(null)}
                    className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium flex items-center gap-1.5 transition-colors">
                    <RotateCcw className="w-3.5 h-3.5" /> Revert
                  </button>
                </>
              )}
              {history.length > 0 && (
                <button onClick={() => { setImageUrl(history[0].url); setHistory(prev => prev.slice(1)); setResultUrl(null); }}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium flex items-center gap-1.5 transition-colors">
                  <Undo2 className="w-3.5 h-3.5" /> Undo
                </button>
              )}
              <button onClick={downloadResult}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium flex items-center gap-1.5 transition-colors">
                <Download className="w-3.5 h-3.5" /> Download
              </button>
            </div>

            {/* Canvas or Result Image */}
            {resultUrl ? (
              <div className="relative">
                <img src={resultUrl} alt="result" className="rounded-xl shadow-2xl max-h-[65vh] max-w-full object-contain" />
                <div className="absolute top-3 left-3 px-2 py-0.5 rounded bg-fuchsia-600/80 text-[10px] text-white font-medium">Result</div>
              </div>
            ) : (
              <MaskCanvas imageUrl={imageUrl} brushSize={brushSize} tool={tool} onMaskGenerated={setMaskDataUrl} />
            )}
          </div>
        )}

        {processing && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-3 z-10">
            <Loader2 className="w-8 h-8 text-fuchsia-400 animate-spin" />
            <p className="text-zinc-300 text-sm">Applying {operation.replace(/-/g, " ")}…</p>
          </div>
        )}
      </div>

      {/* Operations Sidebar */}
      <div className="w-72 border-l border-zinc-800 flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-fuchsia-400" />
            <span className="text-sm font-semibold">AI Operations</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 text-sm">
          {/* Operations */}
          <div className="space-y-1">
            {EDIT_OPERATIONS.map((op) => {
              const Icon = op.icon;
              return (
                <button key={op.id} onClick={() => {
                  setOperation(op.id); setEditModel("");
                  if (op.id === "expand") setTool("expand");
                  else if (op.id === "prompt-edit") setTool("prompt-edit");
                  else setTool("brush");
                }}
                  className={cn("w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all",
                    operation === op.id
                      ? "bg-fuchsia-600/15 border border-fuchsia-500/30 text-fuchsia-300"
                      : "bg-zinc-800/30 border border-zinc-800/50 text-zinc-400 hover:text-white hover:border-zinc-700"
                  )}>
                  <Icon className="w-4 h-4 shrink-0" />
                  <div>
                    <div className="text-xs font-medium">{op.label}</div>
                    <div className="text-[10px] text-zinc-600 mt-0.5">{op.description}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Model */}
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400 font-medium">Model (optional)</label>
            <ModelSearchSelector
              category={OP_CATEGORY[operation] as Parameters<typeof ModelSearchSelector>[0]["category"]}
              value={editModel} onChange={(id) => setEditModel(id)} accent="purple" compact />
            <p className="text-[10px] text-zinc-600">Leave empty for default</p>
          </div>

          {/* Brush Size */}
          {["generative-fill","remove","replace-background"].includes(operation) && (
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <label className="text-xs text-zinc-400 font-medium">Brush Size</label>
                <span className="text-xs text-zinc-500">{brushSize}px</span>
              </div>
              <input type="range" min={5} max={100} value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-zinc-700 accent-fuchsia-500" />
            </div>
          )}

          {/* Expand Settings */}
          {operation === "expand" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400 font-medium">Direction</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(["all","left","right","up","down"] as const).map((dir) => (
                    <button key={dir} onClick={() => setExpandDirection(dir)}
                      className={cn("py-1.5 rounded-lg text-xs capitalize transition-all",
                        expandDirection === dir ? "bg-fuchsia-600/20 border border-fuchsia-500/30 text-fuchsia-300" : "bg-zinc-800/50 border border-zinc-700/30 text-zinc-500 hover:text-zinc-300"
                      )}>{dir}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400 font-medium">Target Ratio</label>
                <div className="flex flex-wrap gap-1.5">
                  {["16:9","9:16","4:3","3:4","1:1","Freeform"].map((r) => (
                    <button key={r} onClick={() => setExpandRatio(r)}
                      className={cn("px-2.5 py-1 rounded-lg text-xs transition-all",
                        expandRatio === r ? "bg-fuchsia-600/20 border border-fuchsia-500/30 text-fuchsia-300" : "bg-zinc-800/50 border border-zinc-700/30 text-zinc-500 hover:text-zinc-300"
                      )}>{r}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Upscale Factor */}
          {operation === "upscale" && (
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-400 font-medium">Scale Factor</label>
              <div className="flex gap-1.5">
                {[2,4].map((f) => (
                  <button key={f} onClick={() => setUpscaleFactor(f)}
                    className={cn("flex-1 py-2 rounded-lg text-sm font-medium transition-all",
                      upscaleFactor === f ? "bg-fuchsia-600/20 border border-fuchsia-500/30 text-fuchsia-300" : "bg-zinc-800/50 border border-zinc-700/30 text-zinc-500 hover:text-zinc-300"
                    )}>{f}×</button>
                ))}
              </div>
            </div>
          )}

          {/* Prompt */}
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400 font-medium">
              {operation === "prompt-edit" ? "Describe your edit" : "Prompt (optional)"}
            </label>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3}
              placeholder={
                operation === "prompt-edit" ? "e.g., Replace the sky with a dramatic sunset" :
                operation === "generative-fill" ? "e.g., Add a red flower bouquet" :
                operation === "replace-background" ? "e.g., Professional studio with soft gradient" :
                "Describe what to generate..."
              }
              className="w-full bg-zinc-800/60 border border-zinc-700/50 rounded-lg px-3 py-2 text-xs text-zinc-200 resize-none focus:outline-none focus:border-fuchsia-500/50 placeholder:text-zinc-600"
            />
          </div>

          {error && <p className="text-xs text-red-400 flex items-center gap-1.5"><X className="w-3.5 h-3.5 shrink-0" />{error}</p>}

          {/* Apply Button */}
          <button onClick={applyEdit} disabled={!imageUrl || processing}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-violet-600 hover:from-fuchsia-500 hover:to-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all">
            {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            {processing ? "Processing…" : "Apply Edit"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Gallery Tab
══════════════════════════════════════════════════════════════════ */

function GalleryTab({ onEditImage }: { onEditImage: (url: string) => void }) {
  const [items, setItems]   = useState<GalleryItem[]>([]);
  const [filter, setFilter] = useState<"all"|"image">("all");

  useEffect(() => { setItems(loadGallery()); }, []);

  const displayed = items.filter(i => filter === "all" || i.type === filter);

  const toggleFav = (id: string) => setItems(toggleGalleryFavorite(id));
  const remove    = (id: string) => setItems(removeFromGallery(id));

  const download = async (url: string) => {
    const res = await fetch(url);
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `nova-image-${Date.now()}.png`;
    a.click();
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-zinc-800 shrink-0">
        <span className="text-xs text-zinc-500">{displayed.length} items</span>
        <div className="flex gap-1 ml-auto">
          {(["all","image"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn("px-3 py-1 rounded-lg text-xs capitalize transition-all",
                filter === f ? "bg-pink-600/20 text-pink-300 border border-pink-500/30" : "text-zinc-500 hover:text-zinc-300"
              )}>{f === "all" ? "All" : "Images"}</button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <ImageIcon className="w-10 h-10 text-zinc-700" />
            <p className="text-zinc-500 text-sm">No images yet — generate or edit some!</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {displayed.map((item) => (
              <div key={item.id} className="group relative aspect-square rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800">
                {item.type === "image" ? (
                  <img src={item.url} alt={item.prompt} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-8 h-8 text-zinc-700" /></div>
                )}
                {item.favorite && <Star className="absolute top-2 left-2 w-3.5 h-3.5 text-amber-400 fill-amber-400" />}
                <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => toggleFav(item.id)} className={cn("p-1.5 rounded-lg transition-colors", item.favorite ? "bg-amber-500/30 text-amber-300" : "bg-white/10 text-white hover:bg-white/20")}>
                      <Heart className="w-3 h-3" />
                    </button>
                    <button onClick={() => remove(item.id)} className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-red-500/30 hover:text-red-300 transition-colors">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => download(item.url)} className="flex-1 py-1 rounded-lg bg-white/10 text-white text-[10px] flex items-center justify-center gap-1 hover:bg-white/20 transition-colors">
                      <Download className="w-3 h-3" /> Save
                    </button>
                    {item.type === "image" && (
                      <button onClick={() => onEditImage(item.url)} className="flex-1 py-1 rounded-lg bg-fuchsia-600/50 text-white text-[10px] flex items-center justify-center gap-1 hover:bg-fuchsia-600/70 transition-colors">
                        <Wand2 className="w-3 h-3" /> Edit
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Root — Image Studio
══════════════════════════════════════════════════════════════════ */

export function ImageStudioClient() {
  const [tab,           setTab]           = useState<Tab>("generate");
  const [editImageUrl,  setEditImageUrl]  = useState<string | undefined>(undefined);
  const searchParams = useSearchParams();
  const { consumeHandoff } = useHandoff();

  // Consume any pending handoff on mount (e.g., image sent from Files or Dreamscape)
  useEffect(() => {
    if (searchParams.get("handoff") === "1") {
      const h = consumeHandoff();
      if (h && h.mimeCategory === "image") {
        setEditImageUrl(h.url);
        setTab("edit");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openInEditor(url: string) {
    setEditImageUrl(url);
    setTab("edit");
  }

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f] text-white">
      {/* Header */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2 mr-4">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-pink-500 via-fuchsia-500 to-violet-600 flex items-center justify-center">
            <Paintbrush className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-semibold bg-gradient-to-r from-pink-400 via-fuchsia-400 to-violet-400 bg-clip-text text-transparent">
            Image Studio
          </span>
        </div>

        {/* Tabs */}
        <div className="flex gap-1">
          {(["generate","edit","gallery"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={cn("px-4 py-1.5 rounded-lg text-xs font-medium capitalize transition-all",
                tab === t
                  ? "bg-zinc-800 text-white border border-zinc-700"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
              )}>
              {t === "generate" && <Sparkles className="w-3 h-3 inline-block mr-1.5 opacity-70" />}
              {t === "edit"     && <Wand2    className="w-3 h-3 inline-block mr-1.5 opacity-70" />}
              {t === "gallery"  && <Grid     className="w-3 h-3 inline-block mr-1.5 opacity-70" />}
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0">
        {tab === "generate" && <GenerateTab onEditImage={openInEditor} />}
        {tab === "edit"     && <EditTab initialImageUrl={editImageUrl} />}
        {tab === "gallery"  && <GalleryTab onEditImage={openInEditor} />}
      </div>
    </div>
  );
}

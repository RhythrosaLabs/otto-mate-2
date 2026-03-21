"use client";

import { useState, useRef, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Sparkles, Image as ImageIcon, Loader2, Download, Heart,
  RefreshCw, Copy, ChevronRight,
  ArrowLeft, Wand2, Settings2, Palette, Camera,
  Maximize2, X, Upload, Layers,
  Grid, Flame, Video, Paintbrush,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  saveMultipleToGallery,
  loadHistory,
  saveHistory,
  downloadFile,
  copyImageToClipboard,
} from "../../lib/gallery-store";
import { ModelSearchSelector } from "../../components/model-search-selector";

/* ─── Types ──────────────────────────────────────────────────────── */

interface GeneratedImage {
  id: string;
  url: string;
  width: number;
  height: number;
}

interface GenerationResult {
  id: string;
  prompt: string;
  originalPrompt: string;
  model: string;
  images: GeneratedImage[];
  settings: Record<string, unknown>;
  createdAt: string;
}

interface HistoryEntry {
  result: GenerationResult;
  prompt: string;
}

interface SettingsPanelProps {
  model: string; setModel: (v: string) => void;
  aspectRatio: string; setAspectRatio: (v: string) => void;
  contentType: string; setContentType: (v: string) => void;
  stylePreset: string; setStylePreset: (v: string) => void;
  visualIntensity: number; setVisualIntensity: (v: number) => void;
  negativePrompt: string; setNegativePrompt: (v: string) => void;
  lighting: string; setLighting: (v: string) => void;
  cameraAngle: string; setCameraAngle: (v: string) => void;
  numImages: number; setNumImages: (v: number) => void;
  quality: string; setQuality: (v: string) => void;
  seed: string; setSeed: (v: string) => void;
  showAdvanced: boolean; setShowAdvanced: (v: boolean) => void;
  structureImageUrl: string; setStructureImageUrl: (v: string) => void;
  structureStrength: number; setStructureStrength: (v: number) => void;
  styleImageUrl: string; setStyleImageUrl: (v: string) => void;
  styleRefStrength: number; setStyleRefStrength: (v: number) => void;
}

/* ─── Constants ─────────────────────────────────────────────────── */

const MODELS = [
  { id: "firefly-image-4", label: "Nova Image 4", description: "High quality, fast generation", tag: "Default" },
  { id: "firefly-image-4-ultra", label: "Nova Image 4 Ultra", description: "Single ultra-high quality image", tag: "Premium" },
  { id: "firefly-image-5", label: "Nova Image 5 (Preview)", description: "Latest model with enhanced detail", tag: "New" },
  { id: "flux-schnell", label: "FLUX Schnell", description: "Fast generation, good quality", tag: "Fast" },
  { id: "flux-pro", label: "FLUX 1.1 Pro", description: "Professional quality", tag: "Pro" },
  { id: "dall-e-3", label: "DALL-E 3", description: "OpenAI's latest image model", tag: "OpenAI" },
];

const ASPECT_RATIOS = [
  { id: "1:1", label: "1:1", desc: "Square", w: 1, h: 1 },
  { id: "16:9", label: "16:9", desc: "Landscape", w: 16, h: 9 },
  { id: "9:16", label: "9:16", desc: "Portrait", w: 9, h: 16 },
  { id: "4:3", label: "4:3", desc: "Standard", w: 4, h: 3 },
  { id: "3:4", label: "3:4", desc: "Portrait", w: 3, h: 4 },
  { id: "3:2", label: "3:2", desc: "Photo", w: 3, h: 2 },
  { id: "2:3", label: "2:3", desc: "Tall", w: 2, h: 3 },
  { id: "21:9", label: "21:9", desc: "Ultrawide", w: 21, h: 9 },
];

const CONTENT_TYPES = [
  { id: "auto", label: "Auto", icon: Sparkles },
  { id: "photo", label: "Photo", icon: Camera },
  { id: "art", label: "Art", icon: Palette },
  { id: "graphic", label: "Graphic", icon: Layers },
];

const STYLE_PRESETS = [
  { id: "none", label: "None" },
  { id: "cinematic", label: "Cinematic" },
  { id: "anime", label: "Anime" },
  { id: "digital-art", label: "Digital Art" },
  { id: "fantasy", label: "Fantasy" },
  { id: "neon-punk", label: "Neon Punk" },
  { id: "photographic", label: "Photographic" },
  { id: "comic-book", label: "Comic Book" },
  { id: "line-art", label: "Line Art" },
  { id: "watercolor", label: "Watercolor" },
  { id: "oil-painting", label: "Oil Painting" },
  { id: "3d-render", label: "3D Render" },
  { id: "pixel-art", label: "Pixel Art" },
  { id: "surrealism", label: "Surrealism" },
  { id: "pop-art", label: "Pop Art" },
  { id: "minimalist", label: "Minimalist" },
  { id: "impressionism", label: "Impressionism" },
  { id: "cubism", label: "Cubism" },
  { id: "art-deco", label: "Art Deco" },
  { id: "steampunk", label: "Steampunk" },
  { id: "vintage", label: "Vintage" },
  { id: "low-poly", label: "Low Poly" },
  { id: "isometric", label: "Isometric" },
  { id: "origami", label: "Origami" },
  { id: "stained-glass", label: "Stained Glass" },
];

const LIGHTING_PRESETS = [
  { id: "none", label: "None" },
  { id: "golden-hour", label: "Golden Hour" },
  { id: "dramatic", label: "Dramatic" },
  { id: "studio", label: "Studio" },
  { id: "neon", label: "Neon" },
  { id: "backlit", label: "Backlit" },
  { id: "natural", label: "Natural" },
  { id: "moody", label: "Moody" },
  { id: "high-key", label: "High Key" },
];

const CAMERA_ANGLES = [
  { id: "none", label: "None" },
  { id: "close-up", label: "Close-up" },
  { id: "wide-angle", label: "Wide Angle" },
  { id: "aerial", label: "Aerial" },
  { id: "low-angle", label: "Low Angle" },
  { id: "eye-level", label: "Eye Level" },
  { id: "dutch-angle", label: "Dutch Angle" },
  { id: "overhead", label: "Overhead" },
];

/* ─── Settings Panel ─────────────────────────────────────────────── */

function SettingsPanel({
  model, setModel,
  aspectRatio, setAspectRatio,
  contentType, setContentType,
  stylePreset, setStylePreset,
  visualIntensity, setVisualIntensity,
  negativePrompt, setNegativePrompt,
  lighting, setLighting,
  cameraAngle, setCameraAngle,
  numImages, setNumImages,
  quality, setQuality,
  seed, setSeed,
  showAdvanced, setShowAdvanced,
  structureImageUrl, setStructureImageUrl,
  structureStrength, setStructureStrength,
  styleImageUrl, setStyleImageUrl,
  styleRefStrength, setStyleRefStrength,
}: SettingsPanelProps) {

  return (
    <div className="space-y-5 text-sm">
      {/* General Settings Header */}
      <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium uppercase tracking-wider">
        <Settings2 className="w-3.5 h-3.5" />
        General Settings
      </div>

      {/* Model Selector — live search Replicate + HuggingFace */}
      <div className="space-y-2">
        <label className="text-xs text-zinc-400 font-medium">Model</label>
        <ModelSearchSelector
          category="image-generation"
          value={model}
          onChange={(id) => setModel(id)}
          accent="violet"
        />
      </div>

      {/* Aspect Ratio */}
      <div className="space-y-2">
        <label className="text-xs text-zinc-400 font-medium">Aspect Ratio</label>
        <div className="grid grid-cols-4 gap-1.5">
          {ASPECT_RATIOS.map((ar) => (
            <button
              key={ar.id}
              onClick={() => setAspectRatio(ar.id)}
              className={cn(
                "flex flex-col items-center gap-1 p-2 rounded-lg transition-all text-center",
                aspectRatio === ar.id
                  ? "bg-violet-600/20 border border-violet-500/30 text-violet-300"
                  : "bg-zinc-800/50 border border-zinc-700/30 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"
              )}
            >
              {/* Visual ratio indicator */}
              <div
                className={cn(
                  "rounded-sm border",
                  aspectRatio === ar.id ? "border-violet-400" : "border-zinc-600",
                )}
                style={{
                  width: `${Math.min(24, 24 * (ar.w / Math.max(ar.w, ar.h)))}px`,
                  height: `${Math.min(24, 24 * (ar.h / Math.max(ar.w, ar.h)))}px`,
                }}
              />
              <span className="text-[10px] font-medium">{ar.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content Type */}
      <div className="space-y-2">
        <label className="text-xs text-zinc-400 font-medium">Content Type</label>
        <div className="grid grid-cols-4 gap-1.5">
          {CONTENT_TYPES.map((ct) => {
            const Icon = ct.icon;
            return (
              <button
                key={ct.id}
                onClick={() => setContentType(ct.id)}
                className={cn(
                  "flex flex-col items-center gap-1.5 p-2.5 rounded-lg transition-all",
                  contentType === ct.id
                    ? "bg-violet-600/20 border border-violet-500/30 text-violet-300"
                    : "bg-zinc-800/50 border border-zinc-700/30 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="text-[10px] font-medium">{ct.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Visual Intensity */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-zinc-400 font-medium">Visual Intensity</label>
          <span className="text-xs text-zinc-500">{visualIntensity}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={visualIntensity}
          onChange={(e) => setVisualIntensity(Number(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-zinc-700 accent-violet-500"
        />
      </div>

      {/* Style Presets */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium uppercase tracking-wider">
          <Palette className="w-3.5 h-3.5" />
          Style
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STYLE_PRESETS.map((s) => (
            <button
              key={s.id}
              onClick={() => setStylePreset(s.id)}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs transition-all",
                stylePreset === s.id
                  ? "bg-violet-600/20 border border-violet-500/30 text-violet-300"
                  : "bg-zinc-800/50 border border-zinc-700/30 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Effects Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium uppercase tracking-wider">
          <Wand2 className="w-3.5 h-3.5" />
          Effects
        </div>

        {/* Lighting */}
        <div className="space-y-1.5">
          <label className="text-xs text-zinc-500">Lighting</label>
          <div className="flex flex-wrap gap-1.5">
            {LIGHTING_PRESETS.map((l) => (
              <button
                key={l.id}
                onClick={() => setLighting(l.id)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs transition-all",
                  lighting === l.id
                    ? "bg-amber-600/20 border border-amber-500/30 text-amber-300"
                    : "bg-zinc-800/50 border border-zinc-700/30 text-zinc-500 hover:text-zinc-300"
                )}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        {/* Camera Angle */}
        <div className="space-y-1.5">
          <label className="text-xs text-zinc-500">Camera Angle</label>
          <div className="flex flex-wrap gap-1.5">
            {CAMERA_ANGLES.map((c) => (
              <button
                key={c.id}
                onClick={() => setCameraAngle(c.id)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs transition-all",
                  cameraAngle === c.id
                    ? "bg-cyan-600/20 border border-cyan-500/30 text-cyan-300"
                    : "bg-zinc-800/50 border border-zinc-700/30 text-zinc-500 hover:text-zinc-300"
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Structure Reference (Composition) */}
      <div className="space-y-2">
        <label className="text-xs text-zinc-400 font-medium uppercase tracking-wider">Structure Reference</label>
        <p className="text-[10px] text-zinc-600">Upload an image to guide the composition layout.</p>
        {structureImageUrl ? (
          <div className="relative rounded-lg overflow-hidden border border-zinc-700">
            <img src={structureImageUrl} alt="Structure reference" className="w-full h-28 object-cover" />
            <button
              onClick={() => setStructureImageUrl("")}
              className="absolute top-2 right-2 p-1 rounded bg-black/60 text-white hover:bg-black/80 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
            <div className="p-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500">Strength</span>
                <span className="text-[10px] text-zinc-400">{structureStrength}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={structureStrength}
                onChange={(e) => setStructureStrength(Number(e.target.value))}
                className="w-full h-1 rounded-full appearance-none cursor-pointer bg-zinc-700 accent-violet-500"
              />
            </div>
          </div>
        ) : (
          <label className="w-full py-4 rounded-lg border border-dashed border-zinc-700 hover:border-violet-500/50 text-zinc-500 hover:text-violet-400 flex flex-col items-center gap-1.5 transition-all hover:bg-violet-600/5 cursor-pointer">
            <Upload className="w-4 h-4" />
            <span className="text-[10px]">Upload structure image</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => setStructureImageUrl(reader.result as string);
              reader.readAsDataURL(file);
            }} />
          </label>
        )}
      </div>

      {/* Style Reference */}
      <div className="space-y-2">
        <label className="text-xs text-zinc-400 font-medium uppercase tracking-wider">Style Reference</label>
        <p className="text-[10px] text-zinc-600">Upload an image whose visual style you want to match.</p>
        {styleImageUrl ? (
          <div className="relative rounded-lg overflow-hidden border border-zinc-700">
            <img src={styleImageUrl} alt="Style reference" className="w-full h-28 object-cover" />
            <button
              onClick={() => setStyleImageUrl("")}
              className="absolute top-2 right-2 p-1 rounded bg-black/60 text-white hover:bg-black/80 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
            <div className="p-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500">Strength</span>
                <span className="text-[10px] text-zinc-400">{styleRefStrength}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={styleRefStrength}
                onChange={(e) => setStyleRefStrength(Number(e.target.value))}
                className="w-full h-1 rounded-full appearance-none cursor-pointer bg-zinc-700 accent-violet-500"
              />
            </div>
          </div>
        ) : (
          <label className="w-full py-4 rounded-lg border border-dashed border-zinc-700 hover:border-violet-500/50 text-zinc-500 hover:text-violet-400 flex flex-col items-center gap-1.5 transition-all hover:bg-violet-600/5 cursor-pointer">
            <Upload className="w-4 h-4" />
            <span className="text-[10px]">Upload style image</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => setStyleImageUrl(reader.result as string);
              reader.readAsDataURL(file);
            }} />
          </label>
        )}
      </div>

      {/* Advanced Settings */}
      <div>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <ChevronRight className={cn("w-3.5 h-3.5 transition-transform", showAdvanced && "rotate-90")} />
          Advanced Settings
        </button>
        {showAdvanced && (
          <div className="mt-3 space-y-3 pl-2 border-l border-zinc-800">
            {/* Negative Prompt */}
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-400">Negative Prompt</label>
              <textarea
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                placeholder="What to avoid in the image..."
                className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-xs text-white placeholder:text-zinc-600 resize-none focus:outline-none focus:border-zinc-600 h-16"
              />
            </div>

            {/* Number of Images */}
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-400">Number of Images</label>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    onClick={() => setNumImages(n)}
                    className={cn(
                      "flex-1 py-1.5 rounded-lg text-xs font-medium transition-all",
                      numImages === n
                        ? "bg-violet-600/20 border border-violet-500/30 text-violet-300"
                        : "bg-zinc-800/50 border border-zinc-700/30 text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Quality */}
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-400">Quality</label>
              <div className="flex gap-1.5">
                {(["standard", "hd"] as const).map((q) => (
                  <button
                    key={q}
                    onClick={() => setQuality(q)}
                    className={cn(
                      "flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition-all",
                      quality === q
                        ? "bg-violet-600/20 border border-violet-500/30 text-violet-300"
                        : "bg-zinc-800/50 border border-zinc-700/30 text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    {q === "hd" ? "HD" : "Standard"}
                  </button>
                ))}
              </div>
            </div>

            {/* Seed */}
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-400">Seed (optional)</label>
              <input
                type="text"
                value={seed}
                onChange={(e) => setSeed(e.target.value.replace(/\D/g, ""))}
                placeholder="Random"
                className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Image Grid ─────────────────────────────────────────────────── */

function ImageResultGrid({
  images,
  selectedIndex,
  onSelect,
  aspectRatio,
}: {
  images: GeneratedImage[];
  selectedIndex: number;
  onSelect: (i: number) => void;
  aspectRatio: string;
}) {
  if (images.length === 0) return null;

  const ar = ASPECT_RATIOS.find(a => a.id === aspectRatio) || ASPECT_RATIOS[0];
  const ratio = ar.w / ar.h;
  const gridCols = images.length === 1 ? "grid-cols-1" : images.length === 2 ? "grid-cols-2" : "grid-cols-2";

  return (
    <div className={cn("grid gap-3", gridCols)}>
      {images.map((img, i) => (
        <button
          key={img.id}
          onClick={() => onSelect(i)}
          className={cn(
            "relative rounded-xl overflow-hidden border-2 transition-all group",
            selectedIndex === i
              ? "border-violet-500 shadow-lg shadow-violet-500/10"
              : "border-transparent hover:border-zinc-600"
          )}
        >
          <div style={{ paddingBottom: `${(1 / ratio) * 100}%` }} className="relative">
            <img
              src={img.url}
              alt={`Generation ${i + 1}`}
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>
          {/* Hover overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-end justify-center opacity-0 group-hover:opacity-100">
            <div className="flex items-center gap-1 mb-3">
              <span className="px-2 py-1 bg-black/60 rounded text-[10px] text-white backdrop-blur-sm">
                {i + 1} / {images.length}
              </span>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

/* ─── Image Actions Toolbar ──────────────────────────────────────── */

function ImageActions({ image, prompt }: { image: GeneratedImage; prompt: string }) {
  const [downloading, setDownloading] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    const ok = await downloadFile(image.url, `nova-${image.id}.png`);
    if (!ok) console.warn("Download failed");
    setDownloading(false);
  }

  async function handleCopy() {
    const ok = await copyImageToClipboard(image.url);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleFavorite() {
    setFavorited(!favorited);
    // Also save to gallery as a favorite
    if (!favorited) {
      saveMultipleToGallery([{
        type: "image",
        url: image.url,
        prompt,
        model: "firefly",
        metadata: { width: image.width, height: image.height },
      }]);
    }
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <button
        onClick={handleFavorite}
        className={cn(
          "px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all",
          favorited
            ? "bg-red-600/20 text-red-400 border border-red-500/30"
            : "bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700"
        )}
      >
        <Heart className={cn("w-3.5 h-3.5", favorited && "fill-red-400")} />
        {favorited ? "Saved" : "Favorite"}
      </button>
      <button
        onClick={handleDownload}
        disabled={downloading}
        className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700 transition-colors"
      >
        {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
        Download
      </button>
      <button
        onClick={handleCopy}
        className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700 transition-colors"
      >
        <Copy className="w-3.5 h-3.5" />
        {copied ? "Copied!" : "Copy"}
      </button>
      <Link
        href={`/computer/firefly/edit?imageUrl=${encodeURIComponent(image.url)}`}
        className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700 transition-colors"
      >
        <Wand2 className="w-3.5 h-3.5" />
        Edit
      </Link>
      <Link
        href={`/computer/firefly/edit?imageUrl=${encodeURIComponent(image.url)}&action=generative-fill`}
        className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700 transition-colors"
      >
        <Paintbrush className="w-3.5 h-3.5" />
        Gen Fill
      </Link>
      <Link
        href={`/computer/firefly/generate/video?imageUrl=${encodeURIComponent(image.url)}`}
        className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700 transition-colors"
      >
        <Video className="w-3.5 h-3.5" />
        To Video
      </Link>
    </div>
  );
}

/* ─── Main Component ──────────────────────────────────────────────── */

export function GenerateImageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialPrompt = searchParams.get("prompt") || "";

  // State
  const [prompt, setPrompt] = useState(initialPrompt);
  const [model, setModel] = useState("firefly-image-4");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [contentType, setContentType] = useState("auto");
  const [stylePreset, setStylePreset] = useState("none");
  const [visualIntensity, setVisualIntensity] = useState(50);
  const [negativePrompt, setNegativePrompt] = useState("");
  const [lighting, setLighting] = useState("none");
  const [cameraAngle, setCameraAngle] = useState("none");
  const [numImages, setNumImages] = useState(4);
  const [quality, setQuality] = useState("standard");
  const [seed, setSeed] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [structureImageUrl, setStructureImageUrl] = useState("");
  const [structureStrength, setStructureStrength] = useState(50);
  const [styleImageUrl, setStyleImageUrl] = useState("");
  const [styleRefStrength, setStyleRefStrength] = useState(50);

  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory<HistoryEntry>("image-gen"));
  const [showHistory, setShowHistory] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "single">("grid");

  const promptRef = useRef<HTMLTextAreaElement>(null);

  // Auto-generate if prompt came from URL
  useEffect(() => {
    if (initialPrompt && !result && !generating) {
      handleGenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleGenerate() {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    setError("");
    setSelectedImageIndex(0);

    try {
      const res = await fetch("/api/firefly/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          negativePrompt: negativePrompt || undefined,
          model,
          aspectRatio,
          contentType,
          stylePreset,
          visualIntensity,
          numImages,
          quality,
          seed: seed ? parseInt(seed, 10) : undefined,
          structureImageUrl: structureImageUrl || undefined,
          structureStrength,
          styleImageUrl: styleImageUrl || undefined,
          styleStrength: styleRefStrength,
          effects: {
            lighting,
            cameraAngle,
          },
        }),
      });

      const data = await res.json() as Record<string, any>;
      if (!res.ok) {
        setError(data.error || "Generation failed");
        return;
      }

      const gen = data as GenerationResult;
      setResult(gen);

      // Save to gallery
      saveMultipleToGallery(
        gen.images.map(img => ({
          type: "image" as const,
          url: img.url,
          prompt: gen.prompt,
          model: gen.model,
          metadata: { width: img.width, height: img.height, aspectRatio },
        }))
      );

      // Save to persistent history
      const newHistory = [{ result: gen, prompt: prompt.trim() }, ...history].slice(0, 50);
      setHistory(newHistory);
      saveHistory("image-gen", newHistory);
    } catch (err) {
      setError((err as Error).message || "Network error");
    } finally {
      setGenerating(false);
    }
  }

  function handleLoadHistory(entry: HistoryEntry) {
    setResult(entry.result);
    setPrompt(entry.prompt);
    setShowHistory(false);
  }

  const selectedImage = result?.images?.[selectedImageIndex];

  return (
    <div className="h-full flex bg-[#0a0a0a] text-white">
      {/* Settings Sidebar */}
      <div
        className={cn(
          "h-full border-r border-zinc-800 bg-[#0a0a0a] flex flex-col transition-all duration-300 shrink-0",
          sidebarOpen ? "w-80" : "w-0 overflow-hidden"
        )}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <Link href="/computer/firefly" className="text-zinc-500 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-gradient-to-br from-violet-600 to-orange-500 flex items-center justify-center">
                <Flame className="w-3 h-3 text-white" />
              </div>
              <span className="text-sm font-semibold">Generate Image</span>
            </div>
          </div>
        </div>

        {/* Scrollable Settings */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <SettingsPanel
            model={model} setModel={setModel}
            aspectRatio={aspectRatio} setAspectRatio={setAspectRatio}
            contentType={contentType} setContentType={setContentType}
            stylePreset={stylePreset} setStylePreset={setStylePreset}
            visualIntensity={visualIntensity} setVisualIntensity={setVisualIntensity}
            negativePrompt={negativePrompt} setNegativePrompt={setNegativePrompt}
            lighting={lighting} setLighting={setLighting}
            cameraAngle={cameraAngle} setCameraAngle={setCameraAngle}
            numImages={numImages} setNumImages={setNumImages}
            quality={quality} setQuality={setQuality}
            seed={seed} setSeed={setSeed}
            showAdvanced={showAdvanced} setShowAdvanced={setShowAdvanced}
            structureImageUrl={structureImageUrl} setStructureImageUrl={setStructureImageUrl}
            structureStrength={structureStrength} setStructureStrength={setStructureStrength}
            styleImageUrl={styleImageUrl} setStyleImageUrl={setStyleImageUrl}
            styleRefStrength={styleRefStrength} setStyleRefStrength={setStyleRefStrength}
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors mr-1"
              >
                <Settings2 className="w-4 h-4" />
              </button>
            )}
            {sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <span className="text-xs text-zinc-500">
              {result ? `${result.images.length} image${result.images.length > 1 ? "s" : ""} generated` : "Ready to generate"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setViewMode(viewMode === "grid" ? "single" : "grid")}
              className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors"
              title={viewMode === "grid" ? "Single view" : "Grid view"}
            >
              {viewMode === "grid" ? <Maximize2 className="w-4 h-4" /> : <Grid className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={cn(
                "p-1.5 rounded-lg transition-colors",
                showHistory ? "bg-zinc-700 text-white" : "hover:bg-zinc-800 text-zinc-500 hover:text-white"
              )}
              title="History"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Canvas Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* History Panel */}
          {showHistory && history.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-medium text-zinc-400 mb-3">Generation History</h3>
              <div className="grid grid-cols-4 gap-2">
                {history.map((entry, i) => (
                  <button
                    key={i}
                    onClick={() => handleLoadHistory(entry)}
                    className="group rounded-lg overflow-hidden border border-zinc-800 hover:border-zinc-600 transition-all"
                  >
                    {entry.result.images[0] && (
                      <img
                        src={entry.result.images[0].url}
                        alt={entry.prompt}
                        className="w-full aspect-square object-cover"
                      />
                    )}
                    <div className="p-1.5">
                      <p className="text-[10px] text-zinc-500 truncate">{entry.prompt}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-4 p-4 rounded-xl bg-red-600/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Loading State */}
          {generating && (
            <div className="flex flex-col items-center justify-center py-32">
              <div className="relative mb-6">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600/20 to-blue-600/20 flex items-center justify-center animate-pulse">
                  <Sparkles className="w-8 h-8 text-violet-400" />
                </div>
                <Loader2 className="absolute -right-1 -bottom-1 w-6 h-6 text-violet-400 animate-spin" />
              </div>
              <p className="text-sm text-zinc-400 mb-1">Generating your images...</p>
              <p className="text-xs text-zinc-600">This may take 10-30 seconds</p>
            </div>
          )}

          {/* Results */}
          {!generating && result && (
            <div className="max-w-4xl mx-auto">
              {viewMode === "grid" ? (
                <ImageResultGrid
                  images={result.images}
                  selectedIndex={selectedImageIndex}
                  onSelect={setSelectedImageIndex}
                  aspectRatio={aspectRatio}
                />
              ) : selectedImage ? (
                <div className="flex justify-center">
                  <img
                    src={selectedImage.url}
                    alt={result.prompt}
                    className="max-w-full max-h-[70vh] object-contain rounded-xl shadow-2xl"
                  />
                </div>
              ) : null}

              {/* Image Selection Strip (grid mode) */}
              {viewMode === "single" && result.images.length > 1 && (
                <div className="flex justify-center gap-2 mt-4">
                  {result.images.map((img, i) => (
                    <button
                      key={img.id}
                      onClick={() => setSelectedImageIndex(i)}
                      className={cn(
                        "w-16 h-16 rounded-lg overflow-hidden border-2 transition-all",
                        selectedImageIndex === i ? "border-violet-500" : "border-transparent opacity-50 hover:opacity-100"
                      )}
                    >
                      <img src={img.url} alt={`Variant ${i + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}

              {/* Actions */}
              {selectedImage && (
                <div className="mt-4">
                  <ImageActions image={selectedImage} prompt={result.prompt} />
                </div>
              )}

              {/* Generation info */}
              <div className="mt-4 flex items-center gap-3 text-xs text-zinc-600">
                <span>Model: {result.model}</span>
                <span>|</span>
                <span>{result.images.length} image{result.images.length > 1 ? "s" : ""}</span>
                <span>|</span>
                <span>{new Date(result.createdAt).toLocaleTimeString()}</span>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!generating && !result && (
            <div className="flex flex-col items-center justify-center py-32 text-center">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-600/10 to-blue-600/10 flex items-center justify-center mb-6">
                <ImageIcon className="w-10 h-10 text-zinc-600" />
              </div>
              <h3 className="text-lg font-semibold text-zinc-400 mb-2">Generate Images with AI</h3>
              <p className="text-sm text-zinc-600 max-w-md">
                Type a detailed description in the prompt below. Use the settings panel to control style, aspect ratio, lighting, and more.
              </p>
            </div>
          )}
        </div>

        {/* Prompt Input Bar — Bottom */}
        <div className="border-t border-zinc-800 p-4 bg-[#0a0a0a] shrink-0">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <textarea
                  ref={promptRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleGenerate();
                    }
                  }}
                  placeholder="Describe the image you want to generate (e.g., 'a product shot of a sushi roll underwater')..."
                  className="w-full bg-zinc-900/80 border border-zinc-700/50 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 resize-none focus:outline-none focus:border-violet-500/50 min-h-[52px] max-h-32"
                  rows={1}
                />
              </div>
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim() || generating}
                className={cn(
                  "px-6 py-3 rounded-xl text-sm font-medium flex items-center gap-2 transition-all shrink-0",
                  prompt.trim() && !generating
                    ? "bg-gradient-to-r from-violet-600 to-blue-600 text-white hover:from-violet-500 hover:to-blue-500 shadow-lg shadow-violet-500/20"
                    : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                )}
              >
                {generating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {generating ? "Generating..." : "Generate"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

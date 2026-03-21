"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Upload, Wand2, Eraser, Expand, ZoomIn, Paintbrush,
  Loader2, Download, Undo2, RotateCcw,
  Type, Layers, Scissors,
  Flame, Sparkles, X, Check,
  Brush, MousePointer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ModelSearchSelector, ModelCategory } from "../components/model-search-selector";
import {
  saveToGallery,
} from "../lib/gallery-store";

/* ─── Types ──────────────────────────────────────────────────────── */

type EditMode = "select" | "brush" | "eraser" | "expand" | "prompt-edit";
type Operation = "generative-fill" | "remove" | "replace-background" | "expand" | "upscale" | "remove-bg" | "prompt-edit";

interface EditHistoryEntry {
  imageUrl: string;
  operation: string;
  prompt?: string;
}

/* ─── Tools Definition ───────────────────────────────────────────── */

const TOOLS = [
  { id: "select" as EditMode, label: "Select", icon: MousePointer, shortcut: "V" },
  { id: "brush" as EditMode, label: "Brush", icon: Brush, shortcut: "B" },
  { id: "eraser" as EditMode, label: "Erase", icon: Eraser, shortcut: "E" },
  { id: "expand" as EditMode, label: "Expand", icon: Expand, shortcut: "X" },
  { id: "prompt-edit" as EditMode, label: "Prompt Edit", icon: Type, shortcut: "T" },
];

const OPERATIONS: { id: Operation; label: string; icon: typeof Wand2; description: string }[] = [
  { id: "generative-fill", label: "Generative Fill", icon: Paintbrush, description: "Add or replace objects in selected area" },
  { id: "remove", label: "Remove Object", icon: Eraser, description: "Remove unwanted objects seamlessly" },
  { id: "replace-background", label: "Replace Background", icon: Layers, description: "Replace the background of your image" },
  { id: "expand", label: "Generative Expand", icon: Expand, description: "Expand the canvas and fill with AI" },
  { id: "upscale", label: "Upscale", icon: ZoomIn, description: "Enhance image resolution 2x or 4x" },
  { id: "remove-bg", label: "Remove Background", icon: Scissors, description: "Remove background entirely" },
  { id: "prompt-edit", label: "Prompt to Edit", icon: Wand2, description: "Describe your edit in plain language" },
];

const EXPAND_RATIOS = [
  { id: "16:9", label: "16:9" },
  { id: "9:16", label: "9:16" },
  { id: "4:3", label: "4:3" },
  { id: "3:4", label: "3:4" },
  { id: "1:1", label: "1:1" },
  { id: "freeform", label: "Freeform" },
];

/* ─── Canvas Component ───────────────────────────────────────────── */

function MaskCanvas({
  imageUrl,
  brushSize,
  isDrawing,
  onMaskGenerated,
  tool,
}: {
  imageUrl: string;
  brushSize: number;
  isDrawing: boolean;
  onMaskGenerated: (maskDataUrl: string) => void;
  tool: EditMode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [imgDimensions, setImgDimensions] = useState({ w: 0, h: 0 });
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const maxW = 800;
      const maxH = 600;
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      setImgDimensions({ w, h });

      // Draw image
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
        }
      }

      // Initialize mask canvas
      const maskCanvas = maskCanvasRef.current;
      if (maskCanvas) {
        maskCanvas.width = w;
        maskCanvas.height = h;
        const ctx = maskCanvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "black";
          ctx.fillRect(0, 0, w, h);
        }
      }
    };
    img.src = imageUrl;
  }, [imageUrl]);

  const getPos = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const drawOnMask = useCallback((x: number, y: number) => {
    const maskCanvas = maskCanvasRef.current;
    const displayCanvas = canvasRef.current;
    if (!maskCanvas || !displayCanvas) return;
    
    const maskCtx = maskCanvas.getContext("2d");
    const displayCtx = displayCanvas.getContext("2d");
    if (!maskCtx || !displayCtx) return;

    const isErasing = tool === "eraser";

    // Draw on mask
    maskCtx.globalCompositeOperation = "source-over";
    maskCtx.fillStyle = isErasing ? "black" : "white";
    maskCtx.beginPath();
    maskCtx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    maskCtx.fill();

    // Draw line from last point
    if (lastPointRef.current) {
      maskCtx.strokeStyle = isErasing ? "black" : "white";
      maskCtx.lineWidth = brushSize;
      maskCtx.lineCap = "round";
      maskCtx.beginPath();
      maskCtx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
      maskCtx.lineTo(x, y);
      maskCtx.stroke();
    }

    // Show visual feedback on display canvas
    displayCtx.globalCompositeOperation = "source-over";
    displayCtx.fillStyle = isErasing ? "rgba(0,0,0,0.3)" : "rgba(147, 51, 234, 0.3)";
    displayCtx.beginPath();
    displayCtx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    displayCtx.fill();

    lastPointRef.current = { x, y };
  }, [brushSize, tool]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (tool !== "brush" && tool !== "eraser") return;
    setDrawing(true);
    const { x, y } = getPos(e);
    lastPointRef.current = null;
    drawOnMask(x, y);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!drawing) return;
    const { x, y } = getPos(e);
    drawOnMask(x, y);
  };

  const handleMouseUp = () => {
    setDrawing(false);
    lastPointRef.current = null;
    // Export mask
    const maskCanvas = maskCanvasRef.current;
    if (maskCanvas) {
      onMaskGenerated(maskCanvas.toDataURL("image/png"));
    }
  };

  const clearMask = () => {
    const maskCanvas = maskCanvasRef.current;
    if (maskCanvas) {
      const ctx = maskCanvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
      }
    }
    // Redraw image
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        }
      }
    };
    img.src = imageUrl;
  };

  return (
    <div className="relative inline-block">
      <canvas
        ref={canvasRef}
        className={cn(
          "rounded-xl shadow-2xl max-w-full",
          (tool === "brush" || tool === "eraser") ? "cursor-crosshair" : "cursor-default"
        )}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ maxWidth: "100%", maxHeight: "70vh" }}
      />
      <canvas ref={maskCanvasRef} className="hidden" />
      {(tool === "brush" || tool === "eraser") && (
        <button
          onClick={clearMask}
          className="absolute top-3 right-3 px-2 py-1 rounded-lg bg-black/60 backdrop-blur-sm text-xs text-white hover:bg-black/80 transition-colors flex items-center gap-1"
        >
          <RotateCcw className="w-3 h-3" />
          Clear Mask
        </button>
      )}
    </div>
  );
}

/* ─── Main Component ──────────────────────────────────────────────── */

export function ImageEditorClient() {
  const searchParams = useSearchParams();
  const initialImageUrl = searchParams.get("imageUrl") || "";
  const initialAction = searchParams.get("action") as Operation | null;

  const [imageUrl, setImageUrl] = useState(initialImageUrl);
  const [maskDataUrl, setMaskDataUrl] = useState<string | null>(null);
  const [operation, setOperation] = useState<Operation>(initialAction || "prompt-edit");
  const [tool, setTool] = useState<EditMode>(initialAction === "expand" ? "expand" : "brush");
  const [prompt, setPrompt] = useState("");
  const [brushSize, setBrushSize] = useState(30);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [history, setHistory] = useState<EditHistoryEntry[]>([]);
  const [expandRatio, setExpandRatio] = useState("16:9");
  const [expandDirection, setExpandDirection] = useState<"all" | "left" | "right" | "up" | "down">("all");
  const [upscaleFactor, setUpscaleFactor] = useState(2);
  const [showOperations, setShowOperations] = useState(!initialImageUrl);
  const [editModel, setEditModel] = useState("");

  const operationToCategory: Record<Operation, ModelCategory> = {
    "generative-fill": "inpainting",
    "remove": "inpainting",
    "replace-background": "background-removal",
    "expand": "outpainting",
    "upscale": "image-upscale",
    "remove-bg": "background-removal",
    "prompt-edit": "image-editing",
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file (JPEG, PNG, or WebP)");
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setError("File must be under 100MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageUrl(reader.result as string);
      setResultUrl(null);
      setError("");
      setShowOperations(false);
    };
    reader.readAsDataURL(file);
  }

  async function handleApplyEdit() {
    if (!imageUrl || processing) return;

    // For prompt-edit, need a prompt
    if (operation === "prompt-edit" && !prompt.trim()) {
      setError("Please describe what you want to change");
      return;
    }

    // For generative-fill, need a mask
    if ((operation === "generative-fill" || operation === "remove") && !maskDataUrl) {
      setError("Please brush over the area you want to edit");
      return;
    }

    setProcessing(true);
    setError("");

    try {
      const body: Record<string, unknown> = {
        imageUrl,
        operation,
        prompt: prompt || undefined,
        model: editModel || undefined,
      };

      if (maskDataUrl && (operation === "generative-fill" || operation === "remove" || operation === "replace-background")) {
        body.maskUrl = maskDataUrl;
      }

      if (operation === "expand") {
        body.expandDirection = expandDirection;
        body.expandRatio = expandRatio;
      }

      if (operation === "upscale") {
        body.upscaleFactor = upscaleFactor;
      }

      const res = await fetch("/api/firefly/edit-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json() as Record<string, any>;
      if (!res.ok) {
        setError(data.error || "Edit failed");
        return;
      }

      if (data.result?.url) {
        setResultUrl(data.result.url);
        setHistory(prev => [{
          imageUrl: resultUrl || imageUrl,
          operation,
          prompt: prompt || undefined,
        }, ...prev].slice(0, 20));

        // Save to gallery
        saveToGallery({
          type: "image",
          url: data.result.url,
          prompt: `${operation}: ${prompt || "no prompt"}`,
          model: editModel || "default",
          metadata: { operation },
        });
      }
    } catch (err) {
      setError((err as Error).message || "Network error");
    } finally {
      setProcessing(false);
    }
  }

  function applyResult() {
    if (resultUrl) {
      setImageUrl(resultUrl);
      setResultUrl(null);
      setMaskDataUrl(null);
    }
  }

  function undoToOriginal() {
    if (history.length > 0) {
      setImageUrl(history[0].imageUrl);
      setHistory(prev => prev.slice(1));
      setResultUrl(null);
    }
  }

  async function downloadResult() {
    const url = resultUrl || imageUrl;
    if (!url) return;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = dlUrl;
      a.download = `nova-edit-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(dlUrl);
    } catch { /* ignore */ }
  }

  const displayUrl = resultUrl || imageUrl;

  return (
    <div className="h-full flex bg-[#0a0a0a] text-white">
      {/* Left Sidebar — Tools */}
      <div className="w-14 border-r border-zinc-800 flex flex-col items-center py-3 gap-1 shrink-0">
        <Link href="/computer/firefly" className="p-2 mb-2 text-zinc-500 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        {TOOLS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center transition-all group relative",
                tool === t.id
                  ? "bg-violet-600/20 text-violet-400"
                  : "text-zinc-500 hover:text-white hover:bg-zinc-800"
              )}
              title={`${t.label} (${t.shortcut})`}
            >
              <Icon className="w-4 h-4" />
            </button>
          );
        })}
        <div className="flex-1" />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-10 h-10 rounded-lg flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
          title="Upload Image"
        >
          <Upload className="w-4 h-4" />
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
      </div>

      {/* Right Sidebar — Operations & Settings */}
      <div className="w-72 border-r border-zinc-800 flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-gradient-to-br from-violet-600 to-orange-500 flex items-center justify-center">
              <Flame className="w-3 h-3 text-white" />
            </div>
            <span className="text-sm font-semibold">Image Editor</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Operation Selector */}
          <div className="space-y-2">
            <label className="text-xs text-zinc-400 font-medium uppercase tracking-wider">Operation</label>
            <div className="space-y-1">
              {OPERATIONS.map((op) => {
                const Icon = op.icon;
                return (
                  <button
                    key={op.id}
                    onClick={() => {
                      setOperation(op.id);
                      setEditModel(""); // reset model on operation change
                      if (op.id === "expand") setTool("expand");
                      else if (op.id === "prompt-edit") setTool("prompt-edit");
                      else setTool("brush");
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all",
                      operation === op.id
                        ? "bg-violet-600/15 border border-violet-500/30 text-violet-300"
                        : "bg-zinc-800/30 border border-zinc-800/50 text-zinc-400 hover:text-white hover:border-zinc-700"
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <div>
                      <div className="text-xs font-medium">{op.label}</div>
                      <div className="text-[10px] text-zinc-600 mt-0.5">{op.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Model Override (optional) */}
          <div className="space-y-2">
            <label className="text-xs text-zinc-400 font-medium">Model (optional)</label>
            <ModelSearchSelector
              category={operationToCategory[operation]}
              value={editModel}
              onChange={(id) => setEditModel(id)}
              accent="violet"
              compact
            />
            <p className="text-[10px] text-zinc-600">Leave empty for default model</p>
          </div>
          {(operation === "generative-fill" || operation === "remove" || operation === "replace-background") && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-zinc-400 font-medium">Brush Size</label>
                <span className="text-xs text-zinc-500">{brushSize}px</span>
              </div>
              <input
                type="range"
                min={5}
                max={100}
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-zinc-700 accent-violet-500"
              />
            </div>
          )}

          {/* Expand Settings */}
          {operation === "expand" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400 font-medium">Direction</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(["all", "left", "right", "up", "down"] as const).map((dir) => (
                    <button
                      key={dir}
                      onClick={() => setExpandDirection(dir)}
                      className={cn(
                        "px-2 py-1.5 rounded-lg text-xs capitalize transition-all",
                        expandDirection === dir
                          ? "bg-violet-600/20 border border-violet-500/30 text-violet-300"
                          : "bg-zinc-800/50 border border-zinc-700/30 text-zinc-500 hover:text-zinc-300"
                      )}
                    >
                      {dir}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400 font-medium">Target Ratio</label>
                <div className="flex flex-wrap gap-1.5">
                  {EXPAND_RATIOS.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setExpandRatio(r.id)}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs transition-all",
                        expandRatio === r.id
                          ? "bg-violet-600/20 border border-violet-500/30 text-violet-300"
                          : "bg-zinc-800/50 border border-zinc-700/30 text-zinc-500 hover:text-zinc-300"
                      )}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Upscale Settings */}
          {operation === "upscale" && (
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-400 font-medium">Scale Factor</label>
              <div className="flex gap-1.5">
                {[2, 4].map((f) => (
                  <button
                    key={f}
                    onClick={() => setUpscaleFactor(f)}
                    className={cn(
                      "flex-1 py-2 rounded-lg text-sm font-medium transition-all",
                      upscaleFactor === f
                        ? "bg-violet-600/20 border border-violet-500/30 text-violet-300"
                        : "bg-zinc-800/50 border border-zinc-700/30 text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    {f}x
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Prompt Input */}
          <div className="space-y-2">
            <label className="text-xs text-zinc-400 font-medium">
              {operation === "prompt-edit" ? "Describe your edit" : "Prompt (optional)"}
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                operation === "prompt-edit"
                  ? "e.g., 'Replace the background with a sunset beach'"
                  : operation === "generative-fill"
                  ? "e.g., 'Add a red flower'"
                  : operation === "replace-background"
                  ? "e.g., 'Professional studio with soft lighting'"
                  : "Describe what to generate..."
              }
              className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2.5 text-xs text-white placeholder:text-zinc-600 resize-none focus:outline-none focus:border-violet-500/50 h-20"
            />
          </div>
        </div>

        {/* Apply Button */}
        <div className="px-4 py-4 border-t border-zinc-800">
          {error && (
            <div className="mb-3 p-2 rounded-lg bg-red-600/10 border border-red-500/20 text-red-400 text-xs">
              {error}
            </div>
          )}
          <button
            onClick={handleApplyEdit}
            disabled={!imageUrl || processing}
            className={cn(
              "w-full py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all",
              imageUrl && !processing
                ? "bg-gradient-to-r from-violet-600 to-blue-600 text-white hover:from-violet-500 hover:to-blue-500"
                : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
            )}
          >
            {processing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {processing ? "Processing..." : "Apply Edit"}
          </button>
          {resultUrl && (
            <div className="flex gap-2 mt-2">
              <button
                onClick={applyResult}
                className="flex-1 py-2 rounded-lg text-xs font-medium bg-green-600/20 text-green-400 border border-green-500/30 hover:bg-green-600/30 transition-colors flex items-center justify-center gap-1"
              >
                <Check className="w-3 h-3" />
                Accept
              </button>
              <button
                onClick={() => setResultUrl(null)}
                className="flex-1 py-2 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-400 border border-zinc-700 hover:text-white transition-colors flex items-center justify-center gap-1"
              >
                <X className="w-3 h-3" />
                Discard
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Canvas Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={undoToOriginal} disabled={history.length === 0} className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 disabled:opacity-30 transition-colors">
              <Undo2 className="w-4 h-4" />
            </button>
            <span className="text-xs text-zinc-600">|</span>
            <span className="text-xs text-zinc-500">
              {operation === "generative-fill" ? "Paint over the area to fill" :
               operation === "remove" ? "Paint over the object to remove" :
               operation === "replace-background" ? "Paint over the background" :
               operation === "expand" ? "Choose direction and ratio" :
               operation === "upscale" ? "Choose scale factor" :
               operation === "remove-bg" ? "Click Apply to remove background" :
               "Describe your edit in the prompt"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={downloadResult} className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors">
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 flex items-center justify-center p-8 overflow-auto bg-[#0a0a0a]">
          {!imageUrl ? (
            /* Upload State */
            <div className="flex flex-col items-center justify-center text-center">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="group w-80 h-64 rounded-2xl border-2 border-dashed border-zinc-700 hover:border-violet-500/50 flex flex-col items-center justify-center gap-4 transition-all hover:bg-violet-600/5 cursor-pointer"
              >
                <div className="w-16 h-16 rounded-2xl bg-zinc-800 group-hover:bg-violet-600/20 flex items-center justify-center transition-colors">
                  <Upload className="w-8 h-8 text-zinc-500 group-hover:text-violet-400 transition-colors" />
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-400 group-hover:text-white transition-colors">
                    Upload your image
                  </p>
                  <p className="text-xs text-zinc-600 mt-1">
                    JPEG, PNG, or WebP — up to 100MB
                  </p>
                </div>
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              {/* Result comparison */}
              {resultUrl ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="flex gap-4 items-start">
                    <div className="text-center">
                      <p className="text-xs text-zinc-500 mb-2">Original</p>
                      <img
                        src={imageUrl}
                        alt="Original"
                        className="max-w-[380px] max-h-[50vh] object-contain rounded-xl border border-zinc-800"
                      />
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-violet-400 mb-2">Result</p>
                      <img
                        src={resultUrl}
                        alt="Result"
                        className="max-w-[380px] max-h-[50vh] object-contain rounded-xl border border-violet-500/30 shadow-lg shadow-violet-500/10"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                /* Editable canvas */
                <MaskCanvas
                  imageUrl={imageUrl}
                  brushSize={brushSize}
                  isDrawing={tool === "brush" || tool === "eraser"}
                  onMaskGenerated={setMaskDataUrl}
                  tool={tool}
                />
              )}

              {processing && (
                <div className="flex items-center gap-2 text-sm text-zinc-400">
                  <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
                  Processing edit...
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

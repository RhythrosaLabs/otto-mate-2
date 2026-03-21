"use client";

import { useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Video, Loader2, Download, Play, Pause,
  Upload, Sparkles, Film,
  Volume2, VolumeX, Settings2,
  Monitor, Smartphone, Square, RotateCcw,
  Move, ZoomIn, ZoomOut, CornerUpLeft, CornerUpRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ModelSearchSelector } from "../../components/model-search-selector";
import {
  saveToGallery,
  loadHistory,
  saveHistory,
  downloadFile,
} from "../../lib/gallery-store";

/* ─── Types & Constants ─────────────────────────────────────────── */

interface VideoResult {
  id: string;
  model: string;
  prompt: string;
  video: {
    url: string;
    duration: number;
    aspectRatio: string;
  };
  createdAt: string;
}

const ASPECT_RATIOS = [
  { id: "16:9", label: "16:9", desc: "Landscape", icon: Monitor },
  { id: "9:16", label: "9:16", desc: "Portrait", icon: Smartphone },
  { id: "1:1", label: "1:1", desc: "Square", icon: Square },
];

const DURATIONS = [
  { value: 4, label: "4s" },
  { value: 5, label: "5s" },
  { value: 10, label: "10s" },
];

const CAMERA_MOTIONS = [
  { id: "none", label: "None", icon: Move },
  { id: "pan-left", label: "Pan Left", icon: CornerUpLeft },
  { id: "pan-right", label: "Pan Right", icon: CornerUpRight },
  { id: "zoom-in", label: "Zoom In", icon: ZoomIn },
  { id: "zoom-out", label: "Zoom Out", icon: ZoomOut },
  { id: "orbit", label: "Orbit", icon: RotateCcw },
];

/* ─── Component ──────────────────────────────────────────────────── */

export function GenerateVideoClient() {
  const searchParams = useSearchParams();
  const initialPrompt = searchParams.get("prompt") || "";
  const initialImageUrl = searchParams.get("imageUrl") || "";

  const [prompt, setPrompt] = useState(initialPrompt);
  const [model, setModel] = useState("minimax/video-01");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [duration, setDuration] = useState(5);
  const [cameraMotion, setCameraMotion] = useState("none");
  const [imageUrl, setImageUrl] = useState(initialImageUrl);
  const [motionIntensity, setMotionIntensity] = useState(50);

  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<VideoResult | null>(null);
  const [error, setError] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [history, setHistory] = useState<VideoResult[]>(() => loadHistory<VideoResult>("video-gen"));
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleGenerate() {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    setError("");

    try {
      const res = await fetch("/api/firefly/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          model,
          duration,
          aspectRatio,
          imageUrl: imageUrl || undefined,
          motionIntensity,
          cameraMotion,
        }),
      });

      const data = await res.json() as Record<string, any>;
      if (!res.ok) {
        setError(data.error || "Video generation failed");
        return;
      }

      const vid = data as VideoResult;
      setResult(vid);
      const newHist = [vid, ...history].slice(0, 20);
      setHistory(newHist);
      saveHistory("video-gen", newHist);

      // Save to gallery
      if (vid.video?.url) {
        saveToGallery({
          type: "video",
          url: vid.video.url,
          prompt: prompt.trim(),
          model: vid.model || model,
          metadata: { duration: vid.video.duration, aspectRatio: vid.video.aspectRatio },
        });
      }
    } catch (err) {
      setError((err as Error).message || "Network error");
    } finally {
      setGenerating(false);
    }
  }

  function togglePlay() {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImageUrl(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleDownloadVideo() {
    if (!result?.video?.url) return;
    await downloadFile(result.video.url, `firefly-video-${result.id}.mp4`);
  }

  return (
    <div className="h-full flex bg-[#0a0a0a] text-white">
      {/* Settings Sidebar */}
      <div className={cn(
        "h-full border-r border-zinc-800 flex flex-col transition-all duration-300 shrink-0",
        sidebarOpen ? "w-80" : "w-0 overflow-hidden"
      )}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <Link href="/computer/firefly" className="text-zinc-500 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-gradient-to-br from-cyan-600 to-teal-500 flex items-center justify-center">
                <Video className="w-3 h-3 text-white" />
              </div>
              <span className="text-sm font-semibold">Generate Video</span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {/* Model Selector */}
          <div className="space-y-2">
            <label className="text-xs text-zinc-400 font-medium">Model</label>
            <ModelSearchSelector
              category="video-generation"
              value={model}
              onChange={(id) => setModel(id)}
              accent="cyan"
            />
          </div>

          {/* Image to Video */}
          <div className="space-y-2">
            <label className="text-xs text-zinc-400 font-medium">First Frame (optional)</label>
            {imageUrl ? (
              <div className="relative rounded-lg overflow-hidden border border-zinc-700">
                <img src={imageUrl} alt="First frame" className="w-full h-32 object-cover" />
                <button
                  onClick={() => setImageUrl("")}
                  className="absolute top-2 right-2 p-1 rounded bg-black/60 text-white hover:bg-black/80 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-6 rounded-lg border border-dashed border-zinc-700 hover:border-cyan-500/50 text-zinc-500 hover:text-cyan-400 flex flex-col items-center gap-2 transition-all hover:bg-cyan-600/5"
              >
                <Upload className="w-5 h-5" />
                <span className="text-xs">Upload image for Image-to-Video</span>
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          </div>

          {/* Aspect Ratio */}
          <div className="space-y-2">
            <label className="text-xs text-zinc-400 font-medium">Aspect Ratio</label>
            <div className="grid grid-cols-3 gap-1.5">
              {ASPECT_RATIOS.map((ar) => {
                const Icon = ar.icon;
                return (
                  <button
                    key={ar.id}
                    onClick={() => setAspectRatio(ar.id)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 p-3 rounded-lg transition-all",
                      aspectRatio === ar.id
                        ? "bg-cyan-600/20 border border-cyan-500/30 text-cyan-300"
                        : "bg-zinc-800/50 border border-zinc-700/30 text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-[10px] font-medium">{ar.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Duration */}
          <div className="space-y-2">
            <label className="text-xs text-zinc-400 font-medium">Duration</label>
            <div className="flex gap-1.5">
              {DURATIONS.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setDuration(d.value)}
                  className={cn(
                    "flex-1 py-2 rounded-lg text-xs font-medium transition-all",
                    duration === d.value
                      ? "bg-cyan-600/20 border border-cyan-500/30 text-cyan-300"
                      : "bg-zinc-800/50 border border-zinc-700/30 text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Camera Motion */}
          <div className="space-y-2">
            <label className="text-xs text-zinc-400 font-medium">Camera Motion</label>
            <div className="grid grid-cols-3 gap-1.5">
              {CAMERA_MOTIONS.map((cm) => {
                const Icon = cm.icon;
                return (
                  <button
                    key={cm.id}
                    onClick={() => setCameraMotion(cm.id)}
                    className={cn(
                      "flex flex-col items-center gap-1 p-2 rounded-lg text-center transition-all",
                      cameraMotion === cm.id
                        ? "bg-cyan-600/20 border border-cyan-500/30 text-cyan-300"
                        : "bg-zinc-800/50 border border-zinc-700/30 text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span className="text-[10px]">{cm.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Motion Intensity */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-zinc-400 font-medium">Motion Intensity</label>
              <span className="text-xs text-zinc-500">{motionIntensity}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={motionIntensity}
              onChange={(e) => setMotionIntensity(Number(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-zinc-700 accent-cyan-500"
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            {!sidebarOpen && (
              <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors mr-1">
                <Settings2 className="w-4 h-4" />
              </button>
            )}
            {sidebarOpen && (
              <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors">
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <span className="text-xs text-zinc-500">
              {result ? "Video generated" : "Ready to generate"}
            </span>
          </div>
          {result && (
            <div className="flex items-center gap-1.5">
              <button onClick={handleDownloadVideo} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors">
                <Download className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Video Canvas */}
        <div className="flex-1 flex items-center justify-center p-8 overflow-auto">
          {generating ? (
            <div className="flex flex-col items-center justify-center">
              <div className="relative mb-6">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-600/20 to-teal-600/20 flex items-center justify-center animate-pulse">
                  <Video className="w-10 h-10 text-cyan-400" />
                </div>
                <Loader2 className="absolute -right-1 -bottom-1 w-6 h-6 text-cyan-400 animate-spin" />
              </div>
              <p className="text-sm text-zinc-400 mb-1">Generating video...</p>
              <p className="text-xs text-zinc-600">This may take 1-3 minutes</p>
            </div>
          ) : result?.video?.url ? (
            <div className="flex flex-col items-center gap-4 max-w-4xl">
              <div className="relative rounded-2xl overflow-hidden shadow-2xl bg-black group">
                <video
                  ref={videoRef}
                  src={result.video.url}
                  className="max-w-full max-h-[70vh]"
                  muted={isMuted}
                  loop
                  playsInline
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  autoPlay
                />
                {/* Video controls overlay */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button onClick={togglePlay} className="p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors">
                        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </button>
                      <button onClick={() => setIsMuted(!isMuted)} className="p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors">
                        {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                      </button>
                      <span className="text-xs text-zinc-300">{result.video.duration}s • {result.video.aspectRatio}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={handleDownloadVideo} className="p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors">
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button onClick={handleDownloadVideo} className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700 transition-colors">
                  <Download className="w-3.5 h-3.5" />
                  Download MP4
                </button>
                <Link
                  href={`/computer/firefly/generate/soundtrack?videoUrl=${encodeURIComponent(result.video.url)}`}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700 transition-colors"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  Add Soundtrack
                </Link>
              </div>

              <div className="text-xs text-zinc-600">
                Model: {result.model} | {new Date(result.createdAt).toLocaleTimeString()}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-600/10 to-teal-600/10 flex items-center justify-center mb-6">
                <Film className="w-10 h-10 text-zinc-600" />
              </div>
              <h3 className="text-lg font-semibold text-zinc-400 mb-2">Generate Video with AI</h3>
              <p className="text-sm text-zinc-600 max-w-md">
                Describe a scene or upload a first frame image. Use the settings panel to control model, duration, camera motion, and aspect ratio.
              </p>
            </div>
          )}
        </div>

        {/* Prompt Input Bar */}
        <div className="border-t border-zinc-800 p-4 bg-[#0a0a0a] shrink-0">
          <div className="max-w-4xl mx-auto">
            {error && (
              <div className="mb-3 p-3 rounded-xl bg-red-600/10 border border-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleGenerate();
                    }
                  }}
                  placeholder="Describe the video you want to generate (e.g., 'A sleek white sports car driving through a rainy city at night')..."
                  className="w-full bg-zinc-900/80 border border-zinc-700/50 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 resize-none focus:outline-none focus:border-cyan-500/50 min-h-[52px] max-h-32"
                  rows={1}
                />
              </div>
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim() || generating}
                className={cn(
                  "px-6 py-3 rounded-xl text-sm font-medium flex items-center gap-2 transition-all shrink-0",
                  prompt.trim() && !generating
                    ? "bg-gradient-to-r from-cyan-600 to-teal-600 text-white hover:from-cyan-500 hover:to-teal-500 shadow-lg shadow-cyan-500/20"
                    : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                )}
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {generating ? "Generating..." : "Generate"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

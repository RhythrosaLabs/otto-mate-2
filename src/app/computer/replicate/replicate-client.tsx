"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Play,
  Loader2,
  Sparkles,
  Image as ImageIcon,
  Video,
  Music,
  Mic2,
  Box,
  Wand2,
  Scissors,
  ZoomIn,
  ArrowUpRight,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ModelResult {
  owner: string;
  name: string;
  fullName: string;
  description: string;
  run_count: number;
  url: string;
  cover_image_url?: string;
}

interface RunResult {
  model: string;
  modelReason: string;
  taskType: string;
  status: string;
  predictTime?: number;
  files: Array<{ filename: string; size: number; mimeType: string }>;
  textOutput?: string;
  predictionId: string;
}

const QUICK_CATEGORIES = [
  { label: "Image Generation", icon: ImageIcon, query: "text to image", color: "text-purple-400 bg-purple-400/10" },
  { label: "Video", icon: Video, query: "text to video", color: "text-blue-400 bg-blue-400/10" },
  { label: "Upscale", icon: ZoomIn, query: "image upscale super resolution", color: "text-green-400 bg-green-400/10" },
  { label: "Background Removal", icon: Scissors, query: "remove background", color: "text-orange-400 bg-orange-400/10" },
  { label: "Music", icon: Music, query: "music generation", color: "text-pink-400 bg-pink-400/10" },
  { label: "Speech", icon: Mic2, query: "text to speech", color: "text-cyan-400 bg-cyan-400/10" },
  { label: "3D", icon: Box, query: "3d generation", color: "text-yellow-400 bg-yellow-400/10" },
  { label: "Style Transfer", icon: Wand2, query: "style transfer artistic", color: "text-indigo-400 bg-indigo-400/10" },
];

export function ReplicateClient() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [models, setModels] = useState<ModelResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [runError, setRunError] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) return;
    setSearching(true);
    setActiveCategory(query);
    try {
      const res = await fetch(`/api/replicate?action=search&q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json() as { models: ModelResult[] };
        setModels(data.models || []);
      }
    } catch {
      setModels([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleRun = async () => {
    if (!prompt.trim()) return;
    setRunning(true);
    setRunError("");
    setRunResult(null);
    try {
      const res = await fetch("/api/replicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          model: selectedModel || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRunError(data.error || "Unknown error");
      } else {
        setRunResult(data as RunResult);
      }
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  const handleRunAsTask = () => {
    // Create a new task with the prompt and navigate to it
    const taskPrompt = selectedModel
      ? `Use replicate_run to run ${selectedModel}: ${prompt}`
      : `Use replicate_run: ${prompt}`;
    router.push(`/computer?prompt=${encodeURIComponent(taskPrompt)}`);
  };

  const formatCount = (n: number): string => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-pplx-accent/10">
              <Sparkles className="w-6 h-6 text-pplx-accent" />
            </div>
            <h1 className="text-2xl font-bold text-pplx-text">Replicate Explorer</h1>
          </div>
          <p className="text-sm text-pplx-muted">
            Discover and run 1000s of AI models — image generation, video, music, upscaling, and more.
            Ottomatron automatically finds the best model for your request.
          </p>
        </div>

        {/* Quick Run Section */}
        <div className="mb-8 p-5 rounded-xl border border-pplx-border bg-pplx-card">
          <h2 className="text-sm font-semibold text-pplx-text mb-3">Smart Run</h2>
          <p className="text-xs text-pplx-muted mb-4">
            Describe what you want and Ottomatron will automatically find and run the best Replicate model.
          </p>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleRun()}
              placeholder="e.g. Generate a photorealistic image of a mountain lake at sunset..."
              className="flex-1 px-4 py-2.5 rounded-xl bg-pplx-bg border border-pplx-border text-pplx-text text-sm focus:outline-none focus:border-pplx-accent placeholder:text-pplx-muted/50"
            />
            <button
              onClick={handleRun}
              disabled={running || !prompt.trim()}
              className="px-5 py-2.5 rounded-xl bg-pplx-accent text-white text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity flex items-center gap-2"
            >
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {running ? "Running..." : "Run"}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-pplx-muted">Model:</span>
            <input
              type="text"
              value={selectedModel}
              onChange={e => setSelectedModel(e.target.value)}
              placeholder="Auto-select (or enter owner/name)"
              className="flex-1 px-3 py-1.5 rounded-lg bg-pplx-bg border border-pplx-border text-pplx-text text-xs focus:outline-none focus:border-pplx-accent placeholder:text-pplx-muted/50"
            />
            <button
              onClick={handleRunAsTask}
              disabled={!prompt.trim()}
              className="px-3 py-1.5 rounded-lg border border-pplx-border text-pplx-muted text-xs hover:text-pplx-text hover:border-pplx-accent/40 transition-colors flex items-center gap-1"
            >
              <ArrowUpRight className="w-3 h-3" />
              Run as Task
            </button>
          </div>
        </div>

        {/* Run Result */}
        {runError && (
          <div className="mb-6 p-4 rounded-xl border border-red-500/30 bg-red-500/5">
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" />
              <span className="font-medium">Error</span>
            </div>
            <p className="text-xs text-red-300 mt-1">{runError}</p>
          </div>
        )}

        {runResult && (
          <div className="mb-6 p-5 rounded-xl border border-green-500/30 bg-green-500/5">
            <div className="flex items-center gap-2 text-green-400 text-sm mb-3">
              <Sparkles className="w-4 h-4" />
              <span className="font-medium">Result</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex gap-2">
                <span className="text-pplx-muted">Model:</span>
                <span className="text-pplx-text font-mono">{runResult.model}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-pplx-muted">Type:</span>
                <span className="text-pplx-text">{runResult.taskType.replace(/_/g, " ")}</span>
              </div>
              {runResult.predictTime && (
                <div className="flex gap-2">
                  <span className="text-pplx-muted">Time:</span>
                  <span className="text-pplx-text">{runResult.predictTime.toFixed(1)}s</span>
                </div>
              )}
              <div className="flex gap-2">
                <span className="text-pplx-muted text-xs">{runResult.modelReason}</span>
              </div>
              {runResult.files.length > 0 && (
                <div className="mt-3 pt-3 border-t border-pplx-border">
                  <p className="text-xs text-pplx-muted mb-2">Generated files:</p>
                  {runResult.files.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-pplx-text">
                      <span className="font-mono">{f.filename}</span>
                      <span className="text-pplx-muted">({(f.size / 1024).toFixed(1)} KB, {f.mimeType})</span>
                    </div>
                  ))}
                </div>
              )}
              {runResult.textOutput && (
                <div className="mt-3 pt-3 border-t border-pplx-border">
                  <p className="text-xs text-pplx-muted mb-1">Text output:</p>
                  <pre className="text-xs text-pplx-text bg-pplx-bg p-3 rounded-lg overflow-x-auto whitespace-pre-wrap">{runResult.textOutput.slice(0, 2000)}</pre>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Quick Categories */}
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-pplx-text mb-3">Browse by Category</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {QUICK_CATEGORIES.map(cat => (
              <button
                key={cat.label}
                onClick={() => {
                  setSearchQuery(cat.query);
                  void handleSearch(cat.query);
                }}
                className={cn(
                  "flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all text-left",
                  activeCategory === cat.query
                    ? "border-pplx-accent bg-pplx-accent/5"
                    : "border-pplx-border bg-pplx-card hover:border-pplx-accent/30"
                )}
              >
                <div className={cn("p-1.5 rounded-lg", cat.color)}>
                  <cat.icon className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-medium text-pplx-text">{cat.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <form onSubmit={e => { e.preventDefault(); void handleSearch(searchQuery); }} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-pplx-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search Replicate models..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-pplx-card border border-pplx-border text-pplx-text text-sm focus:outline-none focus:border-pplx-accent placeholder:text-pplx-muted/50"
              />
            </div>
            <button
              type="submit"
              disabled={searching}
              className="px-5 py-2.5 rounded-xl bg-pplx-card border border-pplx-border text-pplx-text text-sm font-medium hover:border-pplx-accent/40 transition-colors flex items-center gap-2"
            >
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Search
            </button>
          </form>
        </div>

        {/* Model Results */}
        {models.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-pplx-text">
              {models.length} model{models.length !== 1 ? "s" : ""} found
            </h2>
            <div className="grid gap-2">
              {models.map(model => (
                <div
                  key={model.fullName}
                  className={cn(
                    "group flex items-center gap-4 p-4 rounded-xl border transition-all cursor-pointer",
                    selectedModel === model.fullName
                      ? "border-pplx-accent bg-pplx-accent/5"
                      : "border-pplx-border bg-pplx-card hover:border-pplx-accent/30"
                  )}
                  onClick={() => setSelectedModel(selectedModel === model.fullName ? "" : model.fullName)}
                >
                  {model.cover_image_url ? (
                    <img
                      src={model.cover_image_url}
                      alt=""
                      className="w-14 h-14 rounded-lg object-cover bg-pplx-bg shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-pplx-bg flex items-center justify-center shrink-0">
                      <Sparkles className="w-5 h-5 text-pplx-muted" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium text-pplx-text font-mono">{model.fullName}</span>
                      <span className="text-xs text-pplx-muted">
                        {formatCount(model.run_count)} runs
                      </span>
                    </div>
                    <p className="text-xs text-pplx-muted line-clamp-2">{model.description}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedModel(model.fullName);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className="px-3 py-1.5 rounded-lg bg-pplx-accent text-white text-xs font-medium hover:opacity-90"
                    >
                      Use
                    </button>
                    <a
                      href={model.url || `https://replicate.com/${model.fullName}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="p-1.5 rounded-lg border border-pplx-border text-pplx-muted hover:text-pplx-text transition-colors"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!searching && models.length === 0 && !runResult && !runError && (
          <div className="text-center py-12">
            <Sparkles className="w-10 h-10 text-pplx-muted mx-auto mb-3" />
            <p className="text-pplx-muted text-sm mb-1">Search for models or use Smart Run above</p>
            <p className="text-pplx-muted/60 text-xs">
              Replicate hosts thousands of models — image generation, video, audio, 3D, and more
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

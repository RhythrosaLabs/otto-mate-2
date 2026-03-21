"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, ChevronDown, Star, Loader2, X, Sparkles, Globe, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Types ────────────────────────────────────────────────────── */

export interface ModelOption {
  id: string;
  fullName: string;
  label: string;
  description: string;
  provider: "replicate" | "huggingface" | "openai";
  tag?: string;
  featured?: boolean;
  run_count?: number;
  downloads?: number;
  cover_image_url?: string;
  pipeline_tag?: string;
}

export type ModelCategory =
  | "image-generation"
  | "image-editing"
  | "image-upscale"
  | "background-removal"
  | "video-generation"
  | "image-to-video"
  | "music-generation"
  | "sound-effects"
  | "text-to-speech"
  | "3d-generation"
  | "style-transfer"
  | "inpainting"
  | "outpainting"
  | "face-swap"
  | "vector"
  | "general";

interface Props {
  category: ModelCategory;
  value: string;
  onChange: (modelId: string, model: ModelOption | null) => void;
  /** Accent color class for the active state, e.g. "violet" "cyan" "purple" "orange" */
  accent?: string;
  /** Compact mode — smaller footprint */
  compact?: boolean;
  className?: string;
}

const PROVIDER_ICONS: Record<string, typeof Sparkles> = {
  replicate: Zap,
  huggingface: Globe,
  openai: Sparkles,
};

const ACCENT_CLASSES: Record<string, { bg: string; border: string; text: string; tag: string }> = {
  violet: { bg: "bg-violet-600/15", border: "border-violet-500/30", text: "text-violet-300", tag: "bg-violet-600/20 text-violet-400" },
  cyan: { bg: "bg-cyan-600/15", border: "border-cyan-500/30", text: "text-cyan-300", tag: "bg-cyan-600/20 text-cyan-400" },
  purple: { bg: "bg-purple-600/15", border: "border-purple-500/30", text: "text-purple-300", tag: "bg-purple-600/20 text-purple-400" },
  orange: { bg: "bg-orange-600/15", border: "border-orange-500/30", text: "text-orange-300", tag: "bg-orange-600/20 text-orange-400" },
  pink: { bg: "bg-pink-600/15", border: "border-pink-500/30", text: "text-pink-300", tag: "bg-pink-600/20 text-pink-400" },
  emerald: { bg: "bg-emerald-600/15", border: "border-emerald-500/30", text: "text-emerald-300", tag: "bg-emerald-600/20 text-emerald-400" },
};

/* ─── Component ────────────────────────────────────────────────── */

export function ModelSearchSelector({ category, value, onChange, accent = "violet", compact, className }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [models, setModels] = useState<ModelOption[]>([]);
  const [featured, setFeatured] = useState<ModelOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelOption | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const colors = ACCENT_CLASSES[accent] || ACCENT_CLASSES.violet;

  // Load featured models on mount
  useEffect(() => {
    fetch(`/api/firefly/models?category=${category}`)
      .then((r) => r.json())
      .then((data) => {
        const m = (data.models || []) as ModelOption[];
        setFeatured(m);
        setModels(m);
        // Set initial selected model from value
        const found = m.find((model) => model.id === value);
        if (found) setSelectedModel(found);
      })
      .catch(() => {});
  }, [category, value]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Live search with debounce
  const handleSearch = useCallback(
    (q: string) => {
      setQuery(q);
      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (!q.trim()) {
        setModels(featured);
        setLoading(false);
        return;
      }

      setLoading(true);
      debounceRef.current = setTimeout(async () => {
        try {
          const res = await fetch(
            `/api/firefly/models?category=${category}&q=${encodeURIComponent(q)}`
          );
          const data = await res.json();
          setModels((data.models || []) as ModelOption[]);
        } catch {
          setModels(featured);
        }
        setLoading(false);
      }, 300);
    },
    [category, featured]
  );

  function selectModel(model: ModelOption) {
    setSelectedModel(model);
    onChange(model.id, model);
    setOpen(false);
    setQuery("");
    setModels(featured);
  }

  const displayLabel = selectedModel?.label || value.split("/").pop() || "Select model...";
  const displayTag = selectedModel?.tag;
  const displayProvider = selectedModel?.provider;
  const ProviderIcon = displayProvider ? PROVIDER_ICONS[displayProvider] || Sparkles : Sparkles;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Trigger button */}
      <button
        onClick={() => {
          setOpen(!open);
          if (!open) setTimeout(() => searchRef.current?.focus(), 100);
        }}
        className={cn(
          "w-full flex items-center justify-between rounded-lg border text-sm transition-colors",
          compact ? "px-2.5 py-1.5" : "px-3 py-2.5",
          open
            ? `${colors.bg} ${colors.border} ${colors.text}`
            : "bg-zinc-800/50 border-zinc-700/50 text-white hover:border-zinc-600"
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <ProviderIcon className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          <span className="truncate">{displayLabel}</span>
          {displayTag && (
            <span className={cn("px-1.5 py-0.5 rounded text-[10px] shrink-0", colors.tag)}>
              {displayTag}
            </span>
          )}
        </div>
        <ChevronDown className={cn("w-4 h-4 text-zinc-500 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl shadow-black/40 z-50 overflow-hidden max-h-[400px] flex flex-col">
          {/* Search bar */}
          <div className="px-3 py-2.5 border-b border-zinc-800 flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder={`Search ${category.replace(/-/g, " ")} models...`}
              className="flex-1 bg-transparent text-sm text-white placeholder:text-zinc-600 outline-none"
            />
            {loading && <Loader2 className="w-3.5 h-3.5 text-zinc-500 animate-spin shrink-0" />}
            {query && !loading && (
              <button onClick={() => handleSearch("")} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Model list */}
          <div className="flex-1 overflow-y-auto max-h-[340px]">
            {/* Featured section header */}
            {!query && models.some((m) => m.featured) && (
              <div className="px-3 py-1.5 text-[10px] text-zinc-500 uppercase tracking-wider font-semibold bg-zinc-800/40 sticky top-0 flex items-center gap-1">
                <Star className="w-2.5 h-2.5" />
                Featured Models
              </div>
            )}

            {models.length === 0 && !loading && (
              <div className="px-3 py-8 text-center text-xs text-zinc-600">
                No models found. Try a different search term.
              </div>
            )}

            {/* Featured models */}
            {models
              .filter((m) => m.featured)
              .map((model) => (
                <ModelRow
                  key={model.id}
                  model={model}
                  selected={model.id === value}
                  colors={colors}
                  onSelect={selectModel}
                />
              ))}

            {/* Search results section header */}
            {query && models.some((m) => !m.featured) && (
              <div className="px-3 py-1.5 text-[10px] text-zinc-500 uppercase tracking-wider font-semibold bg-zinc-800/40 sticky top-0">
                Search Results
              </div>
            )}

            {/* Non-featured search results */}
            {models
              .filter((m) => !m.featured)
              .map((model) => (
                <ModelRow
                  key={model.id}
                  model={model}
                  selected={model.id === value}
                  colors={colors}
                  onSelect={selectModel}
                />
              ))}
          </div>

          {/* Footer hint */}
          <div className="px-3 py-2 border-t border-zinc-800 text-[10px] text-zinc-600">
            Searches Replicate + HuggingFace model libraries live
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Model Row ────────────────────────────────────────────────── */

function ModelRow({
  model,
  selected,
  colors,
  onSelect,
}: {
  model: ModelOption;
  selected: boolean;
  colors: { bg: string; border: string; text: string; tag: string };
  onSelect: (m: ModelOption) => void;
}) {
  const ProviderIcon = PROVIDER_ICONS[model.provider] || Sparkles;
  const popularity = model.run_count || model.downloads || 0;

  return (
    <button
      onClick={() => onSelect(model)}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors",
        selected ? `${colors.bg} ${colors.text}` : "text-zinc-300 hover:bg-zinc-800/60"
      )}
    >
      <ProviderIcon className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium truncate">{model.label}</span>
          {model.tag && (
            <span className={cn("px-1 py-0.5 rounded text-[9px] shrink-0", colors.tag)}>
              {model.tag}
            </span>
          )}
          {!model.featured && popularity > 0 && (
            <span className="text-[9px] text-zinc-600 shrink-0">
              {popularity > 1_000_000
                ? `${(popularity / 1_000_000).toFixed(1)}M`
                : popularity > 1000
                ? `${(popularity / 1000).toFixed(0)}k`
                : popularity}{" "}
              runs
            </span>
          )}
        </div>
        <div className="text-[10px] text-zinc-500 truncate mt-0.5">{model.description}</div>
      </div>
      {selected && <div className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />}
    </button>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft, Download, Trash2, Heart, Grid3X3, List,
  Image as ImageIcon, Video, Music, Mic2, Search, X, Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  loadGallery,
  removeFromGallery,
  toggleGalleryFavorite,
  downloadFile,
  type GalleryItem,
} from "../lib/gallery-store";

type Tab = "all" | "image" | "video" | "audio" | "speech" | "favorites";
type ViewMode = "grid" | "list";

const TYPE_ICON: Record<GalleryItem["type"], React.ReactNode> = {
  image: <ImageIcon size={12} />,
  video: <Video size={12} />,
  audio: <Music size={12} />,
  speech: <Mic2 size={12} />,
};

const TYPE_COLOR: Record<GalleryItem["type"], string> = {
  image: "text-violet-400",
  video: "text-cyan-400",
  audio: "text-amber-400",
  speech: "text-green-400",
};

function GalleryThumb({ item }: { item: GalleryItem }) {
  const [broken, setBroken] = useState(false);

  if (item.type === "video") {
    return (
      <div className="w-full h-full bg-gradient-to-br from-cyan-900/30 to-blue-900/30 flex items-center justify-center">
        <Video className="w-8 h-8 text-cyan-400/60" />
      </div>
    );
  }
  if (item.type === "audio" || item.type === "speech") {
    return (
      <div className="w-full h-full bg-gradient-to-br from-amber-900/30 to-orange-900/30 flex items-center justify-center">
        <Music className="w-8 h-8 text-amber-400/60" />
      </div>
    );
  }
  if (broken) {
    return (
      <div className="w-full h-full bg-zinc-900 flex flex-col items-center justify-center gap-2 p-3">
        <ImageIcon className="w-6 h-6 text-zinc-700" />
        <p className="text-[9px] text-zinc-600 text-center line-clamp-2">{item.prompt}</p>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.url}
      alt={item.prompt}
      loading="lazy"
      onError={() => setBroken(true)}
      className="w-full h-full object-cover"
    />
  );
}

export function GalleryClient() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [tab, setTab] = useState<Tab>("all");
  const [view, setView] = useState<ViewMode>("grid");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<GalleryItem | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const reload = useCallback(() => setItems(loadGallery()), []);

  useEffect(() => {
    reload();
  }, [reload]);

  const filtered = items.filter((item) => {
    if (tab === "favorites") return item.favorite;
    if (tab !== "all" && item.type !== tab) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return item.prompt.toLowerCase().includes(q) || item.model.toLowerCase().includes(q);
    }
    return true;
  });

  function handleDelete(id: string) {
    removeFromGallery(id);
    reload();
    if (selected?.id === id) setSelected(null);
  }

  function handleFavorite(id: string) {
    toggleGalleryFavorite(id);
    reload();
    if (selected?.id === id) {
      setSelected((prev) => prev ? { ...prev, favorite: !prev.favorite } : null);
    }
  }

  async function handleDownload(item: GalleryItem) {
    setDownloading(item.id);
    const ext = item.type === "video" ? "mp4" : item.type === "audio" || item.type === "speech" ? "mp3" : "png";
    await downloadFile(item.url, `nova-${item.id}.${ext}`);
    setDownloading(null);
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "all", label: "All" },
    { id: "image", label: "Images" },
    { id: "video", label: "Videos" },
    { id: "audio", label: "Audio" },
    { id: "speech", label: "Speech" },
    { id: "favorites", label: "Favorites" },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#0a0a0a]/95 backdrop-blur-xl border-b border-zinc-800/50">
        <div className="flex items-center gap-3 px-6 py-3">
          <Link
            href="/computer/firefly"
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <ArrowLeft size={14} />
            Nova
          </Link>
          <span className="text-zinc-700">/</span>
          <h1 className="text-sm font-semibold text-white">Gallery</h1>
          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-zinc-800 text-[10px] text-zinc-400">
            {items.length}
          </span>

          {/* Search */}
          <div className="flex-1 max-w-xs ml-4 relative">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search prompts, models..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400">
                <X size={10} />
              </button>
            )}
          </div>

          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => setView("grid")}
              className={cn("p-1.5 rounded-md transition-colors", view === "grid" ? "bg-zinc-700 text-white" : "text-zinc-600 hover:text-zinc-400")}
            >
              <Grid3X3 size={14} />
            </button>
            <button
              onClick={() => setView("list")}
              className={cn("p-1.5 rounded-md transition-colors", view === "list" ? "bg-zinc-700 text-white" : "text-zinc-600 hover:text-zinc-400")}
            >
              <List size={14} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-6 pb-2 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
                tab === t.id
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4">
              <ImageIcon className="w-7 h-7 text-zinc-700" />
            </div>
            <p className="text-sm font-medium text-zinc-400 mb-1">
              {search ? "No results found" : "No creations yet"}
            </p>
            <p className="text-xs text-zinc-600 mb-6">
              {search
                ? "Try a different search term"
                : "Generate images, videos, and audio in Nova to see them here"}
            </p>
            {!search && (
              <Link
                href="/computer/firefly"
                className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium transition-colors"
              >
                Start Creating
              </Link>
            )}
          </div>
        ) : view === "grid" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {filtered.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelected(item)}
                className="relative aspect-square rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800/50 hover:border-zinc-600 transition-all group text-left"
              >
                <GalleryThumb item={item} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="absolute bottom-0 left-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-[10px] text-white/80 line-clamp-2 leading-relaxed">{item.prompt}</p>
                </div>
                {item.favorite && (
                  <div className="absolute top-2 right-2">
                    <Heart className="w-3.5 h-3.5 text-red-400 fill-red-400 drop-shadow" />
                  </div>
                )}
                <div className={cn("absolute top-2 left-2 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-black/50 backdrop-blur-sm text-[9px] font-medium", TYPE_COLOR[item.type])}>
                  {TYPE_ICON[item.type]}
                  <span className="ml-0.5 capitalize">{item.type}</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-2 max-w-3xl">
            {filtered.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-4 p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/50 hover:border-zinc-700 transition-all group"
              >
                <button
                  onClick={() => setSelected(item)}
                  className="w-14 h-14 rounded-lg overflow-hidden bg-zinc-800 flex-shrink-0"
                >
                  <GalleryThumb item={item} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={cn("flex items-center gap-1 text-[10px] font-medium capitalize", TYPE_COLOR[item.type])}>
                      {TYPE_ICON[item.type]} {item.type}
                    </span>
                    <span className="text-[10px] text-zinc-600">{item.model}</span>
                  </div>
                  <p className="text-xs text-zinc-300 line-clamp-1">{item.prompt}</p>
                  <p className="text-[10px] text-zinc-600 mt-0.5">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleFavorite(item.id)}
                    className={cn("p-1.5 rounded-lg transition-colors", item.favorite ? "text-red-400" : "text-zinc-600 hover:text-zinc-400")}
                  >
                    <Heart size={13} className={item.favorite ? "fill-red-400" : ""} />
                  </button>
                  <button
                    onClick={() => handleDownload(item)}
                    disabled={downloading === item.id}
                    className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-400 transition-colors"
                  >
                    <Download size={13} />
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {selected && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="relative bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden max-w-3xl w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Media */}
            <div className="relative bg-zinc-950 flex items-center justify-center" style={{ minHeight: 300 }}>
              {selected.type === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selected.url}
                  alt={selected.prompt}
                  className="max-h-[60vh] w-auto object-contain"
                />
              ) : selected.type === "video" ? (
                <video src={selected.url} controls className="max-h-[60vh] w-auto" />
              ) : (
                <div className="flex flex-col items-center gap-4 p-12">
                  <Music className="w-12 h-12 text-amber-400/60" />
                  <audio src={selected.url} controls className="w-full" />
                </div>
              )}
              <button
                onClick={() => setSelected(null)}
                className="absolute top-3 right-3 p-1.5 rounded-lg bg-black/50 text-zinc-400 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Info + actions */}
            <div className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn("flex items-center gap-1 text-xs font-medium capitalize", TYPE_COLOR[selected.type])}>
                      {TYPE_ICON[selected.type]} {selected.type}
                    </span>
                    <span className="text-xs text-zinc-500">{selected.model}</span>
                  </div>
                  <p className="text-sm text-zinc-300 line-clamp-3">{selected.prompt}</p>
                  <p className="text-xs text-zinc-600 mt-1">
                    {new Date(selected.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleFavorite(selected.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
                      selected.favorite
                        ? "border-red-500/30 bg-red-500/10 text-red-400"
                        : "border-zinc-700 text-zinc-400 hover:text-zinc-200"
                    )}
                  >
                    <Heart size={12} className={selected.favorite ? "fill-red-400" : ""} />
                    {selected.favorite ? "Saved" : "Save"}
                  </button>
                  <button
                    onClick={() => handleDownload(selected)}
                    disabled={downloading === selected.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50"
                  >
                    <Download size={12} />
                    Download
                  </button>
                  <button
                    onClick={() => handleDelete(selected.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 text-xs font-medium text-zinc-400 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={12} />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter bar hint */}
      {items.length > 0 && (
        <div className="fixed bottom-6 right-6 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-800/80 backdrop-blur-sm border border-zinc-700/50 text-[10px] text-zinc-500">
          <Filter size={10} />
          {filtered.length} of {items.length} shown
        </div>
      )}
    </div>
  );
}

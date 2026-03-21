"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft, Heart, Download, Image as ImageIcon,
  Video, Music, Mic2, Grid, LayoutGrid, Search,
  Flame, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  GalleryItem,
  loadGallery,
  toggleGalleryFavorite,
  removeFromGallery,
} from "../lib/gallery-store";

type FilterType = "all" | "image" | "video" | "audio" | "speech";

const FILTER_OPTIONS: { id: FilterType; label: string; icon: React.ElementType }[] = [
  { id: "all", label: "All", icon: LayoutGrid },
  { id: "image", label: "Images", icon: ImageIcon },
  { id: "video", label: "Videos", icon: Video },
  { id: "audio", label: "Music", icon: Music },
  { id: "speech", label: "Speech", icon: Mic2 },
];

const SORT_OPTIONS = [
  { id: "newest", label: "Newest" },
  { id: "oldest", label: "Oldest" },
  { id: "favorites", label: "Favorites" },
];

/* ─── Component ──────────────────────────────────────────────── */

export function GalleryClient() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [filter, setFilter] = useState<FilterType>("all");
  const [sort, setSort] = useState("newest");
  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);
  const [gridSize, setGridSize] = useState<"small" | "large">("large");

  // Load from shared gallery store
  useEffect(() => {
    setItems(loadGallery());
  }, []);

  // Re-read items to stay in sync
  function refreshItems() {
    setItems(loadGallery());
  }

  function toggleFavorite(id: string) {
    toggleGalleryFavorite(id);
    refreshItems();
    // Also update selected item if it's the one being toggled
    if (selectedItem?.id === id) {
      setSelectedItem(prev => prev ? { ...prev, favorite: !prev.favorite } : null);
    }
  }

  function deleteItem(id: string) {
    removeFromGallery(id);
    refreshItems();
    if (selectedItem?.id === id) setSelectedItem(null);
  }

  const filtered = items
    .filter(i => filter === "all" || i.type === filter)
    .filter(i => !search || i.prompt.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sort === "favorites") return (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0);
      if (sort === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const counts = {
    all: items.length,
    image: items.filter(i => i.type === "image").length,
    video: items.filter(i => i.type === "video").length,
    audio: items.filter(i => i.type === "audio").length,
    speech: items.filter(i => i.type === "speech").length,
  };

  return (
    <div className="h-full flex flex-col bg-[#0a0a0a] text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/computer/firefly" className="text-zinc-500 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-violet-600 to-orange-500 flex items-center justify-center">
              <Flame className="w-3.5 h-3.5 text-white" />
            </div>
            <h1 className="text-sm font-semibold">Gallery</h1>
            <span className="text-xs text-zinc-500">{items.length} creations</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search prompts..."
              className="pl-8 pr-3 py-1.5 rounded-lg bg-zinc-800/50 border border-zinc-700/50 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 w-48"
            />
          </div>
          {/* Grid toggle */}
          <button
            onClick={() => setGridSize(gridSize === "large" ? "small" : "large")}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors"
          >
            {gridSize === "large" ? <Grid className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-zinc-800/50 shrink-0">
        {FILTER_OPTIONS.map((f) => {
          const Icon = f.icon;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all",
                filter === f.id
                  ? "bg-violet-600/20 border border-violet-500/30 text-violet-300"
                  : "bg-zinc-800/30 border border-zinc-700/30 text-zinc-500 hover:text-zinc-300"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{f.label}</span>
              <span className="text-[10px] opacity-60">{counts[f.id]}</span>
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-1.5">
          {SORT_OPTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSort(s.id)}
              className={cn(
                "px-2 py-1 rounded text-[10px] transition-all",
                sort === s.id
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-600 hover:text-zinc-400"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Gallery Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-zinc-800/50 flex items-center justify-center mb-4">
              <ImageIcon className="w-8 h-8 text-zinc-600" />
            </div>
            <h3 className="text-sm font-medium text-zinc-400 mb-1">
              {items.length === 0 ? "No creations yet" : "No matching results"}
            </h3>
            <p className="text-xs text-zinc-600 mb-4">
              {items.length === 0
                ? "Generate images, videos, or audio to see them here"
                : "Try adjusting your search or filters"
              }
            </p>
            {items.length === 0 && (
              <div className="flex items-center gap-2">
                <Link href="/computer/firefly/generate/image" className="px-3 py-1.5 rounded-lg text-xs bg-violet-600 text-white hover:bg-violet-500 transition-colors">
                  Generate Image
                </Link>
                <Link href="/computer/firefly/generate/video" className="px-3 py-1.5 rounded-lg text-xs bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors border border-zinc-700">
                  Generate Video
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className={cn(
            "grid gap-3",
            gridSize === "large"
              ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
              : "grid-cols-3 md:grid-cols-5 lg:grid-cols-6"
          )}>
            {filtered.map((item) => (
              <div
                key={item.id}
                onClick={() => setSelectedItem(item)}
                className="group relative rounded-xl overflow-hidden cursor-pointer border border-zinc-800/50 hover:border-zinc-700 transition-all bg-zinc-900/50"
              >
                {/* Thumbnail */}
                {item.type === "image" ? (
                  <img src={item.thumbnailUrl || item.url} alt={item.prompt} className="w-full aspect-square object-cover" />
                ) : item.type === "video" ? (
                  <div className="w-full aspect-square bg-zinc-800/50 flex items-center justify-center">
                    <Video className="w-8 h-8 text-zinc-600" />
                  </div>
                ) : (
                  <div className="w-full aspect-square bg-zinc-800/50 flex items-center justify-center">
                    <Music className="w-8 h-8 text-zinc-600" />
                  </div>
                )}

                {/* Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                  <p className="text-[10px] text-zinc-300 line-clamp-2">{item.prompt}</p>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[9px] text-zinc-500">{new Date(item.createdAt).toLocaleDateString()}</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleFavorite(item.id); }}
                        className="p-1 rounded hover:bg-white/10"
                      >
                        <Heart className={cn("w-3 h-3", item.favorite ? "fill-red-500 text-red-500" : "text-zinc-400")} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }}
                        className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-red-400"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Type badge */}
                <div className="absolute top-2 left-2">
                  <span className={cn(
                    "px-1.5 py-0.5 rounded text-[9px] font-medium",
                    item.type === "image" ? "bg-blue-600/80 text-white" :
                    item.type === "video" ? "bg-cyan-600/80 text-white" :
                    item.type === "audio" ? "bg-purple-600/80 text-white" :
                    "bg-orange-600/80 text-white"
                  )}>
                    {item.type}
                  </span>
                </div>

                {item.favorite && (
                  <Heart className="absolute top-2 right-2 w-3 h-3 fill-red-500 text-red-500" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8" onClick={() => setSelectedItem(null)}>
          <div className="max-w-2xl w-full bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {selectedItem.type === "image" ? (
              <img src={selectedItem.url} alt={selectedItem.prompt} className="w-full max-h-[60vh] object-contain bg-black" />
            ) : selectedItem.type === "video" ? (
              <video src={selectedItem.url} className="w-full max-h-[60vh]" controls autoPlay loop />
            ) : (
              <div className="w-full p-6 flex flex-col items-center justify-center bg-zinc-800/50 gap-4">
                <div className="w-16 h-16 rounded-2xl bg-zinc-700/50 flex items-center justify-center">
                  <Music className="w-8 h-8 text-zinc-500" />
                </div>
                <audio src={selectedItem.url} controls autoPlay className="w-full max-w-md" />
              </div>
            )}
            <div className="p-4 border-t border-zinc-800">
              <p className="text-sm text-zinc-300 mb-2">{selectedItem.prompt}</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span>{selectedItem.model}</span>
                  <span>•</span>
                  <span>{new Date(selectedItem.createdAt).toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => toggleFavorite(selectedItem.id)} className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors">
                    <Heart className={cn("w-4 h-4", selectedItem.favorite ? "fill-red-500 text-red-500" : "text-zinc-400")} />
                  </button>
                  <button onClick={() => { deleteItem(selectedItem.id); setSelectedItem(null); }} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-red-400 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <a href={selectedItem.url} download className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
                    <Download className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ArrowRight, Star, Plus } from "lucide-react";
import type { GalleryItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import Link from "next/link";

const CATEGORY_LABELS: Record<string, string> = {
  all: "All",
  coding: "Coding",
  research: "Research",
  writing: "Writing",
  data_analysis: "Data Analysis",
  business: "Business",
  creative: "Creative",
};

export function GalleryClient({ items }: { items: GalleryItem[] }) {
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const router = useRouter();

  const filtered = items.filter((item) => {
    const matchesCat = category === "all" || item.category === category;
    const matchesSearch =
      search === "" ||
      item.title.toLowerCase().includes(search.toLowerCase()) ||
      item.description.toLowerCase().includes(search.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const featured = filtered.filter((i) => i.is_featured);
  const rest = filtered.filter((i) => !i.is_featured);

  async function usePrompt(prompt: string) {
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    if (res.ok) {
      const task = await res.json();
      router.push(`/computer/tasks/${task.id}`);
    }
  }

  const categories = ["all", ...Array.from(new Set(items.map((i) => i.category)))];

  return (
    <div className="flex-1 px-6 py-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-pplx-text">Gallery</h1>
          <p className="text-sm text-pplx-muted mt-0.5">
            Explore and run example tasks created by the community
          </p>
        </div>
        <Link
          href="/computer?q=Build%20me%20a"
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-pplx-accent hover:bg-pplx-accent-hover text-white text-sm font-medium transition-colors whitespace-nowrap"
        >
          <Plus size={14} />
          Build your own
        </Link>
      </div>

      {/* Category chips + search */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap",
                category === cat
                  ? "bg-pplx-accent/20 text-pplx-accent border border-pplx-accent/40"
                  : "bg-pplx-card text-pplx-muted border border-pplx-border hover:text-pplx-text"
              )}
            >
              {CATEGORY_LABELS[cat] || cat}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search gallery..."
          className="flex-1 min-w-40 bg-pplx-card border border-pplx-border rounded-xl px-3.5 py-1.5 text-xs text-pplx-text placeholder:text-pplx-muted outline-none focus:border-pplx-accent/50 transition-colors"
        />
      </div>

      {/* Featured */}
      {featured.length > 0 && (
        <div className="mb-6">
          <p className="text-xs text-pplx-muted font-medium flex items-center gap-1.5 mb-3">
            <Star size={11} className="text-yellow-400" />
            Featured
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {featured.map((item) => (
              <GalleryCard key={item.id} item={item} onUse={() => usePrompt(item.prompt)} featured />
            ))}
          </div>
        </div>
      )}

      {/* Rest */}
      {rest.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rest.map((item) => (
            <GalleryCard key={item.id} item={item} onUse={() => usePrompt(item.prompt)} />
          ))}
        </div>
      )}

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center h-64 text-pplx-muted">
          <Sparkles size={40} className="mb-3 opacity-30" />
          <p className="text-sm font-medium">No items found</p>
          <p className="text-xs mt-1 opacity-70">Try different filters</p>
        </div>
      )}
    </div>
  );
}

function GalleryCard({
  item,
  onUse,
  featured,
}: {
  item: GalleryItem;
  onUse: () => void;
  featured?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4 flex flex-col gap-3 group hover:border-pplx-muted/50 transition-colors cursor-pointer",
        featured ? "border-yellow-400/30 bg-yellow-400/5" : "border-pplx-border bg-pplx-card"
      )}
      onClick={onUse}
    >
      {item.preview_url && (
        <div className="w-full h-28 rounded-lg bg-pplx-bg border border-pplx-border overflow-hidden">
          <img
            src={item.preview_url || undefined}
            alt={item.title}
            className="w-full h-full object-cover"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
        </div>
      )}

      <div>
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-pplx-text leading-tight">{item.title}</p>
          {featured && <Star size={12} className="text-yellow-400 flex-shrink-0 mt-0.5" />}
        </div>
        <p className="text-xs text-pplx-muted mt-1 leading-relaxed line-clamp-2">{item.description}</p>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-pplx-muted bg-pplx-bg border border-pplx-border px-2 py-0.5 rounded-full capitalize">
          {item.category.replace("_", " ")}
        </span>
        <span className="flex items-center gap-1 text-xs text-pplx-accent opacity-0 group-hover:opacity-100 transition-opacity">
          Try this <ArrowRight size={11} />
        </span>
      </div>
    </div>
  );
}

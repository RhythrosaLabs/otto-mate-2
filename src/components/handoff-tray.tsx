"use client";

import { useRef, useEffect } from "react";
import {
  Layers,
  X,
  ArrowRight,
  Film,
  Music,
  Image as ImageIcon,
  Box,
  File,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useHandoff, STUDIO_MAP, studiosForItem, type StudioId } from "./handoff-context";
import type { HandoffItem, HandoffMimeCategory } from "@/lib/handoff-store";

// ── Mime category icon ─────────────────────────────────────────────────────────

function MimeIcon({ category, className }: { category: HandoffMimeCategory; className?: string }) {
  const base = "w-3.5 h-3.5 flex-shrink-0";
  switch (category) {
    case "image": return <ImageIcon className={cn(base, "text-pink-400",   className)} />;
    case "video": return <Film      className={cn(base, "text-purple-400", className)} />;
    case "audio": return <Music     className={cn(base, "text-blue-400",   className)} />;
    case "3d":    return <Box       className={cn(base, "text-teal-400",   className)} />;
    default:      return <File      className={cn(base, "text-zinc-400",   className)} />;
  }
}

// ── Individual shelf item ──────────────────────────────────────────────────────

function ShelfCard({ item }: { item: HandoffItem }) {
  const { removeFromShelf, sendToStudio } = useHandoff();
  const studios = studiosForItem(item);

  return (
    <div className="group rounded-xl bg-pplx-bg border border-pplx-border hover:border-pplx-accent/30 transition-all overflow-hidden">
      {/* Preview */}
      {item.mimeCategory === "image" && (
        <div className="w-full aspect-video bg-zinc-900 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.url}
            alt={item.name}
            className="w-full h-full object-cover"
            crossOrigin="anonymous"
          />
        </div>
      )}
      {item.mimeCategory === "video" && (
        <div className="w-full aspect-video bg-zinc-900 overflow-hidden">
          <video
            src={item.url}
            className="w-full h-full object-cover"
            muted
            preload="metadata"
          />
        </div>
      )}
      {item.mimeCategory === "audio" && (
        <div className="w-full bg-zinc-900 px-3 py-2">
          <audio src={item.url} controls className="w-full h-7" />
        </div>
      )}

      <div className="p-2.5">
        {/* Header row */}
        <div className="flex items-start gap-1.5 mb-1">
          <MimeIcon category={item.mimeCategory} className="mt-0.5" />
          <span className="text-[11px] text-pplx-text leading-tight flex-1 line-clamp-2 break-all">
            {item.name}
          </span>
          <button
            onClick={() => removeFromShelf(item.id)}
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/10 text-pplx-muted transition-all shrink-0 mt-0.5"
            title="Remove from shelf"
          >
            <X className="w-3 h-3" />
          </button>
        </div>

        {item.prompt && (
          <p className="text-[10px] text-pplx-muted truncate mb-2 pl-5">{item.prompt}</p>
        )}

        {/* Send-to buttons */}
        {studios.length > 0 && (
          <div className="flex flex-wrap gap-1 pl-5">
            {studios.map((sid) => (
              <button
                key={sid}
                onClick={() => sendToStudio(item, sid)}
                className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-pplx-accent/10 hover:bg-pplx-accent/20 border border-pplx-accent/20 text-pplx-accent text-[10px] font-medium transition-colors whitespace-nowrap"
              >
                <ArrowRight className="w-2.5 h-2.5" />
                {STUDIO_MAP[sid].label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tray panel ─────────────────────────────────────────────────────────────────

export function HandoffTray() {
  const { trayOpen, setTrayOpen, shelf, clearShelf } = useHandoff();
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!trayOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setTrayOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [trayOpen, setTrayOpen]);

  if (!trayOpen) return null;

  return (
    <div
      ref={panelRef}
      className="fixed top-0 right-0 bottom-0 w-80 bg-pplx-card border-l border-pplx-border z-[200] flex flex-col shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-pplx-border shrink-0">
        <Layers className="w-4 h-4 text-pplx-accent" />
        <h2 className="text-sm font-semibold text-pplx-text flex-1">Media Shelf</h2>
        <span className="text-[10px] text-pplx-muted bg-pplx-bg rounded-full px-2 py-0.5 border border-pplx-border">
          {shelf.length}
        </span>
        {shelf.length > 0 && (
          <button
            onClick={() => clearShelf()}
            title="Clear shelf"
            className="p-1 rounded hover:bg-pplx-hover text-pplx-muted hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={() => setTrayOpen(false)}
          className="p-1 rounded hover:bg-pplx-hover text-pplx-muted transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Description */}
      <div className="px-4 py-2 shrink-0 border-b border-pplx-border bg-pplx-bg/50">
        <p className="text-[10px] text-pplx-muted leading-relaxed">
          Files from any studio appear here. Click a studio badge to send the file and jump straight to it.
        </p>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {shelf.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <div className="w-12 h-12 rounded-xl bg-pplx-bg border border-pplx-border flex items-center justify-center">
              <Layers className="w-5 h-5 text-pplx-muted" />
            </div>
            <p className="text-xs text-pplx-muted max-w-[200px]">
              Generate something in any studio and it will appear here, ready to hand off.
            </p>
          </div>
        ) : (
          shelf.map((item) => <ShelfCard key={item.id} item={item} />)
        )}
      </div>
    </div>
  );
}

// ── Trigger button (placed near sidebar bottom) ────────────────────────────────

export function HandoffTrayTrigger() {
  const { shelf, trayOpen, setTrayOpen } = useHandoff();
  const hasItems = shelf.length > 0;

  return (
    <button
      onClick={() => setTrayOpen(!trayOpen)}
      title="Media Shelf — handoff between studios"
      className={cn(
        "relative flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors",
        trayOpen
          ? "bg-pplx-accent/20 text-pplx-accent"
          : "text-pplx-muted hover:text-pplx-text hover:bg-white/[0.03]"
      )}
    >
      <Layers size={15} />
      <span>Media Shelf</span>
      {hasItems && (
        <span className="ml-auto text-[10px] font-medium bg-pplx-accent/20 text-pplx-accent rounded-full px-1.5 py-0.5 leading-none">
          {shelf.length}
        </span>
      )}
    </button>
  );
}

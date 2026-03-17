"use client";

/**
 * BackgroundStatus — Floating indicator for active background operations.
 * 
 * Shows a compact, non-intrusive pill in the bottom-right corner when
 * operations are running in the background. Expands on hover/click to
 * show details and navigation links.
 */

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Loader2, CheckCircle2, AlertCircle, X, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBackgroundOps, removeBackgroundOp, type BackgroundOp, type OpStatus } from "@/lib/background-ops";

const OP_TYPE_ICONS: Record<string, string> = {
  task: "🤖",
  video: "🎬",
  "app-build": "🏗️",
  generation: "✨",
  audio: "🎵",
};

const STATUS_COLORS: Record<OpStatus, string> = {
  running: "text-pplx-accent",
  completed: "text-green-400",
  failed: "text-red-400",
};

export function BackgroundStatus() {
  const ops = useBackgroundOps();
  const router = useRouter();
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Filter out dismissed completed/failed ops
  const visibleOps = ops.filter((op) => !dismissed.has(op.id));
  const runningOps = visibleOps.filter((op) => op.status === "running");
  const finishedOps = visibleOps.filter((op) => op.status !== "running");

  // Auto-dismiss completed ops after 15 seconds
  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];
    for (const op of finishedOps) {
      const timer = setTimeout(() => {
        removeBackgroundOp(op.id);
        setDismissed((prev) => {
          const next = new Set(prev);
          next.add(op.id);
          return next;
        });
      }, 15000);
      timers.push(timer);
    }
    return () => timers.forEach(clearTimeout);
  }, [finishedOps]);

  // Nothing to show
  if (visibleOps.length === 0) return null;

  // Check if any op is on the current page — if so, less prominent
  const allOnCurrentPage = visibleOps.every((op) => pathname.startsWith(op.href));

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-[100] transition-all duration-200",
        expanded ? "w-80" : "w-auto"
      )}
    >
      {/* Expanded panel */}
      {expanded && (
        <div className="mb-2 bg-pplx-card border border-pplx-border rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-2 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-pplx-border">
            <span className="text-xs font-medium text-pplx-text">
              Background Operations
            </span>
            <button
              onClick={() => setExpanded(false)}
              className="p-0.5 rounded hover:bg-white/10 text-pplx-muted"
            >
              <ChevronDown size={14} />
            </button>
          </div>

          {/* Operations list */}
          <div className="max-h-64 overflow-y-auto">
            {visibleOps.map((op) => (
              <div
                key={op.id}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors cursor-pointer border-b border-pplx-border/50 last:border-0",
                  pathname.startsWith(op.href) && "bg-pplx-accent/5"
                )}
                onClick={() => {
                  router.push(op.href);
                  setExpanded(false);
                }}
              >
                {/* Type icon */}
                <span className="text-sm flex-shrink-0">
                  {OP_TYPE_ICONS[op.type] || "⚙️"}
                </span>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-pplx-text truncate">
                    {op.label}
                  </p>
                  {op.detail && (
                    <p className="text-[10px] text-pplx-muted truncate">
                      {op.detail}
                    </p>
                  )}
                </div>

                {/* Status indicator */}
                <div className={cn("flex-shrink-0", STATUS_COLORS[op.status])}>
                  {op.status === "running" && (
                    <Loader2 size={14} className="animate-spin" />
                  )}
                  {op.status === "completed" && <CheckCircle2 size={14} />}
                  {op.status === "failed" && <AlertCircle size={14} />}
                </div>

                {/* Dismiss button for finished ops */}
                {op.status !== "running" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeBackgroundOp(op.id);
                      setDismissed((prev) => new Set([...prev, op.id]));
                    }}
                    className="flex-shrink-0 p-0.5 rounded hover:bg-white/10 text-pplx-muted"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Compact pill button */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-full border shadow-lg transition-all duration-200",
          "bg-pplx-card border-pplx-border hover:border-pplx-muted/50",
          runningOps.length > 0 && !allOnCurrentPage && "ring-1 ring-pplx-accent/30",
          "ml-auto" // align right
        )}
      >
        {runningOps.length > 0 ? (
          <>
            <Loader2 size={14} className="text-pplx-accent animate-spin" />
            <span className="text-xs font-medium text-pplx-text">
              {runningOps.length} running
            </span>
          </>
        ) : (
          <>
            <CheckCircle2 size={14} className="text-green-400" />
            <span className="text-xs font-medium text-pplx-text">
              {finishedOps.length} finished
            </span>
          </>
        )}

        {finishedOps.length > 0 && runningOps.length > 0 && (
          <span className="text-[10px] text-pplx-muted">
            +{finishedOps.length} done
          </span>
        )}

        <ChevronUp
          size={12}
          className={cn(
            "text-pplx-muted transition-transform",
            expanded && "rotate-180"
          )}
        />
      </button>
    </div>
  );
}

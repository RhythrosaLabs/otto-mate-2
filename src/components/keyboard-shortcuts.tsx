"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CommandPalette } from "@/components/command-palette";

/**
 * Client-side keyboard shortcut handler + command palette.
 * Extracted from layout to allow ComputerLayout to be a server component.
 */
export function KeyboardShortcuts({ children }: { children: React.ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const router = useRouter();

  const handleGlobalKeys = useCallback((e: KeyboardEvent) => {
    const meta = e.metaKey || e.ctrlKey;
    // ⇧⌘+R — force hard refresh (don't intercept, let browser handle)
    if (meta && e.shiftKey && (e.key === "r" || e.key === "R")) { return; }
    // ⌘+J — toggle command palette
    if (meta && e.key === "j") { e.preventDefault(); setPaletteOpen(p => !p); return; }
    // ⌘+N — new task
    if (meta && e.key === "n" && !e.shiftKey) { e.preventDefault(); router.push("/computer"); return; }
    // ⌘+, — settings
    if (meta && e.key === ",") { e.preventDefault(); router.push("/computer/settings"); return; }
    // Escape — close palette (use ref to avoid re-creating callback)
    if (e.key === "Escape") { setPaletteOpen(false); return; }
  }, [router]);

  useEffect(() => {
    window.addEventListener("keydown", handleGlobalKeys);
    return () => window.removeEventListener("keydown", handleGlobalKeys);
  }, [handleGlobalKeys]);

  return (
    <>
      {children}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}

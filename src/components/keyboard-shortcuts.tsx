"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * GlobalKeyboardShortcuts — registers app-wide shortcuts that work on every page.
 *
 * Cmd/Ctrl+N  → new task (navigate to /computer)
 * Cmd/Ctrl+J  → quick-run (opens command palette in quickrun mode via custom event)
 * Cmd/Ctrl+K  → command palette (handled in Sidebar — kept here for redundancy on mobile)
 *
 * Skips shortcuts when focus is inside an input, textarea, or contenteditable.
 */
export function GlobalKeyboardShortcuts() {
  const router = useRouter();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!e.metaKey && !e.ctrlKey) return;

      // Skip when typing in an input/textarea/contenteditable
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        router.push("/computer");
      }

      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        // Signal the CommandPalette (rendered in Sidebar) to open in quickrun mode
        window.dispatchEvent(new CustomEvent("open-command-palette", { detail: { mode: "quickrun" } }));
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router]);

  return null;
}

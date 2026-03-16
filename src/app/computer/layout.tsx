"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { CommandPalette } from "@/components/command-palette";

export default function ComputerLayout({ children }: { children: React.ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const router = useRouter();

  const handleGlobalKeys = useCallback((e: KeyboardEvent) => {
    const meta = e.metaKey || e.ctrlKey;
    // ⌘+K — toggle command palette
    if (meta && e.key === "k") { e.preventDefault(); setPaletteOpen(p => !p); return; }
    // ⌘+N — new task
    if (meta && e.key === "n" && !e.shiftKey) { e.preventDefault(); router.push("/computer"); return; }
    // ⌘+, — settings
    if (meta && e.key === ",") { e.preventDefault(); router.push("/computer/settings"); return; }
    // Escape — close palette
    if (e.key === "Escape" && paletteOpen) { setPaletteOpen(false); return; }
  }, [router, paletteOpen]);

  useEffect(() => {
    window.addEventListener("keydown", handleGlobalKeys);
    return () => window.removeEventListener("keydown", handleGlobalKeys);
  }, [handleGlobalKeys]);

  return (
    <div className="flex min-h-screen bg-pplx-bg">
      <Sidebar />
      <main className="flex-1 overflow-hidden md:ml-0 ml-0">
        <div className="md:hidden h-14" />
        {children}
      </main>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

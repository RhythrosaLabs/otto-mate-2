"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Monitor,
  CheckSquare,
  FolderOpen,
  Plug,
  Zap,
  Image as ImageIcon,
  Brain,
  Clock,
  LayoutTemplate,
  BarChart3,
  Plus,
  Search,
  Settings,
  Command,
  ArrowRight,
  Shield,
  GitBranch,
  MessageSquare,
  Palette,
  User,
  Play,
  Sparkles,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PERSONAS, getStoredPersonaId, setStoredPersonaId } from "@/lib/personas";
import { THEMES, applyTheme, getStoredThemeId } from "@/lib/themes";

interface PaletteAction {
  id: string;
  label: string;
  shortcut?: string;
  icon: React.ReactNode;
  category: "navigation" | "task" | "persona" | "theme" | "settings";
  action: () => void;
  badge?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mode, setMode] = useState<"default" | "quickrun">("default");
  const [quickRunPrompt, setQuickRunPrompt] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const actions: PaletteAction[] = useMemo(() => {
    const currentPersona = getStoredPersonaId();
    const currentTheme = getStoredThemeId();

    return [
      // Navigation
      { id: "home", label: "Home", shortcut: "⌘+H", icon: <Monitor size={14} />, category: "navigation" as const, action: () => router.push("/computer") },
      { id: "tasks", label: "Tasks", shortcut: "⌘+T", icon: <CheckSquare size={14} />, category: "navigation" as const, action: () => router.push("/computer/tasks") },
      { id: "files", label: "Files", icon: <FolderOpen size={14} />, category: "navigation" as const, action: () => router.push("/computer/files") },
      { id: "connectors", label: "Connectors", icon: <Plug size={14} />, category: "navigation" as const, action: () => router.push("/computer/connectors") },
      { id: "skills", label: "Skills", icon: <Zap size={14} />, category: "navigation" as const, action: () => router.push("/computer/skills") },
      { id: "gallery", label: "Gallery", icon: <ImageIcon size={14} />, category: "navigation" as const, action: () => router.push("/computer/gallery") },
      { id: "memory", label: "Memory", icon: <Brain size={14} />, category: "navigation" as const, action: () => router.push("/computer/memory") },
      { id: "templates", label: "Templates", icon: <LayoutTemplate size={14} />, category: "navigation" as const, action: () => router.push("/computer/templates") },
      { id: "scheduled", label: "Scheduled Tasks", icon: <Clock size={14} />, category: "navigation" as const, action: () => router.push("/computer/scheduled") },
      { id: "analytics", label: "Analytics", icon: <BarChart3 size={14} />, category: "navigation" as const, action: () => router.push("/computer/analytics") },
      { id: "audit", label: "Audit Trail", icon: <Shield size={14} />, category: "navigation" as const, action: () => router.push("/computer/audit") },
      { id: "pipelines", label: "Pipelines", icon: <GitBranch size={14} />, category: "navigation" as const, action: () => router.push("/computer/pipelines") },
      { id: "sessions", label: "Sessions", icon: <MessageSquare size={14} />, category: "navigation" as const, action: () => router.push("/computer/sessions") },
      { id: "channels", label: "Channels", icon: <Globe size={14} />, category: "navigation" as const, action: () => router.push("/computer/channels") },
      { id: "settings", label: "Settings", shortcut: "⌘+,", icon: <Settings size={14} />, category: "navigation" as const, action: () => router.push("/computer/settings") },
      // Task actions
      { id: "new-task", label: "New Task", shortcut: "⌘+N", icon: <Plus size={14} />, category: "task" as const, action: () => router.push("/computer") },
      { id: "quick-run", label: "Quick Run — type a prompt and go", shortcut: "⌘+R", icon: <Play size={14} />, category: "task" as const, action: () => setMode("quickrun") },
      // Persona switching
      ...PERSONAS.map(p => ({
        id: `persona-${p.id}`,
        label: `${p.icon} ${p.name}`,
        icon: <User size={14} />,
        category: "persona" as const,
        badge: p.id === currentPersona ? "active" : undefined,
        action: () => {
          setStoredPersonaId(p.id);
          window.dispatchEvent(new CustomEvent("persona-changed", { detail: p.id }));
        },
      })),
      // Theme switching
      ...THEMES.map(t => ({
        id: `theme-${t.id}`,
        label: `${t.icon} ${t.name}`,
        icon: <Palette size={14} />,
        category: "theme" as const,
        badge: t.id === currentTheme ? "active" : undefined,
        action: () => {
          applyTheme(t.id);
        },
      })),
    ];
  }, [router]);

  const filtered = useMemo(() => {
    if (!query.trim()) return actions;
    const q = query.toLowerCase();
    return actions.filter(a =>
      a.label.toLowerCase().includes(q) ||
      a.category.includes(q) ||
      a.id.includes(q)
    );
  }, [query, actions]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setMode("default");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Clamp selection
  useEffect(() => {
    setSelectedIndex(i => Math.min(i, Math.max(filtered.length - 1, 0)));
  }, [filtered.length]);

  const execute = useCallback((action: PaletteAction) => {
    if (action.id === "quick-run") {
      action.action();
      return;
    }
    onClose();
    action.action();
  }, [onClose]);

  async function handleQuickRun() {
    if (!quickRunPrompt.trim()) return;
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: quickRunPrompt.slice(0, 80),
          prompt: quickRunPrompt,
          model: "auto",
        }),
      });
      const task = await res.json() as { id: string };
      onClose();
      // Auto-run the task
      fetch(`/api/tasks/${task.id}/run`, { method: "POST" }).catch(console.error);
      router.push(`/computer/tasks/${task.id}`);
    } catch (err) {
      console.error("Quick run failed:", err);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (mode === "quickrun") {
      if (e.key === "Escape") {
        e.preventDefault();
        setMode("default");
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleQuickRun();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[selectedIndex]) execute(filtered[selectedIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  if (!open) return null;

  // Quick Run mode
  if (mode === "quickrun") {
    return (
      <>
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
        <div className="fixed inset-x-0 top-[15%] z-[101] flex justify-center animate-fade-in">
          <div className="w-full max-w-lg mx-4 rounded-2xl border border-pplx-border bg-pplx-card shadow-2xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-pplx-border">
              <Play size={16} className="text-pplx-accent flex-shrink-0" />
              <span className="text-sm font-medium text-pplx-text">Quick Run</span>
              <kbd className="ml-auto hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-pplx-bg border border-pplx-border text-[10px] text-pplx-muted font-mono">
                ESC
              </kbd>
            </div>
            <div className="p-4">
              <textarea
                ref={inputRef as unknown as React.RefObject<HTMLTextAreaElement>}
                value={quickRunPrompt}
                onChange={e => setQuickRunPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a prompt and press Enter to create & run a task instantly..."
                className="w-full bg-pplx-bg border border-pplx-border rounded-xl px-3.5 py-2.5 text-sm text-pplx-text placeholder:text-pplx-muted outline-none focus:border-pplx-accent/50 resize-none"
                rows={3}
                autoFocus
              />
              <div className="flex items-center justify-between mt-3">
                <span className="text-[10px] text-pplx-muted">⌘+Enter to run • ESC to go back</span>
                <button
                  onClick={handleQuickRun}
                  disabled={!quickRunPrompt.trim()}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-pplx-accent text-white text-xs font-medium hover:bg-pplx-accent-hover disabled:opacity-40 transition-colors"
                >
                  <Sparkles size={12} />
                  Run
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Group by category
  const grouped: Record<string, PaletteAction[]> = {};
  for (const a of filtered) {
    if (!grouped[a.category]) grouped[a.category] = [];
    grouped[a.category].push(a);
  }

  const categoryLabels: Record<string, string> = {
    navigation: "Go to",
    task: "Actions",
    persona: "Switch Persona",
    theme: "Switch Theme",
    settings: "Settings",
  };

  let flatIndex = -1;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Palette */}
      <div className="fixed inset-x-0 top-[15%] z-[101] flex justify-center animate-fade-in">
        <div className="w-full max-w-lg mx-4 rounded-2xl border border-pplx-border bg-pplx-card shadow-2xl overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-pplx-border">
            <Search size={16} className="text-pplx-muted flex-shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a command, persona, theme, or search..."
              className="flex-1 bg-transparent text-sm text-pplx-text placeholder:text-pplx-muted outline-none"
              autoFocus
            />
            <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-pplx-bg border border-pplx-border text-[10px] text-pplx-muted font-mono">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-80 overflow-y-auto py-2">
            {filtered.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-pplx-muted">
                No commands match &quot;{query}&quot;
              </div>
            ) : (
              Object.entries(grouped).map(([cat, items]) => (
                <div key={cat}>
                  <div className="px-4 pt-2 pb-1">
                    <span className="text-[10px] font-medium text-pplx-muted uppercase tracking-wider">
                      {categoryLabels[cat] ?? cat}
                    </span>
                  </div>
                  {items.map(item => {
                    flatIndex++;
                    const idx = flatIndex;
                    return (
                      <button
                        key={item.id}
                        onClick={() => execute(item)}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-2 text-left transition-colors",
                          idx === selectedIndex
                            ? "bg-pplx-accent/10 text-pplx-text"
                            : "text-pplx-muted hover:bg-white/5 hover:text-pplx-text"
                        )}
                      >
                        <span className={cn(idx === selectedIndex ? "text-pplx-accent" : "")}>{item.icon}</span>
                        <span className="flex-1 text-sm">{item.label}</span>
                        {item.badge && (
                          <span className="px-1.5 py-0.5 rounded-md text-[9px] font-medium bg-pplx-accent/20 text-pplx-accent">
                            {item.badge}
                          </span>
                        )}
                        {item.shortcut && (
                          <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-pplx-bg border border-pplx-border text-pplx-muted">
                            {item.shortcut}
                          </kbd>
                        )}
                        <ArrowRight size={12} className={cn("opacity-0 transition-opacity", idx === selectedIndex && "opacity-50")} />
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-pplx-border">
            <div className="flex items-center gap-1 text-[10px] text-pplx-muted">
              <Command size={10} />
              <span>K to toggle</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-pplx-muted">
              <span>↑↓ navigate</span>
              <span>↵ select</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

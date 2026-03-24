"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  Plus,
  ChevronDown,
  Menu,
  X,
  User,
  Monitor,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MODEL_CONFIGS, type ModelId } from "@/lib/types";
import { PERSONAS, getStoredPersonaId, setStoredPersonaId } from "@/lib/personas";
import { NAV_ITEMS } from "@/lib/constants";
import { HandoffTrayTrigger } from "@/components/handoff-tray";

export function Sidebar() {
  const pathname = usePathname();
  const [selectedModel, setSelectedModel] = useState<ModelId>("auto");
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [recentTasks, setRecentTasks] = useState<Array<{ id: string; title: string; status: string }>>([]);
  const [activePersona, setActivePersona] = useState("default");
  const [showPersonaDropdown, setShowPersonaDropdown] = useState(false);

  // Load persona on mount
  useEffect(() => {
    setActivePersona(getStoredPersonaId());
    const handler = (e: Event) => {
      const custom = e as CustomEvent;
      setActivePersona(custom.detail as string);
    };
    window.addEventListener("persona-changed", handler);
    return () => window.removeEventListener("persona-changed", handler);
  }, []);

  // Fetch recent tasks
  useEffect(() => {
    async function fetchRecent() {
      try {
        const res = await fetch("/api/tasks?limit=5");
        if (res.ok) {
          const tasks = await res.json() as Array<{ id: string; title: string; status: string }>;
          setRecentTasks(tasks.slice(0, 5));
        }
      } catch { /* ignore */ }
    }
    fetchRecent();
    const interval = setInterval(fetchRecent, 10000);
    return () => clearInterval(interval);
  }, []);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Persist model selection
  useEffect(() => {
    const saved = localStorage.getItem("ottomate_model");
    if (saved) setSelectedModel(saved as ModelId);
  }, []);

  function selectModel(model: ModelId) {
    setSelectedModel(model);
    localStorage.setItem("ottomate_model", model);
    setShowModelDropdown(false);
  }

  const currentModel = MODEL_CONFIGS.find(m => m.id === selectedModel) || MODEL_CONFIGS[0];

  const statusDotColor = (status: string) => {
    if (status === "running") return "bg-pplx-accent animate-pulse";
    if (status === "completed") return "bg-green-400";
    if (status === "failed") return "bg-red-400";
    return "bg-pplx-muted";
  };

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="px-4 mb-6">
        <Link href="/computer" className="flex items-center gap-2.5 group">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 via-pink-500 to-orange-500 flex items-center justify-center">
            <Monitor size={14} className="text-white" />
          </div>
          <span className="text-sm font-semibold text-pplx-text">Ottomate</span>
        </Link>
      </div>

      {/* New Computer Task */}
      <div className="px-3 mb-4">
        <Link
          href="/computer"
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg bg-pplx-accent/10 hover:bg-pplx-accent/20 text-pplx-accent text-sm font-medium transition-colors"
        >
          <Plus size={14} />
          New Task
        </Link>
      </div>

      {/* Nav links */}
      <nav className="px-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          // Determine if this item matches the current pathname
          const matches = item.exact
            ? pathname === item.href || pathname === "/computer/new"
            : pathname.startsWith(item.href) && item.href !== "/computer";
          // Only highlight if no more-specific sibling route also matches
          const isActive = matches && !NAV_ITEMS.some(
            (other) => other.href !== item.href
              && other.href.startsWith(item.href)
              && pathname.startsWith(other.href)
          );

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm mb-0.5 transition-colors",
                isActive
                  ? "bg-white/5 text-pplx-text font-medium"
                  : "text-pplx-muted hover:text-pplx-text hover:bg-white/[0.03]"
              )}
            >
              <Icon size={15} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Recent Tasks */}
      {recentTasks.length > 0 && (
        <div className="px-3 mt-4">
          <div className="flex items-center justify-between px-3 mb-2">
            <p className="text-[10px] font-medium text-pplx-muted uppercase tracking-wider">Recent</p>
          </div>
          <div className="space-y-0.5">
            {recentTasks.map((t) => {
              const isActive = pathname === `/computer/tasks/${t.id}`;
              return (
                <Link
                  key={t.id}
                  href={`/computer/tasks/${t.id}`}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors group",
                    isActive
                      ? "bg-white/5 text-pplx-text"
                      : "text-pplx-muted hover:text-pplx-text hover:bg-white/[0.03]"
                  )}
                >
                  <div className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", statusDotColor(t.status))} />
                  <span className="truncate flex-1">{t.title}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Media Shelf / Handoff trigger */}
      <div className="px-3 mt-3">
        <HandoffTrayTrigger />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom: Persona + Model Selector */}
      <div className="px-3 mt-auto border-t border-pplx-border pt-4">
        {/* Persona selector */}
        <div className="relative mb-2">
          <button
            onClick={() => setShowPersonaDropdown(!showPersonaDropdown)}
            className="w-full px-3 py-2 rounded-lg bg-pplx-card border border-pplx-border hover:border-pplx-muted/50 transition-colors"
          >
            <div className="flex items-center gap-1.5 text-xs text-pplx-muted">
              <User size={11} />
              <span className="flex-1 text-left truncate">
                {PERSONAS.find(p => p.id === activePersona)?.icon || "⚖️"}{" "}
                {PERSONAS.find(p => p.id === activePersona)?.name || "Balanced"}
              </span>
              <ChevronDown size={11} className={cn("transition-transform", showPersonaDropdown && "rotate-180")} />
            </div>
          </button>
          {showPersonaDropdown && (
            <div className="absolute bottom-full left-0 right-0 mb-1 bg-pplx-card border border-pplx-border rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto">
              {PERSONAS.map((persona) => (
                <button
                  key={persona.id}
                  onClick={() => {
                    setStoredPersonaId(persona.id);
                    setActivePersona(persona.id);
                    setShowPersonaDropdown(false);
                    window.dispatchEvent(new CustomEvent("persona-changed", { detail: persona.id }));
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2 text-xs hover:bg-white/5 transition-colors first:rounded-t-lg last:rounded-b-lg",
                    activePersona === persona.id ? "bg-pplx-accent/10 text-pplx-accent" : "text-pplx-muted hover:text-pplx-text"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span>{persona.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{persona.name}</p>
                      <p className="text-[10px] opacity-70 truncate">{persona.description}</p>
                    </div>
                    {activePersona === persona.id && (
                      <div className="w-1.5 h-1.5 rounded-full bg-pplx-accent flex-shrink-0" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Model selector */}
        <div className="relative">
          <button
            onClick={() => setShowModelDropdown(!showModelDropdown)}
            className="w-full px-3 py-2 rounded-lg bg-pplx-card border border-pplx-border hover:border-pplx-muted/50 transition-colors"
          >
            <div className="flex items-center gap-1.5 text-xs text-pplx-muted">
              <div className="w-2 h-2 rounded-full bg-pplx-accent animate-pulse" />
              <span className="flex-1 text-left truncate">{currentModel.icon} {currentModel.name}</span>
              <ChevronDown size={11} className={cn("transition-transform", showModelDropdown && "rotate-180")} />
            </div>
          </button>
          
          {showModelDropdown && (
            <div className="absolute bottom-full left-0 right-0 mb-1 bg-pplx-card border border-pplx-border rounded-lg shadow-xl z-50 max-h-72 overflow-y-auto">
              {MODEL_CONFIGS.map((model) => (
                <button
                  key={model.id}
                  onClick={() => selectModel(model.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 text-xs hover:bg-white/5 transition-colors first:rounded-t-lg last:rounded-b-lg",
                    selectedModel === model.id ? "bg-pplx-accent/10 text-pplx-accent" : "text-pplx-muted hover:text-pplx-text"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span>{model.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{model.name}</p>
                      <p className="text-[10px] opacity-70 truncate">{model.description}</p>
                    </div>
                    {selectedModel === model.id && (
                      <div className="w-1.5 h-1.5 rounded-full bg-pplx-accent flex-shrink-0" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <p className="px-3 mt-2 text-[10px] text-pplx-muted/40 text-center">
          Ottomate v2.0 · Multi-Agent AI
        </p>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-pplx-card border border-pplx-border text-pplx-text hover:bg-white/5 transition-colors"
        aria-label="Open menu"
      >
        <Menu size={18} />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={cn(
          "md:hidden fixed inset-y-0 left-0 z-50 w-[260px] bg-pplx-sidebar border-r border-pplx-border flex flex-col py-4 transform transition-transform duration-200",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Close button */}
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-3 p-1.5 rounded-lg text-pplx-muted hover:text-pplx-text hover:bg-white/5 transition-colors"
        >
          <X size={16} />
        </button>
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-[220px] min-h-screen bg-pplx-sidebar border-r border-pplx-border flex-col py-4">
        {sidebarContent}
      </aside>
    </>
  );
}

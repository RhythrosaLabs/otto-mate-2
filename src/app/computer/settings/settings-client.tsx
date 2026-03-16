"use client";

import { useState, useEffect } from "react";
import {
  Settings,
  Shield,
  Cpu,
  Search,
  DollarSign,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Save,
  Command,
  Palette,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MODEL_CONFIGS } from "@/lib/types";
import type { HealthInfo } from "@/lib/types";
import { THEMES, applyTheme, getStoredThemeId } from "@/lib/themes";

export function SettingsClient() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Local form state
  const [defaultModel, setDefaultModel] = useState("auto");
  const [maxTokenBudget, setMaxTokenBudget] = useState("500000");
  const [maxCostBudget, setMaxCostBudget] = useState("5.00");
  const [maxIterations, setMaxIterations] = useState("50");
  const [verboseMode, setVerboseMode] = useState(false);
  const [activeTheme, setActiveTheme] = useState("default");

  useEffect(() => {
    Promise.all([
      fetch("/api/settings").then(r => r.json()),
      fetch("/api/settings?section=health").then(r => r.json()),
    ]).then(([s, h]) => {
      setSettings(s as Record<string, string>);
      setHealth(h as HealthInfo);
      // Populate form from saved settings
      const ss = s as Record<string, string>;
      if (ss.default_model) setDefaultModel(ss.default_model);
      if (ss.max_token_budget) setMaxTokenBudget(ss.max_token_budget);
      if (ss.max_cost_budget) setMaxCostBudget(ss.max_cost_budget);
      if (ss.max_iterations) setMaxIterations(ss.max_iterations);
      if (ss.verbose_mode === "true") setVerboseMode(true);
      setActiveTheme(getStoredThemeId());
    }).catch(console.error);
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            default_model: defaultModel,
            max_token_budget: maxTokenBudget,
            max_cost_budget: maxCostBudget,
            max_iterations: maxIterations,
            verbose_mode: verboseMode ? "true" : "false",
          },
        }),
      });
      // Also update local model preference
      localStorage.setItem("ottomatron_model", defaultModel);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Save failed:", err);
    }
    setSaving(false);
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pplx-accent to-indigo-500 flex items-center justify-center">
            <Settings size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-pplx-text">Settings</h1>
            <p className="text-xs text-pplx-muted">Configure Ottomatron preferences &amp; budgets</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
            saved
              ? "bg-green-500/20 text-green-400 border border-green-500/30"
              : "bg-pplx-accent text-white hover:bg-pplx-accent-hover"
          )}
        >
          {saving ? <RefreshCw size={14} className="animate-spin" /> : saved ? <CheckCircle2 size={14} /> : <Save size={14} />}
          {saved ? "Saved" : "Save"}
        </button>
      </div>

      {/* System Health */}
      {health && (
        <div className="rounded-xl border border-pplx-border bg-pplx-card p-5">
          <h2 className="text-sm font-medium text-pplx-text mb-4 flex items-center gap-2">
            <Shield size={14} className="text-pplx-accent" />
            System Health
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <h3 className="text-xs text-pplx-muted mb-2 flex items-center gap-1.5">
                <Cpu size={11} /> AI Providers
              </h3>
              <div className="space-y-1.5">
                {health.providers.map(p => (
                  <div key={p.name} className="flex items-center gap-2 text-xs">
                    {p.configured ? (
                      <CheckCircle2 size={12} className="text-green-400" />
                    ) : (
                      <XCircle size={12} className="text-red-400/60" />
                    )}
                    <span className={p.configured ? "text-pplx-text" : "text-pplx-muted"}>{p.name}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-xs text-pplx-muted mb-2 flex items-center gap-1.5">
                <Search size={11} /> Search Providers
              </h3>
              <div className="space-y-1.5">
                {health.search.map(s => (
                  <div key={s.name} className="flex items-center gap-2 text-xs">
                    {s.configured ? (
                      <CheckCircle2 size={12} className="text-green-400" />
                    ) : (
                      <XCircle size={12} className="text-pplx-muted/40" />
                    )}
                    <span className={s.configured ? "text-pplx-text" : "text-pplx-muted/60"}>{s.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-pplx-border/50 flex items-center gap-2 text-xs">
            {health.db_ok ? (
              <><CheckCircle2 size={12} className="text-green-400" /><span className="text-pplx-text">Database: connected</span></>
            ) : (
              <><XCircle size={12} className="text-red-400" /><span className="text-red-400">Database: error</span></>
            )}
          </div>
        </div>
      )}

      {/* General Settings */}
      <div className="rounded-xl border border-pplx-border bg-pplx-card p-5">
        <h2 className="text-sm font-medium text-pplx-text mb-4 flex items-center gap-2">
          <Cpu size={14} className="text-pplx-accent" />
          General
        </h2>
        <div className="space-y-4">
          {/* Default Model */}
          <div>
            <label className="text-xs text-pplx-muted mb-1 block">Default Model</label>
            <select
              value={defaultModel}
              onChange={e => setDefaultModel(e.target.value)}
              className="w-full bg-pplx-bg border border-pplx-border rounded-lg px-3 py-2 text-sm text-pplx-text outline-none focus:border-pplx-accent/50"
            >
              {MODEL_CONFIGS.map(m => (
                <option key={m.id} value={m.id}>{m.icon} {m.name}</option>
              ))}
            </select>
          </div>

          {/* Max Iterations */}
          <div>
            <label className="text-xs text-pplx-muted mb-1 block">Max Agent Iterations</label>
            <input
              type="number"
              value={maxIterations}
              onChange={e => setMaxIterations(e.target.value)}
              min={5}
              max={200}
              className="w-full bg-pplx-bg border border-pplx-border rounded-lg px-3 py-2 text-sm text-pplx-text outline-none focus:border-pplx-accent/50"
            />
            <p className="text-[10px] text-pplx-muted mt-1">Maximum tool-use loops per task (default: 50)</p>
          </div>

          {/* Verbose Mode */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-xs text-pplx-text block">Verbose Mode</label>
              <p className="text-[10px] text-pplx-muted">Show detailed reasoning steps in agent output</p>
            </div>
            <button
              onClick={() => setVerboseMode(!verboseMode)}
              className={cn(
                "w-10 h-5 rounded-full transition-colors relative",
                verboseMode ? "bg-pplx-accent" : "bg-pplx-border"
              )}
            >
              <div className={cn(
                "w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform",
                verboseMode ? "translate-x-5" : "translate-x-0.5"
              )} />
            </button>
          </div>
        </div>
      </div>

      {/* Budget Limits */}
      <div className="rounded-xl border border-pplx-border bg-pplx-card p-5">
        <h2 className="text-sm font-medium text-pplx-text mb-4 flex items-center gap-2">
          <DollarSign size={14} className="text-pplx-accent" />
          Budget Limits
        </h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-pplx-muted mb-1 block">Max Tokens per Task</label>
            <input
              type="number"
              value={maxTokenBudget}
              onChange={e => setMaxTokenBudget(e.target.value)}
              min={10000}
              step={10000}
              className="w-full bg-pplx-bg border border-pplx-border rounded-lg px-3 py-2 text-sm text-pplx-text outline-none focus:border-pplx-accent/50"
            />
          </div>
          <div>
            <label className="text-xs text-pplx-muted mb-1 block">Max Cost per Task (USD)</label>
            <input
              type="number"
              value={maxCostBudget}
              onChange={e => setMaxCostBudget(e.target.value)}
              min={0.01}
              step={0.5}
              className="w-full bg-pplx-bg border border-pplx-border rounded-lg px-3 py-2 text-sm text-pplx-text outline-none focus:border-pplx-accent/50"
            />
          </div>
        </div>
        <p className="text-[10px] text-pplx-muted mt-2">Tasks exceeding these limits will pause and ask for confirmation</p>
      </div>

      {/* Visual Themes (Otto-inspired — 14+ switchable themes) */}
      <div className="rounded-xl border border-pplx-border bg-pplx-card p-5">
        <h2 className="text-sm font-medium text-pplx-text mb-4 flex items-center gap-2">
          <Palette size={14} className="text-pplx-accent" />
          Visual Theme
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {THEMES.map(theme => (
            <button
              key={theme.id}
              onClick={() => {
                setActiveTheme(theme.id);
                applyTheme(theme.id);
              }}
              className={cn(
                "relative rounded-xl border p-3 text-left transition-all group overflow-hidden",
                activeTheme === theme.id
                  ? "border-pplx-accent bg-pplx-accent/5 ring-1 ring-pplx-accent/30"
                  : "border-pplx-border hover:border-pplx-muted/50"
              )}
            >
              {/* Color preview strip */}
              <div className="flex gap-1 mb-2.5">
                {[theme.colors.bg, theme.colors.card, theme.colors.accent, theme.colors.text].map((c, i) => (
                  <div
                    key={i}
                    className="w-5 h-5 rounded-md border border-black/20"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm">{theme.icon}</span>
                <span className="text-xs font-medium text-pplx-text">{theme.name}</span>
              </div>
              <p className="text-[10px] text-pplx-muted mt-0.5 line-clamp-1">{theme.description}</p>
              {activeTheme === theme.id && (
                <div className="absolute top-2 right-2">
                  <CheckCircle2 size={14} className="text-pplx-accent" />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Keyboard Shortcuts Reference */}
      <div className="rounded-xl border border-pplx-border bg-pplx-card p-5">
        <h2 className="text-sm font-medium text-pplx-text mb-4 flex items-center gap-2">
          <Command size={14} className="text-pplx-accent" />
          Keyboard Shortcuts
        </h2>
        <div className="grid sm:grid-cols-2 gap-2">
          {[
            { keys: "⌘ + K", desc: "Command palette" },
            { keys: "⌘ + N", desc: "New task" },
            { keys: "⌘ + ,", desc: "Settings" },
            { keys: "/", desc: "Slash commands (in input)" },
            { keys: "↑ ↓", desc: "Navigate menus" },
            { keys: "Enter", desc: "Submit / Select" },
            { keys: "Escape", desc: "Close modal / palette" },
          ].map(s => (
            <div key={s.keys} className="flex items-center justify-between py-1.5" >
              <span className="text-xs text-pplx-muted">{s.desc}</span>
              <kbd className="text-[10px] font-mono px-2 py-0.5 rounded bg-pplx-bg border border-pplx-border text-pplx-muted">
                {s.keys}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

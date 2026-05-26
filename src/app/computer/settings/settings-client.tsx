"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Settings,
  Shield,
  Cpu,
  DollarSign,
  RefreshCw,
  CheckCircle2,
  RotateCcw,
  XCircle,
  Save,
  Palette,
  Search,
  LayoutGrid,
  Gift,
  Tag,
  Home,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MODEL_CONFIGS } from "@/lib/types";
import type { HealthInfo } from "@/lib/types";
import { THEMES, applyTheme, getStoredThemeId } from "@/lib/themes";
import { OPTIONAL_NAV_ITEMS } from "@/lib/constants";

const FEATURES_KEY = "ottomate_enabled_features";

function readEnabledFeatures(): Set<string> {
  try {
    const raw = localStorage.getItem(FEATURES_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveEnabledFeatures(features: Set<string>) {
  localStorage.setItem(FEATURES_KEY, JSON.stringify([...features]));
  window.dispatchEvent(new CustomEvent("features-changed"));
}

export function SettingsClient() {
  const router = useRouter();
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);

  // Gift code
  const [giftCode, setGiftCode] = useState("");
  const [giftLoading, setGiftLoading] = useState(false);
  const [giftResult, setGiftResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.ok ? r.json() : null).then(d => {
      if (d?.user?.role === "admin" || d?.user?.is_admin) setIsAdmin(true);
    }).catch(() => {});
  }, []);

  async function redeemGiftCode() {
    if (!giftCode.trim()) return;
    setGiftLoading(true);
    setGiftResult(null);
    try {
      const res = await fetch("/api/gift-codes/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: giftCode.trim() }),
      });
      const d = await res.json();
      if (res.ok) {
        setGiftResult({ ok: true, msg: d.message ?? "Code redeemed!" });
        setGiftCode("");
        // Refresh page so subscription badge updates
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setGiftResult({ ok: false, msg: d.error ?? "Redemption failed" });
      }
    } catch {
      setGiftResult({ ok: false, msg: "Network error" });
    }
    setGiftLoading(false);
  }

  // Optional sidebar features
  const [enabledFeatures, setEnabledFeatures] = useState<Set<string>>(new Set());

  useEffect(() => {
    setEnabledFeatures(readEnabledFeatures());
  }, []);

  function toggleFeature(href: string) {
    const next = new Set(enabledFeatures);
    if (next.has(href)) next.delete(href); else next.add(href);
    setEnabledFeatures(next);
    saveEnabledFeatures(next);
  }

  // Local form state
  const [defaultModel, setDefaultModel] = useState("auto");
  const [maxTokenBudget, setMaxTokenBudget] = useState("500000");
  const [maxCostBudget, setMaxCostBudget] = useState("5.00");
  const [maxIterations, setMaxIterations] = useState("75");
  const [verboseMode, setVerboseMode] = useState(false);
  const [activeTheme, setActiveTheme] = useState("default");

  // LM Studio settings
  const [lmsBaseURL, setLmsBaseURL] = useState("http://localhost:1234/v1");
  const [lmsModel, setLmsModel] = useState("");
  const [lmsPinging, setLmsPinging] = useState(false);
  const [lmsPingResult, setLmsPingResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [lmsAvailableModels, setLmsAvailableModels] = useState<string[]>([]);
  const [preferLocal, setPreferLocal] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/settings").then(r => { if (!r.ok) throw new Error(`Settings ${r.status}`); return r.json(); }),
      fetch("/api/settings?section=health").then(r => { if (!r.ok) throw new Error(`Health ${r.status}`); return r.json(); }),
    ]).then(([s, h]) => {
      setHealth(h as HealthInfo);
      // Populate form from saved settings
      const ss = s as Record<string, string>;
      if (ss.default_model) setDefaultModel(ss.default_model);
      if (ss.max_token_budget) setMaxTokenBudget(ss.max_token_budget);
      if (ss.max_cost_budget) setMaxCostBudget(ss.max_cost_budget);
      if (ss.max_iterations) setMaxIterations(ss.max_iterations);
      if (ss.verbose_mode === "true") setVerboseMode(true);
      if (ss.lmstudio_base_url) setLmsBaseURL(ss.lmstudio_base_url);
      if (ss.lmstudio_model) setLmsModel(ss.lmstudio_model);
      if (ss.prefer_local === "true") setPreferLocal(true);
      setActiveTheme(getStoredThemeId());

      // Auto-ping LM Studio on settings load so status is visible immediately
      const baseURL = ss.lmstudio_base_url || "http://localhost:1234/v1";
      const pingBase = baseURL.replace(/\/v1\/?$/, "");
      fetch(`/api/settings/lmstudio-ping?base=${encodeURIComponent(pingBase)}`)
        .then(r => r.ok ? r.json() : null)
        .then((d: { ok: boolean; models?: string[]; error?: string } | null) => {
          if (d?.ok) {
            const count = d.models?.length ?? 0;
            setLmsPingResult({ ok: true, msg: count ? `Connected — ${count} model(s) loaded` : "Connected" });
            if (d.models && d.models.length > 0) {
              setLmsAvailableModels(d.models);
              if (!ss.lmstudio_model) setLmsModel(d.models[0]);
            }
            // Sync the health panel so LM Studio shows a green check immediately
            setHealth(prev => prev ? {
              ...prev,
              providers: prev.providers.map(p =>
                p.name === "LM Studio (Local)" ? { ...p, configured: true } : p
              ),
            } : prev);
          } else if (d && !d.ok) {
            setLmsPingResult({ ok: false, msg: d.error || "LM Studio not reachable" });
          }
        })
        .catch(() => { /* not running — silently ignore */ });
    }).catch(console.error);
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const saveRes = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            default_model: defaultModel,
            max_token_budget: maxTokenBudget,
            max_cost_budget: maxCostBudget,
            max_iterations: maxIterations,
            verbose_mode: verboseMode ? "true" : "false",
            lmstudio_base_url: lmsBaseURL,
            lmstudio_model: lmsModel,
            prefer_local: preferLocal ? "true" : "false",
          },
        }),
      });
      if (!saveRes.ok) throw new Error("Save failed");
      // Also update local model preference
      localStorage.setItem("ottomate_model", defaultModel);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Save failed:", err);
      setSaveError(true);
      setTimeout(() => setSaveError(false), 3000);
    }
    setSaving(false);
  }

  async function pingLMStudio() {
    setLmsPinging(true);
    setLmsPingResult(null);
    try {
      const base = lmsBaseURL.replace(/\/v1\/?$/, "");
      const res = await fetch(`/api/settings/lmstudio-ping?base=${encodeURIComponent(base)}`);
      const d = await res.json() as { ok: boolean; models?: string[]; error?: string };
      if (res.ok && d.ok) {
        const count = d.models?.length ?? 0;
        setLmsPingResult({ ok: true, msg: count ? `Connected — ${count} model(s) loaded` : "Connected" });
        if (d.models && d.models.length > 0) {
          setLmsAvailableModels(d.models);
          // Auto-fill model name with the first loaded model if the field is empty
          if (!lmsModel) setLmsModel(d.models[0]);
        }
        // Update health panel green check immediately
        setHealth(prev => prev ? {
          ...prev,
          providers: prev.providers.map(p =>
            p.name === "LM Studio (Local)" ? { ...p, configured: true } : p
          ),
        } : prev);
      } else {
        setLmsPingResult({ ok: false, msg: d.error || "Could not connect to LM Studio" });
        // Clear health panel green check if test explicitly fails
        setHealth(prev => prev ? {
          ...prev,
          providers: prev.providers.map(p =>
            p.name === "LM Studio (Local)" ? { ...p, configured: false } : p
          ),
        } : prev);
      }
    } catch {
      setLmsPingResult({ ok: false, msg: "Could not reach LM Studio server" });
    }
    setLmsPinging(false);
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 via-pink-500 to-orange-500 flex items-center justify-center">
            <Settings size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-pplx-text">Settings</h1>
            <p className="text-xs text-pplx-muted">Configure Ottomate preferences &amp; budgets</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
            saved
              ? "bg-green-500/20 text-green-400 border border-green-500/30"
              : saveError
              ? "bg-red-500/20 text-red-400 border border-red-500/30"
              : "bg-pplx-accent text-white hover:bg-pplx-accent-hover"
          )}
        >
          {saving ? <RefreshCw size={14} className="animate-spin" /> : saved ? <CheckCircle2 size={14} /> : saveError ? <XCircle size={14} /> : <Save size={14} />}
          {saved ? "Saved" : saveError ? "Save Failed" : "Save"}
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

      {/* LM Studio (Local) */}
      <div className="rounded-xl border border-pplx-border bg-pplx-card p-5">
        <h2 className="text-sm font-medium text-pplx-text mb-1 flex items-center gap-2">
          <Home size={14} className="text-pplx-accent" />
          LM Studio (Local)
          <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
            Free
          </span>
        </h2>
        <p className="text-[11px] text-pplx-muted mb-4">
          Run any model locally via LM Studio — zero API cost. Select <strong className="text-pplx-text">LM Studio (Local)</strong> as your model when making requests.
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-pplx-muted mb-1 block">Server URL</label>
            <input
              type="text"
              value={lmsBaseURL}
              onChange={e => setLmsBaseURL(e.target.value)}
              placeholder="http://localhost:1234/v1"
              className="w-full bg-pplx-bg border border-pplx-border rounded-lg px-3 py-2 text-sm text-pplx-text placeholder-pplx-muted outline-none focus:border-pplx-accent/50 font-mono"
            />
            <p className="text-[10px] text-pplx-muted mt-1">Default: http://localhost:1234/v1. Change if you run LM Studio on a different port.</p>
          </div>
          <div>
            <label className="text-xs text-pplx-muted mb-1 block">Model Name</label>
            {lmsAvailableModels.length > 0 ? (
              <select
                value={lmsModel}
                onChange={e => setLmsModel(e.target.value)}
                className="w-full bg-pplx-bg border border-pplx-border rounded-lg px-3 py-2 text-sm text-pplx-text outline-none focus:border-pplx-accent/50 font-mono"
              >
                <option value="">— select a model —</option>
                {lmsAvailableModels.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={lmsModel}
                onChange={e => setLmsModel(e.target.value)}
                placeholder="e.g. qwen3-8b, llama-3.2-3b-instruct"
                className="w-full bg-pplx-bg border border-pplx-border rounded-lg px-3 py-2 text-sm text-pplx-text placeholder-pplx-muted outline-none focus:border-pplx-accent/50 font-mono"
              />
            )}
            <p className="text-[10px] text-pplx-muted mt-1">
              {lmsAvailableModels.length > 0
                ? "Models currently loaded in LM Studio. Load more in the LM Studio app."
                : "Click \"Test connection\" to auto-detect loaded models, or enter manually."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={pingLMStudio}
              disabled={lmsPinging}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-pplx-border text-xs text-pplx-muted hover:text-pplx-text hover:border-pplx-accent/50 transition-all disabled:opacity-50"
            >
              {lmsPinging ? <RefreshCw size={12} className="animate-spin" /> : <Home size={12} />}
              Test connection
            </button>
            {lmsPingResult && (
              <span className={cn("text-xs", lmsPingResult.ok ? "text-green-400" : "text-red-400")}>
                {lmsPingResult.ok ? <CheckCircle2 size={12} className="inline mr-1" /> : <XCircle size={12} className="inline mr-1" />}
                {lmsPingResult.msg}
              </span>
            )}
          </div>
        </div>

        {/* Prefer Local toggle */}
        <div className="mt-4 pt-3 border-t border-pplx-border/50 flex items-center justify-between">
          <div>
            <label className="text-xs text-pplx-text block">Prefer local model when running</label>
            <p className="text-[10px] text-pplx-muted mt-0.5">
              Auto-routing will default to LM Studio for tasks it can handle (coding, writing, analysis).<br />
              Vision, deep-research, and search tasks still use cloud models automatically.
            </p>
          </div>
          <button
            onClick={() => setPreferLocal(!preferLocal)}
            className={cn(
              "w-10 h-5 rounded-full transition-colors relative flex-shrink-0 ml-4",
              preferLocal ? "bg-green-500" : "bg-pplx-border"
            )}
          >
            <div className={cn(
              "w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform",
              preferLocal ? "translate-x-5" : "translate-x-0.5"
            )} />
          </button>
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

      {/* Optional Sidebar Features */}
      <div className="rounded-xl border border-pplx-border bg-pplx-card p-5 opacity-60">
        <h2 className="text-sm font-medium text-pplx-text mb-1 flex items-center gap-2">
          <LayoutGrid size={14} className="text-pplx-accent" />
          Sidebar Features
          <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full bg-pplx-accent/10 text-pplx-accent border border-pplx-accent/20">
            Coming Soon
          </span>
        </h2>
        <p className="text-[11px] text-pplx-muted mb-4">
          Per-user feature toggles are coming soon. These tools will let you customize your sidebar.
        </p>
        <div className="space-y-3 pointer-events-none select-none">
          {Object.entries(OPTIONAL_NAV_ITEMS).map(([href, meta]) => (
            <div
              key={href}
              className="flex items-start gap-3 p-3 rounded-lg border border-pplx-border"
            >
              <div className="mt-0.5 w-4 h-4 rounded flex-shrink-0 border border-pplx-border bg-pplx-bg" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-pplx-muted">{meta.label}</p>
                <p className="text-[10px] text-pplx-muted/70 mt-0.5 leading-relaxed">{meta.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Gift Code */}
      <div className="rounded-xl border border-pplx-border bg-pplx-card p-5">
        <h2 className="text-sm font-medium text-pplx-text mb-1 flex items-center gap-2">
          <Gift size={14} className="text-pplx-accent" />
          Gift Code
        </h2>
        <p className="text-[11px] text-pplx-muted mb-4">
          Have a gift code? Enter it below to unlock premium features.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={giftCode}
            onChange={e => setGiftCode(e.target.value.toUpperCase())}
            placeholder="GIFT-XXXXXXXX"
            className="flex-1 px-3 py-2 rounded-lg bg-pplx-bg border border-pplx-border text-sm text-pplx-text placeholder-pplx-muted focus:outline-none focus:border-pplx-accent font-mono uppercase"
            onKeyDown={e => e.key === "Enter" && redeemGiftCode()}
          />
          <button
            onClick={redeemGiftCode}
            disabled={giftLoading || !giftCode.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-pplx-accent text-white text-xs font-medium disabled:opacity-50 hover:bg-pplx-accent-hover transition-colors"
          >
            <Tag size={12} />
            {giftLoading ? "…" : "Redeem"}
          </button>
        </div>
        {giftResult && (
          <p className={cn("mt-2 text-xs", giftResult.ok ? "text-green-400" : "text-red-400")}>
            {giftResult.msg}
          </p>
        )}
        {isAdmin && (
          <p className="mt-3 text-[11px] text-pplx-muted">
            Admin:{" "}
            <a href="/computer/admin/gift-codes" className="text-pplx-accent hover:underline">
              Generate gift codes →
            </a>
          </p>
        )}
      </div>

      {/* Redo Onboarding */}
      <div className="rounded-xl border border-pplx-border bg-pplx-card p-5">
        <h2 className="text-sm font-medium text-pplx-text mb-1 flex items-center gap-2">
          <RotateCcw size={14} className="text-pplx-accent" />
          Setup Wizard
        </h2>
        <p className="text-[11px] text-pplx-muted mb-4">
          Re-run the setup wizard to add API keys or review onboarding steps.
        </p>
        <button
          onClick={async () => {
            await fetch("/api/settings", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ settings: { onboarding_completed: "false" } }),
            });
            sessionStorage.removeItem("ottomate_onboarding_checked");
            router.push("/computer/onboarding");
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-pplx-border text-xs text-pplx-muted hover:text-pplx-text hover:border-pplx-accent/50 transition-all"
        >
          <RotateCcw size={13} />
          Redo setup wizard
        </button>
      </div>

    </div>
  );
}

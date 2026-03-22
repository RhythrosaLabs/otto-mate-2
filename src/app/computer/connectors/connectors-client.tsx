"use client";

import { useState, useEffect } from "react";
import { Search, CheckCircle2, Plus, X, ExternalLink, Plug } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Connector } from "@/lib/types";

const CATEGORY_LABELS: Record<string, string> = {
  all: "All",
  free: "🆓 Free",
  communication: "Communication",
  social_media: "Social Media",
  storage: "Storage",
  project_management: "Project Management",
  crm: "CRM",
  development: "Development",
  ai: "AI",
  browser: "🌐 Browser",
  data: "Data",
  productivity: "Productivity",
  finance: "Finance",
  marketing: "Marketing",
  automation: "Automation",
  cloud: "Cloud",
  analytics: "Analytics",
  security: "Security",
  ecommerce: "E-commerce",
  music: "🎵 Music",
};

const OAUTH_PROVIDER_LABELS: Record<string, string> = {
  google: "Sign in with Google",
  microsoft: "Sign in with Microsoft",
  github: "Sign in with GitHub",
  notion: "Sign in with Notion",
  dropbox: "Sign in with Dropbox",
};

export function ConnectorsClient({
  connectors,
  connectedIds,
}: {
  connectors: Connector[];
  connectedIds: string[];
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "connected" | "available">("all");
  const [connected, setConnected] = useState<Set<string>>(new Set(connectedIds));
  const [modalConnector, setModalConnector] = useState<Connector | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [banner, setBanner] = useState<{ type: "error" | "success"; message: string } | null>(null);

  // Handle OAuth redirect-back (?connected=gmail or ?error=...)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const c = sp.get("connected");
    const err = sp.get("error");
    if (c) {
      // Mark all connectors whose id matches ones linked by this OAuth provider
      const googleIds = ["gmail", "google_drive", "google_sheets", "google_docs"];
      const msIds = ["outlook", "onedrive", "sharepoint", "teams"];
      let ids = [c];
      if (googleIds.includes(c)) ids = googleIds;
      else if (msIds.includes(c)) ids = msIds;
      setConnected((prev) => new Set([...prev, ...ids]));
      setBanner({ type: "success", message: `Successfully connected ${c}` });
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (err) {
      setBanner({ type: "error", message: decodeURIComponent(err) });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const filtered = connectors.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.description.toLowerCase().includes(search.toLowerCase());
    const matchesCat =
      category === "all" ||
      (category === "free" ? c.is_free : c.category === category);
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "connected" ? connected.has(c.id) : !connected.has(c.id));
    return matchesSearch && matchesCat && matchesStatus;
  });

  const categories = [
    "all",
    "free",
    ...Array.from(new Set(connectors.map((c) => c.category))),
  ];

  async function handleConnect(connector: Connector) {
    if (connected.has(connector.id)) {
      // Disconnect: remove from DB and clear env key
      await fetch(`/api/connectors/${connector.id}`, { method: "DELETE" });
      if (connector.env_key) {
        await fetch("/api/connectors/env", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: connector.env_key }),
        });
      }
      setConnected((prev) => {
        const next = new Set(prev);
        next.delete(connector.id);
        return next;
      });
      setBanner({ type: "success", message: `Disconnected ${connector.name}` });
    } else if (connector.auth_type === "free") {
      // Free connectors (like Browser Use) — connect immediately, enable via env
      setIsConnecting(true);
      try {
        await fetch("/api/connectors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: connector.id }),
        });
        if (connector.env_key) {
          await fetch("/api/connectors/env", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ keys: { [connector.env_key]: "true" } }),
          });
        }
        setConnected((prev) => new Set([...prev, connector.id]));
        setBanner({ type: "success", message: `Connected ${connector.name}` });
      } finally {
        setIsConnecting(false);
      }
    } else {
      setModalConnector(connector);
      setApiKey("");
    }
  }

  function handleOAuth(connector: Connector) {
    if (!connector.oauth_provider) return;
    window.location.href = `/api/auth/oauth/${connector.oauth_provider}?connector=${connector.id}`;
  }

  async function submitConnect() {
    if (!modalConnector) return;
    setIsConnecting(true);
    try {
      // Save to connector DB
      await fetch("/api/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: modalConnector.id, api_key: apiKey }),
      });

      // Auto-save to .env.local if env_key is defined
      if (modalConnector.env_key && apiKey.trim()) {
        await fetch("/api/connectors/env", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keys: { [modalConnector.env_key]: apiKey.trim() } }),
        });
      }

      setConnected((prev) => new Set([...prev, modalConnector.id]));
      setBanner({ type: "success", message: `Connected ${modalConnector.name}${modalConnector.env_key ? " — API key saved to .env.local" : ""}` });
      setModalConnector(null);
    } finally {
      setIsConnecting(false);
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Banner for OAuth success/error */}
      {banner && (
        <div
          className={cn(
            "mb-4 px-4 py-3 rounded-xl text-sm flex items-center justify-between",
            banner.type === "error"
              ? "bg-red-500/10 border border-red-500/20 text-red-400"
              : "bg-green-500/10 border border-green-500/20 text-green-400"
          )}
        >
          <span>{banner.message}</span>
          <button onClick={() => setBanner(null)} className="ml-3 hover:opacity-70">
            <X size={14} />
          </button>
        </div>
      )}

      <div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 via-pink-500 to-orange-500 flex items-center justify-center">
            <Plug size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-pplx-text">Connectors</h1>
            <p className="text-xs text-pplx-muted">
              {connected.size} connected · {connectors.length} available
            </p>
          </div>
        </div>
      </div>

      {/* Status tabs: All / Connected / Available */}
      <div className="flex items-center gap-1 mb-4 border-b border-pplx-border pb-3">
        {(["all", "connected", "available"] as const).map((tab) => {
          const count =
            tab === "all"
              ? connectors.length
              : tab === "connected"
              ? connected.size
              : connectors.length - connected.size;
          return (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize flex items-center gap-1.5",
                statusFilter === tab
                  ? "bg-pplx-accent/15 text-pplx-accent"
                  : "text-pplx-muted hover:text-pplx-text hover:bg-white/5"
              )}
            >
              {tab}
              <span className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-full",
                statusFilter === tab ? "bg-pplx-accent/20 text-pplx-accent" : "bg-pplx-border text-pplx-muted"
              )}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search + filter */}
      <div className="flex gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-pplx-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search connectors..."
            className="w-full bg-pplx-card border border-pplx-border rounded-xl pl-9 pr-4 py-2.5 text-sm text-pplx-text placeholder:text-pplx-muted outline-none focus:border-pplx-accent/50 transition-colors"
          />
        </div>
      </div>

      {/* Category chips */}
      <div className="flex items-center gap-2 flex-wrap mb-6">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap",
              category === cat
                ? "bg-pplx-accent/20 text-pplx-accent border border-pplx-accent/40"
                : "bg-pplx-card text-pplx-muted border border-pplx-border hover:text-pplx-text hover:border-pplx-muted"
            )}
          >
            {CATEGORY_LABELS[cat] || cat}
          </button>
        ))}
      </div>

      {/* Connector grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((connector) => {
          const isConnected = connected.has(connector.id);
          return (
            <div
              key={connector.id}
              className={cn(
                "connector-card rounded-xl border p-4 flex flex-col gap-3",
                isConnected ? "border-pplx-accent/30 bg-pplx-accent/5" : "border-pplx-border bg-pplx-card"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-pplx-bg flex items-center justify-center border border-pplx-border flex-shrink-0 overflow-hidden">
                    {connector.icon_url ? (
                      <img src={connector.icon_url} alt={connector.name} className="w-5 h-5 object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <span className="text-xs text-pplx-muted">{connector.name[0]}</span>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-medium text-pplx-text leading-tight">{connector.name}</p>
                      {connector.is_free && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                          Free
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-pplx-muted capitalize">{connector.category.replace("_", " ")}</p>
                  </div>
                </div>
                {isConnected && (
                  <CheckCircle2 size={14} className="text-pplx-accent flex-shrink-0 mt-0.5" />
                )}
              </div>

              <p className="text-xs text-pplx-muted leading-relaxed flex-1">{connector.description}</p>

              <button
                onClick={() => handleConnect(connector)}
                className={cn(
                  "w-full py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5",
                  isConnected
                    ? "bg-red-400/10 text-red-400 hover:bg-red-400/20"
                    : "bg-pplx-accent/15 text-pplx-accent hover:bg-pplx-accent/25"
                )}
              >
                {isConnected ? (
                  <>
                    <X size={11} />
                    Disconnect
                  </>
                ) : (
                  <>
                    <Plus size={11} />
                    Connect
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Connect modal */}
      {modalConnector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setModalConnector(null)} />
          <div className="relative z-10 bg-pplx-card border border-pplx-border rounded-2xl p-6 w-full max-w-md shadow-xl">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-pplx-bg border border-pplx-border flex items-center justify-center overflow-hidden">
                {modalConnector.icon_url ? (
                  <img src={modalConnector.icon_url} alt={modalConnector.name} className="w-7 h-7 object-contain" />
                ) : (
                  <span className="text-xl">{modalConnector.name[0]}</span>
                )}
              </div>
              <div>
                <h3 className="text-base font-semibold text-pplx-text">Connect {modalConnector.name}</h3>
                <p className="text-xs text-pplx-muted">{modalConnector.description}</p>
              </div>
            </div>

            {/* Token / API key input — always shown for easy setup */}
            <div className="mb-4">
              <label className="text-xs text-pplx-muted font-medium block mb-1.5">
                {modalConnector.api_key_name || "API Key / Token"}
              </label>
              <input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste your key or token here..."
                type="password"
                className="w-full bg-pplx-bg border border-pplx-border rounded-xl px-3.5 py-2.5 text-sm text-pplx-text placeholder:text-pplx-muted outline-none focus:border-pplx-accent/50 transition-colors"
              />
              {modalConnector.setup_url && (
                <a
                  href={modalConnector.setup_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-pplx-accent hover:underline mt-2"
                >
                  <ExternalLink size={11} />
                  Get your {modalConnector.api_key_name || "API key"}
                </a>
              )}
              {modalConnector.env_key && (
                <p className="text-[10px] text-pplx-muted mt-1.5 bg-pplx-bg/50 px-2 py-1 rounded-lg font-mono">
                  Auto-saves to .env.local as <span className="text-pplx-accent">{modalConnector.env_key}</span>
                </p>
              )}
            </div>

            {/* OAuth option — shown as alternative for OAuth connectors */}
            {modalConnector.auth_type === "oauth" && modalConnector.oauth_provider && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex-1 h-px bg-pplx-border" />
                  <span className="text-[10px] text-pplx-muted uppercase tracking-wider">or</span>
                  <div className="flex-1 h-px bg-pplx-border" />
                </div>
                <button
                  onClick={() => handleOAuth(modalConnector)}
                  className="w-full py-2 rounded-xl text-xs font-medium bg-pplx-bg border border-pplx-border text-pplx-muted hover:text-pplx-text hover:border-pplx-muted transition-colors flex items-center justify-center gap-2"
                >
                  {OAUTH_PROVIDER_LABELS[modalConnector.oauth_provider] || "Sign In via OAuth"}
                </button>
              </div>
            )}

            {modalConnector.docs_url && (
              <a
                href={modalConnector.docs_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-pplx-accent hover:underline mb-4"
              >
                <ExternalLink size={11} />
                View documentation
              </a>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setModalConnector(null)}
                className="flex-1 py-2 rounded-xl text-sm font-medium bg-pplx-bg border border-pplx-border text-pplx-muted hover:text-pplx-text transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitConnect}
                disabled={!apiKey.trim() || isConnecting}
                className="flex-1 py-2 rounded-xl text-sm font-medium bg-pplx-accent text-white hover:bg-pplx-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isConnecting ? "Connecting..." : "Connect"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

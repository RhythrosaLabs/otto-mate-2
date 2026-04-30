"use client";

import { useState, useEffect } from "react";
import { Gift, Plus, Copy, CheckCircle2, Loader2, Lock, Crown } from "lucide-react";
import { cn } from "@/lib/utils";

type TierName = "free" | "starter" | "pro" | "agency";

interface GiftCode {
  id: string;
  code: string;
  tier: TierName;
  duration_days: number;
  created_by: string | null;
  redeemed_by: string | null;
  redeemed_at: string | null;
  expires_at: string | null;
  created_at: string;
}

const TIER_COLORS: Record<TierName, string> = {
  free: "text-pplx-muted",
  starter: "text-blue-400",
  pro: "text-violet-400",
  agency: "text-amber-400",
};

export function AdminGiftCodesClient() {
  const [codes, setCodes] = useState<GiftCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  // Create form
  const [tier, setTier] = useState<TierName>("pro");
  const [days, setDays] = useState("30");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/gift-codes")
      .then(r => {
        if (r.status === 403) { setForbidden(true); return null; }
        return r.json();
      })
      .then(d => { if (d) setCodes(d.codes ?? []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function createCode() {
    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch("/api/admin/gift-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, duration_days: parseInt(days, 10) }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed");
      setCodes(prev => [d.code, ...prev]);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Error");
    }
    setCreating(false);
  }

  async function copyCode(code: string) {
    try { await navigator.clipboard.writeText(code); } catch { /* ignore */ }
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  }

  if (loading) return (
    <div className="flex items-center justify-center h-60">
      <Loader2 size={24} className="animate-spin text-pplx-muted" />
    </div>
  );

  if (forbidden) return (
    <div className="flex flex-col items-center justify-center gap-4 h-60 text-center">
      <Lock size={32} className="text-pplx-muted" />
      <p className="text-sm text-pplx-muted">Admin access required.</p>
    </div>
  );

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
          <Crown size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-pplx-text">Gift Codes</h1>
          <p className="text-xs text-pplx-muted">Generate and track premium gift codes</p>
        </div>
      </div>

      {/* Create form */}
      <div className="rounded-xl border border-pplx-border bg-pplx-card p-5 space-y-4">
        <h2 className="text-sm font-medium text-pplx-text flex items-center gap-2">
          <Plus size={14} className="text-pplx-accent" /> Generate new code
        </h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <label className="text-[10px] text-pplx-muted uppercase tracking-wide">Tier</label>
            <select
              value={tier}
              onChange={e => setTier(e.target.value as TierName)}
              className="px-3 py-2 rounded-lg bg-pplx-bg border border-pplx-border text-sm text-pplx-text focus:outline-none focus:border-pplx-accent"
            >
              <option value="starter">Starter ($12/mo)</option>
              <option value="pro">Pro ($39/mo)</option>
              <option value="agency">Agency ($99/mo)</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-pplx-muted uppercase tracking-wide">Duration (days)</label>
            <input
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={e => setDays(e.target.value)}
              className="w-24 px-3 py-2 rounded-lg bg-pplx-bg border border-pplx-border text-sm text-pplx-text focus:outline-none focus:border-pplx-accent"
            />
          </div>
          <button
            onClick={createCode}
            disabled={creating}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-pplx-accent text-white text-sm font-medium disabled:opacity-50 hover:bg-pplx-accent-hover transition-colors"
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Gift size={14} />}
            Generate
          </button>
        </div>
        {createError && <p className="text-xs text-red-400">{createError}</p>}
      </div>

      {/* Codes table */}
      <div className="rounded-xl border border-pplx-border bg-pplx-card overflow-hidden">
        <div className="px-5 py-3 border-b border-pplx-border bg-pplx-bg">
          <p className="text-xs text-pplx-muted">{codes.length} code{codes.length !== 1 ? "s" : ""} total</p>
        </div>
        {codes.length === 0 ? (
          <div className="py-12 text-center text-sm text-pplx-muted">No codes yet — generate one above.</div>
        ) : (
          <div className="divide-y divide-pplx-border/50">
            {codes.map(c => (
              <div key={c.id} className="flex items-center gap-3 px-5 py-3">
                <code className="font-mono text-sm text-pplx-text flex-shrink-0">{c.code}</code>
                <button
                  onClick={() => copyCode(c.code)}
                  className="p-1 rounded text-pplx-muted hover:text-pplx-text transition-colors"
                >
                  {copied === c.code ? <CheckCircle2 size={12} className="text-green-400" /> : <Copy size={12} />}
                </button>
                <span className={cn("text-xs font-medium ml-1", TIER_COLORS[c.tier])}>{c.tier}</span>
                <span className="text-[11px] text-pplx-muted">{c.duration_days}d</span>
                <div className="ml-auto text-right">
                  {c.redeemed_by ? (
                    <span className="text-[10px] text-pplx-muted line-through">{c.redeemed_at?.slice(0, 10)}</span>
                  ) : (
                    <span className="text-[10px] text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">Available</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

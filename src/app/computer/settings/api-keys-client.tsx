"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface StoredKey {
  key_name: string;
  set: boolean;
  updated_at: string;
}

interface Subscription {
  tier: string;
  status: string;
  tasks_used_this_month: number;
  usage_reset_at: string;
}

interface TierLimits {
  label: string;
  price_monthly: number;
  tasks_per_month: number;
  features: string[];
}

const KEY_LABELS: Record<string, { label: string; url: string }> = {
  ANTHROPIC_API_KEY: { label: "Anthropic (Claude)", url: "https://console.anthropic.com/keys" },
  OPENAI_API_KEY: { label: "OpenAI (GPT)", url: "https://platform.openai.com/api-keys" },
  GOOGLE_AI_API_KEY: { label: "Google AI (Gemini)", url: "https://aistudio.google.com/app/apikey" },
  PERPLEXITY_API_KEY: { label: "Perplexity", url: "https://www.perplexity.ai/settings/api" },
  OPENROUTER_API_KEY: { label: "OpenRouter", url: "https://openrouter.ai/keys" },
  REPLICATE_API_KEY: { label: "Replicate", url: "https://replicate.com/account/api-tokens" },
  LUMA_API_KEY: { label: "Luma AI", url: "https://lumalabs.ai/dream-machine/api" },
  HUGGINGFACE_API_KEY: { label: "Hugging Face", url: "https://huggingface.co/settings/tokens" },
};

export default function ApiKeysPage() {
  const [storedKeys, setStoredKeys] = useState<Record<string, StoredKey>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [subscription, setSubscription] = useState<{ subscription: Subscription; limits: TierLimits } | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    fetchKeys();
    fetchSubscription();
  }, []);

  async function fetchKeys() {
    const res = await fetch("/api/user/keys");
    if (res.ok) {
      const data = await res.json() as StoredKey[];
      const map: Record<string, StoredKey> = {};
      for (const k of data) map[k.key_name] = k;
      setStoredKeys(map);
    }
  }

  async function fetchSubscription() {
    const res = await fetch("/api/user/subscription");
    if (res.ok) setSubscription(await res.json());
  }

  async function saveKey(keyName: string) {
    if (!inputValue.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/user/keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key_name: keyName, key_value: inputValue.trim() }),
      });
      if (res.ok) {
        setMessage({ text: "Key saved and encrypted", type: "success" });
        setEditingKey(null);
        setInputValue("");
        fetchKeys();
      } else {
        const d = await res.json() as { error: string };
        setMessage({ text: d.error, type: "error" });
      }
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  }

  async function removeKey(keyName: string) {
    const res = await fetch(`/api/user/keys?key_name=${keyName}`, { method: "DELETE" });
    if (res.ok) {
      setMessage({ text: "Key removed", type: "success" });
      fetchKeys();
      setTimeout(() => setMessage(null), 2000);
    }
  }

  const TIER_COLORS: Record<string, string> = {
    free: "#6b7280", starter: "#3b82f6", pro: "#8b5cf6", agency: "#f59e0b",
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      {/* Subscription card */}
      {subscription && (
        <div className="rounded-xl border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide"
                style={{ background: TIER_COLORS[subscription.subscription.tier] + "30", color: TIER_COLORS[subscription.subscription.tier] }}
              >
                {subscription.limits.label} plan
              </span>
              {subscription.limits.price_monthly > 0 && (
                <span className="ml-2 text-sm" style={{ color: "var(--muted)" }}>${subscription.limits.price_monthly}/mo</span>
              )}
            </div>
            <Link href="/pricing" className="text-sm font-medium" style={{ color: "var(--accent)" }}>
              Upgrade →
            </Link>
          </div>

          {/* Usage bar */}
          {subscription.limits.tasks_per_month !== -1 && (
            <div>
              <div className="flex justify-between text-xs mb-1.5" style={{ color: "var(--muted)" }}>
                <span>Tasks this month</span>
                <span>{subscription.subscription.tasks_used_this_month} / {subscription.limits.tasks_per_month}</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (subscription.subscription.tasks_used_this_month / subscription.limits.tasks_per_month) * 100)}%`,
                    background: TIER_COLORS[subscription.subscription.tier],
                  }}
                />
              </div>
              <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                Resets {new Date(subscription.subscription.usage_reset_at).toLocaleDateString()}
              </p>
            </div>
          )}
          {subscription.limits.tasks_per_month === -1 && (
            <p className="text-sm" style={{ color: "var(--muted)" }}>Unlimited tasks ✓</p>
          )}
        </div>
      )}

      {/* API Keys */}
      <div>
        <h2 className="text-lg font-semibold mb-1" style={{ color: "var(--text)" }}>Your API Keys</h2>
        <p className="text-sm mb-5" style={{ color: "var(--muted)" }}>
          Keys are encrypted at rest with AES-256-GCM. They&apos;re used instead of any server-side keys when you run tasks.
        </p>

        {message && (
          <div
            className="mb-4 text-sm px-3 py-2 rounded-lg"
            style={{ background: message.type === "success" ? "#1a3a1a" : "#3f1a1a", color: message.type === "success" ? "#4ade80" : "#f87171" }}
          >
            {message.text}
          </div>
        )}

        <div className="space-y-3">
          {Object.entries(KEY_LABELS).map(([keyName, { label, url }]) => {
            const stored = storedKeys[keyName];
            const isEditing = editingKey === keyName;

            return (
              <div
                key={keyName}
                className="rounded-xl border p-4"
                style={{ background: "var(--sidebar)", borderColor: stored ? "var(--border)" : "var(--border)" }}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium" style={{ color: "var(--text)" }}>{label}</span>
                    {stored && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#1a3a1a", color: "#4ade80" }}>Saved</span>
                    )}
                  </div>
                  <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs" style={{ color: "var(--muted)" }}>
                    Get key →
                  </a>
                </div>
                <p className="text-xs mb-3 font-mono" style={{ color: "var(--muted)" }}>{keyName}</p>

                {isEditing ? (
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      placeholder="sk-..."
                      autoFocus
                      className="flex-1 px-3 py-1.5 rounded-lg border text-sm font-mono outline-none"
                      style={{ background: "var(--bg)", borderColor: "var(--accent)", color: "var(--text)" }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveKey(keyName);
                        if (e.key === "Escape") { setEditingKey(null); setInputValue(""); }
                      }}
                    />
                    <button
                      onClick={() => saveKey(keyName)}
                      disabled={saving}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-60"
                      style={{ background: "var(--accent)", color: "#fff" }}
                    >
                      Save
                    </button>
                    <button
                      onClick={() => { setEditingKey(null); setInputValue(""); }}
                      className="px-3 py-1.5 rounded-lg text-sm"
                      style={{ background: "var(--border)", color: "var(--muted)" }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setEditingKey(keyName); setInputValue(""); }}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium"
                      style={{ background: "var(--card)", color: "var(--text)", border: "1px solid var(--border)" }}
                    >
                      {stored ? "Update" : "Add key"}
                    </button>
                    {stored && (
                      <button
                        onClick={() => removeKey(keyName)}
                        className="px-3 py-1.5 rounded-lg text-sm"
                        style={{ background: "var(--card)", color: "#f87171", border: "1px solid var(--border)" }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

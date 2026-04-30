"use client";

import Link from "next/link";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TIERS } from "@/lib/db";
import type { TierName } from "@/lib/db";

const TIER_ORDER: TierName[] = ["free", "starter", "pro", "agency"];

const HIGHLIGHTS: Record<string, { color: string; badge?: string }> = {
  free: { color: "#6b7280" },
  starter: { color: "#3b82f6" },
  pro: { color: "#8b5cf6", badge: "Most popular" },
  agency: { color: "#f59e0b" },
};

export default function PricingPage() {
  return (
    <Suspense>
      <PricingContent />
    </Suspense>
  );
}

function PricingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [currentTier, setCurrentTier] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.user) {
          setIsLoggedIn(true);
          setCurrentTier(data.subscription?.tier ?? "free");
        } else {
          setIsLoggedIn(false);
        }
      })
      .catch(() => setIsLoggedIn(false));
  }, []);

  useEffect(() => {
    const upgrade = searchParams.get("upgrade");
    if (upgrade === "success") {
      setToast({ type: "success", msg: "Subscription activated! Welcome to your new plan." });
      router.replace("/pricing");
    } else if (upgrade === "cancelled") {
      setToast({ type: "error", msg: "Checkout cancelled. Your plan has not changed." });
      router.replace("/pricing");
    }
  }, [searchParams, router]);

  async function handleCTA(tierName: TierName) {
    if (tierName === "free") {
      router.push("/auth/register");
      return;
    }
    if (!isLoggedIn) {
      router.push(`/auth/register?next=/pricing`);
      return;
    }
    setLoadingTier(tierName);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: tierName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");
      window.location.href = data.url;
    } catch (err) {
      setToast({ type: "error", msg: err instanceof Error ? err.message : "Checkout failed" });
      setLoadingTier(null);
    }
  }

  async function handleManageBilling() {
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not open billing portal");
      window.location.href = data.url;
    } catch (err) {
      setToast({ type: "error", msg: err instanceof Error ? err.message : "Billing portal unavailable" });
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)", color: "var(--text)" }}>

      {/* Toast */}
      {toast && (
        <div
          className="fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-sm font-medium shadow-lg flex items-center gap-3"
          style={{
            background: toast.type === "success" ? "#22c55e" : "#ef4444",
            color: "#fff",
            maxWidth: "360px",
          }}
        >
          <span>{toast.msg}</span>
          <button className="opacity-70 hover:opacity-100 flex-shrink-0" onClick={() => setToast(null)}>✕</button>
        </div>
      )}

      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b max-w-6xl mx-auto" style={{ borderColor: "var(--border)" }}>
        <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
          <span>🖥️</span>
          <span>Ottomate</span>
        </Link>
        <div className="flex items-center gap-3">
          {isLoggedIn ? (
            <>
              {currentTier && currentTier !== "free" && (
                <button
                  onClick={handleManageBilling}
                  className="text-sm px-4 py-2 rounded-lg border transition-colors hover:opacity-80"
                  style={{ borderColor: "var(--border)", color: "var(--text)" }}
                >
                  Manage billing
                </button>
              )}
              <Link href="/computer" className="text-sm px-4 py-2 rounded-lg font-medium transition-opacity hover:opacity-80"
                style={{ background: "var(--accent)", color: "#fff" }}>
                Open app
              </Link>
            </>
          ) : (
            <>
              <Link href="/auth/login" className="text-sm px-4 py-2 rounded-lg border transition-colors hover:opacity-80"
                style={{ borderColor: "var(--border)", color: "var(--text)" }}>
                Sign in
              </Link>
              <Link href="/auth/register" className="text-sm px-4 py-2 rounded-lg font-medium transition-opacity hover:opacity-80"
                style={{ background: "var(--accent)", color: "#fff" }}>
                Get started free
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero */}
      <div className="text-center py-16 px-4">
        <h1 className="text-4xl font-bold mb-4">Simple, transparent pricing</h1>
        <p className="text-lg max-w-xl mx-auto" style={{ color: "var(--muted)" }}>
          Start free. Scale as your automation grows. All plans include your own API keys.
        </p>
      </div>

      {/* Tier grid */}
      <div className="max-w-6xl mx-auto px-4 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {TIER_ORDER.map((tierName) => {
            const tier = TIERS[tierName];
            const { color, badge } = HIGHLIGHTS[tierName];
            const isPro = tierName === "pro";
            const isCurrent = currentTier === tierName;

            return (
              <div
                key={tierName}
                className="rounded-2xl border p-6 flex flex-col relative"
                style={{
                  background: isPro ? "var(--card)" : "var(--sidebar)",
                  borderColor: isCurrent ? "#22c55e" : isPro ? color : "var(--border)",
                  boxShadow: isCurrent ? "0 0 0 1px #22c55e40" : isPro ? `0 0 0 1px ${color}40` : undefined,
                }}
              >
                {isCurrent && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-semibold px-3 py-1 rounded-full"
                    style={{ background: "#22c55e", color: "#fff" }}>
                    Current plan
                  </span>
                )}
                {!isCurrent && badge && (
                  <span
                    className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-semibold px-3 py-1 rounded-full"
                    style={{ background: color, color: "#fff" }}
                  >
                    {badge}
                  </span>
                )}

                {/* Header */}
                <div className="mb-6">
                  <h2 className="text-lg font-semibold" style={{ color }}>
                    {tier.label}
                  </h2>
                  <div className="mt-2 flex items-end gap-1">
                    <span className="text-3xl font-bold" style={{ color: "var(--text)" }}>
                      {tier.price_monthly === 0 ? "Free" : `$${tier.price_monthly}`}
                    </span>
                    {tier.price_monthly > 0 && (
                      <span className="text-sm mb-1" style={{ color: "var(--muted)" }}>/mo</span>
                    )}
                  </div>
                  <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
                    {tier.description}
                  </p>
                </div>

                {/* CTA */}
                <button
                  onClick={() => handleCTA(tierName)}
                  disabled={isCurrent || loadingTier === tierName}
                  className="w-full text-center py-2.5 rounded-lg font-medium text-sm transition-opacity hover:opacity-80 mb-6 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={
                    isPro && !isCurrent
                      ? { background: color, color: "#fff" }
                      : { background: "var(--card)", color: "var(--text)", border: `1px solid var(--border)` }
                  }
                >
                  {loadingTier === tierName
                    ? "Redirecting…"
                    : isCurrent
                    ? "Current plan"
                    : tier.price_monthly === 0
                    ? "Start for free"
                    : "Get started"}
                </button>

                {/* Features */}
                <ul className="space-y-2.5 flex-1">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <span className="mt-0.5 flex-shrink-0" style={{ color }}>✓</span>
                      <span style={{ color: "var(--text)" }}>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Comparison footnote */}
        <div className="mt-12 rounded-xl border p-6" style={{ borderColor: "var(--border)", background: "var(--sidebar)" }}>
          <h3 className="font-semibold mb-3">All plans include</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm" style={{ color: "var(--muted)" }}>
            {[
              "🔑 Bring your own API keys (no markup)",
              "🔒 AES-256 encrypted key storage",
              "🧠 Persistent AI memory & context",
              "📡 Real-time streaming output",
              "🔄 Automatic model failover",
              "📂 Full task history & audit trail",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div className="mt-12 max-w-2xl mx-auto space-y-6">
          <h3 className="text-xl font-semibold text-center">Frequently asked questions</h3>
          {[
            {
              q: "Do I need to provide my own API keys?",
              a: "Yes — Ottomate uses your API keys to connect to AI providers. You pay the provider directly at their rates with zero markup from us. Your keys are encrypted with AES-256 and never logged.",
            },
            {
              q: "What counts as a 'task'?",
              a: "One task is one complete agent run — from your prompt to the final result. Multi-step reasoning, tool use, and retries within a single run all count as one task.",
            },
            {
              q: "What is computer use?",
              a: "Computer use lets Ottomate control a real browser or desktop to complete tasks — filling forms, scraping sites, clicking buttons, and navigating apps just like a human would. Available on Pro and Agency plans.",
            },
            {
              q: "Can I upgrade or downgrade anytime?",
              a: "Yes. Upgrades take effect immediately after payment. Downgrades apply at the start of your next billing cycle so you never lose access mid-month.",
            },
            {
              q: "How does payment work?",
              a: "Payments are processed securely by Stripe. We never store your card details. You'll be redirected to Stripe's hosted checkout page and returned to Ottomate after payment.",
            },
          ].map(({ q, a }) => (
            <div key={q}>
              <h4 className="font-medium mb-1" style={{ color: "var(--text)" }}>{q}</h4>
              <p className="text-sm" style={{ color: "var(--muted)" }}>{a}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-16 pb-8 text-center text-xs" style={{ color: "var(--muted)" }}>
        Created by{" "}
        <a
          href="https://github.com/RhythrosaLabs"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:opacity-80"
        >
          Dan Sheils
        </a>
        {" · "}
        <a
          href="https://github.com/RhythrosaLabs/otto-mate-2"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:opacity-80"
        >
          View on GitHub
        </a>
      </footer>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Rocket,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Loader2,
  KeyRound,
  Zap,
  Brain,
  Globe,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: "welcome", title: "Welcome" },
  { id: "keys", title: "Add API Key" },
  { id: "done", title: "Launch!" },
] as const;

const KEY_OPTIONS = [
  {
    id: "ANTHROPIC_API_KEY",
    label: "Anthropic (Claude)",
    placeholder: "sk-ant-...",
    url: "https://console.anthropic.com/settings/keys",
    recommended: true,
  },
  {
    id: "OPENAI_API_KEY",
    label: "OpenAI (GPT-4o, o1)",
    placeholder: "sk-...",
    url: "https://platform.openai.com/api-keys",
  },
  {
    id: "GOOGLE_AI_API_KEY",
    label: "Google (Gemini)",
    placeholder: "AIza...",
    url: "https://aistudio.google.com/apikey",
  },
] as const;

export function OnboardingClient() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>(KEY_OPTIONS[0].id);
  const [keyValue, setKeyValue] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  async function saveKey() {
    if (!keyValue.trim()) return;
    setLoading(true);
    setSaveError("");
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyName: selectedProvider, keyValue: keyValue.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save key");
      }
      setKeySaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save key");
    }
    setLoading(false);
  }

  async function completeOnboarding() {
    setLoading(true);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { onboarding_completed: "true" } }),
      });
      router.push("/computer");
    } catch {
      router.push("/computer");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all",
                  i < step
                    ? "bg-green-500/20 text-green-400 border border-green-500/30"
                    : i === step
                    ? "bg-pplx-accent text-white"
                    : "bg-pplx-card border border-pplx-border text-pplx-muted"
                )}
              >
                {i < step ? <CheckCircle2 size={14} /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn("w-8 h-0.5 rounded", i < step ? "bg-green-500/30" : "bg-pplx-border")} />
              )}
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-pplx-border bg-pplx-card p-8">

          {/* Step 0 — Welcome */}
          {step === 0 && (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-violet-500 via-pink-500 to-orange-500 flex items-center justify-center mb-5">
                <Sparkles size={28} className="text-white" />
              </div>
              <h2 className="text-xl font-semibold text-pplx-text mb-2">Welcome to Ottomate</h2>
              <p className="text-sm text-pplx-muted mb-6 leading-relaxed">
                Your personal AI workforce. Give it a task in plain English — it researches, codes,
                creates, and automates, all on its own.
              </p>
              <div className="grid grid-cols-3 gap-3 text-left">
                {[
                  { icon: Zap, label: "Autonomous tasks", desc: "Browse, code & create" },
                  { icon: Brain, label: "Persistent memory", desc: "Learns your preferences" },
                  { icon: Globe, label: "30+ connectors", desc: "Email, Slack, Telegram…" },
                ].map((f) => (
                  <div key={f.label} className="rounded-xl bg-pplx-bg p-3 text-center">
                    <f.icon size={18} className="text-pplx-accent mx-auto mb-1.5" />
                    <div className="text-xs font-medium text-pplx-text">{f.label}</div>
                    <div className="text-[10px] text-pplx-muted">{f.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 1 — Add API Key */}
          {step === 1 && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <KeyRound size={18} className="text-pplx-accent" />
                <h2 className="text-lg font-semibold text-pplx-text">Add your first API key</h2>
              </div>
              <p className="text-xs text-pplx-muted mb-5 leading-relaxed">
                Ottomate uses your own API keys — you pay providers directly with no markup.
                Keys are encrypted with AES-256.
              </p>

              {/* Provider selector */}
              <div className="flex gap-2 mb-4 flex-wrap">
                {KEY_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => { setSelectedProvider(opt.id); setKeySaved(false); setKeyValue(""); setSaveError(""); }}
                    className={cn(
                      "text-xs px-3 py-1.5 rounded-lg border transition-all",
                      selectedProvider === opt.id
                        ? "border-pplx-accent bg-pplx-accent/10 text-pplx-accent"
                        : "border-pplx-border text-pplx-muted hover:border-pplx-accent/50"
                    )}
                  >
                    {opt.label}
                    {"recommended" in opt && opt.recommended && <span className="ml-1 opacity-60">(recommended)</span>}
                  </button>
                ))}
              </div>

              {/* Key input */}
              {!keySaved ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showKey ? "text" : "password"}
                        value={keyValue}
                        onChange={(e) => setKeyValue(e.target.value)}
                        placeholder={KEY_OPTIONS.find((o) => o.id === selectedProvider)?.placeholder ?? "API key…"}
                        className="w-full px-3 py-2.5 pr-10 rounded-lg bg-pplx-bg border border-pplx-border text-sm text-pplx-text placeholder-pplx-muted focus:outline-none focus:border-pplx-accent"
                        onKeyDown={(e) => e.key === "Enter" && keyValue.trim() && saveKey()}
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-pplx-muted hover:text-pplx-text"
                      >
                        {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    <button
                      onClick={saveKey}
                      disabled={!keyValue.trim() || loading}
                      className="px-4 py-2.5 rounded-lg bg-pplx-accent text-white text-sm font-medium disabled:opacity-50 hover:bg-pplx-accent-hover transition-colors"
                    >
                      {loading ? <Loader2 size={14} className="animate-spin" /> : "Save"}
                    </button>
                  </div>
                  {saveError && <p className="text-xs text-red-400">{saveError}</p>}
                  <a
                    href={KEY_OPTIONS.find((o) => o.id === selectedProvider)?.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-pplx-accent hover:underline"
                  >
                    Get a free API key <ExternalLink size={10} />
                  </a>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg bg-green-500/10 border border-green-500/20 px-4 py-3">
                  <CheckCircle2 size={16} className="text-green-400" />
                  <span className="text-sm text-green-400 font-medium">Key saved securely!</span>
                </div>
              )}

              <p className="mt-4 text-[10px] text-pplx-muted">
                You can add more keys any time in Settings → API Keys.
              </p>
            </div>
          )}

          {/* Step 2 — Done */}
          {step === 2 && (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center mb-5">
                <Rocket size={28} className="text-white" />
              </div>
              <h2 className="text-xl font-semibold text-pplx-text mb-2">You&apos;re all set!</h2>
              <p className="text-sm text-pplx-muted mb-5 leading-relaxed">
                Just type what you need in plain English. Ottomate handles the rest.
              </p>
              <div className="rounded-xl bg-pplx-bg border border-pplx-border p-4 text-left space-y-2">
                <p className="text-[10px] text-pplx-muted font-medium uppercase tracking-wide mb-3">Try asking:</p>
                {[
                  "Research the latest AI news and write a summary",
                  "Write a Python script that reads a CSV and plots a chart",
                  "/image a futuristic city at sunset, neon lighting",
                ].map((ex) => (
                  <p key={ex} className="text-xs text-pplx-text bg-pplx-card rounded-lg px-3 py-2">
                    &ldquo;{ex}&rdquo;
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-5">
          {step > 0 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="flex items-center gap-1.5 text-sm text-pplx-muted hover:text-pplx-text transition-colors"
            >
              <ArrowLeft size={14} /> Back
            </button>
          ) : (
            <div />
          )}

          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-pplx-accent text-white text-sm font-medium hover:bg-pplx-accent-hover transition-colors"
            >
              {step === 1 && !keySaved ? "Skip for now" : "Continue"}
              <ArrowRight size={14} />
            </button>
          ) : (
            <button
              onClick={completeOnboarding}
              disabled={loading}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 via-pink-500 to-orange-500 text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
              Launch Ottomate
            </button>
          )}
        </div>

        {step < STEPS.length - 1 && (
          <button
            onClick={completeOnboarding}
            className="block mx-auto mt-4 text-xs text-pplx-muted hover:text-pplx-text transition-colors"
          >
            Skip setup →
          </button>
        )}
      </div>
    </div>
  );
}

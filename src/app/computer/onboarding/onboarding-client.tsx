"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  XCircle,
  Cpu,
  Search,
  Rocket,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Shield,
  Zap,
  Brain,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MODEL_CONFIGS } from "@/lib/types";
import type { HealthInfo } from "@/lib/types";

const STEPS = [
  { id: "welcome", title: "Welcome", icon: Sparkles },
  { id: "health", title: "System Check", icon: Shield },
  { id: "model", title: "Default Model", icon: Cpu },
  { id: "done", title: "Ready!", icon: Rocket },
] as const;

export function OnboardingClient() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState("auto");

  useEffect(() => {
    fetch("/api/settings?section=health")
      .then((r) => r.json())
      .then((h) => setHealth(h as HealthInfo))
      .catch(console.error);
  }, []);

  async function completeOnboarding() {
    setLoading(true);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            onboarding_completed: "true",
            default_model: selectedModel,
          },
        }),
      });
      localStorage.setItem("ottomate_model", selectedModel);
      router.push("/computer");
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  const configuredProviders = health?.providers.filter((p) => p.configured).length ?? 0;

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {/* Progress dots */}
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

        {/* Step content */}
        <div className="rounded-2xl border border-pplx-border bg-pplx-card p-8">
          {step === 0 && (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-pplx-accent to-indigo-500 flex items-center justify-center mb-5">
                <Sparkles size={28} className="text-white" />
              </div>
              <h2 className="text-xl font-semibold text-pplx-text mb-2">Welcome to Ottomate</h2>
              <p className="text-sm text-pplx-muted mb-6 leading-relaxed">
                Your AI-powered computer agent that can browse, code, research, generate images,
                and execute complex multi-step tasks autonomously.
              </p>
              <div className="grid grid-cols-3 gap-3 mb-6">
                {[
                  { icon: Zap, label: "15+ Tools", desc: "Search, code, files" },
                  { icon: Brain, label: "Smart Memory", desc: "Learns over time" },
                  { icon: Cpu, label: "Multi-Model", desc: "GPT, Claude, Gemini" },
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

          {step === 1 && (
            <div>
              <h2 className="text-lg font-semibold text-pplx-text mb-1">System Health Check</h2>
              <p className="text-xs text-pplx-muted mb-5">
                Let&apos;s verify your API keys and providers are configured.
              </p>
              {!health ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={20} className="animate-spin text-pplx-muted" />
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-xs font-medium text-pplx-muted mb-2 flex items-center gap-1.5">
                      <Cpu size={11} /> AI Providers
                    </h3>
                    <div className="space-y-1.5">
                      {health.providers.map((p) => (
                        <div key={p.name} className="flex items-center gap-2 text-xs">
                          {p.configured ? (
                            <CheckCircle2 size={13} className="text-green-400" />
                          ) : (
                            <XCircle size={13} className="text-red-400/50" />
                          )}
                          <span className={p.configured ? "text-pplx-text" : "text-pplx-muted"}>
                            {p.name}
                          </span>
                          {p.configured && (
                            <span className="ml-auto text-[10px] text-green-400/70">ready</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xs font-medium text-pplx-muted mb-2 flex items-center gap-1.5">
                      <Search size={11} /> Search Providers
                    </h3>
                    <div className="space-y-1.5">
                      {health.search.map((s) => (
                        <div key={s.name} className="flex items-center gap-2 text-xs">
                          {s.configured ? (
                            <CheckCircle2 size={13} className="text-green-400" />
                          ) : (
                            <XCircle size={13} className="text-pplx-muted/40" />
                          )}
                          <span className={s.configured ? "text-pplx-text" : "text-pplx-muted/60"}>
                            {s.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="pt-2 border-t border-pplx-border/50">
                    <div className="flex items-center gap-2 text-xs">
                      {health.db_ok ? (
                        <>
                          <CheckCircle2 size={12} className="text-green-400" />
                          <span className="text-pplx-text">Database connected</span>
                        </>
                      ) : (
                        <>
                          <XCircle size={12} className="text-red-400" />
                          <span className="text-red-400">Database error</span>
                        </>
                      )}
                    </div>
                  </div>
                  {configuredProviders === 0 && (
                    <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3 text-xs text-yellow-400">
                      No AI providers configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY
                      in your .env.local file.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="text-lg font-semibold text-pplx-text mb-1">Choose Default Model</h2>
              <p className="text-xs text-pplx-muted mb-5">
                Select the AI model to use by default. You can change this per-task later.
              </p>
              <div className="space-y-2">
                {MODEL_CONFIGS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setSelectedModel(m.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all",
                      selectedModel === m.id
                        ? "bg-pplx-accent/10 border border-pplx-accent/40 ring-1 ring-pplx-accent/20"
                        : "bg-pplx-bg border border-pplx-border hover:border-pplx-border/80"
                    )}
                  >
                    <span className="text-lg">{m.icon}</span>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-pplx-text">{m.name}</div>
                      <div className="text-[10px] text-pplx-muted">{m.description}</div>
                    </div>
                    {selectedModel === m.id && <CheckCircle2 size={16} className="text-pplx-accent" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center mb-5">
                <Rocket size={28} className="text-white" />
              </div>
              <h2 className="text-xl font-semibold text-pplx-text mb-2">You&apos;re All Set!</h2>
              <p className="text-sm text-pplx-muted mb-4 leading-relaxed">
                Ottomate is configured and ready. Start your first task using natural language —
                just type what you need.
              </p>
              <div className="rounded-xl bg-pplx-bg border border-pplx-border p-4 text-left mb-2">
                <p className="text-[10px] text-pplx-muted mb-2">Try saying:</p>
                <div className="space-y-1.5 text-xs text-pplx-text">
                  <p>&ldquo;Research the latest AI news and write a summary&rdquo;</p>
                  <p>&ldquo;Create a Python script that generates fibonacci numbers&rdquo;</p>
                  <p>&ldquo;/image a futuristic cityscape at sunset&rdquo;</p>
                </div>
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
              Continue <ArrowRight size={14} />
            </button>
          ) : (
            <button
              onClick={completeOnboarding}
              disabled={loading}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-pplx-accent to-indigo-500 text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
              Get Started
            </button>
          )}
        </div>

        {/* Skip link */}
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

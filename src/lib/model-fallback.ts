/**
 * Centralized Model Fallback System
 *
 * Provides a unified fallback chain for all LLM calls across the app.
 * Order: Anthropic → OpenAI → Google → OpenRouter (DeepSeek free) → Perplexity
 *
 * Usage:
 *   const result = await callLLMWithFallback({ system, user, ... });
 *   // Automatically tries providers in order until one succeeds
 */

// ─── Transient Error Detection ────────────────────────────────────────────────

const TRANSIENT_ERROR_PATTERNS = [
  /rate.?limit/i, /429/i, /overloaded/i, /503/i, /502/i,
  /timeout/i, /ETIMEDOUT/i, /ECONNRESET/i, /server.?error/i,
  /500/i, /capacity/i, /too many requests/i, /resource.?exhausted/i,
  /credit.?balance/i, /insufficient.?funds/i, /billing/i, /quota.?exceeded/i,
  /payment.?required/i, /402/i, /plan.?limit/i,
];

function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return TRANSIENT_ERROR_PATTERNS.some((p) => p.test(msg));
}

// ─── Backoff Delays ──────────────────────────────────────────────────────────

const FALLBACK_BACKOFF_MS = [1000, 3000, 8000, 15000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Provider Definitions ─────────────────────────────────────────────────────

interface ProviderConfig {
  name: string;
  envKey: string;
  /** Default model to use for this provider in fallback scenarios */
  defaultModel: string;
  /** Cheaper/free model for lightweight tasks */
  cheapModel: string;
}

const PROVIDERS: ProviderConfig[] = [
  { name: "anthropic",   envKey: "ANTHROPIC_API_KEY",   defaultModel: "claude-sonnet-4-6",            cheapModel: "claude-3.5-haiku" },
  { name: "openai",      envKey: "OPENAI_API_KEY",      defaultModel: "gpt-4o",                       cheapModel: "gpt-4o-mini" },
  { name: "google",      envKey: "GOOGLE_AI_API_KEY",   defaultModel: "gemini-1.5-pro",               cheapModel: "gemini-2.0-flash" },
  { name: "openrouter",  envKey: "OPENROUTER_API_KEY",  defaultModel: "deepseek/deepseek-chat-v3-0324", cheapModel: "deepseek/deepseek-chat-v3-0324" },
  { name: "perplexity",  envKey: "PERPLEXITY_API_KEY",  defaultModel: "sonar-pro",                    cheapModel: "sonar" },
];

// ─── Provider API Callers ─────────────────────────────────────────────────────

async function callAnthropic(opts: {
  model: string;
  system: string;
  messages: Array<{ role: string; content: string }>;
  maxTokens: number;
  temperature: number;
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
      system: opts.system,
      messages: opts.messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic ${res.status}: ${errText}`);
  }

  const data = await res.json();
  let text = data.content?.[0]?.text || "";
  if (data.stop_reason === "max_tokens") {
    text += "\n\n---\n⚠️ *Response was truncated due to length.*";
  }
  return text;
}

async function callOpenAI(opts: {
  model: string;
  system: string;
  messages: Array<{ role: string; content: string }>;
  maxTokens: number;
  temperature: number;
}): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
      messages: [
        { role: "system", content: opts.system },
        ...opts.messages,
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI ${res.status}: ${errText}`);
  }

  const data = await res.json();
  let text = data.choices?.[0]?.message?.content || "";
  if (data.choices?.[0]?.finish_reason === "length") {
    text += "\n\n---\n⚠️ *Response was truncated due to length.*";
  }
  return text;
}

async function callGoogle(opts: {
  model: string;
  system: string;
  messages: Array<{ role: string; content: string }>;
  maxTokens: number;
  temperature: number;
}): Promise<string> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_AI_API_KEY not set");

  // Use REST API directly to avoid SDK dependency in this utility
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:generateContent?key=${apiKey}`;

  const contents = opts.messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents,
      generationConfig: {
        maxOutputTokens: opts.maxTokens,
        temperature: opts.temperature,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callOpenRouter(opts: {
  model: string;
  system: string;
  messages: Array<{ role: string; content: string }>;
  maxTokens: number;
  temperature: number;
}): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      "X-Title": "Ottomatron",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
      messages: [
        { role: "system", content: opts.system },
        ...opts.messages,
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

async function callPerplexity(opts: {
  model: string;
  system: string;
  messages: Array<{ role: string; content: string }>;
  maxTokens: number;
  temperature: number;
}): Promise<string> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error("PERPLEXITY_API_KEY not set");

  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
      messages: [
        { role: "system", content: opts.system },
        ...opts.messages,
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Perplexity ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// ─── Provider Dispatch ────────────────────────────────────────────────────────

const PROVIDER_CALLERS: Record<
  string,
  (opts: {
    model: string;
    system: string;
    messages: Array<{ role: string; content: string }>;
    maxTokens: number;
    temperature: number;
  }) => Promise<string>
> = {
  anthropic: callAnthropic,
  openai: callOpenAI,
  google: callGoogle,
  openrouter: callOpenRouter,
  perplexity: callPerplexity,
};

// ─── Build Fallback Chain ──────────────────────────────────────────────────────

export interface FallbackStep {
  provider: string;
  model: string;
}

/**
 * Build an ordered fallback chain starting with the preferred provider.
 * Only includes providers whose API keys are configured.
 *
 * @param preferred  - The preferred provider name (e.g. "anthropic")
 * @param preferredModel - The preferred model name
 * @param lightweight - If true, use cheaper models for fallbacks
 */
export function buildFallbackChain(
  preferred?: string,
  preferredModel?: string,
  lightweight = false,
): FallbackStep[] {
  const chain: FallbackStep[] = [];
  const seen = new Set<string>();

  // Add preferred first if its key exists
  if (preferred) {
    const prov = PROVIDERS.find((p) => p.name === preferred);
    if (prov && process.env[prov.envKey]) {
      chain.push({
        provider: prov.name,
        model: preferredModel || (lightweight ? prov.cheapModel : prov.defaultModel),
      });
      seen.add(prov.name);
    }
  }

  // Add remaining providers in priority order
  for (const prov of PROVIDERS) {
    if (seen.has(prov.name)) continue;
    if (!process.env[prov.envKey]) continue;
    chain.push({
      provider: prov.name,
      model: lightweight ? prov.cheapModel : prov.defaultModel,
    });
    seen.add(prov.name);
  }

  return chain;
}

// ─── Main Fallback Caller ─────────────────────────────────────────────────────

export interface LLMCallOptions {
  /** System prompt */
  system: string;
  /** Conversation messages (must end with a user message) */
  messages: Array<{ role: string; content: string }>;
  /** Max output tokens (default: 4096) */
  maxTokens?: number;
  /** Temperature (default: 0.7) */
  temperature?: number;
  /** Preferred provider to try first */
  preferredProvider?: string;
  /** Preferred model name */
  preferredModel?: string;
  /** Use cheaper models for fallbacks */
  lightweight?: boolean;
  /** Callback for logging fallover events */
  onFallback?: (from: FallbackStep, to: FallbackStep, error: string) => void;
}

export interface LLMCallResult {
  text: string;
  provider: string;
  model: string;
  attempts: number;
  /** True if a fallback was used instead of the primary */
  fellBack: boolean;
}

/**
 * Call an LLM with automatic fallback across providers.
 *
 * Tries providers in order: preferred → Anthropic → OpenAI → Google → OpenRouter (DeepSeek) → Perplexity
 * Each provider is tried once. On transient errors, backs off and moves to next.
 * On non-transient errors, also moves to next (since the goal is maximum resilience).
 */
export async function callLLMWithFallback(opts: LLMCallOptions): Promise<LLMCallResult> {
  const chain = buildFallbackChain(
    opts.preferredProvider,
    opts.preferredModel,
    opts.lightweight ?? false,
  );

  if (chain.length === 0) {
    throw new Error(
      "No AI providers configured. Set at least one of: ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_AI_API_KEY, OPENROUTER_API_KEY, PERPLEXITY_API_KEY",
    );
  }

  const maxTokens = opts.maxTokens ?? 4096;
  const temperature = opts.temperature ?? 0.7;
  let lastError: unknown = null;

  for (let i = 0; i < chain.length; i++) {
    const step = chain[i];
    const caller = PROVIDER_CALLERS[step.provider];
    if (!caller) continue;

    // Backoff before retry (not on first attempt)
    if (i > 0) {
      const backoffMs = FALLBACK_BACKOFF_MS[Math.min(i - 1, FALLBACK_BACKOFF_MS.length - 1)];
      const prevStep = chain[i - 1];
      const errMsg = lastError instanceof Error ? lastError.message : String(lastError);

      opts.onFallback?.(prevStep, step, errMsg);

      console.log(
        `[model-fallback] ${prevStep.provider}/${prevStep.model} failed (${errMsg.slice(0, 100)}), ` +
        `falling back to ${step.provider}/${step.model} after ${backoffMs}ms`,
      );
      await sleep(backoffMs);
    }

    try {
      const text = await caller({
        model: step.model,
        system: opts.system,
        messages: opts.messages,
        maxTokens,
        temperature,
      });

      return {
        text,
        provider: step.provider,
        model: step.model,
        attempts: i + 1,
        fellBack: i > 0,
      };
    } catch (err) {
      lastError = err;
      console.error(
        `[model-fallback] ${step.provider}/${step.model} error:`,
        err instanceof Error ? err.message : String(err),
      );
      // Continue to next provider regardless of error type
      // (for maximum resilience — the goal is "always get a response")
    }
  }

  // All providers failed
  throw new Error(
    `All AI providers failed. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

/**
 * Lightweight version: generates short text (titles, summaries, labels).
 * Uses the cheapest available model with minimal tokens.
 */
export async function callLLMLightweight(opts: {
  system: string;
  userMessage: string;
  maxTokens?: number;
}): Promise<string> {
  try {
    const result = await callLLMWithFallback({
      system: opts.system,
      messages: [{ role: "user", content: opts.userMessage }],
      maxTokens: opts.maxTokens ?? 60,
      temperature: 0.3,
      lightweight: true,
    });
    return result.text.trim();
  } catch {
    // If all providers fail for a lightweight call, return empty
    return "";
  }
}

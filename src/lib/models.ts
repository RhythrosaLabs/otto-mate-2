/**
 * Model configurations — runtime data extracted from types.ts
 * Keeps types.ts pure (types only) and adds missing model variants.
 */

import type { ModelConfig } from "./types";

/**
 * Ordered list of free OpenRouter models with tool-calling support.
 * Used when "free" mode is selected — tried in priority order.
 * All verified $0 prompt + $0 completion with `tools` in supported_parameters.
 */
export const FREE_OPENROUTER_MODELS = [
  // Meta-router: auto-selects best free model (200K ctx, multimodal)
  "openrouter/free",
  // Cloaked agents — highest context, tool-calling, agentic
  "openrouter/hunter-alpha",                         // 1M ctx, text+image
  "openrouter/healer-alpha",                         // 262K ctx, multimodal
  // Large free models with tool support
  "nvidia/nemotron-3-super-120b-a12b:free",          // 262K ctx, 120B params
  "qwen/qwen3-next-80b-a3b-instruct:free",          // 262K ctx
  "qwen/qwen3-coder:free",                          // 262K ctx, code-focused
  "stepfun/step-3.5-flash:free",                     // 256K ctx
  "nvidia/nemotron-3-nano-30b-a3b:free",             // 256K ctx
  "minimax/minimax-m2.5:free",                       // 196K ctx
  "openai/gpt-oss-120b:free",                        // 131K ctx, 120B params
  "arcee-ai/trinity-large-preview:free",             // 131K ctx
  "arcee-ai/trinity-mini:free",                      // 131K ctx
  "openai/gpt-oss-20b:free",                         // 131K ctx
  "z-ai/glm-4.5-air:free",                           // 131K ctx
  "google/gemma-3-27b-it:free",                      // 131K ctx, multimodal
  "nvidia/nemotron-nano-12b-v2-vl:free",             // 128K ctx, vision
  "nvidia/nemotron-nano-9b-v2:free",                 // 128K ctx
  "mistralai/mistral-small-3.1-24b-instruct:free",   // 128K ctx, multimodal
  "meta-llama/llama-3.3-70b-instruct:free",          // 128K ctx
  "qwen/qwen3-4b:free",                              // 41K ctx
] as const;

export const MODEL_CONFIGS: ModelConfig[] = [
  {
    id: "auto",
    name: "Auto (Recommended)",
    provider: "anthropic",
    description: "Automatically selects the best model per sub-task",
    best_for: ["everything"],
    icon: "✨",
  },
  {
    id: "claude-opus-4-6",
    name: "Claude Opus 4.6",
    provider: "anthropic",
    description: "Most powerful reasoning engine. Best for complex tasks. $15/$75 per 1M tokens.",
    best_for: ["reasoning", "coding", "analysis"],
    icon: "🧠",
  },
  {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    provider: "anthropic",
    description: "Fast and capable. Best balance of speed and power. $3/$15 per 1M tokens.",
    best_for: ["writing", "general"],
    icon: "⚡",
  },
  {
    id: "claude-3.5-haiku",
    name: "Claude 3.5 Haiku",
    provider: "anthropic",
    description: "Ultra-fast and very cheap. Great for simple tasks. $0.80/$4 per 1M tokens.",
    best_for: ["speed", "lightweight", "cheap"],
    icon: "🪶",
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    description: "Excellent for long-context tasks and broad knowledge. $2.50/$10 per 1M tokens.",
    best_for: ["long_context", "knowledge"],
    icon: "🤖",
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    description: "Fast and economical for lightweight tasks. $0.15/$0.60 per 1M tokens.",
    best_for: ["speed", "lightweight"],
    icon: "🚀",
  },
  {
    id: "gpt-4.1",
    name: "GPT-4.1",
    provider: "openai",
    description: "Latest GPT with strong reasoning and coding. $2/$8 per 1M tokens.",
    best_for: ["reasoning", "coding"],
    icon: "💎",
  },
  {
    id: "gpt-4.1-mini",
    name: "GPT-4.1 Mini",
    provider: "openai",
    description: "Fast GPT-4.1 variant. Great balance of cost and capability. $0.40/$1.60 per 1M tokens.",
    best_for: ["general", "speed"],
    icon: "⚡",
  },
  {
    id: "gpt-4.1-nano",
    name: "GPT-4.1 Nano",
    provider: "openai",
    description: "Ultra-cheap GPT for simple tasks. $0.10/$0.40 per 1M tokens.",
    best_for: ["speed", "cheap", "simple_tasks"],
    icon: "🔹",
  },
  {
    id: "gemini-1.5-pro",
    name: "Gemini 1.5 Pro",
    provider: "google",
    description: "Deep research capabilities with massive context window. $1.25/$5 per 1M tokens.",
    best_for: ["research", "deep_analysis"],
    icon: "🔬",
  },
  {
    id: "gemini-1.5-flash",
    name: "Gemini 1.5 Flash",
    provider: "google",
    description: "Ultra-fast responses for quick queries. $0.075/$0.30 per 1M tokens.",
    best_for: ["speed", "simple_tasks"],
    icon: "⚡",
  },
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    provider: "google",
    description: "Latest Gemini Flash — fast, capable, very affordable. $0.10/$0.40 per 1M tokens.",
    best_for: ["speed", "general", "cheap"],
    icon: "✨",
  },
  {
    id: "openrouter",
    name: "OpenRouter (Any Model)",
    provider: "openrouter", // Uses OpenAI-compatible API
    description: "Access 200+ models via OpenRouter — Llama, Mistral, DeepSeek, Qwen, and more.",
    best_for: ["custom", "variety", "cheap"],
    icon: "🌐",
  },
  {
    id: "free",
    name: "Free (OpenRouter)",
    provider: "openrouter",
    description: "Zero-cost inference via OpenRouter free models — Nemotron, Qwen, Llama, Gemma & more.",
    best_for: ["free", "cheap", "lightweight"],
    icon: "🆓",
  },
  {
    id: "sonar",
    name: "Perplexity Sonar",
    provider: "perplexity",
    description: "Real-time web-augmented AI search.",
    best_for: ["current_events", "web_research"],
    icon: "🔍",
  },
  {
    id: "sonar-pro",
    name: "Perplexity Sonar Pro",
    provider: "perplexity",
    description: "Advanced web-augmented search with deeper analysis and more sources.",
    best_for: ["deep_research", "current_events", "web_research"],
    icon: "🔎",
  },
  {
    id: "sonar-reasoning-pro",
    name: "Perplexity Sonar Reasoning Pro",
    provider: "perplexity",
    description: "Multi-step reasoning with real-time web search and chain-of-thought.",
    best_for: ["reasoning", "analysis", "web_research"],
    icon: "🧪",
  },
];

/**
 * Get a model config by ID, falling back to the first config (auto).
 */
export function getModelConfig(id: string): ModelConfig {
  return MODEL_CONFIGS.find(m => m.id === id) || MODEL_CONFIGS[0];
}

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
    description: "Most powerful reasoning engine. Best for complex tasks. $5/$25 per 1M tokens. 1M context.",
    best_for: ["reasoning", "coding", "analysis"],
    icon: "🧠",
  },
  {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    provider: "anthropic",
    description: "Fast and capable. Best balance of speed and power. $3/$15 per 1M tokens. 1M context.",
    best_for: ["writing", "general", "coding"],
    icon: "⚡",
  },
  {
    id: "claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    provider: "anthropic",
    description: "Ultra-fast and cheap. Great for simple tasks. $1/$5 per 1M tokens. 200K context.",
    best_for: ["speed", "lightweight", "cheap"],
    icon: "🪶",
  },
  {
    id: "gpt-5.4",
    name: "GPT-5.4",
    provider: "openai",
    description: "Latest GPT with strong reasoning, coding, vision, and computer use. $2.50/$15 per 1M tokens. 1M context, 128K output.",
    best_for: ["reasoning", "coding", "long_context", "knowledge"],
    icon: "🤖",
  },
  {
    id: "gpt-5.4-mini",
    name: "GPT-5.4 Mini",
    provider: "openai",
    description: "Fast and balanced. Great for general tasks. $0.75/$4.50 per 1M tokens. 400K context.",
    best_for: ["general", "speed"],
    icon: "🚀",
  },
  {
    id: "gpt-5.4-nano",
    name: "GPT-5.4 Nano",
    provider: "openai",
    description: "Ultra-cheap GPT for simple tasks. $0.20/$1.25 per 1M tokens. 400K context.",
    best_for: ["speed", "cheap", "simple_tasks"],
    icon: "🔹",
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "google",
    description: "Advanced reasoning with massive context. Deep research and analysis. $1.25/$10 per 1M tokens.",
    best_for: ["research", "deep_analysis", "reasoning"],
    icon: "🔬",
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "google",
    description: "Best price-performance. Fast, capable, very affordable. $0.15/$0.60 per 1M tokens.",
    best_for: ["speed", "general", "cheap"],
    icon: "✨",
  },
  {
    id: "gemini-2.5-flash-lite",
    name: "Gemini 2.5 Flash-Lite",
    provider: "google",
    description: "Ultra-cheap Gemini for simple queries. $0.02/$0.10 per 1M tokens.",
    best_for: ["speed", "cheap", "simple_tasks"],
    icon: "💨",
  },
  {
    id: "gemini-2.5-nano",
    name: "Gemini 2.5 Nano",
    provider: "google",
    description: "Smallest Gemini model for edge and on-device tasks. $0.01/$0.04 per 1M tokens.",
    best_for: ["edge", "mobile", "speed", "cheap"],
    icon: "🔸",
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
  {
    id: "sonar-deep-research",
    name: "Perplexity Deep Research",
    provider: "perplexity",
    description: "Expert-level multi-step research agent. Exhaustive web analysis with comprehensive reports.",
    best_for: ["deep_research", "expert_research", "comprehensive_analysis"],
    icon: "🔬",
  },
  {
    id: "lmstudio",
    name: "LM Studio (Local)",
    provider: "lmstudio",
    description: "Run any model locally via LM Studio — zero API cost. Requires LM Studio running on localhost:1234.",
    best_for: ["free", "private", "offline", "cheap"],
    icon: "🏠",
  },
];

/**
 * Get a model config by ID, falling back to the first config (auto).
 */
export function getModelConfig(id: string): ModelConfig {
  return MODEL_CONFIGS.find(m => m.id === id) || MODEL_CONFIGS[0];
}

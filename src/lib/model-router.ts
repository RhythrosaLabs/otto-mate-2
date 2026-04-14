/**
 * Model Router — Perplexity Computer-inspired model delegation engine
 *
 * Automatically routes tasks and sub-tasks to the optimal model based on:
 *   1. Task phase (planning → execution → review → summarization)
 *   2. Model capability profiles (reasoning, coding, vision, speed, cost…)
 *   3. Historical performance data (learns which models succeed at what)
 *   4. Cost efficiency (prefers cheaper models at equivalent capability)
 *   5. Complexity assessment (trivial tasks → fast/cheap, complex → powerful)
 *   6. Available API keys (only routes to providers the user has configured)
 *
 * Inspired by:
 *   - e2b-dev/open-computer-use three-model architecture (vision/action/grounding)
 *   - Perplexity Computer's automatic model selection
 *   - OpenClaw's cost-aware model routing
 */

import type { ModelId, Modality } from "./types";

// ─── Task Phases (mirrors Perplexity Computer's three-model delegation) ───────

export type TaskPhase =
  | "planning"        // Break down task → fast/cheap model
  | "execution"       // Do the heavy lifting → strong/specialized model
  | "tool_calling"    // Agentic tool use loop → reliable function-calling model
  | "review"          // Cross-validate output → different model for fresh eyes
  | "summarization"   // Compress/format → fast model
  | "vision"          // Analyze images/screenshots → best vision model
  | "research"        // Web search + synthesis → search-augmented model
  | "code_generation" // Write code → best coding model
  | "creative"        // Writing/brainstorming → creative model
  | "data_analysis";  // Numbers, charts, statistics

// ─── Model Capability Profiles ────────────────────────────────────────────────

export interface ModelCapabilities {
  reasoning: number;       // 0-1: Complex logic, multi-step reasoning
  coding: number;          // 0-1: Code generation, debugging
  vision: number;          // 0-1: Image understanding
  speed: number;           // 0-1: Response latency (1 = fastest)
  cost_efficiency: number; // 0-1: Cost per quality unit (1 = cheapest)
  tool_calling: number;    // 0-1: Function calling reliability
  creativity: number;      // 0-1: Creative/writing tasks
  context_window: number;  // 0-1: Effective context length (normalized)
  search: number;          // 0-1: Built-in web search capability
  instruction_following: number; // 0-1: Precise instruction adherence
}

/**
 * Static capability profiles for every supported model.
 * Values are relative scores (not absolute benchmarks) tuned for routing decisions.
 * These are the "priors" — performance data adjusts them at runtime.
 */
const MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
  // ── Anthropic ──
  "claude-opus-4-6": {
    reasoning: 0.98, coding: 0.96, vision: 0.85, speed: 0.25,
    cost_efficiency: 0.15, tool_calling: 0.95, creativity: 0.95,
    context_window: 0.95, search: 0, instruction_following: 0.97,
  },
  "claude-sonnet-4-6": {
    reasoning: 0.92, coding: 0.94, vision: 0.82, speed: 0.65,
    cost_efficiency: 0.45, tool_calling: 0.95, creativity: 0.88,
    context_window: 0.95, search: 0, instruction_following: 0.93,
  },
  "claude-haiku-4-5": {
    reasoning: 0.75, coding: 0.78, vision: 0.65, speed: 0.92,
    cost_efficiency: 0.80, tool_calling: 0.88, creativity: 0.72,
    context_window: 0.8, search: 0, instruction_following: 0.85,
  },

  // ── OpenAI ──
  "gpt-5.4": {
    reasoning: 0.95, coding: 0.93, vision: 0.95, speed: 0.55,
    cost_efficiency: 0.40, tool_calling: 0.96, creativity: 0.90,
    context_window: 0.98, search: 0.5, instruction_following: 0.94,
  },
  "gpt-5.4-mini": {
    reasoning: 0.82, coding: 0.82, vision: 0.80, speed: 0.88,
    cost_efficiency: 0.82, tool_calling: 0.92, creativity: 0.78,
    context_window: 0.92, search: 0.5, instruction_following: 0.88,
  },
  "gpt-5.4-nano": {
    reasoning: 0.65, coding: 0.65, vision: 0.55, speed: 0.95,
    cost_efficiency: 0.94, tool_calling: 0.82, creativity: 0.60,
    context_window: 0.92, search: 0.3, instruction_following: 0.78,
  },

  // ── Google ──
  "gemini-2.5-pro": {
    reasoning: 0.93, coding: 0.90, vision: 0.92, speed: 0.50,
    cost_efficiency: 0.50, tool_calling: 0.88, creativity: 0.85,
    context_window: 1.0, search: 0.4, instruction_following: 0.90,
  },
  "gemini-2.5-flash": {
    reasoning: 0.82, coding: 0.80, vision: 0.85, speed: 0.90,
    cost_efficiency: 0.88, tool_calling: 0.85, creativity: 0.78,
    context_window: 1.0, search: 0.4, instruction_following: 0.85,
  },
  "gemini-2.5-flash-lite": {
    reasoning: 0.65, coding: 0.60, vision: 0.70, speed: 0.96,
    cost_efficiency: 0.98, tool_calling: 0.75, creativity: 0.60,
    context_window: 1.0, search: 0.3, instruction_following: 0.75,
  },
  "gemini-2.5-nano": {
    reasoning: 0.50, coding: 0.45, vision: 0.55, speed: 0.99,
    cost_efficiency: 0.99, tool_calling: 0.60, creativity: 0.45,
    context_window: 0.5, search: 0.2, instruction_following: 0.65,
  },

  // ── Perplexity (search-augmented) ──
  "sonar": {
    reasoning: 0.65, coding: 0.40, vision: 0, speed: 0.80,
    cost_efficiency: 0.70, tool_calling: 0.2, creativity: 0.55,
    context_window: 0.5, search: 0.92, instruction_following: 0.70,
  },
  "sonar-pro": {
    reasoning: 0.75, coding: 0.50, vision: 0, speed: 0.70,
    cost_efficiency: 0.40, tool_calling: 0.3, creativity: 0.65,
    context_window: 0.6, search: 0.98, instruction_following: 0.75,
  },
  "sonar-reasoning-pro": {
    reasoning: 0.85, coding: 0.55, vision: 0, speed: 0.55,
    cost_efficiency: 0.45, tool_calling: 0.3, creativity: 0.60,
    context_window: 0.6, search: 0.98, instruction_following: 0.80,
  },
  "sonar-deep-research": {
    reasoning: 0.90, coding: 0.50, vision: 0, speed: 0.20,
    cost_efficiency: 0.10, tool_calling: 0.2, creativity: 0.65,
    context_window: 0.6, search: 1.0, instruction_following: 0.88,
  },
};

// ─── Model-to-Provider Mapping ────────────────────────────────────────────────

const MODEL_PROVIDER_MAP: Record<string, { provider: string; envKey: string }> = {
  "claude-opus-4-6":       { provider: "anthropic",  envKey: "ANTHROPIC_API_KEY" },
  "claude-sonnet-4-6":     { provider: "anthropic",  envKey: "ANTHROPIC_API_KEY" },
  "claude-haiku-4-5":      { provider: "anthropic",  envKey: "ANTHROPIC_API_KEY" },
  "gpt-5.4":               { provider: "openai",     envKey: "OPENAI_API_KEY" },
  "gpt-5.4-mini":          { provider: "openai",     envKey: "OPENAI_API_KEY" },
  "gpt-5.4-nano":          { provider: "openai",     envKey: "OPENAI_API_KEY" },
  "gemini-2.5-pro":        { provider: "google",     envKey: "GOOGLE_AI_API_KEY" },
  "gemini-2.5-flash":      { provider: "google",     envKey: "GOOGLE_AI_API_KEY" },
  "gemini-2.5-flash-lite": { provider: "google",     envKey: "GOOGLE_AI_API_KEY" },
  "gemini-2.5-nano":       { provider: "google",     envKey: "GOOGLE_AI_API_KEY" },
  "sonar":                 { provider: "perplexity", envKey: "PERPLEXITY_API_KEY" },
  "sonar-pro":             { provider: "perplexity", envKey: "PERPLEXITY_API_KEY" },
  "sonar-reasoning-pro":   { provider: "perplexity", envKey: "PERPLEXITY_API_KEY" },
  "sonar-deep-research":   { provider: "perplexity", envKey: "PERPLEXITY_API_KEY" },
};

/** Pricing per 1M tokens (input/output USD) — updated April 2026 */
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4-6":       { input: 5,     output: 25 },
  "claude-sonnet-4-6":     { input: 3,     output: 15 },
  "claude-haiku-4-5":      { input: 1,     output: 5 },
  "gpt-5.4":               { input: 2.5,   output: 15 },
  "gpt-5.4-mini":          { input: 0.75,  output: 4.5 },
  "gpt-5.4-nano":          { input: 0.2,   output: 1.25 },
  "gemini-2.5-pro":        { input: 1.25,  output: 10 },
  "gemini-2.5-flash":      { input: 0.15,  output: 0.6 },
  "gemini-2.5-flash-lite": { input: 0.02,  output: 0.1 },
  "gemini-2.5-nano":       { input: 0.01,  output: 0.04 },
  "sonar":                 { input: 1,     output: 1 },
  "sonar-pro":             { input: 3,     output: 15 },
  "sonar-reasoning-pro":   { input: 2,     output: 8 },
  "sonar-deep-research":   { input: 5,     output: 20 },
};

// ─── Complexity Assessment ────────────────────────────────────────────────────

export type TaskComplexity = "trivial" | "simple" | "moderate" | "complex" | "expert";

const COMPLEXITY_SIGNALS: Array<{ pattern: RegExp; weight: number }> = [
  // Expert-level signals
  { pattern: /\b(architect|design system|distributed|concurrency|optimize|benchmark|security audit|cryptograph)\b/i, weight: 4 },
  { pattern: /\b(machine learning|ml model|neural|training|fine.?tun|deep research|comprehensive analysis)\b/i, weight: 4 },
  // Complex signals
  { pattern: /\b(refactor|migrate|integrate|multi.?step|pipeline|workflow|automat|orchestrat)\b/i, weight: 3 },
  { pattern: /\b(full.?stack|backend|frontend|database|api|microservice|deploy)\b/i, weight: 2.5 },
  // Moderate signals
  { pattern: /\b(implement|create|build|develop|write.*code|function|class|component)\b/i, weight: 2 },
  { pattern: /\b(analyze|compare|research|investigate|review|debug)\b/i, weight: 1.5 },
  // Simple signals
  { pattern: /\b(summarize|translate|convert|format|list|find|search|look up)\b/i, weight: 1 },
  { pattern: /\b(explain|what is|how does|define|describe)\b/i, weight: 0.5 },
];

/** Length-based complexity bonus: longer prompts tend to be more complex */
function promptLengthBonus(text: string): number {
  const words = text.split(/\s+/).length;
  if (words > 500) return 3;
  if (words > 200) return 2;
  if (words > 100) return 1;
  if (words > 50) return 0.5;
  return 0;
}

export function assessComplexity(text: string): TaskComplexity {
  let score = promptLengthBonus(text);

  for (const signal of COMPLEXITY_SIGNALS) {
    const matches = text.match(new RegExp(signal.pattern, "gi"));
    if (matches) score += matches.length * signal.weight;
  }

  // Multi-part requests (numbered lists, bullet points)
  const listItems = (text.match(/(?:^|\n)\s*(?:\d+[\.\):]|[-•*])\s/g) || []).length;
  if (listItems >= 5) score += 3;
  else if (listItems >= 3) score += 1.5;

  if (score >= 10) return "expert";
  if (score >= 6) return "complex";
  if (score >= 3) return "moderate";
  if (score >= 1) return "simple";
  return "trivial";
}

// ─── Task Phase Detection ─────────────────────────────────────────────────────

/**
 * Infer which cognitive phase a task or sub-task belongs to.
 * The main agent can also explicitly set the phase.
 */
export function inferTaskPhase(text: string, context?: { isSubAgent?: boolean; agentType?: string }): TaskPhase {
  const lower = text.toLowerCase();

  // Sub-agent type overrides
  if (context?.agentType) {
    const phaseMap: Record<string, TaskPhase> = {
      research: "research",
      code: "code_generation",
      writing: "creative",
      data_analysis: "data_analysis",
      reviewer: "review",
      planner: "planning",
      web_scraper: "tool_calling",
    };
    if (phaseMap[context.agentType]) return phaseMap[context.agentType];
  }

  // Keyword-based phase detection
  if (/\b(plan|break down|outline|decompose|strategy|approach|roadmap)\b/i.test(lower)) return "planning";
  if (/\b(review|check|verify|validate|audit|critique|evaluate|grade)\b/i.test(lower)) return "review";
  if (/\b(summarize|summary|condense|tl;?dr|brief|recap|key points)\b/i.test(lower)) return "summarization";
  if (/\b(screenshot|image|photo|picture|visual|look at|see|observe|analyze.*screen)\b/i.test(lower)) return "vision";
  if (/\b(search|research|find|investigate|explore|look up|latest|news|current)\b/i.test(lower)) return "research";
  if (/\b(code|program|script|function|implement|build|debug|fix|refactor|test|app|website|component)\b/i.test(lower)) return "code_generation";
  if (/\b(write|draft|essay|article|blog|story|poem|creative|brainstorm|invent|content)\b/i.test(lower)) return "creative";
  if (/\b(data|analyze|chart|graph|metrics|statistics|csv|numbers|forecast|plot)\b/i.test(lower)) return "data_analysis";

  return "execution";
}

// ─── Performance Learning ─────────────────────────────────────────────────────

export interface ModelPerformanceRecord {
  model: string;
  task_phase: TaskPhase;
  modality: Modality;
  complexity: TaskComplexity;
  success_count: number;
  failure_count: number;
  total_count: number;
  avg_duration_ms: number;
  avg_cost_usd: number;
}

/**
 * In-memory performance cache, populated from DB at startup.
 * Key format: `${model}::${phase}::${modality}::${complexity}`
 */
const performanceCache = new Map<string, ModelPerformanceRecord>();

function perfKey(model: string, phase: TaskPhase, modality: Modality, complexity: TaskComplexity): string {
  return `${model}::${phase}::${modality}::${complexity}`;
}

/** Feed historical performance data into the router (called at startup) */
export function loadPerformanceData(records: ModelPerformanceRecord[]): void {
  performanceCache.clear();
  for (const r of records) {
    performanceCache.set(perfKey(r.model, r.task_phase, r.modality, r.complexity), r);
  }
}

/** Record an outcome for a model + task combination */
export function recordModelOutcome(
  model: string,
  phase: TaskPhase,
  modality: Modality,
  complexity: TaskComplexity,
  success: boolean,
  durationMs: number,
  costUsd: number,
): void {
  const key = perfKey(model, phase, modality, complexity);
  const existing = performanceCache.get(key) || {
    model, task_phase: phase, modality, complexity,
    success_count: 0, failure_count: 0, total_count: 0,
    avg_duration_ms: 0, avg_cost_usd: 0,
  };
  existing.total_count++;
  if (success) existing.success_count++; else existing.failure_count++;
  // Running averages
  existing.avg_duration_ms += (durationMs - existing.avg_duration_ms) / existing.total_count;
  existing.avg_cost_usd += (costUsd - existing.avg_cost_usd) / existing.total_count;
  performanceCache.set(key, existing);
}

/** Get performance adjustment for a model on a specific task profile */
function getPerformanceBoost(model: string, phase: TaskPhase, modality: Modality, complexity: TaskComplexity): number {
  const key = perfKey(model, phase, modality, complexity);
  const record = performanceCache.get(key);
  if (!record || record.total_count < 3) return 0; // Not enough data

  const successRate = record.success_count / record.total_count;
  // Map success rate to -0.2 .. +0.2 boost
  return (successRate - 0.5) * 0.4;
}

// ─── Model Selection Engine ───────────────────────────────────────────────────

export interface ModelSelection {
  provider: string;
  modelName: string;
  /** Why this model was chosen */
  reasoning: string;
  /** Confidence in the selection (0-1) */
  confidence: number;
  /** Alternative models ranked by score */
  alternatives: Array<{ provider: string; modelName: string; score: number }>;
}

export interface RoutingContext {
  /** User's explicit model choice (overrides routing if not "auto") */
  requestedModel?: ModelId;
  /** Task prompt text */
  taskText: string;
  /** Which cognitive phase */
  phase?: TaskPhase;
  /** Pre-detected modality (optional, will auto-detect) */
  modality?: Modality;
  /** Pre-assessed complexity (optional, will auto-assess) */
  complexity?: TaskComplexity;
  /** Whether this is for a sub-agent */
  isSubAgent?: boolean;
  /** Sub-agent type (research, code, etc.) */
  agentType?: string;
  /** Budget preference */
  budget?: "cheapest" | "balanced" | "best";
  /** Whether the task needs vision capabilities */
  needsVision?: boolean;
  /** Whether the task needs web search */
  needsSearch?: boolean;
}

/**
 * Phase-to-capability weight mapping.
 * Each phase emphasizes different capability dimensions.
 * Weights sum to ~1.0 for the most important dimensions.
 */
const PHASE_WEIGHTS: Record<TaskPhase, Partial<Record<keyof ModelCapabilities, number>>> = {
  planning: {
    reasoning: 0.25, speed: 0.3, cost_efficiency: 0.25, instruction_following: 0.2,
  },
  execution: {
    reasoning: 0.3, tool_calling: 0.25, instruction_following: 0.25, speed: 0.1, cost_efficiency: 0.1,
  },
  tool_calling: {
    tool_calling: 0.4, reasoning: 0.2, speed: 0.15, instruction_following: 0.15, cost_efficiency: 0.1,
  },
  review: {
    reasoning: 0.35, instruction_following: 0.25, creativity: 0.1, cost_efficiency: 0.2, speed: 0.1,
  },
  summarization: {
    speed: 0.35, cost_efficiency: 0.3, creativity: 0.15, instruction_following: 0.2,
  },
  vision: {
    vision: 0.5, reasoning: 0.2, instruction_following: 0.15, speed: 0.15,
  },
  research: {
    search: 0.35, reasoning: 0.25, context_window: 0.15, instruction_following: 0.15, speed: 0.1,
  },
  code_generation: {
    coding: 0.4, reasoning: 0.25, instruction_following: 0.2, tool_calling: 0.15,
  },
  creative: {
    creativity: 0.35, reasoning: 0.15, instruction_following: 0.25, speed: 0.1, cost_efficiency: 0.15,
  },
  data_analysis: {
    reasoning: 0.3, coding: 0.25, instruction_following: 0.2, context_window: 0.15, speed: 0.1,
  },
};

/** Budget multipliers for cost_efficiency weight */
const BUDGET_COST_MULTIPLIER: Record<string, number> = {
  cheapest: 3.0,  // Triple the cost weight
  balanced: 1.0,  // Normal
  best: 0.2,      // Nearly ignore cost
};

/** Complexity → minimum model tier (ensures hard tasks get strong models) */
const COMPLEXITY_MIN_REASONING: Record<TaskComplexity, number> = {
  trivial: 0,
  simple: 0.5,
  moderate: 0.7,
  complex: 0.85,
  expert: 0.92,
};

/** Get list of models that are currently available (have API keys) */
function getAvailableModels(): string[] {
  const available: string[] = [];
  for (const [model, { envKey }] of Object.entries(MODEL_PROVIDER_MAP)) {
    if (process.env[envKey]) available.push(model);
  }
  // OpenRouter free is always available if OPENROUTER_API_KEY is set
  // but we don't include it in capability routing — it's a fallback
  return available;
}

/**
 * Core routing function — Perplexity Computer-style model delegation.
 *
 * Scores every available model against the task requirements and picks the best.
 * Transparent reasoning is returned for debugging/logging.
 */
export function routeModelForTask(ctx: RoutingContext): ModelSelection {
  // 1. Honor explicit model requests (except "auto")
  if (ctx.requestedModel && ctx.requestedModel !== "auto" && ctx.requestedModel !== "free") {
    const mapping = MODEL_PROVIDER_MAP[ctx.requestedModel];
    if (mapping && process.env[mapping.envKey]) {
      return {
        provider: mapping.provider,
        modelName: ctx.requestedModel,
        reasoning: `User explicitly requested ${ctx.requestedModel}`,
        confidence: 1.0,
        alternatives: [],
      };
    }
    // Requested model not available — fall through to auto-routing
  }

  // 2. Free mode → OpenRouter free
  if (ctx.requestedModel === "free") {
    return {
      provider: "openrouter",
      modelName: "openrouter/free",
      reasoning: "Free mode selected — routing to OpenRouter free tier",
      confidence: 1.0,
      alternatives: [],
    };
  }

  // 3. Auto-route: assess task characteristics
  const phase = ctx.phase || inferTaskPhase(ctx.taskText, { isSubAgent: ctx.isSubAgent, agentType: ctx.agentType });
  const modality = ctx.modality || detectModalityFromText(ctx.taskText);
  const complexity = ctx.complexity || assessComplexity(ctx.taskText);
  const budget = ctx.budget || "balanced";

  // 4. Get available models
  const available = getAvailableModels();
  if (available.length === 0) {
    // No API keys configured — ultimate fallback
    return {
      provider: "anthropic",
      modelName: "claude-sonnet-4-6",
      reasoning: "No API keys found — defaulting to Anthropic Claude Sonnet",
      confidence: 0.3,
      alternatives: [],
    };
  }

  // 5. Score each model
  const phaseWeights = PHASE_WEIGHTS[phase] || PHASE_WEIGHTS.execution;
  const budgetMult = BUDGET_COST_MULTIPLIER[budget] || 1.0;
  const minReasoning = COMPLEXITY_MIN_REASONING[complexity] || 0;
  const scored: Array<{ model: string; score: number; reasons: string[] }> = [];

  for (const model of available) {
    const caps = MODEL_CAPABILITIES[model];
    if (!caps) continue;

    const reasons: string[] = [];

    // Hard filters
    if (ctx.needsVision && caps.vision < 0.3) continue;
    if (ctx.needsSearch && caps.search < 0.3 && phase === "research") {
      // Prefer search models for research, but don't hard-exclude
    }
    if (caps.reasoning < minReasoning) {
      reasons.push(`reasoning ${caps.reasoning.toFixed(2)} below min ${minReasoning} for ${complexity}`);
      continue;
    }

    // Weighted capability score
    let score = 0;
    for (const [dim, weight] of Object.entries(phaseWeights)) {
      const capValue = caps[dim as keyof ModelCapabilities] ?? 0;
      const adjustedWeight = dim === "cost_efficiency" ? weight * budgetMult : weight;
      score += capValue * adjustedWeight;
    }

    // Performance learning boost
    const perfBoost = getPerformanceBoost(model, phase, modality, complexity);
    if (perfBoost !== 0) {
      score += perfBoost;
      reasons.push(`perf_boost: ${perfBoost > 0 ? "+" : ""}${perfBoost.toFixed(3)}`);
    }

    // Vision bonus when needed
    if (ctx.needsVision) {
      score += caps.vision * 0.2;
      reasons.push("vision_bonus");
    }

    // Search bonus when needed
    if (ctx.needsSearch || phase === "research") {
      score += caps.search * 0.15;
      if (caps.search > 0.5) reasons.push("search_augmented");
    }

    reasons.push(`phase=${phase}, complexity=${complexity}, raw_score=${score.toFixed(3)}`);
    scored.push({ model, score, reasons });
  }

  // 6. Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return {
      provider: "anthropic",
      modelName: "claude-sonnet-4-6",
      reasoning: "No suitable models found — defaulting to Claude Sonnet",
      confidence: 0.4,
      alternatives: [],
    };
  }

  const best = scored[0];
  const providerInfo = MODEL_PROVIDER_MAP[best.model];

  return {
    provider: providerInfo.provider,
    modelName: best.model,
    reasoning: best.reasons.join("; "),
    confidence: Math.min(0.95, 0.5 + best.score * 0.5),
    alternatives: scored.slice(1, 4).map(s => ({
      provider: MODEL_PROVIDER_MAP[s.model]?.provider || "unknown",
      modelName: s.model,
      score: s.score,
    })),
  };
}

// ─── Multi-Phase Delegation (Perplexity Computer's Core Pattern) ──────────────

export interface PhasePlan {
  phases: Array<{
    phase: TaskPhase;
    model: ModelSelection;
    description: string;
  }>;
  totalEstimatedCost: number;
}

/**
 * Plan which models to use for each phase of a complex task.
 * Like Perplexity Computer's vision→action→grounding split, but generalized
 * to planning→execution→review→summarization.
 */
export function planMultiPhaseExecution(
  taskText: string,
  requestedModel?: ModelId,
  budget?: "cheapest" | "balanced" | "best",
): PhasePlan {
  const complexity = assessComplexity(taskText);
  const modality = detectModalityFromText(taskText);

  // For trivial/simple tasks, single-phase execution
  if (complexity === "trivial" || complexity === "simple") {
    const model = routeModelForTask({ requestedModel, taskText, budget });
    return {
      phases: [{ phase: "execution", model, description: "Direct execution" }],
      totalEstimatedCost: estimatePhaseCost(model.modelName, 2000),
    };
  }

  const phases: PhasePlan["phases"] = [];

  // Phase 1: Planning (fast/cheap model)
  if (complexity === "complex" || complexity === "expert") {
    const planModel = routeModelForTask({
      requestedModel, taskText, phase: "planning",
      complexity, modality, budget: budget || "cheapest",
    });
    phases.push({ phase: "planning", model: planModel, description: "Decompose and plan approach" });
  }

  // Phase 2: Execution (strongest available model for the task type)
  const phase = inferTaskPhase(taskText);
  const execModel = routeModelForTask({
    requestedModel, taskText, phase, complexity, modality, budget,
  });
  phases.push({ phase, model: execModel, description: "Primary task execution" });

  // Phase 3: Review (different model for fresh perspective — only for complex/expert)
  if (complexity === "expert") {
    const reviewModel = routeModelForTask({
      requestedModel, taskText, phase: "review",
      complexity, modality, budget: budget || "balanced",
    });
    // Prefer a different model than execution for cross-validation
    if (reviewModel.modelName === execModel.modelName && reviewModel.alternatives.length > 0) {
      const alt = reviewModel.alternatives[0];
      phases.push({
        phase: "review",
        model: { ...reviewModel, provider: alt.provider, modelName: alt.modelName, reasoning: `Cross-validation with different model: ${alt.modelName}` },
        description: "Cross-validate with different model",
      });
    } else {
      phases.push({ phase: "review", model: reviewModel, description: "Quality review" });
    }
  }

  // Phase 4: Summarization (fast/cheap model)
  if (phases.length >= 2) {
    const summModel = routeModelForTask({
      requestedModel, taskText, phase: "summarization",
      complexity: "simple", modality, budget: budget || "cheapest",
    });
    phases.push({ phase: "summarization", model: summModel, description: "Synthesize and format output" });
  }

  const totalEstimatedCost = phases.reduce((sum, p) => {
    const tokens = p.phase === "planning" ? 1000 : p.phase === "summarization" ? 1500 : 4000;
    return sum + estimatePhaseCost(p.model.modelName, tokens);
  }, 0);

  return { phases, totalEstimatedCost };
}

function estimatePhaseCost(model: string, estimatedOutputTokens: number): number {
  const pricing = PRICING[model];
  if (!pricing) return 0;
  // Assume input ≈ 2x output for estimation
  return (estimatedOutputTokens * 2 * pricing.input + estimatedOutputTokens * pricing.output) / 1_000_000;
}

// ─── Sub-Agent Model Routing ──────────────────────────────────────────────────

/**
 * Route a sub-agent to the optimal model based on its role type.
 * Unlike the old hardcoded `selectSubAgentModel()`, this uses the full
 * capability scoring engine + role preferences.
 */
export function routeSubAgentModel(
  agentType: string,
  taskText: string,
  requestedModel?: string,
  preferredModel?: string,
): ModelSelection {
  // Explicit request always wins
  if (requestedModel === "free") {
    return {
      provider: "openrouter", modelName: "openrouter/free",
      reasoning: "Free mode for sub-agent", confidence: 1.0, alternatives: [],
    };
  }
  if (requestedModel && requestedModel !== "auto") {
    return routeModelForTask({ requestedModel: requestedModel as ModelId, taskText });
  }

  // Use role's preferred_model if it's not "auto"
  if (preferredModel && preferredModel !== "auto") {
    const mapping = MODEL_PROVIDER_MAP[preferredModel];
    if (mapping && process.env[mapping.envKey]) {
      return {
        provider: mapping.provider,
        modelName: preferredModel,
        reasoning: `Sub-agent role preferred model: ${preferredModel}`,
        confidence: 0.85,
        alternatives: [],
      };
    }
  }

  // Auto-route based on agent type + task content
  return routeModelForTask({
    taskText,
    agentType,
    isSubAgent: true,
    phase: inferTaskPhase(taskText, { isSubAgent: true, agentType }),
    budget: "balanced",
  });
}

// ─── Modality Detection (improved) ────────────────────────────────────────────

const MODALITY_KEYWORDS: Array<{ modality: Modality; pattern: RegExp; weight: number }> = [
  { modality: "image",    pattern: /\b(image|picture|photo|illustration|logo|icon|draw|sketch|visual|art|design|graphic|poster|banner|wallpaper|avatar|thumbnail|generate.*image|create.*image)\b/i, weight: 10 },
  { modality: "email",    pattern: /\b(email|e-?mail|send.*mail|draft.*email|compose.*mail|newsletter)\b/i, weight: 9 },
  { modality: "code",     pattern: /\b(code|program|script|function|class|api|app|build|implement|debug|fix|refactor|test|deploy|website|dashboard|prototype|component|typescript|javascript|python|react|node)\b/i, weight: 7 },
  { modality: "data",     pattern: /\b(analyz|chart|graph|plot|visuali[sz]|statistics?|csv|spreadsheet|dataset|metrics?|numbers?|calculat|forecast|regression|data)\b/i, weight: 6 },
  { modality: "research", pattern: /\b(research|investigate|explore|study|compare|survey|literature|deep.?dive|analysis|comprehensive|current state|latest)\b/i, weight: 5 },
  { modality: "writing",  pattern: /\b(write|draft|essay|blog|article|document|report|letter|content|copy|summary|translate|story|creative|poem)\b/i, weight: 4 },
];

function detectModalityFromText(text: string): Modality {
  const scores: Partial<Record<Modality, number>> = {};
  const totalWords = Math.max(text.split(/\s+/).length, 1);

  for (const { modality, pattern, weight } of MODALITY_KEYWORDS) {
    const matches = text.match(new RegExp(pattern, "gi"));
    if (!matches) continue;

    let posScore = 0;
    for (const match of matches) {
      const idx = text.toLowerCase().indexOf(match.toLowerCase());
      const wordPos = text.slice(0, idx).split(/\s+/).length;
      posScore += (1 - wordPos / totalWords) * 3; // Position bonus
    }
    scores[modality] = (scores[modality] || 0) + matches.length * weight + posScore;
  }

  let best: Modality = "general";
  let bestScore = 0;
  for (const [mod, score] of Object.entries(scores)) {
    if (score > bestScore) { bestScore = score; best = mod as Modality; }
  }
  return best;
}

// ─── Serialization for Logging ────────────────────────────────────────────────

/** Serialize a routing decision for logging/analytics */
export function serializeRoutingDecision(
  selection: ModelSelection,
  ctx: RoutingContext,
): Record<string, unknown> {
  return {
    selected_model: selection.modelName,
    selected_provider: selection.provider,
    reasoning: selection.reasoning,
    confidence: selection.confidence,
    alternatives: selection.alternatives.map(a => a.modelName),
    phase: ctx.phase || inferTaskPhase(ctx.taskText),
    modality: ctx.modality || detectModalityFromText(ctx.taskText),
    complexity: ctx.complexity || assessComplexity(ctx.taskText),
    budget: ctx.budget || "balanced",
    is_sub_agent: ctx.isSubAgent || false,
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export {
  MODEL_CAPABILITIES,
  MODEL_PROVIDER_MAP,
  PRICING as MODEL_PRICING_TABLE,
  detectModalityFromText,
};

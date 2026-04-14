import { NextRequest, NextResponse } from "next/server";
import {
  routeModelForTask,
  planMultiPhaseExecution,
  assessComplexity,
  inferTaskPhase,
  detectModalityFromText,
  MODEL_CAPABILITIES,
  type ModelSelection,
} from "@/lib/model-router";
import type { ModelId } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/model-router — Preview which model the router would select for a given task.
 * Useful for the UI to show "Auto will use X for this task" before execution.
 *
 * Body: { prompt: string, model?: ModelId, budget?: "cheapest"|"balanced"|"best" }
 * Returns: routing decision + multi-phase plan + task analysis
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const prompt: string = body.prompt || "";
    const model: ModelId | undefined = body.model;
    const budget = body.budget as "cheapest" | "balanced" | "best" | undefined;

    if (!prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const complexity = assessComplexity(prompt);
    const phase = inferTaskPhase(prompt);
    const modality = detectModalityFromText(prompt);

    const selection: ModelSelection = routeModelForTask({
      requestedModel: model,
      taskText: prompt,
      phase,
      complexity,
      budget,
      needsVision: /\b(image|screenshot|picture|photo|visual|look at)\b/i.test(prompt),
      needsSearch: /\b(search|find|latest|current|news|research)\b/i.test(prompt),
    });

    const phasePlan = planMultiPhaseExecution(prompt, model, budget);

    return NextResponse.json({
      selection: {
        model: selection.modelName,
        provider: selection.provider,
        reasoning: selection.reasoning,
        confidence: selection.confidence,
        alternatives: selection.alternatives,
      },
      analysis: {
        complexity,
        phase,
        modality,
      },
      multi_phase_plan: {
        phases: phasePlan.phases.map(p => ({
          phase: p.phase,
          model: p.model.modelName,
          provider: p.model.provider,
          description: p.description,
        })),
        estimated_cost: phasePlan.totalEstimatedCost,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/model-router — Returns all model capabilities and available models.
 */
export async function GET() {
  const available: string[] = [];
  const unavailable: string[] = [];

  const providerKeys: Record<string, string> = {
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
    google: "GOOGLE_AI_API_KEY",
    perplexity: "PERPLEXITY_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
  };

  for (const [model] of Object.entries(MODEL_CAPABILITIES)) {
    const provider = model.startsWith("claude") ? "anthropic"
      : model.startsWith("gpt") ? "openai"
      : model.startsWith("gemini") ? "google"
      : model.startsWith("sonar") ? "perplexity"
      : "unknown";
    const envKey = providerKeys[provider];
    if (envKey && process.env[envKey]) {
      available.push(model);
    } else {
      unavailable.push(model);
    }
  }

  return NextResponse.json({
    available_models: available,
    unavailable_models: unavailable,
    capabilities: MODEL_CAPABILITIES,
  });
}

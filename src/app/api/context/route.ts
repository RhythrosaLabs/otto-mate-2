import { NextRequest, NextResponse } from "next/server";
import { getTaskTokenUsage } from "@/lib/db";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const taskId = url.searchParams.get("task_id");

  try {
    // Token usage per task or overall
    if (taskId) {
      const usage = getTaskTokenUsage(taskId);
      const maxTokens = 200000; // Claude's context window
      const totalUsed = usage.total_tokens;
      const systemPromptEstimate = 4000;
      const toolsEstimate = 6000;
      const historyEstimate = Math.max(0, totalUsed - systemPromptEstimate - toolsEstimate);

      return NextResponse.json({
        max_tokens: maxTokens,
        used_tokens: totalUsed,
        system_prompt_tokens: systemPromptEstimate,
        tools_tokens: toolsEstimate,
        history_tokens: historyEstimate,
        percentage_used: Math.round((totalUsed / maxTokens) * 100),
        breakdown: usage.breakdown,
        estimated_cost: usage.estimated_cost_usd,
      });
    }

    return NextResponse.json({
      max_tokens: 200000,
      used_tokens: 0,
      system_prompt_tokens: 0,
      tools_tokens: 0,
      history_tokens: 0,
      percentage_used: 0,
    });
  } catch (err) {
    console.error("[context] Error:", err);
    return NextResponse.json({ error: "Failed to fetch context budget" }, { status: 500 });
  }
}

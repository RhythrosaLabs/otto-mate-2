import { NextResponse } from "next/server";
import { getSelfImprovementStats, listSkillPerformance, listMemoryWithMeta, identifyUnderperformingSkillsFromDb } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/self-improvement — Dashboard stats for self-improvement system
export async function GET() {
  try {
    const stats = await getSelfImprovementStats();
    const recentPerformance = await listSkillPerformance(undefined, 10);
    const topMemories = await listMemoryWithMeta(10);
    const underperforming = await identifyUnderperformingSkillsFromDb();

    const patches: Array<{ skill_id: string; skill_name: string; reason: string }> = [];
    const failurePatterns: null[] = [];
    const skillSuggestions: Array<{ name: string; reason: string }> = [];

    return NextResponse.json({
      stats,
      recent_skill_performance: recentPerformance,
      underperforming_skills: underperforming,
      pending_patches: patches.map(p => ({
        skill_id: p.skill_id,
        skill_name: p.skill_name,
        reason: p.reason,
      })),
      failure_patterns: failurePatterns,
      skill_suggestions: skillSuggestions,
      top_memories: topMemories.map(m => ({
        id: m.id,
        key: m.key,
        importance_score: m.importance_score,
        access_count: m.access_count,
        memory_type: m.memory_type,
        compressed: m.compressed,
        updated_at: m.updated_at,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to get self-improvement stats" },
      { status: 500 }
    );
  }
}

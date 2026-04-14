import { NextResponse } from "next/server";
import { getSelfImprovementStats, listSkillPerformance, listMemoryWithMeta, identifyUnderperformingSkillsFromDb, getDb } from "@/lib/db";
import { generateSkillPatches, analyzeSkillFailures } from "@/lib/self-improvement";
import { suggestSkillsForPattern } from "@/lib/structured-skills";

export const dynamic = "force-dynamic";

// GET /api/self-improvement — Dashboard stats for self-improvement system
export async function GET() {
  try {
    const stats = getSelfImprovementStats();
    const recentPerformance = listSkillPerformance(undefined, 10);
    const topMemories = listMemoryWithMeta(10);
    const underperforming = identifyUnderperformingSkillsFromDb();

    // Generate auto-patches for underperforming skills
    const db = getDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patches = generateSkillPatches(db as any);

    // Analyze failure patterns for underperforming skills
    const failurePatterns = underperforming.slice(0, 5).map(skill => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pattern = analyzeSkillFailures(db as any, skill.skill_id);
      return pattern ? { skill_name: skill.name, ...pattern } : null;
    }).filter(Boolean);

    // Suggest new skills based on recent task patterns
    let skillSuggestions: Array<{ name: string; reason: string }> = [];
    try {
      const recentTasks = db.prepare(
        "SELECT prompt FROM tasks ORDER BY created_at DESC LIMIT 10"
      ).all() as Array<{ prompt: string }>;
      const existingSkills = db.prepare("SELECT name FROM skills").all() as Array<{ name: string }>;
      
      if (recentTasks.length >= 3) {
        skillSuggestions = suggestSkillsForPattern(
          recentTasks.map(t => t.prompt),
          new Set(existingSkills.map(s => s.name)),
        ).map(s => ({ name: s.skill.name, reason: s.reason }));
      }
    } catch { /* best-effort */ }

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

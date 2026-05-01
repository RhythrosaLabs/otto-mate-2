// ─── Hermes-Inspired Self-Improvement Engine ──────────────────────────────────
// Implements three-tier learning system inspired by NousResearch/hermes-agent:
// 1. Auto-Skill Creation — after complex tasks (5+ tool calls), creates reusable skills
// 2. Skill Self-Improvement — tracks skill usage/performance and patches underperforming skills
// 3. Background Memory Review — post-task extraction of user preferences and patterns
//
// Also wires in the unused memory-engine.ts functions: semanticRecall, compression, importance scoring.

import { v4 as uuidv4 } from "uuid";
import {
  semanticRecall,
  identifyCompressible,
  compressMemories,
  computeImportance,
  classifyMemoryType,
  markVocabDirty,
  type MemoryEntry,
} from "./memory-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SkillPerformance {
  skill_id: string;
  task_id: string;
  outcome: "success" | "failure";
  tool_count: number;
  duration_ms: number;
  created_at: string;
}

export interface AutoSkillCandidate {
  name: string;
  description: string;
  instructions: string;
  category: string;
  triggers: string[];
  source_task_id: string;
  tool_chain: string[];
  confidence: number;
}

export interface BackgroundReviewResult {
  memories_created: number;
  memories_updated: number;
  memories_deleted: number;
  skills_created: number;
  skills_patched: number;
}

// ─── Auto-Skill Creation (Hermes-inspired) ────────────────────────────────────
// After a complex task completes (5+ tool calls), analyzes the approach and
// creates a reusable skill. The skill captures the tool chain, instructions,
// and triggers so the agent can reuse it on similar tasks.

const MIN_TOOL_CALLS_FOR_SKILL = 5;
const MIN_UNIQUE_TOOLS_FOR_SKILL = 3;

export function shouldCreateSkill(steps: Array<{ tool_name?: string; status?: string }>): boolean {
  const toolCalls = steps.filter(s => s.tool_name && s.status === "completed");
  const uniqueTools = new Set(toolCalls.map(s => s.tool_name));
  return toolCalls.length >= MIN_TOOL_CALLS_FOR_SKILL && uniqueTools.size >= MIN_UNIQUE_TOOLS_FOR_SKILL;
}

export function buildAutoSkillCandidate(
  taskPrompt: string,
  taskSummary: string,
  steps: Array<{ tool_name?: string; tool_input?: string; tool_result?: string; status?: string; title?: string }>,
  taskId: string,
): AutoSkillCandidate | null {
  const toolCalls = steps.filter(s => s.tool_name && s.status === "completed");
  if (!shouldCreateSkill(steps)) return null;

  const toolChain = toolCalls.map(s => s.tool_name!);
  const uniqueTools = [...new Set(toolChain)];

  // Extract key action verbs from the prompt for triggers
  const promptLower = taskPrompt.toLowerCase();
  const triggers = extractTriggers(promptLower);

  // Determine category from tool usage
  const category = inferCategory(uniqueTools, promptLower);

  // Build instructions from the successful tool chain
  const instructionSteps = toolCalls.map((s, i) => {
    const toolInput = s.tool_input ? truncateJson(s.tool_input, 150) : "";
    return `${i + 1}. Use **${s.tool_name}**${toolInput ? `: ${toolInput}` : ""}${s.title ? ` — ${s.title}` : ""}`;
  });

  // Build a clean skill name from the prompt
  const name = buildSkillName(taskPrompt);

  return {
    name,
    description: taskSummary.slice(0, 200),
    instructions: `## Auto-generated Skill\nCreated from task: "${taskPrompt.slice(0, 100)}"\n\n### Workflow Steps\n${instructionSteps.join("\n")}\n\n### Tools Used\n${uniqueTools.join(", ")}\n\n### Notes\n- This skill was auto-generated from a successful task completion\n- ${toolCalls.length} tool calls across ${uniqueTools.length} unique tools\n- Review and customize the instructions for better results`,
    category,
    triggers,
    source_task_id: taskId,
    tool_chain: toolChain,
    confidence: Math.min(0.5 + (toolCalls.length / 20), 0.9), // 0.5-0.9 based on complexity
  };
}

function extractTriggers(promptLower: string): string[] {
  const triggerPatterns: Array<{ pattern: RegExp; trigger: string }> = [
    { pattern: /\b(research|investigate|analyze|study)\b/, trigger: "research|investigate|analyze" },
    { pattern: /\b(write|draft|compose|create.*document)\b/, trigger: "write|draft|compose" },
    { pattern: /\b(code|program|implement|build.*app|debug)\b/, trigger: "code|program|implement|build" },
    { pattern: /\b(scrape|extract.*data|crawl)\b/, trigger: "scrape|extract|crawl" },
    { pattern: /\b(email|send.*message|newsletter)\b/, trigger: "email|send|newsletter" },
    { pattern: /\b(image|design|logo|illustration)\b/, trigger: "image|design|logo" },
    { pattern: /\b(video|animation|film)\b/, trigger: "video|animation|film" },
    { pattern: /\b(data|csv|chart|dashboard|visualization)\b/, trigger: "data|csv|chart|dashboard" },
    { pattern: /\b(deploy|docker|infrastructure)\b/, trigger: "deploy|docker|infrastructure" },
    { pattern: /\b(social.*media|post.*to|tweet|linkedin)\b/, trigger: "social media|post|tweet" },
    { pattern: /\b(finance|stock|investment|revenue)\b/, trigger: "finance|stock|investment" },
    { pattern: /\b(security|audit|vulnerability|penetration)\b/, trigger: "security|audit|vulnerability" },
  ];

  const matched: string[] = [];
  for (const { pattern, trigger } of triggerPatterns) {
    if (pattern.test(promptLower)) matched.push(trigger);
  }
  return matched;
}

function inferCategory(tools: string[], prompt: string): string {
  if (tools.includes("execute_code")) return "coding";
  if (tools.includes("web_search") || tools.includes("deep_research")) return "research";
  if (tools.includes("generate_image") || tools.includes("replicate_run")) return "creative";
  if (tools.includes("browse_web") || tools.includes("scrape_url")) return "automation";
  if (tools.includes("social_media_post")) return "marketing";
  if (tools.includes("send_email")) return "communication";
  if (tools.includes("finance_data")) return "finance";
  if (prompt.includes("write") || prompt.includes("draft")) return "writing";
  return "general";
}

function buildSkillName(prompt: string): string {
  // Extract key action + object from prompt
  const words = prompt.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 2);
  const actionWords = ["create", "build", "write", "research", "analyze", "generate", "scrape", "deploy", "send", "design", "draft", "make"];
  const action = words.find(w => actionWords.includes(w)) || words[0] || "auto";
  const objects = words.filter(w => !actionWords.includes(w) && w.length > 3).slice(0, 2);
  const name = [action, ...objects].join("-").slice(0, 40);
  return name || "auto-skill";
}

function truncateJson(json: string, maxLen: number): string {
  try {
    const parsed = JSON.parse(json);
    const summary = Object.entries(parsed)
      .slice(0, 3)
      .map(([k, v]) => `${k}=${typeof v === "string" ? v.slice(0, 30) : String(v).slice(0, 30)}`)
      .join(", ");
    return summary.slice(0, maxLen);
  } catch {
    return json.slice(0, maxLen);
  }
}

// ─── Skill Performance Tracking ───────────────────────────────────────────────
// Track which skills work well and which need improvement.
// When a skill is used and the task succeeds/fails, record the outcome.

export function recordSkillPerformance(
  db: { prepare: (sql: string) => { run: (...args: unknown[]) => void } },
  perf: SkillPerformance,
): void {
  try {
    db.prepare(`
      INSERT INTO skill_performance (id, skill_id, task_id, outcome, tool_count, duration_ms, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), perf.skill_id, perf.task_id, perf.outcome, perf.tool_count, perf.duration_ms, perf.created_at);
  } catch (e) {
    console.error("[skill-perf] Error recording:", e);
  }
}

export function getSkillSuccessRate(
  db: { prepare: (sql: string) => { all: (...args: unknown[]) => Array<Record<string, unknown>> } },
  skillId: string,
): { total: number; successes: number; rate: number } {
  try {
    const rows = db.prepare(
      "SELECT outcome FROM skill_performance WHERE skill_id = ? ORDER BY created_at DESC LIMIT 20"
    ).all(skillId);
    const total = rows.length;
    const successes = rows.filter(r => r.outcome === "success").length;
    return { total, successes, rate: total > 0 ? successes / total : 0 };
  } catch {
    return { total: 0, successes: 0, rate: 0 };
  }
}

// ─── Skill Self-Improvement ──────────────────────────────────────────────────
// When a skill's success rate drops below threshold, suggest improvements.
// v2: Auto-patching, failure pattern analysis, and adaptive skill refinement.

const SKILL_IMPROVEMENT_THRESHOLD = 0.6; // Below 60% success → needs improvement
const SKILL_DISABLE_THRESHOLD = 0.3; // Below 30% with 5+ uses → auto-disable

// ─── Failure Pattern Analysis ─────────────────────────────────────────────────
// Analyzes why skills fail and generates actionable patches.

export interface SkillFailurePattern {
  skill_id: string;
  common_errors: string[];
  failed_tool_chains: string[][];
  suggested_fix: string;
}

export function analyzeSkillFailures(
  db: { prepare: (sql: string) => { all: (...args: unknown[]) => Array<Record<string, unknown>> } },
  skillId: string,
): SkillFailurePattern | null {
  try {
    // Get recent failure records
    const perfRows = db.prepare(
      "SELECT task_id FROM skill_performance WHERE skill_id = ? AND outcome = 'failure' ORDER BY created_at DESC LIMIT 5"
    ).all(skillId) as Array<{ task_id: string }>;

    if (perfRows.length < 2) return null;

    // Analyze the failed tasks to find common patterns
    const errors: string[] = [];
    const failedChains: string[][] = [];

    for (const { task_id } of perfRows) {
      const steps = db.prepare(
        "SELECT tool_name, status, content FROM agent_steps WHERE task_id = ? AND status = 'failed'"
      ).all(task_id) as Array<{ tool_name: string | null; status: string; content: string | null }>;

      for (const step of steps) {
        if (step.content) errors.push(step.content.slice(0, 150));
        if (step.tool_name) failedChains.push([step.tool_name]);
      }
    }

    // Deduplicate errors by similarity
    const uniqueErrors = [...new Set(errors.map(e => e.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim()))].slice(0, 5);
    
    // Generate suggested fix based on patterns
    let suggestedFix = "";
    const errorText = uniqueErrors.join(" ");
    if (errorText.includes("timeout") || errorText.includes("timed out")) {
      suggestedFix = "Consider breaking the workflow into smaller steps or increasing timeouts.";
    } else if (errorText.includes("rate limit") || errorText.includes("429")) {
      suggestedFix = "Add retry logic and reduce concurrent API calls.";
    } else if (errorText.includes("not found") || errorText.includes("404")) {
      suggestedFix = "Verify URLs and API endpoints are current. Add fallback sources.";
    } else if (errorText.includes("permission") || errorText.includes("unauthorized")) {
      suggestedFix = "Check API keys and permissions are configured correctly.";
    } else {
      suggestedFix = `Review and update instructions. Common failures: ${uniqueErrors.slice(0, 2).join("; ")}`;
    }

    return {
      skill_id: skillId,
      common_errors: uniqueErrors,
      failed_tool_chains: failedChains,
      suggested_fix: suggestedFix,
    };
  } catch {
    return null;
  }
}

// ─── Auto-Patch Underperforming Skills ────────────────────────────────────────
// Generates improvement patches for skills that consistently fail.

export interface SkillPatch {
  skill_id: string;
  skill_name: string;
  instructions_addendum: string;
  reason: string;
}

export function generateSkillPatches(
  db: { prepare: (sql: string) => { all: (...args: unknown[]) => Array<Record<string, unknown>> } },
): SkillPatch[] {
  const patches: SkillPatch[] = [];
  const underperformers = identifyUnderperformingSkills(db);

  for (const skill of underperformers) {
    const failurePattern = analyzeSkillFailures(db, skill.skill_id);
    if (!failurePattern) continue;

    const addendum = [
      `\n\n## Auto-Improvement Notes (${new Date().toISOString().split("T")[0]})`,
      `This skill has a ${Math.round(skill.rate * 100)}% success rate (${skill.total} uses).`,
      `Common failure reasons: ${failurePattern.common_errors.slice(0, 3).join("; ")}`,
      `Suggested improvement: ${failurePattern.suggested_fix}`,
      `⚠️ Extra care needed when executing this skill's workflow.`,
    ].join("\n");

    patches.push({
      skill_id: skill.skill_id,
      skill_name: skill.name,
      instructions_addendum: addendum,
      reason: `${Math.round(skill.rate * 100)}% success rate — ${failurePattern.suggested_fix}`,
    });
  }

  return patches;
}

// ─── Adaptive Learning from Patterns ──────────────────────────────────────────
// Learns from successful task patterns to boost confidence in working approaches.

export function reinforceLearning(
  db: { prepare: (sql: string) => { all: (...args: unknown[]) => Array<Record<string, unknown>>; run: (...args: unknown[]) => void } },
  taskId: string,
  outcome: "success" | "failure",
): void {
  try {
    // Find learnings that match this task's pattern
    const task = db.prepare("SELECT prompt FROM tasks WHERE id = ?").all(taskId)[0] as { prompt: string } | undefined;
    if (!task) return;

    const queryWords = new Set(task.prompt.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const learnings = db.prepare(
      "SELECT id, pattern_key, confidence FROM agent_learnings ORDER BY created_at DESC LIMIT 100"
    ).all() as Array<{ id: string; pattern_key: string; confidence: number }>;

    for (const learning of learnings) {
      const patternWords = new Set(learning.pattern_key.toLowerCase().split(/\s+/).filter(w => w.length > 2));
      const intersection = [...queryWords].filter(w => patternWords.has(w)).length;
      const union = new Set([...queryWords, ...patternWords]).size;
      const similarity = union > 0 ? intersection / union : 0;

      if (similarity > 0.4) {
        // Reinforce: boost confidence for success, reduce for failure
        const delta = outcome === "success" ? 0.05 : -0.08;
        const newConfidence = Math.max(0, Math.min(1, learning.confidence + delta));
        db.prepare("UPDATE agent_learnings SET confidence = ? WHERE id = ?").run(newConfidence, learning.id);
      }
    }
  } catch (e) {
    console.error("[reinforce-learning] Error:", e);
  }
}

export function identifyUnderperformingSkills(
  db: { prepare: (sql: string) => { all: (...args: unknown[]) => Array<Record<string, unknown>> } },
): Array<{ skill_id: string; name: string; rate: number; total: number }> {
  try {
    const skills = db.prepare("SELECT id, name FROM skills WHERE is_active = 1").all();
    const underperforming: Array<{ skill_id: string; name: string; rate: number; total: number }> = [];

    for (const skill of skills) {
      const perf = getSkillSuccessRate(db, skill.id as string);
      if (perf.total >= 3 && perf.rate < SKILL_IMPROVEMENT_THRESHOLD) {
        underperforming.push({
          skill_id: skill.id as string,
          name: skill.name as string,
          rate: perf.rate,
          total: perf.total,
        });
      }
    }

    return underperforming;
  } catch {
    return [];
  }
}

// ─── Background Memory Review (Hermes-inspired) ──────────────────────────────
// After task completion, reviews conversation to extract:
// 1. User preferences (communication style, tool preferences, domains of interest)
// 2. Recurring patterns (common task types, preferred approaches)
// 3. Corrections (things the user corrected the agent on)

export function extractUserPreferences(
  messages: Array<{ role: string; content: string }>,
): Array<{ key: string; value: string; tags: string[] }> {
  const preferences: Array<{ key: string; value: string; tags: string[] }> = [];
  const userMessages = messages.filter(m => m.role === "user");

  for (const msg of userMessages) {
    const content = msg.content.toLowerCase();

    // Detect explicit preferences
    const prefPatterns = [
      { pattern: /(?:i prefer|i like|i want|always use|please use|make sure to)\s+(.{10,80})/i, tag: "preference" },
      { pattern: /(?:don't|do not|never|stop|avoid)\s+(.{10,80})/i, tag: "anti-preference" },
      { pattern: /(?:my name is|i am|i'm)\s+(.{3,50})/i, tag: "identity" },
      { pattern: /(?:i work at|i'm at|my company|my team)\s+(.{3,80})/i, tag: "context" },
      { pattern: /(?:use.*format|format.*as|style.*should)\s+(.{10,80})/i, tag: "style" },
    ];

    for (const { pattern, tag } of prefPatterns) {
      const match = msg.content.match(pattern);
      if (match) {
        preferences.push({
          key: `user_${tag}_${Date.now()}`,
          value: match[0].slice(0, 200),
          tags: [tag, "auto-extracted", "user-preference"],
        });
      }
    }

    // Detect corrections (user says "no", "wrong", "actually", "I meant")
    const correctionPatterns = /(?:no,|wrong|actually,|i meant|that's not|incorrect|fix that)/i;
    if (correctionPatterns.test(content) && content.length > 20) {
      preferences.push({
        key: `correction_${Date.now()}`,
        value: msg.content.slice(0, 200),
        tags: ["correction", "auto-extracted"],
      });
    }
  }

  return preferences;
}

// ─── Semantic Memory Compression (wiring memory-engine.ts) ───────────────────
// Periodically compresses low-importance memories to prevent bloat.
// This wires in the previously unused identifyCompressible() and compressMemories().

export function runMemoryCompression(
  allMemories: MemoryEntry[],
  maxMemories: number = 200,
  deleteMemoryFn: (id: string) => void,
  storeMemoryFn: (entry: MemoryEntry) => void,
): { compressed: number; deleted: number } {
  const compressible = identifyCompressible(allMemories, maxMemories);
  if (compressible.length < 3) return { compressed: 0, deleted: 0 };

  // Group compressible memories in batches of 3-5
  let compressed = 0;
  let deleted = 0;
  for (let i = 0; i < compressible.length; i += 4) {
    const batch = compressible.slice(i, i + 4);
    if (batch.length < 2) break;

    const compressedEntry = compressMemories(batch);
    storeMemoryFn(compressedEntry);
    compressed++;

    for (const entry of batch) {
      deleteMemoryFn(entry.id);
      deleted++;
    }
  }

  if (compressed > 0) {
    markVocabDirty();
    console.log(`[memory-compression] Compressed ${deleted} memories into ${compressed} summary entries`);
  }

  return { compressed, deleted };
}

// ─── Enhanced Memory Recall (wiring semanticRecall) ──────────────────────────
// Upgrades memoryRecall to use the vector-based semantic search from memory-engine.ts
// alongside the existing keyword-based search for a hybrid approach.

export function enhancedMemoryRecall(
  query: string,
  allMemories: MemoryEntry[],
  keywordResults: MemoryEntry[],
  limit: number = 5,
): MemoryEntry[] {
  // Get semantic results
  const semanticResults = semanticRecall(query, allMemories, limit);

  // Merge keyword + semantic results, deduplicating by ID
  const seen = new Set<string>();
  const merged: Array<{ entry: MemoryEntry; score: number }> = [];

  // Keyword results get a base score
  for (let i = 0; i < keywordResults.length; i++) {
    if (!seen.has(keywordResults[i].id)) {
      seen.add(keywordResults[i].id);
      merged.push({ entry: keywordResults[i], score: 1.0 - (i * 0.1) });
    }
  }

  // Semantic results get their computed score
  for (const sr of semanticResults) {
    if (!seen.has(sr.entry.id)) {
      seen.add(sr.entry.id);
      merged.push({ entry: sr.entry, score: sr.combinedScore });
    } else {
      // Boost entries found by both methods
      const existing = merged.find(m => m.entry.id === sr.entry.id);
      if (existing) existing.score += sr.combinedScore * 0.3;
    }
  }

  // Sort by combined score and return top results
  merged.sort((a, b) => b.score - a.score);
  return merged.slice(0, limit).map(m => m.entry);
}

// ─── Background Review Orchestrator ──────────────────────────────────────────
// Runs after task completion to:
// 1. Extract and store user preferences
// 2. Create skills from complex tasks
// 3. Compress old memories
// 4. Track skill performance
// 5. Auto-patch underperforming skills
// 6. Store task outcome patterns for future learning
// 7. Reinforce/decay learning confidence

export async function runBackgroundReview(params: {
  taskId: string;
  taskPrompt: string;
  taskSummary: string;
  taskOutcome?: "success" | "failure";
  messages: Array<{ role: string; content: string }>;
  steps: Array<{ tool_name?: string; tool_input?: string; tool_result?: string; status?: string; title?: string }>;
  matchedSkillId?: string;
  storeMemoryFn: (entry: MemoryEntry) => void;
  deleteMemoryFn: (id: string) => void;
  listMemoryFn: (limit: number) => MemoryEntry[] | Promise<MemoryEntry[]>;
  createSkillFn: (skill: {
    id: string; name: string; description: string; instructions: string;
    category: string; triggers: string[]; is_active: boolean;
  }) => void;
  findSimilarSkillFn?: (name: string) => boolean | Promise<boolean>;
  recordSkillPerfFn?: (perf: SkillPerformance) => void;
  patchSkillFn?: (id: string, updates: { instructions?: string }) => void;
  dbForPatching?: { prepare: (sql: string) => { all: (...args: unknown[]) => Array<Record<string, unknown>>; run: (...args: unknown[]) => void } };
}): Promise<BackgroundReviewResult> {
  const result: BackgroundReviewResult = {
    memories_created: 0,
    memories_updated: 0,
    memories_deleted: 0,
    skills_created: 0,
    skills_patched: 0,
  };

  // 1. Extract and store user preferences from conversation
  try {
    const prefs = extractUserPreferences(params.messages);
    for (const pref of prefs.slice(0, 5)) { // Cap at 5 per task
      params.storeMemoryFn({
        id: uuidv4(),
        key: pref.key,
        value: pref.value,
        tags: pref.tags,
        source_task_id: params.taskId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      result.memories_created++;
    }
  } catch (e) {
    console.error("[bg-review] Error extracting preferences:", e);
  }

  // 2. Auto-create skill from complex task (Hermes-inspired)
  try {
    const candidate = buildAutoSkillCandidate(
      params.taskPrompt,
      params.taskSummary,
      params.steps,
      params.taskId,
    );

    if (candidate) {
      // Check if a similar skill already exists
      const alreadyExists = (await params.findSimilarSkillFn?.(candidate.name)) ?? false;

      if (!alreadyExists) {
        params.createSkillFn({
          id: uuidv4(),
          name: candidate.name,
          description: candidate.description,
          instructions: candidate.instructions,
          category: candidate.category,
          triggers: candidate.triggers,
          is_active: true,
        });
        result.skills_created++;
        console.log(`[bg-review] Auto-created skill: "${candidate.name}" from task ${params.taskId.slice(0, 8)}`);

        // Store a memory about the new skill
        params.storeMemoryFn({
          id: uuidv4(),
          key: `skill_created_${candidate.name}`,
          value: `Auto-created skill "${candidate.name}" from task. Workflow: ${candidate.tool_chain.join(" → ")}. Triggers: ${candidate.triggers.join(", ")}`,
          tags: ["skill-creation", "auto", "self-improvement"],
          source_task_id: params.taskId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        result.memories_created++;
      }
    }
  } catch (e) {
    console.error("[bg-review] Error creating skill:", e);
  }

  // 3. Record skill performance if a skill was used
  try {
    if (params.matchedSkillId) {
      const toolCount = params.steps.filter(s => s.tool_name && s.status === "completed").length;
      const duration = params.steps.length > 0
        ? Date.now() - new Date(params.steps[0].title || new Date().toISOString()).getTime()
        : 0;

      params.recordSkillPerfFn?.({
        skill_id: params.matchedSkillId,
        task_id: params.taskId,
        outcome: params.taskOutcome || "success",
        tool_count: toolCount,
        duration_ms: Math.max(duration, 0),
        created_at: new Date().toISOString(),
      });
    }
  } catch (e) {
    console.error("[bg-review] Error recording skill performance:", e);
  }

  // 4. Run memory compression if bank is getting large
  try {
    const allMemories = await params.listMemoryFn(500);
    if (allMemories.length > 150) {
      const compressionResult = runMemoryCompression(
        allMemories, 200, params.deleteMemoryFn, params.storeMemoryFn,
      );
      result.memories_deleted += compressionResult.deleted;
      result.memories_created += compressionResult.compressed;
    }
  } catch (e) {
    console.error("[bg-review] Error compressing memories:", e);
  }

  // 5. Auto-patch underperforming skills
  try {
    if (params.dbForPatching && params.patchSkillFn) {
      const patches = generateSkillPatches(params.dbForPatching);
      for (const patch of patches.slice(0, 3)) { // Max 3 patches per review cycle
        const currentSkill = params.dbForPatching.prepare(
          "SELECT instructions FROM skills WHERE id = ?"
        ).all(patch.skill_id)[0] as { instructions: string } | undefined;

        if (currentSkill) {
          params.patchSkillFn(patch.skill_id, {
            instructions: currentSkill.instructions + patch.instructions_addendum,
          });
          result.skills_patched++;
          console.log(`[bg-review] Auto-patched skill "${patch.skill_name}": ${patch.reason}`);
        }
      }
    }
  } catch (e) {
    console.error("[bg-review] Error auto-patching skills:", e);
  }

  // 6. Store task outcome pattern for future learning
  try {
    const toolChain = params.steps
      .filter(s => s.tool_name && s.status === "completed")
      .map(s => s.tool_name!)
      .slice(0, 10);

    if (toolChain.length >= 2) {
      const outcomeTag = params.taskOutcome === "failure" ? "failed-pattern" : "successful-pattern";
      params.storeMemoryFn({
        id: uuidv4(),
        key: `task_pattern_${params.taskId.slice(0, 8)}`,
        value: `Task: "${params.taskPrompt.slice(0, 100)}" → ${toolChain.join(" → ")} → ${params.taskOutcome || "success"}`,
        tags: [outcomeTag, "task-pattern", "procedural"],
        memory_type: "procedural",
        source_task_id: params.taskId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      result.memories_created++;
    }
  } catch (e) {
    console.error("[bg-review] Error storing task pattern:", e);
  }

  // 7. Reinforce/decay learning confidence based on outcome
  try {
    if (params.dbForPatching) {
      reinforceLearning(params.dbForPatching, params.taskId, params.taskOutcome || "success");
    }
  } catch (e) {
    console.error("[bg-review] Error reinforcing learning:", e);
  }

  return result;
}

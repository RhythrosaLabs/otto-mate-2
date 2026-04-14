// ─── Structured Skills Engine (Superpowers-inspired) ──────────────────────────
// Skills are now structured Markdown-like documents with auto-selection,
// anti-rationalization gates, process flowcharts, and on-demand loading.
// Inspired by obra/superpowers (103k stars).
//
// v2: Semantic skill matching, DB skill integration, performance-weighted ranking,
//     skill context caching, and multi-signal scoring.

import { SKILL_CATALOG, MarketplaceSkill } from "./skill-catalog";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StructuredSkill extends MarketplaceSkill {
  // Superpowers-inspired extensions
  trigger_conditions: string[];       // When this skill should auto-activate
  process_steps: ProcessStep[];       // Step-by-step workflow
  anti_rationalizations: AntiRat[];   // Preemptive excuse blockers
  red_flags: string[];                // Thoughts that mean STOP and re-read skill
  integration_skills: string[];       // Cross-references to related skills
  priority: number;                   // 1-10, higher = more important match
  skill_type: "discipline" | "technique" | "pattern" | "reference";
}

export interface ProcessStep {
  step: number;
  title: string;
  description: string;
  gate?: string; // Hard gate — must be satisfied before proceeding
}

export interface AntiRat {
  excuse: string;
  reality: string;
}

// ─── Skill Selection Cache ────────────────────────────────────────────────────
// Avoids re-computing skill matches for similar queries within a session.

interface CachedSelection {
  skills: MarketplaceSkill[];
  timestamp: number;
  queryHash: string;
}

const skillCache = new Map<string, CachedSelection>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 50;

function hashQuery(query: string): string {
  // Normalize and hash: lowercase, sorted content words
  const words = query.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 2).sort();
  return words.join("|");
}

function getCachedSkills(queryHash: string): MarketplaceSkill[] | null {
  const cached = skillCache.get(queryHash);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) return cached.skills;
  if (cached) skillCache.delete(queryHash);
  return null;
}

function setCachedSkills(queryHash: string, skills: MarketplaceSkill[]): void {
  if (skillCache.size >= MAX_CACHE_SIZE) {
    // Evict oldest entry
    const oldest = [...skillCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
    if (oldest) skillCache.delete(oldest[0]);
  }
  skillCache.set(queryHash, { skills, timestamp: Date.now(), queryHash });
}

export function clearSkillCache(): void { skillCache.clear(); }

// ─── Skill Auto-Selection Engine ──────────────────────────────────────────────
// Analyzes user prompt + task context and returns the most relevant skills.
// Only injects skills that match — saves tokens like Superpowers' on-demand loading.

const TRIGGER_KEYWORDS: Record<string, string[]> = {
  "code": ["code", "program", "function", "debug", "fix bug", "implement", "refactor", "api", "endpoint", "database", "sql", "script", "deploy"],
  "research": ["research", "investigate", "analyze", "find out", "compare", "study", "report on", "deep dive", "what is", "how does", "competitive intelligence", "market research", "due diligence"],
  "writing": ["write", "draft", "compose", "blog", "article", "email", "letter", "documentation", "readme", "content", "newsletter", "press release", "white paper", "case study", "pitch deck", "presentation"],
  "data": ["data", "csv", "excel", "chart", "graph", "visualization", "dashboard", "statistics", "analyze data", "spreadsheet", "financial model", "forecast", "reporting", "real estate"],
  "creative": ["image", "design", "logo", "illustration", "creative", "brand", "video", "animation", "music", "audio", "storyboard", "thumbnail", "brand identity"],
  "automation": ["automate", "schedule", "workflow", "pipeline", "batch", "recurring", "cron", "trigger", "webhook", "form fill", "login", "monitor", "scrape", "chain", "orchestrate"],
  "security": ["security", "vulnerability", "audit", "penetration", "encrypt", "auth", "oauth", "permission", "firewall"],
  "finance": ["stock", "market", "investment", "revenue", "profit", "financial", "budget", "forecast", "pricing", "roi", "unit economics", "cap rate"],
  "marketing": ["marketing", "seo", "social media", "campaign", "audience", "branding", "conversion", "funnel", "ads", "growth", "launch", "outreach", "cold email", "influencer", "pr", "content calendar", "hashtag", "tiktok", "youtube", "linkedin post", "newsletter", "product hunt"],
  "devops": ["deploy", "docker", "kubernetes", "ci/cd", "pipeline", "monitoring", "infrastructure", "terraform", "aws", "cloud"],
  "career": ["job", "resume", "cover letter", "interview", "apply", "hiring", "career", "linkedin", "salary", "negotiate", "application", "job hunt", "job search", "recruiter", "ats"],
  "video": ["video", "youtube", "tiktok", "reel", "short", "clip", "scene", "storyboard", "thumbnail", "podcast", "episode", "show notes", "script"],
  "ecommerce": ["shopify", "product listing", "store", "inventory", "e-commerce", "ecommerce", "printify", "print on demand", "merch", "collection", "woocommerce"],
  "forms": ["form", "application form", "registration", "sign up", "fill out", "government form", "tax form", "document"],
};

// ─── Unified Skill Pool ──────────────────────────────────────────────────────
// Merges catalog skills + user DB skills into one searchable pool.

function getUnifiedSkillPool(dbSkills?: MarketplaceSkill[]): MarketplaceSkill[] {
  const pool = [...SKILL_CATALOG];
  const seenIds = new Set(pool.map(s => s.id));
  if (dbSkills) {
    for (const s of dbSkills) {
      if (!seenIds.has(s.id)) { pool.push(s); seenIds.add(s.id); }
    }
  }
  return pool;
}

// ─── Performance-Weighted Skill Selection ─────────────────────────────────────
// Skills with tracked performance get boosted or penalized.

interface SkillPerformanceHint {
  skill_id: string;
  performance_score: number; // 0-1
  usage_count: number;
}

let _performanceHints: SkillPerformanceHint[] = [];

/** Called from agent.ts after loading DB skills to provide performance data */
export function setSkillPerformanceHints(hints: SkillPerformanceHint[]): void {
  _performanceHints = hints;
}

function getPerformanceMultiplier(skillId: string): number {
  const hint = _performanceHints.find(h => h.skill_id === skillId);
  if (!hint || hint.usage_count < 2) return 1.0; // Not enough data
  // Boost high performers, penalize low performers
  // 0.8x at 0% success, 1.0x at 60%, 1.3x at 100%
  return 0.8 + hint.performance_score * 0.5;
}

export function autoSelectSkills(
  userMessage: string,
  maxSkills: number = 3,
  dbSkills?: MarketplaceSkill[],
): MarketplaceSkill[] {
  const lower = userMessage.toLowerCase();

  // Check cache first
  const qHash = hashQuery(lower);
  const cached = getCachedSkills(qHash);
  if (cached) return cached;

  const matchedCategories = new Map<string, number>();

  // Score each category by keyword matches
  for (const [category, keywords] of Object.entries(TRIGGER_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score += kw.split(" ").length; // Multi-word matches score higher
    }
    if (score > 0) matchedCategories.set(category, score);
  }

  if (matchedCategories.size === 0) {
    // Fallback: try semantic scoring even without category match
    const pool = getUnifiedSkillPool(dbSkills);
    const semanticMatches = pool
      .map(s => ({ skill: s, score: scoreSkillRelevance(s, lower) }))
      .filter(m => m.score > 3)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxSkills)
      .map(m => m.skill);
    if (semanticMatches.length > 0) {
      setCachedSkills(qHash, semanticMatches);
      return semanticMatches;
    }
    return [];
  }

  // Sort categories by score
  const sortedCategories = [...matchedCategories.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([cat]) => cat);

  // Find matching skills from unified pool (catalog + DB skills)
  const pool = getUnifiedSkillPool(dbSkills);
  const matched: MarketplaceSkill[] = [];
  const seen = new Set<string>();

  for (const cat of sortedCategories) {
    const catSkills = pool.filter(s => {
      if (seen.has(s.id)) return false;
      // Match by category
      if (s.category === cat) return true;
      // Match by tags
      if (s.tags?.some(t => TRIGGER_KEYWORDS[cat]?.some(kw => t.includes(kw) || kw.includes(t)))) return true;
      return false;
    });

    // Sort within category by relevance to user message (with performance weighting)
    catSkills.sort((a, b) => {
      const aScore = scoreSkillRelevance(a, lower) * getPerformanceMultiplier(a.id);
      const bScore = scoreSkillRelevance(b, lower) * getPerformanceMultiplier(b.id);
      return bScore - aScore;
    });

    for (const skill of catSkills.slice(0, 2)) {
      if (matched.length >= maxSkills) break;
      matched.push(skill);
      seen.add(skill.id);
    }
    if (matched.length >= maxSkills) break;
  }

  setCachedSkills(qHash, matched);
  return matched;
}

function scoreSkillRelevance(skill: MarketplaceSkill, query: string): number {
  let score = 0;
  const words = query.split(/\s+/).filter(w => w.length > 2);
  
  // Name match (high signal)
  const nameLower = skill.name.toLowerCase();
  const descLower = skill.description.toLowerCase();
  for (const w of words) {
    if (nameLower.includes(w)) score += 4;
    if (descLower.includes(w)) score += 2;
  }
  
  // Full phrase match in name/description (very high signal)
  if (nameLower.includes(query)) score += 8;
  if (descLower.includes(query)) score += 5;
  
  // Tag match (each tag hit is strong)
  for (const tag of (skill.tags || [])) {
    if (query.includes(tag)) score += 3;
    // Partial tag match
    for (const w of words) {
      if (tag.includes(w) || w.includes(tag)) score += 1;
    }
  }
  
  // Instruction content match (lower weight but catches deep matches)
  if (skill.instructions) {
    const instrLower = skill.instructions.toLowerCase();
    let instrHits = 0;
    for (const w of words) {
      if (instrLower.includes(w)) instrHits++;
    }
    score += Math.min(instrHits * 0.5, 3); // Cap at 3 points from instructions
  }
  
  // Rating and popularity boost
  score += (skill.rating || 0) * 0.5;
  score += Math.log10(Math.max(skill.downloads || 1, 1)) * 0.3;
  
  return score;
}

// ─── Build Skill Context for System Prompt ────────────────────────────────────
// Generates the skill injection text with Superpowers-style structure.

export function buildSkillContext(skills: MarketplaceSkill[]): string {
  if (skills.length === 0) return "";

  const sections = skills.map(skill => {
    const toolsSection = skill.tools?.length
      ? `\n**Allowed Tools**: ${skill.tools.join(", ")}`
      : "";
    const modelSection = skill.model
      ? `\n**Preferred Model**: ${skill.model}`
      : "";

    // Show performance data if available
    const perfHint = _performanceHints.find(h => h.skill_id === skill.id);
    const perfSection = perfHint && perfHint.usage_count >= 2
      ? `\n**Performance**: ${Math.round(perfHint.performance_score * 100)}% success rate (${perfHint.usage_count} uses)`
      : "";

    return `### ${skill.icon} ${skill.name}
**Category**: ${skill.category} | **Rating**: ${skill.rating}/5${perfSection}
${skill.description}

<SKILL_INSTRUCTIONS>
${skill.instructions}
</SKILL_INSTRUCTIONS>${toolsSection}${modelSection}

<ANTI_RATIONALIZATION>
- Do NOT skip any step of this skill's process — even if it seems "obvious" or "simple"
- Do NOT summarize the skill instructions and follow your summary — re-read and follow the actual instructions
- If you think "this is too simple to need the full process" — that thought IS the rationalization. Follow the process.
</ANTI_RATIONALIZATION>`;
  });

  return `\n\n## Auto-Selected Skills (Superpowers Engine)
<EXTREMELY_IMPORTANT>
The following skills have been automatically selected based on your task. You MUST follow their instructions precisely.
Even a 1% chance a skill applies means you should follow it. Violating the letter of the rules IS violating the spirit.
</EXTREMELY_IMPORTANT>

${sections.join("\n\n---\n\n")}`;
}

// ─── Skill Matching for Agent ─────────────────────────────────────────────────

export function getSkillsForTask(
  userMessage: string,
  customSkills?: string,
  dbSkills?: MarketplaceSkill[],
): string {
  const autoSkills = autoSelectSkills(userMessage, 3, dbSkills);
  const skillContext = buildSkillContext(autoSkills);
  
  if (customSkills && skillContext) {
    return `${customSkills}\n${skillContext}`;
  }
  return customSkills || skillContext || "";
}

// ─── Skill Recommendation Engine ──────────────────────────────────────────────
// Proactively suggests skills the user might want based on task history patterns.

export function suggestSkillsForPattern(
  recentTaskPrompts: string[],
  existingSkillNames: Set<string>,
  maxSuggestions: number = 3,
): Array<{ skill: MarketplaceSkill; reason: string }> {
  if (recentTaskPrompts.length < 3) return [];

  // Combine recent prompts for pattern detection
  const combined = recentTaskPrompts.join(" ").toLowerCase();
  const suggestions: Array<{ skill: MarketplaceSkill; reason: string; score: number }> = [];

  for (const skill of SKILL_CATALOG) {
    if (existingSkillNames.has(skill.name)) continue;
    
    const relevance = scoreSkillRelevance(skill, combined);
    if (relevance <= 5) continue;

    // Count how many recent tasks mention this skill's domain
    const taskMatches = recentTaskPrompts.filter(p => {
      const lower = p.toLowerCase();
      return (skill.tags || []).some(t => lower.includes(t)) || 
             lower.includes(skill.category);
    }).length;

    if (taskMatches >= 2) {
      suggestions.push({
        skill,
        reason: `${taskMatches} of your last ${recentTaskPrompts.length} tasks involve ${skill.category}`,
        score: relevance * taskMatches,
      });
    }
  }

  return suggestions
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSuggestions)
    .map(({ skill, reason }) => ({ skill, reason }));
}

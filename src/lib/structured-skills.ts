// ─── Structured Skills Engine (Superpowers-inspired) ──────────────────────────
// Skills are now structured Markdown-like documents with auto-selection,
// anti-rationalization gates, process flowcharts, and on-demand loading.
// Inspired by obra/superpowers (103k stars).

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

// ─── Skill Auto-Selection Engine ──────────────────────────────────────────────
// Analyzes user prompt + task context and returns the most relevant skills.
// Only injects skills that match — saves tokens like Superpowers' on-demand loading.

const TRIGGER_KEYWORDS: Record<string, string[]> = {
  "code": ["code", "program", "function", "debug", "fix bug", "implement", "refactor", "api", "endpoint", "database", "sql", "script", "deploy"],
  "research": ["research", "investigate", "analyze", "find out", "compare", "study", "report on", "deep dive", "what is", "how does"],
  "writing": ["write", "draft", "compose", "blog", "article", "email", "letter", "documentation", "readme", "content"],
  "data": ["data", "csv", "excel", "chart", "graph", "visualization", "dashboard", "statistics", "analyze data", "spreadsheet"],
  "creative": ["image", "design", "logo", "illustration", "creative", "brand", "video", "animation", "music", "audio"],
  "automation": ["automate", "schedule", "workflow", "pipeline", "batch", "recurring", "cron", "trigger", "webhook"],
  "security": ["security", "vulnerability", "audit", "penetration", "encrypt", "auth", "oauth", "permission", "firewall"],
  "finance": ["stock", "market", "investment", "revenue", "profit", "financial", "budget", "forecast", "pricing", "roi"],
  "marketing": ["marketing", "seo", "social media", "campaign", "audience", "branding", "conversion", "funnel", "ads"],
  "devops": ["deploy", "docker", "kubernetes", "ci/cd", "pipeline", "monitoring", "infrastructure", "terraform", "aws", "cloud"],
};

export function autoSelectSkills(userMessage: string, maxSkills: number = 3): MarketplaceSkill[] {
  const lower = userMessage.toLowerCase();
  const matchedCategories = new Map<string, number>();

  // Score each category by keyword matches
  for (const [category, keywords] of Object.entries(TRIGGER_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score += kw.split(" ").length; // Multi-word matches score higher
    }
    if (score > 0) matchedCategories.set(category, score);
  }

  if (matchedCategories.size === 0) return [];

  // Sort categories by score
  const sortedCategories = [...matchedCategories.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([cat]) => cat);

  // Find matching skills from catalog
  const matched: MarketplaceSkill[] = [];
  const seen = new Set<string>();

  for (const cat of sortedCategories) {
    const catSkills = SKILL_CATALOG.filter(s => {
      if (seen.has(s.id)) return false;
      // Match by category
      if (s.category === cat) return true;
      // Match by tags
      if (s.tags.some(t => TRIGGER_KEYWORDS[cat]?.some(kw => t.includes(kw) || kw.includes(t)))) return true;
      return false;
    });

    // Sort within category by relevance to user message
    catSkills.sort((a, b) => {
      const aScore = scoreSkillRelevance(a, lower);
      const bScore = scoreSkillRelevance(b, lower);
      return bScore - aScore;
    });

    for (const skill of catSkills.slice(0, 2)) {
      if (matched.length >= maxSkills) break;
      matched.push(skill);
      seen.add(skill.id);
    }
    if (matched.length >= maxSkills) break;
  }

  return matched;
}

function scoreSkillRelevance(skill: MarketplaceSkill, query: string): number {
  let score = 0;
  const words = query.split(/\s+/);
  
  // Name match
  for (const w of words) {
    if (w.length > 2 && skill.name.toLowerCase().includes(w)) score += 3;
    if (w.length > 2 && skill.description.toLowerCase().includes(w)) score += 2;
  }
  
  // Tag match
  for (const tag of skill.tags) {
    if (query.includes(tag)) score += 2;
  }
  
  // Rating and popularity boost
  score += skill.rating * 0.5;
  score += Math.log10(Math.max(skill.downloads, 1)) * 0.3;
  
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

    return `### ${skill.icon} ${skill.name}
**Category**: ${skill.category} | **Rating**: ${skill.rating}/5
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

export function getSkillsForTask(userMessage: string, customSkills?: string): string {
  const autoSkills = autoSelectSkills(userMessage, 3);
  const skillContext = buildSkillContext(autoSkills);
  
  if (customSkills && skillContext) {
    return `${customSkills}\n${skillContext}`;
  }
  return customSkills || skillContext || "";
}

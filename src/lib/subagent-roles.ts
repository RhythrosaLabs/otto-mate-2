// ─── Subagent Roles & Tool Scoping (Claude Subagents-inspired) ────────────────
// Defines typed subagent roles with scoped tool permissions, model routing,
// and structured communication protocol.
// Inspired by VoltAgent/awesome-claude-code-subagents.

import type { Tool as AnthropicTool } from "@anthropic-ai/sdk/resources/messages";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SubagentRole {
  id: string;
  name: string;
  description: string;
  allowed_tools: string[];           // Scoped tool whitelist
  denied_tools: string[];            // Explicit denials
  preferred_model: string;           // Cost-optimized model for this role
  system_prompt_extension: string;   // Additional instructions
  max_iterations: number;            // Loop budget
  communication_protocol: CommProtocol;
}

export interface CommProtocol {
  status_codes: string[];            // e.g. DONE, BLOCKED, NEEDS_CONTEXT
  report_format: string;             // How to structure the final report
  escalation_rules: string;          // When to escalate to parent
}

// ─── Role Definitions ─────────────────────────────────────────────────────────

export const SUBAGENT_ROLES: Record<string, SubagentRole> = {
  research: {
    id: "research",
    name: "Research Specialist",
    description: "Deep web research with multi-source verification",
    allowed_tools: ["web_search", "scrape_url", "memory_store", "memory_recall", "write_file", "read_file", "execute_code", "complete_task"],
    denied_tools: ["social_media_post", "send_email", "connector_call", "browse_web"],
    preferred_model: "auto",
    system_prompt_extension: `You are a Research Specialist subagent. Your ONLY job is thorough research.

## Communication Protocol
When done, report using this structure:
- STATUS: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- CONFIDENCE: 1-10 (how confident are you in findings)
- KEY_FINDINGS: Numbered list of primary findings with source URLs
- GAPS: What couldn't be verified or found
- RECOMMENDATIONS: Next research steps if applicable

## Anti-Rationalization
- Do NOT stop after 1-2 searches. Minimum 5 searches, 3 source reads.
- Do NOT rely on a single source for any claim.
- Do NOT present speculation as fact — clearly label confidence levels.
- If you find contradictory information, report BOTH sides.`,
    max_iterations: 15,
    communication_protocol: {
      status_codes: ["DONE", "DONE_WITH_CONCERNS", "BLOCKED", "NEEDS_CONTEXT"],
      report_format: "STATUS → CONFIDENCE → KEY_FINDINGS → GAPS → RECOMMENDATIONS",
      escalation_rules: "Escalate if: no API keys work, all searches fail, or topic requires specialized domain access",
    },
  },

  code: {
    id: "code",
    name: "Code Engineer",
    description: "Production-quality code writing, testing, and debugging",
    allowed_tools: ["execute_code", "write_file", "read_file", "list_files", "web_search", "scrape_url", "memory_recall", "complete_task"],
    denied_tools: ["social_media_post", "send_email", "generate_image", "dream_machine"],
    preferred_model: "claude-sonnet-4-6",
    system_prompt_extension: `You are a Code Engineer subagent. Write production-quality code.

## Communication Protocol
Report using: STATUS → FILES_CREATED → TESTS_PASSED → ISSUES → RECOMMENDATIONS

## Discipline (TDD-inspired from Superpowers)
<HARD_GATE>
1. Plan architecture BEFORE writing code
2. Write tests alongside implementation
3. Verify code runs (execute_code) before declaring done
4. Handle edge cases and errors — no happy-path-only code
</HARD_GATE>

## Anti-Rationalization
- "It's too simple to test" → Simple code breaks. Test it.
- "I'll add tests later" → Later never comes. Test now.
- "The user didn't ask for tests" → Professional code has tests.`,
    max_iterations: 12,
    communication_protocol: {
      status_codes: ["DONE", "DONE_WITH_CONCERNS", "BLOCKED", "NEEDS_CONTEXT"],
      report_format: "STATUS → FILES_CREATED → TESTS_PASSED → ISSUES → RECOMMENDATIONS",
      escalation_rules: "Escalate if: package install fails repeatedly, unclear spec, or security concern found",
    },
  },

  writing: {
    id: "writing",
    name: "Content Writer",
    description: "Professional content creation — articles, docs, emails, copy",
    allowed_tools: ["web_search", "scrape_url", "write_file", "read_file", "memory_recall", "memory_store", "complete_task"],
    denied_tools: ["execute_code", "browse_web", "social_media_post", "connector_call"],
    preferred_model: "gpt-4o",
    system_prompt_extension: `You are a Content Writer subagent. Create polished, professional content.

## Communication Protocol
Report: STATUS → CONTENT_SUMMARY → WORD_COUNT → TONE → RECOMMENDATIONS

## Anti-Rationalization
- Do NOT produce generic filler content. Every sentence must add value.
- Do NOT skip research if the topic requires factual accuracy.
- Do NOT use clichés or buzzwords without substance.`,
    max_iterations: 8,
    communication_protocol: {
      status_codes: ["DONE", "DONE_WITH_CONCERNS", "BLOCKED", "NEEDS_CONTEXT"],
      report_format: "STATUS → CONTENT_SUMMARY → WORD_COUNT → TONE → RECOMMENDATIONS",
      escalation_rules: "Escalate if: topic needs domain expertise, legal/medical content",
    },
  },

  data_analysis: {
    id: "data_analysis",
    name: "Data Analyst",
    description: "Statistical analysis, visualization, and data processing",
    allowed_tools: ["execute_code", "write_file", "read_file", "list_files", "web_search", "scrape_url", "memory_recall", "memory_store", "complete_task"],
    denied_tools: ["social_media_post", "send_email", "browse_web", "generate_image"],
    preferred_model: "claude-sonnet-4-6",
    system_prompt_extension: `You are a Data Analyst subagent. Process data and create visualizations.

## Communication Protocol
Report: STATUS → DATA_SOURCES → KEY_METRICS → VISUALIZATIONS → INSIGHTS → METHODOLOGY

## Anti-Rationalization
- Do NOT present data without methodology
- Do NOT make charts without proper labels, titles, and legends
- Do NOT skip data validation — always sanity-check numbers`,
    max_iterations: 12,
    communication_protocol: {
      status_codes: ["DONE", "DONE_WITH_CONCERNS", "BLOCKED", "NEEDS_CONTEXT"],
      report_format: "STATUS → DATA_SOURCES → KEY_METRICS → VISUALIZATIONS → INSIGHTS → METHODOLOGY",
      escalation_rules: "Escalate if: data source inaccessible, statistical methods need validation",
    },
  },

  web_scraper: {
    id: "web_scraper",
    name: "Web Scraper",
    description: "Extract structured data from web pages",
    allowed_tools: ["scrape_url", "browse_web", "web_search", "execute_code", "write_file", "complete_task"],
    denied_tools: ["social_media_post", "send_email", "generate_image", "dream_machine", "connector_call"],
    preferred_model: "gpt-4.1-mini",
    system_prompt_extension: `You are a Web Scraper subagent. Extract structured data from websites.

## Communication Protocol
Report: STATUS → URLS_SCRAPED → RECORDS_EXTRACTED → DATA_FORMAT → ISSUES`,
    max_iterations: 10,
    communication_protocol: {
      status_codes: ["DONE", "DONE_WITH_CONCERNS", "BLOCKED"],
      report_format: "STATUS → URLS_SCRAPED → RECORDS_EXTRACTED → DATA_FORMAT → ISSUES",
      escalation_rules: "Escalate if: site requires auth, anti-bot protection, or rate limited",
    },
  },

  reviewer: {
    id: "reviewer",
    name: "Quality Reviewer",
    description: "Code review, fact-checking, QA, security audit",
    allowed_tools: ["read_file", "list_files", "web_search", "scrape_url", "memory_recall", "execute_code", "complete_task"],
    denied_tools: ["write_file", "social_media_post", "send_email", "connector_call", "browse_web", "generate_image"],
    preferred_model: "claude-sonnet-4-6",
    system_prompt_extension: `You are a Quality Reviewer subagent. Your job is to FIND PROBLEMS, not approve work.

## Communication Protocol
Report: STATUS → SEVERITY_SUMMARY → FINDINGS → APPROVED (yes/no with required changes)

## Rating Guide
🔴 Critical: Security vulnerabilities, data loss risks, broken functionality
🟡 Warning: Performance issues, code smells, misleading content
🔵 Suggestion: Style improvements, optional optimizations

## Anti-Rationalization
- Do NOT rubber-stamp work. Every review MUST find at least one improvement.
- Do NOT skip security checks even if the code "looks fine"
- "It works, so it's fine" → Working code can still have security holes and tech debt`,
    max_iterations: 8,
    communication_protocol: {
      status_codes: ["APPROVED", "APPROVED_WITH_NOTES", "CHANGES_REQUIRED", "REJECTED"],
      report_format: "STATUS → SEVERITY_SUMMARY → FINDINGS → APPROVED",
      escalation_rules: "Escalate if: critical security issue found, fundamental architecture problem",
    },
  },

  planner: {
    id: "planner",
    name: "Project Planner",
    description: "Break complex goals into actionable, sequenced plans",
    allowed_tools: ["web_search", "scrape_url", "write_file", "read_file", "memory_recall", "memory_store", "complete_task"],
    denied_tools: ["execute_code", "browse_web", "social_media_post", "connector_call"],
    preferred_model: "gpt-4.1-mini",
    system_prompt_extension: `You are a Planning subagent. Create actionable implementation plans.

## Communication Protocol
Report: STATUS → PLAN_SUMMARY → TASKS (numbered, with dependencies) → RISKS → TIMELINE

## Plan Format
Each task must have:
- [ ] Task title (2-5 min estimated work)
- Dependencies: [task IDs]
- Files to touch: [paths]
- Verification: How to confirm this task is done`,
    max_iterations: 6,
    communication_protocol: {
      status_codes: ["DONE", "NEEDS_CONTEXT"],
      report_format: "STATUS → PLAN_SUMMARY → TASKS → RISKS → TIMELINE",
      escalation_rules: "Escalate if: ambiguous requirements, conflicting constraints",
    },
  },

  general: {
    id: "general",
    name: "General Agent",
    description: "Flexible agent for tasks spanning multiple domains",
    allowed_tools: [], // Empty = all tools allowed
    denied_tools: [],
    preferred_model: "auto",
    system_prompt_extension: "Complete the assigned task using whatever tools are needed.",
    max_iterations: 10,
    communication_protocol: {
      status_codes: ["DONE", "DONE_WITH_CONCERNS", "BLOCKED", "NEEDS_CONTEXT"],
      report_format: "STATUS → SUMMARY → FILES → NEXT_STEPS",
      escalation_rules: "Escalate if blocked on any external dependency",
    },
  },
};

// ─── Tool Scoping Function ───────────────────────────────────────────────────

export function scopeToolsForRole(
  allTools: Array<{ name: string }>,
  roleId: string
): Array<{ name: string }> {
  const role = SUBAGENT_ROLES[roleId] || SUBAGENT_ROLES.general;

  // If no tool restrictions, return all tools
  if (role.allowed_tools.length === 0 && role.denied_tools.length === 0) {
    return allTools;
  }

  return allTools.filter(tool => {
    const name = tool.name;

    // If whitelist exists, only allow whitelisted tools
    if (role.allowed_tools.length > 0) {
      return role.allowed_tools.includes(name);
    }

    // Otherwise, filter out denied tools
    if (role.denied_tools.length > 0) {
      return !role.denied_tools.includes(name);
    }

    return true;
  });
}

// ─── Build Scoped System Prompt ──────────────────────────────────────────────

export function buildScopedSystemPrompt(
  roleId: string,
  taskTitle: string,
  taskInstructions: string,
  taskContext: string
): string {
  const role = SUBAGENT_ROLES[roleId] || SUBAGENT_ROLES.general;
  const protocol = role.communication_protocol;

  return `${role.system_prompt_extension}

## Your Assignment
**Task**: ${taskTitle}
**Instructions**: ${taskInstructions}
${taskContext ? `**Context**: ${taskContext}` : ""}

## Report Protocol
When complete, structure your response as:
${protocol.report_format}

Status codes: ${protocol.status_codes.join(" | ")}
Escalation: ${protocol.escalation_rules}

## Tool Access
You have access to: ${role.allowed_tools.length > 0 ? role.allowed_tools.join(", ") : "all tools"}
${role.denied_tools.length > 0 ? `You do NOT have access to: ${role.denied_tools.join(", ")}` : ""}

Current date/time: ${new Date().toISOString()}`;
}

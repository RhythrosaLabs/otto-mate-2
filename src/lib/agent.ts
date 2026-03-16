/**
 * Ottomatron Agent Engine
 * Multi-model orchestration with advanced tooling
 *
 * Inspired by: Perplexity Computer, CrewAI, OpenAI Swarms,
 * Browser Use, Anthropic Computer Use, AutoGPT
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { v4 as uuidv4 } from "uuid";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";
import type { AgentStep, ToolName, ModelId, Modality } from "./types";
import { formatBytes } from "./utils";
import {
  addAgentStep,
  updateAgentStep,
  updateTaskStatus,
  addSubTask,
  updateSubTask,
  addTaskFile,
  addMessage,
  ensureFilesDir,
  addGalleryItem,
  memoryStore,
  memoryRecall,
  listMemory,
  deleteMemory,
  listAllFiles,
  listFolders,
  createFolder,
  updateFileFolder,
  recordLearning,
  findSimilarLearnings,
  updateLearningConfidence,
  recordAnalyticsEvent,
  trackTaskTokens,
} from "./db";

const execAsync = promisify(exec);

// ─── Multi-Model Clients ──────────────────────────────────────────────────────

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });
const googleAI = process.env.GOOGLE_AI_API_KEY
  ? new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY)
  : null;

// ─── Model Failover (OpenClaw-inspired) ───────────────────────────────────────
// Automatic retry with exponential backoff and provider fallback

const TRANSIENT_ERROR_PATTERNS = [
  /rate.?limit/i, /429/i, /overloaded/i, /503/i, /502/i,
  /timeout/i, /ETIMEDOUT/i, /ECONNRESET/i, /server.?error/i,
  /500/i, /capacity/i, /too many requests/i, /resource.?exhausted/i,
  /credit.?balance/i, /insufficient.?funds/i, /billing/i, /quota.?exceeded/i,
  /payment.?required/i, /402/i, /plan.?limit/i,
];

function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return TRANSIENT_ERROR_PATTERNS.some((p) => p.test(msg));
}

const FAILOVER_BACKOFF_MS = [2000, 5000, 15000]; // exponential backoff delays

interface FailoverChain {
  provider: string;
  modelName: string;
}

function getFailoverChain(primary: { provider: string; modelName: string }): FailoverChain[] {
  const chain: FailoverChain[] = [primary];
  // Add fallback providers in order of capability
  const fallbacks: FailoverChain[] = [];
  if (primary.provider !== "anthropic" && process.env.ANTHROPIC_API_KEY) {
    fallbacks.push({ provider: "anthropic", modelName: "claude-sonnet-4-6" });
  }
  if (primary.provider !== "openai" && process.env.OPENAI_API_KEY) {
    fallbacks.push({ provider: "openai", modelName: "gpt-4o" });
  }
  if (primary.provider !== "google" && process.env.GOOGLE_AI_API_KEY) {
    fallbacks.push({ provider: "google", modelName: "gemini-1.5-pro" });
  }
  if (primary.provider !== "perplexity" && process.env.PERPLEXITY_API_KEY) {
    fallbacks.push({ provider: "perplexity", modelName: "sonar-pro" });
  }
  return chain.concat(fallbacks);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Token & Cost Tracking (OpenClaw-inspired) ───────────────────────────────

interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
  model: string;
}

// Approximate pricing per 1M tokens (input/output) as of 2025
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4-6": { input: 15, output: 75 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-3.5-haiku": { input: 0.8, output: 4 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "gemini-1.5-pro": { input: 1.25, output: 5 },
  "gemini-1.5-flash": { input: 0.075, output: 0.3 },
  "gemini-2.0-flash": { input: 0.1, output: 0.4 },
  "sonar-pro": { input: 3, output: 15 },
  "sonar-reasoning-pro": { input: 2, output: 8 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING["claude-sonnet-4-6"];
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

function trackTokenUsage(taskId: string, usage: TokenUsage): void {
  try {
    trackTaskTokens(taskId, usage);
  } catch { /* db not yet ready */ }
}

// ─── Smart Context Compaction (OpenClaw-inspired) ──────────────────────────────
// Instead of hard-coding "last 10 messages", intelligently manage context window

const MAX_CONTEXT_TOKENS_ESTIMATE = 12000; // Reserve ~12k tokens for history (conservative)
const CHARS_PER_TOKEN_ESTIMATE = 4; // Rough estimate

async function compactHistory(
  messages: Array<{ role: string; content: string }>,
  model: string
): Promise<Array<{ role: string; content: string }>> {
  if (messages.length === 0) return [];

  const mapped = messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // Estimate total tokens in history
  const totalChars = mapped.reduce((sum, m) => sum + m.content.length, 0);
  const estimatedTokens = totalChars / CHARS_PER_TOKEN_ESTIMATE;

  // If within budget, return all messages
  if (estimatedTokens <= MAX_CONTEXT_TOKENS_ESTIMATE) return mapped;

  // Strategy: Keep first 2 messages (original intent) + summarize middle + keep last 8 recent
  const keepStart = Math.min(2, mapped.length);
  const keepEnd = Math.min(8, mapped.length - keepStart);
  const middleStart = keepStart;
  const middleEnd = mapped.length - keepEnd;

  if (middleEnd <= middleStart) {
    // Not enough messages to warrant summarization, just truncate
    return mapped.slice(-10);
  }

  const middleMessages = mapped.slice(middleStart, middleEnd);
  const middleSummary = middleMessages.map((m) => {
    const truncated = m.content.slice(0, 150) + (m.content.length > 150 ? "..." : "");
    return `[${m.role}]: ${truncated}`;
  }).join("\n");

  const summaryMsg = {
    role: "assistant" as const,
    content: `[Context Summary - ${middleMessages.length} earlier messages compacted]\n${middleSummary}`,
  };

  return [
    ...mapped.slice(0, keepStart),
    summaryMsg,
    ...mapped.slice(middleEnd),
  ];
}

// ─── Two-Phase Tool Result Pruning (OpenClaw-inspired) ─────────────────────────
// Aggressively prune bloated tool results to prevent context blowout.
// Phase 1 (soft-trim): Results > 30% of context budget → keep head+tail with "..."
// Phase 2 (hard-clear): Results > 50% of context budget → replace with placeholder
// Never touches user/assistant messages. Protects last 3 assistant tool results.

const SOFT_TRIM_THRESHOLD = 0.30; // 30% of context budget
const HARD_CLEAR_THRESHOLD = 0.50; // 50% of context budget
const SOFT_TRIM_KEEP_CHARS = 1500; // chars to keep at head and tail during soft-trim

function pruneToolResults(
  messages: Anthropic.MessageParam[],
): Anthropic.MessageParam[] {
  const contextBudgetChars = MAX_CONTEXT_TOKENS_ESTIMATE * CHARS_PER_TOKEN_ESTIMATE;
  const softThreshold = contextBudgetChars * SOFT_TRIM_THRESHOLD;
  const hardThreshold = contextBudgetChars * HARD_CLEAR_THRESHOLD;

  // Find indices of tool_result messages (in Anthropic format these are "user" messages with tool_result content)
  // Protect the last 3 tool-result-bearing messages
  const toolResultIndices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === "user" && Array.isArray(msg.content)) {
      const hasToolResult = (msg.content as unknown as Array<Record<string, unknown>>).some(
        (b) => b.type === "tool_result"
      );
      if (hasToolResult) toolResultIndices.push(i);
    }
  }

  // Protect the last 3 tool-result messages
  const protectedIndices = new Set(toolResultIndices.slice(-3));

  return messages.map((msg, idx) => {
    if (protectedIndices.has(idx)) return msg;

    if (msg.role === "user" && Array.isArray(msg.content)) {
      const blocks = msg.content as Anthropic.ToolResultBlockParam[];
      const pruned = blocks.map((block) => {
        if (block.type !== "tool_result" || typeof block.content !== "string") return block;
        const len = block.content.length;

        if (len > hardThreshold) {
          // Phase 2: Hard-clear
          return { ...block, content: `[Tool result cleared — was ${Math.round(len / 1024)}KB. Re-run tool if needed.]` };
        }
        if (len > softThreshold) {
          // Phase 1: Soft-trim (keep head + tail)
          const head = block.content.slice(0, SOFT_TRIM_KEEP_CHARS);
          const tail = block.content.slice(-SOFT_TRIM_KEEP_CHARS);
          return { ...block, content: `${head}\n\n... [${Math.round((len - SOFT_TRIM_KEEP_CHARS * 2) / 1024)}KB trimmed] ...\n\n${tail}` };
        }
        return block;
      });
      return { ...msg, content: pruned };
    }
    return msg;
  });
}

/**
 * Prune tool results in OpenAI/OpenRouter message format.
 * Works on { role: "tool", content: string } messages.
 */
function pruneOpenAIMessages(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const contextBudgetChars = MAX_CONTEXT_TOKENS_ESTIMATE * CHARS_PER_TOKEN_ESTIMATE;
  const softThreshold = contextBudgetChars * SOFT_TRIM_THRESHOLD;
  const hardThreshold = contextBudgetChars * HARD_CLEAR_THRESHOLD;

  // Find indices of tool messages, protect last 3
  const toolIndices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === "tool") toolIndices.push(i);
  }
  const protectedIndices = new Set(toolIndices.slice(-3));

  return messages.map((msg, idx) => {
    if (protectedIndices.has(idx)) return msg;
    if (msg.role !== "tool") return msg;
    const content = typeof msg.content === "string" ? msg.content : "";
    const len = content.length;
    if (len > hardThreshold) {
      return { ...msg, content: `[Tool result cleared — was ${Math.round(len / 1024)}KB. Re-run tool if needed.]` };
    }
    if (len > softThreshold) {
      const head = content.slice(0, SOFT_TRIM_KEEP_CHARS);
      const tail = content.slice(-SOFT_TRIM_KEEP_CHARS);
      return { ...msg, content: `${head}\n\n... [${Math.round((len - SOFT_TRIM_KEEP_CHARS * 2) / 1024)}KB trimmed] ...\n\n${tail}` };
    }
    return msg;
  });
}

// ─── Plugin Hook System (OpenClaw/ClawSafe-inspired) ──────────────────────────
// Middleware/interception layer for tool calls with before/after hooks.
// Enables audit trails, safety guardrails, and extensibility.

export interface ToolHookContext {
  taskId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  startTime?: number;
  result?: string;
  error?: boolean;
  duration_ms?: number;
}

export type BeforeToolHook = (ctx: ToolHookContext) => Promise<{ allow: boolean; reason?: string; modifiedInput?: Record<string, unknown> }>;
export type AfterToolHook = (ctx: ToolHookContext) => Promise<void>;

// Global hook registry — plugins register here
const _beforeToolHooks: BeforeToolHook[] = [];
const _afterToolHooks: AfterToolHook[] = [];

export function registerBeforeToolHook(hook: BeforeToolHook): void {
  _beforeToolHooks.push(hook);
}

export function registerAfterToolHook(hook: AfterToolHook): void {
  _afterToolHooks.push(hook);
}

// Built-in audit hook: logs all tool executions
registerAfterToolHook(async (ctx) => {
  const status = ctx.error ? "FAILED" : "OK";
  const dur = ctx.duration_ms ? `${ctx.duration_ms}ms` : "?ms";
  console.log(`[hook:audit] ${ctx.toolName} on task=${ctx.taskId} ${status} (${dur})`);
});

// Built-in safety hook: block dangerous shell commands
registerBeforeToolHook(async (ctx) => {
  if (ctx.toolName === "execute_code" && ctx.toolInput.language === "bash") {
    const code = String(ctx.toolInput.code || "");
    const dangerousPatterns = [
      /rm\s+-rf\s+\//i,               // rm -rf /
      /mkfs/i,                         // format disk
      /dd\s+if=.*of=\/dev/i,           // dd to device
      /:(){ :\|:& };:/,               // fork bomb
      />\s*\/dev\/sd[a-z]/i,           // write to disk device
      /chmod\s+-R\s+777\s+\//i,        // chmod 777 /
    ];
    for (const pattern of dangerousPatterns) {
      if (pattern.test(code)) {
        return { allow: false, reason: `Blocked: dangerous command detected (${pattern.source})` };
      }
    }
  }
  return { allow: true };
});

async function runBeforeHooks(ctx: ToolHookContext): Promise<{ allow: boolean; reason?: string; input: Record<string, unknown> }> {
  let currentInput = { ...ctx.toolInput };
  for (const hook of _beforeToolHooks) {
    const result = await hook({ ...ctx, toolInput: currentInput });
    if (!result.allow) {
      return { allow: false, reason: result.reason, input: currentInput };
    }
    if (result.modifiedInput) currentInput = result.modifiedInput;
  }
  return { allow: true, input: currentInput };
}

async function runAfterHooks(ctx: ToolHookContext): Promise<void> {
  for (const hook of _afterToolHooks) {
    try {
      await hook(ctx);
    } catch (err) {
      console.error(`[hook:after] Hook error:`, err);
    }
  }
}

// ─── Tool Definitions ─────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: "web_search",
    description: "Search the web for real-time information. Returns relevant snippets and URLs. Supports domain filtering, date ranges, recency, and language filters.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query" },
        num_results: { type: "number", description: "Number of results (default 5, max 10)", default: 5 },
        include_domains: { type: "array", items: { type: "string" }, description: "Only include results from these domains (e.g. ['arxiv.org', 'nature.com'])" },
        exclude_domains: { type: "array", items: { type: "string" }, description: "Exclude results from these domains" },
        recency: { type: "string", enum: ["hour", "day", "week", "month", "year"], description: "Filter by recency (default: no filter)" },
        search_language: { type: "string", description: "Language code for results (e.g. 'en', 'es', 'fr')" },
        date_range: { type: "object", properties: { start: { type: "string", description: "Start date (YYYY-MM-DD)" }, end: { type: "string", description: "End date (YYYY-MM-DD)" } }, description: "Filter results to a date range" },
      },
      required: ["query"],
    },
  },
  {
    name: "scrape_url",
    description: "Fetch and extract content from a specific URL. Returns main text content. Use when you need to read a specific web page, article, or document.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to fetch and scrape" },
        selector: { type: "string", description: "Optional CSS selector to extract specific content" },
      },
      required: ["url"],
    },
  },
  {
    name: "browse_web",
    description: "Browse the web and perform automated actions using a real Chrome browser (Playwright). Fill forms, click buttons, type text, extract data, take screenshots, save PDFs, automate social media posting, and more. Supports hover, keyboard shortcuts, navigation waiting, and JavaScript evaluation.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to navigate to" },
        actions: {
          type: "array",
          description: "Sequence of browser actions to perform. Each action has a type and parameters.",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["goto", "click", "type", "fill", "select", "screenshot", "extract", "wait", "scroll", "press", "hover", "evaluate", "pdf", "wait_for_navigation"], description: "Action type" },
              selector: { type: "string", description: "CSS selector for the target element" },
              value: { type: "string", description: "Value to type, URL to goto, or JS to evaluate" },
              delay_ms: { type: "number", description: "Delay after action in ms" },
            },
            required: ["type"],
          },
        },
        extract_selector: { type: "string", description: "CSS selector to extract text content after all actions" },
        screenshot: { type: "boolean", description: "Take a screenshot of final state (default false)" },
      },
      required: ["url"],
    },
  },
  {
    name: "social_media_post",
    description: "Post content to social media platforms using real browser automation (no API keys needed). Supports posting, reading feeds, and searching on Twitter/X, LinkedIn, Instagram, Reddit, Facebook, and Bluesky. Uses persistent browser sessions with saved cookies — log in once and stay authenticated. Inspired by Browser Use and OpenClaw patterns for zero-cost social media automation.",
    input_schema: {
      type: "object",
      properties: {
        platform: { type: "string", enum: ["twitter", "linkedin", "instagram", "reddit", "facebook", "bluesky"], description: "Social media platform to interact with" },
        action: { type: "string", enum: ["post", "read_feed", "search", "login_check"], description: "Action to perform. 'post' creates a new post, 'read_feed' reads the current feed, 'search' searches for posts, 'login_check' verifies authentication" },
        content: { type: "string", description: "Post content / text to publish" },
        hashtags: { type: "array", items: { type: "string" }, description: "Hashtags to append (e.g. ['#AI', '#automation'])" },
        url: { type: "string", description: "URL to share (for link posts on LinkedIn, Reddit)" },
        title: { type: "string", description: "Post title (required for Reddit)" },
        subreddit: { type: "string", description: "Target subreddit for Reddit posts (e.g. 'test')" },
        image_path: { type: "string", description: "Path to image file for Instagram posts (required for Instagram)" },
        query: { type: "string", description: "Search query (for search action)" },
        max_results: { type: "number", description: "Max results for feed/search (default 10)" },
      },
      required: ["platform", "action"],
    },
  },
  {
    name: "execute_code",
    description: "Execute Python, JavaScript, or Bash code. Use for calculations, data processing, analysis, generating charts/visualizations, and file manipulation.",
    input_schema: {
      type: "object",
      properties: {
        language: { type: "string", enum: ["python", "javascript", "bash"] },
        code: { type: "string", description: "The code to execute" },
        timeout: { type: "number", description: "Timeout in seconds (default 30, max 120)", default: 30 },
      },
      required: ["language", "code"],
    },
  },
  {
    name: "write_file",
    description: "Write content to a file in the task working directory. Creates documents, code, data files, HTML pages, etc.",
    input_schema: {
      type: "object",
      properties: {
        filename: { type: "string", description: "Filename with extension" },
        content: { type: "string", description: "File content" },
        mime_type: { type: "string", description: "MIME type (auto-detected if omitted)" },
      },
      required: ["filename", "content"],
    },
  },
  {
    name: "read_file",
    description: "Read the content of a previously created file in the task working directory.",
    input_schema: {
      type: "object",
      properties: { filename: { type: "string" } },
      required: ["filename"],
    },
  },
  {
    name: "list_files",
    description: "List all files in the task working directory.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "create_sub_agent",
    description: "Create a specialized sub-agent for a parallel or sequential sub-task (CrewAI + OpenAI Swarms inspired). Delegates research, coding, writing, data analysis, web scraping, review, and planning.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Title of the sub-task" },
        agent_type: {
          type: "string",
          enum: ["research", "code", "writing", "data_analysis", "web_scraper", "reviewer", "planner", "general"],
        },
        instructions: { type: "string", description: "Detailed instructions for the sub-agent" },
        context: { type: "string", description: "Relevant context and data" },
        model: {
          type: "string",
          enum: ["claude-opus-4-6", "claude-sonnet-4-6", "gpt-4o", "gpt-4o-mini", "gemini-1.5-pro", "auto"],
          description: "Model for the sub-agent (auto = best for task type)",
        },
      },
      required: ["title", "agent_type", "instructions"],
    },
  },
  {
    name: "connector_call",
    description: "Call a connected external service. Printify: upload_image, search_blueprints, get_blueprint_providers, get_provider_variants, create_product, publish_product, list_products, list_shops, get_product, delete_product, list_uploads. Shopify: create_blog_post, list_blogs, list_articles, update_article, create_product, list_orders, list_customers, list_pages, get_shop. Also: Slack, GitHub, Notion, Stripe, Discord, Telegram, WhatsApp, Gmail, SendGrid, Linear, etc.",
    input_schema: {
      type: "object",
      properties: {
        connector_id: { type: "string", description: "Connector ID (e.g. 'printify', 'shopify', 'slack', 'github')" },
        action: { type: "string", description: "Action to perform (e.g. 'upload_image', 'create_product', 'publish_product', 'create_blog_post')" },
        params: { type: "object", additionalProperties: true },
      },
      required: ["connector_id", "action", "params"],
    },
  },
  {
    name: "memory_store",
    description: "Store information in persistent memory across tasks. Use for user preferences, project details, learnings, and facts that persist across sessions.",
    input_schema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Descriptive key for this memory" },
        value: { type: "string", description: "Information to store" },
        tags: { type: "array", items: { type: "string" }, description: "Tags for categorization" },
      },
      required: ["key", "value"],
    },
  },
  {
    name: "memory_recall",
    description: "Search persistent memory for previously stored information. Use to recall past context, preferences, and learnings from previous tasks.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Max results (default 5)", default: 5 },
      },
      required: ["query"],
    },
  },
  {
    name: "memory_list",
    description: "List all stored memories, ordered by most recently updated. Use to audit, review, or browse the full memory bank.",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max entries to return (default 50)", default: 50 },
      },
    },
  },
  {
    name: "memory_delete",
    description: "Delete a memory entry by its ID. Use to remove stale, incorrect, or outdated memories that would mislead future tasks. Self-healing memory hygiene.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Memory entry ID to delete" },
        reason: { type: "string", description: "Why this memory is being deleted (logged for auditing)" },
      },
      required: ["id"],
    },
  },
  {
    name: "memory_update",
    description: "Update an existing memory entry's value and/or tags. Use to correct outdated information or evolve a memory with new findings rather than creating duplicates.",
    input_schema: {
      type: "object",
      properties: {
        key: { type: "string", description: "The memory key to update (must match an existing entry)" },
        value: { type: "string", description: "New value to store" },
        tags: { type: "array", items: { type: "string" }, description: "Updated tags (replaces existing)" },
      },
      required: ["key", "value"],
    },
  },
  {
    name: "list_skills",
    description: "List all available skills/capabilities with their triggers, descriptions, and active status. Use to discover what specialized behaviors are configured and available.",
    input_schema: {
      type: "object",
      properties: {
        active_only: { type: "boolean", description: "Only return active skills (default true)", default: true },
      },
    },
  },
  {
    name: "organize_files",
    description: "Organize files in the global file system. Create folders, move files into folders, or list files across all tasks. Files are visible in the Files page (macOS Finder-style browser).",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["create_folder", "move_to_folder", "list_all_files"], description: "Action to perform" },
        folder_name: { type: "string", description: "Name for folder (for create_folder)" },
        parent_folder_id: { type: "string", description: "Parent folder ID (for nested folders)" },
        file_names: { type: "array", items: { type: "string" }, description: "File names to move (for move_to_folder)" },
        target_folder_id: { type: "string", description: "Folder ID to move files into (for move_to_folder, null for root)" },
      },
      required: ["action"],
    },
  },
  {
    name: "generate_image",
    description: "Generate an image using DALL-E 3. Use for illustrations, diagrams, logos, concept art. Image is saved to task files.",
    input_schema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Detailed image description" },
        size: { type: "string", enum: ["1024x1024", "1792x1024", "1024x1792"], default: "1024x1024" },
        style: { type: "string", enum: ["vivid", "natural"], default: "vivid" },
        filename: { type: "string", description: "Output filename", default: "generated_image.png" },
      },
      required: ["prompt"],
    },
  },
  {
    name: "replicate_run",
    description: `Run any AI model on Replicate — the platform with 1000s of community ML models. Dynamically discovers the best model for any request. Supports: image generation (Flux, SDXL), video generation, image editing, upscaling, background removal, face swap, style transfer, text-to-speech, music generation, audio effects, 3D generation, image captioning, and more. The tool automatically searches Replicate's real-time model library and selects the optimal model. You can also specify a model explicitly if you know which one to use.

WHEN TO USE THIS TOOL:
- User wants image generation with specific style (Flux for photorealistic, SDXL for artistic)
- Video generation or image-to-video animation
- Image upscaling / super-resolution / enhancement
- Background removal from images
- Music or audio generation
- Text-to-speech with custom voices
- 3D model generation
- Any specialized AI task beyond what DALL-E covers
- When user mentions a specific Replicate model by name`,
    input_schema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "What you want the model to do — be descriptive. For image generation, describe the image in detail." },
        model: { type: "string", description: "Optional: explicit Replicate model as 'owner/name' (e.g. 'black-forest-labs/flux-1.1-pro', 'stability-ai/stable-video-diffusion'). If omitted, the best model is auto-selected." },
        params: {
          type: "object",
          additionalProperties: true,
          description: "Optional: extra model-specific input parameters (e.g. { image: 'https://...', num_outputs: 4, aspect_ratio: '16:9' })",
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "send_email",
    description: "Send an email via Resend API or connected email service (Gmail/Outlook).",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string" },
        subject: { type: "string" },
        body: { type: "string", description: "Email body (supports HTML)" },
        from: { type: "string", description: "Sender (uses default if omitted)" },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "request_user_input",
    description: "Request input from the user when you need information that cannot be inferred. Pauses the task.",
    input_schema: {
      type: "object",
      properties: {
        question: { type: "string" },
        options: { type: "array", items: { type: "string" } },
        context: { type: "string" },
      },
      required: ["question"],
    },
  },
  {
    name: "complete_task",
    description: "Mark the task as complete with a comprehensive summary. ALWAYS call this when fully done.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        files_created: { type: "array", items: { type: "string" } },
        add_to_gallery: { type: "boolean", default: false },
      },
      required: ["summary"],
    },
  },
  {
    name: "dream_machine",
    description: `Produce a multi-clip visual production using Luma Dream Machine or Replicate — videos, images, storyboards, commercials, short films, trailers, mood reels. Each shot is generated independently and assembled into a storyboard that the user can view in the Dream Machine tab.

Capabilities per shot:
  - text-to-video: text prompt → video clip (default)
  - image-to-video: static image → animated clip
  - text-to-image: text prompt → still image
  - extend: extend a previously-generated clip
  - interpolate: smooth transition between two clips
  - modify-video: restyle or edit an existing video
  - reframe: change aspect ratio of video or image

WHEN TO USE:
  - "Make a commercial for X"
  - "Create a 4-shot promo with voiceover guidance and various angles"
  - "Generate a mood reel / brand film / trailer"
  - "Build a storyboard for my video campaign"
  - User asks for multiple video clips in a cohesive production

Models:
  - Video: ray-3 (high quality), ray-flash-3 (fast/cheap)
  - Image: photon-1 (high quality), photon-flash-1 (fast)

IMPORTANT: Plan descriptive, cinematic prompts for each shot before calling this tool. Include camera angle, lighting, subject action, mood, and setting in each prompt.`,
    input_schema: {
      type: "object",
      properties: {
        board_name: { type: "string", description: "Production title, e.g. 'Nike Protein Bar — Brand Film'" },
        shots: {
          type: "array",
          description: "Ordered list of shots/clips to generate",
          items: {
            type: "object",
            properties: {
              prompt: { type: "string", description: "Detailed cinematic description of this shot" },
              mode: {
                type: "string",
                enum: ["text-to-video", "image-to-video", "text-to-image", "extend", "interpolate", "modify-video", "reframe"],
                description: "Generation mode (default: text-to-video)",
                default: "text-to-video",
              },
              model: {
                type: "string",
                enum: ["ray-3", "ray-flash-3", "photon-1", "photon-flash-1"],
                description: "Model to use (default: ray-3 for video, photon-1 for image)",
              },
              aspect_ratio: { type: "string", enum: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "9:21"], default: "16:9" },
              duration: { type: "string", enum: ["5s", "9s"], default: "5s" },
              image_url: { type: "string", description: "Source image URL for image-to-video or modify modes" },
            },
            required: ["prompt"],
          },
        },
        provider: {
          type: "string",
          enum: ["auto", "luma", "replicate"],
          description: "Which provider to use (default: auto selects best available)",
          default: "auto",
        },
      },
      required: ["board_name", "shots"],
    },
  },
  {
    name: "deep_research",
    description: `Perform Deep Research — a thorough, multi-step research process that searches dozens of queries, reads hundreds of sources, and iteratively refines analysis. Like Perplexity's Deep Research 2.0.

Use this tool when:
- User asks for "deep research", "thorough analysis", or "comprehensive report"
- Complex topics requiring multiple perspectives and sources
- Topics needing fact-checking across multiple sources
- Market research, competitive analysis, technical deep-dives
- Any request that benefits from breadth AND depth of research

The tool automatically:
1. Generates diverse search queries from multiple angles
2. Searches and scrapes the most relevant sources
3. Cross-references findings for accuracy
4. Synthesizes a structured, cited report

Output: A comprehensive research report with citations and key findings.`,
    input_schema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "The research topic or question" },
        depth: { type: "string", enum: ["standard", "deep", "exhaustive"], description: "Research depth: standard (5 queries), deep (10 queries), exhaustive (20+ queries)", default: "deep" },
        focus_areas: { type: "array", items: { type: "string" }, description: "Optional specific aspects to focus on" },
        output_format: { type: "string", enum: ["report", "bullets", "executive_summary", "comparison"], description: "Output format (default: report)", default: "report" },
      },
      required: ["topic"],
    },
  },
  {
    name: "finance_data",
    description: `Retrieve live financial data, market information, and business intelligence. Covers stock quotes, company financials, SEC filings, market trends, and economic data.

Data available:
- Stock quotes & price history (any public ticker)
- Company financials (revenue, earnings, market cap, P/E ratio)
- SEC filings (10-K, 10-Q, 8-K)
- Market indices & sector performance
- Cryptocurrency prices
- Economic indicators (GDP, CPI, unemployment, interest rates)
- Company news and analyst ratings
- Forex exchange rates
- IPO calendar and earnings calendar

Use when:
- User asks about stock prices, market data, company financials
- Financial analysis or investment research
- Building financial dashboards or charts
- Comparing companies or market sectors`,
    input_schema: {
      type: "object",
      properties: {
        query_type: {
          type: "string",
          enum: ["stock_quote", "company_financials", "sec_filing", "market_overview", "crypto", "economic_indicator", "forex", "news", "earnings"],
          description: "Type of financial data to retrieve",
        },
        symbol: { type: "string", description: "Ticker symbol (e.g., AAPL, BTC-USD, EUR/USD)" },
        query: { type: "string", description: "Natural language query for search-based financial data" },
        period: { type: "string", enum: ["1d", "5d", "1mo", "3mo", "6mo", "1y", "5y", "max"], description: "Time period for historical data", default: "1mo" },
      },
      required: ["query_type"],
    },
  },
];

// ─── OpenAI-format tools ──────────────────────────────────────────────────────

function convertToolsToOpenAIFormat(): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return TOOLS.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema as Record<string, unknown>,
    },
  }));
}

// ─── Agent Run Options ────────────────────────────────────────────────────────

export interface AgentRunOptions {
  taskId: string;
  userMessage: string;
  title?: string;
  skills?: string;
  model?: ModelId;
  onStep?: (step: AgentStep) => void;
  onToken?: (token: string) => void;
  signal?: AbortSignal;
}

// ─── Modality-First Model Selection (Otto-inspired) ──────────────────────────
// Two-phase approach: detect output modality FIRST, then pick the optimal model

interface ModalityPattern {
  modality: Modality;
  keywords: RegExp;
  priority: number; // higher = stronger signal
}

const MODALITY_PATTERNS: ModalityPattern[] = [
  { modality: "image", keywords: /\b(image|picture|photo|illustration|logo|icon|draw|sketch|visual|art|design|graphic|poster|banner|wallpaper|avatar|thumbnail)\b/i, priority: 10 },
  { modality: "email", keywords: /\b(email|e-mail|mail|send|draft\s+email|compose|newsletter)\b/i, priority: 9 },
  { modality: "code", keywords: /\b(code|program|script|function|class|api|app|build|implement|debug|fix|refactor|test|deploy|website|dashboard|prototype|component)\b/i, priority: 7 },
  { modality: "data", keywords: /\b(analyze|chart|graph|plot|visuali[sz]e|statistics|csv|spreadsheet|dataset|metrics|numbers|calculate|forecast|regression)\b/i, priority: 6 },
  { modality: "research", keywords: /\b(research|investigate|explore|study|compare|survey|literature|deep.?dive|analysis|report|review|comprehensive)\b/i, priority: 5 },
  { modality: "writing", keywords: /\b(write|draft|essay|blog|article|document|report|letter|content|copy|summary|translate|story|creative)\b/i, priority: 4 },
];

function detectModality(text: string): Modality {
  // Position-weighted scoring: keywords earlier in the prompt are weighted higher
  const totalWords = Math.max(text.split(/\s+/).length, 1);
  const scores: Partial<Record<Modality, number>> = {};

  for (const pattern of MODALITY_PATTERNS) {
    const matches = text.match(new RegExp(pattern.keywords, "gi"));
    if (!matches) continue;

    let positionBonus = 0;
    for (const match of matches) {
      const idx = text.toLowerCase().indexOf(match.toLowerCase());
      const wordPos = text.slice(0, idx).split(/\s+/).length;
      positionBonus += (1 - wordPos / totalWords) * 3;
    }
    scores[pattern.modality] = (scores[pattern.modality] || 0) + matches.length * pattern.priority + positionBonus;
  }

  let bestModality: Modality = "general";
  let bestScore = 0;
  for (const [mod, score] of Object.entries(scores)) {
    if (score > bestScore) { bestScore = score; bestModality = mod as Modality; }
  }
  return bestModality;
}

/** Model routing table per modality — ordered by preference */
const MODALITY_MODEL_MAP: Record<Modality, Array<{ provider: string; modelName: string }>> = {
  image:    [{ provider: "openai", modelName: "gpt-4o" }, { provider: "anthropic", modelName: "claude-sonnet-4-6" }],
  email:    [{ provider: "openai", modelName: "gpt-4.1-mini" }, { provider: "anthropic", modelName: "claude-3.5-haiku" }],
  code:     [{ provider: "anthropic", modelName: "claude-sonnet-4-6" }, { provider: "openai", modelName: "gpt-4.1" }],
  data:     [{ provider: "anthropic", modelName: "claude-sonnet-4-6" }, { provider: "openai", modelName: "gpt-4o" }],
  research: [{ provider: "google", modelName: "gemini-2.0-flash" }, { provider: "anthropic", modelName: "claude-sonnet-4-6" }],
  writing:  [{ provider: "openai", modelName: "gpt-4.1-mini" }, { provider: "anthropic", modelName: "claude-sonnet-4-6" }],
  general:  [{ provider: "anthropic", modelName: "claude-sonnet-4-6" }, { provider: "openai", modelName: "gpt-4.1-mini" }],
};

function selectModelForTask(
  requestedModel: ModelId | undefined,
  taskText: string
): { provider: string; modelName: string } {
  if (!requestedModel || (requestedModel as string) === "auto") {
    const modality = detectModality(taskText);
    const candidates = MODALITY_MODEL_MAP[modality];
    for (const candidate of candidates) {
      if (candidate.provider === "anthropic" && process.env.ANTHROPIC_API_KEY) return candidate;
      if (candidate.provider === "openai" && process.env.OPENAI_API_KEY) return candidate;
      if (candidate.provider === "google" && process.env.GOOGLE_AI_API_KEY) return candidate;
    }
    return { provider: "anthropic", modelName: "claude-sonnet-4-6" };
  }
  // OpenRouter special handling
  if (requestedModel === "openrouter") {
    const orModel = process.env.OPENROUTER_DEFAULT_MODEL || "anthropic/claude-3.5-haiku";
    return { provider: "openrouter", modelName: orModel };
  }
  const modelMap: Record<string, { provider: string; modelName: string }> = {
    "claude-opus-4-6": { provider: "anthropic", modelName: "claude-opus-4-6" },
    "claude-sonnet-4-6": { provider: "anthropic", modelName: "claude-sonnet-4-6" },
    "claude-3.5-haiku": { provider: "anthropic", modelName: "claude-3.5-haiku" },
    "claude-opus-4-5": { provider: "anthropic", modelName: "claude-opus-4-6" },
    "claude-sonnet-4-5": { provider: "anthropic", modelName: "claude-sonnet-4-6" },
    "gpt-4o": { provider: "openai", modelName: "gpt-4o" },
    "gpt-4o-mini": { provider: "openai", modelName: "gpt-4o-mini" },
    "gpt-4.1": { provider: "openai", modelName: "gpt-4.1" },
    "gpt-4.1-mini": { provider: "openai", modelName: "gpt-4.1-mini" },
    "gpt-4.1-nano": { provider: "openai", modelName: "gpt-4.1-nano" },
    "gemini-1.5-pro": { provider: "google", modelName: "gemini-1.5-pro" },
    "gemini-1.5-flash": { provider: "google", modelName: "gemini-1.5-flash" },
    "gemini-2.0-flash": { provider: "google", modelName: "gemini-2.0-flash" },
    "sonar": { provider: "perplexity", modelName: "sonar-pro" },
    "sonar-pro": { provider: "perplexity", modelName: "sonar-pro" },
    "sonar-reasoning-pro": { provider: "perplexity", modelName: "sonar-reasoning-pro" },
  };
  const mapped = modelMap[requestedModel];
  // If Perplexity provider selected but no API key, fall back to Anthropic
  if (mapped?.provider === "perplexity" && !process.env.PERPLEXITY_API_KEY) {
    return { provider: "anthropic", modelName: "claude-sonnet-4-6" };
  }
  return mapped || { provider: "anthropic", modelName: "claude-sonnet-4-6" };
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

// Built-in presets matching Perplexity Agent API
const BUILTIN_PRESETS: Record<string, { model: string; max_steps: number; max_tokens: number }> = {
  "fast-search":               { model: "gpt-4.1-mini",       max_steps: 3,  max_tokens: 4096 },
  "pro-search":                { model: "claude-sonnet-4-6",   max_steps: 10, max_tokens: 8192 },
  "deep-research":             { model: "claude-sonnet-4-6",   max_steps: 25, max_tokens: 16384 },
  "advanced-deep-research":    { model: "claude-opus-4-6",     max_steps: 50, max_tokens: 16384 },
};

export async function runAgent(options: AgentRunOptions): Promise<void> {
  const { taskId, userMessage, skills, model, onStep, onToken, signal } = options;
  const filesDir = path.join(ensureFilesDir(), taskId);
  if (!fs.existsSync(filesDir)) fs.mkdirSync(filesDir, { recursive: true });

  // Load active skills and match triggers against the prompt
  let matchedSkill: import("./types").Skill | undefined;
  let skillInstructions = skills || "";
  try {
    const { listSkills } = await import("./db");
    const activeSkills = listSkills().filter(s => s.is_active);
    for (const skill of activeSkills) {
      if (skill.triggers && skill.triggers.length > 0) {
        const matches = skill.triggers.some(trigger =>
          new RegExp(trigger, "i").test(userMessage)
        );
        if (matches) {
          matchedSkill = skill;
          skillInstructions = skill.instructions;
          break;
        }
      }
    }
    // If no trigger match but we have skills text, still use it
    if (!matchedSkill && !skillInstructions) {
      const allInstructions = activeSkills.map(s => s.instructions).filter(Boolean).join("\n");
      if (allInstructions) skillInstructions = allInstructions;
    }
  } catch { /* best-effort */ }

  // Apply preset config from matched skill or built-in preset
  const presetConfig = matchedSkill?.preset_type && BUILTIN_PRESETS[matchedSkill.preset_type]
    ? BUILTIN_PRESETS[matchedSkill.preset_type]
    : undefined;
  const effectiveModel = (matchedSkill?.model as ModelId) || model;
  const effectiveMaxSteps = matchedSkill?.max_steps || presetConfig?.max_steps || 50;

  // Get existing messages for conversation context
  const { getTask: fetchTask } = await import("./db");
  const currentTask = fetchTask(taskId);
  const previousMessages = currentTask?.messages || [];

  // Only add user message if not a duplicate of the last one
  const lastMsg = previousMessages[previousMessages.length - 1];
  if (!lastMsg || lastMsg.role !== "user" || lastMsg.content !== userMessage) {
    addMessage({ id: uuidv4(), task_id: taskId, role: "user", content: userMessage, created_at: new Date().toISOString() });
  }
  updateTaskStatus(taskId, "running");

  // ─── Inject uploaded file context ──────────────────────────────────────────
  // Check the task working directory for user-uploaded files and tell the agent
  // about them so it knows to use read_file / list_files without guessing.
  // For small text files, inline the content directly so the agent has immediate access.
  let uploadedFilesContext = "";
  try {
    const existingFiles = fs.readdirSync(filesDir);
    if (existingFiles.length > 0) {
      const TEXT_EXTENSIONS = new Set([".txt", ".md", ".csv", ".json", ".xml", ".html", ".css", ".js", ".ts", ".py", ".sh", ".yaml", ".yml", ".sql", ".r", ".log", ".env", ".cfg", ".ini", ".toml", ".jsx", ".tsx", ".vue", ".svelte", ".rb", ".php", ".java", ".c", ".cpp", ".h", ".go", ".rs", ".swift", ".kt"]);
      const MAX_INLINE_SIZE = 30000; // inline files under 30KB
      const MAX_TOTAL_INLINE = 80000; // cap total inlined content
      let totalInlined = 0;
      const fileEntries: string[] = [];
      const inlinedContents: string[] = [];

      for (const f of existingFiles) {
        const fp = path.join(filesDir, f);
        const stat = fs.statSync(fp);
        const ext = path.extname(f).toLowerCase();
        const isText = TEXT_EXTENSIONS.has(ext);
        fileEntries.push(`- ${f} (${formatBytes(stat.size)}, ${isText ? "text" : "binary"})`);

        // Inline small text files directly into the system prompt
        if (isText && stat.size <= MAX_INLINE_SIZE && totalInlined + stat.size <= MAX_TOTAL_INLINE) {
          try {
            const content = fs.readFileSync(fp, "utf-8");
            inlinedContents.push(`### File: ${f}\n\`\`\`\n${content}\n\`\`\``);
            totalInlined += stat.size;
          } catch { /* skip files that fail to read */ }
        }
      }

      uploadedFilesContext = `\n\n## Uploaded Files\nThe user has uploaded the following files to your working directory. You MUST use these files when the user references them.\n${fileEntries.join("\n")}\n\nUse \`read_file\` to access any file. Use \`list_files\` to see all available files.\n\nIMPORTANT: These files are ALREADY in your working directory. Do NOT say you cannot see or access them. If the user asks about a file, READ IT with read_file immediately.`;

      // Append inlined content so the agent already has the data
      if (inlinedContents.length > 0) {
        uploadedFilesContext += `\n\n## File Contents (auto-loaded)\nThe following file contents have been pre-loaded for your immediate use:\n\n${inlinedContents.join("\n\n")}`;
      }

      // For binary files (PDF, DOCX, images), add guidance
      const binaryFiles = existingFiles.filter(f => !TEXT_EXTENSIONS.has(path.extname(f).toLowerCase()));
      if (binaryFiles.length > 0) {
        uploadedFilesContext += `\n\nFor binary files (${binaryFiles.join(", ")}): Use execute_code with Python to extract content. For PDFs: \`import subprocess; subprocess.run(["pip", "install", "PyPDF2"], capture_output=True); from PyPDF2 import PdfReader; reader = PdfReader("${binaryFiles[0]}"); text = "\\n".join(p.extract_text() for p in reader.pages); print(text)\`. For DOCX: use python-docx. For images: describe what you see from the filename and context.`;
      }
    }
  } catch { /* best-effort — directory may not exist yet */ }

  // ─── Auto-recall relevant memories ─────────────────────────────────────────
  // Proactively pull in relevant cross-task memories so the agent has context
  // without needing to explicitly call memory_recall on the first turn.
  let memoryContext = "";
  try {
    const relevantMemories = memoryRecall(userMessage, 5);
    if (relevantMemories.length > 0) {
      const memLines = relevantMemories.map((m, i) => `${i + 1}. **${m.key}**: ${m.value}${m.tags && m.tags.length > 0 ? ` [${m.tags.join(", ")}]` : ""}`);
      memoryContext = `\n\n## Relevant Memories (auto-recalled)\nThese memories from previous tasks may be relevant:\n${memLines.join("\n")}\n\nUse these as context. Store new findings with memory_store. Update stale memories with memory_update. Delete incorrect ones with memory_delete. List all memories with memory_list.`;
    }
  } catch { /* best-effort */ }

  // ─── Global files awareness ─────────────────────────────────────────────────
  // Give the agent a rich view of the entire file system including folders
  let globalFilesContext = "";
  try {
    const allFiles = listAllFiles(100);
    const allFolders = listFolders();

    const parts: string[] = [];

    // Folder structure
    if (allFolders.length > 0) {
      const folderLines = allFolders.map(f => {
        const parent = f.parent_id ? allFolders.find(p => p.id === f.parent_id) : null;
        return `- 📁 "${f.name}"${parent ? ` (inside "${parent.name}")` : ""} [id: ${f.id}]`;
      });
      parts.push(`### Folders\n${folderLines.join("\n")}`);
    }

    // Current task files
    const currentTaskFiles = allFiles.filter(f => f.task_id === taskId);
    if (currentTaskFiles.length > 0) {
      const fileLines = currentTaskFiles.map(f => {
        const folder = f.folder_id ? allFolders.find(fld => fld.id === f.folder_id) : null;
        return `- ${f.name} (${formatBytes(f.size)}, ${f.mime_type})${folder ? ` [in folder "${folder.name}"]` : ""}`;
      });
      parts.push(`### This Task's Files\n${fileLines.join("\n")}`);
    }

    // Other task files
    const otherTaskFiles = allFiles.filter(f => f.task_id !== taskId);
    if (otherTaskFiles.length > 0) {
      const fileLines = otherTaskFiles.slice(0, 30).map(f => {
        const folder = f.folder_id ? allFolders.find(fld => fld.id === f.folder_id) : null;
        return `- ${f.name} (from: "${f.task_title || "untitled"}", ${formatBytes(f.size)}, ${f.mime_type})${folder ? ` [in folder "${folder.name}"]` : ""}`;
      });
      parts.push(`### Files from Other Tasks\n${fileLines.join("\n")}${otherTaskFiles.length > 30 ? `\n... and ${otherTaskFiles.length - 30} more files` : ""}`);
    }

    if (parts.length > 0) {
      globalFilesContext = `\n\n## Global File System\nYou have access to the complete file system. All files you create are automatically registered here. The user can browse these in the Files page (macOS Finder-style) with folders, categories, and previews.\n\n${parts.join("\n\n")}\n\nYou can reference any file at /api/files/<task_id>/<filename>. Store important file metadata in memory for cross-task recall.`;
    }
  } catch { /* best-effort */ }

  // Inject learned insights from past similar tasks (Otto self-improvement)
  const learnedInsights = getLearnedInsights(userMessage);
  const systemPrompt = buildSystemPrompt(skillInstructions) + learnedInsights + uploadedFilesContext + memoryContext + globalFilesContext;
  const primary = selectModelForTask(effectiveModel, userMessage);

  // Track model call in analytics
  try {
    recordAnalyticsEvent({
      id: uuidv4(),
      event_type: "model_call",
      model: primary.modelName,
      success: true,
      metadata: { provider: primary.provider, modality: detectModality(userMessage) },
    });
  } catch { /* best-effort */ }

  // Build conversation history with smart compaction (OpenClaw-inspired)
  const history = await compactHistory(previousMessages, primary.modelName);

  // Model failover chain: try primary, then fallback providers
  const failoverChain = getFailoverChain(primary);
  let lastError: unknown = null;

  for (let attempt = 0; attempt < failoverChain.length; attempt++) {
    const { provider, modelName: mName } = failoverChain[attempt];
    if (attempt > 0) {
      // Log failover step
      const failoverStep: AgentStep = {
        id: uuidv4(), task_id: taskId, type: "reasoning",
        title: `Failover: switching to ${mName}`,
        content: `Previous model failed (${lastError instanceof Error ? lastError.message : String(lastError)}). Retrying with ${mName}...`,
        status: "completed", created_at: new Date().toISOString(),
      };
      addAgentStep(failoverStep);
      onStep?.(failoverStep);
      // Backoff before retry
      await sleep(FAILOVER_BACKOFF_MS[Math.min(attempt - 1, FAILOVER_BACKOFF_MS.length - 1)]);
    }

    try {
      if (provider === "perplexity" && process.env.PERPLEXITY_API_KEY) {
        return await runWithPerplexity(taskId, userMessage, systemPrompt, mName, filesDir, onStep, onToken, signal, history, effectiveMaxSteps);
      }
      if (provider === "openrouter" && process.env.OPENROUTER_API_KEY) {
        return await runWithOpenRouter(taskId, userMessage, systemPrompt, mName, filesDir, onStep, onToken, signal, history, effectiveMaxSteps);
      }
      if (provider === "openai" && process.env.OPENAI_API_KEY) {
        return await runWithOpenAI(taskId, userMessage, systemPrompt, mName, filesDir, onStep, onToken, signal, history, effectiveMaxSteps);
      }
      if (provider === "google" && googleAI) {
        return await runWithGoogle(taskId, userMessage, systemPrompt, mName, filesDir, onStep, onToken, signal, history, effectiveMaxSteps);
      }
      return await runWithAnthropic(taskId, userMessage, systemPrompt, mName, filesDir, onStep, onToken, signal, history, effectiveMaxSteps);
    } catch (err) {
      lastError = err;
      if (!isTransientError(err) || attempt === failoverChain.length - 1) {
        throw err; // non-transient or exhausted all fallbacks
      }
    }
  }
  // Should not reach here, but just in case
  throw lastError;
}

// ─── Anthropic Provider ───────────────────────────────────────────────────────

async function runWithAnthropic(
  taskId: string,
  userMessage: string,
  systemPrompt: string,
  modelName: string,
  filesDir: string,
  onStep?: (step: AgentStep) => void,
  onToken?: (token: string) => void,
  signal?: AbortSignal,
  history?: Array<{ role: string; content: string }>,
  maxSteps = 50
): Promise<void> {
  // Build messages with conversation history
  const messages: Anthropic.MessageParam[] = [];
  if (history && history.length > 0) {
    // Include previous conversation context (last 10 messages max for token efficiency)
    const recentHistory = history.slice(-10);
    for (const msg of recentHistory) {
      if (msg.role === "user" || msg.role === "assistant") {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
    // Add current user message if not already the last message
    const lastHistMsg = messages[messages.length - 1];
    if (!lastHistMsg || lastHistMsg.role !== "user" || lastHistMsg.content !== userMessage) {
      messages.push({ role: "user", content: userMessage });
    }
  } else {
    messages.push({ role: "user", content: userMessage });
  }
  let continueLoop = true;
  let iterations = 0;
  let liveSystemPrompt = systemPrompt; // mutable — refreshed with live context every few iterations

  try {
    while (continueLoop && iterations < maxSteps) {
      if (signal?.aborted) { updateTaskStatus(taskId, "paused"); return; }
      iterations++;

      // ─── Live context refresh: re-inject memories, files, skills every 5 iterations ───
      if (iterations > 1 && iterations % 5 === 0) {
        liveSystemPrompt = refreshSystemContext(systemPrompt, taskId, filesDir, userMessage);
      }

      const thinkingId = uuidv4();
      const thinkingStep: AgentStep = {
        id: thinkingId, task_id: taskId, type: "reasoning",
        title: iterations === 1 ? "Planning approach..." : "Continuing work...",
        content: "", status: "running", created_at: new Date().toISOString(),
      };
      addAgentStep(thinkingStep);
      onStep?.(thinkingStep);
      const startTime = Date.now();

      let fullText = "";
      // Apply two-phase tool result pruning before each LLM call (OpenClaw-inspired)
      const prunedMessages = pruneToolResults(messages);
      // Force tool use on the first iteration so the agent can't just write a plan and stop
      const toolChoice: Anthropic.Messages.ToolChoiceAuto | Anthropic.Messages.ToolChoiceAny =
        iterations === 1 ? { type: "any" } : { type: "auto" };
      const stream = anthropic.messages.stream({
        model: modelName, max_tokens: 8192, system: liveSystemPrompt, tools: TOOLS, messages: prunedMessages,
        tool_choice: toolChoice,
      });

      let response: Anthropic.Message;
      try {
        for await (const event of stream) {
          if (signal?.aborted) break;
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            fullText += event.delta.text;
            onToken?.(event.delta.text);
          }
        }
        response = await stream.finalMessage();
      } catch (err) {
        if (signal?.aborted) { updateTaskStatus(taskId, "paused"); return; }
        throw err;
      }

      updateAgentStep(thinkingId, {
        content: fullText || "Processing...", status: "completed",
        duration_ms: Date.now() - startTime,
      });
      // Track token usage (OpenClaw-inspired)
      if (response.usage) {
        trackTokenUsage(taskId, {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
          total_tokens: response.usage.input_tokens + response.usage.output_tokens,
          estimated_cost_usd: estimateCost(modelName, response.usage.input_tokens, response.usage.output_tokens),
          model: modelName,
        });
      }
      messages.push({ role: "assistant", content: response.content });

      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      if (toolUses.length === 0) {
        const text = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");
        if (text) addMessage({ id: uuidv4(), task_id: taskId, role: "assistant", content: text, created_at: new Date().toISOString() });
        continueLoop = false;
        updateTaskStatus(taskId, "completed", new Date().toISOString());
        break;
      }

      // Separate parallelizable tools (sub-agents, web searches) from sequential ones
      const parallelizable = new Set(["create_sub_agent", "web_search", "scrape_url", "memory_recall", "memory_list", "list_skills"]);
      const parallelTools = toolUses.filter(t => parallelizable.has(t.name));
      const sequentialTools = toolUses.filter(t => !parallelizable.has(t.name));

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      // Execute parallelizable tools concurrently (like Perplexity Computer's parallel sub-agents)
      if (parallelTools.length > 1) {
        const parallelResults = await Promise.all(parallelTools.map(async (toolUse) => {
          const stepId = uuidv4();
          const toolStep: AgentStep = {
            id: stepId, task_id: taskId,
            type: toolUseTypeToStepType(toolUse.name as ToolName),
            title: toolUseToTitle(toolUse.name, toolUse.input as Record<string, unknown>),
            content: JSON.stringify(toolUse.input, null, 2),
            tool_name: toolUse.name,
            tool_input: toolUse.input as Record<string, unknown>,
            status: "running", created_at: new Date().toISOString(),
          };
          addAgentStep(toolStep);
          onStep?.(toolStep);
          const ts = Date.now();
          let result = ""; let toolError = false;
          try {
            result = await executeTool(toolUse.name as ToolName, toolUse.input as Record<string, unknown>, { taskId, filesDir, onStep });
          } catch (err) {
            result = `Error: ${err instanceof Error ? err.message : String(err)}`;
            toolError = true;
          }
          const duration = Date.now() - ts;
          updateAgentStep(stepId, { tool_result: result, status: toolError ? "failed" : "completed", duration_ms: duration });
          onStep?.({ ...toolStep, tool_result: result, status: toolError ? "failed" : "completed", duration_ms: duration });
          return { type: "tool_result" as const, tool_use_id: toolUse.id, content: result };
        }));
        toolResults.push(...parallelResults);
      } else {
        // Single parallelizable tool or none — run as sequential
        for (const toolUse of parallelTools) {
          const stepId = uuidv4();
          const toolStep: AgentStep = {
            id: stepId, task_id: taskId,
            type: toolUseTypeToStepType(toolUse.name as ToolName),
            title: toolUseToTitle(toolUse.name, toolUse.input as Record<string, unknown>),
            content: JSON.stringify(toolUse.input, null, 2),
            tool_name: toolUse.name,
            tool_input: toolUse.input as Record<string, unknown>,
            status: "running", created_at: new Date().toISOString(),
          };
          addAgentStep(toolStep);
          onStep?.(toolStep);
          const ts = Date.now();
          let result = ""; let toolError = false;
          try {
            result = await executeTool(toolUse.name as ToolName, toolUse.input as Record<string, unknown>, { taskId, filesDir, onStep });
          } catch (err) {
            result = `Error: ${err instanceof Error ? err.message : String(err)}`;
            toolError = true;
          }
          const duration = Date.now() - ts;
          updateAgentStep(stepId, { tool_result: result, status: toolError ? "failed" : "completed", duration_ms: duration });
          onStep?.({ ...toolStep, tool_result: result, status: toolError ? "failed" : "completed", duration_ms: duration });
          toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: result });
        }
      }

      // Execute sequential tools one at a time
      for (const toolUse of sequentialTools) {
        const stepId = uuidv4();
        const toolStep: AgentStep = {
          id: stepId, task_id: taskId,
          type: toolUseTypeToStepType(toolUse.name as ToolName),
          title: toolUseToTitle(toolUse.name, toolUse.input as Record<string, unknown>),
          content: JSON.stringify(toolUse.input, null, 2),
          tool_name: toolUse.name,
          tool_input: toolUse.input as Record<string, unknown>,
          status: "running", created_at: new Date().toISOString(),
        };
        addAgentStep(toolStep);
        onStep?.(toolStep);
        const ts = Date.now();
        let result = ""; let toolError = false;
        try {
          result = await executeTool(toolUse.name as ToolName, toolUse.input as Record<string, unknown>, { taskId, filesDir, onStep });
        } catch (err) {
          result = `Error: ${err instanceof Error ? err.message : String(err)}`;
          toolError = true;
        }
        const duration = Date.now() - ts;
        updateAgentStep(stepId, { tool_result: result, status: toolError ? "failed" : "completed", duration_ms: duration });
        onStep?.({ ...toolStep, tool_result: result, status: toolError ? "failed" : "completed", duration_ms: duration });
        toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: result });
        if (toolUse.name === "complete_task") continueLoop = false;
        if (toolUse.name === "request_user_input") { updateTaskStatus(taskId, "waiting_for_input"); continueLoop = false; }
        if (result.startsWith("[APPROVAL_REQUIRED]")) continueLoop = false;
      }
      messages.push({ role: "user", content: toolResults });
      if (response.stop_reason === "end_turn" && toolUses.length === 0) continueLoop = false;
    }
    const { getTask } = await import("./db");
    const t = getTask(taskId);
    if (t?.status === "running") updateTaskStatus(taskId, "completed", new Date().toISOString());
  } catch (err) { handleAgentError(err, taskId, onStep); }
}

// ─── OpenAI Provider ──────────────────────────────────────────────────────────

async function runWithOpenAI(
  taskId: string,
  userMessage: string,
  systemPrompt: string,
  modelName: string,
  filesDir: string,
  onStep?: (step: AgentStep) => void,
  onToken?: (token: string) => void,
  signal?: AbortSignal,
  history?: Array<{ role: string; content: string }>,
  maxSteps = 50
): Promise<void> {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
  ];
  // Add conversation history
  if (history && history.length > 0) {
    for (const msg of history.slice(-10)) {
      if (msg.role === "user" || msg.role === "assistant") {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== "user" || lastMsg.content !== userMessage) {
      messages.push({ role: "user", content: userMessage });
    }
  } else {
    messages.push({ role: "user", content: userMessage });
  }
  const tools = convertToolsToOpenAIFormat();
  let continueLoop = true; let iterations = 0;

  try {
    while (continueLoop && iterations < maxSteps) {
      if (signal?.aborted) { updateTaskStatus(taskId, "paused"); return; }
      iterations++;

      // ─── Live context refresh ───
      if (iterations > 1 && iterations % 5 === 0) {
        const refreshed = refreshSystemContext(systemPrompt, taskId, filesDir, userMessage);
        messages[0] = { role: "system", content: refreshed };
      }

      const thinkingId = uuidv4();
      addAgentStep({
        id: thinkingId, task_id: taskId, type: "reasoning",
        title: iterations === 1 ? `Planning with ${modelName}...` : "Continuing work...",
        content: "", status: "running", created_at: new Date().toISOString(),
      });
      const startTime = Date.now(); let fullText = "";
      // Apply two-phase tool result pruning before each LLM call
      const prunedMessages = pruneOpenAIMessages(messages);
      const stream = await openai.chat.completions.create({
        model: modelName, max_tokens: 8192, messages: prunedMessages, tools, stream: true,
        // Force tool use on the first iteration so the agent can't just write a plan and stop
        tool_choice: iterations === 1 ? "required" : "auto",
      });
      type PartialTC = { id: string; name: string; arguments: string };
      const tcMap: Record<number, PartialTC> = {};
      let streamUsage: { prompt_tokens?: number; completion_tokens?: number } | undefined;
      for await (const chunk of stream) {
        if (signal?.aborted) break;
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) { fullText += delta.content; onToken?.(delta.content); }
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (tc.index !== undefined) {
              if (!tcMap[tc.index]) tcMap[tc.index] = { id: "", name: "", arguments: "" };
              if (tc.id) tcMap[tc.index].id = tc.id;
              if (tc.function?.name) tcMap[tc.index].name = tc.function.name;
              if (tc.function?.arguments) tcMap[tc.index].arguments += tc.function.arguments;
            }
          }
        }
        if (chunk.usage) streamUsage = chunk.usage;
      }
      const toolCalls = Object.values(tcMap);
      updateAgentStep(thinkingId, { content: fullText || "Processing...", status: "completed", duration_ms: Date.now() - startTime });
      // Track token usage
      if (streamUsage) {
        const inTok = streamUsage.prompt_tokens || 0;
        const outTok = streamUsage.completion_tokens || 0;
        trackTokenUsage(taskId, { input_tokens: inTok, output_tokens: outTok, total_tokens: inTok + outTok, estimated_cost_usd: estimateCost(modelName, inTok, outTok), model: modelName });
      }
      const assistantMsg: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam = {
        role: "assistant", content: fullText || null,
      };
      if (toolCalls.length > 0) {
        assistantMsg.tool_calls = toolCalls.map((tc) => ({
          id: tc.id, type: "function" as const, function: { name: tc.name, arguments: tc.arguments },
        }));
      }
      messages.push(assistantMsg);
      if (toolCalls.length === 0) {
        if (fullText) addMessage({ id: uuidv4(), task_id: taskId, role: "assistant", content: fullText, created_at: new Date().toISOString() });
        continueLoop = false; updateTaskStatus(taskId, "completed", new Date().toISOString()); break;
      }
      // Separate parallelizable tools from sequential ones
      const parallelizable = new Set(["create_sub_agent", "web_search", "scrape_url", "memory_recall", "memory_list", "list_skills"]);
      const parallelTCs = toolCalls.filter(tc => parallelizable.has(tc.name));
      const sequentialTCs = toolCalls.filter(tc => !parallelizable.has(tc.name));

      const execOAITool = async (tc: { id: string; name: string; arguments: string }) => {
        let input: Record<string, unknown> = {};
        try { input = JSON.parse(tc.arguments); } catch { /* empty */ }
        const stepId = uuidv4();
        const toolStep: AgentStep = {
          id: stepId, task_id: taskId, type: toolUseTypeToStepType(tc.name as ToolName),
          title: toolUseToTitle(tc.name, input), content: JSON.stringify(input, null, 2),
          tool_name: tc.name, tool_input: input, status: "running", created_at: new Date().toISOString(),
        };
        addAgentStep(toolStep); onStep?.(toolStep);
        const ts = Date.now(); let result = ""; let toolError = false;
        try { result = await executeTool(tc.name as ToolName, input, { taskId, filesDir, onStep }); }
        catch (err) { result = `Error: ${err instanceof Error ? err.message : String(err)}`; toolError = true; }
        const duration = Date.now() - ts;
        updateAgentStep(stepId, { tool_result: result, status: toolError ? "failed" : "completed", duration_ms: duration });
        onStep?.({ ...toolStep, tool_result: result, status: toolError ? "failed" : "completed", duration_ms: duration });
        return { id: tc.id, name: tc.name, result };
      };

      // Execute parallelizable tools concurrently
      if (parallelTCs.length > 1) {
        const results = await Promise.all(parallelTCs.map(execOAITool));
        for (const r of results) {
          messages.push({ role: "tool", tool_call_id: r.id, content: r.result });
          if (r.name === "complete_task") continueLoop = false;
          if (r.name === "request_user_input") { updateTaskStatus(taskId, "waiting_for_input"); continueLoop = false; }
          if (r.result.startsWith("[APPROVAL_REQUIRED]")) continueLoop = false;
        }
      } else {
        for (const tc of parallelTCs) {
          const r = await execOAITool(tc);
          messages.push({ role: "tool", tool_call_id: r.id, content: r.result });
          if (r.name === "complete_task") continueLoop = false;
          if (r.name === "request_user_input") { updateTaskStatus(taskId, "waiting_for_input"); continueLoop = false; }
          if (r.result.startsWith("[APPROVAL_REQUIRED]")) continueLoop = false;
        }
      }

      // Execute sequential tools one at a time
      for (const tc of sequentialTCs) {
        const r = await execOAITool(tc);
        messages.push({ role: "tool", tool_call_id: r.id, content: r.result });
        if (r.name === "complete_task") continueLoop = false;
        if (r.name === "request_user_input") { updateTaskStatus(taskId, "waiting_for_input"); continueLoop = false; }
        if (r.result.startsWith("[APPROVAL_REQUIRED]")) continueLoop = false;
      }
    }
    const { getTask } = await import("./db");
    const t = getTask(taskId);
    if (t?.status === "running") updateTaskStatus(taskId, "completed", new Date().toISOString());
  } catch (err) { handleAgentError(err, taskId, onStep); }
}

// ─── Google Provider ──────────────────────────────────────────────────────────

async function runWithGoogle(
  taskId: string,
  userMessage: string,
  systemPrompt: string,
  modelName: string,
  filesDir: string,
  onStep?: (step: AgentStep) => void,
  onToken?: (token: string) => void,
  signal?: AbortSignal,
  history?: Array<{ role: string; content: string }>,
  maxSteps = 50
): Promise<void> {
  if (!googleAI) return runWithAnthropic(taskId, userMessage, systemPrompt, "claude-opus-4-6", filesDir, onStep, onToken, signal, history, maxSteps);
  const gmodel = googleAI.getGenerativeModel({ model: modelName, systemInstruction: systemPrompt });
  const googleTools = [{
    functionDeclarations: TOOLS.map((t) => ({
      name: t.name, description: t.description, parameters: t.input_schema,
    })),
  }];
  // Build initial history for Google chat
  const chatHistory: Array<{ role: string; parts: Array<{ text: string }> }> = [];
  if (history && history.length > 0) {
    for (const msg of history.slice(-10)) {
      chatHistory.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      });
    }
  }
  const chat = gmodel.startChat({ tools: googleTools as never, history: chatHistory as never });
  let continueLoop = true; let iterations = 0; let currentMessage = userMessage;
  try {
    while (continueLoop && iterations < maxSteps) {
      if (signal?.aborted) { updateTaskStatus(taskId, "paused"); return; }
      iterations++;
      const thinkingId = uuidv4();
      addAgentStep({ id: thinkingId, task_id: taskId, type: "reasoning", title: iterations === 1 ? `Planning with ${modelName}...` : "Continuing...", content: "", status: "running", created_at: new Date().toISOString() });
      const startTime = Date.now();
      // On the first iteration, hint to Google to prefer function calls
      const sendOpts = iterations === 1 ? { toolConfig: { functionCallingConfig: { mode: "ANY" as const } } } : {};
      const result = await chat.sendMessage(currentMessage, sendOpts as never);
      const response = result.response;
      const text = response.text();
      if (text) onToken?.(text);
      updateAgentStep(thinkingId, { content: text || "Processing...", status: "completed", duration_ms: Date.now() - startTime });
      const functionCalls = response.functionCalls();
      if (!functionCalls || functionCalls.length === 0) {
        if (text) addMessage({ id: uuidv4(), task_id: taskId, role: "assistant", content: text, created_at: new Date().toISOString() });
        continueLoop = false; updateTaskStatus(taskId, "completed", new Date().toISOString()); break;
      }
      // Separate parallelizable tools from sequential ones
      const parallelizable = new Set(["create_sub_agent", "web_search", "scrape_url", "memory_recall", "memory_list", "list_skills"]);
      const parallelFCs = functionCalls.filter((fc: { name: string }) => parallelizable.has(fc.name));
      const sequentialFCs = functionCalls.filter((fc: { name: string }) => !parallelizable.has(fc.name));
      const funcResponses: Array<{ name: string; response: { result: string } }> = [];

      const execGoogleTool = async (fc: { name: string; args?: object }) => {
        const input = (fc.args || {}) as Record<string, unknown>;
        const stepId = uuidv4();
        const toolStep: AgentStep = {
          id: stepId, task_id: taskId, type: toolUseTypeToStepType(fc.name as ToolName),
          title: toolUseToTitle(fc.name, input), content: JSON.stringify(input, null, 2),
          tool_name: fc.name, tool_input: input, status: "running", created_at: new Date().toISOString(),
        };
        addAgentStep(toolStep); onStep?.(toolStep);
        const ts = Date.now(); let toolResult = ""; let toolError = false;
        try { toolResult = await executeTool(fc.name as ToolName, input, { taskId, filesDir, onStep }); }
        catch (err) { toolResult = `Error: ${err instanceof Error ? err.message : String(err)}`; toolError = true; }
        updateAgentStep(stepId, { tool_result: toolResult, status: toolError ? "failed" : "completed", duration_ms: Date.now() - ts });
        onStep?.({ ...toolStep, tool_result: toolResult, status: toolError ? "failed" : "completed", duration_ms: Date.now() - ts });
        return { name: fc.name, result: toolResult };
      };

      // Execute parallelizable tools concurrently
      if (parallelFCs.length > 1) {
        const results = await Promise.all(parallelFCs.map(execGoogleTool));
        for (const r of results) {
          funcResponses.push({ name: r.name, response: { result: r.result } });
          if (r.name === "complete_task") continueLoop = false;
          if (r.name === "request_user_input") { updateTaskStatus(taskId, "waiting_for_input"); continueLoop = false; }
          if (r.result.startsWith("[APPROVAL_REQUIRED]")) continueLoop = false;
        }
      } else {
        for (const fc of parallelFCs) {
          const r = await execGoogleTool(fc);
          funcResponses.push({ name: r.name, response: { result: r.result } });
          if (r.name === "complete_task") continueLoop = false;
          if (r.name === "request_user_input") { updateTaskStatus(taskId, "waiting_for_input"); continueLoop = false; }
          if (r.result.startsWith("[APPROVAL_REQUIRED]")) continueLoop = false;
        }
      }

      // Execute sequential tools one at a time
      for (const fc of sequentialFCs) {
        const r = await execGoogleTool(fc);
        funcResponses.push({ name: r.name, response: { result: r.result } });
        if (r.name === "complete_task") continueLoop = false;
        if (r.name === "request_user_input") { updateTaskStatus(taskId, "waiting_for_input"); continueLoop = false; }
        if (r.result.startsWith("[APPROVAL_REQUIRED]")) continueLoop = false;
      }
      currentMessage = JSON.stringify(funcResponses);
    }
    const { getTask } = await import("./db");
    const t = getTask(taskId);
    if (t?.status === "running") updateTaskStatus(taskId, "completed", new Date().toISOString());
  } catch (err) { handleAgentError(err, taskId, onStep); }
}

// ─── OpenRouter Provider ──────────────────────────────────────────────────────

async function runWithOpenRouter(
  taskId: string,
  userMessage: string,
  systemPrompt: string,
  modelName: string,
  filesDir: string,
  onStep?: (step: AgentStep) => void,
  onToken?: (token: string) => void,
  signal?: AbortSignal,
  history?: Array<{ role: string; content: string }>,
  maxSteps = 50
): Promise<void> {
  const orClient = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY || "",
    defaultHeaders: {
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      "X-Title": "Ottomatron",
    },
  });

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
  ];
  if (history && history.length > 0) {
    for (const msg of history.slice(-10)) {
      if (msg.role === "user" || msg.role === "assistant") {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== "user" || lastMsg.content !== userMessage) {
      messages.push({ role: "user", content: userMessage });
    }
  } else {
    messages.push({ role: "user", content: userMessage });
  }

  const tools = convertToolsToOpenAIFormat();
  let continueLoop = true;
  let iterations = 0;

  try {
    while (continueLoop && iterations < maxSteps) {
      if (signal?.aborted) { updateTaskStatus(taskId, "paused"); return; }
      iterations++;

      // ─── Live context refresh ───
      if (iterations > 1 && iterations % 5 === 0) {
        const refreshed = refreshSystemContext(systemPrompt, taskId, filesDir, userMessage);
        messages[0] = { role: "system", content: refreshed };
      }

      const thinkingId = uuidv4();
      addAgentStep({
        id: thinkingId, task_id: taskId, type: "reasoning",
        title: iterations === 1 ? `Planning with ${modelName} (OpenRouter)...` : "Continuing work...",
        content: "", status: "running", created_at: new Date().toISOString(),
      });
      const startTime = Date.now();
      let fullText = "";
      // Apply two-phase tool result pruning before each LLM call
      const prunedMessages = pruneOpenAIMessages(messages);
      const stream = await orClient.chat.completions.create({
        model: modelName, max_tokens: 8192, messages: prunedMessages, tools, stream: true,
        // Force tool use on the first iteration so the agent can't just write a plan and stop
        tool_choice: iterations === 1 ? "required" : "auto",
      });
      type PartialTC = { id: string; name: string; arguments: string };
      const tcMap: Record<number, PartialTC> = {};
      let streamUsage: { prompt_tokens?: number; completion_tokens?: number } | undefined;
      for await (const chunk of stream) {
        if (signal?.aborted) break;
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) { fullText += delta.content; onToken?.(delta.content); }
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (tc.index !== undefined) {
              if (!tcMap[tc.index]) tcMap[tc.index] = { id: "", name: "", arguments: "" };
              if (tc.id) tcMap[tc.index].id = tc.id;
              if (tc.function?.name) tcMap[tc.index].name = tc.function.name;
              if (tc.function?.arguments) tcMap[tc.index].arguments += tc.function.arguments;
            }
          }
        }
        if (chunk.usage) streamUsage = chunk.usage;
      }
      const toolCalls = Object.values(tcMap);
      updateAgentStep(thinkingId, { content: fullText || "Processing...", status: "completed", duration_ms: Date.now() - startTime });
      if (streamUsage) {
        const inTok = streamUsage.prompt_tokens || 0;
        const outTok = streamUsage.completion_tokens || 0;
        trackTokenUsage(taskId, { input_tokens: inTok, output_tokens: outTok, total_tokens: inTok + outTok, estimated_cost_usd: estimateCost(modelName, inTok, outTok), model: modelName });
      }
      const assistantMsg: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam = {
        role: "assistant", content: fullText || null,
      };
      if (toolCalls.length > 0) {
        assistantMsg.tool_calls = toolCalls.map((tc) => ({
          id: tc.id, type: "function" as const, function: { name: tc.name, arguments: tc.arguments },
        }));
      }
      messages.push(assistantMsg);
      if (toolCalls.length === 0) {
        if (fullText) addMessage({ id: uuidv4(), task_id: taskId, role: "assistant", content: fullText, created_at: new Date().toISOString() });
        continueLoop = false; updateTaskStatus(taskId, "completed", new Date().toISOString()); break;
      }
      // Separate parallelizable tools from sequential ones
      const parallelizable = new Set(["create_sub_agent", "web_search", "scrape_url", "memory_recall", "memory_list", "list_skills"]);
      const parallelTCs = toolCalls.filter(tc => parallelizable.has(tc.name));
      const sequentialTCs = toolCalls.filter(tc => !parallelizable.has(tc.name));

      const execORTool = async (tc: { id: string; name: string; arguments: string }) => {
        let input: Record<string, unknown> = {};
        try { input = JSON.parse(tc.arguments); } catch { /* empty */ }
        const stepId = uuidv4();
        const toolStep: AgentStep = {
          id: stepId, task_id: taskId, type: toolUseTypeToStepType(tc.name as ToolName),
          title: toolUseToTitle(tc.name, input), content: JSON.stringify(input, null, 2),
          tool_name: tc.name, tool_input: input, status: "running", created_at: new Date().toISOString(),
        };
        addAgentStep(toolStep); onStep?.(toolStep);
        const ts = Date.now(); let result = ""; let toolError = false;
        try { result = await executeTool(tc.name as ToolName, input, { taskId, filesDir, onStep }); }
        catch (err) { result = `Error: ${err instanceof Error ? err.message : String(err)}`; toolError = true; }
        const duration = Date.now() - ts;
        updateAgentStep(stepId, { tool_result: result, status: toolError ? "failed" : "completed", duration_ms: duration });
        onStep?.({ ...toolStep, tool_result: result, status: toolError ? "failed" : "completed", duration_ms: duration });
        return { id: tc.id, name: tc.name, result };
      };

      // Execute parallelizable tools concurrently
      if (parallelTCs.length > 1) {
        const results = await Promise.all(parallelTCs.map(execORTool));
        for (const r of results) {
          messages.push({ role: "tool", tool_call_id: r.id, content: r.result });
          if (r.name === "complete_task") continueLoop = false;
          if (r.name === "request_user_input") { updateTaskStatus(taskId, "waiting_for_input"); continueLoop = false; }
          if (r.result.startsWith("[APPROVAL_REQUIRED]")) continueLoop = false;
        }
      } else {
        for (const tc of parallelTCs) {
          const r = await execORTool(tc);
          messages.push({ role: "tool", tool_call_id: r.id, content: r.result });
          if (r.name === "complete_task") continueLoop = false;
          if (r.name === "request_user_input") { updateTaskStatus(taskId, "waiting_for_input"); continueLoop = false; }
          if (r.result.startsWith("[APPROVAL_REQUIRED]")) continueLoop = false;
        }
      }

      // Execute sequential tools one at a time
      for (const tc of sequentialTCs) {
        const r = await execORTool(tc);
        messages.push({ role: "tool", tool_call_id: r.id, content: r.result });
        if (r.name === "complete_task") continueLoop = false;
        if (r.name === "request_user_input") { updateTaskStatus(taskId, "waiting_for_input"); continueLoop = false; }
        if (r.result.startsWith("[APPROVAL_REQUIRED]")) continueLoop = false;
      }
    }
    const { getTask } = await import("./db");
    const t = getTask(taskId);
    if (t?.status === "running") updateTaskStatus(taskId, "completed", new Date().toISOString());
  } catch (err) { handleAgentError(err, taskId, onStep); }
}

// ─── Perplexity Provider (Sonar) ──────────────────────────────────────────────
// Routes to Perplexity's chat completions API (OpenAI-compatible) for Sonar models.
// Sonar models have built-in web search, so they don't need our web_search tool.

async function runWithPerplexity(
  taskId: string,
  userMessage: string,
  systemPrompt: string,
  modelName: string,
  filesDir: string,
  onStep?: (step: AgentStep) => void,
  onToken?: (token: string) => void,
  signal?: AbortSignal,
  history?: Array<{ role: string; content: string }>,
  maxSteps = 10
): Promise<void> {
  const pplxClient = new OpenAI({
    baseURL: "https://api.perplexity.ai",
    apiKey: process.env.PERPLEXITY_API_KEY || "",
  });

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
  ];
  if (history && history.length > 0) {
    for (const msg of history.slice(-10)) {
      if (msg.role === "user" || msg.role === "assistant") {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== "user" || lastMsg.content !== userMessage) {
      messages.push({ role: "user", content: userMessage });
    }
  } else {
    messages.push({ role: "user", content: userMessage });
  }

  // Sonar models don't support tool use — they have built-in search.
  // We do a single-turn completion (or multi-turn conversation).
  let continueLoop = true;
  let iterations = 0;

  try {
    while (continueLoop && iterations < maxSteps) {
      if (signal?.aborted) { updateTaskStatus(taskId, "paused"); return; }
      iterations++;
      const thinkingId = uuidv4();
      addAgentStep({
        id: thinkingId, task_id: taskId, type: "reasoning",
        title: iterations === 1 ? `Searching with ${modelName}...` : "Continuing research...",
        content: "", status: "running", created_at: new Date().toISOString(),
      });
      const startTime = Date.now();

      const response = await pplxClient.chat.completions.create({
        model: modelName,
        messages,
      });

      const choice = response.choices?.[0];
      const text = choice?.message?.content || "";
      if (text) onToken?.(text);
      updateAgentStep(thinkingId, { content: text || "Processing...", status: "completed", duration_ms: Date.now() - startTime });

      // Track usage
      if (response.usage) {
        trackTokenUsage(taskId, {
          input_tokens: response.usage.prompt_tokens || 0,
          output_tokens: response.usage.completion_tokens || 0,
          total_tokens: response.usage.total_tokens || 0,
          estimated_cost_usd: estimateCost(modelName, response.usage.prompt_tokens || 0, response.usage.completion_tokens || 0),
          model: modelName,
        });
      }

      // Extract citations if available (Perplexity returns them in the response)
      const citations = (response as unknown as Record<string, unknown>).citations as string[] | undefined;
      let fullResponse = text;
      if (citations && citations.length > 0) {
        fullResponse += "\n\n**Sources:**\n" + citations.map((c, i) => `${i + 1}. ${c}`).join("\n");
      }

      if (fullResponse) {
        addMessage({ id: uuidv4(), task_id: taskId, role: "assistant", content: fullResponse, created_at: new Date().toISOString() });
      }

      // Sonar gives a research answer — now hand off to Anthropic to execute tools
      // This matches Perplexity Computer's model: Sonar for search → orchestration model for execution
      continueLoop = false;

      // If the task needs tool execution (not just a search question), continue with Anthropic
      const searchStep: AgentStep = {
        id: uuidv4(), task_id: taskId, type: "search",
        title: `Research complete via ${modelName}`,
        content: fullResponse.slice(0, 2000),
        status: "completed", created_at: new Date().toISOString(),
      };
      addAgentStep(searchStep);
      onStep?.(searchStep);

      // Hand off to Anthropic for tool-use orchestration with the Sonar research as context
      const enrichedMessage = `The user asked: ${userMessage}\n\nI already searched with Perplexity Sonar and found:\n${fullResponse.slice(0, 6000)}\n\nNow use the tools available to complete the full task. If the search results fully answer the question and no further action is needed, call complete_task with the answer. Otherwise, continue executing with the appropriate tools.`;
      return runWithAnthropic(taskId, enrichedMessage, systemPrompt, "claude-sonnet-4-6", filesDir, onStep, onToken, signal, [], maxSteps);
    }
  } catch (err) {
    // If Perplexity fails, fall back to Anthropic
    const errMsg = err instanceof Error ? err.message : String(err);
    const failoverStep: AgentStep = {
      id: uuidv4(), task_id: taskId, type: "reasoning",
      title: "Perplexity unavailable, falling back",
      content: `Perplexity API error: ${errMsg}. Falling back to Claude...`,
      status: "completed", created_at: new Date().toISOString(),
    };
    addAgentStep(failoverStep);
    onStep?.(failoverStep);
    return runWithAnthropic(taskId, userMessage, systemPrompt, "claude-sonnet-4-6", filesDir, onStep, onToken, signal, history, maxSteps);
  }
}

// ─── Error Handler ────────────────────────────────────────────────────────────

function handleAgentError(err: unknown, taskId: string, onStep?: (step: AgentStep) => void) {
  const msg = err instanceof Error ? err.message : String(err);
  const step: AgentStep = {
    id: uuidv4(), task_id: taskId, type: "error", title: "Error encountered",
    content: msg, status: "failed", created_at: new Date().toISOString(),
  };
  addAgentStep(step); onStep?.(step); updateTaskStatus(taskId, "failed");
  addMessage({ id: uuidv4(), task_id: taskId, role: "assistant", content: `I encountered an error: ${msg}`, created_at: new Date().toISOString() });

  // Self-improvement: record failure (Otto-inspired)
  try {
    import("./db").then(({ getTask }) => {
      const task = getTask(taskId);
      if (task) {
        recordLearning({
          id: uuidv4(),
          task_id: taskId,
          outcome: "failure",
          pattern_key: task.prompt.slice(0, 200),
          pattern_data: { error: msg.slice(0, 200), model: task.model },
          confidence: 0.3,
        });
        recordAnalyticsEvent({
          id: uuidv4(),
          event_type: "task_error",
          model: task.model,
          success: false,
          metadata: { error: msg.slice(0, 200) },
        });
      }
    }).catch(() => { /* ignore */ });
  } catch { /* best-effort */ }
}

// ─── Tool Executor ────────────────────────────────────────────────────────────

interface ToolContext { taskId: string; filesDir: string; onStep?: (step: AgentStep) => void; }

/**
 * Tools that require human approval before execution (Perplexity Computer safety model).
 * Map of tool name → condition function. If the condition returns a truthy string,
 * the tool requires approval with that description.
 */
const SENSITIVE_ACTIONS: Partial<Record<ToolName, (input: Record<string, unknown>) => string | false>> = {
  send_email: (input) => `Send email to ${input.to || "unknown recipient"}: "${String(input.subject || "").slice(0, 50)}"`,
  connector_call: (input) => {
    const action = String(input.action || "");
    // Social media posts, publishing, deleting are sensitive
    if (/post|publish|delete|tweet|send/i.test(action)) {
      return `Connector ${input.connector_id}: ${action}`;
    }
    return false;
  },
  execute_code: (input) => {
    const lang = String(input.language || "");
    // Only bash/shell commands need approval (not Python/JS code execution)
    if (/bash|sh|shell|zsh/i.test(lang)) {
      return `Execute shell command: ${String(input.code || "").slice(0, 100)}`;
    }
    return false;
  },
};

async function executeTool(name: ToolName, input: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  // Check if this is a sensitive action requiring approval
  const sensitiveCheck = SENSITIVE_ACTIONS[name];
  if (sensitiveCheck) {
    const approvalReason = sensitiveCheck(input);
    if (approvalReason) {
      // Check if this action was already approved or denied (user clicked Approve/Deny in UI)
      try {
        const { getTask: fetchTask, updateTaskMetadata } = await import("./db");
        const task = fetchTask(ctx.taskId);
        const existingMeta = task?.metadata || {};

        // Check if this tool was recently denied — block re-execution immediately
        const deniedActions = (existingMeta.denied_actions as Array<Record<string, unknown>>) || [];
        const wasDenied = deniedActions.some((a) => a.tool === name);
        if (wasDenied) {
          return `[DENIED] Action "${name}" was denied by the user. Do NOT retry this action. Find an alternative approach or call complete_task to finish.`;
        }

        const approvedActions = (existingMeta.approved_actions as Array<Record<string, unknown>>) || [];
        // Fuzzy match: same tool name is sufficient (exact input match is too strict
        // because the LLM may re-issue the call with slightly different formatting)
        const alreadyApproved = approvedActions.findIndex(
          (a) => a.tool === name
        );
        if (alreadyApproved !== -1) {
          // Already approved — remove from approved list and proceed with execution
          approvedActions.splice(alreadyApproved, 1);
          updateTaskMetadata(ctx.taskId, { ...existingMeta, approved_actions: approvedActions });
          // Fall through to execute the tool below
        } else {
          // Not yet approved — record the pending approval and pause
          const approvalId = uuidv4();
          const approvalStep: AgentStep = {
            id: approvalId, task_id: ctx.taskId, type: "reasoning",
            title: "⚠️ Approval Required",
            content: `This action requires your approval before proceeding:\n\n**${name}**: ${approvalReason}\n\nApprove or deny this action to continue.`,
            tool_name: name, tool_input: input,
            status: "running", created_at: new Date().toISOString(),
          };
          addAgentStep(approvalStep);
          ctx.onStep?.(approvalStep);

          // Store approval request in task metadata
          const pendingApprovals = (existingMeta.pending_approvals as Array<Record<string, unknown>>) || [];
          pendingApprovals.push({
            id: approvalId,
            tool: name,
            input,
            reason: approvalReason,
            created_at: new Date().toISOString(),
          });
          updateTaskMetadata(ctx.taskId, { ...existingMeta, pending_approvals: pendingApprovals });

          // Pause the task — it will be resumed when the user approves
          updateTaskStatus(ctx.taskId, "waiting_for_input");
          return `[APPROVAL_REQUIRED] Action "${name}" requires human approval: ${approvalReason}. The task has been paused. Resume after approval.`;
        }
      } catch {
        // If we can't check metadata, fall through to execute anyway
      }
    }
  }

  // Run before-hooks (plugin system)
  const hookCtx: ToolHookContext = { taskId: ctx.taskId, toolName: name, toolInput: input };
  const beforeResult = await runBeforeHooks(hookCtx);
  if (!beforeResult.allow) {
    const blocked = `Tool blocked by safety hook: ${beforeResult.reason || "no reason given"}`;
    await runAfterHooks({ ...hookCtx, result: blocked, error: true, duration_ms: 0 });
    return blocked;
  }
  // Use potentially modified input from hooks
  const finalInput = beforeResult.input;
  const hookStart = Date.now();

  let result: string;
  try {
    result = await executeToolInner(name, finalInput, ctx);
  } catch (err) {
    const errMsg = `Error: ${err instanceof Error ? err.message : String(err)}`;
    await runAfterHooks({ ...hookCtx, result: errMsg, error: true, duration_ms: Date.now() - hookStart });
    throw err;
  }
  await runAfterHooks({ ...hookCtx, result, error: false, duration_ms: Date.now() - hookStart });
  return result;
}

async function executeToolInner(name: ToolName, input: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  switch (name) {
    case "web_search": return executeWebSearch(input.query as string, (input.num_results as number) || 5, {
        includeDomains: input.include_domains as string[] | undefined,
        excludeDomains: input.exclude_domains as string[] | undefined,
        recency: input.recency as string | undefined,
        searchLanguage: input.search_language as string | undefined,
        dateRange: input.date_range as { start?: string; end?: string } | undefined,
      });
    case "scrape_url": return executeScrapeUrl(input.url as string, input.selector as string | undefined);
    case "browse_web": return executeBrowseWeb(input.url as string, input.actions as Array<Record<string, unknown>> | undefined, input.extract_selector as string | undefined, (input.screenshot as boolean) || false, ctx);
    case "execute_code": return executeCode(input.language as string, input.code as string, (input.timeout as number) || 30, ctx);
    case "write_file": return writeFile(input.filename as string, input.content as string, input.mime_type as string, ctx);
    case "read_file": return readFile(input.filename as string, ctx);
    case "list_files": return listFiles(ctx);
    case "create_sub_agent": return createSubAgent(input.title as string, input.agent_type as string, input.instructions as string, (input.context as string) || "", (input.model as string) || "auto", ctx);
    case "connector_call": return connectorCall(input.connector_id as string, input.action as string, input.params as Record<string, unknown>, ctx);
    case "memory_store": return executeMemoryStore(input.key as string, input.value as string, (input.tags as string[]) || [], ctx);
    case "memory_recall": return executeMemoryRecall(input.query as string, (input.limit as number) || 5);
    case "memory_list": return executeMemoryList((input.limit as number) || 50);
    case "memory_delete": return executeMemoryDelete(input.id as string, (input.reason as string) || "");
    case "memory_update": return executeMemoryUpdate(input.key as string, input.value as string, (input.tags as string[]) || undefined);
    case "list_skills": return executeListSkills((input.active_only as boolean) !== false);
    case "organize_files": return executeOrganizeFiles(input.action as string, input.folder_name as string | undefined, input.parent_folder_id as string | undefined, input.file_names as string[] | undefined, input.target_folder_id as string | undefined, ctx);
    case "generate_image": return executeGenerateImage(input.prompt as string, (input.size as string) || "1024x1024", (input.style as string) || "vivid", (input.filename as string) || "generated_image.png", ctx);
    case "replicate_run": return executeReplicateRun(input.prompt as string, input.model as string | undefined, input.params as Record<string, unknown> | undefined, ctx);
    case "dream_machine": return executeDreamMachine(input.board_name as string, input.shots as DreamShot[], (input.provider as string) || "auto", ctx);
    case "send_email": return executeSendEmail(input.to as string, input.subject as string, input.body as string, input.from as string | undefined, ctx);
    case "deep_research": return executeDeepResearch(input.topic as string, (input.depth as string) || "deep", (input.focus_areas as string[]) || [], (input.output_format as string) || "report", ctx);
    case "finance_data": return executeFinanceData(input.query_type as string, (input.symbol as string) || "", (input.query as string) || "", (input.period as string) || "1mo");
    case "social_media_post": return executeSocialMedia(input as Record<string, unknown>, ctx);
    case "request_user_input": return JSON.stringify({ waiting: true, question: input.question, options: input.options || [], context: input.context || "" });
    case "complete_task": return handleCompleteTask(input.summary as string, (input.files_created as string[]) || [], (input.add_to_gallery as boolean) || false, ctx);
    default: return `Unknown tool: ${name}`;
  }
}

// ─── Web Search ───────────────────────────────────────────────────────────────

interface SearchFilters {
  includeDomains?: string[];
  excludeDomains?: string[];
  recency?: string;
  searchLanguage?: string;
  dateRange?: { start?: string; end?: string };
}

function applyDomainFilter(results: Array<{ url: string; [key: string]: unknown }>, filters?: SearchFilters): Array<{ url: string; [key: string]: unknown }> {
  if (!filters) return results;
  let filtered = results;
  if (filters.includeDomains?.length) {
    filtered = filtered.filter(r => filters.includeDomains!.some(d => r.url.includes(d)));
  }
  if (filters.excludeDomains?.length) {
    filtered = filtered.filter(r => !filters.excludeDomains!.some(d => r.url.includes(d)));
  }
  return filtered;
}

async function executeWebSearch(query: string, numResults: number, filters?: SearchFilters): Promise<string> {
  // Append domain filter to query for providers that don't support it natively
  let enhancedQuery = query;
  if (filters?.includeDomains?.length) {
    enhancedQuery += " " + filters.includeDomains.map(d => `site:${d}`).join(" OR ");
  }
  if (filters?.excludeDomains?.length) {
    enhancedQuery += " " + filters.excludeDomains.map(d => `-site:${d}`).join(" ");
  }

  if (process.env.PERPLEXITY_API_KEY) {
    try {
      const sonarBody: Record<string, unknown> = {
        model: "sonar",
        messages: [{ role: "user", content: enhancedQuery }],
        search_recency_filter: filters?.recency || "month",
      };
      // Perplexity Sonar supports native domain filtering
      if (filters?.includeDomains?.length) sonarBody.search_domain_filter = filters.includeDomains;
      const r = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(sonarBody),
      });
      if (r.ok) {
        const d = await r.json() as { choices?: Array<{ message?: { content?: string } }>; citations?: string[] };
        const content = d.choices?.[0]?.message?.content || "";
        const cites = (d.citations || []).map((c: string, i: number) => `[${i + 1}] ${c}`).join("\n");
        return content + (cites ? `\n\nSources:\n${cites}` : "");
      }
    } catch { /* fall through */ }
  }
  if (process.env.BRAVE_SEARCH_API_KEY) {
    try {
      const params = new URLSearchParams({ q: enhancedQuery, count: String(numResults) });
      if (filters?.recency) {
        const freshMap: Record<string, string> = { hour: "ph", day: "pd", week: "pw", month: "pm", year: "py" };
        if (freshMap[filters.recency]) params.set("freshness", freshMap[filters.recency]);
      }
      if (filters?.searchLanguage) params.set("search_lang", filters.searchLanguage);
      const r = await fetch(`https://api.search.brave.com/res/v1/web/search?${params.toString()}`, {
        headers: { Accept: "application/json", "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY },
      });
      if (r.ok) {
        const d = await r.json() as { web?: { results?: Array<{ title: string; description: string; url: string }> } };
        const raw = (d.web?.results || []).slice(0, numResults).map(r => ({ ...r }));
        const filtered = applyDomainFilter(raw, filters);
        return filtered.map((r, i) => `[${i + 1}] ${r.title}\n${r.description}\nURL: ${r.url}`).join("\n\n");
      }
    } catch { /* fall through */ }
  }
  if (process.env.SERPER_API_KEY) {
    try {
      const serperBody: Record<string, unknown> = { q: enhancedQuery, num: numResults };
      if (filters?.searchLanguage) serperBody.hl = filters.searchLanguage;
      if (filters?.dateRange?.start || filters?.dateRange?.end) {
        serperBody.tbs = `cdr:1,cd_min:${filters.dateRange?.start || ""},cd_max:${filters.dateRange?.end || ""}`;
      }
      const r = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "X-API-KEY": process.env.SERPER_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify(serperBody),
      });
      if (r.ok) {
        const d = await r.json() as { organic?: Array<{ title: string; snippet: string; link: string }>; answerBox?: { answer: string }; knowledgeGraph?: { description: string } };
        let out = "";
        if (d.answerBox?.answer) out += `Answer: ${d.answerBox.answer}\n\n`;
        if (d.knowledgeGraph?.description) out += `Overview: ${d.knowledgeGraph.description}\n\n`;
        const raw = (d.organic || []).slice(0, numResults).map((r: Record<string, unknown>) => ({ title: String(r.title || ""), snippet: String(r.snippet || ""), url: String(r.link || "") }));
        const filtered = applyDomainFilter(raw, filters);
        out += filtered.map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}\nURL: ${r.url}`).join("\n\n");
        return out;
      }
    } catch { /* fall through */ }
  }
  if (process.env.TAVILY_API_KEY) {
    try {
      const tavilyBody: Record<string, unknown> = { api_key: process.env.TAVILY_API_KEY, query: enhancedQuery, max_results: numResults, include_answer: true };
      if (filters?.includeDomains?.length) tavilyBody.include_domains = filters.includeDomains;
      if (filters?.excludeDomains?.length) tavilyBody.exclude_domains = filters.excludeDomains;
      const r = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tavilyBody),
      });
      if (r.ok) {
        const d = await r.json() as { answer?: string; results?: Array<{ title: string; content: string; url: string }> };
        let out = d.answer ? `Summary: ${d.answer}\n\n` : "";
        out += (d.results || []).map((r, i) => `[${i + 1}] ${r.title}\n${r.content.slice(0, 500)}\nURL: ${r.url}`).join("\n\n");
        return out;
      }
    } catch { /* fall through */ }
  }
  return `Web search for "${query}": No search API configured. Set PERPLEXITY_API_KEY, BRAVE_SEARCH_API_KEY, SERPER_API_KEY, or TAVILY_API_KEY.`;
}

// ─── URL Scraper ──────────────────────────────────────────────────────────────

const SCRAPE_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";
const SCRAPE_HEADERS: Record<string, string> = {
  "User-Agent": SCRAPE_USER_AGENT,
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

function extractTextFromCheerio($: ReturnType<typeof cheerio.load>, selector?: string, url?: string): { title: string; metaDesc: string; content: string; links: string[] } {
  $("script, style, nav, footer, header, iframe, noscript, .ad, .advertisement, .sidebar, .cookie-banner, .popup, [aria-hidden='true']").remove();
  let content = "";
  if (selector) {
    content = $(selector).text().trim() || $("body").text().trim();
  } else {
    const candidates = ["article", "main", "[role='main']", ".post-content", ".article-body", ".entry-content", ".post-body", "#main-content", "#content", ".content", ".story-body", ".article-text"];
    for (const sel of candidates) {
      const t = $(sel).text().trim();
      if (t && t.length > 300) { content = t; break; }
    }
    if (!content) content = $("body").text().trim();
  }
  const title = $("title").text().trim() || $("h1").first().text().trim();
  const metaDesc = $('meta[name="description"]').attr("content") || $('meta[property="og:description"]').attr("content") || "";
  content = content.replace(/\t/g, " ").replace(/ {2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const links: string[] = [];
  $("a[href]").each((_i: number, el) => {
    const href = $(el).attr("href"); const text = $(el).text().trim();
    if (href && text && !href.startsWith("#") && !href.startsWith("javascript:") && links.length < 10) {
      try { links.push(`- [${text.slice(0, 60)}](${new URL(href, url || "https://example.com").toString()})`); } catch { /* skip */ }
    }
  });
  return { title, metaDesc, content, links };
}

async function fetchWithRetry(url: string, options: RequestInit, maxAttempts = 2): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const resp = await fetch(url, options);
      return resp;
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts - 1) await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  throw lastErr;
}

async function fetchViaJina(url: string): Promise<string | null> {
  // Jina AI Reader — free service that handles JS-rendered pages and returns clean markdown
  try {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const headers: Record<string, string> = {
      "Accept": "text/markdown,text/plain,*/*",
      "X-Return-Format": "markdown",
      "X-Timeout": "20",
    };
    if (process.env.JINA_API_KEY) headers["Authorization"] = `Bearer ${process.env.JINA_API_KEY}`;
    const resp = await fetch(jinaUrl, { headers, signal: AbortSignal.timeout(25000) });
    if (!resp.ok) return null;
    const text = await resp.text();
    return text.length > 200 ? text : null;
  } catch {
    return null;
  }
}

async function executeScrapeUrl(url: string, selector?: string): Promise<string> {
  try {
    // Try direct fetch first
    let html: string | null = null;
    let isJson = false;
    let isText = false;
    let rawText = "";

    try {
      const resp = await fetchWithRetry(url, { headers: SCRAPE_HEADERS, signal: AbortSignal.timeout(20000) });
      if (!resp.ok) {
        // For bot-protection errors (403, 429, 503), go straight to Jina
        if ([403, 429, 503].includes(resp.status)) {
          const jinaResult = await fetchViaJina(url);
          if (jinaResult) return jinaResult.slice(0, 20000);
        }
        return `Failed to fetch ${url}: HTTP ${resp.status} ${resp.statusText}`;
      }
      const ct = resp.headers.get("content-type") || "";
      if (ct.includes("application/json")) { isJson = true; rawText = JSON.stringify(await resp.json(), null, 2); }
      else if (ct.includes("text/plain")) { isText = true; rawText = await resp.text(); }
      else { html = await resp.text(); }
    } catch (fetchErr) {
      // Network error — try Jina as fallback
      const jinaResult = await fetchViaJina(url);
      if (jinaResult) return jinaResult.slice(0, 20000);
      return `Failed to fetch ${url}: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`;
    }

    if (isJson) return rawText.slice(0, 20000);
    if (isText) return rawText.slice(0, 20000);

    const $ = cheerio.load(html!);
    const { title, metaDesc, content, links } = extractTextFromCheerio($, selector, url);

    // If we got very little content, the page is probably JS-rendered — fall back to Jina
    if (content.length < 200 && !selector) {
      const jinaResult = await fetchViaJina(url);
      if (jinaResult) return jinaResult.slice(0, 20000);
    }

    let result = "";
    if (title) result += `Title: ${title}\n`;
    if (metaDesc) result += `Description: ${metaDesc}\n`;
    result += `URL: ${url}\n\n${content.slice(0, 15000)}`;
    if (content.length > 15000) result += "\n\n... (content truncated)";
    if (links.length > 0) result += `\n\nKey Links:\n${links.join("\n")}`;
    return result;
  } catch (err) { return `Failed to scrape ${url}: ${err instanceof Error ? err.message : String(err)}`; }
}

// ─── Browse Web (Automation) ──────────────────────────────────────────────────

async function executeBrowseWeb(
  url: string,
  actions: Array<Record<string, unknown>> | undefined,
  extractSelector: string | undefined,
  screenshot: boolean,
  ctx: ToolContext
): Promise<string> {
  // Uses Playwright for real Chrome browser control — supports navigation,
  // clicking, typing, form filling, screenshots, JS evaluation, and more.
  // Inspired by browser-use / OpenClaw patterns for AI‑driven browser automation.
  try {
    // Simple case: no interactive actions and no screenshot → use fast fetch+cheerio
    if ((!actions || actions.length === 0) && !screenshot) {
      const result = await executeScrapeUrl(url, extractSelector);
      return result;
    }

    // Full browser automation via Playwright
    let chromium: typeof import("playwright").chromium | undefined;
    try {
      const pw = await import("playwright");
      chromium = pw.chromium;
    } catch {
      // Playwright not installed — fall back to generated‑script approach
    }

    if (chromium) {
      // ── Steel-managed browser session ────────────────────────────────────
      // Uses the shared Steel client for cloud browser access with:
      // - Anti-detection / stealth
      // - CAPTCHA auto-solving
      // - Profile persistence (cookies/auth survive across runs)
      // Falls back to local Chromium when Steel is not configured.
      const { createSteelSession } = await import("./steel-client");

      // Determine a purpose key for profile persistence based on the target URL
      const urlDomain = (() => {
        try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "default"; }
      })();
      const purposeKey = `browse:${urlDomain}`;

      const steel = await createSteelSession(chromium, {
        purposeKey,
        solveCaptcha: true,
        timeout: 300000,
      });

      const { context, page, isSteel } = steel;
      const results: string[] = [];

      // Helper: resolve a locator robustly — supports CSS, text=, aria=, xpath=
      async function resolveLocator(sel: string) {
        if (!sel) throw new Error("No selector provided");
        const loc = page.locator(sel).first();
        await loc.waitFor({ state: "visible", timeout: 10000 });
        return loc;
      }

      try {
        // Navigate and wait for page to settle
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        // Brief extra wait for JS to render
        await page.waitForLoadState("networkidle").catch(() => {/* ignore timeout */});
        results.push(`Loaded: ${page.url()}`);
        results.push(`Title: ${await page.title()}`);

        // Execute browser actions — each wrapped individually so one failure
        // logs an error and continues rather than aborting the whole run
        if (actions && actions.length > 0) {
          for (const action of actions) {
            const type = (action.type as string) || (action.action as string) || "";
            const selector = (action.selector as string) || (action.element as string) || "";
            const value = (action.value as string) || (action.text as string) || "";
            const delay = (action.delay_ms as number) || 0;

            try {
              switch (type) {
                case "goto": {
                  const dest = (action.url as string) || value || url;
                  await page.goto(dest, { waitUntil: "domcontentloaded", timeout: 20000 });
                  await page.waitForLoadState("networkidle").catch(() => {});
                  results.push(`Navigated to: ${page.url()}`);
                  break;
                }
                case "click": {
                  const loc = await resolveLocator(selector);
                  await loc.click({ timeout: 8000 });
                  await page.waitForTimeout(delay || 600);
                  // Wait for any navigation that may have been triggered
                  await page.waitForLoadState("domcontentloaded").catch(() => {});
                  results.push(`Clicked: ${selector} (now at ${page.url()})`);
                  break;
                }
                case "type": {
                  const loc = await resolveLocator(selector);
                  await loc.click();
                  await loc.selectText().catch(() => {});
                  await loc.pressSequentially(value, { delay: 40 });
                  results.push(`Typed "${value.slice(0, 50)}${value.length > 50 ? "..." : ""}" into: ${selector}`);
                  break;
                }
                case "fill": {
                  const loc = await resolveLocator(selector);
                  await loc.fill(value);
                  results.push(`Filled: ${selector}`);
                  break;
                }
                case "select": {
                  const loc = await resolveLocator(selector);
                  await loc.selectOption(value);
                  results.push(`Selected "${value}" in: ${selector}`);
                  break;
                }
                case "wait": {
                  if (selector) {
                    await page.locator(selector).first().waitFor({ state: "visible", timeout: (action.timeout as number) || 10000 });
                    results.push(`Waited for: ${selector}`);
                  } else {
                    const ms = (action.timeout as number) || (action.ms as number) || 2000;
                    await page.waitForTimeout(ms);
                    results.push(`Waited ${ms}ms`);
                  }
                  break;
                }
                case "scroll": {
                  const dist = (action.y as number) || (action.distance as number) || 500;
                  await page.evaluate((y: number) => window.scrollBy(0, y), dist);
                  await page.waitForTimeout(300);
                  results.push(`Scrolled ${dist}px`);
                  break;
                }
                case "press": {
                  const key = (action.key as string) || value;
                  if (selector) {
                    const loc = await resolveLocator(selector);
                    await loc.press(key);
                  } else {
                    await page.keyboard.press(key);
                  }
                  results.push(`Pressed key: ${key}`);
                  break;
                }
                case "hover": {
                  const loc = await resolveLocator(selector);
                  await loc.hover();
                  results.push(`Hovered: ${selector}`);
                  break;
                }
                case "evaluate": {
                  const script = (action.script as string) || (action.code as string) || "document.title";
                  const evalResult = await page.evaluate((s: string) => {
                    // eslint-disable-next-line no-new-func
                    return new Function(s)();
                  }, script);
                  results.push(`Evaluate result: ${JSON.stringify(evalResult)}`);
                  break;
                }
                case "extract": {
                  const extracted = await page.evaluate((sel: string) => {
                    const els = document.querySelectorAll(sel);
                    return Array.from(els).map(el => (el as HTMLElement).innerText?.trim()).filter(Boolean).join("\n");
                  }, selector || "body");
                  results.push(`Extracted:\n${extracted.slice(0, 5000)}`);
                  break;
                }
                case "screenshot": {
                  const actionSsPath = path.join(ctx.filesDir, `screenshot_${Date.now()}.png`);
                  await page.screenshot({ path: actionSsPath, fullPage: false });
                  results.push(`Screenshot saved: ${actionSsPath}`);
                  break;
                }
                case "pdf": {
                  const pdfPath = path.join(ctx.filesDir, `page_${Date.now()}.pdf`);
                  await page.pdf({ path: pdfPath, format: "A4" });
                  results.push(`PDF saved: ${pdfPath}`);
                  break;
                }
                case "wait_for_navigation": {
                  await page.waitForLoadState("domcontentloaded", { timeout: (action.timeout as number) || 15000 });
                  results.push(`Navigation settled: ${page.url()}`);
                  break;
                }
                case "back": {
                  await page.goBack({ waitUntil: "domcontentloaded", timeout: 10000 });
                  results.push(`Navigated back to: ${page.url()}`);
                  break;
                }
                case "forward": {
                  await page.goForward({ waitUntil: "domcontentloaded", timeout: 10000 });
                  results.push(`Navigated forward to: ${page.url()}`);
                  break;
                }
                case "reload": {
                  await page.reload({ waitUntil: "domcontentloaded", timeout: 15000 });
                  results.push(`Reloaded: ${page.url()}`);
                  break;
                }
                default:
                  results.push(`Unknown action type: ${type} — skipping`);
              }

              if (delay && type !== "click") await page.waitForTimeout(delay);
            } catch (actionErr) {
              // Log the error but keep going with remaining actions
              results.push(`⚠ Action "${type}"${selector ? ` on "${selector}"` : ""} failed: ${actionErr instanceof Error ? actionErr.message : String(actionErr)}`);
            }
          }
        }

        // Take screenshot if requested
        if (screenshot) {
          const ssPath = path.join(ctx.filesDir, `screenshot_${Date.now()}.png`);
          await page.screenshot({ path: ssPath, fullPage: false });
          results.push(`Screenshot saved: ${ssPath}`);
          try {
            addTaskFile({
              id: uuidv4(),
              task_id: ctx.taskId,
              name: path.basename(ssPath),
              path: ssPath,
              mime_type: "image/png",
              size: fs.statSync(ssPath).size,
              created_at: new Date().toISOString(),
            });
          } catch { /* ignore file tracking errors */ }
        }

        // Extract content
        if (extractSelector) {
          const content = await page.evaluate((sel: string) => {
            const el = document.querySelector(sel);
            return el ? (el as HTMLElement).innerText?.trim() || el.innerHTML.slice(0, 5000) : `Selector not found: ${sel}`;
          }, extractSelector);
          results.push(`\nExtracted (${extractSelector}):\n${content.slice(0, 5000)}`);
        } else if (!actions || actions.length === 0) {
          const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 8000) || "");
          results.push(`\nPage content:\n${bodyText}`);
        }

        return results.join("\n");
      } finally {
        // Release Steel session (saves profile + context) or close local browser
        await steel.release();
      }
    }

    // ── Fallback: no Playwright available ────────────────────────────────────
    // Use fetch+cheerio (limited: no click/type/JS execution)
    const fallbackResp = await fetchWithRetry(url, { headers: SCRAPE_HEADERS, signal: AbortSignal.timeout(20000) });
    if (!fallbackResp.ok) {
      const jinaResult = await fetchViaJina(url);
      if (jinaResult) {
        return `URL: ${url}\n\nPage content (via Jina reader):\n${jinaResult.slice(0, 8000)}`;
      }
      return `Failed to browse ${url}: HTTP ${fallbackResp.status}`;
    }

    const html = await fallbackResp.text();
    const $ = cheerio.load(html);
    $("script, style, nav, footer, iframe, noscript").remove();

    const results: string[] = [];
    results.push(`URL: ${url}`);
    results.push(`Title: ${$("title").text().trim()}`);

    if (extractSelector) {
      const content = $(extractSelector).text().trim();
      results.push(`\nExtracted (${extractSelector}):\n${content.slice(0, 5000)}`);
    } else {
      const bodyText = $("body").text().replace(/\s+/g, " ").trim();
      results.push(`\nPage content:\n${bodyText.slice(0, 8000)}`);
    }

    // List forms for fill-in info
    const forms = $("form");
    if (forms.length > 0) {
      results.push(`\nForms found: ${forms.length}`);
      forms.each((_i, form) => {
        const action = $(form).attr("action") || "(inline)";
        const inputs = $(form).find("input, select, textarea");
        results.push(`  Form action: ${action}`);
        inputs.each((_j, inp) => {
          const name = $(inp).attr("name") || $(inp).attr("id") || "";
          const type = $(inp).attr("type") || inp.tagName;
          if (name) results.push(`    - ${type}: ${name}`);
        });
      });
    }

    // List links
    const links: string[] = [];
    $("a[href]").each((_i, el) => {
      const href = $(el).attr("href");
      const text = $(el).text().trim();
      if (href && text && !href.startsWith("#") && !href.startsWith("javascript:") && links.length < 15) {
        try { links.push(`- [${text.slice(0, 60)}](${new URL(href, url).toString()})`); } catch { /* skip */ }
      }
    });
    if (links.length > 0) results.push(`\nLinks:\n${links.join("\n")}`);

    results.push("\nNote: Full browser automation (click/type/screenshot) requires Playwright. Run: npm install playwright && npx playwright install chromium");
    return results.join("\n");
  } catch (err) {
    return `Browse error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ─── Memory ───────────────────────────────────────────────────────────────────

async function executeMemoryStore(key: string, value: string, tags: string[], ctx: ToolContext): Promise<string> {
  memoryStore({ id: uuidv4(), key, value, source_task_id: ctx.taskId, tags, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  return `Memory stored: "${key}" = "${value.slice(0, 100)}${value.length > 100 ? "..." : ""}" [tags: ${tags.join(", ") || "none"}]`;
}

async function executeMemoryRecall(query: string, limit: number): Promise<string> {
  const results = memoryRecall(query, limit);
  if (results.length === 0) return `No memories found for "${query}".`;
  return `Found ${results.length} memories:\n\n${results.map((m, i) => `${i + 1}. **${m.key}**: ${m.value}\n   Tags: [${(m.tags || []).join(", ")}]\n   ID: ${m.id}\n   Updated: ${m.updated_at}`).join("\n\n")}`;
}

async function executeMemoryList(limit: number): Promise<string> {
  const entries = listMemory(limit);
  if (entries.length === 0) return "Memory bank is empty. No memories stored yet.";
  return `Memory Bank (${entries.length} entries):\n\n${entries.map((m, i) => `${i + 1}. **${m.key}**: ${m.value.slice(0, 200)}${m.value.length > 200 ? "..." : ""}\n   Tags: [${(m.tags || []).join(", ")}] | ID: ${m.id}\n   Source: ${m.source_task_id || "manual"} | Updated: ${m.updated_at}`).join("\n\n")}`;
}

async function executeMemoryDelete(id: string, reason: string): Promise<string> {
  try {
    // Verify it exists first
    const all = listMemory(500);
    const entry = all.find(m => m.id === id);
    if (!entry) return `Memory with ID "${id}" not found. Use memory_list to see available entries.`;
    deleteMemory(id);
    console.log(`[memory] Deleted memory "${entry.key}" (${id}). Reason: ${reason || "not specified"}`);
    return `Deleted memory: "${entry.key}" (ID: ${id}).${reason ? ` Reason: ${reason}` : ""}\nThe memory bank is now cleaner and more accurate.`;
  } catch (err) {
    return `Error deleting memory: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function executeMemoryUpdate(key: string, value: string, tags?: string[]): Promise<string> {
  try {
    // Find existing entry by key
    const all = listMemory(500);
    const existing = all.find(m => m.key === key);
    if (!existing) {
      // If key doesn't exist, create it as a new entry
      memoryStore({
        id: uuidv4(), key, value,
        tags: tags || [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      return `No existing memory with key "${key}" — created new entry.\nStored: "${key}" = "${value.slice(0, 100)}${value.length > 100 ? "..." : ""}"`;
    }
    // Update existing
    memoryStore({
      ...existing,
      value,
      tags: tags || existing.tags,
      updated_at: new Date().toISOString(),
    });
    return `Updated memory: "${key}"\nOld value: ${existing.value.slice(0, 100)}${existing.value.length > 100 ? "..." : ""}\nNew value: ${value.slice(0, 100)}${value.length > 100 ? "..." : ""}\nMemory evolved successfully.`;
  } catch (err) {
    return `Error updating memory: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function executeListSkills(activeOnly: boolean): Promise<string> {
  try {
    const { listSkills } = await import("./db");
    const skills = listSkills();
    const filtered = activeOnly ? skills.filter(s => s.is_active) : skills;
    if (filtered.length === 0) return activeOnly ? "No active skills configured." : "No skills configured.";
    return `Available Skills (${filtered.length}${activeOnly ? " active" : ""}):\n\n${filtered.map((s, i) => {
      const triggers = s.triggers && s.triggers.length > 0 ? `Triggers: ${s.triggers.join(", ")}` : "No triggers (always active)";
      return `${i + 1}. **${s.name}** [${s.is_active ? "✅ active" : "❌ inactive"}]\n   ${s.description || "No description"}\n   Category: ${s.category} | Preset: ${s.preset_type}\n   ${triggers}\n   Model: ${s.model || "auto"} | Max steps: ${s.max_steps || "default"}`;
    }).join("\n\n")}`;
  } catch (err) {
    return `Error listing skills: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ─── Organize Files ───────────────────────────────────────────────────────────

async function executeOrganizeFiles(
  action: string,
  folderName: string | undefined,
  parentFolderId: string | undefined,
  fileNames: string[] | undefined,
  targetFolderId: string | undefined,
  ctx: ToolContext,
): Promise<string> {
  try {
    switch (action) {
      case "create_folder": {
        if (!folderName) return "Error: folder_name is required for create_folder action.";
        const folderId = uuidv4();
        const now = new Date().toISOString();
        createFolder({ id: folderId, name: folderName, parent_id: parentFolderId, color: "#5e9cf0", created_at: now, updated_at: now });
        return `Created folder "${folderName}" (id: ${folderId}).${parentFolderId ? ` Inside parent folder ${parentFolderId}.` : ""} Files can be moved into this folder using organize_files with action="move_to_folder" and target_folder_id="${folderId}".`;
      }
      case "move_to_folder": {
        if (!fileNames || fileNames.length === 0) return "Error: file_names is required for move_to_folder action.";
        const allFiles = listAllFiles(500);
        const moved: string[] = [];
        const notFound: string[] = [];
        for (const fname of fileNames) {
          // Match by name (optionally scoped to current task first)
          const match = allFiles.find(f => f.name === fname && f.task_id === ctx.taskId)
            || allFiles.find(f => f.name === fname);
          if (match) {
            updateFileFolder(match.id, targetFolderId || null);
            moved.push(fname);
          } else {
            notFound.push(fname);
          }
        }
        let result = "";
        if (moved.length > 0) result += `Moved ${moved.length} file(s) to ${targetFolderId ? `folder ${targetFolderId}` : "root"}: ${moved.join(", ")}`;
        if (notFound.length > 0) result += `${result ? "\n" : ""}Could not find: ${notFound.join(", ")}`;
        return result || "No files matched.";
      }
      case "list_all_files": {
        const files = listAllFiles(50);
        const folders = listFolders();
        if (files.length === 0 && folders.length === 0) return "No files or folders in the global file system.";
        let result = "";
        if (folders.length > 0) {
          result += `Folders (${folders.length}):\n${folders.map(f => `- 📁 "${f.name}" [id: ${f.id}]`).join("\n")}\n\n`;
        }
        result += `Files (${files.length}):\n${files.map(f => {
          const folder = f.folder_id ? folders.find(fld => fld.id === f.folder_id) : null;
          return `- ${f.name} (${formatBytes(f.size)}, ${f.mime_type}, task: "${f.task_title || "untitled"}")${folder ? ` [in folder "${folder.name}"]` : ""}`;
        }).join("\n")}`;
        return result;
      }
      default:
        return `Unknown organize_files action: ${action}. Use "create_folder", "move_to_folder", or "list_all_files".`;
    }
  } catch (err) {
    return `Error organizing files: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ─── Dream Machine ────────────────────────────────────────────────────────────

interface DreamShot {
  prompt: string;
  mode?: string;
  model?: string;
  aspect_ratio?: string;
  duration?: string;
  image_url?: string;
}

async function executeDreamMachine(
  boardName: string,
  shots: DreamShot[],
  provider: string,
  ctx: ToolContext,
): Promise<string> {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    `http://localhost:${process.env.PORT || 3000}`;

  type ShotResult = {
    prompt: string;
    status: string;
    generationId?: string;
    videoUrl?: string;
    imageUrl?: string;
    error?: string;
  };
  const results: ShotResult[] = new Array(shots.length).fill(null).map(() => ({ prompt: "", status: "pending" }));
  const pending: Array<{ idx: number; generationId: string; prompt: string }> = [];

  // ── Start all shots in parallel ──────────────────────────────────────────
  await Promise.all(
    shots.map(async (shot, i) => {
      const mode = shot.mode || "text-to-video";
      const isVideo = !mode.includes("image") || mode === "image-to-video";
      const body: Record<string, unknown> = {
        action: isVideo ? "generate-video" : "generate-image",
        prompt: shot.prompt,
        model: shot.model || (isVideo ? "ray-3" : "photon-1"),
        aspect_ratio: shot.aspect_ratio || "16:9",
        duration: isVideo ? (shot.duration || "5s") : undefined,
        provider,
      };
      if (shot.image_url && mode === "image-to-video") {
        body.keyframes = { frame0: { type: "image", url: shot.image_url } };
      }
      try {
        const res = await fetch(`${baseUrl}/api/luma`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json() as Record<string, unknown>;
        if (!res.ok) {
          results[i] = { prompt: shot.prompt, status: "failed", error: (data.error as string) || `HTTP ${res.status}` };
          return;
        }
        const generationId = data.id as string;
        if (!generationId) {
          results[i] = { prompt: shot.prompt, status: "failed", error: `No generation ID in response` };
          return;
        }
        results[i] = { prompt: shot.prompt, status: "queued", generationId };
        pending.push({ idx: i, generationId, prompt: shot.prompt });
      } catch (err) {
        results[i] = { prompt: shot.prompt, status: "failed", error: String(err) };
      }
    }),
  );

  // ── Poll until all complete or 6-minute timeout ───────────────────────────
  const TIMEOUT_MS = 6 * 60 * 1000;
  const POLL_MS = 5000;
  const deadline = Date.now() + TIMEOUT_MS;

  while (pending.length > 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const stillPending: typeof pending = [];
    for (const p of pending) {
      try {
        const res = await fetch(`${baseUrl}/api/luma?action=status&id=${p.generationId}`);
        if (!res.ok) { stillPending.push(p); continue; }
        const data = await res.json() as { state?: string; assets?: { video?: string; image?: string }; failure_reason?: string };
        if (data.state === "completed") {
          results[p.idx] = {
            prompt: p.prompt, status: "completed", generationId: p.generationId,
            videoUrl: data.assets?.video, imageUrl: data.assets?.image,
          };
        } else if (data.state === "failed") {
          results[p.idx] = { prompt: p.prompt, status: "failed", generationId: p.generationId, error: data.failure_reason || "Generation failed" };
        } else {
          stillPending.push(p);
        }
      } catch { stillPending.push(p); }
    }
    pending.splice(0, pending.length, ...stillPending);
  }
  // Mark timed-out shots
  for (const p of pending) {
    if (results[p.idx]?.status !== "completed" && results[p.idx]?.status !== "failed") {
      results[p.idx] = { ...results[p.idx], status: "timeout", error: "Still processing after 6 min — open Dream Machine to track progress" };
    }
  }

  // ── Save storyboard JSON to task files ────────────────────────────────────
  const board = {
    id: uuidv4(),
    name: boardName,
    type: "storyboard",
    source: "agent",
    taskId: ctx.taskId,
    shots: results.map((r, i) => ({
      id: uuidv4(),
      prompt: r.prompt,
      mode: shots[i]?.mode || "text-to-video",
      status: r.status === "completed" ? "completed" : r.status === "failed" ? "failed" : "idle",
      generationId: r.generationId,
      videoUrl: r.videoUrl,
      imageUrl: r.imageUrl,
      error: r.error,
      model: shots[i]?.model || "ray-3",
      resolution: "720p",
      aspectRatio: shots[i]?.aspect_ratio || "16:9",
      duration: shots[i]?.duration || "5s",
      loop: false,
      createdAt: Date.now(),
    })),
    createdAt: Date.now(),
  };

  const safeName = boardName.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40);
  const boardFilename = `${safeName}_board.json`;
  const boardJson = JSON.stringify(board, null, 2);
  fs.writeFileSync(path.join(ctx.filesDir, boardFilename), boardJson, "utf-8");
  addTaskFile({
    id: uuidv4(), task_id: ctx.taskId, name: boardFilename,
    path: path.join(ctx.filesDir, boardFilename),
    size: Buffer.byteLength(boardJson), mime_type: "application/json",
    created_at: new Date().toISOString(),
  });

  // ── Add completed videos to gallery ──────────────────────────────────────
  for (const r of results) {
    const mediaUrl = r.videoUrl || r.imageUrl;
    if (r.status === "completed" && mediaUrl) {
      try {
        addGalleryItem({
          id: uuidv4(), title: `${boardName} — ${r.prompt.slice(0, 50)}`,
          description: r.prompt, preview_url: mediaUrl,
          category: r.videoUrl ? "video" : "image",
          prompt: r.prompt, task_id: ctx.taskId,
          created_at: new Date().toISOString(), is_featured: false,
        });
      } catch { /* best-effort */ }
    }
  }

  // ── Build summary ─────────────────────────────────────────────────────────
  const completed = results.filter((r) => r.status === "completed");
  const failed = results.filter((r) => r.status === "failed" || r.status === "timeout");
  const lines: string[] = [];
  lines.push(`🎬 **${boardName}** — ${completed.length}/${results.length} shots generated`);
  lines.push("");
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const url = r.videoUrl || r.imageUrl || "";
    if (r.status === "completed") {
      lines.push(`✅ Shot ${i + 1}: ${r.prompt.slice(0, 70)}`);
      if (url) lines.push(`   🔗 ${url}`);
    } else if (r.status === "timeout") {
      lines.push(`⏳ Shot ${i + 1}: ${r.prompt.slice(0, 70)} — still processing (ID: ${r.generationId})`);
    } else {
      lines.push(`❌ Shot ${i + 1}: ${r.prompt.slice(0, 70)} — ${r.error || "failed"}`);
    }
  }
  if (failed.length === 0 && completed.length > 0) {
    lines.push(`\n📁 Storyboard saved: ${boardFilename}`);
    lines.push(`🎭 [Open in Dream Machine](/computer/dream-machine?import=${ctx.taskId})`);
  } else if (completed.length > 0) {
    lines.push(`\n📁 Storyboard saved: ${boardFilename} (${failed.length} shot(s) failed)`);
    lines.push(`🎭 [Open in Dream Machine](/computer/dream-machine?import=${ctx.taskId})`);
  }
  return lines.join("\n");
}

// ─── Image Generation ──────────────────────────────────────────────────────────

async function executeGenerateImage(
  prompt: string, size: string, style: string, filename: string, ctx: ToolContext
): Promise<string> {
  if (!process.env.OPENAI_API_KEY) return "Image generation requires OPENAI_API_KEY (uses DALL-E 3).";
  try {
    const resp = await openai.images.generate({
      model: "dall-e-3", prompt, n: 1,
      size: size as "1024x1024" | "1792x1024" | "1024x1792",
      style: style as "vivid" | "natural", response_format: "url",
    });
    const imageUrl = resp.data?.[0]?.url;
    if (!imageUrl) return "Image generation failed: no URL returned.";
    const imgResp = await fetch(imageUrl);
    if (!imgResp.ok) return `Failed to download image: HTTP ${imgResp.status}`;
    const buf = Buffer.from(await imgResp.arrayBuffer());
    const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = path.join(ctx.filesDir, safeName);
    fs.writeFileSync(filePath, buf);
    const stat = fs.statSync(filePath);
    addTaskFile({ id: uuidv4(), task_id: ctx.taskId, name: safeName, path: filePath, size: stat.size, mime_type: "image/png", created_at: new Date().toISOString() });
    const revised = resp.data?.[0]?.revised_prompt;
    return `Image generated: ${safeName} (${formatBytes(stat.size)})${revised ? `\nRevised prompt: ${revised}` : ""}`;
  } catch (err) { return `Image generation failed: ${err instanceof Error ? err.message : String(err)}`; }
}

// ─── Replicate Smart Model Runner ─────────────────────────────────────────────

async function executeReplicateRun(
  prompt: string,
  model: string | undefined,
  params: Record<string, unknown> | undefined,
  ctx: ToolContext
): Promise<string> {
  try {
    const { runReplicateTask } = await import("./replicate");

    const progressMessages: string[] = [];
    const result = await runReplicateTask({
      prompt,
      model,
      params,
      filesDir: ctx.filesDir,
      onProgress: (status) => { progressMessages.push(status); },
    });

    // Register output files with the task
    for (const file of result.files) {
      addTaskFile({
        id: uuidv4(),
        task_id: ctx.taskId,
        name: file.filename,
        path: file.filePath,
        size: file.size,
        mime_type: file.mimeType,
        created_at: new Date().toISOString(),
      });
    }

    // Add to gallery if it's an image
    if (result.files.length > 0 && result.files[0].mimeType.startsWith("image/")) {
      try {
        addGalleryItem({
          id: uuidv4(),
          title: prompt.slice(0, 100),
          description: `Generated by ${result.model} via Replicate`,
          preview_url: `/api/files/${ctx.taskId}/${result.files[0].filename}`,
          category: result.taskType,
          prompt,
          task_id: ctx.taskId,
          created_at: new Date().toISOString(),
          is_featured: false,
        });
      } catch { /* gallery is best-effort */ }
    }

    // Build response
    const parts: string[] = [];
    parts.push(`✅ Replicate model: ${result.model}`);
    parts.push(`   Task type: ${result.taskType}`);
    parts.push(`   ${result.modelReason}`);

    if (result.prediction.metrics?.predict_time) {
      parts.push(`   Predict time: ${result.prediction.metrics.predict_time.toFixed(1)}s`);
    }

    if (result.files.length > 0) {
      parts.push(`\nFiles created:`);
      for (const f of result.files) {
        parts.push(`   • ${f.filename} (${formatBytes(f.size)}, ${f.mimeType})`);
      }
    }

    if (result.textOutput) {
      parts.push(`\nOutput:\n${result.textOutput.slice(0, 3000)}`);
    }

    // Record analytics
    try {
      recordAnalyticsEvent({
        id: uuidv4(),
        event_type: "tool_call",
        tool_name: "replicate_run",
        model: result.model,
        duration_ms: (result.prediction.metrics?.predict_time || 0) * 1000,
        success: true,
        metadata: { taskType: result.taskType, filesCount: result.files.length },
      });
    } catch { /* best-effort */ }

    return parts.join("\n");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Record failure
    try {
      recordAnalyticsEvent({
        id: uuidv4(),
        event_type: "tool_call",
        tool_name: "replicate_run",
        success: false,
        metadata: { error: msg.slice(0, 200), model },
      });
    } catch { /* best-effort */ }
    return `Replicate error: ${msg}`;
  }
}

// ─── Send Email ───────────────────────────────────────────────────────────────

async function executeSendEmail(
  to: string, subject: string, body: string, from: string | undefined, _ctx: ToolContext
): Promise<string> {
  if (process.env.RESEND_API_KEY) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: from || process.env.RESEND_FROM_EMAIL || "Ottomatron <onboarding@resend.dev>", to: [to], subject, html: body }),
      });
      if (r.ok) { const d = await r.json() as { id: string }; return `Email sent to ${to}. ID: ${d.id}`; }
      const e = await r.json() as { message?: string }; return `Email failed: ${e.message || `HTTP ${r.status}`}`;
    } catch (err) { return `Email error: ${err instanceof Error ? err.message : String(err)}`; }
  }
  return `Email draft prepared for ${to} — Subject: "${subject}". Set RESEND_API_KEY to send emails.`;
}

// ─── Code Execution ───────────────────────────────────────────────────────────

async function executeCode(language: string, code: string, timeout: number, ctx: ToolContext): Promise<string> {
  const ext = language === "python" ? "py" : language === "javascript" ? "js" : "sh";
  const filename = `script_${Date.now()}.${ext}`;
  const filepath = path.join(ctx.filesDir, filename);
  const MAX_INSTALL_RETRIES = 2;

  try {
    fs.writeFileSync(filepath, code, "utf-8");
    const cmd =
      language === "python" ? `cd "${ctx.filesDir}" && python3 "${filename}" 2>&1`
      : language === "javascript" ? `cd "${ctx.filesDir}" && node "${filename}" 2>&1`
      : `cd "${ctx.filesDir}" && bash "${filename}" 2>&1`;

    let output = "";
    let retries = 0;

    while (retries <= MAX_INSTALL_RETRIES) {
      try {
        const { stdout, stderr } = await execAsync(cmd, { timeout: (timeout + 5) * 1000, cwd: ctx.filesDir });
        output = (stdout || stderr || "").slice(0, 10000);
        break; // Success — exit retry loop
      } catch (execErr) {
        const errMsg = execErr instanceof Error ? execErr.message : String(execErr);

        // Auto-install missing packages (like Perplexity Sandbox)
        if (retries < MAX_INSTALL_RETRIES) {
          const missingPackages: string[] = [];

          if (language === "python") {
            // Match: ModuleNotFoundError: No module named 'xxx'
            const pyMatches = errMsg.matchAll(/No module named ['\"]([a-zA-Z0-9_.-]+)['\"]|ModuleNotFoundError:.*?['\"]([a-zA-Z0-9_.-]+)['\"]|ImportError:.*?['\"]([a-zA-Z0-9_.-]+)['\"]|cannot import name.*from ['\"]([a-zA-Z0-9_.-]+)['\"]?/g);
            for (const m of pyMatches) {
              const pkg = m[1] || m[2] || m[3] || m[4];
              if (pkg) missingPackages.push(pkg.split(".")[0]); // Get top-level package name
            }
          } else if (language === "javascript") {
            // Match: Cannot find module 'xxx'
            const jsMatches = errMsg.matchAll(/Cannot find module ['\"]([a-zA-Z0-9@/_.-]+)['\"]|Error: Cannot find package ['\"]([a-zA-Z0-9@/_.-]+)['\"]|MODULE_NOT_FOUND.*?['\"]([a-zA-Z0-9@/_.-]+)['\"]?/g);
            for (const m of jsMatches) {
              const pkg = m[1] || m[2] || m[3];
              if (pkg && !pkg.startsWith(".") && !pkg.startsWith("/")) missingPackages.push(pkg);
            }
          }

          const uniquePkgs = [...new Set(missingPackages)];
          if (uniquePkgs.length > 0) {
            // Install missing packages automatically
            const installCmd = language === "python"
              ? `pip3 install ${uniquePkgs.join(" ")} 2>&1`
              : `cd "${ctx.filesDir}" && npm install ${uniquePkgs.join(" ")} --no-save 2>&1`;
            try {
              const { stdout: installOut } = await execAsync(installCmd, { timeout: 60000 });
              output = `[Auto-installed: ${uniquePkgs.join(", ")}]\n${(installOut || "").slice(0, 500)}\n\n`;
              retries++;
              continue; // Retry execution after install
            } catch (installErr) {
              output = `Package install failed for ${uniquePkgs.join(", ")}: ${(installErr instanceof Error ? installErr.message : String(installErr)).slice(0, 500)}\n`;
              break;
            }
          }
        }

        // Not a missing package error or exhausted retries
        output = `Execution error: ${errMsg.slice(0, 2000)}`;
        break;
      }
    }

    const newFiles = fs.readdirSync(ctx.filesDir)
      .filter((f) => f !== filename)
      .filter((f) => { const s = fs.statSync(path.join(ctx.filesDir, f)); return s.mtimeMs > Date.now() - (timeout + 10) * 1000; });
    for (const nf of newFiles) {
      const fp = path.join(ctx.filesDir, nf); const s = fs.statSync(fp);
      addTaskFile({ id: uuidv4(), task_id: ctx.taskId, name: nf, path: fp, size: s.size, mime_type: getMimeType(nf), created_at: new Date().toISOString() });
    }
    return output + (newFiles.length > 0 ? `\n\nFiles created: ${newFiles.join(", ")}` : "");
  } catch (err) { return `Execution error: ${(err instanceof Error ? err.message : String(err)).slice(0, 2000)}`; }
  finally { try { fs.unlinkSync(filepath); } catch { /* ignore */ } }
}

// ─── File Operations ──────────────────────────────────────────────────────────

async function writeFile(filename: string, content: string, mimeType: string | undefined, ctx: ToolContext): Promise<string> {
  const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = path.join(ctx.filesDir, safeName);
  // Coerce content to string in case the model passed an object/array
  const safeContent = typeof content === "string" ? content : JSON.stringify(content, null, 2);
  fs.writeFileSync(filePath, safeContent, "utf-8");
  const stat = fs.statSync(filePath);
  addTaskFile({ id: uuidv4(), task_id: ctx.taskId, name: safeName, path: filePath, size: stat.size, mime_type: mimeType || getMimeType(safeName), created_at: new Date().toISOString() });
  return `File written: ${safeName} (${formatBytes(stat.size)})`;
}

async function readFile(filename: string, ctx: ToolContext): Promise<string> {
  const safeName = path.basename(filename);
  const filePath = path.join(ctx.filesDir, safeName);
  if (!fs.existsSync(filePath)) return `File not found: ${safeName}. Available: ${fs.readdirSync(ctx.filesDir).join(", ") || "none"}`;

  const ext = path.extname(safeName).toLowerCase();
  const BINARY_EXTENSIONS = new Set([".pdf", ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt", ".zip", ".tar", ".gz", ".rar", ".7z", ".exe", ".dmg", ".iso", ".bin", ".dat", ".db", ".sqlite"]);
  const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".ico", ".tiff", ".tif"]);
  const stat = fs.statSync(filePath);

  // Handle images — return metadata, suggest using vision or code
  if (IMAGE_EXTENSIONS.has(ext)) {
    return `[Image file: ${safeName} (${formatBytes(stat.size)})]\nThis is an image file. To analyze it, use execute_code with Python and a vision library, or describe it based on its filename and the user's context.`;
  }

  // Handle binary files — guide the agent to use execute_code for extraction
  if (BINARY_EXTENSIONS.has(ext)) {
    if (ext === ".pdf") {
      return `[Binary file: ${safeName} (${formatBytes(stat.size)})]\nThis is a PDF file. To read it, use execute_code with Python:\n\`\`\`python\nimport subprocess\nsubprocess.run(["pip", "install", "PyPDF2"], capture_output=True)\nfrom PyPDF2 import PdfReader\nreader = PdfReader("${safeName}")\nfor page in reader.pages:\n    print(page.extract_text())\n\`\`\``;
    }
    if (ext === ".docx") {
      return `[Binary file: ${safeName} (${formatBytes(stat.size)})]\nThis is a DOCX file. To read it, use execute_code with Python:\n\`\`\`python\nimport subprocess\nsubprocess.run(["pip", "install", "python-docx"], capture_output=True)\nfrom docx import Document\ndoc = Document("${safeName}")\nfor para in doc.paragraphs:\n    print(para.text)\n\`\`\``;
    }
    if ([".xlsx", ".xls"].includes(ext)) {
      return `[Binary file: ${safeName} (${formatBytes(stat.size)})]\nThis is a spreadsheet file. To read it, use execute_code with Python:\n\`\`\`python\nimport subprocess\nsubprocess.run(["pip", "install", "openpyxl"], capture_output=True)\nimport openpyxl\nwb = openpyxl.load_workbook("${safeName}")\nfor sheet in wb.sheetnames:\n    ws = wb[sheet]\n    print(f"Sheet: {sheet}")\n    for row in ws.iter_rows(values_only=True):\n        print(row)\n\`\`\``;
    }
    return `[Binary file: ${safeName} (${formatBytes(stat.size)})]\nThis is a binary file that cannot be read as text. Use execute_code with Python to process it with an appropriate library.`;
  }

  // Text file — read normally with UTF-8, fallback to latin1
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return content.slice(0, 50000) + (content.length > 50000 ? "\n... (truncated)" : "");
  } catch {
    // If UTF-8 fails, try latin-1 encoding
    const buf = fs.readFileSync(filePath);
    const content = buf.toString("latin1");
    return content.slice(0, 50000) + (content.length > 50000 ? "\n... (truncated)" : "");
  }
}

async function listFiles(ctx: ToolContext): Promise<string> {
  const files = fs.readdirSync(ctx.filesDir);
  if (files.length === 0) return "No files in working directory.";
  return files.map((f) => { const s = fs.statSync(path.join(ctx.filesDir, f)); return `- ${f} (${formatBytes(s.size)})`; }).join("\n");
}

// ─── Deep Research (Perplexity Deep Research 2.0 inspired) ────────────────────

async function executeDeepResearch(topic: string, depth: string, focusAreas: string[], outputFormat: string, ctx: ToolContext): Promise<string> {
  const queryCount = depth === "exhaustive" ? 20 : depth === "deep" ? 10 : 5;

  // Step 1: Generate diverse search queries using AI
  const queryGenPrompt = `Generate ${queryCount} diverse search queries to comprehensively research: "${topic}"
${focusAreas.length > 0 ? `Focus areas: ${focusAreas.join(", ")}` : ""}

Requirements:
- Cover different angles: factual, analytical, historical, comparative, current trends
- Include specific and broad queries
- Mix technical and accessible queries
- Include "vs", "comparison", "analysis", "statistics", "trends" queries where relevant

Return ONLY a JSON array of strings, no other text.`;

  let searchQueries: string[] = [];
  try {
    const queryResp = await anthropic.messages.create({
      model: "claude-3.5-haiku", max_tokens: 1024,
      messages: [{ role: "user", content: queryGenPrompt }],
    });
    const queryText = queryResp.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map(b => b.text).join("");
    const jsonMatch = queryText.match(/\[[\s\S]*\]/);
    if (jsonMatch) searchQueries = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(searchQueries) || searchQueries.length === 0) {
      searchQueries = [topic, `${topic} analysis`, `${topic} trends`, `${topic} comparison`, `${topic} statistics`];
    }
  } catch {
    searchQueries = [topic, `${topic} analysis`, `${topic} trends 2024 2025`, `${topic} overview`, `${topic} statistics data`];
  }

  // Step 2: Execute all searches in parallel
  const searchResults = await Promise.all(
    searchQueries.slice(0, queryCount).map(async (query) => {
      try {
        return { query, result: await executeWebSearch(query, 5) };
      } catch {
        return { query, result: "" };
      }
    })
  );

  // Step 3: Extract URLs from search results and scrape top sources in parallel
  const urlPattern = /https?:\/\/[^\s\])"',]+/g;
  const allUrls = new Set<string>();
  for (const sr of searchResults) {
    const urls = sr.result.match(urlPattern) || [];
    for (const u of urls) {
      if (!u.includes("google.com/search") && !u.includes("bing.com") && !u.endsWith(".")) {
        allUrls.add(u);
      }
    }
  }

  const topUrls = [...allUrls].slice(0, Math.min(15, allUrls.size));
  const scrapedSources = await Promise.all(
    topUrls.map(async (url) => {
      try {
        const content = await executeScrapeUrl(url, undefined);
        return { url, content: content.slice(0, 3000), success: true };
      } catch {
        return { url, content: "", success: false };
      }
    })
  );

  const successfulSources = scrapedSources.filter(s => s.success && s.content.length > 100);

  // Step 4: Synthesize all research into a comprehensive report using AI
  const synthesisPrompt = `You are a world-class research analyst. Synthesize the following research into a comprehensive ${outputFormat === "executive_summary" ? "executive summary" : outputFormat === "bullets" ? "bullet-point analysis" : outputFormat === "comparison" ? "comparison analysis" : "research report"}.

TOPIC: ${topic}
${focusAreas.length > 0 ? `FOCUS AREAS: ${focusAreas.join(", ")}` : ""}

SEARCH RESULTS (${searchResults.length} queries executed):
${searchResults.map((sr, i) => `\n--- Query ${i + 1}: "${sr.query}" ---\n${sr.result.slice(0, 2000)}`).join("\n")}

SCRAPED SOURCES (${successfulSources.length} sources analyzed):
${successfulSources.map((s, i) => `\n--- Source ${i + 1}: ${s.url} ---\n${s.content.slice(0, 2000)}`).join("\n")}

INSTRUCTIONS:
${outputFormat === "report" ? `Write a structured research report with:
- Executive Summary
- Key Findings (numbered, with supporting evidence)
- Detailed Analysis (organized by theme/aspect)
- Data & Statistics (cite specific numbers)
- Trends & Implications
- Conclusion
- Sources (list URLs used)` : outputFormat === "bullets" ? `Create a comprehensive bullet-point analysis covering all key findings, data points, and insights. Group by theme.` : outputFormat === "executive_summary" ? `Write a concise executive summary (500-800 words) covering the most important findings, data, and implications.` : `Create a detailed comparison analysis with clear categories, metrics, and a comparison matrix.`}

Be thorough, data-driven, and cite sources. Cross-reference claims across multiple sources.`;

  try {
    const synthesisResp = await anthropic.messages.create({
      model: "claude-sonnet-4-6", max_tokens: 8192,
      messages: [{ role: "user", content: synthesisPrompt }],
    });
    const report = synthesisResp.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map(b => b.text).join("\n");

    const metadata = `\n\n---\n**Deep Research Metadata:**\n- Queries executed: ${searchResults.length}\n- Sources scraped: ${successfulSources.length}\n- Depth: ${depth}\n- URLs analyzed: ${topUrls.join(", ")}`;

    return report + metadata;
  } catch (err) {
    // Fallback: return raw search results if synthesis fails
    return `Deep Research Results for: ${topic}\n\n${searchResults.map(sr => `## ${sr.query}\n${sr.result}`).join("\n\n")}\n\nSources scraped: ${successfulSources.length}`;
  }
}

// ─── Finance Data ─────────────────────────────────────────────────────────────

async function executeFinanceData(queryType: string, symbol: string, query: string, period: string): Promise<string> {
  // Strategy: Use free financial APIs + web search for comprehensive data
  const results: string[] = [];

  // Alpha Vantage API (if key available)
  if (process.env.ALPHA_VANTAGE_API_KEY && symbol) {
    try {
      let avUrl = "";
      switch (queryType) {
        case "stock_quote":
          avUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${process.env.ALPHA_VANTAGE_API_KEY}`;
          break;
        case "company_financials":
          avUrl = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${process.env.ALPHA_VANTAGE_API_KEY}`;
          break;
        case "earnings":
          avUrl = `https://www.alphavantage.co/query?function=EARNINGS&symbol=${symbol}&apikey=${process.env.ALPHA_VANTAGE_API_KEY}`;
          break;
        case "economic_indicator":
          avUrl = `https://www.alphavantage.co/query?function=REAL_GDP&interval=quarterly&apikey=${process.env.ALPHA_VANTAGE_API_KEY}`;
          break;
        case "forex":
          const [from, to] = symbol.split("/");
          if (from && to) avUrl = `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${from}&to_currency=${to}&apikey=${process.env.ALPHA_VANTAGE_API_KEY}`;
          break;
        case "crypto":
          avUrl = `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${symbol.replace("-USD", "")}&to_currency=USD&apikey=${process.env.ALPHA_VANTAGE_API_KEY}`;
          break;
      }
      if (avUrl) {
        const resp = await fetch(avUrl);
        const data = await resp.json();
        results.push(`## Alpha Vantage Data\n\`\`\`json\n${JSON.stringify(data, null, 2).slice(0, 5000)}\n\`\`\``);
      }
    } catch (err) {
      results.push(`Alpha Vantage API error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Yahoo Finance via web search (always available as fallback)
  const searchQuery = symbol
    ? `${symbol} ${queryType === "stock_quote" ? "stock price today" : queryType === "company_financials" ? "financial data revenue earnings" : queryType === "sec_filing" ? "SEC filing 10-K 10-Q" : queryType === "earnings" ? "earnings report" : queryType === "news" ? "latest news" : "financial data"}`
    : query || `${queryType} financial data`;

  try {
    const webResult = await executeWebSearch(searchQuery, 5);
    results.push(`## Web Search: Financial Data\n${webResult}`);
  } catch (err) {
    results.push(`Web search error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // For SEC filings, also search EDGAR directly
  if (queryType === "sec_filing" && symbol) {
    try {
      const edgarResult = await executeScrapeUrl(`https://efts.sec.gov/LATEST/search-index?q=%22${symbol}%22&dateRange=custom&startdt=2024-01-01&enddt=2025-12-31`, undefined);
      results.push(`## SEC EDGAR Results\n${edgarResult.slice(0, 3000)}`);
    } catch { /* ignore */ }
  }

  // For market overview, get index data
  if (queryType === "market_overview") {
    try {
      const marketResult = await executeWebSearch("S&P 500 Dow Jones NASDAQ today market performance", 5);
      results.push(`## Market Overview\n${marketResult}`);
    } catch { /* ignore */ }
  }

  if (results.length === 0) {
    return `No financial data found for query type: ${queryType}, symbol: ${symbol || "N/A"}. Ensure ALPHA_VANTAGE_API_KEY is set for direct API access, or try a web search.`;
  }

  return results.join("\n\n");
}

// ─── Sub-Agent ────────────────────────────────────────────────────────────────

function selectSubAgentModel(agentType: string, requested: string): { provider: string; modelName: string } {
  if (requested && requested !== "auto") return selectModelForTask(requested as ModelId, "");
  switch (agentType) {
    case "research": return process.env.GOOGLE_AI_API_KEY ? { provider: "google", modelName: "gemini-2.0-flash" } : { provider: "anthropic", modelName: "claude-sonnet-4-6" };
    case "writing": return process.env.OPENAI_API_KEY ? { provider: "openai", modelName: "gpt-4o" } : { provider: "anthropic", modelName: "claude-sonnet-4-6" };
    case "code": case "reviewer": case "data_analysis": return { provider: "anthropic", modelName: "claude-sonnet-4-6" };
    case "web_scraper": return process.env.OPENAI_API_KEY ? { provider: "openai", modelName: "gpt-4.1-mini" } : { provider: "anthropic", modelName: "claude-3.5-haiku" };
    case "planner": return process.env.OPENAI_API_KEY ? { provider: "openai", modelName: "gpt-4.1-mini" } : { provider: "anthropic", modelName: "claude-sonnet-4-6" };
    default: return { provider: "anthropic", modelName: "claude-sonnet-4-6" };
  }
}

async function createSubAgent(
  title: string, agentType: string, instructions: string,
  context: string, model: string, ctx: ToolContext
): Promise<string> {
  const subTaskId = uuidv4();
  addSubTask({ id: subTaskId, parent_task_id: ctx.taskId, title, status: "running", agent_type: agentType, created_at: new Date().toISOString() });
  const subSystemPrompt = getSubAgentSystemPrompt(agentType);
  const subModel = selectSubAgentModel(agentType, model);

  // Sub-agents get access to most tools (excluding recursive sub-agent creation beyond depth 1, and task-lifecycle tools)
  const subTools = TOOLS.filter((t) => !["complete_task", "request_user_input", "dream_machine"].includes(t.name));
  const MAX_SUB_ITERATIONS = 15; // Multi-turn: up to 15 iterations (not single-turn)

  try {
    let result = "";
    const fullPrompt = `${context ? `Context:\n${context}\n\n` : ""}Task: ${instructions}`;

    if (subModel.provider === "openai" && process.env.OPENAI_API_KEY) {
      // Multi-turn agentic loop with OpenAI
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: "system", content: subSystemPrompt },
        { role: "user", content: fullPrompt },
      ];
      const oaiTools = convertToolsToOpenAIFormat().filter(t => t.type === "function" && subTools.some(st => st.name === (t as { type: "function"; function: { name: string } }).function.name)) as Array<{ type: "function"; function: { name: string; description?: string; parameters: Record<string, unknown> } }>;
      let iterations = 0;

      while (iterations < MAX_SUB_ITERATIONS) {
        iterations++;
        const resp = await openai.chat.completions.create({
          model: subModel.modelName, max_tokens: 4096, messages, tools: oaiTools,
          // Force tool use on first iteration so sub-agent acts instead of just planning
          tool_choice: iterations === 1 ? "required" : "auto",
        });
        const msg = resp.choices[0]?.message;
        if (!msg) break;

        const text = msg.content || "";
        const tcs = (msg.tool_calls || []).filter((tc): tc is { id: string; type: "function"; function: { name: string; arguments: string } } => tc.type === "function");

        if (tcs.length === 0) {
          // No more tool calls — agent is done
          result += text;
          break;
        }

        // Add assistant message with tool calls
        messages.push({ role: "assistant", content: text || null, tool_calls: tcs.map(tc => ({ id: tc.id, type: "function" as const, function: { name: tc.function.name, arguments: tc.function.arguments } })) });

        // Execute each tool call
        for (const tc of tcs) {
          let toolInput: Record<string, unknown> = {};
          try { toolInput = JSON.parse(tc.function.arguments); } catch { /* empty */ }
          let toolResult = "";
          try {
            toolResult = await executeTool(tc.function.name as ToolName, toolInput, ctx);
          } catch (err) {
            toolResult = `Error: ${err instanceof Error ? err.message : String(err)}`;
          }
          messages.push({ role: "tool", tool_call_id: tc.id, content: toolResult.slice(0, 8000) });
        }

        if (text) result += text + "\n";
      }
    } else {
      // Multi-turn agentic loop with Anthropic
      const messages: Anthropic.MessageParam[] = [
        { role: "user", content: fullPrompt },
      ];
      let iterations = 0;

      while (iterations < MAX_SUB_ITERATIONS) {
        iterations++;
        const resp = await anthropic.messages.create({
          model: subModel.modelName, max_tokens: 4096, system: subSystemPrompt, tools: subTools, messages,
          // Force tool use on first iteration so sub-agent acts instead of just planning
          tool_choice: iterations === 1 ? { type: "any" as const } : { type: "auto" as const },
        });

        const texts = resp.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text);
        const toolBlocks = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

        if (texts.length > 0) result += texts.join("\n") + "\n";

        if (toolBlocks.length === 0) {
          // No more tool calls — agent is done
          break;
        }

        // Add assistant response
        messages.push({ role: "assistant", content: resp.content });

        // Execute each tool call and add results
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const tb of toolBlocks) {
          let toolResult = "";
          try {
            toolResult = await executeTool(tb.name as ToolName, tb.input as Record<string, unknown>, ctx);
          } catch (err) {
            toolResult = `Error: ${err instanceof Error ? err.message : String(err)}`;
          }
          toolResults.push({ type: "tool_result", tool_use_id: tb.id, content: toolResult.slice(0, 8000) });
        }
        messages.push({ role: "user", content: toolResults });

        // If model signaled end_turn without tools, break
        if (resp.stop_reason === "end_turn" && toolBlocks.length === 0) break;
      }
    }

    const trimmedResult = result.trim() || "Sub-agent completed.";
    updateSubTask(subTaskId, "completed", trimmedResult);
    return trimmedResult;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    updateSubTask(subTaskId, "failed", msg);
    return `Sub-agent failed: ${msg}`;
  }
}

// ─── Social Media Browser Automation ──────────────────────────────────────────

async function executeSocialMedia(input: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  try {
    const { executeSocialMediaAction, getSocialMediaStatus } = await import("./social-media-browser");

    const platform = input.platform as string;
    const action = input.action as string;

    // Special case: if action is "status", return platform status overview
    if (action === "status") {
      return getSocialMediaStatus();
    }

    const result = await executeSocialMediaAction(
      {
        platform: platform as import("./social-media-browser").SocialPlatform,
        action: action as import("./social-media-browser").SocialAction,
        content: input.content as string | undefined,
        hashtags: input.hashtags as string[] | undefined,
        url: input.url as string | undefined,
        title: input.title as string | undefined,
        subreddit: input.subreddit as string | undefined,
        image_path: input.image_path as string | undefined,
        query: input.query as string | undefined,
        max_results: input.max_results as number | undefined,
      },
      ctx.filesDir
    );

    // Register screenshot as task file if one was taken
    if (result.screenshot_path) {
      try {
        addTaskFile({
          id: uuidv4(),
          task_id: ctx.taskId,
          name: path.basename(result.screenshot_path),
          path: result.screenshot_path,
          mime_type: "image/png",
          size: fs.statSync(result.screenshot_path).size,
          created_at: new Date().toISOString(),
        });
      } catch { /* ignore file tracking errors */ }
    }

    const status = result.success ? "✅" : "❌";
    return `${status} ${result.message}`;
  } catch (err) {
    // If the module fails to load or any other error, try falling back to API connectors
    const platform = input.platform as string;
    const action = input.action as string;

    // Attempt fallback to API-based connector if available
    if (action === "post" && input.content) {
      const connectorActions: Record<string, { connectorId: string; action: string; params: Record<string, unknown> }> = {
        twitter: { connectorId: "twitter", action: "post_tweet", params: { text: input.content } },
        linkedin: { connectorId: "linkedin", action: "create_post", params: { text: input.content, url: input.url } },
        reddit: { connectorId: "reddit", action: "create_post", params: { title: input.title || (input.content as string).slice(0, 100), text: input.content, subreddit: input.subreddit } },
        facebook: { connectorId: "facebook", action: "create_post", params: { text: input.content, link: input.url } },
      };

      const fallback = connectorActions[platform];
      if (fallback) {
        try {
          const connResult = await connectorCall(fallback.connectorId, fallback.action, fallback.params, ctx);
          return `[Fallback to API connector] ${connResult}`;
        } catch {
          // Both browser and API failed
        }
      }
    }

    return `Social media action failed: ${err instanceof Error ? err.message : String(err)}\n\nTo enable browser-based social media posting, ensure:\n1. Playwright is installed: npm install playwright && npx playwright install chromium\n2. Platform credentials are set in .env.local (e.g., TWITTER_USERNAME, TWITTER_PASSWORD)\n\nAlternatively, configure API-based connectors in Settings → Connectors.`;
  }
}

// ─── Connector Call ───────────────────────────────────────────────────────────

async function connectorCall(connectorId: string, action: string, params: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  void ctx;
  const { getConnectorConfig } = await import("./db");
  const config = getConnectorConfig(connectorId);
  if (!config || !config.connected) return `Connector "${connectorId}" is not connected. Configure it in the Connectors page.`;
  try { return await dispatchConnectorAction(connectorId, action, params, config as Record<string, unknown>); }
  catch (err) { return `Connector error: ${err instanceof Error ? err.message : String(err)}`; }
}

async function dispatchConnectorAction(
  connectorId: string, action: string, params: Record<string, unknown>, config: Record<string, unknown>
): Promise<string> {
  // prefer OAuth token over API key for connectors that support both
  const apiKey = (config.oauth_token as string) || (config.api_key as string);
  switch (connectorId) {
    case "gmail": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "send_email") {
        const to = params.to as string;
        const subject = params.subject as string || "(no subject)";
        const body = params.body as string || "";
        const raw = Buffer.from(`To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`).toString("base64url");
        const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", headers: h, body: JSON.stringify({ raw }) });
        const d = await r.json() as { id?: string; error?: { message: string } };
        return d.id ? `Email sent (id: ${d.id})` : `Gmail error: ${d.error?.message}`;
      }
      if (action === "read_email" || action === "list_email") {
        const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10${params.query ? `&q=${encodeURIComponent(params.query as string)}` : ""}`, { headers: h });
        const d = await r.json() as { messages?: Array<{ id: string }> };
        return `Found ${(d.messages || []).length} messages. IDs: ${(d.messages || []).map((m) => m.id).join(", ")}`;
      }
      break;
    }
    case "google_drive": {
      const h = { Authorization: `Bearer ${apiKey}` };
      if (action === "list_files") {
        const r = await fetch("https://www.googleapis.com/drive/v3/files?pageSize=20&fields=files(id,name,mimeType,modifiedTime)", { headers: h });
        const d = await r.json() as { files?: Array<{ id: string; name: string; mimeType: string }> };
        return (d.files || []).map((f) => `- ${f.name} (${f.mimeType}) [${f.id}]`).join("\n") || "No files found";
      }
      if (action === "search") {
        const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`name contains '${params.query}'`)}&pageSize=10&fields=files(id,name,mimeType)`, { headers: h });
        const d = await r.json() as { files?: Array<{ id: string; name: string; mimeType: string }> };
        return (d.files || []).map((f) => `- ${f.name} [${f.id}]`).join("\n") || "No files found";
      }
      break;
    }
    case "google_sheets": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "read_sheet") {
        const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${params.spreadsheet_id}/values/${params.range || "Sheet1"}`, { headers: h });
        const d = await r.json() as { values?: string[][] };
        return JSON.stringify(d.values || [], null, 2);
      }
      if (action === "append_rows") {
        const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${params.spreadsheet_id}/values/${params.range || "Sheet1"}:append?valueInputOption=USER_ENTERED`, { method: "POST", headers: h, body: JSON.stringify({ values: params.values }) });
        const d = await r.json() as { updates?: { updatedRows: number } };
        return `Appended ${d.updates?.updatedRows ?? 0} rows.`;
      }
      break;
    }
    case "outlook": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "send_email") {
        const r = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", { method: "POST", headers: h, body: JSON.stringify({ message: { subject: params.subject, body: { contentType: "Text", content: params.body }, toRecipients: [{ emailAddress: { address: params.to } }] } }) });
        return r.status === 202 ? "Outlook email sent." : `Outlook error: ${r.status}`;
      }
      if (action === "read_email" || action === "list_email") {
        const r = await fetch("https://graph.microsoft.com/v1.0/me/messages?$top=10&$select=subject,from,receivedDateTime", { headers: h });
        const d = await r.json() as { value?: Array<{ subject: string; from?: { emailAddress?: { address: string } }; receivedDateTime: string }> };
        return (d.value || []).map((m) => `- [${m.receivedDateTime}] From: ${m.from?.emailAddress?.address} — ${m.subject}`).join("\n") || "No messages";
      }
      break;
    }
    case "slack": {
      if (action === "send_message") {
        const r = await fetch("https://slack.com/api/chat.postMessage", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ channel: params.channel || "#general", text: params.text || params.message }) });
        const d = await r.json() as { ok: boolean; error?: string }; return d.ok ? "Slack message sent." : `Slack error: ${d.error}`;
      }
      if (action === "list_channels") {
        const r = await fetch("https://slack.com/api/conversations.list?limit=20", { headers: { Authorization: `Bearer ${apiKey}` } });
        const d = await r.json() as { ok: boolean; channels?: Array<{ name: string; id: string }> };
        return d.ok ? (d.channels || []).map((c) => `#${c.name} (${c.id})`).join("\n") : "Failed to list channels";
      }
      break;
    }
    case "github": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/vnd.github.v3+json" };
      if (action === "create_issue") {
        const r = await fetch(`https://api.github.com/repos/${params.owner}/${params.repo}/issues`, { method: "POST", headers: h, body: JSON.stringify({ title: params.title, body: params.body }) });
        const d = await r.json() as { html_url?: string; message?: string }; return d.html_url ? `Issue created: ${d.html_url}` : `Error: ${d.message}`;
      }
      if (action === "list_repos") {
        const r = await fetch("https://api.github.com/user/repos?sort=updated&per_page=10", { headers: h });
        const repos = await r.json() as Array<{ full_name: string; description?: string }>;
        return repos.map((r) => `- ${r.full_name}: ${r.description || "No description"}`).join("\n");
      }
      if (action === "create_pr") {
        const r = await fetch(`https://api.github.com/repos/${params.owner}/${params.repo}/pulls`, { method: "POST", headers: h, body: JSON.stringify({ title: params.title, body: params.body, head: params.head, base: params.base || "main" }) });
        const d = await r.json() as { html_url?: string; message?: string }; return d.html_url ? `PR created: ${d.html_url}` : `Error: ${d.message}`;
      }
      if (action === "get_file") {
        const r = await fetch(`https://api.github.com/repos/${params.owner}/${params.repo}/contents/${params.path}`, { headers: h });
        const d = await r.json() as { content?: string; message?: string };
        return d.content ? Buffer.from(d.content, "base64").toString("utf-8") : `Error: ${d.message || "File not found"}`;
      }
      break;
    }
    case "linear": {
      if (action === "create_issue") {
        const r = await fetch("https://api.linear.app/graphql", { method: "POST", headers: { Authorization: apiKey, "Content-Type": "application/json" }, body: JSON.stringify({ query: `mutation CreateIssue($input: IssueCreateInput!) { issueCreate(input: $input) { issue { id title url } } }`, variables: { input: { title: params.title, description: params.description, teamId: params.team_id } } }) });
        const d = await r.json() as { data?: { issueCreate?: { issue?: { url?: string } } } };
        return d.data?.issueCreate?.issue?.url ? `Issue created: ${d.data.issueCreate.issue.url}` : "Issue creation failed";
      }
      break;
    }
    case "notion": {
      const nh = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Notion-Version": "2022-06-28" };
      if (action === "create_page") {
        const r = await fetch("https://api.notion.com/v1/pages", { method: "POST", headers: nh, body: JSON.stringify({ parent: { page_id: params.parent_id || params.database_id }, properties: { title: { title: [{ text: { content: params.title || "New Page" } }] } }, children: params.content ? [{ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: params.content } }] } }] : [] }) });
        const d = await r.json() as { url?: string }; return d.url ? `Notion page created: ${d.url}` : `Created: ${JSON.stringify(d).slice(0, 200)}`;
      }
      if (action === "search") {
        const r = await fetch("https://api.notion.com/v1/search", { method: "POST", headers: nh, body: JSON.stringify({ query: params.query, page_size: 5 }) });
        const d = await r.json() as { results?: Array<{ id: string; url?: string }> };
        return (d.results || []).map((r) => `- ${r.id}: ${r.url || "no url"}`).join("\n") || "No results";
      }
      break;
    }
    case "stripe": {
      const sh = { Authorization: `Bearer ${apiKey}` };
      if (action === "list_customers") {
        const r = await fetch("https://api.stripe.com/v1/customers?limit=10", { headers: sh });
        const d = await r.json() as { data?: Array<{ id: string; email: string; name?: string }> };
        return (d.data || []).map((c) => `- ${c.name || "Unknown"} (${c.email}) ${c.id}`).join("\n");
      }
      if (action === "list_payments") {
        const r = await fetch("https://api.stripe.com/v1/payment_intents?limit=10", { headers: sh });
        const d = await r.json() as { data?: Array<{ id: string; amount: number; currency: string; status: string }> };
        return (d.data || []).map((p) => `- ${p.id}: ${p.amount / 100} ${p.currency} (${p.status})`).join("\n");
      }
      break;
    }
    case "discord": {
      if (action === "send_message") {
        const r = await fetch(`https://discord.com/api/v10/channels/${params.channel_id}/messages`, { method: "POST", headers: { Authorization: `Bot ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ content: params.text || params.message }) });
        const d = await r.json() as { id?: string; message?: string }; return d.id ? "Discord message sent." : `Discord error: ${d.message}`;
      }
      break;
    }
    case "telegram": {
      if (action === "send_message") {
        const r = await fetch(`https://api.telegram.org/bot${apiKey}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: params.chat_id, text: params.text || params.message }) });
        const d = await r.json() as { ok: boolean; description?: string }; return d.ok ? "Telegram message sent." : `Telegram error: ${d.description}`;
      }
      break;
    }
    case "whatsapp": {
      const phoneNumberId = (JSON.parse((config.config as string) || "{}") as Record<string, string>).phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID || "";
      const waToken = apiKey || process.env.WHATSAPP_ACCESS_TOKEN || "";
      if (action === "send_message") {
        const to = (params.to as string || params.phone as string || "").replace(/\D/g, "");
        const text = (params.text || params.message) as string;
        if (!to || !text) return "WhatsApp error: missing 'to' (phone number) or 'text' parameter.";
        const r = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, { method: "POST", headers: { Authorization: `Bearer ${waToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { preview_url: true, body: text } }) });
        const d = await r.json() as { messages?: Array<{ id: string }>; error?: { message: string } };
        return d.messages?.[0]?.id ? "WhatsApp message sent." : `WhatsApp error: ${d.error?.message || r.status}`;
      }
      if (action === "send_media") {
        const to = (params.to as string || "").replace(/\D/g, "");
        const mediaType = (params.media_type as string || "image") as "image" | "audio" | "video" | "document";
        const url = params.url as string;
        if (!to || !url) return "WhatsApp error: missing 'to' or 'url' parameter.";
        const mediaObj: Record<string, string> = { link: url };
        if (params.caption) mediaObj.caption = params.caption as string;
        if (params.filename) mediaObj.filename = params.filename as string;
        const r = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, { method: "POST", headers: { Authorization: `Bearer ${waToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", to, type: mediaType, [mediaType]: mediaObj }) });
        const d = await r.json() as { messages?: Array<{ id: string }>; error?: { message: string } };
        return d.messages?.[0]?.id ? `WhatsApp ${mediaType} sent.` : `WhatsApp error: ${d.error?.message || r.status}`;
      }
      break;
    }

    // ─── Storage ──────────────────────────────────────────────────────────────
    case "onedrive": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "list_files") {
        const folder = (params.path as string) || "root";
        const r = await fetch(`https://graph.microsoft.com/v1.0/me/drive/${folder === "root" ? "root" : `items/${folder}`}/children?$select=id,name,size,lastModifiedDateTime,folder`, { headers: h });
        const d = await r.json() as { value?: Array<{ id: string; name: string; size?: number; folder?: unknown }> };
        return (d.value || []).map((f) => `- ${f.folder ? "📁" : "📄"} ${f.name}${f.size ? ` (${f.size} bytes)` : ""} [${f.id}]`).join("\n") || "No files found";
      }
      if (action === "read_file") {
        const r = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${params.file_id}/content`, { headers: h, redirect: "follow" });
        return r.ok ? await r.text() : `OneDrive error: ${r.status}`;
      }
      if (action === "write_file" || action === "upload") {
        const fileName = params.name || params.filename || "file.txt";
        const content = params.content as string || "";
        const r = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${fileName}:/content`, { method: "PUT", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "text/plain" }, body: content });
        const d = await r.json() as { id?: string; name?: string };
        return d.id ? `File uploaded: ${d.name} [${d.id}]` : `OneDrive upload error: ${r.status}`;
      }
      break;
    }
    case "dropbox": {
      if (action === "list_files") {
        const r = await fetch("https://api.dropboxapi.com/2/files/list_folder", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ path: (params.path as string) || "", limit: 25 }) });
        const d = await r.json() as { entries?: Array<{ ".tag": string; name: string; path_lower: string; size?: number }> };
        return (d.entries || []).map((e) => `- ${e[".tag"] === "folder" ? "📁" : "📄"} ${e.name}${e.size ? ` (${e.size} bytes)` : ""}`).join("\n") || "No files found";
      }
      if (action === "read_file") {
        const r = await fetch("https://content.dropboxapi.com/2/files/download", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Dropbox-API-Arg": JSON.stringify({ path: params.path }) } });
        return r.ok ? await r.text() : `Dropbox error: ${r.status}`;
      }
      if (action === "write_file" || action === "upload") {
        const r = await fetch("https://content.dropboxapi.com/2/files/upload", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Dropbox-API-Arg": JSON.stringify({ path: params.path, mode: "overwrite" }), "Content-Type": "application/octet-stream" }, body: params.content as string });
        const d = await r.json() as { name?: string; path_lower?: string };
        return d.name ? `Uploaded: ${d.path_lower}` : `Dropbox upload error: ${r.status}`;
      }
      break;
    }
    case "sharepoint": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "list_files") {
        const siteId = params.site_id as string || "root";
        const r = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root/children?$select=id,name,size,lastModifiedDateTime`, { headers: h });
        const d = await r.json() as { value?: Array<{ id: string; name: string; size?: number }> };
        return (d.value || []).map((f) => `- ${f.name}${f.size ? ` (${f.size} bytes)` : ""} [${f.id}]`).join("\n") || "No files found";
      }
      if (action === "search") {
        const r = await fetch(`https://graph.microsoft.com/v1.0/search/query`, { method: "POST", headers: h, body: JSON.stringify({ requests: [{ entityTypes: ["driveItem"], query: { queryString: params.query } }] }) });
        const d = await r.json() as { value?: Array<{ hitsContainers?: Array<{ hits?: Array<{ resource?: { name: string; webUrl: string } }> }> }> };
        const hits = d.value?.[0]?.hitsContainers?.[0]?.hits || [];
        return hits.map((h) => `- ${h.resource?.name}: ${h.resource?.webUrl}`).join("\n") || "No results";
      }
      break;
    }
    case "box": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "list_files") {
        const folderId = (params.folder_id as string) || "0";
        const r = await fetch(`https://api.box.com/2.0/folders/${folderId}/items?limit=25`, { headers: h });
        const d = await r.json() as { entries?: Array<{ type: string; id: string; name: string; size?: number }> };
        return (d.entries || []).map((e) => `- ${e.type === "folder" ? "📁" : "📄"} ${e.name} [${e.id}]`).join("\n") || "No files found";
      }
      if (action === "read_file") {
        const r = await fetch(`https://api.box.com/2.0/files/${params.file_id}/content`, { headers: h, redirect: "follow" });
        return r.ok ? await r.text() : `Box error: ${r.status}`;
      }
      if (action === "write_file" || action === "upload") {
        const boundary = "----BoxUpload" + Date.now();
        const folderId = (params.folder_id as string) || "0";
        const fileName = (params.name as string) || "file.txt";
        const content = (params.content as string) || "";
        const body = `--${boundary}\r\nContent-Disposition: form-data; name="attributes"\r\n\r\n${JSON.stringify({ name: fileName, parent: { id: folderId } })}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: text/plain\r\n\r\n${content}\r\n--${boundary}--`;
        const r = await fetch("https://upload.box.com/api/2.0/files/content", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": `multipart/form-data; boundary=${boundary}` }, body });
        const d = await r.json() as { entries?: Array<{ id: string; name: string }> };
        return d.entries?.[0] ? `Uploaded: ${d.entries[0].name} [${d.entries[0].id}]` : `Box upload error: ${r.status}`;
      }
      break;
    }

    // ─── Communication (remaining) ────────────────────────────────────────────
    case "zoom": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "create_meeting") {
        const r = await fetch("https://api.zoom.us/v2/users/me/meetings", { method: "POST", headers: h, body: JSON.stringify({ topic: params.topic || params.title || "Meeting", type: 2, start_time: params.start_time, duration: params.duration || 30, timezone: params.timezone || "UTC" }) });
        const d = await r.json() as { join_url?: string; id?: number; message?: string };
        return d.join_url ? `Meeting created: ${d.join_url} (ID: ${d.id})` : `Zoom error: ${d.message || r.status}`;
      }
      if (action === "list_meetings") {
        const r = await fetch("https://api.zoom.us/v2/users/me/meetings?page_size=10", { headers: h });
        const d = await r.json() as { meetings?: Array<{ id: number; topic: string; start_time: string; join_url: string }> };
        return (d.meetings || []).map((m) => `- ${m.topic} (${m.start_time}) — ${m.join_url}`).join("\n") || "No meetings found";
      }
      break;
    }
    case "twilio": {
      const accountSid = (params.account_sid as string) || (config.account_sid as string) || "";
      const authToken = apiKey;
      const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
      if (action === "send_sms") {
        const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, { method: "POST", headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ To: params.to as string, From: params.from as string, Body: (params.text || params.body || params.message) as string }).toString() });
        const d = await r.json() as { sid?: string; message?: string };
        return d.sid ? `SMS sent (SID: ${d.sid})` : `Twilio error: ${d.message || r.status}`;
      }
      break;
    }

    // ─── Development (remaining) ──────────────────────────────────────────────
    case "vercel": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "list_projects") {
        const r = await fetch("https://api.vercel.com/v9/projects?limit=20", { headers: h });
        const d = await r.json() as { projects?: Array<{ name: string; id: string; framework?: string }> };
        return (d.projects || []).map((p) => `- ${p.name} (${p.framework || "unknown"}) [${p.id}]`).join("\n") || "No projects";
      }
      if (action === "list_deployments") {
        const r = await fetch("https://api.vercel.com/v6/deployments?limit=10", { headers: h });
        const d = await r.json() as { deployments?: Array<{ url: string; state: string; created: number }> };
        return (d.deployments || []).map((d2) => `- ${d2.url} (${d2.state}) — ${new Date(d2.created).toISOString()}`).join("\n") || "No deployments";
      }
      if (action === "create_deployment") {
        const r = await fetch("https://api.vercel.com/v13/deployments", { method: "POST", headers: h, body: JSON.stringify({ name: params.project, target: params.target || "production", gitSource: params.gitSource }) });
        const d = await r.json() as { url?: string; id?: string };
        return d.url ? `Deployment created: https://${d.url}` : `Vercel deploy error: ${JSON.stringify(d).slice(0, 200)}`;
      }
      break;
    }
    case "gitlab": {
      const h = { "PRIVATE-TOKEN": apiKey, "Content-Type": "application/json" };
      const baseUrl = (params.base_url as string) || "https://gitlab.com";
      if (action === "list_repos" || action === "read_repo") {
        const r = await fetch(`${baseUrl}/api/v4/projects?membership=true&per_page=10&order_by=updated_at`, { headers: h });
        const d = await r.json() as Array<{ path_with_namespace: string; description?: string; web_url: string }>;
        return d.map((p) => `- ${p.path_with_namespace}: ${p.description || "No description"}`).join("\n") || "No repos";
      }
      if (action === "create_issue") {
        const projectId = encodeURIComponent(params.project as string || `${params.owner}/${params.repo}`);
        const r = await fetch(`${baseUrl}/api/v4/projects/${projectId}/issues`, { method: "POST", headers: h, body: JSON.stringify({ title: params.title, description: params.description || params.body }) });
        const d = await r.json() as { web_url?: string; message?: string };
        return d.web_url ? `Issue created: ${d.web_url}` : `GitLab error: ${d.message || JSON.stringify(d).slice(0, 200)}`;
      }
      if (action === "create_mr") {
        const projectId = encodeURIComponent(params.project as string || `${params.owner}/${params.repo}`);
        const r = await fetch(`${baseUrl}/api/v4/projects/${projectId}/merge_requests`, { method: "POST", headers: h, body: JSON.stringify({ title: params.title, description: params.description || params.body, source_branch: params.source_branch || params.head, target_branch: params.target_branch || params.base || "main" }) });
        const d = await r.json() as { web_url?: string; message?: string };
        return d.web_url ? `MR created: ${d.web_url}` : `GitLab error: ${d.message || JSON.stringify(d).slice(0, 200)}`;
      }
      break;
    }
    case "sentry": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "list_issues") {
        const org = params.organization as string || params.org as string || "";
        const project = params.project as string || "";
        const url = project ? `https://sentry.io/api/0/projects/${org}/${project}/issues/?limit=10` : `https://sentry.io/api/0/organizations/${org}/issues/?limit=10`;
        const r = await fetch(url, { headers: h });
        const d = await r.json() as Array<{ id: string; title: string; level: string; count: string; firstSeen: string }>;
        return Array.isArray(d) ? d.map((i) => `- [${i.level}] ${i.title} (${i.count}x) [${i.id}]`).join("\n") || "No issues" : `Sentry error: ${JSON.stringify(d).slice(0, 200)}`;
      }
      if (action === "get_issue") {
        const r = await fetch(`https://sentry.io/api/0/issues/${params.issue_id}/`, { headers: h });
        const d = await r.json() as { title?: string; metadata?: { value?: string }; count?: string; firstSeen?: string; lastSeen?: string };
        return d.title ? `${d.title}\nError: ${d.metadata?.value || "N/A"}\nCount: ${d.count}\nFirst: ${d.firstSeen}\nLast: ${d.lastSeen}` : `Sentry error: ${JSON.stringify(d).slice(0, 200)}`;
      }
      if (action === "resolve_issue") {
        const r = await fetch(`https://sentry.io/api/0/issues/${params.issue_id}/`, { method: "PUT", headers: h, body: JSON.stringify({ status: "resolved" }) });
        return r.ok ? "Issue resolved." : `Sentry error: ${r.status}`;
      }
      break;
    }
    case "datadog": {
      const h = { "DD-API-KEY": apiKey, "DD-APPLICATION-KEY": (params.app_key as string) || (config.app_key as string) || "", "Content-Type": "application/json" };
      if (action === "list_monitors") {
        const r = await fetch("https://api.datadoghq.com/api/v1/monitor", { headers: h });
        const d = await r.json() as Array<{ id: number; name: string; type: string; overall_state: string }>;
        return Array.isArray(d) ? d.slice(0, 10).map((m) => `- ${m.name} (${m.type}) [${m.overall_state}] id:${m.id}`).join("\n") : "No monitors found";
      }
      if (action === "query_metrics") {
        const from = Math.floor(Date.now() / 1000) - 3600;
        const to = Math.floor(Date.now() / 1000);
        const r = await fetch(`https://api.datadoghq.com/api/v1/query?from=${from}&to=${to}&query=${encodeURIComponent(params.query as string)}`, { headers: h });
        const d = await r.json() as { series?: Array<{ metric: string; pointlist: number[][] }> };
        return d.series ? d.series.map((s) => `${s.metric}: ${s.pointlist.length} data points`).join("\n") : "No data";
      }
      break;
    }

    // ─── Project Management (remaining) ───────────────────────────────────────
    case "jira": {
      const domain = (params.domain as string) || (config.domain as string) || "";
      const email = (params.email as string) || (config.email as string) || "";
      const auth = Buffer.from(`${email}:${apiKey}`).toString("base64");
      const h = { Authorization: `Basic ${auth}`, "Content-Type": "application/json", Accept: "application/json" };
      if (action === "create_issue") {
        const r = await fetch(`https://${domain}/rest/api/3/issue`, { method: "POST", headers: h, body: JSON.stringify({ fields: { project: { key: params.project_key || params.project }, summary: params.title, description: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: (params.description || params.body || "") as string }] }] }, issuetype: { name: (params.issue_type as string) || "Task" } } }) });
        const d = await r.json() as { key?: string; self?: string; errors?: Record<string, string> };
        return d.key ? `Issue created: ${d.key} — https://${domain}/browse/${d.key}` : `Jira error: ${JSON.stringify(d.errors || d).slice(0, 300)}`;
      }
      if (action === "list_issues") {
        const jql = (params.jql as string) || `project = "${params.project_key || params.project}" ORDER BY updated DESC`;
        const r = await fetch(`https://${domain}/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=10`, { headers: h });
        const d = await r.json() as { issues?: Array<{ key: string; fields: { summary: string; status: { name: string } } }> };
        return (d.issues || []).map((i) => `- ${i.key}: ${i.fields.summary} [${i.fields.status.name}]`).join("\n") || "No issues found";
      }
      if (action === "update_issue") {
        const r = await fetch(`https://${domain}/rest/api/3/issue/${params.issue_key}`, { method: "PUT", headers: h, body: JSON.stringify({ fields: params.fields || { summary: params.title } }) });
        return r.status === 204 ? `Issue ${params.issue_key} updated.` : `Jira error: ${r.status}`;
      }
      break;
    }
    case "asana": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "list_tasks") {
        const project = params.project as string || params.project_gid as string;
        const url = project ? `https://app.asana.com/api/1.0/projects/${project}/tasks?limit=20` : "https://app.asana.com/api/1.0/tasks?assignee=me&workspace=" + (params.workspace as string || "") + "&limit=20";
        const r = await fetch(url, { headers: h });
        const d = await r.json() as { data?: Array<{ gid: string; name: string }> };
        return (d.data || []).map((t) => `- ${t.name} [${t.gid}]`).join("\n") || "No tasks found";
      }
      if (action === "create_task") {
        const r = await fetch("https://app.asana.com/api/1.0/tasks", { method: "POST", headers: h, body: JSON.stringify({ data: { name: params.title || params.name, notes: params.description || params.notes || "", projects: params.project ? [params.project] : [], workspace: params.workspace } }) });
        const d = await r.json() as { data?: { gid: string; name: string; permalink_url?: string } };
        return d.data ? `Task created: ${d.data.name} [${d.data.gid}]${d.data.permalink_url ? " — " + d.data.permalink_url : ""}` : `Asana error: ${JSON.stringify(d).slice(0, 200)}`;
      }
      if (action === "update_task") {
        const r = await fetch(`https://app.asana.com/api/1.0/tasks/${params.task_gid || params.task_id}`, { method: "PUT", headers: h, body: JSON.stringify({ data: { name: params.title || params.name, completed: params.completed, notes: params.notes } }) });
        return r.ok ? `Task ${params.task_gid || params.task_id} updated.` : `Asana error: ${r.status}`;
      }
      break;
    }
    case "clickup": {
      const h = { Authorization: apiKey, "Content-Type": "application/json" };
      if (action === "list_tasks") {
        const listId = params.list_id as string;
        const r = await fetch(`https://api.clickup.com/api/v2/list/${listId}/task?page=0`, { headers: h });
        const d = await r.json() as { tasks?: Array<{ id: string; name: string; status: { status: string } }> };
        return (d.tasks || []).map((t) => `- ${t.name} [${t.status.status}] (${t.id})`).join("\n") || "No tasks found";
      }
      if (action === "create_task") {
        const r = await fetch(`https://api.clickup.com/api/v2/list/${params.list_id}/task`, { method: "POST", headers: h, body: JSON.stringify({ name: params.title || params.name, description: params.description || params.body }) });
        const d = await r.json() as { id?: string; name?: string; url?: string };
        return d.id ? `Task created: ${d.name} — ${d.url}` : `ClickUp error: ${JSON.stringify(d).slice(0, 200)}`;
      }
      if (action === "update_task") {
        const r = await fetch(`https://api.clickup.com/api/v2/task/${params.task_id}`, { method: "PUT", headers: h, body: JSON.stringify({ name: params.title, status: params.status, description: params.description }) });
        return r.ok ? `Task ${params.task_id} updated.` : `ClickUp error: ${r.status}`;
      }
      break;
    }
    case "monday": {
      const h = { Authorization: apiKey, "Content-Type": "application/json" };
      if (action === "list_boards") {
        const r = await fetch("https://api.monday.com/v2", { method: "POST", headers: h, body: JSON.stringify({ query: "{ boards(limit:10) { id name state } }" }) });
        const d = await r.json() as { data?: { boards?: Array<{ id: string; name: string; state: string }> } };
        return (d.data?.boards || []).map((b) => `- ${b.name} (${b.state}) [${b.id}]`).join("\n") || "No boards found";
      }
      if (action === "create_item") {
        const r = await fetch("https://api.monday.com/v2", { method: "POST", headers: h, body: JSON.stringify({ query: `mutation { create_item(board_id: ${params.board_id}, item_name: "${(params.name || params.title || "").toString().replace(/"/g, '\\"')}") { id } }` }) });
        const d = await r.json() as { data?: { create_item?: { id: string } } };
        return d.data?.create_item?.id ? `Item created (id: ${d.data.create_item.id})` : `Monday error: ${JSON.stringify(d).slice(0, 200)}`;
      }
      break;
    }
    case "confluence": {
      const domain = (params.domain as string) || (config.domain as string) || "";
      const email = (params.email as string) || (config.email as string) || "";
      const auth = Buffer.from(`${email}:${apiKey}`).toString("base64");
      const h = { Authorization: `Basic ${auth}`, "Content-Type": "application/json", Accept: "application/json" };
      if (action === "search") {
        const r = await fetch(`https://${domain}/wiki/rest/api/content/search?cql=${encodeURIComponent(`text ~ "${params.query}"`)}&limit=10`, { headers: h });
        const d = await r.json() as { results?: Array<{ id: string; title: string; type: string; _links?: { webui?: string } }> };
        return (d.results || []).map((p) => `- ${p.title} (${p.type}) — https://${domain}/wiki${p._links?.webui || ""}`).join("\n") || "No results";
      }
      if (action === "create_page") {
        const r = await fetch(`https://${domain}/wiki/rest/api/content`, { method: "POST", headers: h, body: JSON.stringify({ type: "page", title: params.title, space: { key: params.space_key }, body: { storage: { value: (params.content as string) || "", representation: "storage" } } }) });
        const d = await r.json() as { id?: string; title?: string; _links?: { webui?: string } };
        return d.id ? `Page created: ${d.title} — https://${domain}/wiki${d._links?.webui || ""}` : `Confluence error: ${JSON.stringify(d).slice(0, 200)}`;
      }
      if (action === "read_page") {
        const r = await fetch(`https://${domain}/wiki/rest/api/content/${params.page_id}?expand=body.storage`, { headers: h });
        const d = await r.json() as { title?: string; body?: { storage?: { value: string } } };
        return d.title ? `# ${d.title}\n${d.body?.storage?.value || ""}` : `Confluence error: ${JSON.stringify(d).slice(0, 200)}`;
      }
      break;
    }

    // ─── CRM (remaining) ─────────────────────────────────────────────────────
    case "hubspot": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "list_contacts") {
        const r = await fetch("https://api.hubapi.com/crm/v3/objects/contacts?limit=10&properties=email,firstname,lastname", { headers: h });
        const d = await r.json() as { results?: Array<{ id: string; properties: { email?: string; firstname?: string; lastname?: string } }> };
        return (d.results || []).map((c) => `- ${c.properties.firstname || ""} ${c.properties.lastname || ""} <${c.properties.email || "N/A"}> [${c.id}]`).join("\n") || "No contacts";
      }
      if (action === "create_contact") {
        const r = await fetch("https://api.hubapi.com/crm/v3/objects/contacts", { method: "POST", headers: h, body: JSON.stringify({ properties: { email: params.email, firstname: params.firstname || params.first_name, lastname: params.lastname || params.last_name, company: params.company } }) });
        const d = await r.json() as { id?: string; message?: string };
        return d.id ? `Contact created (id: ${d.id})` : `HubSpot error: ${d.message || JSON.stringify(d).slice(0, 200)}`;
      }
      if (action === "list_deals") {
        const r = await fetch("https://api.hubapi.com/crm/v3/objects/deals?limit=10&properties=dealname,amount,dealstage", { headers: h });
        const d = await r.json() as { results?: Array<{ id: string; properties: { dealname?: string; amount?: string; dealstage?: string } }> };
        return (d.results || []).map((d2) => `- ${d2.properties.dealname} ($${d2.properties.amount || "0"}) [${d2.properties.dealstage}]`).join("\n") || "No deals";
      }
      if (action === "create_deal") {
        const r = await fetch("https://api.hubapi.com/crm/v3/objects/deals", { method: "POST", headers: h, body: JSON.stringify({ properties: { dealname: params.name || params.title, amount: params.amount, dealstage: params.stage || "appointmentscheduled" } }) });
        const d = await r.json() as { id?: string };
        return d.id ? `Deal created (id: ${d.id})` : `HubSpot error: ${JSON.stringify(d).slice(0, 200)}`;
      }
      break;
    }
    case "salesforce": {
      const instanceUrl = (params.instance_url as string) || (config.instance_url as string) || "";
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "list_contacts") {
        const r = await fetch(`${instanceUrl}/services/data/v59.0/query?q=${encodeURIComponent("SELECT Id, Name, Email FROM Contact ORDER BY LastModifiedDate DESC LIMIT 10")}`, { headers: h });
        const d = await r.json() as { records?: Array<{ Id: string; Name: string; Email?: string }> };
        return (d.records || []).map((c) => `- ${c.Name} <${c.Email || "N/A"}> [${c.Id}]`).join("\n") || "No contacts";
      }
      if (action === "create_contact") {
        const r = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/Contact`, { method: "POST", headers: h, body: JSON.stringify({ FirstName: params.first_name, LastName: params.last_name, Email: params.email }) });
        const d = await r.json() as { id?: string; success?: boolean };
        return d.success ? `Contact created (id: ${d.id})` : `Salesforce error: ${JSON.stringify(d).slice(0, 200)}`;
      }
      if (action === "create_opportunity") {
        const r = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/Opportunity`, { method: "POST", headers: h, body: JSON.stringify({ Name: params.name, StageName: params.stage || "Prospecting", CloseDate: params.close_date || new Date().toISOString().slice(0, 10), Amount: params.amount }) });
        const d = await r.json() as { id?: string; success?: boolean };
        return d.success ? `Opportunity created (id: ${d.id})` : `Salesforce error: ${JSON.stringify(d).slice(0, 200)}`;
      }
      break;
    }
    case "zendesk": {
      const subdomain = (params.subdomain as string) || (config.subdomain as string) || "";
      const email = (params.email as string) || (config.email as string) || "";
      const auth = Buffer.from(`${email}/token:${apiKey}`).toString("base64");
      const h = { Authorization: `Basic ${auth}`, "Content-Type": "application/json" };
      if (action === "list_tickets") {
        const r = await fetch(`https://${subdomain}.zendesk.com/api/v2/tickets?page[size]=10`, { headers: h });
        const d = await r.json() as { tickets?: Array<{ id: number; subject: string; status: string; created_at: string }> };
        return (d.tickets || []).map((t) => `- #${t.id}: ${t.subject} [${t.status}]`).join("\n") || "No tickets";
      }
      if (action === "create_ticket") {
        const r = await fetch(`https://${subdomain}.zendesk.com/api/v2/tickets`, { method: "POST", headers: h, body: JSON.stringify({ ticket: { subject: params.subject || params.title, comment: { body: params.body || params.description }, priority: params.priority || "normal" } }) });
        const d = await r.json() as { ticket?: { id: number } };
        return d.ticket ? `Ticket #${d.ticket.id} created.` : `Zendesk error: ${JSON.stringify(d).slice(0, 200)}`;
      }
      if (action === "update_ticket") {
        const r = await fetch(`https://${subdomain}.zendesk.com/api/v2/tickets/${params.ticket_id}`, { method: "PUT", headers: h, body: JSON.stringify({ ticket: { status: params.status, comment: params.comment ? { body: params.comment } : undefined } }) });
        return r.ok ? `Ticket #${params.ticket_id} updated.` : `Zendesk error: ${r.status}`;
      }
      break;
    }

    // ─── Data (remaining) ────────────────────────────────────────────────────
    case "airtable": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "list_records") {
        const r = await fetch(`https://api.airtable.com/v0/${params.base_id}/${encodeURIComponent(params.table as string || params.table_name as string)}?maxRecords=20`, { headers: h });
        const d = await r.json() as { records?: Array<{ id: string; fields: Record<string, unknown> }> };
        return (d.records || []).map((rec) => `- [${rec.id}] ${JSON.stringify(rec.fields)}`).join("\n") || "No records";
      }
      if (action === "create_record") {
        const r = await fetch(`https://api.airtable.com/v0/${params.base_id}/${encodeURIComponent(params.table as string || params.table_name as string)}`, { method: "POST", headers: h, body: JSON.stringify({ fields: params.fields || {} }) });
        const d = await r.json() as { id?: string };
        return d.id ? `Record created (id: ${d.id})` : `Airtable error: ${JSON.stringify(d).slice(0, 200)}`;
      }
      if (action === "update_record") {
        const r = await fetch(`https://api.airtable.com/v0/${params.base_id}/${encodeURIComponent(params.table as string || params.table_name as string)}/${params.record_id}`, { method: "PATCH", headers: h, body: JSON.stringify({ fields: params.fields || {} }) });
        return r.ok ? `Record ${params.record_id} updated.` : `Airtable error: ${r.status}`;
      }
      if (action === "search") {
        const formula = `SEARCH("${(params.query as string || "").replace(/"/g, '\\"')}", ARRAYJOIN(RECORD_ID()))`;
        const r = await fetch(`https://api.airtable.com/v0/${params.base_id}/${encodeURIComponent(params.table as string || params.table_name as string)}?filterByFormula=${encodeURIComponent(params.formula as string || formula)}&maxRecords=10`, { headers: h });
        const d = await r.json() as { records?: Array<{ id: string; fields: Record<string, unknown> }> };
        return (d.records || []).map((rec) => `- [${rec.id}] ${JSON.stringify(rec.fields)}`).join("\n") || "No matching records";
      }
      break;
    }
    case "supabase": {
      const supabaseUrl = (params.url as string) || (config.url as string) || (config.supabase_url as string) || "";
      const h = { apikey: apiKey, Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "list_tables") {
        const r = await fetch(`${supabaseUrl}/rest/v1/?limit=0`, { headers: h });
        return r.ok ? `Tables accessible. Use execute_query with specific table name to query data.` : `Supabase error: ${r.status}`;
      }
      if (action === "execute_query") {
        const table = params.table as string;
        const select = (params.select as string) || "*";
        const limit = (params.limit as number) || 10;
        let url = `${supabaseUrl}/rest/v1/${table}?select=${select}&limit=${limit}`;
        if (params.filter) url += `&${params.filter}`;
        const r = await fetch(url, { headers: { ...h, Prefer: "return=representation" } });
        const d = await r.json();
        return JSON.stringify(d, null, 2).slice(0, 2000);
      }
      break;
    }
    case "google_docs": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "create_doc") {
        const r = await fetch("https://docs.googleapis.com/v1/documents", { method: "POST", headers: h, body: JSON.stringify({ title: params.title || "Untitled" }) });
        const d = await r.json() as { documentId?: string; title?: string };
        return d.documentId ? `Doc created: "${d.title}" — https://docs.google.com/document/d/${d.documentId}/edit` : `Google Docs error: ${JSON.stringify(d).slice(0, 200)}`;
      }
      if (action === "read_doc") {
        const r = await fetch(`https://docs.googleapis.com/v1/documents/${params.document_id}`, { headers: h });
        const d = await r.json() as { title?: string; body?: { content?: Array<{ paragraph?: { elements?: Array<{ textRun?: { content: string } }> } }> } };
        const text = (d.body?.content || []).map((b) => (b.paragraph?.elements || []).map((e) => e.textRun?.content || "").join("")).join("") || "";
        return `# ${d.title || "Untitled"}\n\n${text}`;
      }
      if (action === "update_doc") {
        const requests = params.requests || [{ insertText: { location: { index: 1 }, text: (params.content as string) || "" } }];
        const r = await fetch(`https://docs.googleapis.com/v1/documents/${params.document_id}:batchUpdate`, { method: "POST", headers: h, body: JSON.stringify({ requests }) });
        return r.ok ? `Document ${params.document_id} updated.` : `Google Docs error: ${r.status}`;
      }
      break;
    }

    // ─── Productivity (remaining) ─────────────────────────────────────────────
    case "figma": {
      const h = { "X-Figma-Token": apiKey };
      if (action === "list_files") {
        const teamId = params.team_id as string || params.project_id as string || "";
        const r = await fetch(`https://api.figma.com/v1/teams/${teamId}/projects`, { headers: h });
        const d = await r.json() as { projects?: Array<{ id: string; name: string }> };
        return (d.projects || []).map((p) => `- ${p.name} [${p.id}]`).join("\n") || "No projects found";
      }
      if (action === "get_file") {
        const r = await fetch(`https://api.figma.com/v1/files/${params.file_key}`, { headers: h });
        const d = await r.json() as { name?: string; lastModified?: string; thumbnailUrl?: string };
        return d.name ? `File: ${d.name}\nLast modified: ${d.lastModified}\nThumbnail: ${d.thumbnailUrl}` : `Figma error: ${JSON.stringify(d).slice(0, 200)}`;
      }
      if (action === "post_comment") {
        const r = await fetch(`https://api.figma.com/v1/files/${params.file_key}/comments`, { method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify({ message: params.message || params.comment }) });
        const d = await r.json() as { id?: string };
        return d.id ? `Comment posted (id: ${d.id})` : `Figma error: ${JSON.stringify(d).slice(0, 200)}`;
      }
      break;
    }
    case "calendly": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "list_events") {
        const r = await fetch("https://api.calendly.com/scheduled_events?count=10&status=active&sort=start_time:desc", { headers: h });
        const d = await r.json() as { collection?: Array<{ uri: string; name: string; start_time: string; end_time: string; status: string }> };
        return (d.collection || []).map((e) => `- ${e.name} (${e.start_time} → ${e.end_time}) [${e.status}]`).join("\n") || "No events found";
      }
      if (action === "get_scheduling_link") {
        const r = await fetch("https://api.calendly.com/users/me", { headers: h });
        const d = await r.json() as { resource?: { scheduling_url?: string; name?: string } };
        return d.resource?.scheduling_url ? `Scheduling link for ${d.resource.name}: ${d.resource.scheduling_url}` : `Calendly error: ${JSON.stringify(d).slice(0, 200)}`;
      }
      break;
    }
    case "wordpress": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      const siteUrl = (params.site_url as string) || (config.site_url as string) || "";
      if (action === "list_posts") {
        const url = siteUrl ? `${siteUrl}/wp-json/wp/v2/posts?per_page=10` : "https://public-api.wordpress.com/rest/v1.1/me/posts?number=10";
        const r = await fetch(url, { headers: h });
        const d = await r.json();
        if (Array.isArray(d)) return d.map((p: { id: number; title: { rendered: string }; status: string }) => `- ${p.title.rendered} [${p.status}] (id: ${p.id})`).join("\n") || "No posts";
        return `Posts: ${JSON.stringify(d).slice(0, 500)}`;
      }
      if (action === "create_post") {
        const url = siteUrl ? `${siteUrl}/wp-json/wp/v2/posts` : "https://public-api.wordpress.com/rest/v1.1/me/posts/new";
        const r = await fetch(url, { method: "POST", headers: h, body: JSON.stringify({ title: params.title, content: params.content, status: params.status || "draft" }) });
        const d = await r.json() as { id?: number; link?: string };
        return d.id ? `Post created (id: ${d.id})${d.link ? ` — ${d.link}` : ""}` : `WordPress error: ${JSON.stringify(d).slice(0, 200)}`;
      }
      break;
    }
    case "webflow": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "accept-version": "1.0.0" };
      if (action === "list_sites") {
        const r = await fetch("https://api.webflow.com/v2/sites", { headers: h });
        const d = await r.json() as { sites?: Array<{ id: string; displayName: string; shortName: string }> };
        return (d.sites || []).map((s) => `- ${s.displayName} (${s.shortName}) [${s.id}]`).join("\n") || "No sites found";
      }
      if (action === "create_item") {
        const r = await fetch(`https://api.webflow.com/v2/collections/${params.collection_id}/items`, { method: "POST", headers: h, body: JSON.stringify({ fieldData: params.fields || { name: params.name, slug: params.slug } }) });
        const d = await r.json() as { id?: string };
        return d.id ? `Item created (id: ${d.id})` : `Webflow error: ${JSON.stringify(d).slice(0, 200)}`;
      }
      if (action === "publish_site") {
        const r = await fetch(`https://api.webflow.com/v2/sites/${params.site_id}/publish`, { method: "POST", headers: h, body: JSON.stringify({ domains: params.domains || [] }) });
        return r.ok ? "Site published." : `Webflow error: ${r.status}`;
      }
      break;
    }
    case "wix": {
      const h = { Authorization: apiKey, "Content-Type": "application/json" };
      if (action === "list_pages") {
        const r = await fetch("https://www.wixapis.com/pages/v1/pages", { headers: h });
        const d = await r.json() as { pages?: Array<{ id: string; title: string; url: string }> };
        return (d.pages || []).map((p) => `- ${p.title} (${p.url}) [${p.id}]`).join("\n") || "No pages found";
      }
      break;
    }

    // ─── AI Services (remaining) ──────────────────────────────────────────────
    case "openai": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "chat_completion") {
        const r = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: h, body: JSON.stringify({ model: (params.model as string) || "gpt-4o-mini", messages: params.messages || [{ role: "user", content: params.prompt || params.message }], max_tokens: (params.max_tokens as number) || 1000 }) });
        const d = await r.json() as { choices?: Array<{ message: { content: string } }> };
        return d.choices?.[0]?.message?.content || `OpenAI error: ${JSON.stringify(d).slice(0, 200)}`;
      }
      if (action === "image_generation") {
        const r = await fetch("https://api.openai.com/v1/images/generations", { method: "POST", headers: h, body: JSON.stringify({ model: "dall-e-3", prompt: params.prompt, n: 1, size: (params.size as string) || "1024x1024" }) });
        const d = await r.json() as { data?: Array<{ url: string }> };
        return d.data?.[0]?.url || `OpenAI image error: ${JSON.stringify(d).slice(0, 200)}`;
      }
      if (action === "embedding") {
        const r = await fetch("https://api.openai.com/v1/embeddings", { method: "POST", headers: h, body: JSON.stringify({ model: "text-embedding-3-small", input: params.text || params.input }) });
        const d = await r.json() as { data?: Array<{ embedding: number[] }> };
        return d.data?.[0] ? `Embedding generated (${d.data[0].embedding.length} dimensions)` : `OpenAI error: ${JSON.stringify(d).slice(0, 200)}`;
      }
      break;
    }
    case "huggingface": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "inference") {
        const model = (params.model as string) || "meta-llama/Meta-Llama-3-8B-Instruct";
        const r = await fetch(`https://router.huggingface.co/hf-inference/models/${model}`, { method: "POST", headers: h, body: JSON.stringify({ inputs: params.inputs || params.prompt || params.text }) });
        const d = await r.json();
        return Array.isArray(d) ? JSON.stringify(d[0], null, 2).slice(0, 1000) : JSON.stringify(d, null, 2).slice(0, 1000);
      }
      if (action === "list_models" || action === "search_models") {
        const query = (params.query as string) || "text-generation";
        const r = await fetch(`https://huggingface.co/api/models?search=${encodeURIComponent(query)}&limit=10&sort=likes`, { headers: h });
        const d = await r.json() as Array<{ id: string; likes: number; downloads: number }>;
        return Array.isArray(d) ? d.map((m) => `- ${m.id} (❤️ ${m.likes}, ⬇️ ${m.downloads})`).join("\n") : "No models found";
      }
      break;
    }
    case "elevenlabs": {
      const h = { "xi-api-key": apiKey, "Content-Type": "application/json" };
      if (action === "list_voices") {
        const r = await fetch("https://api.elevenlabs.io/v1/voices", { headers: h });
        const d = await r.json() as { voices?: Array<{ voice_id: string; name: string; category: string }> };
        return (d.voices || []).map((v) => `- ${v.name} (${v.category}) [${v.voice_id}]`).join("\n") || "No voices found";
      }
      if (action === "text_to_speech") {
        const voiceId = (params.voice_id as string) || "21m00Tcm4TlvDq8ikWAM";
        const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, { method: "POST", headers: h, body: JSON.stringify({ text: params.text, model_id: params.model_id || "eleven_multilingual_v2" }) });
        return r.ok ? `Audio generated (${r.headers.get("content-length") || "?"} bytes). Voice: ${voiceId}` : `ElevenLabs error: ${r.status}`;
      }
      break;
    }
    case "replicate": {
      // Enhanced Replicate connector — uses the smart model router
      const { searchModels: replicateSearch, runReplicateTask } = await import("./replicate");
      if (action === "run_model" || action === "run" || action === "generate") {
        try {
          const result = await runReplicateTask({
            prompt: (params.prompt as string) || "",
            model: (params.model as string) || (params.version as string) || undefined,
            params: (params.input as Record<string, unknown>) || params,
            filesDir: `/tmp/replicate-${Date.now()}`,
            token: apiKey,
          });
          const parts = [`Model: ${result.model}`, `Type: ${result.taskType}`, `Status: ${result.prediction.status}`];
          if (result.files.length > 0) parts.push(`Files: ${result.files.map(f => f.filename).join(", ")}`);
          if (result.textOutput) parts.push(`Output: ${result.textOutput.slice(0, 500)}`);
          return parts.join("\n");
        } catch (err) {
          return `Replicate error: ${err instanceof Error ? err.message : String(err)}`;
        }
      }
      if (action === "list_models" || action === "search" || action === "search_models") {
        try {
          const query = (params.query as string) || (params.search as string) || "popular";
          const models = await replicateSearch(query, apiKey);
          return models.slice(0, 15).map(m => `- ${m.owner}/${m.name} (${(m.run_count || 0).toLocaleString()} runs): ${(m.description || "").slice(0, 100)}`).join("\n") || "No models found";
        } catch (err) {
          return `Replicate search error: ${err instanceof Error ? err.message : String(err)}`;
        }
      }
      break;
    }

    // ─── Finance (remaining) ──────────────────────────────────────────────────
    case "shopify": {
      const storeDomain = (params.store as string) || (config.store as string) || "";
      const h = { "X-Shopify-Access-Token": apiKey, "Content-Type": "application/json" };
      if (action === "list_orders") {
        const r = await fetch(`https://${storeDomain}/admin/api/2024-01/orders.json?limit=10&status=any`, { headers: h });
        const d = await r.json() as { orders?: Array<{ id: number; name: string; total_price: string; financial_status: string; created_at: string }> };
        return (d.orders || []).map((o) => `- ${o.name}: $${o.total_price} (${o.financial_status}) — ${o.created_at}`).join("\n") || "No orders";
      }
      if (action === "list_customers") {
        const r = await fetch(`https://${storeDomain}/admin/api/2024-01/customers.json?limit=10`, { headers: h });
        const d = await r.json() as { customers?: Array<{ id: number; email: string; first_name: string; last_name: string }> };
        return (d.customers || []).map((c) => `- ${c.first_name} ${c.last_name} <${c.email}> (id: ${c.id})`).join("\n") || "No customers";
      }
      if (action === "create_product") {
        const r = await fetch(`https://${storeDomain}/admin/api/2024-01/products.json`, { method: "POST", headers: h, body: JSON.stringify({ product: { title: params.title, body_html: params.description, vendor: params.vendor, product_type: params.type } }) });
        const d = await r.json() as { product?: { id: number; title: string } };
        return d.product ? `Product created: ${d.product.title} (id: ${d.product.id})` : `Shopify error: ${JSON.stringify(d).slice(0, 200)}`;
      }
      if (action === "list_blogs") {
        const r = await fetch(`https://${storeDomain}/admin/api/2024-01/blogs.json`, { headers: h });
        const d = await r.json() as { blogs?: Array<{ id: number; title: string; handle: string }> };
        return (d.blogs || []).map(b => `- ${b.title} (handle: ${b.handle}) [blog_id: ${b.id}]`).join("\n") || "No blogs found. Create a blog in Shopify admin first.";
      }
      if (action === "list_articles" || action === "list_blog_posts") {
        let blogId = (params.blog_id as string) || "";
        if (!blogId) {
          // Auto-resolve to first blog
          const br = await fetch(`https://${storeDomain}/admin/api/2024-01/blogs.json`, { headers: h });
          const blogs = await br.json() as { blogs?: Array<{ id: number }> };
          if (blogs.blogs && blogs.blogs.length > 0) blogId = String(blogs.blogs[0].id);
          else return "No blogs found.";
        }
        const r = await fetch(`https://${storeDomain}/admin/api/2024-01/blogs/${blogId}/articles.json?limit=20`, { headers: h });
        const d = await r.json() as { articles?: Array<{ id: number; title: string; author: string; created_at: string; published_at: string | null }> };
        return (d.articles || []).map(a => `- ${a.title} by ${a.author} [${a.published_at ? "published" : "draft"}] (id: ${a.id}) — ${a.created_at}`).join("\n") || "No articles";
      }
      if (action === "create_blog_post" || action === "create_article" || action === "publish_blog") {
        let blogId = (params.blog_id as string) || "";
        if (!blogId) {
          const br = await fetch(`https://${storeDomain}/admin/api/2024-01/blogs.json`, { headers: h });
          const blogs = await br.json() as { blogs?: Array<{ id: number; title: string }> };
          if (blogs.blogs && blogs.blogs.length > 0) {
            blogId = String(blogs.blogs[0].id);
          } else {
            return "No blogs found on Shopify. Create a blog section in your Shopify admin first (Online Store → Blog Posts).";
          }
        }
        const articlePayload = {
          article: {
            title: params.title as string || "Untitled",
            body_html: (params.body_html || params.content || params.body) as string || "",
            author: (params.author as string) || "Ottomatron",
            tags: (params.tags as string) || "",
            published: params.published !== false && params.draft !== true,
            summary_html: (params.summary || params.excerpt) as string || undefined,
            image: params.image_url ? { src: params.image_url as string, alt: (params.image_alt || params.title) as string } : undefined,
          },
        };
        const r = await fetch(`https://${storeDomain}/admin/api/2024-01/blogs/${blogId}/articles.json`, {
          method: "POST", headers: h, body: JSON.stringify(articlePayload),
        });
        const d = await r.json() as { article?: { id: number; title: string; handle: string; published_at: string | null } };
        if (d.article) {
          const url = `https://${storeDomain}/blogs/${blogId}/${d.article.handle}`;
          return `✅ Blog post published!\nTitle: ${d.article.title}\nID: ${d.article.id}\nStatus: ${d.article.published_at ? "Published" : "Draft"}\nURL: ${url}`;
        }
        return `Shopify error: ${JSON.stringify(d).slice(0, 400)}`;
      }
      if (action === "update_article" || action === "update_blog_post") {
        let blogId = (params.blog_id as string) || "";
        const articleId = (params.article_id as string) || "";
        if (!articleId) return "Error: article_id required.";
        if (!blogId) {
          const br = await fetch(`https://${storeDomain}/admin/api/2024-01/blogs.json`, { headers: h });
          const blogs = await br.json() as { blogs?: Array<{ id: number }> };
          if (blogs.blogs && blogs.blogs.length > 0) blogId = String(blogs.blogs[0].id);
          else return "No blogs found.";
        }
        const updatePayload: Record<string, unknown> = { article: { id: Number(articleId) } };
        const article = updatePayload.article as Record<string, unknown>;
        if (params.title) article.title = params.title;
        if (params.body_html || params.content) article.body_html = params.body_html || params.content;
        if (params.tags) article.tags = params.tags;
        if (params.published !== undefined) article.published = params.published;
        const r = await fetch(`https://${storeDomain}/admin/api/2024-01/blogs/${blogId}/articles/${articleId}.json`, { method: "PUT", headers: h, body: JSON.stringify(updatePayload) });
        const d = await r.json() as { article?: { id: number; title: string } };
        return d.article ? `Article updated: ${d.article.title} (id: ${d.article.id})` : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      if (action === "list_pages") {
        const r = await fetch(`https://${storeDomain}/admin/api/2024-01/pages.json?limit=20`, { headers: h });
        const d = await r.json() as { pages?: Array<{ id: number; title: string; handle: string; published_at: string | null }> };
        return (d.pages || []).map(p => `- ${p.title} (/${p.handle}) [${p.published_at ? "live" : "draft"}] (id: ${p.id})`).join("\n") || "No pages";
      }
      if (action === "get_shop") {
        const r = await fetch(`https://${storeDomain}/admin/api/2024-01/shop.json`, { headers: h });
        const d = await r.json() as { shop?: { name: string; domain: string; plan_name: string; email: string } };
        return d.shop ? `Shop: ${d.shop.name}\nDomain: ${d.shop.domain}\nPlan: ${d.shop.plan_name}\nEmail: ${d.shop.email}` : "Error fetching shop info";
      }
      break;
    }

    // ─── Marketing (remaining) ────────────────────────────────────────────────
    case "mailchimp": {
      // Mailchimp API key format: key-dc (e.g., abc123-us21)
      const dc = apiKey.includes("-") ? apiKey.split("-").pop() : "us1";
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "list_subscribers") {
        const r = await fetch(`https://${dc}.api.mailchimp.com/3.0/lists/${params.list_id}/members?count=10`, { headers: h });
        const d = await r.json() as { members?: Array<{ email_address: string; status: string; full_name: string }> };
        return (d.members || []).map((m) => `- ${m.full_name || "Unknown"} <${m.email_address}> [${m.status}]`).join("\n") || "No subscribers";
      }
      if (action === "add_subscriber") {
        const r = await fetch(`https://${dc}.api.mailchimp.com/3.0/lists/${params.list_id}/members`, { method: "POST", headers: h, body: JSON.stringify({ email_address: params.email, status: params.status || "subscribed", merge_fields: { FNAME: params.first_name || "", LNAME: params.last_name || "" } }) });
        const d = await r.json() as { id?: string; email_address?: string };
        return d.id ? `Subscriber added: ${d.email_address}` : `Mailchimp error: ${JSON.stringify(d).slice(0, 200)}`;
      }
      break;
    }
    case "klaviyo": {
      const h = { Authorization: `Klaviyo-API-Key ${apiKey}`, "Content-Type": "application/json", revision: "2024-02-15" };
      if (action === "list_profiles") {
        const r = await fetch("https://a.klaviyo.com/api/profiles/?page[size]=10", { headers: h });
        const d = await r.json() as { data?: Array<{ id: string; attributes: { email?: string; first_name?: string; last_name?: string } }> };
        return (d.data || []).map((p) => `- ${p.attributes.first_name || ""} ${p.attributes.last_name || ""} <${p.attributes.email || "N/A"}> [${p.id}]`).join("\n") || "No profiles";
      }
      if (action === "send_campaign") {
        return "Campaign sending via Klaviyo API requires creating a campaign, adding content, and scheduling. Use the Klaviyo dashboard for full campaign management, or call with action='create_campaign' with the required params.";
      }
      break;
    }

    // ─── Social Media ─────────────────────────────────────────────────────────
    case "twitter": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "post_tweet") {
        const text = (params.text || params.message || params.tweet) as string;
        if (!text) return "Twitter error: missing 'text' parameter.";
        const r = await fetch("https://api.x.com/2/tweets", { method: "POST", headers: h, body: JSON.stringify({ text }) });
        const d = await r.json() as { data?: { id: string; text: string }; errors?: Array<{ message: string }> };
        return d.data?.id ? `Tweet posted (id: ${d.data.id}): "${d.data.text.slice(0, 100)}"` : `Twitter error: ${d.errors?.[0]?.message || r.status}`;
      }
      if (action === "search_tweets") {
        const query = params.query as string;
        const r = await fetch(`https://api.x.com/2/tweets/search/recent?query=${encodeURIComponent(query)}&max_results=${params.max_results || 10}&tweet.fields=created_at,author_id,public_metrics`, { headers: h });
        const d = await r.json() as { data?: Array<{ id: string; text: string; created_at?: string; public_metrics?: { like_count: number; retweet_count: number } }> };
        return (d.data || []).map((t) => `- [${t.created_at || ""}] ${t.text.slice(0, 200)} (❤️${t.public_metrics?.like_count || 0} 🔁${t.public_metrics?.retweet_count || 0}) [${t.id}]`).join("\n") || "No tweets found";
      }
      if (action === "read_timeline") {
        const userId = params.user_id as string;
        if (!userId) return "Twitter error: missing 'user_id' parameter.";
        const r = await fetch(`https://api.x.com/2/users/${userId}/tweets?max_results=10&tweet.fields=created_at,public_metrics`, { headers: h });
        const d = await r.json() as { data?: Array<{ id: string; text: string; created_at?: string }> };
        return (d.data || []).map((t) => `- [${t.created_at || ""}] ${t.text.slice(0, 200)} [${t.id}]`).join("\n") || "No tweets found";
      }
      if (action === "get_user") {
        const username = (params.username as string || "").replace("@", "");
        const r = await fetch(`https://api.x.com/2/users/by/username/${username}?user.fields=description,public_metrics,profile_image_url`, { headers: h });
        const d = await r.json() as { data?: { id: string; name: string; username: string; description?: string; public_metrics?: { followers_count: number; following_count: number; tweet_count: number } } };
        if (!d.data) return "User not found";
        const u = d.data;
        return `@${u.username} (${u.name})\nID: ${u.id}\nBio: ${u.description || "N/A"}\nFollowers: ${u.public_metrics?.followers_count || 0} | Following: ${u.public_metrics?.following_count || 0} | Tweets: ${u.public_metrics?.tweet_count || 0}`;
      }
      break;
    }
    case "reddit": {
      // Reddit uses script app auth: client_id:client_secret:username:password
      const parts = apiKey.split(":");
      const [clientId, clientSecret, username, password] = parts.length >= 4 ? parts : [apiKey, "", "", ""];
      // Get OAuth token
      let redditToken = apiKey;
      if (clientSecret && username) {
        try {
          const tokenRes = await fetch("https://www.reddit.com/api/v1/access_token", {
            method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
            body: `grant_type=password&username=${username}&password=${password}`,
          });
          const tokenData = await tokenRes.json() as { access_token?: string };
          if (tokenData.access_token) redditToken = tokenData.access_token;
        } catch { /* use raw key */ }
      }
      const h = { Authorization: `Bearer ${redditToken}`, "User-Agent": "Ottomatron/1.0" };
      if (action === "create_post") {
        const r = await fetch("https://oauth.reddit.com/api/submit", { method: "POST", headers: { ...h, "Content-Type": "application/x-www-form-urlencoded" },
          body: `kind=${params.url ? "link" : "self"}&sr=${params.subreddit}&title=${encodeURIComponent(params.title as string)}&${params.url ? `url=${encodeURIComponent(params.url as string)}` : `text=${encodeURIComponent((params.text || params.body || "") as string)}`}` });
        const d = await r.json() as { json?: { data?: { name: string; url: string } }; jquery?: unknown };
        return d.json?.data?.url ? `Reddit post created: ${d.json.data.url}` : `Reddit post submitted (check subreddit for approval).`;
      }
      if (action === "comment") {
        const r = await fetch("https://oauth.reddit.com/api/comment", { method: "POST", headers: { ...h, "Content-Type": "application/x-www-form-urlencoded" },
          body: `thing_id=${params.parent_id || params.post_id}&text=${encodeURIComponent(params.text as string)}` });
        const d = await r.json() as { json?: { data?: { things?: Array<{ data: { name: string } }> } } };
        return d.json?.data?.things?.[0] ? "Reddit comment posted." : "Reddit comment submitted.";
      }
      if (action === "search") {
        const r = await fetch(`https://oauth.reddit.com/search?q=${encodeURIComponent(params.query as string)}&limit=${params.limit || 10}&sort=${params.sort || "relevance"}`, { headers: h });
        const d = await r.json() as { data?: { children?: Array<{ data: { title: string; subreddit: string; score: number; num_comments: number; permalink: string } }> } };
        return (d.data?.children || []).map((c) => `- r/${c.data.subreddit}: ${c.data.title} (⬆${c.data.score} 💬${c.data.num_comments}) https://reddit.com${c.data.permalink}`).join("\n") || "No results";
      }
      if (action === "read_subreddit") {
        const sub = (params.subreddit as string || "").replace(/^r\//, "");
        const r = await fetch(`https://oauth.reddit.com/r/${sub}/hot?limit=${params.limit || 10}`, { headers: h });
        const d = await r.json() as { data?: { children?: Array<{ data: { title: string; score: number; num_comments: number; permalink: string; selftext?: string } }> } };
        return (d.data?.children || []).map((c) => `- ${c.data.title} (⬆${c.data.score} 💬${c.data.num_comments})\n  ${c.data.selftext ? c.data.selftext.slice(0, 100) + "..." : ""}\n  https://reddit.com${c.data.permalink}`).join("\n") || "No posts";
      }
      break;
    }
    case "facebook": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      const pageId = (params.page_id as string) || "me";
      if (action === "create_post") {
        const body: Record<string, string> = { message: (params.text || params.message) as string };
        if (params.link) body.link = params.link as string;
        const r = await fetch(`https://graph.facebook.com/v21.0/${pageId}/feed`, { method: "POST", headers: h, body: JSON.stringify(body) });
        const d = await r.json() as { id?: string; error?: { message: string } };
        return d.id ? `Facebook post created (id: ${d.id})` : `Facebook error: ${d.error?.message || r.status}`;
      }
      if (action === "read_feed") {
        const r = await fetch(`https://graph.facebook.com/v21.0/${pageId}/feed?limit=10&fields=message,created_time,likes.summary(true),comments.summary(true)`, { headers: { Authorization: `Bearer ${apiKey}` } });
        const d = await r.json() as { data?: Array<{ id: string; message?: string; created_time: string; likes?: { summary: { total_count: number } }; comments?: { summary: { total_count: number } } }> };
        return (d.data || []).map((p) => `- [${p.created_time}] ${(p.message || "(no text)").slice(0, 150)} (❤️${p.likes?.summary?.total_count || 0} 💬${p.comments?.summary?.total_count || 0}) [${p.id}]`).join("\n") || "No posts";
      }
      if (action === "get_insights") {
        const r = await fetch(`https://graph.facebook.com/v21.0/${pageId}/insights?metric=page_impressions,page_engaged_users,page_fans&period=day`, { headers: { Authorization: `Bearer ${apiKey}` } });
        const d = await r.json() as { data?: Array<{ name: string; values: Array<{ value: number }> }> };
        return (d.data || []).map((m) => `- ${m.name}: ${m.values?.[0]?.value ?? "N/A"}`).join("\n") || "No insights";
      }
      break;
    }
    case "youtube": {
      const baseUrl = "https://www.googleapis.com/youtube/v3";
      if (action === "search_videos") {
        const r = await fetch(`${baseUrl}/search?part=snippet&type=video&q=${encodeURIComponent(params.query as string)}&maxResults=${params.max_results || 10}&key=${apiKey}`);
        const d = await r.json() as { items?: Array<{ id: { videoId: string }; snippet: { title: string; channelTitle: string; publishedAt: string; description: string } }> };
        return (d.items || []).map((v) => `- ${v.snippet.title} by ${v.snippet.channelTitle} (${v.snippet.publishedAt.slice(0, 10)})\n  https://youtube.com/watch?v=${v.id.videoId}\n  ${v.snippet.description.slice(0, 100)}`).join("\n") || "No videos found";
      }
      if (action === "get_video") {
        const r = await fetch(`${baseUrl}/videos?part=snippet,statistics&id=${params.video_id}&key=${apiKey}`);
        const d = await r.json() as { items?: Array<{ snippet: { title: string; channelTitle: string; description: string; publishedAt: string }; statistics: { viewCount: string; likeCount: string; commentCount: string } }> };
        const v = d.items?.[0];
        if (!v) return "Video not found";
        return `Title: ${v.snippet.title}\nChannel: ${v.snippet.channelTitle}\nPublished: ${v.snippet.publishedAt}\nViews: ${v.statistics.viewCount} | Likes: ${v.statistics.likeCount} | Comments: ${v.statistics.commentCount}\n\n${v.snippet.description.slice(0, 500)}`;
      }
      if (action === "read_comments") {
        const r = await fetch(`${baseUrl}/commentThreads?part=snippet&videoId=${params.video_id}&maxResults=${params.max_results || 10}&key=${apiKey}`);
        const d = await r.json() as { items?: Array<{ snippet: { topLevelComment: { snippet: { authorDisplayName: string; textDisplay: string; likeCount: number; publishedAt: string } } } }> };
        return (d.items || []).map((c) => { const s = c.snippet.topLevelComment.snippet; return `- @${s.authorDisplayName}: ${s.textDisplay.slice(0, 200)} (❤️${s.likeCount})`; }).join("\n") || "No comments";
      }
      if (action === "get_channel") {
        const channelParam = (params.channel_id as string) ? `id=${params.channel_id}` : `forHandle=${(params.handle || params.username) as string}`;
        const r = await fetch(`${baseUrl}/channels?part=snippet,statistics&${channelParam}&key=${apiKey}`);
        const d = await r.json() as { items?: Array<{ snippet: { title: string; description: string }; statistics: { subscriberCount: string; videoCount: string; viewCount: string } }> };
        const ch = d.items?.[0];
        if (!ch) return "Channel not found";
        return `${ch.snippet.title}\nSubscribers: ${ch.statistics.subscriberCount} | Videos: ${ch.statistics.videoCount} | Views: ${ch.statistics.viewCount}\n\n${ch.snippet.description.slice(0, 300)}`;
      }
      break;
    }
    case "instagram": {
      const h = { Authorization: `Bearer ${apiKey}` };
      const igAccountId = (params.account_id || params.ig_user_id) as string || "";
      if (action === "read_feed") {
        const r = await fetch(`https://graph.facebook.com/v21.0/${igAccountId || "me"}/media?fields=id,caption,timestamp,like_count,comments_count,media_type,permalink&limit=10`, { headers: h });
        const d = await r.json() as { data?: Array<{ id: string; caption?: string; timestamp: string; like_count?: number; comments_count?: number; permalink: string }> };
        return (d.data || []).map((p) => `- [${p.timestamp.slice(0, 10)}] ${(p.caption || "(no caption)").slice(0, 100)} (❤️${p.like_count || 0} 💬${p.comments_count || 0}) ${p.permalink}`).join("\n") || "No posts";
      }
      if (action === "get_insights") {
        const r = await fetch(`https://graph.facebook.com/v21.0/${igAccountId}/insights?metric=impressions,reach,follower_count&period=day`, { headers: h });
        const d = await r.json() as { data?: Array<{ name: string; values: Array<{ value: number }> }> };
        return (d.data || []).map((m) => `- ${m.name}: ${m.values?.[0]?.value ?? "N/A"}`).join("\n") || "No insights";
      }
      break;
    }
    case "linkedin": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-Restli-Protocol-Version": "2.0.0" };
      if (action === "create_post" || action === "share_article") {
        const authorUrn = (params.author_urn || params.person_urn) as string || `urn:li:person:me`;
        const body = {
          author: authorUrn, lifecycleState: "PUBLISHED", visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
          specificContent: { "com.linkedin.ugc.ShareContent": { shareCommentary: { text: (params.text || params.message) as string }, shareMediaCategory: params.url ? "ARTICLE" : "NONE",
            ...(params.url ? { media: [{ status: "READY", originalUrl: params.url }] } : {}),
          } },
        };
        const r = await fetch("https://api.linkedin.com/v2/ugcPosts", { method: "POST", headers: h, body: JSON.stringify(body) });
        return r.status === 201 ? "LinkedIn post created." : `LinkedIn error: ${r.status} ${await r.text().catch(() => "")}`;
      }
      if (action === "get_profile") {
        const r = await fetch("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${apiKey}` } });
        const d = await r.json() as { name?: string; email?: string; sub?: string };
        return d.name ? `${d.name} (${d.email || "N/A"})` : `LinkedIn profile data: ${JSON.stringify(d).slice(0, 500)}`;
      }
      break;
    }
    case "tiktok": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "search_videos") {
        const r = await fetch("https://open.tiktokapis.com/v2/research/video/query/?fields=id,video_description,like_count,comment_count,view_count,create_time", { method: "POST", headers: h,
          body: JSON.stringify({ query: { and: [{ operation: "IN", field_name: "keyword", field_values: [(params.query as string)] }] }, max_count: params.max_results || 10 }) });
        const d = await r.json() as { data?: { videos?: Array<{ id: string; video_description: string; like_count: number; view_count: number }> } };
        return (d.data?.videos || []).map((v) => `- ${v.video_description.slice(0, 150)} (❤️${v.like_count} 👁${v.view_count}) [${v.id}]`).join("\n") || "No videos found";
      }
      break;
    }
    case "pinterest": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "create_pin") {
        const body = { board_id: params.board_id, title: params.title, description: params.description || "",
          media_source: { source_type: "image_url", url: params.image_url } };
        const r = await fetch("https://api.pinterest.com/v5/pins", { method: "POST", headers: h, body: JSON.stringify(body) });
        const d = await r.json() as { id?: string; message?: string };
        return d.id ? `Pinterest pin created (id: ${d.id})` : `Pinterest error: ${d.message || r.status}`;
      }
      if (action === "list_boards") {
        const r = await fetch("https://api.pinterest.com/v5/boards?page_size=25", { headers: h });
        const d = await r.json() as { items?: Array<{ id: string; name: string; pin_count: number }> };
        return (d.items || []).map((b) => `- ${b.name} (${b.pin_count} pins) [${b.id}]`).join("\n") || "No boards found";
      }
      if (action === "search_pins") {
        const r = await fetch(`https://api.pinterest.com/v5/search/pins?query=${encodeURIComponent(params.query as string)}&page_size=10`, { headers: h });
        const d = await r.json() as { items?: Array<{ id: string; title?: string; description?: string }> };
        return (d.items || []).map((p) => `- ${p.title || "(untitled)"}: ${(p.description || "").slice(0, 100)} [${p.id}]`).join("\n") || "No pins found";
      }
      break;
    }

    case "postgres": {
      return `PostgreSQL connector requires a direct database connection. Connection string stored. Use the execute_code tool with Python's psycopg2 to query: import psycopg2; conn = psycopg2.connect("${apiKey}"); ...`;
    }
    case "snowflake": {
      return `Snowflake connector requires the Snowflake SDK. Use execute_code with Python: import snowflake.connector; conn = snowflake.connector.connect(account=..., user=..., password=...)`;
    }

    // ─── AI Video Generation ────────────────────────────────────────────────
    case "luma": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "generate_video" || action === "create_generation") {
        const body: Record<string, unknown> = { prompt: params.prompt, model: (params.model as string) || "ray-3", aspect_ratio: (params.aspect_ratio as string) || "16:9" };
        if (params.keyframes) body.keyframes = params.keyframes;
        if (params.loop !== undefined) body.loop = params.loop;
        const r = await fetch("https://api.lumalabs.ai/dream-machine/v1/generations", { method: "POST", headers: h, body: JSON.stringify(body) });
        const d = await r.json() as { id?: string; state?: string };
        return d.id ? `Luma generation started: ${d.id} (state: ${d.state})` : `Luma error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      if (action === "get_generation") {
        const r = await fetch(`https://api.lumalabs.ai/dream-machine/v1/generations/${params.generation_id}`, { headers: h });
        const d = await r.json() as { id?: string; state?: string; assets?: { video?: string } };
        return JSON.stringify({ id: d.id, state: d.state, video_url: d.assets?.video }, null, 2);
      }
      if (action === "list_generations") {
        const r = await fetch("https://api.lumalabs.ai/dream-machine/v1/generations?limit=10", { headers: h });
        const d = await r.json() as { generations?: Array<{ id: string; state: string; created_at: string }> };
        return (d.generations || []).map(g => `- ${g.id}: ${g.state} (${g.created_at})`).join("\n") || "No generations";
      }
      if (action === "generate_image") {
        const r = await fetch("https://api.lumalabs.ai/dream-machine/v1/generations/image", { method: "POST", headers: h, body: JSON.stringify({ prompt: params.prompt, model: (params.model as string) || "photon-1", aspect_ratio: (params.aspect_ratio as string) || "1:1" }) });
        const d = await r.json() as { id?: string; state?: string };
        return d.id ? `Luma image generation: ${d.id} (state: ${d.state})` : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      break;
    }
    case "runway": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-Runway-Version": "2024-11-06" };
      if (action === "generate_video" || action === "text_to_video") {
        const r = await fetch("https://api.dev.runwayml.com/v1/image_to_video", { method: "POST", headers: h, body: JSON.stringify({ model: "gen3a_turbo", promptImage: params.image_url, promptText: params.prompt, duration: (params.duration as number) || 5, ratio: (params.ratio as string) || "16:9" }) });
        const d = await r.json() as { id?: string; status?: string };
        return d.id ? `Runway task created: ${d.id} (status: ${d.status})` : `Runway error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      if (action === "get_task") {
        const r = await fetch(`https://api.dev.runwayml.com/v1/tasks/${params.task_id}`, { headers: h });
        const d = await r.json() as { id?: string; status?: string; output?: string[] };
        return JSON.stringify({ id: d.id, status: d.status, outputs: d.output }, null, 2);
      }
      break;
    }
    case "kling": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "generate_video" || action === "text_to_video") {
        const r = await fetch("https://api.klingai.com/v1/videos/text2video", { method: "POST", headers: h, body: JSON.stringify({ prompt: params.prompt, negative_prompt: params.negative_prompt || "", cfg_scale: (params.cfg_scale as number) || 0.5, mode: (params.mode as string) || "std", aspect_ratio: (params.aspect_ratio as string) || "16:9", duration: (params.duration as string) || "5" }) });
        const d = await r.json() as { data?: { task_id: string } };
        return d.data?.task_id ? `Kling task: ${d.data.task_id}` : `Kling error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      if (action === "image_to_video") {
        const r = await fetch("https://api.klingai.com/v1/videos/image2video", { method: "POST", headers: h, body: JSON.stringify({ prompt: params.prompt, image_url: params.image_url, mode: (params.mode as string) || "std", duration: (params.duration as string) || "5" }) });
        const d = await r.json() as { data?: { task_id: string } };
        return d.data?.task_id ? `Kling i2v task: ${d.data.task_id}` : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      if (action === "get_task") {
        const r = await fetch(`https://api.klingai.com/v1/videos/text2video/${params.task_id}`, { headers: h });
        const d = await r.json();
        return JSON.stringify(d, null, 2).slice(0, 1000);
      }
      break;
    }
    case "pika": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "generate_video") {
        const r = await fetch("https://api.pika.art/v1/generate", { method: "POST", headers: h, body: JSON.stringify({ prompt: params.prompt, style: params.style || "default", aspect_ratio: params.aspect_ratio || "16:9", duration: params.duration || 3 }) });
        const d = await r.json() as { id?: string; status?: string };
        return d.id ? `Pika generation: ${d.id} (${d.status})` : `Pika error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      if (action === "get_generation") {
        const r = await fetch(`https://api.pika.art/v1/generate/${params.id}`, { headers: h });
        const d = await r.json();
        return JSON.stringify(d, null, 2).slice(0, 500);
      }
      break;
    }
    case "minimax_video": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "generate_video") {
        const r = await fetch("https://api.minimaxi.chat/v1/video_generation", { method: "POST", headers: h, body: JSON.stringify({ model: "video-01", prompt: params.prompt }) });
        const d = await r.json() as { task_id?: string };
        return d.task_id ? `MiniMax video task: ${d.task_id}` : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      if (action === "get_task") {
        const r = await fetch(`https://api.minimaxi.chat/v1/query/video_generation?task_id=${params.task_id}`, { headers: h });
        const d = await r.json();
        return JSON.stringify(d, null, 2).slice(0, 500);
      }
      break;
    }
    case "synthesia": {
      const h = { Authorization: apiKey, "Content-Type": "application/json" };
      if (action === "create_video") {
        const r = await fetch("https://api.synthesia.io/v2/videos", { method: "POST", headers: h, body: JSON.stringify({ title: params.title || "Generated Video", input: [{ scriptText: params.script || params.text, avatar: (params.avatar as string) || "anna_costume1_cameraA", background: (params.background as string) || "green_screen" }], visibility: "private" }) });
        const d = await r.json() as { id?: string; status?: string };
        return d.id ? `Synthesia video: ${d.id} (${d.status})` : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      if (action === "list_videos") {
        const r = await fetch("https://api.synthesia.io/v2/videos?limit=10", { headers: h });
        const d = await r.json() as { videos?: Array<{ id: string; title: string; status: string }> };
        return (d.videos || []).map(v => `- ${v.title}: ${v.status} [${v.id}]`).join("\n") || "No videos";
      }
      if (action === "list_avatars") {
        const r = await fetch("https://api.synthesia.io/v2/avatars", { headers: h });
        const d = await r.json() as { avatars?: Array<{ id: string; name: string }> };
        return (d.avatars || []).map(a => `- ${a.name} [${a.id}]`).join("\n") || "No avatars";
      }
      break;
    }
    case "heygen": {
      const h = { "X-Api-Key": apiKey, "Content-Type": "application/json" };
      if (action === "create_video") {
        const r = await fetch("https://api.heygen.com/v2/video/generate", { method: "POST", headers: h, body: JSON.stringify({ video_inputs: [{ character: { type: "avatar", avatar_id: (params.avatar_id as string) || "Angela-inTshirt-20220820", avatar_style: "normal" }, voice: { type: "text", input_text: params.text || params.script, voice_id: (params.voice_id as string) || "1bd001e7e50f421d891986aad5c1e683" } }], dimension: { width: 1920, height: 1080 } }) });
        const d = await r.json() as { data?: { video_id: string } };
        return d.data?.video_id ? `HeyGen video: ${d.data.video_id}` : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      if (action === "get_video") {
        const r = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${params.video_id}`, { headers: h });
        const d = await r.json() as { data?: { status: string; video_url?: string } };
        return JSON.stringify(d.data, null, 2);
      }
      if (action === "list_avatars") {
        const r = await fetch("https://api.heygen.com/v2/avatars", { headers: h });
        const d = await r.json() as { data?: { avatars: Array<{ avatar_id: string; avatar_name: string }> } };
        return (d.data?.avatars || []).slice(0, 20).map(a => `- ${a.avatar_name} [${a.avatar_id}]`).join("\n") || "No avatars";
      }
      break;
    }
    case "d_id": {
      const h = { Authorization: `Basic ${apiKey}`, "Content-Type": "application/json" };
      if (action === "create_talk") {
        const r = await fetch("https://api.d-id.com/talks", { method: "POST", headers: h, body: JSON.stringify({ source_url: params.source_url || "https://d-id-public-bucket.s3.us-west-2.amazonaws.com/alice.jpg", script: { type: "text", input: params.text || params.script, provider: { type: "microsoft", voice_id: (params.voice_id as string) || "en-US-JennyNeural" } } }) });
        const d = await r.json() as { id?: string; status?: string };
        return d.id ? `D-ID talk: ${d.id} (${d.status})` : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      if (action === "get_talk") {
        const r = await fetch(`https://api.d-id.com/talks/${params.talk_id}`, { headers: h });
        const d = await r.json() as { id?: string; status?: string; result_url?: string };
        return JSON.stringify({ id: d.id, status: d.status, url: d.result_url }, null, 2);
      }
      break;
    }

    // ─── AI Image Generation ────────────────────────────────────────────────
    case "stability": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" };
      if (action === "generate_image" || action === "text_to_image") {
        const r = await fetch("https://api.stability.ai/v2beta/stable-image/generate/sd3", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "multipart/form-data" }, body: JSON.stringify({ prompt: params.prompt, negative_prompt: params.negative_prompt || "", aspect_ratio: (params.aspect_ratio as string) || "1:1", output_format: "png" }) });
        if (r.ok) { const d = await r.json() as { image?: string }; return d.image ? `Image generated (base64, ${d.image.length} chars)` : "Image generated"; }
        return `Stability error: ${r.status} ${await r.text().then(t => t.slice(0, 200))}`;
      }
      if (action === "upscale") {
        const r = await fetch("https://api.stability.ai/v2beta/stable-image/upscale/fast", { method: "POST", headers: h, body: JSON.stringify({ image: params.image }) });
        return r.ok ? "Image upscaled successfully" : `Stability upscale error: ${r.status}`;
      }
      break;
    }
    case "midjourney": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "imagine" || action === "generate_image") {
        const r = await fetch("https://api.mymidjourney.ai/api/v1/midjourney/imagine", { method: "POST", headers: h, body: JSON.stringify({ prompt: params.prompt }) });
        const d = await r.json() as { messageId?: string; success?: boolean };
        return d.success ? `Midjourney job submitted: ${d.messageId}` : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      if (action === "get_result") {
        const r = await fetch(`https://api.mymidjourney.ai/api/v1/midjourney/message/${params.message_id}`, { headers: h });
        const d = await r.json();
        return JSON.stringify(d, null, 2).slice(0, 500);
      }
      break;
    }
    case "ideogram": {
      const h = { "Api-Key": apiKey, "Content-Type": "application/json" };
      if (action === "generate_image" || action === "generate") {
        const r = await fetch("https://api.ideogram.ai/generate", { method: "POST", headers: h, body: JSON.stringify({ image_request: { prompt: params.prompt, model: (params.model as string) || "V_2", aspect_ratio: (params.aspect_ratio as string) || "ASPECT_1_1", magic_prompt_option: "AUTO" } }) });
        const d = await r.json() as { data?: Array<{ url: string }> };
        return d.data?.[0]?.url ? `Image: ${d.data[0].url}` : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      break;
    }
    case "flux": {
      const h = { "x-key": apiKey, "Content-Type": "application/json" };
      if (action === "generate_image" || action === "generate") {
        const r = await fetch("https://api.bfl.ml/v1/flux-pro-1.1", { method: "POST", headers: h, body: JSON.stringify({ prompt: params.prompt, width: (params.width as number) || 1024, height: (params.height as number) || 768 }) });
        const d = await r.json() as { id?: string };
        return d.id ? `Flux task: ${d.id}` : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      if (action === "get_result") {
        const r = await fetch(`https://api.bfl.ml/v1/get_result?id=${params.id}`, { headers: h });
        const d = await r.json() as { status?: string; result?: { sample?: string } };
        return JSON.stringify({ status: d.status, image_url: d.result?.sample }, null, 2);
      }
      break;
    }
    case "leonardo": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "generate_image" || action === "generate") {
        const r = await fetch("https://cloud.leonardo.ai/api/rest/v1/generations", { method: "POST", headers: h, body: JSON.stringify({ prompt: params.prompt, modelId: (params.model_id as string) || "6b645e3a-d64f-4341-a6d8-7a3690fbf042", width: (params.width as number) || 1024, height: (params.height as number) || 768, num_images: (params.num_images as number) || 1 }) });
        const d = await r.json() as { sdGenerationJob?: { generationId: string } };
        return d.sdGenerationJob ? `Leonardo job: ${d.sdGenerationJob.generationId}` : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      if (action === "get_generation") {
        const r = await fetch(`https://cloud.leonardo.ai/api/rest/v1/generations/${params.generation_id}`, { headers: h });
        const d = await r.json() as { generations_by_pk?: { status: string; generated_images: Array<{ url: string }> } };
        return JSON.stringify({ status: d.generations_by_pk?.status, images: d.generations_by_pk?.generated_images?.map(i => i.url) }, null, 2);
      }
      break;
    }
    case "clipdrop": {
      const h = { "x-api-key": apiKey };
      if (action === "text_to_image" || action === "generate_image") {
        const formData = new FormData();
        formData.append("prompt", (params.prompt as string) || "");
        const r = await fetch("https://clipdrop-api.co/text-to-image/v1", { method: "POST", headers: h, body: formData });
        return r.ok ? `Image generated (${r.headers.get("content-length") || "?"} bytes)` : `ClipDrop error: ${r.status}`;
      }
      if (action === "remove_background") {
        return `ClipDrop background removal: POST image to https://clipdrop-api.co/remove-background/v1 with x-api-key header`;
      }
      break;
    }
    case "fal": {
      const h = { Authorization: `Key ${apiKey}`, "Content-Type": "application/json" };
      if (action === "generate" || action === "run") {
        const model = (params.model as string) || "fal-ai/fast-sdxl";
        const r = await fetch(`https://fal.run/${model}`, { method: "POST", headers: h, body: JSON.stringify({ prompt: params.prompt, image_size: params.image_size || "landscape_16_9", num_images: (params.num_images as number) || 1, ...((params.input as Record<string, unknown>) || {}) }) });
        const d = await r.json() as { images?: Array<{ url: string }> };
        return d.images?.[0]?.url ? `Image: ${d.images[0].url}` : JSON.stringify(d, null, 2).slice(0, 500);
      }
      break;
    }
    case "together_image": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "generate_image" || action === "generate") {
        const r = await fetch("https://api.together.xyz/v1/images/generations", { method: "POST", headers: h, body: JSON.stringify({ model: (params.model as string) || "black-forest-labs/FLUX.1-schnell-Free", prompt: params.prompt, width: (params.width as number) || 1024, height: (params.height as number) || 768, n: (params.n as number) || 1 }) });
        const d = await r.json() as { data?: Array<{ url: string }> };
        return d.data?.[0]?.url ? `Image: ${d.data[0].url}` : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      break;
    }

    // ─── AI Audio / Music ───────────────────────────────────────────────────
    case "suno": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "generate_music" || action === "generate") {
        const r = await fetch("https://studio-api.suno.ai/api/external/generate/", { method: "POST", headers: h, body: JSON.stringify({ topic: params.prompt || params.topic, tags: params.tags || params.genre || "pop", title: params.title || "" }) });
        const d = await r.json() as { id?: string; clips?: Array<{ id: string }> };
        return d.id || d.clips?.[0]?.id ? `Suno generation: ${d.id || d.clips?.[0]?.id}` : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      if (action === "get_clip") {
        const r = await fetch(`https://studio-api.suno.ai/api/external/clips/?ids=${params.id}`, { headers: h });
        const d = await r.json();
        return JSON.stringify(d, null, 2).slice(0, 500);
      }
      break;
    }
    case "udio": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "generate_music" || action === "generate") {
        const r = await fetch("https://www.udio.com/api/v1/generate", { method: "POST", headers: h, body: JSON.stringify({ prompt: params.prompt, seed: params.seed || -1 }) });
        const d = await r.json() as { track_ids?: string[] };
        return d.track_ids ? `Udio tracks: ${d.track_ids.join(", ")}` : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      break;
    }
    case "mubert": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "generate_music" || action === "generate") {
        const r = await fetch("https://api.mubert.com/v2/TTMRecordTrack", { method: "POST", headers: h, body: JSON.stringify({ method: "TTMRecordTrack", params: { pat: apiKey, prompt: params.prompt, duration: (params.duration as number) || 30, mode: "track" } }) });
        const d = await r.json() as { data?: { tasks?: Array<{ download_link: string }> } };
        return d.data?.tasks?.[0]?.download_link ? `Music: ${d.data.tasks[0].download_link}` : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      break;
    }

    // ─── AI Speech / Transcription ──────────────────────────────────────────
    case "assemblyai": {
      const h = { Authorization: apiKey, "Content-Type": "application/json" };
      if (action === "transcribe") {
        const r = await fetch("https://api.assemblyai.com/v2/transcript", { method: "POST", headers: h, body: JSON.stringify({ audio_url: params.audio_url, language_code: (params.language as string) || "en" }) });
        const d = await r.json() as { id?: string; status?: string };
        return d.id ? `Transcription started: ${d.id} (${d.status})` : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      if (action === "get_transcript") {
        const r = await fetch(`https://api.assemblyai.com/v2/transcript/${params.transcript_id}`, { headers: h });
        const d = await r.json() as { status?: string; text?: string };
        return d.status === "completed" ? (d.text || "").slice(0, 2000) : `Status: ${d.status}`;
      }
      break;
    }
    case "deepgram": {
      const h = { Authorization: `Token ${apiKey}`, "Content-Type": "application/json" };
      if (action === "transcribe") {
        const r = await fetch("https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true", { method: "POST", headers: h, body: JSON.stringify({ url: params.audio_url }) });
        const d = await r.json() as { results?: { channels: Array<{ alternatives: Array<{ transcript: string }> }> } };
        return d.results?.channels?.[0]?.alternatives?.[0]?.transcript || `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      break;
    }
    case "whisper_api": {
      const h = { Authorization: `Bearer ${apiKey}` };
      if (action === "transcribe") {
        const formData = new FormData();
        formData.append("model", "whisper-1");
        formData.append("file", params.audio_url as string);
        const r = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: h, body: formData });
        const d = await r.json() as { text?: string };
        return d.text || `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      break;
    }
    case "playht": {
      const h = { Authorization: `Bearer ${apiKey}`, "X-User-Id": (params.user_id as string) || "", "Content-Type": "application/json" };
      if (action === "text_to_speech") {
        const r = await fetch("https://api.play.ht/api/v2/tts/stream", { method: "POST", headers: h, body: JSON.stringify({ text: params.text, voice: (params.voice as string) || "s3://voice-cloning-zero-shot/775ae416-49bb-4fb6-bd45-740f205d20a1/sadfemalesad/manifest.json", output_format: "mp3" }) });
        return r.ok ? `Audio stream generated (${r.headers.get("content-length") || "streaming"} bytes)` : `PlayHT error: ${r.status}`;
      }
      if (action === "list_voices") {
        const r = await fetch("https://api.play.ht/api/v2/voices", { headers: h });
        const d = await r.json() as Array<{ id: string; name: string; language: string }>;
        return Array.isArray(d) ? d.slice(0, 15).map(v => `- ${v.name} (${v.language}) [${v.id}]`).join("\n") : "No voices";
      }
      break;
    }
    case "resemble": {
      const h = { Authorization: `Token ${apiKey}`, "Content-Type": "application/json" };
      if (action === "text_to_speech" || action === "synthesize") {
        const r = await fetch("https://app.resemble.ai/api/v2/projects/${params.project_id || 'default'}/clips", { method: "POST", headers: h, body: JSON.stringify({ title: params.title || "Generated Clip", body: params.text, voice_uuid: params.voice_id, is_public: false }) });
        const d = await r.json() as { item?: { uuid: string; status: string } };
        return d.item ? `Resemble clip: ${d.item.uuid} (${d.item.status})` : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      break;
    }
    case "cartesia": {
      const h = { "X-API-Key": apiKey, "Content-Type": "application/json", "Cartesia-Version": "2024-06-10" };
      if (action === "text_to_speech" || action === "synthesize") {
        const r = await fetch("https://api.cartesia.ai/tts/bytes", { method: "POST", headers: h, body: JSON.stringify({ model_id: "sonic-english", transcript: params.text, voice: { mode: "id", id: (params.voice_id as string) || "a0e99841-438c-4a64-b679-ae501e7d6091" }, output_format: { container: "mp3", encoding: "mp3", sample_rate: 44100 } }) });
        return r.ok ? `Audio generated (${r.headers.get("content-length") || "?"} bytes)` : `Cartesia error: ${r.status}`;
      }
      if (action === "list_voices") {
        const r = await fetch("https://api.cartesia.ai/voices", { headers: h });
        const d = await r.json() as Array<{ id: string; name: string; language: string }>;
        return Array.isArray(d) ? d.slice(0, 15).map(v => `- ${v.name} (${v.language}) [${v.id}]`).join("\n") : "No voices";
      }
      break;
    }

    // ─── AI LLM Providers ───────────────────────────────────────────────────
    case "anthropic": {
      const h = { "x-api-key": apiKey, "Content-Type": "application/json", "anthropic-version": "2023-06-01" };
      if (action === "chat_completion" || action === "message") {
        const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: h, body: JSON.stringify({ model: (params.model as string) || "claude-sonnet-4-20250514", max_tokens: (params.max_tokens as number) || 1024, messages: params.messages || [{ role: "user", content: params.prompt || params.message }] }) });
        const d = await r.json() as { content?: Array<{ text: string }> };
        return d.content?.[0]?.text || `Anthropic error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      break;
    }
    case "google_ai": {
      if (action === "chat_completion" || action === "generate") {
        const model = (params.model as string) || "gemini-2.0-flash";
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: params.prompt || params.message }] }] }) });
        const d = await r.json() as { candidates?: Array<{ content: { parts: Array<{ text: string }> } }> };
        return d.candidates?.[0]?.content?.parts?.[0]?.text || `Google AI error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      break;
    }
    case "groq": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "chat_completion" || action === "chat") {
        const r = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: h, body: JSON.stringify({ model: (params.model as string) || "llama-3.1-70b-versatile", messages: params.messages || [{ role: "user", content: params.prompt || params.message }], max_tokens: (params.max_tokens as number) || 1024 }) });
        const d = await r.json() as { choices?: Array<{ message: { content: string } }> };
        return d.choices?.[0]?.message?.content || `Groq error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      break;
    }
    case "together": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "chat_completion" || action === "chat") {
        const r = await fetch("https://api.together.xyz/v1/chat/completions", { method: "POST", headers: h, body: JSON.stringify({ model: (params.model as string) || "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo", messages: params.messages || [{ role: "user", content: params.prompt || params.message }], max_tokens: (params.max_tokens as number) || 1024 }) });
        const d = await r.json() as { choices?: Array<{ message: { content: string } }> };
        return d.choices?.[0]?.message?.content || `Together error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      break;
    }
    case "fireworks": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "chat_completion" || action === "chat") {
        const r = await fetch("https://api.fireworks.ai/inference/v1/chat/completions", { method: "POST", headers: h, body: JSON.stringify({ model: (params.model as string) || "accounts/fireworks/models/llama-v3p1-70b-instruct", messages: params.messages || [{ role: "user", content: params.prompt || params.message }], max_tokens: (params.max_tokens as number) || 1024 }) });
        const d = await r.json() as { choices?: Array<{ message: { content: string } }> };
        return d.choices?.[0]?.message?.content || `Fireworks error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      break;
    }
    case "perplexity": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "chat_completion" || action === "search") {
        const r = await fetch("https://api.perplexity.ai/chat/completions", { method: "POST", headers: h, body: JSON.stringify({ model: (params.model as string) || "sonar", messages: params.messages || [{ role: "user", content: params.prompt || params.query }] }) });
        const d = await r.json() as { choices?: Array<{ message: { content: string } }>; citations?: string[] };
        const text = d.choices?.[0]?.message?.content || "";
        const citations = d.citations?.length ? `\n\nSources:\n${d.citations.map((c, i) => `[${i + 1}] ${c}`).join("\n")}` : "";
        return text + citations || `Perplexity error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      break;
    }
    case "mistral": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "chat_completion" || action === "chat") {
        const r = await fetch("https://api.mistral.ai/v1/chat/completions", { method: "POST", headers: h, body: JSON.stringify({ model: (params.model as string) || "mistral-large-latest", messages: params.messages || [{ role: "user", content: params.prompt || params.message }], max_tokens: (params.max_tokens as number) || 1024 }) });
        const d = await r.json() as { choices?: Array<{ message: { content: string } }> };
        return d.choices?.[0]?.message?.content || `Mistral error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      break;
    }
    case "cohere": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "chat_completion" || action === "chat") {
        const r = await fetch("https://api.cohere.com/v2/chat", { method: "POST", headers: h, body: JSON.stringify({ model: (params.model as string) || "command-r-plus", messages: [{ role: "user", content: params.prompt || params.message }] }) });
        const d = await r.json() as { message?: { content: Array<{ text: string }> } };
        return d.message?.content?.[0]?.text || `Cohere error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      if (action === "embed") {
        const r = await fetch("https://api.cohere.com/v2/embed", { method: "POST", headers: h, body: JSON.stringify({ texts: [params.text || params.input], model: "embed-english-v3.0", input_type: "search_document" }) });
        const d = await r.json() as { embeddings?: { float: number[][] } };
        return d.embeddings?.float?.[0] ? `Embedding: ${d.embeddings.float[0].length} dimensions` : `Error: ${JSON.stringify(d).slice(0, 200)}`;
      }
      break;
    }
    case "openrouter": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": "https://perplexity-computer.vercel.app" };
      if (action === "chat_completion" || action === "chat") {
        const r = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: h, body: JSON.stringify({ model: (params.model as string) || "meta-llama/llama-3.1-70b-instruct", messages: params.messages || [{ role: "user", content: params.prompt || params.message }] }) });
        const d = await r.json() as { choices?: Array<{ message: { content: string } }> };
        return d.choices?.[0]?.message?.content || `OpenRouter error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      if (action === "list_models") {
        const r = await fetch("https://openrouter.ai/api/v1/models", { headers: h });
        const d = await r.json() as { data?: Array<{ id: string; pricing: { prompt: string } }> };
        return (d.data || []).slice(0, 20).map(m => `- ${m.id} ($${m.pricing?.prompt}/tok)`).join("\n");
      }
      break;
    }
    case "deepseek": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "chat_completion" || action === "chat") {
        const r = await fetch("https://api.deepseek.com/chat/completions", { method: "POST", headers: h, body: JSON.stringify({ model: (params.model as string) || "deepseek-chat", messages: params.messages || [{ role: "user", content: params.prompt || params.message }], max_tokens: (params.max_tokens as number) || 1024 }) });
        const d = await r.json() as { choices?: Array<{ message: { content: string } }> };
        return d.choices?.[0]?.message?.content || `DeepSeek error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      break;
    }

    // ─── AI Code ────────────────────────────────────────────────────────────
    case "github_copilot": {
      return `GitHub Copilot is an IDE extension — use it within VS Code or JetBrains. API access is via GitHub Models: POST https://models.inference.ai.azure.com/chat/completions with your GitHub token.`;
    }
    case "cursor": {
      return `Cursor is an AI-powered code editor — use it as a standalone app. It doesn't have a public API. Use OpenAI or Anthropic APIs directly for similar AI coding capabilities.`;
    }
    case "sourcegraph": {
      const h = { Authorization: `token ${apiKey}`, "Content-Type": "application/json" };
      if (action === "search") {
        const r = await fetch("https://sourcegraph.com/.api/search/stream?q=" + encodeURIComponent((params.query as string) || ""), { headers: h });
        const text = await r.text();
        return text.slice(0, 1000) || "No results";
      }
      if (action === "cody_chat") {
        return `Sourcegraph Cody chat: Use the Cody VS Code extension or Sourcegraph web UI for AI-assisted coding with your codebase context.`;
      }
      break;
    }

    // ─── AI 3D ──────────────────────────────────────────────────────────────
    case "meshy": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "text_to_3d" || action === "generate") {
        const r = await fetch("https://api.meshy.ai/v2/text-to-3d", { method: "POST", headers: h, body: JSON.stringify({ mode: "preview", prompt: params.prompt, negative_prompt: params.negative_prompt || "", art_style: (params.style as string) || "realistic", topology: "quad" }) });
        const d = await r.json() as { result?: string };
        return d.result ? `Meshy 3D task: ${d.result}` : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      if (action === "get_task") {
        const r = await fetch(`https://api.meshy.ai/v2/text-to-3d/${params.task_id}`, { headers: h });
        const d = await r.json() as { status?: string; model_urls?: { glb?: string } };
        return JSON.stringify({ status: d.status, model_url: d.model_urls?.glb }, null, 2);
      }
      break;
    }
    case "tripo": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "text_to_3d" || action === "generate") {
        const r = await fetch("https://api.tripo3d.ai/v2/openapi/task", { method: "POST", headers: h, body: JSON.stringify({ type: "text_to_model", prompt: params.prompt }) });
        const d = await r.json() as { data?: { task_id: string } };
        return d.data?.task_id ? `Tripo task: ${d.data.task_id}` : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      if (action === "get_task") {
        const r = await fetch(`https://api.tripo3d.ai/v2/openapi/task/${params.task_id}`, { headers: h });
        const d = await r.json() as { data?: { status: string; output?: { model: string } } };
        return JSON.stringify({ status: d.data?.status, model_url: d.data?.output?.model }, null, 2);
      }
      break;
    }

    // ─── AI Design ──────────────────────────────────────────────────────────
    case "canva": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "create_design") {
        const r = await fetch("https://api.canva.com/rest/v1/designs", { method: "POST", headers: h, body: JSON.stringify({ design_type: { name: (params.type as string) || "Presentation" }, title: params.title || "New Design" }) });
        const d = await r.json() as { design?: { id: string; urls: { edit_url: string } } };
        return d.design ? `Design created: ${d.design.id}\nEdit: ${d.design.urls.edit_url}` : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      if (action === "list_designs") {
        const r = await fetch("https://api.canva.com/rest/v1/designs?limit=10", { headers: h });
        const d = await r.json() as { items?: Array<{ id: string; title: string }> };
        return (d.items || []).map(i => `- ${i.title} [${i.id}]`).join("\n") || "No designs";
      }
      break;
    }
    case "remove_bg": {
      if (action === "remove_background" || action === "remove") {
        const formData = new FormData();
        formData.append("image_url", (params.image_url as string) || "");
        formData.append("size", (params.size as string) || "auto");
        const r = await fetch("https://api.remove.bg/v1.0/removebg", { method: "POST", headers: { "X-Api-Key": apiKey }, body: formData });
        return r.ok ? `Background removed (${r.headers.get("content-length") || "?"} bytes)` : `remove.bg error: ${r.status}`;
      }
      break;
    }
    case "photoroom": {
      if (action === "remove_background" || action === "generate") {
        const formData = new FormData();
        formData.append("imageUrl", (params.image_url as string) || "");
        const r = await fetch("https://sdk.photoroom.com/v1/segment", { method: "POST", headers: { "x-api-key": apiKey }, body: formData });
        return r.ok ? `PhotoRoom processed (${r.headers.get("content-length") || "?"} bytes)` : `PhotoRoom error: ${r.status}`;
      }
      break;
    }

    // ─── AI Vector / Search ─────────────────────────────────────────────────
    case "pinecone": {
      const h = { "Api-Key": apiKey, "Content-Type": "application/json" };
      if (action === "list_indexes") {
        const r = await fetch("https://api.pinecone.io/indexes", { headers: h });
        const d = await r.json() as { indexes?: Array<{ name: string; dimension: number; metric: string }> };
        return (d.indexes || []).map(i => `- ${i.name} (dim: ${i.dimension}, metric: ${i.metric})`).join("\n") || "No indexes";
      }
      if (action === "query") {
        const host = (params.host as string) || "";
        const r = await fetch(`https://${host}/query`, { method: "POST", headers: h, body: JSON.stringify({ vector: params.vector, topK: (params.top_k as number) || 10, includeMetadata: true }) });
        const d = await r.json() as { matches?: Array<{ id: string; score: number }> };
        return (d.matches || []).map(m => `- ${m.id} (score: ${m.score.toFixed(4)})`).join("\n") || "No matches";
      }
      if (action === "upsert") {
        const host = (params.host as string) || "";
        const r = await fetch(`https://${host}/vectors/upsert`, { method: "POST", headers: h, body: JSON.stringify({ vectors: params.vectors }) });
        const d = await r.json() as { upsertedCount?: number };
        return `Upserted ${d.upsertedCount || 0} vectors`;
      }
      break;
    }
    case "weaviate": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      const baseUrl = (params.url as string) || (config.url as string) || "https://localhost:8080";
      if (action === "list_classes" || action === "get_schema") {
        const r = await fetch(`${baseUrl}/v1/schema`, { headers: h });
        const d = await r.json() as { classes?: Array<{ class: string }> };
        return (d.classes || []).map(c => `- ${c.class}`).join("\n") || "No classes";
      }
      if (action === "query") {
        const r = await fetch(`${baseUrl}/v1/graphql`, { method: "POST", headers: h, body: JSON.stringify({ query: params.query }) });
        const d = await r.json();
        return JSON.stringify(d, null, 2).slice(0, 1000);
      }
      break;
    }
    case "qdrant": {
      const baseUrl = (params.url as string) || (config.url as string) || "https://localhost:6333";
      const h = { "api-key": apiKey, "Content-Type": "application/json" };
      if (action === "list_collections") {
        const r = await fetch(`${baseUrl}/collections`, { headers: h });
        const d = await r.json() as { result?: { collections: Array<{ name: string }> } };
        return (d.result?.collections || []).map(c => `- ${c.name}`).join("\n") || "No collections";
      }
      if (action === "search" || action === "query") {
        const r = await fetch(`${baseUrl}/collections/${params.collection}/points/search`, { method: "POST", headers: h, body: JSON.stringify({ vector: params.vector, limit: (params.limit as number) || 10, with_payload: true }) });
        const d = await r.json() as { result?: Array<{ id: string | number; score: number }> };
        return (d.result || []).map(p => `- ${p.id} (score: ${p.score.toFixed(4)})`).join("\n") || "No results";
      }
      break;
    }

    // ─── AI Search ──────────────────────────────────────────────────────────
    case "tavily": {
      const h = { "Content-Type": "application/json" };
      if (action === "search") {
        const r = await fetch("https://api.tavily.com/search", { method: "POST", headers: h, body: JSON.stringify({ api_key: apiKey, query: params.query, search_depth: (params.depth as string) || "basic", max_results: (params.max_results as number) || 5 }) });
        const d = await r.json() as { results?: Array<{ title: string; url: string; content: string }> };
        return (d.results || []).map(r2 => `- ${r2.title}\n  ${r2.url}\n  ${r2.content.slice(0, 150)}`).join("\n\n") || "No results";
      }
      break;
    }
    case "serper": {
      const h = { "X-API-KEY": apiKey, "Content-Type": "application/json" };
      if (action === "search") {
        const r = await fetch("https://google.serper.dev/search", { method: "POST", headers: h, body: JSON.stringify({ q: params.query, num: (params.num as number) || 10 }) });
        const d = await r.json() as { organic?: Array<{ title: string; link: string; snippet: string }> };
        return (d.organic || []).map(r2 => `- ${r2.title}\n  ${r2.link}\n  ${r2.snippet}`).join("\n\n") || "No results";
      }
      if (action === "images") {
        const r = await fetch("https://google.serper.dev/images", { method: "POST", headers: h, body: JSON.stringify({ q: params.query, num: (params.num as number) || 10 }) });
        const d = await r.json() as { images?: Array<{ title: string; imageUrl: string }> };
        return (d.images || []).map(i => `- ${i.title}: ${i.imageUrl}`).join("\n") || "No images";
      }
      break;
    }
    case "exa": {
      const h = { "x-api-key": apiKey, "Content-Type": "application/json" };
      if (action === "search") {
        const r = await fetch("https://api.exa.ai/search", { method: "POST", headers: h, body: JSON.stringify({ query: params.query, num_results: (params.num_results as number) || 10, type: (params.type as string) || "neural", use_autoprompt: true }) });
        const d = await r.json() as { results?: Array<{ title: string; url: string; score: number }> };
        return (d.results || []).map(r2 => `- ${r2.title} (${r2.score.toFixed(3)})\n  ${r2.url}`).join("\n\n") || "No results";
      }
      if (action === "find_similar") {
        const r = await fetch("https://api.exa.ai/findSimilar", { method: "POST", headers: h, body: JSON.stringify({ url: params.url, num_results: (params.num_results as number) || 10 }) });
        const d = await r.json() as { results?: Array<{ title: string; url: string }> };
        return (d.results || []).map(r2 => `- ${r2.title}\n  ${r2.url}`).join("\n\n") || "No results";
      }
      break;
    }

    // ─── Email Services ─────────────────────────────────────────────────────
    case "resend": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "send_email") {
        const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: h, body: JSON.stringify({ from: params.from || "onboarding@resend.dev", to: Array.isArray(params.to) ? params.to : [params.to], subject: params.subject, html: params.html || params.body, text: params.text }) });
        const d = await r.json() as { id?: string };
        return d.id ? `Email sent: ${d.id}` : `Resend error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      if (action === "list_emails") {
        const r = await fetch("https://api.resend.com/emails", { headers: h });
        const d = await r.json() as { data?: Array<{ id: string; to: string[]; subject: string; created_at: string }> };
        return (d.data || []).slice(0, 10).map(e => `- ${e.subject} → ${e.to.join(", ")} (${e.created_at}) [${e.id}]`).join("\n") || "No emails";
      }
      break;
    }
    case "sendgrid": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "send_email") {
        const r = await fetch("https://api.sendgrid.com/v3/mail/send", { method: "POST", headers: h, body: JSON.stringify({ personalizations: [{ to: [{ email: params.to }] }], from: { email: params.from || "noreply@example.com" }, subject: params.subject, content: [{ type: "text/html", value: params.html || params.body }] }) });
        return r.status === 202 ? "Email sent via SendGrid" : `SendGrid error: ${r.status} ${await r.text().then(t => t.slice(0, 200))}`;
      }
      break;
    }
    case "yahoo": {
      return `Yahoo Mail doesn't have a public API. Use SMTP to send email via Yahoo: smtp.mail.yahoo.com:465 (SSL) with your Yahoo email and app password. Generate an app password at https://login.yahoo.com/account/security/app-passwords. Use the send_email tool with SMTP configuration.`;
    }
    case "postmark": {
      const h = { "X-Postmark-Server-Token": apiKey, "Content-Type": "application/json", Accept: "application/json" };
      if (action === "send_email") {
        const r = await fetch("https://api.postmarkapp.com/email", { method: "POST", headers: h, body: JSON.stringify({ From: params.from, To: params.to, Subject: params.subject, HtmlBody: params.html || params.body, TextBody: params.text, MessageStream: "outbound" }) });
        const d = await r.json() as { MessageID?: string; ErrorCode?: number };
        return d.MessageID ? `Sent: ${d.MessageID}` : `Postmark error: ${d.ErrorCode}`;
      }
      if (action === "get_stats") {
        const r = await fetch("https://api.postmarkapp.com/stats/outbound?fromdate=2024-01-01", { headers: h });
        const d = await r.json();
        return JSON.stringify(d, null, 2).slice(0, 500);
      }
      break;
    }
    case "teams": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "send_message") {
        const teamId = (params.team_id as string) || "";
        const channelId = (params.channel_id as string) || "";
        const r = await fetch(`https://graph.microsoft.com/v1.0/teams/${teamId}/channels/${channelId}/messages`, { method: "POST", headers: h, body: JSON.stringify({ body: { content: params.message || params.text } }) });
        const d = await r.json() as { id?: string };
        return d.id ? `Message sent: ${d.id}` : `Teams error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      if (action === "list_channels") {
        const teamId = (params.team_id as string) || "";
        const r = await fetch(`https://graph.microsoft.com/v1.0/teams/${teamId}/channels`, { headers: h });
        const d = await r.json() as { value?: Array<{ id: string; displayName: string }> };
        return (d.value || []).map(c => `- ${c.displayName} [${c.id}]`).join("\n") || "No channels";
      }
      break;
    }

    // ─── Print-on-Demand ────────────────────────────────────────────────────
    case "printify": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };

      // Helper: auto-resolve shop ID from first shop if not provided
      async function resolveShopId(providedId?: string): Promise<string> {
        if (providedId) return providedId;
        const r = await fetch("https://api.printify.com/v1/shops.json", { headers: h });
        const shops = await r.json() as Array<{ id: number; title: string }>;
        if (Array.isArray(shops) && shops.length > 0) return String(shops[0].id);
        throw new Error("No Printify shops found. Create a shop at printify.com first.");
      }

      if (action === "list_shops") {
        const r = await fetch("https://api.printify.com/v1/shops.json", { headers: h });
        const d = await r.json() as Array<{ id: number; title: string }>;
        return Array.isArray(d) ? d.map(s => `- ${s.title} [shop_id: ${s.id}]`).join("\n") : "No shops";
      }
      if (action === "list_products") {
        const shopId = await resolveShopId(params.shop_id as string);
        const r = await fetch(`https://api.printify.com/v1/shops/${shopId}/products.json?limit=20`, { headers: h });
        const d = await r.json() as { data?: Array<{ id: string; title: string; is_locked: boolean }> };
        return (d.data || []).map(p => `- ${p.title} [${p.id}]${p.is_locked ? " (published)" : ""}`).join("\n") || "No products";
      }
      if (action === "upload_image") {
        // Upload a design image to Printify — accepts url OR base64 contents
        const payload: Record<string, string> = { file_name: (params.file_name as string) || `design-${Date.now()}.png` };
        if (params.url) payload.url = params.url as string;
        else if (params.contents || params.base64) payload.contents = (params.contents || params.base64) as string;
        else return "Error: provide 'url' (public image URL) or 'contents' (base64 image data) to upload.";

        const r = await fetch("https://api.printify.com/v1/uploads/images.json", { method: "POST", headers: h, body: JSON.stringify(payload) });
        const d = await r.json() as { id?: string; file_name?: string; preview_url?: string; width?: number; height?: number };
        if (d.id) return `Image uploaded successfully.\nImage ID: ${d.id}\nFile: ${d.file_name}\nSize: ${d.width}x${d.height}\nPreview: ${d.preview_url || "N/A"}\n\nUse this image_id in print_areas when creating a product.`;
        return `Upload error: ${JSON.stringify(d).slice(0, 400)}`;
      }
      if (action === "list_blueprints" || action === "search_blueprints") {
        const r = await fetch("https://api.printify.com/v1/catalog/blueprints.json", { headers: h });
        const d = await r.json() as Array<{ id: number; title: string; brand: string; model: string; images: string[] }>;
        if (!Array.isArray(d)) return "No blueprints found";
        // If search query provided, filter results
        const query = ((params.query || params.search || params.product_type) as string || "").toLowerCase();
        const filtered = query ? d.filter(b => b.title.toLowerCase().includes(query) || b.brand.toLowerCase().includes(query)) : d;
        const results = filtered.slice(0, 30);
        return results.map(b => `- ${b.title} (${b.brand}) [blueprint_id: ${b.id}]`).join("\n") + (filtered.length > 30 ? `\n... and ${filtered.length - 30} more. Use search_blueprints with a query to narrow down.` : "");
      }
      if (action === "get_blueprint_providers" || action === "list_providers") {
        // List print providers for a specific blueprint
        const blueprintId = (params.blueprint_id as string) || "";
        if (!blueprintId) return "Error: blueprint_id is required. Use list_blueprints first to find a blueprint ID.";
        const r = await fetch(`https://api.printify.com/v1/catalog/blueprints/${blueprintId}/print_providers.json`, { headers: h });
        const d = await r.json() as Array<{ id: number; title: string }>;
        return Array.isArray(d) ? d.map(p => `- ${p.title} [print_provider_id: ${p.id}]`).join("\n") : "No providers found";
      }
      if (action === "get_provider_variants" || action === "list_variants") {
        // Get available variants (sizes/colors) for a blueprint+provider combo
        const blueprintId = (params.blueprint_id as string) || "";
        const providerId = (params.print_provider_id as string) || "";
        if (!blueprintId || !providerId) return "Error: blueprint_id and print_provider_id are required. Use get_blueprint_providers first.";
        const r = await fetch(`https://api.printify.com/v1/catalog/blueprints/${blueprintId}/print_providers/${providerId}/variants.json`, { headers: h });
        const d = await r.json() as { variants?: Array<{ id: number; title: string; options: Record<string, string> }> };
        const variants = d.variants || [];
        return variants.length > 0
          ? `Found ${variants.length} variants:\n` + variants.slice(0, 40).map(v => `- ${v.title} [variant_id: ${v.id}] ${JSON.stringify(v.options)}`).join("\n") + (variants.length > 40 ? `\n... ${variants.length - 40} more` : "") + `\n\nTo create a product, include ALL variant IDs in variants array (each with price and is_enabled), and list ALL variant IDs in print_areas[].variant_ids.`
          : "No variants found";
      }
      if (action === "get_shipping") {
        const blueprintId = (params.blueprint_id as string) || "";
        const providerId = (params.print_provider_id as string) || "";
        if (!blueprintId || !providerId) return "Error: blueprint_id and print_provider_id required.";
        const r = await fetch(`https://api.printify.com/v1/catalog/blueprints/${blueprintId}/print_providers/${providerId}/shipping.json`, { headers: h });
        const d = await r.json();
        return JSON.stringify(d, null, 2).slice(0, 1000);
      }
      if (action === "create_product") {
        const shopId = await resolveShopId(params.shop_id as string);

        // Build the product, auto-resolving variants if not provided
        let variants = params.variants as Array<{ id: number; price: number; is_enabled: boolean }> | undefined;
        let printAreas = params.print_areas as Array<{ variant_ids: number[]; placeholders: Array<{ position: string; images: Array<{ id: string; x: number; y: number; scale: number; angle: number }> }> }> | undefined;

        const blueprintId = params.blueprint_id as number;
        const printProviderId = params.print_provider_id as number;

        // If no variants provided, auto-fetch them
        if (!variants || !Array.isArray(variants) || variants.length === 0) {
          if (!blueprintId || !printProviderId) {
            return "Error: When not providing variants manually, blueprint_id and print_provider_id are required. Use list_blueprints → get_blueprint_providers → get_provider_variants to find IDs.";
          }
          const vr = await fetch(`https://api.printify.com/v1/catalog/blueprints/${blueprintId}/print_providers/${printProviderId}/variants.json`, { headers: h });
          const vd = await vr.json() as { variants?: Array<{ id: number; title: string }> };
          const allVariants = vd.variants || [];
          if (allVariants.length === 0) return "Error: No variants found for this blueprint/provider combo.";

          const price = Math.round(((params.price as number) || 19.99) * 100); // Convert to cents
          variants = allVariants.map(v => ({ id: v.id, price, is_enabled: true }));

          // Build print_areas with all variant IDs if not provided
          if (!printAreas && params.image_id) {
            const allIds = allVariants.map(v => v.id);
            printAreas = [{
              variant_ids: allIds,
              placeholders: [{
                position: "front",
                images: [{
                  id: params.image_id as string,
                  x: 0.5, y: 0.5, scale: 1, angle: 0,
                }],
              }],
            }];
          }
        }

        // CRITICAL: Ensure every variant_id appears exactly once across all print_areas (Printify error 8251 prevention)
        if (printAreas && variants) {
          const allVariantIds = variants.map(v => v.id);
          const coveredIds = new Set(printAreas.flatMap(pa => pa.variant_ids));
          const missingIds = allVariantIds.filter(id => !coveredIds.has(id));
          if (missingIds.length > 0) {
            // Add missing variant IDs to the first print_area
            printAreas[0].variant_ids = [...printAreas[0].variant_ids, ...missingIds];
          }
        }

        const productPayload = {
          title: params.title || "Untitled Product",
          description: params.description || "",
          blueprint_id: blueprintId,
          print_provider_id: printProviderId,
          variants,
          print_areas: printAreas || [],
          tags: (params.tags as string[]) || [],
        };

        const r = await fetch(`https://api.printify.com/v1/shops/${shopId}/products.json`, { method: "POST", headers: h, body: JSON.stringify(productPayload) });
        const d = await r.json() as { id?: string; title?: string; images?: Array<{ src: string }> };
        if (d.id) {
          return `✅ Product created successfully!\nProduct ID: ${d.id}\nTitle: ${d.title || params.title}\nShop ID: ${shopId}\nVariants: ${variants?.length || 0}\n\nTo publish this product to your connected sales channel (Shopify), use publish_product with product_id: "${d.id}"`;
        }
        return `Error creating product: ${JSON.stringify(d).slice(0, 500)}`;
      }
      if (action === "publish_product") {
        const shopId = await resolveShopId(params.shop_id as string);
        const productId = (params.product_id as string) || "";
        if (!productId) return "Error: product_id is required. Get it from create_product or list_products.";
        const r = await fetch(`https://api.printify.com/v1/shops/${shopId}/products/${productId}/publish.json`, {
          method: "POST", headers: h,
          body: JSON.stringify({ title: true, description: true, images: true, variants: true, tags: true }),
        });
        if (r.ok) return `✅ Product published! It will appear on your connected sales channel (Shopify) within a few minutes.\nProduct ID: ${productId}\nShop ID: ${shopId}`;
        const errBody = await r.text().catch(() => "");
        return `Publish error (${r.status}): ${errBody.slice(0, 300)}`;
      }
      if (action === "get_product") {
        const shopId = await resolveShopId(params.shop_id as string);
        const productId = (params.product_id as string) || "";
        if (!productId) return "Error: product_id required.";
        const r = await fetch(`https://api.printify.com/v1/shops/${shopId}/products/${productId}.json`, { headers: h });
        const d = await r.json() as { id?: string; title?: string; description?: string; tags?: string[]; images?: Array<{ src: string }>; is_locked?: boolean };
        if (d.id) return `Product: ${d.title}\nID: ${d.id}\nPublished: ${d.is_locked ? "Yes" : "No"}\nTags: ${(d.tags || []).join(", ")}\nImages: ${(d.images || []).map((i: { src: string }) => i.src).join(", ")}`;
        return `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      if (action === "delete_product") {
        const shopId = await resolveShopId(params.shop_id as string);
        const productId = (params.product_id as string) || "";
        if (!productId) return "Error: product_id required.";
        const r = await fetch(`https://api.printify.com/v1/shops/${shopId}/products/${productId}.json`, { method: "DELETE", headers: h });
        return r.ok ? `Product ${productId} deleted.` : `Error: ${r.status}`;
      }
      if (action === "list_images" || action === "list_uploads") {
        const r = await fetch("https://api.printify.com/v1/uploads.json?limit=20", { headers: h });
        const d = await r.json() as { data?: Array<{ id: string; file_name: string; preview_url: string; width: number; height: number }> };
        return (d.data || []).map(img => `- ${img.file_name} (${img.width}x${img.height}) [image_id: ${img.id}]`).join("\n") || "No uploaded images";
      }
      break;
    }
    case "printful": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "list_products") {
        const r = await fetch("https://api.printful.com/store/products?limit=20", { headers: h });
        const d = await r.json() as { result?: Array<{ id: number; name: string; synced: number }> };
        return (d.result || []).map(p => `- ${p.name} (${p.synced} synced) [${p.id}]`).join("\n") || "No products";
      }
      if (action === "create_order") {
        const r = await fetch("https://api.printful.com/orders", { method: "POST", headers: h, body: JSON.stringify({ recipient: params.recipient, items: params.items }) });
        const d = await r.json() as { result?: { id: number; status: string } };
        return d.result ? `Order ${d.result.id}: ${d.result.status}` : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      if (action === "list_catalog") {
        const r = await fetch("https://api.printful.com/products", { headers: h });
        const d = await r.json() as { result?: Array<{ id: number; title: string; type: string }> };
        return (d.result || []).slice(0, 20).map(p => `- ${p.title} (${p.type}) [${p.id}]`).join("\n") || "No catalog items";
      }
      if (action === "estimate_costs") {
        const r = await fetch("https://api.printful.com/orders/estimate-costs", { method: "POST", headers: h, body: JSON.stringify({ recipient: params.recipient, items: params.items }) });
        const d = await r.json() as { result?: { costs: { total: string } } };
        return d.result ? `Estimated total: $${d.result.costs.total}` : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      break;
    }
    case "gooten": {
      const baseUrl = `https://api.gooten.com/api`;
      if (action === "list_products") {
        const r = await fetch(`${baseUrl}/v/4/source/api/products/?recipeid=${apiKey}`, { headers: { "Content-Type": "application/json" } });
        const d = await r.json() as { Products?: Array<{ Id: number; Name: string }> };
        return (d.Products || []).slice(0, 20).map(p => `- ${p.Name} [${p.Id}]`).join("\n") || "No products";
      }
      if (action === "create_order") {
        const r = await fetch(`${baseUrl}/v/4/source/api/orders/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ RecipeId: apiKey, Items: params.items, ShipToAddress: params.address }) });
        const d = await r.json() as { Id?: string };
        return d.Id ? `Order created: ${d.Id}` : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      break;
    }
    case "gelato": {
      const h = { "X-API-KEY": apiKey, "Content-Type": "application/json" };
      if (action === "list_products" || action === "get_catalog") {
        const r = await fetch("https://product.gelatoapis.com/v3/catalogs", { headers: h });
        const d = await r.json() as { catalogs?: Array<{ catalogUid: string; title: string }> };
        return (d.catalogs || []).slice(0, 20).map(c => `- ${c.title} [${c.catalogUid}]`).join("\n") || "No catalogs";
      }
      if (action === "create_order") {
        const r = await fetch("https://order.gelatoapis.com/v4/orders", { method: "POST", headers: h, body: JSON.stringify({ orderType: "order", orderReferenceId: params.reference_id || `order-${Date.now()}`, customerReferenceId: params.customer_id || "customer-1", currency: (params.currency as string) || "USD", items: params.items, shippingAddress: params.address }) });
        const d = await r.json() as { id?: string };
        return d.id ? `Gelato order: ${d.id}` : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      if (action === "get_order") {
        const r = await fetch(`https://order.gelatoapis.com/v4/orders/${params.order_id}`, { headers: h });
        const d = await r.json() as { id?: string; orderStatus?: string };
        return JSON.stringify({ id: d.id, status: d.orderStatus }, null, 2);
      }
      break;
    }

    // ─── E-Commerce ─────────────────────────────────────────────────────────
    case "amazon_sp": {
      const h = { "x-amz-access-token": apiKey, "Content-Type": "application/json" };
      if (action === "list_orders") {
        const r = await fetch("https://sellingpartnerapi-na.amazon.com/orders/v0/orders?MarketplaceIds=ATVPDKIKX0DER&CreatedAfter=" + ((params.created_after as string) || new Date(Date.now() - 30 * 86400000).toISOString()), { headers: h });
        const d = await r.json() as { payload?: { Orders: Array<{ AmazonOrderId: string; OrderStatus: string; OrderTotal?: { Amount: string } }> } };
        return (d.payload?.Orders || []).slice(0, 10).map(o => `- ${o.AmazonOrderId}: ${o.OrderStatus} ($${o.OrderTotal?.Amount || "?"})`).join("\n") || "No orders";
      }
      if (action === "list_catalog") {
        const r = await fetch(`https://sellingpartnerapi-na.amazon.com/catalog/2022-04-01/items?marketplaceIds=ATVPDKIKX0DER&keywords=${encodeURIComponent((params.query as string) || "")}`, { headers: h });
        const d = await r.json() as { items?: Array<{ asin: string; summaries?: Array<{ itemName: string }> }> };
        return (d.items || []).slice(0, 10).map(i => `- ${i.summaries?.[0]?.itemName || "?"} [${i.asin}]`).join("\n") || "No items";
      }
      if (action === "get_order") {
        const r = await fetch(`https://sellingpartnerapi-na.amazon.com/orders/v0/orders/${params.order_id}`, { headers: h });
        const d = await r.json();
        return JSON.stringify(d.payload, null, 2).slice(0, 500);
      }
      break;
    }
    case "etsy": {
      const h = { Authorization: `Bearer ${apiKey}`, "x-api-key": (params.keystring as string) || apiKey, "Content-Type": "application/json" };
      if (action === "list_shops") {
        const r = await fetch("https://openapi.etsy.com/v3/application/users/me/shops", { headers: h });
        const d = await r.json() as { results?: Array<{ shop_id: number; shop_name: string }> };
        return (d.results || []).map(s => `- ${s.shop_name} [${s.shop_id}]`).join("\n") || "No shops";
      }
      if (action === "list_listings") {
        const shopId = (params.shop_id as string) || "";
        const r = await fetch(`https://openapi.etsy.com/v3/application/shops/${shopId}/listings?limit=25`, { headers: h });
        const d = await r.json() as { results?: Array<{ listing_id: number; title: string; price: { amount: number; divisor: number } }> };
        return (d.results || []).map(l => `- ${l.title} ($${(l.price.amount / l.price.divisor).toFixed(2)}) [${l.listing_id}]`).join("\n") || "No listings";
      }
      if (action === "create_listing") {
        const shopId = (params.shop_id as string) || "";
        const r = await fetch(`https://openapi.etsy.com/v3/application/shops/${shopId}/listings`, { method: "POST", headers: h, body: JSON.stringify({ title: params.title, description: params.description, price: params.price, quantity: (params.quantity as number) || 1, taxonomy_id: params.taxonomy_id, who_made: "i_did", when_made: "made_to_order", is_supply: false }) });
        const d = await r.json() as { listing_id?: number };
        return d.listing_id ? `Listing created: ${d.listing_id}` : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      if (action === "get_orders" || action === "list_orders") {
        const shopId = (params.shop_id as string) || "";
        const r = await fetch(`https://openapi.etsy.com/v3/application/shops/${shopId}/receipts?limit=25`, { headers: h });
        const d = await r.json() as { results?: Array<{ receipt_id: number; status: string; grandtotal: { amount: number; divisor: number } }> };
        return (d.results || []).map(o => `- Order #${o.receipt_id}: ${o.status} ($${(o.grandtotal.amount / o.grandtotal.divisor).toFixed(2)})`).join("\n") || "No orders";
      }
      break;
    }
    case "ebay": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "search" || action === "find_items") {
        const r = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent((params.query as string) || "")}&limit=10`, { headers: h });
        const d = await r.json() as { itemSummaries?: Array<{ title: string; itemId: string; price: { value: string; currency: string } }> };
        return (d.itemSummaries || []).map(i => `- ${i.title} ($${i.price.value} ${i.price.currency}) [${i.itemId}]`).join("\n") || "No items";
      }
      if (action === "get_item") {
        const r = await fetch(`https://api.ebay.com/buy/browse/v1/item/${params.item_id}`, { headers: h });
        const d = await r.json() as { title?: string; price?: { value: string }; condition?: string; itemLocation?: { city: string } };
        return JSON.stringify({ title: d.title, price: d.price?.value, condition: d.condition, location: d.itemLocation?.city }, null, 2);
      }
      if (action === "list_orders") {
        const r = await fetch("https://api.ebay.com/sell/fulfillment/v1/order?limit=10", { headers: h });
        const d = await r.json() as { orders?: Array<{ orderId: string; orderFulfillmentStatus: string; pricingSummary: { total: { value: string } } }> };
        return (d.orders || []).map(o => `- ${o.orderId}: ${o.orderFulfillmentStatus} ($${o.pricingSummary.total.value})`).join("\n") || "No orders";
      }
      if (action === "create_listing" || action === "create_offer") {
        const r = await fetch("https://api.ebay.com/sell/inventory/v1/offer", { method: "POST", headers: h, body: JSON.stringify({ sku: params.sku, marketplaceId: "EBAY_US", format: "FIXED_PRICE", listingDescription: params.description, pricingSummary: { price: { value: params.price, currency: "USD" } }, quantityLimitPerBuyer: (params.quantity_limit as number) || 1 }) });
        const d = await r.json() as { offerId?: string };
        return d.offerId ? `Offer created: ${d.offerId}` : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      break;
    }
    case "woocommerce": {
      const baseUrl = (params.store_url as string) || (config.store_url as string) || "";
      const h = { Authorization: `Basic ${Buffer.from(apiKey).toString("base64")}`, "Content-Type": "application/json" };
      if (action === "list_products") {
        const r = await fetch(`${baseUrl}/wp-json/wc/v3/products?per_page=10`, { headers: h });
        const d = await r.json() as Array<{ id: number; name: string; price: string; status: string }>;
        return Array.isArray(d) ? d.map(p => `- ${p.name} ($${p.price}, ${p.status}) [${p.id}]`).join("\n") : "No products";
      }
      if (action === "create_product") {
        const r = await fetch(`${baseUrl}/wp-json/wc/v3/products`, { method: "POST", headers: h, body: JSON.stringify({ name: params.name, type: (params.type as string) || "simple", regular_price: String(params.price), description: params.description, short_description: params.short_description }) });
        const d = await r.json() as { id?: number };
        return d.id ? `Product created: ${d.id}` : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      if (action === "list_orders") {
        const r = await fetch(`${baseUrl}/wp-json/wc/v3/orders?per_page=10`, { headers: h });
        const d = await r.json() as Array<{ id: number; status: string; total: string }>;
        return Array.isArray(d) ? d.map(o => `- Order #${o.id}: ${o.status} ($${o.total})`).join("\n") : "No orders";
      }
      break;
    }
    case "bigcommerce": {
      const h = { "X-Auth-Token": apiKey, "Content-Type": "application/json", Accept: "application/json" };
      const storeHash = (params.store_hash as string) || (config.store_hash as string) || "";
      if (action === "list_products") {
        const r = await fetch(`https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/products?limit=10`, { headers: h });
        const d = await r.json() as { data?: Array<{ id: number; name: string; price: number }> };
        return (d.data || []).map(p => `- ${p.name} ($${p.price}) [${p.id}]`).join("\n") || "No products";
      }
      if (action === "list_orders") {
        const r = await fetch(`https://api.bigcommerce.com/stores/${storeHash}/v2/orders?limit=10`, { headers: h });
        const d = await r.json() as Array<{ id: number; status: string; total_inc_tax: string }>;
        return Array.isArray(d) ? d.map(o => `- Order #${o.id}: ${o.status} ($${o.total_inc_tax})`).join("\n") : "No orders";
      }
      break;
    }
    case "square": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "list_catalog" || action === "list_products") {
        const r = await fetch("https://connect.squareup.com/v2/catalog/list?types=ITEM", { headers: h });
        const d = await r.json() as { objects?: Array<{ id: string; item_data?: { name: string } }> };
        return (d.objects || []).slice(0, 20).map(o => `- ${o.item_data?.name || "?"} [${o.id}]`).join("\n") || "No items";
      }
      if (action === "list_orders") {
        const r = await fetch("https://connect.squareup.com/v2/orders/search", { method: "POST", headers: h, body: JSON.stringify({ location_ids: params.location_ids || [], limit: 10 }) });
        const d = await r.json() as { orders?: Array<{ id: string; state: string; total_money?: { amount: number } }> };
        return (d.orders || []).map(o => `- ${o.id}: ${o.state} ($${((o.total_money?.amount || 0) / 100).toFixed(2)})`).join("\n") || "No orders";
      }
      if (action === "create_payment") {
        const r = await fetch("https://connect.squareup.com/v2/payments", { method: "POST", headers: h, body: JSON.stringify({ source_id: params.source_id || "cnon:card-nonce-ok", idempotency_key: `pay-${Date.now()}`, amount_money: { amount: params.amount, currency: (params.currency as string) || "USD" } }) });
        const d = await r.json() as { payment?: { id: string; status: string } };
        return d.payment ? `Payment ${d.payment.id}: ${d.payment.status}` : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      break;
    }
    case "gumroad": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "list_products") {
        const r = await fetch("https://api.gumroad.com/v2/products", { headers: h });
        const d = await r.json() as { success?: boolean; products?: Array<{ id: string; name: string; price: number; sales_count: number }> };
        return (d.products || []).map(p => `- ${p.name} ($${(p.price / 100).toFixed(2)}, ${p.sales_count} sales) [${p.id}]`).join("\n") || "No products";
      }
      if (action === "list_sales") {
        const r = await fetch("https://api.gumroad.com/v2/sales", { headers: h });
        const d = await r.json() as { success?: boolean; sales?: Array<{ id: string; product_name: string; price: number; email: string }> };
        return (d.sales || []).slice(0, 10).map(s => `- ${s.product_name} ($${(s.price / 100).toFixed(2)}) to ${s.email} [${s.id}]`).join("\n") || "No sales";
      }
      break;
    }
    case "lemonsqueezy": {
      const h = { Authorization: `Bearer ${apiKey}`, Accept: "application/vnd.api+json", "Content-Type": "application/vnd.api+json" };
      if (action === "list_products") {
        const r = await fetch("https://api.lemonsqueezy.com/v1/products", { headers: h });
        const d = await r.json() as { data?: Array<{ id: string; attributes: { name: string; price: number; status: string } }> };
        return (d.data || []).map(p => `- ${p.attributes.name} ($${(p.attributes.price / 100).toFixed(2)}, ${p.attributes.status}) [${p.id}]`).join("\n") || "No products";
      }
      if (action === "list_orders") {
        const r = await fetch("https://api.lemonsqueezy.com/v1/orders", { headers: h });
        const d = await r.json() as { data?: Array<{ id: string; attributes: { total: number; status: string; created_at: string } }> };
        return (d.data || []).slice(0, 10).map(o => `- $${(o.attributes.total / 100).toFixed(2)} (${o.attributes.status}) ${o.attributes.created_at} [${o.id}]`).join("\n") || "No orders";
      }
      break;
    }

    // ─── Automation ─────────────────────────────────────────────────────────
    case "zapier": {
      const h = { "Content-Type": "application/json" };
      if (action === "trigger_webhook" || action === "trigger") {
        const webhookUrl = (params.webhook_url as string) || apiKey;
        const r = await fetch(webhookUrl, { method: "POST", headers: h, body: JSON.stringify(params.data || params.payload || { trigger: "api", timestamp: new Date().toISOString() }) });
        return r.ok ? `Zapier webhook triggered (${r.status})` : `Zapier error: ${r.status}`;
      }
      if (action === "list_zaps") {
        const r = await fetch("https://api.zapier.com/v1/zaps", { headers: { Authorization: `Bearer ${apiKey}` } });
        const d = await r.json() as { objects?: Array<{ id: string; title: string; is_on: boolean }> };
        return (d.objects || []).map(z => `- ${z.title} (${z.is_on ? "ON" : "OFF"}) [${z.id}]`).join("\n") || "No zaps";
      }
      break;
    }
    case "n8n": {
      const baseUrl = (params.url as string) || (config.url as string) || "https://localhost:5678";
      const h = { "X-N8N-API-KEY": apiKey, "Content-Type": "application/json" };
      if (action === "trigger_webhook" || action === "trigger") {
        const webhookPath = (params.webhook_path as string) || "";
        const r = await fetch(`${baseUrl}/webhook/${webhookPath}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params.data || params.payload || {}) });
        return r.ok ? `n8n webhook triggered (${r.status})` : `n8n error: ${r.status}`;
      }
      if (action === "list_workflows") {
        const r = await fetch(`${baseUrl}/api/v1/workflows`, { headers: h });
        const d = await r.json() as { data?: Array<{ id: string; name: string; active: boolean }> };
        return (d.data || []).map(w => `- ${w.name} (${w.active ? "active" : "inactive"}) [${w.id}]`).join("\n") || "No workflows";
      }
      if (action === "activate_workflow") {
        const r = await fetch(`${baseUrl}/api/v1/workflows/${params.workflow_id}/activate`, { method: "POST", headers: h });
        return r.ok ? "Workflow activated" : `Error: ${r.status}`;
      }
      break;
    }
    case "make": {
      const h = { Authorization: `Token ${apiKey}`, "Content-Type": "application/json" };
      if (action === "trigger_webhook" || action === "trigger") {
        const webhookUrl = (params.webhook_url as string) || "";
        const r = await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params.data || params.payload || {}) });
        return r.ok ? `Make webhook triggered (${r.status})` : `Error: ${r.status}`;
      }
      if (action === "list_scenarios") {
        const teamId = (params.team_id as string) || "";
        const r = await fetch(`https://us1.make.com/api/v2/scenarios?teamId=${teamId}`, { headers: h });
        const d = await r.json() as { scenarios?: Array<{ id: number; name: string; islinked: boolean }> };
        return (d.scenarios || []).map(s => `- ${s.name} (${s.islinked ? "linked" : "unlinked"}) [${s.id}]`).join("\n") || "No scenarios";
      }
      break;
    }
    case "ifttt": {
      if (action === "trigger_webhook" || action === "trigger") {
        const eventName = (params.event as string) || "trigger";
        const r = await fetch(`https://maker.ifttt.com/trigger/${eventName}/with/key/${apiKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value1: params.value1 || "", value2: params.value2 || "", value3: params.value3 || "" }) });
        return r.ok ? `IFTTT event "${eventName}" triggered` : `IFTTT error: ${r.status}`;
      }
      break;
    }

    // ─── Cloud Platforms ────────────────────────────────────────────────────
    case "aws": {
      return `AWS connector stores credentials. Use the execute_code tool with boto3 for full AWS SDK access:\nimport boto3\ns3 = boto3.client('s3', aws_access_key_id='...', aws_secret_access_key='${apiKey}')\ns3.list_buckets()`;
    }
    case "gcp": {
      return `GCP connector stores service account credentials. Use the execute_code tool with google-cloud SDK:\nfrom google.cloud import storage\nclient = storage.Client.from_service_account_json('credentials.json')\nfor bucket in client.list_buckets(): print(bucket.name)`;
    }
    case "cloudflare": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "list_zones") {
        const r = await fetch("https://api.cloudflare.com/client/v4/zones?per_page=20", { headers: h });
        const d = await r.json() as { result?: Array<{ id: string; name: string; status: string }> };
        return (d.result || []).map(z => `- ${z.name} (${z.status}) [${z.id}]`).join("\n") || "No zones";
      }
      if (action === "list_dns") {
        const r = await fetch(`https://api.cloudflare.com/client/v4/zones/${params.zone_id}/dns_records`, { headers: h });
        const d = await r.json() as { result?: Array<{ name: string; type: string; content: string }> };
        return (d.result || []).slice(0, 20).map(r2 => `- ${r2.type} ${r2.name} → ${r2.content}`).join("\n") || "No records";
      }
      if (action === "purge_cache") {
        const r = await fetch(`https://api.cloudflare.com/client/v4/zones/${params.zone_id}/purge_cache`, { method: "POST", headers: h, body: JSON.stringify({ purge_everything: true }) });
        return r.ok ? "Cache purged" : `Error: ${r.status}`;
      }
      break;
    }
    case "digitalocean": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "list_droplets") {
        const r = await fetch("https://api.digitalocean.com/v2/droplets?per_page=20", { headers: h });
        const d = await r.json() as { droplets?: Array<{ id: number; name: string; status: string; networks: { v4: Array<{ ip_address: string; type: string }> } }> };
        return (d.droplets || []).map(dr => `- ${dr.name} (${dr.status}, ${dr.networks.v4.find(n => n.type === "public")?.ip_address || "?"}) [${dr.id}]`).join("\n") || "No droplets";
      }
      if (action === "create_droplet") {
        const r = await fetch("https://api.digitalocean.com/v2/droplets", { method: "POST", headers: h, body: JSON.stringify({ name: params.name, region: (params.region as string) || "nyc3", size: (params.size as string) || "s-1vcpu-1gb", image: (params.image as string) || "ubuntu-22-04-x64" }) });
        const d = await r.json() as { droplet?: { id: number; name: string } };
        return d.droplet ? `Droplet created: ${d.droplet.name} [${d.droplet.id}]` : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      break;
    }
    case "railway": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "list_projects") {
        const r = await fetch("https://backboard.railway.app/graphql/v2", { method: "POST", headers: h, body: JSON.stringify({ query: "{ me { projects { edges { node { id name } } } } }" }) });
        const d = await r.json() as { data?: { me: { projects: { edges: Array<{ node: { id: string; name: string } }> } } } };
        return (d.data?.me?.projects?.edges || []).map(e => `- ${e.node.name} [${e.node.id}]`).join("\n") || "No projects";
      }
      break;
    }
    case "render": {
      const h = { Authorization: `Bearer ${apiKey}`, Accept: "application/json" };
      if (action === "list_services") {
        const r = await fetch("https://api.render.com/v1/services?limit=20", { headers: h });
        const d = await r.json() as Array<{ service: { id: string; name: string; type: string; serviceDetails?: { url?: string } } }>;
        return Array.isArray(d) ? d.map(s => `- ${s.service.name} (${s.service.type}) [${s.service.id}]`).join("\n") : "No services";
      }
      break;
    }
    case "netlify": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "list_sites") {
        const r = await fetch("https://api.netlify.com/api/v1/sites", { headers: h });
        const d = await r.json() as Array<{ id: string; name: string; url: string; published_deploy?: { published_at: string } }>;
        return Array.isArray(d) ? d.slice(0, 15).map(s => `- ${s.name} (${s.url}) [${s.id}]`).join("\n") : "No sites";
      }
      if (action === "trigger_deploy") {
        const r = await fetch(`https://api.netlify.com/api/v1/sites/${params.site_id}/builds`, { method: "POST", headers: h });
        const d = await r.json() as { id?: string };
        return d.id ? `Deploy triggered: ${d.id}` : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      break;
    }

    // ─── Analytics ──────────────────────────────────────────────────────────
    case "google_analytics": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "run_report") {
        const r = await fetch("https://analyticsdata.googleapis.com/v1beta/properties/" + ((params.property_id as string) || "") + ":runReport", { method: "POST", headers: h, body: JSON.stringify({ dateRanges: [{ startDate: (params.start_date as string) || "30daysAgo", endDate: (params.end_date as string) || "today" }], metrics: (params.metrics as Array<{ name: string }>) || [{ name: "activeUsers" }, { name: "sessions" }], dimensions: (params.dimensions as Array<{ name: string }>) || [{ name: "date" }] }) });
        const d = await r.json() as { rows?: Array<{ dimensionValues: Array<{ value: string }>; metricValues: Array<{ value: string }> }> };
        return (d.rows || []).slice(0, 15).map(r2 => `${r2.dimensionValues.map(v => v.value).join(", ")}: ${r2.metricValues.map(v => v.value).join(", ")}`).join("\n") || "No data";
      }
      break;
    }
    case "mixpanel": {
      const h = { Authorization: `Basic ${Buffer.from(apiKey + ":").toString("base64")}`, Accept: "application/json" };
      if (action === "query" || action === "get_events") {
        const r = await fetch(`https://data.mixpanel.com/api/2.0/export?from_date=${(params.from_date as string) || "2024-01-01"}&to_date=${(params.to_date as string) || "2024-12-31"}&limit=100`, { headers: h });
        const text = await r.text();
        return text.slice(0, 1000) || "No data";
      }
      break;
    }
    case "amplitude": {
      const h = { Authorization: `Basic ${Buffer.from(apiKey + ":").toString("base64")}`, "Content-Type": "application/json" };
      if (action === "get_events" || action === "query") {
        const r = await fetch(`https://amplitude.com/api/2/events/segmentation?e=${encodeURIComponent(JSON.stringify({ event_type: params.event_type || "Any Event" }))}&start=${(params.start as string) || "20240101"}&end=${(params.end as string) || "20241231"}`, { headers: h });
        const d = await r.json();
        return JSON.stringify(d, null, 2).slice(0, 1000);
      }
      break;
    }
    case "plausible": {
      const h = { Authorization: `Bearer ${apiKey}` };
      if (action === "get_stats" || action === "query") {
        const site = (params.site_id as string) || "";
        const r = await fetch(`https://plausible.io/api/v1/stats/aggregate?site_id=${site}&period=${(params.period as string) || "30d"}&metrics=visitors,pageviews,bounce_rate,visit_duration`, { headers: h });
        const d = await r.json() as { results?: Record<string, { value: number }> };
        return d.results ? Object.entries(d.results).map(([k, v]) => `${k}: ${v.value}`).join("\n") : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      break;
    }
    case "posthog": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      const host = (params.host as string) || "https://app.posthog.com";
      if (action === "get_insights" || action === "query") {
        const r = await fetch(`${host}/api/projects/@current/insights/?limit=10`, { headers: h });
        const d = await r.json() as { results?: Array<{ id: number; name: string; filters: Record<string, unknown> }> };
        return (d.results || []).map(i => `- ${i.name || "Untitled"} [${i.id}]`).join("\n") || "No insights";
      }
      if (action === "capture_event") {
        const r = await fetch(`${host}/capture/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ api_key: apiKey, event: params.event, distinct_id: params.distinct_id || "anonymous", properties: params.properties || {} }) });
        return r.ok ? "Event captured" : `Error: ${r.status}`;
      }
      break;
    }

    // ─── Incident Management ────────────────────────────────────────────────
    case "pagerduty": {
      const h = { Authorization: `Token token=${apiKey}`, "Content-Type": "application/json" };
      if (action === "list_incidents") {
        const r = await fetch("https://api.pagerduty.com/incidents?limit=10&statuses[]=triggered&statuses[]=acknowledged", { headers: h });
        const d = await r.json() as { incidents?: Array<{ id: string; title: string; status: string; urgency: string }> };
        return (d.incidents || []).map(i => `- [${i.urgency}] ${i.title} (${i.status}) [${i.id}]`).join("\n") || "No incidents";
      }
      if (action === "create_incident") {
        const r = await fetch("https://api.pagerduty.com/incidents", { method: "POST", headers: { ...h, From: (params.from_email as string) || "" }, body: JSON.stringify({ incident: { type: "incident", title: params.title, service: { id: params.service_id, type: "service_reference" }, urgency: params.urgency || "high" } }) });
        const d = await r.json() as { incident?: { id: string } };
        return d.incident ? `Incident created: ${d.incident.id}` : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      break;
    }
    case "opsgenie": {
      const h = { Authorization: `GenieKey ${apiKey}`, "Content-Type": "application/json" };
      if (action === "list_alerts") {
        const r = await fetch("https://api.opsgenie.com/v2/alerts?limit=10", { headers: h });
        const d = await r.json() as { data?: Array<{ id: string; message: string; status: string; priority: string }> };
        return (d.data || []).map(a => `- [${a.priority}] ${a.message} (${a.status}) [${a.id}]`).join("\n") || "No alerts";
      }
      if (action === "create_alert") {
        const r = await fetch("https://api.opsgenie.com/v2/alerts", { method: "POST", headers: h, body: JSON.stringify({ message: params.message, description: params.description, priority: params.priority || "P3" }) });
        const d = await r.json() as { requestId?: string };
        return d.requestId ? `Alert created (request: ${d.requestId})` : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      break;
    }

    // ─── Additional Project Management ──────────────────────────────────────
    case "todoist": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "list_tasks") {
        const r = await fetch("https://api.todoist.com/rest/v2/tasks", { headers: h });
        const d = await r.json() as Array<{ id: string; content: string; due?: { string: string }; priority: number }>;
        return Array.isArray(d) ? d.slice(0, 15).map(t => `- [P${t.priority}] ${t.content}${t.due ? ` (due: ${t.due.string})` : ""} [${t.id}]`).join("\n") : "No tasks";
      }
      if (action === "create_task") {
        const r = await fetch("https://api.todoist.com/rest/v2/tasks", { method: "POST", headers: h, body: JSON.stringify({ content: params.content || params.title, description: params.description, due_string: params.due_string, priority: (params.priority as number) || 1 }) });
        const d = await r.json() as { id?: string };
        return d.id ? `Task created: ${d.id}` : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      if (action === "complete_task") {
        const r = await fetch(`https://api.todoist.com/rest/v2/tasks/${params.task_id}/close`, { method: "POST", headers: h });
        return r.ok ? "Task completed" : `Error: ${r.status}`;
      }
      break;
    }
    case "trello": {
      const baseUrl = "https://api.trello.com/1";
      if (action === "list_boards") {
        const r = await fetch(`${baseUrl}/members/me/boards?key=${apiKey}&token=${(params.token as string) || ""}&fields=name,url`, { headers: { Accept: "application/json" } });
        const d = await r.json() as Array<{ id: string; name: string; url: string }>;
        return Array.isArray(d) ? d.map(b => `- ${b.name} (${b.url}) [${b.id}]`).join("\n") : "No boards";
      }
      if (action === "create_card") {
        const r = await fetch(`${baseUrl}/cards?key=${apiKey}&token=${(params.token as string) || ""}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: params.name || params.title, desc: params.description, idList: params.list_id }) });
        const d = await r.json() as { id?: string; shortUrl?: string };
        return d.id ? `Card created: ${d.shortUrl || d.id}` : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      if (action === "list_cards") {
        const r = await fetch(`${baseUrl}/lists/${params.list_id}/cards?key=${apiKey}&token=${(params.token as string) || ""}`, { headers: { Accept: "application/json" } });
        const d = await r.json() as Array<{ id: string; name: string }>;
        return Array.isArray(d) ? d.map(c => `- ${c.name} [${c.id}]`).join("\n") : "No cards";
      }
      break;
    }
    case "basecamp": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "list_projects") {
        const r = await fetch("https://3.basecampapi.com/999999999/projects.json", { headers: h });
        const d = await r.json() as Array<{ id: number; name: string; status: string }>;
        return Array.isArray(d) ? d.map(p => `- ${p.name} (${p.status}) [${p.id}]`).join("\n") : "No projects";
      }
      break;
    }

    // ─── Databases ──────────────────────────────────────────────────────────
    case "firebase": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      const projectId = (params.project_id as string) || (config.project_id as string) || "";
      if (action === "get_document" || action === "read") {
        const path = (params.path as string) || "";
        const r = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`, { headers: h });
        const d = await r.json();
        return JSON.stringify(d, null, 2).slice(0, 1000);
      }
      if (action === "set_document" || action === "write") {
        const path = (params.path as string) || "";
        const r = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`, { method: "PATCH", headers: h, body: JSON.stringify({ fields: params.data || params.fields }) });
        const d = await r.json() as { name?: string };
        return d.name ? `Document written: ${d.name}` : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      break;
    }
    case "mongodb": {
      const h = { "api-key": apiKey, "Content-Type": "application/json" };
      const dataApiUrl = (params.url as string) || (config.url as string) || "https://data.mongodb-api.com/app/data-xxxxx/endpoint/data/v1";
      if (action === "find" || action === "query") {
        const r = await fetch(`${dataApiUrl}/action/find`, { method: "POST", headers: h, body: JSON.stringify({ dataSource: params.data_source || "Cluster0", database: params.database, collection: params.collection, filter: params.filter || {}, limit: (params.limit as number) || 10 }) });
        const d = await r.json() as { documents?: Array<Record<string, unknown>> };
        return (d.documents || []).map(doc => JSON.stringify(doc)).join("\n").slice(0, 1000) || "No documents";
      }
      if (action === "insert") {
        const r = await fetch(`${dataApiUrl}/action/insertOne`, { method: "POST", headers: h, body: JSON.stringify({ dataSource: params.data_source || "Cluster0", database: params.database, collection: params.collection, document: params.document }) });
        const d = await r.json() as { insertedId?: string };
        return d.insertedId ? `Inserted: ${d.insertedId}` : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      break;
    }
    case "redis": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      const restUrl = (params.url as string) || (config.url as string) || "";
      if (action === "get") {
        const r = await fetch(`${restUrl}/get/${params.key}`, { headers: h });
        const d = await r.json() as { result?: string };
        return d.result !== undefined ? `${params.key} = ${d.result}` : "Key not found";
      }
      if (action === "set") {
        const r = await fetch(`${restUrl}/set/${params.key}/${params.value}`, { headers: h });
        const d = await r.json() as { result?: string };
        return `Set ${params.key}: ${d.result}`;
      }
      break;
    }
    case "neon": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "list_projects") {
        const r = await fetch("https://console.neon.tech/api/v2/projects", { headers: h });
        const d = await r.json() as { projects?: Array<{ id: string; name: string; region_id: string }> };
        return (d.projects || []).map(p => `- ${p.name} (${p.region_id}) [${p.id}]`).join("\n") || "No projects";
      }
      if (action === "execute_query" || action === "query") {
        const r = await fetch(`https://console.neon.tech/api/v2/projects/${params.project_id}/query`, { method: "POST", headers: h, body: JSON.stringify({ query: params.query, params: params.params || [] }) });
        const d = await r.json();
        return JSON.stringify(d, null, 2).slice(0, 1000);
      }
      break;
    }

    // ─── Customer Support ───────────────────────────────────────────────────
    case "intercom": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json", "Intercom-Version": "2.10" };
      if (action === "list_contacts") {
        const r = await fetch("https://api.intercom.io/contacts?per_page=10", { headers: h });
        const d = await r.json() as { data?: Array<{ id: string; name: string; email: string }> };
        return (d.data || []).map(c => `- ${c.name || "?"} (${c.email}) [${c.id}]`).join("\n") || "No contacts";
      }
      if (action === "send_message") {
        const r = await fetch("https://api.intercom.io/messages", { method: "POST", headers: h, body: JSON.stringify({ message_type: "inapp", body: params.body || params.message, from: { type: "admin", id: params.admin_id }, to: { type: "user", id: params.user_id } }) });
        const d = await r.json() as { type?: string; id?: string };
        return d.id ? `Message sent: ${d.id}` : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      if (action === "list_conversations") {
        const r = await fetch("https://api.intercom.io/conversations?per_page=10", { headers: h });
        const d = await r.json() as { conversations?: Array<{ id: string; title: string; state: string }> };
        return (d.conversations || []).map(c => `- ${c.title || "Untitled"} (${c.state}) [${c.id}]`).join("\n") || "No conversations";
      }
      break;
    }
    case "freshdesk": {
      const h = { Authorization: `Basic ${Buffer.from(apiKey + ":X").toString("base64")}`, "Content-Type": "application/json" };
      const domain = (params.domain as string) || (config.domain as string) || "";
      if (action === "list_tickets") {
        const r = await fetch(`https://${domain}.freshdesk.com/api/v2/tickets?per_page=10`, { headers: h });
        const d = await r.json() as Array<{ id: number; subject: string; status: number; priority: number }>;
        return Array.isArray(d) ? d.map(t => `- ${t.subject} (status: ${t.status}, priority: ${t.priority}) [${t.id}]`).join("\n") : "No tickets";
      }
      if (action === "create_ticket") {
        const r = await fetch(`https://${domain}.freshdesk.com/api/v2/tickets`, { method: "POST", headers: h, body: JSON.stringify({ subject: params.subject, description: params.description, email: params.email, priority: (params.priority as number) || 1, status: 2 }) });
        const d = await r.json() as { id?: number };
        return d.id ? `Ticket created: ${d.id}` : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      break;
    }
    case "crisp": {
      const h = { Authorization: `Basic ${Buffer.from(apiKey).toString("base64")}`, "Content-Type": "application/json" };
      const websiteId = (params.website_id as string) || (config.website_id as string) || "";
      if (action === "list_conversations") {
        const r = await fetch(`https://api.crisp.chat/v1/website/${websiteId}/conversations?page_number=1`, { headers: h });
        const d = await r.json() as { data?: Array<{ session_id: string; state: string; meta?: { nickname: string } }> };
        return (d.data || []).map(c => `- ${c.meta?.nickname || "?"} (${c.state}) [${c.session_id}]`).join("\n") || "No conversations";
      }
      if (action === "send_message") {
        const r = await fetch(`https://api.crisp.chat/v1/website/${websiteId}/conversation/${params.session_id}/message`, { method: "POST", headers: h, body: JSON.stringify({ type: "text", from: "operator", origin: "chat", content: params.message }) });
        return r.ok ? "Message sent" : `Error: ${r.status}`;
      }
      break;
    }

    // ─── Newsletter / Email Marketing ───────────────────────────────────────
    case "convertkit": {
      const baseUrl = "https://api.convertkit.com/v3";
      if (action === "list_subscribers") {
        const r = await fetch(`${baseUrl}/subscribers?api_secret=${apiKey}&page=1`);
        const d = await r.json() as { total_subscribers?: number; subscribers?: Array<{ id: number; email_address: string }> };
        return (d.subscribers || []).slice(0, 10).map(s => `- ${s.email_address} [${s.id}]`).join("\n") || `Total: ${d.total_subscribers || 0}`;
      }
      if (action === "add_subscriber") {
        const r = await fetch(`${baseUrl}/forms/${params.form_id}/subscribe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ api_secret: apiKey, email: params.email, first_name: params.first_name }) });
        const d = await r.json() as { subscription?: { id: number } };
        return d.subscription ? `Subscribed: ${d.subscription.id}` : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      break;
    }
    case "beehiiv": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      const pubId = (params.publication_id as string) || (config.publication_id as string) || "";
      if (action === "list_subscribers") {
        const r = await fetch(`https://api.beehiiv.com/v2/publications/${pubId}/subscriptions?limit=10`, { headers: h });
        const d = await r.json() as { data?: Array<{ id: string; email: string; status: string }> };
        return (d.data || []).map(s => `- ${s.email} (${s.status}) [${s.id}]`).join("\n") || "No subscribers";
      }
      if (action === "create_subscriber") {
        const r = await fetch(`https://api.beehiiv.com/v2/publications/${pubId}/subscriptions`, { method: "POST", headers: h, body: JSON.stringify({ email: params.email, reactivate_existing: true }) });
        const d = await r.json() as { data?: { id: string } };
        return d.data ? `Subscribed: ${d.data.id}` : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      break;
    }
    case "brevo": {
      const h = { "api-key": apiKey, "Content-Type": "application/json" };
      if (action === "send_email") {
        const r = await fetch("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: h, body: JSON.stringify({ sender: { email: params.from || "noreply@example.com" }, to: [{ email: params.to }], subject: params.subject, htmlContent: params.html || params.body }) });
        const d = await r.json() as { messageId?: string };
        return d.messageId ? `Sent: ${d.messageId}` : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      if (action === "list_contacts") {
        const r = await fetch("https://api.brevo.com/v3/contacts?limit=10", { headers: h });
        const d = await r.json() as { contacts?: Array<{ id: number; email: string }> };
        return (d.contacts || []).map(c => `- ${c.email} [${c.id}]`).join("\n") || "No contacts";
      }
      break;
    }

    // ─── Finance / Payments ─────────────────────────────────────────────────
    case "paypal": {
      const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      if (action === "list_transactions") {
        const r = await fetch(`https://api-m.paypal.com/v1/reporting/transactions?start_date=${(params.start_date as string) || new Date(Date.now() - 30 * 86400000).toISOString()}&end_date=${(params.end_date as string) || new Date().toISOString()}&fields=all`, { headers: h });
        const d = await r.json() as { transaction_details?: Array<{ transaction_info: { transaction_id: string; transaction_amount: { value: string }; transaction_status: string } }> };
        return (d.transaction_details || []).slice(0, 10).map(t => `- ${t.transaction_info.transaction_id}: $${t.transaction_info.transaction_amount.value} (${t.transaction_info.transaction_status})`).join("\n") || "No transactions";
      }
      if (action === "create_payment") {
        const r = await fetch("https://api-m.paypal.com/v2/checkout/orders", { method: "POST", headers: h, body: JSON.stringify({ intent: "CAPTURE", purchase_units: [{ amount: { currency_code: (params.currency as string) || "USD", value: String(params.amount) } }] }) });
        const d = await r.json() as { id?: string; status?: string; links?: Array<{ rel: string; href: string }> };
        const approveLink = d.links?.find(l => l.rel === "approve")?.href;
        return d.id ? `Order ${d.id}: ${d.status}${approveLink ? `\nApprove: ${approveLink}` : ""}` : `Error: ${JSON.stringify(d).slice(0, 300)}`;
      }
      break;
    }
    case "plaid": {
      const h = { "Content-Type": "application/json" };
      const baseUrl = (params.environment as string) === "production" ? "https://production.plaid.com" : "https://sandbox.plaid.com";
      if (action === "get_accounts") {
        const r = await fetch(`${baseUrl}/accounts/get`, { method: "POST", headers: h, body: JSON.stringify({ client_id: (params.client_id as string) || "", secret: apiKey, access_token: params.access_token }) });
        const d = await r.json() as { accounts?: Array<{ account_id: string; name: string; type: string; balances: { current: number } }> };
        return (d.accounts || []).map(a => `- ${a.name} (${a.type}) $${a.balances.current} [${a.account_id}]`).join("\n") || "No accounts";
      }
      if (action === "get_transactions") {
        const r = await fetch(`${baseUrl}/transactions/get`, { method: "POST", headers: h, body: JSON.stringify({ client_id: (params.client_id as string) || "", secret: apiKey, access_token: params.access_token, start_date: params.start_date, end_date: params.end_date }) });
        const d = await r.json() as { transactions?: Array<{ name: string; amount: number; date: string }> };
        return (d.transactions || []).slice(0, 15).map(t => `- ${t.date}: ${t.name} ($${t.amount})`).join("\n") || "No transactions";
      }
      break;
    }

    // ─── Media / Entertainment ──────────────────────────────────────────────
    case "twitch": {
      const h = { Authorization: `Bearer ${apiKey}`, "Client-Id": (params.client_id as string) || (config.client_id as string) || "" };
      if (action === "get_user") {
        const r = await fetch(`https://api.twitch.tv/helix/users?login=${params.username || ""}`, { headers: h });
        const d = await r.json() as { data?: Array<{ id: string; login: string; display_name: string; view_count: number }> };
        return d.data?.[0] ? JSON.stringify(d.data[0], null, 2) : "User not found";
      }
      if (action === "search_channels") {
        const r = await fetch(`https://api.twitch.tv/helix/search/channels?query=${encodeURIComponent((params.query as string) || "")}&first=10`, { headers: h });
        const d = await r.json() as { data?: Array<{ broadcaster_login: string; display_name: string; is_live: boolean; game_name: string }> };
        return (d.data || []).map(c => `- ${c.display_name} (${c.is_live ? "LIVE" : "offline"}) ${c.game_name}`).join("\n") || "No channels";
      }
      if (action === "get_streams") {
        const r = await fetch(`https://api.twitch.tv/helix/streams?first=10${params.game_id ? `&game_id=${params.game_id}` : ""}`, { headers: h });
        const d = await r.json() as { data?: Array<{ user_name: string; game_name: string; title: string; viewer_count: number }> };
        return (d.data || []).map(s => `- ${s.user_name}: ${s.title} (${s.game_name}, ${s.viewer_count} viewers)`).join("\n") || "No streams";
      }
      break;
    }
    case "spotify": {
      const h = { Authorization: `Bearer ${apiKey}` };
      if (action === "search") {
        const r = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent((params.query as string) || "")}&type=${(params.type as string) || "track"}&limit=10`, { headers: h });
        const d = await r.json() as { tracks?: { items: Array<{ name: string; artists: Array<{ name: string }>; external_urls: { spotify: string } }> } };
        return (d.tracks?.items || []).map(t => `- ${t.name} by ${t.artists.map(a => a.name).join(", ")} (${t.external_urls.spotify})`).join("\n") || "No results";
      }
      if (action === "get_track") {
        const r = await fetch(`https://api.spotify.com/v1/tracks/${params.track_id}`, { headers: h });
        const d = await r.json() as { name?: string; artists?: Array<{ name: string }>; album?: { name: string }; duration_ms?: number };
        return JSON.stringify({ name: d.name, artists: d.artists?.map(a => a.name), album: d.album?.name, duration_seconds: Math.round((d.duration_ms || 0) / 1000) }, null, 2);
      }
      if (action === "get_playlist") {
        const r = await fetch(`https://api.spotify.com/v1/playlists/${params.playlist_id}`, { headers: h });
        const d = await r.json() as { name?: string; tracks?: { total: number; items: Array<{ track: { name: string; artists: Array<{ name: string }> } }> } };
        return `${d.name} (${d.tracks?.total} tracks)\n${(d.tracks?.items || []).slice(0, 10).map(i => `- ${i.track.name} by ${i.track.artists.map(a => a.name).join(", ")}`).join("\n")}`;
      }
      break;
    }

    // ─── Media Assets ───────────────────────────────────────────────────────
    case "giphy": {
      if (action === "search") {
        const r = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent((params.query as string) || "")}&limit=${(params.limit as number) || 10}`);
        const d = await r.json() as { data?: Array<{ title: string; images: { original: { url: string } } }> };
        return (d.data || []).map(g => `- ${g.title}: ${g.images.original.url}`).join("\n") || "No GIFs";
      }
      if (action === "trending") {
        const r = await fetch(`https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}&limit=10`);
        const d = await r.json() as { data?: Array<{ title: string; images: { original: { url: string } } }> };
        return (d.data || []).map(g => `- ${g.title}: ${g.images.original.url}`).join("\n") || "No trending";
      }
      break;
    }
    case "unsplash": {
      const h = { Authorization: `Client-ID ${apiKey}` };
      if (action === "search") {
        const r = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent((params.query as string) || "")}&per_page=10`, { headers: h });
        const d = await r.json() as { results?: Array<{ id: string; description: string; urls: { regular: string }; user: { name: string } }> };
        return (d.results || []).map(p => `- ${p.description || "Untitled"} by ${p.user.name}\n  ${p.urls.regular}`).join("\n\n") || "No photos";
      }
      if (action === "random") {
        const r = await fetch(`https://api.unsplash.com/photos/random?query=${(params.query as string) || ""}`, { headers: h });
        const d = await r.json() as { id: string; urls: { regular: string }; user: { name: string }; description: string };
        return `${d.description || "Random photo"} by ${d.user?.name}\n${d.urls?.regular}`;
      }
      break;
    }
    case "pexels": {
      const h = { Authorization: apiKey };
      if (action === "search") {
        const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent((params.query as string) || "")}&per_page=10`, { headers: h });
        const d = await r.json() as { photos?: Array<{ id: number; photographer: string; src: { medium: string }; alt: string }> };
        return (d.photos || []).map(p => `- ${p.alt || "Photo"} by ${p.photographer}\n  ${p.src.medium}`).join("\n\n") || "No photos";
      }
      if (action === "search_videos") {
        const r = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent((params.query as string) || "")}&per_page=10`, { headers: h });
        const d = await r.json() as { videos?: Array<{ id: number; user: { name: string }; video_files: Array<{ link: string; quality: string }> }> };
        return (d.videos || []).map(v => `- Video by ${v.user.name}: ${v.video_files.find(f => f.quality === "hd")?.link || v.video_files[0]?.link || "?"}`).join("\n") || "No videos";
      }
      break;
    }

    // ─── Utility APIs ───────────────────────────────────────────────────────
    case "openweather": {
      if (action === "get_weather" || action === "current") {
        const r = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent((params.city as string) || (params.location as string) || "")}&appid=${apiKey}&units=${(params.units as string) || "metric"}`);
        const d = await r.json() as { name?: string; main?: { temp: number; humidity: number; feels_like: number }; weather?: Array<{ description: string }>; wind?: { speed: number } };
        return d.name ? `${d.name}: ${d.main?.temp}°, ${d.weather?.[0]?.description}, humidity ${d.main?.humidity}%, wind ${d.wind?.speed}m/s, feels like ${d.main?.feels_like}°` : `Error: ${JSON.stringify(d).slice(0, 200)}`;
      }
      if (action === "forecast") {
        const r = await fetch(`https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent((params.city as string) || "")}&appid=${apiKey}&units=metric&cnt=8`);
        const d = await r.json() as { list?: Array<{ dt_txt: string; main: { temp: number }; weather: Array<{ description: string }> }> };
        return (d.list || []).map(f => `${f.dt_txt}: ${f.main.temp}°, ${f.weather[0].description}`).join("\n") || "No forecast";
      }
      break;
    }
    case "newsapi": {
      if (action === "top_headlines" || action === "search") {
        const endpoint = action === "top_headlines" ? "top-headlines" : "everything";
        const q = action === "top_headlines" ? `country=${(params.country as string) || "us"}` : `q=${encodeURIComponent((params.query as string) || "")}`;
        const r = await fetch(`https://newsapi.org/v2/${endpoint}?${q}&pageSize=10&apiKey=${apiKey}`);
        const d = await r.json() as { articles?: Array<{ title: string; source: { name: string }; url: string; publishedAt: string }> };
        return (d.articles || []).map(a => `- ${a.title} (${a.source.name})\n  ${a.url}`).join("\n\n") || "No articles";
      }
      break;
    }
    case "wolfram": {
      if (action === "query" || action === "ask") {
        const r = await fetch(`https://api.wolframalpha.com/v2/query?input=${encodeURIComponent((params.query as string) || (params.input as string) || "")}&appid=${apiKey}&output=json&format=plaintext`);
        const d = await r.json() as { queryresult?: { pods?: Array<{ title: string; subpods: Array<{ plaintext: string }> }> } };
        return (d.queryresult?.pods || []).map(p => `**${p.title}:**\n${p.subpods.map(s => s.plaintext).join("\n")}`).join("\n\n") || "No results";
      }
      break;
    }
    case "maps": {
      if (action === "geocode") {
        const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent((params.address as string) || "")}&key=${apiKey}`);
        const d = await r.json() as { results?: Array<{ formatted_address: string; geometry: { location: { lat: number; lng: number } } }> };
        return d.results?.[0] ? `${d.results[0].formatted_address}\nLat: ${d.results[0].geometry.location.lat}, Lng: ${d.results[0].geometry.location.lng}` : "Location not found";
      }
      if (action === "directions") {
        const r = await fetch(`https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent((params.origin as string) || "")}&destination=${encodeURIComponent((params.destination as string) || "")}&key=${apiKey}`);
        const d = await r.json() as { routes?: Array<{ legs: Array<{ distance: { text: string }; duration: { text: string }; steps: Array<{ html_instructions: string }> }> }> };
        const leg = d.routes?.[0]?.legs?.[0];
        return leg ? `Distance: ${leg.distance.text}\nDuration: ${leg.duration.text}\n\n${leg.steps.slice(0, 10).map(s => `- ${s.html_instructions.replace(/<[^>]*>/g, "")}`).join("\n")}` : "No route found";
      }
      if (action === "places" || action === "search_places") {
        const r = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent((params.query as string) || "")}&key=${apiKey}`);
        const d = await r.json() as { results?: Array<{ name: string; formatted_address: string; rating: number }> };
        return (d.results || []).slice(0, 10).map(p => `- ${p.name} (★${p.rating || "?"})\n  ${p.formatted_address}`).join("\n\n") || "No places";
      }
      break;
    }
  }
  return `Action "${action}" is not yet implemented for connector "${connectorId}". Available actions for this connector may include: ${JSON.stringify(params)}`;
}

// ─── Complete Task ────────────────────────────────────────────────────────────

async function handleCompleteTask(
  summary: string, filesCreated: string[], addToGallery: boolean, ctx: ToolContext
): Promise<string> {
  addMessage({ id: uuidv4(), task_id: ctx.taskId, role: "assistant", content: summary, created_at: new Date().toISOString() });

  // Build a rich memory value that includes file info
  let memoryValue = summary.slice(0, 500);
  if (filesCreated.length > 0) {
    memoryValue += `\n\nFiles created: ${filesCreated.join(", ")}`;
  }
  // Also scan the task directory for actual files on disk
  try {
    const actualFiles = fs.readdirSync(ctx.filesDir);
    if (actualFiles.length > 0) {
      const fileDetails = actualFiles.slice(0, 20).map(f => {
        try {
          const stat = fs.statSync(path.join(ctx.filesDir, f));
          return `${f} (${formatBytes(stat.size)})`;
        } catch { return f; }
      });
      memoryValue = memoryValue.slice(0, 400) + `\n\nFiles on disk: ${fileDetails.join(", ")}`;
    }
  } catch { /* dir may not exist */ }

  memoryStore({ id: uuidv4(), key: `task_result_${ctx.taskId.slice(0, 8)}`, value: memoryValue.slice(0, 800), source_task_id: ctx.taskId, tags: ["task_result", "auto", ...(filesCreated.length > 0 ? ["has_files"] : [])], created_at: new Date().toISOString(), updated_at: new Date().toISOString() });

  // ─── Self-Evolving Memory: auto-update stale related memories ────────────
  try {
    autoEvolveMemories(summary, ctx.taskId);
  } catch (e) { console.error("[memory-evolve] Error:", e); }

  if (addToGallery) {
    addGalleryItem({ id: uuidv4(), title: `Task ${ctx.taskId.slice(0, 8)}`, description: summary.slice(0, 200), preview_url: "", category: "General", prompt: summary.slice(0, 100), task_id: ctx.taskId, is_featured: false, created_at: new Date().toISOString() });
  }

  // Self-Improvement: record successful outcome (Otto-inspired)
  try {
    const { getTask } = await import("./db");
    const task = getTask(ctx.taskId);
    if (task) {
      const patternKey = task.prompt.slice(0, 200);
      recordLearning({
        id: uuidv4(),
        task_id: ctx.taskId,
        outcome: "success",
        pattern_key: patternKey,
        pattern_data: {
          model: task.model,
          tools_used: task.steps.filter(s => s.tool_name).map(s => s.tool_name),
          duration_ms: Date.now() - new Date(task.created_at).getTime(),
          summary_preview: summary.slice(0, 100),
        },
        confidence: 0.6,
      });

      // Reinforce similar patterns
      const similar = findSimilarLearnings(patternKey, 3);
      for (const s of similar) {
        if (s.outcome === "success") updateLearningConfidence(s.id, 0.05);
      }
    }
  } catch (e) { console.error("[self-improve] Error recording learning:", e); }

  // Analytics: record completion event
  try {
    const { getTask } = await import("./db");
    const task = getTask(ctx.taskId);
    recordAnalyticsEvent({
      id: uuidv4(),
      event_type: "task_complete",
      model: task?.model,
      duration_ms: task ? Date.now() - new Date(task.created_at).getTime() : undefined,
      success: true,
      metadata: { summary_preview: summary.slice(0, 100), files: filesCreated.length },
    });
  } catch (e) { console.error("[analytics] Error recording event:", e); }

  // Proactive follow-up suggestions (Otto-inspired)
  const suggestions = generateFollowUpSuggestions(summary, ctx.taskId);
  const suggestionsText = suggestions.length > 0
    ? `\n\n---\n**What's next?** Here are some follow-up actions:\n${suggestions.map(s => `- ${s.icon} **${s.label}**: "${s.prompt}"`).join("\n")}`
    : "";

  // Task Dependency Execution: auto-trigger dependent tasks (Perplexity Computer workflow chains)
  try {
    const { listTasks, getTask } = await import("./db");
    const allTasks = listTasks(undefined, 200, 0);
    const dependentTasks = allTasks.filter((t: { depends_on?: string; status: string }) =>
      t.depends_on === ctx.taskId && t.status === "pending"
    );
    if (dependentTasks.length > 0) {
      for (const depTask of dependentTasks) {
        console.log(`[dependency] Auto-triggering dependent task: ${depTask.id} (${depTask.prompt?.slice(0, 50)}...)`);
        updateTaskStatus(depTask.id, "running");
        const depTaskData = getTask(depTask.id);
        if (depTaskData) {
          const depFilesDir = path.join(process.cwd(), "task-files", depTask.id);
          if (!fs.existsSync(depFilesDir)) fs.mkdirSync(depFilesDir, { recursive: true });
          const enrichedPrompt = `[Previous task result for context: ${summary.slice(0, 1000)}]\n\n${depTaskData.prompt}`;
          runAgent({ taskId: depTask.id, userMessage: enrichedPrompt, model: (depTaskData.model || "auto") as ModelId }).catch(err => {
            console.error(`[dependency] Failed to run dependent task ${depTask.id}:`, err);
            updateTaskStatus(depTask.id, "failed");
          });
        }
      }
    }
  } catch (e) { console.error("[dependency] Error triggering dependent tasks:", e); }

  return `Task completed. ${summary.slice(0, 200)}${suggestionsText}`;
}

// ─── Self-Evolving Memory ─────────────────────────────────────────────────────
// Automatically cleans up and consolidates the memory bank after each task.
// - Supersedes old task_result memories for the same task
// - Detects and removes contradicted memories
// - Prunes excess auto-generated memories to prevent memory bank bloat

function autoEvolveMemories(summary: string, taskId: string): void {
  const all = listMemory(500);

  // 1. Supersede: if there's an older task_result for the same task prefix, remove the old one
  const taskPrefix = taskId.slice(0, 8);
  const existingTaskResults = all.filter(m =>
    m.key.startsWith("task_result_") &&
    m.key !== `task_result_${taskPrefix}` &&
    m.source_task_id === taskId
  );
  for (const old of existingTaskResults) {
    deleteMemory(old.id);
    console.log(`[memory-evolve] Superseded old task result: ${old.key}`);
  }

  // 2. Contradiction detection: if we now succeeded at something a previous memory says failed,
  //    update or remove the stale failure memory
  const summaryLower = summary.toLowerCase();
  const failurePatterns = [
    /could not be delivered/i, /not configured/i, /failed to/i,
    /error.*occurred/i, /unable to/i, /cannot.*access/i,
  ];
  const staleMemories = all.filter(m => {
    if (!m.tags?.includes("auto")) return false; // only auto-clean auto-generated memories
    const valueLower = m.value.toLowerCase();
    // Check if the old memory reports a failure for something the new summary says succeeded
    return failurePatterns.some(p => p.test(m.value)) &&
      // Simple overlap heuristic: do the memories share significant keywords?
      getKeywordOverlap(summaryLower, valueLower) > 0.3;
  });
  for (const stale of staleMemories) {
    deleteMemory(stale.id);
    console.log(`[memory-evolve] Removed contradicted memory: ${stale.key} (was: ${stale.value.slice(0, 80)})`);
  }

  // 3. Prune: keep at most 100 auto-generated memories; delete oldest excess
  const autoMemories = all
    .filter(m => m.tags?.includes("auto"))
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  if (autoMemories.length > 100) {
    const excess = autoMemories.slice(100);
    for (const old of excess) {
      deleteMemory(old.id);
    }
    if (excess.length > 0) {
      console.log(`[memory-evolve] Pruned ${excess.length} oldest auto-memories (kept latest 100)`);
    }
  }
}

// Helper: compute keyword overlap ratio between two strings
function getKeywordOverlap(a: string, b: string): number {
  const tokensA = new Set(a.split(/\s+/).filter(t => t.length > 3));
  const tokensB = new Set(b.split(/\s+/).filter(t => t.length > 3));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let overlap = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) overlap++;
  }
  return overlap / Math.min(tokensA.size, tokensB.size);
}

// ─── Self-Improvement: Apply Learnings (Otto-inspired) ────────────────────────
// Injects relevant past learnings into the system prompt

function getLearnedInsights(taskPrompt: string): string {
  try {
    const similar = findSimilarLearnings(taskPrompt, 5);
    if (similar.length === 0) return "";

    const insights = similar
      .filter(s => s.confidence > 0.4)
      .map(s => {
        const data = s.pattern_data as Record<string, unknown>;
        const tools = (data.tools_used as string[]) || [];
        const toolsStr = tools.length > 0 ? ` (tools: ${tools.slice(0, 5).join(", ")})` : "";
        return `- [${s.outcome}] "${s.pattern_key.slice(0, 80)}" → confidence: ${(s.confidence * 100).toFixed(0)}%${toolsStr}`;
      });

    if (insights.length === 0) return "";
    return `\n\n## Learned Patterns (from past tasks)\nApply these insights from similar previous tasks:\n${insights.join("\n")}`;
  } catch { return ""; }
}

// ─── Proactive Follow-up Suggestions (Otto-inspired) ──────────────────────────
// After task completion, suggest logical next actions based on workflow patterns

interface FollowUp { label: string; prompt: string; icon: string; }

const WORKFLOW_PATTERNS: Array<{ trigger: RegExp; suggestions: FollowUp[] }> = [
  {
    trigger: /\b(image|picture|illustration|logo|design)\b/i,
    suggestions: [
      { label: "Generate variations", prompt: "Generate 3 variations of the image with different styles", icon: "🎨" },
      { label: "Create mockup", prompt: "Create a product mockup using the generated image", icon: "📱" },
      { label: "Upscale & optimize", prompt: "Optimize the image for web use and create multiple sizes", icon: "📐" },
    ],
  },
  {
    trigger: /\b(research|report|analysis|study)\b/i,
    suggestions: [
      { label: "Create presentation", prompt: "Create a slide deck presentation from this research", icon: "📊" },
      { label: "Draft email summary", prompt: "Draft an email summarizing the key findings for stakeholders", icon: "📧" },
      { label: "Identify action items", prompt: "Extract actionable next steps from this research", icon: "✅" },
    ],
  },
  {
    trigger: /\b(code|app|dashboard|website|component|api)\b/i,
    suggestions: [
      { label: "Write tests", prompt: "Write comprehensive tests for the code that was just created", icon: "🧪" },
      { label: "Add documentation", prompt: "Generate README and API documentation for this code", icon: "📝" },
      { label: "Security review", prompt: "Perform a security audit and review of the created code", icon: "🔒" },
    ],
  },
  {
    trigger: /\b(email|compose|draft|newsletter)\b/i,
    suggestions: [
      { label: "Create follow-up", prompt: "Draft a follow-up email for recipients who don't respond", icon: "🔄" },
      { label: "A/B version", prompt: "Create an A/B test version with a different subject line and tone", icon: "📬" },
    ],
  },
  {
    trigger: /\b(data|csv|spreadsheet|metrics|chart)\b/i,
    suggestions: [
      { label: "Export report", prompt: "Create a formatted PDF report from this data analysis", icon: "📄" },
      { label: "Set up monitoring", prompt: "Create a scheduled task to run this analysis weekly", icon: "⏰" },
    ],
  },
];

function generateFollowUpSuggestions(summary: string, _taskId: string): FollowUp[] {
  const suggestions: FollowUp[] = [];
  for (const pattern of WORKFLOW_PATTERNS) {
    if (pattern.trigger.test(summary)) {
      suggestions.push(...pattern.suggestions);
    }
  }
  // Return top 3 unique suggestions
  return suggestions.slice(0, 3);
}

// ─── Analytics Hook: Track Tool Calls (Otto-inspired) ─────────────────────────

registerAfterToolHook(async (ctx) => {
  try {
    recordAnalyticsEvent({
      id: uuidv4(),
      event_type: "tool_call",
      tool_name: ctx.toolName,
      duration_ms: ctx.duration_ms,
      success: !ctx.error,
      metadata: ctx.error ? { error: ctx.result?.slice(0, 200) } : {},
    });
  } catch { /* best-effort analytics */ }
});

// ─── Live Context Refresh ─────────────────────────────────────────────────────
// Re-generates the dynamic parts of the system prompt (memories, files, skills)
// for use during multi-turn tool loops so the agent always has the freshest state.

function refreshSystemContext(baseSystemPrompt: string, taskId: string, filesDir: string, userMessage: string): string {
  let refreshedPrompt = baseSystemPrompt;

  // Strip old dynamic sections (they'll be re-added with fresh data)
  refreshedPrompt = refreshedPrompt
    .replace(/\n\n## Relevant Memories \(auto-recalled\)[\s\S]*?(?=\n\n##|\n\n$|$)/, "")
    .replace(/\n\n## Global File System[\s\S]*?(?=\n\n##|\n\n$|$)/, "")
    .replace(/\n\n## Uploaded Files[\s\S]*?(?=\n\n##|\n\n$|$)/, "")
    .replace(/\n\n## File Contents \(auto-loaded\)[\s\S]*?(?=\n\n##|\n\n$|$)/, "");

  // Re-inject fresh memories
  try {
    const relevantMemories = memoryRecall(userMessage, 5);
    if (relevantMemories.length > 0) {
      const memLines = relevantMemories.map((m, i) =>
        `${i + 1}. **${m.key}**: ${m.value}${m.tags && m.tags.length > 0 ? ` [${m.tags.join(", ")}]` : ""}`
      );
      refreshedPrompt += `\n\n## Relevant Memories (auto-recalled)\nThese memories from previous tasks may be relevant (live refresh):\n${memLines.join("\n")}\n\nUse these as context. Store new findings with memory_store. Update stale memories with memory_update. Delete incorrect ones with memory_delete.`;
    }
  } catch { /* best-effort */ }

  // Re-inject fresh global file system view
  try {
    const allFiles = listAllFiles(100);
    const allFolders = listFolders();
    const parts: string[] = [];

    if (allFolders.length > 0) {
      const folderLines = allFolders.map(f => {
        const parent = f.parent_id ? allFolders.find(p => p.id === f.parent_id) : null;
        return `- 📁 "${f.name}"${parent ? ` (inside "${parent.name}")` : ""} [id: ${f.id}]`;
      });
      parts.push(`### Folders\n${folderLines.join("\n")}`);
    }

    const currentTaskFiles = allFiles.filter(f => f.task_id === taskId);
    if (currentTaskFiles.length > 0) {
      const fileLines = currentTaskFiles.map(f => {
        const folder = f.folder_id ? allFolders.find(fld => fld.id === f.folder_id) : null;
        return `- ${f.name} (${formatBytes(f.size)}, ${f.mime_type})${folder ? ` [in folder "${folder.name}"]` : ""}`;
      });
      parts.push(`### This Task's Files\n${fileLines.join("\n")}`);
    }

    const otherTaskFiles = allFiles.filter(f => f.task_id !== taskId);
    if (otherTaskFiles.length > 0) {
      const fileLines = otherTaskFiles.slice(0, 30).map(f => {
        const folder = f.folder_id ? allFolders.find(fld => fld.id === f.folder_id) : null;
        return `- ${f.name} (from: "${f.task_title || "untitled"}", ${formatBytes(f.size)}, ${f.mime_type})${folder ? ` [in folder "${folder.name}"]` : ""}`;
      });
      parts.push(`### Files from Other Tasks\n${fileLines.join("\n")}${otherTaskFiles.length > 30 ? `\n... and ${otherTaskFiles.length - 30} more files` : ""}`);
    }

    if (parts.length > 0) {
      refreshedPrompt += `\n\n## Global File System\nYou have access to the complete file system (live refresh). All files you create are automatically registered here.\n\n${parts.join("\n\n")}\n\nYou can reference any file at /api/files/<task_id>/<filename>.`;
    }
  } catch { /* best-effort */ }

  // Re-inject fresh uploaded files in task directory
  try {
    const existingFiles = fs.readdirSync(filesDir);
    if (existingFiles.length > 0) {
      const TEXT_EXTENSIONS = new Set([".txt", ".md", ".csv", ".json", ".xml", ".html", ".css", ".js", ".ts", ".py", ".sh", ".yaml", ".yml", ".sql", ".r", ".log", ".env", ".cfg", ".ini", ".toml", ".jsx", ".tsx", ".vue", ".svelte", ".rb", ".php", ".java", ".c", ".cpp", ".h", ".go", ".rs", ".swift", ".kt"]);
      const fileEntries = existingFiles.map(f => {
        const stat = fs.statSync(path.join(filesDir, f));
        const ext = path.extname(f).toLowerCase();
        const isText = TEXT_EXTENSIONS.has(ext);
        return `- ${f} (${formatBytes(stat.size)}, ${isText ? "text" : "binary"})`;
      });
      refreshedPrompt += `\n\n## Uploaded Files\nFiles in your working directory (live refresh):\n${fileEntries.join("\n")}`;
    }
  } catch { /* best-effort */ }

  return refreshedPrompt;
}

// ─── System Prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(skills?: string): string {
  return `You are Ottomatron — a general-purpose digital computer that creates and executes entire workflows autonomously. You are the next evolution beyond AI chat. Where chat interfaces answer questions, you take action. Where task agents complete tasks, you orchestrate entire workflows that can run for hours.

Current date/time: ${new Date().toISOString()}

## Core Identity
You operate the software stack just like a human co-worker would: by using it. You reason, delegate, search, build, remember, code, and deliver. Every task runs in an isolated compute environment with a real filesystem, real browser capabilities, and real tool integrations.

## Automatic Task Decomposition
When given a complex goal, plan your approach AND start executing in the same response:
1. **Plan and act simultaneously**: Briefly outline your approach in your thinking, then IMMEDIATELY call tools in the same turn — never output a plan without also calling tools
2. **Delegate aggressively**: Use create_sub_agent for each sub-task that can run independently
3. **Parallelize**: Launch multiple sub-agents simultaneously — a document can be drafted by one agent while another gathers the data it needs
4. **Coordinate results**: After sub-agents complete, synthesize their outputs into a cohesive deliverable
5. **Iterate**: If a sub-agent fails or returns insufficient results, create a new one to fill the gap

⚠️ CRITICAL: Every response MUST include at least one tool call. Think and plan in your text, but always pair it with action.

## Multi-Agent Orchestration
Delegate work to specialized sub-agents via create_sub_agent:
- **research**: Deep web research — perform dozens of searches, read hundreds of sources, iteratively refine analysis. Use this for Deep Research tasks.
- **code**: Production-quality code generation, debugging, testing, and deployment
- **writing**: Documents, emails, reports, presentations, creative content
- **data_analysis**: Statistical analysis, visualization, dashboards, financial models
- **web_scraper**: Extract structured data from URLs, crawl sites, build datasets
- **reviewer**: Code review, fact-checking, QA, security audit
- **planner**: Break complex projects into actionable plans with timelines
- **general**: Flexible agent for tasks that span multiple categories
Each sub-agent auto-routes to the best model for that task type and has access to tools.

## Deep Research Protocol
When the task involves research, investigation, or analysis:
1. Start with broad web_search queries to map the landscape
2. Identify the most promising sources and scrape_url each one
3. Cross-reference facts across multiple sources
4. Search again with refined queries based on what you learned
5. Build a comprehensive synthesis with citations
6. Create sub-agents for parallel deep dives into specific aspects
7. Write the final report with structured sections and source links
For deep research tasks, aim for 5-15 searches and 3-8 source reads minimum.

## Financial & Data Analysis
When tasks involve finance, data, or analytics:
- Use execute_code with Python (pandas, matplotlib, numpy) for data processing
- Fetch real-time data via web_search and scrape_url from authoritative sources
- Build interactive HTML dashboards, charts, and data visualizations
- Create Excel-compatible CSV/JSON exports
- Generate financial models, forecasts, and projections
- Always cite data sources and timestamps

## Your Tools
- **web_search**: Real-time search (Perplexity Sonar, Brave, Serper, Tavily) — cascading fallback
- **scrape_url**: Fetch and extract content from any URL with smart content extraction
- **browse_web**: Full browser automation — fill forms, click buttons, navigate pages, take screenshots
- **execute_code**: Run Python, JavaScript, or Bash. Auto-installs packages (pip/npm). Use for calculations, data processing, chart generation, data visualization, file manipulation.
- **write_file / read_file / list_files**: Full filesystem access in task working directory
- **generate_image**: Create images via DALL-E 3
- **replicate_run**: Run ANY of 1000s of AI models — image gen (Flux, SDXL), video, upscaling, background removal, face swap, music, speech, 3D, and more. Auto-selects the optimal model.
- **dream_machine**: Multi-shot video/image production — commercials, storyboards, brand films
- **send_email**: Send emails via Resend or connected services (Gmail, Outlook)
- **connector_call**: 40+ external services — Slack, GitHub, Notion, Stripe, Google Sheets, Linear, Jira, Salesforce, HubSpot, Airtable, and more
- **social_media_post**: Post to Twitter/X, LinkedIn, Instagram, Reddit, Facebook, Bluesky using real browser automation — no API keys needed. Also read feeds and search. Uses persistent browser sessions (cookies saved after first login). Inspired by Browser Use and OpenClaw patterns.
- **memory_store / memory_recall / memory_list / memory_update / memory_delete**: Full persistent memory system — store, search, list, update, and delete memories. Self-evolving: update stale memories rather than creating duplicates. Delete incorrect memories to keep the bank clean.
- **list_skills**: List all available skills with their triggers and status. Use to discover what specialized capabilities are configured.
- **organize_files**: Manage the global file system — create folders, move files into folders, list all files across tasks. All changes are visible in the Files page.
- **create_sub_agent**: Spawn specialized sub-agents for parallel/sequential work
- **request_user_input**: ONLY ask user when you genuinely cannot proceed without their input
- **complete_task**: ALWAYS call this when fully done with comprehensive summary

## Code Execution Environment
- Python with auto-install: if a package is missing, install it first with pip install
- JavaScript/Node.js with npm packages available
- Bash for system commands and file processing
- All output files are auto-detected and registered
- For data viz: prefer matplotlib, plotly, or writing HTML/CSS/JS directly
- For web apps: write complete HTML files with inline CSS/JS

## Execution Philosophy
1. **Be autonomous**: Minimize clarification requests. Infer intent and proceed.
2. **Decompose complexity**: Break hard problems into sub-tasks and delegate.
3. **Use memory proactively**: At the start of every task, use memory_recall to check for relevant past context, user preferences, and project state.
4. **Be thorough**: Don't stop until the task is truly complete. Validate outputs.
5. **Produce polished deliverables**: Build impressive, production-quality outputs.
6. **Store learnings**: Save important findings with memory_store for future tasks.
7. **Cite sources**: Always include URLs and references for research.
8. **Handle errors gracefully**: If a tool fails, try alternative approaches. Create sub-agents to solve sub-problems.
9. **Generate files**: Create downloadable deliverables (HTML, PDF, CSV, JSON, images) — not just text.
10. **Complete with summary**: ALWAYS call complete_task with a comprehensive summary of what was accomplished.

## Workflow Patterns
- **Research Report**: web_search → scrape_url (multiple) → create_sub_agent(research) → execute_code(format) → write_file
- **Data Dashboard**: web_search(data) → execute_code(process+visualize) → write_file(HTML dashboard)
- **Code Project**: plan → create_sub_agent(code) → create_sub_agent(reviewer) → write_file(all files)
- **Email Campaign**: research → create_sub_agent(writing) → send_email or write_file
- **Video Production**: plan shots → dream_machine(storyboard) → complete_task
- **API Integration**: connector_call → process → write_file or connector_call
- **Social Media Campaign**: research → create_sub_agent(writing) → social_media_post(post) → social_media_post(read_feed) to verify
- **Social Media Monitoring**: social_media_post(search, query) → analyze results → memory_store findings
- **Print-on-Demand**: generate_image → connector_call(printify, upload_image) → search_blueprints → get_provider_variants → create_product → publish_product
- **Blog Publishing**: write content → connector_call(shopify, create_blog_post, {title, body_html, tags})

## Memory System — Self-Evolving
Your memory is a living, evolving knowledge base that grows smarter with every task:
- At the START of complex tasks, ALWAYS use memory_recall to check for relevant context
- **Store** user preferences, project details, and key findings with memory_store
- **Update** existing memories with memory_update when you discover new/corrected information — NEVER leave stale data
- **Delete** incorrect or outdated memories with memory_delete — clean memory = accurate memory
- **List** all memories with memory_list to audit and maintain the memory bank
- **Recall** specific context with memory_recall before making assumptions
- Task results are auto-stored in memory for cross-session continuity
- Use specific, descriptive keys for memory entries
- When you find a memory that contradicts current reality, DELETE it immediately
- Memories are automatically refreshed during long tasks so you always have the latest state

## Skills & Capabilities
- Use list_skills to discover all configured skills and their triggers
- Skills provide specialized instructions and model routing for specific task types
- Active skills automatically activate when their triggers match the user's request${skills ? `\n\n## Custom Skills\n${skills}` : ""}`;
}

function getSubAgentSystemPrompt(agentType: string): string {
  const base = `You are a specialized sub-agent in the Ottomatron system. Complete your assigned task thoroughly and autonomously. Current date/time: ${new Date().toISOString()}`;
  const map: Record<string, string> = {
    research: `${base}\n\nYou are a Deep Research Agent. Your job is to conduct thorough, multi-source research.\n\nResearch Protocol:\n1. Start with 3-5 broad web_search queries to map the landscape\n2. Identify the most promising sources from the results\n3. Use scrape_url to read full content from each key source\n4. Cross-reference facts across multiple sources\n5. Run additional searches with refined queries based on what you learned\n6. Synthesize findings into a comprehensive report with citations\n7. Every claim must reference a source URL\n\nAim for 5-10 searches and 3-8 full page reads minimum. Never rely on a single source.`,
    code: `${base}\n\nYou are a Code Specialist. Write clean, well-documented, production-quality code.\n\nCoding Protocol:\n1. Plan the architecture before writing code\n2. Use execute_code to test your code actually runs\n3. Handle edge cases and errors gracefully\n4. Include comments explaining complex logic\n5. If packages are needed, install them first (pip install or npm install via execute_code with bash)\n6. For web apps: write complete, self-contained HTML files with inline CSS/JS\n7. For data processing: use Python with pandas, numpy, matplotlib\n8. Write files with write_file for the user to download`,
    writing: `${base}\n\nYou are a Writing Specialist. Create polished, professional content.\n\nWriting Protocol:\n1. Understand the audience and purpose\n2. Research the topic with web_search if needed\n3. Create well-structured content with headings, sections\n4. Use clear, engaging language appropriate for the audience\n5. Format as Markdown with proper structure\n6. For long documents, save as a file with write_file`,
    data_analysis: `${base}\n\nYou are a Data Analysis Agent. Analyze data and create visualizations.\n\nAnalysis Protocol:\n1. Gather data via web_search, scrape_url, or read_file\n2. Process with Python — use pandas, numpy\n3. Create visualizations with matplotlib, plotly, or HTML/CSS/JS charts\n4. Write HTML dashboards for interactive visualizations\n5. Calculate statistics, trends, projections\n6. Always show your methodology and cite data sources\n7. Export results as files (CSV, HTML, JSON, PNG)`,
    web_scraper: `${base}\n\nYou are a Web Scraping Specialist. Extract structured data from web pages.\n\nScraping Protocol:\n1. Use scrape_url to fetch page content\n2. Parse and structure the extracted data\n3. For complex sites, use browse_web with actions\n4. Output data as JSON, CSV, or structured Markdown\n5. Handle pagination if applicable\n6. Respect rate limits — add delays between requests`,
    reviewer: `${base}\n\nYou are a Review Agent. Check work for accuracy, quality, and completeness.\n\nReview Protocol:\n1. Examine the work product thoroughly\n2. Fact-check claims with web_search when possible\n3. Check code for bugs, security issues, and edge cases\n4. Provide specific, actionable feedback\n5. Rate overall quality and suggest improvements`,
    planner: `${base}\n\nYou are a Planning Agent. Break complex goals into clear, executable plans.\n\nPlanning Protocol:\n1. Analyze the objective and constraints\n2. Break into discrete, actionable steps\n3. Identify dependencies between steps\n4. Estimate effort for each step\n5. Identify risks and mitigation strategies\n6. Output a structured plan with milestones`,
    general: `${base}\n\nYou are a General Agent. Complete whatever task is assigned to you using any tools at your disposal. Be thorough and autonomous.`,
  };
  return map[agentType] || map.general;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toolUseTypeToStepType(toolName: ToolName): AgentStep["type"] {
  const map: Record<string, AgentStep["type"]> = {
    web_search: "search", scrape_url: "search", execute_code: "code_execution",
    write_file: "file_operation", read_file: "file_operation", list_files: "file_operation",
    create_sub_agent: "sub_agent", connector_call: "connector_call",
    request_user_input: "waiting", complete_task: "output",
    memory_store: "reasoning", memory_recall: "reasoning",
    memory_list: "reasoning", memory_delete: "reasoning", memory_update: "reasoning",
    list_skills: "reasoning",
    organize_files: "file_operation",
    generate_image: "file_operation", replicate_run: "file_operation",
    send_email: "connector_call",
    deep_research: "search", finance_data: "search",
    social_media_post: "connector_call",
  };
  return map[toolName] || "reasoning";
}

function toolUseToTitle(name: string, input: Record<string, unknown>): string {
  const titles: Record<string, () => string> = {
    web_search: () => `Searching: "${((input.query as string) || "").slice(0, 60)}"`,
    scrape_url: () => `Scraping: ${((input.url as string) || "").slice(0, 50)}`,
    execute_code: () => `Running ${input.language} code`,
    write_file: () => `Creating file: ${input.filename}`,
    read_file: () => `Reading: ${input.filename}`,
    list_files: () => "Listing files",
    create_sub_agent: () => `Sub-agent: ${input.title}`,
    connector_call: () => `${input.connector_id}: ${input.action}`,
    request_user_input: () => "Waiting for user input",
    complete_task: () => "Task completed",
    memory_store: () => `Storing: "${((input.key as string) || "").slice(0, 40)}"`,
    memory_recall: () => `Recalling: "${((input.query as string) || "").slice(0, 40)}"`,
    memory_list: () => "Listing all memories",
    memory_delete: () => `Deleting memory: ${((input.id as string) || "").slice(0, 20)}`,
    memory_update: () => `Updating: "${((input.key as string) || "").slice(0, 40)}"`,
    list_skills: () => "Listing available skills",
    organize_files: () => `Organizing files: ${input.action}`,
    generate_image: () => `Generating image: ${((input.prompt as string) || "").slice(0, 40)}...`,
    replicate_run: () => `Replicate: ${input.model || "auto"} — ${((input.prompt as string) || "").slice(0, 40)}...`,
    send_email: () => `Sending email to ${input.to}`,
    deep_research: () => `Deep Research: "${((input.topic as string) || "").slice(0, 50)}"`,
    finance_data: () => `Finance: ${input.query_type} ${input.symbol || ""}`,
    social_media_post: () => `Social: ${input.platform} → ${input.action}${input.content ? " — " + ((input.content as string) || "").slice(0, 40) + "..." : ""}`,
  };
  return titles[name]?.() ?? name;
}

function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const types: Record<string, string> = {
    ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
    ".ts": "application/typescript", ".py": "text/x-python", ".json": "application/json",
    ".md": "text/markdown", ".txt": "text/plain", ".pdf": "application/pdf",
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml", ".gif": "image/gif", ".webp": "image/webp",
    ".csv": "text/csv",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".zip": "application/zip", ".sh": "text/x-shellscript",
    ".yaml": "application/yaml", ".yml": "application/yaml",
    ".xml": "application/xml", ".sql": "application/sql",
    ".r": "text/x-r", ".ipynb": "application/x-ipynb+json",
    ".mp3": "audio/mpeg", ".mp4": "video/mp4", ".wav": "audio/wav", ".webm": "video/webm",
  };
  return types[ext] || "application/octet-stream";
}

/**
 * Zod schemas for API request validation.
 *
 * Import these in API routes to validate request bodies before processing.
 * Use `parseBody()` helper for consistent error handling.
 */

import { z } from "zod";
import { NextResponse } from "next/server";

// ─── Shared Enums ─────────────────────────────────────────────────────────────

export const ModelIdSchema = z.enum([
  "auto",
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-3.5-haiku",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
  "gemini-2.0-flash",
  "sonar",
  "sonar-pro",
  "sonar-reasoning-pro",
  "openrouter",
  "free",
]);

export const TaskStatusSchema = z.enum([
  "pending",
  "running",
  "paused",
  "completed",
  "failed",
]);

export const PrioritySchema = z.enum(["low", "medium", "high", "critical"]);

export const TaskSourceSchema = z.enum(["manual", "scheduled", "webhook", "template"]);

// ─── Task Schemas ─────────────────────────────────────────────────────────────

export const CreateTaskSchema = z.object({
  prompt: z.string().min(1, "prompt is required").max(50000),
  title: z.string().max(500).optional(),
  model: ModelIdSchema.optional().default("auto"),
  priority: PrioritySchema.optional().default("medium"),
  tags: z.array(z.string().max(100)).max(50).optional(),
  scheduled_at: z.string().datetime().optional(),
  depends_on: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
  source: TaskSourceSchema.optional(),
});

// ─── Template Schemas ─────────────────────────────────────────────────────────

export const TemplatePostSchema = z.object({
  action: z.enum(["create", "run", "delete"]).optional().default("create"),
  // For create:
  name: z.string().min(1).max(200).optional(),
  prompt: z.string().min(1).max(50000).optional(),
  description: z.string().max(1000).optional(),
  category: z.string().max(100).optional(),
  icon: z.string().max(10).optional(),
  model: z.string().max(100).optional(),
  tags: z.array(z.string().max(100)).max(20).optional(),
  // For run/delete:
  template_id: z.string().uuid().optional(),
  user_input: z.string().max(50000).optional(),
});

// ─── Scheduled Task Schemas ───────────────────────────────────────────────────

export const CreateScheduledTaskSchema = z.object({
  name: z.string().min(1, "name is required").max(200),
  prompt: z.string().min(1, "prompt is required").max(50000),
  schedule_type: z
    .enum(["once", "interval", "daily", "weekly", "cron"])
    .optional()
    .default("once"),
  schedule_expr: z.string().max(200).optional(),
  next_run_at: z.string().datetime().optional(),
  model: z.string().max(100).optional().default("auto"),
  delete_after_run: z.boolean().optional().default(false),
});

// ─── Generate Schemas ─────────────────────────────────────────────────────────

export const GenerateSchema = z.object({
  prompt: z.string().min(1, "prompt is required").max(50000),
  model: z.string().max(200).optional(),
  provider: z.enum(["auto", "replicate", "huggingface"]).optional().default("auto"),
  params: z.record(z.unknown()).optional(),
  imageUrl: z.string().url().optional(),
  fileUrl: z.string().url().optional(),
  taskType: z.string().max(100).optional(),
});

// ─── Memory Schemas ───────────────────────────────────────────────────────────

export const StoreMemorySchema = z.object({
  key: z.string().min(1, "key is required").max(500),
  value: z.string().min(1, "value is required").max(100000),
  source_task_id: z.string().max(200).optional(),
  tags: z.array(z.string().max(100)).max(50).optional().default([]),
});

// ─── Connector Env Schemas ────────────────────────────────────────────────────

export const SaveEnvKeysSchema = z.object({
  keys: z.record(z.string().max(5000)),
});

// ─── Helper: Parse + validate request body ────────────────────────────────────

/**
 * Parse and validate a request body against a Zod schema.
 * Returns `{ data }` on success or `{ error: NextResponse }` on failure.
 */
export async function parseBody<T extends z.ZodSchema>(
  request: Request,
  schema: T,
): Promise<{ data: z.infer<T>; error?: never } | { data?: never; error: NextResponse }> {
  try {
    const raw = await request.json();
    const result = schema.safeParse(raw);
    if (!result.success) {
      const messages = result.error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`,
      );
      return {
        error: NextResponse.json(
          { error: "Validation failed", details: messages },
          { status: 400 },
        ),
      };
    }
    return { data: result.data };
  } catch {
    return {
      error: NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      ),
    };
  }
}

/**
 * Task Templates API — Quick Actions
 *
 * GET  /api/templates         — List all templates
 * POST /api/templates         — Create a custom template
 * POST /api/templates/run     — Run a template (creates + starts a task)
 */

import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import {
  listTemplates,
  createTemplate,
  deleteTemplate,
  getTemplate,
  incrementTemplateUseCount,
  createTask,
} from "@/lib/db";
import { safeErrorMessage } from "@/lib/constants";
import { TemplatePostSchema, parseBody } from "@/lib/schemas";
import type { ModelId } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET /api/templates — List all templates
export async function GET() {
  try {
    const templates = listTemplates();
    return NextResponse.json(templates);
  } catch (err) {
    return NextResponse.json({ error: safeErrorMessage(err) }, { status: 500 });
  }
}

// POST /api/templates — Create custom template OR run an existing one
export async function POST(request: NextRequest) {
  try {
    const { data: body, error: validationError } = await parseBody(request, TemplatePostSchema);
    if (validationError) return validationError;

    const action = body.action || "create";

    if (action === "delete") {
      // Prefer using the DELETE HTTP method instead
      if (!body.template_id) {
        return NextResponse.json({ error: "template_id is required for action=delete" }, { status: 400 });
      }
      deleteTemplate(body.template_id);
      return NextResponse.json({ ok: true });
    }

    if (action === "run") {
      // Run a template: create a task from it
      if (!body.template_id) {
        return NextResponse.json({ error: "template_id is required for action=run" }, { status: 400 });
      }
      const template = getTemplate(body.template_id);
      if (!template) {
        return NextResponse.json({ error: "Template not found" }, { status: 404 });
      }

      const fullPrompt = body.user_input
        ? template.prompt + "\n\n" + body.user_input
        : template.prompt;

      const taskId = uuidv4();
      const now = new Date().toISOString();
      const task = createTask({
        id: taskId,
        title: body.user_input
          ? `${template.name}: ${body.user_input.slice(0, 60)}`
          : template.name,
        prompt: fullPrompt,
        description: fullPrompt.slice(0, 200),
        status: "pending",
        priority: "medium",
        model: (template.model || "auto") as ModelId,
        tags: [...(template.tags || []), "template", `tpl:${template.id}`],
        metadata: {
          template_id: template.id,
          template_name: template.name,
        },
        created_at: now,
        updated_at: now,
      });

      incrementTemplateUseCount(template.id);

      return NextResponse.json({
        ok: true,
        task_id: task.id,
        template_id: template.id,
        message: "Task created from template. Run it via /api/tasks/{task_id}/run.",
      }, { status: 201 });
    }

    // Create a custom template
    if (!body.name || !body.prompt) {
      return NextResponse.json({ error: "name and prompt are required" }, { status: 400 });
    }

    const template = createTemplate({
      id: uuidv4(),
      name: body.name,
      description: body.description || "",
      prompt: body.prompt,
      category: body.category || "custom",
      icon: body.icon || "📋",
      model: body.model || "auto",
      tags: body.tags || [],
    });

    return NextResponse.json(template, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: safeErrorMessage(err) }, { status: 500 });
  }
}

// DELETE /api/templates?id=xxx — delete a template by id
export async function DELETE(request: NextRequest) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id query parameter is required" }, { status: 400 });
  }
  try {
    deleteTemplate(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: safeErrorMessage(err) }, { status: 500 });
  }
}

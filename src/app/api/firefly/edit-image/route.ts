/**
 * Firefly — Edit Image API (Generative Fill / Remove / Expand)
 * POST /api/firefly/edit-image
 *
 * Operations:
 *   - generative-fill: Add/replace objects in selected area
 *   - remove: Remove objects from image
 *   - replace-background: Replace image background
 *   - expand: Outpaint / generative expand
 *   - upscale: Enhance resolution
 *   - remove-bg: Remove background entirely
 *
 * Uses OpenAI image editing + Replicate models as fallback.
 */

import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface EditImageRequest {
  imageUrl: string;         // Source image URL or base64
  operation: "generative-fill" | "remove" | "replace-background" | "expand" | "upscale" | "remove-bg" | "prompt-edit";
  prompt?: string;          // Description of edit
  maskUrl?: string;         // Mask for inpainting (base64 or URL)
  expandDirection?: "all" | "left" | "right" | "up" | "down";
  expandRatio?: string;     // Target aspect ratio for expand
  expandWidth?: number;
  expandHeight?: number;
  upscaleFactor?: number;   // 2x, 4x
  model?: string;           // Dynamic model ID from search
}

async function editWithReplicate(
  body: EditImageRequest,
): Promise<{ url: string; model: string }> {
  const apiKey = process.env.REPLICATE_API_TOKEN;
  if (!apiKey) throw new Error("REPLICATE_API_TOKEN not configured");

  let replicateModel: string;
  let input: Record<string, unknown>;

  switch (body.operation) {
    case "generative-fill": {
      replicateModel = "stability-ai/stable-diffusion-inpainting";
      input = {
        image: body.imageUrl,
        mask: body.maskUrl,
        prompt: body.prompt || "seamless fill matching surrounding area",
        num_outputs: 1,
        guidance_scale: 7.5,
        num_inference_steps: 30,
      };
      break;
    }
    case "remove": {
      replicateModel = "black-forest-labs/flux-fill-pro";
      input = {
        image: body.imageUrl,
        mask: body.maskUrl,
        prompt: body.prompt || "clean, seamless background matching surrounding area, remove object",
        steps: 30,
      };
      break;
    }
    case "replace-background": {
      // Use Flux fill for background replacement
      replicateModel = "black-forest-labs/flux-fill-pro";
      input = {
        image: body.imageUrl,
        mask: body.maskUrl,
        prompt: body.prompt || "professional background",
        steps: 30,
      };
      break;
    }
    case "expand": {
      replicateModel = "fofr/image-outpainter";
      input = {
        image: body.imageUrl,
        prompt: body.prompt || "",
        expand_left: body.expandDirection === "all" || body.expandDirection === "left" ? 256 : 0,
        expand_right: body.expandDirection === "all" || body.expandDirection === "right" ? 256 : 0,
        expand_up: body.expandDirection === "all" || body.expandDirection === "up" ? 256 : 0,
        expand_down: body.expandDirection === "all" || body.expandDirection === "down" ? 256 : 0,
      };
      // Use custom dimensions if specified
      if (body.expandWidth) (input as Record<string, unknown>).width = body.expandWidth;
      if (body.expandHeight) (input as Record<string, unknown>).height = body.expandHeight;
      break;
    }
    case "upscale": {
      replicateModel = "nightmareai/real-esrgan";
      input = {
        image: body.imageUrl,
        scale: body.upscaleFactor || 2,
        face_enhance: true,
      };
      break;
    }
    case "remove-bg": {
      replicateModel = "cjwbw/rembg";
      input = {
        image: body.imageUrl,
      };
      break;
    }
    case "prompt-edit": {
      // Use instruct-pix2pix for text-based editing
      replicateModel = "timothybrooks/instruct-pix2pix";
      input = {
        image: body.imageUrl,
        prompt: body.prompt || "edit the image",
        num_inference_steps: 50,
        image_guidance_scale: 1.5,
        guidance_scale: 7.5,
      };
      break;
    }
    default:
      throw new Error(`Unknown operation: ${body.operation}`);
  }

  const res = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Prefer: "wait",
    },
    body: JSON.stringify({
      model: replicateModel,
      input,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Replicate error: ${err}`);
  }

  const data = await res.json();
  let url = "";
  if (Array.isArray(data.output)) {
    url = data.output[0] || "";
  } else if (typeof data.output === "string") {
    url = data.output;
  }

  if (!url && data.urls?.get) {
    // Need to poll
    let pollData = data;
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const pollRes = await fetch(data.urls.get, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      pollData = await pollRes.json();
      if (pollData.status === "succeeded") {
        url = Array.isArray(pollData.output) ? pollData.output[0] : pollData.output;
        break;
      }
      if (pollData.status === "failed" || pollData.status === "canceled") {
        throw new Error(`Prediction ${pollData.status}: ${pollData.error || "unknown"}`);
      }
    }
  }

  return { url, model: replicateModel };
}

async function editWithDynamicModel(
  body: EditImageRequest,
): Promise<{ url: string }> {
  const { runReplicateTask } = await import("@/lib/replicate");
  const fs = await import("fs");
  const path = await import("path");
  const { ensureFilesDir } = await import("@/lib/db");

  const taskId = `ff-edit-dyn-${Date.now()}-${uuidv4().slice(0, 8)}`;
  const filesDir = path.join(ensureFilesDir(), taskId);
  if (!fs.existsSync(filesDir)) fs.mkdirSync(filesDir, { recursive: true });

  const result = await runReplicateTask({
    prompt: body.prompt || `${body.operation} the image`,
    model: body.model!,
    params: {
      image: body.imageUrl,
      ...(body.maskUrl ? { mask: body.maskUrl } : {}),
      ...(body.upscaleFactor ? { scale: body.upscaleFactor } : {}),
    },
    filesDir,
  });

  if (result.files?.length) {
    for (const f of result.files) {
      if (f.mimeType?.startsWith("image/")) {
        return { url: `/api/files/${taskId}/${f.filename}` };
      }
    }
    return { url: `/api/files/${taskId}/${result.files[0].filename}` };
  }
  throw new Error(`Dynamic edit model "${body.model}" produced no image output`);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as EditImageRequest;
    const { imageUrl, operation } = body;

    if (!imageUrl) {
      return NextResponse.json({ error: "imageUrl is required" }, { status: 400 });
    }
    if (!operation) {
      return NextResponse.json({ error: "operation is required" }, { status: 400 });
    }

    const editId = `ff-edit-${Date.now()}-${uuidv4().slice(0, 8)}`;

    // If a dynamic model was specified, use runReplicateTask
    if (body.model && body.model.includes("/")) {
      const result = await editWithDynamicModel(body);
      return NextResponse.json({
        id: editId,
        status: "completed",
        model: body.model,
        operation,
        result: { url: result.url },
        createdAt: new Date().toISOString(),
      });
    }

    const result = await editWithReplicate(body);

    return NextResponse.json({
      id: editId,
      status: "completed",
      model: result.model,
      operation,
      result: {
        url: result.url,
      },
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Firefly edit-image error:", err);
    return NextResponse.json(
      { error: (err as Error).message || "Edit failed" },
      { status: 500 }
    );
  }
}

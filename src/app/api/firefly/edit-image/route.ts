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
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Upload an image (base64 data URL or local /api/files/... path) to Replicate's
 * file hosting and return a public https URL Replicate models can fetch.
 * If the input is already a public http(s) URL, return it as-is.
 */
async function toReplicateUrl(imageUrl: string, apiKey: string): Promise<string> {
  // Already a public URL — use directly
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) return imageUrl;

  let buf: Buffer;
  let mimeType = "image/png";

  if (imageUrl.startsWith("data:")) {
    // base64 data URL
    const [header, b64] = imageUrl.split(",");
    const mt = header.match(/data:(image\/[^;]+)/)?.[1];
    if (mt) mimeType = mt;
    buf = Buffer.from(b64, "base64");
  } else {
    // Local path like /api/files/<taskId>/foo.png — resolve to disk
    const { ensureFilesDir } = await import("@/lib/db");
    const stripped = imageUrl.replace(/^\/api\/files\//, "");
    const diskPath = path.join(ensureFilesDir(), stripped);
    buf = fs.readFileSync(diskPath);
    const ext = path.extname(diskPath).toLowerCase();
    if (ext === ".jpg" || ext === ".jpeg") mimeType = "image/jpeg";
    else if (ext === ".webp") mimeType = "image/webp";
  }

  // Upload to Replicate Files API
  const form = new FormData();
  form.append("content", new Blob([new Uint8Array(buf)], { type: mimeType }), `image.${mimeType.split("/")[1]}`);
  const resp = await fetch("https://api.replicate.com/v1/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!resp.ok) throw new Error(`Failed to upload image to Replicate: ${await resp.text()}`);
  const data = await resp.json() as { urls?: { get?: string } };
  const url = data.urls?.get;
  if (!url) throw new Error("Replicate file upload returned no URL");
  return url;
}

/**
 * Create a Replicate prediction using the model endpoint (no version needed).
 * Falls back to version-based /v1/predictions on 404.
 * Retries once on 429 after the retry_after delay.
 */
async function replicatePredict(
  apiKey: string,
  replicateModel: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const [owner, name] = replicateModel.split("/");
  const authHeaders = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Prefer: "wait",
  };

  async function post(url: string, bodyObj: object): Promise<Response> {
    let resp = await fetch(url, { method: "POST", headers: authHeaders, body: JSON.stringify(bodyObj) });
    if (resp.status === 429) {
      const text = await resp.text();
      let wait = 10;
      try { const p = JSON.parse(text) as { retry_after?: number }; if (typeof p.retry_after === "number") wait = p.retry_after; } catch { /* ignore */ }
      await new Promise(r => setTimeout(r, (wait + 1) * 1000));
      resp = await fetch(url, { method: "POST", headers: authHeaders, body: JSON.stringify(bodyObj) });
    }
    return resp;
  }

  // Try the model-specific endpoint first (uses latest version automatically)
  let resp = await post(`https://api.replicate.com/v1/models/${owner}/${name}/predictions`, { input });

  // Older/community models require an explicit version hash
  if (resp.status === 404) {
    let version: string | undefined;
    const apiH = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
    const modelResp = await fetch(`https://api.replicate.com/v1/models/${owner}/${name}`, { headers: apiH });
    if (modelResp.ok) {
      const md = await modelResp.json() as { latest_version?: { id?: string } };
      version = md.latest_version?.id;
    }
    if (!version) {
      const vResp = await fetch(`https://api.replicate.com/v1/models/${owner}/${name}/versions`, { headers: apiH });
      if (vResp.ok) {
        const vd = await vResp.json() as { results?: Array<{ id: string }> };
        version = vd.results?.[0]?.id;
      }
    }
    if (version) {
      resp = await post(`https://api.replicate.com/v1/predictions`, { version, input });
    }
  }

  if (!resp.ok) throw new Error(`Replicate error: ${await resp.text()}`);
  return resp.json();
}

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

  // Convert local paths / base64 data URLs to public Replicate-hosted URLs
  const imageUrl = await toReplicateUrl(body.imageUrl, apiKey);
  const maskUrl = body.maskUrl ? await toReplicateUrl(body.maskUrl, apiKey) : undefined;

  let replicateModel: string;
  let input: Record<string, unknown>;

  switch (body.operation) {
    case "generative-fill": {
      replicateModel = "stability-ai/stable-diffusion-inpainting";
      input = {
        image: imageUrl,
        mask: maskUrl,
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
        image: imageUrl,
        mask: maskUrl,
        prompt: body.prompt || "clean, seamless background matching surrounding area, remove object",
        steps: 30,
      };
      break;
    }
    case "replace-background": {
      // Use Flux fill for background replacement
      replicateModel = "black-forest-labs/flux-fill-pro";
      input = {
        image: imageUrl,
        mask: maskUrl,
        prompt: body.prompt || "professional background",
        steps: 30,
      };
      break;
    }
    case "expand": {
      replicateModel = "fofr/image-outpainter";
      input = {
        image: imageUrl,
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
        image: imageUrl,
        scale: body.upscaleFactor || 2,
        face_enhance: true,
      };
      break;
    }
    case "remove-bg": {
      replicateModel = "cjwbw/rembg";
      input = {
        image: imageUrl,
      };
      break;
    }
    case "prompt-edit": {
      // Use instruct-pix2pix for text-based editing
      replicateModel = "timothybrooks/instruct-pix2pix";
      input = {
        image: imageUrl,
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

  const data = await replicatePredict(apiKey, replicateModel, input) as {
    output?: string | string[];
    urls?: { get?: string };
    status?: string;
    error?: string;
  };
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
        url = Array.isArray(pollData.output) ? (pollData.output[0] ?? "") : (pollData.output ?? "");
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
  const apiKey = process.env.REPLICATE_API_TOKEN;
  if (!apiKey) throw new Error("REPLICATE_API_TOKEN not configured");

  const { runReplicateTask } = await import("@/lib/replicate");
  const fsM = await import("fs");
  const pathM = await import("path");
  const { ensureFilesDir } = await import("@/lib/db");

  // Ensure images are public URLs before passing to Replicate
  const imageUrl = await toReplicateUrl(body.imageUrl, apiKey);
  const maskUrl = body.maskUrl ? await toReplicateUrl(body.maskUrl, apiKey) : undefined;

  const taskId = `ff-edit-dyn-${Date.now()}-${uuidv4().slice(0, 8)}`;
  const filesDir = pathM.join(ensureFilesDir(), taskId);
  if (!fsM.existsSync(filesDir)) fsM.mkdirSync(filesDir, { recursive: true });

  const result = await runReplicateTask({
    prompt: body.prompt || `${body.operation} the image`,
    model: body.model!,
    params: {
      image: imageUrl,
      ...(maskUrl ? { mask: maskUrl } : {}),
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

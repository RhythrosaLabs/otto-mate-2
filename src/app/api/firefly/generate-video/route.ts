/**
 * Firefly — Generate Video API
 * POST /api/firefly/generate-video
 *
 * Text-to-video and Image-to-video generation.
 * Uses Replicate video models (Minimax, Kling, Runway) with fallback.
 */

import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface GenerateVideoRequest {
  prompt: string;
  model?: string;        // "firefly-video" | "minimax" | "kling" | "runway"
  duration?: number;     // 4 or 5 or 10
  aspectRatio?: string;  // "16:9" | "9:16" | "1:1"
  imageUrl?: string;     // For image-to-video
  motionIntensity?: number; // 0-100
  cameraMotion?: string; // "none" | "pan-left" | "pan-right" | "zoom-in" | "zoom-out" | "orbit" | "tilt-up" | "tilt-down"
}

const KNOWN_MODELS = new Set([
  "firefly-video", "minimax", "kling", "wan", "seedance",
]);

async function generateVideo(body: GenerateVideoRequest): Promise<{ url: string; model: string }> {
  const apiKey = process.env.REPLICATE_API_TOKEN;
  if (!apiKey) throw new Error("REPLICATE_API_TOKEN not configured");

  // If the model is a dynamic (searched) model, use runReplicateTask
  const modelName = body.model || "minimax";
  if (!KNOWN_MODELS.has(modelName) && modelName.includes("/")) {
    return generateWithDynamic(body, modelName);
  }

  let replicateModel: string;
  let input: Record<string, unknown>;

  switch (modelName) {
    case "minimax":
    case "firefly-video": {
      replicateModel = "minimax/video-01-live";
      input = {
        prompt: body.prompt,
        ...(body.imageUrl ? { first_frame_image: body.imageUrl } : {}),
      };
      break;
    }
    case "kling": {
      replicateModel = "fofr/kling-video";
      input = {
        prompt: body.prompt,
        duration: String(body.duration || 5),
        aspect_ratio: body.aspectRatio || "16:9",
        ...(body.imageUrl ? { start_image_url: body.imageUrl } : {}),
      };
      break;
    }
    case "wan": {
      replicateModel = body.imageUrl 
        ? "wan-video/wan2.1-i2v-480p"
        : "wan-video/wan2.1-t2v-480p";
      input = {
        prompt: body.prompt,
        ...(body.imageUrl ? { image: body.imageUrl } : {}),
        max_area: "832x480",
        num_frames: body.duration === 10 ? 81 : 49,
      };
      break;
    }
    case "seedance": {
      replicateModel = "bytedance/seedance-1-lite";
      input = {
        prompt: body.prompt,
        ...(body.imageUrl ? { image: body.imageUrl } : {}),
        duration: body.duration || 5,
        seed: Math.floor(Math.random() * 100000),
      };
      break;
    }
    default: {
      replicateModel = "minimax/video-01-live";
      input = {
        prompt: body.prompt,
        ...(body.imageUrl ? { first_frame_image: body.imageUrl } : {}),
      };
    }
  }

  const res = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Prefer: "wait=120",
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
  
  if (typeof data.output === "string") {
    url = data.output;
  } else if (Array.isArray(data.output)) {
    url = data.output[0];
  }

  // Poll if needed (cap at 90 iterations × 3s = 270s to stay within maxDuration 300s)
  if (!url && data.urls?.get) {
    for (let i = 0; i < 90; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const pollRes = await fetch(data.urls.get, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const pollData = await pollRes.json();
      if (pollData.status === "succeeded") {
        url = typeof pollData.output === "string" ? pollData.output : pollData.output?.[0];
        break;
      }
      if (pollData.status === "failed" || pollData.status === "canceled") {
        throw new Error(`Video generation ${pollData.status}: ${pollData.error || "unknown"}`);
      }
    }
  }

  return { url, model: replicateModel };
}

async function generateWithDynamic(
  body: GenerateVideoRequest,
  modelId: string,
): Promise<{ url: string; model: string }> {
  const { runReplicateTask } = await import("@/lib/replicate");
  const fs = await import("fs");
  const path = await import("path");
  const { ensureFilesDir } = await import("@/lib/db");

  const taskId = `ff-vid-dyn-${Date.now()}-${uuidv4().slice(0, 8)}`;
  const filesDir = path.join(ensureFilesDir(), taskId);
  if (!fs.existsSync(filesDir)) fs.mkdirSync(filesDir, { recursive: true });

  const result = await runReplicateTask({
    prompt: body.prompt,
    model: modelId,
    params: {
      ...(body.imageUrl ? { image: body.imageUrl, first_frame_image: body.imageUrl } : {}),
      ...(body.duration ? { duration: body.duration } : {}),
      ...(body.aspectRatio ? { aspect_ratio: body.aspectRatio } : {}),
    },
    filesDir,
  });

  let url = "";
  if (result.files?.length) {
    for (const f of result.files) {
      if (f.mimeType?.startsWith("video/")) {
        url = `/api/files/${taskId}/${f.filename}`;
        break;
      }
    }
    // Fallback to first file if no video mime
    if (!url) url = `/api/files/${taskId}/${result.files[0].filename}`;
  }
  if (!url) throw new Error(`Dynamic video model "${modelId}" produced no output`);

  return { url, model: modelId };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as GenerateVideoRequest;

    if (!body.prompt?.trim()) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const genId = `ff-vid-${Date.now()}-${uuidv4().slice(0, 8)}`;
    const result = await generateVideo(body);

    return NextResponse.json({
      id: genId,
      status: "completed",
      model: result.model,
      prompt: body.prompt,
      video: {
        url: result.url,
        duration: body.duration || 5,
        aspectRatio: body.aspectRatio || "16:9",
      },
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Firefly generate-video error:", err);
    return NextResponse.json(
      { error: (err as Error).message || "Video generation failed" },
      { status: 500 }
    );
  }
}

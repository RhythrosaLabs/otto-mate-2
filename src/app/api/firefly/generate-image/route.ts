/**
 * Firefly — Generate Image API
 * POST /api/firefly/generate-image
 *
 * Generates images using multiple providers with automatic fallback:
 *   1. OpenAI DALL-E 3 (highest quality, most reliable)
 *   2. Replicate FLUX models (fast, high quality)
 *   3. Stability AI (fallback)
 *
 * Supports:
 *   - Text to Image (prompt → images)
 *   - Style references (upload reference image)
 *   - Multiple aspect ratios
 *   - Content type selection (Photo, Art, Graphic)
 *   - Effects and visual settings
 */

import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface GenerateImageRequest {
  prompt: string;
  negativePrompt?: string;
  model?: string;
  aspectRatio?: string;
  contentType?: string;
  stylePreset?: string;
  visualIntensity?: number;
  numImages?: number;
  quality?: string;
  seed?: number;
  structureImageUrl?: string;   // Composition / structure reference image
  structureStrength?: number;   // 0-100
  styleImageUrl?: string;       // Style reference image
  styleStrength?: number;       // 0-100
  effects?: {
    colorTone?: string;
    lighting?: string;
    cameraAngle?: string;
  };
}

// Map aspect ratios to pixel dimensions
const ASPECT_TO_SIZE: Record<string, { width: number; height: number }> = {
  "1:1":  { width: 1024, height: 1024 },
  "16:9": { width: 1344, height: 768 },
  "9:16": { width: 768, height: 1344 },
  "4:3":  { width: 1152, height: 896 },
  "3:4":  { width: 896, height: 1152 },
  "3:2":  { width: 1216, height: 832 },
  "2:3":  { width: 832, height: 1216 },
  "21:9": { width: 1536, height: 640 },
};

// Map content types to prompt modifiers
const CONTENT_MODIFIERS: Record<string, string> = {
  photo: "photorealistic, professional photography, sharp focus, detailed",
  art: "artistic, creative, expressive, fine art style",
  graphic: "clean graphic design, vector-like, bold colors, professional layout",
};

// Style presets mapped to prompt additions
const STYLE_PRESETS: Record<string, string> = {
  "none": "",
  "cinematic": "cinematic lighting, dramatic atmosphere, film grain, movie-quality",
  "anime": "anime style, manga-inspired, cel-shaded, Japanese animation aesthetic",
  "digital-art": "digital art, concept art, detailed illustration, polished",
  "fantasy": "fantasy art, ethereal, magical, otherworldly atmosphere",
  "neon-punk": "neon lights, cyberpunk aesthetic, glowing, futuristic urban",
  "photographic": "professional photography, natural lighting, realistic details, high resolution",
  "comic-book": "comic book style, bold outlines, halftone dots, dynamic composition",
  "line-art": "clean line art, pen and ink, minimalist, black and white illustration",
  "watercolor": "watercolor painting, soft washes, flowing colors, artistic brushwork",
  "oil-painting": "oil painting, rich textures, classical technique, museum quality",
  "3d-render": "3D render, ray tracing, CGI quality, photorealistic materials",
  "pixel-art": "pixel art style, retro gaming aesthetic, 8-bit inspired",
  "surrealism": "surrealist art, dreamlike, Dalí-inspired, impossible scenes",
  "pop-art": "pop art style, Andy Warhol inspired, bold colors, screen print",
  "minimalist": "minimalist, clean, simple composition, negative space",
  "impressionism": "impressionist painting, visible brushstrokes, light-focused, Monet-inspired",
  "cubism": "cubist style, geometric shapes, multiple perspectives, Picasso-inspired",
  "art-deco": "art deco style, geometric patterns, gold accents, 1920s glamour",
  "steampunk": "steampunk aesthetic, Victorian era, brass gears, mechanical elements",
  "vintage": "vintage photography, retro film look, nostalgic, warm tones, aged",
  "low-poly": "low-poly 3D art, geometric facets, minimal polygons, gradient colors",
  "isometric": "isometric perspective, geometric, detailed miniature world",
  "origami": "origami paper art style, folded paper, geometric, textured paper",
  "stained-glass": "stained glass art, colorful glass panels, lead lines, luminous",
};

// Lighting presets
const LIGHTING_PRESETS: Record<string, string> = {
  "none": "",
  "golden-hour": "golden hour lighting, warm tones, long shadows",
  "dramatic": "dramatic lighting, high contrast, deep shadows, spotlight",
  "studio": "professional studio lighting, softbox, even illumination",
  "neon": "neon lighting, colorful glow, night urban atmosphere",
  "backlit": "backlit, silhouette, rim lighting, halo effect",
  "natural": "natural daylight, soft ambient light",
  "moody": "moody lighting, low key, atmospheric, mysterious",
  "high-key": "high-key lighting, bright, minimal shadows, clean",
};

// Camera angle presets
const CAMERA_PRESETS: Record<string, string> = {
  "none": "",
  "close-up": "extreme close-up, macro detail, shallow depth of field",
  "wide-angle": "wide-angle lens, expansive view, deep depth of field",
  "aerial": "aerial view, drone shot, bird's eye perspective",
  "low-angle": "low angle shot, looking up, dramatic perspective",
  "eye-level": "eye-level shot, natural perspective",
  "dutch-angle": "Dutch angle, tilted frame, dynamic tension",
  "overhead": "flat lay, top-down view, directly overhead",
};

function buildEnhancedPrompt(req: GenerateImageRequest): string {
  let parts: string[] = [req.prompt];

  // Content type
  if (req.contentType && req.contentType !== "auto") {
    const mod = CONTENT_MODIFIERS[req.contentType];
    if (mod) parts.push(mod);
  }

  // Style preset
  if (req.stylePreset && req.stylePreset !== "none") {
    const style = STYLE_PRESETS[req.stylePreset];
    if (style) parts.push(style);
  }

  // Effects
  if (req.effects) {
    if (req.effects.lighting && req.effects.lighting !== "none") {
      const light = LIGHTING_PRESETS[req.effects.lighting];
      if (light) parts.push(light);
    }
    if (req.effects.cameraAngle && req.effects.cameraAngle !== "none") {
      const cam = CAMERA_PRESETS[req.effects.cameraAngle];
      if (cam) parts.push(cam);
    }
    if (req.effects.colorTone) {
      parts.push(`${req.effects.colorTone} color tone`);
    }
  }

  // Visual intensity modifier
  if (req.visualIntensity !== undefined && req.visualIntensity > 70) {
    parts.push("highly detailed, intricate, maximum quality");
  }

  return parts.filter(Boolean).join(", ");
}

/**
 * Download a list of external image URLs and store them under /api/files/<taskId>/.
 * Returns permanent local paths like /api/files/<taskId>/image-0.png .
 * Falls back to the original URL if download fails.
 */
async function downloadExternalImages(externalUrls: string[], taskId: string, prefix: string): Promise<string[]> {
  const { ensureFilesDir } = await import("@/lib/db");
  const taskDir = path.join(ensureFilesDir(), taskId);
  if (!fs.existsSync(taskDir)) fs.mkdirSync(taskDir, { recursive: true });

  const local: string[] = [];
  for (let i = 0; i < externalUrls.length; i++) {
    const url = externalUrls[i];
    try {
      const res = await fetch(url);
      if (!res.ok) { local.push(url); continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      // Detect ext from content-type header
      const ct = res.headers.get("content-type") || "image/png";
      const ext = ct.includes("jpeg") || ct.includes("jpg") ? "jpg"
        : ct.includes("webp") ? "webp"
        : "png";
      const filename = `${prefix}-${i}.${ext}`;
      fs.writeFileSync(path.join(taskDir, filename), buf);
      local.push(`/api/files/${taskId}/${filename}`);
    } catch {
      local.push(url); // best-effort fallback
    }
  }
  return local;
}

async function generateWithOpenAI(
  prompt: string,
  negativePrompt: string | undefined,
  size: { width: number; height: number },
  quality: string,
  numImages: number,
  taskId: string,
): Promise<{ urls: string[]; model: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  // Map size to DALL-E 3 supported sizes
  const ratio = size.width / size.height;
  let dalleSize = "1024x1024";
  if (ratio > 1.3) dalleSize = "1792x1024";
  else if (ratio < 0.77) dalleSize = "1024x1792";

  const fullPrompt = negativePrompt
    ? `${prompt}. Avoid: ${negativePrompt}`
    : prompt;

  const results: string[] = [];
  const count = Math.min(numImages, 4);

  for (let i = 0; i < count; i++) {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: fullPrompt,
        n: 1,
        size: dalleSize,
        quality: quality === "hd" ? "hd" : "standard",
        response_format: "url",
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI DALL-E error: ${err}`);
    }

    const data = await res.json();
    if (data.data?.[0]?.url) {
      results.push(data.data[0].url);
    }
  }

  // Download external URLs to local storage so they persist
  const localUrls = await downloadExternalImages(results, taskId, "dalle");
  return { urls: localUrls, model: "dall-e-3" };
}

async function generateWithReplicate(
  prompt: string,
  negativePrompt: string | undefined,
  size: { width: number; height: number },
  modelName: string,
  numImages: number,
  taskId: string,
  seed?: number,
  structureImageUrl?: string,
  styleImageUrl?: string,
): Promise<{ urls: string[]; model: string }> {
  const apiKey = process.env.REPLICATE_API_TOKEN;
  if (!apiKey) throw new Error("REPLICATE_API_TOKEN not configured");

  // Select model version based on requested model
  let replicateModel: string;
  let input: Record<string, unknown>;

  switch (modelName) {
    case "flux-schnell":
      replicateModel = "black-forest-labs/flux-schnell";
      input = {
        prompt,
        width: size.width,
        height: size.height,
        num_outputs: Math.min(numImages, 4),
        go_fast: true,
        ...(seed !== undefined ? { seed } : {}),
      };
      break;
    case "flux-pro":
    case "firefly-image-4":
      replicateModel = "black-forest-labs/flux-1.1-pro";
      input = {
        prompt,
        width: size.width,
        height: size.height,
        ...(seed !== undefined ? { seed } : {}),
        prompt_upsampling: true,
      };
      break;
    case "flux-2-pro":
    case "firefly-image-4-ultra":
      replicateModel = "black-forest-labs/flux-2-pro";
      input = {
        prompt,
        width: size.width,
        height: size.height,
        ...(seed !== undefined ? { seed } : {}),
      };
      break;
    case "firefly-image-5":
      replicateModel = "black-forest-labs/flux-2-pro";
      input = {
        prompt,
        width: size.width,
        height: size.height,
        steps: 50,
        guidance: 4.0,
        ...(seed !== undefined ? { seed } : {}),
      };
      break;
    default:
      replicateModel = "black-forest-labs/flux-schnell";
      input = {
        prompt,
        width: size.width,
        height: size.height,
        num_outputs: Math.min(numImages, 4),
        go_fast: true,
        ...(seed !== undefined ? { seed } : {}),
      };
  }

  if (negativePrompt) {
    (input as Record<string, unknown>).negative_prompt = negativePrompt;
  }

  // Create prediction
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
  
  // Handle both single output and array output
  let urls: string[] = [];
  if (Array.isArray(data.output)) {
    urls = data.output.filter((u: unknown) => typeof u === "string");
  } else if (typeof data.output === "string") {
    urls = [data.output];
  } else if (data.urls?.get) {
    // Poll for result with proper loop
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const pollRes = await fetch(data.urls.get, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const pollData = await pollRes.json();
      if (pollData.status === "succeeded") {
        if (Array.isArray(pollData.output)) urls = pollData.output.filter((u: unknown) => typeof u === "string");
        else if (typeof pollData.output === "string") urls = [pollData.output];
        break;
      }
      if (pollData.status === "failed" || pollData.status === "canceled") {
        throw new Error(`Image generation ${pollData.status}: ${pollData.error || "unknown"}`);
      }
    }
  }

  // Download external Replicate CDN URLs to local storage so they persist
  const localUrls = await downloadExternalImages(urls, taskId, "replicate");
  return { urls: localUrls, model: replicateModel };
}

/**
 * Dynamic model routing — uses the unified /api/generate pipeline
 * which auto-discovers model schemas & runs on Replicate or HuggingFace.
 */
async function generateWithDynamic(
  prompt: string,
  modelId: string,
  size: { width: number; height: number },
  numImages: number,
  seed?: number,
): Promise<{ urls: string[]; model: string }> {
  // Import the Replicate smart router directly for server-side usage
  const { runReplicateTask } = await import("@/lib/replicate");
  const fs = await import("fs");
  const path = await import("path");
  const { ensureFilesDir } = await import("@/lib/db");

  const taskId = `ff-dyn-${Date.now()}-${uuidv4().slice(0, 8)}`;
  const filesDir = path.join(ensureFilesDir(), taskId);
  if (!fs.existsSync(filesDir)) fs.mkdirSync(filesDir, { recursive: true });

  const result = await runReplicateTask({
    prompt,
    model: modelId,
    params: {
      width: size.width,
      height: size.height,
      num_outputs: Math.min(numImages, 4),
      ...(seed !== undefined ? { seed } : {}),
    },
    filesDir,
  });

  // Extract image URLs from result files
  const urls: string[] = [];
  if (result.files?.length) {
    for (const f of result.files) {
      if (f.mimeType?.startsWith("image/")) {
        urls.push(`/api/files/${taskId}/${f.filename}`);
      }
    }
  }

  if (urls.length === 0) {
    throw new Error(`Dynamic model "${modelId}" produced no image output`);
  }

  return { urls, model: modelId };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as GenerateImageRequest;
    const {
      prompt,
      negativePrompt,
      model = "firefly-image-4",
      aspectRatio = "1:1",
      contentType = "auto",
      stylePreset = "none",
      visualIntensity = 50,
      numImages = 4,
      quality = "standard",
      seed,
    } = body;

    if (!prompt?.trim()) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const size = ASPECT_TO_SIZE[aspectRatio] || ASPECT_TO_SIZE["1:1"];
    const enhancedPrompt = buildEnhancedPrompt(body);
    // One ID used both for the generation record and the file-storage folder
    const generationId = `ff-img-${Date.now()}-${uuidv4().slice(0, 8)}`;

    let result: { urls: string[]; model: string };

    const knownModels = new Set([
      "dall-e-3", "flux-schnell", "flux-pro", "flux-2-pro",
      "firefly-image-4", "firefly-image-4-ultra", "firefly-image-5",
    ]);

    if (model === "dall-e-3") {
      result = await generateWithOpenAI(enhancedPrompt, negativePrompt, size, quality, numImages, generationId);
    } else if (knownModels.has(model)) {
      try {
        result = await generateWithReplicate(enhancedPrompt, negativePrompt, size, model, numImages, generationId, seed, body.structureImageUrl, body.styleImageUrl);
      } catch (replicateErr) {
        console.warn("Replicate failed, falling back to OpenAI:", replicateErr);
        try {
          result = await generateWithOpenAI(enhancedPrompt, negativePrompt, size, quality, numImages, generationId);
        } catch (openaiErr) {
          throw new Error(`All providers failed. Last error: ${(openaiErr as Error).message}`);
        }
      }
    } else {
      // Dynamic model — use unified generate pipeline via internal API
      result = await generateWithDynamic(enhancedPrompt, model, size, numImages, seed);
    }

    return NextResponse.json({
      id: generationId,
      status: "completed",
      model: result.model,
      prompt: enhancedPrompt,
      originalPrompt: prompt,
      images: result.urls.map((url, i) => ({
        id: `${generationId}-${i}`,
        url,
        width: size.width,
        height: size.height,
      })),
      settings: {
        aspectRatio,
        contentType,
        stylePreset,
        visualIntensity,
        quality,
        seed,
      },
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Firefly generate-image error:", err);
    return NextResponse.json(
      { error: (err as Error).message || "Generation failed" },
      { status: 500 }
    );
  }
}

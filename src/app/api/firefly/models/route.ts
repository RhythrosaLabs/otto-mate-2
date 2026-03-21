/**
 * Firefly — Model Discovery API
 * GET  /api/firefly/models?category=image&q=search+term
 * POST /api/firefly/models — Run a specific model via the unified generate pipeline
 *
 * Wraps /api/replicate and /api/huggingface search with Firefly-specific
 * category defaults + curated featured models per category.
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/* ─── Category Configuration ────────────────────────────────────── */

type Category =
  | "image-generation"
  | "image-editing"
  | "image-upscale"
  | "background-removal"
  | "video-generation"
  | "image-to-video"
  | "music-generation"
  | "sound-effects"
  | "text-to-speech"
  | "3d-generation"
  | "style-transfer"
  | "inpainting"
  | "outpainting"
  | "face-swap"
  | "vector"
  | "general";

interface CategoryConfig {
  label: string;
  defaultSearchTerms: string[];
  replicateCollections?: string[];
  hfPipelineTags?: string[];
  featured: FeaturedModel[];
}

interface FeaturedModel {
  id: string;
  label: string;
  provider: "replicate" | "huggingface" | "openai";
  description: string;
  tag?: string;
}

const CATEGORY_CONFIG: Record<Category, CategoryConfig> = {
  "image-generation": {
    label: "Image Generation",
    defaultSearchTerms: ["text to image", "image generation"],
    replicateCollections: ["text-to-image"],
    hfPipelineTags: ["text-to-image"],
    featured: [
      { id: "black-forest-labs/flux-schnell", label: "FLUX Schnell", provider: "replicate", description: "Fast, high quality image generation", tag: "Fast" },
      { id: "black-forest-labs/flux-1.1-pro", label: "FLUX 1.1 Pro", provider: "replicate", description: "Professional quality images", tag: "Pro" },
      { id: "black-forest-labs/flux-2-pro", label: "FLUX 2 Pro", provider: "replicate", description: "Highest quality FLUX model", tag: "Ultra" },
      { id: "stability-ai/sdxl", label: "SDXL", provider: "replicate", description: "Stable Diffusion XL, versatile & fast", tag: "Popular" },
      { id: "bytedance/sdxl-lightning-4step", label: "SDXL Lightning", provider: "replicate", description: "4-step distilled SDXL, ultra fast", tag: "Instant" },
      { id: "dall-e-3", label: "DALL-E 3", provider: "openai", description: "OpenAI's latest image model", tag: "OpenAI" },
      { id: "ideogram-ai/ideogram-v2-turbo", label: "Ideogram v2 Turbo", provider: "replicate", description: "Excellent text rendering in images", tag: "Text" },
      { id: "recraft-ai/recraft-v3", label: "Recraft v3", provider: "replicate", description: "Vector & raster design generation", tag: "Design" },
    ],
  },
  "image-editing": {
    label: "Image Editing",
    defaultSearchTerms: ["image editing", "inpainting"],
    hfPipelineTags: ["image-to-image"],
    featured: [
      { id: "black-forest-labs/flux-fill-pro", label: "FLUX Fill Pro", provider: "replicate", description: "Inpainting & outpainting with FLUX", tag: "Best" },
      { id: "stability-ai/stable-diffusion-inpainting", label: "SD Inpainting", provider: "replicate", description: "Classic Stable Diffusion inpainting", tag: "Classic" },
      { id: "andreasjansson/stable-diffusion-inpainting", label: "SD Inpaint v2", provider: "replicate", description: "Advanced inpainting pipeline", tag: "Alt" },
    ],
  },
  "image-upscale": {
    label: "Image Upscale",
    defaultSearchTerms: ["image upscale", "super resolution"],
    replicateCollections: ["image-upscalers"],
    hfPipelineTags: ["image-to-image"],
    featured: [
      { id: "philz1337x/clarity-upscaler", label: "Clarity Upscaler", provider: "replicate", description: "Creative AI upscaling with enhancement", tag: "Best" },
      { id: "nightmareai/real-esrgan", label: "Real-ESRGAN", provider: "replicate", description: "Classic real-world super resolution 4x", tag: "Classic" },
      { id: "cjwbw/real-esrgan", label: "Real-ESRGAN (fast)", provider: "replicate", description: "Faster ESRGAN variant", tag: "Fast" },
    ],
  },
  "background-removal": {
    label: "Background Removal",
    defaultSearchTerms: ["background removal", "remove background"],
    featured: [
      { id: "lucataco/remove-bg", label: "Remove BG", provider: "replicate", description: "Clean background removal", tag: "Best" },
      { id: "cjwbw/rembg", label: "Rembg", provider: "replicate", description: "Open source background removal", tag: "Alt" },
    ],
  },
  "video-generation": {
    label: "Video Generation",
    defaultSearchTerms: ["text to video", "video generation"],
    replicateCollections: ["text-to-video"],
    hfPipelineTags: ["text-to-video"],
    featured: [
      { id: "minimax/video-01", label: "Minimax Video-01", provider: "replicate", description: "High quality text-to-video", tag: "Best" },
      { id: "tencent/hunyuan-video", label: "Hunyuan Video", provider: "replicate", description: "Tencent's video generation model", tag: "Quality" },
      { id: "wavespeedai/wan-2.1-t2v-480p", label: "Wan 2.1", provider: "replicate", description: "Fast video gen by WaveSpeed", tag: "Fast" },
      { id: "kwaivgi/kling-v2.0-master-text-to-video", label: "Kling v2.0", provider: "replicate", description: "Cinematic text-to-video", tag: "Cinematic" },
      { id: "bytedance/seedance-1-lite", label: "Seedance Lite", provider: "replicate", description: "ByteDance lightweight video model", tag: "New" },
    ],
  },
  "image-to-video": {
    label: "Image to Video",
    defaultSearchTerms: ["image to video", "animate image"],
    replicateCollections: ["image-to-video"],
    hfPipelineTags: ["image-to-video"],
    featured: [
      { id: "minimax/video-01-live/image-to-video", label: "Minimax I2V", provider: "replicate", description: "Animate images with Minimax", tag: "Best" },
      { id: "wan-ai/wan-2.1-i2v-480p-14b", label: "Wan I2V", provider: "replicate", description: "Image-to-video by WaveSpeed", tag: "Quality" },
      { id: "stability-ai/stable-video-diffusion", label: "SVD", provider: "replicate", description: "Stability AI img2vid model", tag: "Classic" },
    ],
  },
  "music-generation": {
    label: "Music Generation",
    defaultSearchTerms: ["music generation", "text to music"],
    hfPipelineTags: ["text-to-audio"],
    featured: [
      { id: "meta/musicgen", label: "MusicGen", provider: "replicate", description: "Meta's music generation (stereo melody large)", tag: "Best" },
      { id: "zsxkib/stable-audio", label: "Stable Audio", provider: "replicate", description: "Stability AI music & sound", tag: "Alt" },
      { id: "facebookresearch/musicgen-large", label: "MusicGen Large (HF)", provider: "huggingface", description: "MusicGen on HuggingFace", tag: "HF" },
    ],
  },
  "sound-effects": {
    label: "Sound Effects",
    defaultSearchTerms: ["sound effect", "audio generation"],
    hfPipelineTags: ["text-to-audio"],
    featured: [
      { id: "zsxkib/stable-audio", label: "Stable Audio", provider: "replicate", description: "Generate sound effects & ambient", tag: "Best" },
      { id: "meta/musicgen", label: "MusicGen (SFX mode)", provider: "replicate", description: "Can generate SFX with right prompt", tag: "Alt" },
    ],
  },
  "text-to-speech": {
    label: "Text to Speech",
    defaultSearchTerms: ["text to speech", "tts"],
    hfPipelineTags: ["text-to-speech"],
    featured: [
      { id: "jaaari/kokoro-82m", label: "Kokoro 82M", provider: "replicate", description: "Lightweight expressive TTS", tag: "Fast" },
      { id: "x-lance/f5-tts", label: "F5-TTS", provider: "replicate", description: "High quality voice synthesis", tag: "Quality" },
      { id: "openai-tts", label: "OpenAI TTS", provider: "openai", description: "OpenAI voices (Alloy, Nova, etc.)", tag: "OpenAI" },
      { id: "elevenlabs-tts", label: "ElevenLabs", provider: "openai", description: "Premium multi-language TTS", tag: "Premium" },
    ],
  },
  "3d-generation": {
    label: "3D Generation",
    defaultSearchTerms: ["3d generation", "text to 3d", "image to 3d"],
    featured: [
      { id: "stability-ai/triposr", label: "TripoSR", provider: "replicate", description: "Fast 3D object from image", tag: "Fast" },
      { id: "camenduru/instantmesh", label: "InstantMesh", provider: "replicate", description: "Image to 3D mesh generation", tag: "Quality" },
    ],
  },
  "style-transfer": {
    label: "Style Transfer",
    defaultSearchTerms: ["style transfer", "image style"],
    hfPipelineTags: ["image-to-image"],
    featured: [
      { id: "black-forest-labs/flux-redux-dev", label: "FLUX Redux", provider: "replicate", description: "Style variations via FLUX", tag: "Best" },
      { id: "tencentarc/photomaker", label: "PhotoMaker", provider: "replicate", description: "Consistent style transfer", tag: "Photo" },
    ],
  },
  "inpainting": {
    label: "Inpainting",
    defaultSearchTerms: ["inpainting", "fill region"],
    featured: [
      { id: "black-forest-labs/flux-fill-pro", label: "FLUX Fill Pro", provider: "replicate", description: "Pro inpainting with FLUX", tag: "Best" },
    ],
  },
  "outpainting": {
    label: "Outpainting / Expand",
    defaultSearchTerms: ["outpainting", "image expansion", "extend image"],
    featured: [
      { id: "black-forest-labs/flux-fill-pro", label: "FLUX Fill Pro", provider: "replicate", description: "Expand image canvas with AI", tag: "Best" },
    ],
  },
  "face-swap": {
    label: "Face Swap",
    defaultSearchTerms: ["face swap"],
    featured: [
      { id: "xiankgx/face-swap", label: "Face Swap", provider: "replicate", description: "Realistic face swapping", tag: "Best" },
    ],
  },
  "vector": {
    label: "Vector / SVG",
    defaultSearchTerms: ["vector", "svg generation", "logo design"],
    featured: [
      { id: "recraft-ai/recraft-v3-svg", label: "Recraft v3 SVG", provider: "replicate", description: "Generate vector SVG designs", tag: "Best" },
      { id: "recraft-ai/recraft-v3", label: "Recraft v3", provider: "replicate", description: "Raster & vector design gen", tag: "Alt" },
    ],
  },
  "general": {
    label: "General",
    defaultSearchTerms: ["ai model"],
    featured: [],
  },
};

/* ─── GET: Search models ─────────────────────────────────────────── */

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "";
  const categoryParam = req.nextUrl.searchParams.get("category") || "general";
  const category = categoryParam as Category;
  const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.general;

  // If no search query, return featured models for this category
  if (!q.trim()) {
    return NextResponse.json({
      models: config.featured.map((m) => ({
        id: m.id,
        fullName: m.id,
        label: m.label,
        description: m.description,
        provider: m.provider,
        tag: m.tag,
        featured: true,
        run_count: 0,
      })),
      category: config.label,
    });
  }

  // Live search Replicate and HuggingFace in parallel
  const baseUrl = req.nextUrl.origin;
  const searchTerms = q || config.defaultSearchTerms[0];

  try {
    const [replicateRes, hfRes] = await Promise.all([
      fetch(
        `${baseUrl}/api/replicate?action=search&q=${encodeURIComponent(searchTerms)}`,
        { headers: { "Content-Type": "application/json" } }
      ).catch(() => null),
      fetch(
        `${baseUrl}/api/huggingface?action=search&q=${encodeURIComponent(searchTerms)}${
          config.hfPipelineTags?.[0] ? `&pipeline_tag=${config.hfPipelineTags[0]}` : ""
        }`,
        { headers: { "Content-Type": "application/json" } }
      ).catch(() => null),
    ]);

    const replicateData = replicateRes?.ok
      ? ((await replicateRes.json()) as { models: Array<Record<string, unknown>> })
      : { models: [] };
    const hfData = hfRes?.ok
      ? ((await hfRes.json()) as { models: Array<Record<string, unknown>> })
      : { models: [] };

    // Normalize and merge
    const models: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();

    // Replicate models
    for (const m of replicateData.models || []) {
      const fullName = (m.fullName as string) || `${m.owner}/${m.name}`;
      if (seen.has(fullName)) continue;
      seen.add(fullName);
      models.push({
        id: fullName,
        fullName,
        label: (m.name as string) || fullName.split("/").pop(),
        description: (m.description as string) || "",
        provider: "replicate",
        run_count: (m.run_count as number) || 0,
        cover_image_url: m.cover_image_url,
        featured: false,
      });
    }

    // HuggingFace models
    for (const m of hfData.models || []) {
      const fullName = (m.fullName as string) || (m.id as string) || "";
      if (seen.has(fullName)) continue;
      seen.add(fullName);
      models.push({
        id: fullName,
        fullName,
        label: (m.name as string) || fullName.split("/").pop(),
        description: (m.description as string) || "",
        provider: "huggingface",
        downloads: (m.downloads as number) || 0,
        pipeline_tag: m.pipeline_tag,
        featured: false,
      });
    }

    // Sort by popularity
    models.sort((a, b) => {
      const aScore = ((a.run_count as number) || 0) + ((a.downloads as number) || 0);
      const bScore = ((b.run_count as number) || 0) + ((b.downloads as number) || 0);
      return bScore - aScore;
    });

    // Prepend featured for this category
    const featured = config.featured.map((m) => ({
      id: m.id,
      fullName: m.id,
      label: m.label,
      description: m.description,
      provider: m.provider,
      tag: m.tag,
      featured: true,
      run_count: 0,
    }));

    return NextResponse.json({
      models: [...featured, ...models.slice(0, 30)],
      category: config.label,
    });
  } catch (err) {
    // Return just featured on search failure
    return NextResponse.json({
      models: config.featured.map((m) => ({
        id: m.id,
        fullName: m.id,
        label: m.label,
        description: m.description,
        provider: m.provider,
        tag: m.tag,
        featured: true,
        run_count: 0,
      })),
      category: config.label,
      searchError: (err as Error).message,
    });
  }
}

/* ─── POST: Run model via unified generate pipeline ──────────────── */

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      prompt: string;
      model?: string;
      provider?: "auto" | "replicate" | "huggingface";
      category?: string;
      params?: Record<string, unknown>;
      imageUrl?: string;
    };

    if (!body.prompt?.trim() && !body.imageUrl) {
      return NextResponse.json(
        { error: "prompt or imageUrl is required" },
        { status: 400 }
      );
    }

    // Forward to the unified generate API
    const baseUrl = req.nextUrl.origin;
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: body.prompt || "process this image",
        model: body.model,
        provider: body.provider || "auto",
        params: body.params || {},
        imageUrl: body.imageUrl,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Model execution failed" },
      { status: 500 }
    );
  }
}

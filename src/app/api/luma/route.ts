import { NextRequest, NextResponse } from "next/server";

const LUMA_API_BASE = "https://api.lumalabs.ai/dream-machine/v1";

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

function getLumaApiKey(): string | null {
  if (process.env.LUMA_API_KEY) return process.env.LUMA_API_KEY;
  // Also check connector config from UI
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getConnectorConfig } = require("@/lib/db") as {
      getConnectorConfig: (id: string) => Record<string, unknown> | null;
    };
    const config = getConnectorConfig("luma");
    if (config?.api_key) return config.api_key as string;
  } catch {
    /* ignore */
  }
  return null;
}

function getReplicateToken(): string | null {
  if (process.env.REPLICATE_API_TOKEN) return process.env.REPLICATE_API_TOKEN;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getConnectorConfig } = require("@/lib/db") as {
      getConnectorConfig: (id: string) => Record<string, unknown> | null;
    };
    const config = getConnectorConfig("replicate");
    if (config?.api_key) return config.api_key as string;
  } catch {
    /* ignore */
  }
  return null;
}

// ---------------------------------------------------------------------------
// Luma fetch
// ---------------------------------------------------------------------------

async function lumaFetch(path: string, options: RequestInit = {}, _retries = 2): Promise<Record<string, unknown>> {
  const key = getLumaApiKey();
  if (!key) throw new Error("LUMA_API_KEY is not set");
  const url = `${LUMA_API_BASE}${path}`;
  console.log(`[Luma API] ${options.method || "GET"} ${url}`);
  if (options.body) {
    try {
      const parsed = JSON.parse(options.body as string);
      console.log(`[Luma API] Payload:`, JSON.stringify(parsed, null, 2));
    } catch { console.log(`[Luma API] Body: ${(options.body as string).slice(0, 500)}`); }
  }
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error(`[Luma API] ERROR ${res.status}: ${errText}`);
    // Retry on transient errors (429 rate limit, 500/502/503 server errors, or false "Insufficient credits" on 400)
    const isTransient = res.status === 429 || res.status >= 500 || (res.status === 400 && errText.includes("Insufficient credits"));
    if (isTransient && _retries > 0) {
      const delay = res.status === 429 ? 5000 : 2000;
      console.log(`[Luma API] Retrying in ${delay}ms (${_retries} retries left)...`);
      await new Promise(r => setTimeout(r, delay));
      return lumaFetch(path, options, _retries - 1);
    }
    throw new Error(`Luma API error (${res.status}): ${errText}`);
  }
  const data = await res.json();
  console.log(`[Luma API] OK — id: ${data?.id}, state: ${data?.state}`);
  return data;
}

// ---------------------------------------------------------------------------
// Replicate helpers — runs Luma (and other) video/image models on Replicate
// ---------------------------------------------------------------------------

/** Well-known Replicate models that mirror Dream Machine capabilities */
const REPLICATE_MODELS: Record<
  string,
  { owner: string; name: string; desc: string; type: "video" | "image" }
> = {
  // Video generation — Luma on Replicate
  "luma-ray-2-720p":     { owner: "luma",               name: "ray-2-720p",              desc: "Luma Ray 2 720p",               type: "video" },
  "luma-ray-2-540p":     { owner: "luma",               name: "ray-2-540p",              desc: "Luma Ray 2 540p",               type: "video" },
  "luma-ray-flash-720p": { owner: "luma",               name: "ray-flash-2-720p",        desc: "Luma Ray Flash 2 720p (fast)",   type: "video" },
  "luma-ray-flash-540p": { owner: "luma",               name: "ray-flash-2-540p",        desc: "Luma Ray Flash 2 540p (fast)",   type: "video" },
  // Video generation — other providers
  "minimax-hailuo-02":   { owner: "minimax",            name: "hailuo-02",               desc: "MiniMax Hailuo 02",             type: "video" },
  "minimax-hailuo-2.3":  { owner: "minimax",            name: "hailuo-2.3",              desc: "MiniMax Hailuo 2.3",            type: "video" },
  "wan-2.5-t2v":         { owner: "wan-video",          name: "wan-2.5-t2v",             desc: "Wan 2.5 Text-to-Video",         type: "video" },
  "wan-2.5-i2v":         { owner: "wan-video",          name: "wan-2.5-i2v",             desc: "Wan 2.5 Image-to-Video",        type: "video" },
  "wan-2.2-i2v-fast":    { owner: "wan-video",          name: "wan-2.2-i2v-fast",        desc: "Wan 2.2 I2V (fast, 8.7M runs)", type: "video" },
  // Luma-specific tools on Replicate
  "luma-modify-video":   { owner: "luma",               name: "modify-video",            desc: "Luma Modify Video",             type: "video" },
  "luma-reframe-video":  { owner: "luma",               name: "reframe-video",           desc: "Luma Reframe Video",            type: "video" },
  "luma-reframe-image":  { owner: "luma",               name: "reframe-image",           desc: "Luma Reframe Image",            type: "image" },
  // Image generation
  "luma-photon":         { owner: "luma",               name: "photon",                  desc: "Luma Photon (3.2M runs)",       type: "image" },
  "luma-photon-flash":   { owner: "luma",               name: "photon-flash",            desc: "Luma Photon Flash (fast)",       type: "image" },
  "flux-dev":            { owner: "black-forest-labs",   name: "flux-dev",               desc: "FLUX.1 [dev] (42.7M runs)",     type: "image" },
  "flux-schnell":        { owner: "black-forest-labs",   name: "flux-schnell",           desc: "FLUX.1 [schnell] — fast",       type: "image" },
  "flux-1.1-pro":        { owner: "black-forest-labs",   name: "flux-1.1-pro",           desc: "FLUX 1.1 [pro] (68.2M runs)",   type: "image" },
  "flux-2-pro":          { owner: "black-forest-labs",   name: "flux-2-pro",             desc: "FLUX 2 [pro] (3.9M runs)",      type: "image" },
  "sd-3.5-large":        { owner: "stability-ai",       name: "stable-diffusion-3.5-large", desc: "SD 3.5 Large (2M runs)",     type: "image" },
  "minimax-image":       { owner: "minimax",            name: "image-01",               desc: "MiniMax Image-01 (2.7M runs)",  type: "image" },
  // Audio generation
  "luma-ray-audio":      { owner: "luma",               name: "ray-audio",              desc: "Luma Ray Audio",                type: "video" as "video" | "image" },
};

// Audio-capable models on Replicate (use versioned predictions endpoint)
const REPLICATE_AUDIO_MODELS: Record<string, { owner: string; name: string; version: string; desc: string }> = {
  "musicgen":            { owner: "meta",               name: "musicgen",               version: "671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb", desc: "Meta MusicGen (music generation)" },
  "bark":                { owner: "suno-ai",            name: "bark",                   version: "b76242b40d67c76ab6742e987628a2a9ac019e11d56ab96c4e91ce03b79b2787", desc: "Suno Bark (speech + SFX)" },
};

async function replicateFetch(path: string, options: RequestInit = {}) {
  const token = getReplicateToken();
  if (!token) throw new Error("REPLICATE_API_TOKEN is not set. Set it or connect Replicate in Connectors.");

  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(`https://api.replicate.com/v1${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    if (res.status === 429 && attempt < MAX_RETRIES) {
      // Rate limited — exponential backoff: 2s, 4s, 8s
      const delay = Math.pow(2, attempt + 1) * 1000;
      console.warn(`[Replicate] 429 rate limit on attempt ${attempt + 1}, retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
      continue;
    }
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Replicate API error (${res.status}): ${errText}`);
    }
    return res.json();
  }
  throw new Error("Replicate API error: max retries exceeded (429 rate limit)");
}

function normalizeReplicateOutput(output: unknown): { video?: string; image?: string; audio?: string } {
  if (!output) return {};
  if (typeof output === "string") {
    if (output.match(/\.(mp3|wav|flac|ogg|aac|m4a)/i)) return { audio: output };
    if (output.match(/\.(mp4|webm|mov)/i)) return { video: output };
    return { image: output };
  }
  if (Array.isArray(output)) {
    for (const item of output) {
      if (typeof item === "string") {
        if (item.match(/\.(mp3|wav|flac|ogg|aac|m4a)/i)) return { audio: item };
        if (item.match(/\.(mp4|webm|mov)/i)) return { video: item };
        return { image: item };
      }
    }
  }
  return {};
}

async function runReplicateModel(
  modelKey: string,
  input: Record<string, unknown>,
): Promise<{
  id: string;
  state: string;
  assets?: { video?: string; image?: string; audio?: string };
  error?: string;
}> {
  const model = REPLICATE_MODELS[modelKey];
  if (!model) throw new Error(`Unknown Replicate model: ${modelKey}`);

  const prediction = await replicateFetch(
    `/models/${model.owner}/${model.name}/predictions`,
    { method: "POST", body: JSON.stringify({ input }) },
  );

  return {
    id: `rep_${prediction.id}`,
    state:
      prediction.status === "succeeded"
        ? "completed"
        : prediction.status === "failed"
          ? "failed"
          : "queued",
    assets:
      prediction.status === "succeeded"
        ? normalizeReplicateOutput(prediction.output)
        : undefined,
    error: prediction.error || undefined,
  };
}

async function pollReplicatePrediction(predictionId: string) {
  const rawId = predictionId.replace(/^rep_/, "");
  const prediction = await replicateFetch(`/predictions/${rawId}`);

  let state = "queued";
  if (prediction.status === "succeeded") state = "completed";
  else if (prediction.status === "failed") state = "failed";
  else if (prediction.status === "processing") state = "dreaming";

  return {
    id: `rep_${rawId}`,
    state,
    assets: state === "completed" ? normalizeReplicateOutput(prediction.output) : undefined,
    failure_reason: prediction.error || undefined,
  };
}

// ---------------------------------------------------------------------------
// Provider chooser
// ---------------------------------------------------------------------------

function chooseProvider(body: Record<string, unknown>): "luma" | "replicate" {
  if (body.provider === "replicate") return "replicate";
  if (body.provider === "luma") return "luma";
  // Auto: prefer Luma if key exists, else Replicate
  if (getLumaApiKey()) return "luma";
  if (getReplicateToken()) return "replicate";
  throw new Error("No API key configured. Set LUMA_API_KEY or REPLICATE_API_TOKEN.");
}

// Map Dream Machine model ids to Replicate model keys
function mapToReplicateModel(lumaModel: string, action: string): string {
  // Luma-specific Replicate mirrors
  if (action === "modify-video") return "luma-modify-video";
  if (action === "reframe") {
    // If the original body was an image, use reframe-image; default to video
    return "luma-reframe-video";
  }

  // Video generation
  if (action.includes("video") || action === "extend" || action === "interpolate") {
    // Pick best video model based on original Luma model name
    if (lumaModel?.includes("flash")) return "luma-ray-flash-720p";
    return "luma-ray-2-720p";
  }

  // Image generation
  if (lumaModel === "photon-flash-1") return "luma-photon-flash";
  if (lumaModel?.includes("photon")) return "luma-photon";
  return "flux-dev";
}

function buildReplicateVideoInput(body: Record<string, unknown>): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  if (body.prompt) input.prompt = body.prompt;
  if (body.aspect_ratio) input.aspect_ratio = body.aspect_ratio;
  if (body.loop) input.loop = body.loop;
  const keyframes = body.keyframes as
    | Record<string, { type?: string; url?: string }>
    | undefined;
  if (keyframes?.frame0?.type === "image" && keyframes.frame0.url)
    input.start_image = keyframes.frame0.url;
  if (keyframes?.frame1?.type === "image" && keyframes.frame1.url)
    input.end_image = keyframes.frame1.url;
  return input;
}

function buildReplicateImageInput(body: Record<string, unknown>): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  if (body.prompt) input.prompt = body.prompt;
  if (body.aspect_ratio) input.aspect_ratio = body.aspect_ratio;
  const styleRef = body.style_ref as Array<{ url?: string }> | undefined;
  if (styleRef?.[0]?.url) input.image = styleRef[0].url;
  const imageRef = body.image_ref as Array<{ url?: string }> | undefined;
  if (imageRef?.[0]?.url) input.image = imageRef[0].url;
  return input;
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action");
  const provider = req.nextUrl.searchParams.get("provider") || "auto";

  try {
    // ---- Status polling -------------------------------------------------
    if (action === "status") {
      const id = req.nextUrl.searchParams.get("id");
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

      if (id.startsWith("rep_") || provider === "replicate") {
        const result = await pollReplicatePrediction(id);
        return NextResponse.json(result);
      }
      const result = await lumaFetch(`/generations/${id}`);
      return NextResponse.json(result);
    }

    // ---- Concepts -------------------------------------------------------
    if (action === "concepts") {
      if (getLumaApiKey()) {
        const result = await lumaFetch("/generations/concepts/list");
        return NextResponse.json(result);
      }
      return NextResponse.json([]);
    }

    // ---- Camera motions -------------------------------------------------
    if (action === "camera-motions") {
      if (getLumaApiKey()) {
        const result = await lumaFetch("/generations/camera_motion/list");
        return NextResponse.json(result);
      }
      return NextResponse.json([]);
    }

    // ---- Available providers --------------------------------------------
    if (action === "available-providers") {
      return NextResponse.json({
        luma: !!getLumaApiKey(),
        replicate: !!getReplicateToken(),
      });
    }

    // ---- List Replicate fallback models ---------------------------------
    if (action === "replicate-models") {
      return NextResponse.json(
        Object.entries(REPLICATE_MODELS).map(([key, m]) => ({
          key,
          owner: m.owner,
          name: m.name,
          fullName: `${m.owner}/${m.name}`,
          desc: m.desc,
          type: m.type,
        })),
      );
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: String(err instanceof Error ? err.message : err) },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

// Normalize duration to valid Luma API values, model-aware
// ray-2 supports: 5s, 9s, 10s
// ray-flash-2 supports: 5s, 9s only (10s causes 400 error)
function normalizeDuration(d: string | undefined, model?: string): string | undefined {
  if (!d) return undefined;
  const isFlash = model?.includes("flash");
  const maxValid = isFlash ? new Set(["5s", "9s"]) : new Set(["5s", "9s", "10s"]);
  if (maxValid.has(d)) return d;
  const num = parseFloat(d);
  if (isNaN(num)) return "5s";
  if (num <= 7) return "5s";
  if (isFlash) return "9s"; // ray-flash-2 caps at 9s
  if (num <= 9.5) return "9s";
  return "10s";
}

// Parse duration to integer seconds for Replicate models (musicgen expects int, not "5s")
function parseDurationToSeconds(d: string | number | undefined): number | undefined {
  if (d === undefined || d === null) return undefined;
  if (typeof d === "number") return Math.round(d);
  const num = parseInt(d.replace(/[^0-9]/g, ""), 10);
  return isNaN(num) ? 5 : num;
}

// Normalize resolution — strip unsupported values for plans that lack 1080p/4k
function normalizeResolution(r: string | undefined, model?: string): string | undefined {
  if (!r) return undefined;
  // ray-flash-2 typically only supports up to 720p
  if (model?.includes("flash") && (r === "1080p" || r === "4k")) return "720p";
  const valid = new Set(["540p", "720p", "1080p", "4k"]);
  return valid.has(r) ? r : undefined;
}

// ==========================================================================
// REQUEST SANITIZER — Catch and fix bad parameters BEFORE hitting any API
// ==========================================================================
// The LLM agent sometimes hallucinates invalid parameters. This layer acts as
// a safety net, silently correcting issues that would otherwise cause 400/422.

const VALID_VIDEO_MODELS = new Set(["ray-2", "ray-flash-2"]);
const VALID_IMAGE_MODELS = new Set(["photon-1", "photon-flash-1"]);
const VALID_AUDIO_MODELS = new Set(["musicgen", "bark", "ray-audio", "stable-audio"]);
const VALID_DURATIONS = new Set(["5s", "9s", "10s"]);
const VALID_ASPECT_RATIOS = new Set(["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "9:21"]);
const VALID_RESOLUTIONS = new Set(["540p", "720p", "1080p", "4k"]);
const VALID_MODIFY_MODES = new Set([
  "adhere_1", "adhere_2", "adhere_3",
  "flex_1", "flex_2", "flex_3",
  "reimagine_1", "reimagine_2", "reimagine_3",
]);

const VIDEO_ACTIONS = new Set(["generate-video", "extend", "reverse-extend", "interpolate", "modify-video", "modify-video-keyframes", "reframe"]);
const IMAGE_ACTIONS = new Set(["generate-image"]);
const AUDIO_ACTIONS = new Set(["generate-audio", "generate-sfx", "voiceover", "lip-sync"]);

function sanitizeRequestBody(body: Record<string, unknown>): { body: Record<string, unknown>; warnings: string[] } {
  const warnings: string[] = [];
  const action = body.action as string;

  // 1. Model ↔ Action enforcement — auto-correct mismatched models
  if (VIDEO_ACTIONS.has(action) && body.model && !VALID_VIDEO_MODELS.has(body.model as string)) {
    const old = body.model;
    body.model = (body.model as string).includes("flash") ? "ray-flash-2" : "ray-2";
    warnings.push(`Model "${old}" invalid for ${action}, corrected to "${body.model}"`);
  }
  if (IMAGE_ACTIONS.has(action) && body.model && !VALID_IMAGE_MODELS.has(body.model as string)) {
    const old = body.model;
    body.model = (body.model as string).includes("flash") ? "photon-flash-1" : "photon-1";
    warnings.push(`Model "${old}" invalid for ${action}, corrected to "${body.model}"`);
  }
  if (AUDIO_ACTIONS.has(action) && body.model && !VALID_AUDIO_MODELS.has(body.model as string) && !VALID_AUDIO_MODELS.has(body.audio_model as string)) {
    // Don't override model for audio — the audio routing handles this separately
  }

  // 2. Duration enforcement
  if (body.duration !== undefined) {
    const d = String(body.duration);
    if (!VALID_DURATIONS.has(d)) {
      const num = parseFloat(d.replace(/[^0-9.]/g, ""));
      const model = body.model as string || "";
      const isFlash = model.includes("flash");
      let corrected: string;
      if (isNaN(num) || num <= 7) corrected = "5s";
      else if (isFlash || num <= 9.5) corrected = "9s";
      else corrected = "10s";
      warnings.push(`Duration "${d}" invalid, corrected to "${corrected}"`);
      body.duration = corrected;
    }
    // Flash models cap at 9s
    if ((body.model as string)?.includes("flash") && body.duration === "10s") {
      body.duration = "9s";
      warnings.push("Duration 10s not supported on flash models, capped to 9s");
    }
  }

  // 3. Aspect ratio enforcement
  if (body.aspect_ratio !== undefined && !VALID_ASPECT_RATIOS.has(body.aspect_ratio as string)) {
    // Will be caught by normalizeAspectRatio downstream, but log
    warnings.push(`Aspect ratio "${body.aspect_ratio}" non-standard, will be normalized`);
  }

  // 4. Resolution enforcement — strip invalid or risky values
  if (body.resolution !== undefined) {
    if (!VALID_RESOLUTIONS.has(body.resolution as string)) {
      warnings.push(`Resolution "${body.resolution}" invalid, removed`);
      delete body.resolution;
    }
  }

  // 5. Modify mode enforcement
  if (action === "modify-video" && body.mode && !VALID_MODIFY_MODES.has(body.mode as string)) {
    const old = body.mode;
    body.mode = "flex_1"; // safe default
    warnings.push(`Modify mode "${old}" invalid, defaulted to "flex_1"`);
  }

  // 6. Boolean enforcement — hdr, loop must be actual booleans
  if (body.hdr !== undefined && typeof body.hdr !== "boolean") {
    body.hdr = body.hdr === "true" || body.hdr === true;
  }
  if (body.loop !== undefined && typeof body.loop !== "boolean") {
    body.loop = body.loop === "true" || body.loop === true;
  }

  // 7. Strip empty/null/undefined fields that could confuse the API
  for (const key of Object.keys(body)) {
    if (body[key] === null || body[key] === undefined || body[key] === "") {
      if (key !== "depends_on" && key !== "use_output_as") {
        delete body[key];
      }
    }
  }

  // 8. Prompt safety — strip obvious prompt injection attempts
  if (typeof body.prompt === "string") {
    // Remove any JSON/code injection attempts embedded in prompts
    body.prompt = (body.prompt as string)
      .replace(/```[\s\S]*?```/g, "") // Remove code blocks
      .replace(/\{[\s\S]*?"action"[\s\S]*?\}/g, "") // Remove embedded JSON commands
      .trim();
  }

  if (warnings.length > 0) {
    console.log(`[Sanitizer] ${action}: ${warnings.join("; ")}`);
  }
  return { body, warnings };
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const sanitized = sanitizeRequestBody({ ...rawBody });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any = sanitized.body;
    const action: string = body.action as string;
    if (sanitized.warnings.length > 0) {
      console.log(`[Luma API] Sanitized ${sanitized.warnings.length} issue(s) in request`);
    }
    const provider = chooseProvider(body);

    // ==== REPLICATE PROVIDER =============================================
    if (provider === "replicate") {
      const replicateModelKey =
        body.replicate_model || mapToReplicateModel(body.model || "", action);

      if (action === "generate-video") {
        const input = buildReplicateVideoInput(body);
        const result = await runReplicateModel(replicateModelKey, input);
        return NextResponse.json(result);
      }

      if (action === "generate-image") {
        const input = buildReplicateImageInput(body);
        const result = await runReplicateModel(
          body.replicate_model || "flux-dev",
          input,
        );
        return NextResponse.json(result);
      }

      if (action === "modify-video") {
        const input: Record<string, unknown> = {};
        if (body.prompt) input.prompt = body.prompt;
        if (body.media?.url) input.video = body.media.url;
        const result = await runReplicateModel(replicateModelKey, input);
        return NextResponse.json(result);
      }

      if (action === "reframe") {
        const input: Record<string, unknown> = {};
        if (body.prompt) input.prompt = body.prompt;
        if (body.media?.url) input.video = body.media.url;
        if (body.aspect_ratio) input.aspect_ratio = body.aspect_ratio;
        const result = await runReplicateModel(replicateModelKey, input);
        return NextResponse.json(result);
      }

      // Replicate audio generation
      if (action === "generate-audio" || action === "generate-sfx" || action === "voiceover" || action === "lip-sync") {
        let audioModelKey = "musicgen";
        if (action === "voiceover" || action === "lip-sync") audioModelKey = "bark";
        if (body.audio_model === "musicgen") audioModelKey = "musicgen";
        if (body.audio_model === "bark") audioModelKey = "bark";

        const audioModel = REPLICATE_AUDIO_MODELS[audioModelKey];
        if (!audioModel) {
          return NextResponse.json({ error: `Unknown audio model: ${audioModelKey}` }, { status: 400 });
        }
        const audioInput: Record<string, unknown> = {};
        if (body.prompt) audioInput.prompt = body.prompt;
        if (body.duration) audioInput.duration = parseDurationToSeconds(body.duration);
        if (body.script) audioInput.text_prompt = body.script;

        const prediction = await replicateFetch(
          `/predictions`,
          { method: "POST", body: JSON.stringify({ version: audioModel.version, input: audioInput }) },
        );

        return NextResponse.json({
          id: `rep_${prediction.id}`,
          state: prediction.status === "succeeded" ? "completed" :
                 prediction.status === "failed" ? "failed" : "queued",
          assets: prediction.status === "succeeded"
            ? normalizeReplicateOutput(prediction.output)
            : undefined,
          error: prediction.error || undefined,
        });
      }

      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    // ==== LUMA PROVIDER ==================================================

    // Normalize aspect ratios — the LLM sometimes generates cinematic ratios (2.39:1, 1.85:1, etc.)
    // that aren't valid Luma API values. Map them to the nearest valid option.
    const VALID_ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "9:21"];
    function normalizeAspectRatio(ar: string | undefined): string | undefined {
      if (!ar) return undefined;
      if (VALID_ASPECT_RATIOS.includes(ar)) return ar;
      // Parse ratio to decimal
      const parts = ar.split(":").map(Number);
      if (parts.length !== 2 || !parts[0] || !parts[1]) return "16:9";
      const ratio = parts[0] / parts[1];
      // Map to closest valid ratio
      const ratioMap: [string, number][] = [
        ["1:1", 1], ["4:3", 4/3], ["3:4", 3/4], ["16:9", 16/9], ["9:16", 9/16], ["21:9", 21/9], ["9:21", 9/21],
      ];
      let best = "16:9";
      let bestDist = Infinity;
      for (const [name, val] of ratioMap) {
        const dist = Math.abs(ratio - val);
        if (dist < bestDist) { bestDist = dist; best = name; }
      }
      console.log(`[Luma API] Normalized aspect ratio "${ar}" → "${best}"`);
      return best;
    }

    if (action === "generate-video") {
      const model = body.model || "ray-2";
      const payload: Record<string, unknown> = {
        prompt: body.prompt,
        model,
      };
      const res = normalizeResolution(body.resolution, model);
      if (res) payload.resolution = res;
      if (body.duration) payload.duration = normalizeDuration(body.duration, model);
      if (body.aspect_ratio) payload.aspect_ratio = normalizeAspectRatio(body.aspect_ratio);
      if (body.loop !== undefined) payload.loop = body.loop;
      if (body.keyframes) payload.keyframes = body.keyframes;
      if (body.callback_url) payload.callback_url = body.callback_url;
      if (body.hdr !== undefined) payload.hdr = body.hdr;

      // Concepts API — structured camera motion/angle concepts
      // Pass concepts array directly to the API: [{ "key": "dolly_zoom" }]
      if (body.concepts && Array.isArray(body.concepts) && body.concepts.length > 0) {
        payload.concepts = body.concepts;
      }

      try {
        // Use /generations (the documented endpoint) as primary. /generations/video may also work.
        const result = await lumaFetch("/generations", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        return NextResponse.json(result);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);

        // Auto-retry without concepts on "invalid concept" error
        if (errMsg.includes("invalid concept") && payload.concepts) {
          console.warn(`[Luma API] "invalid concept" error — retrying without concepts`);
          delete payload.concepts;
          const retryResult = await lumaFetch("/generations", {
            method: "POST",
            body: JSON.stringify(payload),
          });
          return NextResponse.json(retryResult);
        }

        // Auto-retry on "no access" — likely resolution/feature not available on this plan
        if (errMsg.includes("no access")) {
          console.warn(`[Luma API] "no access" error — retrying without resolution/hdr`);
          delete payload.resolution;
          delete payload.hdr;
          const retryResult = await lumaFetch("/generations", {
            method: "POST",
            body: JSON.stringify(payload),
          });
          return NextResponse.json(retryResult);
        }
        throw err;
      }
    }

    if (action === "generate-image") {
      const payload: Record<string, unknown> = {
        prompt: body.prompt,
        model: body.model || "photon-1",
      };
      if (body.aspect_ratio) payload.aspect_ratio = normalizeAspectRatio(body.aspect_ratio);
      if (body.image_ref) payload.image_ref = body.image_ref;
      if (body.style_ref) payload.style_ref = body.style_ref;
      if (body.character_ref) payload.character_ref = body.character_ref;
      if (body.modify_image_ref) payload.modify_image_ref = body.modify_image_ref;

      const result = await lumaFetch("/generations/image", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      return NextResponse.json(result);
    }

    if (action === "modify-video") {
      const payload: Record<string, unknown> = {
        generation_type: "modify_video",
        prompt: body.prompt,
        model: body.model || "ray-2",
        mode: body.mode || "adhere_1",
      };
      // Structured media object — the proper Modify Video API format
      if (body.media) {
        payload.media = body.media;
      } else if (body.video_url) {
        payload.media = { url: body.video_url };
      }
      // First frame guidance — optional but improves quality
      if (body.first_frame) {
        payload.first_frame = body.first_frame;
      }
      // Keyframes support for modify-video-keyframes (start + end frame control)
      if (body.keyframes) payload.keyframes = body.keyframes;
      if (body.hdr !== undefined) payload.hdr = body.hdr;
      if (body.callback_url) payload.callback_url = body.callback_url;

      try {
        const result = await lumaFetch("/generations/video/modify", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        return NextResponse.json(result);
      } catch (err) {
        // Fallback to old endpoint if the new one returns 404
        const errMsg = err instanceof Error ? err.message : String(err);
        if (errMsg.includes("404")) {
          console.warn(`[Luma API] /generations/video/modify returned 404, falling back to /generations`);
          delete payload.generation_type;
          const fallbackResult = await lumaFetch("/generations", {
            method: "POST",
            body: JSON.stringify(payload),
          });
          return NextResponse.json(fallbackResult);
        }
        throw err;
      }
    }

    if (action === "reframe") {
      const isImage = body.media_type === "image";
      const payload: Record<string, unknown> = {
        generation_type: isImage ? "reframe_image" : "reframe_video",
        aspect_ratio: normalizeAspectRatio(body.aspect_ratio) || "16:9",
        model: body.model || "ray-2",
      };
      // Structured media object
      if (body.media) {
        payload.media = body.media;
      } else if (body.video_url) {
        payload.media = { url: body.video_url };
      } else if (body.image_url) {
        payload.media = { url: body.image_url };
      }
      if (body.prompt) payload.prompt = body.prompt;
      if (body.callback_url) payload.callback_url = body.callback_url;
      // Advanced reframe positioning
      if (body.grid_position_x !== undefined) payload.grid_position_x = body.grid_position_x;
      if (body.grid_position_y !== undefined) payload.grid_position_y = body.grid_position_y;

      const endpoint = isImage ? "/generations/image/reframe" : "/generations/video/reframe";
      try {
        const result = await lumaFetch(endpoint, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        return NextResponse.json(result);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (errMsg.includes("404")) {
          console.warn(`[Luma API] ${endpoint} returned 404, falling back to /generations`);
          delete payload.generation_type;
          const fallbackEndpoint = isImage ? "/generations/image" : "/generations";
          const fallbackResult = await lumaFetch(fallbackEndpoint, {
            method: "POST",
            body: JSON.stringify(payload),
          });
          return NextResponse.json(fallbackResult);
        }
        throw err;
      }
    }

    // ==== UPSCALE — upscale an existing generation to higher resolution ===
    if (action === "upscale") {
      const generationId = body.generation_id || body.id;
      if (!generationId) {
        return NextResponse.json({ error: "generation_id is required for upscale" }, { status: 400 });
      }
      const payload: Record<string, unknown> = {
        generation_type: "upscale_video",
      };
      if (body.resolution) payload.resolution = body.resolution;
      if (body.callback_url) payload.callback_url = body.callback_url;

      try {
        const result = await lumaFetch(`/generations/${generationId}/upscale`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        return NextResponse.json(result);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[Luma API] Upscale failed: ${errMsg}`);
        throw err;
      }
    }

    // ==== ADD AUDIO TO GENERATION — native Luma audio addition ============
    if (action === "add-audio") {
      const generationId = body.generation_id || body.id;
      if (!generationId) {
        return NextResponse.json({ error: "generation_id is required for add-audio" }, { status: 400 });
      }
      const payload: Record<string, unknown> = {
        generation_type: "add_audio",
      };
      if (body.prompt) payload.prompt = body.prompt;
      if (body.negative_prompt) payload.negative_prompt = body.negative_prompt;
      if (body.callback_url) payload.callback_url = body.callback_url;

      try {
        const result = await lumaFetch(`/generations/${generationId}/audio`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        return NextResponse.json(result);
      } catch (err) {
        // Fallback to Replicate audio if Luma audio endpoint fails
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn(`[Luma API] Native add-audio failed (${errMsg}), falling back to Replicate`);
        const replicateToken = getReplicateToken();
        if (replicateToken) {
          const audioModel = REPLICATE_AUDIO_MODELS["musicgen"];
          const audioInput: Record<string, unknown> = {};
          if (body.prompt) audioInput.prompt = body.prompt;
          if (body.duration) audioInput.duration = parseDurationToSeconds(body.duration);
          const prediction = await replicateFetch(
            `/predictions`,
            { method: "POST", body: JSON.stringify({ version: audioModel.version, input: audioInput }) },
          );
          return NextResponse.json({
            id: `rep_${prediction.id}`,
            state: prediction.status === "succeeded" ? "completed" : prediction.status === "failed" ? "failed" : "queued",
            assets: prediction.status === "succeeded" ? normalizeReplicateOutput(prediction.output) : undefined,
            error: prediction.error || undefined,
          });
        }
        throw err;
      }
    }

    // ==== AUDIO GENERATION (Luma provider) ================================
    // Luma does NOT have an audio API yet (returns 405). Always route audio
    // through Replicate when available, regardless of provider selection.
    // This is expected — Luma is for video/image, Replicate handles audio.
    if (action === "generate-audio" || action === "generate-sfx" || action === "voiceover" || action === "lip-sync") {
      const replicateToken = getReplicateToken();
      if (replicateToken) {
        console.log(`[Luma API] Audio action "${action}" → routing to Replicate (Luma has no audio API)`);
        let audioModelKey = "musicgen";
        if (action === "voiceover" || action === "lip-sync") audioModelKey = "bark";
        if (body.audio_model === "musicgen") audioModelKey = "musicgen";

        const audioModel = REPLICATE_AUDIO_MODELS[audioModelKey];
        if (!audioModel) {
          return NextResponse.json({ error: `Unknown audio model: ${audioModelKey}` }, { status: 400 });
        }
        const audioInput: Record<string, unknown> = {};
        if (body.prompt) audioInput.prompt = body.prompt;
        if (body.duration) audioInput.duration = parseDurationToSeconds(body.duration);
        if (body.script) audioInput.text_prompt = body.script;

        const prediction = await replicateFetch(
          `/predictions`,
          { method: "POST", body: JSON.stringify({ version: audioModel.version, input: audioInput }) },
        );

        return NextResponse.json({
          id: `rep_${prediction.id}`,
          state: prediction.status === "succeeded" ? "completed" :
                 prediction.status === "failed" ? "failed" : "queued",
          assets: prediction.status === "succeeded"
            ? normalizeReplicateOutput(prediction.output)
            : undefined,
          error: prediction.error || undefined,
        });
      }
      return NextResponse.json(
        { error: "No Replicate API token available for audio generation. Set REPLICATE_API_TOKEN in .env.local." },
        { status: 400 },
      );
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: String(err instanceof Error ? err.message : err) },
      { status: 500 },
    );
  }
}

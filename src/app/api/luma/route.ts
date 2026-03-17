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
  "luma-ray-3-720p":     { owner: "luma",               name: "ray-3-720p",              desc: "Luma Ray 3 720p",               type: "video" },
  "luma-ray-3-540p":     { owner: "luma",               name: "ray-3-540p",              desc: "Luma Ray 3 540p",               type: "video" },
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
  const res = await fetch(`https://api.replicate.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Replicate API error (${res.status}): ${errText}`);
  }
  return res.json();
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
    return "luma-ray-3-720p";
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
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action: string = body.action;
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
        if (body.duration) audioInput.duration = body.duration;
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
      const payload: Record<string, unknown> = {
        prompt: body.prompt,
        model: body.model || "ray-3",
      };
      if (body.resolution) payload.resolution = body.resolution;
      if (body.duration) payload.duration = body.duration;
      if (body.aspect_ratio) payload.aspect_ratio = normalizeAspectRatio(body.aspect_ratio);
      if (body.loop !== undefined) payload.loop = body.loop;
      if (body.keyframes) payload.keyframes = body.keyframes;
      if (body.concepts) payload.concepts = body.concepts;
      if (body.callback_url) payload.callback_url = body.callback_url;
      if (body.hdr !== undefined) payload.hdr = body.hdr;

      const result = await lumaFetch("/generations", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      return NextResponse.json(result);
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
        prompt: body.prompt,
        model: body.model || "ray-3",
        mode: body.mode || "adhere_1",
      };
      if (body.media) payload.media = body.media;
      if (body.first_frame) payload.first_frame = body.first_frame;
      // Keyframes support for modify-video-keyframes (start + end frame control)
      if (body.keyframes) payload.keyframes = body.keyframes;
      if (body.hdr !== undefined) payload.hdr = body.hdr;

      const result = await lumaFetch("/generations", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      return NextResponse.json(result);
    }

    if (action === "reframe") {
      const payload: Record<string, unknown> = {
        aspect_ratio: normalizeAspectRatio(body.aspect_ratio) || "16:9",
        model: body.model || "ray-3",
      };
      if (body.media) payload.media = body.media;
      if (body.prompt) payload.prompt = body.prompt;

      const endpoint =
        body.media_type === "image" ? "/generations/image" : "/generations";

      const result = await lumaFetch(endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      return NextResponse.json(result);
    }

    // ==== AUDIO GENERATION (Luma provider) ================================
    if (action === "generate-audio" || action === "generate-sfx" || action === "voiceover" || action === "lip-sync") {
      // Try Luma native audio API first
      try {
        const audioPayload: Record<string, unknown> = {
          prompt: body.prompt,
          model: body.model || "ray-audio",
        };
        if (body.duration) audioPayload.duration = body.duration;
        if (body.media) audioPayload.media = body.media;
        if (action === "lip-sync") {
          audioPayload.type = "lip-sync";
          if (body.video_url) audioPayload.video = { url: body.video_url };
          if (body.audio_url) audioPayload.audio = { url: body.audio_url };
        }
        if (action === "voiceover") {
          audioPayload.type = "voiceover";
          if (body.script) audioPayload.script = body.script;
        }
        const result = await lumaFetch("/generations/audio", {
          method: "POST",
          body: JSON.stringify(audioPayload),
        });
        return NextResponse.json(result);
      } catch {
        // Luma audio endpoint may not exist yet — fallback to Replicate
        const replicateToken = getReplicateToken();
        if (replicateToken) {
          let audioModelKey = "musicgen";
          if (action === "voiceover" || action === "lip-sync") audioModelKey = "bark";
          if (body.audio_model === "musicgen") audioModelKey = "musicgen";

          const audioModel = REPLICATE_AUDIO_MODELS[audioModelKey];
          if (!audioModel) {
            return NextResponse.json({ error: `Unknown audio model: ${audioModelKey}` }, { status: 400 });
          }
          const audioInput: Record<string, unknown> = {};
          if (body.prompt) audioInput.prompt = body.prompt;
          if (body.duration) audioInput.duration = body.duration;
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
          { error: "No provider available for audio generation." },
          { status: 400 },
        );
      }
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: String(err instanceof Error ? err.message : err) },
      { status: 500 },
    );
  }
}

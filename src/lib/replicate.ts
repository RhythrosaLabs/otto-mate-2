/**
 * Replicate Smart Model Router
 *
 * Dynamically discovers and routes to the best Replicate model for any request.
 * Searches the real-time Replicate model library, ranks candidates by task fit,
 * runs the prediction, polls for results, and downloads output files.
 *
 * Supports: image generation, video generation, image editing, upscaling,
 * audio generation, music, speech, 3D, text models, and hundreds more.
 */

import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReplicateModel {
  owner: string;
  name: string;
  description: string;
  url: string;
  run_count: number;
  cover_image_url?: string;
  default_example?: {
    input: Record<string, unknown>;
    output: unknown;
  };
  latest_version?: {
    id: string;
    openapi_schema?: Record<string, unknown>;
  };
}

export interface ReplicateModelVersion {
  id: string;
  openapi_schema: {
    components?: {
      schemas?: {
        Input?: {
          properties?: Record<string, {
            type?: string;
            description?: string;
            default?: unknown;
            enum?: unknown[];
            minimum?: number;
            maximum?: number;
            format?: string;
            "x-order"?: number;
          }>;
          required?: string[];
        };
        Output?: Record<string, unknown>;
      };
    };
  };
}

export interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output: unknown;
  error?: string;
  logs?: string;
  metrics?: { predict_time?: number };
  urls: { get: string; cancel: string };
  created_at: string;
  completed_at?: string;
}

export type ReplicateTaskType =
  | "image_generation"
  | "image_editing"
  | "image_upscale"
  | "image_to_video"
  | "video_generation"
  | "text_to_speech"
  | "music_generation"
  | "audio_generation"
  | "3d_generation"
  | "text_generation"
  | "image_captioning"
  | "background_removal"
  | "style_transfer"
  | "face_swap"
  | "inpainting"
  | "img2img"
  | "general";

// ─── Task Type Detection ──────────────────────────────────────────────────────

interface TaskPattern {
  type: ReplicateTaskType;
  patterns: RegExp;
  priority: number;
  searchTerms: string[];       // Terms used to search Replicate's library
  defaultModel?: string;        // Well-known best model (owner/name)
}

const TASK_PATTERNS: TaskPattern[] = [
  {
    type: "image_upscale",
    patterns: /\b(upscale|upres|enhance|super.?resolution|increase.?resolution|hd|4k|8k|sharpen|deblur)\b/i,
    priority: 15,
    searchTerms: ["upscale image", "super resolution"],
    defaultModel: "recraft-ai/recraft-crisp-upscale",
  },
  {
    type: "background_removal",
    patterns: /\b(remove.?background|bg.?remov|transparent.?background|cut.?out|background.?erase|isolate.?subject)\b/i,
    priority: 15,
    searchTerms: ["remove background"],
    defaultModel: "recraft-ai/recraft-remove-background",
  },
  {
    type: "face_swap",
    patterns: /\b(face.?swap|swap.?face|put.?my.?face|replace.?face|face.?replace)\b/i,
    priority: 14,
    searchTerms: ["face swap"],
    defaultModel: "yan-ops/face_swap",
  },
  {
    type: "image_to_video",
    patterns: /\b(image.?to.?video|animate.?image|img2vid|make.?it.?move|bring.?to.?life|animate.?this|animate.?photo)\b/i,
    priority: 13,
    searchTerms: ["image to video", "animate image"],
    defaultModel: "stability-ai/stable-video-diffusion",
  },
  {
    type: "video_generation",
    patterns: /\b(video|clip|animation|motion|cinematic|film|footage|movie|animate)\b/i,
    priority: 11,
    searchTerms: ["video generation", "text to video"],
  },
  {
    type: "inpainting",
    patterns: /\b(inpaint|fill.?in|repair.?image|restore.?image|fix.?photo|remove.?object)\b/i,
    priority: 13,
    searchTerms: ["inpainting", "image repair"],
    defaultModel: "stability-ai/stable-diffusion-inpainting",
  },
  {
    type: "img2img",
    patterns: /\b(img2img|image.?to.?image|transform.?image|restyle|reimagine|modify.?image|edit.?image|alter.?image|change.?image|convert.?image)\b/i,
    priority: 12,
    searchTerms: ["image to image", "img2img"],
  },
  {
    type: "image_editing",
    patterns: /\b(edit.?photo|photo.?edit|retouch|color.?correct|crop|resize|filter|adjust|enhance.?photo|manipulate)\b/i,
    priority: 11,
    searchTerms: ["image editing", "photo editing"],
  },
  {
    type: "style_transfer",
    patterns: /\b(style.?transfer|artistic.?style|paint.?like|in.?the.?style.?of|stylize|turn.?into.?art)\b/i,
    priority: 12,
    searchTerms: ["style transfer", "artistic style"],
  },
  {
    type: "image_generation",
    patterns: /\b(generate.?image|create.?image|draw|paint|illustrat|render|design|picture|photo|poster|banner|wallpaper|logo|icon|art|visual|graphic|concept.?art|digital.?art|ai.?art)\b/i,
    priority: 8,
    searchTerms: ["text to image", "image generation"],
    defaultModel: "black-forest-labs/flux-schnell",
  },
  {
    type: "text_to_speech",
    patterns: /\b(text.?to.?speech|tts|speak|voice|narrat|read.?aloud|say.?this|voiceover)\b/i,
    priority: 12,
    searchTerms: ["text to speech"],
    defaultModel: "jaaari/kokoro-82m",
  },
  {
    type: "music_generation",
    patterns: /\b(music|song|beat|melody|compose|soundtrack|instrumental|jingle|tune|audio.?generat)\b/i,
    priority: 11,
    searchTerms: ["music generation", "text to music"],
    defaultModel: "minimax/speech-02-turbo",
  },
  {
    type: "audio_generation",
    patterns: /\b(audio|sound|sound.?effect|sfx|noise|ambient)\b/i,
    priority: 9,
    searchTerms: ["audio generation", "sound effect"],
  },
  {
    type: "3d_generation",
    patterns: /\b(3d|mesh|model.?3d|generate.?3d|3d.?model|point.?cloud|nerf|gaussian.?splat)\b/i,
    priority: 12,
    searchTerms: ["3d generation", "text to 3d"],
  },
  {
    type: "image_captioning",
    patterns: /\b(caption|describe.?image|what.?is.?this|identify|recognize|ocr|read.?text.?from)\b/i,
    priority: 10,
    searchTerms: ["image captioning", "image recognition"],
    defaultModel: "salesforce/blip",
  },
  {
    type: "text_generation",
    patterns: /\b(llm|language.?model|generate.?text|llama|mistral|chat.?model|write|essay|poem|story|explain|answer|tell.?me|summarize|summarise|translate|rewrite|paragraph|sentence|lyrics|script|blog|article|code|program|function|convert.?text|list|describe(?!.*(image|photo|picture)))\b/i,
    priority: 7,
    searchTerms: ["language model", "text generation"],
    defaultModel: "meta/meta-llama-3-70b-instruct",
  },
];

/**
 * Detect what type of Replicate task the user wants based on their prompt.
 */
export function detectReplicateTaskType(prompt: string): { type: ReplicateTaskType; confidence: number; searchTerms: string[]; defaultModel?: string } {
  let bestMatch: TaskPattern | null = null;
  let bestScore = 0;

  for (const pattern of TASK_PATTERNS) {
    const matches = prompt.match(new RegExp(pattern.patterns, "gi"));
    if (!matches) continue;

    // Score = match count * priority + position bonus (earlier = stronger)
    const totalWords = Math.max(prompt.split(/\s+/).length, 1);
    let posBonus = 0;
    for (const m of matches) {
      const idx = prompt.toLowerCase().indexOf(m.toLowerCase());
      const wordPos = prompt.slice(0, idx).split(/\s+/).length;
      posBonus += (1 - wordPos / totalWords) * 3;
    }
    const score = matches.length * pattern.priority + posBonus;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = pattern;
    }
  }

  if (!bestMatch) {
    // Default to image generation for the playground — most users expect image output
    return { type: "image_generation", confidence: 0.3, searchTerms: ["text to image", "image generation"], defaultModel: "black-forest-labs/flux-schnell" };
  }

  return {
    type: bestMatch.type,
    confidence: Math.min(bestScore / 25, 1),
    searchTerms: bestMatch.searchTerms,
    defaultModel: bestMatch.defaultModel,
  };
}

// ─── Replicate API Client ─────────────────────────────────────────────────────

function getApiToken(): string {
  // Check env var first, then fall back to connector config
  if (process.env.REPLICATE_API_TOKEN) return process.env.REPLICATE_API_TOKEN;
  // Try fallback import from db connector config
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getConnectorConfig } = require("./db") as { getConnectorConfig: (id: string) => Record<string, unknown> | null };
    const config = getConnectorConfig("replicate");
    if (config?.api_key) return config.api_key as string;
  } catch { /* ignore */ }
  return "";
}

function apiHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

/**
 * Search Replicate's model library for models matching a query.
 * Returns models sorted by relevance and popularity.
 */
export async function searchModels(query: string, token?: string): Promise<ReplicateModel[]> {
  const t = token || getApiToken();
  if (!t) throw new Error("Replicate API token not configured. Set REPLICATE_API_TOKEN or connect Replicate in Connectors.");

  // Use Replicate's collections + search endpoints for best results
  const results: ReplicateModel[] = [];

  // 1. Search the models endpoint
  try {
    const searchUrl = `https://api.replicate.com/v1/models?query=${encodeURIComponent(query)}`;
    const resp = await fetch(searchUrl, { headers: apiHeaders(t) });
    if (resp.ok) {
      const data = await resp.json() as { results?: ReplicateModel[] };
      if (data.results) results.push(...data.results);
    }
  } catch { /* fall through */ }

  // 2. Also try the collections endpoints for curated model lists
  const collectionMap: Record<string, string[]> = {
    "image": ["text-to-image", "image-to-image"],
    "video": ["text-to-video", "image-to-video"],
    "audio": ["text-to-speech", "text-to-audio"],
    "music": ["text-to-audio"],
    "3d": ["text-to-3d"],
    "upscale": ["image-upscalers"],
    "speech": ["text-to-speech"],
  };

  for (const [keyword, slugs] of Object.entries(collectionMap)) {
    if (query.toLowerCase().includes(keyword)) {
      for (const slug of slugs) {
        try {
          const resp = await fetch(`https://api.replicate.com/v1/collections/${slug}`, { headers: apiHeaders(t) });
          if (resp.ok) {
            const data = await resp.json() as { models?: ReplicateModel[] };
            if (data.models) {
              // Add only models not already in results
              for (const m of data.models) {
                if (!results.find(r => r.owner === m.owner && r.name === m.name)) {
                  results.push(m);
                }
              }
            }
          }
        } catch { /* ignore */ }
      }
    }
  }

  // Sort by run_count (popularity) as a quality signal
  results.sort((a, b) => (b.run_count || 0) - (a.run_count || 0));

  return results;
}

/**
 * Get a specific model's details and latest version schema.
 */
export async function getModel(owner: string, name: string, token?: string): Promise<ReplicateModel & { latest_version?: ReplicateModelVersion }> {
  const t = token || getApiToken();
  if (!t) throw new Error("Replicate API token not configured.");

  const resp = await fetch(`https://api.replicate.com/v1/models/${owner}/${name}`, { headers: apiHeaders(t) });
  if (!resp.ok) throw new Error(`Model not found: ${owner}/${name} (HTTP ${resp.status})`);
  return await resp.json() as ReplicateModel & { latest_version?: ReplicateModelVersion };
}

/**
 * Get the input schema for a model to understand what parameters it accepts.
 */
export async function getModelInputSchema(owner: string, name: string, token?: string): Promise<{
  properties: Record<string, { type?: string; description?: string; default?: unknown; enum?: unknown[] }>;
  required: string[];
}> {
  const model = await getModel(owner, name, token);
  const schema = model.latest_version?.openapi_schema?.components?.schemas?.Input as {
    properties?: Record<string, { type?: string; description?: string; default?: unknown; enum?: unknown[] }>;
    required?: string[];
  } | undefined;
  return {
    properties: schema?.properties || {},
    required: schema?.required || [],
  };
}

/**
 * Intelligently select the best model for a task by searching Replicate and ranking.
 */
export async function selectBestModel(
  userPrompt: string,
  taskType: ReplicateTaskType,
  searchTerms: string[],
  preferredModel?: string,
  token?: string
): Promise<{ owner: string; name: string; reason: string }> {
  // If user specified a model explicitly, use it
  if (preferredModel && preferredModel.includes("/")) {
    const [owner, name] = preferredModel.split("/");
    return { owner, name, reason: `User-specified model: ${preferredModel}` };
  }

  const t = token || getApiToken();

  // Search using each search term and aggregate results
  const allModels: ReplicateModel[] = [];
  for (const term of searchTerms.slice(0, 2)) { // limit to 2 searches for speed
    try {
      const models = await searchModels(term, t);
      for (const m of models) {
        if (!allModels.find(e => e.owner === m.owner && e.name === m.name)) {
          allModels.push(m);
        }
      }
    } catch { /* ignore */ }
  }

  if (allModels.length === 0) {
    throw new Error(`No Replicate models found for task type: ${taskType}. Search terms: ${searchTerms.join(", ")}`);
  }

  // Score each model
  const scored = allModels.map(m => {
    let score = 0;
    const desc = (m.description || "").toLowerCase();
    const fullName = `${m.owner}/${m.name}`.toLowerCase();
    const prompt = userPrompt.toLowerCase();

    // Run count is a strong quality/reliability signal
    score += Math.log10(Math.max(m.run_count || 1, 1)) * 5;

    // Keyword overlap between user prompt and model description
    const promptWords = new Set(prompt.split(/\s+/).filter(w => w.length > 3));
    for (const word of promptWords) {
      if (desc.includes(word)) score += 2;
      if (fullName.includes(word)) score += 3;
    }

    // Well-known high-quality models get a boost
    const premiumModels: Record<string, number> = {
      "black-forest-labs/flux": 20,
      "stability-ai/": 15,
      "meta/": 12,
      "openai/": 15,
      "nightmareai/real-esrgan": 18,
      "lucataco/": 10,
      "bytedance/": 12,
      "tencent/": 10,
      "google/": 12,
    };
    for (const [prefix, bonus] of Object.entries(premiumModels)) {
      if (fullName.startsWith(prefix) || fullName.includes(prefix)) score += bonus;
    }

    // Task-type-specific boosts
    if (taskType === "image_generation") {
      if (desc.includes("flux") || desc.includes("stable diffusion") || desc.includes("sdxl")) score += 10;
      if (fullName.includes("flux")) score += 15;
    }
    if (taskType === "video_generation") {
      if (desc.includes("video") || desc.includes("sora") || desc.includes("animate")) score += 10;
    }
    if (taskType === "image_upscale") {
      if (desc.includes("upscal") || desc.includes("super resolution") || desc.includes("esrgan")) score += 10;
    }

    return { model: m, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const runnerUp = scored[1];

  return {
    owner: best.model.owner,
    name: best.model.name,
    reason: `Selected "${best.model.owner}/${best.model.name}" (${(best.model.run_count || 0).toLocaleString()} runs, score: ${best.score.toFixed(1)})${runnerUp ? ` over ${scored.length - 1} other candidates` : ""}. ${(best.model.description || "").slice(0, 120)}`,
  };
}

/**
 * Build the input object for a model based on its schema and the user's request.
 */
export async function buildModelInput(
  owner: string,
  name: string,
  userPrompt: string,
  taskType: ReplicateTaskType,
  userParams?: Record<string, unknown>,
  token?: string
): Promise<Record<string, unknown>> {
  const input: Record<string, unknown> = {};

  // Get the model's input schema
  let schema: { properties: Record<string, { type?: string; description?: string; default?: unknown; enum?: unknown[] }>; required: string[] };
  try {
    schema = await getModelInputSchema(owner, name, token);
  } catch {
    // Fallback: just pass prompt
    return { prompt: userPrompt, ...userParams };
  }

  const props = schema.properties;
  const propNames = Object.keys(props);

  // Apply user-specified params first (highest priority)
  if (userParams) {
    for (const [k, v] of Object.entries(userParams)) {
      if (propNames.includes(k)) input[k] = v;
    }
  }

  // Smart mapping: figure out which field is the "prompt" field
  const promptFields = ["prompt", "text", "input", "text_input", "instruction", "message", "query", "caption"];
  for (const pf of promptFields) {
    if (propNames.includes(pf) && !input[pf]) {
      input[pf] = userPrompt;
      break;
    }
  }

  // If the model takes an image input and user provided a URL, set it
  const imageFields = ["image", "input_image", "image_url", "img", "source_image", "init_image"];
  for (const f of imageFields) {
    if (propNames.includes(f) && userParams?.[f]) {
      input[f] = userParams[f];
    }
  }

  // Smart defaults for common parameters
  if (propNames.includes("num_outputs") && !input["num_outputs"]) input["num_outputs"] = 1;
  if (propNames.includes("num_inference_steps") && !input["num_inference_steps"]) {
    // Clamp to model's accepted range (e.g. flux-schnell only allows 1-4)
    const stepsSchema = props["num_inference_steps"] as Record<string, unknown>;
    const maxSteps = typeof stepsSchema?.maximum === "number" ? stepsSchema.maximum : 50;
    const minSteps = typeof stepsSchema?.minimum === "number" ? stepsSchema.minimum : 1;
    const defaultSteps = typeof stepsSchema?.default === "number" ? stepsSchema.default : Math.min(28, maxSteps);
    input["num_inference_steps"] = Math.max(minSteps, Math.min(defaultSteps, maxSteps));
  }
  if (propNames.includes("guidance_scale") && !input["guidance_scale"]) input["guidance_scale"] = 7.5;

  // If the model expects aspect_ratio, pick a good default
  if (propNames.includes("aspect_ratio") && !input["aspect_ratio"]) {
    if (taskType === "video_generation") input["aspect_ratio"] = "16:9";
    else input["aspect_ratio"] = "1:1";
  }

  // For output format preferences
  if (propNames.includes("output_format") && !input["output_format"]) input["output_format"] = "png";

  return input;
}

/**
 * Create a prediction (run a model) on Replicate.
 */
export async function createPrediction(
  owner: string,
  name: string,
  input: Record<string, unknown>,
  token?: string
): Promise<ReplicatePrediction> {
  const t = token || getApiToken();
  if (!t) throw new Error("Replicate API token not configured.");

  // Try the official model endpoint first (auto-selects latest version)
  let resp = await fetch(`https://api.replicate.com/v1/models/${owner}/${name}/predictions`, {
    method: "POST",
    headers: apiHeaders(t),
    body: JSON.stringify({ input }),
  });

  // Some models (e.g. community models) only support version-based predictions.
  // Fall back to /v1/predictions with the model's latest version.
  if (resp.status === 404) {
    const modelResp = await fetch(`https://api.replicate.com/v1/models/${owner}/${name}`, {
      headers: apiHeaders(t),
    });
    if (modelResp.ok) {
      const modelData = await modelResp.json() as { latest_version?: { id?: string } };
      const version = modelData.latest_version?.id;
      if (version) {
        resp = await fetch(`https://api.replicate.com/v1/predictions`, {
          method: "POST",
          headers: apiHeaders(t),
          body: JSON.stringify({ version, input }),
        });
      }
    }
  }

  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(`Replicate prediction failed (HTTP ${resp.status}): ${errBody.slice(0, 300)}`);
  }

  return await resp.json() as ReplicatePrediction;
}

/**
 * Poll a prediction until it completes or fails.
 * Uses exponential backoff starting at 1s, max 10s between polls.
 */
export async function waitForPrediction(
  predictionId: string,
  token?: string,
  maxWaitMs = 300_000, // 5 minutes max
  onProgress?: (prediction: ReplicatePrediction) => void
): Promise<ReplicatePrediction> {
  const t = token || getApiToken();
  if (!t) throw new Error("Replicate API token not configured.");

  const startTime = Date.now();
  let delay = 1000; // start at 1s

  while (Date.now() - startTime < maxWaitMs) {
    const resp = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: apiHeaders(t),
    });

    if (!resp.ok) throw new Error(`Failed to poll prediction ${predictionId}: HTTP ${resp.status}`);

    const prediction = await resp.json() as ReplicatePrediction;
    onProgress?.(prediction);

    if (prediction.status === "succeeded") return prediction;
    if (prediction.status === "failed") throw new Error(`Prediction failed: ${prediction.error || "Unknown error"}`);
    if (prediction.status === "canceled") throw new Error("Prediction was canceled.");

    // Exponential backoff: 1s, 2s, 4s, 8s, 10s (capped)
    await new Promise(r => setTimeout(r, delay));
    delay = Math.min(delay * 2, 10_000);
  }

  throw new Error(`Prediction ${predictionId} timed out after ${Math.round(maxWaitMs / 1000)}s.`);
}

/**
 * Download output files from a completed prediction and save them to the task directory.
 * Returns array of { filename, size, mimeType, url }.
 */
export async function downloadPredictionOutputs(
  prediction: ReplicatePrediction,
  filesDir: string,
  filenamePrefix = "replicate_output"
): Promise<Array<{ filename: string; filePath: string; size: number; mimeType: string; url: string }>> {
  const outputs = normalizeOutput(prediction.output);
  const results: Array<{ filename: string; filePath: string; size: number; mimeType: string; url: string }> = [];

  for (let i = 0; i < outputs.length; i++) {
    const url = outputs[i];
    if (!url || typeof url !== "string") continue;

    // Skip data URIs or non-URL strings
    if (!url.startsWith("http")) continue;

    try {
      const resp = await fetch(url);
      if (!resp.ok) continue;

      const contentType = resp.headers.get("content-type") || "application/octet-stream";
      const ext = mimeToExtension(contentType);
      const filename = outputs.length === 1
        ? `${filenamePrefix}${ext}`
        : `${filenamePrefix}_${i + 1}${ext}`;
      const filePath = path.join(filesDir, filename);

      const buf = Buffer.from(await resp.arrayBuffer());
      fs.writeFileSync(filePath, buf);

      results.push({
        filename,
        filePath,
        size: buf.length,
        mimeType: contentType,
        url,
      });
    } catch {
      // Skip failed downloads
    }
  }

  return results;
}

/**
 * Full pipeline: detect task → search models → select best → build input → run → poll → download.
 * This is the main entry point for the agent tool.
 */
export async function runReplicateTask(options: {
  prompt: string;
  model?: string;        // Optional: explicit "owner/name" to skip model selection
  params?: Record<string, unknown>;  // Extra input params (image URLs, settings, etc.)
  filesDir: string;
  onProgress?: (status: string) => void;
  token?: string;
}): Promise<{
  model: string;
  modelReason: string;
  taskType: ReplicateTaskType;
  prediction: ReplicatePrediction;
  files: Array<{ filename: string; filePath: string; size: number; mimeType: string }>;
  textOutput?: string;
}> {
  const { prompt, model, params, filesDir, onProgress, token } = options;
  const t = token || getApiToken();
  if (!t) throw new Error("Replicate API token not configured. Set REPLICATE_API_TOKEN env var or connect Replicate in the Connectors page.");

  // 1. Detect task type
  const { type: taskType, searchTerms, defaultModel } = detectReplicateTaskType(prompt);
  onProgress?.(`Detected task type: ${taskType}`);

  // 2. Select the best model
  let owner: string, name: string, reason: string;

  if (model && model.includes("/")) {
    // User specified exact model
    [owner, name] = model.split("/", 2);
    reason = `User-specified model: ${model}`;
    onProgress?.(`Using specified model: ${model}`);
  } else if (defaultModel && !model) {
    // Use well-known default for this task type, but still verify it exists
    [owner, name] = defaultModel.split("/", 2);
    reason = `Default model for ${taskType}: ${defaultModel}`;
    onProgress?.(`Using best-known model for ${taskType}: ${defaultModel}`);

    // Search in parallel to potentially find something better with more runs
    try {
      const selected = await selectBestModel(prompt, taskType, searchTerms, undefined, t);
      // Only override if the search found something significantly more popular
      const defaultModelData = await getModel(owner, name, t).catch(() => null);
      if (defaultModelData && selected.owner !== owner) {
        const searchedModel = await getModel(selected.owner, selected.name, t).catch(() => null);
        if (searchedModel && (searchedModel.run_count || 0) > (defaultModelData.run_count || 0) * 2) {
          owner = selected.owner;
          name = selected.name;
          reason = selected.reason;
          onProgress?.(`Found better model: ${owner}/${name}`);
        }
      }
    } catch {
      // Stick with default
    }
  } else {
    // Dynamic discovery
    onProgress?.(`Searching Replicate for best ${taskType} model...`);
    const selected = await selectBestModel(prompt, taskType, searchTerms, model, t);
    owner = selected.owner;
    name = selected.name;
    reason = selected.reason;
    onProgress?.(`Selected: ${owner}/${name}`);
  }

  // 3. Build the input based on model schema
  onProgress?.(`Building input for ${owner}/${name}...`);
  const input = await buildModelInput(owner, name, prompt, taskType, params, t);

  // 4. Create the prediction
  onProgress?.(`Running ${owner}/${name}...`);
  const prediction = await createPrediction(owner, name, input, t);

  // 5. Poll for completion
  const completedPrediction = await waitForPrediction(
    prediction.id,
    t,
    300_000,
    (p) => onProgress?.(`Status: ${p.status}${p.metrics?.predict_time ? ` (${p.metrics.predict_time.toFixed(1)}s)` : ""}`)
  );

  // 6. Process outputs
  const output = completedPrediction.output;
  let textOutput: string | undefined;
  const files: Array<{ filename: string; filePath: string; size: number; mimeType: string }> = [];

  // Check if output is text/string (for language models, captioning, etc.)
  if (typeof output === "string" && !output.startsWith("http")) {
    textOutput = output;
  } else if (Array.isArray(output) && output.length > 0 && typeof output[0] === "string" && !output[0].startsWith("http")) {
    // Replicate language models return an array of individual tokens — join without separator
    textOutput = output.join("");
  }

  // Download any file outputs (images, videos, audio)
  if (!filesDir) {
    // No files dir, just return URLs
  } else {
    const prefix = taskType === "video_generation" || taskType === "image_to_video"
      ? "generated_video"
      : taskType === "music_generation" || taskType === "audio_generation" || taskType === "text_to_speech"
        ? "generated_audio"
        : taskType === "3d_generation"
          ? "generated_3d"
          : "generated_image";

    const downloaded = await downloadPredictionOutputs(completedPrediction, filesDir, prefix);
    files.push(...downloaded);
  }

  return {
    model: `${owner}/${name}`,
    modelReason: reason,
    taskType,
    prediction: completedPrediction,
    files,
    textOutput,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeOutput(output: unknown): string[] {
  if (!output) return [];
  if (typeof output === "string") return [output];
  if (Array.isArray(output)) {
    const flat: string[] = [];
    for (const item of output) {
      if (typeof item === "string") flat.push(item);
      else if (item && typeof item === "object" && "url" in item) flat.push((item as { url: string }).url);
    }
    return flat;
  }
  if (typeof output === "object" && output !== null) {
    // Some models return { output: "url" } or { video: "url" }
    const obj = output as Record<string, unknown>;
    const urlFields = ["output", "video", "audio", "image", "url", "file"];
    for (const f of urlFields) {
      if (typeof obj[f] === "string") return [obj[f] as string];
    }
  }
  return [];
}

function mimeToExtension(mimeType: string): string {
  const map: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/ogg": ".ogg",
    "audio/flac": ".flac",
    "model/gltf-binary": ".glb",
    "model/gltf+json": ".gltf",
    "application/octet-stream": ".bin",
    "text/plain": ".txt",
    "application/json": ".json",
  };
  const base = mimeType.split(";")[0].trim().toLowerCase();
  return map[base] || ".bin";
}

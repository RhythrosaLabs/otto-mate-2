/**
 * Hugging Face Smart Model Router
 *
 * Dynamically discovers and routes to Hugging Face models via the Inference API.
 * Searches the Hugging Face Hub model library, ranks candidates by task fit,
 * runs inference, polls for results, and downloads output files.
 *
 * Supports: image generation, text generation, text-to-speech, image-to-text,
 * audio classification, translation, summarization, and hundreds more.
 */

import fs from "fs";
import path from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HuggingFaceModel {
  id: string;               // e.g. "stabilityai/stable-diffusion-xl-base-1.0"
  modelId: string;
  author?: string;
  sha?: string;
  downloads: number;
  likes: number;
  tags: string[];
  pipeline_tag?: string;     // e.g. "text-to-image", "text-generation"
  library_name?: string;     // e.g. "diffusers", "transformers"
  private: boolean;
  description?: string;
  cardData?: {
    license?: string;
    tags?: string[];
  };
}

export interface HFInferenceResult {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed";
  output: unknown;
  error?: string;
  computeTime?: number;
}

export type HFTaskType =
  | "text-to-image"
  | "image-to-text"
  | "text-to-speech"
  | "text-to-video"
  | "text-to-audio"
  | "text-generation"
  | "image-classification"
  | "image-segmentation"
  | "object-detection"
  | "audio-classification"
  | "automatic-speech-recognition"
  | "translation"
  | "summarization"
  | "fill-mask"
  | "text-to-3d"
  | "image-to-image"
  | "image-to-video"
  | "zero-shot-classification"
  | "feature-extraction"
  | "general";

// ─── Task Type Detection ──────────────────────────────────────────────────────

interface HFTaskPattern {
  type: HFTaskType;
  patterns: RegExp;
  priority: number;
  searchFilter: string;       // pipeline_tag filter for HF Hub API
  defaultModel?: string;
}

const HF_TASK_PATTERNS: HFTaskPattern[] = [
  {
    type: "text-to-image",
    patterns: /\b(generate.?image|create.?image|draw|paint|illustrat|render|design|picture|photo|poster|banner|wallpaper|logo|icon|art|visual|graphic|concept.?art|digital.?art|ai.?art|text.?to.?image)\b/i,
    priority: 8,
    searchFilter: "text-to-image",
    defaultModel: "stabilityai/stable-diffusion-xl-base-1.0",
  },
  {
    type: "image-to-text",
    patterns: /\b(caption|describe.?image|what.?is.?this|identify|recognize|ocr|read.?text.?from|image.?to.?text)\b/i,
    priority: 10,
    searchFilter: "image-to-text",
    defaultModel: "Salesforce/blip-image-captioning-large",
  },
  {
    type: "text-to-speech",
    patterns: /\b(text.?to.?speech|tts|speak|voice|narrat|read.?aloud|say.?this|voiceover)\b/i,
    priority: 12,
    searchFilter: "text-to-speech",
    defaultModel: "hexgrad/Kokoro-82M",
  },
  {
    type: "text-to-video",
    patterns: /\b(video|clip|animation|motion|cinematic|film|footage|movie|animate|text.?to.?video)\b/i,
    priority: 11,
    searchFilter: "text-to-video",
  },
  {
    type: "text-to-audio",
    patterns: /\b(music|song|beat|melody|compose|soundtrack|instrumental|jingle|tune|audio.?generat|sound.?effect|sfx|text.?to.?audio)\b/i,
    priority: 11,
    searchFilter: "text-to-audio",
    defaultModel: "facebook/musicgen-small",
  },
  {
    type: "image-to-image",
    patterns: /\b(img2img|image.?to.?image|transform.?image|restyle|reimagine|modify.?image|edit.?image|alter.?image|upscale|upres|enhance|super.?resolution|style.?transfer)\b/i,
    priority: 12,
    searchFilter: "image-to-image",
  },
  {
    type: "image-to-video",
    patterns: /\b(image.?to.?video|animate.?image|img2vid|make.?it.?move|bring.?to.?life|animate.?this|animate.?photo)\b/i,
    priority: 13,
    searchFilter: "image-to-video",
  },
  {
    type: "automatic-speech-recognition",
    patterns: /\b(transcri|speech.?to.?text|stt|audio.?to.?text|whisper|voice.?recogni|dictation)\b/i,
    priority: 12,
    searchFilter: "automatic-speech-recognition",
    defaultModel: "openai/whisper-large-v3",
  },
  {
    type: "translation",
    patterns: /\b(translat|convert.?language|from.?english|to.?english|multilingual|localize)\b/i,
    priority: 11,
    searchFilter: "translation",
    defaultModel: "facebook/nllb-200-distilled-600M",
  },
  {
    type: "summarization",
    patterns: /\b(summariz|summary|tldr|condense|shorten|brief|digest)\b/i,
    priority: 11,
    searchFilter: "summarization",
    defaultModel: "facebook/bart-large-cnn",
  },
  {
    type: "object-detection",
    patterns: /\b(detect.?object|find.?object|bounding.?box|locate.?in.?image|yolo|detr)\b/i,
    priority: 12,
    searchFilter: "object-detection",
    defaultModel: "facebook/detr-resnet-50",
  },
  {
    type: "image-segmentation",
    patterns: /\b(segmentat|segment.?image|mask|pixel.?classif|semantic.?segment|sam)\b/i,
    priority: 12,
    searchFilter: "image-segmentation",
    defaultModel: "facebook/sam-vit-huge",
  },
  {
    type: "image-classification",
    patterns: /\b(classif.?image|image.?classif|categoriz|label.?image|what.?is.?in)\b/i,
    priority: 10,
    searchFilter: "image-classification",
  },
  {
    type: "zero-shot-classification",
    patterns: /\b(zero.?shot|classif.?text|categoriz.?text|sentiment|topic.?classif)\b/i,
    priority: 9,
    searchFilter: "zero-shot-classification",
  },
  {
    type: "text-to-3d",
    patterns: /\b(3d|mesh|model.?3d|generate.?3d|3d.?model|point.?cloud|nerf|gaussian.?splat)\b/i,
    priority: 12,
    searchFilter: "text-to-3d",
  },
  {
    type: "text-generation",
    patterns: /\b(llm|language.?model|generate.?text|chat.?model|gpt|llama|mistral|write|story|essay|poem|explain|answer|tell.?me|summarize|summarise|translate|rewrite|paragraph|sentence|lyrics|script|blog|article|code|program|function|convert.?text|list|describe(?!.*(image|photo|picture)))\b/i,
    priority: 7,
    searchFilter: "text-generation",
    defaultModel: "Qwen/Qwen2.5-7B-Instruct",
  },
];

/**
 * Detect what HF task type the user wants based on their prompt.
 */
export function detectHFTaskType(prompt: string): { type: HFTaskType; confidence: number; searchFilter: string; defaultModel?: string } {
  let bestMatch: HFTaskPattern | null = null;
  let bestScore = 0;

  for (const pattern of HF_TASK_PATTERNS) {
    const matches = prompt.match(new RegExp(pattern.patterns, "gi"));
    if (!matches) continue;

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
    // Default to text-to-image for the playground — most users expect image output
    return { type: "text-to-image", confidence: 0.3, searchFilter: "text-to-image", defaultModel: "stabilityai/stable-diffusion-xl-base-1.0" };
  }

  return {
    type: bestMatch.type,
    confidence: Math.min(bestScore / 25, 1),
    searchFilter: bestMatch.searchFilter,
    defaultModel: bestMatch.defaultModel,
  };
}

// ─── Hugging Face API Client ──────────────────────────────────────────────────

function getHFToken(): string {
  if (process.env.HUGGINGFACE_API_TOKEN) return process.env.HUGGINGFACE_API_TOKEN;
  if (process.env.HF_TOKEN) return process.env.HF_TOKEN;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getConnectorConfig } = require("./db") as { getConnectorConfig: (id: string) => Record<string, unknown> | null };
    const config = getConnectorConfig("huggingface");
    if (config?.api_key) return config.api_key as string;
  } catch { /* ignore */ }
  return "";
}

function hfHeaders(token: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Search the Hugging Face Hub for models matching a query.
 * Supports filtering by pipeline_tag (task type).
 */
export async function searchHFModels(
  query: string,
  options?: {
    pipelineTag?: string;
    limit?: number;
    token?: string;
  }
): Promise<HuggingFaceModel[]> {
  const limit = options?.limit || 20;
  const params = new URLSearchParams({
    search: query,
    limit: String(limit),
    sort: "downloads",
    direction: "-1",
  });

  if (options?.pipelineTag) {
    params.set("pipeline_tag", options.pipelineTag);
  }

  // Filter to models with inference API support
  params.set("filter", "endpoints_compatible");

  const url = `https://huggingface.co/api/models?${params.toString()}`;
  const t = options?.token || getHFToken();

  const resp = await fetch(url, {
    headers: t ? { Authorization: `Bearer ${t}` } : {},
  });

  if (!resp.ok) {
    throw new Error(`Hugging Face search failed (HTTP ${resp.status}): ${await resp.text()}`);
  }

  const models = await resp.json() as HuggingFaceModel[];
  return models;
}

/**
 * Get a specific model's details from Hugging Face.
 */
export async function getHFModel(modelId: string, token?: string): Promise<HuggingFaceModel> {
  const t = token || getHFToken();
  const resp = await fetch(`https://huggingface.co/api/models/${modelId}`, {
    headers: t ? { Authorization: `Bearer ${t}` } : {},
  });

  if (!resp.ok) throw new Error(`Model not found: ${modelId} (HTTP ${resp.status})`);
  return await resp.json() as HuggingFaceModel;
}

/**
 * Look up which inference provider(s) are available for a model on the HF Hub.
 * Returns the first live provider and its providerId, or null.
 */
async function getInferenceProvider(
  modelId: string,
  token: string
): Promise<{ provider: string; providerId: string; task: string } | null> {
  try {
    const resp = await fetch(
      `https://huggingface.co/api/models/${modelId}?expand[]=inferenceProviderMapping`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} }
    );
    if (!resp.ok) return null;
    const data = await resp.json() as Record<string, unknown>;
    const mapping = data.inferenceProviderMapping as Record<string, { status: string; providerId: string; task: string }> | undefined;
    if (!mapping) return null;

    // Prefer free/serverless providers first
    const preferred = ["hf-inference", "featherless-ai", "novita", "together", "fireworks-ai"];
    for (const p of preferred) {
      if (mapping[p] && mapping[p].status === "live") {
        return { provider: p, providerId: mapping[p].providerId, task: mapping[p].task };
      }
    }
    // Try any live provider
    for (const [p, info] of Object.entries(mapping)) {
      if (info.status === "live") {
        return { provider: p, providerId: info.providerId, task: info.task };
      }
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * Run inference on a Hugging Face model via the Inference API.
 * For text-generation / conversational models, uses the provider-based
 * chat completions endpoint (the old direct endpoint was retired for LLMs).
 * For other models (image, audio, etc.) uses the hf-inference endpoint.
 */
export async function runHFInference(options: {
  modelId: string;
  inputs: string | Record<string, unknown>;
  parameters?: Record<string, unknown>;
  token?: string;
  waitForModel?: boolean;
  pipelineTag?: string; // hint: "text-generation", "conversational", etc.
}): Promise<{ data: Buffer | Record<string, unknown> | unknown[]; contentType: string }> {
  const t = options.token || getHFToken();
  if (!t) throw new Error("Hugging Face API token not configured. Set HUGGINGFACE_API_TOKEN or HF_TOKEN env var, or connect Hugging Face in Connectors.");

  // ── Text-generation / conversational → use provider chat completions ──
  const isTextGen = options.pipelineTag === "text-generation"
    || options.pipelineTag === "conversational"
    || /^(text-generation|conversational)$/i.test(options.pipelineTag || "");

  if (isTextGen) {
    // Find a live inference provider for this model
    const providerInfo = await getInferenceProvider(options.modelId, t);
    if (!providerInfo) {
      throw new Error(`Model "${options.modelId}" not found or does not have an inference endpoint.`);
    }

    const chatUrl = `https://router.huggingface.co/${providerInfo.provider}/v1/chat/completions`;
    const userText = typeof options.inputs === "string" ? options.inputs : JSON.stringify(options.inputs);
    const chatBody: Record<string, unknown> = {
      model: options.modelId,
      messages: [{ role: "user", content: userText }],
      max_tokens: (options.parameters?.max_new_tokens as number) || 512,
    };
    if (options.parameters?.temperature !== undefined) chatBody.temperature = options.parameters.temperature;

    const chatResp = await fetch(chatUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify(chatBody),
    });

    if (!chatResp.ok) {
      const errText = await chatResp.text();
      if (chatResp.status === 404) throw new Error(`Model "${options.modelId}" not found or does not have an inference endpoint.`);
      if (chatResp.status === 429) throw new Error(`Rate limited by Hugging Face. Please wait a moment and try again.`);
      throw new Error(`HF Inference failed (HTTP ${chatResp.status}): ${errText.slice(0, 300)}`);
    }

    const chatJson = await chatResp.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = chatJson.choices?.[0]?.message?.content || "";
    return { data: [{ generated_text: text }] as unknown as unknown[], contentType: "application/json" };
  }

  // ── Non-text models → try hf-inference first, then alternative providers ──
  const body: Record<string, unknown> = {};

  if (typeof options.inputs === "string") {
    body.inputs = options.inputs;
  } else {
    Object.assign(body, options.inputs);
  }

  if (options.parameters) {
    body.parameters = options.parameters;
  }

  if (options.waitForModel !== false) {
    body.options = { wait_for_model: true, use_cache: true };
  }

  // Try hf-inference first
  let apiUrl = `https://router.huggingface.co/hf-inference/models/${options.modelId}`;

  let resp = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${t}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  // If hf-inference returns 404, try to find an alternative provider
  if (resp.status === 404) {
    const providerInfo = await getInferenceProvider(options.modelId, t);
    if (providerInfo) {
      const altUrl = `https://router.huggingface.co/${providerInfo.provider}/models/${options.modelId}`;
      resp = await fetch(altUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${t}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    }
  }

  if (!resp.ok) {
    const errText = await resp.text();
    // Check if model is loading (503)
    if (resp.status === 503) {
      let errData = errText;
      try { errData = JSON.parse(errText).error || errText; } catch { /* use raw text */ }
      throw new Error(`Model is loading: ${errData}. Try again in a moment.`);
    }
    // Rate limit (429)
    if (resp.status === 429) {
      throw new Error(`Rate limited by Hugging Face. Please wait a moment and try again.`);
    }
    // Model not found or endpoint issues (404)
    if (resp.status === 404) {
      throw new Error(`Model "${options.modelId}" not found or does not have an inference endpoint.`);
    }
    // Bad gateway / gateway timeout (502, 504) — common with Spaces
    if (resp.status === 502 || resp.status === 504) {
      throw new Error(`Hugging Face endpoint unavailable (HTTP ${resp.status}). The model may be overloaded or the Space may be down.`);
    }
    // Validation errors (422) — bad input format
    if (resp.status === 422) {
      let errData = errText;
      try { errData = JSON.parse(errText).error || errText; } catch { /* use raw text */ }
      throw new Error(`Invalid input for model "${options.modelId}": ${errData}`);
    }
    throw new Error(`HF Inference failed (HTTP ${resp.status}): ${errText.slice(0, 300)}`);
  }

  const contentType = resp.headers.get("content-type") || "application/json";

  // Binary responses (images, audio, etc.)
  if (contentType.startsWith("image/") || contentType.startsWith("audio/") || contentType.startsWith("video/") || contentType === "application/octet-stream") {
    const buffer = Buffer.from(await resp.arrayBuffer());
    return { data: buffer, contentType };
  }

  // JSON responses (text, classification, etc.)
  const json = await resp.json();
  return { data: json as Record<string, unknown> | unknown[], contentType: "application/json" };
}

/**
 * Select the best HF model for a task by searching the Hub.
 */
export async function selectBestHFModel(
  userPrompt: string,
  taskType: HFTaskType,
  searchFilter: string,
  preferredModel?: string,
  token?: string
): Promise<{ modelId: string; reason: string }> {
  if (preferredModel) {
    return { modelId: preferredModel, reason: `User-specified model: ${preferredModel}` };
  }

  const t = token || getHFToken();

  // Search with the pipeline_tag filter
  const models = await searchHFModels(userPrompt, {
    pipelineTag: searchFilter,
    limit: 20,
    token: t,
  });

  // Also search without filter if no results
  let allModels = models;
  if (models.length < 3) {
    const fallback = await searchHFModels(userPrompt, { limit: 20, token: t });
    for (const m of fallback) {
      if (!allModels.find(e => e.id === m.id)) {
        allModels.push(m);
      }
    }
  }

  if (allModels.length === 0) {
    throw new Error(`No Hugging Face models found for task: ${taskType}`);
  }

  // Score each model
  const scored = allModels.map(m => {
    let score = 0;
    const modelId = m.id.toLowerCase();
    const prompt = userPrompt.toLowerCase();

    // Downloads are a strong quality signal
    score += Math.log10(Math.max(m.downloads || 1, 1)) * 5;

    // Likes bonus
    score += Math.log10(Math.max(m.likes || 1, 1)) * 3;

    // Pipeline tag match — this is the strongest signal for inference API availability
    if (m.pipeline_tag === searchFilter) score += 20;
    // Penalize models without a pipeline_tag — they likely don't have inference endpoints
    if (!m.pipeline_tag) score -= 10;

    // Keyword overlap
    const promptWords = new Set(prompt.split(/\s+/).filter(w => w.length > 3));
    for (const word of promptWords) {
      if (modelId.includes(word)) score += 3;
    }

    // Known models that work well with HF Inference API (moderate boosts)
    const inferenceAuthors: Record<string, number> = {
      "stabilityai": 10,
      "openai": 10,
      "meta-llama": 8,
      "mistralai": 8,
      "google": 8,
      "facebook": 8,
      "microsoft": 8,
      "deepseek-ai": 6,
      "bytedance": 6,
      "salesforce": 6,
    };
    for (const [author, bonus] of Object.entries(inferenceAuthors)) {
      if (modelId.startsWith(author + "/")) score += bonus;
    }

    // Penalize models known to NOT have HF Inference endpoints (primarily Replicate-only)
    if (modelId.startsWith("black-forest-labs/")) score -= 5;

    return { model: m, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];

  return {
    modelId: best.model.id,
    reason: `Selected "${best.model.id}" (${(best.model.downloads || 0).toLocaleString()} downloads, ${best.model.likes || 0} likes, score: ${best.score.toFixed(1)}) from ${scored.length} candidates. Pipeline: ${best.model.pipeline_tag || "unknown"}`,
  };
}

/**
 * Full pipeline: detect task → search models → select best → run inference → save outputs.
 */
export async function runHFTask(options: {
  prompt: string;
  model?: string;
  params?: Record<string, unknown>;
  filesDir: string;
  onProgress?: (status: string) => void;
  token?: string;
}): Promise<{
  model: string;
  modelReason: string;
  taskType: HFTaskType;
  status: string;
  computeTime?: number;
  files: Array<{ filename: string; filePath: string; size: number; mimeType: string }>;
  textOutput?: string;
}> {
  const { prompt, model, params, filesDir, onProgress, token } = options;
  const t = token || getHFToken();
  if (!t) throw new Error("Hugging Face API token not configured. Set HUGGINGFACE_API_TOKEN or HF_TOKEN env var, or connect Hugging Face in the Connectors page.");

  // 1. Detect task type
  const { type: taskType, searchFilter, defaultModel } = detectHFTaskType(prompt);
  onProgress?.(`Detected HF task type: ${taskType}`);

  // 2. Select the best model
  let modelId: string;
  let reason: string;

  if (model) {
    modelId = model;
    reason = `User-specified model: ${model}`;
    onProgress?.(`Using specified model: ${model}`);
  } else if (defaultModel) {
    modelId = defaultModel;
    reason = `Default model for ${taskType}: ${defaultModel}`;
    onProgress?.(`Using default model: ${defaultModel}`);

    // Try to find something better
    try {
      const selected = await selectBestHFModel(prompt, taskType, searchFilter, undefined, t);
      if (selected.modelId !== defaultModel) {
        const selectedInfo = await getHFModel(selected.modelId, t).catch(() => null);
        const defaultInfo = await getHFModel(defaultModel, t).catch(() => null);
        if (selectedInfo && defaultInfo && (selectedInfo.downloads || 0) > (defaultInfo.downloads || 0) * 2) {
          modelId = selected.modelId;
          reason = selected.reason;
          onProgress?.(`Found better model: ${modelId}`);
        }
      }
    } catch {
      // Stick with default
    }
  } else {
    onProgress?.(`Searching Hugging Face for best ${taskType} model...`);
    const selected = await selectBestHFModel(prompt, taskType, searchFilter, undefined, t);
    modelId = selected.modelId;
    reason = selected.reason;
    onProgress?.(`Selected: ${modelId}`);
  }

  // 3. Run inference with robust retry logic
  onProgress?.(`Running ${modelId}...`);
  const startTime = Date.now();

  let retries = 0;
  const maxRetries = 5;
  let result: { data: Buffer | Record<string, unknown> | unknown[]; contentType: string } | null = null;
  let lastError: Error | null = null;

  // Retryable error patterns (loading, overloaded, gateway issues)
  const isRetryable = (msg: string) =>
    /loading|unavailable|overloaded|502|504|timeout|CUDA|out of memory|endpoint|capacity/i.test(msg);

  // "Not found" errors mean the model doesn't have an inference endpoint — try alternatives
  const isNotFound = (msg: string) =>
    /not found|does not have.*inference|endpoint.*not/i.test(msg);

  // Keep track of models we've already tried
  const triedModels = new Set<string>();

  while (retries < maxRetries) {
    triedModels.add(modelId);
    try {
      result = await runHFInference({
        modelId,
        inputs: prompt,
        parameters: params,
        token: t,
        waitForModel: true,
        pipelineTag: taskType,
      });
      break;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const msg = lastError.message;

      if (isRetryable(msg) && !isNotFound(msg) && retries < maxRetries - 1) {
        const waitSec = (retries + 1) * 8;
        onProgress?.(`${msg.includes("loading") ? "Model loading" : "Endpoint issue"}, retrying in ${waitSec}s (attempt ${retries + 2}/${maxRetries})...`);
        await new Promise(r => setTimeout(r, waitSec * 1000));
        retries++;
      } else if (!model && isNotFound(msg)) {
        // Model doesn't have an inference endpoint — try alternatives
        retries++;

        // First try: fall back to defaultModel
        if (defaultModel && !triedModels.has(defaultModel)) {
          onProgress?.(`Model "${modelId}" unavailable. Trying default: ${defaultModel}...`);
          modelId = defaultModel;
          reason = `Fallback to default model after "${modelId}" had no inference endpoint`;
        } else {
          // Second try: use a known-good model for this task type
          const knownGoodModels: Record<string, string[]> = {
            "text-to-image": ["stabilityai/stable-diffusion-xl-base-1.0", "runwayml/stable-diffusion-v1-5", "CompVis/stable-diffusion-v1-4"],
            "text-generation": ["Qwen/Qwen2.5-7B-Instruct", "Qwen/Qwen2.5-1.5B-Instruct", "meta-llama/Llama-3.1-8B-Instruct"],
            "text-to-speech": ["facebook/mms-tts-eng", "espnet/kan-bayashi_ljspeech_vits"],
            "text-to-audio": ["facebook/musicgen-small"],
            "summarization": ["facebook/bart-large-cnn"],
            "translation": ["facebook/nllb-200-distilled-600M", "Helsinki-NLP/opus-mt-en-de"],
          };
          const alternatives = (knownGoodModels[taskType] || []).filter(m => !triedModels.has(m));
          if (alternatives.length > 0) {
            const alt = alternatives[0];
            onProgress?.(`Model "${modelId}" unavailable. Trying known-good: ${alt}...`);
            modelId = alt;
            reason = `Fallback to known-good model after others had no inference endpoint`;
          } else {
            throw lastError;
          }
        }
      } else {
        throw lastError;
      }
    }
  }

  if (!result) throw lastError || new Error("Failed to get inference result");

  const computeTime = (Date.now() - startTime) / 1000;
  onProgress?.(`Completed in ${computeTime.toFixed(1)}s`);

  // 4. Process outputs
  const files: Array<{ filename: string; filePath: string; size: number; mimeType: string }> = [];
  let textOutput: string | undefined;

  if (Buffer.isBuffer(result.data)) {
    // Binary output (image, audio, video)
    const ext = mimeToExtension(result.contentType);
    const prefix = result.contentType.startsWith("image/") ? "generated_image"
      : result.contentType.startsWith("audio/") ? "generated_audio"
      : result.contentType.startsWith("video/") ? "generated_video"
      : "generated_output";
    const filename = `${prefix}${ext}`;
    const filePath = path.join(filesDir, filename);

    if (!fs.existsSync(filesDir)) fs.mkdirSync(filesDir, { recursive: true });
    fs.writeFileSync(filePath, result.data);

    files.push({
      filename,
      filePath,
      size: result.data.length,
      mimeType: result.contentType,
    });
  } else {
    // JSON output (text, classification, etc.)
    const data = result.data;
    if (Array.isArray(data)) {
      // Text generation returns [{ generated_text: "..." }]
      const texts = data
        .map((item: unknown) => {
          if (typeof item === "object" && item !== null) {
            const obj = item as Record<string, unknown>;
            return obj.generated_text || obj.translation_text || obj.summary_text || obj.label || JSON.stringify(obj);
          }
          return String(item);
        })
        .join("\n");
      textOutput = texts;
    } else if (typeof data === "object" && data !== null) {
      textOutput = JSON.stringify(data, null, 2);
    } else {
      textOutput = String(data);
    }
  }

  return {
    model: modelId,
    modelReason: reason,
    taskType,
    status: "succeeded",
    computeTime,
    files,
    textOutput,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mimeToExtension(mimeType: string): string {
  const map: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "video/mp4": ".mp4",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/ogg": ".ogg",
    "audio/flac": ".flac",
    "application/octet-stream": ".bin",
  };
  const base = mimeType.split(";")[0].trim().toLowerCase();
  return map[base] || ".bin";
}

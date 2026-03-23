/**
 * Firefly — Generate Soundtrack API
 * POST /api/firefly/generate-soundtrack
 *
 * AI music generation using Replicate's MusicGen or similar.
 * Supports text prompt and video-aware composition.
 */

import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface GenerateSoundtrackRequest {
  prompt?: string;
  duration?: number;      // seconds (5-60)
  videoUrl?: string;      // Optional video to score
  genre?: string;
  mood?: string;
  tempo?: string;         // "slow" | "moderate" | "fast"
  energy?: string;        // "low" | "medium" | "high"
  instruments?: string[];
  model?: string;         // Dynamic model ID from search
  model_version?: string; // MusicGen version: stereo-melody-large | stereo-large | melody-large | large
  bpm?: number;
  key?: string;
  temperature?: number;
  top_k?: number;
  top_p?: number;
  classifier_free_guidance?: number;
  continuation?: boolean;
}

function buildMusicPrompt(body: GenerateSoundtrackRequest): string {
  const parts: string[] = [];

  if (body.prompt) parts.push(body.prompt);
  if (body.genre) parts.push(`${body.genre} genre`);
  if (body.mood) parts.push(`${body.mood} mood`);
  if (body.tempo) parts.push(`${body.tempo} tempo`);
  if (body.energy) parts.push(`${body.energy} energy`);
  if (body.bpm) parts.push(`${body.bpm} BPM`);
  if (body.key) parts.push(`key of ${body.key}`);
  if (body.instruments?.length) parts.push(`featuring ${body.instruments.join(", ")}`);
  
  if (parts.length === 0) parts.push("ambient background music");
  
  return parts.join(", ");
}

async function generateSoundtrackDynamic(
  modelId: string,
  prompt: string,
  duration: number,
): Promise<string> {
  const { runReplicateTask } = await import("@/lib/replicate");
  const fs = await import("fs");
  const path = await import("path");
  const { ensureFilesDir } = await import("@/lib/db");

  const taskId = `ff-mus-dyn-${Date.now()}-${uuidv4().slice(0, 8)}`;
  const filesDir = path.join(ensureFilesDir(), taskId);
  if (!fs.existsSync(filesDir)) fs.mkdirSync(filesDir, { recursive: true });

  const result = await runReplicateTask({
    prompt,
    model: modelId,
    params: { duration },
    filesDir,
  });

  if (result.files?.length) {
    for (const f of result.files) {
      if (f.mimeType?.startsWith("audio/")) {
        return `/api/files/${taskId}/${f.filename}`;
      }
    }
    return `/api/files/${taskId}/${result.files[0].filename}`;
  }
  throw new Error(`Dynamic music model "${modelId}" produced no audio output`);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as GenerateSoundtrackRequest;
    const genId = `ff-mus-${Date.now()}-${uuidv4().slice(0, 8)}`;
    const musicPrompt = buildMusicPrompt(body);
    const duration = Math.min(Math.max(body.duration || 10, 5), 60);

    const apiKey = process.env.REPLICATE_API_TOKEN;
    if (!apiKey) {
      return NextResponse.json({ error: "REPLICATE_API_TOKEN not configured" }, { status: 503 });
    }

    // If user selected a dynamic model from search, use runReplicateTask
    const dynamicModel = body.model;
    if (dynamicModel && dynamicModel.includes("/")) {
      const audioUrl = await generateSoundtrackDynamic(dynamicModel, musicPrompt, duration);
      return NextResponse.json({
        id: genId,
        status: "completed",
        prompt: musicPrompt,
        audio: { url: audioUrl, duration, format: "wav" },
        settings: { genre: body.genre, mood: body.mood, tempo: body.tempo, energy: body.energy },
        createdAt: new Date().toISOString(),
      });
    }

    // Use MusicGen for soundtrack generation.
    // Replicate's Prefer: wait header must be 1–60. We submit with wait=60
    // then poll for up to 4 minutes for longer generations.
    const { createPrediction, waitForPrediction } = await import("@/lib/replicate");

    const modelVersion = body.model_version || "stereo-melody-large";
    const prediction = await createPrediction("meta", "musicgen", {
      prompt: musicPrompt,
      duration,
      model_version: modelVersion,
      output_format: "wav",
      normalization_strategy: "peak",
      ...(body.temperature !== undefined && { temperature: body.temperature }),
      ...(body.top_k !== undefined && { top_k: body.top_k }),
      ...(body.top_p !== undefined && { top_p: body.top_p }),
      ...(body.classifier_free_guidance !== undefined && { classifier_free_guidance: body.classifier_free_guidance }),
      ...(body.continuation !== undefined && { continuation: body.continuation }),
    }, apiKey);

    const completed = await waitForPrediction(prediction.id, apiKey, 300_000);

    let audioUrl = "";
    if (typeof completed.output === "string") {
      audioUrl = completed.output;
    } else if (Array.isArray(completed.output)) {
      audioUrl = completed.output[0] as string;
    }

    return NextResponse.json({
      id: genId,
      status: "completed",
      prompt: musicPrompt,
      audio: {
        url: audioUrl,
        duration,
        format: "wav",
      },
      settings: {
        genre: body.genre,
        mood: body.mood,
        tempo: body.tempo,
        energy: body.energy,
      },
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Firefly generate-soundtrack error:", err);
    return NextResponse.json(
      { error: (err as Error).message || "Soundtrack generation failed" },
      { status: 500 }
    );
  }
}

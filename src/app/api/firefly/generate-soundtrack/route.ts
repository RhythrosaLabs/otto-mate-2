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
  duration?: number;      // seconds (5-30)
  videoUrl?: string;      // Optional video to score
  genre?: string;
  mood?: string;
  tempo?: string;         // "slow" | "moderate" | "fast"  
  energy?: string;        // "low" | "medium" | "high"
  instruments?: string[];
  model?: string;         // Dynamic model ID from search
}

function buildMusicPrompt(body: GenerateSoundtrackRequest): string {
  const parts: string[] = [];

  if (body.prompt) parts.push(body.prompt);
  if (body.genre) parts.push(`${body.genre} genre`);
  if (body.mood) parts.push(`${body.mood} mood`);
  if (body.tempo) parts.push(`${body.tempo} tempo`);
  if (body.energy) parts.push(`${body.energy} energy`);
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
    const duration = Math.min(Math.max(body.duration || 10, 5), 30);

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

    // Use MusicGen for soundtrack generation
    const res = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Prefer: "wait=120",
      },
      body: JSON.stringify({
        model: "meta/musicgen",
        input: {
          prompt: musicPrompt,
          duration,
          model_version: "stereo-melody-large",
          output_format: "wav",
          normalization_strategy: "peak",
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`MusicGen error: ${err}`);
    }

    const data = await res.json();
    let audioUrl = "";

    if (typeof data.output === "string") {
      audioUrl = data.output;
    } else if (Array.isArray(data.output)) {
      audioUrl = data.output[0];
    }

    // Poll if needed
    if (!audioUrl && data.urls?.get) {
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const pollRes = await fetch(data.urls.get, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        const pollData = await pollRes.json();
        if (pollData.status === "succeeded") {
          audioUrl = typeof pollData.output === "string" ? pollData.output : pollData.output?.[0];
          break;
        }
        if (pollData.status === "failed" || pollData.status === "canceled") {
          throw new Error(`Music generation ${pollData.status}: ${pollData.error || "unknown"}`);
        }
      }
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

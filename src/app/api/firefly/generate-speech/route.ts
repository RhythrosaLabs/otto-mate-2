/**
 * Firefly — Generate Speech (TTS) API
 * POST /api/firefly/generate-speech
 *
 * Text to Speech using ElevenLabs or OpenAI TTS.
 * Returns audio as a downloadable stream.
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface GenerateSpeechRequest {
  text: string;
  voice?: string;      // Voice preset
  speed?: number;      // 0.5-2.0
  language?: string;   // For multilingual
  format?: string;     // "mp3" | "wav" | "ogg"
  model?: string;      // Dynamic model ID from search
}

const ELEVENLABS_VOICES: Record<string, string> = {
  alloy: "21m00Tcm4TlvDq8ikWAM",
  echo: "AZnzlk1XvdvUeBnXmlld",
  fable: "EXAVITQu4vr4xnSDxMaL",
  onyx: "ErXwobaYiN019PkySvjV",
  nova: "MF3mGyEYCl7XYWbV9V6O",
  shimmer: "ThT5KcBeYPX3keUQqHPh",
  aria: "9BWtsMINqrJLrRacOk9x",
  roger: "CwhRBWXzGAHq8TQ4Fs17",
  sarah: "EXAVITQu4vr4xnSDxMaL",
  charlie: "IKne3meq5aSn9XLyUdCD",
  // Client sends these IDs for ElevenLabs voices
  "eleven-rachel": "21m00Tcm4TlvDq8ikWAM",
  "eleven-drew": "29vD33N1CtxCmqQRPOHJ",
  "eleven-clyde": "2EiwWnXFnvU5JabPnv8n",
  "eleven-paul": "5Q0t7uMcjvnagumLfvZi",
  "eleven-domi": "AZnzlk1XvdvUeBnXmlld",
  "eleven-bella": "EXAVITQu4vr4xnSDxMaL",
};

const OPENAI_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];

async function generateSpeechDynamic(
  modelId: string,
  text: string,
  speed: number,
): Promise<string> {
  const { runReplicateTask } = await import("@/lib/replicate");
  const fs = await import("fs");
  const path = await import("path");
  const { ensureFilesDir } = await import("@/lib/db");
  const { v4: uuidv4 } = await import("uuid");

  const taskId = `ff-tts-dyn-${Date.now()}-${uuidv4().slice(0, 8)}`;
  const filesDir = path.join(ensureFilesDir(), taskId);
  if (!fs.existsSync(filesDir)) fs.mkdirSync(filesDir, { recursive: true });

  const result = await runReplicateTask({
    prompt: text,
    model: modelId,
    params: { speed },
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
  throw new Error(`Dynamic TTS model "${modelId}" produced no audio output`);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as GenerateSpeechRequest;
    const { text, voice = "nova", speed = 1.0, language, format = "mp3" } = body;

    if (!text?.trim()) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    const cleanText = text
      .replace(/```[\s\S]*?```/g, " code block ")
      .replace(/`[^`]+`/g, (m) => m.slice(1, -1))
      .replace(/[#*_~>\[\]]/g, "")
      .replace(/\n{2,}/g, ". ")
      .replace(/\n/g, " ")
      .slice(0, 4096);

    // If user selected a dynamic model from search, use runReplicateTask
    if (body.model && body.model.includes("/")) {
      const audioUrl = await generateSpeechDynamic(body.model, cleanText, speed);
      const audioRes = await fetch(audioUrl.startsWith("http") ? audioUrl : `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}${audioUrl}`);
      if (audioRes.ok && audioRes.body) {
        return new NextResponse(audioRes.body as ReadableStream, {
          headers: {
            "Content-Type": "audio/mpeg",
            "Content-Disposition": `attachment; filename="firefly-speech-${Date.now()}.mp3"`,
          },
        });
      }
    }

    // Try ElevenLabs first
    const elevenKey = process.env["ELEVEN-LABS_API_KEY"] || process.env.ELEVENLABS_API_KEY;
    if (elevenKey) {
      const voiceId = ELEVENLABS_VOICES[voice] || ELEVENLABS_VOICES.nova;
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
        {
          method: "POST",
          headers: {
            "xi-api-key": elevenKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: cleanText,
            model_id: "eleven_multilingual_v2",
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
              style: 0.3,
              use_speaker_boost: true,
              ...(speed !== 1.0 ? { speed } : {}),
            },
            ...(language && language !== "en" ? { language } : {}),
          }),
        }
      );

      if (res.ok && res.body) {
        return new NextResponse(res.body as ReadableStream, {
          headers: {
            "Content-Type": "audio/mpeg",
            "Content-Disposition": `attachment; filename="firefly-speech-${Date.now()}.mp3"`,
          },
        });
      }
    }

    // Fallback to OpenAI TTS
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      const openaiVoice = OPENAI_VOICES.includes(voice) ? voice : "nova";
      const res = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "tts-1-hd",
          input: cleanText,
          voice: openaiVoice,
          speed,
          response_format: format === "wav" ? "wav" : "mp3",
        }),
      });

      if (res.ok && res.body) {
        return new NextResponse(res.body as ReadableStream, {
          headers: {
            "Content-Type": format === "wav" ? "audio/wav" : "audio/mpeg",
            "Content-Disposition": `attachment; filename="firefly-speech-${Date.now()}.${format}"`,
          },
        });
      }
    }

    return NextResponse.json(
      { error: "No TTS provider configured. Set ELEVENLABS_API_KEY or OPENAI_API_KEY." },
      { status: 503 }
    );
  } catch (err) {
    console.error("Firefly generate-speech error:", err);
    return NextResponse.json(
      { error: (err as Error).message || "Speech generation failed" },
      { status: 500 }
    );
  }
}

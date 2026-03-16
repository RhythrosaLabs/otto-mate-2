/**
 * Voice Pipeline — Text-to-Speech (TTS) API
 * 
 * POST /api/voice/tts — Send text, receive audio stream
 * Body: { text: string, voice?: string, speed?: number }
 *
 * Provider priority:
 *   1. ElevenLabs (highest quality, ELEVENLABS_API_KEY)
 *   2. OpenAI TTS (good quality, OPENAI_API_KEY)
 *   3. 503 → client falls back to browser speechSynthesis
 *
 * Inspired by Otto's voice pipeline.
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Default voices per provider
const ELEVENLABS_VOICES: Record<string, string> = {
  alloy: "21m00Tcm4TlvDq8ikWAM",      // Rachel
  echo: "AZnzlk1XvdvUeBnXmlld",        // Domi
  fable: "EXAVITQu4vr4xnSDxMaL",       // Bella
  onyx: "ErXwobaYiN019PkySvjV",         // Antoni
  nova: "MF3mGyEYCl7XYWbV9V6O",        // Elli
  shimmer: "ThT5KcBeYPX3keUQqHPh",      // Dorothy
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { text?: string; voice?: string; speed?: number };
    const { text, voice = "alloy", speed = 1.0 } = body;

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    // Clean text for speech (strip markdown)
    const cleanText = text
      .replace(/```[\s\S]*?```/g, " code block ")
      .replace(/`[^`]+`/g, (m) => m.slice(1, -1))
      .replace(/[#*_~>\[\]]/g, "")
      .replace(/\n{2,}/g, ". ")
      .replace(/\n/g, " ")
      .slice(0, 4000); // TTS limit

    // 1. Try ElevenLabs (highest quality)
    const elevenKey = process.env.ELEVENLABS_API_KEY;
    if (elevenKey) {
      const voiceId = ELEVENLABS_VOICES[voice] || ELEVENLABS_VOICES.alloy;
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
            model_id: "eleven_turbo_v2_5",
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
              speed: speed,
            },
          }),
        }
      );

      if (res.ok && res.body) {
        return new NextResponse(res.body, {
          headers: {
            "Content-Type": "audio/mpeg",
            "Transfer-Encoding": "chunked",
            "X-TTS-Provider": "elevenlabs",
          },
        });
      }
    }

    // 2. Try OpenAI TTS
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      const res = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "tts-1",
          input: cleanText,
          voice: voice,
          speed: speed,
          response_format: "mp3",
        }),
      });

      if (res.ok && res.body) {
        return new NextResponse(res.body, {
          headers: {
            "Content-Type": "audio/mpeg",
            "Transfer-Encoding": "chunked",
            "X-TTS-Provider": "openai",
          },
        });
      }
    }

    return NextResponse.json(
      { error: "No TTS provider configured. Set OPENAI_API_KEY or ELEVENLABS_API_KEY.", fallback: "browser" },
      { status: 503 }
    );
  } catch (err) {
    console.error("[voice/tts] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "TTS failed" },
      { status: 500 }
    );
  }
}

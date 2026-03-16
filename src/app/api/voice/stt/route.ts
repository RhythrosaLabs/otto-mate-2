/**
 * Voice Pipeline — Speech-to-Text (STT) API
 * 
 * POST /api/voice/stt — Upload audio, get transcription
 * 
 * Uses OpenAI Whisper API (primary) with browser Web Speech API as client-side fallback.
 * Inspired by Otto's voice pipeline (Whisper STT + ElevenLabs TTS).
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;
    const language = (formData.get("language") as string) || "en";

    if (!audioFile) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }

    // Try OpenAI Whisper first
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      const whisperForm = new FormData();
      whisperForm.append("file", audioFile);
      whisperForm.append("model", "whisper-1");
      whisperForm.append("language", language);
      whisperForm.append("response_format", "json");

      const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}` },
        body: whisperForm,
      });

      if (res.ok) {
        const data = (await res.json()) as { text: string };
        return NextResponse.json({
          text: data.text,
          provider: "whisper",
          language,
        });
      }
    }

    // Try Google (if configured)
    const googleKey = process.env.GOOGLE_AI_API_KEY;
    if (googleKey) {
      // For Google, we'd use their Speech-to-Text API
      // Simplified fallback: return error to use client-side
    }

    return NextResponse.json(
      { error: "No STT provider configured. Set OPENAI_API_KEY for Whisper.", fallback: "browser" },
      { status: 503 }
    );
  } catch (err) {
    console.error("[voice/stt] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "STT failed" },
      { status: 500 }
    );
  }
}

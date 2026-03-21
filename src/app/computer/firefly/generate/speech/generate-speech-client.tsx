"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft, Mic2, Loader2, Download, Play, Pause, RefreshCw,
  ChevronDown, Sparkles, Settings2, Type,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ModelSearchSelector } from "../../components/model-search-selector";
import {
  saveToGallery,
  loadHistory,
  saveHistory,
  downloadFile,
} from "../../lib/gallery-store";

/* ─── Constants ────────────────────────────────────────────────── */

const VOICES = [
  { id: "alloy", label: "Alloy", desc: "Neutral, balanced", provider: "openai" },
  { id: "echo", label: "Echo", desc: "Warm, conversational", provider: "openai" },
  { id: "fable", label: "Fable", desc: "Expressive, animated", provider: "openai" },
  { id: "onyx", label: "Onyx", desc: "Deep, authoritative", provider: "openai" },
  { id: "nova", label: "Nova", desc: "Friendly, upbeat", provider: "openai" },
  { id: "shimmer", label: "Shimmer", desc: "Clear, bright", provider: "openai" },
  { id: "eleven-rachel", label: "Rachel", desc: "American female, calm", provider: "elevenlabs" },
  { id: "eleven-drew", label: "Drew", desc: "American male, well-rounded", provider: "elevenlabs" },
  { id: "eleven-clyde", label: "Clyde", desc: "American male, war veteran", provider: "elevenlabs" },
  { id: "eleven-paul", label: "Paul", desc: "American male, deep", provider: "elevenlabs" },
  { id: "eleven-domi", label: "Domi", desc: "American female, strong", provider: "elevenlabs" },
  { id: "eleven-bella", label: "Bella", desc: "American female, soft", provider: "elevenlabs" },
];

const LANGUAGES = [
  { id: "en", label: "English" },
  { id: "es", label: "Spanish" },
  { id: "fr", label: "French" },
  { id: "de", label: "German" },
  { id: "it", label: "Italian" },
  { id: "pt", label: "Portuguese" },
  { id: "ja", label: "Japanese" },
  { id: "ko", label: "Korean" },
  { id: "zh", label: "Chinese" },
];

interface SpeechResult {
  id: string;
  text: string;
  voice: string;
  audioUrl: string;
  provider: string;
  createdAt: string;
}

/* ─── Component ──────────────────────────────────────────────── */

export function GenerateSpeechClient() {
  const [text, setText] = useState("");
  const [voice, setVoice] = useState("nova");
  const [speed, setSpeed] = useState(1.0);
  const [language, setLanguage] = useState("en");
  const [showVoiceDropdown, setShowVoiceDropdown] = useState(false);
  const [model, setModel] = useState("");

  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<SpeechResult | null>(null);
  const [error, setError] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [history, setHistory] = useState<SpeechResult[]>(() => loadHistory<SpeechResult>("speech-gen"));

  const audioRef = useRef<HTMLAudioElement>(null);
  const currentVoice = VOICES.find(v => v.id === voice) || VOICES[4];

  async function handleGenerate() {
    if (!text.trim() || generating) return;
    setGenerating(true);
    setError("");

    try {
      const res = await fetch("/api/firefly/generate-speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.trim(),
          voice,
          speed,
          language,
          model: model || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json() as Record<string, any>;
        setError(data.error || "Speech generation failed");
        return;
      }

      // Response is audio/mpeg stream
      const blob = await res.blob();
      const audioUrl = URL.createObjectURL(blob);

      const newResult: SpeechResult = {
        id: Date.now().toString(),
        text: text.trim(),
        voice,
        audioUrl,
        provider: currentVoice.provider,
        createdAt: new Date().toISOString(),
      };

      setResult(newResult);
      const newHist = [newResult, ...history].slice(0, 20);
      setHistory(newHist);
      saveHistory("speech-gen", newHist);

      // Save to gallery
      saveToGallery({
        type: "audio",
        url: audioUrl,
        prompt: text.trim().slice(0, 100),
        model: model || `${currentVoice.provider}/${currentVoice.id}`,
        metadata: { voice, speed, language, provider: currentVoice.provider },
      });
    } catch (err) {
      setError((err as Error).message || "Network error");
    } finally {
      setGenerating(false);
    }
  }

  function togglePlay() {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }

  function downloadAudio() {
    if (!result?.audioUrl) return;
    downloadFile(result.audioUrl, `firefly-speech-${result.id}.mp3`);
  }

  return (
    <div className="h-full flex bg-[#0a0a0a] text-white">
      {/* Settings Sidebar */}
      <div className={cn(
        "h-full border-r border-zinc-800 flex flex-col transition-all duration-300 shrink-0",
        sidebarOpen ? "w-80" : "w-0 overflow-hidden"
      )}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <Link href="/computer/firefly" className="text-zinc-500 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-gradient-to-br from-orange-600 to-amber-500 flex items-center justify-center">
                <Mic2 className="w-3 h-3 text-white" />
              </div>
              <span className="text-sm font-semibold">Text to Speech</span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {/* Model Selector */}
          <div className="space-y-2">
            <label className="text-xs text-zinc-400 font-medium">Model</label>
            <ModelSearchSelector
              category="text-to-speech"
              value={model}
              onChange={(id) => setModel(id)}
              accent="orange"
            />
            <p className="text-[10px] text-zinc-600">Select a model or use default OpenAI/ElevenLabs</p>
          </div>

          {/* Voice Selector */}
          <div className="space-y-2">
            <label className="text-xs text-zinc-400 font-medium">Voice</label>
            <div className="relative">
              <button
                onClick={() => setShowVoiceDropdown(!showVoiceDropdown)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-zinc-800/50 border border-zinc-700/50 text-white text-sm hover:border-zinc-600 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <User className="w-3.5 h-3.5 text-zinc-500" />
                  <span>{currentVoice.label}</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-700 text-zinc-400">{currentVoice.provider}</span>
                </div>
                <ChevronDown className="w-4 h-4 text-zinc-500" />
              </button>
              {showVoiceDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-20 max-h-64 overflow-y-auto">
                  <div className="px-3 py-2 text-[10px] text-zinc-500 uppercase tracking-wider font-semibold bg-zinc-800/80 sticky top-0">OpenAI Voices</div>
                  {VOICES.filter(v => v.provider === "openai").map(v => (
                    <button
                      key={v.id}
                      onClick={() => { setVoice(v.id); setShowVoiceDropdown(false); }}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2 text-left hover:bg-zinc-700/50 transition-colors",
                        voice === v.id ? "bg-orange-600/10 text-orange-300" : "text-zinc-300"
                      )}
                    >
                      <div>
                        <div className="text-sm">{v.label}</div>
                        <div className="text-xs text-zinc-500">{v.desc}</div>
                      </div>
                      {voice === v.id && <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />}
                    </button>
                  ))}
                  <div className="px-3 py-2 text-[10px] text-zinc-500 uppercase tracking-wider font-semibold bg-zinc-800/80 sticky top-0">ElevenLabs Voices</div>
                  {VOICES.filter(v => v.provider === "elevenlabs").map(v => (
                    <button
                      key={v.id}
                      onClick={() => { setVoice(v.id); setShowVoiceDropdown(false); }}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2 text-left hover:bg-zinc-700/50 transition-colors",
                        voice === v.id ? "bg-orange-600/10 text-orange-300" : "text-zinc-300"
                      )}
                    >
                      <div>
                        <div className="text-sm">{v.label}</div>
                        <div className="text-xs text-zinc-500">{v.desc}</div>
                      </div>
                      {voice === v.id && <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Speed */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-zinc-400 font-medium">Speed</label>
              <span className="text-xs text-zinc-500">{speed.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.1}
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-zinc-700 accent-orange-500"
            />
            <div className="flex justify-between text-[10px] text-zinc-600">
              <span>0.5x</span><span>1.0x</span><span>2.0x</span>
            </div>
          </div>

          {/* Language */}
          <div className="space-y-2">
            <label className="text-xs text-zinc-400 font-medium">Language</label>
            <div className="flex flex-wrap gap-1.5">
              {LANGUAGES.map((l) => (
                <button
                  key={l.id}
                  onClick={() => setLanguage(l.id)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs transition-all",
                    language === l.id
                      ? "bg-orange-600/20 border border-orange-500/30 text-orange-300"
                      : "bg-zinc-800/50 border border-zinc-700/30 text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* History */}
          {history.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs text-zinc-400 font-medium">Recent</label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {history.slice(0, 5).map((h) => (
                  <button
                    key={h.id}
                    onClick={() => setResult(h)}
                    className="w-full p-2 rounded-lg bg-zinc-800/30 text-left hover:bg-zinc-800/50 transition-colors"
                  >
                    <div className="text-xs text-zinc-300 truncate">{h.text.slice(0, 40)}...</div>
                    <div className="text-[10px] text-zinc-600 mt-0.5">{h.voice} • {new Date(h.createdAt).toLocaleTimeString()}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            {!sidebarOpen && (
              <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors mr-1">
                <Settings2 className="w-4 h-4" />
              </button>
            )}
            {sidebarOpen && (
              <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors">
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <span className="text-xs text-zinc-500">
              {result ? "Speech generated" : "Ready to convert"}
            </span>
          </div>
          {result && (
            <button onClick={downloadAudio} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-white">
              <Download className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Main Area */}
        <div className="flex-1 flex flex-col p-8 overflow-auto">
          {/* Text Input (main area, not bottom bar for speech) */}
          <div className="flex-1 max-w-3xl w-full mx-auto flex flex-col gap-6">
            <div className="space-y-2 flex-1">
              <label className="text-xs text-zinc-400 font-medium flex items-center gap-1.5">
                <Type className="w-3.5 h-3.5" />
                Text to convert to speech
              </label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Enter the text you want to convert to natural-sounding speech. You can use punctuation marks to control pacing and emphasis..."
                className="w-full h-full min-h-[200px] bg-zinc-900/50 border border-zinc-700/50 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 resize-none focus:outline-none focus:border-orange-500/50"
              />
              <div className="flex items-center justify-between text-[10px] text-zinc-600">
                <span>{text.length} characters</span>
                <span>~{Math.ceil(text.length / 15)}s estimated</span>
              </div>
            </div>

            {/* Result */}
            {result?.audioUrl && (
              <div className="w-full p-5 rounded-2xl bg-gradient-to-br from-orange-600/10 to-amber-600/10 border border-orange-500/20">
                <div className="flex items-center gap-4 mb-3">
                  <button
                    onClick={togglePlay}
                    className="w-11 h-11 rounded-full bg-orange-600 hover:bg-orange-500 transition-colors flex items-center justify-center shrink-0"
                  >
                    {isPlaying ? <Pause className="w-5 h-5 text-white" /> : <Play className="w-5 h-5 text-white ml-0.5" />}
                  </button>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-white">{currentVoice.label}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-700 text-zinc-400">{currentVoice.provider}</span>
                      <span className="text-xs text-zinc-500">{speed}x</span>
                    </div>
                    <p className="text-xs text-zinc-500 line-clamp-1">{result.text}</p>
                  </div>
                </div>

                <audio
                  ref={audioRef}
                  src={result.audioUrl}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => setIsPlaying(false)}
                />

                <div className="flex items-center gap-2 pt-3 border-t border-zinc-800/50">
                  <button onClick={downloadAudio} className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 bg-zinc-800/50 text-zinc-400 hover:text-white border border-zinc-700/30 transition-colors">
                    <Download className="w-3.5 h-3.5" />
                    Download MP3
                  </button>
                  <button onClick={handleGenerate} className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 bg-zinc-800/50 text-zinc-400 hover:text-white border border-zinc-700/30 transition-colors">
                    <RefreshCw className="w-3.5 h-3.5" />
                    Regenerate
                  </button>
                </div>
              </div>
            )}

            {!result && !generating && (
              <div className="text-center py-6">
                <p className="text-sm text-zinc-600">Enter text above and click Generate to synthesize speech</p>
              </div>
            )}

            {generating && (
              <div className="flex flex-col items-center py-6">
                <Loader2 className="w-8 h-8 text-orange-400 animate-spin mb-3" />
                <p className="text-sm text-zinc-400">Generating speech...</p>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Generate Bar */}
        <div className="border-t border-zinc-800 p-4 bg-[#0a0a0a] shrink-0">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            {error && (
              <div className="flex-1 mr-3 p-2 rounded-lg bg-red-600/10 border border-red-500/20 text-red-400 text-xs">
                {error}
              </div>
            )}
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-zinc-600">{currentVoice.label} • {speed}x</span>
              <button
                onClick={handleGenerate}
                disabled={!text.trim() || generating}
                className={cn(
                  "px-6 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-all",
                  text.trim() && !generating
                    ? "bg-gradient-to-r from-orange-600 to-amber-600 text-white hover:from-orange-500 hover:to-amber-500 shadow-lg shadow-orange-500/20"
                    : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                )}
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {generating ? "Generating..." : "Generate Speech"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

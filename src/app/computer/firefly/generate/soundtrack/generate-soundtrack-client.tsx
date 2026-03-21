"use client";

import { useState, useRef, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Music, Loader2, Download, Play, Pause, RefreshCw,
  Upload, Sparkles, Settings2,
  Disc3,
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

const GENRES = [
  "Ambient", "Cinematic", "Electronic", "Hip Hop", "Jazz",
  "Classical", "Pop", "Rock", "Lo-Fi", "Orchestral",
  "Synthwave", "Acoustic", "R&B",
];

const MOODS = [
  "Calm", "Energetic", "Dark", "Uplifting", "Mysterious",
  "Epic", "Romantic", "Nostalgic", "Playful", "Tense",
  "Dreamy", "Heroic",
];

const TEMPOS = [
  { id: "slow", label: "Slow", bpm: "60–80 BPM" },
  { id: "moderate", label: "Moderate", bpm: "90–120 BPM" },
  { id: "fast", label: "Fast", bpm: "130–160 BPM" },
  { id: "very-fast", label: "Very Fast", bpm: "170+ BPM" },
];

const ENERGY_LEVELS = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
];

const INSTRUMENTS = [
  "Piano", "Guitar", "Strings", "Synth", "Drums",
  "Bass", "Orchestra", "Flute", "Saxophone", "Organ",
  "Harp", "Bells",
];

interface SoundtrackResult {
  id: string;
  prompt: string;
  audio: {
    url: string;
    duration: number;
  };
  createdAt: string;
}

/* ─── Component ──────────────────────────────────────────────── */

export function GenerateSoundtrackClient() {
  const searchParams = useSearchParams();
  const initialVideoUrl = searchParams.get("videoUrl") || "";

  const [prompt, setPrompt] = useState("");
  const [genre, setGenre] = useState("Cinematic");
  const [mood, setMood] = useState("Calm");
  const [tempo, setTempo] = useState("moderate");
  const [energy, setEnergy] = useState("medium");
  const [selectedInstruments, setSelectedInstruments] = useState<string[]>(["Piano", "Strings"]);
  const [duration, setDuration] = useState(15);
  const [videoUrl, setVideoUrl] = useState(initialVideoUrl);
  const [model, setModel] = useState("");

  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<SoundtrackResult | null>(null);
  const [error, setError] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [history, setHistory] = useState<SoundtrackResult[]>(() => loadHistory<SoundtrackResult>("soundtrack-gen"));

  const audioRef = useRef<HTMLAudioElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const waveformHeights = useMemo(() => Array.from({ length: 40 }, () => Math.random() * 24 + 4), []);

  function toggleInstrument(inst: string) {
    setSelectedInstruments(prev =>
      prev.includes(inst)
        ? prev.filter(i => i !== inst)
        : [...prev, inst]
    );
  }

  async function handleGenerate() {
    if (generating) return;
    setGenerating(true);
    setError("");

    try {
      const res = await fetch("/api/firefly/generate-soundtrack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim() || undefined,
          genre,
          mood,
          tempo,
          energy,
          instruments: selectedInstruments,
          duration,
          videoUrl: videoUrl || undefined,
          model: model || undefined,
        }),
      });

      const data = await res.json() as Record<string, any>;
      if (!res.ok) {
        setError(data.error || "Soundtrack generation failed");
        return;
      }

      setResult(data as SoundtrackResult);
      const newHist = [data as SoundtrackResult, ...history].slice(0, 20);
      setHistory(newHist);
      saveHistory("soundtrack-gen", newHist);

      // Save to gallery
      const sr = data as SoundtrackResult;
      if (sr.audio?.url) {
        saveToGallery({
          type: "audio",
          url: sr.audio.url,
          prompt: prompt.trim() || `${genre} ${mood} soundtrack`,
          model: model || "meta/musicgen",
          metadata: { genre, mood, tempo, duration: sr.audio.duration },
        });
      }
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

  async function downloadAudio() {
    if (!result?.audio?.url) return;
    await downloadFile(result.audio.url, `nova-soundtrack-${result.id}.wav`);
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
              <div className="w-5 h-5 rounded bg-gradient-to-br from-purple-600 to-pink-500 flex items-center justify-center">
                <Music className="w-3 h-3 text-white" />
              </div>
              <span className="text-sm font-semibold">Generate Soundtrack</span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {/* Model Selector */}
          <div className="space-y-2">
            <label className="text-xs text-zinc-400 font-medium">Model</label>
            <ModelSearchSelector
              category="music-generation"
              value={model}
              onChange={(id) => setModel(id)}
              accent="purple"
            />
          </div>

          {/* Genre */}
          <div className="space-y-2">
            <label className="text-xs text-zinc-400 font-medium">Genre</label>
            <div className="flex flex-wrap gap-1.5">
              {GENRES.map((g) => (
                <button
                  key={g}
                  onClick={() => setGenre(g)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs transition-all",
                    genre === g
                      ? "bg-purple-600/20 border border-purple-500/30 text-purple-300"
                      : "bg-zinc-800/50 border border-zinc-700/30 text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Mood */}
          <div className="space-y-2">
            <label className="text-xs text-zinc-400 font-medium">Mood</label>
            <div className="flex flex-wrap gap-1.5">
              {MOODS.map((m) => (
                <button
                  key={m}
                  onClick={() => setMood(m)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs transition-all",
                    mood === m
                      ? "bg-purple-600/20 border border-purple-500/30 text-purple-300"
                      : "bg-zinc-800/50 border border-zinc-700/30 text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Tempo */}
          <div className="space-y-2">
            <label className="text-xs text-zinc-400 font-medium">Tempo</label>
            <div className="grid grid-cols-2 gap-1.5">
              {TEMPOS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTempo(t.id)}
                  className={cn(
                    "flex flex-col items-center gap-0.5 p-2 rounded-lg transition-all",
                    tempo === t.id
                      ? "bg-purple-600/20 border border-purple-500/30 text-purple-300"
                      : "bg-zinc-800/50 border border-zinc-700/30 text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  <span className="text-xs font-medium">{t.label}</span>
                  <span className="text-[10px] text-zinc-600">{t.bpm}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Energy */}
          <div className="space-y-2">
            <label className="text-xs text-zinc-400 font-medium">Energy Level</label>
            <div className="flex gap-1.5">
              {ENERGY_LEVELS.map((e) => (
                <button
                  key={e.id}
                  onClick={() => setEnergy(e.id)}
                  className={cn(
                    "flex-1 py-2 rounded-lg text-xs font-medium transition-all",
                    energy === e.id
                      ? "bg-purple-600/20 border border-purple-500/30 text-purple-300"
                      : "bg-zinc-800/50 border border-zinc-700/30 text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  {e.label}
                </button>
              ))}
            </div>
          </div>

          {/* Instruments */}
          <div className="space-y-2">
            <label className="text-xs text-zinc-400 font-medium">Instruments</label>
            <div className="flex flex-wrap gap-1.5">
              {INSTRUMENTS.map((inst) => (
                <button
                  key={inst}
                  onClick={() => toggleInstrument(inst)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs transition-all",
                    selectedInstruments.includes(inst)
                      ? "bg-purple-600/20 border border-purple-500/30 text-purple-300"
                      : "bg-zinc-800/50 border border-zinc-700/30 text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  {inst}
                </button>
              ))}
            </div>
          </div>

          {/* Duration */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-zinc-400 font-medium">Duration</label>
              <span className="text-xs text-zinc-500">{duration}s</span>
            </div>
            <input
              type="range"
              min={5}
              max={30}
              step={5}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-zinc-700 accent-purple-500"
            />
            <div className="flex justify-between text-[10px] text-zinc-600">
              <span>5s</span><span>15s</span><span>30s</span>
            </div>
          </div>

          {/* Video Upload for scoring */}
          <div className="space-y-2">
            <label className="text-xs text-zinc-400 font-medium">Score to Video (optional)</label>
            {videoUrl ? (
              <div className="relative rounded-lg overflow-hidden border border-zinc-700 bg-black">
                <video src={videoUrl} className="w-full h-28 object-cover" />
                <button
                  onClick={() => setVideoUrl("")}
                  className="absolute top-2 right-2 p-1 rounded bg-black/60 text-white text-xs hover:bg-black/80"
                >
                  ×
                </button>
              </div>
            ) : (
              <button
                onClick={() => videoInputRef.current?.click()}
                className="w-full py-5 rounded-lg border border-dashed border-zinc-700 hover:border-purple-500/50 text-zinc-500 hover:text-purple-400 flex flex-col items-center gap-2 transition-all hover:bg-purple-600/5"
              >
                <Upload className="w-5 h-5" />
                <span className="text-xs">Upload video to score</span>
              </button>
            )}
            <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setVideoUrl(URL.createObjectURL(file));
            }} />
          </div>
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
              {result ? "Soundtrack generated" : "Ready to generate"}
            </span>
          </div>
          {result && (
            <button onClick={downloadAudio} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-white">
              <Download className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Audio Canvas Area */}
        <div className="flex-1 flex items-center justify-center p-8 overflow-auto">
          {generating ? (
            <div className="flex flex-col items-center justify-center">
              <div className="relative mb-6">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-600/20 to-pink-600/20 flex items-center justify-center">
                  <Disc3 className="w-10 h-10 text-purple-400 animate-spin" style={{ animationDuration: "3s" }} />
                </div>
              </div>
              <p className="text-sm text-zinc-400 mb-1">Composing soundtrack...</p>
              <p className="text-xs text-zinc-600">This may take 30-60 seconds</p>
            </div>
          ) : result?.audio?.url ? (
            <div className="flex flex-col items-center gap-6 max-w-lg w-full">
              {/* Waveform Visual */}
              <div className="w-full p-6 rounded-2xl bg-gradient-to-br from-purple-600/10 to-pink-600/10 border border-purple-500/20">
                <div className="flex items-center gap-4 mb-4">
                  <button
                    onClick={togglePlay}
                    className="w-12 h-12 rounded-full bg-purple-600 hover:bg-purple-500 transition-colors flex items-center justify-center shrink-0"
                  >
                    {isPlaying ? <Pause className="w-5 h-5 text-white" /> : <Play className="w-5 h-5 text-white ml-0.5" />}
                  </button>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-white">AI Soundtrack</span>
                      <span className="text-xs text-zinc-500">{result.audio.duration}s</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: 40 }).map((_, i) => (
                        <div
                          key={i}
                          className={cn(
                            "w-1 rounded-full transition-all",
                            isPlaying ? "bg-purple-400" : "bg-zinc-600"
                          )}
                          style={{ height: waveformHeights[i], animationDelay: `${i * 50}ms` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <audio
                  ref={audioRef}
                  src={result.audio.url}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => setIsPlaying(false)}
                />

                {/* Tags */}
                <div className="flex flex-wrap gap-1.5 pt-3 border-t border-zinc-800/50">
                  <span className="px-2 py-0.5 rounded text-[10px] bg-purple-600/20 text-purple-400">{genre}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-pink-600/20 text-pink-400">{mood}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-zinc-700 text-zinc-400">{tempo}</span>
                  {selectedInstruments.slice(0, 3).map(i => (
                    <span key={i} className="px-2 py-0.5 rounded text-[10px] bg-zinc-700 text-zinc-400">{i}</span>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={downloadAudio}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download WAV
                </button>
                <button
                  onClick={handleGenerate}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Regenerate
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-600/10 to-pink-600/10 flex items-center justify-center mb-6">
                <Music className="w-10 h-10 text-zinc-600" />
              </div>
              <h3 className="text-lg font-semibold text-zinc-400 mb-2">Generate AI Soundtrack</h3>
              <p className="text-sm text-zinc-600 max-w-md">
                Choose genre, mood, instruments, and tempo to create original music. Optionally describe what you want or upload a video to score.
              </p>
            </div>
          )}
        </div>

        {/* Bottom bar with prompt + generate */}
        <div className="border-t border-zinc-800 p-4 bg-[#0a0a0a] shrink-0">
          <div className="max-w-4xl mx-auto">
            {error && (
              <div className="mb-3 p-3 rounded-xl bg-red-600/10 border border-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleGenerate();
                    }
                  }}
                  placeholder="Optional: describe the soundtrack you want (e.g., 'Epic orchestral with building tension for a movie trailer')..."
                  className="w-full bg-zinc-900/80 border border-zinc-700/50 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 resize-none focus:outline-none focus:border-purple-500/50 min-h-[52px] max-h-32"
                  rows={1}
                />
              </div>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className={cn(
                  "px-6 py-3 rounded-xl text-sm font-medium flex items-center gap-2 transition-all shrink-0",
                  !generating
                    ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-500 hover:to-pink-500 shadow-lg shadow-purple-500/20"
                    : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                )}
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {generating ? "Generating..." : "Generate"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Music,
  Mic,
  Play,
  Pause,
  Square,
  Download,
  Sparkles,
  SendHorizontal,
  Loader2,
  Wand2,
  Volume2,
  VolumeX,
  Trash2,
  AudioWaveform,
  MessageSquare,
  ChevronDown,
  X,
  Zap,
  RotateCcw,
  Repeat,
  Repeat1,
  SlidersHorizontal,
  Plus,
  ChevronRight,
  Layers,
  Settings2,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────────────────────
   Types
───────────────────────────────────────────────────────────────────────────── */

interface Track {
  id: string;
  name: string;
  type: "music" | "speech" | "recording";
  url: string | null;
  prompt: string;
  duration: number;
  generating: boolean;
  progress: number; // 0-100 estimated
  error: string | null;
  muted: boolean;
  volume: number;
  looping: boolean;
  color: string;
  meta: {
    genre?: string; mood?: string; bpm?: number; key?: string;
    model_version?: string; instruments?: string[];
  };
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Constants
───────────────────────────────────────────────────────────────────────────── */

const TRACK_COLORS = [
  "from-violet-500 to-purple-600",
  "from-emerald-500 to-teal-600",
  "from-pink-500 to-rose-600",
  "from-amber-500 to-orange-600",
  "from-cyan-500 to-blue-600",
  "from-fuchsia-500 to-violet-600",
  "from-red-500 to-rose-700",
  "from-sky-500 to-blue-600",
];

const GENRES = [
  "Electronic", "Ambient", "Cinematic", "Lo-Fi", "Jazz", "Rock",
  "Classical", "Hip-Hop", "Pop", "Folk", "R&B", "Drum & Bass",
  "House", "Techno", "Trap", "Synthwave", "Orchestral", "World",
];
const MOODS = [
  "Uplifting", "Melancholic", "Tense", "Calm", "Energetic",
  "Mysterious", "Romantic", "Dark", "Euphoric", "Nostalgic", "Aggressive", "Dreamy",
];
const KEYS = [
  "C major", "C minor", "C# major", "C# minor", "D major", "D minor",
  "Eb major", "Eb minor", "E major", "E minor", "F major", "F minor",
  "F# major", "F# minor", "G major", "G minor", "Ab major", "Ab minor",
  "A major", "A minor", "Bb major", "Bb minor", "B major", "B minor",
];
const INSTRUMENTS = [
  "Piano", "Guitar", "Bass", "Drums", "Synthesizer", "Strings",
  "Brass", "Flute", "Pads", "Arpeggiator", "808", "Choir",
  "Marimba", "Violin", "Bells", "Organ",
];
const MODEL_VERSIONS = [
  { id: "stereo-melody-large", label: "Stereo Melody Large", desc: "Best quality, stereo + melody conditioning" },
  { id: "stereo-large", label: "Stereo Large", desc: "High quality stereo output" },
  { id: "melody-large", label: "Melody Large", desc: "Mono, melody conditioning" },
  { id: "large", label: "Large", desc: "High quality mono" },
  { id: "medium", label: "Medium", desc: "Faster generation, good quality" },
  { id: "small", label: "Small", desc: "Fastest generation" },
];
const DURATIONS = [5, 8, 10, 15, 20, 30, 45, 60];
const TTS_VOICES = [
  { id: "alloy", label: "Alloy", desc: "Neutral, versatile" },
  { id: "echo", label: "Echo", desc: "Clear, crisp male" },
  { id: "fable", label: "Fable", desc: "Warm, British" },
  { id: "onyx", label: "Onyx", desc: "Deep, authoritative" },
  { id: "nova", label: "Nova", desc: "Energetic female" },
  { id: "shimmer", label: "Shimmer", desc: "Expressive female" },
  { id: "aria", label: "Aria", desc: "Smooth female" },
  { id: "roger", label: "Roger", desc: "Confident male" },
  { id: "sarah", label: "Sarah", desc: "Soft, friendly" },
];

const AI_PROMPT_TEMPLATES = [
  { label: "Trailer", prompt: "Epic cinematic trailer music, massive orchestral swells, tension building, dramatic percussion, brass fanfare" },
  { label: "Coffee shop", prompt: "Warm acoustic lo-fi, gentle guitar, soft brushed drums, cozy atmosphere, morning vibes" },
  { label: "Night drive", prompt: "Dark synthwave, pulsing analog bass, neon-lit arpeggios, 80s noir atmosphere, hypnotic groove" },
  { label: "Boss fight", prompt: "Intense melodic metal, shredding guitars, double bass drums, aggressive synths, epic chorus" },
  { label: "Meditation", prompt: "Deep ambient drone, singing bowls, soft reverb textures, healing frequencies, breathwork pacing" },
  { label: "Club banger", prompt: "Peak hour techno, heavy kick drum, acid bassline, hypnotic loop, club energy, dark groove" },
  { label: "Sad piano", prompt: "Solo piano, melancholic melody, minor key, slow tempo, emotional depth, cinematic reverb" },
  { label: "Summer pop", prompt: "Upbeat pop, catchy synth hook, four-on-the-floor beat, bright chords, feel-good summer energy" },
];

/* ─────────────────────────────────────────────────────────────────────────────
   Waveform Bars (animated during playback)
───────────────────────────────────────────────────────────────────────────── */

function WaveformBars({ playing, color }: { playing: boolean; color: string }) {
  const bars = [3, 7, 5, 9, 4, 8, 6, 10, 3, 7, 5, 8, 4, 9, 6];
  return (
    <div className="flex items-center gap-[2px] h-6">
      {bars.map((h, i) => (
        <div
          key={i}
          className={cn("w-[2px] rounded-full transition-all", color)}
          style={{
            height: playing ? `${h * 2 + 4}px` : "4px",
            animation: playing ? `waveBar ${0.6 + (i % 4) * 0.15}s ease-in-out ${i * 0.05}s infinite alternate` : "none",
            opacity: playing ? 1 : 0.3,
          }}
        />
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Progress estimator hook
───────────────────────────────────────────────────────────────────────────── */

function useProgressTimer(active: boolean, durationSeconds: number) {
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (active) {
      setProgress(0);
      const totalMs = Math.max(durationSeconds * 1500, 15000); // rough estimate
      const step = 100 / (totalMs / 200);
      timerRef.current = setInterval(() => {
        setProgress((p) => Math.min(p + step, 92)); // cap at 92, server sets 100
      }, 200);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setProgress(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [active, durationSeconds]);

  return progress;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Main Component
───────────────────────────────────────────────────────────────────────────── */

export function AudioStudioEmbed() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [tab, setTab] = useState<"compose" | "speech" | "record">("compose");

  // Compose state
  const [prompt, setPrompt] = useState("");
  const [genre, setGenre] = useState("Electronic");
  const [mood, setMood] = useState("Uplifting");
  const [duration, setDuration] = useState(15);
  const [bpm, setBpm] = useState<number | "">("");
  const [key, setKey] = useState("");
  const [modelVersion, setModelVersion] = useState("stereo-melody-large");
  const [selectedInstruments, setSelectedInstruments] = useState<string[]>([]);
  const [tempo, setTempo] = useState("moderate");
  const [energy, setEnergy] = useState("medium");
  const [temperature, setTemperature] = useState(1.0);
  const [cfgScale, setCfgScale] = useState(3);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingDuration, setGeneratingDuration] = useState(15);
  const genProgress = useProgressTimer(generating, generatingDuration);

  // Speech state
  const [speechText, setSpeechText] = useState("");
  const [speechVoice, setSpeechVoice] = useState("alloy");
  const [speechGenerating, setSpeechGenerating] = useState(false);

  // Record state
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlobs, setAudioBlobs] = useState<{ id: string; name: string; url: string }[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunks = useRef<BlobPart[]>([]);
  const recordingTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Playback
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playProgress, setPlayProgress] = useState<Record<string, number>>({});
  const progressTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  // AI Chat
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "I'm your AI music producer. Tell me what kind of track you want to create and I'll help craft the perfect prompt, suggest instruments, BPM, key, and more. What are we making?" },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  /* ── Instrument toggle ── */
  const toggleInstrument = useCallback((inst: string) => {
    setSelectedInstruments((prev) =>
      prev.includes(inst) ? prev.filter((i) => i !== inst) : [...prev, inst]
    );
  }, []);

  /* ── AI autofill ── */
  const aiAutoFill = useCallback(() => {
    const templates = [
      `Driving ${genre.toLowerCase()} beat, ${bpm || 128} BPM, heavy bass, synth arpeggios, ${mood.toLowerCase()} energy`,
      `Lush ${genre.toLowerCase()} with layered pads, ${mood.toLowerCase()} atmosphere, ${key || "A minor"}, slow build`,
      `${mood} ${genre} for a cinematic sequence, evolving textures, dynamic tension and release`,
      `Hypnotic minimal ${genre.toLowerCase()} loop, tight groove, ${mood.toLowerCase()} undertones, club-ready mix`,
      `${genre} with ${selectedInstruments.length ? selectedInstruments.join(" + ") : "piano and strings"}, ${mood.toLowerCase()} feeling, ${key || "C major"}`,
    ];
    setPrompt(templates[Math.floor(Math.random() * templates.length)]);
  }, [genre, mood, bpm, key, selectedInstruments]);

  /* ── Generate Music ── */
  const generateMusic = useCallback(async () => {
    if (!prompt.trim() && !genre) return;
    setGenerating(true);
    setGeneratingDuration(duration);

    const trackId = `track-${Date.now()}`;
    const newTrack: Track = {
      id: trackId,
      name: prompt.trim() || `${genre} · ${mood}`,
      type: "music",
      url: null,
      prompt: prompt.trim(),
      duration,
      generating: true,
      progress: 0,
      error: null,
      muted: false,
      volume: 0.85,
      looping: false,
      color: TRACK_COLORS[tracks.length % TRACK_COLORS.length],
      meta: { genre, mood, bpm: bpm || undefined, key: key || undefined, model_version: modelVersion, instruments: selectedInstruments },
    };
    setTracks((prev) => [...prev, newTrack]);

    try {
      const res = await fetch("/api/firefly/generate-soundtrack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          genre, mood, duration,
          tempo, energy,
          bpm: bpm || undefined,
          key: key || undefined,
          model_version: modelVersion,
          instruments: selectedInstruments.length ? selectedInstruments : undefined,
          temperature,
          classifier_free_guidance: cfgScale,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");

      setTracks((prev) =>
        prev.map((t) =>
          t.id === trackId
            ? { ...t, url: data.audio?.url ?? null, duration: data.audio?.duration ?? duration, generating: false, progress: 100 }
            : t
        )
      );
    } catch (err) {
      setTracks((prev) =>
        prev.map((t) =>
          t.id === trackId ? { ...t, generating: false, error: (err as Error).message } : t
        )
      );
    } finally {
      setGenerating(false);
      setPrompt("");
    }
  }, [prompt, genre, mood, duration, tempo, energy, bpm, key, modelVersion, selectedInstruments, temperature, cfgScale, tracks.length]);

  /* ── Generate Speech ── */
  const generateSpeech = useCallback(async () => {
    if (!speechText.trim()) return;
    setSpeechGenerating(true);
    const trackId = `speech-${Date.now()}`;
    const newTrack: Track = {
      id: trackId,
      name: speechText.slice(0, 50) + (speechText.length > 50 ? "…" : ""),
      type: "speech",
      url: null,
      prompt: speechText,
      duration: 0,
      generating: true,
      progress: 0,
      error: null,
      muted: false,
      volume: 0.85,
      looping: false,
      color: TRACK_COLORS[(tracks.length + 1) % TRACK_COLORS.length],
      meta: {},
    };
    setTracks((prev) => [...prev, newTrack]);
    try {
      const res = await fetch("/api/firefly/generate-speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: speechText, voice: speechVoice }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "TTS failed");
      setTracks((prev) =>
        prev.map((t) =>
          t.id === trackId ? { ...t, url: data.url ?? data.audioUrl ?? null, generating: false, progress: 100 } : t
        )
      );
    } catch (err) {
      setTracks((prev) =>
        prev.map((t) =>
          t.id === trackId ? { ...t, generating: false, error: (err as Error).message } : t
        )
      );
    } finally {
      setSpeechGenerating(false);
      setSpeechText("");
    }
  }, [speechText, speechVoice, tracks.length]);

  /* ── Recording ── */
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingChunks.current = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => { if (e.data.size > 0) recordingChunks.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(recordingChunks.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setAudioBlobs((prev) => [...prev, { id: `rec-${Date.now()}`, name: `Recording ${prev.length + 1}`, url }]);
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
      setRecordingTime(0);
      recordingTimer.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    } catch {
      alert("Microphone access denied.");
    }
  }, []);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    if (recordingTimer.current) clearInterval(recordingTimer.current);
  }, []);

  /* ── Playback ── */
  const togglePlay = useCallback((trackId: string, url: string, looping: boolean) => {
    if (playingId === trackId) {
      audioRefs.current.get(trackId)?.pause();
      progressTimers.current.get(trackId) && clearInterval(progressTimers.current.get(trackId)!);
      setPlayingId(null);
    } else {
      if (playingId) {
        audioRefs.current.get(playingId)?.pause();
        progressTimers.current.get(playingId) && clearInterval(progressTimers.current.get(playingId)!);
      }
      let audio = audioRefs.current.get(trackId);
      if (!audio) {
        audio = new Audio(url);
        audioRefs.current.set(trackId, audio);
      }
      audio.loop = looping;
      audio.onended = () => {
        if (!audio!.loop) {
          setPlayingId(null);
          progressTimers.current.get(trackId) && clearInterval(progressTimers.current.get(trackId)!);
        }
      };
      audio.play();
      setPlayingId(trackId);
      const timer = setInterval(() => {
        const a = audioRefs.current.get(trackId);
        if (a && a.duration) {
          setPlayProgress((prev) => ({ ...prev, [trackId]: (a.currentTime / a.duration) * 100 }));
        }
      }, 100);
      progressTimers.current.set(trackId, timer);
    }
  }, [playingId]);

  const setTrackVolume = useCallback((id: string, vol: number) => {
    setTracks((prev) => prev.map((t) => t.id === id ? { ...t, volume: vol } : t));
    const audio = audioRefs.current.get(id);
    if (audio) audio.volume = vol;
  }, []);

  const toggleLoop = useCallback((id: string) => {
    setTracks((prev) => prev.map((t) => {
      if (t.id !== id) return t;
      const audio = audioRefs.current.get(id);
      if (audio) audio.loop = !t.looping;
      return { ...t, looping: !t.looping };
    }));
  }, []);

  const removeTrack = useCallback((id: string) => {
    audioRefs.current.get(id)?.pause();
    audioRefs.current.delete(id);
    progressTimers.current.get(id) && clearInterval(progressTimers.current.get(id)!);
    if (playingId === id) setPlayingId(null);
    setTracks((prev) => prev.filter((t) => t.id !== id));
  }, [playingId]);

  const downloadTrack = useCallback((url: string, name: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = name.replace(/[^a-z0-9 ]/gi, "_").trim() + ".wav";
    a.click();
  }, []);

  /* ── AI Chat ── */
  const sendChat = useCallback(async () => {
    if (!chatInput.trim() || chatLoading) return;
    const input = chatInput.trim();
    setChatMessages((prev) => [...prev, { role: "user", content: input }]);
    setChatInput("");
    setChatLoading(true);
    try {
      const context = `Current studio state: genre=${genre}, mood=${mood}, bpm=${bpm || "unset"}, key=${key || "unset"}, instruments=${selectedInstruments.join(", ") || "none"}, duration=${duration}s, model=${modelVersion}. User has ${tracks.length} tracks so far.`;
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Audio Studio Producer",
          prompt: `You are an expert music producer and audio engineer inside Ottomate Audio Studio. Be specific, technical, and creative. Give concrete BPM, keys, instruments, and prompt suggestions. Keep responses under 150 words unless asked for more.\n\n${context}\n\nUser: ${input}`,
          model: "claude-sonnet-4-6",
          metadata: { source: "audio-studio-chat" },
        }),
      });
      const task = await res.json();
      let reply = "Working on it — check the Tasks page for full results.";
      if (task?.id) {
        for (let i = 0; i < 15; i++) {
          await new Promise(r => setTimeout(r, 1500));
          const poll = await fetch(`/api/tasks/${task.id}`);
          const taskData = await poll.json();
          if (taskData.status === "completed" || taskData.status === "failed") {
            const lastStep = taskData?.steps?.filter((s: { type: string }) => s.type === "assistant").slice(-1)[0];
            if (lastStep?.content) { reply = lastStep.content; break; }
          }
        }
      }
      setChatMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setChatMessages((prev) => [...prev, { role: "assistant", content: "Something went wrong. Try again." }]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, genre, mood, bpm, key, selectedInstruments, duration, modelVersion, tracks.length]);

  /* ── Render ── */
  return (
    <div className="h-full flex flex-col bg-[#080810] text-zinc-100 overflow-hidden">
      <style>{`
        @keyframes waveBar {
          0% { transform: scaleY(0.4); }
          100% { transform: scaleY(1); }
        }
        .slider-thumb::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 12px; height: 12px;
          border-radius: 50%;
          background: #8b5cf6;
          cursor: pointer;
        }
        .slider-thumb::-moz-range-thumb {
          width: 12px; height: 12px;
          border-radius: 50%;
          background: #8b5cf6;
          cursor: pointer;
          border: none;
        }
      `}</style>

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-zinc-800/60 bg-[#0c0c16] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 via-purple-600 to-pink-600 flex items-center justify-center shadow-lg shadow-violet-900/30">
            <AudioWaveform className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="text-sm font-bold bg-gradient-to-r from-violet-400 via-purple-300 to-pink-400 bg-clip-text text-transparent">
              Ottomate Audio Studio
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-zinc-600">MusicGen · ElevenLabs · OpenAI TTS</span>
              {generating && (
                <span className="text-[10px] text-violet-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                  Generating…
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setChatOpen((o) => !o)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
              chatOpen ? "bg-violet-600 text-white shadow-lg shadow-violet-900/40" : "bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300"
            )}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            AI Producer
          </button>
          <a
            href="/computer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 transition-colors"
          >
            <Zap className="w-3.5 h-3.5 text-violet-400" />
            New Task
          </a>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left: Controls ── */}
        <div className="w-[400px] shrink-0 border-r border-zinc-800/60 flex flex-col overflow-hidden bg-[#0c0c16]">
          {/* Tabs */}
          <div className="flex px-3 pt-3 gap-1 shrink-0">
            {(["compose", "speech", "record"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium capitalize transition-colors",
                  tab === t ? "bg-violet-600/20 text-violet-300 border border-violet-600/40" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40"
                )}
              >
                {t === "compose" && <Music className="w-3 h-3" />}
                {t === "speech" && <Mic className="w-3 h-3" />}
                {t === "record" && <Activity className="w-3 h-3" />}
                {t}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {/* ═══ COMPOSE TAB ═══ */}
            {tab === "compose" && (
              <>
                {/* Prompt */}
                <div className="relative">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generateMusic(); }}
                    placeholder="Describe your track in detail… BPM, instruments, vibe, texture"
                    rows={3}
                    className="w-full bg-zinc-900/80 border border-zinc-700/50 rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:ring-1 focus:ring-violet-500/60"
                  />
                  <button
                    onClick={aiAutoFill}
                    title="AI suggest prompt"
                    className="absolute top-2 right-2 p-1.5 rounded-lg hover:bg-zinc-700/60 text-violet-400 hover:text-violet-300 transition-colors"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Quick templates */}
                <div>
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1.5">Quick Templates</p>
                  <div className="flex flex-wrap gap-1.5">
                    {AI_PROMPT_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.label}
                        onClick={() => setPrompt(tpl.prompt)}
                        className="px-2 py-1 rounded-md bg-zinc-800/60 hover:bg-zinc-700/60 text-zinc-400 hover:text-zinc-200 text-[11px] transition-colors border border-zinc-700/30 hover:border-violet-600/40"
                      >
                        {tpl.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Genre + Mood */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1 block">Genre</label>
                    <div className="relative">
                      <select value={genre} onChange={(e) => setGenre(e.target.value)}
                        className="w-full bg-zinc-900/80 border border-zinc-700/50 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 appearance-none focus:outline-none focus:ring-1 focus:ring-violet-500/60">
                        {GENRES.map((g) => <option key={g}>{g}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2 top-2 w-3 h-3 text-zinc-600 pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1 block">Mood</label>
                    <div className="relative">
                      <select value={mood} onChange={(e) => setMood(e.target.value)}
                        className="w-full bg-zinc-900/80 border border-zinc-700/50 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 appearance-none focus:outline-none focus:ring-1 focus:ring-violet-500/60">
                        {MOODS.map((m) => <option key={m}>{m}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2 top-2 w-3 h-3 text-zinc-600 pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* BPM + Key + Duration */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1 block">BPM</label>
                    <input
                      type="number" min="40" max="240"
                      value={bpm}
                      onChange={(e) => setBpm(e.target.value ? Number(e.target.value) : "")}
                      placeholder="auto"
                      className="w-full bg-zinc-900/80 border border-zinc-700/50 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-violet-500/60 placeholder-zinc-600"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1 block">Key</label>
                    <div className="relative">
                      <select value={key} onChange={(e) => setKey(e.target.value)}
                        className="w-full bg-zinc-900/80 border border-zinc-700/50 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 appearance-none focus:outline-none focus:ring-1 focus:ring-violet-500/60">
                        <option value="">Auto</option>
                        {KEYS.map((k) => <option key={k}>{k}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2 top-2 w-3 h-3 text-zinc-600 pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1 block">Duration</label>
                    <div className="relative">
                      <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}
                        className="w-full bg-zinc-900/80 border border-zinc-700/50 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 appearance-none focus:outline-none focus:ring-1 focus:ring-violet-500/60">
                        {DURATIONS.map((d) => <option key={d} value={d}>{d}s</option>)}
                      </select>
                      <ChevronDown className="absolute right-2 top-2 w-3 h-3 text-zinc-600 pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* Instruments */}
                <div>
                  <label className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1.5 block">Instruments</label>
                  <div className="flex flex-wrap gap-1.5">
                    {INSTRUMENTS.map((inst) => (
                      <button
                        key={inst}
                        onClick={() => toggleInstrument(inst)}
                        className={cn(
                          "px-2 py-1 rounded-md text-[11px] transition-colors border",
                          selectedInstruments.includes(inst)
                            ? "bg-violet-600/30 text-violet-300 border-violet-500/60"
                            : "bg-zinc-800/40 text-zinc-500 hover:text-zinc-300 border-zinc-700/30"
                        )}
                      >
                        {inst}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Model */}
                <div>
                  <label className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1 block">Model</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {MODEL_VERSIONS.map((mv) => (
                      <button
                        key={mv.id}
                        onClick={() => setModelVersion(mv.id)}
                        className={cn(
                          "p-2 rounded-lg text-left transition-colors border text-[11px]",
                          modelVersion === mv.id
                            ? "bg-violet-600/20 border-violet-500/60 text-violet-300"
                            : "bg-zinc-900/60 border-zinc-700/30 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600/40"
                        )}
                      >
                        <div className="font-medium">{mv.label}</div>
                        <div className="text-[10px] opacity-60 mt-0.5">{mv.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Advanced */}
                <div>
                  <button
                    onClick={() => setShowAdvanced((v) => !v)}
                    className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    <Settings2 className="w-3 h-3" />
                    Advanced Parameters
                    <ChevronRight className={cn("w-3 h-3 transition-transform", showAdvanced && "rotate-90")} />
                  </button>
                  {showAdvanced && (
                    <div className="mt-3 space-y-3 pl-2 border-l border-zinc-800">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1 block">Tempo</label>
                          <div className="relative">
                            <select value={tempo} onChange={(e) => setTempo(e.target.value)}
                              className="w-full bg-zinc-900/80 border border-zinc-700/50 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 appearance-none focus:outline-none focus:ring-1 focus:ring-violet-500/60">
                              {["slow", "moderate", "fast"].map((v) => <option key={v}>{v}</option>)}
                            </select>
                            <ChevronDown className="absolute right-2 top-2 w-3 h-3 text-zinc-600 pointer-events-none" />
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1 block">Energy</label>
                          <div className="relative">
                            <select value={energy} onChange={(e) => setEnergy(e.target.value)}
                              className="w-full bg-zinc-900/80 border border-zinc-700/50 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 appearance-none focus:outline-none focus:ring-1 focus:ring-violet-500/60">
                              {["low", "medium", "high"].map((v) => <option key={v}>{v}</option>)}
                            </select>
                            <ChevronDown className="absolute right-2 top-2 w-3 h-3 text-zinc-600 pointer-events-none" />
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1 flex items-center justify-between">
                          Temperature <span className="text-zinc-400">{temperature.toFixed(1)}</span>
                        </label>
                        <input type="range" min="0" max="2" step="0.1" value={temperature}
                          onChange={(e) => setTemperature(Number(e.target.value))}
                          className="w-full h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer slider-thumb accent-violet-500" />
                        <div className="flex justify-between text-[10px] text-zinc-700 mt-0.5">
                          <span>Conservative</span><span>Creative</span>
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1 flex items-center justify-between">
                          Prompt Guidance <span className="text-zinc-400">{cfgScale}</span>
                        </label>
                        <input type="range" min="1" max="10" step="1" value={cfgScale}
                          onChange={(e) => setCfgScale(Number(e.target.value))}
                          className="w-full h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer slider-thumb accent-violet-500" />
                        <div className="flex justify-between text-[10px] text-zinc-700 mt-0.5">
                          <span>Loose</span><span>Strict</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Generate button */}
                <button
                  onClick={generateMusic}
                  disabled={generating}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 disabled:opacity-60 text-white text-sm font-semibold transition-all shadow-lg shadow-violet-900/30 active:scale-[0.98]"
                >
                  {generating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating… {Math.round(genProgress)}%
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Generate Track
                    </>
                  )}
                </button>
                {generating && (
                  <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full transition-all duration-300"
                      style={{ width: `${genProgress}%` }}
                    />
                  </div>
                )}
              </>
            )}

            {/* ═══ SPEECH TAB ═══ */}
            {tab === "speech" && (
              <>
                <div>
                  <label className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1 block">Text to Speak</label>
                  <textarea
                    value={speechText}
                    onChange={(e) => setSpeechText(e.target.value)}
                    placeholder="Enter text to synthesize into speech…"
                    rows={5}
                    className="w-full bg-zinc-900/80 border border-zinc-700/50 rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:ring-1 focus:ring-violet-500/60"
                  />
                  <p className="text-[10px] text-zinc-600 mt-1">{speechText.length} characters</p>
                </div>
                <div>
                  <label className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1.5 block">Voice</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {TTS_VOICES.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => setSpeechVoice(v.id)}
                        className={cn(
                          "p-2 rounded-lg text-left transition-colors border",
                          speechVoice === v.id
                            ? "bg-violet-600/20 border-violet-500/60 text-violet-300"
                            : "bg-zinc-900/60 border-zinc-700/30 text-zinc-500 hover:text-zinc-300"
                        )}
                      >
                        <div className="text-xs font-medium">{v.label}</div>
                        <div className="text-[10px] opacity-60 mt-0.5">{v.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={generateSpeech}
                  disabled={speechGenerating || !speechText.trim()}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 disabled:opacity-50 text-white text-sm font-semibold transition-all"
                >
                  {speechGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
                  {speechGenerating ? "Synthesising…" : "Generate Voice"}
                </button>
              </>
            )}

            {/* ═══ RECORD TAB ═══ */}
            {tab === "record" && (
              <>
                <div className={cn(
                  "flex items-center justify-between rounded-xl border px-4 py-3",
                  recording ? "border-red-500/50 bg-red-500/10" : "border-zinc-700/50 bg-zinc-900/80"
                )}>
                  <div className="flex items-center gap-2.5">
                    <span className={cn(
                      "w-3 h-3 rounded-full",
                      recording ? "bg-red-500 animate-pulse" : "bg-zinc-600"
                    )} />
                    <span className="text-sm font-medium text-zinc-300">
                      {recording
                        ? `${Math.floor(recordingTime / 60).toString().padStart(2, "0")}:${(recordingTime % 60).toString().padStart(2, "0")}`
                        : "Microphone"}
                    </span>
                  </div>
                  {!recording ? (
                    <button onClick={startRecording} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-medium transition-colors">
                      <Mic className="w-3.5 h-3.5" /> Record
                    </button>
                  ) : (
                    <button onClick={stopRecording} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-medium transition-colors">
                      <Square className="w-3.5 h-3.5" /> Stop
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {audioBlobs.map((r) => (
                    <div key={r.id} className="flex items-center gap-2 bg-zinc-900/60 border border-zinc-800/40 rounded-lg px-3 py-2">
                      <button
                        onClick={() => togglePlay(r.id, r.url, false)}
                        className="w-7 h-7 flex items-center justify-center rounded-full bg-zinc-700 hover:bg-violet-600 text-white transition-colors shrink-0"
                      >
                        {playingId === r.id ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                      </button>
                      <span className="flex-1 text-xs text-zinc-300 truncate">{r.name}</span>
                      <a href={r.url} download={`${r.name}.webm`} className="p-1 text-zinc-600 hover:text-zinc-300"><Download className="w-3.5 h-3.5" /></a>
                      <button onClick={() => setAudioBlobs((prev) => prev.filter((b) => b.id !== r.id))} className="p-1 text-zinc-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                  {audioBlobs.length === 0 && (
                    <p className="text-xs text-zinc-600 text-center py-4">No recordings yet</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Right: Track list ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800/60 shrink-0">
            <div className="flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-zinc-500" />
              <span className="text-xs font-medium text-zinc-400">
                {tracks.length} Track{tracks.length !== 1 ? "s" : ""}
              </span>
            </div>
            {tracks.length > 0 && (
              <button
                onClick={() => { tracks.forEach((t) => removeTrack(t.id)); }}
                className="text-[11px] text-zinc-600 hover:text-red-400 transition-colors"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {tracks.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center gap-3 pb-10">
                <div className="w-16 h-16 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-center">
                  <Music className="w-7 h-7 text-zinc-700" />
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-500">No tracks yet</p>
                  <p className="text-xs text-zinc-700 mt-1">Generate your first track using the controls on the left</p>
                </div>
              </div>
            ) : (
              tracks.map((track) => (
                <AdvancedTrackRow
                  key={track.id}
                  track={track}
                  isPlaying={playingId === track.id}
                  playProgress={playProgress[track.id] ?? 0}
                  onPlay={() => track.url && togglePlay(track.id, track.url, track.looping)}
                  onDownload={() => track.url && downloadTrack(track.url, track.name)}
                  onRemove={() => removeTrack(track.id)}
                  onMute={() => setTracks((prev) => prev.map((t) => t.id === track.id ? { ...t, muted: !t.muted } : t))}
                  onLoop={() => toggleLoop(track.id)}
                  onVolumeChange={(vol) => setTrackVolume(track.id, vol)}
                />
              ))
            )}
          </div>
        </div>

        {/* ── AI Chat panel ── */}
        {chatOpen && (
          <div className="w-72 border-l border-zinc-800/60 flex flex-col bg-[#0a0a12]">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-800/60 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-md bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center">
                  <Sparkles className="w-3 h-3 text-white" />
                </div>
                <span className="text-xs font-semibold text-zinc-300">AI Producer</span>
              </div>
              <button onClick={() => setChatOpen(false)} className="text-zinc-600 hover:text-zinc-300 p-1">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    "rounded-xl px-3 py-2 text-[11px] leading-relaxed",
                    msg.role === "user"
                      ? "bg-violet-600/20 text-zinc-200 ml-4 border border-violet-600/20"
                      : "bg-zinc-800/50 text-zinc-300 mr-4 border border-zinc-700/30"
                  )}
                >
                  {msg.content}
                </div>
              ))}
              {chatLoading && (
                <div className="flex items-center gap-2 text-[11px] text-zinc-500 ml-1">
                  <Loader2 className="w-3 h-3 animate-spin text-violet-400" />
                  Thinking…
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="p-2.5 border-t border-zinc-800/60 shrink-0">
              <div className="flex items-end gap-1.5">
                <textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                  placeholder="Ask about genre, BPM, mixing, prompts…"
                  rows={2}
                  className="flex-1 bg-zinc-900/80 border border-zinc-700/40 rounded-lg px-2.5 py-2 text-[11px] text-zinc-200 placeholder-zinc-600 resize-none focus:outline-none focus:ring-1 focus:ring-violet-500/60"
                />
                <button
                  onClick={sendChat}
                  disabled={chatLoading || !chatInput.trim()}
                  className="p-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white transition-colors"
                >
                  <SendHorizontal className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Advanced Track Row
───────────────────────────────────────────────────────────────────────────── */

function AdvancedTrackRow({
  track,
  isPlaying,
  playProgress,
  onPlay,
  onDownload,
  onRemove,
  onMute,
  onLoop,
  onVolumeChange,
}: {
  track: Track;
  isPlaying: boolean;
  playProgress: number;
  onPlay: () => void;
  onDownload: () => void;
  onRemove: () => void;
  onMute: () => void;
  onLoop: () => void;
  onVolumeChange: (vol: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn(
      "border rounded-xl transition-all overflow-hidden",
      track.error ? "border-red-800/50 bg-red-900/10" :
      track.generating ? "border-violet-700/40 bg-violet-900/5" :
      isPlaying ? "border-violet-600/50 bg-violet-900/10" :
      "border-zinc-800/50 bg-zinc-900/40 hover:border-zinc-700/60"
    )}>
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        {/* Color strip */}
        <div className={cn("w-1 h-10 rounded-full bg-gradient-to-b shrink-0", track.color)} />

        {/* Play button */}
        <button
          onClick={onPlay}
          disabled={!track.url || track.generating}
          className={cn(
            "w-8 h-8 flex items-center justify-center rounded-full shrink-0 transition-colors",
            isPlaying ? "bg-violet-600 text-white" : "bg-zinc-800 hover:bg-violet-600/80 text-zinc-400 hover:text-white disabled:opacity-30"
          )}
        >
          {track.generating
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : isPlaying
              ? <Pause className="w-3.5 h-3.5" />
              : <Play className="w-3.5 h-3.5 ml-0.5" />}
        </button>

        {/* Info + waveform */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-zinc-200 truncate">{track.name}</span>
            <span className={cn(
              "text-[9px] px-1 py-0.5 rounded shrink-0",
              track.type === "music" ? "bg-violet-500/20 text-violet-400" :
              track.type === "speech" ? "bg-emerald-500/20 text-emerald-400" :
              "bg-red-500/20 text-red-400"
            )}>
              {track.type}
            </span>
          </div>

          {track.generating ? (
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full animate-pulse" style={{ width: "60%" }} />
              </div>
              <span className="text-[10px] text-zinc-600">Generating…</span>
            </div>
          ) : track.error ? (
            <p className="text-[10px] text-red-400 mt-0.5 truncate">{track.error}</p>
          ) : track.url ? (
            <div className="mt-1">
              {isPlaying ? (
                <WaveformBars playing color="bg-violet-400" />
              ) : (
                <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-zinc-700 rounded-full" style={{ width: `${playProgress}%` }} />
                </div>
              )}
              <div className="flex items-center gap-2 mt-0.5">
                {track.meta.genre && <span className="text-[10px] text-zinc-600">{track.meta.genre}</span>}
                {track.meta.bpm && <span className="text-[10px] text-zinc-600">{track.meta.bpm} BPM</span>}
                {track.meta.key && <span className="text-[10px] text-zinc-600">{track.meta.key}</span>}
                {track.duration > 0 && <span className="text-[10px] text-zinc-600">{track.duration}s</span>}
              </div>
            </div>
          ) : null}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button onClick={onMute} className={cn("p-1.5 rounded-md transition-colors", track.muted ? "text-amber-400 bg-amber-400/10" : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800")}>
            {track.muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
          </button>
          <button onClick={onLoop} className={cn("p-1.5 rounded-md transition-colors", track.looping ? "text-cyan-400 bg-cyan-400/10" : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800")}>
            {track.looping ? <Repeat1 className="w-3 h-3" /> : <Repeat className="w-3 h-3" />}
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-1.5 rounded-md text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            <SlidersHorizontal className="w-3 h-3" />
          </button>
          <button onClick={onDownload} disabled={!track.url} className="p-1.5 rounded-md text-zinc-600 hover:text-zinc-300 disabled:opacity-30 hover:bg-zinc-800 transition-colors">
            <Download className="w-3 h-3" />
          </button>
          <button onClick={onRemove} className="p-1.5 rounded-md text-zinc-600 hover:text-red-400 hover:bg-zinc-800 transition-colors">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Expanded: volume + prompt */}
      {expanded && (
        <div className="px-4 pb-3 pt-1 border-t border-zinc-800/40 space-y-2">
          <div className="flex items-center gap-3">
            <Volume2 className="w-3 h-3 text-zinc-600 shrink-0" />
            <input
              type="range" min="0" max="1" step="0.05" value={track.volume}
              onChange={(e) => onVolumeChange(Number(e.target.value))}
              className="flex-1 h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-violet-500"
            />
            <span className="text-[10px] text-zinc-600 w-6 text-right">{Math.round(track.volume * 100)}</span>
          </div>
          {track.prompt && (
            <p className="text-[10px] text-zinc-600 italic bg-zinc-900/60 rounded-lg px-2 py-1.5 leading-relaxed">
              &ldquo;{track.prompt}&rdquo;
            </p>
          )}
          {track.meta.instruments?.length ? (
            <div className="flex flex-wrap gap-1">
              {track.meta.instruments.map((i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">{i}</span>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}


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
  RotateCcw,
  Trash2,
  Plus,
  AudioWaveform,
  MessageSquare,
  ChevronDown,
  X,
  SlidersHorizontal,
  Zap,
  ExternalLink,
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
  blob?: Blob;
  prompt: string;
  duration: number;
  generating: boolean;
  error: string | null;
  muted: boolean;
  volume: number;
  color: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const TRACK_COLORS = [
  "from-violet-500 to-purple-600",
  "from-emerald-500 to-teal-600",
  "from-pink-500 to-rose-600",
  "from-amber-500 to-orange-600",
  "from-cyan-500 to-blue-600",
  "from-fuchsia-500 to-violet-600",
];

const GENRES = ["Electronic", "Ambient", "Cinematic", "Lo-Fi", "Jazz", "Rock", "Classical", "Hip-Hop", "Pop", "Folk"];
const MOODS = ["Uplifting", "Melancholic", "Tense", "Calm", "Energetic", "Mysterious", "Romantic", "Dark"];
const DURATIONS = [5, 10, 15, 20, 30];

/* ─────────────────────────────────────────────────────────────────────────────
   Main Component
───────────────────────────────────────────────────────────────────────────── */

export function AudioStudioEmbed() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [prompt, setPrompt] = useState("");
  const [genre, setGenre] = useState("Electronic");
  const [mood, setMood] = useState("Uplifting");
  const [duration, setDuration] = useState(10);
  const [generating, setGenerating] = useState(false);
  const [tab, setTab] = useState<"compose" | "speech" | "record">("compose");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  // Speech tab
  const [speechText, setSpeechText] = useState("");
  const [speechVoice, setSpeechVoice] = useState("alloy");
  const [speechGenerating, setSpeechGenerating] = useState(false);

  // Recording tab
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlobs, setAudioBlobs] = useState<{ id: string; blob: Blob; name: string; url: string }[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunks = useRef<BlobPart[]>([]);
  const recordingTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Playback
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const [playingId, setPlayingId] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  /* ── Generate Music ── */
  const generateMusic = useCallback(async () => {
    if (!prompt.trim() && !genre) return;
    setGenerating(true);

    const trackId = `track-${Date.now()}`;
    const newTrack: Track = {
      id: trackId,
      name: prompt.trim() || `${genre} ${mood}`,
      type: "music",
      url: null,
      prompt: prompt.trim(),
      duration,
      generating: true,
      error: null,
      muted: false,
      volume: 1,
      color: TRACK_COLORS[tracks.length % TRACK_COLORS.length],
    };
    setTracks((prev) => [...prev, newTrack]);

    try {
      const res = await fetch("/api/firefly/generate-soundtrack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), genre, mood, duration }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");

      setTracks((prev) =>
        prev.map((t) =>
          t.id === trackId
            ? { ...t, url: data.audio?.url ?? null, generating: false, name: prompt.trim() || `${genre} — ${mood}` }
            : t
        )
      );
    } catch (err) {
      setTracks((prev) =>
        prev.map((t) =>
          t.id === trackId
            ? { ...t, generating: false, error: (err as Error).message }
            : t
        )
      );
    } finally {
      setGenerating(false);
      setPrompt("");
    }
  }, [prompt, genre, mood, duration, tracks.length]);

  /* ── Generate Speech ── */
  const generateSpeech = useCallback(async () => {
    if (!speechText.trim()) return;
    setSpeechGenerating(true);
    const trackId = `speech-${Date.now()}`;
    const newTrack: Track = {
      id: trackId,
      name: speechText.slice(0, 40) + (speechText.length > 40 ? "…" : ""),
      type: "speech",
      url: null,
      prompt: speechText,
      duration: 0,
      generating: true,
      error: null,
      muted: false,
      volume: 1,
      color: TRACK_COLORS[(tracks.length + 1) % TRACK_COLORS.length],
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
          t.id === trackId ? { ...t, url: data.url ?? data.audioUrl ?? null, generating: false } : t
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
        setAudioBlobs((prev) => [...prev, { id: `rec-${Date.now()}`, blob, name: `Recording ${prev.length + 1}`, url }]);
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
  const togglePlay = useCallback((trackId: string, url: string) => {
    if (playingId === trackId) {
      audioRefs.current.get(trackId)?.pause();
      setPlayingId(null);
    } else {
      if (playingId) {
        audioRefs.current.get(playingId)?.pause();
      }
      let audio = audioRefs.current.get(trackId);
      if (!audio) {
        audio = new Audio(url);
        audio.onended = () => setPlayingId(null);
        audioRefs.current.set(trackId, audio);
      }
      audio.play();
      setPlayingId(trackId);
    }
  }, [playingId]);

  const downloadTrack = useCallback((url: string, name: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = name.replace(/[^a-z0-9]/gi, "_") + ".wav";
    a.click();
  }, []);

  const removeTrack = useCallback((id: string) => {
    audioRefs.current.get(id)?.pause();
    audioRefs.current.delete(id);
    if (playingId === id) setPlayingId(null);
    setTracks((prev) => prev.filter((t) => t.id !== id));
  }, [playingId]);

  /* ── AI Chat ── */
  const sendChat = useCallback(async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg: ChatMessage = { role: "user", content: chatInput.trim() };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setChatLoading(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Audio Studio Assistant",
          prompt: `You are an expert music producer and audio engineer embedded in Ottomate's AI Audio Studio. Help the user with music production, sound design, and audio generation.\n\nUser: ${chatInput.trim()}`,
          model: "claude-sonnet-4-6",
          metadata: { source: "audio-studio-chat" },
        }),
      });
      const task = await res.json();
      // Poll for quick response
      let reply = "I'll help you with that! Your task is running — check the Tasks page for results.";
      if (task?.id) {
        await new Promise(r => setTimeout(r, 3000));
        const poll = await fetch(`/api/tasks/${task.id}`);
        const taskData = await poll.json();
        const lastStep = taskData?.steps?.filter((s: {type: string}) => s.type === "assistant").slice(-1)[0];
        if (lastStep?.content) reply = lastStep.content;
      }
      setChatMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setChatMessages((prev) => [...prev, { role: "assistant", content: "Something went wrong. Try again or check the Tasks page." }]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading]);

  /* ── Quick AI prompt ── */
  const aiAutoFill = useCallback(async () => {
    const suggestions = [
      `Driving ${genre.toLowerCase()} beat with heavy bass and synth arpeggios`,
      `Soft ${mood.toLowerCase()} ${genre.toLowerCase()} with layered pads`,
      `${mood} ${genre} underscore for a cinematic trailer`,
      `Hypnotic ${genre.toLowerCase()} loop with evolving textures and ${mood.toLowerCase()} atmosphere`,
    ];
    setPrompt(suggestions[Math.floor(Math.random() * suggestions.length)]);
  }, [genre, mood]);

  /* ── Render ── */
  return (
    <div className="h-full flex flex-col bg-[#0d0d14] text-zinc-100 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800/60 bg-[#11111a] shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center">
            <AudioWaveform className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold bg-gradient-to-r from-violet-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Ottomate Audio Studio
            </h1>
            <p className="text-[10px] text-zinc-500">AI-powered music & voice production</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setChatOpen((o) => !o)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              chatOpen ? "bg-violet-600 text-white" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
            )}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            AI Assistant
          </button>
          <a
            href="/computer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
          >
            <Zap className="w-3.5 h-3.5 text-violet-400" />
            New Task
          </a>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Main panel ── */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Tabs */}
          <div className="flex items-center gap-1 px-5 pt-4 pb-0 shrink-0">
            {(["compose", "speech", "record"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "px-4 py-2 rounded-t-lg text-xs font-medium capitalize transition-colors border-b-2",
                  tab === t
                    ? "bg-zinc-800/80 text-white border-violet-500"
                    : "text-zinc-500 hover:text-zinc-300 border-transparent hover:bg-zinc-800/40"
                )}
              >
                {t === "compose" && <Music className="inline w-3 h-3 mr-1.5" />}
                {t === "speech" && <Mic className="inline w-3 h-3 mr-1.5" />}
                {t === "record" && <AudioWaveform className="inline w-3 h-3 mr-1.5" />}
                {t}
              </button>
            ))}
          </div>

          {/* Tab panels */}
          <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-b-xl rounded-tr-xl mx-4 p-5 shrink-0">
            {/* COMPOSE */}
            {tab === "compose" && (
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 relative">
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generateMusic(); }}
                      placeholder="Describe your track… or pick genre + mood below and hit Generate"
                      rows={2}
                      className="w-full bg-zinc-800/60 border border-zinc-700/60 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 resize-none focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                  </div>
                  <button
                    onClick={aiAutoFill}
                    title="AI suggest a prompt"
                    className="mt-1 p-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-violet-400 hover:text-violet-300 transition-colors"
                  >
                    <Wand2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5 block">Genre</label>
                    <div className="relative">
                      <select
                        value={genre}
                        onChange={(e) => setGenre(e.target.value)}
                        className="w-full bg-zinc-800/60 border border-zinc-700/60 rounded-lg px-3 py-2 text-sm text-zinc-200 appearance-none focus:outline-none focus:ring-1 focus:ring-violet-500"
                      >
                        {GENRES.map((g) => <option key={g}>{g}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2 top-2.5 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5 block">Mood</label>
                    <div className="relative">
                      <select
                        value={mood}
                        onChange={(e) => setMood(e.target.value)}
                        className="w-full bg-zinc-800/60 border border-zinc-700/60 rounded-lg px-3 py-2 text-sm text-zinc-200 appearance-none focus:outline-none focus:ring-1 focus:ring-violet-500"
                      >
                        {MOODS.map((m) => <option key={m}>{m}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2 top-2.5 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5 block">Duration (sec)</label>
                    <div className="relative">
                      <select
                        value={duration}
                        onChange={(e) => setDuration(Number(e.target.value))}
                        className="w-full bg-zinc-800/60 border border-zinc-700/60 rounded-lg px-3 py-2 text-sm text-zinc-200 appearance-none focus:outline-none focus:ring-1 focus:ring-violet-500"
                      >
                        {DURATIONS.map((d) => <option key={d} value={d}>{d}s</option>)}
                      </select>
                      <ChevronDown className="absolute right-2 top-2.5 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
                    </div>
                  </div>
                </div>

                <button
                  onClick={generateMusic}
                  disabled={generating}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 disabled:opacity-50 text-white text-sm font-medium transition-all"
                >
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {generating ? "Generating track…" : "Generate Music"}
                </button>
              </div>
            )}

            {/* SPEECH */}
            {tab === "speech" && (
              <div className="space-y-4">
                <textarea
                  value={speechText}
                  onChange={(e) => setSpeechText(e.target.value)}
                  placeholder="Type the text to convert to speech…"
                  rows={3}
                  className="w-full bg-zinc-800/60 border border-zinc-700/60 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 resize-none focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
                <div className="flex items-center gap-3">
                  <div className="flex-1 relative">
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5 block">Voice</label>
                    <select
                      value={speechVoice}
                      onChange={(e) => setSpeechVoice(e.target.value)}
                      className="w-full bg-zinc-800/60 border border-zinc-700/60 rounded-lg px-3 py-2 text-sm text-zinc-200 appearance-none focus:outline-none focus:ring-1 focus:ring-violet-500"
                    >
                      {["alloy", "echo", "fable", "onyx", "nova", "shimmer", "aria", "roger", "sarah"].map((v) => (
                        <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={generateSpeech}
                    disabled={speechGenerating || !speechText.trim()}
                    className="mt-5 flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 disabled:opacity-50 text-white text-sm font-medium transition-all"
                  >
                    {speechGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
                    {speechGenerating ? "Synthesising…" : "Generate Voice"}
                  </button>
                </div>
              </div>
            )}

            {/* RECORD */}
            {tab === "record" && (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "flex-1 h-12 rounded-xl border flex items-center justify-center gap-2 text-sm transition-colors",
                    recording ? "border-red-500/60 bg-red-500/10 text-red-400" : "border-zinc-700/60 bg-zinc-800/60 text-zinc-500"
                  )}>
                    {recording ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        Recording… {Math.floor(recordingTime / 60).toString().padStart(2, "0")}:{(recordingTime % 60).toString().padStart(2, "0")}
                      </>
                    ) : (
                      <>
                        <AudioWaveform className="w-4 h-4" />
                        Ready to record
                      </>
                    )}
                  </div>
                  {!recording ? (
                    <button
                      onClick={startRecording}
                      className="flex items-center gap-2 px-5 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors"
                    >
                      <Mic className="w-4 h-4" />
                      Record
                    </button>
                  ) : (
                    <button
                      onClick={stopRecording}
                      className="flex items-center gap-2 px-5 py-3 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-medium transition-colors"
                    >
                      <Square className="w-4 h-4" />
                      Stop
                    </button>
                  )}
                </div>
                {audioBlobs.length > 0 && (
                  <div className="space-y-2">
                    {audioBlobs.map((r) => (
                      <div key={r.id} className="flex items-center gap-3 bg-zinc-800/50 rounded-lg px-3 py-2">
                        <button
                          onClick={() => togglePlay(r.id, r.url)}
                          className="w-7 h-7 flex items-center justify-center rounded-full bg-violet-600 hover:bg-violet-500 text-white transition-colors"
                        >
                          {playingId === r.id ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        </button>
                        <span className="flex-1 text-sm text-zinc-300">{r.name}</span>
                        <a
                          href={r.url}
                          download={`${r.name}.webm`}
                          className="p-1.5 text-zinc-500 hover:text-zinc-300"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                        <button
                          onClick={() => setAudioBlobs((prev) => prev.filter((b) => b.id !== r.id))}
                          className="p-1.5 text-zinc-500 hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Track List ── */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
            {tracks.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-3">
                <Music className="w-10 h-10" />
                <p className="text-sm">No tracks yet — generate your first piece above</p>
              </div>
            ) : (
              tracks.map((track) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  isPlaying={playingId === track.id}
                  onPlay={() => track.url && togglePlay(track.id, track.url)}
                  onDownload={() => track.url && downloadTrack(track.url, track.name)}
                  onRemove={() => removeTrack(track.id)}
                  onMute={() => setTracks((prev) => prev.map((t) => t.id === track.id ? { ...t, muted: !t.muted } : t))}
                />
              ))
            )}
          </div>
        </div>

        {/* ── AI Chat Sidebar ── */}
        {chatOpen && (
          <div className="w-80 border-l border-zinc-800/60 flex flex-col bg-[#0f0f18]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/60 shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-400" />
                <span className="text-sm font-medium">AI Producer</span>
              </div>
              <button onClick={() => setChatOpen(false)} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {chatMessages.length === 0 && (
                <div className="text-xs text-zinc-600 text-center mt-4">
                  Ask me anything about music production, sound design, or let me suggest track ideas.
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    "rounded-xl px-3 py-2 text-xs leading-relaxed",
                    msg.role === "user"
                      ? "bg-violet-600/20 text-zinc-200 ml-4"
                      : "bg-zinc-800/60 text-zinc-300 mr-4"
                  )}
                >
                  {msg.content}
                </div>
              ))}
              {chatLoading && (
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Thinking…
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="p-3 border-t border-zinc-800/60 shrink-0">
              <div className="flex items-end gap-2">
                <textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                  placeholder="Ask the AI producer…"
                  rows={2}
                  className="flex-1 bg-zinc-800/60 border border-zinc-700/40 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder-zinc-600 resize-none focus:outline-none focus:ring-1 focus:ring-violet-500"
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
   TrackRow sub-component
───────────────────────────────────────────────────────────────────────────── */

function TrackRow({
  track,
  isPlaying,
  onPlay,
  onDownload,
  onRemove,
  onMute,
}: {
  track: Track;
  isPlaying: boolean;
  onPlay: () => void;
  onDownload: () => void;
  onRemove: () => void;
  onMute: () => void;
}) {
  return (
    <div className="flex items-center gap-3 bg-zinc-900/60 border border-zinc-800/40 rounded-xl px-4 py-3 group hover:border-zinc-700/60 transition-colors">
      {/* Color indicator */}
      <div className={cn("w-1 h-10 rounded-full bg-gradient-to-b shrink-0", track.color)} />

      {/* Play button */}
      <button
        onClick={onPlay}
        disabled={!track.url || track.generating}
        className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-800 hover:bg-violet-600 disabled:opacity-30 text-zinc-300 hover:text-white transition-colors shrink-0"
      >
        {track.generating ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : isPlaying ? (
          <Pause className="w-3.5 h-3.5" />
        ) : (
          <Play className="w-3.5 h-3.5" />
        )}
      </button>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-200 truncate">{track.name}</span>
          <span className={cn(
            "text-[10px] px-1.5 py-0.5 rounded-full shrink-0",
            track.type === "music" ? "bg-violet-500/20 text-violet-400" :
            track.type === "speech" ? "bg-emerald-500/20 text-emerald-400" :
            "bg-red-500/20 text-red-400"
          )}>
            {track.type}
          </span>
        </div>
        {track.generating && (
          <p className="text-xs text-zinc-500 mt-0.5">Generating with MusicGen…</p>
        )}
        {track.error && (
          <p className="text-xs text-red-400 mt-0.5">{track.error}</p>
        )}
        {track.url && !track.generating && (
          <p className="text-xs text-zinc-600 mt-0.5">
            {track.duration > 0 ? `${track.duration}s` : ""} · {track.type === "music" ? "wav" : "mp3"}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onMute}
          className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
          title={track.muted ? "Unmute" : "Mute"}
        >
          {track.muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={onDownload}
          disabled={!track.url}
          className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 transition-colors"
          title="Download"
        >
          <Download className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onRemove}
          className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-red-400 transition-colors"
          title="Remove track"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}


"use client";

import { useState, useRef, useEffect, useMemo, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUp, Shuffle, Loader2, Monitor, Paperclip, X, Command, Mic, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { GalleryItem, SlashCommand } from "@/lib/types";

// ─── Slash Commands (Otto-inspired) ───────────────────────────────────────────
// Power-user shortcuts for common modalities

const SLASH_COMMANDS: SlashCommand[] = [
  {
    command: "/image",
    label: "Generate Image",
    description: "Create an image with DALL-E",
    icon: "🎨",
    expand: (args) => `Generate an image: ${args}`,
  },
  {
    command: "/research",
    label: "Deep Research",
    description: "Perform deep web research",
    icon: "🔬",
    expand: (args) => `Perform comprehensive deep research on: ${args}. Search multiple sources, synthesize findings, and create a detailed report with citations.`,
  },
  {
    command: "/code",
    label: "Write Code",
    description: "Generate production code",
    icon: "💻",
    expand: (args) => `Write production-quality code: ${args}. Include proper error handling, comments, and tests.`,
  },
  {
    command: "/summarize",
    label: "Summarize",
    description: "Summarize a URL or topic",
    icon: "📝",
    expand: (args) => args.startsWith("http") ? `Fetch and create a comprehensive summary of: ${args}` : `Create a comprehensive summary of: ${args}`,
  },
  {
    command: "/email",
    label: "Draft Email",
    description: "Draft a professional email",
    icon: "📧",
    expand: (args) => `Draft a professional email: ${args}`,
  },
  {
    command: "/analyze",
    label: "Analyze Data",
    description: "Analyze data or a topic",
    icon: "📊",
    expand: (args) => `Perform a thorough analysis: ${args}. Create visualizations where helpful.`,
  },
  {
    command: "/video",
    label: "Generate Video",
    description: "Create a video with Dream Machine",
    icon: "🎬",
    expand: (args) => `Generate a video using the Dream Machine: ${args}`,
  },
  {
    command: "/scrape",
    label: "Scrape Website",
    description: "Extract data from a URL",
    icon: "🌐",
    expand: (args) => `Scrape and extract all relevant data from: ${args}. Structure the output as clean JSON or markdown.`,
  },
  {
    command: "/build",
    label: "Build App",
    description: "Build a complete web app or tool",
    icon: "🏗️",
    expand: (args) => `Build a complete, working web application: ${args}. Create all necessary HTML, CSS, and JavaScript files. Make it beautiful and functional.`,
  },
  {
    command: "/compare",
    label: "Compare",
    description: "Compare products, tools, or topics",
    icon: "⚖️",
    expand: (args) => `Create a detailed comparison of: ${args}. Include a comparison table, pros/cons, and a recommendation.`,
  },
  {
    command: "/debug",
    label: "Debug Code",
    description: "Debug and fix code issues",
    icon: "🐛",
    expand: (args) => `Debug and fix the following code issue: ${args}. Explain the root cause and provide the corrected code.`,
  },
  {
    command: "/plan",
    label: "Create Plan",
    description: "Create a detailed project plan",
    icon: "📋",
    expand: (args) => `Create a comprehensive, actionable plan for: ${args}. Include timeline, milestones, dependencies, and deliverables.`,
  },
];

const GALLERY_EXAMPLES = [
  {
    label: "Build a business",
    icon: "🏢",
    prompts: [
      "Research the competitive landscape for a DTC protein powder brand and create a go-to-market strategy",
      "Build a SaaS pricing page with competitive analysis and recommended pricing tiers",
      "Create a complete business plan for a mobile dog grooming service in Austin, TX",
    ],
  },
  {
    label: "Create a prototype",
    icon: "⚡",
    prompts: [
      "Build an interactive S&P 500 bubble chart showing market cap by sector",
      "Create a beautiful real-time dashboard for monitoring API health metrics",
      "Build a rent vs buy calculator with interactive assumptions and charts",
    ],
  },
  {
    label: "Organize my life",
    icon: "📋",
    prompts: [
      "Create a personalized weekly meal plan with a shopping list and nutrition breakdown",
      "Build a personal finance tracker with budget categories and spending analysis",
      "Generate a comprehensive home buying checklist with timeline and cost estimates",
    ],
  },
  {
    label: "Help me learn",
    icon: "📚",
    prompts: [
      "Create a 30-day Python learning roadmap with daily exercises and projects",
      "Build an interactive quiz on the French Revolution with detailed explanations",
      "Explain machine learning concepts with Python code examples and visualizations",
    ],
  },
  {
    label: "Monitor the situation",
    icon: "📡",
    prompts: [
      "Research and summarize the latest developments in AI regulation globally",
      "Create a comprehensive analysis of current macroeconomic indicators",
      "Build a dashboard tracking key US economic metrics with historical context",
    ],
  },
];

const ALL_PROMPTS = GALLERY_EXAMPLES.flatMap((g) => g.prompts);

export default function ComputerPage() {
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <ComputerPageInner />
    </Suspense>
  );
}

function ComputerPageInner() {
  const [prompt, setPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shuffleIndex, setShuffleIndex] = useState(0);
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashHighlight, setSlashHighlight] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isListening, setIsListening] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Slash command filtering
  const filteredSlashCommands = useMemo(() => {
    if (!prompt.startsWith("/")) return [];
    const typed = prompt.split(" ")[0].toLowerCase();
    return SLASH_COMMANDS.filter(c => c.command.startsWith(typed));
  }, [prompt]);

  // Show/hide slash menu
  useEffect(() => {
    setShowSlashMenu(prompt.startsWith("/") && !prompt.includes(" ") && filteredSlashCommands.length > 0);
    setSlashHighlight(0);
  }, [prompt, filteredSlashCommands.length]);

  /** Expand slash command before submitting */
  const expandSlashCommand = useCallback((text: string): string => {
    const trimmed = text.trim();
    for (const cmd of SLASH_COMMANDS) {
      if (trimmed.startsWith(cmd.command + " ") || trimmed === cmd.command) {
        const args = trimmed.slice(cmd.command.length).trim();
        if (args) return cmd.expand(args);
        return trimmed; // no args yet, send as-is
      }
    }
    return trimmed;
  }, []);

  /** Select a slash command from autocomplete */
  const selectSlashCommand = useCallback((cmd: SlashCommand) => {
    setPrompt(cmd.command + " ");
    setShowSlashMenu(false);
    textareaRef.current?.focus();
  }, []);

  // Pre-fill prompt from ?q= parameter (e.g. from gallery "Build your own")
  useEffect(() => {
    const q = searchParams.get("q");
    if (q) {
      setPrompt(q);
    }
  }, [searchParams]);

  // Fetch gallery items for "From the gallery" category
  useEffect(() => {
    fetch("/api/gallery")
      .then((r) => r.json())
      .then((items: GalleryItem[]) => {
        setGalleryItems(items);
      })
      .catch((err) => console.error("Failed to load gallery:", err));
  }, []);

  // "From the gallery" is the FIRST category (index 0), matching Perplexity
  const GALLERY_CATEGORY_INDEX = 0;
  const ALL_CATEGORIES = [
    { label: "From the gallery", icon: "🖼️", prompts: galleryItems.map((i) => i.prompt).slice(0, 6) },
    ...GALLERY_EXAMPLES,
  ];

  const currentExamples =
    activeCategory !== null
      ? ALL_CATEGORIES[activeCategory].prompts
      : ALL_PROMPTS.slice(shuffleIndex * 3, shuffleIndex * 3 + 3);

  function handleShuffle() {
    setActiveCategory(null);
    // For gallery: cycle through groups of 6; for prompts: groups of 3
    const maxGalleryPages = Math.max(1, Math.ceil(galleryItems.length / 6));
    const maxPromptPages = Math.max(1, Math.floor(ALL_PROMPTS.length / 3));
    setShuffleIndex((i) => (i + 1) % Math.max(maxGalleryPages, maxPromptPages));
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!prompt.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const model = localStorage.getItem("ottomate_model") || "auto";
      const expandedPrompt = expandSlashCommand(prompt);
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: expandedPrompt, model }),
      });

      if (!res.ok) throw new Error("Failed to create task");
      const data = await res.json() as { id: string };

      // Upload attachments if any
      if (attachments.length > 0) {
        const formData = new FormData();
        formData.append("taskId", data.id);
        attachments.forEach((f) => formData.append("files", f));
        await fetch("/api/files", { method: "POST", body: formData });
      }

      router.push(`/computer/tasks/${data.id}`);
    } catch (err) {
      console.error(err);
      setIsSubmitting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Slash command menu navigation
    if (showSlashMenu) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashHighlight(i => Math.min(i + 1, filteredSlashCommands.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashHighlight(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        if (filteredSlashCommands[slashHighlight]) {
          selectSlashCommand(filteredSlashCommands[slashHighlight]);
        }
        return;
      }
      if (e.key === "Escape") {
        setShowSlashMenu(false);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
    }
  }, [prompt]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-8 py-16">
      {/* Header */}
      <div className="text-center mb-12 animate-fade-in">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pplx-accent to-blue-500 flex items-center justify-center">
            <Monitor size={20} className="text-white" />
          </div>
        </div>
        <h1 className="text-4xl font-semibold text-pplx-text mb-3">
          Ottomate works for you.
        </h1>
        <p className="text-pplx-muted text-lg max-w-md">
          Describe a goal. Ottomate reasons, researches, builds, and delivers.
        </p>
      </div>

      {/* Input area */}
      <div className="w-full max-w-2xl animate-fade-in">
        <form onSubmit={handleSubmit}>
          <div className="relative rounded-2xl border border-pplx-border bg-pplx-card focus-within:border-pplx-accent/50 transition-colors shadow-lg">
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe a task or type / for shortcuts..."
              disabled={isSubmitting}
              className="w-full bg-transparent text-pplx-text placeholder:text-pplx-muted resize-none outline-none px-5 pt-4 pb-12 text-[15px] leading-relaxed min-h-[64px] max-h-[200px]"
              rows={1}
            />

            {/* Bottom bar */}
            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) {
                      setAttachments((prev) => [...prev, ...Array.from(e.target.files!)]);
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1.5 rounded-lg text-pplx-muted hover:text-pplx-text hover:bg-white/5 transition-colors"
                  title="Attach files"
                >
                  <Paperclip size={14} />
                </button>
                {/* Voice dictation button */}
                <button
                  type="button"
                  onClick={async () => {
                    if (isListening) {
                      // Stop: if MediaRecorder is active, stop it (triggers onstop → transcribe)
                      // If SpeechRecognition is active, stop it
                      const ref = recognitionRef.current;
                      if (ref && typeof ref.stop === "function") ref.stop();
                      setIsListening(false);
                      return;
                    }

                    // ── Primary: MediaRecorder → Whisper API ──
                    try {
                      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
                        ? "audio/webm;codecs=opus"
                        : "audio/webm";
                      const recorder = new MediaRecorder(stream, { mimeType });
                      const chunks: Blob[] = [];

                      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

                      recorder.onstop = async () => {
                        stream.getTracks().forEach((t) => t.stop());
                        if (chunks.length === 0) return;
                        const blob = new Blob(chunks, { type: mimeType });
                        const form = new FormData();
                        form.append("audio", blob, "recording.webm");
                        form.append("language", "en");
                        try {
                          const res = await fetch("/api/voice/stt", { method: "POST", body: form });
                          const data = await res.json();
                          if (data.text) {
                            setPrompt((prev) => (prev ? prev + " " : "") + data.text);
                          } else if (data.fallback === "browser") {
                            // Server has no STT key — fall back to browser SpeechRecognition
                            startBrowserSpeechRecognition();
                          }
                        } catch {
                          // Network error — try browser fallback
                          startBrowserSpeechRecognition();
                        }
                      };

                      recognitionRef.current = recorder;
                      recorder.start();
                      setIsListening(true);
                    } catch {
                      // getUserMedia denied or unavailable — fall back to browser SpeechRecognition
                      startBrowserSpeechRecognition();
                    }

                    function startBrowserSpeechRecognition() {
                      try {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
                        if (!Ctor) { alert("Speech recognition is not supported in this browser."); return; }
                        const recognition = new Ctor();
                        recognition.continuous = false;
                        recognition.interimResults = true;
                        recognition.lang = "en-US";
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        recognition.onresult = (event: any) => {
                          const transcript = Array.from(event.results as ArrayLike<{ 0: { transcript: string } }>)
                            .map((r: { 0: { transcript: string } }) => r[0].transcript)
                            .join("");
                          setPrompt((prev) => (prev ? prev + " " : "") + transcript);
                        };
                        recognition.onend = () => setIsListening(false);
                        recognition.onerror = () => setIsListening(false);
                        recognitionRef.current = recognition;
                        recognition.start();
                        setIsListening(true);
                      } catch {
                        alert("Speech recognition is not available.");
                      }
                    }
                  }}
                  className={cn(
                    "p-1.5 rounded-lg transition-colors",
                    isListening
                      ? "text-red-400 bg-red-400/10 animate-pulse"
                      : "text-pplx-muted hover:text-pplx-text hover:bg-white/5"
                  )}
                  title={isListening ? "Stop listening" : "Voice input"}
                >
                  {isListening ? <MicOff size={14} /> : <Mic size={14} />}
                </button>
                {attachments.length > 0 && (
                  <span className="text-[10px] text-pplx-accent">
                    {attachments.length} file{attachments.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <button
                type="submit"
                disabled={!prompt.trim() || isSubmitting}
                className={cn(
                  "flex items-center gap-2 px-4 py-1.5 rounded-xl text-sm font-medium transition-all",
                  prompt.trim() && !isSubmitting
                    ? "bg-pplx-accent hover:bg-pplx-accent-hover text-white"
                    : "bg-pplx-border text-pplx-muted cursor-not-allowed"
                )}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <ArrowUp size={14} />
                    Run
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

        {/* Slash command autocomplete */}
        {showSlashMenu && (
          <div className="absolute z-50 mt-1 w-full max-w-2xl rounded-xl border border-pplx-border bg-pplx-card shadow-xl overflow-hidden animate-fade-in">
            <div className="px-3 py-2 border-b border-pplx-border flex items-center gap-2">
              <Command size={12} className="text-pplx-accent" />
              <span className="text-[10px] text-pplx-muted font-medium uppercase tracking-wider">Slash Commands</span>
            </div>
            {filteredSlashCommands.map((cmd, i) => (
              <button
                key={cmd.command}
                onClick={() => selectSlashCommand(cmd)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                  i === slashHighlight ? "bg-pplx-accent/10 text-pplx-text" : "text-pplx-muted hover:bg-white/5 hover:text-pplx-text"
                )}
              >
                <span className="text-lg">{cmd.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{cmd.command}</div>
                  <div className="text-xs opacity-60">{cmd.description}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Attachment chips */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2 px-1">
            {attachments.map((f, i) => (
              <div
                key={`${f.name}-${i}`}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-pplx-card border border-pplx-border text-xs text-pplx-text"
              >
                <Paperclip size={10} className="text-pplx-muted" />
                <span className="truncate max-w-[140px]">{f.name}</span>
                <button
                  onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                  className="p-0.5 rounded text-pplx-muted hover:text-red-400 transition-colors"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Category chips */}
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          {ALL_CATEGORIES.map((cat, i) => (
            <button
              key={cat.label}
              onClick={() => setActiveCategory(activeCategory === i ? null : i)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                activeCategory === i
                  ? "bg-pplx-accent/15 border-pplx-accent/50 text-pplx-accent"
                  : "bg-pplx-card border-pplx-border text-pplx-muted hover:text-pplx-text hover:border-pplx-muted/50"
              )}
            >
              <span>{cat.icon}</span>
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Example prompts / Gallery items */}
      <div className="w-full max-w-2xl mt-8 animate-fade-in">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-pplx-muted font-medium">
            {activeCategory !== null ? ALL_CATEGORIES[activeCategory].label : "From the gallery"}
          </span>
          {(activeCategory === null || activeCategory === GALLERY_CATEGORY_INDEX) ? (
            <div className="flex items-center gap-3">
              <Link
                href="/computer/gallery"
                className="text-xs text-pplx-accent hover:underline"
              >
                View all
              </Link>
              <button
                onClick={handleShuffle}
                className="flex items-center gap-1.5 text-xs text-pplx-muted hover:text-pplx-text transition-colors"
              >
                <Shuffle size={12} />
                Shuffle
              </button>
            </div>
          ) : null}
        </div>

        {/* Gallery visual cards (when "From the gallery" or default) */}
        {(activeCategory === null || activeCategory === GALLERY_CATEGORY_INDEX) && galleryItems.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {(() => {
              const start = (shuffleIndex * 6) % galleryItems.length;
              const items = galleryItems.slice(start, start + 6).length >= 6
                ? galleryItems.slice(start, start + 6)
                : [...galleryItems.slice(start), ...galleryItems.slice(0, 6 - (galleryItems.length - start))].slice(0, 6);
              return items;
            })().map((item, i) => (
              <button
                key={`gallery-${item.id}-${i}`}
                onClick={() => setPrompt(item.prompt)}
                className="text-left rounded-xl border border-pplx-border bg-pplx-card hover:border-pplx-muted/50 hover:bg-pplx-card/80 transition-all overflow-hidden group animate-fade-in"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                {item.preview_url ? (
                  <div className="w-full h-24 bg-pplx-bg overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.preview_url || undefined}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    />
                  </div>
                ) : (
                  <div className="w-full h-24 bg-gradient-to-br from-pplx-accent/10 to-blue-500/10 flex items-center justify-center">
                    <span className="text-2xl opacity-30">🖼️</span>
                  </div>
                )}
                <div className="px-3 py-2">
                  <p className="text-xs text-pplx-text font-medium truncate">{item.title}</p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          /* Text prompt buttons (for non-gallery categories) */
          <div className="grid gap-2">
            {currentExamples.slice(0, 4).map((ex, i) => (
              <button
                key={`${shuffleIndex}-${i}`}
                onClick={() => setPrompt(ex)}
                className="text-left px-4 py-3 rounded-xl border border-pplx-border bg-pplx-card hover:border-pplx-muted/50 hover:bg-pplx-card/80 transition-all text-sm text-pplx-muted hover:text-pplx-text group animate-fade-in"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <span className="line-clamp-2">{ex}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <p className="mt-12 text-xs text-pplx-muted/60 text-center">
        Ottomate · Multi-Agent AI · Powered by Claude, GPT-4o &amp; Gemini
      </p>
    </div>
  );
}

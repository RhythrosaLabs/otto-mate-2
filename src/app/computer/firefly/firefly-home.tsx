"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sparkles, Image as ImageIcon, Video, Music, Mic2, Wand2,
  ZoomIn, Eraser, ArrowRight, Paintbrush,
  Film, Palette, Grid,
  Expand, Globe, Flame,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Feature Cards ──────────────────────────────────────────────── */

const FEATURES = [
  {
    id: "generate-image",
    title: "Generate Image",
    description: "Bring ideas to life with text-to-image AI. Higher quality, more detail, and improved lighting.",
    icon: ImageIcon,
    href: "/computer/firefly/generate/image",
    gradient: "from-violet-600/20 to-blue-600/20",
    iconColor: "text-violet-400",
    tag: "Popular",
  },
  {
    id: "edit-image",
    title: "Edit Image",
    description: "Remove items, expand backgrounds, upscale imagery, and more with full control.",
    icon: Wand2,
    href: "/computer/firefly/edit",
    gradient: "from-pink-600/20 to-rose-600/20",
    iconColor: "text-pink-400",
    tag: "New",
  },
  {
    id: "generate-video",
    title: "Generate Video",
    description: "Generate video clips from text or images. Choose resolution and aspect ratio.",
    icon: Video,
    href: "/computer/firefly/generate/video",
    gradient: "from-cyan-600/20 to-teal-600/20",
    iconColor: "text-cyan-400",
    tag: "Premium",
  },
  {
    id: "generate-soundtrack",
    title: "Generate Soundtrack",
    description: "Generate studio-quality music for your videos, licensed to use anywhere.",
    icon: Music,
    href: "/computer/firefly/generate/soundtrack",
    gradient: "from-amber-600/20 to-orange-600/20",
    iconColor: "text-amber-400",
  },
  {
    id: "generate-speech",
    title: "Generate Speech",
    description: "Generate professional-sounding voiceovers and narration for your content.",
    icon: Mic2,
    href: "/computer/firefly/generate/speech",
    gradient: "from-emerald-600/20 to-green-600/20",
    iconColor: "text-emerald-400",
  },
  {
    id: "gallery",
    title: "Gallery",
    description: "Browse community creations, get inspired, and remix content.",
    icon: Grid,
    href: "/computer/firefly/gallery",
    gradient: "from-purple-600/20 to-indigo-600/20",
    iconColor: "text-purple-400",
  },
];

const QUICK_ACTIONS = [
  { label: "Remove Background", icon: Eraser, action: "remove-bg" },
  { label: "Replace Background", icon: Palette, action: "replace-background" },
  { label: "Upscale Image", icon: ZoomIn, action: "upscale" },
  { label: "Expand Image", icon: Expand, action: "expand" },
  { label: "Generative Fill", icon: Paintbrush, action: "generative-fill" },
  { label: "Prompt Edit", icon: Wand2, action: "prompt-edit" },
];

const TABS = [
  { id: "featured", label: "Featured" },
  { id: "image", label: "Image" },
  { id: "video", label: "Video" },
  { id: "audio", label: "Audio" },
] as const;

/* ─── Prompt Bar ────────────────────────────────────────────────── */

function PromptBar() {
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<"image" | "video">("image");
  const router = useRouter();

  function handleGenerate() {
    if (!prompt.trim()) return;
    const encoded = encodeURIComponent(prompt);
    if (mode === "video") {
      router.push(`/computer/firefly/generate/video?prompt=${encoded}`);
    } else {
      router.push(`/computer/firefly/generate/image?prompt=${encoded}`);
    }
  }

  return (
    <div className="relative max-w-3xl mx-auto">
      <div className="flex items-center bg-zinc-900/80 border border-zinc-700/50 rounded-2xl px-4 py-3 backdrop-blur-sm shadow-2xl shadow-black/20">
        <div className="flex items-center gap-1 mr-3 shrink-0">
          <button
            onClick={() => setMode("image")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
              mode === "image"
                ? "bg-violet-600/20 text-violet-300 border border-violet-500/30"
                : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            <ImageIcon className="w-3.5 h-3.5 inline mr-1" />
            Image
          </button>
          <button
            onClick={() => setMode("video")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
              mode === "video"
                ? "bg-cyan-600/20 text-cyan-300 border border-cyan-500/30"
                : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            <Video className="w-3.5 h-3.5 inline mr-1" />
            Video
          </button>
        </div>
        <div className="flex-1 relative">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
            placeholder="Describe what you want to generate..."
            className="w-full bg-transparent text-white placeholder:text-zinc-500 text-sm outline-none"
          />
        </div>
        <button
          onClick={handleGenerate}
          disabled={!prompt.trim()}
          className={cn(
            "ml-3 px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5 shrink-0",
            prompt.trim()
              ? "bg-gradient-to-r from-violet-600 to-blue-600 text-white hover:from-violet-500 hover:to-blue-500 shadow-lg shadow-violet-500/20"
              : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
          )}
        >
          <Sparkles className="w-4 h-4" />
          Generate
        </button>
      </div>
    </div>
  );
}

/* ─── Main Home Component ────────────────────────────────────────── */

export function FireflyHome() {
  const [activeTab, setActiveTab] = useState<typeof TABS[number]["id"]>("featured");
  const router = useRouter();

  const filteredFeatures = activeTab === "featured"
    ? FEATURES
    : FEATURES.filter((f) => {
        if (activeTab === "image") return ["generate-image", "edit-image", "gallery"].includes(f.id);
        if (activeTab === "video") return f.id === "generate-video";
        if (activeTab === "audio") return ["generate-soundtrack", "generate-speech"].includes(f.id);
        return true;
      });

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#0a0a0a]/90 backdrop-blur-xl border-b border-zinc-800/50">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-orange-500 flex items-center justify-center">
              <Flame className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white tracking-tight">Firefly</h1>
              <p className="text-[10px] text-zinc-500">AI Creative Studio</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/computer/firefly/gallery"
              className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <Globe className="w-3.5 h-3.5 inline mr-1" />
              Gallery
            </Link>
            <Link
              href="/computer/firefly/generate/image"
              className="px-3 py-1.5 rounded-lg bg-violet-600/10 text-violet-400 text-xs font-medium hover:bg-violet-600/20 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 inline mr-1" />
              Create
            </Link>
          </div>
        </div>
      </div>

      {/* Hero Section */}
      <div className="px-6 pt-16 pb-12 text-center">
        <div className="max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-600/10 border border-violet-500/20 text-violet-400 text-xs font-medium mb-6">
            <Sparkles className="w-3 h-3" />
            Powered by AI
          </div>
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4 tracking-tight">
            Welcome to <span className="bg-gradient-to-r from-violet-400 via-pink-400 to-orange-400 bg-clip-text text-transparent">Firefly</span>
          </h2>
          <p className="text-zinc-400 text-lg mb-10 leading-relaxed">
            Your AI-powered creative space. Generate images, video, audio, and designs using top AI models.
          </p>

          {/* Prompt Bar */}
          <PromptBar />
        </div>
      </div>

      {/* New Ways to Create */}
      <div className="px-6 pb-8">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-12">
            <button
              onClick={() => router.push("/computer/firefly/generate/image")}
              className="group flex items-center gap-4 p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/50 hover:border-violet-500/30 hover:bg-violet-900/10 transition-all text-left"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-600/20 to-blue-600/20 flex items-center justify-center shrink-0">
                <Sparkles className="w-6 h-6 text-violet-400" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white group-hover:text-violet-300 transition-colors">Generate Media</div>
                <div className="text-xs text-zinc-500">Generate image and video on an infinite canvas.</div>
              </div>
            </button>
            <button
              onClick={() => router.push("/computer/firefly/edit")}
              className="group flex items-center gap-4 p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/50 hover:border-pink-500/30 hover:bg-pink-900/10 transition-all text-left"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-600/20 to-rose-600/20 flex items-center justify-center shrink-0">
                <Wand2 className="w-6 h-6 text-pink-400" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white group-hover:text-pink-300 transition-colors">Edit an Image</div>
                <div className="text-xs text-zinc-500">Use a text prompt to edit.</div>
              </div>
            </button>
            <button
              onClick={() => router.push("/computer/firefly/generate/video")}
              className="group flex items-center gap-4 p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/50 hover:border-cyan-500/30 hover:bg-cyan-900/10 transition-all text-left"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-600/20 to-teal-600/20 flex items-center justify-center shrink-0">
                <Film className="w-6 h-6 text-cyan-400" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white group-hover:text-cyan-300 transition-colors">Edit Video (Beta)</div>
                <div className="text-xs text-zinc-500">Trim, arrange, and generate.</div>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* All Features Section */}
      <div className="px-6 pb-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-white">All Features</h3>
            <div className="flex items-center gap-1 bg-zinc-900 rounded-lg p-0.5 border border-zinc-800">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "px-3.5 py-1.5 rounded-md text-xs font-medium transition-all",
                    activeTab === tab.id
                      ? "bg-zinc-700 text-white shadow-sm"
                      : "text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredFeatures.map((feature) => {
              const Icon = feature.icon;
              return (
                <Link
                  key={feature.id}
                  href={feature.href}
                  className="group relative overflow-hidden rounded-2xl border border-zinc-800/50 bg-zinc-900/30 hover:bg-zinc-900/60 transition-all hover:border-zinc-700/50 hover:shadow-xl hover:shadow-black/20"
                >
                  {/* Gradient Background */}
                  <div className={cn(
                    "absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity",
                    feature.gradient
                  )} />

                  <div className="relative p-6">
                    {feature.tag && (
                      <span className="inline-block px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 text-[10px] font-medium mb-3">
                        {feature.tag}
                      </span>
                    )}
                    <div className={cn("w-10 h-10 rounded-xl bg-zinc-800/80 flex items-center justify-center mb-4", feature.iconColor)}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <h4 className="text-base font-semibold text-white mb-2 group-hover:text-violet-300 transition-colors">
                      {feature.title}
                    </h4>
                    <p className="text-sm text-zinc-500 leading-relaxed">
                      {feature.description}
                    </p>
                    <div className="mt-4 flex items-center gap-1 text-xs text-zinc-600 group-hover:text-violet-400 transition-colors">
                      Try now <ArrowRight className="w-3 h-3" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="px-6 pb-16">
        <div className="max-w-5xl mx-auto">
          <h3 className="text-lg font-semibold text-white mb-6">Quick Actions</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.action}
                  href={`/computer/firefly/edit?action=${action.action}`}
                  className="group flex flex-col items-center gap-2 p-4 rounded-xl bg-zinc-900/30 border border-zinc-800/50 hover:bg-zinc-800/50 hover:border-zinc-700/50 transition-all"
                >
                  <div className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center group-hover:bg-zinc-700 transition-colors">
                    <Icon className="w-4 h-4 text-zinc-400 group-hover:text-white transition-colors" />
                  </div>
                  <span className="text-xs text-zinc-500 group-hover:text-zinc-300 transition-colors text-center">
                    {action.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

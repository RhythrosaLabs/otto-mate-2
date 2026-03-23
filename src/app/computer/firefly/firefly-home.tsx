"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sparkles, Image as ImageIcon, Video, Music, Mic2, Wand2,
  ZoomIn, Eraser, ArrowRight, Paintbrush,
  Film, Palette, Grid,
  Expand, Globe, Flame, Play, Heart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { loadGallery, type GalleryItem } from "./lib/gallery-store";
import { usePageVisible } from "@/components/persistent-layout";
import { NovaSmartBar } from "./components/nova-smart-bar";

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

/* ─── Showcase Data ──────────────────────────────────────────────── */

const SHOWCASE = [
  {
    id: "sc1",
    title: "Ethereal Bioluminescence",
    prompt: "A vast underground cavern with a crystal-clear lake, bioluminescent jellyfish floating above the water surface, ancient stone columns draped with glowing moss, volumetric light rays streaming through cracks in the ceiling, ultra-detailed fantasy landscape, 8K",
    type: "image" as const,
    imageUrl: "https://images.unsplash.com/photo-1551244072-5d12893278ab?w=800&h=600&fit=crop&auto=format&q=80",
    background: "linear-gradient(135deg, #0a1628 0%, #0d3b66 40%, #1a8a8a 70%, #2d1854 100%)",
    span: "md:col-span-2 md:row-span-2",
  },
  {
    id: "sc2",
    title: "Neon Dystopia",
    prompt: "A rain-soaked cyberpunk metropolis at midnight, towering holographic advertisements reflected in wet streets, a lone figure in a transparent LED-lit raincoat, dense fog diffusing neon light, cinematic wide-angle, Blade Runner aesthetic",
    type: "image" as const,
    imageUrl: "https://images.unsplash.com/photo-1514924013411-cbf25faa35bb?w=600&h=400&fit=crop&auto=format&q=80",
    background: "linear-gradient(135deg, #1a0a2e 0%, #c025d3 40%, #0066ff 70%, #2d1b69 100%)",
    span: "",
  },
  {
    id: "sc3",
    title: "Celestial Garden",
    prompt: "An impossible floating garden among nebulae, crystalline trees bearing fruit made of starlight, paths of solidified aurora borealis, a figure in flowing robes tending luminous flowers, cosmic background with swirling galaxies, digital masterpiece",
    type: "image" as const,
    imageUrl: "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=600&h=400&fit=crop&auto=format&q=80",
    background: "linear-gradient(135deg, #2d1b69 0%, #c77dbb 35%, #d4a574 55%, #0a1628 100%)",
    span: "",
  },
  {
    id: "sc4",
    title: "The Last Library",
    prompt: "An infinite library spiraling upward into golden mist, leather-bound books with glowing spines, warm candlelight from floating lanterns, a solitary reader among towering shelves, baroque meets art nouveau architecture, dramatic chiaroscuro",
    type: "image" as const,
    imageUrl: "https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=600&h=400&fit=crop&auto=format&q=80",
    background: "linear-gradient(135deg, #3d2008 0%, #b8860b 40%, #8b4513 70%, #daa520 100%)",
    span: "",
  },
  {
    id: "sc5",
    title: "Submerged Sanctuary",
    prompt: "An Art Deco underwater temple reclaimed by nature, coral growing through marble columns, tropical fish swimming through grand hallways, shafts of emerald light filtering from the ocean surface, photorealistic rendering",
    type: "image" as const,
    imageUrl: "https://images.unsplash.com/photo-1559825481-12a05cc00344?w=800&h=600&fit=crop&auto=format&q=80",
    background: "linear-gradient(135deg, #001f3f 0%, #004d40 30%, #00838f 60%, #003333 100%)",
    span: "md:col-span-2 md:row-span-2",
  },
  {
    id: "sc6",
    title: "Aurora Mechanica",
    prompt: "A massive steampunk orrery in a Victorian observatory, clockwork planets orbiting a plasma sun, brass gears and crystal lenses catching aurora borealis light through a glass dome, copper and midnight blue contrast, hyper-detailed",
    type: "image" as const,
    imageUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&h=400&fit=crop&auto=format&q=80",
    background: "linear-gradient(135deg, #5c2e00 0%, #b87333 35%, #191970 65%, #2e8b57 100%)",
    span: "",
  },
  {
    id: "sc7",
    title: "Paper Universe",
    prompt: "A miniature paper-craft landscape unfolding from an open book, tiny origami mountains with real waterfalls, paper lanterns floating above a folded village, dramatic macro photography with shallow depth of field, magical realism",
    type: "image" as const,
    imageUrl: "https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=600&h=400&fit=crop&auto=format&q=80",
    background: "linear-gradient(135deg, #2a2420 0%, #6b4f3a 35%, #544838 65%, #3d3028 100%)",
    span: "",
  },
  {
    id: "sc8",
    title: "Digital Genesis",
    prompt: "The moment of creation visualized as a supernova of data streams, fractal patterns forming into faces and landscapes, binary rain transforming into cherry blossoms, the boundary between digital and organic, cinematic concept art",
    type: "video" as const,
    imageUrl: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&h=400&fit=crop&auto=format&q=80",
    background: "linear-gradient(135deg, #000833 0%, #0050ff 35%, #8b00ff 65%, #1a0033 100%)",
    span: "",
  },
  {
    id: "sc9",
    title: "Frozen Monarch",
    prompt: "A colossal ice palace perched atop a frozen waterfall under the northern lights, crystal spires refracting aurora into prismatic arcs, a lone snow fox on the bridge of frost, extreme detail, fantasy realism, 8K cinematic",
    type: "image" as const,
    imageUrl: "https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=600&h=400&fit=crop&auto=format&q=80",
    background: "linear-gradient(135deg, #0a1929 0%, #1a4a6b 35%, #4dd0e1 65%, #0d2137 100%)",
    span: "",
  },
  {
    id: "sc10",
    title: "Volcanic Dreamscape",
    prompt: "A surreal volcanic island at golden hour, rivers of glowing magma flowing into a turquoise ocean creating billowing steam, obsidian rock formations shaped like ancient gods, dramatic aerial perspective, National Geographic quality",
    type: "image" as const,
    imageUrl: "https://images.unsplash.com/photo-1462332420958-a05d1e002413?w=600&h=400&fit=crop&auto=format&q=80",
    background: "linear-gradient(135deg, #1a0500 0%, #bf360c 35%, #ff6f00 65%, #3e2723 100%)",
    span: "",
  },
];

/* ─── Showcase Card ──────────────────────────────────────────────── */

function ShowcaseCard({
  item,
  onClick,
}: {
  item: (typeof SHOWCASE)[number];
  onClick: () => void;
}) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  return (
    <button
      onClick={onClick}
      className={cn(
        "relative rounded-2xl overflow-hidden cursor-pointer group text-left transition-transform duration-300 hover:scale-[1.02] hover:z-10 focus:outline-none focus:ring-2 focus:ring-violet-500/50",
        item.span
      )}
      style={{ background: item.background, minHeight: item.span ? undefined : 180 }}
    >
      {/* Real image */}
      {!imgError && (
        <img
          src={item.imageUrl}
          alt={item.title}
          loading="lazy"
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgError(true)}
          className={cn(
            "absolute inset-0 w-full h-full object-cover transition-opacity duration-700",
            imgLoaded ? "opacity-100" : "opacity-0"
          )}
        />
      )}
      {/* Dark overlay for legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />
      <div className="absolute bottom-0 left-0 right-0 p-4 z-10">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] px-2 py-0.5 bg-black/30 backdrop-blur-sm rounded-full text-white/90 font-medium uppercase tracking-wider">
            {item.type === "video" ? (
              <><Play className="w-2.5 h-2.5 inline mr-0.5 -mt-px" />Video</>
            ) : (
              "Image"
            )}
          </span>
        </div>
        <h4 className="text-sm font-semibold text-white mb-1 drop-shadow-lg">{item.title}</h4>
        <p className="text-[11px] text-white/60 line-clamp-2 leading-relaxed drop-shadow">{item.prompt}</p>
      </div>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center z-20">
        <span className="px-5 py-2.5 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl text-white text-sm font-medium flex items-center gap-2 transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
          <Sparkles className="w-4 h-4" />
          Try this prompt
        </span>
      </div>
    </button>
  );
}

/* ─── Prompt Bar (replaced by NovaSmartBar below) ─────────────── */

/* ─── Main Home Component ────────────────────────────────────────── */

export function FireflyHome() {
  const [activeTab, setActiveTab] = useState<typeof TABS[number]["id"]>("featured");
  const router = useRouter();
  const isVisible = usePageVisible();
  const [recentItems, setRecentItems] = useState<GalleryItem[]>([]);

  useEffect(() => {
    if (isVisible) {
      setRecentItems(loadGallery().slice(0, 8));
    }
  }, [isVisible]);

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
              <h1 className="text-sm font-bold text-white tracking-tight">Nova</h1>
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
            Welcome to <span className="bg-gradient-to-r from-violet-400 via-pink-400 to-orange-400 bg-clip-text text-transparent">Nova</span>
          </h2>
          <p className="text-zinc-400 text-lg mb-10 leading-relaxed">
            Your AI-powered creative space. Generate images, video, audio, and designs using top AI models.
          </p>

          {/* Smart universal generate bar */}
          <NovaSmartBar />
        </div>
      </div>

      {/* Featured Creations */}
      <div className="px-6 pb-12">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-white">Featured Creations</h3>
              <p className="text-xs text-zinc-500 mt-0.5">Award-winning prompts to inspire your next masterpiece</p>
            </div>
            <Link
              href="/computer/firefly/gallery"
              className="text-xs text-zinc-500 hover:text-violet-400 transition-colors flex items-center gap-1"
            >
              View gallery <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 auto-rows-[160px] md:auto-rows-[180px] gap-2 md:gap-3 grid-flow-dense">
            {SHOWCASE.map((item) => (
              <ShowcaseCard
                key={item.id}
                item={item}
                onClick={() => {
                  const encoded = encodeURIComponent(item.prompt);
                  router.push(
                    item.type === "video"
                      ? `/computer/firefly/generate/video?prompt=${encoded}`
                      : `/computer/firefly/generate/image?prompt=${encoded}`
                  );
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Your Recent Creations */}
      {recentItems.length > 0 && (
        <div className="px-6 pb-10">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white">Your Creations</h3>
              <Link
                href="/computer/firefly/gallery"
                className="text-xs text-zinc-500 hover:text-violet-400 transition-colors flex items-center gap-1"
              >
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {recentItems.map((item) => (
                <Link
                  key={item.id}
                  href="/computer/firefly/gallery"
                  className="relative rounded-xl overflow-hidden aspect-square bg-zinc-900 border border-zinc-800/50 hover:border-zinc-700 transition-all group"
                >
                  {item.type === "image" ? (
                    <img
                      src={item.url}
                      alt={item.prompt}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : item.type === "video" ? (
                    <div className="w-full h-full bg-gradient-to-br from-cyan-900/30 to-blue-900/30 flex items-center justify-center">
                      <Play className="w-8 h-8 text-cyan-400" />
                    </div>
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-amber-900/30 to-orange-900/30 flex items-center justify-center">
                      <Music className="w-8 h-8 text-amber-400" />
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <p className="text-xs text-white/80 line-clamp-1">{item.prompt}</p>
                    <p className="text-[10px] text-zinc-500 mt-0.5">{item.model}</p>
                  </div>
                  {item.favorite && (
                    <div className="absolute top-2 right-2">
                      <Heart className="w-3.5 h-3.5 text-red-400 fill-red-400" />
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

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

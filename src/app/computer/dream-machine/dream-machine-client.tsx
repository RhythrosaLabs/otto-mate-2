"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { addBackgroundOp, updateBackgroundOp, removeBackgroundOp } from "@/lib/background-ops";
import {
  Plus,
  Play,
  Pause,
  Loader2,
  Film,
  Image as ImageIcon,
  Video,
  Wand2,
  Maximize2,
  ChevronDown,
  Trash2,
  Download,
  Copy,
  ArrowRight,
  ArrowLeftRight,
  RotateCcw,
  Camera,
  Sparkles,
  Users,
  Palette,
  Layers,
  GripVertical,
  SkipForward,
  SkipBack,
  Volume2,
  VolumeX,
  X,
  Edit3,
  Check,
  AlertCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type GenerationMode =
  | "text-to-video"
  | "image-to-video"
  | "extend"
  | "interpolate"
  | "text-to-image"
  | "modify-video"
  | "character-ref"
  | "style-ref"
  | "reframe";

type ShotStatus = "idle" | "queued" | "dreaming" | "completed" | "failed";

interface Shot {
  id: string;
  prompt: string;
  mode: GenerationMode;
  status: ShotStatus;
  generationId?: string;
  videoUrl?: string;
  imageUrl?: string;
  model: string;
  resolution: string;
  aspectRatio: string;
  duration: string;
  loop: boolean;
  error?: string;
  createdAt: number;
}

interface Board {
  id: string;
  name: string;
  type: "storyboard" | "artboard" | "moodboard";
  shots: Shot[];
  createdAt: number;
}

interface CharacterIdentity {
  name: string;
  images: string[];
}

type Provider = "auto" | "luma" | "replicate";

interface ReplicateModelInfo {
  key: string;
  owner: string;
  name: string;
  fullName: string;
  desc: string;
  type: "video" | "image";
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VIDEO_MODELS = [
  { id: "ray-3", name: "Ray 3", desc: "High quality" },
  { id: "ray-flash-2", name: "Ray Flash 2", desc: "Fast" },
];

const IMAGE_MODELS = [
  { id: "photon-1", name: "Photon 1", desc: "High quality" },
  { id: "photon-flash-1", name: "Photon Flash 1", desc: "Fast" },
];

const RESOLUTIONS = ["540p", "720p", "1080p", "4k"];
const ASPECT_RATIOS = ["1:1", "3:4", "4:3", "9:16", "16:9", "9:21", "21:9"];
const DURATIONS = ["5s", "9s"];

const MODIFY_MODES = [
  { id: "adhere_1", label: "Adhere 1", desc: "Subtle - minimal change" },
  { id: "adhere_2", label: "Adhere 2", desc: "Subtle - light change" },
  { id: "adhere_3", label: "Adhere 3", desc: "Subtle - moderate change" },
  { id: "flex_1", label: "Flex 1", desc: "Moderate - balanced" },
  { id: "flex_2", label: "Flex 2", desc: "Moderate - creative" },
  { id: "flex_3", label: "Flex 3", desc: "Moderate - expressive" },
  { id: "reimagine_1", label: "Reimagine 1", desc: "Dramatic - bold" },
  { id: "reimagine_2", label: "Reimagine 2", desc: "Dramatic - radical" },
  { id: "reimagine_3", label: "Reimagine 3", desc: "Dramatic - full reimagine" },
];

const MODE_TABS: { id: GenerationMode; label: string; icon: typeof Video; group: "video" | "image" | "edit" }[] = [
  { id: "text-to-video", label: "Text → Video", icon: Video, group: "video" },
  { id: "image-to-video", label: "Image → Video", icon: ArrowRight, group: "video" },
  { id: "extend", label: "Extend", icon: SkipForward, group: "video" },
  { id: "interpolate", label: "Interpolate", icon: ArrowLeftRight, group: "video" },
  { id: "text-to-image", label: "Text → Image", icon: ImageIcon, group: "image" },
  { id: "character-ref", label: "Character", icon: Users, group: "image" },
  { id: "style-ref", label: "Style Ref", icon: Palette, group: "image" },
  { id: "modify-video", label: "Modify", icon: Wand2, group: "edit" },
  { id: "reframe", label: "Reframe", icon: Maximize2, group: "edit" },
];

function uid() {
  return crypto.randomUUID();
}

function makeShot(overrides: Partial<Shot> = {}): Shot {
  return {
    id: uid(),
    prompt: "",
    mode: "text-to-video",
    status: "idle",
    model: "ray-3",
    resolution: "720p",
    aspectRatio: "16:9",
    duration: "5s",
    loop: false,
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeBoard(name: string, type: Board["type"] = "storyboard"): Board {
  return {
    id: uid(),
    name,
    type,
    shots: [makeShot()],
    createdAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DreamMachineClient() {
  // Board state — restored from localStorage on mount
  const [boards, setBoards] = useState<Board[]>(() => {
    try {
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem("dm:boards");
        if (saved) {
          const parsed = JSON.parse(saved) as Board[];
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      }
    } catch { /* ignore */ }
    return [makeBoard("My Film")];
  });
  const [activeBoardId, setActiveBoardId] = useState<string>(() => {
    try {
      if (typeof window !== "undefined") {
        const savedBoards = localStorage.getItem("dm:boards");
        const savedId = localStorage.getItem("dm:activeBoardId");
        if (savedBoards && savedId) {
          const parsed = JSON.parse(savedBoards) as Board[];
          if (Array.isArray(parsed) && parsed.some((b) => b.id === savedId)) return savedId;
        }
        const fallback = localStorage.getItem("dm:boards");
        if (fallback) {
          const parsed = JSON.parse(fallback) as Board[];
          if (Array.isArray(parsed) && parsed.length > 0) return parsed[0].id;
        }
      }
    } catch { /* ignore */ }
    return boards[0]?.id ?? "";
  });
  const [editingBoardName, setEditingBoardName] = useState(false);
  const [boardNameDraft, setBoardNameDraft] = useState("");
  const [showBoardMenu, setShowBoardMenu] = useState(false);

  // Shot state
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);

  // Generation panel
  const [mode, setMode] = useState<GenerationMode>("text-to-video");
  const [prompt, setPrompt] = useState("");
  const [videoModel, setVideoModel] = useState("ray-3");
  const [imageModel, setImageModel] = useState("photon-1");
  const [resolution, setResolution] = useState("720p");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [duration, setDuration] = useState("5s");
  const [loop, setLoop] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [endImageUrl, setEndImageUrl] = useState("");
  const [modifyMode, setModifyMode] = useState("flex_1");
  const [mediaUrl, setMediaUrl] = useState("");
  const [reframeAspect, setReframeAspect] = useState("16:9");
  const [styleRefUrl, setStyleRefUrl] = useState("");
  const [styleRefWeight, setStyleRefWeight] = useState(0.8);
  const [characters, setCharacters] = useState<CharacterIdentity[]>([]);
  const [charImageUrl, setCharImageUrl] = useState("");

  // Provider state
  const [provider, setProvider] = useState<Provider>("auto");
  const [availableProviders, setAvailableProviders] = useState<{ luma: boolean; replicate: boolean }>({ luma: false, replicate: false });
  const [replicateModels, setReplicateModels] = useState<ReplicateModelInfo[]>([]);
  const [selectedReplicateModel, setSelectedReplicateModel] = useState("");

  // Polling refs
  const pollingRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Film player
  const [filmPlayerOpen, setFilmPlayerOpen] = useState(false);
  const [filmPlayIndex, setFilmPlayIndex] = useState(0);
  const [filmPlaying, setFilmPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const filmVideoRef = useRef<HTMLVideoElement>(null);

  // Preview
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);

  // Error
  const [error, setError] = useState("");

  // Loading
  const [generating, setGenerating] = useState(false);

  // Drag
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  // Fetch available providers & replicate models on mount
  useEffect(() => {
    async function fetchProviders() {
      try {
        const res = await fetch("/api/luma?action=available-providers");
        if (res.ok) {
          const data = await res.json();
          setAvailableProviders(data);
          if (!data.luma && data.replicate) setProvider("replicate");
          else if (data.luma) setProvider("luma");
        }
      } catch { /* ignore */ }
      try {
        const res = await fetch("/api/luma?action=replicate-models");
        if (res.ok) {
          const data = await res.json();
          setReplicateModels(data);
        }
      } catch { /* ignore */ }
    }
    fetchProviders();
  }, []);

  // Import agent-created board via ?import=taskId URL param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const importTaskId = params.get("import");
    if (!importTaskId) return;
    (async () => {
      try {
        const filesRes = await fetch(`/api/files?taskId=${importTaskId}`);
        if (!filesRes.ok) return;
        const files = await filesRes.json() as Array<{ name: string; task_id: string }>;
        const boardFile = files.find((f) => f.name.endsWith("_board.json") && f.task_id === importTaskId);
        if (!boardFile) return;
        const boardRes = await fetch(`/api/files/${importTaskId}/${boardFile.name}`);
        if (!boardRes.ok) return;
        const board = await boardRes.json() as Board;
        if (!board?.id || !Array.isArray(board?.shots)) return;
        // Assign fresh IDs to avoid collisions with any existing boards
        const freshBoard: Board = { ...board, id: crypto.randomUUID(), shots: board.shots.map((s) => ({ ...s, id: crypto.randomUUID() })) };
        setBoards((prev) => {
          const already = prev.some((b) => b.name === board.name);
          return already ? prev : [...prev, freshBoard];
        });
        setActiveBoardId(freshBoard.id);
        setSelectedShotId(freshBoard.shots[0]?.id ?? null);
        // Clean the URL param without a page reload
        const url = new URL(window.location.href);
        url.searchParams.delete("import");
        window.history.replaceState({}, "", url.toString());
      } catch { /* ignore */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derived state
  const board = boards.find((b) => b.id === activeBoardId) ?? boards[0];
  const selectedShot = board?.shots.find((s) => s.id === selectedShotId) ?? null;
  const completedVideoShots = board?.shots.filter((s) => s.videoUrl) ?? [];

  // ─── Background ops tracking ─────────────────────────────────────────────
  useEffect(() => {
    const dreamingShots = board?.shots.filter(s => s.status === "queued" || s.status === "dreaming") ?? [];
    if (dreamingShots.length > 0) {
      addBackgroundOp({
        id: "dream-machine-gen",
        type: "video",
        label: "Dream Machine",
        status: "running",
        href: "/computer/dream-machine",
        startedAt: Date.now(),
        detail: `${dreamingShots.length} shot${dreamingShots.length > 1 ? "s" : ""} generating`,
      });
    } else {
      removeBackgroundOp("dream-machine-gen");
    }
  }, [board?.shots]);

  // -----------------------------------------------------------------------
  // Board ops
  // -----------------------------------------------------------------------
  const updateBoard = useCallback(
    (fn: (b: Board) => Board) => {
      setBoards((prev) =>
        prev.map((b) => (b.id === activeBoardId ? fn(b) : b)),
      );
    },
    [activeBoardId],
  );

  const createBoard = () => {
    const b = makeBoard(`Board ${boards.length + 1}`);
    setBoards((prev) => [...prev, b]);
    setActiveBoardId(b.id);
    setSelectedShotId(b.shots[0]?.id ?? null);
  };

  const deleteBoard = (id: string) => {
    if (boards.length <= 1) return;
    setBoards((prev) => prev.filter((b) => b.id !== id));
    if (activeBoardId === id) {
      const remaining = boards.filter((b) => b.id !== id);
      setActiveBoardId(remaining[0]?.id ?? "");
      setSelectedShotId(remaining[0]?.shots[0]?.id ?? null);
    }
  };

  // -----------------------------------------------------------------------
  // Shot ops
  // -----------------------------------------------------------------------
  const addShot = () => {
    const shot = makeShot();
    updateBoard((b) => ({ ...b, shots: [...b.shots, shot] }));
    setSelectedShotId(shot.id);
  };

  const removeShot = (shotId: string) => {
    updateBoard((b) => ({
      ...b,
      shots: b.shots.filter((s) => s.id !== shotId),
    }));
    if (selectedShotId === shotId) {
      setSelectedShotId(board.shots.find((s) => s.id !== shotId)?.id ?? null);
    }
  };

  // updateShot updates the shot across ALL boards — not just the active one.
  // This ensures polling results land correctly even if the user switches boards.
  const updateShot = useCallback(
    (shotId: string, updates: Partial<Shot>) => {
      setBoards((prev) =>
        prev.map((b) => ({
          ...b,
          shots: b.shots.map((s) => (s.id === shotId ? { ...s, ...updates } : s)),
        })),
      );
    },
    [],
  );

  const moveShot = (from: number, to: number) => {
    updateBoard((b) => {
      const shots = [...b.shots];
      const [moved] = shots.splice(from, 1);
      shots.splice(to, 0, moved);
      return { ...b, shots };
    });
  };

  // -----------------------------------------------------------------------
  // Polling
  // -----------------------------------------------------------------------
  const pollGeneration = useCallback(
    (generationId: string, shotId: string) => {
      // Clear any existing poll for this shot
      const existing = pollingRef.current.get(shotId);
      if (existing) clearInterval(existing);

      let retryCount = 0;
      const MAX_RETRIES = 120; // 120 * 3s = 6 minutes max

      const interval = setInterval(async () => {
        retryCount++;
        if (retryCount > MAX_RETRIES) {
          clearInterval(interval);
          pollingRef.current.delete(shotId);
          updateShot(shotId, { status: "failed", error: "Generation timed out after 6 minutes" });
          return;
        }
        try {
          const res = await fetch(`/api/luma?action=status&id=${generationId}`);
          if (!res.ok) return;
          const data = await res.json();

          if (data.state === "completed" || data.status === "succeeded") {
            clearInterval(interval);
            pollingRef.current.delete(shotId);
            updateShot(shotId, {
              status: "completed",
              videoUrl: data.assets?.video ?? data.output?.[0] ?? undefined,
              imageUrl: data.assets?.image ?? data.output?.[0] ?? undefined,
            });
          } else if (data.state === "failed" || data.status === "failed" || data.status === "canceled") {
            clearInterval(interval);
            pollingRef.current.delete(shotId);
            updateShot(shotId, {
              status: "failed",
              error: data.failure_reason || data.error || "Generation failed",
            });
          } else {
            updateShot(shotId, { status: data.state === "dreaming" ? "dreaming" : "queued" });
          }
        } catch {
          // Retry silently
        }
      }, 3000);

      pollingRef.current.set(shotId, interval);
    },
    [updateShot],
  );

  // Persist boards to localStorage whenever they change
  useEffect(() => {
    try { localStorage.setItem("dm:boards", JSON.stringify(boards)); } catch { /* ignore */ }
  }, [boards]);

  useEffect(() => {
    try { if (activeBoardId) localStorage.setItem("dm:activeBoardId", activeBoardId); } catch { /* ignore */ }
  }, [activeBoardId]);

  // On mount: don't auto-resume stale polling — it causes infinite request floods
  const pollingResumed = useRef(false);
  useEffect(() => {
    if (pollingResumed.current) return;
    pollingResumed.current = true;
    // Only active user-initiated generations will poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      pollingRef.current.forEach((interval) => clearInterval(interval));
    };
  }, []);

  // -----------------------------------------------------------------------
  // Generation
  // -----------------------------------------------------------------------
  const generate = async () => {
    if (!prompt.trim() && mode !== "reframe") {
      setError("Enter a prompt");
      return;
    }

    setError("");
    setGenerating(true);

    // Create or use selected shot
    let shotId = selectedShotId;
    if (!shotId) {
      const shot = makeShot({ prompt, mode });
      updateBoard((b) => ({ ...b, shots: [...b.shots, shot] }));
      shotId = shot.id;
      setSelectedShotId(shot.id);
    }

    updateShot(shotId, { prompt, mode, status: "queued" });

    try {
      let body: Record<string, unknown> = {};

      switch (mode) {
        case "text-to-video": {
          body = {
            action: "generate-video",
            prompt,
            model: videoModel,
            resolution,
            aspect_ratio: aspectRatio,
            duration,
            loop,
          };
          break;
        }
        case "image-to-video": {
          if (!imageUrl.trim()) {
            setError("Provide a start image URL");
            setGenerating(false);
            return;
          }
          body = {
            action: "generate-video",
            prompt,
            model: videoModel,
            resolution,
            aspect_ratio: aspectRatio,
            duration,
            keyframes: {
              frame0: { type: "image", url: imageUrl.trim() },
              ...(endImageUrl.trim()
                ? { frame1: { type: "image", url: endImageUrl.trim() } }
                : {}),
            },
          };
          break;
        }
        case "extend": {
          // Extend from a previous generation
          const prevShot = board.shots.find(
            (s) => s.id !== shotId && s.generationId && s.status === "completed",
          );
          if (!prevShot?.generationId) {
            setError("No completed shot to extend from. Generate a video first.");
            setGenerating(false);
            return;
          }
          body = {
            action: "generate-video",
            prompt,
            model: videoModel,
            keyframes: {
              frame0: { type: "generation", id: prevShot.generationId },
            },
          };
          break;
        }
        case "interpolate": {
          const completed = board.shots.filter(
            (s) => s.generationId && s.status === "completed",
          );
          if (completed.length < 2) {
            setError("Need at least 2 completed shots to interpolate between.");
            setGenerating(false);
            return;
          }
          body = {
            action: "generate-video",
            prompt,
            model: videoModel,
            keyframes: {
              frame0: { type: "generation", id: completed[0].generationId },
              frame1: { type: "generation", id: completed[completed.length - 1].generationId },
            },
          };
          break;
        }
        case "text-to-image": {
          body = {
            action: "generate-image",
            prompt,
            model: imageModel,
            aspect_ratio: aspectRatio,
          };
          break;
        }
        case "style-ref": {
          body = {
            action: "generate-image",
            prompt,
            model: imageModel,
            aspect_ratio: aspectRatio,
            style_ref: styleRefUrl.trim()
              ? [{ url: styleRefUrl.trim(), weight: styleRefWeight }]
              : undefined,
          };
          break;
        }
        case "character-ref": {
          const charRef: Record<string, { images: { url: string }[] }> = {};
          characters.forEach((c, i) => {
            charRef[`identity${i}`] = {
              images: c.images.map((url) => ({ url })),
            };
          });
          body = {
            action: "generate-image",
            prompt,
            model: imageModel,
            aspect_ratio: aspectRatio,
            character_ref: Object.keys(charRef).length > 0 ? charRef : undefined,
          };
          break;
        }
        case "modify-video": {
          if (!mediaUrl.trim()) {
            setError("Provide a video URL to modify");
            setGenerating(false);
            return;
          }
          body = {
            action: "modify-video",
            prompt,
            model: videoModel,
            mode: modifyMode,
            media: { url: mediaUrl.trim() },
          };
          break;
        }
        case "reframe": {
          if (!mediaUrl.trim()) {
            setError("Provide a media URL to reframe");
            setGenerating(false);
            return;
          }
          body = {
            action: "reframe",
            prompt: prompt || undefined,
            model: videoModel,
            aspect_ratio: reframeAspect,
            media: { url: mediaUrl.trim() },
          };
          break;
        }
      }

      // Inject provider + optional replicate model
      body.provider = provider;
      if ((provider === "replicate" || provider === "auto") && selectedReplicateModel) {
        body.replicate_model = selectedReplicateModel;
      }

      const res = await fetch("/api/luma", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Generation failed");
        updateShot(shotId, { status: "failed", error: data.error });
        setGenerating(false);
        return;
      }

      updateShot(shotId, {
        generationId: data.id,
        status: data.state === "completed" ? "completed" : "queued",
        videoUrl: data.assets?.video ?? undefined,
        imageUrl: data.assets?.image ?? undefined,
        model: body.model as string || videoModel,
      });

      // Start polling if not immediately complete
      if (data.state !== "completed" && data.state !== "failed") {
        pollGeneration(data.id, shotId);
      }
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
      updateShot(shotId, { status: "failed", error: String(err) });
    } finally {
      setGenerating(false);
    }
  };

  // -----------------------------------------------------------------------
  // Film Player
  // -----------------------------------------------------------------------
  const openFilmPlayer = () => {
    if (completedVideoShots.length === 0) return;
    setFilmPlayIndex(0);
    setFilmPlaying(true);
    setFilmPlayerOpen(true);
  };

  const filmOnEnded = () => {
    const nextIdx = filmPlayIndex + 1;
    if (nextIdx < completedVideoShots.length) {
      setFilmPlayIndex(nextIdx);
    } else {
      setFilmPlaying(false);
    }
  };

  useEffect(() => {
    if (filmPlayerOpen && filmVideoRef.current && completedVideoShots[filmPlayIndex]?.videoUrl) {
      filmVideoRef.current.src = completedVideoShots[filmPlayIndex].videoUrl!;
      if (filmPlaying) {
        filmVideoRef.current.play().catch(() => {});
      }
    }
  }, [filmPlayIndex, filmPlayerOpen, filmPlaying, completedVideoShots]);

  // -----------------------------------------------------------------------
  // Preview controls
  // -----------------------------------------------------------------------
  const togglePreview = () => {
    if (!previewVideoRef.current) return;
    if (previewPlaying) {
      previewVideoRef.current.pause();
    } else {
      previewVideoRef.current.play().catch(() => {});
    }
    setPreviewPlaying(!previewPlaying);
  };

  // -----------------------------------------------------------------------
  // Select shot & load its settings
  // -----------------------------------------------------------------------
  const selectShot = (shot: Shot) => {
    setSelectedShotId(shot.id);
    setPrompt(shot.prompt);
    setMode(shot.mode);
  };

  // -----------------------------------------------------------------------
  // Drag & Drop reorder
  // -----------------------------------------------------------------------
  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx !== null && dragIdx !== idx) {
      moveShot(dragIdx, idx);
      setDragIdx(idx);
    }
  };
  const handleDragEnd = () => setDragIdx(null);

  // -----------------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------------
  const statusBadge = (status: ShotStatus) => {
    const styles: Record<ShotStatus, string> = {
      idle: "bg-pplx-muted/20 text-pplx-muted",
      queued: "bg-yellow-500/20 text-yellow-400",
      dreaming: "bg-purple-500/20 text-purple-400 animate-pulse",
      completed: "bg-green-500/20 text-green-400",
      failed: "bg-red-500/20 text-red-400",
    };
    const labels: Record<ShotStatus, string> = {
      idle: "Ready",
      queued: "Queued",
      dreaming: "Dreaming...",
      completed: "Done",
      failed: "Failed",
    };
    return (
      <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", styles[status])}>
        {labels[status]}
      </span>
    );
  };

  const isVideoMode = ["text-to-video", "image-to-video", "extend", "interpolate", "modify-video", "reframe"].includes(mode);
  const currentModels = isVideoMode ? VIDEO_MODELS : IMAGE_MODELS;
  const currentModel = isVideoMode ? videoModel : imageModel;
  const setCurrentModel = isVideoMode
    ? setVideoModel
    : setImageModel;

  // -----------------------------------------------------------------------
  // RENDER
  // -----------------------------------------------------------------------
  return (
    <div className="flex flex-col h-screen w-full bg-pplx-bg text-pplx-text overflow-hidden">
      {/* ================================================================= */}
      {/* TOP BAR */}
      {/* ================================================================= */}
      <header className="flex items-center h-12 px-4 border-b border-pplx-border bg-pplx-sidebar shrink-0 gap-3">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
            <Clapperboard size={13} className="text-white" />
          </div>
          <span className="text-sm font-semibold tracking-tight">Dream Machine</span>
        </div>

        {/* Board tabs */}
        <div className="flex items-center gap-1 ml-4 overflow-x-auto">
          {boards.map((b) => (
            <button
              key={b.id}
              onClick={() => {
                setActiveBoardId(b.id);
                setSelectedShotId(b.shots[0]?.id ?? null);
              }}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap",
                b.id === activeBoardId
                  ? "bg-white/10 text-pplx-text"
                  : "text-pplx-muted hover:text-pplx-text hover:bg-white/5",
              )}
            >
              {b.name}
            </button>
          ))}
          <button
            onClick={createBoard}
            className="p-1 rounded-md text-pplx-muted hover:text-pplx-text hover:bg-white/5"
            title="New Board"
          >
            <Plus size={14} />
          </button>
        </div>

        <div className="flex-1" />

        {/* Board actions */}
        <div className="flex items-center gap-2">
          {/* Board type badge */}
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 font-medium uppercase tracking-wider">
            {board?.type || "storyboard"}
          </span>

          {/* Provider indicator */}
          <span className={cn(
            "text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider",
            provider === "replicate" || (provider === "auto" && !availableProviders.luma && availableProviders.replicate)
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-blue-500/10 text-blue-400",
          )}>
            {provider === "replicate" || (provider === "auto" && !availableProviders.luma && availableProviders.replicate)
              ? "Replicate"
              : "Luma"}
          </span>

          {/* Board name edit */}
          {editingBoardName ? (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                value={boardNameDraft}
                onChange={(e) => setBoardNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    updateBoard((b) => ({ ...b, name: boardNameDraft || b.name }));
                    setEditingBoardName(false);
                  }
                  if (e.key === "Escape") setEditingBoardName(false);
                }}
                className="bg-pplx-card border border-pplx-border rounded px-2 py-0.5 text-xs w-32"
              />
              <button
                onClick={() => {
                  updateBoard((b) => ({ ...b, name: boardNameDraft || b.name }));
                  setEditingBoardName(false);
                }}
              >
                <Check size={12} className="text-green-400" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setBoardNameDraft(board?.name ?? "");
                setEditingBoardName(true);
              }}
              className="text-pplx-muted hover:text-pplx-text"
              title="Rename board"
            >
              <Edit3 size={13} />
            </button>
          )}

          {/* Film Player button */}
          <button
            onClick={openFilmPlayer}
            disabled={completedVideoShots.length === 0}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              completedVideoShots.length > 0
                ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-500 hover:to-fuchsia-500"
                : "bg-white/5 text-pplx-muted cursor-not-allowed",
            )}
          >
            <Film size={13} />
            Play Film ({completedVideoShots.length} shots)
          </button>

          {/* Board menu */}
          <div className="relative">
            <button
              onClick={() => setShowBoardMenu(!showBoardMenu)}
              className="p-1.5 rounded-md text-pplx-muted hover:text-pplx-text hover:bg-white/5"
            >
              <ChevronDown size={14} />
            </button>
            {showBoardMenu && (
              <div className="absolute right-0 top-full mt-1 bg-pplx-card border border-pplx-border rounded-lg shadow-xl z-50 min-w-[160px] py-1">
                <button
                  onClick={() => {
                    updateBoard((b) => ({ ...b, type: "storyboard" }));
                    setShowBoardMenu(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 flex items-center gap-2"
                >
                  <Film size={12} /> Storyboard
                </button>
                <button
                  onClick={() => {
                    updateBoard((b) => ({ ...b, type: "artboard" }));
                    setShowBoardMenu(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 flex items-center gap-2"
                >
                  <Layers size={12} /> Artboard
                </button>
                <button
                  onClick={() => {
                    updateBoard((b) => ({ ...b, type: "moodboard" }));
                    setShowBoardMenu(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 flex items-center gap-2"
                >
                  <Palette size={12} /> Moodboard
                </button>
                <hr className="my-1 border-pplx-border" />
                <button
                  onClick={() => {
                    deleteBoard(activeBoardId);
                    setShowBoardMenu(false);
                  }}
                  disabled={boards.length <= 1}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 text-red-400 flex items-center gap-2 disabled:opacity-30"
                >
                  <Trash2 size={12} /> Delete Board
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ================================================================= */}
      {/* MAIN CONTENT: Preview + Generation Panel */}
      {/* ================================================================= */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* -------- LEFT: Preview Area -------- */}
        <div className="flex-1 flex flex-col min-w-0 p-4">
          <div className="flex-1 flex items-center justify-center bg-pplx-card rounded-xl border border-pplx-border relative overflow-hidden">
            {selectedShot?.videoUrl ? (
              <>
                <video
                  ref={previewVideoRef}
                  src={selectedShot.videoUrl}
                  className="max-w-full max-h-full rounded-lg"
                  loop
                  muted={muted}
                  onPlay={() => setPreviewPlaying(true)}
                  onPause={() => setPreviewPlaying(false)}
                />
                {/* Video controls overlay */}
                <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2">
                  <button onClick={togglePreview} className="text-white hover:text-violet-300">
                    {previewPlaying ? <Pause size={16} /> : <Play size={16} />}
                  </button>
                  <button onClick={() => setMuted(!muted)} className="text-white hover:text-violet-300">
                    {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  </button>
                  <div className="flex-1" />
                  <a
                    href={selectedShot.videoUrl}
                    download
                    target="_blank"
                    rel="noreferrer"
                    className="text-white hover:text-violet-300"
                  >
                    <Download size={14} />
                  </a>
                </div>
              </>
            ) : selectedShot?.imageUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selectedShot.imageUrl}
                  alt={selectedShot.prompt}
                  className="max-w-full max-h-full rounded-lg object-contain"
                />
                <div className="absolute bottom-3 right-3">
                  <a
                    href={selectedShot.imageUrl}
                    download
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-1.5 text-white text-xs hover:text-violet-300"
                  >
                    <Download size={13} /> Download
                  </a>
                </div>
              </>
            ) : selectedShot?.status === "dreaming" || selectedShot?.status === "queued" ? (
              <div className="flex flex-col items-center gap-3 text-pplx-muted">
                <Loader2 size={40} className="animate-spin text-violet-400" />
                <p className="text-sm">
                  {selectedShot.status === "dreaming" ? "Dreaming..." : "Queued..."}
                </p>
                <p className="text-xs text-pplx-muted/60">This typically takes 30-120 seconds</p>
              </div>
            ) : selectedShot?.status === "failed" ? (
              <div className="flex flex-col items-center gap-3 text-red-400">
                <AlertCircle size={40} />
                <p className="text-sm">{selectedShot.error || "Generation failed"}</p>
                <button
                  onClick={() => {
                    updateShot(selectedShot.id, { status: "idle", error: undefined });
                  }}
                  className="flex items-center gap-1.5 text-xs text-pplx-muted hover:text-pplx-text"
                >
                  <RefreshCw size={12} /> Try again
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 text-pplx-muted">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center">
                  <Sparkles size={28} className="text-violet-400" />
                </div>
                <p className="text-sm font-medium">Select a shot and generate</p>
                <p className="text-xs text-pplx-muted/60 max-w-xs text-center">
                  Write a prompt and click Generate to bring your vision to life
                </p>
              </div>
            )}
          </div>

          {/* Shot info bar */}
          {selectedShot && (
            <div className="flex items-center gap-3 mt-2 px-1">
              <span className="text-[11px] text-pplx-muted truncate flex-1">
                {selectedShot.prompt || "No prompt"}
              </span>
              {statusBadge(selectedShot.status)}
              {selectedShot.generationId && (
                <button
                  onClick={() => navigator.clipboard.writeText(selectedShot.generationId!)}
                  className="text-pplx-muted hover:text-pplx-text"
                  title="Copy generation ID"
                >
                  <Copy size={11} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* -------- RIGHT: Generation Panel -------- */}
        <div className="w-[340px] border-l border-pplx-border bg-pplx-sidebar flex flex-col shrink-0 overflow-hidden">
          {/* Mode tabs */}
          <div className="p-3 border-b border-pplx-border">
            <div className="mb-2">
              <p className="text-[10px] font-medium text-pplx-muted uppercase tracking-wider mb-2">Video</p>
              <div className="flex flex-wrap gap-1">
                {MODE_TABS.filter((t) => t.group === "video").map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setMode(tab.id)}
                      className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors",
                        mode === tab.id
                          ? "bg-violet-500/20 text-violet-300"
                          : "text-pplx-muted hover:text-pplx-text hover:bg-white/5",
                      )}
                    >
                      <Icon size={11} />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mb-2">
              <p className="text-[10px] font-medium text-pplx-muted uppercase tracking-wider mb-2">Image</p>
              <div className="flex flex-wrap gap-1">
                {MODE_TABS.filter((t) => t.group === "image").map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setMode(tab.id)}
                      className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors",
                        mode === tab.id
                          ? "bg-fuchsia-500/20 text-fuchsia-300"
                          : "text-pplx-muted hover:text-pplx-text hover:bg-white/5",
                      )}
                    >
                      <Icon size={11} />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-medium text-pplx-muted uppercase tracking-wider mb-2">Edit</p>
              <div className="flex flex-wrap gap-1">
                {MODE_TABS.filter((t) => t.group === "edit").map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setMode(tab.id)}
                      className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors",
                        mode === tab.id
                          ? "bg-blue-500/20 text-blue-300"
                          : "text-pplx-muted hover:text-pplx-text hover:bg-white/5",
                      )}
                    >
                      <Icon size={11} />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Generation controls */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {/* Provider selector */}
            <div>
              <label className="text-[11px] text-pplx-muted font-medium mb-1 block">Provider</label>
              <div className="flex gap-1">
                {(["auto", "luma", "replicate"] as Provider[]).map((p) => {
                  const labels: Record<Provider, string> = {
                    auto: `Auto${availableProviders.luma ? " (Luma)" : availableProviders.replicate ? " (Replicate)" : ""}`,
                    luma: "Luma",
                    replicate: "Replicate",
                  };
                  const disabled =
                    (p === "luma" && !availableProviders.luma) ||
                    (p === "replicate" && !availableProviders.replicate);
                  return (
                    <button
                      key={p}
                      onClick={() => {
                        setProvider(p);
                        setSelectedReplicateModel("");
                      }}
                      disabled={disabled}
                      className={cn(
                        "flex-1 px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors border",
                        provider === p
                          ? "border-violet-500 bg-violet-500/10 text-violet-300"
                          : disabled
                            ? "border-pplx-border/30 text-pplx-muted/30 cursor-not-allowed"
                            : "border-pplx-border text-pplx-muted hover:border-pplx-muted/50",
                      )}
                    >
                      {labels[p]}
                    </button>
                  );
                })}
              </div>
              {!availableProviders.luma && !availableProviders.replicate && (
                <p className="text-[10px] text-yellow-400 mt-1">
                  Set LUMA_API_KEY or REPLICATE_API_TOKEN in .env.local
                </p>
              )}
            </div>

            {/* Replicate model selector (when using Replicate) */}
            {(provider === "replicate" || (provider === "auto" && !availableProviders.luma && availableProviders.replicate)) &&
              replicateModels.length > 0 && (
                <div>
                  <label className="text-[11px] text-pplx-muted font-medium mb-1 block">
                    Replicate Model
                  </label>
                  <select
                    value={selectedReplicateModel}
                    onChange={(e) => setSelectedReplicateModel(e.target.value)}
                    className="w-full bg-pplx-card border border-pplx-border rounded-lg px-2 py-1.5 text-xs text-pplx-text focus:outline-none focus:border-violet-500/50"
                  >
                    <option value="">Auto (best match)</option>
                    <optgroup label="Video Models">
                      {replicateModels
                        .filter((m) => m.type === "video")
                        .map((m) => (
                          <option key={m.key} value={m.key}>
                            {m.desc} ({m.fullName})
                          </option>
                        ))}
                    </optgroup>
                    <optgroup label="Image Models">
                      {replicateModels
                        .filter((m) => m.type === "image")
                        .map((m) => (
                          <option key={m.key} value={m.key}>
                            {m.desc} ({m.fullName})
                          </option>
                        ))}
                    </optgroup>
                  </select>
                </div>
              )}

            {/* Prompt */}
            <div>
              <label className="text-[11px] text-pplx-muted font-medium mb-1 block">Prompt</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={
                  mode === "text-to-video"
                    ? "A cinematic shot of a wolf running through a snowy forest..."
                    : mode === "text-to-image"
                      ? "A portrait of a cyberpunk samurai in neon rain..."
                      : mode === "modify-video"
                        ? "Change the weather to a thunderstorm..."
                        : "Describe your vision..."
                }
                rows={3}
                className="w-full bg-pplx-card border border-pplx-border rounded-lg px-3 py-2 text-xs placeholder:text-pplx-muted/40 focus:outline-none focus:border-violet-500/50 resize-none"
              />
            </div>

            {/* Model selector */}
            <div>
              <label className="text-[11px] text-pplx-muted font-medium mb-1 block">Model</label>
              <div className="grid grid-cols-2 gap-1">
                {currentModels.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setCurrentModel(m.id)}
                    className={cn(
                      "px-2 py-1.5 rounded-md text-[11px] border transition-colors",
                      currentModel === m.id
                        ? "border-violet-500 bg-violet-500/10 text-violet-300"
                        : "border-pplx-border text-pplx-muted hover:border-pplx-muted/50",
                    )}
                  >
                    <div className="font-medium">{m.name}</div>
                    <div className="text-[9px] opacity-60">{m.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Aspect Ratio */}
            <div>
              <label className="text-[11px] text-pplx-muted font-medium mb-1 block">Aspect Ratio</label>
              <div className="flex flex-wrap gap-1">
                {ASPECT_RATIOS.map((ar) => (
                  <button
                    key={ar}
                    onClick={() => setAspectRatio(ar)}
                    className={cn(
                      "px-2 py-1 rounded text-[10px] font-medium transition-colors",
                      aspectRatio === ar
                        ? "bg-violet-500/20 text-violet-300"
                        : "bg-pplx-card text-pplx-muted hover:bg-white/5",
                    )}
                  >
                    {ar}
                  </button>
                ))}
              </div>
            </div>

            {/* Video-specific settings */}
            {isVideoMode && mode !== "reframe" && (
              <>
                <div>
                  <label className="text-[11px] text-pplx-muted font-medium mb-1 block">Resolution</label>
                  <div className="flex gap-1">
                    {RESOLUTIONS.map((r) => (
                      <button
                        key={r}
                        onClick={() => setResolution(r)}
                        className={cn(
                          "px-2 py-1 rounded text-[10px] font-medium transition-colors flex-1",
                          resolution === r
                            ? "bg-violet-500/20 text-violet-300"
                            : "bg-pplx-card text-pplx-muted hover:bg-white/5",
                        )}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-pplx-muted font-medium mb-1 block">Duration</label>
                  <div className="flex gap-1">
                    {DURATIONS.map((d) => (
                      <button
                        key={d}
                        onClick={() => setDuration(d)}
                        className={cn(
                          "px-3 py-1 rounded text-[10px] font-medium transition-colors flex-1",
                          duration === d
                            ? "bg-violet-500/20 text-violet-300"
                            : "bg-pplx-card text-pplx-muted hover:bg-white/5",
                        )}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={loop}
                    onChange={(e) => setLoop(e.target.checked)}
                    className="rounded border-pplx-border bg-pplx-card accent-violet-500"
                  />
                  <span className="text-[11px] text-pplx-muted">Loop video</span>
                </label>
              </>
            )}

            {/* Image-to-Video: image URLs */}
            {mode === "image-to-video" && (
              <>
                <div>
                  <label className="text-[11px] text-pplx-muted font-medium mb-1 block">
                    Start Frame Image URL <span className="text-red-400">*</span>
                  </label>
                  <input
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://example.com/start-frame.jpg"
                    className="w-full bg-pplx-card border border-pplx-border rounded-lg px-3 py-2 text-xs placeholder:text-pplx-muted/40 focus:outline-none focus:border-violet-500/50"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-pplx-muted font-medium mb-1 block">
                    End Frame Image URL <span className="text-pplx-muted/40">(optional)</span>
                  </label>
                  <input
                    value={endImageUrl}
                    onChange={(e) => setEndImageUrl(e.target.value)}
                    placeholder="https://example.com/end-frame.jpg"
                    className="w-full bg-pplx-card border border-pplx-border rounded-lg px-3 py-2 text-xs placeholder:text-pplx-muted/40 focus:outline-none focus:border-violet-500/50"
                  />
                </div>
              </>
            )}

            {/* Extend: info */}
            {mode === "extend" && (
              <div className="bg-violet-500/10 rounded-lg p-3 text-[11px] text-violet-300">
                <p className="font-medium mb-1">Extend Mode</p>
                <p className="text-pplx-muted text-[10px]">
                  Extends the last completed shot in your storyboard. Add a prompt describing what happens next.
                </p>
              </div>
            )}

            {/* Interpolate: info */}
            {mode === "interpolate" && (
              <div className="bg-blue-500/10 rounded-lg p-3 text-[11px] text-blue-300">
                <p className="font-medium mb-1">Interpolate Mode</p>
                <p className="text-pplx-muted text-[10px]">
                  Creates a smooth transition between the first and last completed shots. Add a prompt to guide the transition.
                </p>
              </div>
            )}

            {/* Style Reference */}
            {mode === "style-ref" && (
              <>
                <div>
                  <label className="text-[11px] text-pplx-muted font-medium mb-1 block">
                    Style Reference Image URL
                  </label>
                  <input
                    value={styleRefUrl}
                    onChange={(e) => setStyleRefUrl(e.target.value)}
                    placeholder="https://example.com/style-reference.jpg"
                    className="w-full bg-pplx-card border border-pplx-border rounded-lg px-3 py-2 text-xs placeholder:text-pplx-muted/40 focus:outline-none focus:border-violet-500/50"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-pplx-muted font-medium mb-1 block">
                    Style Weight: {styleRefWeight.toFixed(1)}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={styleRefWeight}
                    onChange={(e) => setStyleRefWeight(parseFloat(e.target.value))}
                    className="w-full accent-violet-500"
                  />
                </div>
              </>
            )}

            {/* Character Reference */}
            {mode === "character-ref" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-pplx-muted font-medium">Characters</label>
                  <button
                    onClick={() =>
                      setCharacters((prev) => [
                        ...prev,
                        { name: `Character ${prev.length + 1}`, images: [] },
                      ])
                    }
                    className="text-[10px] text-violet-400 hover:text-violet-300 flex items-center gap-1"
                  >
                    <Plus size={10} /> Add Character
                  </button>
                </div>
                {characters.map((char, ci) => (
                  <div key={ci} className="bg-pplx-card rounded-lg border border-pplx-border p-2 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <input
                        value={char.name}
                        onChange={(e) => {
                          const updated = [...characters];
                          updated[ci] = { ...updated[ci], name: e.target.value };
                          setCharacters(updated);
                        }}
                        className="flex-1 bg-transparent text-[11px] font-medium focus:outline-none"
                      />
                      <button
                        onClick={() => setCharacters((prev) => prev.filter((_, i) => i !== ci))}
                        className="text-pplx-muted hover:text-red-400"
                      >
                        <X size={10} />
                      </button>
                    </div>
                    {char.images.map((url, ii) => (
                      <div key={ii} className="flex items-center gap-1.5">
                        <input
                          value={url}
                          onChange={(e) => {
                            const updated = [...characters];
                            const imgs = [...updated[ci].images];
                            imgs[ii] = e.target.value;
                            updated[ci] = { ...updated[ci], images: imgs };
                            setCharacters(updated);
                          }}
                          className="flex-1 bg-pplx-bg border border-pplx-border rounded px-2 py-1 text-[10px] focus:outline-none"
                          placeholder="Image URL"
                        />
                        <button
                          onClick={() => {
                            const updated = [...characters];
                            updated[ci] = {
                              ...updated[ci],
                              images: updated[ci].images.filter((_, i) => i !== ii),
                            };
                            setCharacters(updated);
                          }}
                          className="text-pplx-muted hover:text-red-400"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => {
                        if (!charImageUrl.trim()) return;
                        const updated = [...characters];
                        updated[ci] = {
                          ...updated[ci],
                          images: [...updated[ci].images, charImageUrl.trim()],
                        };
                        setCharacters(updated);
                        setCharImageUrl("");
                      }}
                      className="text-[10px] text-violet-400 hover:text-violet-300 flex items-center gap-1"
                    >
                      <Plus size={9} /> Add Image
                    </button>
                  </div>
                ))}
                {characters.length > 0 && (
                  <input
                    value={charImageUrl}
                    onChange={(e) => setCharImageUrl(e.target.value)}
                    placeholder="Paste image URL then click Add on a character"
                    className="w-full bg-pplx-card border border-pplx-border rounded-lg px-3 py-2 text-[10px] placeholder:text-pplx-muted/40 focus:outline-none"
                  />
                )}
              </div>
            )}

            {/* Modify Video */}
            {mode === "modify-video" && (
              <>
                <div>
                  <label className="text-[11px] text-pplx-muted font-medium mb-1 block">
                    Video URL to Modify <span className="text-red-400">*</span>
                  </label>
                  <input
                    value={mediaUrl}
                    onChange={(e) => setMediaUrl(e.target.value)}
                    placeholder="https://example.com/video.mp4"
                    className="w-full bg-pplx-card border border-pplx-border rounded-lg px-3 py-2 text-xs placeholder:text-pplx-muted/40 focus:outline-none focus:border-violet-500/50"
                  />
                  {/* Auto-fill from selected shot */}
                  {selectedShot?.videoUrl && (
                    <button
                      onClick={() => setMediaUrl(selectedShot.videoUrl!)}
                      className="text-[10px] text-violet-400 hover:text-violet-300 mt-1"
                    >
                      Use selected shot&apos;s video
                    </button>
                  )}
                </div>
                <div>
                  <label className="text-[11px] text-pplx-muted font-medium mb-1 block">Modify Mode</label>
                  <div className="grid grid-cols-3 gap-1 max-h-[180px] overflow-y-auto">
                    {MODIFY_MODES.map((mm) => (
                      <button
                        key={mm.id}
                        onClick={() => setModifyMode(mm.id)}
                        className={cn(
                          "px-1.5 py-1 rounded text-[9px] border transition-colors text-center",
                          modifyMode === mm.id
                            ? "border-violet-500 bg-violet-500/10 text-violet-300"
                            : "border-pplx-border text-pplx-muted hover:border-pplx-muted/50",
                        )}
                      >
                        {mm.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Reframe */}
            {mode === "reframe" && (
              <>
                <div>
                  <label className="text-[11px] text-pplx-muted font-medium mb-1 block">
                    Media URL to Reframe <span className="text-red-400">*</span>
                  </label>
                  <input
                    value={mediaUrl}
                    onChange={(e) => setMediaUrl(e.target.value)}
                    placeholder="https://example.com/media.mp4"
                    className="w-full bg-pplx-card border border-pplx-border rounded-lg px-3 py-2 text-xs placeholder:text-pplx-muted/40 focus:outline-none focus:border-violet-500/50"
                  />
                  {selectedShot?.videoUrl && (
                    <button
                      onClick={() => setMediaUrl(selectedShot.videoUrl!)}
                      className="text-[10px] text-violet-400 hover:text-violet-300 mt-1"
                    >
                      Use selected shot&apos;s video
                    </button>
                  )}
                </div>
                <div>
                  <label className="text-[11px] text-pplx-muted font-medium mb-1 block">Target Aspect Ratio</label>
                  <div className="flex flex-wrap gap-1">
                    {ASPECT_RATIOS.map((ar) => (
                      <button
                        key={ar}
                        onClick={() => setReframeAspect(ar)}
                        className={cn(
                          "px-2 py-1 rounded text-[10px] font-medium transition-colors",
                          reframeAspect === ar
                            ? "bg-violet-500/20 text-violet-300"
                            : "bg-pplx-card text-pplx-muted hover:bg-white/5",
                        )}
                      >
                        {ar}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Error display */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-400 flex items-start gap-2">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Generate button */}
          <div className="p-3 border-t border-pplx-border">
            <button
              onClick={generate}
              disabled={generating || (!prompt.trim() && mode !== "reframe")}
              className={cn(
                "w-full py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2",
                generating
                  ? "bg-violet-500/30 text-violet-300 cursor-wait"
                  : "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-500 hover:to-fuchsia-500 shadow-lg shadow-violet-500/20",
              )}
            >
              {generating ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Generating...
                </>
              ) : (
                <>
                  <Sparkles size={16} /> Generate
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* STORYBOARD TIMELINE */}
      {/* ================================================================= */}
      <div className="h-[140px] border-t border-pplx-border bg-pplx-sidebar shrink-0 flex flex-col">
        <div className="flex items-center justify-between px-4 py-1.5 border-b border-pplx-border/50">
          <div className="flex items-center gap-2">
            <Film size={12} className="text-violet-400" />
            <span className="text-[10px] font-medium text-pplx-muted uppercase tracking-wider">
              Storyboard · {board?.shots.length ?? 0} shots
            </span>
          </div>
          <button
            onClick={addShot}
            className="flex items-center gap-1 text-[10px] text-violet-400 hover:text-violet-300 font-medium"
          >
            <Plus size={10} /> Add Shot
          </button>
        </div>
        <div className="flex-1 overflow-x-auto overflow-y-hidden px-3 py-2">
          <div className="flex items-stretch gap-2 h-full">
            {board?.shots.map((shot, idx) => (
              <div
                key={shot.id}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragEnd={handleDragEnd}
                onClick={() => selectShot(shot)}
                className={cn(
                  "flex flex-col w-[120px] min-w-[120px] rounded-lg border bg-pplx-card cursor-pointer transition-all group hover:border-violet-500/50",
                  selectedShotId === shot.id
                    ? "border-violet-500 ring-1 ring-violet-500/30"
                    : "border-pplx-border",
                  dragIdx === idx && "opacity-50",
                )}
              >
                {/* Thumbnail */}
                <div className="flex-1 relative rounded-t-lg overflow-hidden bg-pplx-bg flex items-center justify-center min-h-0">
                  {shot.videoUrl ? (
                    <video
                      src={shot.videoUrl}
                      className="w-full h-full object-cover"
                      muted
                      playsInline
                      onMouseEnter={(e) => (e.target as HTMLVideoElement).play().catch(() => {})}
                      onMouseLeave={(e) => {
                        const v = e.target as HTMLVideoElement;
                        v.pause();
                        v.currentTime = 0;
                      }}
                    />
                  ) : shot.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={shot.imageUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : shot.status === "dreaming" || shot.status === "queued" ? (
                    <Loader2 size={16} className="animate-spin text-violet-400" />
                  ) : (
                    <span className="text-[10px] text-pplx-muted/40">Shot {idx + 1}</span>
                  )}

                  {/* Drag handle */}
                  <div className="absolute top-0.5 left-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <GripVertical size={10} className="text-white/50" />
                  </div>

                  {/* Shot number */}
                  <div className="absolute top-0.5 right-0.5 bg-black/60 rounded px-1 text-[8px] text-white/70 font-medium">
                    {idx + 1}
                  </div>

                  {/* Delete */}
                  {board.shots.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeShot(shot.id);
                      }}
                      className="absolute bottom-0.5 right-0.5 opacity-0 group-hover:opacity-100 bg-red-500/80 rounded p-0.5 text-white transition-opacity"
                    >
                      <Trash2 size={8} />
                    </button>
                  )}
                </div>
                {/* Shot info */}
                <div className="px-1.5 py-1 flex items-center gap-1">
                  <span className="text-[9px] text-pplx-muted truncate flex-1">
                    {shot.prompt || `Shot ${idx + 1}`}
                  </span>
                  {statusBadge(shot.status)}
                </div>
              </div>
            ))}

            {/* Add shot card */}
            <button
              onClick={addShot}
              className="flex flex-col items-center justify-center w-[80px] min-w-[80px] rounded-lg border border-dashed border-pplx-border/50 text-pplx-muted hover:text-violet-400 hover:border-violet-500/30 transition-colors"
            >
              <Plus size={16} />
              <span className="text-[9px] mt-1">Add</span>
            </button>
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* FILM PLAYER OVERLAY */}
      {/* ================================================================= */}
      {filmPlayerOpen && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center">
          {/* Close */}
          <button
            onClick={() => {
              setFilmPlayerOpen(false);
              setFilmPlaying(false);
            }}
            className="absolute top-4 right-4 text-white/60 hover:text-white z-10"
          >
            <X size={24} />
          </button>

          {/* Title */}
          <div className="absolute top-4 left-4 flex items-center gap-2 text-white/60">
            <Film size={16} />
            <span className="text-sm font-medium">{board?.name} — Shot {filmPlayIndex + 1}/{completedVideoShots.length}</span>
          </div>

          {/* Video */}
          <div className="flex-1 flex items-center justify-center w-full px-8">
            <video
              ref={filmVideoRef}
              className="max-w-full max-h-[80vh] rounded-xl"
              autoPlay
              muted={muted}
              onEnded={filmOnEnded}
              onPlay={() => setFilmPlaying(true)}
              onPause={() => setFilmPlaying(false)}
            />
          </div>

          {/* Controls */}
          <div className="absolute bottom-6 flex items-center gap-4 bg-white/10 backdrop-blur-md rounded-full px-6 py-3">
            <button
              onClick={() => setFilmPlayIndex(Math.max(0, filmPlayIndex - 1))}
              disabled={filmPlayIndex === 0}
              className="text-white/80 hover:text-white disabled:text-white/20"
            >
              <SkipBack size={18} />
            </button>
            <button
              onClick={() => {
                if (filmPlaying) {
                  filmVideoRef.current?.pause();
                } else {
                  filmVideoRef.current?.play().catch(() => {});
                }
              }}
              className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white"
            >
              {filmPlaying ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button
              onClick={() =>
                setFilmPlayIndex(
                  Math.min(completedVideoShots.length - 1, filmPlayIndex + 1),
                )
              }
              disabled={filmPlayIndex >= completedVideoShots.length - 1}
              className="text-white/80 hover:text-white disabled:text-white/20"
            >
              <SkipForward size={18} />
            </button>
            <div className="w-px h-5 bg-white/20" />
            <button
              onClick={() => setMuted(!muted)}
              className="text-white/80 hover:text-white"
            >
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
          </div>

          {/* Shot strip */}
          <div className="absolute bottom-20 flex items-center gap-2 px-4 overflow-x-auto max-w-[80vw]">
            {completedVideoShots.map((shot, idx) => (
              <button
                key={shot.id}
                onClick={() => {
                  setFilmPlayIndex(idx);
                  setFilmPlaying(true);
                }}
                className={cn(
                  "w-16 h-10 rounded-md overflow-hidden border-2 transition-all shrink-0",
                  idx === filmPlayIndex
                    ? "border-violet-500 scale-110"
                    : "border-transparent opacity-60 hover:opacity-100",
                )}
              >
                <video
                  src={shot.videoUrl}
                  className="w-full h-full object-cover"
                  muted
                  playsInline
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

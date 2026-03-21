"use client";

import { useState, useCallback, useRef, useEffect, Fragment } from "react";
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
  ChevronUp,
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
  Send,
  MessageSquare,
  Lightbulb,
  Zap,
  Share2,
  Link as LinkIcon,
  MoveHorizontal,
  Hash,
  Globe,
  Lock,
  Shuffle,
  PanelRightOpen,
  PanelLeftOpen,
  Grid3X3,
  LayoutGrid,
  ArrowDown,
  ArrowUp,
  Crosshair,
  RotateCw,
  Bookmark,
  Heart,
  MoreHorizontal,
  Settings,
  Star,
  Search,
  SlidersHorizontal,
  Music,
  Mic,
  AudioWaveform,
  MonitorSpeaker,
  Pencil,
  MousePointer2,
  Square,
  Type,
  Eraser,
  Library,
  BookOpen,
  FileJson,
  Gauge,
  BadgeCheck,
  Cpu,
  Sun,
  FileDown,
  GitBranch,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ==========================================================================
// Types
// ==========================================================================

type GenerationMode =
  | "text-to-video"
  | "image-to-video"
  | "extend"
  | "reverse-extend"
  | "interpolate"
  | "text-to-image"
  | "modify-video"
  | "modify-image"
  | "modify-video-keyframes"
  | "character-ref"
  | "style-ref"
  | "image-ref"
  | "reframe"
  | "generate-audio"
  | "generate-sfx"
  | "voiceover"
  | "lip-sync";

type ShotPhase = "draft" | "hifi" | undefined;

type ShotStatus = "idle" | "queued" | "dreaming" | "completed" | "failed";

interface Shot {
  id: string;
  prompt: string;
  mode: GenerationMode;
  status: ShotStatus;
  generationId?: string;
  videoUrl?: string;
  imageUrl?: string;
  audioUrl?: string;
  thumbnailUrl?: string;
  model: string;
  resolution: string;
  aspectRatio: string;
  duration: string;
  loop: boolean;
  error?: string;
  createdAt: number;
  cameraMotion?: string;
  batchIndex?: number;
  parentShotId?: string;
  tags?: string[];
  liked?: boolean;
  bookmarked?: boolean;
  phase?: ShotPhase;
  hdr?: boolean;
}

interface Board {
  id: string;
  name: string;
  type: "storyboard" | "artboard" | "moodboard";
  shots: Shot[];
  createdAt: number;
  description?: string;
  isPublic?: boolean;
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

interface AgentMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  commandChain?: CommandChain;
}

interface CommandStep {
  id: string;
  name?: string;
  action: string;
  prompt: string;
  model: string;
  phase?: "draft" | "hifi";
  settings: Record<string, unknown>;
  depends_on: string | string[] | null;
  use_output_as: string | null;
  status?: "pending" | "running" | "completed" | "failed";
  result?: { videoUrl?: string; imageUrl?: string; audioUrl?: string; generationId?: string };
}

interface CommandChain {
  chain_name: string;
  description: string;
  continuity_sheet?: {
    style_anchor?: string;
    characters?: Record<string, string>;
    settings?: Record<string, string>;
  };
  steps: CommandStep[];
}

interface ContinuityEntry {
  id: string;
  type: "style" | "character" | "setting";
  name: string;
  content: string;
  createdAt: number;
}

interface AnnotationItem {
  id: string;
  type: "arrow" | "rect" | "text";
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  text?: string;
  color: string;
}

interface ConceptPill {
  word: string;
  alternatives: string[];
}

interface PromptVariation {
  title: string;
  prompt: string;
  style?: string;
}

type ViewMode = "boards" | "ideas";

// ==========================================================================
// Constants
// ==========================================================================

const VIDEO_MODELS = [
  { id: "ray-2", name: "Ray 2", desc: "High quality", tier: "premium" },
  { id: "ray-flash-2", name: "Ray Flash 2", desc: "Fast", tier: "standard" },
];

const IMAGE_MODELS = [
  { id: "photon-1", name: "Photon 1", desc: "High quality", tier: "premium" },
  { id: "photon-flash-1", name: "Photon Flash 1", desc: "Fast", tier: "standard" },
];

const AUDIO_MODELS = [
  { id: "musicgen", name: "MusicGen", desc: "Background music & scores (Meta)", tier: "standard" },
  { id: "bark", name: "Bark", desc: "Speech, voiceover & SFX (Suno)", tier: "standard" },
];

// Auto-model intelligence: recommended model per mode/intent
const AUTO_MODEL_MAP: Record<string, { video: string; image: string; reason: string }> = {
  "character-ref": { video: "ray-2", image: "photon-1", reason: "Character consistency requires full model" },
  "style-ref":     { video: "ray-2", image: "photon-1", reason: "Style transfer benefits from higher quality" },
  "modify-video":  { video: "ray-2", image: "photon-1", reason: "Modify needs Ray 2 quality" },
  "modify-video-keyframes": { video: "ray-2", image: "photon-1", reason: "Keyframe modify needs full Ray 2" },
  "text-to-video": { video: "ray-flash-2", image: "photon-flash-1", reason: "Draft first with flash, then upgrade" },
  "text-to-image": { video: "ray-flash-2", image: "photon-flash-1", reason: "Fast iteration for concept art" },
  "extend":        { video: "ray-2", image: "photon-1", reason: "Continuity needs full model" },
  "interpolate":   { video: "ray-2", image: "photon-1", reason: "Smooth transitions need full model" },
};

const RESOLUTIONS = ["540p", "720p", "1080p", "4k"];
const ASPECT_RATIOS = ["1:1", "3:4", "4:3", "9:16", "16:9", "9:21", "21:9"];
const DURATIONS = ["5s", "9s", "10s"];
const VALID_DURATIONS = new Set(["5s", "9s", "10s"]);
const normalizeDuration = (d: string | undefined): string | undefined => {
  if (!d) return undefined;
  if (VALID_DURATIONS.has(d)) return d;
  // Parse numeric value and snap to nearest valid duration
  const num = parseFloat(d);
  if (isNaN(num)) return "5s";
  if (num <= 7) return "5s";
  if (num <= 9.5) return "9s";
  return "10s";
};

const CAMERA_MOTIONS = [
  { id: "none", label: "None", desc: "No camera motion" },
  { id: "pan-left", label: "Pan Left", desc: "Camera pans left" },
  { id: "pan-right", label: "Pan Right", desc: "Camera pans right" },
  { id: "pan-up", label: "Pan Up", desc: "Camera tilts up" },
  { id: "pan-down", label: "Pan Down", desc: "Camera tilts down" },
  { id: "zoom-in", label: "Zoom In", desc: "Dolly zoom in" },
  { id: "zoom-out", label: "Zoom Out", desc: "Dolly zoom out" },
  { id: "orbit-left", label: "Orbit Left", desc: "Camera orbits left around subject" },
  { id: "orbit-right", label: "Orbit Right", desc: "Camera orbits right around subject" },
  { id: "crane-up", label: "Crane Up", desc: "Camera cranes upward" },
  { id: "crane-down", label: "Crane Down", desc: "Camera cranes down" },
  { id: "dolly-in", label: "Dolly In", desc: "Camera moves forward" },
  { id: "dolly-out", label: "Dolly Out", desc: "Camera moves backward" },
  { id: "tracking-left", label: "Track Left", desc: "Camera tracks alongside subject left" },
  { id: "tracking-right", label: "Track Right", desc: "Camera tracks alongside subject right" },
  { id: "handheld", label: "Handheld", desc: "Slight handheld shake" },
  { id: "static", label: "Static", desc: "Locked-off static shot" },
  { id: "arc", label: "Arc Shot", desc: "Camera arcs around subject" },
  { id: "dutch-tilt", label: "Dutch Tilt", desc: "Tilted/canted angle" },
  { id: "whip-pan", label: "Whip Pan", desc: "Fast whip pan transition" },
];

const MODIFY_MODES = [
  { id: "adhere_1", label: "Adhere 1", desc: "Subtle – minimal change", category: "subtle" },
  { id: "adhere_2", label: "Adhere 2", desc: "Subtle – light change", category: "subtle" },
  { id: "adhere_3", label: "Adhere 3", desc: "Subtle – moderate change", category: "subtle" },
  { id: "flex_1", label: "Flex 1", desc: "Moderate – balanced", category: "moderate" },
  { id: "flex_2", label: "Flex 2", desc: "Moderate – creative", category: "moderate" },
  { id: "flex_3", label: "Flex 3", desc: "Moderate – expressive", category: "moderate" },
  { id: "reimagine_1", label: "Reimagine 1", desc: "Dramatic – bold", category: "dramatic" },
  { id: "reimagine_2", label: "Reimagine 2", desc: "Dramatic – radical", category: "dramatic" },
  { id: "reimagine_3", label: "Reimagine 3", desc: "Dramatic – full reimagine", category: "dramatic" },
];

const MODE_TABS: { id: GenerationMode; label: string; icon: LucideIcon; group: "video" | "image" | "edit" | "audio" }[] = [
  { id: "text-to-video", label: "Text → Video", icon: Video, group: "video" },
  { id: "image-to-video", label: "Image → Video", icon: ArrowRight, group: "video" },
  { id: "extend", label: "Extend", icon: SkipForward, group: "video" },
  { id: "reverse-extend", label: "Reverse", icon: SkipBack, group: "video" },
  { id: "interpolate", label: "Interpolate", icon: ArrowLeftRight, group: "video" },
  { id: "text-to-image", label: "Text → Image", icon: ImageIcon, group: "image" },
  { id: "image-ref", label: "Image Ref", icon: Eye, group: "image" },
  { id: "character-ref", label: "Character", icon: Users, group: "image" },
  { id: "style-ref", label: "Style Ref", icon: Palette, group: "image" },
  { id: "modify-video", label: "Modify Video", icon: Wand2, group: "edit" },
  { id: "modify-video-keyframes", label: "Modify + KF", icon: GitBranch, group: "edit" },
  { id: "modify-image", label: "Modify Image", icon: Edit3, group: "edit" },
  { id: "reframe", label: "Reframe", icon: Maximize2, group: "edit" },
  { id: "generate-audio", label: "Music", icon: Music, group: "audio" },
  { id: "generate-sfx", label: "SFX", icon: AudioWaveform, group: "audio" },
  { id: "voiceover", label: "Voiceover", icon: Mic, group: "audio" },
  { id: "lip-sync", label: "Lip Sync", icon: MonitorSpeaker, group: "audio" },
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
    model: "ray-2",
    resolution: "720p",
    aspectRatio: "16:9",
    duration: "5s",
    loop: false,
    createdAt: Date.now(),
    tags: [],
    liked: false,
    bookmarked: false,
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
    isPublic: false,
  };
}

// ==========================================================================
// Sub-components
// ==========================================================================

function StatusBadge({ status }: { status: ShotStatus }) {
  const styles: Record<ShotStatus, string> = {
    idle: "bg-zinc-500/20 text-zinc-400",
    queued: "bg-yellow-500/20 text-yellow-400",
    dreaming: "bg-purple-500/20 text-purple-400 animate-pulse",
    completed: "bg-green-500/20 text-green-400",
    failed: "bg-red-500/20 text-red-400",
  };
  const labels: Record<ShotStatus, string> = {
    idle: "Ready",
    queued: "Queued",
    dreaming: "Dreaming…",
    completed: "Done",
    failed: "Failed",
  };
  return (
    <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", styles[status])}>
      {labels[status]}
    </span>
  );
}

function ConceptPillsBar({
  concepts,
  prompt,
  onSwap,
}: {
  concepts: ConceptPill[];
  prompt: string;
  onSwap: (oldWord: string, newWord: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!concepts.length) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {concepts.map((c) => (
        <div key={c.word} className="relative">
          <button
            onClick={() => setExpanded(expanded === c.word ? null : c.word)}
            className={cn(
              "px-2 py-0.5 rounded-full text-[10px] font-medium border transition-all",
              expanded === c.word
                ? "border-violet-500 bg-violet-500/20 text-violet-300"
                : "border-pplx-border bg-pplx-card text-pplx-muted hover:border-violet-500/50",
            )}
          >
            {c.word}
          </button>
          {expanded === c.word && (
            <div className="absolute top-full left-0 mt-1 bg-pplx-card border border-pplx-border rounded-lg shadow-xl z-50 py-1 min-w-[120px]">
              {c.alternatives.map((alt) => (
                <button
                  key={alt}
                  onClick={() => {
                    onSwap(c.word, alt);
                    setExpanded(null);
                  }}
                  className="w-full text-left px-3 py-1 text-[11px] text-pplx-muted hover:bg-white/5 hover:text-pplx-text"
                >
                  {alt}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ==========================================================================
// Main Component
// ==========================================================================

interface DreamscapeClientProps {
  /** When true, the AI Agent panel starts open by default */
  defaultAgentOpen?: boolean;
}

export function DreamscapeClient({ defaultAgentOpen = false }: DreamscapeClientProps = {}) {
  // --------------- Board State ---------------
  // Initialize with a stable default for SSR — load persisted state from
  // localStorage in a useEffect after mount to avoid hydration mismatch.
  const defaultBoard = useRef(makeBoard("My Project"));
  const [boards, setBoards] = useState<Board[]>([defaultBoard.current]);
  const [activeBoardId, setActiveBoardId] = useState<string>(defaultBoard.current.id);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let loadedBoards: Board[] = [];
    try {
      const savedBoards = localStorage.getItem("ds:boards");
      const savedActiveId = localStorage.getItem("ds:activeBoardId");
      if (savedBoards) {
        const parsed = JSON.parse(savedBoards) as Board[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          loadedBoards = parsed;
          setBoards(parsed);
          const validId = savedActiveId && parsed.some((b) => b.id === savedActiveId)
            ? savedActiveId
            : parsed[0].id;
          setActiveBoardId(validId);
          setSelectedShotId(parsed.find((b) => b.id === validId)?.shots[0]?.id ?? null);
        }
      }
    } catch { /* ignore */ }
    // Load continuity library
    try {
      const savedLib = localStorage.getItem("ds:continuityLibrary");
      if (savedLib) {
        const parsed = JSON.parse(savedLib) as ContinuityEntry[];
        if (Array.isArray(parsed)) setContinuityLibrary(parsed);
      }
    } catch { /* ignore */ }
    // Suppress unused variable warning — loadedBoards read below via closure
    void loadedBoards;
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [editingBoardName, setEditingBoardName] = useState(false);
  const [boardNameDraft, setBoardNameDraft] = useState("");
  const [showBoardMenu, setShowBoardMenu] = useState(false);

  // --------------- View State ---------------
  const [viewMode, setViewMode] = useState<ViewMode>("boards");
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [agentPanelOpen, setAgentPanelOpen] = useState(defaultAgentOpen);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // --------------- Shot State ---------------
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);

  // --------------- Generation Panel ---------------
  const [mode, setMode] = useState<GenerationMode>("text-to-video");
  const [prompt, setPrompt] = useState("");
  const [videoModel, setVideoModel] = useState("ray-2");
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
  const [imageRefUrl, setImageRefUrl] = useState("");
  const [imageRefWeight, setImageRefWeight] = useState(0.5);
  const [characters, setCharacters] = useState<CharacterIdentity[]>([]);
  const [charImageUrl, setCharImageUrl] = useState("");
  const [cameraMotion, setCameraMotion] = useState("none");
  const [showCameraMotions, setShowCameraMotions] = useState(false);
  const [batchCount, setBatchCount] = useState(1);
  // Audio state
  const [audioModel, setAudioModel] = useState("elevenlabs-music");
  const [voiceoverText, setVoiceoverText] = useState("");
  const [lipSyncVideoUrl, setLipSyncVideoUrl] = useState("");
  const [lipSyncAudioUrl, setLipSyncAudioUrl] = useState("");
  // HDR + Phase
  const [hdrEnabled, setHdrEnabled] = useState(false);
  const [autoModelEnabled, setAutoModelEnabled] = useState(true);
  // Modify with Keyframes
  const [modifyKfStartUrl, setModifyKfStartUrl] = useState("");
  const [modifyKfEndUrl, setModifyKfEndUrl] = useState("");
  const [modifyKfSourceUrl, setModifyKfSourceUrl] = useState("");

  // --------------- Provider State ---------------
  const [provider, setProvider] = useState<Provider>("auto");
  const [availableProviders, setAvailableProviders] = useState<{ luma: boolean; replicate: boolean }>({ luma: false, replicate: false });
  const [replicateModels, setReplicateModels] = useState<ReplicateModelInfo[]>([]);
  const [selectedReplicateModel, setSelectedReplicateModel] = useState("");

  // --------------- Agent State ---------------
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);
  const [agentInput, setAgentInput] = useState("");
  const [agentLoading, setAgentLoading] = useState(false);
  const agentScrollRef = useRef<HTMLDivElement>(null);

  // --------------- Command Chain State ---------------
  const [activeChain, setActiveChain] = useState<CommandChain | null>(null);
  const [chainRunning, setChainRunning] = useState(false);
  const [chainProgress, setChainProgress] = useState(0);

  // --------------- Creative Query State ---------------
  const [showCreativeQuery, setShowCreativeQuery] = useState(false);
  const [creativeQueryLoading, setCreativeQueryLoading] = useState(false);
  const [promptVariations, setPromptVariations] = useState<PromptVariation[]>([]);

  // --------------- Concept Pills ---------------
  const [conceptPills, setConceptPills] = useState<ConceptPill[]>([]);

  // --------------- More Like This ---------------
  const [showMoreLikeThis, setShowMoreLikeThis] = useState(false);
  const [moreLikeThisLoading, setMoreLikeThisLoading] = useState(false);
  const [moreLikeThisVariations, setMoreLikeThisVariations] = useState<PromptVariation[]>([]);

  // --------------- Share State ---------------
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLink, setShareLink] = useState("");

  // --------------- Continuity Library ---------------
  const [continuityLibrary, setContinuityLibrary] = useState<ContinuityEntry[]>([]);
  const [showContinuityLibrary, setShowContinuityLibrary] = useState(false);
  const [newContinuityType, setNewContinuityType] = useState<ContinuityEntry["type"]>("style");
  const [newContinuityName, setNewContinuityName] = useState("");
  const [newContinuityContent, setNewContinuityContent] = useState("");

  // --------------- Board Description ---------------
  const [editingBoardDesc, setEditingBoardDesc] = useState(false);
  const [boardDescDraft, setBoardDescDraft] = useState("");

  // --------------- Annotations ---------------
  const [annotations, setAnnotations] = useState<AnnotationItem[]>([]);
  const [annotationMode, setAnnotationMode] = useState<"none" | "arrow" | "rect" | "text">("none");
  const [showAnnotations, setShowAnnotations] = useState(false);
  const annotationCanvasRef = useRef<SVGSVGElement>(null);
  const [annotationDrawing, setAnnotationDrawing] = useState(false);
  const [annotationStart, setAnnotationStart] = useState<{ x: number; y: number } | null>(null);

  // --------------- Polling Refs ---------------
  const pollingRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // --------------- Film Player ---------------
  const [filmPlayerOpen, setFilmPlayerOpen] = useState(false);
  const [filmPlayIndex, setFilmPlayIndex] = useState(0);
  const [filmPlaying, setFilmPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const filmVideoRef = useRef<HTMLVideoElement>(null);

  // --------------- Preview ---------------
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);

  // --------------- UI ---------------
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // =======================================================================
  // Derived state
  // =======================================================================
  const board = boards.find((b) => b.id === activeBoardId) ?? boards[0];
  const selectedShot = board?.shots.find((s) => s.id === selectedShotId) ?? null;
  const completedVideoShots = board?.shots.filter((s) => s.videoUrl) ?? [];

  // ─── Background ops tracking ─────────────────────────────────────────────
  useEffect(() => {
    const dreamingShots = board?.shots.filter(s => s.status === "queued" || s.status === "dreaming") ?? [];
    if (dreamingShots.length > 0) {
      addBackgroundOp({
        id: "dreamscape-gen",
        type: "video",
        label: "Video Producer",
        status: "running",
        href: "/computer/dreamscape",
        startedAt: Date.now(),
        detail: `${dreamingShots.length} shot${dreamingShots.length > 1 ? "s" : ""} generating`,
      });
    } else {
      removeBackgroundOp("dreamscape-gen");
    }
  }, [board?.shots]);
  const allIdeas = boards.flatMap((b) => b.shots.filter((s) => s.status === "completed"));
  const isVideoMode = ["text-to-video", "image-to-video", "extend", "reverse-extend", "interpolate", "modify-video", "modify-video-keyframes", "reframe"].includes(mode);
  const isAudioMode = ["generate-audio", "generate-sfx", "voiceover", "lip-sync"].includes(mode);
  const currentModels = isAudioMode ? AUDIO_MODELS : isVideoMode ? VIDEO_MODELS : IMAGE_MODELS;
  const currentModel = isAudioMode ? audioModel : isVideoMode ? videoModel : imageModel;
  const setCurrentModel = isAudioMode ? setAudioModel : isVideoMode ? setVideoModel : setImageModel;
  // Auto-model recommendation
  const autoModelRec = AUTO_MODEL_MAP[mode];
  const recommendedModel = autoModelEnabled && autoModelRec ? (isVideoMode ? autoModelRec.video : autoModelRec.image) : null;

  // Filtered ideas
  const filteredIdeas = searchQuery
    ? allIdeas.filter(
        (s) =>
          s.prompt.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.tags?.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase())),
      )
    : allIdeas;

  // =======================================================================
  // Effects
  // =======================================================================

  // -- Fetch available providers on mount
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

  // -- Import agent-created board via ?import=taskId
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const importTaskId = params.get("import");
    if (!importTaskId) return;
    (async () => {
      try {
        const filesRes = await fetch(`/api/files?taskId=${importTaskId}`);
        if (!filesRes.ok) return;
        const files = (await filesRes.json()) as Array<{ name: string; task_id: string }>;
        const boardFile = files.find((f) => f.name.endsWith("_board.json") && f.task_id === importTaskId);
        if (!boardFile) return;
        const boardRes = await fetch(`/api/files/${importTaskId}/${boardFile.name}`);
        if (!boardRes.ok) return;
        const imported = (await boardRes.json()) as Board;
        if (!imported?.id || !Array.isArray(imported?.shots)) return;
        const freshBoard: Board = { ...imported, id: uid(), shots: imported.shots.map((s) => ({ ...s, id: uid() })) };
        setBoards((prev) => (prev.some((b) => b.name === imported.name) ? prev : [...prev, freshBoard]));
        setActiveBoardId(freshBoard.id);
        setSelectedShotId(freshBoard.shots[0]?.id ?? null);
        const url = new URL(window.location.href);
        url.searchParams.delete("import");
        window.history.replaceState({}, "", url.toString());
      } catch { /* ignore */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -- Persist boards (only after hydration to avoid clobbering localStorage with default)
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem("ds:boards", JSON.stringify(boards)); } catch { /* ignore */ }
  }, [boards, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try { if (activeBoardId) localStorage.setItem("ds:activeBoardId", activeBoardId); } catch { /* ignore */ }
  }, [activeBoardId, hydrated]);

  // -- Persist continuity library
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem("ds:continuityLibrary", JSON.stringify(continuityLibrary)); } catch { /* ignore */ }
  }, [continuityLibrary, hydrated]);

  // -- Resume polling on mount for any in-flight shots — handled in the hydration useEffect above

  // -- Cleanup polling on unmount
  useEffect(() => {
    return () => {
      pollingRef.current.forEach((interval) => clearInterval(interval));
    };
  }, []);

  // -- Auto-scroll agent chat
  useEffect(() => {
    if (agentScrollRef.current) {
      agentScrollRef.current.scrollTop = agentScrollRef.current.scrollHeight;
    }
  }, [agentMessages]);

  // -- Set initial selectedShotId once boards are ready
  useEffect(() => {
    if (!selectedShotId && activeBoardId) {
      const active = boards.find((b) => b.id === activeBoardId);
      if (active?.shots[0]?.id) setSelectedShotId(active.shots[0].id);
    }
  }, [activeBoardId, boards, selectedShotId]);

  // =======================================================================
  // Board Operations
  // =======================================================================
  const updateBoard = useCallback(
    (fn: (b: Board) => Board) => {
      setBoards((prev) => prev.map((b) => (b.id === activeBoardId ? fn(b) : b)));
    },
    [activeBoardId],
  );

  const createBoard = () => {
    const b = makeBoard(`Project ${boards.length + 1}`);
    setBoards((prev) => [...prev, b]);
    setActiveBoardId(b.id);
    setSelectedShotId(b.shots[0]?.id ?? null);
  };

  const duplicateBoard = () => {
    if (!board) return;
    const dup: Board = {
      ...board,
      id: uid(),
      name: `${board.name} (Copy)`,
      shots: board.shots.map((s) => ({ ...s, id: uid() })),
      createdAt: Date.now(),
    };
    setBoards((prev) => [...prev, dup]);
    setActiveBoardId(dup.id);
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

  // =======================================================================
  // Shot Operations
  // =======================================================================
  const addShot = () => {
    const shot = makeShot();
    updateBoard((b) => ({ ...b, shots: [...b.shots, shot] }));
    setSelectedShotId(shot.id);
  };

  const removeShot = (shotId: string) => {
    updateBoard((b) => ({ ...b, shots: b.shots.filter((s) => s.id !== shotId) }));
    if (selectedShotId === shotId) {
      setSelectedShotId(board.shots.find((s) => s.id !== shotId)?.id ?? null);
    }
  };

  const duplicateShot = (shotId: string) => {
    const orig = board.shots.find((s) => s.id === shotId);
    if (!orig) return;
    const dup: Shot = { ...orig, id: uid(), status: "idle", generationId: undefined, createdAt: Date.now() };
    updateBoard((b) => {
      const idx = b.shots.findIndex((s) => s.id === shotId);
      const shots = [...b.shots];
      shots.splice(idx + 1, 0, dup);
      return { ...b, shots };
    });
    setSelectedShotId(dup.id);
  };

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

  const toggleShotLike = (shotId: string) => {
    updateShot(shotId, { liked: !board.shots.find((s) => s.id === shotId)?.liked });
  };

  const toggleShotBookmark = (shotId: string) => {
    updateShot(shotId, { bookmarked: !board.shots.find((s) => s.id === shotId)?.bookmarked });
  };

  // =======================================================================
  // Save completed generation to Files system
  // =======================================================================
  const saveGenerationToFiles = useCallback(
    async (shotId: string, urls: { videoUrl?: string; imageUrl?: string; audioUrl?: string }) => {
      // Find the shot to get the prompt
      let shotPrompt = "";
      for (const b of boards) {
        const s = b.shots.find((sh) => sh.id === shotId);
        if (s) { shotPrompt = s.prompt; break; }
      }
      const mediaUrl = urls.videoUrl || urls.imageUrl || urls.audioUrl;
      if (!mediaUrl) return;
      try {
        await fetch("/api/files/save-generation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: mediaUrl,
            source: "dreamscape",
            prompt: shotPrompt || undefined,
            metadata: { shotId, ...urls },
          }),
        });
      } catch { /* non-blocking */ }
    },
    [boards],
  );

  // =======================================================================
  // Polling
  // =======================================================================
  const pollGeneration = useCallback(
    (generationId: string, shotId: string) => {
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
            const videoUrl = data.assets?.video ?? data.output?.[0] ?? undefined;
            const imageUrl = data.assets?.image ?? data.output?.[0] ?? undefined;
            const audioUrl = data.assets?.audio ?? undefined;
            updateShot(shotId, {
              status: "completed",
              videoUrl,
              imageUrl,
              audioUrl,
            });
            // Save completed generation to Files
            saveGenerationToFiles(shotId, { videoUrl, imageUrl, audioUrl });
          } else if (data.state === "failed" || data.status === "failed" || data.status === "canceled") {
            clearInterval(interval);
            pollingRef.current.delete(shotId);
            updateShot(shotId, { status: "failed", error: data.failure_reason || data.error || "Generation failed" });
          } else {
            updateShot(shotId, { status: data.state === "dreaming" ? "dreaming" : "queued" });
          }
        } catch { /* retry silently */ }
      }, 3000);

      pollingRef.current.set(shotId, interval);
    },
    [updateShot, saveGenerationToFiles],
  );

  // Resume polling for in-flight shots once the real boards are hydrated from localStorage
  const pollResumedRef = useRef(false);
  useEffect(() => {
    if (!hydrated || pollResumedRef.current) return;
    pollResumedRef.current = true;
    const STALE_MS = 15 * 60 * 1000;
    const now = Date.now();
    boards.forEach((b) => {
      b.shots.forEach((s) => {
        if ((s.status === "queued" || s.status === "dreaming") && s.generationId) {
          if (now - s.createdAt < STALE_MS) {
            pollGeneration(s.generationId, s.id);
          } else {
            updateShot(s.id, { status: "failed", error: "Generation expired — please retry" });
          }
        }
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // =======================================================================
  // Generation
  // =======================================================================
  const generateSingle = async (shotId: string, promptText: string, genMode: GenerationMode) => {
    const body: Record<string, unknown> = {};
    const activeModel = isVideoMode ? videoModel : imageModel;

    // Append camera motion to prompt
    let finalPrompt = promptText;
    if (cameraMotion !== "none" && isVideoMode) {
      const motionLabel = CAMERA_MOTIONS.find((m) => m.id === cameraMotion)?.label ?? "";
      finalPrompt = `${promptText}. Camera: ${motionLabel}`;
    }

    switch (genMode) {
      case "text-to-video":
        Object.assign(body, {
          action: "generate-video", prompt: finalPrompt, model: videoModel, resolution, aspect_ratio: aspectRatio, duration, loop,
        });
        break;
      case "image-to-video":
        if (!imageUrl.trim()) throw new Error("Provide a start image URL");
        Object.assign(body, {
          action: "generate-video", prompt: finalPrompt, model: videoModel, resolution, aspect_ratio: aspectRatio, duration,
          keyframes: { frame0: { type: "image", url: imageUrl.trim() }, ...(endImageUrl.trim() ? { frame1: { type: "image", url: endImageUrl.trim() } } : {}) },
        });
        break;
      case "extend": {
        const prev = board.shots.find((s) => s.id !== shotId && s.generationId && s.status === "completed");
        if (!prev?.generationId) throw new Error("No completed shot to extend from");
        Object.assign(body, {
          action: "generate-video", prompt: finalPrompt, model: videoModel,
          keyframes: { frame0: { type: "generation", id: prev.generationId } },
        });
        break;
      }
      case "reverse-extend": {
        const prev = board.shots.find((s) => s.id !== shotId && s.generationId && s.status === "completed");
        if (!prev?.generationId) throw new Error("No completed shot to reverse-extend from");
        Object.assign(body, {
          action: "generate-video", prompt: finalPrompt, model: videoModel,
          keyframes: { frame1: { type: "generation", id: prev.generationId } },
        });
        break;
      }
      case "interpolate": {
        const completed = board.shots.filter((s) => s.generationId && s.status === "completed");
        if (completed.length < 2) throw new Error("Need at least 2 completed shots to interpolate");
        Object.assign(body, {
          action: "generate-video", prompt: finalPrompt, model: videoModel,
          keyframes: {
            frame0: { type: "generation", id: completed[0].generationId },
            frame1: { type: "generation", id: completed[completed.length - 1].generationId },
          },
        });
        break;
      }
      case "text-to-image":
        Object.assign(body, { action: "generate-image", prompt: finalPrompt, model: imageModel, aspect_ratio: aspectRatio });
        break;
      case "image-ref":
        Object.assign(body, {
          action: "generate-image", prompt: finalPrompt, model: imageModel, aspect_ratio: aspectRatio,
          image_ref: imageRefUrl.trim() ? [{ url: imageRefUrl.trim(), weight: imageRefWeight }] : undefined,
        });
        break;
      case "style-ref":
        Object.assign(body, {
          action: "generate-image", prompt: finalPrompt, model: imageModel, aspect_ratio: aspectRatio,
          style_ref: styleRefUrl.trim() ? [{ url: styleRefUrl.trim(), weight: styleRefWeight }] : undefined,
        });
        break;
      case "character-ref": {
        const charRef: Record<string, { images: { url: string }[] }> = {};
        characters.forEach((c, i) => {
          charRef[`identity${i}`] = { images: c.images.map((url) => ({ url })) };
        });
        Object.assign(body, {
          action: "generate-image", prompt: finalPrompt, model: imageModel, aspect_ratio: aspectRatio,
          character_ref: Object.keys(charRef).length > 0 ? charRef : undefined,
        });
        break;
      }
      case "modify-video":
        if (!mediaUrl.trim()) throw new Error("Provide a video URL to modify");
        Object.assign(body, { action: "modify-video", prompt: finalPrompt, model: videoModel, mode: modifyMode, media: { url: mediaUrl.trim() } });
        break;
      case "modify-image":
        if (!mediaUrl.trim()) throw new Error("Provide an image URL to modify");
        Object.assign(body, { action: "generate-image", prompt: finalPrompt, model: imageModel, aspect_ratio: aspectRatio, image_ref: [{ url: mediaUrl.trim(), weight: 0.7 }] });
        break;
      case "reframe":
        if (!mediaUrl.trim()) throw new Error("Provide a media URL to reframe");
        Object.assign(body, { action: "reframe", prompt: finalPrompt || undefined, model: videoModel, aspect_ratio: reframeAspect, media: { url: mediaUrl.trim() } });
        break;
      case "modify-video-keyframes":
        if (!modifyKfSourceUrl.trim()) throw new Error("Provide a video URL to modify with keyframes");
        Object.assign(body, {
          action: "modify-video", prompt: finalPrompt, model: videoModel, mode: modifyMode,
          media: { url: modifyKfSourceUrl.trim() },
          keyframes: {
            ...(modifyKfStartUrl.trim() ? { frame0: { type: "image", url: modifyKfStartUrl.trim() } } : {}),
            ...(modifyKfEndUrl.trim() ? { frame1: { type: "image", url: modifyKfEndUrl.trim() } } : {}),
          },
        });
        break;
      case "generate-audio":
        Object.assign(body, {
          action: "generate-audio", prompt: finalPrompt, model: audioModel, duration, type: "music",
        });
        break;
      case "generate-sfx":
        Object.assign(body, {
          action: "generate-sfx", prompt: finalPrompt, model: audioModel, duration, type: "sfx",
        });
        break;
      case "voiceover":
        Object.assign(body, {
          action: "voiceover", prompt: finalPrompt, model: audioModel, type: "voiceover",
          script: voiceoverText || finalPrompt,
        });
        break;
      case "lip-sync":
        if (!lipSyncVideoUrl.trim()) throw new Error("Provide a video URL for lip sync");
        if (!lipSyncAudioUrl.trim()) throw new Error("Provide an audio URL for lip sync");
        Object.assign(body, {
          action: "lip-sync", prompt: finalPrompt, model: audioModel, type: "lip-sync",
          video_url: lipSyncVideoUrl.trim(), audio_url: lipSyncAudioUrl.trim(),
        });
        break;
    }

    body.provider = provider;
    if ((provider === "replicate" || provider === "auto") && selectedReplicateModel) {
      body.replicate_model = selectedReplicateModel;
    }
    if (hdrEnabled && isVideoMode) body.hdr = true;

    const res = await fetch("/api/luma", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "Generation failed");

    updateShot(shotId, {
      generationId: data.id,
      status: data.state === "completed" ? "completed" : "queued",
      videoUrl: data.assets?.video ?? undefined,
      imageUrl: data.assets?.image ?? undefined,
      audioUrl: data.assets?.audio ?? undefined,
      model: (body.model as string) || activeModel,
      cameraMotion,
      hdr: hdrEnabled && isVideoMode,
    });

    if (!data.id) {
      updateShot(shotId, { status: "failed", error: data.error || "No generation ID returned — check your API key/credits" });
      return;
    }
    if (data.state !== "completed" && data.state !== "failed") {
      pollGeneration(data.id, shotId);
    }
  };

  const generate = async () => {
    if (!prompt.trim() && mode !== "reframe" && !isAudioMode) { setError("Enter a prompt"); return; }
    setError("");
    setGenerating(true);

    // Auto-model selection
    if (autoModelEnabled && recommendedModel && recommendedModel !== currentModel) {
      setCurrentModel(recommendedModel);
    }

    // Append annotation context to prompt if any
    let finalPrompt = prompt;
    if (annotations.length > 0) finalPrompt += annotationsToPromptContext();

    try {
      // Batch generation support
      const count = Math.max(1, Math.min(4, batchCount));
      for (let i = 0; i < count; i++) {
        let shotId = selectedShotId;
        if (i > 0 || !shotId) {
          const shot = makeShot({ prompt: finalPrompt, mode, batchIndex: i, phase: videoModel.includes("flash") || imageModel.includes("flash") ? "draft" : undefined });
          updateBoard((b) => ({ ...b, shots: [...b.shots, shot] }));
          shotId = shot.id;
          if (i === 0) setSelectedShotId(shot.id);
        }
        updateShot(shotId, { prompt: finalPrompt, mode, status: "queued", phase: (isVideoMode && videoModel.includes("flash")) || (!isVideoMode && imageModel.includes("flash")) ? "draft" : undefined });
        await generateSingle(shotId, finalPrompt, mode);
      }
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setGenerating(false);
    }
  };

  // =======================================================================
  // AI Agent
  // =======================================================================
  const sendAgentMessage = async () => {
    if (!agentInput.trim() || agentLoading) return;
    const userMsg: AgentMessage = { role: "user", content: agentInput, timestamp: Date.now() };
    setAgentMessages((prev) => [...prev, userMsg]);
    setAgentInput("");
    setAgentLoading(true);

    try {
      const history = agentMessages.map((m) => ({ role: m.role, content: m.content }));
      // Build enriched message with board context + continuity library
      let enrichedMessage = agentInput;
      if (board?.description) enrichedMessage += `\n\n[Board Description: ${board.description}]`;
      enrichedMessage += getContinuityContext();
      if (annotations.length > 0) enrichedMessage += annotationsToPromptContext();
      const res = await fetch("/api/dreamscape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "agent", message: enrichedMessage, history }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Agent request failed");

      // Try to parse command chain from response (always attempt — unified agent can output chains at any time)
      let chain: CommandChain | undefined;
      try {
        const jsonMatch = data.response.match(/```json\s*([\s\S]*?)```/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[1]);
          if (parsed.steps && Array.isArray(parsed.steps)) {
            chain = parsed as CommandChain;
            chain.steps = chain.steps.map((s) => ({ ...s, status: "pending" }));
          }
        }
      } catch { /* not a chain */ }

      const assistantMsg: AgentMessage = {
        role: "assistant",
        content: data.response,
        timestamp: Date.now(),
        commandChain: chain,
      };
      setAgentMessages((prev) => [...prev, assistantMsg]);

      if (chain) setActiveChain(chain);
    } catch (err) {
      setAgentMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${err instanceof Error ? err.message : String(err)}`, timestamp: Date.now() },
      ]);
    } finally {
      setAgentLoading(false);
    }
  };

  // =======================================================================
  // Command Chain Validation & Sanitization
  // =======================================================================

  /** Fix common LLM mistakes in a command step before sending to API */
  function sanitizeStep(step: CommandStep): CommandStep {
    const s = { ...step, settings: { ...step.settings } };

    // Model ↔ Action enforcement
    const videoActions = new Set(["generate-video", "extend", "reverse-extend", "interpolate", "modify-video", "modify-video-keyframes", "reframe", "upscale"]);
    const imageActions = new Set(["generate-image"]);
    const audioActions = new Set(["generate-audio", "generate-sfx", "voiceover", "lip-sync", "add-audio"]);

    if (videoActions.has(s.action) && !["ray-2", "ray-flash-2"].includes(s.model)) {
      console.warn(`[Chain Sanitize] Step "${s.name}": model "${s.model}" invalid for ${s.action}, fixing to ray-2`);
      s.model = s.model?.includes("flash") ? "ray-flash-2" : "ray-2";
    }
    if (imageActions.has(s.action) && !["photon-1", "photon-flash-1"].includes(s.model)) {
      console.warn(`[Chain Sanitize] Step "${s.name}": model "${s.model}" invalid for ${s.action}, fixing to photon-1`);
      s.model = s.model?.includes("flash") ? "photon-flash-1" : "photon-1";
    }
    // Audio actions don't need model correction — the API route handles audio model routing

    // Duration enforcement
    const dur = s.settings.duration as string | undefined;
    if (dur && !["5s", "9s", "10s"].includes(dur)) {
      const num = parseFloat(String(dur).replace(/[^0-9.]/g, ""));
      s.settings.duration = isNaN(num) || num <= 7 ? "5s" : num <= 9.5 ? "9s" : "10s";
      console.warn(`[Chain Sanitize] Step "${s.name}": duration "${dur}" → "${s.settings.duration}"`);
    }
    // Flash models can't do 10s
    if (s.model?.includes("flash") && s.settings.duration === "10s") {
      s.settings.duration = "9s";
    }

    // Aspect ratio enforcement
    const validAR = new Set(["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "9:21"]);
    const ar = s.settings.aspect_ratio as string | undefined;
    if (ar && !validAR.has(ar)) {
      s.settings.aspect_ratio = "16:9"; // safe default
      console.warn(`[Chain Sanitize] Step "${s.name}": aspect_ratio "${ar}" → "16:9"`);
    }

    // Resolution enforcement — strip invalid values, prefer omitting to avoid "no access" errors
    const validRes = new Set(["540p", "720p", "1080p", "4k"]);
    const res = s.settings.resolution as string | undefined;
    if (res && !validRes.has(res)) {
      delete s.settings.resolution;
      console.warn(`[Chain Sanitize] Step "${s.name}": resolution "${res}" removed (invalid)`);
    }

    // Boolean enforcement
    if (s.settings.hdr !== undefined) s.settings.hdr = s.settings.hdr === true || s.settings.hdr === "true";
    if (s.settings.loop !== undefined) s.settings.loop = s.settings.loop === true || s.settings.loop === "true";

    // modify-video must have a mode
    if (s.action === "modify-video" && !s.settings.mode) {
      s.settings.mode = "flex_1";
      console.warn(`[Chain Sanitize] Step "${s.name}": modify-video missing mode, defaulted to flex_1`);
    }

    // upscale steps must reference a generation
    if (s.action === "upscale" && !s.settings.generation_id && !s.depends_on) {
      console.warn(`[Chain Sanitize] Step "${s.name}": upscale needs generation_id or depends_on`);
    }

    // add-audio steps must have a prompt
    if (s.action === "add-audio" && !s.prompt && !s.settings.prompt) {
      console.warn(`[Chain Sanitize] Step "${s.name}": add-audio missing prompt for audio description`);
    }

    // Concepts validation — ensure proper array format
    if (s.settings.concepts) {
      if (Array.isArray(s.settings.concepts)) {
        const validKeys = new Set(["dolly_zoom", "orbit_right", "orbit_left", "pull_out", "tilt_down", "tilt_up", "hand_held", "zoom_in", "zoom_out", "aerial_drone", "pedestal_up", "pedestal_down", "tiny_planet", "bolt_camera"]);
        s.settings.concepts = (s.settings.concepts as Array<{key: string}>).filter(c => c && typeof c === "object" && validKeys.has(c.key));
        if ((s.settings.concepts as Array<{key: string}>).length === 0) delete s.settings.concepts;
      } else {
        delete s.settings.concepts;
        console.warn(`[Chain Sanitize] Step "${s.name}": concepts must be an array, removed`);
      }
    }

    return s;
  }

  /** Validate entire chain before execution — returns list of issues found (and auto-fixed) */
  function validateChain(chain: CommandChain): string[] {
    const issues: string[] = [];
    const stepIds = new Set(chain.steps.map(s => s.id));

    for (const step of chain.steps) {
      // Check for orphaned dependencies
      const deps = Array.isArray(step.depends_on) ? step.depends_on : (step.depends_on ? [step.depends_on] : []);
      const validDeps = deps.filter(d => {
        if (!stepIds.has(d)) {
          issues.push(`Step "${step.name}" depends on "${d}" which doesn't exist — dependency removed`);
          return false;
        }
        if (d === step.id) {
          issues.push(`Step "${step.name}" depends on itself — dependency removed`);
          return false;
        }
        return true;
      });
      step.depends_on = validDeps.length === 0 ? null : validDeps.length === 1 ? validDeps[0] : validDeps;

      // Check for required fields
      if (!step.prompt && !["lip-sync", "reframe", "upscale", "add-audio"].includes(step.action)) {
        issues.push(`Step "${step.name}" has no prompt`);
      }
      if (!step.model) {
        issues.push(`Step "${step.name}" has no model — will use defaults`);
      }

      // Voiceover must have script
      if (step.action === "voiceover" && !step.settings?.script) {
        issues.push(`Step "${step.name}" is a voiceover but missing "script" field`);
      }
    }

    // Check for circular dependencies
    const visited = new Set<string>();
    const visiting = new Set<string>();
    function hasCycle(stepId: string): boolean {
      if (visiting.has(stepId)) return true;
      if (visited.has(stepId)) return false;
      visiting.add(stepId);
      const step = chain.steps.find(s => s.id === stepId);
      const deps = step ? (Array.isArray(step.depends_on) ? step.depends_on : (step.depends_on ? [step.depends_on] : [])) : [];
      for (const dep of deps) {
        if (hasCycle(dep)) return true;
      }
      visiting.delete(stepId);
      visited.add(stepId);
      return false;
    }
    for (const step of chain.steps) {
      if (hasCycle(step.id)) {
        issues.push(`Circular dependency detected involving "${step.name}" — dependencies cleared`);
        step.depends_on = null;
        step.use_output_as = null;
      }
    }

    if (issues.length > 0) {
      console.warn(`[Chain Validate] ${issues.length} issue(s):`, issues);
    }
    return issues;
  }

  // =======================================================================
  // Command Chain Execution (with parallel independent steps)
  // =======================================================================
  const executeChain = async (chain: CommandChain) => {
    // Pre-execution validation — fix issues before they cause API errors
    const issues = validateChain(chain);
    if (issues.length > 0) {
      console.log(`[Chain] Auto-fixed ${issues.length} issue(s) before execution`);
    }

    setChainRunning(true);
    setChainProgress(0);
    const totalSteps = chain.steps.length;
    let completedCount = 0;

    // Save continuity sheet from chain to library if present
    if (chain.continuity_sheet) {
      const cs = chain.continuity_sheet;
      if (cs.style_anchor && !continuityLibrary.some((e) => e.content === cs.style_anchor)) {
        setContinuityLibrary((prev) => [...prev, { id: uid(), type: "style", name: `Chain: ${chain.chain_name}`, content: cs.style_anchor!, createdAt: Date.now() }]);
      }
      if (cs.characters) {
        Object.entries(cs.characters).forEach(([name, content]) => {
          if (!continuityLibrary.some((e) => e.content === content)) {
            setContinuityLibrary((prev) => [...prev, { id: uid(), type: "character", name, content, createdAt: Date.now() }]);
          }
        });
      }
      if (cs.settings) {
        Object.entries(cs.settings).forEach(([name, content]) => {
          if (!continuityLibrary.some((e) => e.content === content)) {
            setContinuityLibrary((prev) => [...prev, { id: uid(), type: "setting", name, content, createdAt: Date.now() }]);
          }
        });
      }
    }

    // Build dependency graph
    const completed = new Set<string>();
    const stepMap = new Map(chain.steps.map((s) => [s.id, s]));

    const canRun = (step: CommandStep) => {
      if (completed.has(step.id)) return false;
      if (step.status === "running" || step.status === "completed") return false;
      if (!step.depends_on) return true;
      // Support both single dependency and array of dependencies
      if (Array.isArray(step.depends_on)) {
        return step.depends_on.every((dep) => completed.has(dep));
      }
      return completed.has(step.depends_on);
    };

    const runStep = async (step: CommandStep): Promise<void> => {
      // Sanitize the step before execution — auto-fix LLM parameter mistakes
      const sanitized = sanitizeStep(step);
      // Merge sanitized values back
      step.model = sanitized.model;
      step.settings = sanitized.settings;

      setActiveChain((prev) =>
        prev ? { ...prev, steps: prev.steps.map((s) => (s.id === step.id ? { ...s, status: "running" } : s)) } : prev,
      );

      let shotId: string | null = null;

      try {
        // If this step depends on a previous step that failed and we need its output, 
        // try running without the dependency (skip keyframe wiring) instead of failing entirely
        let skipDependencyWiring = false;
        // Normalize depends_on: resolve primary dependency for wiring (first dep, or the single dep)
        const primaryDep = Array.isArray(step.depends_on) ? step.depends_on[0] : step.depends_on;
        if (primaryDep && step.use_output_as) {
          const depStep = stepMap.get(primaryDep);
          if (!depStep?.result) {
            console.warn(`[Dreamscape Chain] Dependency "${primaryDep}" has no result — running "${step.name}" without dependency output`);
            skipDependencyWiring = true;
          }
        }

        const shot = makeShot({
          prompt: step.prompt,
          mode: step.action as GenerationMode,
          model: step.model,
          phase: step.phase as ShotPhase,
        });
        shotId = shot.id;
        updateBoard((b) => ({ ...b, shots: [...b.shots, shot] }));
        updateShot(shot.id, { status: "queued" });

        // Map step.action to the correct API action
        const actionMap: Record<string, string> = {
          "generate-image": "generate-image",
          "generate-video": "generate-video",
          "extend": "generate-video",
          "reverse-extend": "generate-video",
          "interpolate": "generate-video",
          "modify-video": "modify-video",
          "modify-video-keyframes": "modify-video",
          "reframe": "reframe",
          "upscale": "upscale",
          "add-audio": "add-audio",
          "generate-audio": "generate-audio",
          "generate-sfx": "generate-sfx",
          "voiceover": "voiceover",
          "lip-sync": "lip-sync",
        };
        const apiAction = actionMap[step.action] || (step.action.includes("image") ? "generate-image" : "generate-video");

        const body: Record<string, unknown> = {
          action: apiAction,
          prompt: step.prompt,
          model: step.model,
          ...step.settings,
        };
        // Explicitly set provider last to prevent step.settings from overriding it
        body.provider = provider;

        // Normalize duration to valid API values (5s, 9s, 10s)
        if (body.duration) body.duration = normalizeDuration(body.duration as string);

        // Handle dependencies — wire up output from previous step
        if (primaryDep && step.use_output_as && !skipDependencyWiring) {
          const depStep = stepMap.get(primaryDep);
          if (depStep?.result) {
            const depUrl = depStep.result.imageUrl || depStep.result.videoUrl;
            switch (step.use_output_as) {
              case "start_frame":
                if (depUrl) body.keyframes = { ...(body.keyframes as object || {}), frame0: { type: "image", url: depUrl } };
                break;
              case "end_frame":
                if (depUrl) body.keyframes = { ...(body.keyframes as object || {}), frame1: { type: "image", url: depUrl } };
                break;
              case "modify_source":
                if (depStep.result.videoUrl) { body.media = { url: depStep.result.videoUrl }; body.action = "modify-video"; }
                break;
              case "reframe_source":
                if (depUrl) { body.media = { url: depUrl }; body.action = "reframe"; }
                break;
              case "style_reference":
                if (depStep.result.imageUrl) body.style_ref = [{ url: depStep.result.imageUrl, weight: 0.8 }];
                break;
              case "character_reference":
                if (depStep.result.imageUrl) body.character_ref = { identity0: { images: [{ url: depStep.result.imageUrl }] } };
                break;
              case "audio_track":
                if (depStep.result.audioUrl) body.audio_url = depStep.result.audioUrl;
                break;
              case "upscale_source":
                if (depStep.result.generationId) body.generation_id = depStep.result.generationId;
                break;
              case "audio_target":
                if (depStep.result.generationId) body.generation_id = depStep.result.generationId;
                break;
            }
          }
        }

        // === SMART RESOLUTION for upscale / add-audio ===
        // Always resolve generation_id from dependency chain (overrides any stale placeholder)
        if (apiAction === "upscale" || apiAction === "add-audio") {
          const deps = Array.isArray(step.depends_on) ? step.depends_on : (step.depends_on ? [step.depends_on] : []);
          for (const depId of deps) {
            const depStep = stepMap.get(depId);
            if (depStep?.result?.generationId) {
              body.generation_id = depStep.result.generationId;
              break; // Use first available generation_id
            }
          }
          // If still no generation_id, clear any stale placeholder the LLM may have put in settings
          if (!body.generation_id) {
            console.warn(`[Chain] ${apiAction} step "${step.name}" has no generation_id from dependencies — step may fail`);
          }
        }

        // === SMART RESOLUTION for lip-sync ===
        // Lip-sync needs both video_url and audio_url from dependencies
        if (apiAction === "lip-sync") {
          const deps = Array.isArray(step.depends_on) ? step.depends_on : (step.depends_on ? [step.depends_on] : []);
          for (const depId of deps) {
            const depStep = stepMap.get(depId);
            if (depStep?.result) {
              // Wire video from any dep that produced a video
              if (!body.video_url && depStep.result.videoUrl) {
                body.video_url = depStep.result.videoUrl;
              }
              // Wire audio from any dep that produced audio
              if (!body.audio_url && depStep.result.audioUrl) {
                body.audio_url = depStep.result.audioUrl;
              }
            }
          }
          // Also search ALL completed steps for video/audio if deps didn't provide them
          if (!body.video_url || !body.audio_url) {
            for (const [, s] of stepMap) {
              if (s.result && completed.has(s.id)) {
                if (!body.video_url && s.result.videoUrl) body.video_url = s.result.videoUrl;
                if (!body.audio_url && s.result.audioUrl) body.audio_url = s.result.audioUrl;
              }
            }
          }
        }

        const res = await fetch("/api/luma", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        let data = await res.json();

        // Smart retry with progressive degradation
        if (!res.ok) {
          const errMsg = data.error || `HTTP ${res.status}`;
          const isTransient = errMsg.includes("Insufficient credits") || errMsg.includes("rate limit") || res.status === 429 || res.status >= 500;
          const isNoAccess = errMsg.includes("no access") || errMsg.includes("not available") || errMsg.includes("403");

          if (isNoAccess) {
            // Strip resolution and HDR (common cause of "no access" on lower-tier plans)
            console.warn(`[Chain] "no access" for "${step.name}" — retrying without resolution/hdr`);
            delete body.resolution;
            delete body.hdr;
            await new Promise(r => setTimeout(r, 1000));
            const retryRes = await fetch("/api/luma", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            data = await retryRes.json();
            if (!retryRes.ok) {
              // Try one more time with flash model (cheaper, more accessible)
              if (!step.model?.includes("flash") && (step.action === "generate-video" || step.action === "generate-image")) {
                console.warn(`[Chain] Still failing — downgrading to flash model for "${step.name}"`);
                body.model = step.action === "generate-image" ? "photon-flash-1" : "ray-flash-2";
                if (body.duration === "10s") body.duration = "9s";
                await new Promise(r => setTimeout(r, 1000));
                const retry2 = await fetch("/api/luma", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
                data = await retry2.json();
                if (!retry2.ok) throw new Error(data.error || `API returned ${retry2.status}`);
              } else {
                throw new Error(data.error || `API returned ${retryRes.status}`);
              }
            }
          } else if (isTransient) {
            // Exponential backoff: 3s, then 6s
            for (let attempt = 1; attempt <= 2; attempt++) {
              const delay = attempt * 3000;
              console.warn(`[Chain] Transient error for "${step.name}", retry ${attempt}/2 in ${delay}ms...`);
              await new Promise(r => setTimeout(r, delay));
              const retryRes = await fetch("/api/luma", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
              data = await retryRes.json();
              if (retryRes.ok) break;
              if (attempt === 2) throw new Error(data.error || `API returned ${retryRes.status}`);
            }
          } else {
            throw new Error(errMsg);
          }
        }

        updateShot(shot.id, { generationId: data.id, status: "queued" });

        // Check if already completed (some image generations return immediately)
        const isAlreadyDone = data.state === "completed" || data.status === "succeeded" || (data.assets && (data.assets.video || data.assets.image || data.assets.audio));

        if (!isAlreadyDone) {
          // Poll until done (max 6 minutes)
          await new Promise<void>((resolve, reject) => {
            let chainRetries = 0;
            const pollInterval = setInterval(async () => {
              chainRetries++;
              if (chainRetries > 120) {
                clearInterval(pollInterval);
                reject(new Error("Generation timed out after 6 minutes"));
                return;
              }
              try {
                const pRes = await fetch(`/api/luma?action=status&id=${data.id}`);
                if (!pRes.ok) return; // Retry on network error
                const pData = await pRes.json();
                if (pData.state === "completed" || pData.status === "succeeded") {
                  clearInterval(pollInterval);
                  const videoUrl = pData.assets?.video ?? pData.output?.[0];
                  const imageUrl = pData.assets?.image ?? (typeof pData.output?.[0] === "string" && !pData.output[0].match(/\.(mp4|webm|mov)/i) ? pData.output[0] : undefined);
                  const audioUrl = pData.assets?.audio;
                  updateShot(shot.id, { status: "completed", videoUrl, imageUrl, audioUrl });
                  step.result = { videoUrl, imageUrl, audioUrl, generationId: data.id };
                  // Save to Files
                  saveGenerationToFiles(shot.id, { videoUrl, imageUrl, audioUrl });
                  resolve();
                } else if (pData.state === "failed" || pData.status === "failed" || pData.status === "canceled") {
                  clearInterval(pollInterval);
                  reject(new Error(pData.failure_reason || pData.error || "Step failed"));
                } else {
                  // Update intermediate status (dreaming, processing, etc.)
                  const intermediateStatus = pData.state === "dreaming" ? "dreaming" : "queued";
                  updateShot(shot.id, { status: intermediateStatus });
                }
              } catch { /* retry silently */ }
            }, 3000);
          });
        } else {
          const videoUrl = data.assets?.video;
          const imageUrl = data.assets?.image;
          const audioUrl = data.assets?.audio;
          step.result = { videoUrl, imageUrl, audioUrl, generationId: data.id };
          updateShot(shot.id, { status: "completed", videoUrl, imageUrl, audioUrl });
          // Save to Files
          saveGenerationToFiles(shot.id, { videoUrl, imageUrl, audioUrl });
        }

        setActiveChain((prev) =>
          prev ? { ...prev, steps: prev.steps.map((s) => (s.id === step.id ? { ...s, status: "completed", result: step.result } : s)) } : prev,
        );
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        // Update BOTH the chain step AND the shot to failed
        setActiveChain((prev) =>
          prev ? { ...prev, steps: prev.steps.map((s) => (s.id === step.id ? { ...s, status: "failed" } : s)) } : prev,
        );
        if (shotId) {
          updateShot(shotId, { status: "failed", error: errMsg });
        }
        console.error(`[Dreamscape Chain] Step "${step.name || step.id}" failed:`, errMsg);
      }

      completed.add(step.id);
      completedCount++;
      setChainProgress((completedCount / totalSteps) * 100);
    };

    // Execute with parallelism: run all steps whose dependencies are satisfied
    while (completed.size < totalSteps) {
      const runnable = chain.steps.filter(canRun);
      if (runnable.length === 0) break; // No more runnable steps (all done or blocked)
      // Run all independent steps in parallel
      await Promise.all(runnable.map(runStep));
    }

    setChainRunning(false);
  };

  // =======================================================================
  // Creative Query
  // =======================================================================
  const runCreativeQuery = async () => {
    if (!prompt.trim()) return;
    setCreativeQueryLoading(true);
    setShowCreativeQuery(true);

    try {
      const res = await fetch("/api/dreamscape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "creative-query", prompt, media_type: isVideoMode ? "video" : "image" }),
      });
      const data = await res.json();
      setPromptVariations(data.variations || []);
    } catch { /* ignore */ }
    finally { setCreativeQueryLoading(false); }
  };

  // =======================================================================
  // More Like This
  // =======================================================================
  const runMoreLikeThis = async (srcPrompt: string) => {
    setMoreLikeThisLoading(true);
    setShowMoreLikeThis(true);

    try {
      const res = await fetch("/api/dreamscape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "more-like-this", prompt: srcPrompt }),
      });
      const data = await res.json();
      setMoreLikeThisVariations(data.variations || []);
    } catch { /* ignore */ }
    finally { setMoreLikeThisLoading(false); }
  };

  // =======================================================================
  // Concept Pills
  // =======================================================================
  const fetchConceptPills = async () => {
    if (!prompt.trim()) return;
    try {
      const res = await fetch("/api/dreamscape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "suggest-concepts", prompt }),
      });
      const data = await res.json();
      setConceptPills(data.concepts || []);
    } catch { /* ignore */ }
  };

  const swapConcept = (oldWord: string, newWord: string) => {
    setPrompt((prev) => prev.replace(new RegExp(oldWord, "gi"), newWord));
    setConceptPills([]);
  };

  // =======================================================================
  // Share
  // =======================================================================
  const handleShare = () => {
    const shareData = { board: board?.name, shotsCount: board?.shots.length, id: board?.id };
    const fakeLink = `https://dreamscape.app/share/${board?.id?.slice(0, 8)}`;
    setShareLink(fakeLink);
    setShowShareModal(true);
  };

  // =======================================================================
  // Export Board as JSON (real share alternative)
  // =======================================================================
  const exportBoardAsJson = () => {
    if (!board) return;
    const data = JSON.stringify(board, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${board.name.replace(/[^a-zA-Z0-9]/g, "_")}_board.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importBoardFromJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string) as Board;
        if (!imported?.id || !Array.isArray(imported?.shots)) return;
        const freshBoard: Board = { ...imported, id: uid(), shots: imported.shots.map((s) => ({ ...s, id: uid() })), createdAt: Date.now() };
        setBoards((prev) => [...prev, freshBoard]);
        setActiveBoardId(freshBoard.id);
        setSelectedShotId(freshBoard.shots[0]?.id ?? null);
      } catch { /* ignore */ }
    };
    reader.readAsText(file);
  };

  // =======================================================================
  // Draft → HiFi Pipeline
  // =======================================================================
  const masterToHiFi = async (shotId: string) => {
    const shot = board.shots.find((s) => s.id === shotId);
    if (!shot || shot.status !== "completed") return;

    const hifiShot = makeShot({
      prompt: shot.prompt,
      mode: shot.mode,
      phase: "hifi",
    });
    updateBoard((b) => {
      const idx = b.shots.findIndex((s) => s.id === shotId);
      const shots = [...b.shots];
      shots.splice(idx + 1, 0, hifiShot);
      return { ...b, shots };
    });
    setSelectedShotId(hifiShot.id);

    // Upgrade model: flash → premium
    const hifiVideoModel = shot.model?.includes("flash") ? "ray-2" : shot.model || "ray-2";
    const hifiImageModel = shot.model?.includes("flash") ? "photon-1" : shot.model || "photon-1";
    const isVid = ["text-to-video", "image-to-video", "extend", "reverse-extend", "interpolate", "modify-video", "modify-video-keyframes"].includes(shot.mode);

    try {
      updateShot(hifiShot.id, { status: "queued", model: isVid ? hifiVideoModel : hifiImageModel });
      const body: Record<string, unknown> = {
        action: isVid ? "generate-video" : "generate-image",
        prompt: shot.prompt,
        model: isVid ? hifiVideoModel : hifiImageModel,
        resolution: "1080p",
        aspect_ratio: shot.aspectRatio || "16:9",
        duration: shot.duration,
        provider,
      };
      // If original had a start frame image, use it for hifi too
      if (shot.imageUrl && shot.mode === "image-to-video") {
        body.keyframes = { frame0: { type: "image", url: shot.imageUrl } };
      }
      const res = await fetch("/api/luma", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      updateShot(hifiShot.id, { generationId: data.id, status: "queued" });
      if (data.state !== "completed") pollGeneration(data.id, hifiShot.id);
      else {
        updateShot(hifiShot.id, { status: "completed", videoUrl: data.assets?.video, imageUrl: data.assets?.image });
        saveGenerationToFiles(hifiShot.id, { videoUrl: data.assets?.video, imageUrl: data.assets?.image });
      }
    } catch (err) {
      updateShot(hifiShot.id, { status: "failed", error: String(err instanceof Error ? err.message : err) });
    }
  };

  // =======================================================================
  // Continuity Library Operations
  // =======================================================================
  const addContinuityEntry = () => {
    if (!newContinuityName.trim() || !newContinuityContent.trim()) return;
    const entry: ContinuityEntry = {
      id: uid(),
      type: newContinuityType,
      name: newContinuityName.trim(),
      content: newContinuityContent.trim(),
      createdAt: Date.now(),
    };
    setContinuityLibrary((prev) => [...prev, entry]);
    setNewContinuityName("");
    setNewContinuityContent("");
  };

  const removeContinuityEntry = (id: string) => {
    setContinuityLibrary((prev) => prev.filter((e) => e.id !== id));
  };

  const injectContinuityToPrompt = (entryId: string) => {
    const entry = continuityLibrary.find((e) => e.id === entryId);
    if (!entry) return;
    setPrompt((prev) => `${entry.content}\n\n${prev}`);
  };

  // Build continuity context for agent
  const getContinuityContext = () => {
    if (continuityLibrary.length === 0) return "";
    let ctx = "\n\n--- GLOBAL CONTINUITY LIBRARY ---\n";
    const styles = continuityLibrary.filter((e) => e.type === "style");
    const chars = continuityLibrary.filter((e) => e.type === "character");
    const settings = continuityLibrary.filter((e) => e.type === "setting");
    if (styles.length) ctx += "\nSTYLES:\n" + styles.map((s) => `[${s.name}]: ${s.content}`).join("\n");
    if (chars.length) ctx += "\nCHARACTERS:\n" + chars.map((c) => `[${c.name}]: ${c.content}`).join("\n");
    if (settings.length) ctx += "\nSETTINGS:\n" + settings.map((s) => `[${s.name}]: ${s.content}`).join("\n");
    ctx += "\n--- END CONTINUITY LIBRARY ---";
    return ctx;
  };

  // =======================================================================
  // Annotation Operations
  // =======================================================================
  const addAnnotation = (ann: Omit<AnnotationItem, "id">) => {
    setAnnotations((prev) => [...prev, { ...ann, id: uid() }]);
  };

  const removeAnnotation = (id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
  };

  const clearAnnotations = () => setAnnotations([]);

  const annotationsToPromptContext = () => {
    if (annotations.length === 0) return "";
    let ctx = " [VISUAL ANNOTATIONS: ";
    annotations.forEach((a) => {
      if (a.type === "arrow") ctx += `Arrow from (${Math.round(a.x)}%,${Math.round(a.y)}%) to (${Math.round(a.x2!)}%,${Math.round(a.y2!)}%) indicating motion direction. `;
      else if (a.type === "rect") ctx += `Region of interest at (${Math.round(a.x)}%,${Math.round(a.y)}%) to (${Math.round(a.x2!)}%,${Math.round(a.y2!)}%) — focus area. `;
      else if (a.type === "text" && a.text) ctx += `Text label "${a.text}" at (${Math.round(a.x)}%,${Math.round(a.y)}%). `;
    });
    ctx += "]";
    return ctx;
  };

  const handleAnnotationMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (annotationMode === "none") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setAnnotationDrawing(true);
    setAnnotationStart({ x, y });
  };

  const handleAnnotationMouseUp = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!annotationDrawing || !annotationStart || annotationMode === "none") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x2 = ((e.clientX - rect.left) / rect.width) * 100;
    const y2 = ((e.clientY - rect.top) / rect.height) * 100;
    if (annotationMode === "text") {
      const text = window.prompt("Enter annotation text:");
      if (text) addAnnotation({ type: "text", x: annotationStart.x, y: annotationStart.y, text, color: "#a855f7" });
    } else {
      addAnnotation({ type: annotationMode, x: annotationStart.x, y: annotationStart.y, x2, y2, color: annotationMode === "arrow" ? "#f97316" : "#3b82f6" });
    }
    setAnnotationDrawing(false);
    setAnnotationStart(null);
  };

  // =======================================================================
  // Film Player
  // =======================================================================
  const openFilmPlayer = () => {
    if (completedVideoShots.length === 0) return;
    setFilmPlayIndex(0);
    setFilmPlaying(true);
    setFilmPlayerOpen(true);
  };

  const filmOnEnded = () => {
    const nextIdx = filmPlayIndex + 1;
    if (nextIdx < completedVideoShots.length) setFilmPlayIndex(nextIdx);
    else setFilmPlaying(false);
  };

  useEffect(() => {
    if (filmPlayerOpen && filmVideoRef.current && completedVideoShots[filmPlayIndex]?.videoUrl) {
      filmVideoRef.current.src = completedVideoShots[filmPlayIndex].videoUrl!;
      if (filmPlaying) filmVideoRef.current.play().catch(() => {});
    }
  }, [filmPlayIndex, filmPlayerOpen, filmPlaying, completedVideoShots]);

  // =======================================================================
  // Preview controls
  // =======================================================================
  const togglePreview = () => {
    if (!previewVideoRef.current) return;
    if (previewPlaying) previewVideoRef.current.pause();
    else previewVideoRef.current.play().catch(() => {});
    setPreviewPlaying(!previewPlaying);
  };

  // =======================================================================
  // Select shot
  // =======================================================================
  const selectShot = (shot: Shot) => {
    setSelectedShotId(shot.id);
    setPrompt(shot.prompt);
    setMode(shot.mode);
  };

  // =======================================================================
  // Drag & Drop
  // =======================================================================
  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx !== null && dragIdx !== idx) { moveShot(dragIdx, idx); setDragIdx(idx); }
  };
  const handleDragEnd = () => setDragIdx(null);

  // =======================================================================
  // RENDER
  // =======================================================================
  return (
    <div className="flex flex-col h-screen w-full bg-pplx-bg text-pplx-text overflow-hidden">
      {/* ============================================================== */}
      {/* TOP BAR                                                        */}
      {/* ============================================================== */}
      <header className="flex items-center h-12 px-4 border-b border-pplx-border bg-pplx-sidebar shrink-0 gap-2">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 via-fuchsia-500 to-pink-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Sparkles size={14} className="text-white" />
          </div>
          <span className="text-sm font-bold tracking-tight bg-gradient-to-r from-violet-300 to-fuchsia-300 bg-clip-text text-transparent">
            Video Producer
          </span>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-0.5 ml-3 bg-pplx-card rounded-lg p-0.5 border border-pplx-border">
          <button
            onClick={() => setViewMode("boards")}
            className={cn("px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors",
              viewMode === "boards" ? "bg-violet-500/20 text-violet-300" : "text-pplx-muted hover:text-pplx-text",
            )}
          >
            Boards
          </button>
          <button
            onClick={() => setViewMode("ideas")}
            className={cn("px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors",
              viewMode === "ideas" ? "bg-fuchsia-500/20 text-fuchsia-300" : "text-pplx-muted hover:text-pplx-text",
            )}
          >
            Ideas
          </button>
        </div>

        {/* Board tabs */}
        {viewMode === "boards" && (
          <div className="flex items-center gap-1 ml-2 overflow-x-auto">
            {boards.map((b) => (
              <button
                key={b.id}
                onClick={() => { setActiveBoardId(b.id); setSelectedShotId(b.shots[0]?.id ?? null); }}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap",
                  b.id === activeBoardId ? "bg-white/10 text-pplx-text" : "text-pplx-muted hover:text-pplx-text hover:bg-white/5",
                )}
              >
                {b.name}
              </button>
            ))}
            <button onClick={createBoard} className="p-1 rounded-md text-pplx-muted hover:text-pplx-text hover:bg-white/5" title="New Board">
              <Plus size={13} />
            </button>
          </div>
        )}

        <div className="flex-1" />

        {/* Search */}
        {showSearch ? (
          <div className="flex items-center gap-1.5 bg-pplx-card border border-pplx-border rounded-lg px-2 py-1">
            <Search size={12} className="text-pplx-muted" />
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search shots..."
              className="bg-transparent text-xs w-40 focus:outline-none text-pplx-text placeholder:text-pplx-muted/40"
            />
            <button onClick={() => { setShowSearch(false); setSearchQuery(""); }} className="text-pplx-muted hover:text-pplx-text">
              <X size={12} />
            </button>
          </div>
        ) : (
          <button onClick={() => setShowSearch(true)} className="p-1.5 rounded-md text-pplx-muted hover:text-pplx-text hover:bg-white/5" title="Search">
            <Search size={14} />
          </button>
        )}

        {/* Agent toggle */}
        <button
          onClick={() => setAgentPanelOpen(!agentPanelOpen)}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all",
            agentPanelOpen
              ? "bg-gradient-to-r from-violet-600/30 to-fuchsia-600/30 text-violet-300 border border-violet-500/30"
              : "text-pplx-muted hover:text-pplx-text hover:bg-white/5",
          )}
        >
          <Zap size={12} />
          AI Agent
        </button>

        {/* Share */}
        <button onClick={handleShare} className="p-1.5 rounded-md text-pplx-muted hover:text-pplx-text hover:bg-white/5" title="Share">
          <Share2 size={14} />
        </button>

        {/* Right panel toggle */}
        <button
          onClick={() => setRightPanelOpen(!rightPanelOpen)}
          className="p-1.5 rounded-md text-pplx-muted hover:text-pplx-text hover:bg-white/5"
          title={rightPanelOpen ? "Hide Panel" : "Show Panel"}
        >
          {rightPanelOpen ? <PanelRightOpen size={14} /> : <PanelLeftOpen size={14} />}
        </button>

        {/* Provider badge */}
        <span className={cn(
          "text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider",
          provider === "replicate" || (provider === "auto" && !availableProviders.luma && availableProviders.replicate)
            ? "bg-emerald-500/10 text-emerald-400"
            : "bg-blue-500/10 text-blue-400",
        )}>
          {provider === "replicate" || (provider === "auto" && !availableProviders.luma && availableProviders.replicate) ? "Replicate" : "Luma"}
        </span>

        {/* Board type */}
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 font-medium uppercase tracking-wider">
          {board?.type || "storyboard"}
        </span>

        {/* Board name edit */}
        {editingBoardName ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={boardNameDraft}
              onChange={(e) => setBoardNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { updateBoard((b) => ({ ...b, name: boardNameDraft || b.name })); setEditingBoardName(false); }
                if (e.key === "Escape") setEditingBoardName(false);
              }}
              className="bg-pplx-card border border-pplx-border rounded px-2 py-0.5 text-xs w-32"
            />
            <button onClick={() => { updateBoard((b) => ({ ...b, name: boardNameDraft || b.name })); setEditingBoardName(false); }}>
              <Check size={12} className="text-green-400" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setBoardNameDraft(board?.name ?? ""); setEditingBoardName(true); }}
            className="text-pplx-muted hover:text-pplx-text" title="Rename board"
          >
            <Edit3 size={13} />
          </button>
        )}

        {/* Board Description */}
        {editingBoardDesc ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={boardDescDraft}
              onChange={(e) => setBoardDescDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { updateBoard((b) => ({ ...b, description: boardDescDraft || undefined })); setEditingBoardDesc(false); }
                if (e.key === "Escape") setEditingBoardDesc(false);
              }}
              placeholder="Board description..."
              className="bg-pplx-card border border-pplx-border rounded px-2 py-0.5 text-xs w-48"
            />
            <button onClick={() => { updateBoard((b) => ({ ...b, description: boardDescDraft || undefined })); setEditingBoardDesc(false); }}>
              <Check size={12} className="text-green-400" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setBoardDescDraft(board?.description ?? ""); setEditingBoardDesc(true); }}
            className="text-pplx-muted hover:text-pplx-text text-[10px] flex items-center gap-0.5 max-w-[120px] truncate"
            title={board?.description || "Add board description"}
          >
            <BookOpen size={10} />
            {board?.description ? board.description.slice(0, 20) + (board.description.length > 20 ? "…" : "") : "Add brief"}
          </button>
        )}

        {/* Film Player */}
        <button
          onClick={openFilmPlayer}
          disabled={completedVideoShots.length === 0}
          className={cn(
            "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors",
            completedVideoShots.length > 0
              ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-500 hover:to-fuchsia-500"
              : "bg-white/5 text-pplx-muted cursor-not-allowed",
          )}
        >
          <Film size={12} />
          Play ({completedVideoShots.length})
        </button>

        {/* Board menu */}
        <div className="relative">
          <button
            onClick={() => setShowBoardMenu(!showBoardMenu)}
            className="p-1.5 rounded-md text-pplx-muted hover:text-pplx-text hover:bg-white/5"
          >
            <MoreHorizontal size={14} />
          </button>
          {showBoardMenu && (
            <div className="absolute right-0 top-full mt-1 bg-pplx-card border border-pplx-border rounded-lg shadow-xl z-50 min-w-[180px] py-1">
              <button onClick={() => { updateBoard((b) => ({ ...b, type: "storyboard" })); setShowBoardMenu(false); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 flex items-center gap-2">
                <Film size={12} /> Storyboard
              </button>
              <button onClick={() => { updateBoard((b) => ({ ...b, type: "artboard" })); setShowBoardMenu(false); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 flex items-center gap-2">
                <Layers size={12} /> Artboard
              </button>
              <button onClick={() => { updateBoard((b) => ({ ...b, type: "moodboard" })); setShowBoardMenu(false); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 flex items-center gap-2">
                <Palette size={12} /> Moodboard
              </button>
              <hr className="my-1 border-pplx-border" />
              <button onClick={() => { duplicateBoard(); setShowBoardMenu(false); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 flex items-center gap-2">
                <Copy size={12} /> Duplicate Board
              </button>
              <button onClick={() => { updateBoard((b) => ({ ...b, isPublic: !b.isPublic })); setShowBoardMenu(false); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 flex items-center gap-2">
                {board?.isPublic ? <Lock size={12} /> : <Globe size={12} />}
                {board?.isPublic ? "Make Private" : "Make Public"}
              </button>
              <hr className="my-1 border-pplx-border" />
              <button
                onClick={() => { deleteBoard(activeBoardId); setShowBoardMenu(false); }}
                disabled={boards.length <= 1}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 text-red-400 flex items-center gap-2 disabled:opacity-30"
              >
                <Trash2 size={12} /> Delete Board
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ============================================================== */}
      {/* MAIN CONTENT                                                   */}
      {/* ============================================================== */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ============ AI AGENT PANEL (left) ============ */}
        {agentPanelOpen && (
          <div className="w-[360px] border-r border-pplx-border bg-pplx-sidebar flex flex-col shrink-0">
            {/* Agent header */}
            <div className="p-3 border-b border-pplx-border">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
                    <Zap size={12} className="text-white" />
                  </div>
                  <span className="text-xs font-bold">AI Agent</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => { setAgentMessages([]); setActiveChain(null); }}
                    className="text-pplx-muted hover:text-pplx-text p-0.5 rounded hover:bg-white/5"
                    title="New conversation"
                  >
                    <Plus size={12} />
                  </button>
                  <button onClick={() => setAgentPanelOpen(false)} className="text-pplx-muted hover:text-pplx-text">
                    <X size={14} />
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-pplx-muted">
                Describe your vision — I&apos;ll analyze, brainstorm, and create production-ready command chains.
              </p>
              {/* Continuity Library toggle */}
              <button
                onClick={() => setShowContinuityLibrary(!showContinuityLibrary)}
                className={cn("mt-2 w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all",
                  showContinuityLibrary || continuityLibrary.length > 0
                    ? "bg-teal-500/10 text-teal-300 border border-teal-500/20" : "text-pplx-muted hover:text-pplx-text hover:bg-white/5",
                )}
              >
                <Library size={10} /> Continuity Library
                {continuityLibrary.length > 0 && (
                  <span className="ml-auto text-[9px] bg-teal-500/20 rounded-full px-1.5">{continuityLibrary.length}</span>
                )}
              </button>
            </div>

            {/* Continuity Library panel */}
            {showContinuityLibrary && (
              <div className="border-b border-pplx-border bg-pplx-bg/50 p-3 max-h-[300px] overflow-y-auto">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-teal-300 flex items-center gap-1"><BookOpen size={10} /> Shared Context</span>
                  <button onClick={() => setShowContinuityLibrary(false)} className="text-pplx-muted hover:text-pplx-text"><X size={10} /></button>
                </div>
                <p className="text-[9px] text-pplx-muted mb-2">Persistent styles, characters & settings used across all boards.</p>
                {/* Existing entries */}
                {continuityLibrary.map((entry) => (
                  <div key={entry.id} className="bg-pplx-card border border-pplx-border rounded-lg p-2 mb-1.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={cn("text-[8px] px-1 py-0.5 rounded uppercase font-bold",
                        entry.type === "style" ? "bg-violet-500/20 text-violet-300" : entry.type === "character" ? "bg-pink-500/20 text-pink-300" : "bg-blue-500/20 text-blue-300",
                      )}>{entry.type}</span>
                      <span className="text-[10px] font-medium text-pplx-text flex-1">{entry.name}</span>
                      <button onClick={() => injectContinuityToPrompt(entry.id)} className="text-[9px] text-teal-400 hover:text-teal-300">Inject</button>
                      <button onClick={() => removeContinuityEntry(entry.id)} className="text-pplx-muted hover:text-red-400"><X size={8} /></button>
                    </div>
                    <p className="text-[9px] text-pplx-muted line-clamp-2">{entry.content}</p>
                  </div>
                ))}
                {/* Add new entry */}
                <div className="mt-2 space-y-1.5">
                  <div className="flex gap-1">
                    {(["style", "character", "setting"] as const).map((t) => (
                      <button key={t} onClick={() => setNewContinuityType(t)}
                        className={cn("flex-1 text-[9px] py-1 rounded font-medium",
                          newContinuityType === t ? "bg-teal-500/20 text-teal-300" : "bg-pplx-card text-pplx-muted",
                        )}>{t}</button>
                    ))}
                  </div>
                  <input value={newContinuityName} onChange={(e) => setNewContinuityName(e.target.value)}
                    placeholder="Name (e.g., 'Cyberpunk Noir Style')"
                    className="w-full bg-pplx-card border border-pplx-border rounded px-2 py-1 text-[10px] focus:outline-none" />
                  <textarea value={newContinuityContent} onChange={(e) => setNewContinuityContent(e.target.value)}
                    placeholder="[STYLE_ANCHOR: ...] or [CHARACTER: ...] or [SETTING: ...]"
                    rows={3}
                    className="w-full bg-pplx-card border border-pplx-border rounded px-2 py-1 text-[10px] focus:outline-none resize-none" />
                  <button onClick={addContinuityEntry} disabled={!newContinuityName.trim() || !newContinuityContent.trim()}
                    className="w-full py-1.5 rounded bg-teal-500/20 text-teal-300 text-[10px] font-medium disabled:opacity-30 hover:bg-teal-500/30">
                    <Plus size={9} className="inline mr-1" /> Add to Library
                  </button>
                </div>
              </div>
            )}

            {/* Agent messages */}
            <div ref={agentScrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
              {agentMessages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-pplx-muted">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center mb-3">
                    <MessageSquare size={24} className="text-violet-400" />
                  </div>
                  <p className="text-xs font-medium">Start a conversation</p>
                  <p className="text-[10px] text-pplx-muted/60 mt-1 text-center max-w-[220px]">
                    Describe your creative vision and I&apos;ll brainstorm concepts, then build executable command chains when you&apos;re ready.
                  </p>
                </div>
              )}
              {agentMessages.map((msg, i) => (
                <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                  <div className={cn(
                    "max-w-[90%] rounded-xl px-3 py-2 text-xs",
                    msg.role === "user"
                      ? "bg-violet-500/20 text-violet-100"
                      : "bg-pplx-card border border-pplx-border text-pplx-text",
                  )}>
                    <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                    {/* Command chain button */}
                    {msg.commandChain && (
                      <div className="mt-2 pt-2 border-t border-pplx-border/50">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-violet-400 font-medium">
                            Command Chain: {msg.commandChain.chain_name}
                          </span>
                          <button
                            onClick={() => executeChain(msg.commandChain!)}
                            disabled={chainRunning}
                            className="flex items-center gap-1 px-2 py-0.5 rounded bg-violet-500/20 text-violet-300 text-[10px] font-medium hover:bg-violet-500/30 disabled:opacity-50"
                          >
                            <Play size={9} /> Execute
                          </button>
                        </div>
                        <div className="mt-1.5 space-y-1">
                          {msg.commandChain.steps.map((step, si) => (
                            <div key={si} className="flex items-center gap-1.5 text-[10px] text-pplx-muted">
                              <span className={cn("w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0",
                                step.status === "completed" ? "bg-green-500/20 text-green-400" :
                                step.status === "running" ? "bg-violet-500/20 text-violet-300" :
                                step.status === "failed" ? "bg-red-500/20 text-red-400" : "bg-pplx-bg",
                              )}>
                                {step.status === "running" ? <Loader2 size={8} className="animate-spin" /> : si + 1}
                              </span>
                              {step.phase && (
                                <span className={cn("text-[7px] px-1 rounded uppercase font-bold",
                                  step.phase === "draft" ? "bg-amber-500/20 text-amber-400" : "bg-emerald-500/20 text-emerald-400",
                                )}>{step.phase === "draft" ? "D" : "H"}</span>
                              )}
                              <span className="truncate">{step.name || `${step.action}: ${step.prompt.slice(0, 35)}...`}</span>
                              {!step.depends_on && <span className="text-[7px] text-teal-400 shrink-0">||</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {agentLoading && (
                <div className="flex justify-start">
                  <div className="bg-pplx-card border border-pplx-border rounded-xl px-3 py-2">
                    <Loader2 size={14} className="animate-spin text-violet-400" />
                  </div>
                </div>
              )}
            </div>

            {/* Agent input */}
            <div className="p-3 border-t border-pplx-border">
              <div className="flex gap-2">
                <input
                  value={agentInput}
                  onChange={(e) => setAgentInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAgentMessage(); } }}
                  placeholder="Describe your vision, or say 'create' to generate a command chain..."
                  className="flex-1 bg-pplx-card border border-pplx-border rounded-lg px-3 py-2 text-xs placeholder:text-pplx-muted/40 focus:outline-none focus:border-violet-500/50"
                />
                <button
                  onClick={sendAgentMessage}
                  disabled={!agentInput.trim() || agentLoading}
                  className="px-3 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white disabled:opacity-30"
                >
                  <Send size={13} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============ CENTER: Preview / Ideas Gallery ============ */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Command chain progress bar */}
          {activeChain && chainRunning && (
            <div className="px-4 py-2 border-b border-pplx-border bg-violet-500/5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-medium text-violet-300">
                  Executing: {activeChain.chain_name}
                </span>
                <span className="text-[10px] text-pplx-muted">{Math.round(chainProgress)}%</span>
              </div>
              <div className="w-full h-1.5 bg-pplx-card rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full transition-all duration-500"
                  style={{ width: `${chainProgress}%` }}
                />
              </div>
              <div className="flex gap-1.5 mt-2 overflow-x-auto">
                {activeChain.steps.map((step, i) => (
                  <div key={i} className={cn(
                    "flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium shrink-0",
                    step.status === "completed" ? "bg-green-500/20 text-green-400" :
                    step.status === "running" ? "bg-violet-500/20 text-violet-300 animate-pulse" :
                    step.status === "failed" ? "bg-red-500/20 text-red-400" :
                    "bg-pplx-card text-pplx-muted",
                  )}>
                    {step.status === "running" && <Loader2 size={8} className="animate-spin" />}
                    {step.status === "completed" && <Check size={8} />}
                    {step.status === "failed" && <AlertCircle size={8} />}
                    Step {i + 1}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ---- IDEAS VIEW ---- */}
          {viewMode === "ideas" ? (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {filteredIdeas.map((shot) => (
                  <div
                    key={shot.id}
                    onClick={() => { selectShot(shot); setViewMode("boards"); }}
                    className="bg-pplx-card border border-pplx-border rounded-xl overflow-hidden cursor-pointer group hover:border-violet-500/50 transition-all"
                  >
                    <div className="aspect-video relative">
                      {shot.videoUrl ? (
                        <video
                          src={shot.videoUrl}
                          className="w-full h-full object-cover"
                          muted playsInline
                          onMouseEnter={(e) => (e.target as HTMLVideoElement).play().catch(() => {})}
                          onMouseLeave={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                        />
                      ) : shot.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={shot.imageUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-pplx-muted"><ImageIcon size={20} /></div>
                      )}
                      {/* Hover overlay */}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                          <button onClick={(e) => { e.stopPropagation(); toggleShotLike(shot.id); }} className="p-1.5 rounded-full bg-white/20 backdrop-blur-sm text-white hover:bg-white/30">
                            <Heart size={12} className={shot.liked ? "fill-red-400 text-red-400" : ""} />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); toggleShotBookmark(shot.id); }} className="p-1.5 rounded-full bg-white/20 backdrop-blur-sm text-white hover:bg-white/30">
                            <Bookmark size={12} className={shot.bookmarked ? "fill-yellow-400 text-yellow-400" : ""} />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); runMoreLikeThis(shot.prompt); }} className="p-1.5 rounded-full bg-white/20 backdrop-blur-sm text-white hover:bg-white/30" title="More Like This">
                            <Shuffle size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="p-2">
                      <p className="text-[10px] text-pplx-muted truncate">{shot.prompt || "Untitled"}</p>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-[9px] text-pplx-muted/60">{shot.model}</span>
                        {shot.tags?.map((t) => (
                          <span key={t} className="text-[8px] px-1 py-0.5 rounded bg-pplx-bg text-pplx-muted">{t}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
                {filteredIdeas.length === 0 && (
                  <div className="col-span-full flex flex-col items-center justify-center py-20 text-pplx-muted">
                    <Grid3X3 size={32} className="mb-2 text-pplx-muted/30" />
                    <p className="text-sm">No ideas yet</p>
                    <p className="text-xs text-pplx-muted/60">Generate some content to see it here</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ---- BOARDS VIEW: Preview area ---- */
            <div className="flex-1 flex flex-col min-w-0 p-4">
              <div className="flex-1 flex items-center justify-center bg-pplx-card rounded-xl border border-pplx-border relative overflow-hidden">
                {/* Annotation overlay */}
                {showAnnotations && (selectedShot?.videoUrl || selectedShot?.imageUrl) && (
                  <svg
                    ref={annotationCanvasRef}
                    className="absolute inset-0 w-full h-full z-20 pointer-events-auto"
                    style={{ cursor: annotationMode !== "none" ? "crosshair" : "default" }}
                    onMouseDown={handleAnnotationMouseDown}
                    onMouseUp={handleAnnotationMouseUp}
                  >
                    {annotations.map((ann) => (
                      <Fragment key={ann.id}>
                        {ann.type === "arrow" && (
                          <line x1={`${ann.x}%`} y1={`${ann.y}%`} x2={`${ann.x2}%`} y2={`${ann.y2}%`}
                            stroke={ann.color} strokeWidth="3" markerEnd="url(#arrowhead)" opacity="0.8" />
                        )}
                        {ann.type === "rect" && (
                          <rect x={`${Math.min(ann.x, ann.x2!)}%`} y={`${Math.min(ann.y, ann.y2!)}%`}
                            width={`${Math.abs(ann.x2! - ann.x)}%`} height={`${Math.abs(ann.y2! - ann.y)}%`}
                            fill="none" stroke={ann.color} strokeWidth="2" strokeDasharray="6,3" opacity="0.7" />
                        )}
                        {ann.type === "text" && (
                          <text x={`${ann.x}%`} y={`${ann.y}%`} fill={ann.color} fontSize="14" fontWeight="bold" opacity="0.9">
                            {ann.text}
                          </text>
                        )}
                      </Fragment>
                    ))}
                    <defs>
                      <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                        <polygon points="0 0, 10 3.5, 0 7" fill="#f97316" />
                      </marker>
                    </defs>
                  </svg>
                )}
                {/* Annotation toolbar */}
                {(selectedShot?.videoUrl || selectedShot?.imageUrl) && (
                  <div className="absolute top-2 left-2 z-30 flex gap-1">
                    <button onClick={() => { setShowAnnotations(!showAnnotations); if (showAnnotations) setAnnotationMode("none"); }}
                      className={cn("p-1.5 rounded-md text-[10px] transition-colors",
                        showAnnotations ? "bg-violet-500/30 text-violet-300" : "bg-black/40 text-white/60 hover:text-white",
                      )} title="Toggle Annotations">
                      <Pencil size={12} />
                    </button>
                    {showAnnotations && (
                      <>
                        <button onClick={() => setAnnotationMode(annotationMode === "arrow" ? "none" : "arrow")}
                          className={cn("p-1.5 rounded-md", annotationMode === "arrow" ? "bg-orange-500/30 text-orange-300" : "bg-black/40 text-white/60")} title="Draw Arrow">
                          <ArrowRight size={12} />
                        </button>
                        <button onClick={() => setAnnotationMode(annotationMode === "rect" ? "none" : "rect")}
                          className={cn("p-1.5 rounded-md", annotationMode === "rect" ? "bg-blue-500/30 text-blue-300" : "bg-black/40 text-white/60")} title="Draw Region">
                          <Square size={12} />
                        </button>
                        <button onClick={() => setAnnotationMode(annotationMode === "text" ? "none" : "text")}
                          className={cn("p-1.5 rounded-md", annotationMode === "text" ? "bg-purple-500/30 text-purple-300" : "bg-black/40 text-white/60")} title="Add Text">
                          <Type size={12} />
                        </button>
                        <button onClick={clearAnnotations} className="p-1.5 rounded-md bg-black/40 text-white/60 hover:text-red-300" title="Clear All">
                          <Eraser size={12} />
                        </button>
                        {annotations.length > 0 && (
                          <span className="text-[9px] bg-black/40 text-white/60 rounded-md px-1.5 py-1 self-center">{annotations.length} annotations</span>
                        )}
                      </>
                    )}
                  </div>
                )}
                {selectedShot?.videoUrl ? (
                  <>
                    <video
                      ref={previewVideoRef}
                      src={selectedShot.videoUrl}
                      className="max-w-full max-h-full rounded-lg"
                      loop muted={muted}
                      onPlay={() => setPreviewPlaying(true)}
                      onPause={() => setPreviewPlaying(false)}
                    />
                    <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2">
                      <button onClick={togglePreview} className="text-white hover:text-violet-300">
                        {previewPlaying ? <Pause size={16} /> : <Play size={16} />}
                      </button>
                      <button onClick={() => setMuted(!muted)} className="text-white hover:text-violet-300">
                        {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                      </button>
                      <div className="flex-1" />
                      {/* More Like This */}
                      <button
                        onClick={() => runMoreLikeThis(selectedShot.prompt)}
                        className="text-white/80 hover:text-violet-300 flex items-center gap-1 text-[10px]"
                        title="More Like This"
                      >
                        <Shuffle size={12} /> More
                      </button>
                      <button onClick={() => toggleShotLike(selectedShot.id)} className="text-white hover:text-red-300">
                        <Heart size={14} className={selectedShot.liked ? "fill-red-400 text-red-400" : ""} />
                      </button>
                      <button onClick={() => toggleShotBookmark(selectedShot.id)} className="text-white hover:text-yellow-300">
                        <Bookmark size={14} className={selectedShot.bookmarked ? "fill-yellow-400 text-yellow-400" : ""} />
                      </button>
                      <a href={selectedShot.videoUrl} download target="_blank" rel="noreferrer" className="text-white hover:text-violet-300">
                        <Download size={14} />
                      </a>
                    </div>
                  </>
                ) : selectedShot?.imageUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={selectedShot.imageUrl} alt={selectedShot.prompt} className="max-w-full max-h-full rounded-lg object-contain" />
                    <div className="absolute bottom-3 right-3 flex gap-2">
                      <button onClick={() => runMoreLikeThis(selectedShot.prompt)} className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-1.5 text-white text-xs hover:text-violet-300">
                        <Shuffle size={12} /> More Like This
                      </button>
                      <a href={selectedShot.imageUrl} download target="_blank" rel="noreferrer" className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-1.5 text-white text-xs hover:text-violet-300">
                        <Download size={13} /> Download
                      </a>
                    </div>
                  </>
                ) : selectedShot?.audioUrl ? (
                  <div className="flex flex-col items-center gap-4 p-8">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center">
                      <Music size={32} className="text-emerald-400" />
                    </div>
                    <p className="text-sm font-medium text-pplx-text">Audio Generated</p>
                    <audio controls src={selectedShot.audioUrl} className="w-full max-w-sm" />
                    <div className="flex gap-2">
                      <a href={selectedShot.audioUrl} download target="_blank" rel="noreferrer" className="flex items-center gap-1.5 bg-emerald-500/20 rounded-lg px-3 py-1.5 text-emerald-300 text-xs hover:bg-emerald-500/30">
                        <Download size={13} /> Download Audio
                      </a>
                    </div>
                  </div>
                ) : selectedShot?.status === "dreaming" || selectedShot?.status === "queued" ? (
                  <div className="flex flex-col items-center gap-3 text-pplx-muted">
                    <Loader2 size={40} className="animate-spin text-violet-400" />
                    <p className="text-sm">{selectedShot.status === "dreaming" ? "Dreaming…" : "Queued…"}</p>
                    <p className="text-xs text-pplx-muted/60">This typically takes 30–120 seconds</p>
                  </div>
                ) : selectedShot?.status === "failed" ? (
                  <div className="flex flex-col items-center gap-3 text-red-400">
                    <AlertCircle size={40} />
                    <p className="text-sm">{selectedShot.error || "Generation failed"}</p>
                    <button onClick={() => updateShot(selectedShot.id, { status: "idle", error: undefined })} className="flex items-center gap-1.5 text-xs text-pplx-muted hover:text-pplx-text">
                      <RefreshCw size={12} /> Try again
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 text-pplx-muted">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center">
                      <Sparkles size={28} className="text-violet-400" />
                    </div>
                    <p className="text-sm font-medium">Video Producer Studio</p>
                    <p className="text-xs text-pplx-muted/60 max-w-xs text-center">
                      Write a prompt, configure settings, and click Generate to bring your vision to life
                    </p>
                  </div>
                )}
              </div>

              {/* Shot info bar */}
              {selectedShot && (
                <div className="flex items-center gap-3 mt-2 px-1">
                  <span className="text-[11px] text-pplx-muted truncate flex-1">{selectedShot.prompt || "No prompt"}</span>
                  <StatusBadge status={selectedShot.status} />
                  {selectedShot.phase && (
                    <span className={cn("text-[9px] px-1.5 py-0.5 rounded font-medium uppercase",
                      selectedShot.phase === "draft" ? "bg-amber-500/10 text-amber-400" : "bg-emerald-500/10 text-emerald-400",
                    )}>
                      {selectedShot.phase === "draft" ? "Draft" : "HiFi"}
                    </span>
                  )}
                  {selectedShot.hdr && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-medium flex items-center gap-0.5">
                      <Sun size={8} /> HDR
                    </span>
                  )}
                  {selectedShot.phase === "draft" && selectedShot.status === "completed" && (
                    <button
                      onClick={() => masterToHiFi(selectedShot.id)}
                      className="text-[10px] px-2 py-0.5 rounded bg-gradient-to-r from-emerald-600/20 to-teal-600/20 text-emerald-300 font-medium hover:from-emerald-600/30 hover:to-teal-600/30 flex items-center gap-1"
                    >
                      <Gauge size={9} /> Master to HiFi
                    </button>
                  )}
                  {selectedShot.cameraMotion && selectedShot.cameraMotion !== "none" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">
                      <Camera size={9} className="inline mr-0.5" />
                      {CAMERA_MOTIONS.find((m) => m.id === selectedShot.cameraMotion)?.label}
                    </span>
                  )}
                  {selectedShot.generationId && (
                    <button onClick={() => navigator.clipboard.writeText(selectedShot.generationId!)} className="text-pplx-muted hover:text-pplx-text" title="Copy generation ID">
                      <Copy size={11} />
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ============ RIGHT: Generation Panel ============ */}
        {rightPanelOpen && (
          <div className="w-[360px] border-l border-pplx-border bg-pplx-sidebar flex flex-col shrink-0 overflow-hidden">
            {/* Mode tabs */}
            <div className="p-3 border-b border-pplx-border">
              <div className="mb-2">
                <p className="text-[10px] font-medium text-pplx-muted uppercase tracking-wider mb-1.5">Video</p>
                <div className="flex flex-wrap gap-1">
                  {MODE_TABS.filter((t) => t.group === "video").map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <button key={tab.id} onClick={() => setMode(tab.id)} className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors",
                        mode === tab.id ? "bg-violet-500/20 text-violet-300" : "text-pplx-muted hover:text-pplx-text hover:bg-white/5",
                      )}>
                        <Icon size={10} />{tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="mb-2">
                <p className="text-[10px] font-medium text-pplx-muted uppercase tracking-wider mb-1.5">Image</p>
                <div className="flex flex-wrap gap-1">
                  {MODE_TABS.filter((t) => t.group === "image").map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <button key={tab.id} onClick={() => setMode(tab.id)} className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors",
                        mode === tab.id ? "bg-fuchsia-500/20 text-fuchsia-300" : "text-pplx-muted hover:text-pplx-text hover:bg-white/5",
                      )}>
                        <Icon size={10} />{tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="mb-2">
                <p className="text-[10px] font-medium text-pplx-muted uppercase tracking-wider mb-1.5">Edit</p>
                <div className="flex flex-wrap gap-1">
                  {MODE_TABS.filter((t) => t.group === "edit").map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <button key={tab.id} onClick={() => setMode(tab.id)} className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors",
                        mode === tab.id ? "bg-blue-500/20 text-blue-300" : "text-pplx-muted hover:text-pplx-text hover:bg-white/5",
                      )}>
                        <Icon size={10} />{tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-medium text-pplx-muted uppercase tracking-wider mb-1.5">Audio</p>
                <div className="flex flex-wrap gap-1">
                  {MODE_TABS.filter((t) => t.group === "audio").map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <button key={tab.id} onClick={() => setMode(tab.id)} className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors",
                        mode === tab.id ? "bg-emerald-500/20 text-emerald-300" : "text-pplx-muted hover:text-pplx-text hover:bg-white/5",
                      )}>
                        <Icon size={10} />{tab.label}
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
                      auto: `Auto${availableProviders.luma ? " (Luma)" : availableProviders.replicate ? " (Rep)" : ""}`,
                      luma: "Luma",
                      replicate: "Replicate",
                    };
                    const disabled = (p === "luma" && !availableProviders.luma) || (p === "replicate" && !availableProviders.replicate);
                    return (
                      <button key={p} onClick={() => { setProvider(p); setSelectedReplicateModel(""); }} disabled={disabled}
                        className={cn("flex-1 px-2 py-1.5 rounded-md text-[10px] font-medium transition-colors border",
                          provider === p ? "border-violet-500 bg-violet-500/10 text-violet-300" : disabled ? "border-pplx-border/30 text-pplx-muted/30 cursor-not-allowed" : "border-pplx-border text-pplx-muted hover:border-pplx-muted/50",
                        )}>
                        {labels[p]}
                      </button>
                    );
                  })}
                </div>
                {!availableProviders.luma && !availableProviders.replicate && (
                  <p className="text-[10px] text-yellow-400 mt-1">Set LUMA_API_KEY or REPLICATE_API_TOKEN in .env.local</p>
                )}
              </div>

              {/* Replicate model selector */}
              {(provider === "replicate" || (provider === "auto" && !availableProviders.luma && availableProviders.replicate)) && replicateModels.length > 0 && (
                <div>
                  <label className="text-[11px] text-pplx-muted font-medium mb-1 block">Replicate Model</label>
                  <select value={selectedReplicateModel} onChange={(e) => setSelectedReplicateModel(e.target.value)}
                    className="w-full bg-pplx-card border border-pplx-border rounded-lg px-2 py-1.5 text-xs text-pplx-text focus:outline-none focus:border-violet-500/50">
                    <option value="">Auto (best match)</option>
                    <optgroup label="Video">
                      {replicateModels.filter((m) => m.type === "video").map((m) => (
                        <option key={m.key} value={m.key}>{m.desc} ({m.fullName})</option>
                      ))}
                    </optgroup>
                    <optgroup label="Image">
                      {replicateModels.filter((m) => m.type === "image").map((m) => (
                        <option key={m.key} value={m.key}>{m.desc} ({m.fullName})</option>
                      ))}
                    </optgroup>
                  </select>
                </div>
              )}

              {/* Prompt */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] text-pplx-muted font-medium">Prompt</label>
                  <div className="flex gap-1">
                    <button
                      onClick={runCreativeQuery}
                      disabled={!prompt.trim() || creativeQueryLoading}
                      className="text-[9px] text-violet-400 hover:text-violet-300 flex items-center gap-0.5 disabled:opacity-30"
                      title="Creative Query — AI-enhanced prompt variations"
                    >
                      <Sparkles size={9} /> Enhance
                    </button>
                    <button
                      onClick={fetchConceptPills}
                      disabled={!prompt.trim()}
                      className="text-[9px] text-amber-400 hover:text-amber-300 flex items-center gap-0.5 disabled:opacity-30"
                      title="Concept suggestions"
                    >
                      <Lightbulb size={9} /> Concepts
                    </button>
                  </div>
                </div>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={
                    mode === "text-to-video" ? "A cinematic shot of a wolf running through a snowy forest..." :
                    mode === "text-to-image" ? "A portrait of a cyberpunk samurai in neon rain..." :
                    mode === "modify-video" ? "Change the weather to a thunderstorm..." :
                    "Describe your vision..."
                  }
                  rows={3}
                  className="w-full bg-pplx-card border border-pplx-border rounded-lg px-3 py-2 text-xs placeholder:text-pplx-muted/40 focus:outline-none focus:border-violet-500/50 resize-none"
                />
                {/* Concept pills */}
                <ConceptPillsBar concepts={conceptPills} prompt={prompt} onSwap={swapConcept} />
              </div>

              {/* Creative Query Variations */}
              {showCreativeQuery && (
                <div className="bg-pplx-card border border-pplx-border rounded-lg p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium text-violet-300 flex items-center gap-1">
                      <Sparkles size={10} /> Enhanced Prompts
                    </span>
                    <button onClick={() => setShowCreativeQuery(false)} className="text-pplx-muted hover:text-pplx-text"><X size={10} /></button>
                  </div>
                  {creativeQueryLoading ? (
                    <div className="flex items-center justify-center py-4"><Loader2 size={16} className="animate-spin text-violet-400" /></div>
                  ) : (
                    promptVariations.map((v, i) => (
                      <button
                        key={i}
                        onClick={() => { setPrompt(v.prompt); setShowCreativeQuery(false); }}
                        className="w-full text-left p-2 rounded-md bg-pplx-bg hover:bg-white/5 transition-colors"
                      >
                        <div className="text-[10px] font-medium text-pplx-text">{v.title}</div>
                        <div className="text-[9px] text-pplx-muted mt-0.5 line-clamp-2">{v.prompt}</div>
                        {v.style && <span className="text-[8px] text-violet-400 mt-0.5 inline-block">{v.style}</span>}
                      </button>
                    ))
                  )}
                </div>
              )}

              {/* More Like This Variations */}
              {showMoreLikeThis && (
                <div className="bg-pplx-card border border-pplx-border rounded-lg p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium text-fuchsia-300 flex items-center gap-1">
                      <Shuffle size={10} /> More Like This
                    </span>
                    <button onClick={() => setShowMoreLikeThis(false)} className="text-pplx-muted hover:text-pplx-text"><X size={10} /></button>
                  </div>
                  {moreLikeThisLoading ? (
                    <div className="flex items-center justify-center py-4"><Loader2 size={16} className="animate-spin text-fuchsia-400" /></div>
                  ) : (
                    moreLikeThisVariations.map((v, i) => (
                      <button
                        key={i}
                        onClick={() => { setPrompt(v.prompt); setShowMoreLikeThis(false); }}
                        className="w-full text-left p-2 rounded-md bg-pplx-bg hover:bg-white/5 transition-colors"
                      >
                        <div className="text-[10px] font-medium text-pplx-text">{v.title}</div>
                        <div className="text-[9px] text-pplx-muted mt-0.5 line-clamp-2">{v.prompt}</div>
                      </button>
                    ))
                  )}
                </div>
              )}

              {/* Model selector */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] text-pplx-muted font-medium">Model</label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={autoModelEnabled} onChange={(e) => setAutoModelEnabled(e.target.checked)} className="rounded border-pplx-border bg-pplx-card accent-violet-500 w-3 h-3" />
                    <span className="text-[9px] text-pplx-muted flex items-center gap-0.5"><Cpu size={8} /> Auto</span>
                  </label>
                </div>
                {autoModelEnabled && recommendedModel && (
                  <div className="flex items-center gap-1 mb-1 px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/20">
                    <BadgeCheck size={10} className="text-emerald-400" />
                    <span className="text-[9px] text-emerald-400">Recommended: {currentModels.find((m) => m.id === recommendedModel)?.name || recommendedModel}</span>
                    {autoModelRec && <span className="text-[8px] text-emerald-400/60 ml-auto">{autoModelRec.reason}</span>}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-1">
                  {currentModels.map((m) => (
                    <button key={m.id} onClick={() => setCurrentModel(m.id)}
                      className={cn("px-2 py-1.5 rounded-md text-[10px] border transition-colors relative",
                        currentModel === m.id ? "border-violet-500 bg-violet-500/10 text-violet-300" : "border-pplx-border text-pplx-muted hover:border-pplx-muted/50",
                        recommendedModel === m.id && currentModel !== m.id && "border-emerald-500/30",
                      )}>
                      <div className="font-medium">{m.name}</div>
                      <div className="text-[8px] opacity-60">{m.desc}</div>
                      {recommendedModel === m.id && currentModel !== m.id && (
                        <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Aspect Ratio */}
              <div>
                <label className="text-[11px] text-pplx-muted font-medium mb-1 block">Aspect Ratio</label>
                <div className="flex flex-wrap gap-1">
                  {ASPECT_RATIOS.map((ar) => (
                    <button key={ar} onClick={() => setAspectRatio(ar)}
                      className={cn("px-2 py-1 rounded text-[10px] font-medium transition-colors",
                        aspectRatio === ar ? "bg-violet-500/20 text-violet-300" : "bg-pplx-card text-pplx-muted hover:bg-white/5",
                      )}>
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
                        <button key={r} onClick={() => setResolution(r)}
                          className={cn("px-2 py-1 rounded text-[10px] font-medium transition-colors flex-1",
                            resolution === r ? "bg-violet-500/20 text-violet-300" : "bg-pplx-card text-pplx-muted hover:bg-white/5",
                          )}>
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] text-pplx-muted font-medium mb-1 block">Duration</label>
                    <div className="flex gap-1">
                      {DURATIONS.map((d) => (
                        <button key={d} onClick={() => setDuration(d)}
                          className={cn("px-3 py-1 rounded text-[10px] font-medium transition-colors flex-1",
                            duration === d ? "bg-violet-500/20 text-violet-300" : "bg-pplx-card text-pplx-muted hover:bg-white/5",
                          )}>
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} className="rounded border-pplx-border bg-pplx-card accent-violet-500" />
                    <span className="text-[11px] text-pplx-muted">Loop video</span>
                  </label>

                  {/* HDR Toggle */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={hdrEnabled} onChange={(e) => setHdrEnabled(e.target.checked)} className="rounded border-pplx-border bg-pplx-card accent-amber-500" />
                    <span className="text-[11px] text-pplx-muted flex items-center gap-1">
                      <Sun size={10} className={hdrEnabled ? "text-amber-400" : ""} /> HDR Output
                      {hdrEnabled && <span className="text-[8px] text-amber-400 ml-1">(EXR available)</span>}
                    </span>
                  </label>

                  {/* Camera Motion */}
                  <div>
                    <button
                      onClick={() => setShowCameraMotions(!showCameraMotions)}
                      className="flex items-center justify-between w-full text-[11px] text-pplx-muted font-medium"
                    >
                      <span className="flex items-center gap-1.5">
                        <Camera size={11} /> Camera Motion
                        {cameraMotion !== "none" && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">
                            {CAMERA_MOTIONS.find((m) => m.id === cameraMotion)?.label}
                          </span>
                        )}
                      </span>
                      {showCameraMotions ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                    </button>
                    {showCameraMotions && (
                      <div className="grid grid-cols-2 gap-1 mt-1.5 max-h-[160px] overflow-y-auto">
                        {CAMERA_MOTIONS.map((cm) => (
                          <button key={cm.id} onClick={() => setCameraMotion(cm.id)}
                            className={cn("px-2 py-1 rounded text-[9px] border transition-colors text-left",
                              cameraMotion === cm.id ? "border-blue-500 bg-blue-500/10 text-blue-300" : "border-pplx-border text-pplx-muted hover:border-pplx-muted/50",
                            )}>
                            <div className="font-medium">{cm.label}</div>
                            <div className="text-[8px] opacity-60">{cm.desc}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Batch count */}
              <div>
                <label className="text-[11px] text-pplx-muted font-medium mb-1 block">Batch Generation</label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((n) => (
                    <button key={n} onClick={() => setBatchCount(n)}
                      className={cn("flex-1 px-2 py-1.5 rounded text-[10px] font-medium transition-colors",
                        batchCount === n ? "bg-violet-500/20 text-violet-300" : "bg-pplx-card text-pplx-muted hover:bg-white/5",
                      )}>
                      {n}x
                    </button>
                  ))}
                </div>
                <p className="text-[9px] text-pplx-muted/60 mt-0.5">Generate multiple variations at once</p>
              </div>

              {/* ---- Mode-specific inputs ---- */}

              {/* Image-to-Video: keyframes */}
              {mode === "image-to-video" && (
                <>
                  <div>
                    <label className="text-[11px] text-pplx-muted font-medium mb-1 block">
                      Start Frame (First Keyframe) <span className="text-red-400">*</span>
                    </label>
                    <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)}
                      placeholder="https://example.com/start-frame.jpg"
                      className="w-full bg-pplx-card border border-pplx-border rounded-lg px-3 py-2 text-xs placeholder:text-pplx-muted/40 focus:outline-none focus:border-violet-500/50" />
                  </div>
                  <div>
                    <label className="text-[11px] text-pplx-muted font-medium mb-1 block">
                      End Frame (Last Keyframe) <span className="text-pplx-muted/40">(optional)</span>
                    </label>
                    <input value={endImageUrl} onChange={(e) => setEndImageUrl(e.target.value)}
                      placeholder="https://example.com/end-frame.jpg"
                      className="w-full bg-pplx-card border border-pplx-border rounded-lg px-3 py-2 text-xs placeholder:text-pplx-muted/40 focus:outline-none focus:border-violet-500/50" />
                  </div>
                </>
              )}

              {/* Extend */}
              {mode === "extend" && (
                <div className="bg-violet-500/10 rounded-lg p-3 text-[11px] text-violet-300">
                  <p className="font-medium mb-1">Extend Mode</p>
                  <p className="text-pplx-muted text-[10px]">Extends the last completed shot forward. The end of the previous shot becomes the start of this one.</p>
                </div>
              )}

              {/* Reverse Extend */}
              {mode === "reverse-extend" && (
                <div className="bg-pink-500/10 rounded-lg p-3 text-[11px] text-pink-300">
                  <p className="font-medium mb-1">Reverse Extend Mode</p>
                  <p className="text-pplx-muted text-[10px]">Creates a prequel shot. The start of the selected shot becomes the end of this new shot, extending backward.</p>
                </div>
              )}

              {/* Interpolate */}
              {mode === "interpolate" && (
                <div className="bg-blue-500/10 rounded-lg p-3 text-[11px] text-blue-300">
                  <p className="font-medium mb-1">Interpolate Mode</p>
                  <p className="text-pplx-muted text-[10px]">Creates a smooth transition between the first and last completed shots.</p>
                </div>
              )}

              {/* Image Ref */}
              {mode === "image-ref" && (
                <>
                  <div>
                    <label className="text-[11px] text-pplx-muted font-medium mb-1 block">Image Reference URL</label>
                    <input value={imageRefUrl} onChange={(e) => setImageRefUrl(e.target.value)}
                      placeholder="https://example.com/reference.jpg"
                      className="w-full bg-pplx-card border border-pplx-border rounded-lg px-3 py-2 text-xs placeholder:text-pplx-muted/40 focus:outline-none focus:border-violet-500/50" />
                  </div>
                  <div>
                    <label className="text-[11px] text-pplx-muted font-medium mb-1 block">Reference Weight: {imageRefWeight.toFixed(1)}</label>
                    <input type="range" min="0" max="1" step="0.1" value={imageRefWeight} onChange={(e) => setImageRefWeight(parseFloat(e.target.value))} className="w-full accent-violet-500" />
                  </div>
                </>
              )}

              {/* Style Reference */}
              {mode === "style-ref" && (
                <>
                  <div>
                    <label className="text-[11px] text-pplx-muted font-medium mb-1 block">Style Reference Image URL</label>
                    <input value={styleRefUrl} onChange={(e) => setStyleRefUrl(e.target.value)}
                      placeholder="https://example.com/style-reference.jpg"
                      className="w-full bg-pplx-card border border-pplx-border rounded-lg px-3 py-2 text-xs placeholder:text-pplx-muted/40 focus:outline-none focus:border-violet-500/50" />
                  </div>
                  <div>
                    <label className="text-[11px] text-pplx-muted font-medium mb-1 block">Style Weight: {styleRefWeight.toFixed(1)}</label>
                    <input type="range" min="0" max="1" step="0.1" value={styleRefWeight} onChange={(e) => setStyleRefWeight(parseFloat(e.target.value))} className="w-full accent-violet-500" />
                  </div>
                </>
              )}

              {/* Character Reference */}
              {mode === "character-ref" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] text-pplx-muted font-medium">Character Identities</label>
                    <button onClick={() => setCharacters((prev) => [...prev, { name: `Character ${prev.length + 1}`, images: [] }])}
                      className="text-[10px] text-violet-400 hover:text-violet-300 flex items-center gap-1">
                      <Plus size={10} /> Add Character
                    </button>
                  </div>
                  {characters.map((char, ci) => (
                    <div key={ci} className="bg-pplx-card rounded-lg border border-pplx-border p-2 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <input value={char.name} onChange={(e) => { const u = [...characters]; u[ci] = { ...u[ci], name: e.target.value }; setCharacters(u); }}
                          className="flex-1 bg-transparent text-[11px] font-medium focus:outline-none" />
                        <button onClick={() => setCharacters((prev) => prev.filter((_, i) => i !== ci))} className="text-pplx-muted hover:text-red-400"><X size={10} /></button>
                      </div>
                      {char.images.map((url, ii) => (
                        <div key={ii} className="flex items-center gap-1.5">
                          <input value={url} onChange={(e) => { const u = [...characters]; const imgs = [...u[ci].images]; imgs[ii] = e.target.value; u[ci] = { ...u[ci], images: imgs }; setCharacters(u); }}
                            className="flex-1 bg-pplx-bg border border-pplx-border rounded px-2 py-1 text-[10px] focus:outline-none" placeholder="Image URL" />
                          <button onClick={() => { const u = [...characters]; u[ci] = { ...u[ci], images: u[ci].images.filter((_, i) => i !== ii) }; setCharacters(u); }}
                            className="text-pplx-muted hover:text-red-400"><X size={10} /></button>
                        </div>
                      ))}
                      <button onClick={() => {
                        if (!charImageUrl.trim()) return;
                        const u = [...characters]; u[ci] = { ...u[ci], images: [...u[ci].images, charImageUrl.trim()] }; setCharacters(u); setCharImageUrl("");
                      }} className="text-[10px] text-violet-400 hover:text-violet-300 flex items-center gap-1"><Plus size={9} /> Add Image</button>
                    </div>
                  ))}
                  {characters.length > 0 && (
                    <input value={charImageUrl} onChange={(e) => setCharImageUrl(e.target.value)}
                      placeholder="Paste image URL then click Add on a character"
                      className="w-full bg-pplx-card border border-pplx-border rounded-lg px-3 py-2 text-[10px] placeholder:text-pplx-muted/40 focus:outline-none" />
                  )}
                </div>
              )}

              {/* Modify Video */}
              {mode === "modify-video" && (
                <>
                  <div>
                    <label className="text-[11px] text-pplx-muted font-medium mb-1 block">Video URL to Modify <span className="text-red-400">*</span></label>
                    <input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://example.com/video.mp4"
                      className="w-full bg-pplx-card border border-pplx-border rounded-lg px-3 py-2 text-xs placeholder:text-pplx-muted/40 focus:outline-none focus:border-violet-500/50" />
                    {selectedShot?.videoUrl && (
                      <button onClick={() => setMediaUrl(selectedShot.videoUrl!)} className="text-[10px] text-violet-400 hover:text-violet-300 mt-1">
                        Use selected shot&apos;s video
                      </button>
                    )}
                  </div>
                  <div>
                    <label className="text-[11px] text-pplx-muted font-medium mb-1 block">Modify Mode</label>
                    {["subtle", "moderate", "dramatic"].map((cat) => (
                      <div key={cat} className="mb-1.5">
                        <p className="text-[9px] text-pplx-muted/60 uppercase tracking-wider mb-1">{cat}</p>
                        <div className="grid grid-cols-3 gap-1">
                          {MODIFY_MODES.filter((mm) => mm.category === cat).map((mm) => (
                            <button key={mm.id} onClick={() => setModifyMode(mm.id)}
                              className={cn("px-1.5 py-1 rounded text-[9px] border transition-colors text-center",
                                modifyMode === mm.id ? "border-violet-500 bg-violet-500/10 text-violet-300" : "border-pplx-border text-pplx-muted hover:border-pplx-muted/50",
                              )}>
                              {mm.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Modify Image */}
              {mode === "modify-image" && (
                <div>
                  <label className="text-[11px] text-pplx-muted font-medium mb-1 block">Image URL to Modify <span className="text-red-400">*</span></label>
                  <input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://example.com/image.jpg"
                    className="w-full bg-pplx-card border border-pplx-border rounded-lg px-3 py-2 text-xs placeholder:text-pplx-muted/40 focus:outline-none focus:border-violet-500/50" />
                  {selectedShot?.imageUrl && (
                    <button onClick={() => setMediaUrl(selectedShot.imageUrl!)} className="text-[10px] text-violet-400 hover:text-violet-300 mt-1">
                      Use selected shot&apos;s image
                    </button>
                  )}
                </div>
              )}

              {/* Reframe */}
              {mode === "reframe" && (
                <>
                  <div>
                    <label className="text-[11px] text-pplx-muted font-medium mb-1 block">Media URL to Reframe <span className="text-red-400">*</span></label>
                    <input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://example.com/media.mp4"
                      className="w-full bg-pplx-card border border-pplx-border rounded-lg px-3 py-2 text-xs placeholder:text-pplx-muted/40 focus:outline-none focus:border-violet-500/50" />
                    {selectedShot?.videoUrl && (
                      <button onClick={() => setMediaUrl(selectedShot.videoUrl!)} className="text-[10px] text-violet-400 hover:text-violet-300 mt-1">
                        Use selected shot&apos;s video
                      </button>
                    )}
                  </div>
                  <div>
                    <label className="text-[11px] text-pplx-muted font-medium mb-1 block">Target Aspect Ratio</label>
                    <div className="flex flex-wrap gap-1">
                      {ASPECT_RATIOS.map((ar) => (
                        <button key={ar} onClick={() => setReframeAspect(ar)}
                          className={cn("px-2 py-1 rounded text-[10px] font-medium transition-colors",
                            reframeAspect === ar ? "bg-violet-500/20 text-violet-300" : "bg-pplx-card text-pplx-muted hover:bg-white/5",
                          )}>
                          {ar}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Modify Video with Keyframes */}
              {mode === "modify-video-keyframes" && (
                <>
                  <div className="bg-blue-500/10 rounded-lg p-3 text-[11px] text-blue-300">
                    <p className="font-medium mb-1 flex items-center gap-1"><GitBranch size={11} /> Modify with Keyframes</p>
                    <p className="text-pplx-muted text-[10px]">Transform a video using start and end frame references. Define how the video should look at the beginning and end — Ray3 will interpolate the transformation.</p>
                  </div>
                  <div>
                    <label className="text-[11px] text-pplx-muted font-medium mb-1 block">Source Video URL <span className="text-red-400">*</span></label>
                    <input value={modifyKfSourceUrl} onChange={(e) => setModifyKfSourceUrl(e.target.value)} placeholder="https://example.com/video.mp4"
                      className="w-full bg-pplx-card border border-pplx-border rounded-lg px-3 py-2 text-xs placeholder:text-pplx-muted/40 focus:outline-none focus:border-violet-500/50" />
                    {selectedShot?.videoUrl && (
                      <button onClick={() => setModifyKfSourceUrl(selectedShot.videoUrl!)} className="text-[10px] text-violet-400 hover:text-violet-300 mt-1">
                        Use selected shot&apos;s video
                      </button>
                    )}
                  </div>
                  <div>
                    <label className="text-[11px] text-pplx-muted font-medium mb-1 block">Start Frame Reference <span className="text-pplx-muted/40">(optional)</span></label>
                    <input value={modifyKfStartUrl} onChange={(e) => setModifyKfStartUrl(e.target.value)} placeholder="How it should look at the start"
                      className="w-full bg-pplx-card border border-pplx-border rounded-lg px-3 py-2 text-xs placeholder:text-pplx-muted/40 focus:outline-none focus:border-violet-500/50" />
                  </div>
                  <div>
                    <label className="text-[11px] text-pplx-muted font-medium mb-1 block">End Frame Reference <span className="text-pplx-muted/40">(optional)</span></label>
                    <input value={modifyKfEndUrl} onChange={(e) => setModifyKfEndUrl(e.target.value)} placeholder="How it should look at the end"
                      className="w-full bg-pplx-card border border-pplx-border rounded-lg px-3 py-2 text-xs placeholder:text-pplx-muted/40 focus:outline-none focus:border-violet-500/50" />
                  </div>
                  <div>
                    <label className="text-[11px] text-pplx-muted font-medium mb-1 block">Modify Mode</label>
                    <div className="grid grid-cols-3 gap-1">
                      {MODIFY_MODES.slice(0, 6).map((mm) => (
                        <button key={mm.id} onClick={() => setModifyMode(mm.id)}
                          className={cn("px-1.5 py-1 rounded text-[9px] border transition-colors text-center",
                            modifyMode === mm.id ? "border-blue-500 bg-blue-500/10 text-blue-300" : "border-pplx-border text-pplx-muted hover:border-pplx-muted/50",
                          )}>
                          {mm.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Audio: Music Generation */}
              {mode === "generate-audio" && (
                <div className="bg-emerald-500/10 rounded-lg p-3 text-[11px] text-emerald-300">
                  <p className="font-medium mb-1 flex items-center gap-1"><Music size={11} /> Music Generation</p>
                  <p className="text-pplx-muted text-[10px]">Generate background music, scores, and soundscapes from text descriptions. Describe mood, tempo, instrumentation, and genre.</p>
                </div>
              )}

              {/* Audio: Sound Effects */}
              {mode === "generate-sfx" && (
                <div className="bg-emerald-500/10 rounded-lg p-3 text-[11px] text-emerald-300">
                  <p className="font-medium mb-1 flex items-center gap-1"><AudioWaveform size={11} /> Sound Effects</p>
                  <p className="text-pplx-muted text-[10px]">Generate realistic sound effects — explosions, footsteps, rain, machinery, ambient soundscapes, and more.</p>
                </div>
              )}

              {/* Audio: Voiceover */}
              {mode === "voiceover" && (
                <>
                  <div className="bg-emerald-500/10 rounded-lg p-3 text-[11px] text-emerald-300">
                    <p className="font-medium mb-1 flex items-center gap-1"><Mic size={11} /> AI Voiceover</p>
                    <p className="text-pplx-muted text-[10px]">Generate narration and voiceover from text. The prompt field controls voice characteristics (tone, pace, accent). Enter the script to read below.</p>
                  </div>
                  <div>
                    <label className="text-[11px] text-pplx-muted font-medium mb-1 block">Voiceover Script</label>
                    <textarea value={voiceoverText} onChange={(e) => setVoiceoverText(e.target.value)}
                      placeholder="Enter the text to be spoken..."
                      rows={4}
                      className="w-full bg-pplx-card border border-pplx-border rounded-lg px-3 py-2 text-xs placeholder:text-pplx-muted/40 focus:outline-none focus:border-violet-500/50 resize-none" />
                  </div>
                </>
              )}

              {/* Audio: Lip Sync */}
              {mode === "lip-sync" && (
                <>
                  <div className="bg-emerald-500/10 rounded-lg p-3 text-[11px] text-emerald-300">
                    <p className="font-medium mb-1 flex items-center gap-1"><MonitorSpeaker size={11} /> Lip Sync</p>
                    <p className="text-pplx-muted text-[10px]">Synchronize audio to a video with a speaking character. Provide both the video and audio URLs.</p>
                  </div>
                  <div>
                    <label className="text-[11px] text-pplx-muted font-medium mb-1 block">Video URL <span className="text-red-400">*</span></label>
                    <input value={lipSyncVideoUrl} onChange={(e) => setLipSyncVideoUrl(e.target.value)} placeholder="https://example.com/character-speaking.mp4"
                      className="w-full bg-pplx-card border border-pplx-border rounded-lg px-3 py-2 text-xs placeholder:text-pplx-muted/40 focus:outline-none focus:border-violet-500/50" />
                    {selectedShot?.videoUrl && (
                      <button onClick={() => setLipSyncVideoUrl(selectedShot.videoUrl!)} className="text-[10px] text-violet-400 hover:text-violet-300 mt-1">
                        Use selected shot&apos;s video
                      </button>
                    )}
                  </div>
                  <div>
                    <label className="text-[11px] text-pplx-muted font-medium mb-1 block">Audio URL <span className="text-red-400">*</span></label>
                    <input value={lipSyncAudioUrl} onChange={(e) => setLipSyncAudioUrl(e.target.value)} placeholder="https://example.com/voiceover.mp3"
                      className="w-full bg-pplx-card border border-pplx-border rounded-lg px-3 py-2 text-xs placeholder:text-pplx-muted/40 focus:outline-none focus:border-violet-500/50" />
                    {selectedShot?.audioUrl && (
                      <button onClick={() => setLipSyncAudioUrl(selectedShot.audioUrl!)} className="text-[10px] text-violet-400 hover:text-violet-300 mt-1">
                        Use selected shot&apos;s audio
                      </button>
                    )}
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
            <div className="p-3 border-t border-pplx-border space-y-2">
              <button onClick={generate} disabled={generating || (!prompt.trim() && mode !== "reframe" && !isAudioMode)}
                className={cn("w-full py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2",
                  generating ? "bg-violet-500/30 text-violet-300 cursor-wait" : "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-500 hover:to-fuchsia-500 shadow-lg shadow-violet-500/20",
                )}>
                {generating ? (
                  <><Loader2 size={16} className="animate-spin" /> Generating{batchCount > 1 ? ` (${batchCount}x)` : ""}…</>
                ) : (
                  <><Sparkles size={16} /> Generate{batchCount > 1 ? ` (${batchCount}x)` : ""}</>
                )}
              </button>
              {batchCount > 1 && (
                <p className="text-[9px] text-center text-pplx-muted/60">
                  Will create {batchCount} variations with the same prompt
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* STORYBOARD TIMELINE                                            */}
      {/* ============================================================== */}
      <div className="h-[140px] border-t border-pplx-border bg-pplx-sidebar shrink-0 flex flex-col">
        <div className="flex items-center justify-between px-4 py-1.5 border-b border-pplx-border/50">
          <div className="flex items-center gap-2">
            <Film size={12} className="text-violet-400" />
            <span className="text-[10px] font-medium text-pplx-muted uppercase tracking-wider">
              Storyboard · {board?.shots.length ?? 0} shots
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={addShot} className="flex items-center gap-1 text-[10px] text-violet-400 hover:text-violet-300 font-medium">
              <Plus size={10} /> Add Shot
            </button>
          </div>
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
                  selectedShotId === shot.id ? "border-violet-500 ring-1 ring-violet-500/30" : "border-pplx-border",
                  dragIdx === idx && "opacity-50",
                )}
              >
                {/* Thumbnail */}
                <div className="flex-1 relative rounded-t-lg overflow-hidden bg-pplx-bg flex items-center justify-center min-h-0">
                  {shot.videoUrl ? (
                    <video src={shot.videoUrl} className="w-full h-full object-cover" muted playsInline
                      onMouseEnter={(e) => (e.target as HTMLVideoElement).play().catch(() => {})}
                      onMouseLeave={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }} />
                  ) : shot.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={shot.imageUrl} alt="" className="w-full h-full object-cover" />
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
                  <div className="absolute top-0.5 right-0.5 bg-black/60 rounded px-1 text-[8px] text-white/70 font-medium flex items-center gap-0.5">
                    {idx + 1}
                    {shot.phase === "draft" && <span className="text-amber-400">D</span>}
                    {shot.phase === "hifi" && <span className="text-emerald-400">H</span>}
                    {shot.hdr && <Sun size={7} className="text-amber-400" />}
                  </div>

                  {/* Like indicator */}
                  {shot.liked && (
                    <div className="absolute top-0.5 right-5 text-red-400"><Heart size={8} className="fill-red-400" /></div>
                  )}

                  {/* Actions */}
                  <div className="absolute bottom-0.5 right-0.5 opacity-0 group-hover:opacity-100 flex gap-0.5 transition-opacity">
                    {shot.phase === "draft" && shot.status === "completed" && (
                      <button onClick={(e) => { e.stopPropagation(); masterToHiFi(shot.id); }}
                        className="bg-emerald-500/80 rounded p-0.5 text-white" title="Master to HiFi"><Gauge size={8} /></button>
                    )}
                    {shot.status === "completed" && (
                      <button onClick={(e) => { e.stopPropagation(); duplicateShot(shot.id); }}
                        className="bg-violet-500/80 rounded p-0.5 text-white"><Copy size={8} /></button>
                    )}
                    {board.shots.length > 1 && (
                      <button onClick={(e) => { e.stopPropagation(); removeShot(shot.id); }}
                        className="bg-red-500/80 rounded p-0.5 text-white"><Trash2 size={8} /></button>
                    )}
                  </div>
                </div>
                {/* Shot info */}
                <div className="px-1.5 py-1 flex items-center gap-1">
                  <span className="text-[9px] text-pplx-muted truncate flex-1">{shot.prompt || `Shot ${idx + 1}`}</span>
                  <StatusBadge status={shot.status} />
                </div>
              </div>
            ))}

            {/* Add shot card */}
            <button onClick={addShot}
              className="flex flex-col items-center justify-center w-[80px] min-w-[80px] rounded-lg border border-dashed border-pplx-border/50 text-pplx-muted hover:text-violet-400 hover:border-violet-500/30 transition-colors">
              <Plus size={16} />
              <span className="text-[9px] mt-1">Add</span>
            </button>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* FILM PLAYER OVERLAY                                            */}
      {/* ============================================================== */}
      {filmPlayerOpen && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center">
          <button onClick={() => { setFilmPlayerOpen(false); setFilmPlaying(false); }}
            className="absolute top-4 right-4 text-white/60 hover:text-white z-10"><X size={24} /></button>
          <div className="absolute top-4 left-4 flex items-center gap-2 text-white/60">
            <Film size={16} />
            <span className="text-sm font-medium">{board?.name} — Shot {filmPlayIndex + 1}/{completedVideoShots.length}</span>
          </div>
          <div className="flex-1 flex items-center justify-center w-full px-8">
            <video ref={filmVideoRef} className="max-w-full max-h-[80vh] rounded-xl" autoPlay muted={muted}
              onEnded={filmOnEnded} onPlay={() => setFilmPlaying(true)} onPause={() => setFilmPlaying(false)} />
          </div>
          {/* Controls */}
          <div className="absolute bottom-6 flex items-center gap-4 bg-white/10 backdrop-blur-md rounded-full px-6 py-3">
            <button onClick={() => setFilmPlayIndex(Math.max(0, filmPlayIndex - 1))} disabled={filmPlayIndex === 0}
              className="text-white/80 hover:text-white disabled:text-white/20"><SkipBack size={18} /></button>
            <button onClick={() => { if (filmPlaying) filmVideoRef.current?.pause(); else filmVideoRef.current?.play().catch(() => {}); }}
              className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white">
              {filmPlaying ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button onClick={() => setFilmPlayIndex(Math.min(completedVideoShots.length - 1, filmPlayIndex + 1))}
              disabled={filmPlayIndex >= completedVideoShots.length - 1}
              className="text-white/80 hover:text-white disabled:text-white/20"><SkipForward size={18} /></button>
            <div className="w-px h-5 bg-white/20" />
            <button onClick={() => setMuted(!muted)} className="text-white/80 hover:text-white">
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
          </div>
          {/* Shot strip */}
          <div className="absolute bottom-20 flex items-center gap-2 px-4 overflow-x-auto max-w-[80vw]">
            {completedVideoShots.map((shot, idx) => (
              <button key={shot.id} onClick={() => { setFilmPlayIndex(idx); setFilmPlaying(true); }}
                className={cn("w-16 h-10 rounded-md overflow-hidden border-2 transition-all shrink-0",
                  idx === filmPlayIndex ? "border-violet-500 scale-110" : "border-transparent opacity-60 hover:opacity-100",
                )}>
                <video src={shot.videoUrl} className="w-full h-full object-cover" muted playsInline />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SHARE MODAL                                                    */}
      {/* ============================================================== */}
      {showShareModal && (
        <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center" onClick={() => setShowShareModal(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-pplx-card border border-pplx-border rounded-2xl p-6 w-[400px] max-w-[90vw] shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Share2 size={16} className="text-violet-400" /> Share & Remix
              </h3>
              <button onClick={() => setShowShareModal(false)} className="text-pplx-muted hover:text-pplx-text"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-pplx-muted font-medium mb-1 block">Share Link</label>
                <div className="flex gap-2">
                  <input value={shareLink} readOnly className="flex-1 bg-pplx-bg border border-pplx-border rounded-lg px-3 py-2 text-xs" />
                  <button onClick={() => navigator.clipboard.writeText(shareLink)}
                    className="px-3 py-2 rounded-lg bg-violet-500/20 text-violet-300 text-xs font-medium hover:bg-violet-500/30">
                    <Copy size={13} />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-pplx-muted">Allow remixing</span>
                <button onClick={() => updateBoard((b) => ({ ...b, isPublic: !b.isPublic }))}
                  className={cn("w-10 h-5 rounded-full transition-colors relative",
                    board?.isPublic ? "bg-violet-500" : "bg-pplx-border",
                  )}>
                  <div className={cn("w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform",
                    board?.isPublic ? "translate-x-5" : "translate-x-0.5",
                  )} />
                </button>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button onClick={exportBoardAsJson} className="flex-1 py-2 rounded-lg bg-pplx-bg text-xs font-medium text-pplx-muted hover:text-pplx-text hover:bg-white/5 flex items-center justify-center gap-1.5">
                  <FileJson size={12} /> Export Board
                </button>
                <label className="flex-1 py-2 rounded-lg bg-pplx-bg text-xs font-medium text-pplx-muted hover:text-pplx-text hover:bg-white/5 flex items-center justify-center gap-1.5 cursor-pointer">
                  <FileDown size={12} /> Import Board
                  <input type="file" accept=".json" className="hidden" onChange={(e) => { if (e.target.files?.[0]) importBoardFromJson(e.target.files[0]); setShowShareModal(false); }} />
                </label>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button className="flex-1 py-2 rounded-lg bg-pplx-bg text-xs font-medium text-pplx-muted hover:text-pplx-text hover:bg-white/5 flex items-center justify-center gap-1.5">
                  <Globe size={12} /> Public Gallery
                </button>
                <button onClick={() => {
                  const embed = `<iframe src="${shareLink}" width="640" height="360" frameborder="0"></iframe>`;
                  navigator.clipboard.writeText(embed);
                }} className="flex-1 py-2 rounded-lg bg-pplx-bg text-xs font-medium text-pplx-muted hover:text-pplx-text hover:bg-white/5 flex items-center justify-center gap-1.5">
                  <LinkIcon size={12} /> Copy Embed
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

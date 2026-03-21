"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { addBackgroundOp, updateBackgroundOp, removeBackgroundOp } from "@/lib/background-ops";
import {
  Send,
  Loader2,
  Code2,
  Eye,
  FileCode,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Plus,
  Download,
  Copy,
  Check,
  RefreshCw,
  Terminal,
  Maximize2,
  Minimize2,
  X,
  Wand2,
  Sparkles,
  Trash2,
  Play,
  RotateCcw,
  ExternalLink,
  MessageSquare,
  Monitor,
  Smartphone,
  Tablet,
  PanelLeftOpen,
  PanelLeftClose,
  Bug,
  Lightbulb,
  Pencil,
  Zap,
  History,
  Share2,
  Settings,
  ChevronLeft,
  ArrowUp,
  Palette,
  Layout,
  FileText,
  File,
  Image as ImageIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StreamingMessageParser } from "@/lib/app-builder/streaming-message-parser";
import { ActionRunner } from "@/lib/app-builder/action-runner";

// ==========================================================================
// Types
// ==========================================================================

interface ProjectFile {
  path: string;
  content: string;
  language: string;
}

interface ProjectState {
  title: string;
  description: string;
  framework: string;
  files: Record<string, string>;
  entryPoint: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
  buildCommand: string;
  startCommand: string;
  installCommand: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

interface BuildLog {
  id: string;
  type: "info" | "success" | "error" | "warn" | "command";
  message: string;
  timestamp: number;
}

type ViewMode = "code" | "preview";
type DevicePreview = "desktop" | "tablet" | "mobile";

interface VersionSnapshot {
  id: string;
  label: string;
  project: ProjectState;
  timestamp: number;
}

/** Persisted project entry for the history sidebar */
interface SavedProject {
  id: string;
  title: string;
  description: string;
  prompt: string; // original prompt that created the project
  project: ProjectState;
  messages: ChatMessage[];
  versions: VersionSnapshot[];
  createdAt: number;
  updatedAt: number;
}

// ==========================================================================
// Project History Persistence
// ==========================================================================

const HISTORY_KEY = "app-builder:history";
const ACTIVE_PROJECT_KEY = "app-builder:active-project-id";
const MAX_HISTORY = 50;

function loadProjectHistory(): SavedProject[] {
  try {
    if (typeof window === "undefined") return [];
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch { /* ignore */ }
  return [];
}

function saveProjectHistory(history: SavedProject[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  } catch { /* ignore — quota exceeded */ }
}

function getActiveProjectId(): string | null {
  try {
    return typeof window !== "undefined" ? localStorage.getItem(ACTIVE_PROJECT_KEY) : null;
  } catch { return null; }
}

function setActiveProjectId(id: string | null) {
  try {
    if (id) localStorage.setItem(ACTIVE_PROJECT_KEY, id);
    else localStorage.removeItem(ACTIVE_PROJECT_KEY);
  } catch { /* ignore */ }
}

// ==========================================================================
// Constants
// ==========================================================================

const STARTER_TEMPLATES = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: Monitor,
    prompt: "Build a full analytics dashboard React app with: sidebar navigation, KPI stat cards with animated counters, revenue line chart, user growth bar chart, recent activity feed, sortable data table with pagination, date range filter, and dark/light theme toggle. Use Chart.js for charts. Include 50+ rows of realistic mock data.",
  },
  {
    id: "ecommerce",
    label: "E-Commerce",
    icon: Palette,
    prompt: "Build a full e-commerce React app with: product grid with filter sidebar (category, price range, rating), product detail page with image gallery and reviews, shopping cart with quantity controls, checkout flow with form validation, wishlist, search bar with fuzzy matching. Include 20+ realistic products with Unsplash images. Persist cart to localStorage.",
  },
  {
    id: "taskmanager",
    label: "Task Manager",
    icon: Check,
    prompt: "Build a full-featured project management React app with: Kanban board with drag-and-drop cards between columns, task detail modal with title/description/due date/priority/assignee, sidebar with project list, list view toggle, search and filter bar, team member avatars. Persist all data to localStorage. Include 30+ sample tasks across 4 columns.",
  },
  {
    id: "social",
    label: "Social App",
    icon: MessageSquare,
    prompt: "Build a social media React app with: feed of posts with images/likes/comments, user profiles with avatar and bio, create post modal with image upload simulation, comment threads, like animations, notification dropdown, responsive sidebar navigation, and real-time activity simulation. Include 15+ mock posts with Unsplash photos.",
  },
  {
    id: "crm",
    label: "CRM",
    icon: Layout,
    prompt: "Build a CRM (Customer Relationship Management) React app with: contact list with search/filter/sort, contact detail view with activity timeline, deal pipeline as horizontal kanban, email compose modal, dashboard with sales stats and charts, settings page. Include 50+ mock contacts and 20+ deals. Use localStorage for persistence.",
  },
  {
    id: "fullstack",
    label: "Full-Stack API",
    icon: FileText,
    prompt: "Build a full-stack blog/CMS React app with: article list with categories and tags, article detail with rich content, admin panel to create/edit/delete posts, user authentication simulation (login/register forms), API client with mock backend that falls back to localStorage, Express server routes in server/ directory, and a README with setup instructions. Include 10+ sample blog posts.",
  },
];

const FILE_ICONS: Record<string, { icon: LucideIcon; color: string }> = {
  html: { icon: Code2, color: "#e34c26" },
  css: { icon: FileCode, color: "#1572b6" },
  js: { icon: FileCode, color: "#f7df1e" },
  jsx: { icon: FileCode, color: "#61dafb" },
  ts: { icon: FileCode, color: "#3178c6" },
  tsx: { icon: FileCode, color: "#3178c6" },
  json: { icon: File, color: "#a8b1c2" },
  md: { icon: FileText, color: "#519aba" },
  svg: { icon: ImageIcon, color: "#ffb13b" },
  png: { icon: ImageIcon, color: "#a8b1c2" },
  default: { icon: File, color: "#8b8b94" },
};

// ==========================================================================
// Helpers
// ==========================================================================

function getFileLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  const langMap: Record<string, string> = {
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    less: "less",
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    json: "json",
    md: "markdown",
    svg: "xml",
    xml: "xml",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
  };
  return langMap[ext] || "plaintext";
}

function getFileIcon(path: string): { icon: LucideIcon; color: string } {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  return FILE_ICONS[ext] || FILE_ICONS.default;
}

function buildFileTree(files: Record<string, string>): FileTreeNode[] {
  const root: FileTreeNode[] = [];

  for (const filePath of Object.keys(files).sort()) {
    const parts = filePath.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isFile = i === parts.length - 1;
      const existing = current.find((n) => n.name === name);

      if (existing) {
        if (!isFile) current = existing.children || [];
      } else {
        const node: FileTreeNode = {
          name,
          path: parts.slice(0, i + 1).join("/"),
          isFile,
          children: isFile ? undefined : [],
        };
        current.push(node);
        if (!isFile) current = node.children!;
      }
    }
  }

  return root;
}

interface FileTreeNode {
  name: string;
  path: string;
  isFile: boolean;
  children?: FileTreeNode[];
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ==========================================================================
// Artifact Parser — Bolt.new-style <boltArtifact> / <boltAction> format
// ==========================================================================

/** Extract a named attribute value from an HTML-style tag string */
function extractAttr(tagStr: string, name: string): string | undefined {
  // Handles: name="value", name='value', name=value (unquoted)
  const re = new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i");
  const m = tagStr.match(re);
  return m ? m[1] : undefined;
}

function parseArtifactResponse(text: string): {
  title: string;
  id: string;
  files: Record<string, string>;
} | null {
  const files: Record<string, string> = {};
  let title = "My App";
  let id = "app";

  // ── 1. Find the <boltArtifact ...> opening tag (flexible attribute matching) ──
  const artifactTagMatch = text.match(/<boltArtifact([^>]*)>/i);
  if (artifactTagMatch) {
    const attrs = artifactTagMatch[1];
    const extractedId = extractAttr(attrs, "id");
    const extractedTitle = extractAttr(attrs, "title");
    if (extractedId) id = extractedId;
    if (extractedTitle) title = extractedTitle;
  }

  // ── 2. Extract all COMPLETED file actions ──
  // Use a flexible regex: <boltAction ...type="file"...filePath="X"...>CONTENT</boltAction>
  const actionRegex = /<boltAction\s*([^>]*)>([\s\S]*?)<\/boltAction>/gi;
  let match;
  while ((match = actionRegex.exec(text)) !== null) {
    const attrs = match[1];
    const content = match[2];

    const actionType = extractAttr(attrs, "type");
    if (actionType === "file") {
      const filePath = extractAttr(attrs, "filePath");
      if (filePath) {
        // Trim leading/trailing newlines but preserve content structure
        files[filePath] = content.replace(/^\n/, "").replace(/\n$/, "");
      }
    }
  }

  // ── 3. Capture the last in-progress action (streaming — no closing tag yet) ──
  // Strip all completed actions, then look for an unclosed one
  const stripped = text.replace(/<boltAction\s*[^>]*>[\s\S]*?<\/boltAction>/gi, "");
  const partialMatch = stripped.match(/<boltAction\s*([^>]*)>([\s\S]*)$/i);
  if (partialMatch) {
    const attrs = partialMatch[1];
    const content = partialMatch[2];
    const actionType = extractAttr(attrs, "type");
    if (actionType === "file") {
      const filePath = extractAttr(attrs, "filePath");
      if (filePath && !files[filePath]) {
        files[filePath] = content.replace(/^\n/, "");
      }
    }
  }

  if (Object.keys(files).length === 0) return null;
  return { title, id, files };
}

// Fallback: try extracting from JSON (backwards compatibility)
function parseJSONResponse(text: string): {
  title: string;
  files: Record<string, string>;
} | null {
  try {
    let jsonStr = text;
    const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    } else {
      const startIdx = text.indexOf("{");
      const endIdx = text.lastIndexOf("}");
      if (startIdx !== -1 && endIdx !== -1) {
        jsonStr = text.slice(startIdx, endIdx + 1);
      }
    }
    const parsed = JSON.parse(jsonStr);
    if (parsed.files && typeof parsed.files === "object") {
      return {
        title: parsed.title || "My App",
        files: parsed.files,
      };
    }
  } catch {
    // JSON parse failed
  }
  return null;
}

// ==========================================================================
// File Tree Component
// ==========================================================================

function FileTreeItem({
  node,
  depth,
  selectedFile,
  onSelect,
  expandedDirs,
  onToggleDir,
}: {
  node: FileTreeNode;
  depth: number;
  selectedFile: string;
  onSelect: (path: string) => void;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
}) {
  const isExpanded = expandedDirs.has(node.path);
  const iconInfo = node.isFile ? getFileIcon(node.path) : null;
  const Icon = iconInfo?.icon || FolderOpen;

  return (
    <>
      <button
        onClick={() => {
          if (node.isFile) {
            onSelect(node.path);
          } else {
            onToggleDir(node.path);
          }
        }}
        className={cn(
          "w-full flex items-center gap-1.5 px-2 py-1 text-xs hover:bg-white/5 transition-colors rounded group",
          node.isFile && selectedFile === node.path && "bg-white/10 text-pplx-text",
          node.isFile && selectedFile !== node.path && "text-pplx-muted",
          !node.isFile && "text-pplx-muted"
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {!node.isFile && (
          <ChevronRight
            size={12}
            className={cn(
              "flex-shrink-0 transition-transform",
              isExpanded && "rotate-90"
            )}
          />
        )}
        <Icon
          size={13}
          className="flex-shrink-0"
          style={{ color: node.isFile ? iconInfo?.color : "#8b8b94" }}
        />
        <span className="truncate">{node.name}</span>
      </button>
      {!node.isFile && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedFile={selectedFile}
              onSelect={onSelect}
              expandedDirs={expandedDirs}
              onToggleDir={onToggleDir}
            />
          ))}
        </div>
      )}
    </>
  );
}

// ==========================================================================
// Code Editor with Syntax Highlighting (lightweight)
// ==========================================================================

function CodeEditor({
  content,
  language,
  onChange,
  readOnly = false,
}: {
  content: string;
  language: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const lines = content.split("\n");

  const syncScroll = useCallback(() => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  return (
    <div className="flex h-full font-mono text-[13px] leading-[1.6] bg-[#0d0d0e]">
      {/* Line numbers */}
      <div
        ref={lineNumbersRef}
        className="flex-shrink-0 py-3 pr-3 pl-4 text-right select-none overflow-hidden text-pplx-muted/40 border-r border-pplx-border/50"
        style={{ width: "60px" }}
      >
        {lines.map((_, i) => (
          <div key={i} className="h-[1.6em]">
            {i + 1}
          </div>
        ))}
      </div>
      {/* Editor */}
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => onChange?.(e.target.value)}
        onScroll={syncScroll}
        readOnly={readOnly}
        spellCheck={false}
        className={cn(
          "flex-1 bg-transparent text-pplx-text p-3 resize-none outline-none overflow-auto",
          "selection:bg-pplx-accent/20",
          readOnly && "cursor-default"
        )}
        style={{
          tabSize: 2,
          whiteSpace: "pre",
          overflowWrap: "normal",
          fontFamily:
            "'JetBrains Mono', 'Fira Code', 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, monospace",
        }}
      />
    </div>
  );
}

// ==========================================================================
// Terminal Panel
// ==========================================================================

function TerminalPanel({
  logs,
  isOpen,
  onToggle,
}: {
  logs: BuildLog[];
  isOpen: boolean;
  onToggle: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="flex items-center gap-2 px-3 py-1.5 text-xs text-pplx-muted hover:text-pplx-text border-t border-pplx-border bg-[#0d0d0e] transition-colors"
      >
        <Terminal size={12} />
        Terminal
        {logs.length > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-pplx-accent/20 text-pplx-accent text-[10px]">
            {logs.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="border-t border-pplx-border bg-[#0d0d0e] flex flex-col" style={{ height: "180px" }}>
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-pplx-border/50">
        <div className="flex items-center gap-2">
          <Terminal size={12} className="text-pplx-muted" />
          <span className="text-xs text-pplx-muted font-medium">Terminal</span>
        </div>
        <button onClick={onToggle} className="text-pplx-muted hover:text-pplx-text">
          <X size={12} />
        </button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-auto px-3 py-2 font-mono text-xs">
        {logs.map((log) => (
          <div
            key={log.id}
            className={cn(
              "py-0.5",
              log.type === "error" && "text-red-400",
              log.type === "warn" && "text-yellow-400",
              log.type === "success" && "text-green-400",
              log.type === "command" && "text-pplx-accent",
              log.type === "info" && "text-pplx-muted"
            )}
          >
            {log.type === "command" && <span className="text-green-400/70">$ </span>}
            {log.message}
          </div>
        ))}
        {logs.length === 0 && (
          <div className="text-pplx-muted/40 italic">Ready...</div>
        )}
      </div>
    </div>
  );
}

// ==========================================================================
// Preview Panel
// ==========================================================================

// Script injected at top of every preview to capture console.log/error and pipe them
// to the parent window via postMessage
const CONSOLE_BRIDGE = `
(function() {
  var _methods = ['log','info','warn','error'];
  _methods.forEach(function(m) {
    var orig = console[m];
    console[m] = function() {
      orig.apply(console, arguments);
      var msg = Array.prototype.slice.call(arguments).map(function(a) {
        try { return typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a); } catch(e) { return String(a); }
      }).join(' ');
      try { window.parent.postMessage({ __ottoBridge: true, level: m, message: msg }, '*'); } catch(e) {}
    };
  });
  window.addEventListener('error', function(e) {
    var loc = e.filename ? ' (' + (e.lineno || '') + ':' + (e.colno || '') + ')' : '';
    try { window.parent.postMessage({ __ottoBridge: true, level: 'error', message: (e.message || 'Script error') + loc }, '*'); } catch(err) {}
  });
  window.addEventListener('unhandledrejection', function(e) {
    var msg = e.reason ? (e.reason.message || String(e.reason)) : 'Unknown rejection';
    try { window.parent.postMessage({ __ottoBridge: true, level: 'error', message: 'Unhandled Promise: ' + msg }, '*'); } catch(err) {}
  });
})();
`;

function PreviewPanel({
  project,
  device,
  onDeviceChange,
  onRefresh,
  refreshKey,
  onConsoleEvent,
}: {
  project: ProjectState | null;
  device: DevicePreview;
  onDeviceChange: (d: DevicePreview) => void;
  onRefresh: () => void;
  refreshKey: number;
  onConsoleEvent?: (level: string, message: string) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Listen for console events from the iframe
  useEffect(() => {
    if (!onConsoleEvent) return;
    const handler = (e: MessageEvent) => {
      const data = e.data;
      if (!data || !data.__ottoBridge) return;
      onConsoleEvent(data.level ?? 'log', data.message ?? '');
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onConsoleEvent]);

  // Build a single HTML document from project files for srcDoc rendering
  // Supports: plain HTML, React JSX (auto-detected), and mixed projects
  const previewHtml = useMemo(() => {
    if (!project?.files) return null;

    const bridgeTag = `<script>\n${CONSOLE_BRIDGE}\n<\/script>`;
    const files = project.files;
    const filePaths = Object.keys(files);

    // ── Detect if this is a React project ─────────────────────────────────
    const hasJsx = filePaths.some((p) => /\.(jsx|tsx)$/i.test(p));
    const hasReactDep =
      files["package.json"]?.includes('"react"') ||
      filePaths.some((p) => p.endsWith(".jsx") || p.endsWith(".tsx"));
    const isReactProject = hasJsx || hasReactDep;

    // ── Gather file categories ────────────────────────────────────────────
    const cssFiles = Object.entries(files).filter(([p]) => p.endsWith(".css"));
    const jsxFiles = Object.entries(files).filter(([p]) =>
      /\.(jsx|tsx)$/i.test(p)
    );
    const jsFiles = Object.entries(files).filter(
      ([p]) =>
        /\.(js|ts)$/i.test(p) &&
        !p.endsWith(".config.js") &&
        !p.endsWith(".config.ts") &&
        p !== "index.html" &&
        !p.startsWith("server/") &&
        !p.startsWith("server\\")
    );

    // ── Helper: normalize import path for module registry ─────────────────
    const normalizeModulePath = (importPath: string): string => {
      return importPath
        .replace(/^\.\//, "")
        .replace(/^src\//, "")
        .replace(/\.(jsx|tsx|js|ts)$/i, "")
        .replace(/\/index$/, "");
    };

    // ── Helper: rewrite imports to use global module registry ─────────────
    const rewriteImports = (code: string): string => {
      // Handle: import Default from './path'
      let result = code.replace(
        /import\s+(\w+)\s+from\s+['"](\.[^'"]+)['"]/g,
        (_, name, path) => {
          const key = normalizeModulePath(path);
          return `const ${name} = (window.__MODULES__["${key}"] || {}).default || window.__MODULES__["${key}"]`;
        }
      );
      // Handle: import { a, b } from './path'
      result = result.replace(
        /import\s+\{([^}]+)\}\s+from\s+['"](\.[^'"]+)['"]/g,
        (_, names, path) => {
          const key = normalizeModulePath(path);
          const destructured = names
            .split(",")
            .map((n: string) => n.trim())
            .filter(Boolean)
            .map((n: string) => {
              const parts = n.split(/\s+as\s+/);
              return parts.length > 1 ? `${parts[0].trim()}: ${parts[1].trim()}` : parts[0].trim();
            })
            .join(", ");
          return `const { ${destructured} } = window.__MODULES__["${key}"] || {}`;
        }
      );
      // Handle: import Default, { a, b } from './path'
      result = result.replace(
        /import\s+(\w+)\s*,\s*\{([^}]+)\}\s+from\s+['"](\.[^'"]+)['"]/g,
        (_, defName, names, path) => {
          const key = normalizeModulePath(path);
          const destructured = names.split(",").map((n: string) => n.trim()).filter(Boolean).join(", ");
          return `const ${defName} = (window.__MODULES__["${key}"] || {}).default || window.__MODULES__["${key}"];\nconst { ${destructured} } = window.__MODULES__["${key}"] || {}`;
        }
      );
      // Strip imports from node_modules (react, react-dom, etc.) — they're CDN globals
      result = result.replace(
        /import\s+(?:\w+|\{[^}]*\}|[\w,\s{}]*)\s+from\s+['"][^.][^'"]*['"]\s*;?/g,
        "// [CDN import stripped]"
      );
      // Strip bare export default at end
      // Keep "export default function" and "export default class" but rewrite them
      result = result.replace(
        /export\s+default\s+function\s+(\w+)/g,
        "function $1"
      );
      result = result.replace(
        /export\s+default\s+class\s+(\w+)/g,
        "class $1"
      );
      // Handle: export default ComponentName (bare reference)
      result = result.replace(
        /export\s+default\s+(\w+)\s*;/g,
        "// default export: $1"
      );
      // Handle: export function / export const / export class
      result = result.replace(/export\s+(function|const|let|class)\s+/g, "$1 ");
      return result;
    };

    // ── Helper: detect the default export name from file content ──────────
    const getDefaultExportName = (code: string, filePath: string): string | null => {
      // export default function Foo
      let m = code.match(/export\s+default\s+function\s+(\w+)/);
      if (m) return m[1];
      // export default class Foo
      m = code.match(/export\s+default\s+class\s+(\w+)/);
      if (m) return m[1];
      // export default Foo;
      m = code.match(/export\s+default\s+(\w+)\s*;/);
      if (m) return m[1];
      // Fallback: use filename
      const fileName = filePath.split("/").pop()?.replace(/\.(jsx|tsx|js|ts)$/i, "");
      return fileName || null;
    };

    // ── Sort files so dependencies come before dependents ─────────────────
    const sortFilesByDeps = (
      fileEntries: [string, string][]
    ): [string, string][] => {
      const scored = fileEntries.map(([p, c]) => {
        // Files that are imported by many come first
        const depth = p.split("/").length;
        const isUtil = /\b(util|hook|helper|data|mock|constant|config|context|type)\b/i.test(p);
        const isApp = /^App\.(jsx|tsx|js|ts)$/i.test(p.split("/").pop() || "");
        const isPage = /page|view|screen/i.test(p);
        // Lower score = comes first
        let score = depth * 10;
        if (isUtil) score -= 30; // utils first
        if (isApp) score += 100; // App.jsx last (it imports everything)
        if (isPage) score += 50;
        return { path: p, content: c, score };
      });
      scored.sort((a, b) => a.score - b.score);
      return scored.map((s) => [s.path, s.content]);
    };

    // ════════════════════════════════════════════════════════════════════════
    // REACT PROJECT — build with CDN + Babel + module registry
    // ════════════════════════════════════════════════════════════════════════
    if (isReactProject) {
      const allCodeFiles = sortFilesByDeps([...jsxFiles, ...jsFiles]);

      // Find the App entry point
      const appEntry = filePaths.find(
        (p) => /^App\.(jsx|tsx)$/i.test(p.split("/").pop() || "")
      );
      const appExportName = appEntry
        ? getDefaultExportName(files[appEntry], appEntry) || "App"
        : "App";

      // Build module scripts — each file registers itself in __MODULES__
      const moduleScripts = allCodeFiles
        .filter(([p]) => p !== appEntry) // App.jsx gets special treatment
        .map(([filePath, content]) => {
          const key = normalizeModulePath(filePath);
          const defaultName = getDefaultExportName(content, filePath);
          const rewritten = rewriteImports(content);

          // Wrap in IIFE that registers into module registry
          return `<script type="text/babel" data-type="module" data-module="${key}">
(function() {
  ${rewritten}
  // Register module
  window.__MODULES__["${key}"] = window.__MODULES__["${key}"] || {};
  ${defaultName ? `window.__MODULES__["${key}"].default = ${defaultName};` : ""}
  // Also register named exports by scanning for top-level functions/consts
  ${defaultName ? `window.__MODULES__["${key}"]["${defaultName}"] = ${defaultName};` : ""}
})();
<\/script>`;
        })
        .join("\n");

      // App entry script — mounts to #root
      const appScript = appEntry
        ? (() => {
            const rewritten = rewriteImports(files[appEntry]);
            return `<script type="text/babel" data-type="module">
(function() {
  const { useState, useEffect, useCallback, useMemo, useRef, useReducer, useContext, createContext, memo, Fragment } = React;
  ${rewritten}
  // Mount app
  const rootEl = document.getElementById('root');
  if (rootEl && typeof ${appExportName} !== 'undefined') {
    ReactDOM.createRoot(rootEl).render(React.createElement(${appExportName}));
  }
})();
<\/script>`;
          })()
        : "";

      // CSS blocks
      const cssBlocks = cssFiles
        .map(([, c]) => `<style>\n${c}\n</style>`)
        .join("\n");

      // Check for existing index.html
      const existingHtml = files["index.html"];
      const title = project.title || "App";

      if (existingHtml) {
        // Merge with existing HTML — inject React CDN, modules, and scripts
        let result = existingHtml;

        // Inject console bridge
        if (result.includes("<head>")) {
          result = result.replace("<head>", `<head>\n  ${bridgeTag}`);
        } else {
          result = bridgeTag + "\n" + result;
        }

        // Inject CDN scripts before </head> if not already present
        const cdnBlock = `
  <!-- Auto-injected by preview engine -->
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"><\/script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"><\/script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>*, *::before, *::after { font-family: 'Inter', system-ui, sans-serif; } body { margin: 0; }</style>
  <script>window.__MODULES__ = {};<\/script>
  ${cssBlocks}`;

        if (result.includes("</head>")) {
          result = result.replace("</head>", `${cdnBlock}\n</head>`);
        }

        // Ensure #root exists
        if (!result.includes('id="root"')) {
          if (result.includes("<body>")) {
            result = result.replace("<body>", '<body>\n  <div id="root"></div>');
          }
        }

        // Inject module scripts and app script before </body>
        const scriptsBlock = `\n${moduleScripts}\n${appScript}\n`;
        if (result.includes("</body>")) {
          result = result.replace("</body>", `${scriptsBlock}\n</body>`);
        } else {
          result += scriptsBlock;
        }

        return result;
      }

      // No index.html — build from scratch
      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  ${bridgeTag}
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"><\/script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"><\/script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>*, *::before, *::after { font-family: 'Inter', system-ui, sans-serif; } body { margin: 0; }</style>
  <script>window.__MODULES__ = {};<\/script>
  ${cssBlocks}
</head>
<body>
  <div id="root"></div>
  ${moduleScripts}
  ${appScript}
</body>
</html>`;
    }

    // ════════════════════════════════════════════════════════════════════════
    // VANILLA HTML PROJECT — original behavior (enhanced)
    // ════════════════════════════════════════════════════════════════════════
    const entry = project.entryPoint || "index.html";
    let html = files[entry];

    if (!html) {
      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${project.title || "App"}</title>
  ${bridgeTag}
  <script src="https://cdn.tailwindcss.com"><\/script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
  <style>* { font-family: 'Inter', sans-serif; } body { margin: 0; }</style>
  ${cssFiles.map(([, c]) => `<style>\n${c}\n</style>`).join("\n")}
</head>
<body>
  <div id="root"></div>
  <div id="app"></div>
  ${jsFiles.map(([, c]) => `<script>\n${c}\n<\/script>`).join("\n")}
</body>
</html>`;
    }

    let result = html;

    // Inject console bridge
    if (result.includes("<head>")) {
      result = result.replace("<head>", `<head>\n  ${bridgeTag}`);
    } else if (result.includes("<html")) {
      result = result.replace(/(<html[^>]*>)/i, `$1\n<head>${bridgeTag}</head>`);
    } else {
      result = bridgeTag + "\n" + result;
    }

    const inlinedFiles = new Set<string>();

    // Inline CSS references
    for (const [filePath, content] of Object.entries(files)) {
      if (!filePath.endsWith(".css")) continue;
      const escapedPath = filePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const linkPattern = new RegExp(
        `<link[^>]*href=["'](?:\\.?\\/)?${escapedPath}["'][^>]*\\/?>`,
        "gi"
      );
      if (linkPattern.test(result)) {
        result = result.replace(linkPattern, `<style>\n${content}\n</style>`);
        inlinedFiles.add(filePath);
      }
    }

    // Inline JS references
    for (const [filePath, content] of Object.entries(files)) {
      if (!filePath.endsWith(".js") || filePath.endsWith(".config.js")) continue;
      const escapedPath = filePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const scriptPattern = new RegExp(
        `<script[^>]*src=["'](?:\\.?\\/)?${escapedPath}["'][^>]*>[\\s\\S]*?<\\/script>`,
        "gi"
      );
      if (scriptPattern.test(result)) {
        result = result.replace(scriptPattern, `<script>\n${content}\n<\/script>`);
        inlinedFiles.add(filePath);
      }
    }

    // Inject unreferenced CSS/JS
    const unreferencedCSS = cssFiles.filter(([p]) => !inlinedFiles.has(p));
    const unreferencedJS = jsFiles.filter(([p]) => !inlinedFiles.has(p));

    if (unreferencedCSS.length > 0) {
      const cssBlock = unreferencedCSS
        .map(([, c]) => `<style>\n${c}\n</style>`)
        .join("\n");
      if (result.includes("</head>")) {
        result = result.replace("</head>", `${cssBlock}\n</head>`);
      } else {
        result = cssBlock + "\n" + result;
      }
    }

    if (unreferencedJS.length > 0) {
      const jsBlock = unreferencedJS
        .map(([, c]) => `<script>\n${c}\n<\/script>`)
        .join("\n");
      if (result.includes("</body>")) {
        result = result.replace("</body>", `${jsBlock}\n</body>`);
      } else {
        result = result + "\n" + jsBlock;
      }
    }

    return result;
  }, [project, refreshKey]);

  const deviceWidths = {
    desktop: "100%",
    tablet: "768px",
    mobile: "375px",
  };

  return (
    <div className="flex flex-col h-full bg-[#0d0d0e]">
      {/* Preview toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-pplx-border bg-pplx-card/50">
        <div className="flex items-center gap-1">
          {/* URL bar */}
          <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-pplx-bg/80 border border-pplx-border/50 min-w-[200px]">
            <div className="w-2 h-2 rounded-full bg-green-400" />
            <span className="text-[11px] text-pplx-muted truncate">
              {project?.title ? `localhost:3005 — ${project.title}` : "localhost:3005"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-0.5">
          {/* Device toggles */}
          {(
            [
              { id: "desktop", icon: Monitor, label: "Desktop" },
              { id: "tablet", icon: Tablet, label: "Tablet" },
              { id: "mobile", icon: Smartphone, label: "Mobile" },
            ] as const
          ).map((d) => (
            <button
              key={d.id}
              onClick={() => onDeviceChange(d.id)}
              className={cn(
                "p-1.5 rounded transition-colors",
                device === d.id
                  ? "bg-pplx-accent/20 text-pplx-accent"
                  : "text-pplx-muted hover:text-pplx-text hover:bg-white/5"
              )}
              title={d.label}
            >
              <d.icon size={13} />
            </button>
          ))}

          <div className="w-px h-4 bg-pplx-border mx-1" />

          <button
            onClick={onRefresh}
            className="p-1.5 rounded text-pplx-muted hover:text-pplx-text hover:bg-white/5 transition-colors"
            title="Refresh preview"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* Preview iframe */}
      <div className="flex-1 flex items-start justify-center overflow-auto p-0 bg-[#1a1a1d]">
        <div
          className={cn(
            "h-full transition-all duration-300",
            device !== "desktop" && "rounded-lg shadow-2xl mt-4 mb-4 border border-pplx-border/30"
          )}
          style={{
            width: deviceWidths[device],
            maxWidth: "100%",
            height: device !== "desktop" ? "calc(100% - 32px)" : "100%",
          }}
        >
          {previewHtml ? (
            <iframe
              ref={iframeRef}
              key={refreshKey}
              srcDoc={previewHtml}
              className="w-full h-full border-0 bg-white"
              sandbox="allow-scripts allow-modals allow-forms allow-popups allow-same-origin allow-downloads"
              title="App Preview"
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-pplx-muted bg-[#0d0d0e]">
              <Eye size={32} className="opacity-30" />
              <p className="text-sm">No preview available yet</p>
              <p className="text-xs opacity-50">
                Describe your app to get started
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ==========================================================================
// Main App Builder Component
// ==========================================================================

export function AppBuilderClient() {
  // ── State ───────────────────────────────────────────────────────────────
  const [project, setProject] = useState<ProjectState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState("");
  const [generationStartTime, setGenerationStartTime] = useState<number | null>(null);
  const [generationElapsed, setGenerationElapsed] = useState(0);
  const [generationStep, setGenerationStep] = useState(0);
  const [selectedFile, setSelectedFile] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("preview");
  const [device, setDevice] = useState<DevicePreview>("desktop");
  const [showTerminal, setShowTerminal] = useState(false);
  const [buildLogs, setBuildLogs] = useState<BuildLog[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [refreshKey, setRefreshKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const [showChat, setShowChat] = useState(true);

  // ── Project History State ─────────────────────────────────────────────
  const [projectHistory, setProjectHistory] = useState<SavedProject[]>([]);
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(true);
  const [historySearch, setHistorySearch] = useState("");
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingTitleDraft, setEditingTitleDraft] = useState("");

  // ─── Background ops tracking ─────────────────────────────────────────────
  const bgOpRegistered = useRef(false);
  useEffect(() => {
    if (isGenerating) {
      if (!bgOpRegistered.current) {
        addBackgroundOp({
          id: "app-builder",
          type: "app-build",
          label: "App Builder",
          status: "running",
          href: "/computer/app-builder",
          startedAt: generationStartTime || Date.now(),
          detail: generationStatus || "Building...",
        });
        bgOpRegistered.current = true;
      } else {
        updateBackgroundOp("app-builder", {
          detail: generationStatus || "Building...",
        });
      }
    } else {
      if (bgOpRegistered.current) {
        removeBackgroundOp("app-builder");
        bgOpRegistered.current = false;
      }
    }
  }, [isGenerating, generationStatus, generationStartTime]);
  const [versions, setVersions] = useState<VersionSnapshot[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [enhancedPrompt, setEnhancedPrompt] = useState("");
  const [showEnhancePreview, setShowEnhancePreview] = useState(false);
  const [isResponseTruncated, setIsResponseTruncated] = useState(false);

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Load project history on mount ─────────────────────────────────────

  useEffect(() => {
    const history = loadProjectHistory();
    setProjectHistory(history);
    const savedId = getActiveProjectId();
    if (savedId) {
      const saved = history.find((p) => p.id === savedId);
      if (saved) {
        setActiveProjectIdState(savedId);
        setProject(saved.project);
        setMessages(saved.messages);
        setVersions(saved.versions);
        // Auto-select entry point
        if (saved.project.files) {
          const keys = Object.keys(saved.project.files);
          const entry = keys.find((f) => f === saved.project.entryPoint) || keys[0];
          if (entry) setSelectedFile(entry);
        }
      }
    }
  }, []);

  // ── Auto-save current project to history ──────────────────────────────

  const saveCurrentProject = useCallback((proj: ProjectState, msgs: ChatMessage[], vers: VersionSnapshot[], projId?: string | null) => {
    const id = projId || activeProjectId || generateId();
    const now = Date.now();
    const firstUserMsg = msgs.find((m) => m.role === "user");

    setProjectHistory((prev) => {
      const existing = prev.find((p) => p.id === id);
      const entry: SavedProject = {
        id,
        title: proj.title || "Untitled App",
        description: proj.description || "",
        prompt: firstUserMsg?.content || "",
        project: JSON.parse(JSON.stringify(proj)),
        messages: msgs.filter((m) => !m.isStreaming), // don't save streaming state
        versions: vers,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };

      const filtered = prev.filter((p) => p.id !== id);
      const updated = [entry, ...filtered].slice(0, MAX_HISTORY);
      saveProjectHistory(updated);
      return updated;
    });

    if (!activeProjectId || activeProjectId !== id) {
      setActiveProjectIdState(id);
      setActiveProjectId(id);
    }

    return id;
  }, [activeProjectId]);

  // ── Save project files to server Files system ─────────────────────────
  const saveProjectToServer = useCallback(async (proj: ProjectState) => {
    if (!proj.files || Object.keys(proj.files).length === 0) return;
    const taskId = `app-builder-${activeProjectId || Date.now()}`;
    for (const [filePath, content] of Object.entries(proj.files)) {
      try {
        await fetch("/api/files/save-generation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content,
            filename: filePath.replace(/\//g, "_"),
            mimeType: filePath.endsWith(".html") ? "text/html" :
                      filePath.endsWith(".css") ? "text/css" :
                      filePath.endsWith(".js") ? "application/javascript" :
                      filePath.endsWith(".json") ? "application/json" :
                      filePath.endsWith(".ts") ? "text/typescript" :
                      filePath.endsWith(".tsx") ? "text/typescript" :
                      "text/plain",
            source: "app-builder",
            taskId,
            prompt: proj.title || proj.description || undefined,
          }),
        });
      } catch { /* non-blocking */ }
    }
  }, [activeProjectId]);

  // ── Auto-save after generation completes ──────────────────────────────
  const prevIsGenerating = useRef(false);
  useEffect(() => {
    // When isGenerating transitions from true → false and we have a project, auto-save
    if (prevIsGenerating.current && !isGenerating && project) {
      saveCurrentProject(project, messages, versions);
      // Also save to server Files system
      saveProjectToServer(project);
    }
    prevIsGenerating.current = isGenerating;
  }, [isGenerating, project, messages, versions, saveCurrentProject, saveProjectToServer]);

  // ── Elapsed timer ────────────────────────────────────────────────────

  useEffect(() => {
    if (!generationStartTime) {
      setGenerationElapsed(0);
      return;
    }
    const iv = setInterval(() => {
      setGenerationElapsed(Math.floor((Date.now() - generationStartTime) / 1000));
    }, 1000);
    return () => clearInterval(iv);
  }, [generationStartTime]);

  // ── File Tree ───────────────────────────────────────────────────────────

  const fileTree = useMemo(() => {
    if (!project?.files) return [];
    return buildFileTree(project.files);
  }, [project?.files]);

  // ── Auto-select first file ──────────────────────────────────────────────

  useEffect(() => {
    if (project?.files && !selectedFile) {
      const entry = project.entryPoint || Object.keys(project.files)[0];
      if (entry) setSelectedFile(entry);
    }
  }, [project?.files, selectedFile]);

  // ── Auto-expand directories ─────────────────────────────────────────────

  useEffect(() => {
    if (project?.files) {
      const dirs = new Set<string>();
      for (const filePath of Object.keys(project.files)) {
        const parts = filePath.split("/");
        for (let i = 1; i < parts.length; i++) {
          dirs.add(parts.slice(0, i).join("/"));
        }
      }
      setExpandedDirs(dirs);
    }
  }, [project?.files]);

  // ── Scroll chat to bottom ──────────────────────────────────────────────

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages]);

  // ── Build Logs Helper ──────────────────────────────────────────────────

  const addLog = useCallback((type: BuildLog["type"], message: string) => {
    setBuildLogs((prev) => [
      ...prev,
      { id: generateId(), type, message, timestamp: Date.now() },
    ]);
  }, []);

  // ── Save Version Snapshot ──────────────────────────────────────────────

  const saveVersion = useCallback(
    (label: string) => {
      if (!project) return;
      setVersions((prev) => [
        ...prev,
        {
          id: generateId(),
          label,
          project: JSON.parse(JSON.stringify(project)),
          timestamp: Date.now(),
        },
      ]);
    },
    [project]
  );

  // ── Restore Version ───────────────────────────────────────────────────

  const restoreVersion = useCallback((version: VersionSnapshot) => {
    setProject(JSON.parse(JSON.stringify(version.project)));
    setRefreshKey((k) => k + 1);
    addLog("info", `Restored version: ${version.label}`);
  }, [addLog]);

  // ── Enhance Prompt with AI ────────────────────────────────────────────

  const enhancePrompt = useCallback(async (prompt: string) => {
    if (!prompt.trim()) return;
    setShowEnhancePreview(true);
    setEnhancedPrompt("Enhancing...");

    try {
      const res = await fetch("/api/app-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `Take this rough app idea / prompt and enhance it into a detailed, specific, and comprehensive prompt that would produce an amazing web application. Add details about design, features, interactions, and layout. Keep it concise but thorough. Original prompt: "${prompt}"\n\nRespond with ONLY the enhanced prompt text, no JSON.`,
          mode: "generate",
        }),
      });

      let text = "";
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));
          for (const line of lines) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "chunk") {
                text += data.content;
                setEnhancedPrompt(text);
              }
            } catch {
              /* skip */
            }
          }
        }
      }
    } catch {
      setEnhancedPrompt("Failed to enhance prompt. Using original.");
    }
  }, []);

  // ── Generate App ──────────────────────────────────────────────────────

  const generateApp = useCallback(
    async (prompt: string, mode: "generate" | "modify" | "fix" | "explain" = "generate", options?: { continueGeneration?: boolean }) => {
      if ((!prompt.trim() && !options?.continueGeneration) || isGenerating) return;

      setIsGenerating(true);
      setGenerationStartTime(Date.now());
      setGenerationStatus("Connecting to AI model...");
      setGenerationStep(0);
      setShowTerminal(true);
      setShowEnhancePreview(false);
      setEnhancedPrompt("");
      setIsResponseTruncated(false);

      // Save previous version before modification
      if (project && mode !== "generate") {
        saveVersion(`Before: ${prompt.slice(0, 30)}...`);
      }

      const userMessage: ChatMessage = {
        id: generateId(),
        role: "user",
        content: options?.continueGeneration ? "[Continue generating...]" : prompt,
        timestamp: Date.now(),
      };

      const assistantMessage: ChatMessage = {
        id: generateId(),
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);

      addLog("command", options?.continueGeneration ? "Continuing generation..." : mode === "modify" ? "Modifying app..." : mode === "fix" ? "Fixing bug..." : "Generating app...");
      if (!options?.continueGeneration) {
        addLog("info", `Prompt: ${prompt.slice(0, 100)}${prompt.length > 100 ? "..." : ""}`);
      }
      addLog("info", "Connecting to AI model...");

      // ── Streaming Parser + Action Runner ─────────────────────────────
      const completedFiles: Record<string, string> = {};
      let artifactTitle = "";
      let streamThrottleTimer: ReturnType<typeof setTimeout> | null = null;

      const runner = new ActionRunner({
        onFileWrite: (filePath, content) => {
          completedFiles[filePath] = content;
          setProject((prev) => {
            const base = prev || {
              title: artifactTitle || "My App",
              description: "",
              framework: "html",
              files: {},
              entryPoint: "index.html",
              dependencies: {},
              devDependencies: {},
              scripts: {},
              buildCommand: "",
              startCommand: "",
              installCommand: "",
            };
            const newFiles = { ...base.files, [filePath]: content };
            const ep =
              base.entryPoint && newFiles[base.entryPoint]
                ? base.entryPoint
                : Object.keys(newFiles).find((f) => f === "index.html") ||
                  Object.keys(newFiles).find((f) => f.endsWith(".html")) ||
                  Object.keys(newFiles)[0] ||
                  "index.html";
            return { ...base, title: artifactTitle || base.title, files: newFiles, entryPoint: ep };
          });
          setRefreshKey((k) => k + 1);
          if (Object.keys(completedFiles).length === 1) {
            setSelectedFile(filePath);
          }
        },
        onLog: (level, message) => {
          addLog(level, message);
        },
      });

      const parser = new StreamingMessageParser({
        callbacks: {
          onArtifactOpen: (data) => {
            artifactTitle = data.title;
            addLog("info", `⚡ Building: ${data.title}`);
          },
          onActionOpen: (data) => {
            runner.addAction(data);
            if (data.action.type === "file") {
              addLog("info", `📄 ${(data.action as { filePath: string }).filePath}`);
            }
          },
          onActionStream: (data) => {
            if (data.action.type === "file") {
              const fp = (data.action as { filePath: string }).filePath;
              if (!streamThrottleTimer) {
                streamThrottleTimer = setTimeout(() => {
                  streamThrottleTimer = null;
                  setProject((prev) => {
                    if (!prev) return prev;
                    return { ...prev, files: { ...prev.files, [fp]: data.action.content } };
                  });
                }, 300);
              }
            }
          },
          onActionClose: (data) => {
            if (streamThrottleTimer) {
              clearTimeout(streamThrottleTimer);
              streamThrottleTimer = null;
            }
            runner.runAction(data);
          },
          onArtifactClose: (data) => {
            addLog("success", `✓ ${data.title} complete`);
          },
        },
      });

      try {
        // Build conversation history for context
        const history = messages
          .filter((m) => !m.isStreaming)
          .map((m) => ({ role: m.role, content: m.content }));

        const res = await fetch("/api/app-builder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: options?.continueGeneration ? "" : prompt,
            currentFiles: mode !== "generate" || options?.continueGeneration ? project?.files : undefined,
            conversationHistory: history.length > 0 ? history : undefined,
            mode,
            continueGeneration: options?.continueGeneration || false,
          }),
        });

        if (!res.ok) {
          throw new Error(`API error: ${res.status}`);
        }

        addLog("success", "Connected to AI model");
        addLog("info", "Streaming response...");

        let fullText = "";
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));

            for (const line of lines) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.type === "progress") {
                  setGenerationStatus(data.message || "Working...");
                  if (data.step) setGenerationStep(data.step);
                  addLog("info", data.message || "Working...");
                } else if (data.type === "chunk") {
                  fullText += data.content;
                  setGenerationStatus("Streaming code...");

                  // Feed to streaming parser for real-time file extraction
                  parser.parse(assistantMessage.id, fullText);

                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMessage.id
                        ? { ...m, content: fullText }
                        : m
                    )
                  );
                } else if (data.type === "done") {
                  addLog("success", `Generated via ${data.provider}/${data.model}`);
                } else if (data.type === "error") {
                  throw new Error(data.error);
                }
              } catch (parseErr) {
                // Individual line parse error, skip
              }
            }
          }
        }

        // Clear pending stream throttle timer
        if (streamThrottleTimer) {
          clearTimeout(streamThrottleTimer);
          streamThrottleTimer = null;
        }

        // Finalize message
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessage.id
              ? { ...m, content: fullText, isStreaming: false }
              : m
          )
        );

        // Check for truncation (incomplete artifact)
        const isTruncated =
          fullText.includes("<boltArtifact") && !fullText.includes("</boltArtifact>");
        setIsResponseTruncated(isTruncated);
        if (isTruncated) {
          addLog("warn", 'Response was truncated \u2014 click "Continue generating" to resume');
        }

        // If streaming parser extracted files, finalize
        if (Object.keys(completedFiles).length > 0) {
          const streamFileCount = Object.keys(completedFiles).length;
          addLog("success", `\u2713 ${streamFileCount} file${streamFileCount === 1 ? "" : "s"} created`);
          addLog("info", "Building preview...");
          setTimeout(() => addLog("success", "Preview ready"), 300);

          if (mode === "generate" && !options?.continueGeneration) {
            setProject((currentProject) => {
              if (currentProject) {
                setVersions([{
                  id: generateId(),
                  label: "Initial generation",
                  project: JSON.parse(JSON.stringify(currentProject)),
                  timestamp: Date.now(),
                }]);
              }
              return currentProject;
            });
          }
        } else {
        // Fallback: streaming parser didn't extract files — use regex
        try {
          const artifactResult = parseArtifactResponse(fullText);
          const jsonResult = !artifactResult ? parseJSONResponse(fullText) : null;
          const parsed = artifactResult || jsonResult;

          if (parsed && Object.keys(parsed.files).length > 0) {
            // Determine entry point
            const fileKeys = Object.keys(parsed.files);
            const entryPoint =
              fileKeys.find((f) => f === "index.html") ||
              fileKeys.find((f) => /^App\.(jsx|tsx)$/i.test(f.split("/").pop() || "")) ||
              fileKeys.find((f) => f.endsWith(".html")) ||
              fileKeys[0];

            const newProject: ProjectState = {
              title: parsed.title || project?.title || "My App",
              description: project?.description || "",
              framework: "html",
              files: parsed.files,
              entryPoint: entryPoint || "index.html",
              dependencies: {},
              devDependencies: {},
              scripts: {},
              buildCommand: "",
              startCommand: "",
              installCommand: "",
            };

            setProject(newProject);
            setRefreshKey((k) => k + 1);

            // Auto-select the entry point file
            if (newProject.files[newProject.entryPoint]) {
              setSelectedFile(newProject.entryPoint);
            } else {
              const firstFile = Object.keys(newProject.files)[0];
              if (firstFile) setSelectedFile(firstFile);
            }

            const fileCount = Object.keys(parsed.files).length;
            addLog("success", `Created ${fileCount} file${fileCount === 1 ? "" : "s"}: ${Object.keys(parsed.files).join(", ")}`);
            addLog("info", "Building preview...");

            // Simulate build steps
            setTimeout(() => addLog("success", "Preview ready"), 500);

            // Save initial version on generate
            if (mode === "generate") {
              setVersions([
                {
                  id: generateId(),
                  label: "Initial generation",
                  project: JSON.parse(JSON.stringify(newProject)),
                  timestamp: Date.now(),
                },
              ]);
            }
          } else {
            // Check if it's a plain text explanation
            if (mode === "explain" || !fullText.includes("<boltArtifact")) {
              addLog("info", "Response received (no file changes)");
            } else {
              addLog("warn", "Could not parse project files from response. The AI may have returned an unexpected format.");
            }
          }
        } catch (parseErr) {
          addLog("warn", "Response received but could not parse project structure.");
        }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        addLog("error", `Error: ${errorMsg}`);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessage.id
              ? { ...m, content: `Error: ${errorMsg}`, isStreaming: false }
              : m
          )
        );
      } finally {
        setIsGenerating(false);
        setGenerationStartTime(null);
        setGenerationStatus("");
        setGenerationStep(0);
      }
    },
    [isGenerating, project, messages, addLog, saveVersion]
  );

  // ── Continue Generation (for truncated responses) ───────────────────────

  const handleContinueGeneration = useCallback(() => {
    generateApp("", project ? "modify" : "generate", { continueGeneration: true });
  }, [generateApp, project]);

  // ── Handle Submit ─────────────────────────────────────────────────────

  const handleSubmit = useCallback(() => {
    const prompt = inputValue.trim();
    if (!prompt) return;
    setInputValue("");
    const mode = project ? "modify" : "generate";
    generateApp(prompt, mode);
  }, [inputValue, project, generateApp]);

  // ── Edit File In-Place ────────────────────────────────────────────────

  const updateFileContent = useCallback(
    (path: string, content: string) => {
      if (!project) return;
      setProject({
        ...project,
        files: { ...project.files, [path]: content },
      });
    },
    [project]
  );

  // ── Copy File Content ─────────────────────────────────────────────────

  const copyFileContent = useCallback(() => {
    if (!project?.files[selectedFile]) return;
    navigator.clipboard.writeText(project.files[selectedFile]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [project, selectedFile]);

  // ── Download Project ──────────────────────────────────────────────────

  const downloadProject = useCallback(() => {
    if (!project?.files) return;

    // For single HTML file, just download it directly
    const keys = Object.keys(project.files);
    if (keys.length === 1 && keys[0].endsWith(".html")) {
      const blob = new Blob([project.files[keys[0]]], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = keys[0];
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    // For multi-file, create a simple download of each file
    // In a real app this would create a ZIP
    for (const [path, content] of Object.entries(project.files)) {
      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = path.split("/").pop() || path;
      a.click();
      URL.revokeObjectURL(url);
    }

    addLog("success", "Project files downloaded");
  }, [project, addLog]);

  // ── Toggle Dir Expansion ──────────────────────────────────────────────

  const toggleDir = useCallback((path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  // ── Keyboard Shortcuts ────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey && document.activeElement === inputRef.current) {
        e.preventDefault();
        handleSubmit();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [handleSubmit]);

  // ── New Project ───────────────────────────────────────────────────────

  const resetProject = useCallback(() => {
    // Auto-save current project before clearing
    if (project && messages.length > 0) {
      saveCurrentProject(project, messages, versions);
    }
    setProject(null);
    setMessages([]);
    setSelectedFile("");
    setBuildLogs([]);
    setVersions([]);
    setInputValue("");
    setShowEnhancePreview(false);
    setEnhancedPrompt("");
    setActiveProjectIdState(null);
    setActiveProjectId(null);
  }, [project, messages, versions, saveCurrentProject]);

  // ── Load Project from History ─────────────────────────────────────────

  const loadProjectFromHistory = useCallback((saved: SavedProject) => {
    // Save current project first
    if (project && messages.length > 0) {
      saveCurrentProject(project, messages, versions);
    }
    // Load the saved project
    setProject(saved.project);
    setMessages(saved.messages);
    setVersions(saved.versions);
    setBuildLogs([]);
    setInputValue("");
    setShowEnhancePreview(false);
    setEnhancedPrompt("");
    setActiveProjectIdState(saved.id);
    setActiveProjectId(saved.id);
    setRefreshKey((k) => k + 1);
    // Auto-select entry point
    if (saved.project.files) {
      const keys = Object.keys(saved.project.files);
      const entry = keys.find((f) => f === saved.project.entryPoint) || keys[0];
      if (entry) setSelectedFile(entry);
    }
  }, [project, messages, versions, saveCurrentProject]);

  // ── Delete Project from History ───────────────────────────────────────

  const deleteProjectFromHistory = useCallback((id: string) => {
    setProjectHistory((prev) => {
      const updated = prev.filter((p) => p.id !== id);
      saveProjectHistory(updated);
      return updated;
    });
    // If we deleted the active project, clear state
    if (activeProjectId === id) {
      resetProject();
    }
  }, [activeProjectId, resetProject]);

  // ── Rename Project in History ─────────────────────────────────────────

  const renameProject = useCallback((id: string, newTitle: string) => {
    setProjectHistory((prev) => {
      const updated = prev.map((p) => p.id === id ? { ...p, title: newTitle, updatedAt: Date.now() } : p);
      saveProjectHistory(updated);
      return updated;
    });
    // Update current project title if active
    if (activeProjectId === id && project) {
      setProject({ ...project, title: newTitle });
    }
  }, [activeProjectId, project]);

  // ── Current file content ──────────────────────────────────────────────

  const currentFileContent = project?.files[selectedFile] || "";
  const currentFileLanguage = selectedFile ? getFileLanguage(selectedFile) : "plaintext";

  // ── Filtered history ──────────────────────────────────────────────────

  const filteredHistory = historySearch
    ? projectHistory.filter(
        (p) =>
          p.title.toLowerCase().includes(historySearch.toLowerCase()) ||
          p.prompt.toLowerCase().includes(historySearch.toLowerCase())
      )
    : projectHistory;

  // ── History Sidebar (shared between welcome screen and builder) ────────

  const historySidebar = showHistory && (
    <div className="w-[240px] flex-shrink-0 flex flex-col border-r border-pplx-border bg-pplx-sidebar/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-pplx-border">
        <span className="text-xs font-semibold text-pplx-text">Projects</span>
        <div className="flex items-center gap-1">
          <button
            onClick={resetProject}
            className="p-1 rounded-md text-pplx-muted hover:text-pplx-accent hover:bg-pplx-accent/10 transition-colors"
            title="New project"
          >
            <Plus size={14} />
          </button>
          <button
            onClick={() => setShowHistory(false)}
            className="p-1 rounded-md text-pplx-muted hover:text-pplx-text hover:bg-white/5 transition-colors"
            title="Hide sidebar"
          >
            <PanelLeftClose size={14} />
          </button>
        </div>
      </div>

      {/* Search */}
      {projectHistory.length > 3 && (
        <div className="px-2 py-2 border-b border-pplx-border/50">
          <input
            type="text"
            placeholder="Search projects..."
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-md bg-pplx-bg border border-pplx-border text-xs text-pplx-text placeholder:text-pplx-muted/40 outline-none focus:border-pplx-accent/40 transition-colors"
          />
        </div>
      )}

      {/* Project list */}
      <div className="flex-1 overflow-auto py-1">
        {filteredHistory.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <Code2 size={24} className="mx-auto mb-2 text-pplx-muted/20" />
            <p className="text-[11px] text-pplx-muted/40">
              {historySearch ? "No matching projects" : "No projects yet"}
            </p>
            <p className="text-[10px] text-pplx-muted/30 mt-1">
              Build something to see it here
            </p>
          </div>
        ) : (
          filteredHistory.map((saved) => {
            const isActive = activeProjectId === saved.id;
            const timeAgo = formatTimeAgo(saved.updatedAt);
            const fileCount = Object.keys(saved.project.files).length;
            return (
              <div
                key={saved.id}
                className={cn(
                  "group px-2 py-0.5"
                )}
              >
                <div
                  className={cn(
                    "flex flex-col gap-0.5 px-2.5 py-2 rounded-lg cursor-pointer transition-all",
                    isActive
                      ? "bg-pplx-accent/10 border border-pplx-accent/20"
                      : "hover:bg-white/5 border border-transparent"
                  )}
                  onClick={() => loadProjectFromHistory(saved)}
                >
                  {/* Title row */}
                  <div className="flex items-center gap-1.5">
                    <div className={cn(
                      "w-1.5 h-1.5 rounded-full flex-shrink-0",
                      isActive ? "bg-pplx-accent" : "bg-pplx-muted/30"
                    )} />
                    {editingTitleId === saved.id ? (
                      <input
                        autoFocus
                        value={editingTitleDraft}
                        onChange={(e) => setEditingTitleDraft(e.target.value)}
                        onBlur={() => {
                          if (editingTitleDraft.trim()) renameProject(saved.id, editingTitleDraft.trim());
                          setEditingTitleId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            if (editingTitleDraft.trim()) renameProject(saved.id, editingTitleDraft.trim());
                            setEditingTitleId(null);
                          }
                          if (e.key === "Escape") setEditingTitleId(null);
                        }}
                        className="flex-1 min-w-0 bg-transparent text-xs text-pplx-text outline-none border-b border-pplx-accent/50"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className={cn(
                        "text-xs font-medium truncate flex-1",
                        isActive ? "text-pplx-text" : "text-pplx-muted"
                      )}>
                        {saved.title}
                      </span>
                    )}
                  </div>
                  {/* Meta row */}
                  <div className="flex items-center gap-2 pl-3">
                    <span className="text-[10px] text-pplx-muted/50">
                      {timeAgo}
                    </span>
                    <span className="text-[10px] text-pplx-muted/30">
                      {fileCount} file{fileCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {/* Hover actions */}
                  <div className="flex items-center gap-0.5 pl-2 opacity-0 group-hover:opacity-100 transition-opacity -mt-0.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingTitleId(saved.id);
                        setEditingTitleDraft(saved.title);
                      }}
                      className="p-0.5 rounded text-pplx-muted/50 hover:text-pplx-text hover:bg-white/10 transition-colors"
                      title="Rename"
                    >
                      <Pencil size={10} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteProjectFromHistory(saved.id);
                      }}
                      className="p-0.5 rounded text-pplx-muted/50 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  // =====================================================================
  // RENDER — Welcome Screen (no project yet, no messages)
  // =====================================================================

  if (!project && messages.length === 0) {
    return (
      <div className="h-screen flex bg-pplx-bg overflow-hidden">
        {/* History Sidebar */}
        {historySidebar}

        <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-pplx-border bg-pplx-card/30">
          <div className="flex items-center gap-2.5">
            {!showHistory && (
              <button
                onClick={() => setShowHistory(true)}
                className="p-1.5 rounded-md text-pplx-muted hover:text-pplx-text hover:bg-white/5 transition-colors mr-1"
                title="Show project history"
              >
                <PanelLeftOpen size={14} />
              </button>
            )}
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 via-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Code2 size={14} className="text-white" />
            </div>
            <span className="text-sm font-bold tracking-tight bg-gradient-to-r from-violet-300 via-blue-300 to-cyan-300 bg-clip-text text-transparent">
              App Builder
            </span>
          </div>
        </div>

        {/* Center content */}
        <div className="flex-1 flex flex-col items-center justify-center px-8 py-16 overflow-auto">
          {/* Big hero */}
          <div className="flex flex-col items-center gap-6 mb-12">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500/20 via-blue-500/20 to-cyan-500/20 border border-violet-500/20 flex items-center justify-center">
              <Sparkles size={36} className="text-violet-400" />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-bold text-pplx-text mb-2">
                What do you want to build?
              </h1>
              <p className="text-sm text-pplx-muted max-w-md">
                Describe your app and I&apos;ll generate the complete code with a live preview.
                Edit the code, iterate with chat, and download when ready.
              </p>
            </div>
          </div>

          {/* Input area */}
          <div className="w-full max-w-2xl mb-10">
            <div className="relative">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Build a beautiful dashboard with charts and stats..."
                className="w-full px-5 py-4 pr-24 rounded-xl bg-pplx-card border border-pplx-border text-sm text-pplx-text placeholder:text-pplx-muted/50 resize-none outline-none focus:border-pplx-accent/50 focus:ring-1 focus:ring-pplx-accent/20 transition-all"
                rows={3}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
              />
              <div className="absolute bottom-3 right-3 flex items-center gap-1.5">
                <button
                  onClick={() => enhancePrompt(inputValue)}
                  disabled={!inputValue.trim() || isGenerating}
                  className={cn(
                    "p-2 rounded-lg transition-all",
                    inputValue.trim()
                      ? "text-pplx-accent hover:bg-pplx-accent/10"
                      : "text-pplx-muted/30 cursor-not-allowed"
                  )}
                  title="Enhance prompt with AI"
                >
                  <Wand2 size={16} />
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!inputValue.trim() || isGenerating}
                  className={cn(
                    "p-2 rounded-lg transition-all",
                    inputValue.trim()
                      ? "bg-pplx-accent text-white hover:bg-pplx-accent/90"
                      : "bg-pplx-muted/20 text-pplx-muted/30 cursor-not-allowed"
                  )}
                >
                  {isGenerating ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <ArrowUp size={16} />
                  )}
                </button>
              </div>
            </div>

            {/* Generation progress indicator */}
            {isGenerating && (
              <div className="mt-4 p-4 rounded-xl bg-pplx-card/80 border border-pplx-accent/20 animate-in fade-in">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="relative w-5 h-5">
                      <Loader2 size={20} className="animate-spin text-pplx-accent" />
                    </div>
                    <span className="text-xs font-medium text-pplx-accent">Building your app</span>
                  </div>
                  <span className="text-[11px] text-pplx-muted font-mono tabular-nums">
                    {Math.floor(generationElapsed / 60)}:{String(generationElapsed % 60).padStart(2, "0")}
                  </span>
                </div>
                <div className="w-full h-1 rounded-full bg-pplx-border/50 overflow-hidden mb-2">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 via-blue-500 to-cyan-500 transition-all duration-1000"
                    style={{ width: `${Math.min(generationStep * 8 + 5, 95)}%` }}
                  />
                </div>
                <p className="text-[11px] text-pplx-muted flex items-center gap-1.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-pplx-accent animate-pulse" />
                  {generationStatus || "Working..."}
                </p>
              </div>
            )}

            {/* Enhanced prompt preview */}
            {showEnhancePreview && enhancedPrompt && (
              <div className="mt-3 p-4 rounded-xl bg-pplx-card/80 border border-violet-500/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] text-violet-400 font-medium uppercase tracking-wider">
                    ✨ Enhanced Prompt
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setInputValue(enhancedPrompt);
                        setShowEnhancePreview(false);
                      }}
                      className="px-2 py-0.5 rounded text-[11px] bg-pplx-accent/20 text-pplx-accent hover:bg-pplx-accent/30 transition-colors"
                    >
                      Use this
                    </button>
                    <button
                      onClick={() => setShowEnhancePreview(false)}
                      className="p-0.5 rounded text-pplx-muted hover:text-pplx-text"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-pplx-text/80 leading-relaxed">
                  {enhancedPrompt}
                </p>
              </div>
            )}
          </div>

          {/* Starter templates */}
          <div className="w-full max-w-3xl">
            <p className="text-[11px] text-pplx-muted/60 uppercase tracking-wider font-medium mb-3 text-center">
              Start from a template
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {STARTER_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setInputValue(t.prompt);
                    inputRef.current?.focus();
                  }}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-pplx-card/50 border border-pplx-border hover:border-pplx-accent/30 hover:bg-pplx-card text-left transition-all group"
                >
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/10 to-blue-500/10 flex items-center justify-center flex-shrink-0 group-hover:from-violet-500/20 group-hover:to-blue-500/20 transition-all">
                    <t.icon size={15} className="text-pplx-muted group-hover:text-pplx-accent transition-colors" />
                  </div>
                  <span className="text-xs text-pplx-muted group-hover:text-pplx-text transition-colors font-medium">
                    {t.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
        </div>
      </div>
    );
  }

  // =====================================================================
  // RENDER — Main Builder UI (with project)
  // =====================================================================

  return (
    <div className="h-screen flex bg-pplx-bg overflow-hidden">
      {/* History Sidebar */}
      {historySidebar}

      <div className="flex-1 flex flex-col overflow-hidden">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-pplx-border bg-pplx-card/30 flex-shrink-0">
        <div className="flex items-center gap-2">
          {/* History toggle */}
          {!showHistory && (
            <button
              onClick={() => setShowHistory(true)}
              className="p-1.5 rounded-md text-pplx-muted hover:text-pplx-text hover:bg-white/5 transition-colors"
              title="Show project history"
            >
              <PanelLeftOpen size={14} />
            </button>
          )}
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 via-blue-500 to-cyan-500 flex items-center justify-center">
              <Code2 size={12} className="text-white" />
            </div>
            <span className="text-xs font-bold bg-gradient-to-r from-violet-300 via-blue-300 to-cyan-300 bg-clip-text text-transparent">
              App Builder
            </span>
          </div>

          <div className="w-px h-4 bg-pplx-border mx-1" />

          {/* Project title */}
          {project && (
            <span className="text-xs text-pplx-muted truncate max-w-[200px]">
              {project.title}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* View mode toggle — Code / UI */}
          <div className="flex items-center rounded-lg bg-pplx-bg border border-pplx-border p-0.5">
            <button
              onClick={() => setViewMode("code")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all",
                viewMode === "code"
                  ? "bg-pplx-accent text-white shadow-sm"
                  : "text-pplx-muted hover:text-pplx-text"
              )}
            >
              <Code2 size={12} />
              Code
            </button>
            <button
              onClick={() => setViewMode("preview")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all",
                viewMode === "preview"
                  ? "bg-pplx-accent text-white shadow-sm"
                  : "text-pplx-muted hover:text-pplx-text"
              )}
            >
              <Eye size={12} />
              UI
            </button>
          </div>

          <div className="w-px h-4 bg-pplx-border mx-1" />

          {/* Chat toggle */}
          <button
            onClick={() => setShowChat(!showChat)}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              showChat
                ? "bg-pplx-accent/15 text-pplx-accent"
                : "text-pplx-muted hover:text-pplx-text hover:bg-white/5"
            )}
            title={showChat ? "Hide chat" : "Show chat"}
          >
            {showChat ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
          </button>

          {/* Version history */}
          <button
            onClick={() => setShowVersions(!showVersions)}
            className={cn(
              "p-1.5 rounded-md transition-colors relative",
              showVersions
                ? "bg-pplx-accent/15 text-pplx-accent"
                : "text-pplx-muted hover:text-pplx-text hover:bg-white/5"
            )}
            title="Version history"
          >
            <History size={14} />
            {versions.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-pplx-accent text-[8px] text-white flex items-center justify-center">
                {versions.length}
              </span>
            )}
          </button>

          {/* Download */}
          <button
            onClick={downloadProject}
            disabled={!project}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              project
                ? "text-pplx-muted hover:text-pplx-text hover:bg-white/5"
                : "text-pplx-muted/30 cursor-not-allowed"
            )}
            title="Download project"
          >
            <Download size={14} />
          </button>

          {/* New project */}
          <button
            onClick={resetProject}
            className="p-1.5 rounded-md text-pplx-muted hover:text-pplx-text hover:bg-white/5 transition-colors"
            title="New project"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat Panel */}
        {showChat && (
          <div className="w-[340px] flex-shrink-0 flex flex-col border-r border-pplx-border bg-pplx-card/20">
            {/* Chat messages */}
            <div ref={chatScrollRef} className="flex-1 overflow-auto px-3 py-3 space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "rounded-xl px-3 py-2.5 text-xs leading-relaxed",
                    msg.role === "user"
                      ? "bg-pplx-accent/10 border border-pplx-accent/20 text-pplx-text ml-6"
                      : "bg-pplx-card border border-pplx-border text-pplx-muted mr-2"
                  )}
                >
                  {msg.role === "assistant" ? (
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Sparkles size={10} className="text-violet-400" />
                        <span className="text-[10px] font-medium text-violet-400">
                          AI Builder
                        </span>
                        {msg.isStreaming && (
                          <Loader2 size={10} className="animate-spin text-pplx-accent ml-auto" />
                        )}
                      </div>
                      <div className="text-pplx-text/80 whitespace-pre-wrap break-words max-h-[300px] overflow-auto">
                        {msg.isStreaming && !msg.content ? (
                          <div className="space-y-2 py-1">
                            <div className="flex items-center gap-2">
                              <Loader2 size={12} className="animate-spin text-pplx-accent" />
                              <span className="text-pplx-accent text-[11px] font-medium">
                                {generationStatus || "Generating..."}
                              </span>
                            </div>
                            {generationStartTime && (
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-pplx-muted/60 font-mono tabular-nums">
                                  Elapsed: {Math.floor(generationElapsed / 60)}:{String(generationElapsed % 60).padStart(2, "0")}
                                </span>
                              </div>
                            )}
                            <div className="w-full h-0.5 rounded-full bg-pplx-border/30 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-500 transition-all duration-1000"
                                style={{ width: `${Math.min(generationStep * 8 + 5, 95)}%` }}
                              />
                            </div>
                          </div>
                        ) : msg.content.length > 500
                          ? msg.content.slice(0, 200) + "\n\n... [code generated] ...\n\n" + msg.content.slice(-200)
                          : msg.content || (
                              <span className="text-pplx-muted/40 italic">Generating...</span>
                            )}
                      </div>
                    </div>
                  ) : (
                    <p>{msg.content}</p>
                  )}
                </div>
              ))}
            </div>

            {/* Quick actions */}
            {project && !isGenerating && (
              <div className="px-3 py-2 border-t border-pplx-border/50 flex gap-1 flex-wrap">
                {[
                  { label: "Fix bug", icon: Bug, action: () => setInputValue("/fix ") },
                  { label: "Add feature", icon: Zap, action: () => setInputValue("Add ") },
                  { label: "Improve design", icon: Palette, action: () => setInputValue("Improve the design: ") },
                  { label: "Make responsive", icon: Smartphone, action: () => setInputValue("Make this fully responsive for mobile, tablet, and desktop") },
                ].map((a) => (
                  <button
                    key={a.label}
                    onClick={a.action}
                    className="flex items-center gap-1 px-2 py-1 rounded-md bg-pplx-card/80 border border-pplx-border text-[10px] text-pplx-muted hover:text-pplx-text hover:border-pplx-muted/50 transition-colors"
                  >
                    <a.icon size={10} />
                    {a.label}
                  </button>
                ))}
              </div>
            )}

            {/* Continue generating button */}
            {isResponseTruncated && !isGenerating && (
              <div className="px-3 py-2 border-t border-pplx-border/50">
                <button
                  onClick={handleContinueGeneration}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium hover:bg-amber-500/20 transition-colors"
                >
                  <Play size={12} />
                  Continue generating (response was truncated)
                </button>
              </div>
            )}

            {/* Chat input */}
            <div className="p-3 border-t border-pplx-border">
              <div className="relative">
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={
                    project
                      ? "Describe changes to make..."
                      : "Describe what to build..."
                  }
                  className="w-full px-3 py-2.5 pr-20 rounded-lg bg-pplx-bg border border-pplx-border text-xs text-pplx-text placeholder:text-pplx-muted/40 resize-none outline-none focus:border-pplx-accent/50 transition-colors"
                  rows={2}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                />
                <div className="absolute bottom-2 right-2 flex items-center gap-1">
                  <button
                    onClick={() => enhancePrompt(inputValue)}
                    disabled={!inputValue.trim() || isGenerating}
                    className={cn(
                      "p-1.5 rounded transition-all",
                      inputValue.trim()
                        ? "text-violet-400 hover:bg-violet-400/10"
                        : "text-pplx-muted/20 cursor-not-allowed"
                    )}
                    title="Enhance prompt"
                  >
                    <Wand2 size={12} />
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={!inputValue.trim() || isGenerating}
                    className={cn(
                      "p-1.5 rounded transition-all",
                      inputValue.trim()
                        ? "bg-pplx-accent text-white hover:bg-pplx-accent/90"
                        : "bg-pplx-muted/10 text-pplx-muted/20 cursor-not-allowed"
                    )}
                  >
                    {isGenerating ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Send size={12} />
                    )}
                  </button>
                </div>
              </div>

              {/* Enhanced prompt preview */}
              {showEnhancePreview && enhancedPrompt && (
                <div className="mt-2 p-2 rounded-lg bg-violet-500/5 border border-violet-500/20">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] text-violet-400 font-medium uppercase tracking-wider">
                      ✨ Enhanced
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setInputValue(enhancedPrompt);
                          setShowEnhancePreview(false);
                        }}
                        className="px-1.5 py-0.5 rounded text-[9px] bg-violet-500/20 text-violet-300 hover:bg-violet-500/30"
                      >
                        Use
                      </button>
                      <button
                        onClick={() => setShowEnhancePreview(false)}
                        className="p-0.5 text-pplx-muted hover:text-pplx-text"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  </div>
                  <p className="text-[10px] text-pplx-text/70 leading-relaxed line-clamp-4">
                    {enhancedPrompt}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Editor + Preview Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 flex overflow-hidden">
            {/* Code Editor Section */}
            {viewMode === "code" && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex overflow-hidden flex-1">
                  {/* File Tree */}
                  {project && (
                    <div className="w-[180px] flex-shrink-0 border-r border-pplx-border overflow-auto bg-pplx-card/20">
                      <div className="flex items-center justify-between px-3 py-2 border-b border-pplx-border/50">
                        <span className="text-[10px] text-pplx-muted font-medium uppercase tracking-wider">
                          Files
                        </span>
                        <span className="text-[10px] text-pplx-muted/50">
                          {Object.keys(project.files).length}
                        </span>
                      </div>
                      <div className="py-1">
                        {fileTree.map((node) => (
                          <FileTreeItem
                            key={node.path}
                            node={node}
                            depth={0}
                            selectedFile={selectedFile}
                            onSelect={setSelectedFile}
                            expandedDirs={expandedDirs}
                            onToggleDir={toggleDir}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Code Editor */}
                  <div className="flex-1 flex flex-col overflow-hidden">
                    {/* File tab bar */}
                    {selectedFile && (
                      <div className="flex items-center justify-between px-2 py-1 border-b border-pplx-border bg-pplx-card/30">
                        <div className="flex items-center gap-2">
                          {(() => {
                            const info = getFileIcon(selectedFile);
                            const FileIcon = info.icon;
                            return (
                              <FileIcon size={12} style={{ color: info.color }} />
                            );
                          })()}
                          <span className="text-xs text-pplx-text">
                            {selectedFile}
                          </span>
                          <span className="text-[10px] text-pplx-muted/50">
                            {currentFileLanguage}
                          </span>
                        </div>
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={copyFileContent}
                            className="p-1 rounded text-pplx-muted hover:text-pplx-text hover:bg-white/5 transition-colors"
                            title="Copy file content"
                          >
                            {copied ? (
                              <Check size={12} className="text-green-400" />
                            ) : (
                              <Copy size={12} />
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                    {selectedFile ? (
                      <div className="flex-1 overflow-hidden">
                        <CodeEditor
                          content={currentFileContent}
                          language={currentFileLanguage}
                          onChange={(v) => updateFileContent(selectedFile, v)}
                        />
                      </div>
                    ) : (
                      <div className="flex-1 flex items-center justify-center text-pplx-muted/40">
                        <div className="text-center">
                          <Code2 size={32} className="mx-auto mb-2 opacity-30" />
                          <p className="text-xs">Select a file to edit</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Terminal */}
                <TerminalPanel
                  logs={buildLogs}
                  isOpen={showTerminal}
                  onToggle={() => setShowTerminal(!showTerminal)}
                />
              </div>
            )}

            {/* Preview Section */}
            {viewMode === "preview" && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <PreviewPanel
                  project={project}
                  device={device}
                  onDeviceChange={setDevice}
                  onRefresh={() => setRefreshKey((k) => k + 1)}
                  refreshKey={refreshKey}
                  onConsoleEvent={(level, message) => {
                    const type = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info';
                    addLog(type as 'error' | 'warn' | 'info', `[preview] ${message}`);
                  }}
                />
              </div>
            )}
          </div>

          {/* Version History Panel */}
          {showVersions && (
            <div className="h-[200px] border-t border-pplx-border bg-pplx-card/30 overflow-auto">
              <div className="flex items-center justify-between px-3 py-2 border-b border-pplx-border/50">
                <div className="flex items-center gap-2">
                  <History size={12} className="text-pplx-muted" />
                  <span className="text-xs font-medium text-pplx-muted">
                    Version History
                  </span>
                </div>
                <button
                  onClick={() => setShowVersions(false)}
                  className="p-1 text-pplx-muted hover:text-pplx-text"
                >
                  <X size={12} />
                </button>
              </div>
              <div className="p-2 space-y-1">
                {versions.length === 0 ? (
                  <p className="text-xs text-pplx-muted/40 text-center py-4">
                    No version history yet
                  </p>
                ) : (
                  versions
                    .slice()
                    .reverse()
                    .map((v) => (
                      <div
                        key={v.id}
                        className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/5 transition-colors group"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-pplx-accent/50" />
                          <span className="text-xs text-pplx-text">
                            {v.label}
                          </span>
                          <span className="text-[10px] text-pplx-muted/50">
                            {new Date(v.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <button
                          onClick={() => restoreVersion(v)}
                          className="opacity-0 group-hover:opacity-100 px-2 py-0.5 rounded text-[10px] bg-pplx-accent/20 text-pplx-accent hover:bg-pplx-accent/30 transition-all"
                        >
                          Restore
                        </button>
                      </div>
                    ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

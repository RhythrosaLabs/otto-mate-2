"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Monitor,
  MousePointer2,
  Square,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Camera,
  Keyboard,
  Mouse,
  ScrollText,
  Zap,
  X,
  ChevronRight,
  Settings2,
  Plus,
  Trash2,
  Info,
  Loader2,
  Eye,
  MessageSquare,
  Brain,
  AlertCircle,
  Shield,
  Terminal,
  FileEdit,
} from "lucide-react";
import Image from "next/image";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SSEEvent {
  type:
    | "session"
    | "screenshot"
    | "action"
    | "text"
    | "thinking"
    | "permission_request"
    | "status"
    | "done"
    | "error";
  sessionId?: string;
  data?: string; // base64 screenshot
  width?: number;
  height?: number;
  action?: string;
  input?: Record<string, unknown>;
  description?: string;
  content?: string;
  app?: string;
  status?: string;
  message?: string;
  reason?: string;
}

interface LogEntry {
  id: string;
  ts: number;
  kind: "screenshot" | "action" | "text" | "thinking" | "error" | "status" | "done";
  data?: string; // base64 for screenshots
  width?: number;
  height?: number;
  action?: string;
  input?: Record<string, unknown>;
  description?: string;
  content?: string;
  status?: string;
  message?: string;
  reason?: string;
}

type SessionState = "idle" | "running" | "waiting_permission" | "done" | "error" | "stopped";

function actionIcon(action?: string) {
  if (!action) return <Zap className="w-3 h-3" />;
  if (action === "screenshot") return <Camera className="w-3 h-3" />;
  if (action === "type") return <Keyboard className="w-3 h-3" />;
  if (action === "key" || action === "hold_key") return <Keyboard className="w-3 h-3" />;
  if (action === "scroll") return <ScrollText className="w-3 h-3" />;
  if (action === "zoom") return <Eye className="w-3 h-3" />;
  if (action === "bash") return <Terminal className="w-3 h-3 text-green-400" />;
  if (action === "text_editor") return <FileEdit className="w-3 h-3 text-blue-400" />;
  return <Mouse className="w-3 h-3" />;
}

function statusColor(state: SessionState) {
  switch (state) {
    case "running": return "text-pplx-accent";
    case "waiting_permission": return "text-yellow-400";
    case "done": return "text-green-400";
    case "error": return "text-red-400";
    case "stopped": return "text-pplx-muted";
    default: return "text-pplx-muted";
  }
}

function statusDot(state: SessionState) {
  switch (state) {
    case "running": return "bg-pplx-accent animate-pulse";
    case "waiting_permission": return "bg-yellow-400 animate-pulse";
    case "done": return "bg-green-400";
    case "error": return "bg-red-400";
    default: return "bg-pplx-muted/40";
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ComputerControlClient() {
  const [task, setTask] = useState("");
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionState, setSessionState] = useState<SessionState>("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [currentScreenshot, setCurrentScreenshot] = useState<{
    data: string;
    width: number;
    height: number;
  } | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [pendingPermission, setPendingPermission] = useState<{ app: string; sessionId: string } | null>(null);
  const [blockedApps, setBlockedApps] = useState<string[]>([]);
  const [newBlockedApp, setNewBlockedApp] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [lastAction, setLastAction] = useState<{ x?: number; y?: number; action?: string } | null>(null);
  const [selectedLogEntry, setSelectedLogEntry] = useState<LogEntry | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const taskRef = useRef<HTMLTextAreaElement | null>(null);

  const isRunning = sessionState === "running" || sessionState === "waiting_permission";

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log]);

  function addLog(entry: Omit<LogEntry, "id" | "ts">) {
    setLog((prev) => [
      ...prev,
      { ...entry, id: Math.random().toString(36).slice(2), ts: Date.now() },
    ]);
  }

  const stopSession = useCallback(async () => {
    if (!sessionId) return;
    try {
      await fetch("/api/computer-control/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
    } catch {
      /* ignore */
    }
    esRef.current?.close();
    esRef.current = null;
    setSessionState("stopped");
    setStatusMsg("Stopped by user");
  }, [sessionId]);

  const respondPermission = useCallback(
    async (approved: boolean) => {
      if (!pendingPermission) return;
      try {
        await fetch("/api/computer-control/perm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: pendingPermission.sessionId, approved }),
        });
      } catch {
        /* ignore */
      }
      setPendingPermission(null);
      if (approved) {
        setSessionState("running");
      } else {
        setSessionState("running"); // Claude will handle the denial gracefully
      }
    },
    [pendingPermission]
  );

  const startSession = useCallback(async () => {
    if (!task.trim() || isRunning) return;

    setLog([]);
    setCurrentScreenshot(null);
    setSessionId(null);
    setSessionState("running");
    setStatusMsg("Connecting…");
    setLastAction(null);

    try {
      const resp = await fetch("/api/computer-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: task.trim(), blockedApps, model }),
      });

      if (!resp.ok || !resp.body) {
        const errText = await resp.text();
        setSessionState("error");
        setStatusMsg(errText || `HTTP ${resp.status}`);
        addLog({ kind: "error", content: errText || `HTTP ${resp.status}` });
        return;
      }

      // Read the SSE stream manually from fetch (EventSource can't POST)
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const processLine = (line: string) => {
        if (!line.startsWith("data: ")) return;
        const raw = line.slice(6);
        if (raw === "[DONE]") {
          setSessionState((s) => (s === "running" || s === "waiting_permission" ? "done" : s));
          return;
        }
        try {
          const evt = JSON.parse(raw) as SSEEvent;
          handleSSEEvent(evt);
        } catch {
          /* ignore malformed event */
        }
      };

      const handleSSEEvent = (evt: SSEEvent) => {
        switch (evt.type) {
          case "session":
            setSessionId(evt.sessionId ?? null);
            break;
          case "screenshot":
            if (evt.data) {
              setCurrentScreenshot({ data: evt.data, width: evt.width ?? 1280, height: evt.height ?? 800 });
              addLog({ kind: "screenshot", data: evt.data, width: evt.width, height: evt.height });
            }
            break;
          case "action": {
            const coord = evt.input?.coordinate as [number, number] | undefined;
            setLastAction({
              x: coord?.[0],
              y: coord?.[1],
              action: evt.action,
            });
            addLog({
              kind: "action",
              action: evt.action,
              input: evt.input,
              description: evt.description,
            });
            break;
          }
          case "text":
            addLog({ kind: "text", content: evt.content });
            break;
          case "thinking":
            addLog({ kind: "thinking", content: evt.content });
            break;
          case "permission_request":
            if (evt.app && evt.sessionId) {
              setPendingPermission({ app: evt.app, sessionId: evt.sessionId });
              setSessionState("waiting_permission");
            }
            break;
          case "status":
            setStatusMsg(evt.message ?? evt.status ?? "");
            addLog({ kind: "status", status: evt.status, message: evt.message });
            break;
          case "done":
            setSessionState("done");
            setStatusMsg(
              evt.reason === "task_complete"
                ? "Task complete"
                : evt.reason === "stopped_by_user"
                ? "Stopped"
                : evt.reason === "max_iterations"
                ? "Reached max steps"
                : "Done"
            );
            addLog({ kind: "done", reason: evt.reason });
            break;
          case "error":
            setSessionState("error");
            setStatusMsg(evt.content ?? evt.message ?? "Unknown error");
            addLog({ kind: "error", content: evt.content ?? evt.message });
            break;
        }
      };

      // Stream reading loop
      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              processLine(line.trim());
            }
          }
        } catch {
          /* connection ended */
        } finally {
          setSessionState((s) =>
            s === "running" || s === "waiting_permission" ? "done" : s
          );
        }
      })();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSessionState("error");
      setStatusMsg(msg);
      addLog({ kind: "error", content: msg });
    }
  }, [task, blockedApps, model, isRunning]);

  // Keyboard shortcut: Cmd+Enter to run
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !isRunning) {
        startSession();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [startSession, isRunning]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-pplx-bg text-pplx-text overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-pplx-border shrink-0">
        <div className="flex items-center gap-2.5">
          <MousePointer2 className="w-4 h-4 text-pplx-accent" />
          <span className="font-semibold text-sm">Computer Control</span>
          {/* Status dot */}
          <span className="flex items-center gap-1.5">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${statusDot(sessionState)}`} />
            {sessionState !== "idle" && (
              <span className={`text-xs ${statusColor(sessionState)}`}>
                {sessionState === "running"
                  ? "Running"
                  : sessionState === "waiting_permission"
                  ? "Awaiting permission"
                  : sessionState === "done"
                  ? "Done"
                  : sessionState === "error"
                  ? "Error"
                  : sessionState === "stopped"
                  ? "Stopped"
                  : ""}
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Model selector */}
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={isRunning}
            className="text-xs bg-pplx-card border border-pplx-border rounded-md px-2 py-1 text-pplx-text disabled:opacity-50 cursor-pointer focus:outline-none focus:ring-1 focus:ring-pplx-accent"
          >
            <option value="claude-sonnet-4-6">claude-sonnet-4-6</option>
            <option value="claude-opus-4-6">claude-opus-4-6 (best)</option>
            <option value="claude-opus-4-5">claude-opus-4-5</option>
          </select>
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            className={`p-1.5 rounded-md transition-colors ${
              settingsOpen
                ? "bg-pplx-accent/20 text-pplx-accent"
                : "text-pplx-muted hover:text-pplx-text hover:bg-pplx-card"
            }`}
            title="Blocked apps settings"
          >
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0">
        {/* ── Left: Settings panel ── */}
        {settingsOpen && (
          <aside className="w-64 shrink-0 border-r border-pplx-border bg-pplx-card/30 flex flex-col overflow-y-auto">
            <div className="p-4 border-b border-pplx-border">
              <h3 className="text-xs font-semibold text-pplx-muted uppercase tracking-wider mb-3">
                Blocked Applications
              </h3>
              <p className="text-xs text-pplx-muted mb-3">
                Claude won&apos;t be able to access these apps.
              </p>
              <div className="flex gap-1.5 mb-3">
                <input
                  type="text"
                  value={newBlockedApp}
                  onChange={(e) => setNewBlockedApp(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newBlockedApp.trim()) {
                      setBlockedApps((prev) =>
                        prev.includes(newBlockedApp.trim())
                          ? prev
                          : [...prev, newBlockedApp.trim()]
                      );
                      setNewBlockedApp("");
                    }
                  }}
                  placeholder="App name…"
                  className="flex-1 text-xs bg-pplx-bg border border-pplx-border rounded-md px-2 py-1.5 text-pplx-text focus:outline-none focus:ring-1 focus:ring-pplx-accent"
                />
                <button
                  onClick={() => {
                    if (newBlockedApp.trim()) {
                      setBlockedApps((prev) =>
                        prev.includes(newBlockedApp.trim())
                          ? prev
                          : [...prev, newBlockedApp.trim()]
                      );
                      setNewBlockedApp("");
                    }
                  }}
                  className="p-1.5 bg-pplx-accent/20 text-pplx-accent rounded-md hover:bg-pplx-accent/30 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              {blockedApps.length === 0 ? (
                <p className="text-xs text-pplx-muted/60 italic">No apps blocked</p>
              ) : (
                <ul className="space-y-1">
                  {blockedApps.map((app) => (
                    <li
                      key={app}
                      className="flex items-center justify-between bg-pplx-bg rounded-md px-2 py-1.5 text-xs"
                    >
                      <span className="text-pplx-text">{app}</span>
                      <button
                        onClick={() =>
                          setBlockedApps((prev) => prev.filter((a) => a !== app))
                        }
                        className="text-pplx-muted hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* How it works section */}
            <div className="p-4">
              <h3 className="text-xs font-semibold text-pplx-muted uppercase tracking-wider mb-3">
                How it works
              </h3>
              <ul className="space-y-2 text-xs text-pplx-muted">
                <li className="flex gap-2">
                  <Terminal className="w-3.5 h-3.5 shrink-0 mt-0.5 text-green-400" />
                  <span>Runs bash commands directly (fastest method)</span>
                </li>
                <li className="flex gap-2">
                  <FileEdit className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-400" />
                  <span>Edits files directly without opening a GUI editor</span>
                </li>
                <li className="flex gap-2">
                  <Camera className="w-3.5 h-3.5 shrink-0 mt-0.5 text-pplx-accent" />
                  <span>Takes screenshots &amp; uses mouse/keyboard for GUI tasks</span>
                </li>
                <li className="flex gap-2">
                  <Shield className="w-3.5 h-3.5 shrink-0 mt-0.5 text-pplx-accent" />
                  <span>Requires <code className="bg-pplx-card px-1 rounded">cliclick</code> for mouse control</span>
                </li>
                <li className="flex gap-2">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-pplx-accent" />
                  <span>
                    Install with:{" "}
                    <code className="bg-pplx-card px-1 rounded text-pplx-text">
                      brew install cliclick
                    </code>
                  </span>
                </li>
              </ul>
            </div>
          </aside>
        )}

        {/* ── Center: Screenshot + task input ── */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Screenshot viewer */}
          <div className="flex-1 min-h-0 relative bg-black/30 flex items-center justify-center overflow-hidden">
            {currentScreenshot ? (
              <div className="relative max-w-full max-h-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:image/png;base64,${currentScreenshot.data}`}
                  alt="Claude's current view of your screen"
                  className="max-w-full max-h-full object-contain"
                  style={{ imageRendering: "pixelated" }}
                />
                {/* Action dot overlay */}
                {lastAction?.x !== undefined && lastAction?.y !== undefined && (
                  <div
                    className="absolute pointer-events-none"
                    style={{
                      left: `${(lastAction.x / currentScreenshot.width) * 100}%`,
                      top: `${(lastAction.y / currentScreenshot.height) * 100}%`,
                      transform: "translate(-50%, -50%)",
                    }}
                  >
                    <div className="w-5 h-5 rounded-full border-2 border-pplx-accent bg-pplx-accent/30 animate-ping absolute inset-0" />
                    <div className="w-5 h-5 rounded-full border-2 border-pplx-accent bg-pplx-accent/50 relative" />
                  </div>
                )}
                {/* Screenshot dimensions badge */}
                <div className="absolute bottom-2 right-2 bg-black/60 text-white/60 text-[10px] px-1.5 py-0.5 rounded">
                  {currentScreenshot.width}×{currentScreenshot.height}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 text-pplx-muted/60 select-none">
                <Monitor className="w-16 h-16 opacity-20" />
                <p className="text-sm">
                  {sessionState === "idle"
                    ? "Screenshots will appear here as Claude works"
                    : sessionState === "running"
                    ? "Taking screenshot…"
                    : "No screenshot"}
                </p>
              </div>
            )}

            {/* Stop button overlay (shown when running) */}
            {isRunning && (
              <button
                onClick={stopSession}
                className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-red-500/90 hover:bg-red-500 text-white text-sm font-medium px-4 py-2 rounded-full shadow-lg backdrop-blur-sm transition-colors"
              >
                <Square className="w-3.5 h-3.5 fill-white" />
                Stop Claude
              </button>
            )}

            {/* Status message overlay (loading) */}
            {sessionState === "running" && !currentScreenshot && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-pplx-card/90 backdrop-blur-sm border border-pplx-border rounded-full px-3 py-1.5 text-xs text-pplx-muted shadow-lg">
                <Loader2 className="w-3 h-3 animate-spin text-pplx-accent" />
                {statusMsg || "Starting…"}
              </div>
            )}
          </div>

          {/* Task input */}
          <div className="border-t border-pplx-border bg-pplx-card/20 p-3">
            {sessionState !== "idle" && sessionState !== "done" && sessionState !== "error" && sessionState !== "stopped" && (
              <div className="flex items-center gap-2 mb-2 text-xs text-pplx-muted">
                {sessionState === "waiting_permission" ? (
                  <AlertTriangle className="w-3 h-3 text-yellow-400" />
                ) : (
                  <Loader2 className="w-3 h-3 animate-spin text-pplx-accent" />
                )}
                <span className={statusColor(sessionState)}>{statusMsg}</span>
              </div>
            )}
            {(sessionState === "done" || sessionState === "error" || sessionState === "stopped") && (
              <div className={`flex items-start gap-2 mb-2 text-xs`}>
                {sessionState === "done" ? (
                  <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0 mt-0.5" />
                ) : sessionState === "error" ? (
                  <XCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
                ) : (
                  <Square className="w-3 h-3 text-pplx-muted shrink-0 mt-0.5" />
                )}
                <span className={`${statusColor(sessionState)} break-words`}>
                  {statusMsg.includes("console.anthropic.com") ? (
                    <>
                      Anthropic account has insufficient credits.{" "}
                      <a
                        href="https://console.anthropic.com/settings/billing"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-pplx-accent"
                      >
                        Add credits →
                      </a>
                      <span className="block text-pplx-muted/70 mt-0.5">
                        Note: Computer Control is Anthropic-only (computer_20251124 tool) — no provider fallback is possible.
                      </span>
                    </>
                  ) : statusMsg}
                </span>
              </div>
            )}
            <div className="flex gap-2 items-end">
              <textarea
                ref={taskRef}
                value={task}
                onChange={(e) => setTask(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !isRunning) {
                    e.preventDefault();
                    startSession();
                  }
                }}
                disabled={isRunning}
                placeholder="Tell Claude what to do on your computer… (⌘↵ to run)"
                rows={2}
                className="flex-1 resize-none bg-pplx-bg border border-pplx-border rounded-lg px-3 py-2 text-sm text-pplx-text placeholder:text-pplx-muted focus:outline-none focus:ring-1 focus:ring-pplx-accent disabled:opacity-60 transition-colors"
              />
              <button
                onClick={isRunning ? stopSession : startSession}
                disabled={!isRunning && !task.trim()}
                className={`shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  isRunning
                    ? "bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30"
                    : "bg-pplx-accent text-white hover:bg-pplx-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
                }`}
              >
                {isRunning ? (
                  <>
                    <Square className="w-3.5 h-3.5 fill-current" />
                    Stop
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    Run
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ── Right: Log panel ── */}
        <aside className="w-80 shrink-0 border-l border-pplx-border bg-pplx-card/20 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-pplx-border">
            <span className="text-xs font-semibold text-pplx-muted uppercase tracking-wider">
              Activity Log
            </span>
            {log.length > 0 && (
              <button
                onClick={() => { setLog([]); setSelectedLogEntry(null); }}
                className="text-xs text-pplx-muted hover:text-pplx-text transition-colors"
              >
                Clear
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
            {log.length === 0 ? (
              <p className="text-xs text-pplx-muted/60 italic text-center mt-4">
                Activity will appear here
              </p>
            ) : (
              log.map((entry) => (
                <LogEntryRow
                  key={entry.id}
                  entry={entry}
                  selected={selectedLogEntry?.id === entry.id}
                  onSelect={() =>
                    setSelectedLogEntry((prev) =>
                      prev?.id === entry.id ? null : entry
                    )
                  }
                />
              ))
            )}
            <div ref={logEndRef} />
          </div>

          {/* Selected entry detail */}
          {selectedLogEntry && (
            <LogEntryDetail
              entry={selectedLogEntry}
              onClose={() => setSelectedLogEntry(null)}
            />
          )}
        </aside>
      </div>

      {/* ── Permission modal ── */}
      {pendingPermission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-pplx-card border border-pplx-border rounded-xl shadow-2xl p-6 w-80 max-w-[90vw]">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-yellow-400/20 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4.5 h-4.5 text-yellow-400" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-pplx-text">App Access Request</h3>
                <p className="text-xs text-pplx-muted">Claude wants to access an app</p>
              </div>
            </div>
            <p className="text-sm text-pplx-text mb-1">
              Allow Claude to access{" "}
              <span className="font-semibold text-pplx-accent">{pendingPermission.app}</span>?
            </p>
            <p className="text-xs text-pplx-muted mb-5">
              This will let Claude interact with {pendingPermission.app} to complete your task.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => respondPermission(false)}
                className="flex-1 px-3 py-2 rounded-lg text-sm border border-pplx-border text-pplx-muted hover:text-pplx-text hover:bg-pplx-bg transition-colors"
              >
                Deny
              </button>
              <button
                onClick={() => respondPermission(true)}
                className="flex-1 px-3 py-2 rounded-lg text-sm bg-pplx-accent text-white hover:bg-pplx-accent/90 transition-colors font-medium"
              >
                Allow
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Log Row ──────────────────────────────────────────────────────────────────

function LogEntryRow({
  entry,
  selected,
  onSelect,
}: {
  entry: LogEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  const icon = (() => {
    switch (entry.kind) {
      case "screenshot": return <Camera className="w-3 h-3 text-pplx-muted" />;
      case "action": return actionIcon(entry.action);
      case "text": return <MessageSquare className="w-3 h-3 text-pplx-accent" />;
      case "thinking": return <Brain className="w-3 h-3 text-purple-400" />;
      case "error": return <AlertCircle className="w-3 h-3 text-red-400" />;
      case "status": return <Clock className="w-3 h-3 text-pplx-muted" />;
      case "done": return <CheckCircle2 className="w-3 h-3 text-green-400" />;
    }
  })();

  const label = (() => {
    switch (entry.kind) {
      case "screenshot": return "Screenshot captured";
      case "action": return entry.description ?? entry.action ?? "Action";
      case "text": return entry.content?.slice(0, 80) ?? "";
      case "thinking": return "Thinking…";
      case "error": return `Error: ${entry.content?.slice(0, 60) ?? ""}`;
      case "status": return entry.message ?? entry.status ?? "";
      case "done":
        return entry.reason === "task_complete"
          ? "Task completed"
          : entry.reason === "max_iterations"
          ? "Max steps reached"
          : "Done";
    }
  })();

  const hasDetail = entry.kind === "screenshot" || entry.kind === "text" || entry.kind === "thinking" || entry.kind === "error" || entry.kind === "action";

  return (
    <button
      onClick={hasDetail ? onSelect : undefined}
      className={`w-full text-left flex items-start gap-2 px-2 py-1.5 rounded-md text-xs transition-colors ${
        selected
          ? "bg-pplx-accent/10 border border-pplx-accent/30"
          : hasDetail
          ? "hover:bg-pplx-card cursor-pointer"
          : "cursor-default"
      }`}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span
        className={`flex-1 min-w-0 truncate ${
          entry.kind === "error"
            ? "text-red-400"
            : entry.kind === "done"
            ? "text-green-400"
            : entry.kind === "text"
            ? "text-pplx-text"
            : entry.kind === "thinking"
            ? "text-purple-400/80"
            : "text-pplx-muted"
        }`}
      >
        {label}
      </span>
      {hasDetail && <ChevronRight className={`w-3 h-3 shrink-0 mt-0.5 text-pplx-muted/50 transition-transform ${selected ? "rotate-90" : ""}`} />}
    </button>
  );
}

// ─── Log Detail Panel ─────────────────────────────────────────────────────────

function LogEntryDetail({ entry, onClose }: { entry: LogEntry; onClose: () => void }) {
  return (
    <div className="border-t border-pplx-border bg-pplx-bg/60 max-h-56 overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-2 border-b border-pplx-border">
        <span className="text-xs font-medium text-pplx-muted capitalize">{entry.kind}</span>
        <button onClick={onClose} className="text-pplx-muted hover:text-pplx-text">
          <X className="w-3 h-3" />
        </button>
      </div>
      <div className="p-3">
        {entry.kind === "screenshot" && entry.data && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`data:image/png;base64,${entry.data}`}
            alt="Screenshot"
            className="w-full rounded border border-pplx-border"
          />
        )}
        {(entry.kind === "text" || entry.kind === "error") && (
          <p className="text-xs text-pplx-text whitespace-pre-wrap break-words leading-relaxed">
            {entry.content}
          </p>
        )}
        {entry.kind === "thinking" && (
          <p className="text-xs text-purple-400/80 whitespace-pre-wrap break-words leading-relaxed italic">
            {entry.content}
          </p>
        )}
        {entry.kind === "action" && entry.input && (
          <pre className="text-xs text-pplx-muted bg-pplx-card/50 rounded p-2 overflow-x-auto">
            {JSON.stringify(entry.input, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

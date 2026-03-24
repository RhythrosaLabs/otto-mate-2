"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { addBackgroundOp, updateBackgroundOp, removeBackgroundOp } from "@/lib/background-ops";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Globe,
  Code2,
  FolderOpen,
  Plug,
  Bot,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Clock,
  ExternalLink,
  RefreshCw,
  Square,
  MessageSquare,
  Zap,
  Terminal,
  Eye,
  Maximize2,
  Image as ImageIcon,
  Paperclip,
  Command,
  Mic,
  MicOff,
  Volume2,
  Info,
  Gauge,
} from "lucide-react";
import { cn, formatRelativeTime, formatBytes, getMimeIcon, getStatusBgColor, formatDuration } from "@/lib/utils";
import type { Task, AgentStep, TaskFile } from "@/lib/types";
import { useHandoff, STUDIO_MAP, studiosForItem, type StudioId } from "@/components/handoff-context";
import { inferMimeCategory, makeHandoffItem } from "@/lib/handoff-store";
import { ArrowRight } from "lucide-react";

interface Props {
  task: Task;
}

export function TaskDetailClient({ task: initialTask }: Props) {
  const [task, setTask] = useState<Task>(initialTask);
  const [input, setInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"steps" | "chat" | "files" | "preview">("steps");
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [streamingText, setStreamingText] = useState("");
  const [previewFile, setPreviewFile] = useState<TaskFile | null>(null);
  const [tokenUsage, setTokenUsage] = useState<{ total_tokens: number; estimated_cost_usd: number } | null>(null);
  const [commandResults, setCommandResults] = useState<Array<{ id: string; content: string; type: "info" | "success" | "error" }>>([]);
  const [thinkingLevel, setThinkingLevel] = useState<"off" | "low" | "medium" | "high">("medium");
  const [showUsageFooter, setShowUsageFooter] = useState(false);
  const [showChatCommands, setShowChatCommands] = useState(false);
  const [chatCmdHighlight, setChatCmdHighlight] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showContextPanel, setShowContextPanel] = useState(false);
  const [contextBudget, setContextBudget] = useState<{
    max_tokens: number;
    used_tokens: number;
    system_prompt_tokens: number;
    tools_tokens: number;
    history_tokens: number;
    percentage_used: number;
    estimated_cost?: number;
  } | null>(null);
  const stepsEndRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const hasAutoRunRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<unknown>(null);

  // ─── Background ops tracking ─────────────────────────────────────────────
  useEffect(() => {
    const opId = `task-${task.id}`;
    if (task.status === "running" || isSubmitting) {
      addBackgroundOp({
        id: opId,
        type: "task",
        label: task.title || "Task",
        status: "running",
        href: `/computer/tasks/${task.id}`,
        startedAt: Date.now(),
        detail: isSubmitting ? "Agent working..." : `Status: ${task.status}`,
      });
    } else if (task.status === "completed") {
      updateBackgroundOp(opId, { status: "completed", detail: "Done" });
    } else if (task.status === "failed") {
      updateBackgroundOp(opId, { status: "failed", detail: "Failed" });
    } else {
      removeBackgroundOp(opId);
    }
    return () => { removeBackgroundOp(opId); };
  }, [task.id, task.status, task.title, isSubmitting]);

  // ─── Chat Commands (Otto/OpenClaw-inspired) ─────────────────────────────────
  const CHAT_COMMANDS = [
    { command: "/status", description: "Show task status, model, tokens used", icon: "📊" },
    { command: "/usage", description: "Toggle token usage footer on messages", icon: "💰" },
    { command: "/think", description: "Set thinking level: /think off|low|medium|high", icon: "🧠" },
    { command: "/compact", description: "Compact conversation history", icon: "📦" },
    { command: "/reset", description: "Clear chat and restart task", icon: "🔄" },
    { command: "/help", description: "Show all available commands", icon: "❓" },
  ];

  const filteredChatCmds = useMemo(() => {
    if (!input.startsWith("/")) return [];
    const typed = input.split(" ")[0].toLowerCase();
    return CHAT_COMMANDS.filter(c => c.command.startsWith(typed));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  useEffect(() => {
    setShowChatCommands(input.startsWith("/") && !input.includes(" ") && filteredChatCmds.length > 0);
    setChatCmdHighlight(0);
  }, [input, filteredChatCmds.length]);

  function addCommandResult(content: string, type: "info" | "success" | "error" = "info") {
    setCommandResults(prev => [...prev, { id: `cmd-${Date.now()}`, content, type }]);
  }

  function handleChatCommand(msg: string): boolean {
    const parts = msg.split(" ");
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1).join(" ").trim();

    switch (cmd) {
      case "/status": {
        const duration = task.completed_at
          ? Math.round((new Date(task.completed_at).getTime() - new Date(task.created_at).getTime()) / 1000)
          : Math.round((Date.now() - new Date(task.created_at).getTime()) / 1000);
        const lines = [
          `**Task Status**`,
          `- **ID:** \`${task.id.slice(0, 8)}...\``,
          `- **Status:** ${task.status.replace("_", " ")}`,
          `- **Model:** ${task.model || "auto"}`,
          `- **Steps:** ${task.steps.length}`,
          `- **Files:** ${task.files.length}`,
          `- **Messages:** ${task.messages.length}`,
          `- **Duration:** ${duration}s`,
          `- **Thinking:** ${thinkingLevel}`,
        ];
        if (tokenUsage) {
          lines.push(`- **Tokens:** ${tokenUsage.total_tokens.toLocaleString()}`);
          lines.push(`- **Cost:** $${tokenUsage.estimated_cost_usd.toFixed(4)}`);
        }
        addCommandResult(lines.join("\n"));
        return true;
      }
      case "/usage":
        setShowUsageFooter(prev => !prev);
        addCommandResult(`Token usage footer ${!showUsageFooter ? "enabled" : "disabled"}`, "success");
        return true;
      case "/think": {
        const level = args.toLowerCase() as typeof thinkingLevel;
        if (["off", "low", "medium", "high"].includes(level)) {
          setThinkingLevel(level);
          addCommandResult(`Thinking level set to **${level}**`, "success");
        } else {
          addCommandResult(`Current thinking level: **${thinkingLevel}**\nUsage: \`/think off|low|medium|high\``, "info");
        }
        return true;
      }
      case "/compact":
        addCommandResult("Conversation compacted. Older messages summarized for context efficiency.", "success");
        return true;
      case "/reset":
        setCommandResults([]);
        addCommandResult("Chat reset. You can continue with a fresh follow-up.", "success");
        return true;
      case "/help": {
        const lines = CHAT_COMMANDS.map(c => `${c.icon} \`${c.command}\` — ${c.description}`);
        addCommandResult(`**Available Commands**\n\n${lines.join("\n")}`);
        return true;
      }
      default:
        return false;
    }
  }

  async function handleFileUpload(files: FileList) {
    const formData = new FormData();
    formData.append("taskId", task.id);
    Array.from(files).forEach((f) => formData.append("files", f));
    try {
      await fetch("/api/files", { method: "POST", body: formData });
      // Refresh task to get new files
      const res = await fetch(`/api/tasks/${task.id}`);
      if (res.ok) setTask(await res.json() as Task);
    } catch (err) { console.error("Upload failed:", err); }
  }

  // Auto-detect previewable files (HTML, images, video, audio, PDFs, SVG, text, markdown)
  const previewableFiles = task.files.filter(
    (f) => f.mime_type === "text/html" || f.mime_type.startsWith("image/") ||
      f.mime_type.startsWith("video/") || f.mime_type.startsWith("audio/") ||
      f.mime_type === "application/pdf" || f.mime_type === "image/svg+xml" ||
      f.name.endsWith(".md") || f.name.endsWith(".txt") || f.name.endsWith(".csv")
  );
  const htmlFiles = task.files.filter((f) => f.mime_type === "text/html");

  // Auto-switch to preview tab when first HTML file appears
  const prevHtmlCountRef = useRef(htmlFiles.length);
  useEffect(() => {
    if (htmlFiles.length > 0 && prevHtmlCountRef.current === 0) {
      setActiveTab("preview");
      setPreviewFile(htmlFiles[0]);
    }
    prevHtmlCountRef.current = htmlFiles.length;
  }, [htmlFiles.length]);

  // Auto-scroll
  useEffect(() => {
    stepsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [task.steps.length, streamingText]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [task.messages.length]);

  // SSE-based live updates (replaces polling)
  useEffect(() => {
    if (task.status !== "running" && task.status !== "pending") return;

    const es = new EventSource("/api/tasks/events");

    es.onmessage = async (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === "update" && data.task?.id === task.id) {
          // Fetch fresh task data when our task updates
          const res = await fetch(`/api/tasks/${task.id}`);
          if (res.ok) {
            const updated = (await res.json()) as Task;
            setTask(updated);
            if (updated.status !== "running" && updated.status !== "pending") {
              es.close();
            }
          }
        }
      } catch {
        /* ignore parse errors */
      }
    };

    es.onerror = () => {
      // Fallback: reconnect handled automatically by EventSource
    };

    return () => {
      es.close();
    };
  }, [task.id, task.status]);

  // Auto-run if task is pending (just created) — guarded to fire only once
  useEffect(() => {
    if (initialTask.status === "pending" && !hasAutoRunRef.current) {
      hasAutoRunRef.current = true;
      const firstUserMsg = initialTask.messages.find((m) => m.role === "user");
      runTask(firstUserMsg?.content || initialTask.prompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch token usage for this task
  useEffect(() => {
    async function fetchUsage() {
      try {
        const res = await fetch(`/api/usage?taskId=${task.id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.total_tokens > 0) setTokenUsage(data);
        }
      } catch { /* ignore */ }
    }
    if (task.status !== "running" && task.status !== "pending") {
      fetchUsage();
    }
  }, [task.id, task.status]);

  // Fetch context window budget
  useEffect(() => {
    async function fetchContextBudget() {
      try {
        const res = await fetch(`/api/context?task_id=${task.id}`);
        if (res.ok) {
          const data = await res.json();
          setContextBudget(data);
        }
      } catch { /* ignore */ }
    }
    if (task.status !== "pending") {
      fetchContextBudget();
    }
  }, [task.id, task.status]);

  async function runTask(message: string) {
    setIsSubmitting(true);
    setStreamingText("");
    abortRef.current = new AbortController();

    try {
      const model = typeof window !== "undefined" ? localStorage.getItem("ottomate_model") || undefined : undefined;
      const res = await fetch(`/api/tasks/${task.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, model }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) throw new Error("Stream failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const event = JSON.parse(data) as {
              type: string;
              step?: AgentStep;
              token?: string;
              task?: Task;
            };
            
            if (event.type === "step") {
              setTask((prev) => ({
                ...prev,
                steps: [
                  ...prev.steps.filter((s) => s.id !== event.step!.id),
                  event.step!,
                ],
              }));
              setStreamingText("");
            } else if (event.type === "token") {
              setStreamingText((prev) => prev + (event.token || ""));
            } else if (event.type === "update") {
              setTask(event.task!);
              setStreamingText("");
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.error(err);
      }
    } finally {
      setIsSubmitting(false);
      setStreamingText("");
      // Final fetch to get latest task state
      const res = await fetch(`/api/tasks/${task.id}`);
      if (res.ok) {
        const data = await res.json() as Task;
        setTask(data);
      }
    }
  }

  async function handleSendMessage(e?: React.FormEvent) {
    e?.preventDefault();
    if (!input.trim() || isSubmitting) return;
    const msg = input.trim();
    setInput("");

    // Intercept chat commands — handle locally without server round-trip
    if (msg.startsWith("/") && handleChatCommand(msg)) {
      return;
    }

    await runTask(msg);
  }

  function handleStop() {
    abortRef.current?.abort();
    // Also tell the server to abort the agent run
    fetch(`/api/tasks/${task.id}/stop`, { method: "POST" })
      .then((res) => res.json() as Promise<{ task?: Task }>)
      .then((data) => {
        if (data.task) setTask(data.task);
      })
      .catch(() => { /* best effort */ });
  }

  function toggleStep(stepId: string) {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  }

  const lastMessage = task.messages
    .filter((m) => m.role === "assistant")
    .at(-1);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-pplx-border flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <StatusDot status={task.status} />
            <h1 className="text-base font-medium text-pplx-text truncate">{task.title}</h1>
            <span className={cn("status-badge px-2 py-0.5 rounded-full flex-shrink-0 text-[10px]", getStatusBgColor(task.status))}>
              {task.status.replace("_", " ")}
            </span>
          </div>
          <p className="text-xs text-pplx-muted mt-0.5">
            {formatRelativeTime(task.created_at)} ·
            {task.steps.length} steps ·
            {task.files.length} files ·
            {task.sub_tasks?.length || 0} sub-agents
            {tokenUsage && (
              <> · {tokenUsage.total_tokens.toLocaleString()} tokens · ${tokenUsage.estimated_cost_usd.toFixed(4)}</>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {(task.status === "running") && (
            <button
              onClick={handleStop}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-400/10 text-red-400 hover:bg-red-400/20 text-xs font-medium transition-colors"
            >
              <Square size={12} />
              Stop
            </button>
          )}
          <button
            onClick={async () => {
              const res = await fetch(`/api/tasks/${task.id}`);
              if (res.ok) setTask(await res.json() as Task);
            }}
            className="p-2 rounded-lg text-pplx-muted hover:text-pplx-text hover:bg-white/5 transition-colors"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => setShowContextPanel(prev => !prev)}
            className={cn(
              "p-2 rounded-lg transition-colors",
              showContextPanel
                ? "text-pplx-accent bg-pplx-accent/10"
                : "text-pplx-muted hover:text-pplx-text hover:bg-white/5"
            )}
            title="Context window budget"
          >
            <Gauge size={14} />
          </button>
        </div>
      </div>

      {/* Context Window Manager Panel */}
      {showContextPanel && (
        <div className="px-6 py-3 border-b border-pplx-border bg-pplx-card/50">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-pplx-text flex items-center gap-1.5">
              <Gauge size={12} className="text-pplx-accent" />
              Context Window Budget
            </p>
            {contextBudget && (
              <span className={cn(
                "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                contextBudget.percentage_used > 80
                  ? "bg-red-400/15 text-red-400"
                  : contextBudget.percentage_used > 50
                  ? "bg-yellow-400/15 text-yellow-400"
                  : "bg-green-400/15 text-green-400"
              )}>
                {contextBudget.percentage_used}% used
              </span>
            )}
          </div>

          {contextBudget ? (
            <>
              {/* Usage bar */}
              <div className="w-full h-3 rounded-full bg-pplx-bg overflow-hidden mb-2 border border-pplx-border">
                <div className="h-full flex">
                  <div
                    className="bg-blue-400 transition-all duration-500"
                    style={{ width: `${Math.min((contextBudget.system_prompt_tokens / contextBudget.max_tokens) * 100, 100)}%` }}
                    title={`System prompt: ${contextBudget.system_prompt_tokens.toLocaleString()} tokens`}
                  />
                  <div
                    className="bg-purple-400 transition-all duration-500"
                    style={{ width: `${Math.min((contextBudget.tools_tokens / contextBudget.max_tokens) * 100, 100)}%` }}
                    title={`Tools: ${contextBudget.tools_tokens.toLocaleString()} tokens`}
                  />
                  <div
                    className="bg-green-400 transition-all duration-500"
                    style={{ width: `${Math.min((contextBudget.history_tokens / contextBudget.max_tokens) * 100, 100)}%` }}
                    title={`History: ${contextBudget.history_tokens.toLocaleString()} tokens`}
                  />
                </div>
              </div>

              {/* Legend + stats */}
              <div className="grid grid-cols-4 gap-2 text-[10px]">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-sm bg-blue-400" />
                  <span className="text-pplx-muted">System</span>
                  <span className="font-mono text-pplx-text ml-auto">{(contextBudget.system_prompt_tokens / 1000).toFixed(1)}k</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-sm bg-purple-400" />
                  <span className="text-pplx-muted">Tools</span>
                  <span className="font-mono text-pplx-text ml-auto">{(contextBudget.tools_tokens / 1000).toFixed(1)}k</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-sm bg-green-400" />
                  <span className="text-pplx-muted">History</span>
                  <span className="font-mono text-pplx-text ml-auto">{(contextBudget.history_tokens / 1000).toFixed(1)}k</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-sm bg-pplx-bg border border-pplx-border" />
                  <span className="text-pplx-muted">Free</span>
                  <span className="font-mono text-pplx-text ml-auto">{((contextBudget.max_tokens - contextBudget.used_tokens) / 1000).toFixed(1)}k</span>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-pplx-border/50">
                <span className="text-[10px] text-pplx-muted">
                  {contextBudget.used_tokens.toLocaleString()} / {contextBudget.max_tokens.toLocaleString()} tokens
                </span>
                {contextBudget.estimated_cost != null && (
                  <span className="text-[10px] text-pplx-muted font-mono">
                    ${contextBudget.estimated_cost.toFixed(4)}
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center py-3 text-pplx-muted">
              <Loader2 size={14} className="animate-spin mr-2" />
              <span className="text-xs">Loading context budget...</span>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="px-6 py-0 border-b border-pplx-border">
        <div className="flex items-center">
          {[
            { key: "steps", label: "Steps", icon: Terminal, count: task.steps.length },
            { key: "chat", label: "Messages", icon: MessageSquare, count: task.messages.length },
            { key: "files", label: "Files", icon: FolderOpen, count: task.files.length },
            ...(previewableFiles.length > 0
              ? [{ key: "preview", label: "Preview", icon: Eye, count: previewableFiles.length }]
              : []),
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as typeof activeTab)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-3 text-sm border-b-2 transition-colors",
                  activeTab === tab.key
                    ? "border-pplx-accent text-pplx-text font-medium"
                    : "border-transparent text-pplx-muted hover:text-pplx-text"
                )}
              >
                <Icon size={13} />
                {tab.label}
                {tab.count > 0 && (
                  <span className={cn(
                    "px-1.5 py-0.5 rounded-full text-[10px]",
                    activeTab === tab.key ? "bg-pplx-accent/20 text-pplx-accent" : "bg-white/5 text-pplx-muted"
                  )}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "steps" && (
          <div className="px-6 py-4">
            {task.steps.length === 0 && !isSubmitting && (
              <div className="flex flex-col items-center justify-center h-32 text-pplx-muted">
                <Clock size={28} className="mb-2 opacity-40" />
                <p className="text-sm">No steps yet. Run the task to start.</p>
              </div>
            )}

            {/* Sub-tasks */}
            {task.sub_tasks && task.sub_tasks.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-pplx-muted font-medium mb-2 flex items-center gap-1.5">
                  <Bot size={11} />
                  Sub-agents ({task.sub_tasks.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {task.sub_tasks.map((st) => (
                    <div
                      key={st.id}
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border",
                        st.status === "completed"
                          ? "bg-green-400/5 border-green-400/20 text-green-400"
                          : st.status === "running"
                          ? "bg-pplx-accent/5 border-pplx-accent/20 text-pplx-accent"
                          : "bg-red-400/5 border-red-400/20 text-red-400"
                      )}
                    >
                      <Zap size={10} />
                      {st.title}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step list */}
            <div className="space-y-2">
              {task.steps.map((step, i) => (
                <StepCard
                  key={step.id}
                  step={step}
                  index={i}
                  expanded={expandedSteps.has(step.id)}
                  onToggle={() => toggleStep(step.id)}
                  taskId={task.id}
                  taskStatus={task.status}
                  pendingApprovals={(task.metadata?.pending_approvals as Array<{id: string}>) || []}
                  onApprove={async (approvalId: string) => {
                    // Immediately update step status in local state for visual feedback
                    setTask((prev) => ({
                      ...prev,
                      steps: prev.steps.map((s) =>
                        s.id === approvalId ? { ...s, status: "completed" as const, title: "✅ Approved" } : s
                      ),
                      metadata: {
                        ...prev.metadata,
                        pending_approvals: ((prev.metadata?.pending_approvals as Array<{id: string}>) || []).filter(a => a.id !== approvalId),
                      },
                    }));
                    const res = await fetch(`/api/tasks/${task.id}/approve`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ approval_id: approvalId, approved: true }),
                    });
                    const data = await res.json() as { approval?: { tool?: string; input?: Record<string, unknown>; reason?: string } };
                    // Re-run the task with specific context about what was approved
                    const detail = data.approval
                      ? `The user APPROVED the action: ${data.approval.tool}(${JSON.stringify(data.approval.input)}). Execute this exact tool call now and then continue.`
                      : "Action approved. Please proceed with the previously requested action.";
                    runTask(detail);
                  }}
                  onDeny={async (approvalId: string) => {
                    // Immediately update step status in local state for visual feedback
                    setTask((prev) => ({
                      ...prev,
                      steps: prev.steps.map((s) =>
                        s.id === approvalId ? { ...s, status: "failed" as const, title: "❌ Denied" } : s
                      ),
                      metadata: {
                        ...prev.metadata,
                        pending_approvals: ((prev.metadata?.pending_approvals as Array<{id: string}>) || []).filter(a => a.id !== approvalId),
                      },
                    }));
                    const res = await fetch(`/api/tasks/${task.id}/approve`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ approval_id: approvalId, approved: false }),
                    });
                    const data = await res.json() as { approval?: { tool?: string; reason?: string } };
                    const detail = data.approval
                      ? `The user DENIED the action: ${data.approval.tool} — "${data.approval.reason}". Do NOT execute this action. Find an alternative approach or call complete_task to finish with a summary of what was accomplished so far.`
                      : "Action denied. Do not proceed with this action. Call complete_task to finish.";
                    runTask(detail);
                  }}
                />
              ))}
            </div>

            {/* Streaming indicator */}
            {isSubmitting && (
              <div className="mt-2 flex items-start gap-3 p-3 rounded-xl border border-pplx-accent/20 bg-pplx-accent/5 agent-step">
                <Loader2 size={14} className="text-pplx-accent animate-spin mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-pplx-accent font-medium mb-1">Thinking...</p>
                  {streamingText && (
                    <p className="text-xs text-pplx-muted leading-relaxed">
                      {streamingText.slice(-500)}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div ref={stepsEndRef} />
          </div>
        )}

        {activeTab === "chat" && (
          <div className="px-6 py-4">
            {task.messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-pplx-muted">
                <MessageSquare size={28} className="mb-2 opacity-40" />
                <p className="text-sm">No messages yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {task.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex gap-3",
                      msg.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    {msg.role === "assistant" && (
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 via-pink-500 to-orange-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Bot size={14} className="text-white" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-4 py-3 text-sm",
                        msg.role === "user"
                          ? "bg-pplx-accent/20 text-pplx-text rounded-tr-sm"
                          : "bg-pplx-card border border-pplx-border text-pplx-text rounded-tl-sm"
                      )}
                    >
                      {msg.role === "assistant" ? (
                        <div className="prose prose-invert prose-sm max-w-none [&_pre]:bg-pplx-bg [&_pre]:border [&_pre]:border-pplx-border [&_pre]:rounded-lg [&_pre]:p-3 [&_code]:text-xs [&_code]:font-mono [&_table]:border-collapse [&_th]:bg-pplx-bg [&_th]:border [&_th]:border-pplx-border [&_th]:px-3 [&_th]:py-1.5 [&_td]:border [&_td]:border-pplx-border [&_td]:px-3 [&_td]:py-1.5 [&_a]:text-pplx-accent [&_a]:underline [&_img]:rounded-lg [&_img]:max-h-80 [&_img]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-pplx-accent/40 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-pplx-muted [&_hr]:border-pplx-border [&_li]:marker:text-pplx-muted">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              code({ className, children, ...props }) {
                                const match = /language-(\w+)/.exec(className || "");
                                const codeStr = String(children).replace(/\n$/, "");
                                if (match || codeStr.includes("\n")) {
                                  return (
                                    <div className="relative group/code my-2">
                                      {match && (
                                        <span className="absolute top-2 right-10 text-[10px] text-pplx-muted opacity-60 font-mono">
                                          {match[1]}
                                        </span>
                                      )}
                                      <button
                                        onClick={() => navigator.clipboard.writeText(codeStr)}
                                        className="absolute top-2 right-2 p-1 rounded text-pplx-muted hover:text-pplx-text opacity-0 group-hover/code:opacity-100 transition-opacity"
                                        title="Copy code"
                                      >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                      </button>
                                      <pre className="!m-0">
                                        <code
                                          className={className}
                                          dangerouslySetInnerHTML={{ __html: highlightCode(codeStr) }}
                                          {...props}
                                        />
                                      </pre>
                                    </div>
                                  );
                                }
                                return (
                                  <code className="bg-pplx-bg px-1.5 py-0.5 rounded text-xs border border-pplx-border" {...props}>
                                    {children}
                                  </code>
                                );
                              },
                              img({ src, alt, ...props }) {
                                return (
                                  <span className="block my-2">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={src} alt={alt || ""} className="rounded-lg max-h-80 object-contain" loading="lazy" {...props} />
                                  </span>
                                );
                              },
                              a({ href, children, ...props }) {
                                // Detect image URLs and render them inline
                                const isImageUrl = href && /\.(png|jpg|jpeg|gif|webp|svg|bmp)(\?.*)?$/i.test(href);
                                if (isImageUrl) {
                                  return (
                                    <span className="block my-2">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={href} alt={String(children) || ""} className="rounded-lg max-h-80 object-contain" loading="lazy" />
                                      <a href={href} target="_blank" rel="noopener noreferrer" className="text-xs text-pplx-muted hover:text-pplx-accent mt-1 block" {...props}>{children}</a>
                                    </span>
                                  );
                                }
                                return <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>;
                              },
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <p>{msg.content}</p>
                      )}
                      <p className="text-xs text-pplx-muted mt-1.5 text-right">
                        {formatRelativeTime(msg.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />

                {/* Command Results (local, no server round-trip) */}
                {commandResults.map((cr) => (
                  <div key={cr.id} className="flex gap-3 justify-start">
                    <div className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5",
                      cr.type === "success" ? "bg-green-500/20" : cr.type === "error" ? "bg-red-500/20" : "bg-purple-500/20"
                    )}>
                      <Info size={14} className={cr.type === "success" ? "text-green-400" : cr.type === "error" ? "text-red-400" : "text-purple-400"} />
                    </div>
                    <div className="max-w-[85%] rounded-2xl px-4 py-3 text-sm bg-pplx-card border border-pplx-border/60 text-pplx-text rounded-tl-sm">
                      <div className="prose prose-invert prose-sm max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{cr.content}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "files" && (
          <div className="px-6 py-4">
            {task.files.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-pplx-muted">
                <FolderOpen size={28} className="mb-2 opacity-40" />
                <p className="text-sm">No files generated yet.</p>
              </div>
            ) : (
              <div className="grid gap-2">
                {task.files.map((file) => (
                  <FileCard key={file.id} file={file} taskId={task.id} onPreview={(f) => {
                    setPreviewFile(f);
                    setActiveTab("preview");
                  }} />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "preview" && (
          <div className="h-full flex flex-col">
            {/* Preview file selector */}
            {previewableFiles.length > 1 && (
              <div className="px-4 py-2 border-b border-pplx-border flex items-center gap-2 overflow-x-auto">
                {previewableFiles.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setPreviewFile(f)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                      previewFile?.id === f.id
                        ? "bg-pplx-accent/15 text-pplx-accent border border-pplx-accent/30"
                        : "bg-pplx-card border border-pplx-border text-pplx-muted hover:text-pplx-text"
                    )}
                  >
                    {f.mime_type === "text/html" ? <Globe size={11} /> : <ImageIcon size={11} />}
                    {f.name}
                  </button>
                ))}
              </div>
            )}

            {/* Preview content */}
            {previewFile || previewableFiles[0] ? (() => {
              const pf = previewFile || previewableFiles[0];
              const fileUrl = `/api/files/${task.id}/${pf.name}`;
              return (
                <div className="flex-1 relative bg-white rounded-lg m-3 overflow-hidden">
                  {pf.mime_type === "text/html" ? (
                    <iframe
                      src={fileUrl}
                      className="w-full h-full min-h-[500px] border-0"
                      sandbox="allow-scripts"
                      title="Live Preview"
                    />
                  ) : pf.mime_type.startsWith("image/") ? (
                    <div className="flex items-center justify-center p-4 bg-pplx-bg h-full min-h-[400px]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={fileUrl} alt={pf.name} className="max-w-full max-h-[600px] object-contain rounded-lg" />
                    </div>
                  ) : pf.mime_type.startsWith("video/") ? (
                    <div className="flex items-center justify-center p-4 bg-pplx-bg h-full min-h-[400px]">
                      <video src={fileUrl} controls className="max-w-full max-h-[600px] rounded-lg">
                        Your browser does not support the video tag.
                      </video>
                    </div>
                  ) : pf.mime_type.startsWith("audio/") ? (
                    <div className="flex items-center justify-center p-8 bg-pplx-bg h-full min-h-[200px]">
                      <audio src={fileUrl} controls className="w-full max-w-lg">
                        Your browser does not support the audio tag.
                      </audio>
                    </div>
                  ) : pf.mime_type === "application/pdf" ? (
                    <iframe src={fileUrl} className="w-full h-full min-h-[600px] border-0" title="PDF Preview" />
                  ) : (pf.name.endsWith(".md") || pf.name.endsWith(".txt") || pf.name.endsWith(".csv")) ? (
                    <TextFilePreview fileUrl={fileUrl} fileName={pf.name} />
                  ) : null}

                  {/* Open in new tab button */}
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute top-3 right-3 p-2 rounded-lg bg-black/50 text-white hover:bg-black/70 transition-colors backdrop-blur-sm"
                    title="Open in new tab"
                  >
                    <Maximize2 size={14} />
                  </a>
                </div>
              );
            })() : (
              <div className="flex flex-col items-center justify-center h-64 text-pplx-muted">
                <Eye size={28} className="mb-2 opacity-40" />
                <p className="text-sm">No previewable files yet</p>
                <p className="text-xs mt-1 opacity-70">HTML, images, video, audio, PDF and text files will appear here</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input area - show for waiting or when user wants to interact */}
      {(task.status === "waiting_for_input" || task.status === "completed" || task.status === "failed") && (
        <div className="px-6 py-4 border-t border-pplx-border">
          {task.status === "waiting_for_input" && (
            <div className="mb-3 flex items-center gap-2 text-yellow-400 text-xs">
              <Clock size={12} />
              Computer is waiting for your input
            </div>
          )}
          <form onSubmit={handleSendMessage} className="flex gap-2 relative">
            {/* Chat command autocomplete */}
            {showChatCommands && (
              <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-pplx-border bg-pplx-card shadow-xl overflow-hidden z-50 animate-fade-in">
                <div className="px-3 py-1.5 border-b border-pplx-border flex items-center gap-2">
                  <Command size={11} className="text-pplx-accent" />
                  <span className="text-[10px] text-pplx-muted font-medium uppercase tracking-wider">Commands</span>
                </div>
                {filteredChatCmds.map((cmd, i) => (
                  <button
                    key={cmd.command}
                    type="button"
                    onClick={() => { setInput(cmd.command + " "); setShowChatCommands(false); }}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors",
                      i === chatCmdHighlight ? "bg-pplx-accent/10 text-pplx-text" : "text-pplx-muted hover:bg-white/5"
                    )}
                  >
                    <span className="text-base">{cmd.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium">{cmd.command}</div>
                      <div className="text-[10px] opacity-60">{cmd.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2.5 rounded-xl text-pplx-muted hover:text-pplx-text hover:bg-white/5 border border-pplx-border transition-colors"
              title="Upload files"
            >
              <Paperclip size={14} />
            </button>

            {/* Voice input button */}
            <button
              type="button"
              onClick={() => {
                if (isListening) {
                  (recognitionRef.current as { stop: () => void } | null)?.stop();
                  setIsListening(false);
                } else {
                  try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
                    if (!SpeechRecognitionCtor) { addCommandResult("Speech recognition not supported in this browser", "error"); return; }
                    const recognition = new SpeechRecognitionCtor();
                    recognition.continuous = false;
                    recognition.interimResults = true;
                    recognition.lang = "en-US";
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    recognition.onresult = (event: any) => {
                      const transcript = Array.from(event.results as ArrayLike<{ 0: { transcript: string } }>).map((r: { 0: { transcript: string } }) => r[0].transcript).join("");
                      setInput(transcript);
                    };
                    recognition.onend = () => setIsListening(false);
                    recognition.onerror = () => setIsListening(false);
                    recognitionRef.current = recognition;
                    recognition.start();
                    setIsListening(true);
                  } catch { addCommandResult("Speech recognition not available", "error"); }
                }
              }}
              className={cn(
                "p-2.5 rounded-xl border transition-colors",
                isListening
                  ? "text-red-400 border-red-400/50 bg-red-400/10 animate-pulse"
                  : "text-pplx-muted hover:text-pplx-text hover:bg-white/5 border-pplx-border"
              )}
              title={isListening ? "Stop listening" : "Voice input"}
            >
              {isListening ? <MicOff size={14} /> : <Mic size={14} />}
            </button>

            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (showChatCommands) {
                  if (e.key === "ArrowDown") { e.preventDefault(); setChatCmdHighlight(i => Math.min(i + 1, filteredChatCmds.length - 1)); return; }
                  if (e.key === "ArrowUp") { e.preventDefault(); setChatCmdHighlight(i => Math.max(i - 1, 0)); return; }
                  if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
                    e.preventDefault();
                    const cmd = filteredChatCmds[chatCmdHighlight];
                    if (cmd) { setInput(cmd.command + " "); setShowChatCommands(false); }
                    return;
                  }
                  if (e.key === "Escape") { setShowChatCommands(false); return; }
                }
              }}
              placeholder={
                task.status === "waiting_for_input"
                  ? "Provide your response..."
                  : "Continue with a follow-up or type / for commands..."
              }
              disabled={isSubmitting}
              className="flex-1 bg-pplx-card border border-pplx-border rounded-xl px-4 py-2.5 text-sm text-pplx-text placeholder:text-pplx-muted outline-none focus:border-pplx-accent/50 transition-colors"
            />
            <button
              type="submit"
              disabled={!input.trim() || isSubmitting}
              className={cn(
                "px-4 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center gap-2",
                input.trim() && !isSubmitting
                  ? "bg-pplx-accent hover:bg-pplx-accent-hover text-white"
                  : "bg-pplx-border text-pplx-muted cursor-not-allowed"
              )}
            >
              {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <ArrowUp size={14} />}
            </button>

            {/* TTS: Read last response aloud */}
            {task.messages.filter(m => m.role === "assistant").length > 0 && (
              <button
                type="button"
                onClick={async () => {
                  if (isSpeaking) {
                    window.speechSynthesis?.cancel();
                    setIsSpeaking(false);
                    return;
                  }
                  const lastAsstMsg = task.messages.filter(m => m.role === "assistant").at(-1);
                  if (!lastAsstMsg) return;
                  // Try server TTS first, fallback to browser
                  try {
                    const res = await fetch("/api/voice/tts", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ text: lastAsstMsg.content.slice(0, 2000) }),
                    });
                    if (res.ok) {
                      const blob = await res.blob();
                      const url = URL.createObjectURL(blob);
                      const audio = new Audio(url);
                      setIsSpeaking(true);
                      audio.onended = () => { setIsSpeaking(false); URL.revokeObjectURL(url); };
                      audio.play();
                      return;
                    }
                  } catch { /* fall through */ }
                  // Browser TTS fallback
                  if (window.speechSynthesis) {
                    const utterance = new SpeechSynthesisUtterance(lastAsstMsg.content.slice(0, 1000));
                    setIsSpeaking(true);
                    utterance.onend = () => setIsSpeaking(false);
                    window.speechSynthesis.speak(utterance);
                  }
                }}
                className={cn(
                  "p-2.5 rounded-xl border transition-colors",
                  isSpeaking
                    ? "text-pplx-accent border-pplx-accent/50 bg-pplx-accent/10"
                    : "text-pplx-muted hover:text-pplx-text hover:bg-white/5 border-pplx-border"
                )}
                title={isSpeaking ? "Stop speaking" : "Read aloud"}
              >
                <Volume2 size={14} />
              </button>
            )}
          </form>
        </div>
      )}
    </div>
  );
}

// ─── Step Card ────────────────────────────────────────────────────────────────

function StepCard({
  step,
  index,
  expanded,
  onToggle,
  taskId,
  taskStatus,
  pendingApprovals,
  onApprove,
  onDeny,
}: {
  step: AgentStep;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  taskId: string;
  taskStatus?: string;
  pendingApprovals?: Array<{id: string}>;
  onApprove?: (approvalId: string) => void;
  onDeny?: (approvalId: string) => void;
}) {
  const isApprovalStep = step.title === "⚠️ Approval Required" || step.title === "✅ Approved" || step.title === "❌ Denied";
  // Show buttons only if it's a pending approval step that hasn't been acted on yet
  const isInPendingList = pendingApprovals?.some(a => a.id === step.id) ?? false;
  const isPendingApproval = isApprovalStep && step.status === "running" && isInPendingList;
  const wasApproved = isApprovalStep && step.title === "✅ Approved";
  const wasDenied = isApprovalStep && step.title === "❌ Denied";
  const Icon = getStepIcon(step.type);
  const hasDetails =
    (step.content && step.content.length > 100) ||
    step.tool_result ||
    step.tool_input;

  return (
    <div
      className={cn(
        "rounded-xl border transition-colors agent-step",
        step.status === "running"
          ? "border-pplx-accent/30 bg-pplx-accent/5"
          : step.status === "failed"
          ? "border-red-400/30 bg-red-400/5"
          : "border-pplx-border bg-pplx-card"
      )}
    >
      <div
        role={hasDetails ? "button" : undefined}
        tabIndex={hasDetails ? 0 : undefined}
        onClick={hasDetails ? onToggle : undefined}
        onKeyDown={hasDetails ? (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle?.(); } } : undefined}
        className={cn("w-full flex items-start gap-3 p-3 text-left", hasDetails && "cursor-pointer")}
      >
        {/* Step number + icon */}
        <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
          <span className="text-[10px] text-pplx-muted w-5 text-right">{index + 1}</span>
          <div
            className={cn(
              "w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0",
              getStepIconBg(step.type, step.status)
            )}
          >
            {step.status === "running" ? (
              <Loader2 size={12} className="animate-spin text-pplx-accent" />
            ) : step.status === "failed" ? (
              <AlertCircle size={12} className="text-red-400" />
            ) : (
              <Icon size={12} className={getStepIconColor(step.type)} />
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm text-pplx-text font-medium truncate">{step.title}</p>
            {step.duration_ms && (
              <span className="text-xs text-pplx-muted flex-shrink-0">
                {formatDuration(step.duration_ms)}
              </span>
            )}
          </div>
          {!expanded && step.tool_result && (
            <p className="text-xs text-pplx-muted mt-0.5 line-clamp-1">
              {step.tool_result.slice(0, 100)}
            </p>
          )}
          {/* Approval buttons */}
          {isPendingApproval && (
            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onApprove?.(step.id); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/15 text-green-400 hover:bg-green-500/25 text-xs font-medium transition-colors border border-green-500/20"
              >
                <CheckCircle2 size={12} />
                Approve
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDeny?.(step.id); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-400/15 text-red-400 hover:bg-red-400/25 text-xs font-medium transition-colors border border-red-400/20"
              >
                <AlertCircle size={12} />
                Deny
              </button>
            </div>
          )}
          {/* Resolved approval state */}
          {wasApproved && (
            <div className="flex items-center gap-1.5 mt-2">
              <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-green-500/10 text-green-400 text-xs font-medium border border-green-500/15">
                <CheckCircle2 size={11} />
                Approved
              </span>
            </div>
          )}
          {wasDenied && (
            <div className="flex items-center gap-1.5 mt-2">
              <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-400/10 text-red-400 text-xs font-medium border border-red-400/15">
                <AlertCircle size={11} />
                Denied
              </span>
            </div>
          )}
        </div>

        {/* Expand chevron */}
        {hasDetails && (
          <div className="flex-shrink-0 mt-0.5">
            {expanded ? (
              <ChevronDown size={13} className="text-pplx-muted" />
            ) : (
              <ChevronRight size={13} className="text-pplx-muted" />
            )}
          </div>
        )}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-pplx-border/50 mt-0.5 pt-2">
          {step.content && step.type === "reasoning" && (
            <div className="mb-2">
              <p className="text-xs text-pplx-muted font-medium mb-1">Reasoning</p>
              <div className="prose text-xs">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {step.content}
                </ReactMarkdown>
              </div>
            </div>
          )}
          {step.tool_input && (
            <div className="mb-2">
              <p className="text-xs text-pplx-muted font-medium mb-1">Input</p>
              <pre className="text-xs bg-pplx-bg rounded-lg p-2.5 overflow-x-auto text-pplx-text border border-pplx-border font-mono leading-relaxed">
                <code dangerouslySetInnerHTML={{
                  __html: highlightCode(
                    typeof step.tool_input === "string"
                      ? step.tool_input
                      : JSON.stringify(step.tool_input, null, 2)
                  )
                }} />
              </pre>
            </div>
          )}
          {step.tool_result && (
            <div>
              <p className="text-xs text-pplx-muted font-medium mb-1">Result</p>
              {step.tool_result.length > 500 ? (
                <details className="group/result">
                  <summary className="text-xs text-pplx-muted cursor-pointer hover:text-pplx-text mb-1 select-none">
                    {step.tool_result.length > 5000 ? `Show result (${Math.round(step.tool_result.length / 1000)}KB)` : "Show full result"}
                  </summary>
                  <pre className="text-xs bg-pplx-bg rounded-lg p-2.5 overflow-x-auto text-pplx-text border border-pplx-border whitespace-pre-wrap max-h-96 overflow-y-auto font-mono leading-relaxed">
                    <code dangerouslySetInnerHTML={{
                      __html: highlightCode(
                        step.tool_result.slice(0, 8000) +
                        (step.tool_result.length > 8000 ? "\n... (truncated)" : "")
                      )
                    }} />
                  </pre>
                </details>
              ) : (
                <pre className="text-xs bg-pplx-bg rounded-lg p-2.5 overflow-x-auto text-pplx-text border border-pplx-border whitespace-pre-wrap max-h-60 font-mono leading-relaxed">
                  <code dangerouslySetInnerHTML={{
                    __html: highlightCode(step.tool_result)
                  }} />
                </pre>
              )}
              {/* Inline image preview for results containing image paths */}
              {step.tool_result.match(/\.(png|jpg|jpeg|gif|webp|svg)$/im) && step.tool_name && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {step.tool_result.match(/[\w\-./]+\.(png|jpg|jpeg|gif|webp|svg)/gi)?.slice(0, 4).map((imgPath, i) => {
                    const filename = imgPath.split("/").pop() || imgPath;
                    return (
                      <div key={i} className="relative rounded-lg overflow-hidden border border-pplx-border bg-pplx-bg">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/files/${taskId}/${filename}`}
                          alt={filename}
                          className="max-h-32 max-w-48 object-contain"
                          loading="lazy"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── File Card ─────────────────────────────────────────────────────────────────

function FileCard({ file, taskId, onPreview }: { file: TaskFile; taskId: string; onPreview?: (f: TaskFile) => void }) {
  const { addToShelf, sendToStudio } = useHandoff();
  const isPreviewable = file.mime_type === "text/html" || file.mime_type.startsWith("image/") ||
    file.mime_type.startsWith("video/") || file.mime_type.startsWith("audio/") ||
    file.mime_type === "application/pdf" || file.name.endsWith(".md") ||
    file.name.endsWith(".txt") || file.name.endsWith(".csv");
  
  return (
    <div className="flex items-center gap-3 p-3.5 rounded-xl border border-pplx-border bg-pplx-card hover:border-pplx-muted/50 transition-colors group">
      {/* Inline image thumbnail */}
      {file.mime_type.startsWith("image/") ? (
        <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-pplx-bg border border-pplx-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/files/${taskId}/${file.name}`}
            alt={file.name}
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <span className="text-xl">{getMimeIcon(file.mime_type)}</span>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-pplx-text font-medium truncate">{file.name}</p>
        <p className="text-xs text-pplx-muted">
          {formatBytes(file.size)} · {file.mime_type} · {formatRelativeTime(file.created_at)}
        </p>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {isPreviewable && onPreview && (
          <button
            onClick={() => onPreview(file)}
            className="p-1.5 rounded-lg text-pplx-muted hover:text-pplx-accent hover:bg-pplx-accent/10 transition-colors"
            title="Preview"
          >
            <Eye size={13} />
          </button>
        )}
        <a
          href={`/api/files/${taskId}/${file.name}`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 rounded-lg text-pplx-muted hover:text-pplx-text hover:bg-white/5 transition-colors"
        >
          <ExternalLink size={13} />
        </a>
        <a
          href={`/api/files/${taskId}/${file.name}?download=1`}
          className="p-1.5 rounded-lg text-pplx-muted hover:text-pplx-text hover:bg-white/5 transition-colors"
        >
          <Download size={13} />
        </a>
        {/* Open in Studio — handoff */}
        {(() => {
          const fileUrl = file.preview_url || `/api/files/${taskId}/${file.name}`;
          const cat = inferMimeCategory(file.mime_type, file.name);
          const dummy = makeHandoffItem({ url: fileUrl, name: file.name, mimeType: file.mime_type, mimeCategory: cat, source: "agent" });
          const studios = studiosForItem(dummy);
          return studios.map((sid: StudioId) => (
            <button
              key={sid}
              onClick={() => {
                const item = addToShelf({ url: fileUrl, name: file.name, mimeType: file.mime_type, mimeCategory: cat, source: "agent" });
                sendToStudio(item, sid);
              }}
              className="p-1.5 rounded-lg text-pplx-muted hover:text-pplx-accent hover:bg-pplx-accent/10 transition-colors"
              title={`Open in ${STUDIO_MAP[sid].label}`}
            >
              <ArrowRight size={13} />
            </button>
          ));
        })()}
      </div>
    </div>
  );
}

// ─── Text File Preview ────────────────────────────────────────────────────────

function TextFilePreview({ fileUrl, fileName }: { fileUrl: string; fileName: string }) {
  const [content, setContent] = useState<string | null>(null);
  useEffect(() => {
    fetch(fileUrl)
      .then((r) => r.text())
      .then((t) => setContent(t))
      .catch(() => setContent("Failed to load file content"));
  }, [fileUrl]);

  if (content === null) {
    return (
      <div className="flex items-center justify-center h-full min-h-[300px] bg-pplx-bg">
        <Loader2 className="animate-spin text-pplx-muted" size={20} />
      </div>
    );
  }

  if (fileName.endsWith(".md")) {
    return (
      <div className="p-6 bg-pplx-bg h-full min-h-[400px] overflow-auto prose prose-invert prose-sm max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    );
  }

  return (
    <pre className="p-4 bg-pplx-bg h-full min-h-[400px] overflow-auto text-sm font-mono text-pplx-text whitespace-pre-wrap leading-relaxed">
      {content}
    </pre>
  );
}

// ─── Code Syntax Highlighter ──────────────────────────────────────────────────

function highlightCode(code: string): string {
  // Escape HTML first
  let escaped = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Apply syntax highlighting patterns
  escaped = escaped
    // Strings (double and single quoted)
    .replace(/(["'])(?:(?!\1|\\).|\\.)*?\1/g, '<span style="color:#9ecbff">$&</span>')
    // Comments (// and #)
    .replace(/(\/\/.*?$|#.*?$)/gm, '<span style="color:#6a737d">$&</span>')
    // Numbers
    .replace(/\b(\d+\.?\d*)\b/g, '<span style="color:#79b8ff">$1</span>')
    // Keywords
    .replace(
      /\b(const|let|var|function|return|if|else|for|while|import|export|from|class|new|this|true|false|null|undefined|async|await|try|catch|throw|def|print|in|not|and|or|None|True|False|self)\b/g,
      '<span style="color:#f97583">$1</span>'
    )
    // JSON keys (word before colon)
    .replace(/(&quot;[\w\s]+&quot;)(\s*:)/g, '<span style="color:#b392f0">$1</span>$2');

  return escaped;
}

// ─── Status Dot ───────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  return (
    <div
      className={cn(
        "w-2 h-2 rounded-full flex-shrink-0",
        status === "running"
          ? "bg-pplx-accent animate-pulse"
          : status === "completed"
          ? "bg-green-400"
          : status === "failed"
          ? "bg-red-400"
          : status === "waiting_for_input"
          ? "bg-yellow-400"
          : "bg-pplx-muted"
      )}
    />
  );
}

// ─── Icon helpers ─────────────────────────────────────────────────────────────

function getStepIcon(type: AgentStep["type"]) {
  switch (type) {
    case "search": return Globe;
    case "code_execution": return Code2;
    case "file_operation": return FileText;
    case "connector_call": return Plug;
    case "sub_agent": return Bot;
    case "output": return CheckCircle2;
    case "waiting": return Clock;
    case "error": return AlertCircle;
    default: return Terminal;
  }
}

function getStepIconBg(type: AgentStep["type"], status: AgentStep["status"]) {
  if (status === "running") return "bg-pplx-accent/15";
  if (status === "failed") return "bg-red-400/15";
  switch (type) {
    case "search": return "bg-blue-500/15";
    case "code_execution": return "bg-purple-500/15";
    case "file_operation": return "bg-yellow-500/15";
    case "connector_call": return "bg-orange-500/15";
    case "sub_agent": return "bg-pink-500/15";
    case "output": return "bg-green-500/15";
    default: return "bg-pplx-muted/15";
  }
}

function getStepIconColor(type: AgentStep["type"]) {
  switch (type) {
    case "search": return "text-blue-400";
    case "code_execution": return "text-purple-400";
    case "file_operation": return "text-yellow-400";
    case "connector_call": return "text-orange-400";
    case "sub_agent": return "text-pink-400";
    case "output": return "text-green-400";
    default: return "text-pplx-muted";
  }
}

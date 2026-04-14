"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  X, Sparkles, Wand2, FileText, Expand, CheckCheck, Languages,
  Lightbulb, BarChart3, Send, Loader2, Copy, ArrowUp, Replace,
  MessageSquare, PenLine, ListChecks, BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AiAssistantProps {
  docId: string;
  docType: "document" | "spreadsheet";
  onClose: () => void;
  onInsert: (text: string) => void;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AiAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  action: string;
  description: string;
}

export function AiAssistant({ docId, docType, onClose, onInsert }: AiAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const [copied, setCopied] = useState<number | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Track text selection
  useEffect(() => {
    const handler = () => {
      const sel = window.getSelection();
      if (sel && sel.toString().trim()) setSelectedText(sel.toString().trim());
    };
    document.addEventListener("mouseup", handler);
    return () => document.removeEventListener("mouseup", handler);
  }, []);

  // Handle bubble menu actions from the editor
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.action && detail?.text) {
        setSelectedText(detail.text);
        runAction(detail.action, undefined, detail.text);
      }
    };
    window.addEventListener("ai-bubble-action", handler);
    return () => window.removeEventListener("ai-bubble-action", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const docActions: AiAction[] = [
    { id: "improve", label: "Improve Writing", icon: <Wand2 size={14} />, action: "improve", description: "Enhance clarity and tone" },
    { id: "fix-grammar", label: "Fix Grammar", icon: <CheckCheck size={14} />, action: "fix-grammar", description: "Correct grammar & spelling" },
    { id: "summarize", label: "Summarize", icon: <FileText size={14} />, action: "summarize", description: "Concise summary" },
    { id: "expand", label: "Expand", icon: <Expand size={14} />, action: "expand", description: "Add depth & detail" },
    { id: "translate", label: "Translate", icon: <Languages size={14} />, action: "translate", description: "To another language" },
    { id: "brainstorm", label: "Brainstorm", icon: <Lightbulb size={14} />, action: "brainstorm", description: "Ideas & outlines" },
    { id: "outline", label: "Outline", icon: <ListChecks size={14} />, action: "custom", description: "Draft a structure" },
    { id: "continue", label: "Continue Writing", icon: <PenLine size={14} />, action: "custom", description: "Keep writing from here" },
  ];

  const sheetActions: AiAction[] = [
    { id: "analyze", label: "Analyze Data", icon: <BarChart3 size={14} />, action: "analyze", description: "Data insights" },
    { id: "formulas", label: "Suggest Formulas", icon: <Lightbulb size={14} />, action: "custom", description: "Formula help" },
    { id: "summarize", label: "Summarize", icon: <FileText size={14} />, action: "summarize", description: "Data summary" },
    { id: "explain", label: "Explain Data", icon: <BookOpen size={14} />, action: "custom", description: "What does this mean?" },
  ];

  const actions = docType === "document" ? docActions : sheetActions;

  const streamResponse = useCallback(async (res: Response): Promise<string> => {
    const reader = res.body?.getReader();
    if (!reader) throw new Error("No stream");
    const decoder = new TextDecoder();
    let buffer = "";
    let accumulated = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") break;
        try {
          const parsed = JSON.parse(data);
          if (parsed.text) {
            accumulated += parsed.text;
            setMessages((prev) => {
              const copy = [...prev];
              if (copy.length && copy[copy.length - 1].role === "assistant") {
                copy[copy.length - 1] = { role: "assistant", content: accumulated };
              }
              return copy;
            });
          }
          if (parsed.error) throw new Error(parsed.error);
        } catch (e) {
          if (e instanceof Error && e.message !== "Unexpected end of JSON input") throw e;
        }
      }
    }
    return accumulated;
  }, []);

  const runAction = useCallback(async (action: string, prompt?: string, overrideSelection?: string) => {
    const sel = overrideSelection || selectedText;
    const userMsg = prompt || (action === "outline" ? "Create an outline for this document" : action === "continue" ? "Continue writing from where the document leaves off" : action);
    setMessages((prev) => [...prev, { role: "user", content: userMsg }, { role: "assistant", content: "" }]);
    setLoading(true);
    setLastAction(action);

    try {
      const res = await fetch(`/api/documents/${docId}/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, selection: sel, prompt: prompt || "" }),
      });

      if (!res.ok) {
        const err = await res.json();
        setMessages((prev) => { const copy = [...prev]; copy[copy.length - 1] = { role: "assistant", content: `Error: ${err.error || "Failed"}` }; return copy; });
        setLoading(false);
        return;
      }
      await streamResponse(res);
    } catch (err) {
      setMessages((prev) => { const copy = [...prev]; copy[copy.length - 1] = { role: "assistant", content: `Error: ${err instanceof Error ? err.message : "Failed"}` }; return copy; });
    } finally {
      setLoading(false);
    }
  }, [docId, selectedText, streamResponse]);

  const handleSubmit = useCallback(() => {
    if (!customPrompt.trim()) return;
    runAction("custom", customPrompt);
    setCustomPrompt("");
  }, [customPrompt, runAction]);

  const copyMessage = useCallback((idx: number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(idx);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  }, [handleSubmit]);

  return (
    <div className="w-80 border-l border-pplx-border bg-pplx-bg flex flex-col shrink-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-pplx-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-pplx-accent" />
          <span className="text-sm font-medium text-pplx-text">AI Assistant</span>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button onClick={() => setMessages([])} className="p-1 rounded-lg hover:bg-pplx-card transition-colors text-pplx-muted text-xs" title="Clear chat">
              <MessageSquare size={14} />
            </button>
          )}
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-pplx-card transition-colors text-pplx-muted">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Selected text */}
      {selectedText && (
        <div className="px-4 py-2 bg-pplx-accent/5 border-b border-pplx-border shrink-0">
          <p className="text-xs text-pplx-muted mb-1">Selected text:</p>
          <p className="text-xs text-pplx-text line-clamp-2 italic">&ldquo;{selectedText}&rdquo;</p>
        </div>
      )}

      {/* Quick Actions — compact */}
      <div className="p-3 border-b border-pplx-border shrink-0">
        <div className="flex flex-wrap gap-1.5">
          {actions.map((a) => (
            <button
              key={a.id}
              onClick={() => runAction(a.action, a.id === "outline" ? "Create an outline for this document" : a.id === "continue" ? "Continue writing from where the document leaves off" : undefined)}
              disabled={loading}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all",
                lastAction === a.action && messages.length > 0
                  ? "bg-pplx-accent/15 text-pplx-accent border border-pplx-accent/30"
                  : "bg-pplx-card border border-pplx-border text-pplx-muted hover:text-pplx-text hover:border-pplx-accent/30",
                loading && "opacity-50"
              )}
              title={a.description}
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && !loading && (
          <div className="text-center py-8 text-pplx-muted">
            <Sparkles size={28} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">AI Writing Assistant</p>
            <p className="text-xs mt-1.5 leading-relaxed">
              Select text and use an action, or<br />type a message below. Type <kbd className="px-1 py-0.5 rounded bg-pplx-card text-[10px]">/</kbd> in the editor for quick commands.
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={cn("rounded-xl px-3 py-2.5", msg.role === "user" ? "bg-pplx-accent/10 ml-6" : "bg-pplx-card border border-pplx-border")}>
            {msg.role === "assistant" && (
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] text-pplx-accent font-medium uppercase tracking-wider flex items-center gap-1">
                  <Sparkles size={10} /> AI
                </span>
                {msg.content && !loading && (
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => copyMessage(i, msg.content)} className="p-0.5 rounded hover:bg-pplx-border/50 text-pplx-muted hover:text-pplx-text transition-colors" title="Copy">
                      {copied === i ? <CheckCheck size={12} className="text-green-400" /> : <Copy size={12} />}
                    </button>
                    <button onClick={() => onInsert(msg.content)} className="p-0.5 rounded hover:bg-pplx-border/50 text-pplx-muted hover:text-pplx-text transition-colors" title="Replace selection">
                      <Replace size={12} />
                    </button>
                    <button onClick={() => onInsert(msg.content)} className="px-1.5 py-0.5 rounded bg-pplx-accent text-white text-[10px] font-medium hover:bg-pplx-accent-hover transition-colors" title="Insert at cursor">
                      Insert
                    </button>
                  </div>
                )}
              </div>
            )}
            <div className={cn("text-sm leading-relaxed whitespace-pre-wrap", msg.role === "user" ? "text-pplx-text" : "text-pplx-text")}>
              {msg.content || (loading && i === messages.length - 1 ? <span className="flex items-center gap-2 text-pplx-muted"><Loader2 size={14} className="animate-spin" /> Thinking...</span> : "")}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-pplx-border shrink-0">
        <div className="relative">
          <textarea
            ref={inputRef}
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask AI anything about your document..."
            rows={2}
            className="w-full px-3 py-2 pr-10 rounded-xl bg-pplx-card border border-pplx-border text-sm text-pplx-text placeholder:text-pplx-muted focus:outline-none focus:border-pplx-accent resize-none"
            disabled={loading}
          />
          <button
            onClick={handleSubmit}
            disabled={loading || !customPrompt.trim()}
            className="absolute right-2 bottom-2 p-1.5 rounded-lg bg-pplx-accent text-white hover:bg-pplx-accent-hover transition-colors disabled:opacity-30"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <ArrowUp size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}
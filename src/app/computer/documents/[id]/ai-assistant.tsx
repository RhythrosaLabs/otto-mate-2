"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  X,
  Sparkles,
  Wand2,
  FileText,
  Expand,
  CheckCheck,
  Languages,
  Lightbulb,
  BarChart3,
  Send,
  Loader2,
  Copy,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AiAssistantProps {
  docId: string;
  docType: "document" | "spreadsheet";
  onClose: () => void;
  onInsert: (text: string) => void;
}

interface AiAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  action: string;
  description: string;
}

export function AiAssistant({ docId, docType, onClose, onInsert }: AiAssistantProps) {
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const resultRef = useRef<HTMLDivElement>(null);

  // Track text selection in the editor
  useEffect(() => {
    const handler = () => {
      const sel = window.getSelection();
      if (sel && sel.toString().trim()) {
        setSelectedText(sel.toString().trim());
      }
    };
    document.addEventListener("mouseup", handler);
    return () => document.removeEventListener("mouseup", handler);
  }, []);

  const docActions: AiAction[] = [
    { id: "improve", label: "Improve Writing", icon: <Wand2 size={15} />, action: "improve", description: "Enhance clarity and tone" },
    { id: "fix-grammar", label: "Fix Grammar", icon: <CheckCheck size={15} />, action: "fix-grammar", description: "Correct spelling & grammar" },
    { id: "summarize", label: "Summarize", icon: <FileText size={15} />, action: "summarize", description: "Create a concise summary" },
    { id: "expand", label: "Expand", icon: <Expand size={15} />, action: "expand", description: "Add more detail & depth" },
    { id: "translate", label: "Translate", icon: <Languages size={15} />, action: "translate", description: "Translate to another language" },
    { id: "brainstorm", label: "Brainstorm", icon: <Lightbulb size={15} />, action: "brainstorm", description: "Generate ideas & outlines" },
  ];

  const sheetActions: AiAction[] = [
    { id: "analyze", label: "Analyze Data", icon: <BarChart3 size={15} />, action: "analyze", description: "Get insights from your data" },
    { id: "brainstorm", label: "Suggest Formulas", icon: <Lightbulb size={15} />, action: "custom", description: "Get formula suggestions" },
    { id: "summarize", label: "Summarize Data", icon: <FileText size={15} />, action: "summarize", description: "Summarize spreadsheet contents" },
  ];

  const actions = docType === "document" ? docActions : sheetActions;

  const runAction = useCallback(async (action: string, prompt?: string) => {
    setResult("");
    setLoading(true);

    try {
      const res = await fetch(`/api/documents/${docId}/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          selection: selectedText,
          prompt: prompt || "",
          language: "Spanish", // default for translate
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setResult(`Error: ${err.error || "Failed to get AI response"}`);
        setLoading(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setResult("Error: Failed to stream response");
        setLoading(false);
        return;
      }

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
              setResult(accumulated);
            }
            if (parsed.error) {
              setResult(`Error: ${parsed.error}`);
            }
          } catch {
            // skip malformed JSON chunks
          }
        }
      }
    } catch (err) {
      setResult(`Error: ${err instanceof Error ? err.message : "Request failed"}`);
    } finally {
      setLoading(false);
    }
  }, [docId, selectedText]);

  const handleCustomSubmit = useCallback(() => {
    if (!customPrompt.trim()) return;
    runAction("custom", customPrompt);
    setCustomPrompt("");
  }, [customPrompt, runAction]);

  const copyResult = useCallback(() => {
    navigator.clipboard.writeText(result);
  }, [result]);

  return (
    <div className="w-80 border-l border-pplx-border bg-pplx-bg flex flex-col shrink-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-pplx-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-pplx-accent" />
          <span className="text-sm font-medium text-pplx-text">AI Assistant</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-pplx-card transition-colors text-pplx-muted"
        >
          <X size={16} />
        </button>
      </div>

      {/* Selected text indicator */}
      {selectedText && (
        <div className="px-4 py-2 bg-pplx-accent/5 border-b border-pplx-border">
          <p className="text-xs text-pplx-muted mb-1">Selected text:</p>
          <p className="text-xs text-pplx-text line-clamp-2 italic">&ldquo;{selectedText}&rdquo;</p>
        </div>
      )}

      {/* Quick Actions */}
      <div className="p-4 border-b border-pplx-border">
        <p className="text-xs text-pplx-muted mb-3 font-medium uppercase tracking-wider">Quick Actions</p>
        <div className="grid grid-cols-2 gap-2">
          {actions.map((a) => (
            <button
              key={a.id}
              onClick={() => runAction(a.action)}
              disabled={loading}
              className="flex flex-col items-start gap-1 p-2.5 rounded-xl bg-pplx-card border border-pplx-border hover:border-pplx-accent/50 transition-all text-left disabled:opacity-50"
            >
              <div className="flex items-center gap-1.5 text-pplx-accent">
                {a.icon}
                <span className="text-xs font-medium">{a.label}</span>
              </div>
              <span className="text-[10px] text-pplx-muted leading-tight">{a.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Custom Prompt */}
      <div className="px-4 py-3 border-b border-pplx-border">
        <div className="flex gap-2">
          <input
            type="text"
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCustomSubmit(); }}
            placeholder="Ask AI anything..."
            className="flex-1 px-3 py-2 rounded-xl bg-pplx-card border border-pplx-border text-sm text-pplx-text placeholder:text-pplx-muted focus:outline-none focus:border-pplx-accent"
            disabled={loading}
          />
          <button
            onClick={handleCustomSubmit}
            disabled={loading || !customPrompt.trim()}
            className="p-2 rounded-xl bg-pplx-accent text-white hover:bg-pplx-accent-hover transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>

      {/* Result */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading && !result && (
          <div className="flex items-center justify-center py-12 text-pplx-muted">
            <Loader2 size={20} className="animate-spin mr-2" />
            <span className="text-sm">Generating...</span>
          </div>
        )}
        {result && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-pplx-muted font-medium">Result</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={copyResult}
                  className="p-1 rounded-md hover:bg-pplx-card text-pplx-muted hover:text-pplx-text transition-colors"
                  title="Copy"
                >
                  <Copy size={13} />
                </button>
                <button
                  onClick={() => onInsert(result)}
                  className="px-2 py-1 rounded-md bg-pplx-accent text-white text-xs hover:bg-pplx-accent-hover transition-colors"
                  title="Insert into document"
                >
                  Insert
                </button>
              </div>
            </div>
            <div
              ref={resultRef}
              className="text-sm text-pplx-text leading-relaxed whitespace-pre-wrap bg-pplx-card border border-pplx-border rounded-xl p-3"
            >
              {result}
            </div>
          </div>
        )}
        {!loading && !result && (
          <div className="text-center py-12 text-pplx-muted">
            <Sparkles size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Select text and use an action,<br />or ask AI anything above</p>
          </div>
        )}
      </div>
    </div>
  );
}

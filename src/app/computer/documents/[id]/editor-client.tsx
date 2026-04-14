"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, FileText, Table2, Sparkles, Maximize, Minimize,
  Download, FileCode, FileType, Hash, Clock, Type as TypeIcon,
  ChevronDown,
} from "lucide-react";
import type { DocumentRow } from "@/lib/db";
import { RichTextEditor } from "./rich-text-editor";
import { SpreadsheetEditor } from "./spreadsheet-editor";
import { AiAssistant } from "./ai-assistant";
import { cn } from "@/lib/utils";

export function DocumentEditorClient({ initialDoc }: { initialDoc: DocumentRow }) {
  const router = useRouter();
  const [doc, setDoc] = useState(initialDoc);
  const [title, setTitle] = useState(doc.title);
  const [showAi, setShowAi] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [wordStats, setWordStats] = useState({ words: 0, chars: 0, readingTime: 0 });
  const [showExport, setShowExport] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  // Close export dropdown on outside click
  useEffect(() => {
    if (!showExport) return;
    function handleClick(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setShowExport(false);
      }
    }
    document.addEventListener("pointerdown", handleClick);
    return () => document.removeEventListener("pointerdown", handleClick);
  }, [showExport]);

  const saveTitle = useCallback(async (newTitle: string) => {
    setTitle(newTitle);
    setSaving(true);
    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });
      if (!res.ok) throw new Error("Save failed");
      setLastSaved(new Date().toLocaleTimeString());
    } catch {
      setLastSaved("save failed!");
    } finally {
      setSaving(false);
    }
  }, [doc.id]);

  const saveContent = useCallback(async (content: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Save failed");
      setDoc((prev) => ({ ...prev, content }));
      setLastSaved(new Date().toLocaleTimeString());
    } catch {
      setLastSaved("save failed!");
    } finally {
      setSaving(false);
    }
  }, [doc.id]);

  const triggerExport = useCallback((format: string) => {
    window.dispatchEvent(new CustomEvent("doc-export", { detail: { format } }));
    setShowExport(false);
  }, []);

  return (
    <div className={cn("h-screen flex flex-col overflow-hidden", focusMode && "bg-pplx-bg")}>
      {/* Top Bar */}
      <div className={cn(
        "px-4 py-2.5 border-b border-pplx-border flex items-center gap-3 bg-pplx-bg shrink-0 transition-opacity",
        focusMode && "opacity-0 hover:opacity-100"
      )}>
        <button
          onClick={() => router.push("/computer/documents")}
          className="p-2 rounded-lg hover:bg-pplx-card transition-colors text-pplx-muted hover:text-pplx-text"
        >
          <ArrowLeft size={18} />
        </button>

        <div className="flex items-center gap-2">
          {doc.type === "document" ? (
            <FileText size={18} className="text-blue-400" />
          ) : (
            <Table2 size={18} className="text-green-400" />
          )}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => { if (title !== doc.title) saveTitle(title); }}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            className="bg-transparent text-pplx-text font-medium text-base outline-none border-none focus:ring-0 min-w-[200px]"
            placeholder="Untitled"
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Word count stats (document only) */}
          {doc.type === "document" && (
            <div className="hidden sm:flex items-center gap-3 text-xs text-pplx-muted mr-2">
              <span className="flex items-center gap-1" title="Words"><Hash size={12} />{wordStats.words.toLocaleString()}</span>
              <span className="flex items-center gap-1" title="Characters"><TypeIcon size={12} />{wordStats.chars.toLocaleString()}</span>
              <span className="flex items-center gap-1" title="Reading time"><Clock size={12} />{wordStats.readingTime}m read</span>
            </div>
          )}

          {/* Save status */}
          <span className="text-xs text-pplx-muted">
            {saving ? (
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" /> Saving…</span>
            ) : lastSaved ? (
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-400" /> Saved {lastSaved}</span>
            ) : ""}
          </span>

          {/* Export */}
          {doc.type === "document" && (
            <div className="relative" ref={exportRef}>
              <button
                onClick={() => setShowExport(!showExport)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-pplx-card border border-pplx-border text-pplx-muted hover:text-pplx-text transition-colors"
              >
                <Download size={14} /> Export <ChevronDown size={12} />
              </button>
              {showExport && (
                <div className="absolute right-0 top-9 z-20 bg-pplx-card border border-pplx-border rounded-xl shadow-xl py-1 min-w-[160px]">
                  <button onClick={() => triggerExport("markdown")} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-pplx-text hover:bg-pplx-border/30 transition-colors">
                    <FileCode size={14} /> Markdown
                  </button>
                  <button onClick={() => triggerExport("html")} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-pplx-text hover:bg-pplx-border/30 transition-colors">
                    <FileType size={14} /> HTML
                  </button>
                  <button onClick={() => triggerExport("text")} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-pplx-text hover:bg-pplx-border/30 transition-colors">
                    <FileText size={14} /> Plain Text
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Focus mode */}
          {doc.type === "document" && (
            <button
              onClick={() => setFocusMode(!focusMode)}
              className={cn(
                "p-1.5 rounded-lg transition-colors",
                focusMode ? "bg-pplx-accent text-white" : "text-pplx-muted hover:text-pplx-text hover:bg-pplx-card"
              )}
              title={focusMode ? "Exit focus mode" : "Focus mode"}
            >
              {focusMode ? <Minimize size={16} /> : <Maximize size={16} />}
            </button>
          )}

          {/* AI toggle */}
          <button
            onClick={() => setShowAi(!showAi)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              showAi
                ? "bg-pplx-accent text-white"
                : "bg-pplx-card border border-pplx-border text-pplx-muted hover:text-pplx-text"
            )}
          >
            <Sparkles size={14} /> AI
          </button>
        </div>
      </div>

      {/* Editor Area */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-hidden">
          {doc.type === "document" ? (
            <RichTextEditor
              content={doc.content}
              onSave={saveContent}
              onWordCountChange={setWordStats}
              focusMode={focusMode}
            />
          ) : (
            <SpreadsheetEditor content={doc.content} onSave={saveContent} />
          )}
        </div>

        {/* AI Sidebar */}
        {showAi && (
          <AiAssistant
            docId={doc.id}
            docType={doc.type}
            onClose={() => setShowAi(false)}
            onInsert={(text: string) => {
              const event = new CustomEvent("ai-insert", { detail: { text } });
              window.dispatchEvent(event);
            }}
          />
        )}
      </div>
    </div>
  );
}
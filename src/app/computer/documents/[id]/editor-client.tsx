"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText, Table2 } from "lucide-react";
import type { DocumentRow } from "@/lib/db";
import { RichTextEditor } from "./rich-text-editor";
import { SpreadsheetEditor } from "./spreadsheet-editor";
import { AiAssistant } from "./ai-assistant";

export function DocumentEditorClient({ initialDoc }: { initialDoc: DocumentRow }) {
  const router = useRouter();
  const [doc, setDoc] = useState(initialDoc);
  const [title, setTitle] = useState(doc.title);
  const [showAi, setShowAi] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  const saveTitle = useCallback(async (newTitle: string) => {
    setTitle(newTitle);
    setSaving(true);
    try {
      await fetch(`/api/documents/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });
      setLastSaved(new Date().toLocaleTimeString());
    } finally {
      setSaving(false);
    }
  }, [doc.id]);

  const saveContent = useCallback(async (content: string) => {
    setSaving(true);
    try {
      await fetch(`/api/documents/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      setDoc((prev) => ({ ...prev, content }));
      setLastSaved(new Date().toLocaleTimeString());
    } finally {
      setSaving(false);
    }
  }, [doc.id]);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Top Bar */}
      <div className="px-4 py-3 border-b border-pplx-border flex items-center gap-3 bg-pplx-bg shrink-0">
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
            onBlur={() => {
              if (title !== doc.title) saveTitle(title);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
            className="bg-transparent text-pplx-text font-medium text-base outline-none border-none focus:ring-0 min-w-[200px]"
            placeholder="Untitled"
          />
        </div>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-pplx-muted">
            {saving ? "Saving…" : lastSaved ? `Saved at ${lastSaved}` : ""}
          </span>
          <button
            onClick={() => setShowAi(!showAi)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              showAi
                ? "bg-pplx-accent text-white"
                : "bg-pplx-card border border-pplx-border text-pplx-muted hover:text-pplx-text"
            }`}
          >
            <span className="text-sm">✨</span> AI Assistant
          </button>
        </div>
      </div>

      {/* Editor Area */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-hidden">
          {doc.type === "document" ? (
            <RichTextEditor content={doc.content} onSave={saveContent} />
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
              // The editors expose a way to insert text
              const event = new CustomEvent("ai-insert", { detail: { text } });
              window.dispatchEvent(event);
            }}
          />
        )}
      </div>
    </div>
  );
}

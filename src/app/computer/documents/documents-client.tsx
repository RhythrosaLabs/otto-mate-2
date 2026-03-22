"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  FileText,
  Table2,
  Trash2,
  Loader2,
  Search,
  MoreVertical,
  Clock,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DocumentRow } from "@/lib/db";

type DocType = "all" | "document" | "spreadsheet";

export function DocumentsListClient({ initialDocs }: { initialDocs: DocumentRow[] }) {
  const router = useRouter();
  const [docs, setDocs] = useState<DocumentRow[]>(initialDocs);
  const [filter, setFilter] = useState<DocType>("all");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const filteredDocs = docs.filter((d) => {
    if (filter !== "all" && d.type !== filter) return false;
    if (search && !d.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleCreate = useCallback(async (type: "document" | "spreadsheet") => {
    setCreating(true);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: type === "document" ? "Untitled Document" : "Untitled Spreadsheet", type }),
      });
      if (res.ok) {
        const doc = await res.json();
        router.push(`/computer/documents/${doc.id}`);
      }
    } catch (err) {
      console.error("Failed to create document:", err);
    } finally {
      setCreating(false);
    }
  }, [router]);

  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      if (res.ok) {
        setDocs((prev) => prev.filter((d) => d.id !== id));
      }
    } catch (err) {
      console.error("Failed to delete document:", err);
    } finally {
      setDeletingId(null);
      setMenuOpenId(null);
    }
  }, []);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return d.toLocaleDateString();
  };

  const getPreview = (doc: DocumentRow) => {
    if (doc.type === "spreadsheet") {
      try {
        const data = JSON.parse(doc.content);
        const cellCount = Object.keys(data.cells || {}).length;
        return `${cellCount} cell${cellCount !== 1 ? "s" : ""}`;
      } catch {
        return "Empty spreadsheet";
      }
    }
    const text = doc.content.replace(/<[^>]+>/g, "").trim();
    if (!text) return "Empty document";
    return text.slice(0, 120) + (text.length > 120 ? "…" : "");
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-8 pt-8 pb-4 border-b border-pplx-border">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-pplx-text">Documents</h1>
            <p className="text-sm text-pplx-muted mt-1">
              Create and edit documents & spreadsheets with AI assistance
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleCreate("document")}
              disabled={creating}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-pplx-accent text-white hover:bg-pplx-accent-hover transition-colors text-sm font-medium disabled:opacity-50"
            >
              {creating ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
              New Document
            </button>
            <button
              onClick={() => handleCreate("spreadsheet")}
              disabled={creating}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-pplx-card border border-pplx-border text-pplx-text hover:bg-pplx-border/50 transition-colors text-sm font-medium disabled:opacity-50"
            >
              {creating ? <Loader2 size={16} className="animate-spin" /> : <Table2 size={16} />}
              New Spreadsheet
            </button>
          </div>
        </div>

        {/* Filter & Search */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-pplx-card border border-pplx-border rounded-xl p-1">
            {(["all", "document", "spreadsheet"] as DocType[]).map((t) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize",
                  filter === t
                    ? "bg-pplx-accent text-white"
                    : "text-pplx-muted hover:text-pplx-text"
                )}
              >
                {t === "all" ? "All" : t === "document" ? "Documents" : "Spreadsheets"}
              </button>
            ))}
          </div>
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-pplx-muted" />
            <input
              type="text"
              placeholder="Search documents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-pplx-card border border-pplx-border text-sm text-pplx-text placeholder:text-pplx-muted focus:outline-none focus:border-pplx-accent"
            />
          </div>
        </div>
      </div>

      {/* Document Grid */}
      <div className="flex-1 overflow-y-auto p-8">
        {filteredDocs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-pplx-muted">
            <FileText size={48} className="mb-4 opacity-30" />
            <p className="text-lg font-medium">No documents yet</p>
            <p className="text-sm mt-1">Create a document or spreadsheet to get started</p>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => handleCreate("document")}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-pplx-accent text-white hover:bg-pplx-accent-hover transition-colors text-sm"
              >
                <Plus size={16} /> New Document
              </button>
              <button
                onClick={() => handleCreate("spreadsheet")}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-pplx-card border border-pplx-border text-pplx-text hover:bg-pplx-border/50 transition-colors text-sm"
              >
                <Plus size={16} /> New Spreadsheet
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredDocs.map((doc) => (
              <div
                key={doc.id}
                className="group relative bg-pplx-card border border-pplx-border rounded-2xl p-5 hover:border-pplx-accent/50 transition-all cursor-pointer"
                onClick={() => router.push(`/computer/documents/${doc.id}`)}
              >
                {/* Type Icon */}
                <div className="flex items-start justify-between mb-3">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center",
                      doc.type === "document"
                        ? "bg-blue-500/20 text-blue-400"
                        : "bg-green-500/20 text-green-400"
                    )}
                  >
                    {doc.type === "document" ? <FileText size={20} /> : <Table2 size={20} />}
                  </div>
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenId(menuOpenId === doc.id ? null : doc.id);
                      }}
                      className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-pplx-border/50 transition-all text-pplx-muted"
                    >
                      <MoreVertical size={16} />
                    </button>
                    {menuOpenId === doc.id && (
                      <div className="absolute right-0 top-8 z-10 bg-pplx-card border border-pplx-border rounded-xl shadow-xl py-1 min-w-[140px]">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(doc.id);
                          }}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          {deletingId === doc.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Trash2 size={14} />
                          )}
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Title */}
                <h3 className="font-medium text-pplx-text truncate mb-1">{doc.title}</h3>

                {/* Preview */}
                <p className="text-xs text-pplx-muted line-clamp-2 mb-3 min-h-[2rem]">
                  {getPreview(doc)}
                </p>

                {/* Footer */}
                <div className="flex items-center gap-2 text-xs text-pplx-muted">
                  <Clock size={12} />
                  <span>{formatDate(doc.updated_at)}</span>
                  <span className="ml-auto flex items-center gap-1">
                    <Sparkles size={12} className="text-pplx-accent" />
                    AI
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

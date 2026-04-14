"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, FileText, Table2, Trash2, Loader2, Search, MoreVertical,
  Clock, Sparkles, Copy, PenLine, SortAsc, SortDesc, LayoutGrid, LayoutList,
  Hash,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DocumentRow } from "@/lib/db";

type DocType = "all" | "document" | "spreadsheet";
type SortBy = "updated" | "title" | "created";
type ViewMode = "grid" | "list";

export function DocumentsListClient({ initialDocs }: { initialDocs: DocumentRow[] }) {
  const router = useRouter();
  const [docs, setDocs] = useState<DocumentRow[]>(initialDocs);
  const [filter, setFilter] = useState<DocType>("all");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("updated");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) && menuOpenId) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpenId]);

  const filteredDocs = docs
    .filter((d) => {
      if (filter !== "all" && d.type !== filter) return false;
      if (search) {
        const q = search.toLowerCase();
        return d.title.toLowerCase().includes(q) || getPreview(d).toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortBy === "title") return dir * a.title.localeCompare(b.title);
      if (sortBy === "created") return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      return dir * (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime());
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
      console.error("Failed to create:", err);
    } finally {
      setCreating(false);
    }
  }, [router]);

  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      if (res.ok) setDocs((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      console.error("Failed to delete:", err);
    } finally {
      setDeletingId(null);
      setMenuOpenId(null);
    }
  }, []);

  const handleDuplicate = useCallback(async (doc: DocumentRow) => {
    setMenuOpenId(null);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: `${doc.title} (Copy)`, type: doc.type, content: doc.content }),
      });
      if (res.ok) {
        const newDoc = await res.json();
        setDocs((prev) => [newDoc, ...prev]);
      }
    } catch (err) {
      console.error("Failed to duplicate:", err);
    }
  }, []);

  const handleRename = useCallback(async (id: string) => {
    if (!renameValue.trim()) { setRenamingId(null); return; }
    try {
      const res = await fetch(`/api/documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: renameValue.trim() }),
      });
      if (res.ok) {
        setDocs((prev) => prev.map((d) => d.id === id ? { ...d, title: renameValue.trim() } : d));
      }
    } catch (err) {
      console.error("Failed to rename:", err);
    } finally {
      setRenamingId(null);
      setMenuOpenId(null);
    }
  }, [renameValue]);

  const toggleSort = (by: SortBy) => {
    if (sortBy === by) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortBy(by); setSortDir("desc"); }
  };

  const docCount = docs.filter((d) => d.type === "document").length;
  const sheetCount = docs.filter((d) => d.type === "spreadsheet").length;

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-8 pt-8 pb-4 border-b border-pplx-border">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-semibold text-pplx-text">Documents</h1>
            <p className="text-sm text-pplx-muted mt-1">
              {docs.length} document{docs.length !== 1 ? "s" : ""} — {docCount} doc{docCount !== 1 ? "s" : ""}, {sheetCount} sheet{sheetCount !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => handleCreate("document")} disabled={creating} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-pplx-accent text-white hover:bg-pplx-accent-hover transition-colors text-sm font-medium disabled:opacity-50">
              {creating ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />} New Document
            </button>
            <button onClick={() => handleCreate("spreadsheet")} disabled={creating} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-pplx-card border border-pplx-border text-pplx-text hover:bg-pplx-border/50 transition-colors text-sm font-medium disabled:opacity-50">
              {creating ? <Loader2 size={16} className="animate-spin" /> : <Table2 size={16} />} New Spreadsheet
            </button>
          </div>
        </div>

        {/* Filter, Search, Sort, View */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 bg-pplx-card border border-pplx-border rounded-xl p-1">
            {(["all", "document", "spreadsheet"] as DocType[]).map((t) => (
              <button key={t} onClick={() => setFilter(t)} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-colors", filter === t ? "bg-pplx-accent text-white" : "text-pplx-muted hover:text-pplx-text")}>
                {t === "all" ? `All (${docs.length})` : t === "document" ? `Docs (${docCount})` : `Sheets (${sheetCount})`}
              </button>
            ))}
          </div>
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-pplx-muted" />
            <input type="text" placeholder="Search by title or content..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 rounded-xl bg-pplx-card border border-pplx-border text-sm text-pplx-text placeholder:text-pplx-muted focus:outline-none focus:border-pplx-accent" />
          </div>
          <div className="flex items-center gap-1 ml-auto">
            {/* Sort buttons */}
            <button onClick={() => toggleSort("updated")} className={cn("px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1", sortBy === "updated" ? "text-pplx-accent bg-pplx-accent/10" : "text-pplx-muted hover:text-pplx-text")}>
              <Clock size={12} /> Modified {sortBy === "updated" && (sortDir === "desc" ? <SortDesc size={12} /> : <SortAsc size={12} />)}
            </button>
            <button onClick={() => toggleSort("title")} className={cn("px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1", sortBy === "title" ? "text-pplx-accent bg-pplx-accent/10" : "text-pplx-muted hover:text-pplx-text")}>
              Name {sortBy === "title" && (sortDir === "desc" ? <SortDesc size={12} /> : <SortAsc size={12} />)}
            </button>
            <div className="w-px h-5 bg-pplx-border mx-1" />
            <button onClick={() => setViewMode("grid")} className={cn("p-1.5 rounded-lg transition-colors", viewMode === "grid" ? "text-pplx-accent bg-pplx-accent/10" : "text-pplx-muted hover:text-pplx-text")} title="Grid view"><LayoutGrid size={14} /></button>
            <button onClick={() => setViewMode("list")} className={cn("p-1.5 rounded-lg transition-colors", viewMode === "list" ? "text-pplx-accent bg-pplx-accent/10" : "text-pplx-muted hover:text-pplx-text")} title="List view"><LayoutList size={14} /></button>
          </div>
        </div>
      </div>

      {/* Document Grid / List */}
      <div className="flex-1 overflow-y-auto p-8">
        {filteredDocs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-pplx-muted">
            {search ? (
              <>
                <Search size={48} className="mb-4 opacity-30" />
                <p className="text-lg font-medium">No results for &ldquo;{search}&rdquo;</p>
                <p className="text-sm mt-1">Try a different search term</p>
              </>
            ) : (
              <>
                <FileText size={48} className="mb-4 opacity-30" />
                <p className="text-lg font-medium">No documents yet</p>
                <p className="text-sm mt-1">Create a document or spreadsheet to get started</p>
                <div className="flex gap-3 mt-6">
                  <button onClick={() => handleCreate("document")} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-pplx-accent text-white hover:bg-pplx-accent-hover transition-colors text-sm"><Plus size={16} /> Document</button>
                  <button onClick={() => handleCreate("spreadsheet")} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-pplx-card border border-pplx-border text-pplx-text hover:bg-pplx-border/50 transition-colors text-sm"><Plus size={16} /> Spreadsheet</button>
                </div>
              </>
            )}
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredDocs.map((doc) => (
              <div key={doc.id} className="group relative bg-pplx-card border border-pplx-border rounded-2xl p-5 hover:border-pplx-accent/50 hover:shadow-lg hover:shadow-pplx-accent/5 transition-all cursor-pointer" onClick={() => { if (renamingId !== doc.id) router.push(`/computer/documents/${doc.id}`); }}>
                <div className="flex items-start justify-between mb-3">
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", doc.type === "document" ? "bg-blue-500/20 text-blue-400" : "bg-green-500/20 text-green-400")}>
                    {doc.type === "document" ? <FileText size={20} /> : <Table2 size={20} />}
                  </div>
                  <div className="relative" ref={menuOpenId === doc.id ? menuRef : undefined}>
                    <button onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === doc.id ? null : doc.id); }} className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-pplx-border/50 transition-all text-pplx-muted">
                      <MoreVertical size={16} />
                    </button>
                    {menuOpenId === doc.id && (
                      <div className="absolute right-0 top-8 z-20 bg-pplx-card border border-pplx-border rounded-xl shadow-xl py-1 min-w-[160px]">
                        <button onClick={(e) => { e.stopPropagation(); setRenamingId(doc.id); setRenameValue(doc.title); setMenuOpenId(null); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-pplx-text hover:bg-pplx-border/30 transition-colors">
                          <PenLine size={14} /> Rename
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleDuplicate(doc); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-pplx-text hover:bg-pplx-border/30 transition-colors">
                          <Copy size={14} /> Duplicate
                        </button>
                        <div className="h-px bg-pplx-border my-1" />
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(doc.id); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
                          {deletingId === doc.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Title (inline rename) */}
                {renamingId === doc.id ? (
                  <input type="text" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onBlur={() => handleRename(doc.id)} onKeyDown={(e) => { if (e.key === "Enter") handleRename(doc.id); if (e.key === "Escape") setRenamingId(null); }} className="font-medium text-pplx-text bg-transparent border-b border-pplx-accent outline-none w-full mb-1" autoFocus onClick={(e) => e.stopPropagation()} />
                ) : (
                  <h3 className="font-medium text-pplx-text truncate mb-1">{doc.title}</h3>
                )}

                <p className="text-xs text-pplx-muted line-clamp-2 mb-3 min-h-[2rem]">{getPreview(doc)}</p>

                <div className="flex items-center gap-2 text-xs text-pplx-muted">
                  <Clock size={12} />
                  <span>{formatDate(doc.updated_at)}</span>
                  {doc.type === "document" && (
                    <span className="ml-auto flex items-center gap-1"><Hash size={11} />{getWordCount(doc)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* List view */
          <div className="space-y-1">
            {filteredDocs.map((doc) => (
              <div key={doc.id} className="group flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-pplx-card transition-colors cursor-pointer" onClick={() => { if (renamingId !== doc.id) router.push(`/computer/documents/${doc.id}`); }}>
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", doc.type === "document" ? "bg-blue-500/20 text-blue-400" : "bg-green-500/20 text-green-400")}>
                  {doc.type === "document" ? <FileText size={16} /> : <Table2 size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  {renamingId === doc.id ? (
                    <input type="text" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onBlur={() => handleRename(doc.id)} onKeyDown={(e) => { if (e.key === "Enter") handleRename(doc.id); if (e.key === "Escape") setRenamingId(null); }} className="font-medium text-pplx-text bg-transparent border-b border-pplx-accent outline-none w-full text-sm" autoFocus onClick={(e) => e.stopPropagation()} />
                  ) : (
                    <p className="font-medium text-pplx-text text-sm truncate">{doc.title}</p>
                  )}
                  <p className="text-xs text-pplx-muted truncate">{getPreview(doc)}</p>
                </div>
                <span className="text-xs text-pplx-muted whitespace-nowrap">{formatDate(doc.updated_at)}</span>
                {doc.type === "document" && <span className="text-xs text-pplx-muted whitespace-nowrap flex items-center gap-1"><Hash size={11} />{getWordCount(doc)}</span>}
                <div className="relative" ref={menuOpenId === doc.id ? menuRef : undefined}>
                  <button onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === doc.id ? null : doc.id); }} className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-pplx-border/50 transition-all text-pplx-muted">
                    <MoreVertical size={14} />
                  </button>
                  {menuOpenId === doc.id && (
                    <div className="absolute right-0 top-8 z-20 bg-pplx-card border border-pplx-border rounded-xl shadow-xl py-1 min-w-[160px]">
                      <button onClick={(e) => { e.stopPropagation(); setRenamingId(doc.id); setRenameValue(doc.title); setMenuOpenId(null); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-pplx-text hover:bg-pplx-border/30 transition-colors"><PenLine size={14} /> Rename</button>
                      <button onClick={(e) => { e.stopPropagation(); handleDuplicate(doc); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-pplx-text hover:bg-pplx-border/30 transition-colors"><Copy size={14} /> Duplicate</button>
                      <div className="h-px bg-pplx-border my-1" />
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(doc.id); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors">{deletingId === doc.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Helpers ──────────────────────────────────────────────── */

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return d.toLocaleDateString();
}

function getPreview(doc: DocumentRow) {
  if (doc.type === "spreadsheet") {
    try {
      const data = JSON.parse(doc.content);
      const cellCount = Object.keys(data.cells || {}).length;
      return `${cellCount} cell${cellCount !== 1 ? "s" : ""}`;
    } catch { return "Empty spreadsheet"; }
  }
  const text = doc.content.replace(/<[^>]+>/g, "").trim();
  if (!text) return "Empty document";
  return text.slice(0, 150) + (text.length > 150 ? "…" : "");
}

function getWordCount(doc: DocumentRow) {
  const text = doc.content.replace(/<[^>]+>/g, "").trim();
  if (!text) return "0 words";
  const count = text.split(/\s+/).filter(Boolean).length;
  return `${count.toLocaleString()} word${count !== 1 ? "s" : ""}`;
}
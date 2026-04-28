"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Trash2, Download, CheckSquare, Square, XCircle, Pencil, Check, X, Tag, Brain, AlertCircle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MemoryEntry } from "@/lib/types";
import { usePageVisible } from "@/components/persistent-layout";
import { useToast } from "@/components/toast-provider";

export default function MemoryClient() {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newTags, setNewTags] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editKey, setEditKey] = useState("");
  const [editValue, setEditValue] = useState("");
  const [editTags, setEditTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [memoryStats, setMemoryStats] = useState<{
    total_memories: number; compressed_memories: number;
  } | null>(null);
  const { error: toastError, success: toastSuccess } = useToast();

  const fetchMemory = useCallback(async (q = "") => {
    setLoading(true);
    setFetchError(null);
    try {
      const url = q ? `/api/memory?q=${encodeURIComponent(q)}` : "/api/memory";
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { entries: MemoryEntry[] };
      setEntries(data.entries || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load memory";
      setFetchError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMemory();
    // Fetch self-improvement stats
    fetch("/api/self-improvement")
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => setMemoryStats(data.stats))
      .catch(() => { /* best effort */ });
  }, [fetchMemory]);

  // Refresh data when page becomes visible again
  const isVisible = usePageVisible();
  const wasVisibleRef = useRef(true);
  useEffect(() => {
    if (isVisible && !wasVisibleRef.current) void fetchMemory(query);
    wasVisibleRef.current = isVisible;
  }, [isVisible, fetchMemory, query]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    void fetchMemory(query);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim() || !newValue.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: newKey.trim(),
          value: newValue.trim(),
          tags: newTags.split(",").map(t => t.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      setNewKey("");
      setNewValue("");
      setNewTags("");
      setShowAdd(false);
      toastSuccess("Memory saved");
      await fetchMemory(query);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to save memory");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/memory?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (res.ok) {
        setEntries(prev => prev.filter(e => e.id !== id));
      }
    } catch {
      toastError("Failed to delete memory");
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} memor${selectedIds.size > 1 ? "ies" : "y"}?`)) return;
    const ids = [...selectedIds];
    for (const id of ids) {
      try {
        await fetch(`/api/memory?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      } catch { /* best effort */ }
    }
    setEntries(prev => prev.filter(e => !ids.includes(e.id)));
    setSelectedIds(new Set());
  };

  const startEdit = (entry: MemoryEntry) => {
    setEditingId(entry.id);
    setEditKey(entry.key);
    setEditValue(entry.value);
    setEditTags((entry.tags || []).join(", "));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditKey("");
    setEditValue("");
    setEditTags("");
  };

  const saveEdit = async () => {
    if (!editingId || !editKey.trim() || !editValue.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/memory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          key: editKey.trim(),
          value: editValue.trim(),
          tags: editTags.split(",").map(t => t.trim()).filter(Boolean),
        }),
      });
      if (res.ok) {
        setEntries(prev => prev.map(e => e.id === editingId ? {
          ...e,
          key: editKey.trim(),
          value: editValue.trim(),
          tags: editTags.split(",").map(t => t.trim()).filter(Boolean),
          updated_at: new Date().toISOString(),
        } : e));
        cancelEdit();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    const json = JSON.stringify(entries, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ottomate-memory-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Collect all unique tags for the tag filter
  const allTags = Array.from(new Set(entries.flatMap(e => e.tags || [])));

  // Apply tag filter
  const displayedEntries = tagFilter
    ? entries.filter(e => e.tags && e.tags.includes(tagFilter))
    : entries;

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-pplx-text">Memory</h1>
            <p className="text-sm text-pplx-muted mt-1">
              {entries.length} memor{entries.length !== 1 ? "ies" : "y"} stored — Ottomate remembers facts, results, and context across tasks
            </p>
          </div>
          <div className="flex items-center gap-2">
            {entries.length > 0 && (
              <button
                onClick={handleExport}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-pplx-border text-pplx-muted text-sm hover:text-pplx-text transition-colors"
                title="Export all as JSON"
              >
                <Download size={14} />
                Export
              </button>
            )}
            <button
              onClick={() => setShowAdd(v => !v)}
              className="px-4 py-2 rounded-lg bg-pplx-accent text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              + Add Memory
            </button>
          </div>
        </div>

        {/* Self-Improvement Memory Stats — always shown when available */}
        {memoryStats && (
          <div className="mb-6 rounded-xl border border-violet-500/20 bg-gradient-to-r from-violet-500/5 to-blue-500/5 p-3 flex items-center gap-3">
            <Brain size={16} className="text-violet-400 shrink-0" />
            <div className="flex items-center gap-4 flex-wrap text-xs text-pplx-muted">
              <span>
                <span className="text-violet-400 font-semibold">{memoryStats.total_memories}</span> total memories
              </span>
              {memoryStats.compressed_memories > 0 && (
                <span>
                  <span className="text-blue-400 font-semibold">{memoryStats.compressed_memories}</span> compressed
                </span>
              )}
              <span className="text-pplx-muted/60">Self-improvement engine active</span>
            </div>
          </div>
        )}

        {/* Fetch error banner */}
        {fetchError && (
          <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/5 p-3 flex items-center gap-3">
            <AlertCircle size={15} className="text-red-400 shrink-0" />
            <p className="text-sm text-red-400 flex-1">{fetchError}</p>
            <button
              onClick={() => void fetchMemory(query)}
              className="text-xs text-red-400 hover:underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Add form */}
        {showAdd && (
          <form
            onSubmit={(e) => { void handleAdd(e); }}
            className="mb-6 p-4 rounded-xl border border-pplx-border bg-pplx-card space-y-3"
          >
            <h2 className="font-semibold text-pplx-text">New Memory Entry</h2>
            <div>
              <label className="block text-xs text-pplx-muted mb-1">Key</label>
              <input
                type="text"
                value={newKey}
                onChange={e => setNewKey(e.target.value)}
                placeholder="e.g. user_preference_language"
                className="w-full px-3 py-2 rounded-lg bg-pplx-bg border border-pplx-border text-pplx-text text-sm focus:outline-none focus:border-pplx-accent"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-pplx-muted mb-1">Value</label>
              <textarea
                value={newValue}
                onChange={e => setNewValue(e.target.value)}
                placeholder="The information to remember..."
                rows={3}
                className="w-full px-3 py-2 rounded-lg bg-pplx-bg border border-pplx-border text-pplx-text text-sm focus:outline-none focus:border-pplx-accent resize-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-pplx-muted mb-1">Tags (comma-separated)</label>
              <input
                type="text"
                value={newTags}
                onChange={e => setNewTags(e.target.value)}
                placeholder="e.g. user, preference, language"
                className="w-full px-3 py-2 rounded-lg bg-pplx-bg border border-pplx-border text-pplx-text text-sm focus:outline-none focus:border-pplx-accent"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={adding}
                className="px-4 py-2 rounded-lg bg-pplx-accent text-white text-sm font-medium disabled:opacity-50"
              >
                {adding ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="px-4 py-2 rounded-lg border border-pplx-border text-pplx-muted text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Search */}
        <form onSubmit={handleSearch} className="mb-6 flex gap-2">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search memory…"
            className="flex-1 px-4 py-2 rounded-xl bg-pplx-card border border-pplx-border text-pplx-text text-sm focus:outline-none focus:border-pplx-accent"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-pplx-card border border-pplx-border text-pplx-muted text-sm hover:text-pplx-text transition-colors"
          >
            Search
          </button>
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(""); void fetchMemory(""); }}
              className="px-4 py-2 rounded-xl bg-pplx-card border border-pplx-border text-pplx-muted text-sm"
            >
              Clear
            </button>
          )}
        </form>

        {/* Tag filter */}
        {allTags.length > 0 && (
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <Tag size={12} className="text-pplx-muted shrink-0" />
            <button
              onClick={() => setTagFilter(null)}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs transition-colors",
                !tagFilter ? "bg-pplx-accent/15 text-pplx-accent border border-pplx-accent/30" : "bg-pplx-bg text-pplx-muted border border-pplx-border hover:text-pplx-text"
              )}
            >
              All
            </button>
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs transition-colors",
                  tagFilter === tag ? "bg-pplx-accent/15 text-pplx-accent border border-pplx-accent/30" : "bg-pplx-bg text-pplx-muted border border-pplx-border hover:text-pplx-text"
                )}
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        {/* Bulk action bar */}
        {displayedEntries.length > 0 && (
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => {
                if (selectedIds.size === displayedEntries.length) setSelectedIds(new Set());
                else setSelectedIds(new Set(displayedEntries.map(e => e.id)));
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-pplx-muted hover:text-pplx-text transition-colors"
            >
              {selectedIds.size === displayedEntries.length && displayedEntries.length > 0
                ? <CheckSquare size={13} className="text-pplx-accent" />
                : <Square size={13} />}
              {selectedIds.size > 0 ? `${selectedIds.size} selected` : "Select all"}
            </button>
            {selectedIds.size > 0 && (
              <>
                <button
                  onClick={() => void handleBulkDelete()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/20 transition-colors"
                >
                  <Trash2 size={12} /> Delete
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-pplx-muted hover:text-pplx-text transition-colors"
                >
                  <XCircle size={12} /> Clear
                </button>
              </>
            )}
          </div>
        )}

        {/* Entries */}
        {loading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-pplx-muted text-sm">
            <Brain size={16} className="animate-pulse text-violet-400" />
            Loading memory…
          </div>
        ) : fetchError && entries.length === 0 ? null /* error banner shown above */ : displayedEntries.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">🧠</p>
            <p className="text-pplx-muted text-sm">
              {query || tagFilter ? "No matching memories found." : "No memories yet. Ottomate will remember things as it completes tasks."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayedEntries.map(entry => (
              <div
                key={entry.id}
                className={cn(
                  "group p-4 rounded-xl border bg-pplx-card transition-colors",
                  selectedIds.has(entry.id) ? "border-pplx-accent/50 bg-pplx-accent/5" : "border-pplx-border hover:border-pplx-accent/40"
                )}
              >
                <div className="flex items-start gap-3">
                  {/* Selection checkbox */}
                  <button
                    onClick={() => toggleSelect(entry.id)}
                    className="mt-0.5 p-0.5 rounded text-pplx-muted hover:text-pplx-accent transition-colors shrink-0"
                  >
                    {selectedIds.has(entry.id)
                      ? <CheckSquare size={14} className="text-pplx-accent" />
                      : <Square size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />}
                  </button>

                  <div className="flex-1 min-w-0">
                    {editingId === entry.id ? (
                      /* Inline edit form */
                      <div className="space-y-2">
                        <input
                          value={editKey}
                          onChange={e => setEditKey(e.target.value)}
                          className="w-full px-2 py-1 rounded bg-pplx-bg border border-pplx-border text-pplx-text text-xs font-mono focus:outline-none focus:border-pplx-accent"
                        />
                        <textarea
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          rows={3}
                          className="w-full px-2 py-1 rounded bg-pplx-bg border border-pplx-border text-pplx-text text-sm focus:outline-none focus:border-pplx-accent resize-none"
                        />
                        <input
                          value={editTags}
                          onChange={e => setEditTags(e.target.value)}
                          placeholder="Tags (comma-separated)"
                          className="w-full px-2 py-1 rounded bg-pplx-bg border border-pplx-border text-pplx-text text-xs focus:outline-none focus:border-pplx-accent"
                        />
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => void saveEdit()}
                            disabled={saving}
                            className="flex items-center gap-1 px-2.5 py-1 rounded bg-pplx-accent text-white text-xs font-medium disabled:opacity-50"
                          >
                            <Check size={12} /> {saving ? "Saving…" : "Save"}
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="flex items-center gap-1 px-2.5 py-1 rounded border border-pplx-border text-pplx-muted text-xs"
                          >
                            <X size={12} /> Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Display mode */
                      <>
                        <p className="font-mono text-xs text-pplx-accent mb-1">{entry.key}</p>
                        <p className="text-sm text-pplx-text leading-relaxed whitespace-pre-wrap">{entry.value}</p>
                        {entry.tags && entry.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {entry.tags.map(tag => (
                              <span
                                key={tag}
                                className={cn(
                                  "px-2 py-0.5 rounded-full text-xs border",
                                  tag === "auto-extracted" ? "bg-violet-500/10 text-violet-400 border-violet-500/20" :
                                  tag === "self-improvement" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                                  tag === "skill-creation" ? "bg-pink-500/10 text-pink-400 border-pink-500/20" :
                                  tag === "user-preference" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                                  tag === "correction" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                                  "bg-pplx-bg text-pplx-muted border-pplx-border"
                                )}
                              >
                                {tag === "auto-extracted" && <><Sparkles size={10} className="inline mr-0.5 -mt-0.5" /></>}
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        {entry.source_task_id && (
                          <p className="text-xs text-pplx-muted mt-1">
                            Task: <span className="font-mono">{entry.source_task_id.slice(0, 8)}</span>
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  {editingId !== entry.id && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <time className="text-xs text-pplx-muted whitespace-nowrap">
                        {new Date(entry.updated_at).toLocaleDateString()}
                      </time>
                      <button
                        onClick={() => startEdit(entry)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-pplx-accent/10 text-pplx-muted hover:text-pplx-accent transition-all"
                        title="Edit memory"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => { void handleDelete(entry.id); }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/10 text-pplx-muted hover:text-red-400 transition-all"
                        title="Delete memory"
                      >
                        <Trash2 size={14} />
                      </button>
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

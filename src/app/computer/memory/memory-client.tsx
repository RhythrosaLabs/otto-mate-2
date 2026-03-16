"use client";

import { useState, useEffect, useCallback } from "react";
import { Trash2 } from "lucide-react";
import type { MemoryEntry } from "@/lib/types";

export default function MemoryClient() {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newTags, setNewTags] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const fetchMemory = useCallback(async (q = "") => {
    setLoading(true);
    try {
      const url = q ? `/api/memory?q=${encodeURIComponent(q)}` : "/api/memory";
      const res = await fetch(url);
      const data = await res.json() as { entries: MemoryEntry[] };
      setEntries(data.entries || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMemory();
  }, [fetchMemory]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    void fetchMemory(query);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim() || !newValue.trim()) return;
    setAdding(true);
    try {
      await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: newKey.trim(),
          value: newValue.trim(),
          tags: newTags.split(",").map(t => t.trim()).filter(Boolean),
        }),
      });
      setNewKey("");
      setNewValue("");
      setNewTags("");
      setShowAdd(false);
      await fetchMemory(query);
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
    } catch (err) {
      console.error("Failed to delete memory:", err);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-pplx-text">Memory</h1>
            <p className="text-sm text-pplx-muted mt-1">
              Ottomatron remembers facts, results, and context across tasks
            </p>
          </div>
          <button
            onClick={() => setShowAdd(v => !v)}
            className="px-4 py-2 rounded-lg bg-pplx-accent text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            + Add Memory
          </button>
        </div>

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

        {/* Entries */}
        {loading ? (
          <div className="text-center py-12 text-pplx-muted text-sm">Loading memory…</div>
        ) : entries.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">🧠</p>
            <p className="text-pplx-muted text-sm">
              {query ? "No matching memories found." : "No memories yet. Ottomatron will remember things as it completes tasks."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map(entry => (
              <div
                key={entry.id}
                className="group p-4 rounded-xl border border-pplx-border bg-pplx-card hover:border-pplx-accent/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs text-pplx-accent mb-1">{entry.key}</p>
                    <p className="text-sm text-pplx-text leading-relaxed whitespace-pre-wrap">{entry.value}</p>
                    {entry.tags && entry.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {entry.tags.map(tag => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 rounded-full text-xs bg-pplx-bg text-pplx-muted border border-pplx-border"
                          >
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
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <time className="text-xs text-pplx-muted whitespace-nowrap">
                      {new Date(entry.updated_at).toLocaleDateString()}
                    </time>
                    <button
                      onClick={() => { void handleDelete(entry.id); }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/10 text-pplx-muted hover:text-red-400 transition-all"
                      title="Delete memory"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

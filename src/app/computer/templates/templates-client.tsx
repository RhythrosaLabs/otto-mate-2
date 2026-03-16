"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Play, Trash2, X, LayoutTemplate, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TaskTemplate } from "@/lib/types";

const CATEGORY_COLORS: Record<string, string> = {
  research: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  development: "bg-green-500/15 text-green-400 border-green-500/30",
  data: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  writing: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  productivity: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  custom: "bg-pplx-accent/15 text-pplx-accent border-pplx-accent/30",
  general: "bg-gray-500/15 text-gray-400 border-gray-500/30",
};

export function TemplatesClient({ templates: initialTemplates }: { templates: TaskTemplate[] }) {
  const [templates, setTemplates] = useState<TaskTemplate[]>(initialTemplates);
  const [selectedTemplate, setSelectedTemplate] = useState<TaskTemplate | null>(null);
  const [userInput, setUserInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", prompt: "", category: "custom", icon: "📋", model: "auto" });
  const [isSaving, setIsSaving] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const router = useRouter();

  const categories = [...new Set(templates.map((t) => t.category))];
  const filtered = filter ? templates.filter((t) => t.category === filter) : templates;

  async function handleRun(template: TaskTemplate) {
    setIsRunning(true);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run",
          template_id: template.id,
          user_input: userInput,
        }),
      });
      if (res.ok) {
        const data = await res.json() as { task_id: string };
        // Start the task
        await fetch(`/api/tasks/${data.task_id}/run`, { method: "POST" });
        router.push(`/computer/tasks/${data.task_id}`);
      }
    } finally {
      setIsRunning(false);
      setSelectedTemplate(null);
      setUserInput("");
    }
  }

  async function handleCreate() {
    if (!form.name.trim() || !form.prompt.trim()) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", ...form }),
      });
      if (res.ok) {
        const created = await res.json() as TaskTemplate;
        setTemplates((prev) => [...prev, created]);
        setIsCreating(false);
        setForm({ name: "", description: "", prompt: "", category: "custom", icon: "📋", model: "auto" });
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this template?")) return;
    try {
      const res = await fetch(`/api/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", template_id: id }),
      });
      if (res.ok) {
        setTemplates((prev) => prev.filter((t) => t.id !== id));
      }
    } catch (err) {
      console.error("Failed to delete template:", err);
    }
  }

  return (
    <div className="flex-1 px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-pplx-text">Templates</h1>
          <p className="text-sm text-pplx-muted mt-0.5">
            Quick actions & reusable task templates · {templates.length} templates
          </p>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-pplx-accent hover:bg-pplx-accent-hover text-white text-sm font-medium transition-colors"
        >
          <Plus size={14} />
          New Template
        </button>
      </div>

      {/* Category filter pills */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <button
          onClick={() => setFilter(null)}
          className={cn(
            "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
            !filter
              ? "bg-pplx-accent/15 text-pplx-accent border-pplx-accent/30"
              : "bg-pplx-card text-pplx-muted border-pplx-border hover:border-pplx-muted/50"
          )}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(filter === cat ? null : cat)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium border capitalize transition-colors",
              filter === cat
                ? CATEGORY_COLORS[cat] || CATEGORY_COLORS.general
                : "bg-pplx-card text-pplx-muted border-pplx-border hover:border-pplx-muted/50"
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {templates.length === 0 && !isCreating ? (
        <div className="flex flex-col items-center justify-center h-64 text-pplx-muted">
          <LayoutTemplate size={40} className="mb-3 opacity-30" />
          <p className="text-sm font-medium">No templates yet</p>
          <p className="text-xs mt-1 opacity-70">Create reusable templates for common tasks</p>
          <button
            onClick={() => setIsCreating(true)}
            className="mt-4 px-4 py-2 rounded-xl bg-pplx-accent/15 text-pplx-accent text-sm font-medium hover:bg-pplx-accent/25 transition-colors"
          >
            Create your first template
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((template) => (
            <div
              key={template.id}
              className="rounded-xl border border-pplx-border bg-pplx-card p-4 flex flex-col gap-3 group hover:border-pplx-muted/50 transition-colors cursor-pointer"
              onClick={() => { setSelectedTemplate(template); setUserInput(""); }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-pplx-bg border border-pplx-border flex items-center justify-center text-base flex-shrink-0">
                    {template.icon}
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-pplx-text">{template.name}</h3>
                    <span className={cn(
                      "inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium capitalize border",
                      CATEGORY_COLORS[template.category] || CATEGORY_COLORS.general
                    )}>
                      {template.category}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelectedTemplate(template); setUserInput(""); }}
                    className="p-1.5 rounded-lg hover:bg-pplx-bg text-pplx-accent transition-colors"
                    title="Run template"
                  >
                    <Play size={13} />
                  </button>
                  {!template.is_builtin && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(template.id); }}
                      className="p-1.5 rounded-lg hover:bg-red-500/15 text-red-400 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>

              <p className="text-xs text-pplx-muted line-clamp-2">{template.description}</p>

              <div className="flex items-center justify-between mt-auto pt-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(template.tags || []).slice(0, 3).map((tag) => (
                    <span key={tag} className="px-1.5 py-0.5 rounded bg-pplx-bg text-[10px] text-pplx-muted border border-pplx-border">
                      {tag}
                    </span>
                  ))}
                </div>
                {template.use_count > 0 && (
                  <span className="text-[10px] text-pplx-muted flex items-center gap-0.5">
                    <Sparkles size={10} /> {template.use_count} uses
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Run Template Modal */}
      {selectedTemplate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setSelectedTemplate(null)}>
          <div className="bg-pplx-card border border-pplx-border rounded-2xl w-full max-w-lg p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">{selectedTemplate.icon}</span>
                <h2 className="text-lg font-semibold text-pplx-text">{selectedTemplate.name}</h2>
              </div>
              <button onClick={() => setSelectedTemplate(null)} className="p-1.5 rounded-lg hover:bg-pplx-bg text-pplx-muted">
                <X size={16} />
              </button>
            </div>

            <p className="text-sm text-pplx-muted">{selectedTemplate.description}</p>

            <div className="bg-pplx-bg border border-pplx-border rounded-xl p-3">
              <p className="text-xs text-pplx-muted mb-1 font-medium">Template prompt:</p>
              <p className="text-xs text-pplx-text/70 whitespace-pre-wrap line-clamp-4">{selectedTemplate.prompt}</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-pplx-muted mb-1.5">
                Your input (appended to template prompt)
              </label>
              <textarea
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder="Type your specific input here..."
                className="w-full px-3 py-2.5 rounded-xl bg-pplx-bg border border-pplx-border text-pplx-text text-sm placeholder-pplx-muted/50 focus:outline-none focus:ring-1 focus:ring-pplx-accent resize-none"
                rows={3}
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setSelectedTemplate(null)}
                className="px-4 py-2 rounded-xl bg-pplx-bg border border-pplx-border text-pplx-muted text-sm font-medium hover:bg-pplx-border transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRun(selectedTemplate)}
                disabled={isRunning}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-pplx-accent hover:bg-pplx-accent-hover text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Play size={14} />
                {isRunning ? "Starting..." : "Run"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Template Modal */}
      {isCreating && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setIsCreating(false)}>
          <div className="bg-pplx-card border border-pplx-border rounded-2xl w-full max-w-lg p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-pplx-text">Create Template</h2>
              <button onClick={() => setIsCreating(false)} className="p-1.5 rounded-lg hover:bg-pplx-bg text-pplx-muted">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-pplx-muted mb-1">Name</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Template name"
                    className="w-full px-3 py-2 rounded-xl bg-pplx-bg border border-pplx-border text-pplx-text text-sm focus:outline-none focus:ring-1 focus:ring-pplx-accent"
                  />
                </div>
                <div className="w-20">
                  <label className="block text-xs font-medium text-pplx-muted mb-1">Icon</label>
                  <input
                    value={form.icon}
                    onChange={(e) => setForm({ ...form, icon: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-pplx-bg border border-pplx-border text-pplx-text text-sm text-center focus:outline-none focus:ring-1 focus:ring-pplx-accent"
                    maxLength={2}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-pplx-muted mb-1">Description</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Brief description"
                  className="w-full px-3 py-2 rounded-xl bg-pplx-bg border border-pplx-border text-pplx-text text-sm focus:outline-none focus:ring-1 focus:ring-pplx-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-pplx-muted mb-1">Category</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-pplx-bg border border-pplx-border text-pplx-text text-sm focus:outline-none focus:ring-1 focus:ring-pplx-accent"
                >
                  <option value="custom">Custom</option>
                  <option value="research">Research</option>
                  <option value="development">Development</option>
                  <option value="data">Data</option>
                  <option value="writing">Writing</option>
                  <option value="productivity">Productivity</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-pplx-muted mb-1">Prompt Template</label>
                <textarea
                  value={form.prompt}
                  onChange={(e) => setForm({ ...form, prompt: e.target.value })}
                  placeholder="The prompt template. User input will be appended to the end."
                  className="w-full px-3 py-2.5 rounded-xl bg-pplx-bg border border-pplx-border text-pplx-text text-sm placeholder-pplx-muted/50 focus:outline-none focus:ring-1 focus:ring-pplx-accent resize-none"
                  rows={5}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setIsCreating(false)}
                className="px-4 py-2 rounded-xl bg-pplx-bg border border-pplx-border text-pplx-muted text-sm font-medium hover:bg-pplx-border transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={isSaving || !form.name.trim() || !form.prompt.trim()}
                className="px-4 py-2 rounded-xl bg-pplx-accent hover:bg-pplx-accent-hover text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {isSaving ? "Creating..." : "Create Template"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

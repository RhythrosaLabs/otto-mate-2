"use client";

import { useState } from "react";
import { Plus, Zap, Pencil, Trash2, X, Store, Upload } from "lucide-react";
import type { Skill } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SkillMarketplace } from "./skill-marketplace";
import { SkillConverter } from "./skill-converter";
import type { MarketplaceSkill } from "@/lib/skill-catalog";
import type { ConvertedSkill } from "@/lib/skill-converters";

const CATEGORY_ICONS: Record<string, string> = {
  web: "🌐",
  code: "💻",
  data: "📊",
  writing: "✍️",
  research: "🔍",
  automation: "⚙️",
  custom: "✨",
};

export function SkillsClient({ skills: initialSkills }: { skills: Skill[] }) {
  const [skills, setSkills] = useState<Skill[]>(initialSkills);
  const [editing, setEditing] = useState<Skill | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", instructions: "", category: "custom" });
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"my-skills" | "marketplace" | "import">("my-skills");

  async function handleSave() {
    if (!form.name.trim()) return;
    setIsSaving(true);
    try {
      if (editing) {
        const res = await fetch(`/api/skills/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (res.ok) {
          const updated = await res.json() as Skill;
          setSkills((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
        }
      } else {
        const res = await fetch("/api/skills", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (res.ok) {
          const created = await res.json() as Skill;
          setSkills((prev) => [...prev, created]);
        }
      }
      setIsCreating(false);
      setEditing(null);
      setForm({ name: "", description: "", instructions: "", category: "custom" });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this skill?")) return;
    await fetch(`/api/skills/${id}`, { method: "DELETE" });
    setSkills((prev) => prev.filter((s) => s.id !== id));
  }

  function openCreate() {
    setForm({ name: "", description: "", instructions: "", category: "custom" });
    setEditing(null);
    setIsCreating(true);
  }

  function openEdit(skill: Skill) {
    setForm({
      name: skill.name,
      description: skill.description,
      instructions: skill.instructions,
      category: skill.category,
    });
    setEditing(skill);
    setIsCreating(true);
  }

  async function handleConverterImport(convertedSkills: ConvertedSkill[]) {
    for (const skill of convertedSkills) {
      try {
        const res = await fetch("/api/skills", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: skill.name,
            description: skill.description,
            instructions: skill.instructions,
            category: skill.category,
            triggers: skill.triggers,
          }),
        });
        if (res.ok) {
          const created = await res.json() as Skill;
          setSkills((prev) => [...prev, created]);
        }
      } catch (err) {
        console.error("Import failed for skill:", skill.name, err);
      }
    }
  }

  async function handleMarketplaceInstall(mktSkill: MarketplaceSkill) {
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: mktSkill.name,
          description: mktSkill.description,
          instructions: mktSkill.instructions,
          category: mktSkill.category,
          marketplace_id: mktSkill.id,
        }),
      });
      if (res.ok) {
        const created = await res.json() as Skill;
        setSkills((prev) => [...prev, created]);
        setActiveTab("my-skills");
      }
    } catch (err) {
      console.error("Install failed:", err);
    }
  }

  // Track installed marketplace skill IDs by matching names
  const installedMarketplaceIds = skills.map(s => {
    // Match by name prefix to detect installed marketplace skills
    return `mkt-${s.name.toLowerCase().replace(/\s+/g, "-")}`;
  });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 via-pink-500 to-orange-500 flex items-center justify-center">
            <Zap size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-pplx-text">Skills</h1>
            <p className="text-xs text-pplx-muted">
              Custom capabilities that power your tasks · {skills.length} skills
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === "my-skills" && (
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-pplx-accent hover:bg-pplx-accent-hover text-white text-sm font-medium transition-colors"
            >
              <Plus size={14} />
              New Skill
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-5 border-b border-pplx-border">
        <button
          onClick={() => setActiveTab("my-skills")}
          className={cn(
            "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
            activeTab === "my-skills"
              ? "text-pplx-text border-pplx-accent"
              : "text-pplx-muted border-transparent hover:text-pplx-text"
          )}
        >
          <span className="flex items-center gap-1.5">
            <Zap size={14} />
            My Skills ({skills.length})
          </span>
        </button>
        <button
          onClick={() => setActiveTab("marketplace")}
          className={cn(
            "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
            activeTab === "marketplace"
              ? "text-pplx-text border-pplx-accent"
              : "text-pplx-muted border-transparent hover:text-pplx-text"
          )}
        >
          <span className="flex items-center gap-1.5">
            <Store size={14} />
            Marketplace
          </span>
        </button>
        <button
          onClick={() => setActiveTab("import")}
          className={cn(
            "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
            activeTab === "import"
              ? "text-pplx-text border-pplx-accent"
              : "text-pplx-muted border-transparent hover:text-pplx-text"
          )}
        >
          <span className="flex items-center gap-1.5">
            <Upload size={14} />
            Import &amp; Convert
          </span>
        </button>
      </div>

      {activeTab === "import" ? (
        <SkillConverter
          onImport={handleConverterImport}
          existingSkillNames={skills.map(s => s.name)}
        />
      ) : activeTab === "marketplace" ? (
        <SkillMarketplace
          installedIds={installedMarketplaceIds}
          onInstall={handleMarketplaceInstall}
        />
      ) : (
        <>
          {/* My Skills grid */}

      {skills.length === 0 && !isCreating ? (
        <div className="flex flex-col items-center justify-center h-64 text-pplx-muted">
          <Zap size={40} className="mb-3 opacity-30" />
          <p className="text-sm font-medium">No skills yet</p>
          <p className="text-xs mt-1 opacity-70">Create skills to give Computer custom capabilities</p>
          <button
            onClick={openCreate}
            className="mt-4 px-4 py-2 rounded-xl bg-pplx-accent/15 text-pplx-accent text-sm font-medium hover:bg-pplx-accent/25 transition-colors"
          >
            Create your first skill
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {skills.map((skill) => (
            <div
              key={skill.id}
              className="rounded-xl border border-pplx-border bg-pplx-card p-4 flex flex-col gap-3 group hover:border-pplx-muted/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-pplx-bg border border-pplx-border flex items-center justify-center text-base flex-shrink-0">
                    {CATEGORY_ICONS[skill.category] || "✨"}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-pplx-text">{skill.name}</p>
                    <p className="text-xs text-pplx-muted capitalize">{skill.category}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => openEdit(skill)}
                    className="p-1.5 rounded-lg text-pplx-muted hover:text-pplx-text hover:bg-white/5 transition-colors"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={() => handleDelete(skill.id)}
                    className="p-1.5 rounded-lg text-pplx-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              <p className="text-xs text-pplx-muted leading-relaxed">{skill.description}</p>

              {skill.instructions && (
                <div className="bg-pplx-bg rounded-lg p-2.5 border border-pplx-border">
                  <p className="text-xs text-pplx-muted line-clamp-2">{skill.instructions}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setIsCreating(false)} />
          <div className="relative z-10 bg-pplx-card border border-pplx-border rounded-2xl p-6 w-full max-w-lg shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-pplx-text">
                {editing ? "Edit Skill" : "New Skill"}
              </h3>
              <button
                onClick={() => setIsCreating(false)}
                className="p-1.5 rounded-lg text-pplx-muted hover:text-pplx-text hover:bg-white/5 transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-pplx-muted font-medium block mb-1.5">Name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Web Scraper, Data Analyst..."
                  className="w-full bg-pplx-bg border border-pplx-border rounded-xl px-3.5 py-2.5 text-sm text-pplx-text placeholder:text-pplx-muted outline-none focus:border-pplx-accent/50 transition-colors"
                />
              </div>

              <div>
                <label className="text-xs text-pplx-muted font-medium block mb-1.5">Category</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full bg-pplx-bg border border-pplx-border rounded-xl px-3.5 py-2.5 text-sm text-pplx-text outline-none focus:border-pplx-accent/50 transition-colors"
                >
                  {Object.keys(CATEGORY_ICONS).map((cat) => (
                    <option key={cat} value={cat}>
                      {CATEGORY_ICONS[cat]} {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-pplx-muted font-medium block mb-1.5">Description</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="What does this skill do?"
                  className="w-full bg-pplx-bg border border-pplx-border rounded-xl px-3.5 py-2.5 text-sm text-pplx-text placeholder:text-pplx-muted outline-none focus:border-pplx-accent/50 transition-colors"
                />
              </div>

              <div>
                <label className="text-xs text-pplx-muted font-medium block mb-1.5">Instructions</label>
                <textarea
                  value={form.instructions}
                  onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                  placeholder="Detailed instructions for how to apply this skill..."
                  rows={4}
                  className="w-full bg-pplx-bg border border-pplx-border rounded-xl px-3.5 py-2.5 text-sm text-pplx-text placeholder:text-pplx-muted outline-none focus:border-pplx-accent/50 transition-colors resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setIsCreating(false)}
                className="flex-1 py-2 rounded-xl text-sm font-medium bg-pplx-bg border border-pplx-border text-pplx-muted hover:text-pplx-text transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!form.name.trim() || isSaving}
                className="flex-1 py-2 rounded-xl text-sm font-medium bg-pplx-accent text-white hover:bg-pplx-accent-hover transition-colors disabled:opacity-50"
              >
                {isSaving ? "Saving..." : editing ? "Save Changes" : "Create Skill"}
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}

"use client";

import { useState, useMemo } from "react";
import { Download, Star, Search, Tag, CheckCircle2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { SKILL_CATALOG, MARKETPLACE_CATEGORIES, type MarketplaceSkill } from "@/lib/skill-catalog";

interface Props {
  installedIds: string[];
  onInstall: (skill: MarketplaceSkill) => void;
}

export function SkillMarketplace({ installedIds, onInstall }: Props) {
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [installing, setInstalling] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let skills = SKILL_CATALOG;
    if (activeCategory !== "all") {
      skills = skills.filter(s => s.category === activeCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      skills = skills.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags.some(t => t.includes(q))
      );
    }
    return skills;
  }, [activeCategory, searchQuery]);

  async function handleInstall(skill: MarketplaceSkill) {
    setInstalling(skill.id);
    try {
      await new Promise(resolve => setTimeout(resolve, 500)); // brief animation
      onInstall(skill);
    } finally {
      setInstalling(null);
    }
  }

  function formatNumber(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return n.toString();
  }

  return (
    <div>
      {/* Search + Categories */}
      <div className="mb-4">
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-pplx-muted" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search marketplace skills..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-pplx-bg border border-pplx-border text-sm text-pplx-text placeholder:text-pplx-muted outline-none focus:border-pplx-accent/50 transition-colors"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {MARKETPLACE_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                activeCategory === cat.id
                  ? "bg-pplx-accent/20 text-pplx-accent border border-pplx-accent/30"
                  : "bg-pplx-bg border border-pplx-border text-pplx-muted hover:text-pplx-text"
              )}
            >
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Skill Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-pplx-muted">
          <Search size={32} className="mb-2 opacity-30" />
          <p className="text-sm">No skills match your search</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(skill => {
            const isInstalled = installedIds.includes(skill.id);
            return (
              <div
                key={skill.id}
                className="rounded-xl border border-pplx-border bg-pplx-card p-4 flex flex-col gap-3 group hover:border-pplx-muted/50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-pplx-bg border border-pplx-border flex items-center justify-center text-lg flex-shrink-0">
                      {skill.icon}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-pplx-text">{skill.name}</p>
                      <p className="text-[10px] text-pplx-muted">by {skill.author}</p>
                    </div>
                  </div>
                  {isInstalled ? (
                    <span className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium bg-green-500/15 text-green-400">
                      <CheckCircle2 size={10} /> Installed
                    </span>
                  ) : (
                    <button
                      onClick={() => handleInstall(skill)}
                      disabled={installing === skill.id}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium bg-pplx-accent/15 text-pplx-accent hover:bg-pplx-accent/25 transition-colors disabled:opacity-50"
                    >
                      <Download size={10} />
                      {installing === skill.id ? "Installing..." : "Install"}
                    </button>
                  )}
                </div>

                <p className="text-xs text-pplx-muted leading-relaxed line-clamp-2">{skill.description}</p>

                <div className="flex items-center justify-between mt-auto pt-2 border-t border-pplx-border/50">
                  <div className="flex items-center gap-3 text-[10px] text-pplx-muted">
                    <span className="flex items-center gap-0.5">
                      <Download size={9} /> {formatNumber(skill.downloads)}
                    </span>
                    <span className="flex items-center gap-0.5">
                      <Star size={9} className="text-amber-400" /> {skill.rating}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    {skill.tags.slice(0, 2).map(tag => (
                      <span key={tag} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] bg-pplx-bg border border-pplx-border text-pplx-muted">
                        <Tag size={7} />{tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

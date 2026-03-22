"use client";

import { useState, useCallback, useRef } from "react";
import {
  Upload,
  FileJson,
  ArrowRight,
  Check,
  AlertCircle,
  Loader2,
  Plus,
  ChevronDown,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FORMAT_INFO, type ConvertibleFormat, type ConvertedSkill, type ConversionResult } from "@/lib/skill-converters";
import type { Skill } from "@/lib/types";

interface SkillConverterProps {
  onImport: (skills: ConvertedSkill[]) => Promise<void>;
  existingSkillNames: string[];
}

const FORMAT_OPTIONS: ConvertibleFormat[] = [
  "comfyui",
  "crewai",
  "n8n",
  "openclaw",
  "langchain",
  "make",
  "zapier",
  "flowise",
  "dify",
  "generic",
];

export function SkillConverter({ onImport, existingSkillNames }: SkillConverterProps) {
  const [jsonInput, setJsonInput] = useState("");
  const [selectedFormat, setSelectedFormat] = useState<ConvertibleFormat | "auto">("auto");
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedSkills, setSelectedSkills] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setJsonInput(text);
      setResult(null);
      setError(null);
      setImportedCount(0);
    };
    reader.readAsText(file);
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleConvert = useCallback(async () => {
    if (!jsonInput.trim()) {
      setError("Please paste or upload a workflow/skill JSON.");
      return;
    }

    setIsConverting(true);
    setError(null);
    setResult(null);
    setImportedCount(0);

    try {
      let parsedData: unknown;
      try {
        parsedData = JSON.parse(jsonInput);
      } catch {
        setError("Invalid JSON. Please check the format and try again.");
        setIsConverting(false);
        return;
      }

      const res = await fetch("/api/skills/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: parsedData,
          format: selectedFormat === "auto" ? undefined : selectedFormat,
        }),
      });

      const data = await res.json() as ConversionResult | { error: string };

      if (!res.ok) {
        setError((data as { error: string }).error || "Conversion failed");
        return;
      }

      const conversionResult = data as ConversionResult;
      setResult(conversionResult);

      if (conversionResult.success && conversionResult.skills.length > 0) {
        // Auto-select all skills that don't conflict with existing
        const autoSelected = new Set<number>();
        conversionResult.skills.forEach((skill, i) => {
          if (!existingSkillNames.some(n => n.toLowerCase() === skill.name.toLowerCase())) {
            autoSelected.add(i);
          }
        });
        setSelectedSkills(autoSelected);
      }
    } catch (err) {
      setError(`Network error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsConverting(false);
    }
  }, [jsonInput, selectedFormat, existingSkillNames]);

  const handleImportSelected = useCallback(async () => {
    if (!result || selectedSkills.size === 0) return;

    setIsImporting(true);
    try {
      const skillsToImport = result.skills.filter((_, i) => selectedSkills.has(i));
      await onImport(skillsToImport);
      setImportedCount(skillsToImport.length);
      setSelectedSkills(new Set());
    } catch (err) {
      setError(`Import failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsImporting(false);
    }
  }, [result, selectedSkills, onImport]);

  const toggleSkill = (index: number) => {
    setSelectedSkills((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleClear = () => {
    setJsonInput("");
    setResult(null);
    setError(null);
    setImportedCount(0);
    setSelectedSkills(new Set());
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 via-pink-500 to-orange-500 flex items-center justify-center flex-shrink-0">
          <Sparkles size={18} className="text-white" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-pplx-text">Auto Skill Converter</h3>
          <p className="text-xs text-pplx-muted mt-0.5">
            Paste or upload a workflow JSON from ComfyUI, CrewAI, n8n, OpenClaw, LangChain, Make, Zapier, Flowise, Dify, or any custom format.
            The converter will auto-detect the format and extract skills.
          </p>
        </div>
      </div>

      {/* Format selector + upload */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <select
            value={selectedFormat}
            onChange={(e) => setSelectedFormat(e.target.value as ConvertibleFormat | "auto")}
            className="w-full bg-pplx-bg border border-pplx-border rounded-xl px-3.5 py-2.5 text-sm text-pplx-text outline-none focus:border-pplx-accent/50 transition-colors appearance-none pr-8"
          >
            <option value="auto">🔍 Auto-detect format</option>
            {FORMAT_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {FORMAT_INFO[f].icon} {FORMAT_INFO[f].label}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-pplx-muted pointer-events-none" />
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.yaml,.yml"
          onChange={handleFileUpload}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-pplx-bg border border-pplx-border text-sm text-pplx-muted hover:text-pplx-text hover:border-pplx-muted/50 transition-colors"
        >
          <Upload size={14} />
          Upload
        </button>
      </div>

      {/* JSON input */}
      <div className="relative">
        <textarea
          value={jsonInput}
          onChange={(e) => {
            setJsonInput(e.target.value);
            setResult(null);
            setError(null);
            setImportedCount(0);
          }}
          placeholder={`Paste your workflow JSON here...\n\nExamples:\n• ComfyUI workflow (File → Save API Format)\n• CrewAI agents/tasks definition\n• n8n exported workflow\n• OpenClaw skill definition\n• LangChain serialized chain\n• Make/Zapier scenario export\n• Any JSON with name/description/instructions`}
          rows={8}
          className="w-full bg-pplx-bg border border-pplx-border rounded-xl px-3.5 py-3 text-sm text-pplx-text placeholder:text-pplx-muted/50 outline-none focus:border-pplx-accent/50 transition-colors resize-none font-mono text-xs leading-relaxed"
        />
        {jsonInput && (
          <button
            onClick={handleClear}
            className="absolute top-2.5 right-2.5 p-1 rounded-lg text-pplx-muted hover:text-pplx-text hover:bg-white/5 transition-colors"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Convert button */}
      <button
        onClick={handleConvert}
        disabled={!jsonInput.trim() || isConverting}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-pplx-accent text-white text-sm font-medium hover:bg-pplx-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isConverting ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            Converting...
          </>
        ) : (
          <>
            <Sparkles size={14} />
            Convert to Skills
          </>
        )}
      </button>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-3">
          {/* Detection banner */}
          <div className="flex items-center gap-2 p-3 rounded-xl bg-pplx-accent/10 border border-pplx-accent/20">
            <FileJson size={14} className="text-pplx-accent flex-shrink-0" />
            <span className="text-sm text-pplx-text">
              Detected format: <strong>{FORMAT_INFO[result.format].icon} {FORMAT_INFO[result.format].label}</strong>
              {" · "}
              {result.skills.length} skill{result.skills.length !== 1 ? "s" : ""} found
            </span>
          </div>

          {/* Warnings */}
          {result.warnings && result.warnings.length > 0 && (
            <div className="space-y-1">
              {result.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs">
                  <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* Errors from conversion */}
          {result.errors && result.errors.length > 0 && (
            <div className="space-y-1">
              {result.errors.map((e, i) => (
                <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                  <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                  <span>{e}</span>
                </div>
              ))}
            </div>
          )}

          {/* Skill previews */}
          {result.success && result.skills.length > 0 && (
            <>
              <div className="space-y-2">
                {result.skills.map((skill, i) => {
                  const isDuplicate = existingSkillNames.some(
                    (n) => n.toLowerCase() === skill.name.toLowerCase()
                  );
                  const isSelected = selectedSkills.has(i);

                  return (
                    <div
                      key={i}
                      onClick={() => !isDuplicate && toggleSkill(i)}
                      className={cn(
                        "rounded-xl border p-3.5 cursor-pointer transition-all",
                        isDuplicate
                          ? "border-yellow-500/30 bg-yellow-500/5 opacity-60 cursor-not-allowed"
                          : isSelected
                          ? "border-pplx-accent/50 bg-pplx-accent/5"
                          : "border-pplx-border bg-pplx-card hover:border-pplx-muted/50"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        {/* Checkbox */}
                        <div
                          className={cn(
                            "w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors",
                            isDuplicate
                              ? "border-yellow-500/40 bg-yellow-500/10"
                              : isSelected
                              ? "border-pplx-accent bg-pplx-accent"
                              : "border-pplx-border"
                          )}
                        >
                          {isSelected && <Check size={12} className="text-white" />}
                          {isDuplicate && <AlertCircle size={10} className="text-yellow-400" />}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-pplx-text">{skill.name}</span>
                            <span className="px-1.5 py-0.5 rounded-md bg-pplx-bg border border-pplx-border text-[10px] text-pplx-muted capitalize">
                              {skill.category}
                            </span>
                            <span className="px-1.5 py-0.5 rounded-md bg-pplx-accent/10 border border-pplx-accent/20 text-[10px] text-pplx-accent">
                              {FORMAT_INFO[skill.source_format].icon} {FORMAT_INFO[skill.source_format].label}
                            </span>
                            {isDuplicate && (
                              <span className="px-1.5 py-0.5 rounded-md bg-yellow-500/10 border border-yellow-500/20 text-[10px] text-yellow-400">
                                Already exists
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-pplx-muted mt-1">{skill.description}</p>
                          {skill.instructions && (
                            <div className="mt-2 bg-pplx-bg rounded-lg p-2 border border-pplx-border">
                              <p className="text-[11px] text-pplx-muted line-clamp-3 whitespace-pre-wrap font-mono">
                                {skill.instructions.slice(0, 300)}
                                {skill.instructions.length > 300 ? "..." : ""}
                              </p>
                            </div>
                          )}
                          {skill.triggers && skill.triggers.length > 0 && (
                            <div className="flex items-center gap-1 mt-2 flex-wrap">
                              <span className="text-[10px] text-pplx-muted">Triggers:</span>
                              {skill.triggers.slice(0, 5).map((t, ti) => (
                                <span
                                  key={ti}
                                  className="px-1.5 py-0.5 rounded bg-pplx-bg border border-pplx-border text-[10px] text-pplx-muted"
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Import button */}
              {importedCount > 0 ? (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
                  <Check size={14} />
                  <span>
                    Successfully imported {importedCount} skill{importedCount !== 1 ? "s" : ""}!
                  </span>
                </div>
              ) : (
                <button
                  onClick={handleImportSelected}
                  disabled={selectedSkills.size === 0 || isImporting}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isImporting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Plus size={14} />
                      Import {selectedSkills.size} Selected Skill{selectedSkills.size !== 1 ? "s" : ""}
                    </>
                  )}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Supported formats grid */}
      {!result && !jsonInput && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {FORMAT_OPTIONS.map((f) => (
            <button
              key={f}
              onClick={() => setSelectedFormat(f)}
              className={cn(
                "flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all text-center",
                selectedFormat === f
                  ? "border-pplx-accent/50 bg-pplx-accent/5"
                  : "border-pplx-border bg-pplx-card hover:border-pplx-muted/50"
              )}
            >
              <span className="text-lg">{FORMAT_INFO[f].icon}</span>
              <span className="text-xs font-medium text-pplx-text">{FORMAT_INFO[f].label}</span>
              <span className="text-[10px] text-pplx-muted leading-tight">{FORMAT_INFO[f].description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

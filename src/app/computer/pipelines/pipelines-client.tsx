"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  GitBranch,
  Plus,
  Trash2,
  Play,
  X,
  ArrowRight,
  Circle,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PipelineNode {
  id: string;
  label: string;
  prompt?: string;
  status: string;
  x: number;
  y: number;
  depends_on: string[];
}

interface Pipeline {
  id: string;
  name: string;
  description: string;
  nodes: PipelineNode[];
  created_at: string;
  updated_at: string;
}

const NODE_STATUS_CONFIG: Record<string, { icon: typeof Circle; color: string; bg: string }> = {
  pending: { icon: Circle, color: "text-gray-400", bg: "border-gray-500/30" },
  running: { icon: Loader2, color: "text-blue-400", bg: "border-blue-500/30" },
  completed: { icon: CheckCircle2, color: "text-green-400", bg: "border-green-500/30" },
  failed: { icon: AlertTriangle, color: "text-red-400", bg: "border-red-500/30" },
  queued: { icon: Clock, color: "text-amber-400", bg: "border-amber-500/30" },
};

export function PipelinesClient() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [activePipeline, setActivePipeline] = useState<Pipeline | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [addingNode, setAddingNode] = useState(false);
  const [nodeForm, setNodeForm] = useState({ label: "", prompt: "", depends_on: [] as string[] });
  const [connecting, setConnecting] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const fetchPipelines = useCallback(async () => {
    try {
      const res = await fetch("/api/pipelines");
      const data = await res.json() as { pipelines: Pipeline[] };
      setPipelines(data.pipelines || []);
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => { fetchPipelines(); }, [fetchPipelines]);

  async function createPipeline() {
    if (!newName.trim()) return;
    try {
      const res = await fetch("/api/pipelines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, description: newDesc }),
      });
      const pipeline = await res.json() as Pipeline;
      setPipelines(prev => [pipeline, ...prev]);
      setActivePipeline(pipeline);
      setIsCreating(false);
      setNewName("");
      setNewDesc("");
    } catch (err) { console.error(err); }
  }

  async function addNode() {
    if (!activePipeline || !nodeForm.label.trim()) return;
    const nodeCount = activePipeline.nodes.length;
    const newNode: PipelineNode = {
      id: `node-${Date.now()}`,
      label: nodeForm.label,
      prompt: nodeForm.prompt,
      status: "pending",
      x: 100 + (nodeCount % 4) * 220,
      y: 80 + Math.floor(nodeCount / 4) * 140,
      depends_on: nodeForm.depends_on,
    };
    const nodes = [...activePipeline.nodes, newNode];
    try {
      const res = await fetch("/api/pipelines", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activePipeline.id, nodes }),
      });
      const updated = await res.json() as Pipeline;
      setActivePipeline(updated);
      setPipelines(prev => prev.map(p => p.id === updated.id ? updated : p));
      setAddingNode(false);
      setNodeForm({ label: "", prompt: "", depends_on: [] });
    } catch (err) { console.error(err); }
  }

  async function removeNode(nodeId: string) {
    if (!activePipeline) return;
    const nodes = activePipeline.nodes
      .filter(n => n.id !== nodeId)
      .map(n => ({
        ...n,
        depends_on: n.depends_on.filter(d => d !== nodeId),
      }));
    try {
      const res = await fetch("/api/pipelines", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activePipeline.id, nodes }),
      });
      const updated = await res.json() as Pipeline;
      setActivePipeline(updated);
      setPipelines(prev => prev.map(p => p.id === updated.id ? updated : p));
    } catch (err) { console.error(err); }
  }

  async function addEdge(fromId: string, toId: string) {
    if (!activePipeline || fromId === toId) return;
    const nodes = activePipeline.nodes.map(n => {
      if (n.id === toId && !n.depends_on.includes(fromId)) {
        return { ...n, depends_on: [...n.depends_on, fromId] };
      }
      return n;
    });
    try {
      const res = await fetch("/api/pipelines", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activePipeline.id, nodes }),
      });
      const updated = await res.json() as Pipeline;
      setActivePipeline(updated);
      setPipelines(prev => prev.map(p => p.id === updated.id ? updated : p));
    } catch (err) { console.error(err); }
    setConnecting(null);
  }

  async function deletePipeline(id: string) {
    if (!confirm("Delete this pipeline?")) return;
    await fetch(`/api/pipelines?id=${id}`, { method: "DELETE" });
    setPipelines(prev => prev.filter(p => p.id !== id));
    if (activePipeline?.id === id) setActivePipeline(null);
  }

  async function runPipeline() {
    if (!activePipeline) return;
    // Create tasks for each node in topological order and link dependencies
    const orderedNodes = topologicalSort(activePipeline.nodes);
    const taskMap: Record<string, string> = {};

    for (const node of orderedNodes) {
      try {
        const depends = node.depends_on.map(d => taskMap[d]).filter(Boolean);
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: node.label,
            prompt: node.prompt || node.label,
            model: "auto",
            depends_on: depends[0] || undefined,
          }),
        });
        const task = await res.json() as { id: string };
        taskMap[node.id] = task.id;
      } catch (err) { console.error(err); }
    }

    // Update node statuses
    const nodes = activePipeline.nodes.map(n => ({
      ...n,
      status: "queued",
    }));
    await fetch("/api/pipelines", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: activePipeline.id, nodes }),
    });

    alert(`Pipeline launched! ${orderedNodes.length} tasks created.`);
    fetchPipelines();
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
            <GitBranch size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-pplx-text">Pipelines</h1>
            <p className="text-xs text-pplx-muted">
              Visual DAG task dependencies · {pipelines.length} pipelines
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-pplx-accent hover:bg-pplx-accent-hover text-white text-sm font-medium transition-colors"
        >
          <Plus size={14} />
          New Pipeline
        </button>
      </div>

      {/* Pipeline list / Canvas */}
      {activePipeline ? (
        <div>
          {/* Pipeline header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setActivePipeline(null)}
                className="p-2 rounded-lg bg-pplx-bg border border-pplx-border text-pplx-muted hover:text-pplx-text transition-colors"
              >
                ←
              </button>
              <div>
                <h2 className="text-base font-semibold text-pplx-text">{activePipeline.name}</h2>
                <p className="text-xs text-pplx-muted">{activePipeline.nodes.length} nodes</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setAddingNode(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pplx-bg border border-pplx-border text-pplx-muted hover:text-pplx-text text-xs transition-colors"
              >
                <Plus size={12} /> Add Node
              </button>
              {activePipeline.nodes.length > 0 && (
                <button
                  onClick={runPipeline}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/20 border border-green-500/30 text-green-400 text-xs hover:bg-green-500/30 transition-colors"
                >
                  <Play size={12} /> Run Pipeline
                </button>
              )}
            </div>
          </div>

          {/* Canvas */}
          <div
            ref={canvasRef}
            className="relative rounded-xl border border-pplx-border bg-pplx-bg overflow-hidden"
            style={{ height: 500, background: "radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 0) 0 0 / 24px 24px" }}
          >
            {/* Edges */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
              {activePipeline.nodes.flatMap(node =>
                node.depends_on.map(depId => {
                  const from = activePipeline.nodes.find(n => n.id === depId);
                  if (!from) return null;
                  return (
                    <line
                      key={`${depId}-${node.id}`}
                      x1={from.x + 90}
                      y1={from.y + 40}
                      x2={node.x + 90}
                      y2={node.y + 40}
                      stroke="var(--accent)"
                      strokeWidth={2}
                      strokeDasharray="6 3"
                      opacity={0.5}
                      markerEnd="url(#arrowhead)"
                    />
                  );
                })
              )}
              <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                  <polygon points="0 0, 10 3.5, 0 7" fill="var(--accent)" opacity="0.5" />
                </marker>
              </defs>
            </svg>

            {/* Nodes */}
            {activePipeline.nodes.map(node => {
              const cfg = NODE_STATUS_CONFIG[node.status] || NODE_STATUS_CONFIG.pending;
              const Icon = cfg.icon;
              return (
                <div
                  key={node.id}
                  className={cn(
                    "absolute rounded-xl border-2 bg-pplx-card p-3 cursor-pointer shadow-lg transition-all hover:shadow-xl group",
                    cfg.bg,
                    connecting === node.id && "ring-2 ring-pplx-accent"
                  )}
                  style={{ left: node.x, top: node.y, width: 180, zIndex: 2 }}
                  onClick={() => {
                    if (connecting && connecting !== node.id) {
                      addEdge(connecting, node.id);
                    } else {
                      setConnecting(connecting === node.id ? null : node.id);
                    }
                  }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Icon size={14} className={cn(cfg.color, node.status === "running" && "animate-spin")} />
                      <span className="text-xs font-semibold text-pplx-text truncate">{node.label}</span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeNode(node.id); }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-pplx-muted hover:text-red-400 transition-all"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                  {node.prompt && (
                    <p className="text-[10px] text-pplx-muted line-clamp-2 mt-1">{node.prompt}</p>
                  )}
                  {node.depends_on.length > 0 && (
                    <div className="flex items-center gap-1 mt-1.5">
                      <ArrowRight size={8} className="text-pplx-muted" />
                      <span className="text-[9px] text-pplx-muted">
                        {node.depends_on.length} dep{node.depends_on.length > 1 ? "s" : ""}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}

            {activePipeline.nodes.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-pplx-muted">
                <GitBranch size={32} className="mb-2 opacity-30" />
                <p className="text-sm">Add nodes to build your pipeline</p>
                <p className="text-xs mt-1 opacity-70">Click nodes to connect them with dependency edges</p>
              </div>
            )}

            {connecting && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-pplx-accent text-white text-xs px-3 py-1.5 rounded-full z-10">
                Click another node to connect, or click same node to cancel
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Pipeline list */
        <div>
          {pipelines.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-pplx-muted">
              <GitBranch size={40} className="mb-3 opacity-30" />
              <p className="text-sm font-medium">No pipelines yet</p>
              <p className="text-xs mt-1 opacity-70">Create a pipeline to orchestrate task workflows</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {pipelines.map(pipeline => (
                <div
                  key={pipeline.id}
                  onClick={() => setActivePipeline(pipeline)}
                  className="rounded-xl border border-pplx-border bg-pplx-card p-4 cursor-pointer hover:border-pplx-muted/50 transition-all group"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-cyan-500/15 flex items-center justify-center">
                        <GitBranch size={14} className="text-cyan-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-pplx-text">{pipeline.name}</p>
                        <p className="text-xs text-pplx-muted">{pipeline.nodes.length} nodes</p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deletePipeline(pipeline.id); }}
                      className="p-1.5 rounded-lg text-pplx-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  {pipeline.description && (
                    <p className="text-xs text-pplx-muted mt-2 line-clamp-2">{pipeline.description}</p>
                  )}
                  <p className="text-[10px] text-pplx-muted mt-2">
                    Updated {new Date(pipeline.updated_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Pipeline Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setIsCreating(false)} />
          <div className="relative z-10 bg-pplx-card border border-pplx-border rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-pplx-text">New Pipeline</h3>
              <button onClick={() => setIsCreating(false)} className="p-1.5 rounded-lg text-pplx-muted hover:text-pplx-text">
                <X size={14} />
              </button>
            </div>
            <div className="space-y-3">
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Pipeline name"
                className="w-full bg-pplx-bg border border-pplx-border rounded-xl px-3.5 py-2.5 text-sm text-pplx-text placeholder:text-pplx-muted outline-none focus:border-pplx-accent/50"
              />
              <textarea
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder="Description (optional)"
                rows={2}
                className="w-full bg-pplx-bg border border-pplx-border rounded-xl px-3.5 py-2.5 text-sm text-pplx-text placeholder:text-pplx-muted outline-none focus:border-pplx-accent/50 resize-none"
              />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setIsCreating(false)} className="flex-1 py-2 rounded-xl text-sm bg-pplx-bg border border-pplx-border text-pplx-muted">Cancel</button>
              <button onClick={createPipeline} disabled={!newName.trim()} className="flex-1 py-2 rounded-xl text-sm bg-pplx-accent text-white hover:bg-pplx-accent-hover disabled:opacity-50">Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Node Modal */}
      {addingNode && activePipeline && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setAddingNode(false)} />
          <div className="relative z-10 bg-pplx-card border border-pplx-border rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-pplx-text">Add Node</h3>
              <button onClick={() => setAddingNode(false)} className="p-1.5 rounded-lg text-pplx-muted hover:text-pplx-text">
                <X size={14} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-pplx-muted font-medium block mb-1.5">Label</label>
                <input
                  value={nodeForm.label}
                  onChange={e => setNodeForm({ ...nodeForm, label: e.target.value })}
                  placeholder="e.g. Research Phase"
                  className="w-full bg-pplx-bg border border-pplx-border rounded-xl px-3.5 py-2.5 text-sm text-pplx-text placeholder:text-pplx-muted outline-none focus:border-pplx-accent/50"
                />
              </div>
              <div>
                <label className="text-xs text-pplx-muted font-medium block mb-1.5">Task Prompt</label>
                <textarea
                  value={nodeForm.prompt}
                  onChange={e => setNodeForm({ ...nodeForm, prompt: e.target.value })}
                  placeholder="What this node should do..."
                  rows={3}
                  className="w-full bg-pplx-bg border border-pplx-border rounded-xl px-3.5 py-2.5 text-sm text-pplx-text placeholder:text-pplx-muted outline-none focus:border-pplx-accent/50 resize-none"
                />
              </div>
              {activePipeline.nodes.length > 0 && (
                <div>
                  <label className="text-xs text-pplx-muted font-medium block mb-1.5">Dependencies</label>
                  <div className="flex flex-wrap gap-1.5">
                    {activePipeline.nodes.map(n => (
                      <button
                        key={n.id}
                        onClick={() => {
                          const deps = nodeForm.depends_on.includes(n.id)
                            ? nodeForm.depends_on.filter(d => d !== n.id)
                            : [...nodeForm.depends_on, n.id];
                          setNodeForm({ ...nodeForm, depends_on: deps });
                        }}
                        className={cn(
                          "px-2 py-1 rounded-lg text-xs transition-colors",
                          nodeForm.depends_on.includes(n.id)
                            ? "bg-pplx-accent/20 text-pplx-accent border border-pplx-accent/30"
                            : "bg-pplx-bg border border-pplx-border text-pplx-muted hover:text-pplx-text"
                        )}
                      >
                        {n.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setAddingNode(false)} className="flex-1 py-2 rounded-xl text-sm bg-pplx-bg border border-pplx-border text-pplx-muted">Cancel</button>
              <button onClick={addNode} disabled={!nodeForm.label.trim()} className="flex-1 py-2 rounded-xl text-sm bg-pplx-accent text-white hover:bg-pplx-accent-hover disabled:opacity-50">Add Node</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Topological sort for execution order
function topologicalSort(nodes: PipelineNode[]): PipelineNode[] {
  const sorted: PipelineNode[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  function visit(id: string) {
    if (visited.has(id)) return;
    if (visiting.has(id)) return; // cycle
    visiting.add(id);
    const node = nodeMap.get(id);
    if (!node) return;
    for (const dep of node.depends_on) {
      visit(dep);
    }
    visiting.delete(id);
    visited.add(id);
    sorted.push(node);
  }

  for (const node of nodes) {
    visit(node.id);
  }

  return sorted;
}

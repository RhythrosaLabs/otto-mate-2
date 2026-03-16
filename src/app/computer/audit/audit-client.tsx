"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Shield,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  Cpu,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AuditLog {
  id: string;
  event_type: string;
  tool_name: string | null;
  model: string | null;
  task_id: string | null;
  duration_ms: number | null;
  success: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

const EVENT_TYPE_CONFIG: Record<string, { icon: typeof Zap; color: string; label: string }> = {
  tool_call: { icon: Zap, color: "text-blue-400", label: "Tool Call" },
  model_call: { icon: Cpu, color: "text-purple-400", label: "Model Call" },
  task_complete: { icon: CheckCircle2, color: "text-green-400", label: "Task Complete" },
  task_error: { icon: AlertTriangle, color: "text-red-400", label: "Task Error" },
};

export function AuditClient() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [toolNames, setToolNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [eventType, setEventType] = useState("");
  const [toolFilter, setToolFilter] = useState("");
  const [successFilter, setSuccessFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 30;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", pageSize.toString());
      params.set("offset", (page * pageSize).toString());
      if (eventType) params.set("event_type", eventType);
      if (toolFilter) params.set("tool_name", toolFilter);
      if (successFilter) params.set("success", successFilter);

      const res = await fetch(`/api/audit?${params}`);
      const data = await res.json() as { logs: AuditLog[]; total: number };
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error("Failed to fetch audit logs:", err);
    }
    setLoading(false);
  }, [page, eventType, toolFilter, successFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    fetch("/api/audit?section=tool_names")
      .then(r => r.json())
      .then(d => setToolNames((d as { tools: string[] }).tools || []))
      .catch(console.error);
  }, []);

  const totalPages = Math.ceil(total / pageSize);

  const filteredLogs = searchQuery
    ? logs.filter(l =>
        l.tool_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.model?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.event_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.task_id?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : logs;

  function formatDuration(ms: number | null): string {
    if (!ms) return "—";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  function formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
            <Shield size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-pplx-text">Audit Trail</h1>
            <p className="text-xs text-pplx-muted">
              Complete log of all agent actions · {total} events
            </p>
          </div>
        </div>
        <button
          onClick={fetchLogs}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-pplx-bg border border-pplx-border text-pplx-muted hover:text-pplx-text text-sm transition-colors"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-pplx-muted" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search logs..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-pplx-bg border border-pplx-border text-sm text-pplx-text placeholder:text-pplx-muted outline-none focus:border-pplx-accent/50 transition-colors"
          />
        </div>

        <select
          value={eventType}
          onChange={e => { setEventType(e.target.value); setPage(0); }}
          className="px-3 py-2 rounded-xl bg-pplx-bg border border-pplx-border text-sm text-pplx-text outline-none"
        >
          <option value="">All Events</option>
          <option value="tool_call">Tool Calls</option>
          <option value="model_call">Model Calls</option>
          <option value="task_complete">Completions</option>
          <option value="task_error">Errors</option>
        </select>

        <select
          value={toolFilter}
          onChange={e => { setToolFilter(e.target.value); setPage(0); }}
          className="px-3 py-2 rounded-xl bg-pplx-bg border border-pplx-border text-sm text-pplx-text outline-none"
        >
          <option value="">All Tools</option>
          {toolNames.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <select
          value={successFilter}
          onChange={e => { setSuccessFilter(e.target.value); setPage(0); }}
          className="px-3 py-2 rounded-xl bg-pplx-bg border border-pplx-border text-sm text-pplx-text outline-none"
        >
          <option value="">All Status</option>
          <option value="true">Success</option>
          <option value="false">Failed</option>
        </select>
      </div>

      {/* Counts */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Events", value: total, icon: Filter, color: "text-pplx-accent" },
          { label: "Tool Calls", value: logs.filter(l => l.event_type === "tool_call").length, icon: Zap, color: "text-blue-400" },
          { label: "Errors", value: logs.filter(l => !l.success).length, icon: AlertTriangle, color: "text-red-400" },
          { label: "Avg Duration", value: formatDuration(Math.round(logs.reduce((s, l) => s + (l.duration_ms || 0), 0) / Math.max(logs.length, 1))), icon: Clock, color: "text-amber-400" },
        ].map(stat => (
          <div key={stat.label} className="rounded-xl border border-pplx-border bg-pplx-card p-3">
            <div className="flex items-center gap-2 mb-1">
              <stat.icon size={12} className={stat.color} />
              <span className="text-[10px] text-pplx-muted uppercase tracking-wider">{stat.label}</span>
            </div>
            <p className="text-lg font-semibold text-pplx-text">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Log Table */}
      <div className="rounded-xl border border-pplx-border bg-pplx-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-pplx-muted text-sm">
            Loading audit logs...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-pplx-muted">
            <Shield size={32} className="mb-2 opacity-30" />
            <p className="text-sm">No audit logs found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-pplx-border text-pplx-muted text-xs">
                  <th className="text-left px-4 py-2.5 font-medium">Status</th>
                  <th className="text-left px-4 py-2.5 font-medium">Event</th>
                  <th className="text-left px-4 py-2.5 font-medium">Tool / Model</th>
                  <th className="text-left px-4 py-2.5 font-medium">Duration</th>
                  <th className="text-left px-4 py-2.5 font-medium">Time</th>
                  <th className="text-left px-4 py-2.5 font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map(log => {
                  const config = EVENT_TYPE_CONFIG[log.event_type] || EVENT_TYPE_CONFIG.tool_call;
                  const Icon = config.icon;
                  return (
                    <tr key={log.id} className="border-b border-pplx-border/50 hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-2.5">
                        {log.success ? (
                          <CheckCircle2 size={14} className="text-green-400" />
                        ) : (
                          <XCircle size={14} className="text-red-400" />
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <Icon size={12} className={config.color} />
                          <span className="text-pplx-text text-xs font-medium">{config.label}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={cn(
                          "px-2 py-0.5 rounded-md text-xs font-mono",
                          log.tool_name ? "bg-blue-500/10 text-blue-400" : "bg-purple-500/10 text-purple-400"
                        )}>
                          {log.tool_name || log.model || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-pplx-muted text-xs font-mono">
                        {formatDuration(log.duration_ms)}
                      </td>
                      <td className="px-4 py-2.5 text-pplx-muted text-xs">
                        {formatTime(log.created_at)}
                      </td>
                      <td className="px-4 py-2.5 text-pplx-muted text-xs max-w-48 truncate">
                        {log.task_id ? `Task: ${log.task_id.slice(0, 8)}...` : ""}
                        {log.metadata?.error ? ` Error: ${String(log.metadata.error).slice(0, 50)}` : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-pplx-muted">
            Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <button
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              className="p-2 rounded-lg bg-pplx-bg border border-pplx-border text-pplx-muted hover:text-pplx-text disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs text-pplx-muted">
              Page {page + 1} of {totalPages}
            </span>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
              className="p-2 rounded-lg bg-pplx-bg border border-pplx-border text-pplx-muted hover:text-pplx-text disabled:opacity-30 transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

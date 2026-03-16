"use client";

import { useState, useEffect } from "react";
import {
  BarChart3,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  Zap,
  RefreshCw,
  Cpu,
} from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
import type { AnalyticsSummary } from "@/lib/types";

export function AnalyticsClient() {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch("/api/analytics");
      if (res.ok) setData(await res.json() as AnalyticsSummary);
    } catch (err) {
      console.error("Failed to fetch analytics:", err);
    }
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw size={24} className="animate-spin text-pplx-muted" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-pplx-muted text-center">
        No analytics data available yet. Run some tasks to see insights.
      </div>
    );
  }

  const maxToolCount = Math.max(...data.top_tools.map(t => t.count), 1);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pplx-accent to-purple-500 flex items-center justify-center">
            <BarChart3 size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-pplx-text">Agent Analytics</h1>
            <p className="text-xs text-pplx-muted">Performance insights &amp; self-improvement metrics</p>
          </div>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-pplx-border text-xs text-pplx-muted hover:text-pplx-text hover:bg-white/5 transition-colors"
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          icon={<CheckCircle2 size={18} />}
          label="Total Tasks"
          value={String(data.total_tasks)}
          color="text-green-400"
        />
        <KpiCard
          icon={<TrendingUp size={18} />}
          label="Success Rate"
          value={`${(data.success_rate * 100).toFixed(0)}%`}
          color={data.success_rate >= 0.8 ? "text-green-400" : data.success_rate >= 0.5 ? "text-yellow-400" : "text-red-400"}
        />
        <KpiCard
          icon={<Clock size={18} />}
          label="Avg Duration"
          value={formatDuration(data.avg_duration_ms)}
          color="text-blue-400"
        />
        <KpiCard
          icon={<Zap size={18} />}
          label="Tools Used"
          value={String(data.top_tools.reduce((s, t) => s + t.count, 0))}
          color="text-purple-400"
        />
      </div>

      {/* Main Grid */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Top Tools */}
        <div className="rounded-xl border border-pplx-border bg-pplx-card p-5">
          <h2 className="text-sm font-medium text-pplx-text mb-4 flex items-center gap-2">
            <Zap size={14} className="text-pplx-accent" />
            Top Tools
          </h2>
          {data.top_tools.length === 0 ? (
            <p className="text-xs text-pplx-muted">No tool usage recorded yet</p>
          ) : (
            <div className="space-y-3">
              {data.top_tools.map((tool) => (
                <div key={tool.name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-pplx-text font-mono">{tool.name}</span>
                    <span className="text-pplx-muted">
                      {tool.count}x &middot; {(tool.success_rate * 100).toFixed(0)}% ok
                    </span>
                  </div>
                  <div className="h-1.5 bg-pplx-bg rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        tool.success_rate >= 0.9 ? "bg-green-500" : tool.success_rate >= 0.7 ? "bg-yellow-500" : "bg-red-500"
                      )}
                      style={{ width: `${(tool.count / maxToolCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Model Usage */}
        <div className="rounded-xl border border-pplx-border bg-pplx-card p-5">
          <h2 className="text-sm font-medium text-pplx-text mb-4 flex items-center gap-2">
            <Cpu size={14} className="text-pplx-accent" />
            Model Usage
          </h2>
          {data.model_usage.length === 0 ? (
            <p className="text-xs text-pplx-muted">No model usage recorded yet</p>
          ) : (
            <div className="space-y-3">
              {data.model_usage.map((m) => (
                <div key={m.model} className="flex items-center justify-between py-2 border-b border-pplx-border/50 last:border-0">
                  <div>
                    <div className="text-sm text-pplx-text font-mono">{m.model}</div>
                    <div className="text-[10px] text-pplx-muted">{m.count} calls</div>
                  </div>
                  <div className="text-xs text-pplx-muted">
                    avg ${m.avg_cost.toFixed(4)}/call
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Daily Activity (last 30 days) */}
        <div className="rounded-xl border border-pplx-border bg-pplx-card p-5">
          <h2 className="text-sm font-medium text-pplx-text mb-4 flex items-center gap-2">
            <BarChart3 size={14} className="text-pplx-accent" />
            Daily Activity (30d)
          </h2>
          {data.daily_tasks.length === 0 ? (
            <p className="text-xs text-pplx-muted">No activity data yet</p>
          ) : (
            <div className="flex items-end gap-1 h-24">
              {data.daily_tasks.slice(-30).map((d) => {
                const max = Math.max(...data.daily_tasks.map(x => x.count), 1);
                const height = (d.count / max) * 100;
                const successPct = d.count > 0 ? d.successes / d.count : 0;
                return (
                  <div
                    key={d.date}
                    className="flex-1 rounded-t group relative"
                    style={{ height: `${Math.max(height, 4)}%` }}
                    title={`${d.date}: ${d.count} tasks (${d.successes} ok)`}
                  >
                    <div
                      className={cn(
                        "w-full h-full rounded-t transition-colors",
                        successPct >= 0.8 ? "bg-green-500/60 hover:bg-green-500" : "bg-yellow-500/60 hover:bg-yellow-500"
                      )}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Errors */}
        <div className="rounded-xl border border-pplx-border bg-pplx-card p-5">
          <h2 className="text-sm font-medium text-pplx-text mb-4 flex items-center gap-2">
            <XCircle size={14} className="text-red-400" />
            Recent Errors
          </h2>
          {data.recent_errors.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-green-400">
              <CheckCircle2 size={14} />
              No errors recorded — all systems operational
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {data.recent_errors.map((err, i) => (
                <div key={`${err.timestamp}-${i}`} className="text-xs p-2 rounded-lg bg-red-500/5 border border-red-500/10">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-red-400">{err.tool}</span>
                    <span className="text-pplx-muted">{new Date(err.timestamp).toLocaleDateString()}</span>
                  </div>
                  <p className="text-pplx-muted line-clamp-2">{err.error}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl border border-pplx-border bg-pplx-card p-4">
      <div className={cn("mb-2", color)}>{icon}</div>
      <div className="text-2xl font-bold text-pplx-text">{value}</div>
      <div className="text-xs text-pplx-muted mt-0.5">{label}</div>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import type { ScheduledTask } from "@/lib/types";

const SCHEDULE_TYPE_LABELS: Record<string, string> = {
  once: "One-time",
  interval: "Recurring Interval",
  daily: "Daily",
  weekly: "Weekly",
  cron: "Cron Expression",
};

export default function ScheduledTasksClient() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    prompt: "",
    schedule_type: "once" as ScheduledTask["schedule_type"],
    schedule_expr: "",
    next_run_at: "",
    model: "auto",
    delete_after_run: false,
  });

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/scheduled-tasks");
      if (res.ok) setTasks(await res.json());
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/scheduled-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          next_run_at: formData.next_run_at
            ? new Date(formData.next_run_at).toISOString()
            : new Date().toISOString(),
        }),
      });
      if (res.ok) {
        setShowForm(false);
        setFormData({ name: "", prompt: "", schedule_type: "once", schedule_expr: "", next_run_at: "", model: "auto", delete_after_run: false });
        fetchTasks();
      }
    } catch {
      /* ignore */
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    await fetch("/api/scheduled-tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle", id, enabled }),
    });
    fetchTasks();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/scheduled-tasks?id=${id}`, { method: "DELETE" });
    fetchTasks();
  };

  const handleRunDue = async () => {
    const res = await fetch("/api/scheduled-tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "run-due" }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.ran > 0) {
        alert(`Ran ${data.ran} scheduled task(s)!`);
      } else {
        alert("No tasks are due right now.");
      }
      fetchTasks();
    }
  };

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleString();
    } catch {
      return d;
    }
  };

  const isDue = (nextRunAt: string) => new Date(nextRunAt) <= new Date();

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-5xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <span className="text-3xl">⏰</span> Scheduled Tasks
            </h1>
            <p className="text-pplx-muted mt-1">
              Automate recurring tasks with scheduling — inspired by OpenClaw&apos;s cron system
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleRunDue}
              className="px-4 py-2 rounded-lg bg-pplx-card text-pplx-muted hover:text-white hover:bg-pplx-border border border-pplx-border transition-colors text-sm"
            >
              ▶ Run Due Tasks
            </button>
            <button
              onClick={() => setShowForm(!showForm)}
              className="px-4 py-2 rounded-lg bg-pplx-accent text-white hover:bg-pplx-accent-hover transition-colors text-sm font-medium"
            >
              + New Schedule
            </button>
          </div>
        </div>

        {/* Create Form */}
        {showForm && (
          <form onSubmit={handleCreate} className="bg-pplx-card border border-pplx-border rounded-xl p-6 mb-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-pplx-muted mb-1">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-pplx-bg border border-pplx-border rounded-lg text-white text-sm"
                  placeholder="Morning briefing"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-pplx-muted mb-1">Model</label>
                <select
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  className="w-full px-3 py-2 bg-pplx-bg border border-pplx-border rounded-lg text-white text-sm"
                >
                  <option value="auto">Auto (Recommended)</option>
                  <option value="claude-opus-4-6">Claude Opus 4.6</option>
                  <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
                  <option value="gpt-4o">GPT-4o</option>
                  <option value="gpt-4o-mini">GPT-4o Mini</option>
                  <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm text-pplx-muted mb-1">Prompt</label>
              <textarea
                value={formData.prompt}
                onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
                className="w-full px-3 py-2 bg-pplx-bg border border-pplx-border rounded-lg text-white text-sm min-h-[80px]"
                placeholder="Summarize my overnight emails and create a daily brief..."
                required
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-pplx-muted mb-1">Schedule Type</label>
                <select
                  value={formData.schedule_type}
                  onChange={(e) => setFormData({ ...formData, schedule_type: e.target.value as ScheduledTask["schedule_type"] })}
                  className="w-full px-3 py-2 bg-pplx-bg border border-pplx-border rounded-lg text-white text-sm"
                >
                  <option value="once">One-time</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="interval">Interval (ms)</option>
                  <option value="cron">Cron Expression</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-pplx-muted mb-1">
                  {formData.schedule_type === "daily" ? "Time (HH:MM)" :
                   formData.schedule_type === "interval" ? "Interval (ms)" :
                   formData.schedule_type === "cron" ? "Cron Expression" : "Schedule Expression"}
                </label>
                <input
                  type="text"
                  value={formData.schedule_expr}
                  onChange={(e) => setFormData({ ...formData, schedule_expr: e.target.value })}
                  className="w-full px-3 py-2 bg-pplx-bg border border-pplx-border rounded-lg text-white text-sm"
                  placeholder={formData.schedule_type === "daily" ? "09:00" : formData.schedule_type === "interval" ? "3600000" : formData.schedule_type === "cron" ? "0 9 * * *" : ""}
                />
              </div>
              <div>
                <label className="block text-sm text-pplx-muted mb-1">First Run At</label>
                <input
                  type="datetime-local"
                  value={formData.next_run_at}
                  onChange={(e) => setFormData({ ...formData, next_run_at: e.target.value })}
                  className="w-full px-3 py-2 bg-pplx-bg border border-pplx-border rounded-lg text-white text-sm"
                />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-pplx-muted">
                <input
                  type="checkbox"
                  checked={formData.delete_after_run}
                  onChange={(e) => setFormData({ ...formData, delete_after_run: e.target.checked })}
                  className="rounded"
                />
                Delete after successful run
              </label>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-pplx-muted hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-pplx-accent text-white hover:bg-pplx-accent-hover transition-colors text-sm font-medium"
              >
                Create Schedule
              </button>
            </div>
          </form>
        )}

        {/* Tasks List */}
        {loading ? (
          <div className="text-center text-pplx-muted py-12">Loading...</div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">⏰</div>
            <h3 className="text-lg font-medium text-white mb-2">No scheduled tasks yet</h3>
            <p className="text-pplx-muted text-sm mb-6 max-w-md mx-auto">
              Set up recurring tasks to automate your workflows. Schedule daily briefs,
              weekly reports, periodic data collection, and more.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 rounded-lg bg-pplx-accent text-white hover:bg-pplx-accent-hover transition-colors text-sm font-medium"
            >
              Create Your First Schedule
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <div
                key={task.id}
                className={`bg-pplx-card border rounded-xl p-4 transition-colors ${
                  task.enabled ? "border-pplx-border" : "border-pplx-border/50 opacity-60"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-white font-medium truncate">{task.name}</h3>
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        task.enabled
                          ? isDue(task.next_run_at)
                            ? "bg-green-500/20 text-green-400"
                            : "bg-blue-500/20 text-blue-400"
                          : "bg-pplx-border text-pplx-muted/60"
                      }`}>
                        {task.enabled
                          ? isDue(task.next_run_at) ? "Due" : "Active"
                          : "Disabled"}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-pplx-card text-pplx-muted text-xs">
                        {SCHEDULE_TYPE_LABELS[task.schedule_type] || task.schedule_type}
                      </span>
                    </div>
                    <p className="text-pplx-muted text-sm truncate">{task.prompt}</p>
                    <div className="flex gap-4 mt-2 text-xs text-pplx-muted/60">
                      <span>Next: {formatDate(task.next_run_at)}</span>
                      {task.last_run_at && <span>Last: {formatDate(task.last_run_at)}</span>}
                      <span>Model: {task.model}</span>
                      {task.schedule_expr && <span>Expr: {task.schedule_expr}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => handleToggle(task.id, !task.enabled)}
                      className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                        task.enabled
                          ? "bg-pplx-border text-pplx-muted hover:text-white"
                          : "bg-pplx-accent/20 text-pplx-accent hover:bg-pplx-accent/30"
                      }`}
                    >
                      {task.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      onClick={() => handleDelete(task.id)}
                      className="px-3 py-1.5 rounded-lg text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Info footer */}
        <div className="mt-8 p-4 bg-pplx-card border border-pplx-border rounded-xl">
          <h4 className="text-white text-sm font-medium mb-2">💡 How Scheduling Works</h4>
          <ul className="text-pplx-muted text-xs space-y-1">
            <li>• <strong>One-time</strong>: Runs once at the specified time, then disables (or deletes)</li>
            <li>• <strong>Daily</strong>: Runs every day at the specified time (HH:MM format)</li>
            <li>• <strong>Weekly</strong>: Runs once per week at the scheduled time</li>
            <li>• <strong>Interval</strong>: Runs every N milliseconds (e.g., 3600000 = 1 hour)</li>
            <li>• <strong>Cron</strong>: Standard cron expression (e.g., &quot;0 9 * * *&quot; = 9 AM daily)</li>
            <li>• Click &quot;Run Due Tasks&quot; to manually trigger any tasks that are past their scheduled time</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, Loader2, CheckCircle2, Clock, AlertCircle, PauseCircle, TimerIcon, Trash2, Webhook, CalendarClock, LayoutTemplate, ArrowUpCircle, ArrowDownCircle, MinusCircle, Link2, Flame, Calendar, List, ChevronLeft, ChevronRight } from "lucide-react";
import { cn, formatRelativeTime, getStatusBgColor, truncate } from "@/lib/utils";
import type { Task } from "@/lib/types";

interface Props {
  initialTasks: Task[];
}

export function TasksClientPage({ initialTasks }: Props) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"recent" | "priority">("recent");
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const router = useRouter();

  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 } as const;

  const filtered = tasks.filter((t) => {
    const matchesSearch =
      !search ||
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "all" || t.status === filter;
    return matchesSearch && matchesFilter;
  }).sort((a, b) => {
    if (sortBy === "priority") {
      return (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2);
    }
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  async function deleteTask(id: string) {
    if (!confirm("Delete this task?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
      if (res.ok) setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      console.error("Failed to delete task:", err);
    }
    setDeletingId(null);
  }

  const statusCounts = tasks.reduce(
    (acc, t) => {
      acc[t.status] = (acc[t.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-8 pt-8 pb-4 border-b border-pplx-border">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold text-pplx-text">Tasks</h1>
          <Link
            href="/computer"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-pplx-accent text-white text-sm font-medium hover:bg-pplx-accent-hover transition-colors"
          >
            <Plus size={15} />
            New Task
          </Link>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 mb-4">
          {[
            { label: "All", value: tasks.length, key: "all" },
            { label: "Running", value: statusCounts["running"] || 0, key: "running" },
            { label: "Completed", value: statusCounts["completed"] || 0, key: "completed" },
            { label: "Failed", value: statusCounts["failed"] || 0, key: "failed" },
          ].map((stat) => (
            <button
              key={stat.key}
              onClick={() => setFilter(stat.key)}
              className={cn(
                "text-sm px-3 py-1.5 rounded-lg transition-colors",
                filter === stat.key
                  ? "bg-white/10 text-pplx-text font-medium"
                  : "text-pplx-muted hover:text-pplx-text"
              )}
            >
              {stat.label}{" "}
              <span className={cn("ml-1", filter === stat.key ? "text-pplx-accent" : "text-pplx-muted")}>
                {stat.value}
              </span>
            </button>
          ))}
        </div>

        {/* Search & Sort */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-pplx-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks..."
              className="w-full bg-pplx-card border border-pplx-border rounded-xl pl-9 pr-4 py-2.5 text-sm text-pplx-text placeholder:text-pplx-muted outline-none focus:border-pplx-accent/50 transition-colors"
            />
          </div>
          <button
            onClick={() => setSortBy(sortBy === "recent" ? "priority" : "recent")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-xs font-medium transition-colors whitespace-nowrap",
              sortBy === "priority"
                ? "bg-pplx-accent/10 border-pplx-accent/30 text-pplx-accent"
                : "bg-pplx-card border-pplx-border text-pplx-muted hover:text-pplx-text"
            )}
          >
            <ArrowUpCircle size={12} />
            {sortBy === "priority" ? "By Priority" : "By Recent"}
          </button>
          <button
            onClick={() => setViewMode(viewMode === "list" ? "calendar" : "list")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-xs font-medium transition-colors whitespace-nowrap",
              viewMode === "calendar"
                ? "bg-pplx-accent/10 border-pplx-accent/30 text-pplx-accent"
                : "bg-pplx-card border-pplx-border text-pplx-muted hover:text-pplx-text"
            )}
          >
            {viewMode === "calendar" ? <List size={12} /> : <Calendar size={12} />}
            {viewMode === "calendar" ? "List View" : "Calendar"}
          </button>
        </div>
      </div>

      {/* Task list / Calendar view */}
      <div className="flex-1 overflow-y-auto px-8 py-4">
        {viewMode === "calendar" ? (
          <CalendarView tasks={filtered} month={calendarMonth} onMonthChange={setCalendarMonth} />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-pplx-muted">
            <Clock size={36} className="mb-3 opacity-40" />
            <p className="text-sm">
              {tasks.length === 0
                ? "No tasks yet. Start your first task!"
                : "No tasks match your search."}
            </p>
            {tasks.length === 0 && (
              <Link
                href="/computer"
                className="mt-4 text-pplx-accent text-sm hover:underline"
              >
                Start a task →
              </Link>
            )}
          </div>
        ) : (
          <div className="grid gap-2">
            {filtered.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onDelete={() => deleteTask(task.id)}
                isDeleting={deletingId === task.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 size={14} className="text-green-400" />;
    case "running":
      return <Loader2 size={14} className="text-pplx-accent animate-spin" />;
    case "failed":
      return <AlertCircle size={14} className="text-red-400" />;
    case "paused":
    case "waiting_for_input":
      return <PauseCircle size={14} className="text-yellow-400" />;
    default:
      return <TimerIcon size={14} className="text-pplx-muted" />;
  }
}

function TaskCard({
  task,
  onDelete,
  isDeleting,
}: {
  task: Task;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  return (
    <div className="group relative task-card rounded-xl border border-pplx-border bg-pplx-card p-4 transition-all hover:border-pplx-border/80">
      <Link href={`/computer/tasks/${task.id}`} className="block">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            <StatusIcon status={task.status} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-medium text-pplx-text truncate">{task.title}</h3>
              <span
                className={cn(
                  "status-badge px-2 py-0.5 rounded-full flex-shrink-0",
                  getStatusBgColor(task.status)
                )}
              >
                {task.status.replace("_", " ")}
              </span>
              <PriorityBadge priority={task.priority} />
            </div>
            {task.description && (
              <p className="text-xs text-pplx-muted line-clamp-1 mb-2">
                {truncate(task.description, 120)}
              </p>
            )}
            <div className="flex items-center gap-3 text-xs text-pplx-muted">
              <span>{formatRelativeTime(task.created_at)}</span>
              {task.depends_on && (
                <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 text-[10px] font-medium border border-purple-500/20">
                  <Link2 size={9} /> depends on
                </span>
              )}
              {(task.metadata as Record<string, unknown> | undefined)?.webhook_source ? (
                <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400 text-[10px] font-medium border border-orange-500/20">
                  <Webhook size={9} /> webhook
                </span>
              ) : null}
              {(task.metadata as Record<string, unknown> | undefined)?.template_id ? (
                <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 text-[10px] font-medium border border-blue-500/20">
                  <LayoutTemplate size={9} /> template
                </span>
              ) : null}
              {task.steps.length > 0 && (
                <span>{task.steps.length} steps</span>
              )}
              {task.files.length > 0 && (
                <span>{task.files.length} file{task.files.length !== 1 ? "s" : ""}</span>
              )}
              {task.sub_tasks && task.sub_tasks.length > 0 && (
                <span>{task.sub_tasks.length} sub-agent{task.sub_tasks.length !== 1 ? "s" : ""}</span>
              )}
            </div>
          </div>
        </div>
      </Link>

      {/* Delete button */}
      <button
        onClick={(e) => {
          e.preventDefault();
          onDelete();
        }}
        disabled={isDeleting}
        className="absolute top-3 right-3 p-1.5 rounded-lg text-pplx-muted hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition-all"
      >
        {isDeleting ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <Trash2 size={13} />
        )}
      </button>
    </div>
  );
}

// ─── Calendar View (Otto-inspired task queue + calendar) ──────────────────────

function CalendarView({
  tasks,
  month,
  onMonthChange,
}: {
  tasks: Task[];
  month: Date;
  onMonthChange: (d: Date) => void;
}) {
  const year = month.getFullYear();
  const mon = month.getMonth();
  const firstDay = new Date(year, mon, 1).getDay();
  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  // Group tasks by date
  const tasksByDate: Record<string, Task[]> = {};
  tasks.forEach(t => {
    const d = t.created_at.slice(0, 10);
    if (!tasksByDate[d]) tasksByDate[d] = [];
    tasksByDate[d].push(t);
  });

  const days: Array<{ day: number; dateStr: string } | null> = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(mon + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    days.push({ day: d, dateStr });
  }

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  return (
    <div>
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => onMonthChange(new Date(year, mon - 1, 1))}
          className="p-1.5 rounded-lg text-pplx-muted hover:text-pplx-text hover:bg-white/5 transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
        <h3 className="text-sm font-semibold text-pplx-text">
          {monthNames[mon]} {year}
        </h3>
        <button
          onClick={() => onMonthChange(new Date(year, mon + 1, 1))}
          className="p-1.5 rounded-lg text-pplx-muted hover:text-pplx-text hover:bg-white/5 transition-colors"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-px mb-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
          <div key={d} className="text-center text-[10px] text-pplx-muted font-medium py-1.5">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px bg-pplx-border/30 rounded-xl overflow-hidden border border-pplx-border">
        {days.map((cell, i) => {
          if (!cell) {
            return <div key={`empty-${i}`} className="bg-pplx-bg min-h-[80px]" />;
          }
          const dayTasks = tasksByDate[cell.dateStr] || [];
          const isToday = cell.dateStr === todayStr;

          return (
            <div
              key={cell.dateStr}
              className={cn(
                "bg-pplx-card min-h-[80px] p-1.5 transition-colors hover:bg-pplx-card/80",
                isToday && "ring-1 ring-inset ring-pplx-accent/40"
              )}
            >
              <span className={cn(
                "text-[11px] font-medium",
                isToday ? "text-pplx-accent" : "text-pplx-muted"
              )}>
                {cell.day}
              </span>
              <div className="mt-0.5 space-y-0.5">
                {dayTasks.slice(0, 3).map(t => (
                  <Link
                    key={t.id}
                    href={`/computer/tasks/${t.id}`}
                    className={cn(
                      "block text-[9px] font-medium truncate px-1 py-0.5 rounded transition-colors",
                      t.status === "completed" ? "bg-green-500/10 text-green-400" :
                      t.status === "running" ? "bg-pplx-accent/10 text-pplx-accent" :
                      t.status === "failed" ? "bg-red-500/10 text-red-400" :
                      "bg-white/5 text-pplx-muted"
                    )}
                    title={t.title}
                  >
                    {t.title}
                  </Link>
                ))}
                {dayTasks.length > 3 && (
                  <span className="text-[9px] text-pplx-muted px-1">
                    +{dayTasks.length - 3} more
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  if (priority === "medium") return null;
  const config = {
    critical: { icon: Flame, label: "critical", cls: "bg-red-500/15 text-red-400 border-red-500/20" },
    high: { icon: ArrowUpCircle, label: "high", cls: "bg-orange-500/15 text-orange-400 border-orange-500/20" },
    low: { icon: ArrowDownCircle, label: "low", cls: "bg-slate-500/15 text-slate-400 border-slate-500/20" },
  }[priority];
  if (!config) return null;
  const Icon = config.icon;
  return (
    <span className={cn("flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium border flex-shrink-0", config.cls)}>
      <Icon size={9} /> {config.label}
    </span>
  );
}

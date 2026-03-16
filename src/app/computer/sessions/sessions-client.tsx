"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  MessageSquare,
  Plus,
  Trash2,
  Pin,
  PinOff,
  X,
  User,
  Clock,
  CheckSquare,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PERSONAS } from "@/lib/personas";

interface Session {
  id: string;
  name: string;
  description: string;
  task_ids: string[];
  persona_id: string | null;
  context_summary: string | null;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

interface TaskInfo {
  id: string;
  title: string;
  status: string;
}

export function SessionsClient() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", persona_id: "" });
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [addingTaskToSession, setAddingTaskToSession] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions");
      const data = await res.json() as { sessions: Session[] };
      setSessions(data.sessions || []);
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  // Fetch tasks for linking
  useEffect(() => {
    fetch("/api/tasks?limit=50")
      .then(r => r.json())
      .then(d => setTasks(d as TaskInfo[]))
      .catch(console.error);
  }, []);

  async function createSession() {
    if (!form.name.trim()) return;
    try {
      await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      await fetchSessions();
      setIsCreating(false);
      setForm({ name: "", description: "", persona_id: "" });
    } catch (err) { console.error(err); }
  }

  async function togglePin(session: Session) {
    await fetch("/api/sessions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: session.id, pinned: !session.pinned }),
    });
    fetchSessions();
  }

  async function deleteSession(id: string) {
    if (!confirm("Delete this session?")) return;
    await fetch(`/api/sessions?id=${id}`, { method: "DELETE" });
    fetchSessions();
  }

  async function addTaskToSession(sessionId: string, taskId: string) {
    await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_task", session_id: sessionId, task_id: taskId }),
    });
    fetchSessions();
    setAddingTaskToSession(null);
  }

  const sortedSessions = [...sessions].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  const statusDot = (status: string) => {
    if (status === "running") return "bg-pplx-accent animate-pulse";
    if (status === "completed") return "bg-green-400";
    if (status === "failed") return "bg-red-400";
    return "bg-pplx-muted";
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <MessageSquare size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-pplx-text">Sessions</h1>
            <p className="text-xs text-pplx-muted">
              Group related tasks into persistent conversations · {sessions.length} sessions
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-pplx-accent hover:bg-pplx-accent-hover text-white text-sm font-medium transition-colors"
        >
          <Plus size={14} />
          New Session
        </button>
      </div>

      {/* Sessions list */}
      {sortedSessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-pplx-muted">
          <MessageSquare size={40} className="mb-3 opacity-30" />
          <p className="text-sm font-medium">No sessions yet</p>
          <p className="text-xs mt-1 opacity-70">Create a session to group related tasks together</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedSessions.map(session => {
            const persona = PERSONAS.find(p => p.id === session.persona_id);
            const isExpanded = expandedSession === session.id;
            const sessionTasks = tasks.filter(t => session.task_ids.includes(t.id));

            return (
              <div
                key={session.id}
                className={cn(
                  "rounded-xl border bg-pplx-card overflow-hidden transition-all",
                  session.pinned ? "border-pplx-accent/30" : "border-pplx-border",
                  isExpanded && "ring-1 ring-pplx-accent/20"
                )}
              >
                {/* Session header */}
                <div
                  className="flex items-center gap-3 p-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
                  onClick={() => setExpandedSession(isExpanded ? null : session.id)}
                >
                  <div className="w-8 h-8 rounded-lg bg-violet-500/15 flex items-center justify-center flex-shrink-0">
                    {persona ? (
                      <span className="text-sm">{persona.icon}</span>
                    ) : (
                      <MessageSquare size={14} className="text-violet-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-pplx-text truncate">{session.name}</p>
                      {session.pinned && <Pin size={10} className="text-pplx-accent flex-shrink-0" />}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-[10px] text-pplx-muted flex items-center gap-1">
                        <CheckSquare size={9} /> {session.task_ids.length} tasks
                      </span>
                      {persona && (
                        <span className="text-[10px] text-pplx-muted flex items-center gap-1">
                          <User size={9} /> {persona.name}
                        </span>
                      )}
                      <span className="text-[10px] text-pplx-muted flex items-center gap-1">
                        <Clock size={9} /> {new Date(session.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); togglePin(session); }}
                      className="p-1.5 rounded-lg text-pplx-muted hover:text-pplx-accent transition-colors"
                    >
                      {session.pinned ? <PinOff size={12} /> : <Pin size={12} />}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setAddingTaskToSession(session.id); }}
                      className="p-1.5 rounded-lg text-pplx-muted hover:text-pplx-text transition-colors"
                    >
                      <Plus size={12} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                      className="p-1.5 rounded-lg text-pplx-muted hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                    <ChevronRight size={14} className={cn("text-pplx-muted transition-transform", isExpanded && "rotate-90")} />
                  </div>
                </div>

                {/* Expanded tasks */}
                {isExpanded && (
                  <div className="border-t border-pplx-border px-4 py-3 bg-pplx-bg/50">
                    {session.description && (
                      <p className="text-xs text-pplx-muted mb-3">{session.description}</p>
                    )}
                    {session.context_summary && (
                      <div className="bg-pplx-card border border-pplx-border rounded-lg p-2.5 mb-3">
                        <p className="text-[10px] text-pplx-muted font-medium mb-1">Context Summary</p>
                        <p className="text-xs text-pplx-text">{session.context_summary}</p>
                      </div>
                    )}
                    {sessionTasks.length === 0 ? (
                      <p className="text-xs text-pplx-muted text-center py-4">No tasks linked yet</p>
                    ) : (
                      <div className="space-y-1.5">
                        {sessionTasks.map(task => (
                          <Link
                            key={task.id}
                            href={`/computer/tasks/${task.id}`}
                            className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
                          >
                            <div className={cn("w-2 h-2 rounded-full flex-shrink-0", statusDot(task.status))} />
                            <span className="text-xs text-pplx-text flex-1 truncate">{task.title}</span>
                            <span className="text-[10px] text-pplx-muted capitalize">{task.status}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Session Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setIsCreating(false)} />
          <div className="relative z-10 bg-pplx-card border border-pplx-border rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-pplx-text">New Session</h3>
              <button onClick={() => setIsCreating(false)} className="p-1.5 rounded-lg text-pplx-muted hover:text-pplx-text">
                <X size={14} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-pplx-muted font-medium block mb-1.5">Name</label>
                <input
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Research Project, Sprint 14..."
                  className="w-full bg-pplx-bg border border-pplx-border rounded-xl px-3.5 py-2.5 text-sm text-pplx-text placeholder:text-pplx-muted outline-none focus:border-pplx-accent/50"
                />
              </div>
              <div>
                <label className="text-xs text-pplx-muted font-medium block mb-1.5">Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="What this session is about..."
                  rows={2}
                  className="w-full bg-pplx-bg border border-pplx-border rounded-xl px-3.5 py-2.5 text-sm text-pplx-text placeholder:text-pplx-muted outline-none focus:border-pplx-accent/50 resize-none"
                />
              </div>
              <div>
                <label className="text-xs text-pplx-muted font-medium block mb-1.5">Persona</label>
                <select
                  value={form.persona_id}
                  onChange={e => setForm({ ...form, persona_id: e.target.value })}
                  className="w-full bg-pplx-bg border border-pplx-border rounded-xl px-3.5 py-2.5 text-sm text-pplx-text outline-none focus:border-pplx-accent/50"
                >
                  <option value="">None (use default)</option>
                  {PERSONAS.map(p => (
                    <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setIsCreating(false)} className="flex-1 py-2 rounded-xl text-sm bg-pplx-bg border border-pplx-border text-pplx-muted">Cancel</button>
              <button onClick={createSession} disabled={!form.name.trim()} className="flex-1 py-2 rounded-xl text-sm bg-pplx-accent text-white hover:bg-pplx-accent-hover disabled:opacity-50">Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Task to Session Modal */}
      {addingTaskToSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setAddingTaskToSession(null)} />
          <div className="relative z-10 bg-pplx-card border border-pplx-border rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-pplx-text">Add Task to Session</h3>
              <button onClick={() => setAddingTaskToSession(null)} className="p-1.5 rounded-lg text-pplx-muted hover:text-pplx-text">
                <X size={14} />
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {tasks.map(task => {
                const session = sessions.find(s => s.id === addingTaskToSession);
                const isLinked = session?.task_ids.includes(task.id);
                return (
                  <button
                    key={task.id}
                    disabled={isLinked}
                    onClick={() => addTaskToSession(addingTaskToSession, task.id)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors text-xs",
                      isLinked
                        ? "opacity-40 cursor-not-allowed"
                        : "hover:bg-white/5 text-pplx-muted hover:text-pplx-text"
                    )}
                  >
                    <div className={cn("w-2 h-2 rounded-full flex-shrink-0", statusDot(task.status))} />
                    <span className="flex-1 truncate">{task.title}</span>
                    {isLinked && <span className="text-[9px] text-pplx-accent">linked</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

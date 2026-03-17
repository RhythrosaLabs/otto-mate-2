/**
 * Background Operations Store
 * 
 * A lightweight external store (no dependencies) for tracking long-running
 * operations across the app. Any page can register/update/remove operations,
 * and any component can subscribe to the list via useSyncExternalStore.
 * 
 * This enables cross-page visibility of running tasks, video generations,
 * app builds, playground runs, etc.
 */

import { useSyncExternalStore } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type OpType = "task" | "video" | "app-build" | "generation" | "audio";
export type OpStatus = "running" | "completed" | "failed";

export interface BackgroundOp {
  id: string;
  type: OpType;
  label: string;
  status: OpStatus;
  progress?: number; // 0-100
  startedAt: number;
  href: string; // navigation target to see the operation
  detail?: string; // e.g. "Generating frame 3/12"
}

// ─── Store Internals ──────────────────────────────────────────────────────────

let operations = new Map<string, BackgroundOp>();
let listeners = new Set<() => void>();
let snapshot: BackgroundOp[] = [];

function updateSnapshot() {
  snapshot = Array.from(operations.values());
}

function notify() {
  updateSnapshot();
  listeners.forEach((l) => l());
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function addBackgroundOp(op: BackgroundOp) {
  operations.set(op.id, op);
  notify();
}

export function updateBackgroundOp(id: string, updates: Partial<Omit<BackgroundOp, "id">>) {
  const existing = operations.get(id);
  if (existing) {
    operations.set(id, { ...existing, ...updates });
    notify();
  }
}

export function removeBackgroundOp(id: string) {
  operations.delete(id);
  notify();
}

export function getBackgroundOps(): BackgroundOp[] {
  return snapshot;
}

/** Get only active (running) operations */
export function getRunningOps(): BackgroundOp[] {
  return snapshot.filter((op) => op.status === "running");
}

// ─── React Hook ───────────────────────────────────────────────────────────────

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): BackgroundOp[] {
  return snapshot;
}

/**
 * React hook to subscribe to all background operations.
 * Re-renders when operations are added/updated/removed.
 */
export function useBackgroundOps(): BackgroundOp[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * React hook to get only running operations count.
 * Useful for badges/indicators without full list re-renders.
 */
export function useRunningOpsCount(): number {
  const ops = useBackgroundOps();
  return ops.filter((op) => op.status === "running").length;
}

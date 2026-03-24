/**
 * Handoff Store — localStorage-backed, zero-dependency
 *
 * Two tiers:
 *  • "pending handoff"  — one item waiting to be consumed by a studio
 *  • "media shelf"      — up to SHELF_MAX recent generated items shared
 *                         across the entire workspace
 */

export type HandoffMimeCategory = "image" | "video" | "audio" | "3d" | "other";

export interface HandoffItem {
  id: string;
  url: string;
  name: string;
  mimeType: string;
  mimeCategory: HandoffMimeCategory;
  /** Which surface generated or contributed this file */
  source: string; // "image-studio" | "dreamscape" | "files" | "agent" | …
  prompt?: string;
  createdAt: number;
}

const PENDING_KEY = "ottomate:handoff:pending";
const SHELF_KEY   = "ottomate:handoff:shelf";
const SHELF_MAX   = 60;

// ── Pending handoff (consumed once by receiving studio) ────────────────────────

export function getPendingHandoff(): HandoffItem | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as HandoffItem) : null;
  } catch { return null; }
}

export function setPendingHandoff(item: HandoffItem): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PENDING_KEY, JSON.stringify(item));
  window.dispatchEvent(new StorageEvent("storage", { key: PENDING_KEY }));
}

export function clearPendingHandoff(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(PENDING_KEY);
}

// ── Media shelf ────────────────────────────────────────────────────────────────

export function getShelf(): HandoffItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SHELF_KEY);
    return raw ? (JSON.parse(raw) as HandoffItem[]) : [];
  } catch { return []; }
}

export function addToShelf(item: HandoffItem): void {
  if (typeof window === "undefined") return;
  // Deduplicate by URL
  const shelf = getShelf().filter((i) => i.url !== item.url);
  shelf.unshift(item);
  if (shelf.length > SHELF_MAX) shelf.splice(SHELF_MAX);
  localStorage.setItem(SHELF_KEY, JSON.stringify(shelf));
  window.dispatchEvent(new StorageEvent("storage", { key: SHELF_KEY }));
}

export function removeFromShelf(id: string): void {
  if (typeof window === "undefined") return;
  const shelf = getShelf().filter((i) => i.id !== id);
  localStorage.setItem(SHELF_KEY, JSON.stringify(shelf));
  window.dispatchEvent(new StorageEvent("storage", { key: SHELF_KEY }));
}

export function clearShelf(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SHELF_KEY);
  window.dispatchEvent(new StorageEvent("storage", { key: SHELF_KEY }));
}

// ── Utility ────────────────────────────────────────────────────────────────────

export function inferMimeCategory(mimeType: string, name = ""): HandoffMimeCategory {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (
    mimeType.startsWith("model/") ||
    /\.(glb|gltf|stl|obj|fbx|dae|3ds|ply|blend|ma|mb|c4d)$/i.test(name)
  )
    return "3d";
  return "other";
}

export function makeHandoffItem(
  partial: Omit<HandoffItem, "id" | "createdAt"> & { id?: string }
): HandoffItem {
  return {
    id: partial.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    ...partial,
  };
}

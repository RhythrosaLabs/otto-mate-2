/**
 * Shared gallery utility for Nova.
 * All generation pages use this to persist results to the Gallery.
 */

export interface GalleryItem {
  id: string;
  type: "image" | "video" | "audio" | "speech";
  url: string;
  thumbnailUrl?: string;
  prompt: string;
  model: string;
  createdAt: string;
  favorite: boolean;
  metadata?: Record<string, unknown>;
}

const GALLERY_KEY = "firefly-gallery";
const HISTORY_KEY_PREFIX = "firefly-history-";
const MAX_GALLERY = 200;
const MAX_HISTORY = 50;

/* ─── Gallery ──────────────────────────────────────────────────── */

export function loadGallery(): GalleryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(GALLERY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveToGallery(item: Omit<GalleryItem, "id" | "createdAt" | "favorite">): GalleryItem {
  const full: GalleryItem = {
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    favorite: false,
  };
  const items = loadGallery();
  items.unshift(full);
  if (items.length > MAX_GALLERY) items.length = MAX_GALLERY;
  try {
    localStorage.setItem(GALLERY_KEY, JSON.stringify(items));
  } catch { /* quota exceeded – silent */ }
  return full;
}

export function saveMultipleToGallery(
  newItems: Omit<GalleryItem, "id" | "createdAt" | "favorite">[]
): GalleryItem[] {
  const items = loadGallery();
  const created: GalleryItem[] = newItems.map((item) => ({
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    favorite: false,
  }));
  items.unshift(...created);
  if (items.length > MAX_GALLERY) items.length = MAX_GALLERY;
  try {
    localStorage.setItem(GALLERY_KEY, JSON.stringify(items));
  } catch { /* quota exceeded */ }
  return created;
}

export function toggleGalleryFavorite(id: string): GalleryItem[] {
  const items = loadGallery();
  const idx = items.findIndex((i) => i.id === id);
  if (idx !== -1) items[idx].favorite = !items[idx].favorite;
  try {
    localStorage.setItem(GALLERY_KEY, JSON.stringify(items));
  } catch { /* ignore */ }
  return items;
}

export function removeFromGallery(id: string): GalleryItem[] {
  const items = loadGallery().filter((i) => i.id !== id);
  try {
    localStorage.setItem(GALLERY_KEY, JSON.stringify(items));
  } catch { /* ignore */ }
  return items;
}

/* ─── Per-feature History ─────────────────────────────────────── */

export function loadHistory<T>(feature: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY_PREFIX + feature);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveHistory<T>(feature: string, items: T[]): void {
  try {
    const trimmed = items.slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY_PREFIX + feature, JSON.stringify(trimmed));
  } catch { /* ignore */ }
}

/* ─── Download Helper ─────────────────────────────────────────── */

export async function downloadFile(url: string, filename: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Download failed");
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(blobUrl);
    return true;
  } catch {
    return false;
  }
}

/* ─── Copy to clipboard ──────────────────────────────────────── */

export async function copyImageToClipboard(url: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const pngBlob = blob.type === "image/png" ? blob : await convertToPng(blob);
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": pngBlob }),
    ]);
    return true;
  } catch {
    return false;
  }
}

function convertToPng(blob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("No canvas ctx"));
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
}

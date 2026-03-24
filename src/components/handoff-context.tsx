"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  type HandoffItem,
  type HandoffMimeCategory,
  addToShelf as addToShelfStore,
  removeFromShelf as removeFromShelfStore,
  clearShelf as clearShelfStore,
  getShelf,
  getPendingHandoff,
  setPendingHandoff,
  clearPendingHandoff,
  makeHandoffItem,
} from "@/lib/handoff-store";

// ── Studio routing map ─────────────────────────────────────────────────────────
// Defines which studios can receive which mime categories.

export const STUDIO_MAP = {
  "image-studio": {
    label: "Image Studio",
    route: "/computer/image-studio",
    icon: "✨",
    accepts: ["image"] as HandoffMimeCategory[],
  },
  dreamscape: {
    label: "Video Studio",
    route: "/computer/dreamscape",
    icon: "🎬",
    accepts: ["image", "video", "audio"] as HandoffMimeCategory[],
  },
  "audio-studio": {
    label: "Audio Studio",
    route: "/computer/audio-studio",
    icon: "🎵",
    accepts: ["audio"] as HandoffMimeCategory[],
  },
  "3d-studio": {
    label: "3D Studio",
    route: "/computer/3d-studio",
    icon: "📦",
    accepts: ["image", "3d"] as HandoffMimeCategory[],
  },
} as const;

export type StudioId = keyof typeof STUDIO_MAP;

export function studiosForItem(item: HandoffItem): StudioId[] {
  return (Object.entries(STUDIO_MAP) as [StudioId, (typeof STUDIO_MAP)[StudioId]][])
    .filter(([, info]) =>
      (info.accepts as readonly string[]).includes(item.mimeCategory)
    )
    .map(([id]) => id);
}

// ── Context ────────────────────────────────────────────────────────────────────

interface HandoffContextValue {
  // Pending handoff — consumed by the receiving studio once
  pendingHandoff: HandoffItem | null;
  consumeHandoff: () => HandoffItem | null;
  // Media shelf — recent generated items
  shelf: HandoffItem[];
  addToShelf: (
    partial: Omit<HandoffItem, "id" | "createdAt"> & { id?: string }
  ) => HandoffItem;
  removeFromShelf: (id: string) => void;
  clearShelf: () => void;
  // Navigation
  sendToStudio: (item: HandoffItem, studioId: StudioId) => void;
  // Tray visibility
  trayOpen: boolean;
  setTrayOpen: (open: boolean) => void;
}

const HandoffContext = createContext<HandoffContextValue | null>(null);

export function HandoffProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pendingHandoff, setPending] = useState<HandoffItem | null>(null);
  const [shelf, setShelf] = useState<HandoffItem[]>([]);
  const [trayOpen, setTrayOpen] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    setShelf(getShelf());
    setPending(getPendingHandoff());
  }, []);

  // Sync across tabs via storage events
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === "ottomate:handoff:shelf") setShelf(getShelf());
      if (e.key === "ottomate:handoff:pending") setPending(getPendingHandoff());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const addToShelf = useCallback(
    (partial: Omit<HandoffItem, "id" | "createdAt"> & { id?: string }) => {
      const item = makeHandoffItem(partial);
      addToShelfStore(item);
      setShelf(getShelf());
      return item;
    },
    []
  );

  const removeFromShelf = useCallback((id: string) => {
    removeFromShelfStore(id);
    setShelf(getShelf());
  }, []);

  const clearShelf = useCallback(() => {
    clearShelfStore();
    setShelf([]);
  }, []);

  const consumeHandoff = useCallback((): HandoffItem | null => {
    const h = getPendingHandoff();
    clearPendingHandoff();
    setPending(null);
    return h;
  }, []);

  const sendToStudio = useCallback(
    (item: HandoffItem, studioId: StudioId) => {
      setPendingHandoff(item);
      setPending(item);
      const route = STUDIO_MAP[studioId].route;
      router.push(`${route}?handoff=1`);
    },
    [router]
  );

  return (
    <HandoffContext.Provider
      value={{
        pendingHandoff,
        consumeHandoff,
        shelf,
        addToShelf,
        removeFromShelf,
        clearShelf,
        sendToStudio,
        trayOpen,
        setTrayOpen,
      }}
    >
      {children}
    </HandoffContext.Provider>
  );
}

export function useHandoff(): HandoffContextValue {
  const ctx = useContext(HandoffContext);
  if (!ctx) throw new Error("useHandoff must be used within <HandoffProvider>");
  return ctx;
}

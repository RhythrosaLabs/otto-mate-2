"use client";

/**
 * PersistentLayout — Keep-Alive Panel Manager
 * 
 * Caches rendered pages by pathname and keeps them mounted (hidden with CSS)
 * when the user navigates away. This preserves ALL component state: useState,
 * useRef, setInterval, SSE connections, polling timers, form inputs, scroll
 * positions, etc.
 * 
 * When the user returns to a previously visited page, it's instantly
 * visible with all state intact — no re-mount, no re-fetch, no re-render.
 * 
 * Uses LRU eviction to cap memory at MAX_CACHED_PAGES.
 */

import { usePathname } from "next/navigation";
import { useRef, ReactNode, useCallback, useEffect, createContext, useContext } from "react";

const MAX_CACHED_PAGES = 20;

// ─── Page Visibility Context ──────────────────────────────────────────────────
// Components can use this to know if their page is visible or hidden.
// Useful for pausing non-essential work when running in the background.

const PageVisibleContext = createContext(true);

/**
 * Hook for components to check if their containing page is currently visible.
 * Returns false when the page is cached but hidden (user navigated away).
 */
export function usePageVisible(): boolean {
  return useContext(PageVisibleContext);
}

// ─── Cached Page Entry ────────────────────────────────────────────────────────

interface CachedPage {
  element: ReactNode;
  lastVisited: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PersistentLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const cacheRef = useRef(new Map<string, CachedPage>());
  const orderRef = useRef<string[]>([]);

  // Always update the current page in cache
  cacheRef.current.set(pathname, {
    element: children,
    lastVisited: Date.now(),
  });

  // Update visit order (move to end = most recent)
  const orderIdx = orderRef.current.indexOf(pathname);
  if (orderIdx >= 0) {
    orderRef.current.splice(orderIdx, 1);
  }
  orderRef.current.push(pathname);

  // Evict oldest pages if over limit (never evict current page)
  while (cacheRef.current.size > MAX_CACHED_PAGES && orderRef.current.length > MAX_CACHED_PAGES) {
    const oldest = orderRef.current[0];
    if (oldest && oldest !== pathname) {
      cacheRef.current.delete(oldest);
      orderRef.current.shift();
    } else {
      break;
    }
  }

  return (
    <>
      {Array.from(cacheRef.current.entries()).map(([path, cached]) => {
        const isActive = path === pathname;
        return (
          <PageVisibleContext.Provider key={path} value={isActive}>
            <div
              className="h-full"
              style={{ display: isActive ? "block" : "none" }}
              // Prevent hidden panels from capturing focus/tab navigation
              {...(isActive ? {} : { inert: true })}
            >
              {/* For the active page, always render fresh children from Next.js.
                  For cached pages, render the stored element (preserves component tree). */}
              {isActive ? children : cached.element}
            </div>
          </PageVisibleContext.Provider>
        );
      })}
    </>
  );
}

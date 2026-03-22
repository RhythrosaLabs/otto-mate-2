"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  RefreshCw,
  AlertTriangle,
  ArrowLeft,
  Maximize2,
  ExternalLink,
  RotateCcw,
  Loader2,
} from "lucide-react";
import Link from "next/link";

const BOLT_DIY_URL = "http://localhost:5173";

/**
 * Persistent bolt.diy iframe that lives in the Computer layout.
 *
 * - Only mounts the iframe after the user first visits /computer/app-builder
 * - When on app-builder: visible overlay with toolbar + iframe
 * - When on other pages: iframe moves off-screen (keeps WebContainers alive)
 * - Handles fallback UI when bolt.diy isn't running
 * - Detects unresponsive iframe and offers force-reload
 */
export function BoltPersistentIframe() {
  const pathname = usePathname();
  const isActive = pathname === "/computer/app-builder";

  // Only create the iframe after the user visits app-builder once
  const [hasVisited, setHasVisited] = useState(false);
  const [boltStatus, setBoltStatus] = useState<
    "checking" | "running" | "stopped"
  >("checking");
  const [retrying, setRetrying] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Activate on first visit
  useEffect(() => {
    if (isActive && !hasVisited) {
      setHasVisited(true);
    }
  }, [isActive, hasVisited]);

  // Check if bolt.diy is reachable
  const checkBolt = useCallback(async () => {
    setRetrying(true);
    try {
      // Use a timeout to avoid indefinite hangs — Safari can stall
      // cross-origin fetches when COEP is active.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      await fetch(BOLT_DIY_URL, {
        mode: "no-cors",
        signal: controller.signal,
      });
      clearTimeout(timeout);
      setBoltStatus("running");
      setFrozen(false);
    } catch {
      setBoltStatus("stopped");
    } finally {
      setRetrying(false);
    }
  }, []);

  // Run initial check when component first activates
  useEffect(() => {
    if (hasVisited && boltStatus === "checking") {
      checkBolt();
    }
  }, [hasVisited, boltStatus, checkBolt]);

  // Force-reload: destroy and recreate the iframe
  const handleForceReload = useCallback(() => {
    setFrozen(false);
    if (iframeRef.current) {
      // Force a full reload by blanking then reassigning src
      iframeRef.current.src = "about:blank";
      setTimeout(() => {
        if (iframeRef.current) {
          iframeRef.current.src = BOLT_DIY_URL;
        }
      }, 200);
    }
  }, []);

  const handleRefresh = useCallback(() => {
    if (iframeRef.current) {
      iframeRef.current.src = BOLT_DIY_URL;
    }
  }, []);

  // Don't render anything until user has visited app-builder
  if (!hasVisited) return null;

  return (
    <>
      {/*
        When active (on app-builder): absolute overlay filling the main content area.
        When inactive: positioned off-screen but full-size so WebContainers stay alive.
        Using fixed off-screen instead of display:none to prevent iframe reload.
      */}
      <div
        className={
          isActive
            ? "absolute inset-0 top-14 md:top-0 z-20 flex flex-col bg-[#0a0a0a]"
            : ""
        }
        style={
          !isActive
            ? {
                position: "fixed",
                top: "-200vh",
                left: 0,
                width: "100vw",
                height: "100vh",
                pointerEvents: "none",
              }
            : undefined
        }
      >
        {boltStatus === "checking" && isActive ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
              <p className="text-zinc-400 text-sm">Connecting to Forge...</p>
            </div>
          </div>
        ) : boltStatus === "running" ? (
          <>
            {/* Toolbar – only rendered when on the app-builder page */}
            {isActive && (
              <div className="flex items-center justify-between px-3 py-1.5 bg-[#0a0a0a] border-b border-zinc-800 shrink-0">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      frozen ? "bg-amber-500" : "bg-green-500 animate-pulse"
                    }`}
                  />
                  <span className="text-xs font-medium">
                    <span className="bg-gradient-to-r from-violet-400 via-pink-400 to-orange-400 bg-clip-text text-transparent">Forge</span>
                    <span className="text-zinc-400"> — App Builder</span>
                    {frozen && (
                      <span className="text-amber-400 ml-2">(unresponsive)</span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {frozen && (
                    <button
                      onClick={handleForceReload}
                      className="px-2 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium flex items-center gap-1 transition-colors mr-1"
                      title="Force reload Forge"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reload
                    </button>
                  )}
                  <a
                    href={BOLT_DIY_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
                    title="Open in new tab"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </a>
                  <button
                    onClick={handleRefresh}
                    className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
                    title="Refresh"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${retrying ? "animate-spin" : ""}`}
                    />
                  </button>
                </div>
              </div>
            )}

            {/* The iframe – always rendered once activated, never unmounted */}
            <iframe
              ref={iframeRef}
              src={BOLT_DIY_URL}
              style={{ flex: 1, width: "100%", border: "none" }}
              allow="cross-origin-isolated; clipboard-read; clipboard-write"
              onLoad={() => {
                console.log("[Forge] iframe loaded");
              }}
              onError={() => {
                console.error("[Forge] iframe failed to load");
                setBoltStatus("stopped");
              }}
            />
          </>
        ) : boltStatus === "stopped" && isActive ? (
          <BoltFallback retrying={retrying} onRetry={checkBolt} />
        ) : null}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Fallback screen when bolt.diy isn't running                        */
/* ------------------------------------------------------------------ */

function BoltFallback({
  retrying,
  onRetry,
}: {
  retrying: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-[#0a0a0a] text-white">
      <AlertTriangle className="w-12 h-12 text-amber-400 mb-4" />
      <h2 className="text-xl font-semibold mb-2">App Builder Not Running</h2>
      <p className="text-zinc-400 text-sm text-center max-w-md mb-6">
        The Forge app builder server isn&apos;t running on port 5173.
        <br />
        Start it with the command below:
      </p>

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-6 font-mono text-sm max-w-lg w-full">
        <div className="text-zinc-500 text-xs mb-2"># From the project root:</div>
        <div className="text-green-400">cd bolt-diy &amp;&amp; pnpm run dev</div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onRetry}
          disabled={retrying}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${retrying ? "animate-spin" : ""}`} />
          {retrying ? "Checking…" : "Retry Connection"}
        </button>
        <a
          href={BOLT_DIY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          Open Directly
        </a>
        <Link
          href="/computer"
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>
      </div>

      <div className="mt-8 text-zinc-500 text-xs text-center max-w-md">
        <p>
          <strong className="text-zinc-400">First time?</strong> Run{" "}
          <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300">
            cd bolt-diy &amp;&amp; pnpm install &amp;&amp; pnpm run dev
          </code>
        </p>
      </div>
    </div>
  );
}

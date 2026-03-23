"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  RefreshCw,
  AlertTriangle,
  Maximize2,
  ExternalLink,
  RotateCcw,
  Loader2,
} from "lucide-react";

const OPENDAW_URL = "http://localhost:8080";

/**
 * Persistent openDAW iframe that lives in the Computer layout.
 *
 * - Only mounts the iframe after the user first visits /computer/audio-studio
 * - When on audio-studio: visible overlay with toolbar + iframe
 * - When on other pages: iframe moves off-screen (keeps state alive)
 * - Handles fallback UI when openDAW isn't running on port 8080
 */
export function LmmsPersistentIframe() {
  const pathname = usePathname();
  const isActive = pathname === "/computer/audio-studio";

  const [hasVisited, setHasVisited] = useState(false);
  const [status, setStatus] = useState<"checking" | "running" | "stopped">(
    "checking"
  );
  const [retrying, setRetrying] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const prevActiveRef = useRef(false);

  // Activate on first visit
  useEffect(() => {
    if (isActive && !hasVisited) {
      setHasVisited(true);
    }
  }, [isActive, hasVisited]);

  // Check if openDAW is reachable
  const checkServer = useCallback(async () => {
    setRetrying(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      await fetch(OPENDAW_URL, {
        mode: "no-cors",
        signal: controller.signal,
      });
      clearTimeout(timeout);
      setStatus("running");
      setFrozen(false);
    } catch {
      setStatus("stopped");
    } finally {
      setRetrying(false);
    }
  }, []);

  // Run initial check when component first activates
  useEffect(() => {
    if (hasVisited && status === "checking") {
      checkServer();
    }
  }, [hasVisited, status, checkServer]);

  // Auto-retry when user navigates back to the page and service was stopped
  useEffect(() => {
    if (isActive && !prevActiveRef.current && hasVisited && status === "stopped") {
      checkServer();
    }
    prevActiveRef.current = isActive;
  }, [isActive, hasVisited, status, checkServer]);

  // Force-reload: destroy and recreate the iframe
  const handleForceReload = useCallback(() => {
    setFrozen(false);
    if (iframeRef.current) {
      iframeRef.current.src = "about:blank";
      setTimeout(() => {
        if (iframeRef.current) {
          iframeRef.current.src = OPENDAW_URL;
        }
      }, 200);
    }
  }, []);

  const handleRefresh = useCallback(() => {
    if (iframeRef.current) {
      iframeRef.current.src = OPENDAW_URL;
    }
  }, []);

  // Don't render anything until user has visited audio-studio
  if (!hasVisited) return null;

  return (
    <>
      <div
        className={
          isActive
            ? "absolute inset-0 top-14 md:top-0 z-20 flex flex-col bg-[#1a1a2e]"
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
        {...(!isActive ? { inert: true } : {})}
      >
        {status === "checking" && isActive ? (
          <div className="flex items-center justify-center h-full bg-[#1a1a2e]">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
              <p className="text-zinc-400 text-sm">Connecting to Audio Studio...</p>
            </div>
          </div>
        ) : status === "running" ? (
          <>
            {isActive && (
              <div className="flex items-center justify-between px-3 py-1.5 bg-[#1a1a2e] border-b border-zinc-800 shrink-0">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      frozen ? "bg-amber-500" : "bg-green-500 animate-pulse"
                    }`}
                  />
                  <span className="text-xs font-medium">
                    <span className="bg-gradient-to-r from-violet-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                      openDAW
                    </span>
                    <span className="text-zinc-400"> — Audio Studio</span>
                    {frozen && (
                      <span className="text-amber-400 ml-2">
                        (unresponsive)
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {frozen && (
                    <button
                      onClick={handleForceReload}
                      className="px-2 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium flex items-center gap-1 transition-colors mr-1"
                      title="Force reload openDAW"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reload
                    </button>
                  )}
                  <a
                    href={OPENDAW_URL}
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

            <iframe
              ref={iframeRef}
              src={OPENDAW_URL}
              style={{ flex: 1, width: "100%", border: "none" }}
              allow="clipboard-read; clipboard-write; autoplay; microphone; midi"
              onLoad={() => {
                console.log("[openDAW] iframe loaded");
              }}
              onError={() => {
                console.error("[openDAW] iframe failed to load");
                setStatus("stopped");
              }}
            />
          </>
        ) : status === "stopped" && isActive ? (
          <OpenDAWFallback retrying={retrying} onRetry={checkServer} />
        ) : null}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Fallback screen when openDAW isn't running                        */
/* ------------------------------------------------------------------ */

function OpenDAWFallback({
  retrying,
  onRetry,
}: {
  retrying: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-[#1a1a2e] text-white">
      <AlertTriangle className="w-12 h-12 text-amber-400 mb-4" />
      <h2 className="text-xl font-semibold mb-2">Audio Studio Not Running</h2>
      <p className="text-zinc-400 text-sm text-center max-w-md mb-6">
        openDAW isn&apos;t running on port 8080.
        <br />
        Start it with the command below:
      </p>

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-6 font-mono text-sm max-w-lg w-full">
        <div className="text-zinc-500 text-xs mb-2"># From the project root:</div>
        <div className="text-green-400">npm run dev:opendaw</div>
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
          href={OPENDAW_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          Open Directly
        </a>
      </div>

      <p className="text-zinc-600 text-xs mt-6">
        First time? Run{" "}
        <code className="text-zinc-400">cd opendaw &amp;&amp; npm install &amp;&amp; npm run dev:studio</code>
      </p>
    </div>
  );
}

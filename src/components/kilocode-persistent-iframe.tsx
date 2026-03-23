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

const CODE_SERVER_URL = "http://localhost:3100/?folder=/Users/sheils/repos";

/**
 * Persistent code-server iframe that lives in the Computer layout.
 *
 * - Only mounts the iframe after the user first visits /computer/coding-companion
 * - When on coding-companion: visible overlay with toolbar + iframe
 * - When on other pages: iframe moves off-screen (keeps state alive)
 * - Handles fallback UI when code-server isn't running
 */
export function CodeServerPersistentIframe() {
  const pathname = usePathname();
  const isActive = pathname === "/computer/coding-companion";

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

  // Check if code-server is reachable via server-side API (avoids no-cors opacity)
  const checkServer = useCallback(async () => {
    setRetrying(true);
    try {
      const res = await fetch("/api/health/code-server", { cache: "no-store" });
      const data = await res.json() as { ok: boolean };
      if (data.ok) {
        setStatus("running");
        setFrozen(false);
      } else {
        setStatus("stopped");
      }
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

  // Periodic health check every 30s while the page is active, to detect crashes
  useEffect(() => {
    if (!isActive || !hasVisited) return;
    const interval = setInterval(() => {
      checkServer();
    }, 30_000);
    return () => clearInterval(interval);
  }, [isActive, hasVisited, checkServer]);

  // Force-reload: destroy and recreate the iframe
  const handleForceReload = useCallback(() => {
    setFrozen(false);
    if (iframeRef.current) {
      iframeRef.current.src = "about:blank";
      setTimeout(() => {
        if (iframeRef.current) {
          iframeRef.current.src = CODE_SERVER_URL;
        }
      }, 200);
    }
  }, []);

  const handleRefresh = useCallback(() => {
    if (iframeRef.current) {
      iframeRef.current.src = CODE_SERVER_URL;
    }
  }, []);

  // Don't render anything until user has visited coding-companion
  if (!hasVisited) return null;

  return (
    <>
      <div
        className={
          isActive
            ? "absolute inset-0 top-14 md:top-0 z-20 flex flex-col bg-[#1e1e1e]"
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
          <div className="flex items-center justify-center h-full bg-[#1e1e1e]">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
              <p className="text-zinc-400 text-sm">
                Connecting to Coding Companion...
              </p>
            </div>
          </div>
        ) : status === "running" ? (
          <>
            {/* Toolbar – only rendered when on the coding-companion page */}
            {isActive && (
              <div className="flex items-center justify-between px-3 py-1.5 bg-[#1e1e1e] border-b border-zinc-800 shrink-0">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      frozen ? "bg-amber-500" : "bg-green-500 animate-pulse"
                    }`}
                  />
                  <span className="text-xs font-medium">
                    <span className="bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent">
                      Coding Companion
                    </span>
                    <span className="text-zinc-400"> — VS Code + Continue AI</span>
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
                      title="Force reload Coding Companion"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reload
                    </button>
                  )}
                  <a
                    href={CODE_SERVER_URL}
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
              src={CODE_SERVER_URL}
              style={{ flex: 1, width: "100%", border: "none" }}
              allow="clipboard-read; clipboard-write"
              onLoad={() => {
                console.log("[Coding Companion] iframe loaded");
              }}
              onError={() => {
                console.error("[Coding Companion] iframe failed to load");
                setStatus("stopped");
              }}
            />
          </>
        ) : status === "stopped" && isActive ? (
          <CodeServerFallback retrying={retrying} onRetry={checkServer} />
        ) : null}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Fallback screen when code-server isn't running                     */
/* ------------------------------------------------------------------ */

function CodeServerFallback({
  retrying,
  onRetry,
}: {
  retrying: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-[#1e1e1e] text-white">
      <AlertTriangle className="w-12 h-12 text-amber-400 mb-4" />
      <h2 className="text-xl font-semibold mb-2">
        Coding Companion Not Running
      </h2>
      <p className="text-zinc-400 text-sm text-center max-w-md mb-6">
        The code-server isn&apos;t running on port 3100.
        <br />
        Start it with the command below:
      </p>

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-6 font-mono text-sm max-w-lg w-full">
        <div className="text-zinc-500 text-xs mb-2">
          # From the project root:
        </div>
        <div className="text-green-400">npm run dev:code-server</div>
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
          href={CODE_SERVER_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          Open Directly
        </a>
      </div>
    </div>
  );
}

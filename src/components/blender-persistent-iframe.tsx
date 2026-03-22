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
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";

const BLOCKBENCH_URL = "http://localhost:3001";

/**
 * Persistent Blockbench iframe that lives in the Computer layout.
 *
 * - Only mounts the iframe after the user first visits /computer/3d-studio
 * - When on 3d-studio: visible overlay with toolbar + iframe
 * - When on other pages: iframe moves off-screen (keeps state alive)
 * - Handles fallback UI when Blockbench isn't running
 */
export function BlenderPersistentIframe() {
  const pathname = usePathname();
  const isActive = pathname === "/computer/3d-studio";

  const [hasVisited, setHasVisited] = useState(false);
  const [status, setStatus] = useState<"checking" | "running" | "stopped">(
    "checking"
  );
  const [retrying, setRetrying] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Activate on first visit
  useEffect(() => {
    if (isActive && !hasVisited) {
      setHasVisited(true);
    }
  }, [isActive, hasVisited]);

  // Check if Blockbench is reachable
  const checkServer = useCallback(async () => {
    setRetrying(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      await fetch(BLOCKBENCH_URL, {
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

  // Force-reload: destroy and recreate the iframe
  const handleForceReload = useCallback(() => {
    setFrozen(false);
    if (iframeRef.current) {
      iframeRef.current.src = "about:blank";
      setTimeout(() => {
        if (iframeRef.current) {
          iframeRef.current.src = BLOCKBENCH_URL;
        }
      }, 200);
    }
  }, []);

  const handleRefresh = useCallback(() => {
    if (iframeRef.current) {
      iframeRef.current.src = BLOCKBENCH_URL;
    }
  }, []);

  // Don't render anything until user has visited 3d-studio
  if (!hasVisited) return null;

  return (
    <>
      <div
        className={
          isActive
            ? "absolute inset-0 top-14 md:top-0 z-20 flex flex-col bg-[#282c34]"
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
        {status === "checking" && isActive ? (
          <div className="flex items-center justify-center h-full bg-[#282c34]">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
              <p className="text-zinc-400 text-sm">
                Connecting to Blockbench...
              </p>
            </div>
          </div>
        ) : status === "running" ? (
          <>
            {isActive && (
              <div className="flex items-center justify-between px-3 py-1.5 bg-[#282c34] border-b border-zinc-700 shrink-0">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      frozen ? "bg-amber-500" : "bg-green-500 animate-pulse"
                    }`}
                  />
                  <span className="text-xs font-medium">
                    <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-teal-400 bg-clip-text text-transparent">
                      Blockbench
                    </span>
                    <span className="text-zinc-400"> — 3D Studio</span>
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
                      title="Force reload Blockbench"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reload
                    </button>
                  )}
                  <a
                    href={BLOCKBENCH_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
                    title="Open in new tab"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </a>
                  <button
                    onClick={handleRefresh}
                    className="p-1.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
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
              src={BLOCKBENCH_URL}
              style={{ flex: 1, width: "100%", border: "none" }}
              allow="clipboard-read; clipboard-write; webgl; fullscreen"
              onLoad={() => {
                console.log("[Blockbench] iframe loaded");
              }}
              onError={() => {
                console.error("[Blockbench] iframe failed to load");
                setStatus("stopped");
              }}
            />
          </>
        ) : status === "stopped" && isActive ? (
          <BlockbenchFallback retrying={retrying} onRetry={checkServer} />
        ) : null}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Fallback screen when Blockbench isn't running                      */
/* ------------------------------------------------------------------ */

function BlockbenchFallback({
  retrying,
  onRetry,
}: {
  retrying: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-[#282c34] text-white">
      <AlertTriangle className="w-12 h-12 text-amber-400 mb-4" />
      <h2 className="text-xl font-semibold mb-2">Blockbench 3D Studio Not Running</h2>
      <p className="text-zinc-400 text-sm text-center max-w-md mb-6">
        Blockbench isn&apos;t running on port 3001.
        <br />
        Start it with the command below:
      </p>

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-6 font-mono text-sm max-w-lg w-full">
        <div className="text-zinc-500 text-xs mb-2"># From the project root:</div>
        <div className="text-green-400">cd blockbench &amp;&amp; npm run serve</div>
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
          href={BLOCKBENCH_URL}
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
            cd blockbench &amp;&amp; npm install &amp;&amp; npm run serve
          </code>
        </p>
        <p className="mt-2">
          <strong className="text-zinc-400">About Blockbench:</strong> A free, open-source
          3D model editor for low-poly models with pixel art textures. Supports modeling,
          texturing, animation, and plugin extensions.
        </p>
      </div>
    </div>
  );
}

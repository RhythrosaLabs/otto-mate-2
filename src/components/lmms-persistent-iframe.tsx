"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  RefreshCw,
  AlertTriangle,
  Maximize2,
  ExternalLink,
  RotateCcw,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";

const AUDIOMASS_URL = "https://audiomass.co";

/**
 * Persistent openDAW iframe that lives in the Computer layout.
 *
 * - Only mounts the iframe after the user first visits /computer/audio-studio
 * - When on audio-studio: visible overlay with toolbar + iframe
 * - When on other pages: iframe moves off-screen (keeps state alive)
 * - Handles fallback UI when openDAW isn't running
 */
export function LmmsPersistentIframe() {
  const pathname = usePathname();
  const isActive = pathname === "/computer/audio-studio";

  const [hasVisited, setHasVisited] = useState(false);
  const [status, setStatus] = useState<"checking" | "running" | "stopped">(
    "running"
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

  // Retry after iframe load error
  const checkServer = useCallback(() => {
    setStatus("running");
    setFrozen(false);
  }, []);

  // Force-reload: destroy and recreate the iframe
  const handleForceReload = useCallback(() => {
    setFrozen(false);
    if (iframeRef.current) {
      iframeRef.current.src = "about:blank";
      setTimeout(() => {
        if (iframeRef.current) {
          iframeRef.current.src = AUDIOMASS_URL;
        }
      }, 200);
    }
  }, []);

  const handleRefresh = useCallback(() => {
    if (iframeRef.current) {
      iframeRef.current.src = AUDIOMASS_URL;
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
      >
        {status === "running" ? (
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
                      AudioMass
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
                      title="Force reload AudioMass"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reload
                    </button>
                  )}
                  <a
                    href={AUDIOMASS_URL}
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
              src={AUDIOMASS_URL}
              style={{ flex: 1, width: "100%", border: "none" }}
              allow="clipboard-read; clipboard-write; autoplay; microphone"
              onLoad={() => {
                console.log("[AudioMass] iframe loaded");
              }}
              onError={() => {
                console.error("[AudioMass] iframe failed to load");
                setStatus("stopped");
              }}
            />
          </>
        ) : status === "stopped" && isActive ? (
          <AudioMassFallback retrying={retrying} onRetry={checkServer} />
        ) : null}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Fallback screen when AudioMass can't load                         */
/* ------------------------------------------------------------------ */

function AudioMassFallback({
  retrying,
  onRetry,
}: {
  retrying: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-[#1a1a2e] text-white">
      <AlertTriangle className="w-12 h-12 text-amber-400 mb-4" />
      <h2 className="text-xl font-semibold mb-2">Audio Studio Unavailable</h2>
      <p className="text-zinc-400 text-sm text-center max-w-md mb-6">
        Could not load the audio studio.<br />
        Check your internet connection and try again.
      </p>

      <div className="flex gap-3">
        <button
          onClick={onRetry}
          disabled={retrying}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${retrying ? "animate-spin" : ""}`} />
          Retry
        </button>
        <a
          href={AUDIOMASS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          Open in New Tab
        </a>
        <Link
          href="/computer"
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>
      </div>
    </div>
  );
}

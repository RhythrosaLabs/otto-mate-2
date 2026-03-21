"use client";

import { useState, useCallback } from "react";
import {
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  ArrowLeft,
  Maximize2,
} from "lucide-react";
import Link from "next/link";

const BOLT_DIY_URL = "http://localhost:5173";

/**
 * Embeds Forge (bolt.diy) in a full-height iframe within the Ottomate layout.
 * Shows a fallback screen when Forge is not running.
 */
export function AppBuilderEmbed({ initiallyRunning }: { initiallyRunning: boolean }) {
  const [running, setRunning] = useState(initiallyRunning);
  const [retrying, setRetrying] = useState(false);
  const [iframeError, setIframeError] = useState(false);

  const checkAndRetry = useCallback(async () => {
    setRetrying(true);
    try {
      const res = await fetch(BOLT_DIY_URL, { mode: "no-cors" });
      // no-cors always returns opaque, so any response means it's up
      setRunning(true);
      setIframeError(false);
    } catch {
      setRunning(false);
    } finally {
      setRetrying(false);
    }
  }, []);

  if (running && !iframeError) {
    return (
      <div className="h-[calc(100vh-56px)] md:h-screen w-full flex flex-col">
        {/* Minimal toolbar */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-[#0a0a0a] border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs font-medium"><span className="bg-gradient-to-r from-violet-400 via-pink-400 to-orange-400 bg-clip-text text-transparent">Forge</span><span className="text-zinc-400"> — App Builder</span></span>
          </div>
          <div className="flex items-center gap-1">
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
              onClick={checkAndRetry}
              className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${retrying ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Forge iframe */}
        <iframe
          src={BOLT_DIY_URL}
          className="flex-1 w-full border-0"
          allow="cross-origin-isolated; clipboard-read; clipboard-write"
          onError={() => setIframeError(true)}
        />
      </div>
    );
  }

  return <AppBuilderFallback retrying={retrying} onRetry={checkAndRetry} />;
}

function AppBuilderFallback({ retrying, onRetry }: { retrying: boolean; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-[#0a0a0a] text-white">
      <AlertTriangle className="w-12 h-12 text-amber-400 mb-4" />
      <h2 className="text-xl font-semibold mb-2">App Builder Not Running</h2>
      <p className="text-zinc-400 text-sm text-center max-w-md mb-6">
        The Forge app builder server isn&apos;t running on port 5173.
        <br />
        Start it with the command below:
      </p>

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-6 font-mono text-sm max-w-lg w-full">
        <div className="text-zinc-500 text-xs mb-2"># From the project root:</div>
        <div className="text-green-400">cd bolt-diy && pnpm run dev</div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onRetry}
          disabled={retrying}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${retrying ? "animate-spin" : ""}`} />
          {retrying ? "Checking..." : "Retry Connection"}
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
          Back to Ottomate
        </Link>
      </div>

      <div className="mt-8 text-zinc-500 text-xs text-center max-w-md">
        <p className="mb-2">
          <strong className="text-zinc-400">First time?</strong> Run{" "}
          <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300">
            cd bolt-diy && pnpm install && pnpm run dev
          </code>
        </p>
        <p>
          Or run both servers at once:{" "}
          <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300">
            npm run dev:all
          </code>
        </p>
      </div>
    </div>
  );
}

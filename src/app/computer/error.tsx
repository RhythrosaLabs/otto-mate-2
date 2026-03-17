"use client";

export default function ComputerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex items-center justify-center h-[calc(100vh-56px)] md:h-screen">
      <div className="flex flex-col items-center gap-4 max-w-md text-center px-4">
        <div className="w-12 h-12 rounded-full bg-red-400/10 flex items-center justify-center">
          <span className="text-2xl">⚠️</span>
        </div>
        <h2 className="text-lg font-semibold text-pplx-text">Something went wrong</h2>
        <p className="text-sm text-pplx-muted">
          {error.message || "An unexpected error occurred. Please try again."}
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 rounded-lg bg-pplx-accent text-white text-sm font-medium hover:bg-pplx-accent-hover transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

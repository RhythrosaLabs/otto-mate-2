import type { Metadata } from "next";

export const metadata: Metadata = { title: "App Builder — Ottomate" };

/**
 * Minimal placeholder page for the App Builder route.
 * The actual bolt.diy iframe is rendered by <BoltPersistentIframe /> in the
 * Computer layout so it survives route changes without losing state.
 */
export default function AppBuilderPage() {
  return (
    <div className="h-full w-full">
      {/* Intentionally empty — the persistent iframe overlay handles everything */}
    </div>
  );
}

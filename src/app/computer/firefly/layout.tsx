import type { Metadata } from "next";

export const metadata: Metadata = { title: "Nova — Ottomate" };

/**
 * Firefly layout — provides the inner Firefly navigation sidebar
 * similar to Adobe Firefly's own left sidebar within the main Ottomate shell.
 */
export default function FireflyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full w-full">
      {children}
    </div>
  );
}

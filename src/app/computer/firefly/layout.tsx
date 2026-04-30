import type { Metadata } from "next";
import { TierGate } from "@/components/tier-gate";

export const metadata: Metadata = { title: "Nova — Ottomate" };

export default function FireflyLayout({ children }: { children: React.ReactNode }) {
  return (
    <TierGate feature="creative_suite" featureLabel="Creative Suite">
      <div className="h-full w-full">
        {children}
      </div>
    </TierGate>
  );
}

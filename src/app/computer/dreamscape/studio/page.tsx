import type { Metadata } from "next";
import { DreamscapeClient } from "../dreamscape-client";
import { TierGate } from "@/components/tier-gate";

export const metadata: Metadata = { title: "Video Studio — Ottomate" };

export default function VideoStudioPage() {
  return (
    <TierGate feature="video_suite" featureLabel="Video Studio">
      <DreamscapeClient defaultAgentOpen />
    </TierGate>
  );
}

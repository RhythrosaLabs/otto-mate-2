import type { Metadata } from "next";
import { DreamscapeClient } from "../dreamscape-client";

export const metadata: Metadata = { title: "Video Studio — Ottomate" };

export default function VideoStudioPage() {
  return <DreamscapeClient defaultAgentOpen />;
}

import type { Metadata } from "next";
import { AudioStudioEmbed } from "./audio-studio-client";

export const metadata: Metadata = { title: "Audio Studio — Ottomate" };

/**
 * Audio Studio page — the actual LMMS iframe is managed by
 * LmmsPersistentIframe in the Computer layout for state persistence.
 */
export default function AudioStudioPage() {
  return <AudioStudioEmbed />;
}

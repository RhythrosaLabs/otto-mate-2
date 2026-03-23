import type { Metadata } from "next";
import { AudioStudioEmbed } from "./audio-studio-client";

export const metadata: Metadata = { title: "Audio Studio — Ottomate" };

export default function AudioStudioPage() {
  return (
    <div className="h-full">
      <AudioStudioEmbed />
    </div>
  );
}

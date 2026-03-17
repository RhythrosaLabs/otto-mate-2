import type { Metadata } from "next";
import { DreamscapeClient } from "./dreamscape-client";

export const metadata: Metadata = { title: "Video Producer — Ottomate" };

export default function DreamscapePage() {
  return <DreamscapeClient />;
}

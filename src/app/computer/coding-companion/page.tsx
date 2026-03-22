import type { Metadata } from "next";
import { CodingCompanionEmbed } from "./coding-companion-client";

export const metadata: Metadata = { title: "Coding Companion — Ottomate" };

/**
 * Coding Companion page — the actual Kilocode iframe is managed by
 * KilocodePersistentIframe in the Computer layout for state persistence.
 */
export default function CodingCompanionPage() {
  return <CodingCompanionEmbed />;
}

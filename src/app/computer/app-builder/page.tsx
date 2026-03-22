import type { Metadata } from "next";
import { AppBuilderEmbed } from "./app-builder-client";

export const metadata: Metadata = { title: "App Builder — Ottomate" };

/**
 * App Builder page — the actual Forge iframe is managed by
 * BoltPersistentIframe in the Computer layout for state persistence.
 */
export default function AppBuilderPage() {
  return <AppBuilderEmbed />;
}

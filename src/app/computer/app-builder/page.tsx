import type { Metadata } from "next";
import { AppBuilderClient } from "./app-builder-client-legacy";

export const metadata: Metadata = { title: "App Builder — Ottomate" };

/**
 * App Builder page — built-in AI-powered web app generator.
 * Uses streaming LLM code generation with srcDoc preview (no WebContainers).
 */
export default function AppBuilderPage() {
  return <AppBuilderClient />;
}

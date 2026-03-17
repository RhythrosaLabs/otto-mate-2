import type { Metadata } from "next";
import { AppBuilderClient } from "./app-builder-client";

export const metadata: Metadata = { title: "App Builder — Ottomate" };

export default function AppBuilderPage() {
  return <AppBuilderClient />;
}

import type { Metadata } from "next";
import { PlaygroundClient } from "./playground-client";

export const metadata: Metadata = { title: "Multimedia Playground — Ottomate" };

export default function PlaygroundPage() {
  return <PlaygroundClient />;
}

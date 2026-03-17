import type { Metadata } from "next";
import { DreamMachineClient } from "./dream-machine-client";

export const metadata: Metadata = { title: "Dream Machine — Ottomate" };

export default function DreamMachinePage() {
  return <DreamMachineClient />;
}

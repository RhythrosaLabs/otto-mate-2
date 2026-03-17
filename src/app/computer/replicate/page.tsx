import type { Metadata } from "next";
import { ReplicateClient } from "./replicate-client";

export const metadata: Metadata = { title: "Replicate — Ottomate" };

export default function ReplicatePage() {
  return <ReplicateClient />;
}

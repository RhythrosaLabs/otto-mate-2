import type { Metadata } from "next";
import { PipelinesClient } from "./pipelines-client";

export const metadata: Metadata = { title: "Pipelines — Ottomate" };

export default function PipelinesPage() {
  return <PipelinesClient />;
}

import type { Metadata } from "next";
import { DispatchClient } from "./dispatch-client";

export const metadata: Metadata = { title: "Dispatch — Ottomate" };

export default function DispatchPage() {
  return <DispatchClient />;
}

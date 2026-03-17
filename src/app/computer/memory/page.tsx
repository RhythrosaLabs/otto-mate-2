import type { Metadata } from "next";
import MemoryClient from "./memory-client";

export const metadata: Metadata = {
  title: "Memory — Ottomate",
};

export default function MemoryPage() {
  return <MemoryClient />;
}

import type { Metadata } from "next";
import MemoryClient from "./memory-client";

export const metadata: Metadata = {
  title: "Memory — Ottomatron",
};

export default function MemoryPage() {
  return <MemoryClient />;
}

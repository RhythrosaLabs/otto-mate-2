import type { Metadata } from "next";
import { SessionsClient } from "./sessions-client";

export const metadata: Metadata = { title: "Sessions — Ottomate" };

export default function SessionsPage() {
  return <SessionsClient />;
}

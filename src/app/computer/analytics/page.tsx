import type { Metadata } from "next";
import { AnalyticsClient } from "./analytics-client";

export const metadata: Metadata = { title: "Analytics — Ottomate" };

export default function AnalyticsPage() {
  return <AnalyticsClient />;
}

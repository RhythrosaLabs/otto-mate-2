import type { Metadata } from "next";
import ScheduledTasksClient from "./scheduled-tasks-client";

export const metadata: Metadata = { title: "Scheduled Tasks — Ottomate" };

export default function ScheduledTasksPage() {
  return <ScheduledTasksClient />;
}

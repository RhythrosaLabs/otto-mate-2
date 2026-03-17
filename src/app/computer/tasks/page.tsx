import type { Metadata } from "next";
import { listTasks } from "@/lib/db";
import { TasksClientPage } from "./tasks-client";
import type { Task } from "@/lib/types";

export const metadata: Metadata = { title: "Tasks — Ottomate" };
export const dynamic = "force-dynamic";

export default function TasksPage() {
  let tasks: Task[] = [];
  try {
    tasks = listTasks() as Task[];
  } catch (err) {
    console.error("[tasks] Failed to load tasks:", err);
  }
  return <TasksClientPage initialTasks={tasks} />;
}

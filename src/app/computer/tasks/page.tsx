import type { Metadata } from "next";
import { listTasks } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { TasksClientPage } from "./tasks-client";
import type { Task } from "@/lib/types";

export const metadata: Metadata = { title: "Tasks — Ottomate" };
export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const session = await getSession();
  let tasks: Task[] = [];
  try {
    tasks = await listTasks(undefined, 50, 0, session?.userId) as Task[];
  } catch (err) {
    console.error("[tasks] Failed to load tasks:", err);
  }
  return <TasksClientPage initialTasks={tasks} />;
}

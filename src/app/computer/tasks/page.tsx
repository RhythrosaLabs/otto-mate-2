import { listTasks } from "@/lib/db";
import { TasksClientPage } from "./tasks-client";
import type { Task } from "@/lib/types";

export const dynamic = "force-dynamic";

export default function TasksPage() {
  const tasks = listTasks() as Task[];
  return <TasksClientPage initialTasks={tasks} />;
}

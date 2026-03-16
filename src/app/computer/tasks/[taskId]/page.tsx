import { getTask } from "@/lib/db";
import { notFound } from "next/navigation";
import { TaskDetailClient } from "./task-detail-client";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ taskId: string }>;
}

export default async function TaskDetailPage({ params }: Props) {
  const { taskId } = await params;
  const task = getTask(taskId);
  
  if (!task) notFound();

  return <TaskDetailClient task={task} />;
}

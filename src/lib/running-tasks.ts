// Global map of running tasks → AbortControllers
// Shared between run and stop route handlers
export const runningTasks = new Map<string, AbortController>();

const MAX_RUNNING_TASKS = 200;

/** Register a task as running. Cleans up stale entries if map grows too large. */
export function registerRunningTask(taskId: string, controller: AbortController): void {
  runningTasks.set(taskId, controller);
  if (runningTasks.size > MAX_RUNNING_TASKS) {
    // Evict oldest entries (first inserted)
    const iter = runningTasks.keys();
    while (runningTasks.size > MAX_RUNNING_TASKS) {
      const oldest = iter.next();
      if (oldest.done) break;
      runningTasks.delete(oldest.value);
    }
  }
}

/** Remove a task from the running map. */
export function unregisterRunningTask(taskId: string): void {
  runningTasks.delete(taskId);
}

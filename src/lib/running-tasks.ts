// Global map of running tasks → AbortControllers
// Shared between run and stop route handlers
export const runningTasks = new Map<string, AbortController>();

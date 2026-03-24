/**
 * Shared in-memory session store for the Computer Control agent loop.
 *
 * Because the Next.js dev server runs as a single Node process, a module-level
 * Map persists across requests (same as running-tasks.ts that the task runner uses).
 * Each active session holds its AbortController and a resolver function for
 * pending permission prompts so the client can approve/deny mid-stream.
 */

export interface ComputerSession {
  id: string;
  status: "running" | "waiting_permission" | "done" | "error";
  abortController: AbortController;
  /** Resolved when the user approves or denies a permission request */
  permissionResolve?: (approved: boolean) => void;
  pendingApp?: string;
}

export const computerSessions = new Map<string, ComputerSession>();

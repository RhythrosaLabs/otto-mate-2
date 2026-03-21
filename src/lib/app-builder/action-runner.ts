/**
 * Action Runner — Bolt.new-style sequential action execution pipeline
 *
 * Processes `<boltAction>` elements in order:
 *   - type="file"  → writes file content to the virtual project
 *   - type="shell" → simulates shell command execution (npm install, build, etc.)
 *   - type="start" → starts a dev server (marks as running)
 *
 * Each action transitions through: pending → running → complete | failed | aborted
 * Actions are executed sequentially to respect dependency ordering.
 *
 * Based on: github.com/stackblitz/bolt.new/blob/main/app/lib/runtime/action-runner.ts
 */

import type {
  BoltAction,
  ActionCallbackData,
} from "./streaming-message-parser";

// ─── Types ──────────────────────────────────────────────────────────────────

export type ActionStatus =
  | "pending"
  | "running"
  | "complete"
  | "aborted"
  | "failed";

export interface ActionState {
  actionId: string;
  type: BoltAction["type"];
  content: string;
  filePath?: string;
  status: ActionStatus;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface ActionRunnerCallbacks {
  onActionStateChange?: (actionId: string, state: ActionState) => void;
  onFileWrite?: (filePath: string, content: string) => void;
  onShellCommand?: (command: string, output: string) => void;
  onShellStart?: (command: string) => void;
  onLog?: (level: "info" | "success" | "error" | "warn" | "command", message: string) => void;
}

// ─── Simulated Shell Responses ──────────────────────────────────────────────

function simulateShellCommand(command: string): {
  output: string;
  success: boolean;
  duration: number;
} {
  const cmd = command.trim().toLowerCase();

  // npm install
  if (cmd.includes("npm install") || cmd.includes("npm i ") || cmd === "npm i") {
    const packages = cmd
      .replace(/npm\s+(install|i)\s*/, "")
      .replace(/--save-dev|--save|-D|-S/g, "")
      .trim();

    if (packages) {
      return {
        output: `added ${Math.floor(Math.random() * 50 + 10)} packages in ${(Math.random() * 3 + 1).toFixed(1)}s\n\n${packages.split(/\s+/).length} packages installed`,
        success: true,
        duration: 2000,
      };
    }
    return {
      output: `added ${Math.floor(Math.random() * 200 + 50)} packages, and audited ${Math.floor(Math.random() * 300 + 100)} packages in ${(Math.random() * 8 + 2).toFixed(1)}s\n\nfound 0 vulnerabilities`,
      success: true,
      duration: 3000,
    };
  }

  // npm run dev / npm start
  if (cmd.includes("npm run dev") || cmd.includes("npm start") || cmd.includes("npx vite")) {
    return {
      output: `  VITE v5.4.0  ready in ${Math.floor(Math.random() * 500 + 200)} ms\n\n  ➜  Local:   http://localhost:5173/\n  ➜  Network: use --host to expose`,
      success: true,
      duration: 1500,
    };
  }

  // npm run build
  if (cmd.includes("npm run build") || cmd.includes("npx vite build")) {
    return {
      output: `vite v5.4.0 building for production...\n✓ ${Math.floor(Math.random() * 50 + 10)} modules transformed.\ndist/index.html    0.46 kB │ gzip: 0.30 kB\ndist/assets/index-*.css  ${(Math.random() * 20 + 5).toFixed(2)} kB │ gzip: ${(Math.random() * 5 + 1).toFixed(2)} kB\ndist/assets/index-*.js   ${(Math.random() * 100 + 30).toFixed(2)} kB │ gzip: ${(Math.random() * 30 + 10).toFixed(2)} kB\n✓ built in ${(Math.random() * 3 + 0.5).toFixed(2)}s`,
      success: true,
      duration: 2000,
    };
  }

  // npx create-*
  if (cmd.includes("npx create-") || cmd.includes("npx --yes create-")) {
    return {
      output: `Creating a new project...\n✔ Project created successfully\n\nNext steps:\n  cd my-app\n  npm install\n  npm run dev`,
      success: true,
      duration: 3000,
    };
  }

  // node command
  if (cmd.startsWith("node ")) {
    return {
      output: `Script executed successfully`,
      success: true,
      duration: 500,
    };
  }

  // mkdir
  if (cmd.startsWith("mkdir")) {
    return {
      output: "",
      success: true,
      duration: 100,
    };
  }

  // Generic command
  return {
    output: `$ ${command}\n[completed]`,
    success: true,
    duration: 500,
  };
}

// ─── Action Runner Class ────────────────────────────────────────────────────

export class ActionRunner {
  #actions = new Map<string, ActionState>();
  #executionQueue: Promise<void> = Promise.resolve();
  #callbacks: ActionRunnerCallbacks;

  constructor(callbacks: ActionRunnerCallbacks = {}) {
    this.#callbacks = callbacks;
  }

  get actions(): Map<string, ActionState> {
    return this.#actions;
  }

  get actionsList(): ActionState[] {
    return Array.from(this.#actions.values());
  }

  /**
   * Register an action (called when <boltAction> opens during streaming).
   * Sets it to "pending" status.
   */
  addAction(data: ActionCallbackData): void {
    const { actionId, action } = data;

    if (this.#actions.has(actionId)) return;

    const state: ActionState = {
      actionId,
      type: action.type,
      content: action.content,
      filePath: action.type === "file" ? (action as { filePath: string }).filePath : undefined,
      status: "pending",
    };

    this.#actions.set(actionId, state);
    this.#callbacks.onActionStateChange?.(actionId, state);
  }

  /**
   * Execute an action (called when <boltAction> closes during streaming).
   * Queues it for sequential execution.
   */
  runAction(data: ActionCallbackData): void {
    const { actionId, action } = data;

    // Update action content (it's now complete)
    const existing = this.#actions.get(actionId);
    if (existing) {
      existing.content = action.content;
      if (action.type === "file") {
        existing.filePath = (action as { filePath: string }).filePath;
      }
    } else {
      this.addAction(data);
    }

    // Queue the execution
    this.#executionQueue = this.#executionQueue
      .then(() => this.#executeAction(actionId))
      .catch((error) => {
        console.error("Action execution failed:", error);
      });
  }

  /**
   * Execute a single action based on its type.
   */
  async #executeAction(actionId: string): Promise<void> {
    const action = this.#actions.get(actionId);
    if (!action) return;

    this.#updateAction(actionId, { status: "running", startedAt: Date.now() });

    try {
      switch (action.type) {
        case "file":
          await this.#executeFileAction(action);
          break;
        case "shell":
          await this.#executeShellAction(action);
          break;
        case "start":
          await this.#executeStartAction(action);
          break;
      }

      this.#updateAction(actionId, {
        status: "complete",
        completedAt: Date.now(),
      });
    } catch (error) {
      this.#updateAction(actionId, {
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
        completedAt: Date.now(),
      });
    }
  }

  async #executeFileAction(action: ActionState): Promise<void> {
    if (!action.filePath) return;

    this.#callbacks.onLog?.("command", `Creating file: ${action.filePath}`);
    this.#callbacks.onFileWrite?.(action.filePath, action.content);
    this.#callbacks.onLog?.("success", `✓ File written: ${action.filePath}`);

    // Small delay to simulate file I/O
    await new Promise((r) => setTimeout(r, 50));
  }

  async #executeShellAction(action: ActionState): Promise<void> {
    const command = action.content.trim();
    this.#callbacks.onLog?.("command", `$ ${command}`);
    this.#callbacks.onShellStart?.(command);

    const result = simulateShellCommand(command);

    // Simulate execution time
    await new Promise((r) => setTimeout(r, Math.min(result.duration, 3000)));

    if (result.output) {
      this.#callbacks.onLog?.(
        result.success ? "info" : "error",
        result.output
      );
    }

    this.#callbacks.onShellCommand?.(command, result.output);

    if (result.success) {
      this.#callbacks.onLog?.("success", `✓ Command completed`);
    } else {
      throw new Error(`Command failed: ${command}`);
    }
  }

  async #executeStartAction(action: ActionState): Promise<void> {
    const command = action.content.trim();
    this.#callbacks.onLog?.("command", `$ ${command}`);
    this.#callbacks.onLog?.("info", "Starting development server...");

    await new Promise((r) => setTimeout(r, 1500));

    this.#callbacks.onLog?.(
      "success",
      `  VITE v5.4.0  ready in ${Math.floor(Math.random() * 500 + 200)} ms\n\n  ➜  Local:   http://localhost:5173/`
    );
  }

  #updateAction(actionId: string, update: Partial<ActionState>): void {
    const action = this.#actions.get(actionId);
    if (!action) return;

    Object.assign(action, update);
    this.#callbacks.onActionStateChange?.(actionId, { ...action });
  }

  /**
   * Abort all running/pending actions
   */
  abortAll(): void {
    for (const [id, action] of this.#actions) {
      if (action.status === "pending" || action.status === "running") {
        this.#updateAction(id, { status: "aborted", completedAt: Date.now() });
      }
    }
  }

  /**
   * Reset all actions
   */
  reset(): void {
    this.#actions.clear();
  }
}

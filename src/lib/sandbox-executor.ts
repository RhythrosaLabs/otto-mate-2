// ─── Sandboxed Code Execution Engine ────────────────────────────────────────
// Provides isolated execution environments for untrusted code.
// Inspired by OpenSandbox (container-based) and WebVM (browser isolation).
//
// Strategy: Three tiers of sandbox based on availability:
// 1. Docker container (strongest isolation, requires Docker)
// 2. Node.js VM module (medium isolation, always available for JS)
// 3. Subprocess with restrictions (basic isolation, always available)

import { execSync, spawn } from "child_process";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SandboxOptions {
  language: "python" | "javascript" | "bash";
  code: string;
  timeout_ms?: number;       // Default: 30000
  max_memory_mb?: number;    // Default: 256
  allow_network?: boolean;   // Default: false
  allow_filesystem?: boolean; // Default: false (uses temp dir)
  working_dir?: string;      // Temp dir created if not specified
  env_vars?: Record<string, string>;
  packages?: string[];       // Auto-install before execution
}

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exit_code: number;
  execution_time_ms: number;
  sandbox_tier: "docker" | "vm" | "subprocess";
  truncated: boolean;
  error?: string;
}

// ─── Docker Check ────────────────────────────────────────────────────────────

let _dockerAvailable: boolean | null = null;

export function isDockerAvailable(): boolean {
  if (_dockerAvailable !== null) return _dockerAvailable;
  try {
    execSync("docker info", { timeout: 5000, stdio: "pipe" });
    _dockerAvailable = true;
  } catch {
    _dockerAvailable = false;
  }
  return _dockerAvailable;
}

// ─── Main Sandbox Executor ──────────────────────────────────────────────────

export async function executeSandboxed(options: SandboxOptions): Promise<SandboxResult> {
  const timeout = options.timeout_ms || 30000;
  const maxMemory = options.max_memory_mb || 256;
  const startTime = Date.now();

  // Tier 1: Docker (strongest isolation)
  if (isDockerAvailable() && !options.allow_filesystem) {
    try {
      return await executeInDocker(options, timeout, maxMemory);
    } catch (err) {
      console.warn("[sandbox] Docker execution failed, falling back:", err);
    }
  }

  // Tier 2: Node VM for JavaScript
  if (options.language === "javascript") {
    try {
      return await executeInNodeVM(options, timeout, maxMemory);
    } catch (err) {
      console.warn("[sandbox] VM execution failed, falling back:", err);
    }
  }

  // Tier 3: Restricted subprocess (always available)
  return executeInSubprocess(options, timeout, startTime);
}

// ─── Tier 1: Docker Sandbox ─────────────────────────────────────────────────

async function executeInDocker(
  options: SandboxOptions,
  timeout: number,
  maxMemory: number
): Promise<SandboxResult> {
  const startTime = Date.now();
  const image = getDockerImage(options.language);

  // Build docker run command with restrictions
  const dockerArgs = [
    "run", "--rm",
    "--network", options.allow_network ? "bridge" : "none",
    "--memory", `${maxMemory}m`,
    "--cpus", "1",
    "--pids-limit", "100",
    "--read-only",
    "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m",
    "--security-opt", "no-new-privileges",
  ];

  // Add env vars
  if (options.env_vars) {
    for (const [key, value] of Object.entries(options.env_vars)) {
      // Sanitize key to prevent injection
      if (/^[A-Z_][A-Z0-9_]*$/i.test(key)) {
        dockerArgs.push("-e", `${key}=${value}`);
      }
    }
  }

  // Package install + code execution
  let script: string;
  if (options.packages && options.packages.length > 0) {
    const installCmd = getInstallCommand(options.language, options.packages);
    script = `${installCmd} 2>/dev/null; ${getRunCommand(options.language, options.code)}`;
  } else {
    script = getRunCommand(options.language, options.code);
  }

  dockerArgs.push(image, "/bin/sh", "-c", script);

  return new Promise<SandboxResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let truncated = false;
    const maxOutput = 100 * 1024; // 100KB

    const proc = spawn("docker", dockerArgs, { timeout });

    proc.stdout!.on("data", (data: Buffer) => {
      if (stdout.length < maxOutput) {
        stdout += data.toString();
      } else {
        truncated = true;
      }
    });

    proc.stderr!.on("data", (data: Buffer) => {
      if (stderr.length < maxOutput) {
        stderr += data.toString();
      }
    });

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      resolve({
        stdout: stdout.slice(0, maxOutput),
        stderr: "Execution timed out",
        exit_code: 124,
        execution_time_ms: Date.now() - startTime,
        sandbox_tier: "docker",
        truncated,
        error: `Execution exceeded ${timeout}ms timeout`,
      });
    }, timeout);

    proc.on("close", (code: number | null) => {
      clearTimeout(timer);
      resolve({
        stdout: stdout.slice(0, maxOutput),
        stderr: stderr.slice(0, maxOutput),
        exit_code: code ?? 1,
        execution_time_ms: Date.now() - startTime,
        sandbox_tier: "docker",
        truncated,
      });
    });

    proc.on("error", (err: Error) => {
      clearTimeout(timer);
      resolve({
        stdout: "",
        stderr: err.message,
        exit_code: 1,
        execution_time_ms: Date.now() - startTime,
        sandbox_tier: "docker",
        truncated: false,
        error: `Docker execution error: ${err.message}`,
      });
    });
  });
}

// ─── Tier 2: Node.js VM (JavaScript only) ───────────────────────────────────

async function executeInNodeVM(
  options: SandboxOptions,
  timeout: number,
  _maxMemory: number
): Promise<SandboxResult> {
  const startTime = Date.now();
  const vm = await import("vm");

  // Create restricted context
  const output: string[] = [];
  const errors: string[] = [];

  const sandbox = {
    console: {
      log: (...args: unknown[]) => output.push(args.map(String).join(" ")),
      error: (...args: unknown[]) => errors.push(args.map(String).join(" ")),
      warn: (...args: unknown[]) => errors.push(args.map(String).join(" ")),
      info: (...args: unknown[]) => output.push(args.map(String).join(" ")),
    },
    setTimeout: undefined,
    setInterval: undefined,
    fetch: options.allow_network ? globalThis.fetch : undefined,
    JSON,
    Math,
    Date,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Map,
    Set,
    Promise,
    Error,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
  };

  const context = vm.createContext(sandbox);

  try {
    const script = new vm.Script(options.code, { filename: "sandbox.js" });
    const result = script.runInContext(context, { timeout });

    // If result is a promise, await it
    if (result && typeof result === "object" && typeof result.then === "function") {
      try {
        const resolved = await Promise.race([
          result,
          new Promise((_, reject) => setTimeout(() => reject(new Error("Async timeout")), timeout)),
        ]);
        if (resolved !== undefined) {
          output.push(String(resolved));
        }
      } catch (asyncErr) {
        errors.push(String(asyncErr));
      }
    } else if (result !== undefined) {
      output.push(typeof result === "object" ? JSON.stringify(result, null, 2) : String(result));
    }

    return {
      stdout: output.join("\n").slice(0, 100000),
      stderr: errors.join("\n").slice(0, 100000),
      exit_code: errors.length > 0 ? 1 : 0,
      execution_time_ms: Date.now() - startTime,
      sandbox_tier: "vm",
      truncated: output.join("\n").length > 100000,
    };
  } catch (err) {
    return {
      stdout: output.join("\n"),
      stderr: err instanceof Error ? err.message : String(err),
      exit_code: 1,
      execution_time_ms: Date.now() - startTime,
      sandbox_tier: "vm",
      truncated: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Tier 3: Restricted Subprocess ──────────────────────────────────────────

function executeInSubprocess(
  options: SandboxOptions,
  timeout: number,
  startTime: number
): Promise<SandboxResult> {
  return new Promise((resolve) => {
    const { language, code, packages } = options;

    // Build command with package install if needed
    let fullScript: string;
    if (packages && packages.length > 0) {
      const installCmd = getInstallCommand(language, packages);
      fullScript = `${installCmd} 2>/dev/null\n${getRunCommand(language, code)}`;
    } else {
      fullScript = getRunCommand(language, code);
    }

    let stdout = "";
    let stderr = "";
    let truncated = false;
    const maxOutput = 100 * 1024;

    // Use restrictive env
    const env = {
      PATH: "/usr/local/bin:/usr/bin:/bin",
      HOME: "/tmp",
      LANG: "en_US.UTF-8",
      ...(options.env_vars || {}),
    } as unknown as NodeJS.ProcessEnv;

    const proc = spawn("sh", ["-c", fullScript], {
      timeout,
      env,
      cwd: options.working_dir || "/tmp",
    });

    proc.stdout?.on("data", (data: Buffer) => {
      if (stdout.length < maxOutput) {
        stdout += data.toString();
      } else {
        truncated = true;
      }
    });

    proc.stderr?.on("data", (data: Buffer) => {
      if (stderr.length < maxOutput) {
        stderr += data.toString();
      }
    });

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      resolve({
        stdout: stdout.slice(0, maxOutput),
        stderr: "Execution timed out",
        exit_code: 124,
        execution_time_ms: Date.now() - startTime,
        sandbox_tier: "subprocess",
        truncated,
        error: `Execution exceeded ${timeout}ms timeout`,
      });
    }, timeout);

    proc.on("close", (code: number | null) => {
      clearTimeout(timer);
      resolve({
        stdout: stdout.slice(0, maxOutput),
        stderr: stderr.slice(0, maxOutput),
        exit_code: code ?? 1,
        execution_time_ms: Date.now() - startTime,
        sandbox_tier: "subprocess",
        truncated,
      });
    });

    proc.on("error", (err: Error) => {
      clearTimeout(timer);
      resolve({
        stdout: "",
        stderr: err.message,
        exit_code: 1,
        execution_time_ms: Date.now() - startTime,
        sandbox_tier: "subprocess",
        truncated: false,
        error: `Subprocess error: ${err.message}`,
      });
    });
  });
}

// ─── Utility Functions ───────────────────────────────────────────────────────

function getDockerImage(language: string): string {
  switch (language) {
    case "python": return "python:3.12-slim";
    case "javascript": return "node:20-slim";
    case "bash": return "alpine:latest";
    default: return "alpine:latest";
  }
}

function getInstallCommand(language: string, packages: string[]): string {
  // Sanitize package names (alphanumeric, dashes, underscores, dots only)
  const safe = packages.filter(p => /^[a-zA-Z0-9._-]+$/.test(p));
  switch (language) {
    case "python": return `pip install --quiet ${safe.join(" ")}`;
    case "javascript": return `npm install --silent ${safe.join(" ")}`;
    default: return "";
  }
}

function getRunCommand(language: string, code: string): string {
  // Escape single quotes in code for shell
  const escaped = code.replace(/'/g, "'\\''");
  switch (language) {
    case "python": return `python3 -c '${escaped}'`;
    case "javascript": return `node -e '${escaped}'`;
    case "bash": return escaped;
    default: return escaped;
  }
}

// ─── Security Validation ────────────────────────────────────────────────────
// Pre-checks code for dangerous patterns before execution.

export interface SecurityCheck {
  safe: boolean;
  warnings: string[];
  blocked_patterns: string[];
}

export function validateCodeSecurity(code: string, language: string): SecurityCheck {
  const warnings: string[] = [];
  const blocked: string[] = [];

  // Universal dangerous patterns
  const universalBlocked = [
    { pattern: /rm\s+(-rf?|--recursive)\s+\//i, desc: "Recursive delete from root" },
    { pattern: /mkfs\b/i, desc: "Filesystem format" },
    { pattern: /dd\s+if=/i, desc: "Raw disk write" },
    { pattern: /:(){ :|:& };:/i, desc: "Fork bomb" },
    { pattern: />\s*\/dev\/sd[a-z]/i, desc: "Direct disk write" },
  ];

  for (const { pattern, desc } of universalBlocked) {
    if (pattern.test(code)) {
      blocked.push(desc);
    }
  }

  // Language-specific checks
  if (language === "python") {
    if (/\bos\.system\b/.test(code)) warnings.push("os.system() call — consider subprocess instead");
    if (/\beval\(/.test(code)) warnings.push("eval() call — potential code injection");
    if (/\bsubprocess\.call\b.*shell\s*=\s*True/i.test(code)) warnings.push("Subprocess with shell=True");
    if (/\bshutil\.rmtree\b/.test(code)) warnings.push("Recursive directory deletion");
  }

  if (language === "javascript") {
    if (/\bchild_process\b/.test(code)) warnings.push("child_process import — shell access");
    if (/\beval\(/.test(code)) warnings.push("eval() call — potential code injection");
    if (/\bprocess\.exit\b/.test(code)) warnings.push("process.exit() — may terminate host");
    if (/require\s*\(\s*['"]fs['"]/.test(code)) warnings.push("Filesystem access via fs module");
  }

  if (language === "bash") {
    if (/\bsudo\b/.test(code)) warnings.push("sudo command — elevated privileges");
    if (/\bcurl\b.*\|\s*(?:bash|sh)\b/.test(code)) blocked.push("Pipe curl to shell (arbitrary code execution)");
    if (/\bchmod\b.*777\b/.test(code)) warnings.push("chmod 777 — world-writable permissions");
  }

  return {
    safe: blocked.length === 0,
    warnings,
    blocked_patterns: blocked,
  };
}

// ─── Format Result for Agent ────────────────────────────────────────────────

export function formatSandboxResult(result: SandboxResult): string {
  let output = `**Sandbox Execution** (${result.sandbox_tier} tier, ${result.execution_time_ms}ms)\n`;
  output += `Exit code: ${result.exit_code}\n`;

  if (result.stdout) {
    output += `\n**Output:**\n\`\`\`\n${result.stdout.slice(0, 5000)}\n\`\`\`\n`;
  }

  if (result.stderr) {
    output += `\n**Errors:**\n\`\`\`\n${result.stderr.slice(0, 2000)}\n\`\`\`\n`;
  }

  if (result.truncated) {
    output += "\n⚠️ Output was truncated (exceeded 100KB limit)\n";
  }

  if (result.error) {
    output += `\n**Error:** ${result.error}\n`;
  }

  return output;
}

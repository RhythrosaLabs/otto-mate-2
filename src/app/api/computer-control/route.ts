import { NextRequest } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { computerSessions, type ComputerSession } from "@/lib/computer-control-sessions";
import {
  takeScreenshot, getScreenSize,
  executeAction, executeBash, executeTextEditor, filterOldScreenshots,
} from "@/lib/computer-use-native";
import { getSetting } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;


type Message = { role: "user" | "assistant"; content: unknown };

function injectPromptCaching(messages: Message[]): void {
  let breakpointsLeft = 3;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "user" && Array.isArray(msg.content) && msg.content.length > 0) {
      const lastItem = (msg.content as Record<string, unknown>[])[msg.content.length - 1];
      if (breakpointsLeft > 0) {
        breakpointsLeft--;
        lastItem.cache_control = { type: "ephemeral" };
      } else {
        delete lastItem.cache_control;
        break;
      }
    }
  }
}

// ─── Main agent loop ──────────────────────────────────────────────────────────

const CURRENT_DATE = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

const SYSTEM_PROMPT = `You are an AI assistant with the ability to control a macOS desktop. You have access to a bash shell, a text editor for files, and full GUI control (screenshots, mouse, keyboard).

<SYSTEM_CAPABILITY>
* You are controlling a real macOS desktop with internet access.
* You have THREE types of tools, in order of preference (fastest → slowest):
  1. bash — run shell commands directly. ALWAYS prefer this for terminal tasks, file operations, installing software, running scripts, etc.
  2. str_replace_based_edit_tool — view and edit files directly. Prefer this over clicking through a GUI editor.
  3. computer — GUI control via screenshots, mouse, keyboard. Use this ONLY when bash/editor are insufficient.
* Use curl instead of wget. You can install macOS software with brew.
* When bash output is very large, redirect to a file and use str_replace_based_edit_tool or grep to read it.
* The current date is ${CURRENT_DATE}.
</SYSTEM_CAPABILITY>

<IMPORTANT>
* Prefer the fastest method: bash for CLI tasks, str_replace_based_edit_tool for file edits, computer for GUI.
* Take a screenshot to verify GUI state, but avoid unnecessary screenshots — they are slow.
* Be careful with destructive actions (deleting files, sending emails, etc.) — confirm with the user first if uncertain.
* When using the browser, wait for pages to load before clicking.
* Chain multiple computer actions into one request where possible.
</IMPORTANT>`;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as {
    task?: string;
    blockedApps?: string[];
    model?: string;
    maxIterations?: number;
  };

  const { task, blockedApps = [], model = "claude-sonnet-4-6", maxIterations: reqMaxIter } = body;
  if (!task?.trim()) {
    return new Response(JSON.stringify({ error: "task is required" }), { status: 400 });
  }

  // Provider fallback chain for computer use:
  // 1. Anthropic (computer_20251124 beta) — best computer use, primary
  // 2. OpenAI GPT-5.4 (computer use support) — strong fallback
  // 3. Google Gemini 2.5 Pro (vision + function calling) — last resort
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const googleKey = process.env.GOOGLE_AI_API_KEY;

  if (!anthropicKey && !openaiKey && !googleKey) {
    return new Response(JSON.stringify({ error: "No AI provider API keys configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_AI_API_KEY." }), { status: 503 });
  }

  const sessionId = uuidv4();
  const abortController = new AbortController();
  const session: ComputerSession = {
    id: sessionId,
    status: "running",
    abortController,
  };
  computerSessions.set(sessionId, session);

  const encoder = new TextEncoder();
  let streamController!: ReadableStreamDefaultController<Uint8Array>;

  function send(data: object) {
    try {
      streamController.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    } catch { /* client disconnected */ }
  }

  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) { streamController = ctrl; },
    cancel() {
      abortController.abort();
      computerSessions.delete(sessionId);
    },
  });

  // ── Start agent loop asynchronously ────────────────────────────────────────
  (async () => {
    try {
      // Report session ID immediately so client can send permission responses
      send({ type: "session", sessionId });

      // Get actual screen size
      const screen = await getScreenSize();

      // Take initial screenshot
      send({ type: "status", status: "running", message: "Taking initial screenshot…" });
      const initSS = await takeScreenshot(sessionId).catch(() => null);
      if (initSS) {
        send({ type: "screenshot", data: initSS.data, width: initSS.apiWidth, height: initSS.apiHeight });
      }

      // apiW/apiH are the dims Claude sees (scaled via aspect-ratio presets);
      // screen.width/height are the LOGICAL screen dims used for actual mouse coords.
      const apiW = initSS?.apiWidth ?? 1280;
      const apiH = initSS?.apiHeight ?? 800;

      const messages: Message[] = [
        {
          role: "user",
          content: [
            ...(initSS ? [{
              type: "image",
              source: { type: "base64", media_type: "image/png", data: initSS.data },
            }] : []),
            { type: "text", text: task },
          ],
        },
      ];

      // Allow client to override; fall back to saved setting, then default of 75
      const savedMaxIter = parseInt(getSetting("max_iterations") ?? "", 10);
      const MAX_ITERATIONS = reqMaxIter && reqMaxIter > 0
        ? Math.min(reqMaxIter, 200)
        : (savedMaxIter > 0 ? savedMaxIter : 75);
      let iterations = 0;

      // ── No Anthropic key: jump directly to fallback providers ────────────
      if (!anthropicKey) {
        if (openaiKey) {
          send({ type: "status", status: "running", message: "Using OpenAI GPT-5.4 for computer use (no Anthropic key)…" });
          await runComputerUseWithOpenAI({
            task, initScreenshot: initSS, apiW, apiH, screen,
            blockedApps, maxIterations: MAX_ITERATIONS, session, sessionId,
            send, abortController, openaiKey,
          });
        } else if (googleKey) {
          send({ type: "status", status: "running", message: "Using Google Gemini for computer use (no Anthropic key)…" });
          await runComputerUseWithGemini({
            task, initScreenshot: initSS, apiW, apiH, screen,
            blockedApps, maxIterations: Math.min(MAX_ITERATIONS, 30), session, sessionId,
            send, abortController, googleKey,
          });
        }
        session.status = "done";
        send({ type: "done", reason: "task_complete" });
        return;
      }

      while (iterations < MAX_ITERATIONS) {
        if (abortController.signal.aborted) break;
        iterations++;

        send({ type: "status", status: "running", message: `Thinking… (step ${iterations})` });

        // Filter old screenshots (keep 3 most recent) to avoid context bloat;
        // mirrors _maybe_filter_to_n_most_recent_images from the reference impl.
        filterOldScreenshots(messages, 3);
        // Add cache_control breakpoints to last 3 user turns (prompt caching);
        // mirrors _inject_prompt_caching from the reference impl.
        injectPromptCaching(messages);

        let resp: Response;
        try {
          resp = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": anthropicKey!,
              "anthropic-version": "2023-06-01",
              // computer-use-2025-11-24 enables computer_20251124 + bash_20250124 + text_editor_20250728
              // prompt-caching reduces cost on repeated context
              "anthropic-beta": "computer-use-2025-11-24,prompt-caching-2024-07-31",
            },
            signal: abortController.signal,
            body: JSON.stringify({
              model,
              max_tokens: 16000,
              // Extended thinking improves reasoning accuracy (budget_tokens must be < max_tokens)
              thinking: { type: "enabled", budget_tokens: 2048 },
              system: [
                {
                  type: "text",
                  text: SYSTEM_PROMPT,
                  cache_control: { type: "ephemeral" },
                },
              ],
              tools: [
                {
                  type: "computer_20251124",
                  name: "computer",
                  display_width_px: apiW,
                  display_height_px: apiH,
                  enable_zoom: true,
                },
                {
                  type: "bash_20250124",
                  name: "bash",
                },
                {
                  type: "text_editor_20250728",
                  name: "str_replace_based_edit_tool",
                },
              ],
              messages,
            }),
          });
        } catch (err) {
          if (abortController.signal.aborted) break;
          throw err;
        }

        if (!resp.ok) {
          const errText = await resp.text();
          let errJson: { error?: { message?: string } } = {};
          try { errJson = JSON.parse(errText); } catch { /* ignore */ }
          const apiMsg = errJson?.error?.message ?? errText;

          // ── Provider Fallback ──────────────────────────────────────────────
          // If Anthropic fails on the FIRST iteration (billing, rate limit, model error),
          // fall back to OpenAI GPT-5.4 computer use, then Google Gemini as last resort.
          // Once Anthropic succeeds at least once, we don't provider-switch mid-run.
          if (iterations === 1) {
            const isRecoverable = resp.status === 402 || resp.status === 429 || resp.status === 529 || resp.status === 503 ||
              /credit.?balance|insufficient.?funds|billing|payment.?required|plan.?limit|rate.?limit|overloaded/i.test(apiMsg);
            if (isRecoverable) {
              // Try OpenAI GPT-5.4 computer use as fallback
              if (openaiKey) {
                send({ type: "status", status: "running", message: `Anthropic unavailable (${resp.status}), falling back to OpenAI GPT-5.4 computer use…` });
                try {
                  await runComputerUseWithOpenAI({
                    task, initScreenshot: initSS, apiW, apiH, screen,
                    blockedApps, maxIterations: MAX_ITERATIONS, session, sessionId,
                    send, abortController, openaiKey,
                  });
                  return; // OpenAI handled the rest
                } catch (oaiErr) {
                  send({ type: "status", status: "running", message: `OpenAI fallback also failed: ${oaiErr instanceof Error ? oaiErr.message : String(oaiErr)}. Trying Google…` });
                }
              }
              // Try Google Gemini as last resort (vision + function calling for screenshot analysis)
              if (googleKey) {
                send({ type: "status", status: "running", message: `Falling back to Google Gemini for vision-guided computer use…` });
                try {
                  await runComputerUseWithGemini({
                    task, initScreenshot: initSS, apiW, apiH, screen,
                    blockedApps, maxIterations: Math.min(MAX_ITERATIONS, 30), session, sessionId,
                    send, abortController, googleKey,
                  });
                  return;
                } catch (gemErr) {
                  send({ type: "status", status: "running", message: `All providers failed. Google error: ${gemErr instanceof Error ? gemErr.message : String(gemErr)}` });
                }
              }
              // All providers exhausted
              if (resp.status === 402 || /credit.?balance|insufficient.?funds|billing|payment.?required|plan.?limit/i.test(apiMsg)) {
                throw new Error(
                  `All computer use providers failed. Anthropic: insufficient credits (add at https://console.anthropic.com/settings/billing). ` +
                  `${openaiKey ? "OpenAI: failed." : "OpenAI: not configured."} ${googleKey ? "Google: failed." : "Google: not configured."}`
                );
              }
            }
          }

          // Non-recoverable or mid-run error — surface clearly
          if (resp.status === 402 || /credit.?balance|insufficient.?funds|billing|payment.?required|plan.?limit/i.test(apiMsg)) {
            throw new Error(
              `Anthropic account has insufficient credits. Computer Control requires the Anthropic API. Add credits at: https://console.anthropic.com/settings/billing`
            );
          }
          throw new Error(`Anthropic API ${resp.status}: ${apiMsg}`);
        }

        const data = await resp.json() as {
          stop_reason: string;
          content: Array<{
            type: string;
            text?: string;
            id?: string;
            name?: string;
            input?: Record<string, unknown>;
          }>;
        };

        // Add assistant message to history
        messages.push({ role: "assistant", content: data.content });

        // Process content blocks
        const toolResults: Array<{
          type: "tool_result";
          tool_use_id: string;
          content: unknown;
          is_error?: boolean;
        }> = [];

        for (const block of data.content) {
          if (block.type === "text" && block.text) {
            send({ type: "text", content: block.text });
          } else if (block.type === "thinking" && (block as unknown as { thinking?: string }).thinking) {
            send({ type: "thinking", content: (block as unknown as { thinking: string }).thinking });
          } else if (block.type === "tool_use" && block.name === "bash") {
            // ─ bash_20250124 tool ──────────────────────────────────────────────────────────────
            const bashInput = block.input ?? {};
            const command = bashInput.command as string | undefined;
            send({
              type: "action",
              action: "bash",
              input: bashInput,
              description: describeAction("bash", bashInput),
            });
            if (!command && !bashInput.restart) {
              toolResults.push({ type: "tool_result", tool_use_id: block.id!, content: "Error: no command provided", is_error: true });
            } else {
              const bashResult = await executeBash(command ?? "");
              const bashContent: { type: string; text: string }[] = [];
              if (bashResult.output) bashContent.push({ type: "text", text: bashResult.output });
              if (bashResult.error) bashContent.push({ type: "text", text: `stderr: ${bashResult.error}` });
              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id!,
                content: bashContent.length > 0 ? bashContent : [{ type: "text", text: "(no output)" }],
                is_error: false,
              });
            }
          } else if (block.type === "tool_use" && block.name === "str_replace_based_edit_tool") {
            // ─ text_editor_20250728 tool ───────────────────────────────────────────────────────
            const editorInput = block.input ?? {};
            const edCmd = editorInput.command as string;
            send({
              type: "action",
              action: "text_editor",
              input: editorInput,
              description: describeAction("text_editor", editorInput),
            });
            const edResult = executeTextEditor(edCmd, editorInput);
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id!,
              content: edResult.error
                ? [{ type: "text", text: edResult.error }]
                : [{ type: "text", text: edResult.output ?? "Done" }],
              is_error: !!edResult.error,
            });
          } else if (block.type === "tool_use" && block.name === "computer") {
            // ─ computer_20251124 tool ───────────────────────────────────────────────────────
            const toolInput = block.input ?? {};
            const action = toolInput.action as string;

            // Emit action event to client
            send({
              type: "action",
              action,
              input: toolInput,
              description: describeAction(action, toolInput),
            });

            // Check if this action involves an app that needs permission
            const appName = detectAppFromAction(action, toolInput);
            if (appName && !blockedApps.includes(appName)) {
              const permGranted = await requestPermission(session, sessionId, appName, send);
              if (!permGranted) {
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: block.id!,
                  content: `Access to ${appName} was denied by the user.`,
                  is_error: true,
                });
                continue;
              }
            } else if (appName && blockedApps.includes(appName)) {
              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id!,
                content: `${appName} is on the blocklist and cannot be accessed.`,
                is_error: true,
              });
              continue;
            }

            // Execute the action
            const result = await executeAction(
              action,
              toolInput,
              sessionId,
              screen.width,
              screen.height,
              apiW,
              apiH,
              blockedApps,
            );

            if (result.base64_image) {
              send({ type: "screenshot", data: result.base64_image, width: apiW, height: apiH });
            }

            const toolResultContent: Array<unknown> = [];
            if (result.output) {
              toolResultContent.push({ type: "text", text: result.output });
            }
            if (result.base64_image) {
              toolResultContent.push({
                type: "image",
                source: { type: "base64", media_type: "image/png", data: result.base64_image },
              });
            }
            if (result.error) {
              toolResultContent.push({ type: "text", text: `Error: ${result.error}` });
            }

            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id!,
              content: toolResultContent.length > 0 ? toolResultContent : "Done",
              is_error: !!result.error,
            });
          }
        }

        // If no tool calls, Claude is done
        if (data.stop_reason !== "tool_use" || toolResults.length === 0) {
          send({ type: "done", reason: "task_complete" });
          break;
        }

        if (abortController.signal.aborted) break;

        // Add tool results for next round
        messages.push({ role: "user", content: toolResults });
      }

      if (iterations >= MAX_ITERATIONS) {
        send({ type: "done", reason: "max_iterations" });
      }

      session.status = "done";
    } catch (err) {
      if (abortController.signal.aborted) {
        send({ type: "done", reason: "stopped_by_user" });
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        send({ type: "error", message: msg });
      }
    } finally {
      computerSessions.delete(sessionId);
      try {
        streamController.enqueue(encoder.encode("data: [DONE]\n\n"));
        streamController.close();
      } catch { /* already closed */ }
    }
  })();

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

// ─── Permission flow ──────────────────────────────────────────────────────────

async function requestPermission(
  session: ComputerSession,
  sessionId: string,
  appName: string,
  send: (data: object) => void,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    session.status = "waiting_permission";
    session.pendingApp = appName;
    session.permissionResolve = resolve;
    send({ type: "permission_request", app: appName, sessionId });
    // Auto-deny after 60s timeout
    setTimeout(() => {
      if (session.permissionResolve === resolve) {
        session.permissionResolve = undefined;
        session.status = "running";
        resolve(false);
      }
    }, 60_000);
  });
}

function detectAppFromAction(action: string, input: Record<string, unknown>): string | null {
  // Heuristic: if the action is a key press opening an app, or we can't tell, return null
  if (action === "key") {
    const text = (input.text as string) ?? "";
    if (text.toLowerCase().includes("super+space") || text.toLowerCase().includes("cmd+space")) {
      return null; // Spotlight search — OK
    }
  }
  return null; // Most actions don't have a specific app; permissions are requested by app name when Claude mentions it
}

// ─── Computer Use Function Calling Tools ──────────────────────────────────────
// These tool definitions allow OpenAI/Google to control the desktop via function calling,
// mirroring the actions provided by Anthropic's native computer_20251624 tool.

const CU_TOOLS_FOR_FUNCTION_CALLING = [
  {
    name: "computer_screenshot",
    description: "Take a screenshot of the current screen. Returns a base64 PNG image. Use this to see the current state of the desktop.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "computer_left_click",
    description: "Performs a left mouse click at the given coordinates.",
    parameters: { type: "object", properties: { x: { type: "number", description: "X coordinate" }, y: { type: "number", description: "Y coordinate" } }, required: ["x", "y"] },
  },
  {
    name: "computer_right_click",
    description: "Performs a right mouse click at the given coordinates.",
    parameters: { type: "object", properties: { x: { type: "number", description: "X coordinate" }, y: { type: "number", description: "Y coordinate" } }, required: ["x", "y"] },
  },
  {
    name: "computer_double_click",
    description: "Double-clicks at the given coordinates.",
    parameters: { type: "object", properties: { x: { type: "number", description: "X coordinate" }, y: { type: "number", description: "Y coordinate" } }, required: ["x", "y"] },
  },
  {
    name: "computer_type",
    description: "Type the given text at the current cursor position.",
    parameters: { type: "object", properties: { text: { type: "string", description: "Text to type" } }, required: ["text"] },
  },
  {
    name: "computer_key",
    description: "Press a keyboard key or combination (e.g. 'Return', 'cmd+c', 'ctrl+alt+delete').",
    parameters: { type: "object", properties: { key: { type: "string", description: "Key name or combination" } }, required: ["key"] },
  },
  {
    name: "computer_scroll",
    description: "Scroll the screen in a direction.",
    parameters: { type: "object", properties: { x: { type: "number", description: "X coordinate" }, y: { type: "number", description: "Y coordinate" }, direction: { type: "string", enum: ["up", "down", "left", "right"], description: "Scroll direction" }, amount: { type: "number", description: "Scroll amount (clicks), default 3" } }, required: ["x", "y", "direction"] },
  },
  {
    name: "computer_mouse_move",
    description: "Move the mouse cursor to the given coordinates without clicking.",
    parameters: { type: "object", properties: { x: { type: "number", description: "X coordinate" }, y: { type: "number", description: "Y coordinate" } }, required: ["x", "y"] },
  },
  {
    name: "bash_execute",
    description: "Execute a bash command and return its output. Prefer this for file operations, installing software, running scripts.",
    parameters: { type: "object", properties: { command: { type: "string", description: "The bash command to execute" } }, required: ["command"] },
  },
  {
    name: "task_complete",
    description: "Call this when the requested task has been fully completed.",
    parameters: { type: "object", properties: { summary: { type: "string", description: "Brief summary of what was accomplished" } }, required: ["summary"] },
  },
];

// Helper: map function-call tool invocations to executeAction/executeBash
async function executeFunctionCallTool(
  toolName: string,
  args: Record<string, unknown>,
  sessionId: string,
  screenW: number,
  screenH: number,
  apiW: number,
  apiH: number,
  blockedApps: string[],
  send: (data: object) => void,
): Promise<{ result: string; screenshot?: { data: string; width: number; height: number }; done?: boolean }> {
  switch (toolName) {
    case "computer_screenshot": {
      const ss = await takeScreenshot(sessionId).catch(() => null);
      if (ss) {
        send({ type: "screenshot", data: ss.data, width: ss.apiWidth, height: ss.apiHeight });
        return { result: "Screenshot taken. The image is included in the conversation.", screenshot: { data: ss.data, width: ss.apiWidth, height: ss.apiHeight } };
      }
      return { result: "Failed to take screenshot." };
    }
    case "computer_left_click":
    case "computer_right_click":
    case "computer_double_click":
    case "computer_mouse_move": {
      const actionName = toolName.replace("computer_", "");
      const coordinate = [args.x as number, args.y as number];
      send({ type: "action", action: actionName, input: { coordinate }, description: describeAction(actionName, { coordinate }) });
      const res = await executeAction(actionName, { action: actionName, coordinate }, sessionId, screenW, screenH, apiW, apiH, blockedApps);
      if (res.base64_image) {
        send({ type: "screenshot", data: res.base64_image, width: apiW, height: apiH });
        return { result: res.output || "Done", screenshot: { data: res.base64_image, width: apiW, height: apiH } };
      }
      return { result: res.output || res.error || "Done" };
    }
    case "computer_type": {
      send({ type: "action", action: "type", input: { text: args.text }, description: describeAction("type", { text: args.text }) });
      const res = await executeAction("type", { action: "type", text: args.text as string }, sessionId, screenW, screenH, apiW, apiH, blockedApps);
      return { result: res.output || "Typed text." };
    }
    case "computer_key": {
      send({ type: "action", action: "key", input: { text: args.key }, description: describeAction("key", { text: args.key }) });
      const res = await executeAction("key", { action: "key", text: args.key as string }, sessionId, screenW, screenH, apiW, apiH, blockedApps);
      return { result: res.output || "Key pressed." };
    }
    case "computer_scroll": {
      const scrollInput = { action: "scroll", coordinate: [args.x, args.y], scroll_direction: args.direction, scroll_amount: args.amount ?? 3 };
      send({ type: "action", action: "scroll", input: scrollInput, description: describeAction("scroll", scrollInput) });
      const res = await executeAction("scroll", scrollInput as Record<string, unknown>, sessionId, screenW, screenH, apiW, apiH, blockedApps);
      return { result: res.output || "Scrolled." };
    }
    case "bash_execute": {
      const cmd = args.command as string;
      send({ type: "action", action: "bash", input: { command: cmd }, description: describeAction("bash", { command: cmd }) });
      const bashRes = await executeBash(cmd);
      const parts: string[] = [];
      if (bashRes.output) parts.push(bashRes.output);
      if (bashRes.error) parts.push(`stderr: ${bashRes.error}`);
      return { result: parts.length > 0 ? parts.join("\n") : "(no output)" };
    }
    case "task_complete":
      return { result: args.summary as string || "Task complete.", done: true };
    default:
      return { result: `Unknown tool: ${toolName}` };
  }
}

// ─── OpenAI GPT-5.4 Computer Use Fallback ─────────────────────────────────────

interface ComputerUseFallbackParams {
  task: string;
  initScreenshot: { data: string; apiWidth: number; apiHeight: number } | null;
  apiW: number;
  apiH: number;
  screen: { width: number; height: number };
  blockedApps: string[];
  maxIterations: number;
  session: ComputerSession;
  sessionId: string;
  send: (data: object) => void;
  abortController: AbortController;
  openaiKey?: string;
  googleKey?: string;
}

async function runComputerUseWithOpenAI(params: ComputerUseFallbackParams): Promise<void> {
  const { task, initScreenshot, apiW, apiH, screen, blockedApps, maxIterations,
          session, sessionId, send, abortController, openaiKey } = params;

  const openaiTools = CU_TOOLS_FOR_FUNCTION_CALLING.map(t => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  // Build initial messages with screenshot + task
  const messages: Array<Record<string, unknown>> = [
    {
      role: "system",
      content: SYSTEM_PROMPT + `\n\nYou have tools to control a macOS desktop. The screen resolution is ${apiW}x${apiH}. Coordinates in tool calls must be within that range. Always take a screenshot first to see the current state, then perform actions.`,
    },
    {
      role: "user",
      content: initScreenshot
        ? [
            { type: "image_url", image_url: { url: `data:image/png;base64,${initScreenshot.data}`, detail: "high" } },
            { type: "text", text: task },
          ]
        : task,
    },
  ];

  let iterations = 0;
  while (iterations < maxIterations) {
    if (abortController.signal.aborted) break;
    iterations++;
    send({ type: "status", status: "running", message: `OpenAI thinking… (step ${iterations})` });

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      signal: abortController.signal,
      body: JSON.stringify({
        model: "gpt-5.4",
        max_tokens: 8192,
        messages,
        tools: openaiTools,
        tool_choice: iterations === 1 ? "required" : "auto",
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`OpenAI API ${resp.status}: ${errText.slice(0, 500)}`);
    }

    const data = await resp.json() as {
      choices: Array<{
        message: {
          role: string;
          content?: string | null;
          tool_calls?: Array<{
            id: string;
            type: string;
            function: { name: string; arguments: string };
          }>;
        };
        finish_reason: string;
      }>;
    };

    const choice = data.choices[0];
    if (!choice) break;

    const assistantMsg = choice.message;
    messages.push(assistantMsg);

    // Emit text content if any
    if (assistantMsg.content) {
      send({ type: "text", content: assistantMsg.content });
    }

    // No tool calls — model is done
    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
      send({ type: "done", reason: "task_complete" });
      session.status = "done";
      return;
    }

    // Process each tool call
    let taskDone = false;
    for (const tc of assistantMsg.tool_calls) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(tc.function.arguments); } catch { /* empty */ }

      const result = await executeFunctionCallTool(
        tc.function.name, args, sessionId, screen.width, screen.height, apiW, apiH, blockedApps, send
      );

      // Build tool result message — include screenshot as image if available
      const toolContent: unknown[] = [{ type: "text", text: result.result }];
      if (result.screenshot) {
        toolContent.push({
          type: "image_url",
          image_url: { url: `data:image/png;base64,${result.screenshot.data}`, detail: "high" },
        });
      }

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: toolContent,
      });

      if (result.done) {
        taskDone = true;
        break;
      }
    }

    // Filter old screenshots to keep context manageable
    filterOldScreenshots(messages as Message[], 3);

    if (taskDone) {
      send({ type: "done", reason: "task_complete" });
      session.status = "done";
      return;
    }
  }

  if (iterations >= maxIterations) {
    send({ type: "done", reason: "max_iterations" });
  }
  session.status = "done";
}

// ─── Google Gemini Computer Use Fallback ──────────────────────────────────────

async function runComputerUseWithGemini(params: ComputerUseFallbackParams): Promise<void> {
  const { task, initScreenshot, apiW, apiH, screen, blockedApps, maxIterations,
          session, sessionId, send, abortController, googleKey } = params;

  const geminiTools = [{
    functionDeclarations: CU_TOOLS_FOR_FUNCTION_CALLING.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    })),
  }];

  // Build initial contents with screenshot + task
  const userParts: Array<Record<string, unknown>> = [];
  if (initScreenshot) {
    userParts.push({ inlineData: { mimeType: "image/png", data: initScreenshot.data } });
  }
  userParts.push({ text: task });

  const contents: Array<{ role: string; parts: Array<Record<string, unknown>> }> = [
    { role: "user", parts: userParts },
  ];

  let iterations = 0;
  while (iterations < maxIterations) {
    if (abortController.signal.aborted) break;
    iterations++;
    send({ type: "status", status: "running", message: `Gemini thinking… (step ${iterations})` });

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${encodeURIComponent(googleKey!)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: SYSTEM_PROMPT + `\n\nYou have tools to control a macOS desktop. Screen resolution: ${apiW}x${apiH}. Take screenshots to see the screen state, then perform actions.` }],
          },
          contents,
          tools: geminiTools,
          toolConfig: iterations === 1 ? { functionCallingConfig: { mode: "ANY" } } : undefined,
        }),
      }
    );

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Google Gemini API ${resp.status}: ${errText.slice(0, 500)}`);
    }

    const data = await resp.json() as {
      candidates?: Array<{
        content?: {
          role: string;
          parts: Array<{
            text?: string;
            functionCall?: { name: string; args?: Record<string, unknown> };
          }>;
        };
        finishReason?: string;
      }>;
    };

    const candidate = data.candidates?.[0];
    if (!candidate?.content) break;

    // Add assistant turn
    contents.push(candidate.content as { role: string; parts: Array<Record<string, unknown>> });

    // Extract text and function calls
    const funcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
    for (const part of candidate.content.parts) {
      if (part.text) {
        send({ type: "text", content: part.text });
      }
      if (part.functionCall) {
        funcCalls.push({ name: part.functionCall.name, args: part.functionCall.args ?? {} });
      }
    }

    // No function calls — model is done
    if (funcCalls.length === 0) {
      send({ type: "done", reason: "task_complete" });
      session.status = "done";
      return;
    }

    // Execute function calls and collect responses
    const responseParts: Array<Record<string, unknown>> = [];
    let taskDone = false;

    for (const fc of funcCalls) {
      const result = await executeFunctionCallTool(
        fc.name, fc.args, sessionId, screen.width, screen.height, apiW, apiH, blockedApps, send
      );

      const responseContent: Record<string, unknown> = { result: result.result };
      responseParts.push({
        functionResponse: { name: fc.name, response: responseContent },
      });

      // If there's a screenshot, add it as inline data in the next user turn
      if (result.screenshot) {
        responseParts.push({
          inlineData: { mimeType: "image/png", data: result.screenshot.data },
        });
      }

      if (result.done) {
        taskDone = true;
        break;
      }
    }

    // Add function responses as user turn
    contents.push({ role: "user", parts: responseParts });

    if (taskDone) {
      send({ type: "done", reason: "task_complete" });
      session.status = "done";
      return;
    }
  }

  if (iterations >= maxIterations) {
    send({ type: "done", reason: "max_iterations" });
  }
  session.status = "done";
}

function describeAction(action: string, input: Record<string, unknown>): string {
  const coord = input.coordinate as [number, number] | undefined;
  const text = input.text as string | undefined;
  const dir = (input.scrollDirection ?? input.scroll_direction) as string | undefined;
  const amount = (input.scrollAmount ?? input.scroll_amount) as number | undefined;
  const region = input.region as [number, number, number, number] | undefined;
  switch (action) {
    case "bash": {
      const cmd = input.command as string | undefined;
      if (input.restart) return "Restart bash session";
      return cmd ? `bash: ${cmd.slice(0, 60)}${cmd.length > 60 ? "…" : ""}` : "bash";
    }
    case "text_editor": {
      const cmd = input.command as string | undefined;
      const p = input.path as string | undefined;
      return cmd && p ? `${cmd}: ${p}` : cmd ?? "text_editor";
    }
    case "screenshot": return "Taking screenshot";
    case "left_click": return coord ? `Left-click at (${coord[0]}, ${coord[1]})` : "Left-click";
    case "right_click": return coord ? `Right-click at (${coord[0]}, ${coord[1]})` : "Right-click";
    case "double_click": return coord ? `Double-click at (${coord[0]}, ${coord[1]})` : "Double-click";
    case "triple_click": return coord ? `Triple-click at (${coord[0]}, ${coord[1]})` : "Triple-click";
    case "middle_click": return coord ? `Middle-click at (${coord[0]}, ${coord[1]})` : "Middle-click";
    case "mouse_move": return coord ? `Move mouse to (${coord[0]}, ${coord[1]})` : "Move mouse";
    case "left_click_drag": return `Drag mouse`;
    case "left_mouse_down": return "Mouse button down";
    case "left_mouse_up": return "Mouse button up";
    case "scroll": return `Scroll ${dir ?? "down"} by ${amount ?? 3}`;
    case "type": return `Type: "${(text ?? "").slice(0, 40)}${(text ?? "").length > 40 ? "…" : ""}"`;
    case "key": return `Press key: ${text ?? ""}`;
    case "hold_key": return `Hold key: ${text ?? ""} for ${input.duration ?? 1}s`;
    case "wait": return `Wait ${input.duration ?? 1}s`;
    case "zoom": return region ? `Zoom into region (${region[0]},${region[1]})→(${region[2]},${region[3]})` : "Zoom";
    case "cursor_position": return "Get cursor position";
    default: return action;
  }
}

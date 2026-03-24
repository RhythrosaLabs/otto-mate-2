import { NextRequest } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { computerSessions, type ComputerSession } from "@/lib/computer-control-sessions";
import {
  takeScreenshot, getScreenSize,
  executeAction, executeBash, executeTextEditor, filterOldScreenshots,
} from "@/lib/computer-use-native";

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
  };

  const { task, blockedApps = [], model = "claude-sonnet-4-6" } = body;
  if (!task?.trim()) {
    return new Response(JSON.stringify({ error: "task is required" }), { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), { status: 503 });
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

      const MAX_ITERATIONS = 40;
      let iterations = 0;

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
              "x-api-key": apiKey,
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
          // Surface billing errors clearly — computer use requires Anthropic specifically
          // (no provider fallback is possible since this tool is Anthropic-only)
          let errJson: { error?: { message?: string } } = {};
          try { errJson = JSON.parse(errText); } catch { /* ignore */ }
          const apiMsg = errJson?.error?.message ?? errText;
          if (resp.status === 402 || /credit.?balance|insufficient.?funds|billing|payment.?required|plan.?limit/i.test(apiMsg)) {
            throw new Error(
              `Anthropic account has insufficient credits. Computer Control requires the Anthropic API (computer_20251124 tool is Anthropic-only — no provider fallback is possible). Add credits at: https://console.anthropic.com/settings/billing`
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

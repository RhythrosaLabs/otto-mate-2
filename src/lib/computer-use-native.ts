/**
 * Native computer use functions shared between:
 * - The standalone Computer Control route  (`/api/computer-control/route.ts`)
 * - The main Ottomate agent (`agent.ts`)
 *
 * Implements computer_20251124, bash_20250124, and text_editor_20250728
 * tool execution as specified by the Anthropic computer-use-2025-11-24 beta.
 */
import { exec, execSync } from "child_process";
import { promisify } from "util";
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync, statSync } from "fs";
import { tmpdir } from "os";
import { join, isAbsolute } from "path";
import { randomBytes } from "crypto";

const execAsync = promisify(exec);

const SCREENSHOT_DIR = join(tmpdir(), "cu_screenshots");

// ─── Aspect-ratio scaling presets (mirrors reference impl's MAX_SCALING_TARGETS)
export const SCALING_TARGETS = [
  { width: 1024, height: 768 },   // XGA   4:3
  { width: 1280, height: 800 },   // WXGA  16:10
  { width: 1366, height: 768 },   // FWXGA ~16:9
];

/** Return the scaling preset whose aspect ratio matches the screen, or null */
export function getScalingTarget(screenW: number, screenH: number): { width: number; height: number } | null {
  const ratio = screenW / screenH;
  for (const target of SCALING_TARGETS) {
    if (Math.abs(target.width / target.height - ratio) < 0.02 && target.width < screenW) {
      return target;
    }
  }
  return null;
}

/**
 * Take a screenshot and return base64-encoded PNG with the API dimensions
 * that Claude should use for its coordinate space.
 *
 * Scaling strategy (mirrors the reference impl):
 *   1. Capture the screen (physical pixels on Retina displays)
 *   2. Find a preset (XGA/WXGA/FWXGA) whose aspect ratio matches
 *   3. Resize to that preset — Claude sees preset-sized coordinates
 *   4. Actual mouse coords use logical (UI) screen resolution from getScreenSize()
 */
export async function takeScreenshot(sessionId: string): Promise<{ data: string; apiWidth: number; apiHeight: number }> {
  try { mkdirSync(SCREENSHOT_DIR, { recursive: true }); } catch { /* already exists */ }
  const imgPath = join(SCREENSHOT_DIR, `cu_${sessionId}_${randomBytes(4).toString("hex")}.png`);
  // -x suppresses the camera click sound on macOS
  await execAsync(`screencapture -x -t png "${imgPath}"`);

  // Get physical pixel dimensions of the captured image
  const { stdout: sipsOut } = await execAsync(
    `sips -g pixelWidth -g pixelHeight "${imgPath}" 2>/dev/null`
  ).catch(() => ({ stdout: "" }));
  const wm = sipsOut.match(/pixelWidth:\s*(\d+)/);
  const hm = sipsOut.match(/pixelHeight:\s*(\d+)/);
  const capturedW = wm ? parseInt(wm[1]) : 1280;
  const capturedH = hm ? parseInt(hm[1]) : 800;

  // Find a matching aspect-ratio preset and resize to it
  const target = getScalingTarget(capturedW, capturedH);
  if (target) {
    const scaledPath = imgPath.replace(".png", "_s.png");
    await execAsync(
      `sips -z ${target.height} ${target.width} "${imgPath}" --out "${scaledPath}" 2>/dev/null`
    ).catch(() => null);
    if (existsSync(scaledPath)) {
      const data = readFileSync(scaledPath).toString("base64");
      try { unlinkSync(scaledPath); } catch { /* ignore */ }
      try { unlinkSync(imgPath); } catch { /* ignore */ }
      return { data, apiWidth: target.width, apiHeight: target.height };
    }
  }

  // No matching preset — return captured dims as-is
  const data = readFileSync(imgPath).toString("base64");
  try { unlinkSync(imgPath); } catch { /* ignore */ }
  return { data, apiWidth: capturedW, apiHeight: capturedH };
}

/** Scale API (Claude) coordinates to actual logical screen coordinates */
export function scaleCoords(x: number, y: number, screenW: number, screenH: number, apiW: number, apiH: number): [number, number] {
  return [
    Math.round(x * (screenW / apiW)),
    Math.round(y * (screenH / apiH)),
  ];
}

/**
 * Get the logical (UI) screen resolution.
 * On Retina displays, "UI Looks like" is the LOGICAL resolution that click events use,
 * not the physical pixel count (which would be 2× and land in the wrong place).
 */
export async function getScreenSize(): Promise<{ width: number; height: number }> {
  try {
    const { stdout } = await execAsync(
      `system_profiler SPDisplaysDataType 2>/dev/null | grep -E 'UI Looks like|Resolution' | head -2`
    );
    const logical = stdout.match(/UI Looks like:\s*(\d+)\s*x\s*(\d+)/);
    if (logical) return { width: parseInt(logical[1]), height: parseInt(logical[2]) };
    const physical = stdout.match(/Resolution:\s*(\d+)\s*x\s*(\d+)/);
    if (physical) return { width: parseInt(physical[1]), height: parseInt(physical[2]) };
  } catch { /* ignore */ }
  return { width: 1280, height: 800 };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function hasCliclick(): Promise<boolean> {
  try { await execAsync("which cliclick"); return true; } catch { return false; }
}

let _cliclick: boolean | null = null;
async function cliclickAvailable(): Promise<boolean> {
  if (_cliclick === null) _cliclick = await hasCliclick();
  return _cliclick;
}

/** Execute a key combination/press via AppleScript */
async function appleScriptKey(keyStr: string): Promise<void> {
  const parts = keyStr.toLowerCase().split("+");
  const key = parts[parts.length - 1];
  const mods = parts.slice(0, -1);

  const modMap: Record<string, string> = {
    ctrl: "control down", control: "control down",
    cmd: "command down", command: "command down", super: "command down",
    alt: "option down", option: "option down",
    shift: "shift down",
  };
  const keyCodeMap: Record<string, string> = {
    return: "key code 36", enter: "key code 36",
    escape: "key code 53", tab: "key code 48",
    backspace: "key code 51", delete: "key code 51",
    space: 'keystroke " "',
    up: "key code 126", down: "key code 125",
    left: "key code 123", right: "key code 124",
    f1: "key code 122", f2: "key code 120", f3: "key code 99",
    f4: "key code 118", f5: "key code 96", f12: "key code 111",
    home: "key code 115", end: "key code 119",
    pageup: "key code 116", pagedown: "key code 121",
  };

  const modifiers = mods.map((m) => modMap[m] || "").filter(Boolean).join(", ");
  const usingStr = modifiers ? ` using {${modifiers}}` : "";

  let keystrokeCmd: string;
  if (keyCodeMap[key]) {
    keystrokeCmd = modifiers
      ? `${keyCodeMap[key]} using {${modifiers}}`
      : keyCodeMap[key];
  } else if (key.length === 1) {
    keystrokeCmd = `keystroke "${key}"${usingStr}`;
  } else {
    keystrokeCmd = `keystroke "${key}"${usingStr}`;
  }

  const script = `tell application "System Events" to ${keystrokeCmd}`;
  await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
}

// ─── computer_20251124 ────────────────────────────────────────────────────────

export type ActionResult = { output?: string; base64_image?: string; error?: string };

/** Execute a computer_20251124 action and return textual output + optional screenshot */
export async function executeAction(
  action: string,
  input: Record<string, unknown>,
  sessionId: string,
  screenW: number,
  screenH: number,
  apiW: number,
  apiH: number,
  blockedApps: string[],
): Promise<ActionResult> {
  const useCli = await cliclickAvailable();

  function sc(coord: unknown): [number, number] {
    const [cx, cy] = coord as [number, number];
    return scaleCoords(cx, cy, screenW, screenH, apiW, apiH);
  }

  // Prevent automation of blocked apps via AppleScript
  if (blockedApps.length > 0) {
    const appCheck = blockedApps.some(app =>
      JSON.stringify(input).toLowerCase().includes(app.toLowerCase())
    );
    if (appCheck) return { error: `Action blocked: involves a blocked app` };
  }

  try {
    switch (action) {
      case "screenshot": {
        const ss = await takeScreenshot(sessionId);
        return { base64_image: ss.data };
      }

      case "left_click": {
        const [x, y] = sc(input.coordinate);
        if (useCli) {
          await execAsync(`cliclick c:${x},${y}`);
        } else {
          await execAsync(`osascript -e 'tell application "System Events" to click at {${x}, ${y}}'`);
        }
        await new Promise((r) => setTimeout(r, 500));
        const ss = await takeScreenshot(sessionId);
        return { output: `Clicked at (${x}, ${y})`, base64_image: ss.data };
      }

      case "right_click": {
        const [x, y] = sc(input.coordinate);
        if (useCli) {
          await execAsync(`cliclick rc:${x},${y}`);
        } else {
          await execAsync(`osascript -e 'tell application "System Events" to right click at {${x}, ${y}}'`);
        }
        await new Promise((r) => setTimeout(r, 500));
        const ss = await takeScreenshot(sessionId);
        return { output: `Right-clicked at (${x}, ${y})`, base64_image: ss.data };
      }

      case "double_click": {
        const [x, y] = sc(input.coordinate);
        if (useCli) {
          await execAsync(`cliclick dc:${x},${y}`);
        } else {
          await execAsync(`osascript -e 'tell application "System Events" to double click at {${x}, ${y}}'`);
        }
        await new Promise((r) => setTimeout(r, 500));
        const ss = await takeScreenshot(sessionId);
        return { output: `Double-clicked at (${x}, ${y})`, base64_image: ss.data };
      }

      case "triple_click": {
        const [x, y] = sc(input.coordinate);
        if (useCli) {
          await execAsync(`cliclick c:${x},${y} w:50 c:${x},${y} w:50 c:${x},${y}`);
        } else {
          for (let i = 0; i < 3; i++) {
            await execAsync(`osascript -e 'tell application "System Events" to click at {${x}, ${y}}'`);
            if (i < 2) await new Promise((r) => setTimeout(r, 50));
          }
        }
        await new Promise((r) => setTimeout(r, 400));
        const ss = await takeScreenshot(sessionId);
        return { output: `Triple-clicked at (${x}, ${y})`, base64_image: ss.data };
      }

      case "middle_click": {
        const [x, y] = sc(input.coordinate);
        if (useCli) {
          await execAsync(`cliclick mc:${x},${y}`);
        } else {
          return { error: "middle_click requires cliclick (brew install cliclick)" };
        }
        await new Promise((r) => setTimeout(r, 400));
        const ss = await takeScreenshot(sessionId);
        return { output: `Middle-clicked at (${x}, ${y})`, base64_image: ss.data };
      }

      case "mouse_move": {
        const [x, y] = sc(input.coordinate);
        if (useCli) {
          await execAsync(`cliclick m:${x},${y}`);
        } else {
          await execAsync(`osascript -e 'tell application "System Events" to set the position of the mouse cursor to {${x}, ${y}}'`);
        }
        return { output: `Moved mouse to (${x}, ${y})` };
      }

      case "left_click_drag": {
        const [sx, sy] = sc(input.startCoordinate ?? input.start_coordinate);
        const [ex, ey] = sc(input.coordinate);
        if (useCli) {
          await execAsync(`cliclick dd:${sx},${sy} m:${ex},${ey} du:${ex},${ey}`);
        } else {
          await execAsync(`osascript -e 'tell application "System Events" to set mouse position to {${sx}, ${sy}}'`);
          await new Promise((r) => setTimeout(r, 200));
          await execAsync(`osascript -e 'tell application "System Events" to set mouse position to {${ex}, ${ey}}'`);
        }
        await new Promise((r) => setTimeout(r, 600));
        const ss = await takeScreenshot(sessionId);
        return { output: `Dragged from (${sx}, ${sy}) to (${ex}, ${ey})`, base64_image: ss.data };
      }

      case "left_mouse_down": {
        const coord = input.coordinate as [number, number] | undefined;
        if (coord) {
          const [x, y] = sc(coord);
          if (useCli) await execAsync(`cliclick dd:${x},${y}`);
        }
        return { output: "Mouse button down" };
      }

      case "left_mouse_up": {
        const coord = input.coordinate as [number, number] | undefined;
        if (coord) {
          const [x, y] = sc(coord);
          if (useCli) await execAsync(`cliclick du:${x},${y}`);
        }
        return { output: "Mouse button up" };
      }

      case "scroll": {
        const coord = input.coordinate as [number, number] | undefined;
        const dir = (input.scrollDirection ?? input.scroll_direction ?? "down") as string;
        const amount = (input.scrollAmount ?? input.scroll_amount ?? 3) as number;
        let scrollX = 0, scrollY = 0;
        if (dir === "up") scrollY = amount * 3;
        else if (dir === "down") scrollY = -amount * 3;
        else if (dir === "left") scrollX = amount * 3;
        else if (dir === "right") scrollX = -amount * 3;
        const cx = coord ? sc(coord)[0] : Math.round(screenW / 2);
        const cy = coord ? sc(coord)[1] : Math.round(screenH / 2);
        await execAsync(
          `osascript -e 'tell application "System Events" to scroll {${cx}, ${cy}} by {${scrollX}, ${scrollY}}'`
        ).catch(async () => {
          const keyName = dir === "up" ? "page up" : dir === "down" ? "page down" : dir;
          for (let i = 0; i < Math.min(amount, 10); i++) await appleScriptKey(keyName);
        });
        await new Promise((r) => setTimeout(r, 400));
        const ss = await takeScreenshot(sessionId);
        return { output: `Scrolled ${dir} by ${amount}`, base64_image: ss.data };
      }

      case "type": {
        const text = input.text as string;
        if (useCli) {
          const escaped = text.replace(/"/g, '\\"').replace(/\\/g, "\\\\");
          await execAsync(`cliclick type:"${escaped}"`);
        } else {
          const escaped = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
          const script = `tell application "System Events" to keystroke "${escaped}"`;
          await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
        }
        await new Promise((r) => setTimeout(r, 400));
        const ss = await takeScreenshot(sessionId);
        return { output: `Typed: ${text.slice(0, 40)}${text.length > 40 ? "…" : ""}`, base64_image: ss.data };
      }

      case "key": {
        const keyStr = input.text as string;
        await appleScriptKey(keyStr);
        await new Promise((r) => setTimeout(r, 400));
        const ss = await takeScreenshot(sessionId);
        return { output: `Pressed key: ${keyStr}`, base64_image: ss.data };
      }

      case "hold_key": {
        const keyStr = input.text as string;
        const duration = (input.duration as number) ?? 1;
        const parts = keyStr.toLowerCase().split("+");
        const key = parts[parts.length - 1];
        await execAsync(`osascript -e 'tell application "System Events" to key down "${key}"'`);
        await new Promise((r) => setTimeout(r, duration * 1000));
        await execAsync(`osascript -e 'tell application "System Events" to key up "${key}"'`);
        await new Promise((r) => setTimeout(r, 300));
        const ss = await takeScreenshot(sessionId);
        return { output: `Held key ${keyStr} for ${duration}s`, base64_image: ss.data };
      }

      case "wait": {
        const duration = (input.duration as number) ?? 1;
        await new Promise((r) => setTimeout(r, Math.min(duration, 10) * 1000));
        const ss = await takeScreenshot(sessionId);
        return { output: `Waited ${duration}s`, base64_image: ss.data };
      }

      case "zoom": {
        const region = input.region as [number, number, number, number];
        const [x0a, y0a, x1a, y1a] = region;
        const [x0, y0] = sc([x0a, y0a]);
        const [x1, y1] = sc([x1a, y1a]);
        const ss = await takeScreenshot(sessionId);
        const rawPath = join(SCREENSHOT_DIR, `cu_zoom_raw_${randomBytes(4).toString("hex")}.png`);
        const cropPath = join(SCREENSHOT_DIR, `cu_zoom_${randomBytes(4).toString("hex")}.png`);
        writeFileSync(rawPath, Buffer.from(ss.data, "base64"));
        const cropW = x1 - x0;
        const cropH = y1 - y0;
        await execAsync(
          `sips -c ${cropH} ${cropW} "${rawPath}" --cropOffset ${y0} ${x0} --out "${cropPath}" 2>/dev/null`
        ).catch(async () => {
          await execAsync(`convert "${rawPath}" -crop ${cropW}x${cropH}+${x0}+${y0} +repage "${cropPath}" 2>/dev/null`).catch(() => null);
        });
        try { unlinkSync(rawPath); } catch { /* ignore */ }
        if (existsSync(cropPath)) {
          const cropped = readFileSync(cropPath).toString("base64");
          try { unlinkSync(cropPath); } catch { /* ignore */ }
          return { base64_image: cropped };
        }
        return { base64_image: ss.data };
      }

      case "cursor_position": {
        const { stdout } = await execAsync(
          `osascript -e 'tell application "System Events" to return position of mouse cursor'`
        ).catch(() => ({ stdout: "0, 0" }));
        const m = stdout.trim().match(/(\d+),?\s*(\d+)/);
        const [mx, my] = m ? [parseInt(m[1]), parseInt(m[2])] : [0, 0];
        return { output: `X=${mx},Y=${my}` };
      }

      default:
        return { error: `Unknown action: ${action}` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `Action failed: ${msg}` };
  }
}

// ─── bash_20250124 ────────────────────────────────────────────────────────────

/** Execute a bash command (mirrors BashTool20250124 from the reference impl). */
export async function executeBash(command: string): Promise<ActionResult> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout: 120_000,
      shell: "/bin/bash",
      maxBuffer: 10 * 1024 * 1024,
    });
    return {
      output: stdout.replace(/\n$/, "") || undefined,
      error: stderr.replace(/\n$/, "") || undefined,
    };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return {
      output: e.stdout?.replace(/\n$/, "") || undefined,
      error: e.stderr?.replace(/\n$/, "") || e.message || String(err),
    };
  }
}

// ─── text_editor_20250728 ─────────────────────────────────────────────────────

/** Execute a text editor command (mirrors EditTool20250728 from the reference impl). */
export function executeTextEditor(command: string, input: Record<string, unknown>): ActionResult {
  const filePath = input.path as string;
  if (!filePath) return { error: "path is required" };
  if (!isAbsolute(filePath)) {
    return { error: `The path ${filePath} is not an absolute path, it should start with /` };
  }

  try {
    switch (command) {
      case "view": {
        if (!existsSync(filePath)) return { error: `The path ${filePath} does not exist` };
        const st = statSync(filePath);
        if (st.isDirectory()) {
          const out = execSync(`find "${filePath}" -maxdepth 2 -not -path '*/\\.*' 2>/dev/null`, { encoding: "utf-8" });
          return { output: `Here's the files and directories up to 2 levels deep in ${filePath}:\n${out}` };
        }
        const content = readFileSync(filePath, "utf-8");
        const viewRange = input.view_range as [number, number] | undefined;
        const allLines = content.split("\n");
        const initLine = viewRange ? viewRange[0] : 1;
        const displayLines = viewRange
          ? (viewRange[1] === -1 ? allLines.slice(initLine - 1) : allLines.slice(initLine - 1, viewRange[1]))
          : allLines;
        const numbered = displayLines.map((l, i) => `${(initLine + i).toString().padStart(6)}\t${l}`).join("\n");
        return { output: `Here's the result of running \`cat -n\` on ${filePath}:\n${numbered}\n` };
      }

      case "create": {
        if (existsSync(filePath)) {
          return { error: `File already exists at: ${filePath}. Cannot overwrite using create.` };
        }
        const fileText = input.file_text as string;
        if (fileText === undefined) return { error: "file_text is required for create" };
        writeFileSync(filePath, fileText, "utf-8");
        return { output: `File created successfully at: ${filePath}` };
      }

      case "str_replace": {
        if (!existsSync(filePath)) return { error: `The path ${filePath} does not exist` };
        const oldStr = input.old_str as string;
        const newStr = (input.new_str as string) ?? "";
        if (!oldStr) return { error: "old_str is required for str_replace" };
        const content = readFileSync(filePath, "utf-8");
        const occurrences = content.split(oldStr).length - 1;
        if (occurrences === 0) {
          return { error: `No replacement was performed. old_str did not appear verbatim in ${filePath}` };
        }
        if (occurrences > 1) {
          return { error: `No replacement was performed. Multiple occurrences of old_str in ${filePath}` };
        }
        writeFileSync(filePath, content.replace(oldStr, newStr), "utf-8");
        return { output: `The file ${filePath} has been edited successfully.` };
      }

      case "insert": {
        if (!existsSync(filePath)) return { error: `The path ${filePath} does not exist` };
        const insertLine = input.insert_line as number;
        const insertText = input.insert_text as string;
        if (insertLine === undefined) return { error: "insert_line is required for insert" };
        if (insertText === undefined) return { error: "insert_text is required for insert" };
        const lines = readFileSync(filePath, "utf-8").split("\n");
        if (insertLine < 0 || insertLine > lines.length) {
          return { error: `Invalid insert_line: ${insertLine}. Valid range is [0, ${lines.length}]` };
        }
        writeFileSync(filePath, [...lines.slice(0, insertLine), ...insertText.split("\n"), ...lines.slice(insertLine)].join("\n"), "utf-8");
        return { output: `The file ${filePath} has been edited successfully.` };
      }

      default:
        return { error: `Unrecognized command: ${command}. Allowed: view, create, str_replace, insert` };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Image filtering (mirrors reference loop.py) ──────────────────────────────

type AnyMessage = { role: string; content: unknown };

/**
 * Remove old screenshot images from tool_result blocks, keeping only the last `keepN`.
 * Mirrors `_maybe_filter_to_n_most_recent_images` from the reference impl.
 * Works on any message array whose tool_result content blocks follow the Anthropic format.
 */
export function filterOldScreenshots(messages: AnyMessage[], keepN: number): void {
  type ContentItem = Record<string, unknown>;
  const toolResultBlocks: ContentItem[] = [];
  for (const msg of messages) {
    if (msg.role === "user" && Array.isArray(msg.content)) {
      for (const block of msg.content as ContentItem[]) {
        if (block.type === "tool_result") toolResultBlocks.push(block);
      }
    }
  }
  let totalImages = 0;
  for (const tr of toolResultBlocks) {
    if (Array.isArray(tr.content)) {
      for (const item of tr.content as ContentItem[]) {
        if (item.type === "image") totalImages++;
      }
    }
  }
  let toRemove = totalImages - keepN;
  if (toRemove <= 0) return;
  for (const tr of toolResultBlocks) {
    if (Array.isArray(tr.content)) {
      const kept: ContentItem[] = [];
      for (const item of tr.content as ContentItem[]) {
        if (item.type === "image" && toRemove > 0) { toRemove--; }
        else { kept.push(item); }
      }
      tr.content = kept;
    }
  }
}

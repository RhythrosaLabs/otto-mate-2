// ─── Computer Use Tool ──────────────────────────────────────────────────────
// Provides screen capture, mouse, and keyboard control for GUI automation.
// Inspired by apple/ml-open-computer-use and mac_computer_use repos.
//
// This module detects the OS and uses the appropriate native tools:
// - macOS: screencapture + cliclick + AppleScript
// - Linux: scrot/gnome-screenshot + xdotool + xclip
//
// The agent can use these primitives to interact with desktop applications.

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScreenshotResult {
  success: boolean;
  image_path: string;
  image_base64?: string;
  width?: number;
  height?: number;
  error?: string;
}

export interface MouseAction {
  type: "click" | "double_click" | "right_click" | "move" | "drag";
  x: number;
  y: number;
  end_x?: number;  // For drag
  end_y?: number;   // For drag
}

export interface KeyboardAction {
  type: "type" | "key" | "hotkey";
  text?: string;           // For type
  key?: string;            // For key press (e.g., "return", "tab")
  modifiers?: string[];    // For hotkey (e.g., ["cmd", "c"])
}

export interface ComputerUseResult {
  success: boolean;
  action: string;
  details?: string;
  screenshot?: ScreenshotResult;
  error?: string;
}

// ─── Platform Detection ─────────────────────────────────────────────────────

export type Platform = "macos" | "linux" | "unsupported";

export function detectPlatform(): Platform {
  const platform = os.platform();
  if (platform === "darwin") return "macos";
  if (platform === "linux") return "linux";
  return "unsupported";
}

// ─── Tool Availability Check ────────────────────────────────────────────────

export interface ToolAvailability {
  screenshot: boolean;
  mouse: boolean;
  keyboard: boolean;
  platform: Platform;
  missing_tools: string[];
}

export function checkToolAvailability(): ToolAvailability {
  const platform = detectPlatform();
  const missing: string[] = [];

  if (platform === "macos") {
    // screencapture is always available on macOS
    const hasCLIClick = isCommandAvailable("cliclick");
    if (!hasCLIClick) missing.push("cliclick (brew install cliclick)");

    return {
      screenshot: true,
      mouse: hasCLIClick,
      keyboard: hasCLIClick,
      platform,
      missing_tools: missing,
    };
  }

  if (platform === "linux") {
    const hasScrot = isCommandAvailable("scrot");
    const hasXdotool = isCommandAvailable("xdotool");
    const hasXclip = isCommandAvailable("xclip");

    if (!hasScrot) missing.push("scrot (apt install scrot)");
    if (!hasXdotool) missing.push("xdotool (apt install xdotool)");
    if (!hasXclip) missing.push("xclip (apt install xclip)");

    return {
      screenshot: hasScrot,
      mouse: hasXdotool,
      keyboard: hasXdotool,
      platform,
      missing_tools: missing,
    };
  }

  return {
    screenshot: false,
    mouse: false,
    keyboard: false,
    platform,
    missing_tools: ["Computer use not supported on this platform"],
  };
}

function isCommandAvailable(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

// ─── Screenshot ─────────────────────────────────────────────────────────────

export function takeScreenshot(options?: {
  region?: { x: number; y: number; width: number; height: number };
  includeBase64?: boolean;
}): ScreenshotResult {
  const platform = detectPlatform();
  const tmpDir = os.tmpdir();
  const filename = `screenshot_${Date.now()}.png`;
  const filepath = path.join(tmpDir, filename);

  try {
    if (platform === "macos") {
      if (options?.region) {
        const { x, y, width, height } = options.region;
        execSync(`screencapture -R${x},${y},${width},${height} -x "${filepath}"`, { timeout: 10000 });
      } else {
        execSync(`screencapture -x "${filepath}"`, { timeout: 10000 });
      }
    } else if (platform === "linux") {
      if (options?.region) {
        const { x, y, width, height } = options.region;
        execSync(`scrot -a ${x},${y},${width},${height} "${filepath}"`, { timeout: 10000 });
      } else {
        execSync(`scrot "${filepath}"`, { timeout: 10000 });
      }
    } else {
      return { success: false, image_path: "", error: "Unsupported platform" };
    }

    const result: ScreenshotResult = { success: true, image_path: filepath };

    if (options?.includeBase64 && fs.existsSync(filepath)) {
      const buffer = fs.readFileSync(filepath);
      result.image_base64 = buffer.toString("base64");
      // Get dimensions from file size heuristic (actual dimensions require image parsing)
      result.width = 1920;  // Placeholder — actual value from sips/identify
      result.height = 1080;

      if (platform === "macos") {
        try {
          const sipsOutput = execSync(`sips -g pixelWidth -g pixelHeight "${filepath}" 2>/dev/null`, { encoding: "utf8" });
          const widthMatch = sipsOutput.match(/pixelWidth:\s*(\d+)/);
          const heightMatch = sipsOutput.match(/pixelHeight:\s*(\d+)/);
          if (widthMatch) result.width = parseInt(widthMatch[1]);
          if (heightMatch) result.height = parseInt(heightMatch[1]);
        } catch {
          // Use defaults
        }
      }
    }

    return result;
  } catch (err) {
    return {
      success: false,
      image_path: "",
      error: `Screenshot failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Mouse Control ──────────────────────────────────────────────────────────

export function executeMouseAction(action: MouseAction): ComputerUseResult {
  const platform = detectPlatform();

  try {
    if (platform === "macos") {
      return executeMacOSMouse(action);
    } else if (platform === "linux") {
      return executeLinuxMouse(action);
    }
    return { success: false, action: action.type, error: "Unsupported platform" };
  } catch (err) {
    return {
      success: false,
      action: action.type,
      error: `Mouse action failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function executeMacOSMouse(action: MouseAction): ComputerUseResult {
  const { type, x, y, end_x, end_y } = action;

  switch (type) {
    case "click":
      execSync(`cliclick c:${x},${y}`, { timeout: 5000 });
      break;
    case "double_click":
      execSync(`cliclick dc:${x},${y}`, { timeout: 5000 });
      break;
    case "right_click":
      execSync(`cliclick rc:${x},${y}`, { timeout: 5000 });
      break;
    case "move":
      execSync(`cliclick m:${x},${y}`, { timeout: 5000 });
      break;
    case "drag":
      if (end_x !== undefined && end_y !== undefined) {
        execSync(`cliclick dd:${x},${y} du:${end_x},${end_y}`, { timeout: 5000 });
      }
      break;
  }

  return { success: true, action: type, details: `${type} at (${x}, ${y})` };
}

function executeLinuxMouse(action: MouseAction): ComputerUseResult {
  const { type, x, y, end_x, end_y } = action;

  switch (type) {
    case "click":
      execSync(`xdotool mousemove ${x} ${y} click 1`, { timeout: 5000 });
      break;
    case "double_click":
      execSync(`xdotool mousemove ${x} ${y} click --repeat 2 1`, { timeout: 5000 });
      break;
    case "right_click":
      execSync(`xdotool mousemove ${x} ${y} click 3`, { timeout: 5000 });
      break;
    case "move":
      execSync(`xdotool mousemove ${x} ${y}`, { timeout: 5000 });
      break;
    case "drag":
      if (end_x !== undefined && end_y !== undefined) {
        execSync(`xdotool mousemove ${x} ${y} mousedown 1 mousemove ${end_x} ${end_y} mouseup 1`, { timeout: 5000 });
      }
      break;
  }

  return { success: true, action: type, details: `${type} at (${x}, ${y})` };
}

// ─── Keyboard Control ───────────────────────────────────────────────────────

export function executeKeyboardAction(action: KeyboardAction): ComputerUseResult {
  const platform = detectPlatform();

  try {
    if (platform === "macos") {
      return executeMacOSKeyboard(action);
    } else if (platform === "linux") {
      return executeLinuxKeyboard(action);
    }
    return { success: false, action: action.type, error: "Unsupported platform" };
  } catch (err) {
    return {
      success: false,
      action: action.type,
      error: `Keyboard action failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function executeMacOSKeyboard(action: KeyboardAction): ComputerUseResult {
  switch (action.type) {
    case "type": {
      if (!action.text) return { success: false, action: "type", error: "No text provided" };
      // Use cliclick for typing (handles special chars)
      execSync(`cliclick t:"${action.text.replace(/"/g, '\\"')}"`, { timeout: 10000 });
      return { success: true, action: "type", details: `Typed: ${action.text.slice(0, 50)}` };
    }
    case "key": {
      if (!action.key) return { success: false, action: "key", error: "No key provided" };
      const macKey = mapKeyToMacOS(action.key);
      execSync(`cliclick kp:${macKey}`, { timeout: 5000 });
      return { success: true, action: "key", details: `Pressed: ${action.key}` };
    }
    case "hotkey": {
      if (!action.modifiers || !action.key) return { success: false, action: "hotkey", error: "No modifiers/key" };
      // Use AppleScript for hotkeys
      const modMap: Record<string, string> = { cmd: "command", ctrl: "control", alt: "option", shift: "shift" };
      const mods = action.modifiers.map(m => modMap[m] || m);
      const keyCode = action.key.length === 1 ? `"${action.key}"` : action.key;
      const script = `tell application "System Events" to keystroke ${keyCode} using {${mods.map(m => `${m} down`).join(", ")}}`;
      execSync(`osascript -e '${script}'`, { timeout: 5000 });
      return { success: true, action: "hotkey", details: `Hotkey: ${action.modifiers.join("+")}+${action.key}` };
    }
  }

  return { success: false, action: action.type, error: "Unknown keyboard action" };
}

function executeLinuxKeyboard(action: KeyboardAction): ComputerUseResult {
  switch (action.type) {
    case "type": {
      if (!action.text) return { success: false, action: "type", error: "No text provided" };
      execSync(`xdotool type --delay 50 "${action.text.replace(/"/g, '\\"')}"`, { timeout: 10000 });
      return { success: true, action: "type", details: `Typed: ${action.text.slice(0, 50)}` };
    }
    case "key": {
      if (!action.key) return { success: false, action: "key", error: "No key provided" };
      const linuxKey = mapKeyToLinux(action.key);
      execSync(`xdotool key ${linuxKey}`, { timeout: 5000 });
      return { success: true, action: "key", details: `Pressed: ${action.key}` };
    }
    case "hotkey": {
      if (!action.modifiers || !action.key) return { success: false, action: "hotkey", error: "No modifiers/key" };
      const modMap: Record<string, string> = { cmd: "super", ctrl: "ctrl", alt: "alt", shift: "shift" };
      const mods = action.modifiers.map(m => modMap[m] || m);
      const combo = [...mods, mapKeyToLinux(action.key)].join("+");
      execSync(`xdotool key ${combo}`, { timeout: 5000 });
      return { success: true, action: "hotkey", details: `Hotkey: ${combo}` };
    }
  }

  return { success: false, action: action.type, error: "Unknown keyboard action" };
}

// ─── Key Mapping ────────────────────────────────────────────────────────────

function mapKeyToMacOS(key: string): string {
  const map: Record<string, string> = {
    return: "return", enter: "return", tab: "tab", escape: "escape", esc: "escape",
    space: "space", delete: "delete", backspace: "delete",
    up: "arrow-up", down: "arrow-down", left: "arrow-left", right: "arrow-right",
    home: "home", end: "end", pageup: "page-up", pagedown: "page-down",
    f1: "f1", f2: "f2", f3: "f3", f4: "f4", f5: "f5", f6: "f6",
    f7: "f7", f8: "f8", f9: "f9", f10: "f10", f11: "f11", f12: "f12",
  };
  return map[key.toLowerCase()] || key;
}

function mapKeyToLinux(key: string): string {
  const map: Record<string, string> = {
    return: "Return", enter: "Return", tab: "Tab", escape: "Escape", esc: "Escape",
    space: "space", delete: "Delete", backspace: "BackSpace",
    up: "Up", down: "Down", left: "Left", right: "Right",
    home: "Home", end: "End", pageup: "Page_Up", pagedown: "Page_Down",
    f1: "F1", f2: "F2", f3: "F3", f4: "F4", f5: "F5", f6: "F6",
    f7: "F7", f8: "F8", f9: "F9", f10: "F10", f11: "F11", f12: "F12",
  };
  return map[key.toLowerCase()] || key;
}

// ─── High-Level Computer Use Actions ────────────────────────────────────────
// These combine primitives into common workflows.

export async function computerUseAction(instruction: string): Promise<ComputerUseResult> {
  const platform = detectPlatform();
  if (platform === "unsupported") {
    return { success: false, action: "computer_use", error: "Platform not supported for computer use" };
  }

  const availability = checkToolAvailability();

  // Parse the instruction to determine action type
  const lower = instruction.toLowerCase();

  // Screenshot
  if (lower.includes("screenshot") || lower.includes("screen") || lower.includes("capture") || lower.includes("see") ||
      lower.includes("look at") || lower.includes("show me") || lower.includes("what's on")) {
    const screenshot = takeScreenshot({ includeBase64: true });
    return {
      success: screenshot.success,
      action: "screenshot",
      details: screenshot.success
        ? `Screenshot captured: ${screenshot.width}x${screenshot.height}`
        : undefined,
      screenshot,
      error: screenshot.error,
    };
  }

  // Click at coordinates
  const clickMatch = lower.match(/click\s+(?:at\s+)?(?:\(?(\d+)\s*,\s*(\d+)\)?)/);
  if (clickMatch && availability.mouse) {
    const result = executeMouseAction({
      type: "click",
      x: parseInt(clickMatch[1]),
      y: parseInt(clickMatch[2]),
    });
    // Take screenshot after action
    result.screenshot = takeScreenshot({ includeBase64: true });
    return result;
  }

  // Type text
  const typeMatch = instruction.match(/(?:type|enter|input)\s+["']?(.+?)["']?\s*$/i);
  if (typeMatch && availability.keyboard) {
    const result = executeKeyboardAction({ type: "type", text: typeMatch[1] });
    result.screenshot = takeScreenshot({ includeBase64: true });
    return result;
  }

  // Hotkey
  const hotkeyMatch = lower.match(/(?:press|hotkey)\s+(cmd|ctrl|alt|shift)[\s+]+([\w])/);
  if (hotkeyMatch && availability.keyboard) {
    const result = executeKeyboardAction({
      type: "hotkey",
      modifiers: [hotkeyMatch[1]],
      key: hotkeyMatch[2],
    });
    result.screenshot = takeScreenshot({ includeBase64: true });
    return result;
  }

  // Key press
  const keyMatch = lower.match(/(?:press|hit)\s+(\w+)/);
  if (keyMatch && availability.keyboard) {
    const result = executeKeyboardAction({ type: "key", key: keyMatch[1] });
    result.screenshot = takeScreenshot({ includeBase64: true });
    return result;
  }

  // If no pattern matched, take a screenshot and let the LLM figure out what to do
  const screenshot = takeScreenshot({ includeBase64: true });
  return {
    success: true,
    action: "observe",
    details: `Took screenshot for analysis. Available tools: ${availability.mouse ? "mouse" : "no mouse"}, ${availability.keyboard ? "keyboard" : "no keyboard"}. Missing: ${availability.missing_tools.join(", ") || "none"}`,
    screenshot,
  };
}

// ─── Format for Agent Context ───────────────────────────────────────────────

export function formatComputerUseResult(result: ComputerUseResult): string {
  let output = `**Computer Use: ${result.action}**\n`;

  if (result.details) {
    output += `${result.details}\n`;
  }

  if (result.screenshot?.success) {
    output += `Screenshot captured (${result.screenshot.width}x${result.screenshot.height})\n`;
    if (result.screenshot.image_base64) {
      output += `[Screenshot available as base64 — ${(result.screenshot.image_base64.length / 1024).toFixed(0)}KB]\n`;
    }
  }

  if (result.error) {
    output += `Error: ${result.error}\n`;
  }

  return output;
}

// ─── Computer Use Tool Description (for agent TOOLS array) ──────────────────

export const COMPUTER_USE_TOOL_DESCRIPTION = {
  name: "computer_use" as const,
  description: "Control the computer screen, mouse, and keyboard. Can take screenshots, click at coordinates, type text, and press keyboard shortcuts. Use 'screenshot' to see the screen, 'click at X,Y' to click, 'type \"text\"' to type, 'press key' to press keys, 'hotkey cmd+c' for shortcuts.",
  input_schema: {
    type: "object" as const,
    properties: {
      action: {
        type: "string",
        description: "The action to perform. Examples: 'screenshot', 'click at 500,300', 'type \"hello world\"', 'press return', 'hotkey cmd+v', 'double_click at 100,200'",
      },
    },
    required: ["action"],
  },
};

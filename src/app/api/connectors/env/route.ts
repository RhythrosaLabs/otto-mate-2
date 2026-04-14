import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { ALLOWED_ENV_KEYS } from "@/lib/constants";

export const dynamic = "force-dynamic";

const ENV_LOCAL = path.resolve(process.cwd(), ".env.local");
const ENV_MAIN = path.resolve(process.cwd(), ".env");
const ENV_FILES = [
  ENV_LOCAL,
  ENV_MAIN,
  path.resolve(process.cwd(), ".env.development.local"),
];

/**
 * Read a single env file into a Map of key→value
 */
function readSingleEnvFile(filePath: string): Map<string, string> {
  const entries = new Map<string, string>();
  if (!fs.existsSync(filePath)) return entries;
  const content = fs.readFileSync(filePath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    entries.set(key, value);
  }
  return entries;
}

/**
 * Read all env files (.env.local, .env, .env.development.local) merged.
 * .env.local keys take precedence, matching Next.js priority.
 */
function readEnvFile(): Map<string, string> {
  const merged = new Map<string, string>();
  // Read in reverse priority so higher-priority files overwrite
  for (let i = ENV_FILES.length - 1; i >= 0; i--) {
    const entries = readSingleEnvFile(ENV_FILES[i]);
    for (const [k, v] of entries) merged.set(k, v);
  }
  return merged;
}

/**
 * Write keys to a single env file, preserving comments and blank lines.
 * Updates existing keys in-place, appends new keys at the end.
 */
function writeSingleEnvFile(filePath: string, updates: Record<string, string>): void {
  let content = "";
  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, "utf-8");
  }

  const lines = content.split("\n");
  const updatedKeys = new Set<string>();

  // Update existing keys in-place
  const newLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    const idx = trimmed.indexOf("=");
    if (idx === -1) return line;
    const key = trimmed.slice(0, idx).trim();
    if (key in updates) {
      updatedKeys.add(key);
      return `${key}=${updates[key]}`;
    }
    return line;
  });

  // Append any new keys that weren't already in the file
  for (const [key, value] of Object.entries(updates)) {
    if (!updatedKeys.has(key)) {
      newLines.push(`${key}=${value}`);
    }
  }

  fs.writeFileSync(filePath, newLines.join("\n"), "utf-8");
}

/**
 * Write keys to both .env.local and .env so they're universally accessible.
 * .env.local takes precedence at runtime (Next.js convention),
 * .env serves as the persistent canonical source.
 */
function writeEnvFile(updates: Record<string, string>): void {
  writeSingleEnvFile(ENV_LOCAL, updates);
  writeSingleEnvFile(ENV_MAIN, updates);
}

/**
 * DELETE a key — clears it in .env.local and .env
 */
function removeEnvKey(key: string): void {
  for (const envFile of ENV_FILES) {
    if (!fs.existsSync(envFile)) continue;
    const content = fs.readFileSync(envFile, "utf-8");
    const lines = content.split("\n");
    let changed = false;
    const newLines = lines.map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return line;
      const idx = trimmed.indexOf("=");
      if (idx === -1) return line;
      const k = trimmed.slice(0, idx).trim();
      if (k === key) { changed = true; return `${k}=`; }
      return line;
    });
    if (changed) fs.writeFileSync(envFile, newLines.join("\n"), "utf-8");
  }
}

// POST /api/connectors/env — save API key(s) to .env.local and .env
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { keys: Record<string, string> };
    if (!body.keys || typeof body.keys !== "object") {
      return NextResponse.json({ error: "keys object is required" }, { status: 400 });
    }

    // Filter out empty values and enforce allowlist
    const validKeys: Record<string, string> = {};
    const rejected: string[] = [];
    for (const [k, v] of Object.entries(body.keys)) {
      if (!k || !v || !v.trim()) continue;
      if (!ALLOWED_ENV_KEYS.has(k)) {
        rejected.push(k);
        continue;
      }
      // Sanitize newlines to prevent env file injection
      validKeys[k] = v.trim().replace(/[\r\n]/g, "");
    }

    if (rejected.length > 0) {
      return NextResponse.json(
        { error: `Keys not allowed: ${rejected.join(", ")}` },
        { status: 400 }
      );
    }

    if (Object.keys(validKeys).length === 0) {
      return NextResponse.json({ error: "No valid keys provided" }, { status: 400 });
    }

    writeEnvFile(validKeys);

    // Also set in process.env so the running server picks them up immediately
    for (const [k, v] of Object.entries(validKeys)) {
      process.env[k] = v;
    }

    return NextResponse.json({ success: true, keys_saved: Object.keys(validKeys), files: [".env.local", ".env"] });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to save env keys. Check server logs for details." },
      { status: 500 }
    );
  }
}

// DELETE /api/connectors/env — remove an API key from .env.local
export async function DELETE(req: NextRequest) {
  try {
    const body = (await req.json()) as { key: string };
    if (!body.key) {
      return NextResponse.json({ error: "key is required" }, { status: 400 });
    }

    if (!ALLOWED_ENV_KEYS.has(body.key)) {
      return NextResponse.json({ error: `Key "${body.key}" is not allowed` }, { status: 400 });
    }

    removeEnvKey(body.key);
    delete process.env[body.key];

    return NextResponse.json({ success: true, key_removed: body.key });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to remove env key: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

// GET /api/connectors/env — check which env keys are configured (returns keys only, not values)
export async function GET() {
  const entries = readEnvFile();
  const configuredKeys: string[] = [];
  for (const [key, value] of entries) {
    if (value && value.trim() && !value.includes("your_") && !value.includes("_here")) {
      configuredKeys.push(key);
    }
  }
  return NextResponse.json({ configured_keys: configuredKeys });
}

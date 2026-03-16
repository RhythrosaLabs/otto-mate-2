import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const ENV_FILE = path.resolve(process.cwd(), ".env.local");

/**
 * Read the current .env.local file into a Map of key→value
 */
function readEnvFile(): Map<string, string> {
  const entries = new Map<string, string>();
  if (!fs.existsSync(ENV_FILE)) return entries;
  const content = fs.readFileSync(ENV_FILE, "utf-8");
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
 * Write the Map back to .env.local, preserving comments and blank lines
 */
function writeEnvFile(updates: Record<string, string>): void {
  let content = "";
  if (fs.existsSync(ENV_FILE)) {
    content = fs.readFileSync(ENV_FILE, "utf-8");
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

  fs.writeFileSync(ENV_FILE, newLines.join("\n"), "utf-8");
}

/**
 * DELETE a key from .env.local (set it to empty)
 */
function removeEnvKey(key: string): void {
  if (!fs.existsSync(ENV_FILE)) return;
  const content = fs.readFileSync(ENV_FILE, "utf-8");
  const lines = content.split("\n");
  const newLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    const idx = trimmed.indexOf("=");
    if (idx === -1) return line;
    const k = trimmed.slice(0, idx).trim();
    if (k === key) return `${k}=`;
    return line;
  });
  fs.writeFileSync(ENV_FILE, newLines.join("\n"), "utf-8");
}

// POST /api/connectors/env — save API key(s) to .env.local
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { keys: Record<string, string> };
    if (!body.keys || typeof body.keys !== "object") {
      return NextResponse.json({ error: "keys object is required" }, { status: 400 });
    }

    // Filter out empty values
    const validKeys: Record<string, string> = {};
    for (const [k, v] of Object.entries(body.keys)) {
      if (k && v && v.trim()) {
        validKeys[k] = v.trim();
      }
    }

    if (Object.keys(validKeys).length === 0) {
      return NextResponse.json({ error: "No valid keys provided" }, { status: 400 });
    }

    writeEnvFile(validKeys);

    // Also set in process.env so the running server picks them up immediately
    for (const [k, v] of Object.entries(validKeys)) {
      process.env[k] = v;
    }

    return NextResponse.json({ success: true, keys_saved: Object.keys(validKeys) });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to save env keys: ${err instanceof Error ? err.message : String(err)}` },
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

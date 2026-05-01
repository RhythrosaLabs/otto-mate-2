import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { getUserApiKeys, setUserApiKey, deleteUserApiKey } from "@/lib/db";
import { encryptApiKey, decryptApiKey } from "@/lib/auth";

// GET /api/user/keys — list user's stored API keys (names only, not values)
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const keys = await getUserApiKeys(session.userId);
  // Return key names + masked values only
  return NextResponse.json(keys.map((k) => ({
    key_name: k.key_name,
    set: true,
    updated_at: k.updated_at,
  })));
}

// PUT /api/user/keys — store or update an API key
export async function PUT(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json() as { key_name?: string; key_value?: string };
  if (!body.key_name || !body.key_value) {
    return NextResponse.json({ error: "key_name and key_value are required" }, { status: 400 });
  }

  // Validate key name is a known env var
  const ALLOWED_KEYS = [
    "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GOOGLE_AI_API_KEY",
    "PERPLEXITY_API_KEY", "OPENROUTER_API_KEY", "REPLICATE_API_KEY",
    "LUMA_API_KEY", "HUGGINGFACE_API_KEY",
  ];
  if (!ALLOWED_KEYS.includes(body.key_name)) {
    return NextResponse.json({ error: `Unknown key: ${body.key_name}` }, { status: 400 });
  }

  const encrypted = encryptApiKey(body.key_value.trim());
  await setUserApiKey(session.userId, body.key_name, encrypted);
  return NextResponse.json({ ok: true });
}

// DELETE /api/user/keys?key_name=ANTHROPIC_API_KEY
export async function DELETE(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const keyName = new URL(req.url).searchParams.get("key_name");
  if (!keyName) return NextResponse.json({ error: "key_name is required" }, { status: 400 });

  await deleteUserApiKey(session.userId, keyName);
  return NextResponse.json({ ok: true });
}

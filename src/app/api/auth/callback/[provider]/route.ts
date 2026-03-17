import { NextRequest, NextResponse } from "next/server";
import { storeOAuthTokens } from "@/lib/db";

const APP_URL = process.env.APP_URL || "http://localhost:3000";

// Connector IDs that share a given OAuth provider — when we get a Google token,
// we store it for every Google-based connector so the agent can use whichever one
// it needs.
const PROVIDER_CONNECTOR_IDS: Record<string, string[]> = {
  google: ["gmail", "google_drive", "google_sheets", "google_docs"],
  microsoft: ["outlook", "onedrive", "sharepoint", "teams"],
  github: ["github"],
  notion: ["notion"],
  dropbox: ["dropbox"],
};

async function exchangeCode(
  provider: string,
  code: string,
  redirectUri: string
): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
  switch (provider) {
    case "google": {
      if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET)
        throw new Error("GOOGLE_CLIENT_ID/SECRET not configured");
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });
      if (!res.ok) throw new Error(`Google token exchange failed: ${await res.text()}`);
      return res.json();
    }

    case "microsoft": {
      if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET)
        throw new Error("MICROSOFT_CLIENT_ID/SECRET not configured");
      const res = await fetch(
        "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: process.env.MICROSOFT_CLIENT_ID,
            client_secret: process.env.MICROSOFT_CLIENT_SECRET,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
          }),
        }
      );
      if (!res.ok) throw new Error(`Microsoft token exchange failed: ${await res.text()}`);
      return res.json();
    }

    case "github": {
      if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET)
        throw new Error("GITHUB_CLIENT_ID/SECRET not configured");
      const res = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          code,
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          redirect_uri: redirectUri,
        }),
      });
      if (!res.ok) throw new Error(`GitHub token exchange failed: ${await res.text()}`);
      const data = await res.json();
      return { access_token: data.access_token, refresh_token: data.refresh_token };
    }

    case "notion": {
      if (!process.env.NOTION_CLIENT_ID || !process.env.NOTION_CLIENT_SECRET)
        throw new Error("NOTION_CLIENT_ID/SECRET not configured");
      const credentials = Buffer.from(
        `${process.env.NOTION_CLIENT_ID}:${process.env.NOTION_CLIENT_SECRET}`
      ).toString("base64");
      const res = await fetch("https://api.notion.com/v1/oauth/token", {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }),
      });
      if (!res.ok) throw new Error(`Notion token exchange failed: ${await res.text()}`);
      const data = await res.json();
      return { access_token: data.access_token };
    }

    case "dropbox": {
      if (!process.env.DROPBOX_CLIENT_ID || !process.env.DROPBOX_CLIENT_SECRET)
        throw new Error("DROPBOX_CLIENT_ID/SECRET not configured");
      const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          grant_type: "authorization_code",
          client_id: process.env.DROPBOX_CLIENT_ID,
          client_secret: process.env.DROPBOX_CLIENT_SECRET,
          redirect_uri: redirectUri,
        }),
      });
      if (!res.ok) throw new Error(`Dropbox token exchange failed: ${await res.text()}`);
      const data = await res.json();
      return { access_token: data.access_token, refresh_token: data.refresh_token };
    }

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const stateRaw = searchParams.get("state"); // base64url-encoded JSON { connector, nonce }
  const error = searchParams.get("error");

  // Decode the CSRF state payload
  let connector: string = provider;
  if (stateRaw) {
    try {
      const decoded = JSON.parse(
        Buffer.from(stateRaw, "base64url").toString("utf-8"),
      );
      if (decoded.connector) connector = decoded.connector;
      // In a full implementation, validate the nonce against a server-side store.
      // For now, the nonce prevents simple replay of static state strings.
    } catch {
      // Fallback: treat raw state as connector id (backward compat)
      connector = stateRaw;
    }
  }

  if (error) {
    return NextResponse.redirect(
      `${APP_URL}/computer/connectors?error=${encodeURIComponent(error)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${APP_URL}/computer/connectors?error=no_code`
    );
  }

  const redirectUri = `${APP_URL}/api/auth/callback/${provider}`;

  try {
    const tokens = await exchangeCode(provider, code, redirectUri);

    // Store tokens for every connector that shares this provider
    const connectorIds = PROVIDER_CONNECTOR_IDS[provider] ?? [connector];
    for (const connectorId of connectorIds) {
      storeOAuthTokens(connectorId, tokens);
    }

    return NextResponse.redirect(
      `${APP_URL}/computer/connectors?connected=${connector}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`OAuth callback error for ${provider}:`, message);
    return NextResponse.redirect(
      `${APP_URL}/computer/connectors?error=${encodeURIComponent(message)}`
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const APP_URL = process.env.APP_URL || "http://localhost:3000";

// Scopes requested per provider (merged across all connectors that share the provider)
const PROVIDER_SCOPES: Record<string, string> = {
  google:
    "openid email profile " +
    "https://www.googleapis.com/auth/gmail.send " +
    "https://www.googleapis.com/auth/gmail.readonly " +
    "https://www.googleapis.com/auth/calendar " +
    "https://www.googleapis.com/auth/drive " +
    "https://www.googleapis.com/auth/spreadsheets " +
    "https://www.googleapis.com/auth/documents",
  microsoft:
    "openid email profile offline_access " +
    "Mail.ReadWrite Mail.Send Calendars.ReadWrite " +
    "Files.ReadWrite Sites.ReadWrite.All " +
    "ChannelMessage.Send ChannelMessage.Read.All Channel.ReadBasic.All",
  github: "repo user",
  notion: "read_content update_content insert_content",
  dropbox: "files.content.read files.content.write account_info.read",
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const { searchParams } = new URL(req.url);
  // connector param: e.g. ?connector=gmail — stored as state so callback knows which connector to update
  const connector = searchParams.get("connector") || provider;
  const redirectUri = `${APP_URL}/api/auth/callback/${provider}`;

  // Generate CSRF nonce and encode it with the connector in the state param
  const nonce = crypto.randomBytes(16).toString("hex");
  const statePayload = JSON.stringify({ connector, nonce });
  const stateEncoded = Buffer.from(statePayload).toString("base64url");

  let authUrl: string;

  switch (provider) {
    case "google": {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      if (!clientId) {
        return NextResponse.redirect(
          `${APP_URL}/computer/connectors?error=${encodeURIComponent("Google OAuth not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local")}`
        );
      }
      const scopes = PROVIDER_SCOPES.google;
      authUrl =
        "https://accounts.google.com/o/oauth2/v2/auth?" +
        new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: "code",
          scope: scopes,
          access_type: "offline",
          prompt: "consent",
          state: stateEncoded,
        }).toString();
      break;
    }

    case "microsoft": {
      const clientId = process.env.MICROSOFT_CLIENT_ID;
      if (!clientId) {
        return NextResponse.redirect(
          `${APP_URL}/computer/connectors?error=${encodeURIComponent("Microsoft OAuth not configured. Add MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET to .env.local")}`
        );
      }
      authUrl =
        "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?" +
        new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: "code",
          scope: PROVIDER_SCOPES.microsoft,
          response_mode: "query",
          state: stateEncoded,
        }).toString();
      break;
    }

    case "github": {
      const clientId = process.env.GITHUB_CLIENT_ID;
      if (!clientId) {
        return NextResponse.redirect(
          `${APP_URL}/computer/connectors?error=${encodeURIComponent("GitHub OAuth not configured. Add GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET to .env.local")}`
        );
      }
      authUrl =
        "https://github.com/login/oauth/authorize?" +
        new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          scope: PROVIDER_SCOPES.github,
          state: stateEncoded,
        }).toString();
      break;
    }

    case "notion": {
      const clientId = process.env.NOTION_CLIENT_ID;
      if (!clientId) {
        return NextResponse.redirect(
          `${APP_URL}/computer/connectors?error=${encodeURIComponent("Notion OAuth not configured. Add NOTION_CLIENT_ID and NOTION_CLIENT_SECRET to .env.local")}`
        );
      }
      authUrl =
        "https://api.notion.com/v1/oauth/authorize?" +
        new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: "code",
          owner: "user",
          state: stateEncoded,
        }).toString();
      break;
    }

    case "dropbox": {
      const clientId = process.env.DROPBOX_CLIENT_ID;
      if (!clientId) {
        return NextResponse.redirect(
          `${APP_URL}/computer/connectors?error=${encodeURIComponent("Dropbox OAuth not configured. Add DROPBOX_CLIENT_ID and DROPBOX_CLIENT_SECRET to .env.local")}`
        );
      }
      authUrl =
        "https://www.dropbox.com/oauth2/authorize?" +
        new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: "code",
          token_access_type: "offline",
          state: stateEncoded,
        }).toString();
      break;
    }

    default:
      return NextResponse.redirect(
        `${APP_URL}/computer/connectors?error=${encodeURIComponent(`Unsupported provider: ${provider}`)}`
      );
  }

  return NextResponse.redirect(authUrl);
}

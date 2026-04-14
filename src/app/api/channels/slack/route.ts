/**
 * Slack Bot Events & Slash Commands (OpenClaw-inspired multi-channel)
 * 
 * POST /api/channels/slack — Slack sends events and slash commands here
 * GET  /api/channels/slack — Health check / setup info
 *
 * Setup:
 *   1. Create Slack App at https://api.slack.com/apps
 *   2. Enable Event Subscriptions → Request URL: <YOUR_URL>/api/channels/slack
 *   3. Subscribe to message.channels, message.im events
 *   4. Add slash command /ottomate → URL: <YOUR_URL>/api/channels/slack
 *   5. Set SLACK_BOT_TOKEN and SLACK_SIGNING_SECRET in .env
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export const dynamic = "force-dynamic";

const BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;

/**
 * Verify Slack request signature using HMAC-SHA256.
 * See: https://api.slack.com/authentication/verifying-requests-from-slack
 */
function verifySlackSignature(
  body: string,
  timestamp: string | null,
  signature: string | null
): boolean {
  if (!SIGNING_SECRET || !timestamp || !signature) return false;
  // Reject requests older than 5 minutes to prevent replay attacks
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > 300) return false;
  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature = "v0=" + crypto.createHmac("sha256", SIGNING_SECRET).update(sigBasestring).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(signature));
}

interface SlackEvent {
  type: string;
  token?: string;
  challenge?: string; // URL verification
  event?: {
    type: string;
    text?: string;
    user?: string;
    channel?: string;
    ts?: string;
    bot_id?: string; // ignore bot messages
  };
  // Slash command fields (sent as form data, parsed separately)
  command?: string;
  text?: string;
  user_id?: string;
  channel_id?: string;
  response_url?: string;
}

async function sendSlackMessage(channel: string, text: string, blocks?: unknown[]) {
  if (!BOT_TOKEN) return;
  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel, text, blocks }),
  });
}

export async function GET() {
  return NextResponse.json({
    channel: "slack",
    configured: !!BOT_TOKEN,
    webhook_path: "/api/channels/slack",
    setup_instructions: [
      "1. Create Slack App at https://api.slack.com/apps",
      "2. Enable Event Subscriptions → Request URL: <YOUR_URL>/api/channels/slack",
      "3. Subscribe to message.channels, message.im, app_mention events",
      "4. Add slash command /ottomate → URL: <YOUR_URL>/api/channels/slack",
      "5. Set SLACK_BOT_TOKEN and SLACK_SIGNING_SECRET in .env",
      "6. Install app to workspace, invite bot to channels",
    ],
  });
}

export async function POST(req: NextRequest) {
  if (!BOT_TOKEN) {
    return NextResponse.json({ error: "SLACK_BOT_TOKEN not configured" }, { status: 503 });
  }

  // Read raw body for signature verification
  const rawBody = await req.text();

  // Verify Slack request signature (skip only if signing secret not configured)
  if (SIGNING_SECRET) {
    const timestamp = req.headers.get("x-slack-request-timestamp");
    const signature = req.headers.get("x-slack-signature");
    if (!verifySlackSignature(rawBody, timestamp, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  try {
    const contentType = req.headers.get("content-type") || "";

    // Slash commands come as application/x-www-form-urlencoded
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = new URLSearchParams(rawBody);
      const command = formData.get("command") as string;
      const text = formData.get("text") as string;
      const userId = formData.get("user_id") as string;
      const channelId = formData.get("channel_id") as string;
      const responseUrl = formData.get("response_url") as string;

      if (command === "/ottomate" || command === "/otto") {
        if (!text || text.trim().length === 0) {
          return NextResponse.json({
            response_type: "ephemeral",
            text: "Usage: `/ottomate <your task description>`\n\nExamples:\n• `/ottomate research the latest AI news`\n• `/ottomate create a Python fibonacci function`",
          });
        }

        // Create task
        const taskRes = await fetch(new URL("/api/tasks", req.url), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: text,
            model: "auto",
            source: "slack",
            metadata: {
              slack_user: userId,
              slack_channel: channelId,
              slack_response_url: responseUrl,
            },
          }),
        });

        if (taskRes.ok) {
          const task = await taskRes.json() as { id: string; title: string };
          return NextResponse.json({
            response_type: "in_channel",
            text: `✅ *Task Created*: ${task.title}\n\nWorking on it now... Task ID: \`${task.id.slice(0, 8)}\``,
          });
        }

        return NextResponse.json({
          response_type: "ephemeral",
          text: "❌ Failed to create task. Please try again.",
        });
      }

      return NextResponse.json({ response_type: "ephemeral", text: "Unknown command" });
    }

    // Events API (JSON body)
    const body = JSON.parse(rawBody) as SlackEvent;

    // URL verification challenge
    if (body.type === "url_verification" && body.challenge) {
      return NextResponse.json({ challenge: body.challenge });
    }

    // Handle events
    if (body.type === "event_callback" && body.event) {
      const event = body.event;

      // Ignore bot messages to prevent loops
      if (event.bot_id) {
        return NextResponse.json({ ok: true });
      }

      // Handle DMs and mentions
      if (
        (event.type === "message" || event.type === "app_mention") &&
        event.text &&
        event.channel
      ) {
        // Strip bot mention from text
        const cleanText = event.text.replace(/<@[A-Z0-9]+>/g, "").trim();
        if (!cleanText) {
          return NextResponse.json({ ok: true });
        }

        // Create task
        const taskRes = await fetch(new URL("/api/tasks", req.url), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: cleanText,
            model: "auto",
            source: "slack",
            metadata: {
              slack_user: event.user,
              slack_channel: event.channel,
            },
          }),
        });

        if (taskRes.ok) {
          const task = await taskRes.json() as { id: string; title: string };
          await sendSlackMessage(
            event.channel,
            `✅ *Task Created*: ${task.title}\n\nI'm working on this. Task ID: \`${task.id.slice(0, 8)}\``
          );
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[slack] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

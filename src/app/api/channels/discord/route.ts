/**
 * Discord Bot Interactions Webhook (OpenClaw-inspired multi-channel)
 * 
 * POST /api/channels/discord — Discord sends interactions here
 * GET  /api/channels/discord — Health check / setup info
 *
 * Setup:
 *   1. Create app at https://discord.com/developers/applications
 *   2. Create bot, get DISCORD_BOT_TOKEN and DISCORD_PUBLIC_KEY
 *   3. Set Interactions Endpoint URL to: <YOUR_URL>/api/channels/discord
 *   4. Invite bot with message content intent
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;

interface DiscordInteraction {
  type: number; // 1=PING, 2=APPLICATION_COMMAND, 3=MESSAGE_COMPONENT
  id: string;
  token: string;
  data?: {
    name: string;
    options?: Array<{ name: string; value: string; type: number }>;
  };
  member?: { user: { id: string; username: string; discriminator: string } };
  user?: { id: string; username: string };
  channel_id?: string;
  guild_id?: string;
}

async function sendDiscordMessage(channelId: string, content: string) {
  if (!BOT_TOKEN) return;
  await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });
}

export async function GET() {
  return NextResponse.json({
    channel: "discord",
    configured: !!BOT_TOKEN,
    webhook_path: "/api/channels/discord",
    setup_instructions: [
      "1. Create app at https://discord.com/developers/applications",
      "2. Create bot, set DISCORD_BOT_TOKEN and DISCORD_PUBLIC_KEY in .env",
      "3. Set Interactions Endpoint URL to your domain + /api/channels/discord",
      "4. Register slash commands via Discord API",
    ],
  });
}

export async function POST(req: NextRequest) {
  if (!BOT_TOKEN) {
    return NextResponse.json({ error: "DISCORD_BOT_TOKEN not configured" }, { status: 503 });
  }

  try {
    const interaction = (await req.json()) as DiscordInteraction;

    // Handle Discord PING verification
    if (interaction.type === 1) {
      return NextResponse.json({ type: 1 }); // PONG
    }

    // Handle slash commands (type 2 = APPLICATION_COMMAND)
    if (interaction.type === 2 && interaction.data) {
      const command = interaction.data.name;
      const user = interaction.member?.user || interaction.user;
      const username = user?.username || "User";

      if (command === "ask" || command === "task") {
        const prompt = interaction.data.options?.find(o => o.name === "prompt")?.value;
        if (!prompt) {
          return NextResponse.json({
            type: 4,
            data: { content: "❌ Please provide a prompt. Usage: `/ask prompt:your question here`" },
          });
        }

        // Create task
        const taskRes = await fetch(new URL("/api/tasks", req.url), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            model: "auto",
            source: "discord",
            metadata: {
              discord_user: username,
              discord_channel: interaction.channel_id,
              discord_guild: interaction.guild_id,
            },
          }),
        });

        if (taskRes.ok) {
          const task = await taskRes.json() as { id: string; title: string };
          return NextResponse.json({
            type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
            data: {
              content: `✅ **Task Created**: ${task.title}\n\nI'm working on this now! Task ID: \`${task.id.slice(0, 8)}\``,
            },
          });
        }

        return NextResponse.json({
          type: 4,
          data: { content: "❌ Failed to create task. Please try again." },
        });
      }

      if (command === "status") {
        const healthRes = await fetch(new URL("/api/health", req.url));
        const health = await healthRes.json();
        return NextResponse.json({
          type: 4,
          data: {
            content: `📊 **Ottomate Status**\n\nStatus: ${health.status}\nUptime: ${health.uptime}\nVersion: ${health.version}`,
          },
        });
      }

      // Default: unknown command
      return NextResponse.json({
        type: 4,
        data: {
          content: `Available commands:\n• \`/ask prompt:...\` — Create an AI task\n• \`/status\` — System status`,
        },
      });
    }

    return NextResponse.json({ type: 1 });
  } catch (err) {
    console.error("[discord] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

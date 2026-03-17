/**
 * Telegram Bot Webhook (OpenClaw-inspired multi-channel)
 * 
 * POST /api/channels/telegram — Telegram sends updates here
 * GET  /api/channels/telegram — Health check / webhook info
 *
 * Setup:
 *   1. Create bot via @BotFather → get TELEGRAM_BOT_TOKEN
 *   2. Set webhook: curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<YOUR_URL>/api/channels/telegram"
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: { id: number; first_name: string; username?: string };
    chat: { id: number; type: string };
    date: number;
    text?: string;
    voice?: { file_id: string; duration: number };
    photo?: Array<{ file_id: string; width: number; height: number }>;
  };
}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function sendTelegramMessage(chatId: number, text: string, parseMode = "Markdown") {
  if (!BOT_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: parseMode,
    }),
  });
}

async function sendTypingAction(chatId: number) {
  if (!BOT_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  });
}

export async function GET() {
  return NextResponse.json({
    channel: "telegram",
    configured: !!BOT_TOKEN,
    webhook_path: "/api/channels/telegram",
    setup_instructions: [
      "1. Talk to @BotFather on Telegram to create a bot",
      "2. Set TELEGRAM_BOT_TOKEN in your .env",
      "3. Set webhook: curl https://api.telegram.org/bot<TOKEN>/setWebhook?url=<YOUR_URL>/api/channels/telegram",
    ],
  });
}

export async function POST(req: NextRequest) {
  if (!BOT_TOKEN) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN not configured" }, { status: 503 });
  }

  try {
    const update = (await req.json()) as TelegramUpdate;
    const message = update.message;
    if (!message?.text) {
      return NextResponse.json({ ok: true }); // Ignore non-text messages for now
    }

    const chatId = message.chat.id;
    const text = message.text.trim();
    const username = message.from.username || message.from.first_name;

    // Handle commands
    if (text === "/start") {
      await sendTelegramMessage(chatId, 
        `👋 Welcome to *Ottomate*, ${username}!\n\nSend me any message and I'll process it as an AI task.\n\nCommands:\n/start — This message\n/status — Current system status\n/help — Available commands`
      );
      return NextResponse.json({ ok: true });
    }

    if (text === "/status") {
      const healthRes = await fetch(new URL("/api/health", req.url));
      const health = await healthRes.json();
      await sendTelegramMessage(chatId,
        `📊 *Ottomate Status*\n\nStatus: ${health.status}\nUptime: ${health.uptime}\nVersion: ${health.version}`
      );
      return NextResponse.json({ ok: true });
    }

    if (text === "/help") {
      await sendTelegramMessage(chatId,
        `❓ *Available Commands*\n\n/start — Welcome message\n/status — System status\n/help — This help\n\nOr just send any message to create an AI task!`
      );
      return NextResponse.json({ ok: true });
    }

    // Create a task from the message
    await sendTypingAction(chatId);

    const taskRes = await fetch(new URL("/api/tasks", req.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: text,
        model: "auto",
        source: "telegram",
        metadata: { telegram_chat_id: chatId, telegram_user: username },
      }),
    });

    if (taskRes.ok) {
      const task = await taskRes.json() as { id: string; title: string };
      await sendTelegramMessage(chatId,
        `✅ Task created: *${task.title}*\n\nI'll work on this and send you the results when done.\nTask ID: \`${task.id.slice(0, 8)}\``
      );
    } else {
      await sendTelegramMessage(chatId, `❌ Failed to create task. Please try again.`);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[telegram] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

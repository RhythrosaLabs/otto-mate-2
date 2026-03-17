/**
 * WhatsApp Webhook & Control API
 *
 * GET  /api/whatsapp — Meta webhook verification (hub.verify_token + hub.challenge)
 * POST /api/whatsapp — Incoming WhatsApp messages → creates Ottomate tasks → sends results back
 *
 * This is the core integration: every WhatsApp text or voice message becomes an
 * Ottomate task, processed by the agent, with results sent back to WhatsApp.
 */

import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { createTask, updateTaskStatus, addMessage, getTask } from "@/lib/db";
import { runAgent } from "@/lib/agent";
import {
  getWhatsAppConfig,
  verifyWebhook,
  parseWebhookPayload,
  sendTextMessage,
  sendResponse,
  markAsRead,
  transcribeVoiceMessage,
  sanitizePhoneNumber,
  type WhatsAppWebhookPayload,
  type IncomingMessage,
} from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Track active conversations to prevent duplicate processing
const activeMessages = new Set<string>();

// ─── GET: Meta Webhook Verification ───────────────────────────────────────────

export async function GET(request: NextRequest) {
  const config = getWhatsAppConfig();
  if (!config) {
    return NextResponse.json(
      { error: "WhatsApp not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID env vars." },
      { status: 503 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const result = verifyWebhook(mode, token, challenge, config);

  if (result.valid) {
    // Meta expects the challenge value as plain text response
    return new Response(result.challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

// ─── POST: Incoming WhatsApp Messages ─────────────────────────────────────────

export async function POST(request: NextRequest) {
  const config = getWhatsAppConfig();
  if (!config) {
    return NextResponse.json({ error: "WhatsApp not configured" }, { status: 503 });
  }

  try {
    const payload = await request.json() as WhatsAppWebhookPayload;
    const messages = parseWebhookPayload(payload);

    // Must return 200 immediately to Meta (they retry on non-200)
    // Process messages asynchronously
    if (messages.length > 0) {
      // Fire-and-forget: process each message
      for (const msg of messages) {
        processMessageAsync(msg, config);
      }
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("[whatsapp] Webhook error:", err);
    // Still return 200 to prevent Meta retries
    return NextResponse.json({ status: "ok" });
  }
}

// ─── Message Processing ──────────────────────────────────────────────────────

async function processMessageAsync(
  msg: IncomingMessage,
  config: ReturnType<typeof getWhatsAppConfig> & object
) {
  // Deduplicate — Meta sometimes sends duplicates
  if (activeMessages.has(msg.messageId)) return;
  activeMessages.add(msg.messageId);
  setTimeout(() => activeMessages.delete(msg.messageId), 5 * 60 * 1000);

  try {
    // Mark as read immediately for good UX
    await markAsRead(config, msg.messageId);

    // Skip status updates, reactions (just acknowledge)
    if (msg.type === "reaction") return;

    // Determine the text content from the message
    let userText = await extractTextFromMessage(msg, config);
    if (!userText || userText.trim().length === 0) {
      await sendTextMessage(config, msg.from, "I received your message but couldn't process it. Please send a text or voice message.", msg.messageId);
      return;
    }

    // Handle special commands
    const lowerText = userText.trim().toLowerCase();
    if (lowerText === "/help" || lowerText === "help") {
      await sendHelpMessage(config, msg.from, msg.messageId);
      return;
    }
    if (lowerText === "/status" || lowerText === "status") {
      await sendStatusMessage(config, msg.from, msg.messageId);
      return;
    }

    // Create an Ottomate task from this WhatsApp message
    const taskId = uuidv4();
    const senderName = msg.name || `+${msg.from}`;
    const now = new Date().toISOString();

    const title = `WhatsApp: ${senderName} — ${userText.slice(0, 60)}${userText.length > 60 ? "..." : ""}`;

    // Send "thinking" indicator
    await sendTextMessage(config, msg.from, "🧠 Processing your request...", msg.messageId);

    const task = createTask({
      id: taskId,
      title,
      prompt: userText,
      description: userText.slice(0, 200),
      status: "pending",
      priority: "medium",
      model: "auto",
      tags: ["whatsapp", `wa:${msg.from}`],
      metadata: {
        whatsapp_from: msg.from,
        whatsapp_sender_name: senderName,
        whatsapp_message_id: msg.messageId,
        whatsapp_message_type: msg.type,
        source: "whatsapp",
      },
      created_at: now,
      updated_at: now,
    });

    // Add the user's message to the task
    addMessage({
      id: uuidv4(),
      task_id: taskId,
      role: "user",
      content: userText,
      created_at: now,
    });

    // Run the agent
    let agentResponse = "";
    try {
      await runAgent({
        taskId: task.id,
        userMessage: userText,
        onStep: () => {},
        onToken: (token: string) => {
          agentResponse += token;
        },
      });

      // Get the completed task to extract the final response
      const completedTask = getTask(taskId);
      const lastStep = completedTask?.steps?.[completedTask.steps.length - 1];

      // Use accumulated response, last step tool_result, or fallback
      const finalResponse = agentResponse.trim()
        || lastStep?.tool_result
        || lastStep?.content
        || "Task completed but no response was generated.";

      // Send the response back to WhatsApp
      await sendResponse(config, msg.from, finalResponse, msg.messageId, {
        includeFooter: true,
      });

    } catch (err) {
      console.error(`[whatsapp] Agent error for task ${taskId}:`, err);
      updateTaskStatus(taskId, "failed");
      await sendTextMessage(
        config,
        msg.from,
        `❌ Sorry, I encountered an error processing your request: ${err instanceof Error ? err.message : "Unknown error"}`,
        msg.messageId
      );
    }

  } catch (err) {
    console.error("[whatsapp] Message processing error:", err);
    try {
      await sendTextMessage(
        config,
        msg.from,
        "Sorry, something went wrong. Please try again.",
        msg.messageId
      );
    } catch { /* can't even send error */ }
  }
}

// ─── Extract Text ─────────────────────────────────────────────────────────────

async function extractTextFromMessage(
  msg: IncomingMessage,
  config: ReturnType<typeof getWhatsAppConfig> & object
): Promise<string | null> {
  switch (msg.type) {
    case "text":
      return msg.text || null;

    case "audio":
      if (!msg.mediaId) return null;
      // Transcribe voice message
      return transcribeVoiceMessage(config, msg.mediaId);

    case "image":
      return msg.caption
        ? `[Image received] ${msg.caption}`
        : "[Image received — please describe what you'd like me to do with it]";

    case "video":
      return msg.caption
        ? `[Video received] ${msg.caption}`
        : "[Video received — please describe what you'd like me to do with it]";

    case "document":
      return msg.caption
        ? `[Document received] ${msg.caption}`
        : "[Document received — please describe what you'd like me to do with it]";

    case "location":
      return msg.text
        ? `[Location: ${msg.text}] (${msg.latitude}, ${msg.longitude})`
        : `[Location: ${msg.latitude}, ${msg.longitude}]`;

    case "interactive":
    case "button":
      return msg.text || null;

    default:
      return null;
  }
}

// ─── Command Handlers ─────────────────────────────────────────────────────────

async function sendHelpMessage(
  config: ReturnType<typeof getWhatsAppConfig> & object,
  to: string,
  replyToId: string
) {
  const helpText = `*🤖 Ottomate — WhatsApp Control*

Send me any message — text or voice — and I'll process it as an AI task.

*Commands:*
• /help — Show this message
• /status — Check system status

*What I can do:*
• Research any topic
• Write code, documents, articles
• Search the web in real-time
• Generate images
• Run AI models (Replicate)
• Manage files and data
• Send emails, Slack messages
• And much more...

*Voice Messages:*
Just send a voice note — I'll transcribe it and process your request automatically.

*Tips:*
• Be specific about what you need
• I remember context within each task
• Results are also saved in the Ottomate dashboard`;

  await sendTextMessage(config, to, helpText, replyToId);
}

async function sendStatusMessage(
  config: ReturnType<typeof getWhatsAppConfig> & object,
  to: string,
  replyToId: string
) {
  const statusText = `*Ottomate Status*

✅ System: Online
✅ WhatsApp: Connected
✅ AI Models: Available
✅ Web Search: Ready

Send me a task to get started!`;

  await sendTextMessage(config, to, statusText, replyToId);
}

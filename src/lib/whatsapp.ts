/**
 * WhatsApp Business Cloud API — Smart Integration
 *
 * Enables full two-way WhatsApp messaging:
 * - Send text, media, and interactive messages
 * - Receive and parse incoming text + voice messages
 * - Voice message transcription via OpenAI Whisper
 * - Message formatting (Markdown → WhatsApp)
 * - Webhook verification for Meta
 *
 * API: https://graph.facebook.com/v21.0/{phone_number_id}/messages
 */

import OpenAI from "openai";
import { createReadStream, writeFileSync, unlinkSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { v4 as uuidv4 } from "uuid";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WhatsAppConfig {
  accessToken: string;      // Meta Business API permanent access token
  phoneNumberId: string;    // WhatsApp Business Phone Number ID
  verifyToken: string;      // Webhook verification token (you choose this)
  businessAccountId?: string;
}

export interface IncomingMessage {
  from: string;             // Sender phone number (e.g., "14155551234")
  name?: string;            // Sender profile name
  timestamp: string;
  type: "text" | "audio" | "image" | "video" | "document" | "location" | "reaction" | "interactive" | "button" | "unknown";
  text?: string;
  mediaId?: string;
  mediaMimeType?: string;
  caption?: string;
  latitude?: number;
  longitude?: number;
  reactionEmoji?: string;
  reactionMessageId?: string;
  messageId: string;
  context?: { message_id: string };  // If replying to a message
}

export interface WhatsAppWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: { display_phone_number: string; phone_number_id: string };
        contacts?: Array<{ profile: { name: string }; wa_id: string }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          type: string;
          text?: { body: string };
          audio?: { id: string; mime_type: string };
          image?: { id: string; mime_type: string; caption?: string };
          video?: { id: string; mime_type: string; caption?: string };
          document?: { id: string; mime_type: string; filename?: string; caption?: string };
          location?: { latitude: number; longitude: number; name?: string; address?: string };
          reaction?: { message_id: string; emoji: string };
          interactive?: { type: string; button_reply?: { id: string; title: string }; list_reply?: { id: string; title: string } };
          button?: { text: string; payload: string };
          context?: { from: string; id: string };
        }>;
        statuses?: Array<{
          id: string;
          status: "sent" | "delivered" | "read" | "failed";
          timestamp: string;
          recipient_id: string;
          errors?: Array<{ code: number; title: string }>;
        }>;
      };
      field: string;
    }>;
  }>;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// ─── API Base ─────────────────────────────────────────────────────────────────

const GRAPH_API_VERSION = "v21.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// ─── Get Config ───────────────────────────────────────────────────────────────

export function getWhatsAppConfig(): WhatsAppConfig | null {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (!accessToken || !phoneNumberId) return null;

  return {
    accessToken,
    phoneNumberId,
    verifyToken: verifyToken || "ottomatron_whatsapp_verify",
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
  };
}

// ─── Webhook Verification ─────────────────────────────────────────────────────

export function verifyWebhook(
  mode: string | null,
  token: string | null,
  challenge: string | null,
  config: WhatsAppConfig
): { valid: boolean; challenge?: string } {
  if (mode === "subscribe" && token === config.verifyToken) {
    return { valid: true, challenge: challenge || "" };
  }
  return { valid: false };
}

// ─── Parse Incoming Messages ──────────────────────────────────────────────────

export function parseWebhookPayload(payload: WhatsAppWebhookPayload): IncomingMessage[] {
  const messages: IncomingMessage[] = [];

  if (payload.object !== "whatsapp_business_account") return messages;

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== "messages") continue;
      const value = change.value;
      const contacts = value.contacts || [];

      for (const msg of value.messages || []) {
        const contact = contacts.find((c) => c.wa_id === msg.from);
        const parsed: IncomingMessage = {
          from: msg.from,
          name: contact?.profile?.name,
          timestamp: msg.timestamp,
          type: (msg.type as IncomingMessage["type"]) || "unknown",
          messageId: msg.id,
          context: msg.context ? { message_id: msg.context.id } : undefined,
        };

        switch (msg.type) {
          case "text":
            parsed.text = msg.text?.body;
            break;
          case "audio":
            parsed.mediaId = msg.audio?.id;
            parsed.mediaMimeType = msg.audio?.mime_type;
            break;
          case "image":
            parsed.mediaId = msg.image?.id;
            parsed.mediaMimeType = msg.image?.mime_type;
            parsed.caption = msg.image?.caption;
            break;
          case "video":
            parsed.mediaId = msg.video?.id;
            parsed.mediaMimeType = msg.video?.mime_type;
            parsed.caption = msg.video?.caption;
            break;
          case "document":
            parsed.mediaId = msg.document?.id;
            parsed.mediaMimeType = msg.document?.mime_type;
            parsed.caption = msg.document?.caption;
            break;
          case "location":
            parsed.latitude = msg.location?.latitude;
            parsed.longitude = msg.location?.longitude;
            parsed.text = msg.location?.name || msg.location?.address || `${msg.location?.latitude}, ${msg.location?.longitude}`;
            break;
          case "reaction":
            parsed.reactionEmoji = msg.reaction?.emoji;
            parsed.reactionMessageId = msg.reaction?.message_id;
            break;
          case "interactive":
            parsed.text = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title;
            break;
          case "button":
            parsed.text = msg.button?.text;
            break;
        }

        messages.push(parsed);
      }
    }
  }

  return messages;
}

// ─── Send Messages ────────────────────────────────────────────────────────────

async function sendRequest(
  config: WhatsAppConfig,
  body: Record<string, unknown>
): Promise<SendResult> {
  try {
    const res = await fetch(`${GRAPH_API_BASE}/${config.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        ...body,
      }),
    });

    const data = await res.json() as {
      messages?: Array<{ id: string }>;
      error?: { message: string; code: number };
    };

    if (data.messages?.[0]?.id) {
      return { success: true, messageId: data.messages[0].id };
    }

    return {
      success: false,
      error: data.error?.message || `HTTP ${res.status}: Unknown error`,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Send a text message */
export async function sendTextMessage(
  config: WhatsAppConfig,
  to: string,
  text: string,
  replyToMessageId?: string
): Promise<SendResult> {
  // WhatsApp has a 4096 char limit per message — chunk if needed
  const maxLen = 4000;
  if (text.length <= maxLen) {
    return sendRequest(config, {
      to,
      type: "text",
      text: { preview_url: true, body: formatForWhatsApp(text) },
      ...(replyToMessageId ? { context: { message_id: replyToMessageId } } : {}),
    });
  }

  // Chunk long messages
  const chunks = chunkText(text, maxLen);
  let lastResult: SendResult = { success: false };
  for (let i = 0; i < chunks.length; i++) {
    const prefix = chunks.length > 1 ? `(${i + 1}/${chunks.length}) ` : "";
    lastResult = await sendRequest(config, {
      to,
      type: "text",
      text: { preview_url: true, body: prefix + formatForWhatsApp(chunks[i]) },
      ...(i === 0 && replyToMessageId ? { context: { message_id: replyToMessageId } } : {}),
    });
    if (!lastResult.success) break;
  }
  return lastResult;
}

/** Send a media message (image, audio, video, document) */
export async function sendMediaMessage(
  config: WhatsAppConfig,
  to: string,
  type: "image" | "audio" | "video" | "document",
  url: string,
  caption?: string,
  filename?: string
): Promise<SendResult> {
  const mediaObj: Record<string, string> = { link: url };
  if (caption) mediaObj.caption = formatForWhatsApp(caption);
  if (filename && type === "document") mediaObj.filename = filename;

  return sendRequest(config, {
    to,
    type,
    [type]: mediaObj,
  });
}

/** Send interactive buttons (max 3 buttons) */
export async function sendButtonMessage(
  config: WhatsAppConfig,
  to: string,
  bodyText: string,
  buttons: Array<{ id: string; title: string }>,
  headerText?: string,
  footerText?: string
): Promise<SendResult> {
  return sendRequest(config, {
    to,
    type: "interactive",
    interactive: {
      type: "button",
      ...(headerText ? { header: { type: "text", text: headerText } } : {}),
      body: { text: formatForWhatsApp(bodyText) },
      ...(footerText ? { footer: { text: footerText } } : {}),
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({
          type: "reply",
          reply: { id: b.id, title: b.title.slice(0, 20) },
        })),
      },
    },
  });
}

/** Send a list message (selection menu) */
export async function sendListMessage(
  config: WhatsAppConfig,
  to: string,
  bodyText: string,
  buttonTitle: string,
  sections: Array<{
    title: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>
): Promise<SendResult> {
  return sendRequest(config, {
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: formatForWhatsApp(bodyText) },
      action: {
        button: buttonTitle.slice(0, 20),
        sections: sections.map((s) => ({
          title: s.title.slice(0, 24),
          rows: s.rows.slice(0, 10).map((r) => ({
            id: r.id.slice(0, 200),
            title: r.title.slice(0, 24),
            description: r.description?.slice(0, 72),
          })),
        })),
      },
    },
  });
}

/** Mark a message as read */
export async function markAsRead(
  config: WhatsAppConfig,
  messageId: string
): Promise<void> {
  await sendRequest(config, {
    status: "read",
    message_id: messageId,
  });
}

// ─── Download Media ───────────────────────────────────────────────────────────

/** Download media from WhatsApp (for voice messages, images, etc.) */
export async function downloadMedia(
  config: WhatsAppConfig,
  mediaId: string
): Promise<{ buffer: Buffer; mimeType: string; url: string }> {
  // Step 1: Get media URL
  const metaRes = await fetch(`${GRAPH_API_BASE}/${mediaId}`, {
    headers: { Authorization: `Bearer ${config.accessToken}` },
  });
  const meta = await metaRes.json() as { url: string; mime_type: string };

  // Step 2: Download the actual file
  const fileRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${config.accessToken}` },
  });

  const arrayBuffer = await fileRes.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: meta.mime_type,
    url: meta.url,
  };
}

// ─── Voice Transcription ──────────────────────────────────────────────────────

/** Transcribe a voice message using OpenAI Whisper */
export async function transcribeVoiceMessage(
  config: WhatsAppConfig,
  mediaId: string
): Promise<string> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return "[Voice message received — OpenAI API key not configured for transcription]";
  }

  try {
    // Download voice from WhatsApp
    const { buffer, mimeType } = await downloadMedia(config, mediaId);

    // Determine file extension from mime type
    const extMap: Record<string, string> = {
      "audio/ogg": "ogg",
      "audio/ogg; codecs=opus": "ogg",
      "audio/mpeg": "mp3",
      "audio/mp4": "m4a",
      "audio/amr": "amr",
      "audio/wav": "wav",
      "audio/x-wav": "wav",
    };
    const ext = extMap[mimeType] || "ogg";

    // Write to temp file (Whisper API needs a file)
    const tmpDir = join(tmpdir(), "ottomatron-whatsapp");
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
    const tmpPath = join(tmpDir, `voice_${uuidv4()}.${ext}`);
    writeFileSync(tmpPath, buffer);

    try {
      // Transcribe with Whisper
      const openai = new OpenAI({ apiKey: openaiKey });
      const transcription = await openai.audio.transcriptions.create({
        file: createReadStream(tmpPath),
        model: "whisper-1",
        response_format: "text",
      });

      return typeof transcription === "string"
        ? transcription
        : (transcription as unknown as { text: string }).text || String(transcription);
    } finally {
      // Clean up temp file
      try { unlinkSync(tmpPath); } catch { /* ignore */ }
    }
  } catch (err) {
    console.error("[whatsapp] Voice transcription error:", err);
    return `[Voice message received — transcription failed: ${err instanceof Error ? err.message : String(err)}]`;
  }
}

// ─── Formatting ───────────────────────────────────────────────────────────────

/** Convert Markdown to WhatsApp formatting */
function formatForWhatsApp(text: string): string {
  return text
    // Code blocks: ```code``` → leave as is (WhatsApp supports ```)
    // Bold: **text** → *text*
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    // Italic: _text_ → _text_ (already compatible)
    // Strikethrough: ~~text~~ → ~text~
    .replace(/~~(.+?)~~/g, "~$1~")
    // Inline code: `code` → leave as is (WhatsApp supports `)
    // Headers: # Header → *Header* (bold)
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
    // Bullet lists: - item → • item
    .replace(/^[-*]\s+/gm, "• ")
    // Numbered lists: keep as is
    // Links: [text](url) → text (url)
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1 ($2)")
    // Horizontal rules: --- → ─────
    .replace(/^-{3,}$/gm, "─────────────────")
    // Images: ![alt](url) → 🖼 alt: url
    .replace(/!\[(.+?)\]\((.+?)\)/g, "🖼 $1: $2")
    .trim();
}

/** Split text into chunks at line boundaries */
function chunkText(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  const lines = text.split("\n");
  let current = "";

  for (const line of lines) {
    if (current.length + line.length + 1 > maxLen && current.length > 0) {
      chunks.push(current.trim());
      current = "";
    }
    current += (current ? "\n" : "") + line;
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks.length > 0 ? chunks : [text.slice(0, maxLen)];
}

// ─── Convenience: Full WhatsApp Response ──────────────────────────────────────

/** Send a complete response back — handles chunking, formatting, and status tracking */
export async function sendResponse(
  config: WhatsAppConfig,
  to: string,
  response: string,
  replyToMessageId?: string,
  options?: {
    maxLength?: number;
    includeFooter?: boolean;
  }
): Promise<SendResult> {
  const maxLength = options?.maxLength || 4000;

  // If response is very short, send as a single message
  if (response.length <= maxLength) {
    const footer = options?.includeFooter ? "\n\n_— Ottomatron_" : "";
    return sendTextMessage(config, to, response + footer, replyToMessageId);
  }

  // For long responses, chunk and send sequentially
  const chunks = chunkText(response, maxLength);
  let result: SendResult = { success: false };

  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1;
    const footer = isLast && options?.includeFooter ? "\n\n_— Ottomatron_" : "";
    result = await sendTextMessage(
      config,
      to,
      chunks[i] + footer,
      i === 0 ? replyToMessageId : undefined
    );
    if (!result.success) return result;

    // Small delay between chunks to maintain order
    if (!isLast) await new Promise((r) => setTimeout(r, 300));
  }

  return result;
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/** Get WhatsApp Business profile info */
export async function getBusinessProfile(
  config: WhatsAppConfig
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(
      `${GRAPH_API_BASE}/${config.phoneNumberId}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical`,
      { headers: { Authorization: `Bearer ${config.accessToken}` } }
    );
    const data = await res.json() as { data?: Array<Record<string, unknown>> };
    return data.data?.[0] || null;
  } catch {
    return null;
  }
}

/** Check if WhatsApp API is reachable */
export async function healthCheck(config: WhatsAppConfig): Promise<{
  ok: boolean;
  phoneNumber?: string;
  error?: string;
}> {
  try {
    const res = await fetch(
      `${GRAPH_API_BASE}/${config.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
      { headers: { Authorization: `Bearer ${config.accessToken}` } }
    );
    const data = await res.json() as {
      display_phone_number?: string;
      verified_name?: string;
      quality_rating?: string;
      error?: { message: string };
    };
    if (data.error) return { ok: false, error: data.error.message };
    return { ok: true, phoneNumber: data.display_phone_number };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Get allowed phone numbers for sending (useful for testing) */
export function sanitizePhoneNumber(phone: string): string {
  // Remove all non-digit characters, ensure starts with country code
  const digits = phone.replace(/\D/g, "");
  // If it starts with 0, assume local (could be improved with country detection)
  if (digits.startsWith("0")) return digits.slice(1);
  return digits;
}

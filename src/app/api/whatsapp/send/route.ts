/**
 * WhatsApp Send & Management API
 *
 * POST /api/whatsapp/send — Send a message from Ottomatron to a WhatsApp number
 * GET  /api/whatsapp/send — Health check and WhatsApp status
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getWhatsAppConfig,
  sendTextMessage,
  sendMediaMessage,
  sendButtonMessage,
  sendListMessage,
  healthCheck,
  getBusinessProfile,
} from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

// ─── GET: Health Check ────────────────────────────────────────────────────────

export async function GET() {
  const config = getWhatsAppConfig();
  if (!config) {
    return NextResponse.json({
      configured: false,
      error: "WhatsApp not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID env vars.",
    });
  }

  const health = await healthCheck(config);
  const profile = health.ok ? await getBusinessProfile(config) : null;

  return NextResponse.json({
    configured: true,
    connected: health.ok,
    phoneNumber: health.phoneNumber,
    profile,
    webhookUrl: `${process.env.APP_URL || "http://localhost:3000"}/api/whatsapp`,
    error: health.error,
  });
}

// ─── POST: Send Message ──────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const config = getWhatsAppConfig();
  if (!config) {
    return NextResponse.json(
      { error: "WhatsApp not configured" },
      { status: 503 }
    );
  }

  try {
    const body = await request.json() as {
      to: string;
      type?: "text" | "image" | "audio" | "video" | "document" | "buttons" | "list";
      text?: string;
      message?: string;
      url?: string;
      caption?: string;
      filename?: string;
      buttons?: Array<{ id: string; title: string }>;
      headerText?: string;
      footerText?: string;
      buttonTitle?: string;
      sections?: Array<{
        title: string;
        rows: Array<{ id: string; title: string; description?: string }>;
      }>;
    };

    if (!body.to) {
      return NextResponse.json({ error: "Missing required field: to" }, { status: 400 });
    }

    const to = body.to.replace(/\D/g, ""); // Clean phone number
    const type = body.type || "text";

    switch (type) {
      case "text": {
        const text = body.text || body.message;
        if (!text) {
          return NextResponse.json({ error: "Missing required field: text" }, { status: 400 });
        }
        const result = await sendTextMessage(config, to, text);
        return NextResponse.json(result);
      }

      case "image":
      case "audio":
      case "video":
      case "document": {
        if (!body.url) {
          return NextResponse.json({ error: "Missing required field: url" }, { status: 400 });
        }
        const result = await sendMediaMessage(config, to, type, body.url, body.caption, body.filename);
        return NextResponse.json(result);
      }

      case "buttons": {
        const text = body.text || body.message;
        if (!text || !body.buttons?.length) {
          return NextResponse.json({ error: "Missing required fields: text, buttons" }, { status: 400 });
        }
        const result = await sendButtonMessage(config, to, text, body.buttons, body.headerText, body.footerText);
        return NextResponse.json(result);
      }

      case "list": {
        const text = body.text || body.message;
        if (!text || !body.sections?.length || !body.buttonTitle) {
          return NextResponse.json({ error: "Missing required fields: text, buttonTitle, sections" }, { status: 400 });
        }
        const result = await sendListMessage(config, to, text, body.buttonTitle, body.sections);
        return NextResponse.json(result);
      }

      default:
        return NextResponse.json({ error: `Unknown message type: ${type}` }, { status: 400 });
    }
  } catch (err) {
    console.error("[whatsapp/send] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

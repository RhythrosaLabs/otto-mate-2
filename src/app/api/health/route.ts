/**
 * Health Dashboard API (OpenClaw + Otto inspired)
 * 
 * GET /api/health — quick status check
 * GET /api/health?detailed=true — comprehensive component health
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface ServiceStatus {
  name: string;
  configured: boolean;
  status: "healthy" | "degraded" | "down" | "unconfigured";
  latency_ms?: number;
  error?: string;
}

async function checkService(
  name: string,
  envKey: string,
  testFn?: () => Promise<{ ok: boolean; latency_ms: number; error?: string }>
): Promise<ServiceStatus> {
  const configured = !!process.env[envKey];
  if (!configured) {
    return { name, configured: false, status: "unconfigured" };
  }
  if (!testFn) {
    return { name, configured: true, status: "healthy" };
  }
  try {
    const result = await testFn();
    return {
      name,
      configured: true,
      status: result.ok ? "healthy" : "degraded",
      latency_ms: result.latency_ms,
      error: result.error,
    };
  } catch (err) {
    return {
      name,
      configured: true,
      status: "down",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// Process uptime tracker
const startTime = Date.now();

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const detailed = searchParams.get("detailed") === "true";
  const uptimeMs = Date.now() - startTime;

  // Quick health check
  if (!detailed) {
    const anthropicOk = !!process.env.ANTHROPIC_API_KEY;
    const openaiOk = !!process.env.OPENAI_API_KEY;
    const anyProvider = anthropicOk || openaiOk;
    return NextResponse.json({
      status: anyProvider ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      version: "2.0.0",
      uptime: formatUptime(uptimeMs),
      uptime_ms: uptimeMs,
      services: {
        anthropic: anthropicOk,
        openai: openaiOk,
        google: !!process.env.GOOGLE_AI_API_KEY,
        perplexity: !!process.env.PERPLEXITY_API_KEY,
        replicate: !!process.env.REPLICATE_API_TOKEN,
        luma: !!process.env.LUMA_API_KEY,
        resend: !!process.env.RESEND_API_KEY,
      },
    });
  }

  // Detailed health check — ping each service
  const services: ServiceStatus[] = await Promise.all([
    checkService("Anthropic", "ANTHROPIC_API_KEY", async () => {
      const start = Date.now();
      const res = await fetch("https://api.anthropic.com/v1/models", {
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
        },
        signal: AbortSignal.timeout(5000),
      });
      return { ok: res.ok, latency_ms: Date.now() - start, error: res.ok ? undefined : `HTTP ${res.status}` };
    }),
    checkService("OpenAI", "OPENAI_API_KEY", async () => {
      const start = Date.now();
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY!}` },
        signal: AbortSignal.timeout(5000),
      });
      return { ok: res.ok, latency_ms: Date.now() - start, error: res.ok ? undefined : `HTTP ${res.status}` };
    }),
    checkService("Google AI", "GOOGLE_AI_API_KEY"),
    checkService("Perplexity", "PERPLEXITY_API_KEY"),
    checkService("Replicate", "REPLICATE_API_TOKEN", async () => {
      const start = Date.now();
      const res = await fetch("https://api.replicate.com/v1/account", {
        headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN!}` },
        signal: AbortSignal.timeout(5000),
      });
      return { ok: res.ok, latency_ms: Date.now() - start, error: res.ok ? undefined : `HTTP ${res.status}` };
    }),
    checkService("Luma AI", "LUMA_API_KEY"),
    checkService("Resend", "RESEND_API_KEY"),
    checkService("Brave Search", "BRAVE_API_KEY"),
    checkService("Serper", "SERPER_API_KEY"),
    checkService("Tavily", "TAVILY_API_KEY"),
    checkService("OpenRouter", "OPENROUTER_API_KEY"),
    checkService("ElevenLabs", "ELEVENLABS_API_KEY"),
    checkService("WhatsApp", "WHATSAPP_PHONE_NUMBER_ID"),
    checkService("Telegram", "TELEGRAM_BOT_TOKEN"),
    checkService("Discord", "DISCORD_BOT_TOKEN"),
    checkService("Slack", "SLACK_BOT_TOKEN"),
  ]);

  const healthyCount = services.filter(s => s.status === "healthy").length;
  const configuredCount = services.filter(s => s.configured).length;
  const degradedCount = services.filter(s => s.status === "degraded" || s.status === "down").length;

  return NextResponse.json({
    status: degradedCount > 0 ? "degraded" : configuredCount > 0 ? "healthy" : "unconfigured",
    timestamp: new Date().toISOString(),
    version: "2.0.0",
    uptime: formatUptime(uptimeMs),
    uptime_ms: uptimeMs,
    summary: {
      total: services.length,
      configured: configuredCount,
      healthy: healthyCount,
      degraded: degradedCount,
      unconfigured: services.filter(s => !s.configured).length,
    },
    services,
    system: {
      node_version: process.version,
      platform: process.platform,
      memory_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      pid: process.pid,
    },
  });
}

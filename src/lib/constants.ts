/**
 * Shared constants used across the application.
 * This avoids duplication between sidebar, command palette, and other components.
 */

import {
  Monitor,
  CheckSquare,
  FolderOpen,
  Plug,
  Zap,
  Image as ImageIcon,
  Brain,
  Clock,
  LayoutTemplate,
  BarChart3,
  Settings,
  Sparkles,
  Globe,
  Shield,
  GitBranch,
  MessageSquare,
  Code2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ─── Navigation Items ─────────────────────────────────────────────────────────

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/computer", label: "Ottomate", icon: Monitor, exact: true },
  { href: "/computer/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/computer/files", label: "Files", icon: FolderOpen },
  { href: "/computer/connectors", label: "Connectors", icon: Plug },
  { href: "/computer/skills", label: "Skills", icon: Zap },
  { href: "/computer/gallery", label: "Gallery", icon: ImageIcon },
  { href: "/computer/playground", label: "Multimedia Playground", icon: Sparkles },
  { href: "/computer/dreamscape", label: "Video Producer", icon: Sparkles },
  { href: "/computer/app-builder", label: "App Builder", icon: Code2 },
  { href: "/computer/channels", label: "Channels", icon: Globe },
  { href: "/computer/memory", label: "Memory", icon: Brain },
  { href: "/computer/templates", label: "Templates", icon: LayoutTemplate },
  { href: "/computer/scheduled", label: "Scheduled", icon: Clock },
  { href: "/computer/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/computer/audit", label: "Audit Trail", icon: Shield },
  { href: "/computer/pipelines", label: "Pipelines", icon: GitBranch },
  { href: "/computer/sessions", label: "Sessions", icon: MessageSquare },
  { href: "/computer/settings", label: "Settings", icon: Settings },
];

// ─── API Response Helpers ─────────────────────────────────────────────────────

import { NextResponse } from "next/server";

export function apiError(message: string, status: number = 500): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export function apiSuccess<T>(data: T, status: number = 200): NextResponse {
  return NextResponse.json(data, { status });
}

/**
 * Safely extract error message without leaking secrets.
 * Returns a generic message for unexpected errors.
 */
export function safeErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    // Strip potential secrets from error messages
    const msg = err.message;
    // If the message contains patterns that suggest secret leakage, genericize it
    if (/api[_-]?key|token|secret|password|credential/i.test(msg)) {
      return "An internal error occurred. Check server logs for details.";
    }
    return msg;
  }
  return "An unexpected error occurred.";
}

// ─── Allowed env keys for /api/connectors/env endpoint ────────────────────────

export const ALLOWED_ENV_KEYS = new Set([
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_AI_API_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "MICROSOFT_CLIENT_ID",
  "MICROSOFT_CLIENT_SECRET",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "NOTION_CLIENT_ID",
  "NOTION_CLIENT_SECRET",
  "DROPBOX_CLIENT_ID",
  "DROPBOX_CLIENT_SECRET",
  "PERPLEXITY_API_KEY",
  "OPENROUTER_API_KEY",
  "REPLICATE_API_TOKEN",
  "LUMAAI_API_KEY",
  "HUGGINGFACE_API_KEY",
  "STEEL_API_KEY",
  "TAVILY_API_KEY",
  "SLACK_BOT_TOKEN",
  "SLACK_SIGNING_SECRET",
  "DISCORD_BOT_TOKEN",
  "DISCORD_PUBLIC_KEY",
  "TELEGRAM_BOT_TOKEN",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_VERIFY_TOKEN",
  "REDDIT_USERNAME",
  "REDDIT_PASSWORD",
  "APP_URL",
  "DATABASE_PATH",
  "ELEVENLABS_API_KEY",
]);

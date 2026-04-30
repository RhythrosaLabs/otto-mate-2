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
  Brain,
  Clock,
  BarChart3,
  Settings,
  Shield,
  MessageSquare,
  Clapperboard,
  Flame,
  FileEdit,
  MousePointer2,
  Music,
  Package,
  Terminal,
  Box,
  Layers,
  Send,
  KeyRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ─── Navigation Items ─────────────────────────────────────────────────────────

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  /** Optional items are hidden by default; user enables them in Settings › Features */
  optional?: boolean;
}

/**
 * Nav items that are hidden by default and can be enabled in Settings › Features.
 * Key is the href, value is a short description shown in the settings UI.
 */
export const OPTIONAL_NAV_ITEMS: Record<string, { label: string; description: string }> = {
  "/computer/app-builder":     { label: "App Builder",           description: "Visual app scaffold & bolt.diy integration (requires bolt-diy service)" },
  "/computer/audio-studio":    { label: "Audio Studio",          description: "Multi-track audio editor powered by openDAW (requires openDAW service)" },
  "/computer/playground":      { label: "Multimedia Playground", description: "Combined image, video & audio generation sandbox" },
  "/computer/coding-companion":{ label: "Coding Companion",      description: "In-browser VS Code environment via code-server proxy" },
  "/computer/3d-studio":       { label: "3D Studio",             description: "3D model viewer & editor powered by Blockbench (requires Blockbench service)" },
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/computer", label: "Ottomate", icon: Monitor, exact: true },
  { href: "/computer/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/computer/files", label: "Files", icon: FolderOpen },
  { href: "/computer/connectors", label: "Connectors", icon: Plug },
  { href: "/computer/skills", label: "Skills", icon: Zap },
  { href: "/computer/documents", label: "Documents", icon: FileEdit },
  { href: "/computer/app-builder", label: "App Builder", icon: Package, optional: true },
  { href: "/computer/coding-companion", label: "Coding Companion", icon: Terminal, optional: true },
  { href: "/computer/dreamscape/studio", label: "Video Studio", icon: Clapperboard },
  { href: "/computer/playground", label: "Multimedia Playground", icon: Layers, optional: true },
  { href: "/computer/audio-studio", label: "Audio Studio", icon: Music, optional: true },
  { href: "/computer/firefly", label: "Creative Suite", icon: Flame },
  { href: "/computer/3d-studio", label: "3D Studio", icon: Box, optional: true },
  { href: "/computer/dispatch", label: "Dispatch", icon: Send },
  { href: "/computer/memory", label: "Memory", icon: Brain },
  { href: "/computer/scheduled", label: "Scheduled", icon: Clock },
  { href: "/computer/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/computer/audit", label: "Audit Trail", icon: Shield },
  { href: "/computer/sessions", label: "Sessions", icon: MessageSquare },
  { href: "/computer/computer-control", label: "Computer Control", icon: MousePointer2 },
  { href: "/computer/settings", label: "Settings", icon: Settings },
  { href: "/computer/settings/api-keys", label: "API Keys", icon: KeyRound },
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
  "LUMA_API_KEY",
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

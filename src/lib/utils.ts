import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "unknown";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return "just now"; // future dates treated as now
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

export function getMimeIcon(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "🖼️";
  if (mimeType === "text/html") return "🌐";
  if (mimeType === "text/markdown") return "📝";
  if (mimeType === "application/json") return "📋";
  if (mimeType.includes("python") || mimeType.includes("javascript")) return "💻";
  if (mimeType === "text/csv") return "📊";
  if (mimeType.includes("spreadsheet")) return "📊";
  if (mimeType.includes("document") || mimeType.includes("word")) return "📄";
  if (mimeType === "application/pdf") return "📕";
  if (mimeType === "application/zip") return "🗜️";
  return "📁";
}

// Consolidated status color lookup
const STATUS_COLORS: Record<string, { text: string; bg: string }> = {
  completed:         { text: "text-green-400",    bg: "bg-green-400/10 text-green-400" },
  running:           { text: "text-pplx-accent",  bg: "bg-pplx-accent/10 text-pplx-accent" },
  failed:            { text: "text-red-400",      bg: "bg-red-400/10 text-red-400" },
  waiting_for_input: { text: "text-yellow-400",   bg: "bg-yellow-400/10 text-yellow-400" },
  paused:            { text: "text-blue-400",     bg: "bg-blue-400/10 text-blue-400" },
  pending:           { text: "text-pplx-muted",   bg: "bg-pplx-muted/10 text-pplx-muted" },
  queued:            { text: "text-purple-400",   bg: "bg-purple-400/10 text-purple-400" },
};

const DEFAULT_STATUS = { text: "text-pplx-muted", bg: "bg-pplx-muted/10 text-pplx-muted" };

export function getStatusColor(status: string): string {
  return (STATUS_COLORS[status] || DEFAULT_STATUS).text;
}

export function getStatusBgColor(status: string): string {
  return (STATUS_COLORS[status] || DEFAULT_STATUS).bg;
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "…";
}

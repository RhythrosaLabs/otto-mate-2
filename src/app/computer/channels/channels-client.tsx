"use client";

import { useState, useEffect } from "react";
import {
  MessageCircle,
  Hash,
  Globe,
  CheckCircle2,
  XCircle,
  ExternalLink,
  RefreshCw,
  Copy,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ChannelInfo {
  channel: string;
  configured: boolean;
  webhook_path: string;
  setup_instructions: string[];
}

const CHANNELS = [
  {
    id: "telegram",
    name: "Telegram",
    icon: "🤖",
    color: "text-blue-400",
    bgColor: "bg-blue-500/15",
    description: "Receive and process tasks from Telegram messages",
    endpoint: "/api/channels/telegram",
    docsUrl: "https://core.telegram.org/bots/api",
    envKeys: ["TELEGRAM_BOT_TOKEN"],
  },
  {
    id: "discord",
    name: "Discord",
    icon: "🎮",
    color: "text-indigo-400",
    bgColor: "bg-indigo-500/15",
    description: "Slash commands and interactions from Discord servers",
    endpoint: "/api/channels/discord",
    docsUrl: "https://discord.com/developers/docs",
    envKeys: ["DISCORD_BOT_TOKEN", "DISCORD_PUBLIC_KEY"],
  },
  {
    id: "slack",
    name: "Slack",
    icon: "💬",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/15",
    description: "Process tasks from Slack slash commands and DMs",
    endpoint: "/api/channels/slack",
    docsUrl: "https://api.slack.com/apps",
    envKeys: ["SLACK_BOT_TOKEN", "SLACK_SIGNING_SECRET"],
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    icon: "📱",
    color: "text-green-400",
    bgColor: "bg-green-500/15",
    description: "Existing WhatsApp Cloud API integration",
    endpoint: "/api/whatsapp",
    docsUrl: "https://developers.facebook.com/docs/whatsapp",
    envKeys: ["WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_ACCESS_TOKEN"],
  },
];

export function ChannelsClient() {
  const [channelStatus, setChannelStatus] = useState<Record<string, ChannelInfo | null>>({});
  const [loading, setLoading] = useState(true);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAll() {
      setLoading(true);
      const results: Record<string, ChannelInfo | null> = {};
      await Promise.all(
        CHANNELS.filter(c => c.id !== "whatsapp").map(async (ch) => {
          try {
            const res = await fetch(ch.endpoint);
            if (res.ok) {
              results[ch.id] = await res.json() as ChannelInfo;
            }
          } catch {
            results[ch.id] = null;
          }
        })
      );
      setChannelStatus(results);
      setLoading(false);
    }
    fetchAll();
  }, []);

  function copyWebhookUrl(path: string) {
    const url = `${window.location.origin}${path}`;
    navigator.clipboard.writeText(url);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 2000);
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 via-pink-500 to-orange-500 flex items-center justify-center">
          <Globe size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-pplx-text">Channels</h1>
          <p className="text-xs text-pplx-muted">Connect Ottomate to messaging platforms — receive and process tasks from anywhere</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="animate-spin text-pplx-muted" size={24} />
        </div>
      ) : (
        <div className="grid gap-4">
          {CHANNELS.map((ch) => {
            const status = channelStatus[ch.id];
            const configured = status?.configured ?? false;

            return (
              <div
                key={ch.id}
                className="rounded-xl border border-pplx-border bg-pplx-card p-5 hover:border-pplx-muted/40 transition-colors"
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center text-2xl", ch.bgColor)}>
                    {ch.icon}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-pplx-text">{ch.name}</h3>
                      {configured ? (
                        <span className="flex items-center gap-1 text-[10px] text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">
                          <CheckCircle2 size={10} /> Connected
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] text-pplx-muted bg-pplx-bg px-2 py-0.5 rounded-full">
                          <XCircle size={10} /> Not configured
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-pplx-muted mb-3">{ch.description}</p>

                    {/* Webhook URL */}
                    <div className="flex items-center gap-2 mb-3">
                      <code className="text-[11px] font-mono text-pplx-muted bg-pplx-bg px-2.5 py-1 rounded-lg border border-pplx-border flex-1 truncate">
                        {ch.endpoint}
                      </code>
                      <button
                        onClick={() => copyWebhookUrl(ch.endpoint)}
                        className="p-1.5 rounded-lg text-pplx-muted hover:text-pplx-text hover:bg-white/5 transition-colors"
                        title="Copy full webhook URL"
                      >
                        {copiedPath === ch.endpoint ? <CheckCircle2 size={12} className="text-green-400" /> : <Copy size={12} />}
                      </button>
                    </div>

                    {/* Env keys needed */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {ch.envKeys.map(key => (
                        <code key={key} className="text-[10px] font-mono px-2 py-0.5 rounded bg-pplx-bg border border-pplx-border text-pplx-muted">
                          {key}
                        </code>
                      ))}
                    </div>

                    {/* Setup instructions */}
                    {status?.setup_instructions && !configured && (
                      <details className="text-xs text-pplx-muted">
                        <summary className="cursor-pointer hover:text-pplx-text transition-colors">
                          Setup instructions
                        </summary>
                        <ol className="mt-2 space-y-1 list-decimal list-inside text-pplx-muted">
                          {status.setup_instructions.map((step, i) => (
                            <li key={i}>{step.replace(/^\d+\.\s*/, "")}</li>
                          ))}
                        </ol>
                      </details>
                    )}
                  </div>

                  {/* Docs link */}
                  <a
                    href={ch.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg text-pplx-muted hover:text-pplx-text hover:bg-white/5 transition-colors flex-shrink-0"
                    title="Documentation"
                  >
                    <ExternalLink size={14} />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

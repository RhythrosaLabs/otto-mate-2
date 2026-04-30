"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Send,
  CheckCircle2,
  XCircle,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  Phone,
  Mic,
  Image as ImageIcon,
  FileText,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Channel definitions ────────────────────────────────────────────────────

interface ChannelDef {
  id: string;
  name: string;
  icon: string;
  color: string;
  bgColor: string;
  description: string;
  endpoint: string;
  docsUrl: string;
  envKeys: string[];
  setupSteps: { title: string; body: React.ReactNode }[];
  canSendTest?: boolean;
}

const CHANNELS: ChannelDef[] = [
  {
    id: "telegram",
    name: "Telegram",
    icon: "✈️",
    color: "text-blue-400",
    bgColor: "bg-blue-500/15",
    description: "Command Ottomate via Telegram DMs or group chats. Supports text, voice, and file attachments.",
    endpoint: "/api/channels/telegram",
    docsUrl: "https://core.telegram.org/bots/api",
    envKeys: ["TELEGRAM_BOT_TOKEN"],
    setupSteps: [
      {
        title: "Create a bot with @BotFather",
        body: (
          <>
            Open Telegram, search <strong>@BotFather</strong>, and run{" "}
            <code className="px-1 py-0.5 bg-pplx-bg rounded text-pplx-accent">/newbot</code>.
            Copy the token you receive.
          </>
        ),
      },
      {
        title: "Set environment variable",
        body: (
          <>
            Add <code className="px-1 py-0.5 bg-pplx-bg rounded text-pplx-accent">TELEGRAM_BOT_TOKEN=your_token</code>{" "}
            to your <code>.env.local</code> or Fly.io secrets.
          </>
        ),
      },
      {
        title: "Register webhook",
        body: (
          <>
            Copy the webhook URL below and run:{" "}
            <code className="block mt-1 p-2 bg-pplx-bg rounded text-xs font-mono text-pplx-accent break-all">
              curl -X POST https://api.telegram.org/bot$TOKEN/setWebhook -d url=WEBHOOK_URL
            </code>
          </>
        ),
      },
      {
        title: "Message your bot",
        body: "Search for your bot in Telegram and send any message — Ottomate will create a task and reply.",
      },
    ],
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    icon: "📱",
    color: "text-green-400",
    bgColor: "bg-green-500/15",
    description: "Command Ottomate via WhatsApp text and voice messages. Uses the Meta Cloud API.",
    endpoint: "/api/whatsapp",
    docsUrl: "https://developers.facebook.com/docs/whatsapp",
    envKeys: ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_VERIFY_TOKEN"],
    canSendTest: true,
    setupSteps: [
      {
        title: "Create a Meta Developer App",
        body: (
          <>
            Go to{" "}
            <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer" className="text-pplx-accent hover:underline">
              Meta Developer Portal
            </a>
            {" "}→ Create App → Business type → Add WhatsApp product.
          </>
        ),
      },
      {
        title: "Get credentials",
        body: (
          <>
            From WhatsApp → API Setup copy:
            <ul className="mt-1.5 ml-3 space-y-0.5 text-pplx-muted">
              <li>• <strong className="text-pplx-text">Phone Number ID</strong></li>
              <li>• <strong className="text-pplx-text">Access Token</strong> (permanent token)</li>
            </ul>
          </>
        ),
      },
      {
        title: "Set environment variables",
        body: (
          <pre className="p-2 bg-pplx-bg rounded text-[11px] font-mono text-pplx-accent overflow-x-auto">
{`WHATSAPP_ACCESS_TOKEN=your_token
WHATSAPP_PHONE_NUMBER_ID=your_number_id
WHATSAPP_VERIFY_TOKEN=any_secret_string`}
          </pre>
        ),
      },
      {
        title: "Configure webhook",
        body: (
          <>
            In WhatsApp → Configuration set Callback URL to the webhook endpoint below.
            Set Verify Token to match <code className="px-1 bg-pplx-bg rounded text-pplx-accent">WHATSAPP_VERIFY_TOKEN</code>.
            Subscribe to the <strong>messages</strong> field.
          </>
        ),
      },
    ],
  },
  {
    id: "discord",
    name: "Discord",
    icon: "🎮",
    color: "text-indigo-400",
    bgColor: "bg-indigo-500/15",
    description: "Run Ottomate tasks via Discord slash commands or DMs from any server.",
    endpoint: "/api/channels/discord",
    docsUrl: "https://discord.com/developers/docs",
    envKeys: ["DISCORD_BOT_TOKEN", "DISCORD_PUBLIC_KEY"],
    setupSteps: [
      {
        title: "Create a Discord application",
        body: (
          <>
            Go to{" "}
            <a href="https://discord.com/developers/applications" target="_blank" rel="noopener noreferrer" className="text-pplx-accent hover:underline">
              Discord Developer Portal
            </a>
            {" "}→ New Application → Bot → reset and copy token.
          </>
        ),
      },
      {
        title: "Set environment variables",
        body: (
          <pre className="p-2 bg-pplx-bg rounded text-[11px] font-mono text-pplx-accent overflow-x-auto">
{`DISCORD_BOT_TOKEN=your_bot_token
DISCORD_PUBLIC_KEY=your_app_public_key`}
          </pre>
        ),
      },
      {
        title: "Set interactions endpoint",
        body: "In your Discord app settings → General Information → Interactions Endpoint URL, paste the webhook URL below.",
      },
      {
        title: "Invite bot to server",
        body: "Use OAuth2 URL Generator (bot + applications.commands scopes) to invite the bot to your server.",
      },
    ],
  },
  {
    id: "slack",
    name: "Slack",
    icon: "💬",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/15",
    description: "Trigger Ottomate from Slack DMs or slash commands in any workspace.",
    endpoint: "/api/channels/slack",
    docsUrl: "https://api.slack.com/apps",
    envKeys: ["SLACK_BOT_TOKEN", "SLACK_SIGNING_SECRET"],
    setupSteps: [
      {
        title: "Create a Slack app",
        body: (
          <>
            Go to{" "}
            <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer" className="text-pplx-accent hover:underline">
              api.slack.com/apps
            </a>
            {" "}→ Create New App → From scratch.
          </>
        ),
      },
      {
        title: "Add bot scopes",
        body: "Under OAuth & Permissions → Bot Token Scopes, add: chat:write, im:history, im:read, commands.",
      },
      {
        title: "Set environment variables",
        body: (
          <pre className="p-2 bg-pplx-bg rounded text-[11px] font-mono text-pplx-accent overflow-x-auto">
{`SLACK_BOT_TOKEN=xoxb-your-token
SLACK_SIGNING_SECRET=your_signing_secret`}
          </pre>
        ),
      },
      {
        title: "Configure event subscriptions",
        body: "Under Event Subscriptions, enable and set the Request URL to the webhook endpoint below. Subscribe to message.im events.",
      },
    ],
  },
];

// ─── Sub-components ──────────────────────────────────────────────────────────

function ChannelCard({ ch }: { ch: ChannelDef }) {
  const [status, setStatus] = useState<{ configured?: boolean; connected?: boolean; webhookUrl?: string; error?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // WhatsApp test send
  const [sendTo, setSendTo] = useState("");
  const [sendMsg, setSendMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    fetch(ch.endpoint)
      .then(r => r.ok ? r.json() : null)
      .then(d => setStatus(d))
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }, [ch.endpoint]);

  async function copyEndpoint() {
    const url = `${window.location.origin}${ch.endpoint}`;
    try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function sendTest() {
    if (!sendTo.trim() || !sendMsg.trim()) return;
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: sendTo, text: sendMsg }),
      });
      const d = await res.json();
      setSendResult(d.success ? { ok: true, msg: `Sent! ID: ${d.messageId}` } : { ok: false, msg: d.error || "Failed" });
      if (d.success) setSendMsg("");
    } catch (err) {
      setSendResult({ ok: false, msg: err instanceof Error ? err.message : "Network error" });
    }
    setSending(false);
  }

  const configured = status?.configured ?? false;
  const connected = status?.connected ?? configured;

  return (
    <div className="rounded-xl border border-pplx-border bg-pplx-card overflow-hidden">
      {/* Header row */}
      <div className="flex items-start gap-4 p-5">
        <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0", ch.bgColor)}>
          {ch.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="text-sm font-semibold text-pplx-text">{ch.name}</h3>
            {loading ? (
              <span className="text-[10px] text-pplx-muted bg-pplx-bg px-2 py-0.5 rounded-full">checking…</span>
            ) : configured ? (
              <span className="flex items-center gap-1 text-[10px] text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">
                <CheckCircle2 size={10} /> Connected
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] text-pplx-muted bg-pplx-bg px-2 py-0.5 rounded-full">
                <XCircle size={10} /> Not configured
              </span>
            )}
          </div>
          <p className="text-xs text-pplx-muted leading-relaxed">{ch.description}</p>
        </div>
        <a href={ch.docsUrl} target="_blank" rel="noopener noreferrer"
          className="p-1.5 rounded-lg text-pplx-muted hover:text-pplx-text hover:bg-white/5 transition-colors flex-shrink-0">
          <ExternalLink size={14} />
        </a>
      </div>

      {/* Webhook URL row */}
      <div className="px-5 pb-4 flex items-center gap-2">
        <code className="text-[11px] font-mono text-pplx-muted bg-pplx-bg px-2.5 py-1.5 rounded-lg border border-pplx-border flex-1 truncate">
          {ch.endpoint}
        </code>
        <button onClick={copyEndpoint}
          className="p-1.5 rounded-lg text-pplx-muted hover:text-pplx-text hover:bg-white/5 transition-colors"
          title="Copy full webhook URL">
          {copied ? <CheckCircle2 size={12} className="text-green-400" /> : <Copy size={12} />}
        </button>
      </div>

      {/* Required env vars */}
      <div className="px-5 pb-4 flex flex-wrap gap-1.5">
        {ch.envKeys.map(k => (
          <code key={k} className="text-[10px] font-mono px-2 py-0.5 rounded bg-pplx-bg border border-pplx-border text-pplx-muted">
            {k}
          </code>
        ))}
      </div>

      {/* Setup accordion */}
      {!configured && (
        <div className="border-t border-pplx-border/50">
          <button
            onClick={() => setExpanded(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3 text-xs text-pplx-muted hover:text-pplx-text transition-colors"
          >
            <span className="flex items-center gap-1.5"><Info size={12} /> Setup instructions</span>
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {expanded && (
            <ol className="px-5 pb-4 space-y-3">
              {ch.setupSteps.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-pplx-accent/10 text-pplx-accent text-[10px] font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <div className="text-xs text-pplx-muted leading-relaxed">
                    <strong className="text-pplx-text block mb-0.5">{s.title}</strong>
                    {s.body}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* WhatsApp test-send panel (only when connected) */}
      {ch.canSendTest && connected && (
        <div className="border-t border-pplx-border/50 px-5 py-4 space-y-3">
          <p className="text-xs font-medium text-pplx-text flex items-center gap-1.5">
            <Send size={12} className="text-pplx-accent" /> Send a test message
          </p>
          {status?.webhookUrl && (
            <p className="text-[10px] text-pplx-muted font-mono break-all">{status.webhookUrl}</p>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={sendTo}
              onChange={e => setSendTo(e.target.value)}
              placeholder="Phone (14155551234)"
              className="flex-1 px-3 py-2 rounded-lg bg-pplx-bg border border-pplx-border text-xs text-pplx-text placeholder-pplx-muted focus:outline-none focus:border-pplx-accent"
            />
          </div>
          <div className="flex gap-2">
            <textarea
              value={sendMsg}
              onChange={e => setSendMsg(e.target.value)}
              placeholder="Message…"
              rows={2}
              className="flex-1 px-3 py-2 rounded-lg bg-pplx-bg border border-pplx-border text-xs text-pplx-text placeholder-pplx-muted focus:outline-none focus:border-pplx-accent resize-none"
            />
            <button
              onClick={sendTest}
              disabled={sending || !sendTo.trim() || !sendMsg.trim()}
              className="px-4 rounded-lg bg-pplx-accent text-white text-xs font-medium disabled:opacity-50 hover:bg-pplx-accent-hover transition-colors"
            >
              {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            </button>
          </div>
          {sendResult && (
            <p className={cn("text-[11px]", sendResult.ok ? "text-green-400" : "text-red-400")}>
              {sendResult.msg}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function DispatchClient() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 via-pink-500 to-orange-500 flex items-center justify-center">
            <Send size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-pplx-text">Dispatch</h1>
            <p className="text-xs text-pplx-muted">
              Command Ottomate from any phone or chat app — Telegram, WhatsApp, Discord, Slack
            </p>
          </div>
        </div>
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          className="p-2 rounded-lg text-pplx-muted hover:text-pplx-text hover:bg-white/5 transition-colors"
          title="Refresh status"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Feature pills */}
      <div className="flex flex-wrap gap-2">
        {[
          { icon: <Phone size={11} />, label: "Send by phone" },
          { icon: <Mic size={11} />, label: "Voice messages" },
          { icon: <ImageIcon size={11} />, label: "Media attachments" },
          { icon: <FileText size={11} />, label: "Rich responses" },
        ].map(f => (
          <span key={f.label} className="flex items-center gap-1.5 text-[11px] text-pplx-muted bg-pplx-card border border-pplx-border px-3 py-1 rounded-full">
            <span className="text-pplx-accent">{f.icon}</span>
            {f.label}
          </span>
        ))}
      </div>

      {/* Channel cards */}
      <div key={refreshKey} className="grid gap-4">
        {CHANNELS.map(ch => <ChannelCard key={ch.id} ch={ch} />)}
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import {
  MessageCircle,
  Phone,
  Send,
  CheckCircle2,
  XCircle,
  Copy,
  ExternalLink,
  RefreshCw,
  Mic,
  Image as ImageIcon,
  FileText,
  Loader2,
  AlertTriangle,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface WhatsAppStatus {
  configured: boolean;
  connected: boolean;
  phoneNumber?: string;
  profile?: Record<string, unknown>;
  webhookUrl?: string;
  error?: string;
}

export default function WhatsAppClient() {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendTo, setSendTo] = useState("");
  const [sendMessage, setSendMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/send");
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus({ configured: false, connected: false, error: "Failed to check status" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleSend = async () => {
    if (!sendTo.trim() || !sendMessage.trim()) return;
    setSending(true);
    setSendResult(null);

    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: sendTo, text: sendMessage }),
      });
      const data = await res.json();
      if (data.success) {
        setSendResult({ success: true, message: `Message sent! ID: ${data.messageId}` });
        setSendMessage("");
      } else {
        setSendResult({ success: false, message: data.error || "Failed to send" });
      }
    } catch (err) {
      setSendResult({ success: false, message: err instanceof Error ? err.message : "Network error" });
    } finally {
      setSending(false);
    }
  };

  const copyWebhookUrl = () => {
    if (status?.webhookUrl) {
      navigator.clipboard.writeText(status.webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-green-500" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-green-600 flex items-center justify-center">
            <MessageCircle className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">WhatsApp Control</h1>
            <p className="text-sm text-zinc-400">
              Control Ottomatron via text and voice messages in WhatsApp
            </p>
          </div>
        </div>
        <button
          onClick={() => { setLoading(true); fetchStatus(); }}
          className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Status Card */}
      <div className={cn(
        "rounded-xl border p-6",
        status?.connected
          ? "border-green-800/50 bg-green-950/20"
          : status?.configured
            ? "border-yellow-800/50 bg-yellow-950/20"
            : "border-zinc-800 bg-zinc-900/50"
      )}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {status?.connected ? (
              <CheckCircle2 className="w-6 h-6 text-green-500" />
            ) : status?.configured ? (
              <AlertTriangle className="w-6 h-6 text-yellow-500" />
            ) : (
              <XCircle className="w-6 h-6 text-zinc-500" />
            )}
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">
                {status?.connected
                  ? "WhatsApp Connected"
                  : status?.configured
                    ? "WhatsApp Configured (Connection Issue)"
                    : "WhatsApp Not Configured"}
              </h2>
              {status?.phoneNumber && (
                <p className="text-sm text-zinc-400 flex items-center gap-1.5 mt-1">
                  <Phone className="w-3.5 h-3.5" />
                  {status.phoneNumber}
                </p>
              )}
              {status?.error && (
                <p className="text-sm text-red-400 mt-1">{status.error}</p>
              )}
            </div>
          </div>
        </div>

        {status?.webhookUrl && (
          <div className="mt-4 p-3 rounded-lg bg-zinc-900/80 border border-zinc-700/50">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium">Webhook URL</p>
                <p className="text-sm text-zinc-300 font-mono mt-1 break-all">{status.webhookUrl}</p>
              </div>
              <button
                onClick={copyWebhookUrl}
                className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition flex items-center gap-1.5 text-xs shrink-0"
              >
                <Copy className="w-3.5 h-3.5" />
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Setup Guide */}
      {!status?.configured && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2 mb-4">
            <Info className="w-5 h-5 text-blue-400" />
            Setup Guide
          </h2>
          <div className="space-y-4 text-sm text-zinc-300">
            <div className="space-y-3">
              <Step n={1} title="Create a Meta Developer App">
                Go to{" "}
                <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer" className="text-green-400 hover:text-green-300 underline">
                  Meta Developer Portal
                </a>
                {" "}and create a new app. Choose &quot;Business&quot; type.
              </Step>

              <Step n={2} title="Add WhatsApp Product">
                In your app, go to &quot;Add Products&quot; and add &quot;WhatsApp&quot;. Follow the setup wizard.
              </Step>

              <Step n={3} title="Get Your Credentials">
                In WhatsApp {"->"} API Setup, copy:
                <ul className="mt-2 ml-4 space-y-1 text-zinc-400">
                  <li>• <strong className="text-zinc-300">Phone Number ID</strong> — from the test/production number</li>
                  <li>• <strong className="text-zinc-300">Access Token</strong> — generate a permanent token</li>
                </ul>
              </Step>

              <Step n={4} title="Set Environment Variables">
                Add to your <code className="px-1.5 py-0.5 bg-zinc-800 rounded text-green-400">.env.local</code>:
                <pre className="mt-2 p-3 bg-zinc-800/80 rounded-lg text-xs overflow-x-auto font-mono">
{`WHATSAPP_ACCESS_TOKEN=your_access_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_VERIFY_TOKEN=any_secret_string_you_choose`}
                </pre>
              </Step>

              <Step n={5} title="Configure Webhook">
                In WhatsApp {"->"} Configuration, set:
                <ul className="mt-2 ml-4 space-y-1 text-zinc-400">
                  <li>• <strong className="text-zinc-300">Callback URL:</strong>{" "}
                    <code className="px-1.5 py-0.5 bg-zinc-800 rounded text-green-400">
                      https://your-domain.com/api/whatsapp
                    </code>
                  </li>
                  <li>• <strong className="text-zinc-300">Verify Token:</strong> same as WHATSAPP_VERIFY_TOKEN</li>
                  <li>• <strong className="text-zinc-300">Webhook fields:</strong> Subscribe to &quot;messages&quot;</li>
                </ul>
              </Step>

              <Step n={6} title="Start Messaging!">
                Send a text or voice message to your WhatsApp Business number. Ottomatron will create a task, process it with AI, and send the result back.
              </Step>
            </div>
          </div>
        </div>
      )}

      {/* Features Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <FeatureCard
          icon={<MessageCircle className="w-5 h-5" />}
          title="Text Messages"
          description="Send any request as a text message"
          color="green"
        />
        <FeatureCard
          icon={<Mic className="w-5 h-5" />}
          title="Voice Messages"
          description="Speak your request — auto-transcribed via Whisper"
          color="blue"
        />
        <FeatureCard
          icon={<ImageIcon className="w-5 h-5" />}
          title="Media Support"
          description="Send and receive images, documents, files"
          color="purple"
        />
        <FeatureCard
          icon={<FileText className="w-5 h-5" />}
          title="Smart Formatting"
          description="Rich responses with WhatsApp-native formatting"
          color="amber"
        />
      </div>

      {/* Send Message Panel */}
      {status?.connected && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2 mb-4">
            <Send className="w-5 h-5 text-green-400" />
            Send a Message
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1.5">Phone Number (with country code)</label>
              <input
                type="text"
                value={sendTo}
                onChange={(e) => setSendTo(e.target.value)}
                placeholder="14155551234"
                className="w-full px-4 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-green-600"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-1.5">Message</label>
              <textarea
                value={sendMessage}
                onChange={(e) => setSendMessage(e.target.value)}
                placeholder="Type your message..."
                rows={3}
                className="w-full px-4 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-green-600 resize-none"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                {sendResult && (
                  <p className={cn(
                    "text-sm",
                    sendResult.success ? "text-green-400" : "text-red-400"
                  )}>
                    {sendResult.success ? "✓" : "✕"} {sendResult.message}
                  </p>
                )}
              </div>
              <button
                onClick={handleSend}
                disabled={sending || !sendTo.trim() || !sendMessage.trim()}
                className={cn(
                  "px-5 py-2.5 rounded-lg font-medium text-sm transition flex items-center gap-2",
                  sending || !sendTo.trim() || !sendMessage.trim()
                    ? "bg-zinc-700 text-zinc-500 cursor-not-allowed"
                    : "bg-green-600 hover:bg-green-500 text-white"
                )}
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* How It Works */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <h2 className="text-lg font-semibold text-zinc-100 mb-4">How It Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <FlowStep
            step={1}
            title="You Message"
            description="Send a text or voice message to your WhatsApp Business number. Voice messages are automatically transcribed."
          />
          <FlowStep
            step={2}
            title="AI Processes"
            description="Ottomatron creates a task, processes it with the full AI agent (web search, code execution, connectors, etc)."
          />
          <FlowStep
            step={3}
            title="Result Delivered"
            description="The AI response is formatted for WhatsApp and sent back. Long responses are automatically chunked."
          />
        </div>
      </div>

      {/* API Reference */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2 mb-4">
          API Reference
          <a
            href="https://developers.facebook.com/docs/whatsapp/cloud-api"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-zinc-500 hover:text-zinc-400 flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" />
            Docs
          </a>
        </h2>
        <div className="space-y-3 text-sm">
          <ApiEndpoint
            method="GET"
            path="/api/whatsapp"
            description="Meta webhook verification (automatic)"
          />
          <ApiEndpoint
            method="POST"
            path="/api/whatsapp"
            description="Incoming messages (set as Meta webhook URL)"
          />
          <ApiEndpoint
            method="GET"
            path="/api/whatsapp/send"
            description="Health check and connection status"
          />
          <ApiEndpoint
            method="POST"
            path="/api/whatsapp/send"
            description="Send a message to a WhatsApp number"
          />
        </div>
      </div>
    </div>
  );
}

// ─── Sub-Components ───────────────────────────────────────────────────────────

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-full bg-green-900/50 border border-green-700/50 flex items-center justify-center text-green-400 font-bold text-sm shrink-0">
        {n}
      </div>
      <div>
        <h3 className="font-medium text-zinc-200">{title}</h3>
        <div className="text-zinc-400 mt-1">{children}</div>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    green: "bg-green-950/30 border-green-800/40 text-green-400",
    blue: "bg-blue-950/30 border-blue-800/40 text-blue-400",
    purple: "bg-purple-950/30 border-purple-800/40 text-purple-400",
    amber: "bg-amber-950/30 border-amber-800/40 text-amber-400",
  };

  return (
    <div className={cn("rounded-xl border p-4", colorMap[color] || colorMap.green)}>
      <div className="mb-2">{icon}</div>
      <h3 className="font-medium text-zinc-200 text-sm">{title}</h3>
      <p className="text-xs text-zinc-500 mt-1">{description}</p>
    </div>
  );
}

function FlowStep({ step, title, description }: { step: number; title: string; description: string }) {
  return (
    <div className="text-center">
      <div className="w-10 h-10 rounded-full bg-green-900/40 border border-green-700/40 flex items-center justify-center text-green-400 font-bold text-lg mx-auto mb-3">
        {step}
      </div>
      <h3 className="font-medium text-zinc-200">{title}</h3>
      <p className="text-xs text-zinc-500 mt-1">{description}</p>
    </div>
  );
}

function ApiEndpoint({ method, path, description }: { method: string; path: string; description: string }) {
  const methodColor = method === "GET" ? "text-blue-400 bg-blue-950/40" : "text-green-400 bg-green-950/40";
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-lg bg-zinc-800/50">
      <span className={cn("px-2 py-0.5 rounded text-xs font-mono font-bold", methodColor)}>
        {method}
      </span>
      <code className="text-sm text-zinc-300 font-mono">{path}</code>
      <span className="text-xs text-zinc-500 ml-auto">{description}</span>
    </div>
  );
}

# Channels

Channels allow external messaging services to send messages **into** Ottomate, automatically creating tasks from incoming messages.

---

## Supported Channels

| Channel | Inbound endpoint |
|---|---|
| Telegram | `POST /api/channels/telegram` |
| Slack | `POST /api/channels/slack` |
| Discord | `POST /api/channels/discord` |
| WhatsApp | `POST /api/whatsapp` |

---

## Channels Page

Navigate to **Channels** (`/computer/channels`) to configure each integration.

---

## Telegram Setup

1. Create a bot: message [@BotFather](https://t.me/BotFather) → `/newbot`
2. Copy the bot token
3. In Channels page: enter your bot token
4. Copy the webhook URL shown: `https://your-domain.com/api/channels/telegram`
5. Register the webhook with Telegram:
   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://your-domain.com/api/channels/telegram"
   ```
6. Send a message to your bot — Ottomate creates a task automatically

**Note:** Telegram webhooks require a **public HTTPS URL**. For local development, use [ngrok](https://ngrok.com) or Cloudflare Tunnel.

---

## Slack Setup

1. [api.slack.com/apps](https://api.slack.com/apps) → Create New App
2. Enable **Event Subscriptions** → set Request URL to `https://your-domain.com/api/channels/slack`
3. Subscribe to bot events: `message.channels`, `app_mention`
4. Install app to workspace
5. In Channels page: enter your Bot User OAuth Token (`xoxb-...`)

When the bot is mentioned or a message is sent to a connected channel, a task is created.

---

## Discord Setup

1. [discord.com/developers/applications](https://discord.com/developers/applications) → New Application → Bot
2. Enable **Message Content Intent** (required to read messages)
3. Copy bot token
4. Invite bot with `send messages` + `read messages` permissions
5. In Channels page: enter bot token + channel ID to watch

---

## WhatsApp Setup

Requires a **Meta Business Account** with WhatsApp Business API enabled.

1. [Meta Business Suite](https://business.facebook.com) → WhatsApp → Get Started
2. Create a permanent system user access token
3. Note your **Phone Number ID**
4. Set verify token (any random string)
5. Register webhook at `https://your-domain.com/api/whatsapp` with your verify token
6. Subscribe to `messages` events
7. Add to `.env.local`:
   ```
   WHATSAPP_PHONE_NUMBER_ID=...
   WHATSAPP_ACCESS_TOKEN=...
   ```

The agent can also **send** WhatsApp messages using the `connector_call` tool with `connector_id: "whatsapp"`.

---

## How Inbound Messages Become Tasks

When a message arrives at any channel endpoint:
1. The message text is extracted
2. A new task is created with the message as the prompt
3. The task source is set to `"webhook"`
4. The agent runs the task
5. The agent's response is (optionally) sent back to the channel as a reply

---

## Webhook Security

All inbound webhook endpoints are in the **public paths** list (no bearer token auth required), but have their own validation:

- **Telegram:** validates `X-Telegram-Bot-Api-Secret-Token` header if `WEBHOOK_SECRET` is set
- **Slack:** validates Slack request signature
- **WhatsApp:** validates the `hub.verify_token` on webhook setup and validates `X-Hub-Signature-256` on incoming messages

For additional security, set `WEBHOOK_SECRET` in `.env.local`.

---

## Sending Messages Outbound

Use the `connector_call` tool or direct connector in a task:

```
"Send a WhatsApp message to +1234567890 with the report summary"
→ connector_call("whatsapp", "send_message", { to: "+1234567890", body: "..." })

"Post to the #alerts Slack channel"
→ connector_call("slack", "post_message", { channel: "#alerts", text: "..." })

"Reply to the Telegram message"
→ connector_call("telegram", "send_message", { chat_id: "...", text: "..." })
```

# Connectors

Ottomate ships with **190+ pre-built connectors** across 28 categories. Navigate to **Connectors** in the sidebar to browse, connect, and manage integrations.

---

## Connecting a Service

- **OAuth connectors:** click **Sign in with [Provider]** — a popup opens the provider's authorization page. After authorization, tokens are stored encrypted in the `connector_configs` SQLite table.
- **API key connectors:** paste your token or key in the modal and click **Connect**.
- **Free** badge = no credit card required for the service itself.

Credentials are stored locally in your SQLite database. They never leave your machine unless the agent explicitly calls the service.

---

## Connector Categories

| Category | Services (examples) |
|---|---|
| **Communication** | Gmail, Outlook, Slack, Discord, Telegram, WhatsApp, Teams, Zoom, Twilio |
| **Storage** | Google Drive, OneDrive, Dropbox, Box, SharePoint |
| **Development** | GitHub, GitLab, Vercel, Sentry, Datadog |
| **Project Management** | Linear, Jira, Confluence, Asana, ClickUp, Monday.com, Trello, Basecamp, Todoist |
| **CRM** | HubSpot, Salesforce, Zendesk, Intercom, Freshdesk, Crisp |
| **Data** | Airtable, Supabase, PostgreSQL, Snowflake, MongoDB, Redis, Firebase |
| **AI — LLMs** | Anthropic, OpenAI, Google AI, Groq, Together, Fireworks, Perplexity, Mistral, Cohere, OpenRouter, DeepSeek |
| **AI — Image** | Replicate, Stability AI, Midjourney, Ideogram, FLUX, Leonardo, Clipdrop, fal.ai, Together Image |
| **AI — Video** | Luma Dream Machine, Runway ML, Kling AI, Pika, Minimax Video, Synthesia, HeyGen, D-ID |
| **AI — Audio** | Suno, Udio, Mubert, ElevenLabs, OpenAI TTS, AssemblyAI, Deepgram, Whisper API, Play.ht, Resemble, Cartesia |
| **AI — Code** | GitHub Copilot, Cursor, Sourcegraph |
| **AI — Design** | Canva, Remove.bg, Photoroom |
| **AI — 3D** | Meshy, Tripo |
| **AI — Search** | Tavily, Serper, Exa |
| **AI — Vector** | Pinecone, Weaviate, Qdrant |
| **Analytics** | Google Analytics, Mixpanel, Amplitude, Plausible, PostHog |
| **Automation** | Zapier, n8n, Make (Integromat), IFTTT |
| **Browser** | Steel, Playwright |
| **Cloud** | AWS, GCP, Cloudflare, DigitalOcean, Railway, Render, Netlify |
| **Ecommerce** | Shopify, Printify, Printful, Gooten, Gelato, Amazon SP, Etsy, eBay, WooCommerce, BigCommerce, Square, Gumroad, LemonSqueezy |
| **Finance** | Stripe, PayPal, Plaid |
| **Marketing** | Mailchimp, Klaviyo, ConvertKit, Beehiiv, Brevo, Resend, SendGrid, Postmark |
| **Music** | Spotify, Suno, Udio, Mubert |
| **Productivity** | Notion, Google Docs/Sheets/Calendar, Figma, Calendly, WordPress, Webflow, Wix |
| **Security** | PagerDuty, OpsGenie |
| **Social Media** | Twitter/X, Reddit, Facebook, YouTube, Instagram, LinkedIn, TikTok, Pinterest, Twitch |
| **Miscellaneous** | OpenWeather, NewsAPI, Wolfram Alpha, Google Maps, GIPHY, Unsplash, Pexels, Yahoo Finance |

---

## OAuth Setup

### Google OAuth
Connects Gmail, Google Calendar, Google Drive, Google Sheets, and Google Docs in one flow.

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com)
2. Enable APIs: Gmail, Calendar, Drive, Sheets, Docs
3. **Credentials → OAuth 2.0 Client ID (Web application)**
4. Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
5. Configure consent screen (add yourself as test user)
6. Add to `.env.local`:
   ```
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-...
   ```

### Microsoft OAuth
Connects Outlook, OneDrive, Teams, and SharePoint.

1. [Azure Portal → App registrations](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade) → New registration
2. Redirect URI: `http://localhost:3000/api/auth/callback/microsoft`
3. API permissions → Microsoft Graph: `Mail.ReadWrite`, `Mail.Send`, `Calendars.ReadWrite`, `Files.ReadWrite`, `offline_access`
4. Certificates & secrets → New client secret
5. Add to `.env.local`:
   ```
   MICROSOFT_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   MICROSOFT_CLIENT_SECRET=your-secret
   ```

### GitHub OAuth
1. [github.com/settings/developers](https://github.com/settings/developers) → OAuth Apps → New OAuth App
2. Callback: `http://localhost:3000/api/auth/callback/github`
3. Add to `.env.local`: `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET`

### Notion OAuth
1. [notion.so/my-integrations](https://www.notion.so/my-integrations) → New integration → enable Public
2. Redirect URI: `http://localhost:3000/api/auth/callback/notion`
3. Add to `.env.local`: `NOTION_CLIENT_ID` + `NOTION_CLIENT_SECRET`

### Dropbox OAuth
1. [dropbox.com/developers/apps](https://www.dropbox.com/developers/apps) → Create app
2. Redirect URI: `http://localhost:3000/api/auth/callback/dropbox`
3. Add to `.env.local`: `DROPBOX_CLIENT_ID` + `DROPBOX_CLIENT_SECRET`

---

## API Key Setup (Selected Services)

### Slack
1. [api.slack.com/apps](https://api.slack.com/apps) → Create New App
2. Bot Token Scopes: `chat:write`, `channels:read`, `channels:history`, `users:read`
3. Install to workspace → copy **Bot User OAuth Token** (`xoxb-...`)

### Discord
1. [discord.com/developers/applications](https://discord.com/developers/applications) → New Application → Bot → Reset Token
2. OAuth2 URL generator: `bot` scope + `Send Messages` permission → invite bot to your server

### Telegram
1. Message [@BotFather](https://t.me/BotFather) → `/newbot`
2. Copy the bot token

### GitHub (Personal Access Token alternative)
[github.com/settings/tokens/new](https://github.com/settings/tokens/new) → scopes `repo`, `user` → paste in connector modal

### Stripe
[dashboard.stripe.com](https://dashboard.stripe.com) → Developers → API keys → Secret key (`sk_test_...` or `sk_live_...`)

### Linear
[linear.app/settings/api](https://linear.app/settings/api) → Create key

### Jira
[id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens) → Create API token → enter as `email:token`

### Airtable
[airtable.com/create/tokens](https://airtable.com/create/tokens) → Create token → scopes `data.records:read`, `data.records:write`

### Supabase
Project Settings → API → copy `service_role` key

### HubSpot
Settings → Integrations → Private Apps → Create → select CRM scopes → copy access token

### ElevenLabs
[elevenlabs.io](https://elevenlabs.io) → Profile → API Key (10k chars/month free)

### Replicate
[replicate.com/account/api-tokens](https://replicate.com/account/api-tokens) → copy token (`r8_...`)

---

## Using Connectors in Tasks

Once connected, the agent can call any connector automatically using the `connector_call` or `execute_connector` tool.

Example prompt:
> "Check my Gmail for emails from @acme.com in the last 7 days and summarize them"

The agent will use `connector_call` with `connector_id: "gmail"` and the appropriate action.

You can also explicitly instruct the agent:
> "Post this summary to the #marketing channel in Slack"

---

## Connector Data Storage

Credentials are stored in the `connector_configs` SQLite table:

| Column | Description |
|---|---|
| `id` | Connector ID (e.g. `"slack"`) |
| `credentials` | JSON blob — API key, OAuth tokens, expiry |
| `metadata` | Any connector-specific config |
| `created_at` / `updated_at` | Timestamps |

OAuth tokens include refresh tokens and are automatically refreshed before expiry.

---

## Free-Tier Connectors (135+)

Over 135 connectors have a completely free tier. Notable ones:

| Service | Free tier |
|---|---|
| Gmail / Google Calendar / Drive / Sheets | Free with Google account |
| Outlook / OneDrive | Free with Microsoft account |
| Slack | Free workspace |
| Discord | Free bot |
| Telegram | Free |
| GitHub | Free public + private repos |
| GitLab | Free on GitLab.com |
| Notion | Free personal plan |
| HubSpot | Free CRM |
| Airtable | Free unlimited bases |
| Supabase | Free 500 MB |
| Vercel | Free Hobby plan |
| ElevenLabs | 10k chars/month |
| Hugging Face | Free (rate limited) |
| Linear | Free personal plan |
| Jira / Asana / ClickUp | Free tiers |
| Stripe | Free test mode |

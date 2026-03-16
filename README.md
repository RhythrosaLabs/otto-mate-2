# Ottomatron — AI Computer

An autonomous AI agent workbench built with Next.js, powered by Claude. Run tasks, manage files, connect to external services, and let the AI do the work.

---

## Table of Contents

1. [What is Ottomatron?](#what-is-ottomatron)
2. [Quick Start](#quick-start)
3. [Environment Variables](#environment-variables)
4. [AI Models & Providers](#ai-models--providers)
5. [Connectors Setup](#connectors-setup)
   - [Free Connectors (no credit card)](#free-connectors)
   - [Communication](#communication-connectors)
   - [Storage](#storage-connectors)
   - [Development](#development-connectors)
   - [Project Management](#project-management-connectors)
   - [CRM](#crm-connectors)
   - [Data](#data-connectors)
   - [Productivity](#productivity-connectors)
   - [AI Services](#ai-service-connectors)
   - [Finance](#finance-connectors)
   - [Marketing](#marketing-connectors)
6. [OAuth Setup (Google, Microsoft, GitHub, Notion, Dropbox)](#oauth-setup)
7. [Architecture](#architecture)
8. [Troubleshooting](#troubleshooting)

---

## What is Ottomatron?

Ottomatron is a self-hosted AI agent that can:

- **Run tasks** — given a natural language goal, the agent plans and executes multi-step workflows
- **Write and run code** — Python, Node.js, and shell scripts are executed in-process with output captured
- **Manage files** — create, read, list, and view files produced by tasks
- **Browse the web** — search and scrape content (with search API keys)
- **Connect to services** — send emails, post Slack messages, create GitHub issues, read spreadsheets, and more
- **Use sub-agents** — spawn specialized agents for parallel work
- **Gallery** — browse AI-generated images and charts produced during tasks

---

## Quick Start

### Prerequisites

- Node.js 18+
- An Anthropic API key (get one at [console.anthropic.com](https://console.anthropic.com))

### Steps

```bash
# 1. Clone and install
git clone <repo-url>
cd perplexity-computer
npm install

# 2. Create .env.local with your API key
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local

# 3. Start the dev server
npm run dev
```

Open [http://localhost:3000/computer](http://localhost:3000/computer) in your browser.

The SQLite database (`perplexity-computer.db`) is created automatically on first launch.

---

## Environment Variables

Copy `.env.local` from the example above and fill in the values you need.

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | **Yes** | Powers Claude (opus/sonnet). Get at [console.anthropic.com](https://console.anthropic.com) |
| `OPENAI_API_KEY` | No | Enables GPT-4o and DALL-E 3 tasks |
| `GOOGLE_GEMINI_API_KEY` | No | Enables Gemini 1.5 Pro tasks |
| `GROQ_API_KEY` | No | Enables Llama/Mixtral via Groq |
| `PERPLEXITY_API_KEY` | No | Real-time web search via Perplexity |
| `BRAVE_SEARCH_API_KEY` | No | Real-time web search via Brave |
| `SERPER_API_KEY` | No | Google search via Serper |
| `TAVILY_API_KEY` | No | AI web search via Tavily |
| `DATABASE_PATH` | No | Path to SQLite DB (default: `./perplexity-computer.db`) |
| `APP_URL` | No | Public URL of your deployment (default: `http://localhost:3000`) |
| `GOOGLE_CLIENT_ID/SECRET` | No | Google OAuth for Gmail/Drive/Sheets/Docs/Calendar |
| `MICROSOFT_CLIENT_ID/SECRET` | No | Microsoft OAuth for Outlook/OneDrive/Teams |
| `GITHUB_CLIENT_ID/SECRET` | No | GitHub OAuth |
| `NOTION_CLIENT_ID/SECRET` | No | Notion OAuth |
| `DROPBOX_CLIENT_ID/SECRET` | No | Dropbox OAuth |

---

## AI Models & Providers

The agent automatically selects the best model for each task:

| Model | Provider | Use case |
|---|---|---|
| `claude-opus-4-6` | Anthropic | Complex multi-step reasoning, sub-agents |
| `claude-sonnet-4-6` | Anthropic | Fast tasks, follow-up messages |
| `gpt-4o` | OpenAI | Coding tasks when OpenAI key is set |
| `gemini-1.5-pro` | Google | Long-context document analysis |
| `llama-3.1-70b` | Groq | Fast inference for simple tasks |

---

## Connectors Setup

Navigate to **Connectors** in the sidebar. Click **Connect** on any connector to open the setup modal.

- **OAuth connectors** show a "Sign in with [Provider]" button — click it and authorize in the popup
- **API key connectors** show a password field — paste your token and click Connect
- **Free** badge means no credit card is needed at all for basic use

---

### Free Connectors

These connectors have a free tier with no credit card required:

| Connector | Auth | Notes |
|---|---|---|
| Gmail + Google Calendar | OAuth | Free with Google account |
| Outlook + Microsoft Calendar | OAuth | Free with Microsoft account |
| Slack | API key | Free workspace available |
| Discord | API key | Free bot creation |
| Telegram | API key | Free via BotFather |
| Google Drive | OAuth | 15 GB free |
| OneDrive | OAuth | 5 GB free |
| Dropbox | OAuth | 2 GB free |
| Box | API key | 10 GB free |
| GitHub | OAuth | Free public + private repos |
| Vercel | API key | Free Hobby plan |
| GitLab | API key | Free on GitLab.com |
| Sentry | API key | Free Developer plan |
| Linear | API key | Free personal plan |
| Jira | API key | Free up to 10 users |
| Asana | API key | Free up to 10 teammates |
| ClickUp | API key | Free Forever plan |
| Monday.com | API key | Free 2 seats |
| Confluence | API key | Free up to 10 users |
| HubSpot | API key | Free CRM |
| Airtable | API key | Free unlimited bases |
| Google Sheets | OAuth | Free with Google account |
| Supabase | API key | Free 500 MB |
| PostgreSQL | Conn. string | Self-hosted or cloud free tier |
| Notion | OAuth | Free personal plan |
| Google Docs | OAuth | Free with Google account |
| Figma | API key | Free Starter plan |
| Calendly | API key | Free Basic plan |
| WordPress.com | API key | Free tier available |
| Webflow | API key | Free plan available |
| Wix | API key | Free plan available |
| Hugging Face | API key | Free tier (rate limited) |
| ElevenLabs | API key | Free 10,000 chars/month |
| Stripe | API key | Free test mode |
| Mailchimp | API key | Free up to 500 contacts |
| Klaviyo | API key | Free up to 500 contacts |

---

### Communication Connectors

#### Gmail + Google Calendar
**Auth:** OAuth (Google) | **Free:** Yes

1. The easiest way: click **Sign in with Google** in the connector modal — this uses your own Google OAuth app credentials
2. To set up your own OAuth app (needed for production):
   - Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
   - Create an **OAuth 2.0 Client ID** (Web application type)
   - Add `http://localhost:3000/api/auth/callback/google` as an Authorized Redirect URI
   - Enable these APIs: Gmail API, Google Calendar API, Google Drive API, Google Sheets API, Google Docs API
   - Copy **Client ID** and **Client Secret** into `.env.local` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
3. Signing in with Google automatically connects Gmail, Google Drive, Google Sheets, and Google Docs simultaneously

#### Outlook + Microsoft Calendar
**Auth:** OAuth (Microsoft) | **Free:** Yes (personal Microsoft account)

1. Click **Sign in with Microsoft** in the connector modal
2. To set up your own OAuth app:
   - Go to [Azure Portal → App registrations](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
   - Click **New registration**, choose **Accounts in any organizational directory and personal Microsoft accounts**
   - Under **Authentication**, add a Web redirect URI: `http://localhost:3000/api/auth/callback/microsoft`
   - Under **Certificates & secrets**, create a new client secret
   - Copy the **Application (client) ID** and secret value into `.env.local`
3. Signing in with Microsoft connects Outlook, OneDrive, and optionally Teams/SharePoint

#### Slack
**Auth:** API key (Bot Token) | **Free:** Yes

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**
2. Under **OAuth & Permissions**, add these Bot Token Scopes: `chat:write`, `channels:read`, `channels:history`
3. Click **Install to Workspace** → copy the **Bot User OAuth Token** (starts with `xoxb-`)
4. Paste the token into the Slack connector modal

#### Discord
**Auth:** API key (Bot Token) | **Free:** Yes

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications) → **New Application**
2. Navigate to **Bot** → click **Add Bot** → under **Token**, click **Reset Token** and copy it
3. Under **OAuth2 → URL Generator**, select `bot` scope + `Send Messages` permission
4. Use the generated URL to invite the bot to your server
5. Paste the token (not the client secret) into the Discord connector modal

#### Telegram
**Auth:** API key (Bot Token) | **Free:** Yes

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot`, follow the prompts to name your bot
3. BotFather gives you a token like `123456789:ABCdef...` — paste this into the Telegram connector modal
4. To send messages, the agent needs the `chat_id` — you can get it by messaging your bot and calling `https://api.telegram.org/bot<token>/getUpdates`

#### Microsoft Teams
**Auth:** OAuth (Microsoft) | **Free:** Requires Microsoft 365

Uses the same Microsoft OAuth app as Outlook. Set up Microsoft OAuth credentials (see above), then click **Sign in with Microsoft** on the Teams connector.

#### Zoom
**Auth:** API key | **Free:** No (requires paid account)

1. Go to the [Zoom Marketplace](https://marketplace.zoom.us/) → **Develop** → **Build App**
2. Choose **Server-to-Server OAuth** type
3. Under scopes, add `meeting:write:admin` and `meeting:read:admin`
4. Generate and copy your OAuth token

#### Twilio
**Auth:** API key | **Free:** No ($15 free trial)

1. Sign up at [twilio.com](https://www.twilio.com/)
2. From the [Console Dashboard](https://console.twilio.com/), copy your **Account SID** and **Auth Token**
3. Paste the Auth Token into the connector modal (the agent uses Account SID from your config)

---

### Storage Connectors

#### Google Drive
**Auth:** OAuth (Google) | **Free:** 15 GB

Same OAuth setup as Gmail — signing in with Google automatically connects Drive.

#### OneDrive
**Auth:** OAuth (Microsoft) | **Free:** 5 GB

Same OAuth setup as Outlook — signing in with Microsoft automatically connects OneDrive.

#### Dropbox
**Auth:** OAuth (Dropbox) | **Free:** 2 GB

1. Go to [dropbox.com/developers/apps](https://www.dropbox.com/developers/apps) → **Create app**
2. Choose **Scoped access**, **Full Dropbox** or **App folder**
3. Under **Settings**, add `http://localhost:3000/api/auth/callback/dropbox` as a Redirect URI
4. Copy **App key** and **App secret** into `.env.local` as `DROPBOX_CLIENT_ID` and `DROPBOX_CLIENT_SECRET`
5. Click **Sign in with Dropbox** in the connector modal

#### Box
**Auth:** API key (Developer Token) | **Free:** 10 GB

1. Go to [app.box.com/developers/console](https://app.box.com/developers/console) → **Create New App**
2. Choose **Custom App** with **OAuth 2.0 with JWT** or **Standard OAuth 2.0**
3. Under **Configuration**, generate a **Developer Token** (valid for 60 min — for production, use the full OAuth flow)
4. Paste the Developer Token into the Box connector modal

---

### Development Connectors

#### GitHub
**Auth:** OAuth or Personal Access Token | **Free:** Yes

**Option A — OAuth (recommended):**
1. Go to [github.com/settings/developers](https://github.com/settings/developers) → **OAuth Apps** → **New OAuth App**
2. Set **Authorization callback URL** to `http://localhost:3000/api/auth/callback/github`
3. Copy **Client ID** and generate a **Client Secret** into `.env.local`
4. Click **Sign in with GitHub** in the connector modal

**Option B — Personal Access Token:**
1. Go to [github.com/settings/tokens/new](https://github.com/settings/tokens/new)
2. Select scopes: `repo`, `user`
3. Click **Generate token** and paste it into the GitHub connector modal

#### Vercel
**Auth:** API key | **Free:** Yes (Hobby plan)

1. Sign in at [vercel.com](https://vercel.com)
2. Go to **Account Settings** → **Tokens** → **Create Token**
3. Paste the token into the Vercel connector modal

#### GitLab
**Auth:** API key | **Free:** Yes

1. Sign in at [gitlab.com](https://gitlab.com)
2. Go to **User Settings** → **Access Tokens** → **Add new token**
3. Select scopes: `api`, `read_repository`, `write_repository`
4. Paste the token into the GitLab connector modal

#### Sentry
**Auth:** API key | **Free:** Yes (Developer plan)

1. Sign in at [sentry.io](https://sentry.io)
2. Go to **Settings** → **Auth Tokens** → **Create New Token**
3. Select scopes: `project:read`, `event:read`, `event:write`
4. Paste the token into the Sentry connector modal

#### Datadog
**Auth:** API key | **Free:** No (14-day trial)

1. Go to [app.datadoghq.com/organization-settings/api-keys](https://app.datadoghq.com/organization-settings/api-keys)
2. Create a new **API Key**
3. Also create an **Application Key** (needed for some endpoints)
4. Paste the API Key into the connector modal

---

### Project Management Connectors

#### Linear
**Auth:** API key | **Free:** Yes (personal)

1. Go to [linear.app/settings/api](https://linear.app/settings/api)
2. Click **Create key**
3. Paste the key into the Linear connector modal

#### Jira
**Auth:** API key | **Free:** Yes (up to 10 users)

1. Go to [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click **Create API token**, copy it
3. In the connector modal, enter: `base64(your.email@example.com:YOUR_TOKEN)` — or just paste your email and token separated by a colon; the agent encodes it automatically
4. Your Jira domain (e.g., `yourcompany.atlassian.net`) is needed for API calls — include it in the token field as `email:token@domain`

#### Asana
**Auth:** API key | **Free:** Yes (up to 10 members)

1. Go to [app.asana.com/0/my-apps](https://app.asana.com/0/my-apps)
2. Click **Create new token**
3. Paste the token into the Asana connector modal

#### ClickUp
**Auth:** API key | **Free:** Yes (Free Forever)

1. Click your avatar → **Settings** → **Apps** → **Generate API Key**
2. Paste the key into the ClickUp connector modal

#### Monday.com
**Auth:** API key | **Free:** Yes (2 seats)

1. Click avatar → **Developers** → **My Access Tokens** → **Show** (or create a new one)
2. Paste the token into the Monday.com connector modal

#### Confluence
**Auth:** API key | **Free:** Yes (up to 10 users)

Uses the same Atlassian API token as Jira.

---

### CRM Connectors

#### HubSpot
**Auth:** API key (Private App Token) | **Free:** Yes

1. In HubSpot, go to **Settings** → **Integrations** → **Private Apps** → **Create a private app**
2. Under **Scopes**, select `crm.objects.contacts.read`, `crm.objects.contacts.write`, `crm.objects.deals.read`
3. Click **Create app** and copy the access token
4. Paste the token into the HubSpot connector modal

#### Salesforce
**Auth:** API key | **Free:** Developer Edition only

1. Sign up for a [Developer Edition org](https://developer.salesforce.com/signup) (free)
2. Go to **Setup** → **Apps** → **App Manager** → **New Connected App**
3. Enable OAuth and add the callback URL
4. Use the generated **Access Token** in the connector modal

#### Zendesk
**Auth:** API key | **Free:** No (requires Zendesk plan)

1. Go to **Admin Center** → **Apps & Integrations** → **APIs** → **Zendesk API**
2. Under **Settings**, enable **Token Access** and click **Add API token**
3. Paste the token into the connector modal (format: `email/token:YOUR_TOKEN` in base64 encoding)

---

### Data Connectors

#### Airtable
**Auth:** API key | **Free:** Yes

1. Go to [airtable.com/create/tokens](https://airtable.com/create/tokens)
2. Click **Create new token**, select scopes `data.records:read`, `data.records:write`, and the bases you want
3. Paste the token into the Airtable connector modal

#### Google Sheets
**Auth:** OAuth (Google) | **Free:** Yes

Same OAuth setup as Gmail. Signing in with Google connects Sheets automatically.

#### Supabase
**Auth:** API key (Service Role Key) | **Free:** Yes (500 MB)

1. Sign up at [supabase.com](https://supabase.com) and create a project
2. Go to **Project Settings** → **API**
3. Copy the **service_role** key (⚠️ keep this secret — it bypasses Row Level Security)
4. Also note your **Project URL**
5. Paste the Service Role key into the connector modal

#### PostgreSQL
**Auth:** Connection string | **Free:** Yes (self-hosted or Neon/Railway/Render free tiers)

1. Get your connection string in the format: `postgresql://username:password@host:5432/dbname`
   - **Neon** (free hosted Postgres): [neon.tech](https://neon.tech) — copy from **Connection Details**
   - **Railway**: copy from **Connect** tab in your database service
   - **Self-hosted**: use `postgresql://postgres:yourpassword@localhost:5432/yourdb`
2. Paste the full connection string into the connector modal

#### Snowflake
**Auth:** Account credentials | **Free:** No (30-day trial)

1. Sign up or log in at [snowflake.com](https://www.snowflake.com/)
2. Note your account identifier (e.g., `xy12345.us-east-1`)
3. In the connector modal, enter: `accountidentifier:username:password`

---

### Productivity Connectors

#### Notion
**Auth:** OAuth or Internal Integration Token | **Free:** Yes

**Option A — OAuth (recommended):**
1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations) → **New integration**
2. Enable the integration, then go back and click **Distribution** → enable **Public integration**
3. Set **Redirect URI** to `http://localhost:3000/api/auth/callback/notion`
4. Copy **OAuth client ID** and **OAuth client secret** → `.env.local`
5. Click **Sign in with Notion** in the connector modal

**Option B — Internal Integration Token:**
1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations) → **New integration**
2. Copy the **Internal Integration Token** (starts with `secret_`)
3. Share each page/database you want the agent to access by clicking **Share** → your integration name
4. Paste the token into the Notion connector modal

#### Google Docs
**Auth:** OAuth (Google) | **Free:** Yes

Automatically connected when you sign in with Google.

#### Figma
**Auth:** API key | **Free:** Yes (Starter plan)

1. In Figma, go to **Account Settings** (avatar → Settings)
2. Scroll to **Personal access tokens** → **Create a new personal access token**
3. Paste the token into the Figma connector modal

#### Calendly
**Auth:** API key | **Free:** Yes (Basic plan)

1. Go to [calendly.com/integrations/api_webhooks](https://calendly.com/integrations/api_webhooks)
2. Click **Generate New Token**
3. Paste the token into the Calendly connector modal

#### WordPress.com
**Auth:** Application Password | **Free:** Yes

1. Log in to [wordpress.com](https://wordpress.com)
2. Go to **Me** → **Security** → **Two-Step Authentication** (must be enabled first)
3. Then go to **Me** → **Application Passwords** → create one
4. Enter your username and the application password in the format `username:apppassword`

#### Webflow
**Auth:** API key (Site API Token) | **Free:** Yes

1. Open your Webflow project → **Project Settings** → **Integrations** → **API Access**
2. Click **Generate API Token**
3. Paste the token into the Webflow connector modal

#### Wix
**Auth:** API key | **Free:** Yes

1. Go to [manage.wix.com/account/api-keys](https://manage.wix.com/account/api-keys)
2. Click **Generate API Key**, name it, and select the permissions
3. Paste the key into the Wix connector modal

---

### AI Service Connectors

#### OpenAI / ChatGPT
**Auth:** API key | **Free:** No ($5 trial for new accounts)

1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Click **Create new secret key**
3. Paste the key (starts with `sk-`) into the connector modal

#### Hugging Face
**Auth:** API key | **Free:** Yes (rate-limited)

1. Sign up at [huggingface.co](https://huggingface.co)
2. Go to [Settings → Access Tokens](https://huggingface.co/settings/tokens)
3. Create a **Read** token (starts with `hf_`)
4. Paste it into the Hugging Face connector modal

#### ElevenLabs
**Auth:** API key | **Free:** Yes (10,000 chars/month)

1. Sign up at [elevenlabs.io](https://elevenlabs.io)
2. Click your avatar → **Profile** → **API Key** → copy it
3. Paste the key into the ElevenLabs connector modal

#### Replicate
**Auth:** API key | **Free:** No (pay per use)

1. Sign up at [replicate.com](https://replicate.com)
2. Go to [Account → API Tokens](https://replicate.com/account/api-tokens)
3. Copy your token (starts with `r8_`)
4. Paste it into the Replicate connector modal

---

### Finance Connectors

#### Stripe
**Auth:** API key | **Free:** Yes (test mode)

1. Sign in at [dashboard.stripe.com](https://dashboard.stripe.com)
2. Go to **Developers** → **API keys**
3. For testing, copy the **Secret key** starting with `sk_test_`
4. For live payments, use the `sk_live_` key
5. Paste the key into the Stripe connector modal

#### Shopify
**Auth:** Admin API Access Token | **Free:** No (requires store)

1. In your Shopify admin, go to **Settings** → **Apps and sales channels** → **Develop apps**
2. Create a new app, configure **Admin API access scopes** (e.g., `read_orders`, `write_products`)
3. Install the app and copy the **Admin API access token**
4. Paste it into the Shopify connector modal

---

### Marketing Connectors

#### Mailchimp
**Auth:** API key | **Free:** Yes (up to 500 contacts)

1. Sign in at [mailchimp.com](https://mailchimp.com)
2. Go to **Account** → **Extras** → **API keys** → **Create A Key**
3. Paste the key into the Mailchimp connector modal
4. Note: Mailchimp API keys include the datacenter (e.g., `abc123-us1`). The agent reads the `us1` suffix for API routing.

#### Klaviyo
**Auth:** API key | **Free:** Yes (up to 500 contacts)

1. Sign in at [klaviyo.com](https://www.klaviyo.com)
2. Go to **Settings** → **API Keys** → **Create Private API Key**
3. Grant Full Access or specific scopes (Profiles, Lists, Campaigns)
4. Paste the key into the Klaviyo connector modal

---

## OAuth Setup

### Setting up Google OAuth

Google OAuth allows sign-in for Gmail, Drive, Sheets, Docs, and Calendar in one click.

1. **Create a project** at [console.cloud.google.com](https://console.cloud.google.com)
2. **Enable APIs**: search for and enable each of these:
   - Gmail API
   - Google Calendar API
   - Google Drive API
   - Google Sheets API
   - Google Docs API
3. **Create OAuth credentials**:
   - Go to **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**
   - Application type: **Web application**
   - Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
   - For production, also add your production URL
4. **Configure consent screen** (APIs & Services → OAuth consent screen):
   - Add the following scopes: Gmail send/read, Calendar, Drive, Sheets, Docs
   - Add your email as a test user
5. **Add to `.env.local`**:
   ```
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-...
   ```

### Setting up Microsoft OAuth

Microsoft OAuth covers Outlook, OneDrive, Teams, and SharePoint.

1. Go to [Azure Portal → App registrations](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. Click **New registration**
   - Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**
   - Redirect URI (Web): `http://localhost:3000/api/auth/callback/microsoft`
3. Under **API permissions** → **Add a permission** → **Microsoft Graph**:
   - Add delegated permissions: `Mail.ReadWrite`, `Mail.Send`, `Calendars.ReadWrite`, `Files.ReadWrite`, `Sites.ReadWrite.All`, `ChannelMessage.Send`, `ChannelMessage.Read.All`, `offline_access`
4. Under **Certificates & secrets** → **New client secret** → copy the value
5. **Add to `.env.local`**:
   ```
   MICROSOFT_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   MICROSOFT_CLIENT_SECRET=your-secret-value
   ```

### Setting up GitHub OAuth

1. Go to **GitHub Settings** → **Developer settings** → **OAuth Apps** → **New OAuth App**
2. Set **Authorization callback URL**: `http://localhost:3000/api/auth/callback/github`
3. Click **Register application**, then **Generate a new client secret**
4. **Add to `.env.local`**:
   ```
   GITHUB_CLIENT_ID=your-client-id
   GITHUB_CLIENT_SECRET=your-client-secret
   ```

### Setting up Notion OAuth

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations) → **New integration**
2. In the **Distribution** section, enable **Public integration**
3. Set **Redirect URI**: `http://localhost:3000/api/auth/callback/notion`
4. Copy the **OAuth client ID** and **OAuth client secret**
5. **Add to `.env.local`**:
   ```
   NOTION_CLIENT_ID=your-client-id
   NOTION_CLIENT_SECRET=your-client-secret
   ```

### Setting up Dropbox OAuth

1. Go to [dropbox.com/developers/apps](https://www.dropbox.com/developers/apps) → **Create app**
2. Choose **Scoped access**, set appropriate access level
3. Under **Settings** → **Redirect URIs**: add `http://localhost:3000/api/auth/callback/dropbox`
4. Copy **App key** and **App secret**
5. **Add to `.env.local`**:
   ```
   DROPBOX_CLIENT_ID=your-app-key
   DROPBOX_CLIENT_SECRET=your-app-secret
   ```

---

## Architecture

```
src/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── oauth/[provider]/   # OAuth redirect initiation
│   │   │   └── callback/[provider]/# OAuth token exchange
│   │   ├── connectors/             # CRUD for connector configs
│   │   ├── tasks/                  # Task CRUD + SSE streaming
│   │   ├── files/                  # Task file listing + serving
│   │   ├── gallery/                # Gallery items
│   │   ├── memory/                 # Memory entries
│   │   └── skills/                 # Skills CRUD
│   └── computer/
│       ├── tasks/                  # Task list + detail pages
│       ├── connectors/             # Connectors page
│       ├── files/                  # Files browser
│       ├── gallery/                # Gallery view
│       ├── memory/                 # Memory view
│       └── skills/                 # Skills manager
├── lib/
│   ├── agent.ts                    # Core AI agent engine
│   ├── db.ts                       # SQLite database layer
│   ├── types.ts                    # Shared TypeScript types
│   ├── connectors-data.ts          # Connector metadata & capabilities
│   └── utils.ts                    # Shared utilities
└── components/
    └── sidebar.tsx                 # App sidebar navigation
```

**Database tables** (`better-sqlite3` / SQLite):
- `tasks` — task records with status, model, messages
- `agent_steps` — individual tool calls and results per task
- `task_files` — files produced by tasks
- `sub_tasks` — spawned sub-agent tasks
- `gallery_items` — generated media items
- `memory_entries` — agent long-term memory
- `skills` — saved reusable skill definitions
- `connector_configs` — connected service credentials (api_key, oauth_token, oauth_refresh_token)

---

## Troubleshooting

### Tasks not running / "model not found" error
The agent requires Claude models. Ensure `ANTHROPIC_API_KEY` is set correctly in `.env.local`.

### OAuth "redirect_uri_mismatch" error
Your OAuth app's registered redirect URI doesn't match. Make sure you added the exact URI (including `http://` and port) in the provider's developer console.

### "GOOGLE_CLIENT_ID not configured" when clicking Sign in with Google
Add `GOOGLE_CLIENT_ID=...` and `GOOGLE_CLIENT_SECRET=...` to `.env.local`. Restart the dev server after editing `.env.local`.

### Google OAuth — "Access blocked: This app's request is invalid"
Your OAuth consent screen isn't configured. Go to [APIs & Services → OAuth consent screen](https://console.cloud.google.com/apis/auth/consent), complete the form, add test users, and try again.

### Code execution fails
- On macOS, the `timeout` command is not available. The app handles this automatically.
- Python code runs with `python3`. Ensure it's installed: `which python3`.
- To install Python packages for use in tasks: `pip3 install <package>`.

### Files not showing in the Files tab
Files are stored in `./task-files/<taskId>/` relative to the project root. Ensure the directory is writable.

### Connector API calls failing
- Double-check the token is correct (no extra spaces or newlines).
- Some tokens expire — regenerate them in the provider's dashboard.
- For OAuth connectors, the token may have expired. Disconnect and re-authorize.

### Database errors
If you see SQLite errors, try deleting `perplexity-computer.db` to reset (you will lose task history). The schema is recreated on startup.

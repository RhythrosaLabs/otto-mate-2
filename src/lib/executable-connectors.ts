// ─── Executable Connectors Engine (n8n-inspired) ──────────────────────────────
// Transforms the 192 static connectors into an executable integration framework
// with standardized interfaces, webhook triggers, and expression resolution.
// Inspired by n8n-io/n8n (180k stars).

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConnectorExecution {
  connector_id: string;
  action: string;
  params: Record<string, unknown>;
  auth: ConnectorAuth;
}

export interface ConnectorAuth {
  type: "api_key" | "oauth" | "bearer" | "basic" | "none";
  credentials: Record<string, string>;
}

export interface ConnectorResult {
  success: boolean;
  data: unknown;
  status_code?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface WebhookTrigger {
  id: string;
  connector_id: string;
  event: string;
  url: string;
  active: boolean;
  pipeline_id?: string;   // Optional: auto-trigger a pipeline
  task_prompt?: string;    // Optional: auto-create a task
}

// ─── n8n-Style Expression Engine ─────────────────────────────────────────────
// Resolves expressions like {{ $node["prev"].data.email }} in parameters.

export function resolveExpressions(
  value: string,
  context: Record<string, unknown>
): string {
  return value.replace(/\{\{\s*(.+?)\s*\}\}/g, (_, expr: string) => {
    try {
      // Support $node["name"].data.field patterns
      const nodeMatch = expr.match(/\$node\["(.+?)"\]\.data\.(.+)/);
      if (nodeMatch) {
        const [, nodeName, fieldPath] = nodeMatch;
        const nodeData = context[`node:${nodeName}`] as Record<string, unknown> | undefined;
        if (nodeData) {
          return getNestedValue(nodeData, fieldPath)?.toString() || "";
        }
      }

      // Support $input.field patterns
      const inputMatch = expr.match(/\$input\.(.+)/);
      if (inputMatch) {
        return getNestedValue(context, inputMatch[1])?.toString() || "";
      }

      // Support $env.VAR patterns
      const envMatch = expr.match(/\$env\.(.+)/);
      if (envMatch) {
        return process.env[envMatch[1]] || "";
      }

      // Direct context lookup
      return getNestedValue(context, expr)?.toString() || "";
    } catch {
      return "";
    }
  });
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (current && typeof current === "object") {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

// ─── Standardized Connector Execution ────────────────────────────────────────
// Each connector follows the n8n pattern: description → execute() → result.
// This wraps the existing connectorCall with structured input/output.

export interface ConnectorNodeType {
  id: string;
  name: string;
  description: string;
  category: string;
  auth_type: "api_key" | "oauth" | "bearer" | "basic" | "none";
  env_key: string;          // e.g. "SLACK_BOT_TOKEN"
  actions: ConnectorAction[];
}

export interface ConnectorAction {
  id: string;
  name: string;
  description: string;
  params: ConnectorParam[];
  output_schema?: Record<string, string>;
}

export interface ConnectorParam {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  required: boolean;
  description: string;
  default?: unknown;
}

// ─── Top Executable Connectors (most-used from the 192) ─────────────────────

export const EXECUTABLE_CONNECTORS: ConnectorNodeType[] = [
  {
    id: "slack",
    name: "Slack",
    description: "Send messages, manage channels, and interact with Slack workspaces",
    category: "communication",
    auth_type: "bearer",
    env_key: "SLACK_BOT_TOKEN",
    actions: [
      {
        id: "send_message",
        name: "Send Message",
        description: "Send a message to a Slack channel",
        params: [
          { name: "channel", type: "string", required: true, description: "Channel ID or name" },
          { name: "text", type: "string", required: true, description: "Message text (supports Slack markdown)" },
          { name: "thread_ts", type: "string", required: false, description: "Thread timestamp for replies" },
        ],
        output_schema: { ts: "string", channel: "string" },
      },
      {
        id: "list_channels",
        name: "List Channels",
        description: "List all channels in the workspace",
        params: [
          { name: "limit", type: "number", required: false, description: "Max channels to return", default: 100 },
        ],
      },
    ],
  },
  {
    id: "github",
    name: "GitHub",
    description: "Manage repositories, issues, pull requests, and actions",
    category: "development",
    auth_type: "bearer",
    env_key: "GITHUB_TOKEN",
    actions: [
      {
        id: "create_issue",
        name: "Create Issue",
        description: "Create a new GitHub issue",
        params: [
          { name: "owner", type: "string", required: true, description: "Repository owner" },
          { name: "repo", type: "string", required: true, description: "Repository name" },
          { name: "title", type: "string", required: true, description: "Issue title" },
          { name: "body", type: "string", required: false, description: "Issue body (markdown)" },
          { name: "labels", type: "array", required: false, description: "Label names" },
        ],
      },
      {
        id: "list_repos",
        name: "List Repositories",
        description: "List repositories for a user or organization",
        params: [
          { name: "owner", type: "string", required: false, description: "User/org (default: authenticated user)" },
        ],
      },
      {
        id: "create_pr",
        name: "Create Pull Request",
        description: "Create a new pull request",
        params: [
          { name: "owner", type: "string", required: true, description: "Repository owner" },
          { name: "repo", type: "string", required: true, description: "Repository name" },
          { name: "title", type: "string", required: true, description: "PR title" },
          { name: "head", type: "string", required: true, description: "Head branch" },
          { name: "base", type: "string", required: true, description: "Base branch" },
          { name: "body", type: "string", required: false, description: "PR description" },
        ],
      },
    ],
  },
  {
    id: "notion",
    name: "Notion",
    description: "Create and manage Notion pages, databases, and blocks",
    category: "productivity",
    auth_type: "bearer",
    env_key: "NOTION_API_KEY",
    actions: [
      {
        id: "create_page",
        name: "Create Page",
        description: "Create a new Notion page",
        params: [
          { name: "parent_id", type: "string", required: true, description: "Parent page or database ID" },
          { name: "title", type: "string", required: true, description: "Page title" },
          { name: "content", type: "string", required: false, description: "Page content (markdown)" },
        ],
      },
      {
        id: "search",
        name: "Search",
        description: "Search across all Notion content",
        params: [
          { name: "query", type: "string", required: true, description: "Search query" },
        ],
      },
    ],
  },
  {
    id: "google_sheets",
    name: "Google Sheets",
    description: "Read and write data to Google Sheets spreadsheets",
    category: "data",
    auth_type: "api_key",
    env_key: "GOOGLE_SHEETS_API_KEY",
    actions: [
      {
        id: "read_sheet",
        name: "Read Sheet",
        description: "Read data from a spreadsheet range",
        params: [
          { name: "spreadsheet_id", type: "string", required: true, description: "Spreadsheet ID" },
          { name: "range", type: "string", required: true, description: "A1 notation range (e.g. 'Sheet1!A1:D10')" },
        ],
      },
      {
        id: "append_rows",
        name: "Append Rows",
        description: "Append rows to a spreadsheet",
        params: [
          { name: "spreadsheet_id", type: "string", required: true, description: "Spreadsheet ID" },
          { name: "range", type: "string", required: true, description: "Target range" },
          { name: "values", type: "array", required: true, description: "2D array of values" },
        ],
      },
    ],
  },
  {
    id: "discord",
    name: "Discord",
    description: "Send messages and manage Discord servers",
    category: "communication",
    auth_type: "bearer",
    env_key: "DISCORD_BOT_TOKEN",
    actions: [
      {
        id: "send_message",
        name: "Send Message",
        description: "Send a message to a Discord channel",
        params: [
          { name: "channel_id", type: "string", required: true, description: "Channel ID" },
          { name: "content", type: "string", required: true, description: "Message content" },
        ],
      },
    ],
  },
  {
    id: "linear",
    name: "Linear",
    description: "Manage issues, projects, and workflows in Linear",
    category: "project_management",
    auth_type: "bearer",
    env_key: "LINEAR_API_KEY",
    actions: [
      {
        id: "create_issue",
        name: "Create Issue",
        description: "Create a new Linear issue",
        params: [
          { name: "title", type: "string", required: true, description: "Issue title" },
          { name: "description", type: "string", required: false, description: "Issue description (markdown)" },
          { name: "team_id", type: "string", required: true, description: "Team ID" },
          { name: "priority", type: "number", required: false, description: "Priority: 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low" },
        ],
      },
    ],
  },
  {
    id: "stripe",
    name: "Stripe",
    description: "Manage payments, customers, and subscriptions",
    category: "finance",
    auth_type: "bearer",
    env_key: "STRIPE_SECRET_KEY",
    actions: [
      {
        id: "list_customers",
        name: "List Customers",
        description: "List Stripe customers",
        params: [
          { name: "limit", type: "number", required: false, description: "Max results", default: 10 },
        ],
      },
      {
        id: "create_payment_link",
        name: "Create Payment Link",
        description: "Create a one-time payment link",
        params: [
          { name: "amount", type: "number", required: true, description: "Amount in cents" },
          { name: "currency", type: "string", required: false, description: "Currency code", default: "usd" },
          { name: "description", type: "string", required: false, description: "Payment description" },
        ],
      },
    ],
  },
  {
    id: "telegram",
    name: "Telegram",
    description: "Send messages and manage Telegram bots",
    category: "communication",
    auth_type: "bearer",
    env_key: "TELEGRAM_BOT_TOKEN",
    actions: [
      {
        id: "send_message",
        name: "Send Message",
        description: "Send a message via Telegram bot",
        params: [
          { name: "chat_id", type: "string", required: true, description: "Chat ID or username" },
          { name: "text", type: "string", required: true, description: "Message text (supports HTML/Markdown)" },
          { name: "parse_mode", type: "string", required: false, description: "Parse mode: HTML or Markdown" },
        ],
      },
    ],
  },
];

// ─── Execute Connector Action ────────────────────────────────────────────────
// Generic executor that routes to the right API based on connector + action.

export async function executeConnectorAction(
  connectorId: string,
  actionId: string,
  params: Record<string, unknown>,
  expressionContext?: Record<string, unknown>
): Promise<ConnectorResult> {
  const connector = EXECUTABLE_CONNECTORS.find(c => c.id === connectorId);
  if (!connector) {
    return { success: false, data: null, error: `Unknown connector: ${connectorId}` };
  }

  const action = connector.actions.find(a => a.id === actionId);
  if (!action) {
    return { success: false, data: null, error: `Unknown action: ${actionId} for connector ${connectorId}` };
  }

  // Resolve expressions in string params
  const resolvedParams: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && expressionContext) {
      resolvedParams[key] = resolveExpressions(value, expressionContext);
    } else {
      resolvedParams[key] = value;
    }
  }

  // Validate required params
  for (const param of action.params) {
    if (param.required && !(param.name in resolvedParams)) {
      return { success: false, data: null, error: `Missing required parameter: ${param.name}` };
    }
  }

  // Get auth credentials
  const apiKey = process.env[connector.env_key];
  if (!apiKey && connector.auth_type !== "none") {
    return { success: false, data: null, error: `${connector.name} not configured. Set ${connector.env_key} in .env.local` };
  }

  try {
    const result = await routeConnectorExecution(connectorId, actionId, resolvedParams, apiKey || "");
    return { success: true, data: result, status_code: 200 };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: `${connector.name} error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Connector Routing ──────────────────────────────────────────────────────

async function routeConnectorExecution(
  connectorId: string,
  actionId: string,
  params: Record<string, unknown>,
  apiKey: string
): Promise<unknown> {
  switch (connectorId) {
    case "slack":
      return executeSlackAction(actionId, params, apiKey);
    case "github":
      return executeGitHubAction(actionId, params, apiKey);
    case "discord":
      return executeDiscordAction(actionId, params, apiKey);
    case "telegram":
      return executeTelegramAction(actionId, params, apiKey);
    case "linear":
      return executeLinearAction(actionId, params, apiKey);
    case "notion":
      return executeNotionAction(actionId, params, apiKey);
    case "stripe":
      return executeStripeAction(actionId, params, apiKey);
    default:
      throw new Error(`No executor implemented for ${connectorId}. Use the generic connector_call tool.`);
  }
}

// ─── Connector Executors ─────────────────────────────────────────────────────

async function executeSlackAction(action: string, params: Record<string, unknown>, token: string): Promise<unknown> {
  const base = "https://slack.com/api";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  switch (action) {
    case "send_message": {
      const res = await fetch(`${base}/chat.postMessage`, {
        method: "POST", headers,
        body: JSON.stringify({ channel: params.channel, text: params.text, thread_ts: params.thread_ts }),
      });
      return res.json();
    }
    case "list_channels": {
      const res = await fetch(`${base}/conversations.list?limit=${params.limit || 100}`, { headers });
      return res.json();
    }
    default: throw new Error(`Unknown Slack action: ${action}`);
  }
}

async function executeGitHubAction(action: string, params: Record<string, unknown>, token: string): Promise<unknown> {
  const base = "https://api.github.com";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "User-Agent": "Ottomate" };

  switch (action) {
    case "create_issue": {
      const res = await fetch(`${base}/repos/${params.owner}/${params.repo}/issues`, {
        method: "POST", headers,
        body: JSON.stringify({ title: params.title, body: params.body, labels: params.labels }),
      });
      return res.json();
    }
    case "list_repos": {
      const owner = params.owner || "user";
      const url = owner === "user" ? `${base}/user/repos` : `${base}/users/${owner}/repos`;
      const res = await fetch(url, { headers });
      return res.json();
    }
    case "create_pr": {
      const res = await fetch(`${base}/repos/${params.owner}/${params.repo}/pulls`, {
        method: "POST", headers,
        body: JSON.stringify({ title: params.title, head: params.head, base: params.base, body: params.body }),
      });
      return res.json();
    }
    default: throw new Error(`Unknown GitHub action: ${action}`);
  }
}

async function executeDiscordAction(action: string, params: Record<string, unknown>, token: string): Promise<unknown> {
  const base = "https://discord.com/api/v10";
  const headers = { Authorization: `Bot ${token}`, "Content-Type": "application/json" };

  switch (action) {
    case "send_message": {
      const res = await fetch(`${base}/channels/${params.channel_id}/messages`, {
        method: "POST", headers,
        body: JSON.stringify({ content: params.content }),
      });
      return res.json();
    }
    default: throw new Error(`Unknown Discord action: ${action}`);
  }
}

async function executeTelegramAction(action: string, params: Record<string, unknown>, token: string): Promise<unknown> {
  const base = `https://api.telegram.org/bot${token}`;

  switch (action) {
    case "send_message": {
      const res = await fetch(`${base}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: params.chat_id, text: params.text, parse_mode: params.parse_mode }),
      });
      return res.json();
    }
    default: throw new Error(`Unknown Telegram action: ${action}`);
  }
}

async function executeLinearAction(action: string, params: Record<string, unknown>, token: string): Promise<unknown> {
  const headers = { Authorization: token, "Content-Type": "application/json" };

  switch (action) {
    case "create_issue": {
      const res = await fetch("https://api.linear.app/graphql", {
        method: "POST", headers,
        body: JSON.stringify({
          query: `mutation { issueCreate(input: { title: "${params.title}", description: "${params.description || ""}", teamId: "${params.team_id}"${params.priority ? `, priority: ${params.priority}` : ""} }) { success issue { id identifier title url } } }`,
        }),
      });
      return res.json();
    }
    default: throw new Error(`Unknown Linear action: ${action}`);
  }
}

async function executeNotionAction(action: string, params: Record<string, unknown>, token: string): Promise<unknown> {
  const base = "https://api.notion.com/v1";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Notion-Version": "2022-06-28" };

  switch (action) {
    case "create_page": {
      const children = params.content ? [{
        object: "block" as const, type: "paragraph" as const,
        paragraph: { rich_text: [{ type: "text" as const, text: { content: String(params.content) } }] },
      }] : [];
      const res = await fetch(`${base}/pages`, {
        method: "POST", headers,
        body: JSON.stringify({
          parent: { page_id: params.parent_id },
          properties: { title: { title: [{ text: { content: String(params.title) } }] } },
          children,
        }),
      });
      return res.json();
    }
    case "search": {
      const res = await fetch(`${base}/search`, {
        method: "POST", headers,
        body: JSON.stringify({ query: params.query }),
      });
      return res.json();
    }
    default: throw new Error(`Unknown Notion action: ${action}`);
  }
}

async function executeStripeAction(action: string, params: Record<string, unknown>, token: string): Promise<unknown> {
  const base = "https://api.stripe.com/v1";
  const headers = { Authorization: `Bearer ${token}` };

  switch (action) {
    case "list_customers": {
      const res = await fetch(`${base}/customers?limit=${params.limit || 10}`, { headers });
      return res.json();
    }
    case "create_payment_link": {
      const formData = new URLSearchParams();
      formData.append("line_items[0][price_data][currency]", String(params.currency || "usd"));
      formData.append("line_items[0][price_data][product_data][name]", String(params.description || "Payment"));
      formData.append("line_items[0][price_data][unit_amount]", String(params.amount));
      formData.append("line_items[0][quantity]", "1");
      const res = await fetch(`${base}/payment_links`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });
      return res.json();
    }
    default: throw new Error(`Unknown Stripe action: ${action}`);
  }
}

// ─── Webhook Trigger Processor ──────────────────────────────────────────────

export function processWebhookPayload(
  trigger: WebhookTrigger,
  payload: unknown
): { should_execute: boolean; prompt?: string; pipeline_id?: string } {
  if (!trigger.active) return { should_execute: false };

  return {
    should_execute: true,
    prompt: trigger.task_prompt
      ? resolveExpressions(trigger.task_prompt, { payload: payload as Record<string, unknown> })
      : `Webhook received from ${trigger.connector_id}: ${JSON.stringify(payload).slice(0, 500)}`,
    pipeline_id: trigger.pipeline_id,
  };
}

// ─── List Available Actions ─────────────────────────────────────────────────

export function listConnectorActions(connectorId?: string): string {
  const connectors = connectorId
    ? EXECUTABLE_CONNECTORS.filter(c => c.id === connectorId)
    : EXECUTABLE_CONNECTORS;

  if (connectors.length === 0) {
    return connectorId ? `No executable connector found: ${connectorId}` : "No executable connectors configured.";
  }

  return connectors.map(c => {
    const configured = process.env[c.env_key] ? "✅" : "❌";
    const actions = c.actions.map(a => {
      const requiredParams = a.params.filter(p => p.required).map(p => p.name);
      return `  - ${a.id}: ${a.name} (${requiredParams.length > 0 ? `requires: ${requiredParams.join(", ")}` : "no required params"})`;
    }).join("\n");
    return `${configured} **${c.name}** (${c.id}) — ${c.description}\n${actions}`;
  }).join("\n\n");
}

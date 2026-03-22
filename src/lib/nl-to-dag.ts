// ─── Natural Language to DAG Pipeline Generation ────────────────────────────
// Converts natural language descriptions into executable pipeline DAGs.
// Inspired by Eko's NL→workflow pattern and n8n's node-based execution.
//
// Example: "Every morning, check HN top stories, summarize the top 5,
//           and post them to Slack #engineering"
// → Generates a 4-node DAG: Schedule → Scrape HN → Summarize → Post to Slack

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PipelineDAG {
  id: string;
  name: string;
  description: string;
  nodes: DAGNode[];
  edges: DAGEdge[];
  trigger?: DAGTrigger;
  variables?: Record<string, string>;
  created_from: "natural_language" | "template" | "manual";
  original_prompt?: string;
}

export interface DAGNode {
  id: string;
  type: "task" | "condition" | "connector" | "transform" | "trigger" | "output";
  label: string;
  config: DAGNodeConfig;
  position: { x: number; y: number };
}

export interface DAGNodeConfig {
  // For task nodes
  prompt?: string;
  model?: string;
  skill?: string;
  max_steps?: number;

  // For connector nodes
  connector_id?: string;
  connector_action?: string;
  connector_params?: Record<string, string>;

  // For condition nodes
  condition?: string;           // Expression to evaluate
  true_branch?: string;         // Node ID for true
  false_branch?: string;        // Node ID for false

  // For transform nodes
  transform?: "extract_json" | "format_text" | "filter" | "aggregate" | "split";
  transform_config?: Record<string, string>;

  // For output nodes
  output_type?: "file" | "message" | "webhook" | "variable";
  output_config?: Record<string, string>;
}

export interface DAGEdge {
  id: string;
  source: string;   // Node ID
  target: string;    // Node ID
  label?: string;
  condition?: string;  // For conditional edges
}

export interface DAGTrigger {
  type: "manual" | "schedule" | "webhook" | "event";
  config: Record<string, string>;
}

// ─── Intent Recognition ─────────────────────────────────────────────────────
// Identifies key patterns in natural language to determine pipeline structure.

interface Intent {
  triggers: TriggerIntent[];
  actions: ActionIntent[];
  conditions: ConditionIntent[];
  outputs: OutputIntent[];
  connectors: ConnectorIntent[];
}

interface TriggerIntent {
  type: "schedule" | "webhook" | "event" | "manual";
  raw: string;
  config: Record<string, string>;
}

interface ActionIntent {
  type: "task" | "transform";
  description: string;
  skill?: string;
  order: number;
}

interface ConditionIntent {
  condition: string;
  true_action: string;
  false_action?: string;
}

interface OutputIntent {
  type: "file" | "message" | "webhook";
  target: string;
  format?: string;
}

interface ConnectorIntent {
  connector_id: string;
  action: string;
  params: Record<string, string>;
}

// ─── Schedule Patterns ──────────────────────────────────────────────────────

const SCHEDULE_PATTERNS: Array<{ pattern: RegExp; cron: string; label: string }> = [
  { pattern: /every\s+morning/i, cron: "0 9 * * *", label: "Every morning at 9am" },
  { pattern: /every\s+evening/i, cron: "0 18 * * *", label: "Every evening at 6pm" },
  { pattern: /every\s+hour/i, cron: "0 * * * *", label: "Every hour" },
  { pattern: /every\s+(\d+)\s+minutes?/i, cron: "*/$1 * * * *", label: "Every $1 minutes" },
  { pattern: /every\s+day\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i, cron: "DYNAMIC", label: "Daily" },
  { pattern: /every\s+monday/i, cron: "0 9 * * 1", label: "Every Monday" },
  { pattern: /every\s+(?:week|weekly)/i, cron: "0 9 * * 1", label: "Every week (Monday)" },
  { pattern: /daily/i, cron: "0 9 * * *", label: "Daily at 9am" },
  { pattern: /hourly/i, cron: "0 * * * *", label: "Hourly" },
  { pattern: /every\s+month/i, cron: "0 9 1 * *", label: "Monthly (1st)" },
];

// ─── Connector Detection ────────────────────────────────────────────────────

const CONNECTOR_PATTERNS: Array<{ pattern: RegExp; connector_id: string; action: string; param_extract: (match: RegExpMatchArray) => Record<string, string> }> = [
  { pattern: /post\s+(?:to\s+)?slack\s+(?:#|channel\s+)?(\S+)/i, connector_id: "slack", action: "send_message", param_extract: (m) => ({ channel: m[1] }) },
  { pattern: /send\s+(?:a\s+)?(?:message\s+)?(?:to\s+)?slack\s+(?:#)?(\S+)/i, connector_id: "slack", action: "send_message", param_extract: (m) => ({ channel: m[1] }) },
  { pattern: /create\s+(?:a\s+)?github\s+issue/i, connector_id: "github", action: "create_issue", param_extract: () => ({}) },
  { pattern: /create\s+(?:a\s+)?notion\s+page/i, connector_id: "notion", action: "create_page", param_extract: () => ({}) },
  { pattern: /send\s+(?:a\s+)?(?:message\s+)?(?:to\s+)?discord\s+(?:#)?(\S+)?/i, connector_id: "discord", action: "send_message", param_extract: (m) => ({ channel_id: m[1] || "" }) },
  { pattern: /send\s+(?:a\s+)?telegram\s+message/i, connector_id: "telegram", action: "send_message", param_extract: () => ({}) },
  { pattern: /(?:add|append)\s+(?:to\s+)?(?:google\s+)?sheet/i, connector_id: "google_sheets", action: "append_rows", param_extract: () => ({}) },
  { pattern: /create\s+(?:a\s+)?linear\s+(?:issue|ticket)/i, connector_id: "linear", action: "create_issue", param_extract: () => ({}) },
  { pattern: /email\s+(?:to\s+)?(\S+@\S+)/i, connector_id: "email", action: "send", param_extract: (m) => ({ to: m[1] }) },
];

// ─── Skill Detection ────────────────────────────────────────────────────────

const SKILL_PATTERNS: Array<{ pattern: RegExp; skill: string }> = [
  { pattern: /summarize|summary|summarise/i, skill: "summarizer" },
  { pattern: /research|investigate|look into|find out about/i, skill: "deep-researcher" },
  { pattern: /write\s+(?:a\s+)?(?:blog|article|post)/i, skill: "blog-writer" },
  { pattern: /analyze\s+(?:data|csv|spreadsheet)/i, skill: "data-analyst" },
  { pattern: /(?:scrape|crawl|extract\s+from)\s+(?:website|web\s+page|url)/i, skill: "web-scraper" },
  { pattern: /translate/i, skill: "translator" },
  { pattern: /code\s+review|review\s+(?:the\s+)?code/i, skill: "code-reviewer" },
  { pattern: /generate\s+(?:an?\s+)?image/i, skill: "image-generator" },
  { pattern: /(?:create|build)\s+(?:a\s+)?(?:website|web\s+app|landing\s+page)/i, skill: "web-developer" },
  { pattern: /(?:monitor|watch|track)\s+(?:price|stock|crypto)/i, skill: "price-monitor" },
];

// ─── Main NL→DAG Conversion ─────────────────────────────────────────────────

export function naturalLanguageToDAG(prompt: string): PipelineDAG {
  const intent = recognizeIntent(prompt);
  const dag = buildDAGFromIntent(intent, prompt);
  layoutDAG(dag);
  return dag;
}

function recognizeIntent(prompt: string): Intent {
  const triggers: TriggerIntent[] = [];
  const actions: ActionIntent[] = [];
  const conditions: ConditionIntent[] = [];
  const outputs: OutputIntent[] = [];
  const connectors: ConnectorIntent[] = [];

  // Detect triggers
  for (const sp of SCHEDULE_PATTERNS) {
    const match = prompt.match(sp.pattern);
    if (match) {
      let cron = sp.cron;
      if (cron === "DYNAMIC") {
        // Parse time from match
        let hour = parseInt(match[1]);
        const minute = match[2] ? parseInt(match[2]) : 0;
        if (match[3]?.toLowerCase() === "pm" && hour < 12) hour += 12;
        if (match[3]?.toLowerCase() === "am" && hour === 12) hour = 0;
        cron = `${minute} ${hour} * * *`;
      } else {
        cron = cron.replace("$1", match[1] || "");
      }
      triggers.push({ type: "schedule", raw: match[0], config: { cron, label: sp.label } });
      break;  // Only one trigger
    }
  }

  if (prompt.match(/when\s+(?:a\s+)?webhook/i)) {
    triggers.push({ type: "webhook", raw: "webhook trigger", config: {} });
  }

  if (triggers.length === 0) {
    triggers.push({ type: "manual", raw: "manual", config: {} });
  }

  // Detect connectors
  for (const cp of CONNECTOR_PATTERNS) {
    const match = prompt.match(cp.pattern);
    if (match) {
      connectors.push({
        connector_id: cp.connector_id,
        action: cp.action,
        params: cp.param_extract(match),
      });
    }
  }

  // Detect conditions
  const condMatch = prompt.match(/if\s+(.+?)\s*,\s*(?:then\s+)?(.+?)(?:\.\s*otherwise\s*,?\s*(.+?))?(?:\.|$)/i);
  if (condMatch) {
    conditions.push({
      condition: condMatch[1],
      true_action: condMatch[2],
      false_action: condMatch[3],
    });
  }

  // Detect actions — split by "then", "and then", commas with action verbs
  const actionPhrases = splitActionPhrases(prompt);
  let order = 0;
  for (const phrase of actionPhrases) {
    // Check if it's a connector (already handled)
    const isConnector = connectors.some(c =>
      phrase.toLowerCase().includes(c.connector_id) ||
      CONNECTOR_PATTERNS.some(cp => cp.pattern.test(phrase))
    );

    if (!isConnector || phrase.match(/summarize|analyze|research|write/i)) {
      // Check if it maps to a skill
      let skill: string | undefined;
      for (const sp of SKILL_PATTERNS) {
        if (sp.pattern.test(phrase)) {
          skill = sp.skill;
          break;
        }
      }

      actions.push({
        type: skill ? "task" : "transform",
        description: phrase.trim(),
        skill,
        order: order++,
      });
    }
  }

  // Detect output
  if (prompt.match(/save\s+(?:to|as)\s+(?:a\s+)?file/i)) {
    outputs.push({ type: "file", target: "output" });
  }

  return { triggers, actions, conditions, outputs, connectors };
}

function splitActionPhrases(prompt: string): string[] {
  // Remove trigger phrases
  let cleaned = prompt;
  for (const sp of SCHEDULE_PATTERNS) {
    cleaned = cleaned.replace(sp.pattern, "");
  }

  // Split on "then", "and then", "after that", numbered steps
  const phrases = cleaned
    .split(/(?:,?\s*(?:then|and then|after that|next|finally|and)\s+)|(?:\d+\.\s*)/i)
    .map(p => p.trim())
    .filter(p => p.length > 5);

  return phrases.length > 0 ? phrases : [cleaned.trim()];
}

function buildDAGFromIntent(intent: Intent, originalPrompt: string): PipelineDAG {
  const nodes: DAGNode[] = [];
  const edges: DAGEdge[] = [];
  let nodeIndex = 0;

  const makeId = () => `node_${nodeIndex++}`;

  // Add trigger node
  const triggerNode: DAGNode = {
    id: makeId(),
    type: "trigger",
    label: intent.triggers[0]?.type === "schedule"
      ? `⏰ ${intent.triggers[0].config.label || "Schedule"}`
      : intent.triggers[0]?.type === "webhook" ? "🔗 Webhook" : "▶️ Manual Start",
    config: {},
    position: { x: 0, y: 0 },
  };
  nodes.push(triggerNode);
  let lastNodeId = triggerNode.id;

  // Add action nodes
  for (const action of intent.actions) {
    const nodeId = makeId();
    nodes.push({
      id: nodeId,
      type: "task",
      label: truncateLabel(action.description),
      config: {
        prompt: action.description,
        skill: action.skill,
        max_steps: action.skill === "deep-researcher" ? 15 : 5,
      },
      position: { x: 0, y: 0 },
    });
    edges.push({ id: `edge_${lastNodeId}_${nodeId}`, source: lastNodeId, target: nodeId });
    lastNodeId = nodeId;
  }

  // Add condition nodes
  for (const cond of intent.conditions) {
    const condId = makeId();
    const trueId = makeId();
    const falseId = cond.false_action ? makeId() : undefined;

    nodes.push({
      id: condId,
      type: "condition",
      label: `❓ ${truncateLabel(cond.condition)}`,
      config: { condition: cond.condition },
      position: { x: 0, y: 0 },
    });

    nodes.push({
      id: trueId,
      type: "task",
      label: truncateLabel(cond.true_action),
      config: { prompt: cond.true_action },
      position: { x: 0, y: 0 },
    });

    edges.push({ id: `edge_${lastNodeId}_${condId}`, source: lastNodeId, target: condId });
    edges.push({ id: `edge_${condId}_${trueId}`, source: condId, target: trueId, label: "Yes", condition: "true" });

    if (falseId && cond.false_action) {
      nodes.push({
        id: falseId,
        type: "task",
        label: truncateLabel(cond.false_action),
        config: { prompt: cond.false_action },
        position: { x: 0, y: 0 },
      });
      edges.push({ id: `edge_${condId}_${falseId}`, source: condId, target: falseId, label: "No", condition: "false" });
    }

    lastNodeId = trueId;
  }

  // Add connector nodes
  for (const conn of intent.connectors) {
    const nodeId = makeId();
    const connectorLabel = `📡 ${conn.connector_id}: ${conn.action}`;
    nodes.push({
      id: nodeId,
      type: "connector",
      label: truncateLabel(connectorLabel),
      config: {
        connector_id: conn.connector_id,
        connector_action: conn.action,
        connector_params: conn.params,
      },
      position: { x: 0, y: 0 },
    });
    edges.push({ id: `edge_${lastNodeId}_${nodeId}`, source: lastNodeId, target: nodeId });
    lastNodeId = nodeId;
  }

  // Add output nodes
  for (const output of intent.outputs) {
    const nodeId = makeId();
    nodes.push({
      id: nodeId,
      type: "output",
      label: `💾 Save to ${output.target}`,
      config: {
        output_type: output.type,
        output_config: { target: output.target },
      },
      position: { x: 0, y: 0 },
    });
    edges.push({ id: `edge_${lastNodeId}_${nodeId}`, source: lastNodeId, target: nodeId });
    lastNodeId = nodeId;
  }

  // Determine trigger
  let trigger: DAGTrigger | undefined;
  if (intent.triggers[0]?.type === "schedule") {
    trigger = { type: "schedule", config: intent.triggers[0].config };
  } else if (intent.triggers[0]?.type === "webhook") {
    trigger = { type: "webhook", config: {} };
  }

  // Generate a name from the prompt
  const name = generatePipelineName(originalPrompt);

  return {
    id: `pipeline_${Date.now()}`,
    name,
    description: originalPrompt,
    nodes,
    edges,
    trigger,
    created_from: "natural_language",
    original_prompt: originalPrompt,
  };
}

// ─── DAG Layout ─────────────────────────────────────────────────────────────
// Assigns x,y positions to nodes for visual display.
// Uses a simple top-down layout with branch detection.

function layoutDAG(dag: PipelineDAG): void {
  const nodeWidth = 280;
  const nodeHeight = 100;
  const gapX = 60;
  const gapY = 40;
  const startX = 100;
  const startY = 60;

  // Build adjacency
  const children = new Map<string, string[]>();
  const parents = new Map<string, string[]>();

  for (const edge of dag.edges) {
    if (!children.has(edge.source)) children.set(edge.source, []);
    children.get(edge.source)!.push(edge.target);
    if (!parents.has(edge.target)) parents.set(edge.target, []);
    parents.get(edge.target)!.push(edge.source);
  }

  // Find root nodes (no parents)
  const roots = dag.nodes.filter(n => !parents.has(n.id) || parents.get(n.id)!.length === 0);

  // BFS to assign levels
  const levels = new Map<string, number>();
  const queue: string[] = roots.map(r => r.id);
  for (const root of roots) {
    levels.set(root.id, 0);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentLevel = levels.get(current) || 0;
    const kids = children.get(current) || [];

    for (const kid of kids) {
      const existing = levels.get(kid);
      if (existing === undefined || existing < currentLevel + 1) {
        levels.set(kid, currentLevel + 1);
        queue.push(kid);
      }
    }
  }

  // Group nodes by level
  const levelGroups = new Map<number, string[]>();
  for (const [nodeId, level] of levels) {
    if (!levelGroups.has(level)) levelGroups.set(level, []);
    levelGroups.get(level)!.push(nodeId);
  }

  // Assign positions
  const nodeMap = new Map(dag.nodes.map(n => [n.id, n]));
  for (const [level, nodeIds] of levelGroups) {
    const totalWidth = nodeIds.length * (nodeWidth + gapX) - gapX;
    const offsetX = startX + (800 - totalWidth) / 2;  // Center horizontally

    nodeIds.forEach((nodeId, idx) => {
      const node = nodeMap.get(nodeId);
      if (node) {
        node.position = {
          x: offsetX + idx * (nodeWidth + gapX),
          y: startY + level * (nodeHeight + gapY),
        };
      }
    });
  }
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function truncateLabel(text: string): string {
  return text.length > 40 ? text.slice(0, 37) + "..." : text;
}

function generatePipelineName(prompt: string): string {
  // Extract key nouns and verbs for a short name
  const words = prompt
    .replace(/every\s+\w+|daily|hourly|weekly|monthly/gi, "")
    .replace(/[^a-zA-Z\s]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 3)
    .slice(0, 4);

  if (words.length === 0) return "Custom Pipeline";
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

// ─── Validate DAG ───────────────────────────────────────────────────────────

export function validateDAG(dag: PipelineDAG): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const nodeIds = new Set(dag.nodes.map(n => n.id));

  // Check edges reference valid nodes
  for (const edge of dag.edges) {
    if (!nodeIds.has(edge.source)) errors.push(`Edge ${edge.id}: source ${edge.source} not found`);
    if (!nodeIds.has(edge.target)) errors.push(`Edge ${edge.id}: target ${edge.target} not found`);
  }

  // Check for cycles (simple DFS)
  const visited = new Set<string>();
  const stack = new Set<string>();
  const adj = new Map<string, string[]>();
  for (const edge of dag.edges) {
    if (!adj.has(edge.source)) adj.set(edge.source, []);
    adj.get(edge.source)!.push(edge.target);
  }

  function hasCycle(node: string): boolean {
    if (stack.has(node)) return true;
    if (visited.has(node)) return false;
    visited.add(node);
    stack.add(node);
    for (const neighbor of adj.get(node) || []) {
      if (hasCycle(neighbor)) return true;
    }
    stack.delete(node);
    return false;
  }

  for (const node of dag.nodes) {
    if (hasCycle(node.id)) {
      errors.push("Pipeline contains a cycle — this would cause infinite execution");
      break;
    }
  }

  // Check for disconnected nodes
  const connected = new Set<string>();
  const bfsQueue = [...dag.nodes.filter(n => n.type === "trigger").map(n => n.id)];
  if (bfsQueue.length === 0 && dag.nodes.length > 0) bfsQueue.push(dag.nodes[0].id);
  while (bfsQueue.length > 0) {
    const current = bfsQueue.shift()!;
    if (connected.has(current)) continue;
    connected.add(current);
    for (const neighbor of adj.get(current) || []) {
      bfsQueue.push(neighbor);
    }
  }
  const disconnected = dag.nodes.filter(n => !connected.has(n.id));
  if (disconnected.length > 0) {
    errors.push(`${disconnected.length} node(s) are not reachable from the trigger`);
  }

  return { valid: errors.length === 0, errors };
}

// ─── Convert DAG to Execution Plan ──────────────────────────────────────────
// Converts the visual DAG into an ordered list of steps for the agent runner.

export interface ExecutionStep {
  node_id: string;
  type: DAGNode["type"];
  config: DAGNodeConfig;
  depends_on: string[];
  label: string;
}

export function dagToExecutionPlan(dag: PipelineDAG): ExecutionStep[] {
  const steps: ExecutionStep[] = [];
  const parents = new Map<string, string[]>();

  for (const edge of dag.edges) {
    if (!parents.has(edge.target)) parents.set(edge.target, []);
    parents.get(edge.target)!.push(edge.source);
  }

  // Topological sort
  const inDegree = new Map<string, number>();
  for (const node of dag.nodes) {
    inDegree.set(node.id, 0);
  }
  for (const edge of dag.edges) {
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
  }

  const queue = dag.nodes.filter(n => (inDegree.get(n.id) || 0) === 0).map(n => n.id);
  const order: string[] = [];
  const adj = new Map<string, string[]>();
  for (const edge of dag.edges) {
    if (!adj.has(edge.source)) adj.set(edge.source, []);
    adj.get(edge.source)!.push(edge.target);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);
    for (const neighbor of adj.get(current) || []) {
      inDegree.set(neighbor, (inDegree.get(neighbor) || 0) - 1);
      if (inDegree.get(neighbor) === 0) queue.push(neighbor);
    }
  }

  const nodeMap = new Map(dag.nodes.map(n => [n.id, n]));
  for (const nodeId of order) {
    const node = nodeMap.get(nodeId);
    if (!node) continue;
    // Skip trigger nodes in execution (they're just the start signal)
    if (node.type === "trigger") continue;

    steps.push({
      node_id: node.id,
      type: node.type,
      config: node.config,
      depends_on: parents.get(node.id) || [],
      label: node.label,
    });
  }

  return steps;
}

// ─── Pipeline Templates from NL ─────────────────────────────────────────────
// Quick-generate common pipeline patterns.

export const NL_PIPELINE_EXAMPLES = [
  {
    prompt: "Every morning, check Hacker News top stories, summarize the top 5, and post them to Slack #engineering",
    description: "Daily HN digest to Slack",
  },
  {
    prompt: "When a webhook is received, analyze the data, create a summary report, and save it as a file",
    description: "Webhook data analysis pipeline",
  },
  {
    prompt: "Every week, research AI news, write a blog post, and create a GitHub issue to review it",
    description: "Weekly AI news → blog pipeline",
  },
  {
    prompt: "Monitor competitor pricing daily, compare with our prices, if any price drops detected send alert to Discord",
    description: "Price monitoring with conditional alert",
  },
  {
    prompt: "Every hour, check support emails, categorize them, and create Linear tickets for urgent ones",
    description: "Support email triage pipeline",
  },
];

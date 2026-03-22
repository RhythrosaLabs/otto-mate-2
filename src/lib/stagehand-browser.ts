// ─── Stagehand-Style Browser Tools ──────────────────────────────────────────
// Upgrades browse_web from basic fetch+cheerio to structured browser interactions
// using three high-level primitives: act, extract, observe.
// Inspired by browserbase/stagehand (15k stars).
//
// Since we can't bundle a full browser runtime in the agent, this module wraps
// the existing Steel/fetch-based browsing with Stagehand-like structured APIs
// that the LLM can call as tool parameters.

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BrowserAction {
  type: "act" | "extract" | "observe";
}

export interface ActAction extends BrowserAction {
  type: "act";
  instruction: string;     // Natural language: "Click the sign in button"
  selector?: string;       // Optional CSS selector hint
  value?: string;          // For fill actions: the value to type
}

export interface ExtractAction extends BrowserAction {
  type: "extract";
  instruction: string;     // What to extract: "Get all product prices"
  schema?: Record<string, string>;  // Expected output shape
}

export interface ObserveAction extends BrowserAction {
  type: "observe";
  instruction?: string;    // What to look for: "Find all clickable buttons"
}

export interface BrowserResult {
  success: boolean;
  data: unknown;
  actions_available?: ObservedAction[];
  error?: string;
  screenshot_url?: string;
}

export interface ObservedAction {
  description: string;
  selector: string;
  tag: string;
  text?: string;
  type: "link" | "button" | "input" | "select" | "textarea" | "other";
}

// ─── HTML Analysis Engine ────────────────────────────────────────────────────
// Analyzes raw HTML to identify interactive elements, extract structured data,
// and suggest available actions — mimicking Stagehand's observe() capability.

export function observePageElements(html: string, instruction?: string): ObservedAction[] {
  const actions: ObservedAction[] = [];

  // Parse links
  const linkRegex = /<a\s[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const text = stripHtmlTags(match[2]).trim();
    if (text && text.length < 200) {
      actions.push({
        description: `Navigate to: ${text}`,
        selector: `a[href="${match[1]}"]`,
        tag: "a",
        text,
        type: "link",
      });
    }
  }

  // Parse buttons
  const buttonRegex = /<button\s[^>]*(?:id=["']([^"']*)["'])?[^>]*>([\s\S]*?)<\/button>/gi;
  while ((match = buttonRegex.exec(html)) !== null) {
    const text = stripHtmlTags(match[2]).trim();
    if (text && text.length < 100) {
      const selector = match[1] ? `button#${match[1]}` : `button:contains("${text.slice(0, 30)}")`;
      actions.push({
        description: `Click button: ${text}`,
        selector,
        tag: "button",
        text,
        type: "button",
      });
    }
  }

  // Parse inputs
  const inputRegex = /<input\s[^>]*(?:type=["'](\w+)["'])?[^>]*(?:name=["']([^"']*)["'])?[^>]*(?:placeholder=["']([^"']*)["'])?[^>]*/gi;
  while ((match = inputRegex.exec(html)) !== null) {
    const inputType = match[1] || "text";
    const name = match[2] || "";
    const placeholder = match[3] || "";
    if (["text", "email", "password", "search", "tel", "url", "number"].includes(inputType)) {
      actions.push({
        description: `Fill ${name || placeholder || inputType} field`,
        selector: name ? `input[name="${name}"]` : `input[type="${inputType}"]`,
        tag: "input",
        text: placeholder,
        type: "input",
      });
    }
  }

  // Parse selects
  const selectRegex = /<select\s[^>]*(?:name=["']([^"']*)["'])?[^>]*>/gi;
  while ((match = selectRegex.exec(html)) !== null) {
    const name = match[1] || "dropdown";
    actions.push({
      description: `Select from ${name}`,
      selector: name ? `select[name="${name}"]` : "select",
      tag: "select",
      type: "select",
    });
  }

  // Parse textareas
  const textareaRegex = /<textarea\s[^>]*(?:name=["']([^"']*)["'])?[^>]*(?:placeholder=["']([^"']*)["'])?[^>]*/gi;
  while ((match = textareaRegex.exec(html)) !== null) {
    const name = match[1] || "textarea";
    const placeholder = match[2] || "";
    actions.push({
      description: `Fill ${name} textarea`,
      selector: name !== "textarea" ? `textarea[name="${name}"]` : "textarea",
      tag: "textarea",
      text: placeholder,
      type: "textarea",
    });
  }

  // Filter by instruction if provided
  if (instruction) {
    const keywords = instruction.toLowerCase().split(/\s+/);
    return actions.filter(a => {
      const text = `${a.description} ${a.text || ""}`.toLowerCase();
      return keywords.some(kw => text.includes(kw));
    }).slice(0, 20);
  }

  return actions.slice(0, 50);  // Cap at 50 to avoid overwhelming context
}

// ─── Structured Data Extraction ──────────────────────────────────────────────
// Extracts structured data from HTML based on natural language instructions.
// This builds extraction prompts that the main agent LLM processes.

export function buildExtractionPrompt(
  html: string,
  instruction: string,
  schema?: Record<string, string>
): string {
  // Clean HTML — remove scripts, styles, nav, footer
  const cleaned = cleanHtmlForExtraction(html);

  // Truncate to avoid token overflow
  const truncated = cleaned.slice(0, 30000);

  let prompt = `<EXTRACTION_TASK>
You are extracting structured data from a web page.

<INSTRUCTION>${instruction}</INSTRUCTION>

<PAGE_CONTENT>
${truncated}
</PAGE_CONTENT>`;

  if (schema) {
    prompt += `\n\n<EXPECTED_OUTPUT_SCHEMA>
${JSON.stringify(schema, null, 2)}
</EXPECTED_OUTPUT_SCHEMA>

Return ONLY a JSON object matching this schema. No explanation.`;
  } else {
    prompt += `\n\nReturn the extracted data as a clean JSON object. No explanation.`;
  }

  prompt += `\n</EXTRACTION_TASK>`;
  return prompt;
}

// ─── Action Instruction Builder ─────────────────────────────────────────────
// Converts natural language act() instructions into structured action plans
// that can be executed via JavaScript or browser automation.

export function buildActionPlan(
  instruction: string,
  observedActions: ObservedAction[]
): { steps: ActionStep[]; confidence: number } {
  const steps: ActionStep[] = [];
  const normalizedInstruction = instruction.toLowerCase();

  // Match instruction to observed actions
  for (const action of observedActions) {
    const actionText = `${action.description} ${action.text || ""}`.toLowerCase();

    // Click matching
    if (
      (normalizedInstruction.includes("click") || normalizedInstruction.includes("press") || normalizedInstruction.includes("select")) &&
      hasWordOverlap(normalizedInstruction, actionText, 2)
    ) {
      steps.push({ type: "click", selector: action.selector, description: action.description });
    }

    // Fill matching
    if (
      (normalizedInstruction.includes("type") || normalizedInstruction.includes("fill") || normalizedInstruction.includes("enter") || normalizedInstruction.includes("search")) &&
      action.type === "input" &&
      hasWordOverlap(normalizedInstruction, actionText, 1)
    ) {
      // Extract the value from instruction
      const valueMatch = instruction.match(/(?:type|fill|enter|search)\s+(?:in\s+)?["']?(.+?)["']?\s*(?:in|into|$)/i);
      steps.push({
        type: "fill",
        selector: action.selector,
        value: valueMatch?.[1] || "",
        description: `Fill ${action.text || action.selector}`,
      });
    }

    // Navigate matching
    if (
      (normalizedInstruction.includes("go to") || normalizedInstruction.includes("navigate") || normalizedInstruction.includes("open") || normalizedInstruction.includes("visit")) &&
      action.type === "link" &&
      hasWordOverlap(normalizedInstruction, actionText, 1)
    ) {
      steps.push({ type: "navigate", selector: action.selector, description: action.description });
    }
  }

  const confidence = steps.length > 0 ? Math.min(steps.length / 3, 1.0) : 0.1;

  // If no matches, add a generic step
  if (steps.length === 0) {
    steps.push({
      type: "instruction",
      description: `No matching elements found. LLM should interpret: ${instruction}`,
    });
  }

  return { steps, confidence };
}

export interface ActionStep {
  type: "click" | "fill" | "navigate" | "scroll" | "wait" | "instruction";
  selector?: string;
  value?: string;
  description: string;
}

// ─── Process Browse Result with Stagehand Semantics ─────────────────────────
// Wraps a standard browse_web result with Stagehand-style structured output.

export function processBrowseResult(
  html: string,
  url: string,
  action: ActAction | ExtractAction | ObserveAction
): BrowserResult {
  switch (action.type) {
    case "observe": {
      const observed = observePageElements(html, action.instruction);
      return {
        success: true,
        data: { url, element_count: observed.length },
        actions_available: observed,
      };
    }

    case "extract": {
      // Return extraction prompt for LLM processing
      const extractionPrompt = buildExtractionPrompt(html, action.instruction, action.schema);
      return {
        success: true,
        data: { url, extraction_prompt: extractionPrompt, instruction: action.instruction },
      };
    }

    case "act": {
      const observed = observePageElements(html);
      const plan = buildActionPlan(action.instruction, observed);
      return {
        success: plan.confidence > 0.1,
        data: {
          url,
          action_plan: plan.steps,
          confidence: plan.confidence,
          message: plan.confidence > 0.5
            ? `Found ${plan.steps.length} matching actions`
            : "Low confidence — may need to use Steel browser session for interactive actions",
        },
        actions_available: observed.slice(0, 10),
      };
    }

    default:
      return { success: false, data: null, error: "Unknown browser action type" };
  }
}

// ─── Format for Agent Context ───────────────────────────────────────────────
// Formats browser results for injection into agent context.

export function formatBrowserResultForAgent(result: BrowserResult): string {
  let output = "";

  if (result.error) {
    return `Browser Error: ${result.error}`;
  }

  if (result.actions_available && result.actions_available.length > 0) {
    output += "\n**Available Page Actions:**\n";
    for (const action of result.actions_available) {
      output += `- [${action.type}] ${action.description}${action.text ? ` ("${action.text}")` : ""}\n`;
      output += `  Selector: \`${action.selector}\`\n`;
    }
  }

  if (result.data && typeof result.data === "object" && "action_plan" in (result.data as Record<string, unknown>)) {
    const data = result.data as { action_plan: ActionStep[]; confidence: number; message: string };
    output += `\n**Action Plan** (confidence: ${(data.confidence * 100).toFixed(0)}%):\n`;
    for (const step of data.action_plan) {
      output += `- ${step.type}: ${step.description}\n`;
    }
    output += `\n${data.message}\n`;
  }

  return output || JSON.stringify(result.data, null, 2);
}

// ─── Utility Functions ───────────────────────────────────────────────────────

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
}

function cleanHtmlForExtraction(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
    .replace(/<!--[\s\S]*?-->/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function hasWordOverlap(a: string, b: string, minOverlap: number): boolean {
  const stopWords = new Set(["the", "a", "an", "in", "on", "at", "to", "for", "of", "and", "or", "is", "it", "this", "that"]);
  const wordsA = new Set(a.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w)));
  const wordsB = new Set(b.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w)));
  let overlap = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) overlap++;
  }
  return overlap >= minOverlap;
}

/**
 * Auto-conversion library for importing skills from external workflow/agent formats.
 * 
 * Supported formats:
 * - ComfyUI workflow JSON
 * - CrewAI agent/task definitions
 * - n8n workflow JSON
 * - OpenClaw skills
 * - LangChain chain/tool definitions
 * - Make (Integromat) scenario JSON
 * - Zapier Zap definitions
 * - Flowise chatflow JSON
 * - Dify workflow JSON
 * - Generic JSON skill
 */

export type ConvertibleFormat =
  | "comfyui"
  | "crewai"
  | "n8n"
  | "openclaw"
  | "langchain"
  | "make"
  | "zapier"
  | "flowise"
  | "dify"
  | "generic";

export interface ConvertedSkill {
  name: string;
  description: string;
  instructions: string;
  category: string;
  triggers?: string[];
  source_format: ConvertibleFormat;
  source_metadata?: Record<string, unknown>;
}

export interface ConversionResult {
  success: boolean;
  skills: ConvertedSkill[];
  format: ConvertibleFormat;
  errors?: string[];
  warnings?: string[];
}

export const FORMAT_INFO: Record<ConvertibleFormat, { label: string; icon: string; description: string; fileTypes: string[] }> = {
  comfyui: {
    label: "ComfyUI",
    icon: "🎨",
    description: "Image/video generation workflows from ComfyUI",
    fileTypes: [".json"],
  },
  crewai: {
    label: "CrewAI",
    icon: "🤖",
    description: "Agent crews, tasks, and tools from CrewAI",
    fileTypes: [".json", ".yaml", ".yml", ".py"],
  },
  n8n: {
    label: "n8n",
    icon: "⚡",
    description: "Automation workflows from n8n",
    fileTypes: [".json"],
  },
  openclaw: {
    label: "OpenClaw",
    icon: "🦀",
    description: "Skills and actions from OpenClaw",
    fileTypes: [".json", ".yaml", ".yml"],
  },
  langchain: {
    label: "LangChain",
    icon: "🦜",
    description: "Chains, agents, and tools from LangChain",
    fileTypes: [".json", ".py"],
  },
  make: {
    label: "Make (Integromat)",
    icon: "🔧",
    description: "Scenarios and modules from Make/Integromat",
    fileTypes: [".json"],
  },
  zapier: {
    label: "Zapier",
    icon: "⚡",
    description: "Zap definitions from Zapier",
    fileTypes: [".json"],
  },
  flowise: {
    label: "Flowise",
    icon: "🌊",
    description: "Chatflow definitions from Flowise",
    fileTypes: [".json"],
  },
  dify: {
    label: "Dify",
    icon: "🔮",
    description: "App and workflow definitions from Dify",
    fileTypes: [".json", ".yaml", ".yml"],
  },
  generic: {
    label: "Generic JSON",
    icon: "📄",
    description: "Any JSON with name/description/instructions fields",
    fileTypes: [".json"],
  },
};

// ─── Auto-detection ─────────────────────────────────────────────

export function detectFormat(data: unknown): ConvertibleFormat {
  if (!data || typeof data !== "object") return "generic";
  const obj = data as Record<string, unknown>;

  // ComfyUI: has nodes array with class_type fields, or a "last_node_id" / "last_link_id"
  if (obj.last_node_id !== undefined || obj.last_link_id !== undefined) return "comfyui";
  if (obj.nodes && Array.isArray(obj.nodes)) {
    const nodes = obj.nodes as Record<string, unknown>[];
    if (nodes.some(n => n.class_type || n.type === "KSampler" || n.type === "CheckpointLoaderSimple")) return "comfyui";
  }
  // ComfyUI API format (numbered keys with class_type)
  const keys = Object.keys(obj);
  if (keys.length > 0 && keys.every(k => /^\d+$/.test(k))) {
    const vals = Object.values(obj) as Record<string, unknown>[];
    if (vals.some(v => v && typeof v === "object" && "class_type" in v)) return "comfyui";
  }

  // n8n: has "nodes" array with "type" fields containing "n8n-nodes-"
  if (obj.nodes && Array.isArray(obj.nodes)) {
    const nodes = obj.nodes as Record<string, unknown>[];
    if (nodes.some(n => typeof n.type === "string" && (n.type as string).includes("n8n-nodes-"))) return "n8n";
  }
  // n8n also has "connections" object and "meta" with "instanceId"
  if (obj.meta && typeof obj.meta === "object" && "instanceId" in (obj.meta as Record<string, unknown>)) return "n8n";

  // CrewAI: has "agents" array or "crew" object with agents/tasks
  if (obj.agents && Array.isArray(obj.agents)) return "crewai";
  if (obj.crew && typeof obj.crew === "object") return "crewai";
  if (obj.role && obj.goal && obj.backstory) return "crewai"; // single agent

  // OpenClaw: has "skills" or "actions" with "skill_type" / "action_type"
  if (obj.skills && Array.isArray(obj.skills)) return "openclaw";
  if (obj.actions && Array.isArray(obj.actions)) return "openclaw";
  if (obj.skill_type || obj.action_type) return "openclaw";

  // LangChain: has "lc" namespace or chain type indicators
  if (obj.lc || obj._type === "llm_chain" || obj._type === "sequential_chain") return "langchain";
  if (obj.chains && Array.isArray(obj.chains)) return "langchain";

  // Make: has "flow" array with "module" items
  if (obj.flow && Array.isArray(obj.flow)) {
    const flow = obj.flow as Record<string, unknown>[];
    if (flow.some(f => f.module)) return "make";
  }
  if (obj.scenarios && Array.isArray(obj.scenarios)) return "make";

  // Zapier: has "steps" with "app" fields
  if (obj.steps && Array.isArray(obj.steps)) {
    const steps = obj.steps as Record<string, unknown>[];
    if (steps.some(s => s.app || s.action_app)) return "zapier";
  }

  // Flowise: has "nodes" with "data.category" or chatflow structure
  if (obj.nodes && Array.isArray(obj.nodes)) {
    const nodes = obj.nodes as Record<string, unknown>[];
    if (nodes.some(n => {
      const data = n.data as Record<string, unknown> | undefined;
      return data && (data.category || data.inputParams);
    })) return "flowise";
  }

  // Dify: has "app" with "mode" or workflow structure with "graph"
  if (obj.app && typeof obj.app === "object" && "mode" in (obj.app as Record<string, unknown>)) return "dify";
  if (obj.graph && typeof obj.graph === "object" && obj.workflow_type) return "dify";

  return "generic";
}

// ─── Converters ─────────────────────────────────────────────────

function convertComfyUI(data: unknown): ConversionResult {
  const obj = data as Record<string, unknown>;
  const warnings: string[] = [];
  
  // Handle both UI format (with nodes array) and API format (numbered keys)
  let nodeList: Record<string, unknown>[] = [];
  
  if (obj.nodes && Array.isArray(obj.nodes)) {
    nodeList = obj.nodes as Record<string, unknown>[];
  } else {
    // API format: numbered keys with class_type
    const keys = Object.keys(obj).filter(k => /^\d+$/.test(k));
    nodeList = keys.map(k => {
      const node = obj[k] as Record<string, unknown>;
      return { ...node, id: k, type: node.class_type };
    });
  }

  if (nodeList.length === 0) {
    return { success: false, skills: [], format: "comfyui", errors: ["No nodes found in ComfyUI workflow"] };
  }

  // Extract key workflow info
  const nodeTypes = nodeList.map(n => (n.class_type || n.type || "Unknown") as string);
  const uniqueTypes = [...new Set(nodeTypes)];
  
  // Determine workflow purpose from node types
  const hasKSampler = uniqueTypes.some(t => t.includes("KSampler"));
  const hasVAE = uniqueTypes.some(t => t.includes("VAE"));
  const hasVideo = uniqueTypes.some(t => t.toLowerCase().includes("video") || t.toLowerCase().includes("animate"));
  const hasUpscale = uniqueTypes.some(t => t.toLowerCase().includes("upscale"));
  const hasControlNet = uniqueTypes.some(t => t.toLowerCase().includes("controlnet"));
  const hasIPAdapter = uniqueTypes.some(t => t.toLowerCase().includes("ipadapter"));
  const hasInpaint = uniqueTypes.some(t => t.toLowerCase().includes("inpaint"));

  let purpose = "image generation";
  if (hasVideo) purpose = "video generation";
  else if (hasUpscale) purpose = "image upscaling";
  else if (hasInpaint) purpose = "image inpainting";
  else if (hasControlNet) purpose = "controlled image generation (ControlNet)";
  else if (hasIPAdapter) purpose = "image-guided generation (IP-Adapter)";

  // Extract prompt text from CLIPTextEncode nodes
  const promptNodes = nodeList.filter(n => 
    (n.class_type || n.type) === "CLIPTextEncode"
  );
  const prompts: string[] = [];
  for (const pn of promptNodes) {
    const inputs = pn.inputs as Record<string, unknown> | undefined;
    if (inputs?.text && typeof inputs.text === "string") {
      prompts.push(inputs.text);
    }
    const widgets = pn.widgets_values as unknown[] | undefined;
    if (widgets && typeof widgets[0] === "string") {
      prompts.push(widgets[0] as string);
    }
  }

  // Extract checkpoint/model info
  const checkpointNodes = nodeList.filter(n => 
    ((n.class_type || n.type) as string || "").includes("CheckpointLoader")
  );
  const models: string[] = [];
  for (const cn of checkpointNodes) {
    const inputs = cn.inputs as Record<string, unknown> | undefined;
    if (inputs?.ckpt_name && typeof inputs.ckpt_name === "string") {
      models.push(inputs.ckpt_name);
    }
    const widgets = cn.widgets_values as unknown[] | undefined;
    if (widgets && typeof widgets[0] === "string") {
      models.push(widgets[0] as string);
    }
  }

  // Build instructions
  const instructions = [
    `## ComfyUI Workflow: ${purpose}`,
    "",
    `This skill was converted from a ComfyUI workflow with ${nodeList.length} nodes.`,
    "",
    `### Pipeline`,
    `Nodes used: ${uniqueTypes.join(", ")}`,
    "",
    models.length > 0 ? `### Models\n${models.join(", ")}` : "",
    "",
    prompts.length > 0 ? `### Example Prompts\n${prompts.map((p, i) => `${i === 0 ? "Positive" : "Negative"}: "${p}"`).join("\n")}` : "",
    "",
    `### Instructions`,
    `When asked to generate ${hasVideo ? "a video" : "an image"} using this workflow:`,
    `1. Use the ComfyUI API to queue this workflow`,
    `2. Set the positive prompt from user input`,
    `3. Keep the negative prompt and other settings as configured`,
    `4. Monitor the queue and return the result`,
    "",
    `### Raw Node Types`,
    uniqueTypes.map(t => `- ${t}`).join("\n"),
  ].filter(Boolean).join("\n");

  const name = obj.title 
    ? String(obj.title) 
    : `ComfyUI ${purpose.charAt(0).toUpperCase() + purpose.slice(1)}`;

  return {
    success: true,
    format: "comfyui",
    warnings,
    skills: [{
      name,
      description: `ComfyUI workflow for ${purpose} with ${nodeList.length} nodes (${models.join(", ") || "custom model"})`,
      instructions,
      category: hasVideo ? "automation" : "custom",
      triggers: hasVideo 
        ? ["video", "animate", "comfyui"] 
        : ["generate image", "comfyui", purpose],
      source_format: "comfyui",
      source_metadata: { node_count: nodeList.length, node_types: uniqueTypes, models, purpose },
    }],
  };
}

function convertCrewAI(data: unknown): ConversionResult {
  const obj = data as Record<string, unknown>;
  const skills: ConvertedSkill[] = [];
  const warnings: string[] = [];

  // Handle crew definition with agents and tasks
  const agents: Record<string, unknown>[] = [];
  const tasks: Record<string, unknown>[] = [];

  if (obj.agents && Array.isArray(obj.agents)) {
    agents.push(...(obj.agents as Record<string, unknown>[]));
  }
  if (obj.tasks && Array.isArray(obj.tasks)) {
    tasks.push(...(obj.tasks as Record<string, unknown>[]));
  }
  if (obj.crew && typeof obj.crew === "object") {
    const crew = obj.crew as Record<string, unknown>;
    if (crew.agents && Array.isArray(crew.agents)) agents.push(...(crew.agents as Record<string, unknown>[]));
    if (crew.tasks && Array.isArray(crew.tasks)) tasks.push(...(crew.tasks as Record<string, unknown>[]));
  }
  // Single agent
  if (obj.role && obj.goal) {
    agents.push(obj);
  }

  // Convert each agent to a skill
  for (const agent of agents) {
    const role = String(agent.role || "Agent");
    const goal = String(agent.goal || "");
    const backstory = String(agent.backstory || "");
    const tools = Array.isArray(agent.tools) ? (agent.tools as string[]) : [];

    const instructions = [
      `## CrewAI Agent: ${role}`,
      "",
      `**Goal:** ${goal}`,
      "",
      backstory ? `**Backstory:** ${backstory}` : "",
      "",
      tools.length > 0 ? `**Tools:** ${tools.join(", ")}` : "",
      "",
      `### Behavior`,
      `Act as a ${role}. ${goal}`,
      backstory ? `\nContext: ${backstory}` : "",
      "",
      agent.verbose ? "Provide detailed step-by-step reasoning." : "",
      agent.allow_delegation ? "You may delegate subtasks to other agents when appropriate." : "",
    ].filter(Boolean).join("\n");

    // Find associated tasks
    const agentTasks = tasks.filter(t => 
      t.agent === role || t.agent_role === role
    );

    const taskInstructions = agentTasks.map(t => {
      const desc = String(t.description || "");
      const expected = String(t.expected_output || "");
      return `\n### Task: ${desc}\nExpected output: ${expected}`;
    }).join("\n");

    skills.push({
      name: role,
      description: goal || `CrewAI agent with role: ${role}`,
      instructions: instructions + (taskInstructions || ""),
      category: inferCategory(role + " " + goal),
      triggers: [role.toLowerCase(), ...(goal.toLowerCase().split(" ").filter(w => w.length > 4).slice(0, 3))],
      source_format: "crewai",
      source_metadata: { role, goal, backstory, tools, task_count: agentTasks.length },
    });
  }

  // If we only got tasks without agents, convert tasks directly
  if (agents.length === 0 && tasks.length > 0) {
    for (const task of tasks) {
      const desc = String(task.description || "Task");
      const expected = String(task.expected_output || "");
      skills.push({
        name: desc.slice(0, 60),
        description: desc,
        instructions: `## CrewAI Task\n\n${desc}\n\n### Expected Output\n${expected}`,
        category: inferCategory(desc),
        triggers: desc.toLowerCase().split(" ").filter(w => w.length > 4).slice(0, 3),
        source_format: "crewai",
        source_metadata: { description: desc, expected_output: expected },
      });
    }
  }

  if (skills.length === 0) {
    return { success: false, skills: [], format: "crewai", errors: ["No agents or tasks found in CrewAI definition"] };
  }

  return { success: true, skills, format: "crewai", warnings };
}

function convertN8n(data: unknown): ConversionResult {
  const obj = data as Record<string, unknown>;
  const warnings: string[] = [];

  const nodes = (obj.nodes || []) as Record<string, unknown>[];
  const connections = obj.connections as Record<string, unknown> | undefined;

  if (nodes.length === 0) {
    return { success: false, skills: [], format: "n8n", errors: ["No nodes found in n8n workflow"] };
  }

  // Extract workflow metadata
  const workflowName = String(obj.name || "n8n Workflow");
  const triggerNodes = nodes.filter(n => {
    const type = String(n.type || "");
    return type.includes("Trigger") || type.includes("webhook") || type.includes("cron") || type.includes("Schedule");
  });
  const actionNodes = nodes.filter(n => {
    const type = String(n.type || "");
    return !type.includes("Trigger") && !type.includes("Sticky");
  });

  // Map node types to readable descriptions
  const nodeDescriptions = actionNodes.map(n => {
    const type = String(n.type || "");
    const name = String(n.name || type);
    const shortType = type.replace("n8n-nodes-base.", "").replace("n8n-nodes-", "");
    return `- **${name}**: ${shortType}`;
  });

  // Determine trigger type
  const triggerType = triggerNodes.length > 0
    ? String((triggerNodes[0] as Record<string, unknown>).type || "manual")
        .replace("n8n-nodes-base.", "")
    : "manual";

  const instructions = [
    `## n8n Workflow: ${workflowName}`,
    "",
    `This skill was converted from an n8n automation workflow with ${nodes.length} nodes.`,
    "",
    `### Trigger`,
    `Activation: ${triggerType}`,
    "",
    `### Workflow Steps`,
    nodeDescriptions.join("\n"),
    "",
    `### Instructions`,
    `When this skill is activated:`,
    ...actionNodes.map((n, i) => {
      const name = String(n.name || n.type || "Step");
      return `${i + 1}. Execute: ${name}`;
    }),
    "",
    `### Connection Flow`,
    connections ? `Nodes are connected in sequence following the n8n workflow graph.` : "Linear execution flow.",
  ].join("\n");

  const nodeTypes = nodes.map(n => String(n.type || "").replace("n8n-nodes-base.", ""));

  return {
    success: true,
    format: "n8n",
    warnings,
    skills: [{
      name: workflowName,
      description: `n8n automation: ${actionNodes.length} steps, triggered by ${triggerType}`,
      instructions,
      category: "automation",
      triggers: [workflowName.toLowerCase(), "automate", "n8n"],
      source_format: "n8n",
      source_metadata: { 
        node_count: nodes.length, 
        trigger_type: triggerType, 
        node_types: nodeTypes,
        workflow_name: workflowName,
      },
    }],
  };
}

function convertOpenClaw(data: unknown): ConversionResult {
  const obj = data as Record<string, unknown>;
  const skills: ConvertedSkill[] = [];
  const warnings: string[] = [];

  // OpenClaw can have "skills", "actions", or a single skill
  const items: Record<string, unknown>[] = [];
  
  if (obj.skills && Array.isArray(obj.skills)) {
    items.push(...(obj.skills as Record<string, unknown>[]));
  } else if (obj.actions && Array.isArray(obj.actions)) {
    items.push(...(obj.actions as Record<string, unknown>[]));
  } else if (obj.skill_type || obj.action_type || obj.name) {
    items.push(obj);
  }

  for (const item of items) {
    const name = String(item.name || item.title || "OpenClaw Skill");
    const description = String(item.description || "");
    const skillType = String(item.skill_type || item.action_type || item.type || "general");
    const config = item.config || item.parameters || {};
    const steps = Array.isArray(item.steps) ? item.steps as Record<string, unknown>[] : [];

    const instructions = [
      `## OpenClaw Skill: ${name}`,
      "",
      `Type: ${skillType}`,
      description ? `\n${description}` : "",
      "",
      steps.length > 0 ? `### Steps\n${steps.map((s, i) => `${i + 1}. ${String(s.action || s.description || s.name || "Step")}`).join("\n")}` : "",
      "",
      typeof config === "object" && Object.keys(config as Record<string, unknown>).length > 0
        ? `### Configuration\n${JSON.stringify(config, null, 2)}`
        : "",
    ].filter(Boolean).join("\n");

    skills.push({
      name,
      description: description || `OpenClaw ${skillType} skill`,
      instructions,
      category: inferCategory(name + " " + description + " " + skillType),
      triggers: [name.toLowerCase(), skillType.toLowerCase()],
      source_format: "openclaw",
      source_metadata: { skill_type: skillType, step_count: steps.length },
    });
  }

  if (skills.length === 0) {
    return { success: false, skills: [], format: "openclaw", errors: ["No skills or actions found in OpenClaw definition"] };
  }

  return { success: true, skills, format: "openclaw", warnings };
}

function convertLangChain(data: unknown): ConversionResult {
  const obj = data as Record<string, unknown>;
  const skills: ConvertedSkill[] = [];
  const warnings: string[] = [];

  // LangChain serialized chain
  if (obj._type) {
    const chainType = String(obj._type);
    const name = String(obj.name || obj.verbose_name || `LangChain ${chainType}`);
    
    const promptTemplate = obj.prompt as Record<string, unknown> | undefined;
    const template = promptTemplate?.template ? String(promptTemplate.template) : "";
    const inputVars = Array.isArray(promptTemplate?.input_variables) 
      ? (promptTemplate.input_variables as string[]) : [];

    const instructions = [
      `## LangChain Chain: ${name}`,
      "",
      `Chain type: ${chainType}`,
      "",
      template ? `### Prompt Template\n\`\`\`\n${template}\n\`\`\`` : "",
      "",
      inputVars.length > 0 ? `### Input Variables\n${inputVars.map(v => `- \`${v}\``).join("\n")}` : "",
      "",
      `### Instructions`,
      `Execute this ${chainType} chain with the user's input.`,
      template ? `Follow the prompt template above, filling in variables from context.` : "",
    ].filter(Boolean).join("\n");

    skills.push({
      name,
      description: `LangChain ${chainType} chain${template ? " with custom prompt" : ""}`,
      instructions,
      category: inferCategory(name + " " + chainType),
      triggers: [name.toLowerCase(), chainType.toLowerCase()],
      source_format: "langchain",
      source_metadata: { chain_type: chainType, input_variables: inputVars },
    });
  }

  // LangChain tools array
  if (obj.tools && Array.isArray(obj.tools)) {
    for (const tool of obj.tools as Record<string, unknown>[]) {
      const toolName = String(tool.name || "LangChain Tool");
      const toolDesc = String(tool.description || "");
      skills.push({
        name: toolName,
        description: toolDesc || `LangChain tool: ${toolName}`,
        instructions: `## LangChain Tool: ${toolName}\n\n${toolDesc}\n\nUse this tool when the user's request matches its purpose.`,
        category: inferCategory(toolName + " " + toolDesc),
        triggers: [toolName.toLowerCase()],
        source_format: "langchain",
        source_metadata: { tool_name: toolName },
      });
    }
  }

  // LangChain chains array
  if (obj.chains && Array.isArray(obj.chains)) {
    for (const chain of obj.chains as Record<string, unknown>[]) {
      const chainName = String(chain.name || chain._type || "Chain");
      skills.push({
        name: chainName,
        description: `LangChain chain: ${chainName}`,
        instructions: `## LangChain Chain: ${chainName}\n\nExecute this chain step.`,
        category: "automation",
        triggers: [chainName.toLowerCase()],
        source_format: "langchain",
        source_metadata: { chain_name: chainName },
      });
    }
  }

  if (skills.length === 0) {
    return { success: false, skills: [], format: "langchain", errors: ["No chains or tools found in LangChain definition"] };
  }

  return { success: true, skills, format: "langchain", warnings };
}

function convertMake(data: unknown): ConversionResult {
  const obj = data as Record<string, unknown>;
  const warnings: string[] = [];

  // Make/Integromat scenario format
  const scenarios = obj.scenarios 
    ? (obj.scenarios as Record<string, unknown>[]) 
    : [obj];

  const skills: ConvertedSkill[] = [];

  for (const scenario of scenarios) {
    const name = String(scenario.name || scenario.title || "Make Scenario");
    const flow = Array.isArray(scenario.flow) ? scenario.flow as Record<string, unknown>[] : [];
    
    const moduleDescriptions = flow.map((m, i) => {
      const module = String(m.module || m.type || "Module");
      const label = String(m.label || m.name || module);
      return `${i + 1}. **${label}** (${module})`;
    });

    const instructions = [
      `## Make Scenario: ${name}`,
      "",
      `This skill was converted from a Make (Integromat) scenario with ${flow.length} modules.`,
      "",
      `### Modules`,
      moduleDescriptions.join("\n"),
      "",
      `### Instructions`,
      `Execute the following automation flow:`,
      ...flow.map((m, i) => `${i + 1}. ${String(m.label || m.name || m.module || "Step")}`),
    ].join("\n");

    skills.push({
      name,
      description: `Make scenario with ${flow.length} modules`,
      instructions,
      category: "automation",
      triggers: [name.toLowerCase(), "make", "integromat"],
      source_format: "make",
      source_metadata: { module_count: flow.length },
    });
  }

  if (skills.length === 0) {
    return { success: false, skills: [], format: "make", errors: ["No scenario found in Make definition"] };
  }

  return { success: true, skills, format: "make", warnings };
}

function convertZapier(data: unknown): ConversionResult {
  const obj = data as Record<string, unknown>;
  const warnings: string[] = [];

  const name = String(obj.name || obj.title || "Zapier Zap");
  const steps = Array.isArray(obj.steps) ? obj.steps as Record<string, unknown>[] : [];

  if (steps.length === 0) {
    return { success: false, skills: [], format: "zapier", errors: ["No steps found in Zapier definition"] };
  }

  const stepDescriptions = steps.map((s, i) => {
    const app = String(s.app || s.action_app || "App");
    const action = String(s.action || s.action_label || "Action");
    return `${i + 1}. **${app}**: ${action}`;
  });

  const instructions = [
    `## Zapier Zap: ${name}`,
    "",
    `This skill was converted from a Zapier Zap with ${steps.length} steps.`,
    "",
    `### Steps`,
    stepDescriptions.join("\n"),
    "",
    `### Instructions`,
    `Execute the following automation:`,
    ...steps.map((s, i) => {
      const app = String(s.app || s.action_app || "App");
      const action = String(s.action || s.action_label || "Action");
      return `${i + 1}. ${app}: ${action}`;
    }),
  ].join("\n");

  const apps = [...new Set(steps.map(s => String(s.app || s.action_app || "")))].filter(Boolean);

  return {
    success: true,
    format: "zapier",
    warnings,
    skills: [{
      name,
      description: `Zapier automation: ${apps.join(" → ")} (${steps.length} steps)`,
      instructions,
      category: "automation",
      triggers: [name.toLowerCase(), "zapier", ...apps.map(a => a.toLowerCase())],
      source_format: "zapier",
      source_metadata: { step_count: steps.length, apps },
    }],
  };
}

function convertFlowise(data: unknown): ConversionResult {
  const obj = data as Record<string, unknown>;
  const warnings: string[] = [];

  const nodes = Array.isArray(obj.nodes) ? obj.nodes as Record<string, unknown>[] : [];
  const edges = Array.isArray(obj.edges) ? obj.edges as Record<string, unknown>[] : [];

  if (nodes.length === 0) {
    return { success: false, skills: [], format: "flowise", errors: ["No nodes found in Flowise chatflow"] };
  }

  const name = String(obj.name || "Flowise Chatflow");

  const nodeDescriptions = nodes.map(n => {
    const data = n.data as Record<string, unknown> | undefined;
    const label = String(data?.label || data?.name || n.id || "Node");
    const category = String(data?.category || "");
    return `- **${label}**${category ? ` (${category})` : ""}`;
  });

  const instructions = [
    `## Flowise Chatflow: ${name}`,
    "",
    `Converted from Flowise with ${nodes.length} nodes and ${edges.length} connections.`,
    "",
    `### Components`,
    nodeDescriptions.join("\n"),
    "",
    `### Instructions`,
    `This chatflow processes user input through a chain of LLM components.`,
    `Follow the defined node connections to produce the final output.`,
  ].join("\n");

  return {
    success: true,
    format: "flowise",
    warnings,
    skills: [{
      name,
      description: `Flowise chatflow with ${nodes.length} components`,
      instructions,
      category: "automation",
      triggers: [name.toLowerCase(), "flowise", "chatflow"],
      source_format: "flowise",
      source_metadata: { node_count: nodes.length, edge_count: edges.length },
    }],
  };
}

function convertDify(data: unknown): ConversionResult {
  const obj = data as Record<string, unknown>;
  const warnings: string[] = [];

  const app = obj.app as Record<string, unknown> | undefined;
  const name = String(app?.name || obj.name || "Dify App");
  const mode = String(app?.mode || obj.mode || obj.workflow_type || "workflow");
  const description = String(app?.description || obj.description || "");

  const graph = obj.graph as Record<string, unknown> | undefined;
  const graphNodes = graph && Array.isArray(graph.nodes) ? graph.nodes as Record<string, unknown>[] : [];

  const nodeDescriptions = graphNodes.map(n => {
    const nodeData = n.data as Record<string, unknown> | undefined;
    const title = String(nodeData?.title || n.title || n.id || "Node");
    const type = String(n.type || nodeData?.type || "");
    return `- **${title}** (${type})`;
  });

  const instructions = [
    `## Dify App: ${name}`,
    "",
    `Mode: ${mode}`,
    description ? `\n${description}` : "",
    "",
    graphNodes.length > 0 ? `### Workflow Nodes\n${nodeDescriptions.join("\n")}` : "",
    "",
    `### Instructions`,
    `Execute this ${mode} application following its defined workflow structure.`,
  ].filter(Boolean).join("\n");

  return {
    success: true,
    format: "dify",
    warnings,
    skills: [{
      name,
      description: description || `Dify ${mode} application`,
      instructions,
      category: inferCategory(name + " " + description + " " + mode),
      triggers: [name.toLowerCase(), "dify", mode.toLowerCase()],
      source_format: "dify",
      source_metadata: { mode, node_count: graphNodes.length },
    }],
  };
}

function convertGeneric(data: unknown): ConversionResult {
  const obj = data as Record<string, unknown>;

  const name = String(obj.name || obj.title || obj.label || "Imported Skill");
  const description = String(obj.description || obj.summary || obj.desc || "");
  const instructions = String(obj.instructions || obj.prompt || obj.system_prompt || obj.content || obj.template || "");
  const category = String(obj.category || obj.type || "custom");

  if (!name && !instructions) {
    return { success: false, skills: [], format: "generic", errors: ["Could not extract skill data from JSON. Expected 'name', 'instructions', or 'prompt' fields."] };
  }

  const triggers = obj.triggers 
    ? (Array.isArray(obj.triggers) ? obj.triggers as string[] : [String(obj.triggers)])
    : undefined;

  return {
    success: true,
    format: "generic",
    skills: [{
      name,
      description: description || `Imported skill: ${name}`,
      instructions: instructions || `## ${name}\n\n${description}`,
      category: inferCategory(category + " " + name),
      triggers,
      source_format: "generic",
    }],
  };
}

// ─── Category Inference ─────────────────────────────────────────

function inferCategory(text: string): string {
  const lower = text.toLowerCase();
  if (/\b(web|scrape|browse|http|api|url|crawl)\b/.test(lower)) return "web";
  if (/\b(code|program|develop|debug|compile|script|python|typescript|javascript)\b/.test(lower)) return "code";
  if (/\b(data|analys|csv|excel|sql|database|chart|graph|statistic)\b/.test(lower)) return "data";
  if (/\b(writ|draft|email|blog|article|content|copy|edit|proofread)\b/.test(lower)) return "writing";
  if (/\b(research|search|find|investigat|report|study)\b/.test(lower)) return "research";
  if (/\b(automat|workflow|trigger|schedul|pipeline|process|deploy|ci|cd)\b/.test(lower)) return "automation";
  return "custom";
}

// ─── Main Converter ─────────────────────────────────────────────

const CONVERTERS: Record<ConvertibleFormat, (data: unknown) => ConversionResult> = {
  comfyui: convertComfyUI,
  crewai: convertCrewAI,
  n8n: convertN8n,
  openclaw: convertOpenClaw,
  langchain: convertLangChain,
  make: convertMake,
  zapier: convertZapier,
  flowise: convertFlowise,
  dify: convertDify,
  generic: convertGeneric,
};

export function convertToSkills(data: unknown, format?: ConvertibleFormat): ConversionResult {
  const detectedFormat = format || detectFormat(data);
  const converter = CONVERTERS[detectedFormat];
  
  try {
    const result = converter(data);
    // Ensure format is set
    result.format = detectedFormat;
    return result;
  } catch (err) {
    return {
      success: false,
      skills: [],
      format: detectedFormat,
      errors: [`Conversion failed: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
}

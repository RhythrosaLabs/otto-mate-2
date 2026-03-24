// Core types matching Perplexity Computer's data model

export type ModelId =
  | "claude-opus-4-6"          // Primary: reasoning, orchestration
  | "claude-sonnet-4-6"        // Fast Claude: balanced tasks
  | "claude-3.5-haiku"         // Ultra-fast Claude: cheapest
  | "gpt-4o"                   // Long-context recall, wide search
  | "gpt-4o-mini"              // Speed: lightweight tasks
  | "gpt-4.1"                  // Latest GPT: strong reasoning
  | "gpt-4.1-mini"             // Fast GPT 4.1
  | "gpt-4.1-nano"             // Ultra-cheap GPT
  | "gemini-1.5-pro"           // Deep research sub-agents
  | "gemini-1.5-flash"         // Fast Gemini
  | "gemini-2.0-flash"         // Latest Gemini Flash
  | "sonar"                    // Perplexity Sonar (search-augmented)
  | "sonar-pro"                // Perplexity Sonar Pro (advanced search)
  | "sonar-reasoning-pro"      // Perplexity Sonar Reasoning Pro
  | "openrouter"               // OpenRouter: access any model
  | "free"                     // Free mode: zero-cost via OpenRouter free models
  | "auto";                    // Auto-select best model per task

export interface ModelConfig {
  id: ModelId;
  name: string;
  provider: "anthropic" | "openai" | "google" | "perplexity" | "openrouter";
  description: string;
  best_for: string[];
  icon: string;
}

// MODEL_CONFIGS is now in models.ts — re-export for backward compatibility
export { MODEL_CONFIGS, FREE_OPENROUTER_MODELS, getModelConfig } from "./models";

export type TaskStatus =
  | "pending"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "waiting_for_input"
  | "queued";

export type TaskPriority = "low" | "medium" | "high" | "critical";

export type TaskSource = "manual" | "scheduled" | "webhook" | "template";

export interface Task {
  id: string;
  title: string;
  prompt: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  model: ModelId;
  source?: TaskSource;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  steps: AgentStep[];
  files: TaskFile[];
  messages: Message[];
  tags?: string[];
  sub_tasks?: SubTask[];
  metadata?: Record<string, unknown>;
  depends_on?: string;
}

export interface MemoryEntry {
  id: string;
  key: string;
  value: string;
  source_task_id?: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface SubTask {
  id: string;
  parent_task_id: string;
  title: string;
  status: TaskStatus;
  agent_type: string;
  result?: string;
  created_at: string;
}

export interface AgentStep {
  id: string;
  task_id: string;
  type:
    | "reasoning"
    | "search"
    | "code_execution"
    | "file_operation"
    | "connector_call"
    | "sub_agent"
    | "output"
    | "error"
    | "waiting";
  title: string;
  content: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_result?: string;
  status: "running" | "completed" | "failed";
  created_at: string;
  duration_ms?: number;
}

export interface Message {
  id: string;
  task_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
}

export type FileSource = "upload" | "chat" | "agent" | "playground" | "dreamscape" | "app-builder" | "gallery" | "api" | "unknown";

export interface TaskFile {
  id: string;
  task_id: string;
  name: string;
  path: string;
  size: number;
  mime_type: string;
  preview_url?: string;
  folder_id?: string;
  source?: FileSource;
  created_at: string;
}

export interface FileFolder {
  id: string;
  name: string;
  parent_id?: string;
  color?: string;
  created_at: string;
  updated_at: string;
}

export type ConnectorAuthType = "api_key" | "oauth" | "free" | "webhook";
export type OAuthProvider = "google" | "microsoft" | "github" | "notion" | "dropbox";

export interface Connector {
  id: string;
  name: string;
  description: string;
  icon_url: string;
  category: ConnectorCategory;
  connected: boolean;
  auth_type: ConnectorAuthType;
  is_free: boolean;
  oauth_provider?: OAuthProvider;
  oauth_scopes?: string;      // space-separated OAuth scopes
  api_key_name?: string;      // env var or field name for the token
  env_key?: string;           // .env.local variable name, e.g. "SLACK_BOT_TOKEN"
  setup_url?: string;         // direct link to create the token/key
  docs_url?: string;
  capabilities: string[];
}

export type ConnectorCategory =
  | "communication"
  | "storage"
  | "project_management"
  | "crm"
  | "development"
  | "ai"
  | "ai_video"
  | "ai_image"
  | "ai_audio"
  | "ai_speech"
  | "ai_llm"
  | "ai_code"
  | "ai_3d"
  | "ai_design"
  | "ai_search"
  | "ai_vector"
  | "data"
  | "productivity"
  | "finance"
  | "marketing"
  | "social_media"
  | "analytics"
  | "automation"
  | "browser"
  | "cloud"
  | "security"
  | "ecommerce"
  | "music";

export type PresetType = "fast-search" | "pro-search" | "deep-research" | "advanced-deep-research" | "custom";

export interface Skill {
  id: string;
  name: string;
  description: string;
  instructions: string;
  category: string;
  triggers?: string[];
  created_at: string;
  updated_at: string;
  is_active: boolean;
  // Preset configuration (Perplexity Agent API-inspired)
  preset_type?: PresetType;
  model?: ModelId;          // preferred model for this skill
  tools?: ToolName[];       // restricted tool set (undefined = all tools)
  max_steps?: number;       // max agentic iterations
  max_tokens?: number;      // output token budget
}

export interface GalleryItem {
  id: string;
  title: string;
  description: string;
  preview_url?: string;
  category: string;
  prompt: string;
  task_id?: string;
  created_at: string;
  is_featured: boolean;
}

// Tool definitions for Claude
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export type ToolName =
  | "web_search"
  | "scrape_url"
  | "browse_web"
  | "read_file"
  | "write_file"
  | "execute_code"
  | "list_files"
  | "connector_call"
  | "create_sub_agent"
  | "request_user_input"
  | "complete_task"
  | "generate_image"
  | "replicate_run"
  | "dream_machine"
  | "send_email"
  | "memory_store"
  | "memory_recall"
  | "memory_list"
  | "memory_delete"
  | "memory_update"
  | "list_skills"
  | "organize_files"
  | "deep_research"
  | "finance_data"
  | "social_media_post"
  | "computer_use"
  | "computer"
  | "bash"
  | "str_replace_based_edit_tool"
  | "execute_connector"
  | "sandbox_execute";

// ─── Token Usage (OpenClaw-inspired) ──────────────────────────────────────────

export interface TokenUsageSummary {
  total_tokens: number;
  estimated_cost_usd: number;
  breakdown: Array<{
    model: string;
    tokens: number;
    cost: number;
  }>;
}

// ─── Scheduled Tasks (OpenClaw Cron-inspired) ─────────────────────────────────

export type ScheduleType = "once" | "interval" | "daily" | "weekly" | "cron";

export interface ScheduledTask {
  id: string;
  name: string;
  prompt: string;
  schedule_type: ScheduleType;
  schedule_expr?: string;
  next_run_at: string;
  last_run_at?: string;
  enabled: boolean;
  model: string;
  delete_after_run: boolean;
  created_at: string;
  updated_at: string;
}

// ScheduledTaskConfig is now just ScheduledTask
export type ScheduledTaskConfig = ScheduledTask;

// ─── Modality-First Selection (Otto-inspired) ─────────────────────────────────

export type Modality = "image" | "code" | "research" | "writing" | "data" | "email" | "general";

// ─── Self-Improvement Loop (Otto-inspired) ────────────────────────────────────

export type LearningOutcome = "success" | "partial_success" | "failure" | "error" | "user_correction";

export interface AgentLearning {
  id: string;
  task_id: string;
  outcome: LearningOutcome;
  tool_name?: string;
  pattern_key: string;
  pattern_data: Record<string, unknown>;
  confidence: number;
  created_at: string;
}

// ─── Proactive Follow-up Suggestions (Otto-inspired) ──────────────────────────

export interface FollowUpSuggestion {
  label: string;
  prompt: string;
  icon: string;
}

// ─── Agent Analytics (Otto-inspired) ──────────────────────────────────────────

export interface AgentAnalyticsEvent {
  id: string;
  event_type: "tool_call" | "model_call" | "task_complete" | "task_error";
  tool_name?: string;
  model?: string;
  duration_ms?: number;
  success: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AnalyticsSummary {
  total_tasks: number;
  success_rate: number;
  avg_duration_ms: number;
  top_tools: Array<{ name: string; count: number; success_rate: number }>;
  model_usage: Array<{ model: string; count: number; avg_cost: number }>;
  recent_errors: Array<{ tool: string; error: string; timestamp: string }>;
  daily_tasks: Array<{ date: string; count: number; successes: number }>;
}

// ─── Health Check ─────────────────────────────────────────────────────────────

export interface HealthInfo {
  providers: Array<{ name: string; configured: boolean }>;
  search: Array<{ name: string; configured: boolean }>;
  db_ok: boolean;
  onboarding_completed: boolean;
}

// ─── Task Templates (OpenClaw/Community-inspired) ─────────────────────────────

export interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  prompt: string;
  category: string;
  icon: string;
  model: string;
  tags: string[];
  is_builtin: boolean;
  use_count: number;
  created_at: string;
  updated_at: string;
}

// ─── Slash Commands (Otto-inspired) ───────────────────────────────────────────

export interface SlashCommand {
  command: string;
  label: string;
  description: string;
  icon: string;
  expand: (args: string) => string;
}

// ─── Audit Trail (OpenClaw Security Model) ────────────────────────────────────

export interface AuditLogEntry {
  id: string;
  event_type: string;
  tool_name?: string;
  model?: string;
  task_id?: string;
  duration_ms?: number;
  success: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ─── Conversation Sessions (OpenClaw Session Model) ───────────────────────────

export interface ConversationSession {
  id: string;
  name: string;
  description?: string;
  task_ids: string[];
  persona_id?: string;
  context_summary?: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Task DAG Pipeline (Otto Task Queue + Node Mode) ──────────────────────────

export interface PipelineNode {
  id: string;
  task_id?: string;
  label: string;
  status: TaskStatus;
  x: number;
  y: number;
  depends_on: string[];
}

export interface Pipeline {
  id: string;
  name: string;
  description?: string;
  nodes: PipelineNode[];
  created_at: string;
  updated_at: string;
}

// ─── Context Window (OpenClaw Smart Context) ──────────────────────────────────

export interface ContextBudget {
  max_tokens: number;
  used_tokens: number;
  system_prompt_tokens: number;
  tools_tokens: number;
  history_tokens: number;
  percentage_used: number;
}

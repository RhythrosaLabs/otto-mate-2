#!/usr/bin/env python3
"""Writes the new Ottomatron agent.ts"""
import os

TARGET = '/Users/sheils/repos/perplexity-computer/src/lib/agent.ts'

CONTENT = r'''/**
 * Ottomatron Agent Engine
 * Multi-model orchestration with advanced tooling
 *
 * Inspired by: Perplexity Computer, CrewAI, OpenAI Swarms,
 * Browser Use, Anthropic Computer Use, AutoGPT
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { v4 as uuidv4 } from "uuid";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";
import type { AgentStep, ToolName, ModelId } from "./types";
import {
  addAgentStep,
  updateAgentStep,
  updateTaskStatus,
  addSubTask,
  updateSubTask,
  addTaskFile,
  addMessage,
  ensureFilesDir,
  addGalleryItem,
  memoryStore,
  memoryRecall,
} from "./db";

const execAsync = promisify(exec);

// ─── Multi-Model Clients ──────────────────────────────────────────────────────

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });
const googleAI = process.env.GOOGLE_AI_API_KEY
  ? new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY)
  : null;

// ─── Tool Definitions ─────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: "web_search",
    description: "Search the web for real-time information. Returns relevant snippets and URLs. Use for current events, facts, research, and up-to-date data.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query" },
        num_results: { type: "number", description: "Number of results (default 5, max 10)", default: 5 },
      },
      required: ["query"],
    },
  },
  {
    name: "scrape_url",
    description: "Fetch and extract content from a specific URL. Returns main text content. Use when you need to read a specific web page, article, or document.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to fetch and scrape" },
        selector: { type: "string", description: "Optional CSS selector to extract specific content" },
      },
      required: ["url"],
    },
  },
  {
    name: "execute_code",
    description: "Execute Python, JavaScript, or Bash code. Use for calculations, data processing, analysis, generating charts/visualizations, and file manipulation.",
    input_schema: {
      type: "object",
      properties: {
        language: { type: "string", enum: ["python", "javascript", "bash"] },
        code: { type: "string", description: "The code to execute" },
        timeout: { type: "number", description: "Timeout in seconds (default 30, max 120)", default: 30 },
      },
      required: ["language", "code"],
    },
  },
  {
    name: "write_file",
    description: "Write content to a file in the task working directory. Creates documents, code, data files, HTML pages, etc.",
    input_schema: {
      type: "object",
      properties: {
        filename: { type: "string", description: "Filename with extension" },
        content: { type: "string", description: "File content" },
        mime_type: { type: "string", description: "MIME type (auto-detected if omitted)" },
      },
      required: ["filename", "content"],
    },
  },
  {
    name: "read_file",
    description: "Read the content of a previously created file in the task working directory.",
    input_schema: {
      type: "object",
      properties: { filename: { type: "string" } },
      required: ["filename"],
    },
  },
  {
    name: "list_files",
    description: "List all files in the task working directory.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "create_sub_agent",
    description: "Create a specialized sub-agent for a parallel or sequential sub-task (CrewAI + OpenAI Swarms inspired). Delegates research, coding, writing, data analysis, web scraping, review, and planning.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Title of the sub-task" },
        agent_type: {
          type: "string",
          enum: ["research", "code", "writing", "data_analysis", "web_scraper", "reviewer", "planner", "general"],
        },
        instructions: { type: "string", description: "Detailed instructions for the sub-agent" },
        context: { type: "string", description: "Relevant context and data" },
        model: {
          type: "string",
          enum: ["claude-opus-4-5", "claude-sonnet-4-5", "gpt-4o", "gpt-4o-mini", "gemini-1.5-pro", "auto"],
          description: "Model for the sub-agent (auto = best for task type)",
        },
      },
      required: ["title", "agent_type", "instructions"],
    },
  },
  {
    name: "connector_call",
    description: "Call a connected external service (Slack, GitHub, Notion, Stripe, Discord, Telegram, Linear, etc.).",
    input_schema: {
      type: "object",
      properties: {
        connector_id: { type: "string", description: "Connector ID (e.g. 'slack', 'github')" },
        action: { type: "string", description: "Action to perform" },
        params: { type: "object", additionalProperties: true },
      },
      required: ["connector_id", "action", "params"],
    },
  },
  {
    name: "memory_store",
    description: "Store information in persistent memory across tasks. Use for user preferences, project details, learnings, and facts that persist across sessions.",
    input_schema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Descriptive key for this memory" },
        value: { type: "string", description: "Information to store" },
        tags: { type: "array", items: { type: "string" }, description: "Tags for categorization" },
      },
      required: ["key", "value"],
    },
  },
  {
    name: "memory_recall",
    description: "Search persistent memory for previously stored information. Use to recall past context, preferences, and learnings from previous tasks.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Max results (default 5)", default: 5 },
      },
      required: ["query"],
    },
  },
  {
    name: "generate_image",
    description: "Generate an image using DALL-E 3. Use for illustrations, diagrams, logos, concept art. Image is saved to task files.",
    input_schema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Detailed image description" },
        size: { type: "string", enum: ["1024x1024", "1792x1024", "1024x1792"], default: "1024x1024" },
        style: { type: "string", enum: ["vivid", "natural"], default: "vivid" },
        filename: { type: "string", description: "Output filename", default: "generated_image.png" },
      },
      required: ["prompt"],
    },
  },
  {
    name: "send_email",
    description: "Send an email via Resend API or connected email service (Gmail/Outlook).",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string" },
        subject: { type: "string" },
        body: { type: "string", description: "Email body (supports HTML)" },
        from: { type: "string", description: "Sender (uses default if omitted)" },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "request_user_input",
    description: "Request input from the user when you need information that cannot be inferred. Pauses the task.",
    input_schema: {
      type: "object",
      properties: {
        question: { type: "string" },
        options: { type: "array", items: { type: "string" } },
        context: { type: "string" },
      },
      required: ["question"],
    },
  },
  {
    name: "complete_task",
    description: "Mark the task as complete with a comprehensive summary. ALWAYS call this when fully done.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        files_created: { type: "array", items: { type: "string" } },
        add_to_gallery: { type: "boolean", default: false },
      },
      required: ["summary"],
    },
  },
];

// ─── OpenAI-format tools ──────────────────────────────────────────────────────

function convertToolsToOpenAIFormat(): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return TOOLS.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema as Record<string, unknown>,
    },
  }));
}

// ─── Agent Run Options ────────────────────────────────────────────────────────

export interface AgentRunOptions {
  taskId: string;
  userMessage: string;
  title?: string;
  skills?: string;
  model?: ModelId;
  onStep?: (step: AgentStep) => void;
  onToken?: (token: string) => void;
  signal?: AbortSignal;
}

// ─── Model Router ─────────────────────────────────────────────────────────────

function selectModelForTask(
  requestedModel: ModelId | undefined,
  taskText: string
): { provider: string; modelName: string } {
  if (!requestedModel || (requestedModel as string) === "auto") {
    const isWriting = /write|draft|essay|blog|email|letter|document|report|article/i.test(taskText);
    if (isWriting && process.env.OPENAI_API_KEY) return { provider: "openai", modelName: "gpt-4o" };
    return { provider: "anthropic", modelName: "claude-opus-4-5" };
  }
  const modelMap: Record<string, { provider: string; modelName: string }> = {
    "claude-opus-4-5": { provider: "anthropic", modelName: "claude-opus-4-5" },
    "claude-sonnet-4-5": { provider: "anthropic", modelName: "claude-sonnet-4-5" },
    "gpt-4o": { provider: "openai", modelName: "gpt-4o" },
    "gpt-4o-mini": { provider: "openai", modelName: "gpt-4o-mini" },
    "gemini-1.5-pro": { provider: "google", modelName: "gemini-1.5-pro" },
    "gemini-1.5-flash": { provider: "google", modelName: "gemini-1.5-flash" },
    "sonar": { provider: "anthropic", modelName: "claude-opus-4-5" },
  };
  return modelMap[requestedModel] || { provider: "anthropic", modelName: "claude-opus-4-5" };
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export async function runAgent(options: AgentRunOptions): Promise<void> {
  const { taskId, userMessage, skills, model, onStep, onToken, signal } = options;
  const filesDir = path.join(ensureFilesDir(), taskId);
  if (!fs.existsSync(filesDir)) fs.mkdirSync(filesDir, { recursive: true });

  addMessage({ id: uuidv4(), task_id: taskId, role: "user", content: userMessage, created_at: new Date().toISOString() });
  updateTaskStatus(taskId, "running");

  const systemPrompt = buildSystemPrompt(skills);
  const { provider, modelName } = selectModelForTask(model, userMessage);

  if (provider === "openai" && process.env.OPENAI_API_KEY) {
    return runWithOpenAI(taskId, userMessage, systemPrompt, modelName, filesDir, onStep, onToken, signal);
  }
  if (provider === "google" && googleAI) {
    return runWithGoogle(taskId, userMessage, systemPrompt, modelName, filesDir, onStep, onToken, signal);
  }
  return runWithAnthropic(taskId, userMessage, systemPrompt, modelName, filesDir, onStep, onToken, signal);
}

// ─── Anthropic Provider ───────────────────────────────────────────────────────

async function runWithAnthropic(
  taskId: string,
  userMessage: string,
  systemPrompt: string,
  modelName: string,
  filesDir: string,
  onStep?: (step: AgentStep) => void,
  onToken?: (token: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userMessage }];
  let continueLoop = true;
  let iterations = 0;

  try {
    while (continueLoop && iterations < 50) {
      if (signal?.aborted) { updateTaskStatus(taskId, "paused"); return; }
      iterations++;

      const thinkingId = uuidv4();
      const thinkingStep: AgentStep = {
        id: thinkingId, task_id: taskId, type: "reasoning",
        title: iterations === 1 ? "Planning approach..." : "Continuing work...",
        content: "", status: "running", created_at: new Date().toISOString(),
      };
      addAgentStep(thinkingStep);
      onStep?.(thinkingStep);
      const startTime = Date.now();

      let fullText = "";
      const stream = anthropic.messages.stream({
        model: modelName, max_tokens: 8192, system: systemPrompt, tools: TOOLS, messages,
      });

      let response: Anthropic.Message;
      try {
        for await (const event of stream) {
          if (signal?.aborted) break;
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            fullText += event.delta.text;
            onToken?.(event.delta.text);
          }
        }
        response = await stream.finalMessage();
      } catch (err) {
        if (signal?.aborted) { updateTaskStatus(taskId, "paused"); return; }
        throw err;
      }

      updateAgentStep(thinkingId, {
        content: fullText || "Processing...", status: "completed",
        duration_ms: Date.now() - startTime,
      });
      messages.push({ role: "assistant", content: response.content });

      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      if (toolUses.length === 0) {
        const text = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");
        if (text) addMessage({ id: uuidv4(), task_id: taskId, role: "assistant", content: text, created_at: new Date().toISOString() });
        continueLoop = false;
        updateTaskStatus(taskId, "completed", new Date().toISOString());
        break;
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUses) {
        const stepId = uuidv4();
        const toolStep: AgentStep = {
          id: stepId, task_id: taskId,
          type: toolUseTypeToStepType(toolUse.name as ToolName),
          title: toolUseToTitle(toolUse.name, toolUse.input as Record<string, unknown>),
          content: JSON.stringify(toolUse.input, null, 2),
          tool_name: toolUse.name,
          tool_input: toolUse.input as Record<string, unknown>,
          status: "running", created_at: new Date().toISOString(),
        };
        addAgentStep(toolStep);
        onStep?.(toolStep);
        const ts = Date.now();
        let result = ""; let toolError = false;
        try {
          result = await executeTool(toolUse.name as ToolName, toolUse.input as Record<string, unknown>, { taskId, filesDir, onStep });
        } catch (err) {
          result = `Error: ${err instanceof Error ? err.message : String(err)}`;
          toolError = true;
        }
        const duration = Date.now() - ts;
        updateAgentStep(stepId, { tool_result: result, status: toolError ? "failed" : "completed", duration_ms: duration });
        onStep?.({ ...toolStep, tool_result: result, status: toolError ? "failed" : "completed", duration_ms: duration });
        toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: result });
        if (toolUse.name === "complete_task") continueLoop = false;
        if (toolUse.name === "request_user_input") { updateTaskStatus(taskId, "waiting_for_input"); continueLoop = false; }
      }
      messages.push({ role: "user", content: toolResults });
      if (response.stop_reason === "end_turn" && toolUses.length === 0) continueLoop = false;
    }
    const { getTask } = await import("./db");
    const t = getTask(taskId);
    if (t?.status === "running") updateTaskStatus(taskId, "completed", new Date().toISOString());
  } catch (err) { handleAgentError(err, taskId, onStep); }
}

// ─── OpenAI Provider ──────────────────────────────────────────────────────────

async function runWithOpenAI(
  taskId: string,
  userMessage: string,
  systemPrompt: string,
  modelName: string,
  filesDir: string,
  onStep?: (step: AgentStep) => void,
  onToken?: (token: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];
  const tools = convertToolsToOpenAIFormat();
  let continueLoop = true; let iterations = 0;

  try {
    while (continueLoop && iterations < 50) {
      if (signal?.aborted) { updateTaskStatus(taskId, "paused"); return; }
      iterations++;
      const thinkingId = uuidv4();
      addAgentStep({
        id: thinkingId, task_id: taskId, type: "reasoning",
        title: iterations === 1 ? `Planning with ${modelName}...` : "Continuing work...",
        content: "", status: "running", created_at: new Date().toISOString(),
      });
      const startTime = Date.now(); let fullText = "";
      const stream = await openai.chat.completions.create({
        model: modelName, max_tokens: 8192, messages, tools, stream: true,
      });
      type PartialTC = { id: string; name: string; arguments: string };
      const tcMap: Record<number, PartialTC> = {};
      for await (const chunk of stream) {
        if (signal?.aborted) break;
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) { fullText += delta.content; onToken?.(delta.content); }
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (tc.index !== undefined) {
              if (!tcMap[tc.index]) tcMap[tc.index] = { id: "", name: "", arguments: "" };
              if (tc.id) tcMap[tc.index].id = tc.id;
              if (tc.function?.name) tcMap[tc.index].name = tc.function.name;
              if (tc.function?.arguments) tcMap[tc.index].arguments += tc.function.arguments;
            }
          }
        }
      }
      const toolCalls = Object.values(tcMap);
      updateAgentStep(thinkingId, { content: fullText || "Processing...", status: "completed", duration_ms: Date.now() - startTime });
      const assistantMsg: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam = {
        role: "assistant", content: fullText || null,
      };
      if (toolCalls.length > 0) {
        assistantMsg.tool_calls = toolCalls.map((tc) => ({
          id: tc.id, type: "function" as const, function: { name: tc.name, arguments: tc.arguments },
        }));
      }
      messages.push(assistantMsg);
      if (toolCalls.length === 0) {
        if (fullText) addMessage({ id: uuidv4(), task_id: taskId, role: "assistant", content: fullText, created_at: new Date().toISOString() });
        continueLoop = false; updateTaskStatus(taskId, "completed", new Date().toISOString()); break;
      }
      for (const tc of toolCalls) {
        let input: Record<string, unknown> = {};
        try { input = JSON.parse(tc.arguments); } catch { /* empty */ }
        const stepId = uuidv4();
        const toolStep: AgentStep = {
          id: stepId, task_id: taskId, type: toolUseTypeToStepType(tc.name as ToolName),
          title: toolUseToTitle(tc.name, input), content: JSON.stringify(input, null, 2),
          tool_name: tc.name, tool_input: input, status: "running", created_at: new Date().toISOString(),
        };
        addAgentStep(toolStep); onStep?.(toolStep);
        const ts = Date.now(); let result = ""; let toolError = false;
        try { result = await executeTool(tc.name as ToolName, input, { taskId, filesDir, onStep }); }
        catch (err) { result = `Error: ${err instanceof Error ? err.message : String(err)}`; toolError = true; }
        const duration = Date.now() - ts;
        updateAgentStep(stepId, { tool_result: result, status: toolError ? "failed" : "completed", duration_ms: duration });
        onStep?.({ ...toolStep, tool_result: result, status: toolError ? "failed" : "completed", duration_ms: duration });
        messages.push({ role: "tool", tool_call_id: tc.id, content: result });
        if (tc.name === "complete_task") continueLoop = false;
        if (tc.name === "request_user_input") { updateTaskStatus(taskId, "waiting_for_input"); continueLoop = false; }
      }
    }
    const { getTask } = await import("./db");
    const t = getTask(taskId);
    if (t?.status === "running") updateTaskStatus(taskId, "completed", new Date().toISOString());
  } catch (err) { handleAgentError(err, taskId, onStep); }
}

// ─── Google Provider ──────────────────────────────────────────────────────────

async function runWithGoogle(
  taskId: string,
  userMessage: string,
  systemPrompt: string,
  modelName: string,
  filesDir: string,
  onStep?: (step: AgentStep) => void,
  onToken?: (token: string) => void,
  signal?: AbortSignal
): Promise<void> {
  if (!googleAI) return runWithAnthropic(taskId, userMessage, systemPrompt, "claude-opus-4-5", filesDir, onStep, onToken, signal);
  const gmodel = googleAI.getGenerativeModel({ model: modelName, systemInstruction: systemPrompt });
  const googleTools = [{
    functionDeclarations: TOOLS.map((t) => ({
      name: t.name, description: t.description, parameters: t.input_schema,
    })),
  }];
  const chat = gmodel.startChat({ tools: googleTools as never });
  let continueLoop = true; let iterations = 0; let currentMessage = userMessage;
  try {
    while (continueLoop && iterations < 50) {
      if (signal?.aborted) { updateTaskStatus(taskId, "paused"); return; }
      iterations++;
      const thinkingId = uuidv4();
      addAgentStep({ id: thinkingId, task_id: taskId, type: "reasoning", title: iterations === 1 ? `Planning with ${modelName}...` : "Continuing...", content: "", status: "running", created_at: new Date().toISOString() });
      const startTime = Date.now();
      const result = await chat.sendMessage(currentMessage);
      const response = result.response;
      const text = response.text();
      if (text) onToken?.(text);
      updateAgentStep(thinkingId, { content: text || "Processing...", status: "completed", duration_ms: Date.now() - startTime });
      const functionCalls = response.functionCalls();
      if (!functionCalls || functionCalls.length === 0) {
        if (text) addMessage({ id: uuidv4(), task_id: taskId, role: "assistant", content: text, created_at: new Date().toISOString() });
        continueLoop = false; updateTaskStatus(taskId, "completed", new Date().toISOString()); break;
      }
      const funcResponses: Array<{ name: string; response: { result: string } }> = [];
      for (const fc of functionCalls) {
        const input = (fc.args || {}) as Record<string, unknown>;
        const stepId = uuidv4();
        const toolStep: AgentStep = {
          id: stepId, task_id: taskId, type: toolUseTypeToStepType(fc.name as ToolName),
          title: toolUseToTitle(fc.name, input), content: JSON.stringify(input, null, 2),
          tool_name: fc.name, tool_input: input, status: "running", created_at: new Date().toISOString(),
        };
        addAgentStep(toolStep); onStep?.(toolStep);
        const ts = Date.now(); let toolResult = ""; let toolError = false;
        try { toolResult = await executeTool(fc.name as ToolName, input, { taskId, filesDir, onStep }); }
        catch (err) { toolResult = `Error: ${err instanceof Error ? err.message : String(err)}`; toolError = true; }
        updateAgentStep(stepId, { tool_result: toolResult, status: toolError ? "failed" : "completed", duration_ms: Date.now() - ts });
        onStep?.({ ...toolStep, tool_result: toolResult, status: toolError ? "failed" : "completed", duration_ms: Date.now() - ts });
        funcResponses.push({ name: fc.name, response: { result: toolResult } });
        if (fc.name === "complete_task") continueLoop = false;
        if (fc.name === "request_user_input") { updateTaskStatus(taskId, "waiting_for_input"); continueLoop = false; }
      }
      currentMessage = JSON.stringify(funcResponses);
    }
    const { getTask } = await import("./db");
    const t = getTask(taskId);
    if (t?.status === "running") updateTaskStatus(taskId, "completed", new Date().toISOString());
  } catch (err) { handleAgentError(err, taskId, onStep); }
}

// ─── Error Handler ────────────────────────────────────────────────────────────

function handleAgentError(err: unknown, taskId: string, onStep?: (step: AgentStep) => void) {
  const msg = err instanceof Error ? err.message : String(err);
  const step: AgentStep = {
    id: uuidv4(), task_id: taskId, type: "error", title: "Error encountered",
    content: msg, status: "failed", created_at: new Date().toISOString(),
  };
  addAgentStep(step); onStep?.(step); updateTaskStatus(taskId, "failed");
  addMessage({ id: uuidv4(), task_id: taskId, role: "assistant", content: `I encountered an error: ${msg}`, created_at: new Date().toISOString() });
}

// ─── Tool Executor ────────────────────────────────────────────────────────────

interface ToolContext { taskId: string; filesDir: string; onStep?: (step: AgentStep) => void; }

async function executeTool(name: ToolName, input: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  switch (name) {
    case "web_search": return executeWebSearch(input.query as string, (input.num_results as number) || 5);
    case "scrape_url": return executeScrapeUrl(input.url as string, input.selector as string | undefined);
    case "execute_code": return executeCode(input.language as string, input.code as string, (input.timeout as number) || 30, ctx);
    case "write_file": return writeFile(input.filename as string, input.content as string, input.mime_type as string, ctx);
    case "read_file": return readFile(input.filename as string, ctx);
    case "list_files": return listFiles(ctx);
    case "create_sub_agent": return createSubAgent(input.title as string, input.agent_type as string, input.instructions as string, (input.context as string) || "", (input.model as string) || "auto", ctx);
    case "connector_call": return connectorCall(input.connector_id as string, input.action as string, input.params as Record<string, unknown>, ctx);
    case "memory_store": return executeMemoryStore(input.key as string, input.value as string, (input.tags as string[]) || [], ctx);
    case "memory_recall": return executeMemoryRecall(input.query as string, (input.limit as number) || 5);
    case "generate_image": return executeGenerateImage(input.prompt as string, (input.size as string) || "1024x1024", (input.style as string) || "vivid", (input.filename as string) || "generated_image.png", ctx);
    case "send_email": return executeSendEmail(input.to as string, input.subject as string, input.body as string, input.from as string | undefined, ctx);
    case "request_user_input": return JSON.stringify({ waiting: true, question: input.question, options: input.options || [], context: input.context || "" });
    case "complete_task": return handleCompleteTask(input.summary as string, (input.files_created as string[]) || [], (input.add_to_gallery as boolean) || false, ctx);
    default: return `Unknown tool: ${name}`;
  }
}

// ─── Web Search ───────────────────────────────────────────────────────────────

async function executeWebSearch(query: string, numResults: number): Promise<string> {
  if (process.env.PERPLEXITY_API_KEY) {
    try {
      const r = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "sonar", messages: [{ role: "user", content: query }], search_recency_filter: "week" }),
      });
      if (r.ok) {
        const d = await r.json() as { choices?: Array<{ message?: { content?: string } }>; citations?: string[] };
        const content = d.choices?.[0]?.message?.content || "";
        const cites = (d.citations || []).map((c: string, i: number) => `[${i + 1}] ${c}`).join("\n");
        return content + (cites ? `\n\nSources:\n${cites}` : "");
      }
    } catch { /* fall through */ }
  }
  if (process.env.BRAVE_SEARCH_API_KEY) {
    try {
      const r = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${numResults}`, {
        headers: { Accept: "application/json", "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY },
      });
      if (r.ok) {
        const d = await r.json() as { web?: { results?: Array<{ title: string; description: string; url: string }> } };
        return (d.web?.results || []).slice(0, numResults).map((r, i) => `[${i + 1}] ${r.title}\n${r.description}\nURL: ${r.url}`).join("\n\n");
      }
    } catch { /* fall through */ }
  }
  if (process.env.SERPER_API_KEY) {
    try {
      const r = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "X-API-KEY": process.env.SERPER_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ q: query, num: numResults }),
      });
      if (r.ok) {
        const d = await r.json() as { organic?: Array<{ title: string; snippet: string; link: string }>; answerBox?: { answer: string }; knowledgeGraph?: { description: string } };
        let out = "";
        if (d.answerBox?.answer) out += `Answer: ${d.answerBox.answer}\n\n`;
        if (d.knowledgeGraph?.description) out += `Overview: ${d.knowledgeGraph.description}\n\n`;
        out += (d.organic || []).slice(0, numResults).map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}\nURL: ${r.link}`).join("\n\n");
        return out;
      }
    } catch { /* fall through */ }
  }
  if (process.env.TAVILY_API_KEY) {
    try {
      const r = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: process.env.TAVILY_API_KEY, query, max_results: numResults, include_answer: true }),
      });
      if (r.ok) {
        const d = await r.json() as { answer?: string; results?: Array<{ title: string; content: string; url: string }> };
        let out = d.answer ? `Summary: ${d.answer}\n\n` : "";
        out += (d.results || []).map((r, i) => `[${i + 1}] ${r.title}\n${r.content.slice(0, 300)}...\nURL: ${r.url}`).join("\n\n");
        return out;
      }
    } catch { /* fall through */ }
  }
  return `Web search for "${query}": No search API configured. Set PERPLEXITY_API_KEY, BRAVE_SEARCH_API_KEY, SERPER_API_KEY, or TAVILY_API_KEY.`;
}

// ─── URL Scraper ──────────────────────────────────────────────────────────────

async function executeScrapeUrl(url: string, selector?: string): Promise<string> {
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) return `Failed to fetch ${url}: HTTP ${resp.status} ${resp.statusText}`;
    const ct = resp.headers.get("content-type") || "";
    if (ct.includes("application/json")) return JSON.stringify(await resp.json(), null, 2).slice(0, 20000);
    if (ct.includes("text/plain")) return (await resp.text()).slice(0, 20000);
    const html = await resp.text();
    const $ = cheerio.load(html);
    $("script, style, nav, footer, header, iframe, noscript, .ad, .advertisement, .sidebar").remove();
    let content = "";
    if (selector) {
      content = $(selector).text().trim() || $("body").text().trim();
    } else {
      const selectors = ["article", "main", ".post-content", ".article-body", ".entry-content", "#content", ".content"];
      for (const sel of selectors) {
        const t = $(sel).text().trim();
        if (t && t.length > 200) { content = t; break; }
      }
      if (!content) content = $("body").text().trim();
    }
    const title = $("title").text().trim() || $("h1").first().text().trim();
    const metaDesc = $('meta[name="description"]').attr("content") || "";
    content = content.replace(/\s+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    let result = "";
    if (title) result += `Title: ${title}\n`;
    if (metaDesc) result += `Description: ${metaDesc}\n`;
    result += `URL: ${url}\n\n${content.slice(0, 15000)}`;
    if (content.length > 15000) result += "\n\n... (content truncated)";
    const links: string[] = [];
    $("a[href]").each((_i: number, el: cheerio.Element) => {
      const href = $(el).attr("href"); const text = $(el).text().trim();
      if (href && text && !href.startsWith("#") && !href.startsWith("javascript:") && links.length < 10) {
        try { links.push(`- [${text.slice(0, 60)}](${new URL(href, url).toString()})`); } catch { /* skip */ }
      }
    });
    if (links.length > 0) result += `\n\nKey Links:\n${links.join("\n")}`;
    return result;
  } catch (err) { return `Failed to scrape ${url}: ${err instanceof Error ? err.message : String(err)}`; }
}

// ─── Memory ───────────────────────────────────────────────────────────────────

async function executeMemoryStore(key: string, value: string, tags: string[], ctx: ToolContext): Promise<string> {
  memoryStore({ id: uuidv4(), key, value, source_task_id: ctx.taskId, tags, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  return `Memory stored: "${key}" = "${value.slice(0, 100)}${value.length > 100 ? "..." : ""}" [tags: ${tags.join(", ") || "none"}]`;
}

async function executeMemoryRecall(query: string, limit: number): Promise<string> {
  const results = memoryRecall(query, limit);
  if (results.length === 0) return `No memories found for "${query}".`;
  return `Found ${results.length} memories:\n\n${results.map((m, i) => `${i + 1}. **${m.key}**: ${m.value}\n   Tags: [${(m.tags || []).join(", ")}]`).join("\n\n")}`;
}

// ─── Image Generation ─────────────────────────────────────────────────────────

async function executeGenerateImage(
  prompt: string, size: string, style: string, filename: string, ctx: ToolContext
): Promise<string> {
  if (!process.env.OPENAI_API_KEY) return "Image generation requires OPENAI_API_KEY (uses DALL-E 3).";
  try {
    const resp = await openai.images.generate({
      model: "dall-e-3", prompt, n: 1,
      size: size as "1024x1024" | "1792x1024" | "1024x1792",
      style: style as "vivid" | "natural", response_format: "url",
    });
    const imageUrl = resp.data[0]?.url;
    if (!imageUrl) return "Image generation failed: no URL returned.";
    const imgResp = await fetch(imageUrl);
    if (!imgResp.ok) return `Failed to download image: HTTP ${imgResp.status}`;
    const buf = Buffer.from(await imgResp.arrayBuffer());
    const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = path.join(ctx.filesDir, safeName);
    fs.writeFileSync(filePath, buf);
    const stat = fs.statSync(filePath);
    addTaskFile({ id: uuidv4(), task_id: ctx.taskId, name: safeName, path: filePath, size: stat.size, mime_type: "image/png", created_at: new Date().toISOString() });
    const revised = resp.data[0]?.revised_prompt;
    return `Image generated: ${safeName} (${formatBytes(stat.size)})${revised ? `\nRevised prompt: ${revised}` : ""}`;
  } catch (err) { return `Image generation failed: ${err instanceof Error ? err.message : String(err)}`; }
}

// ─── Send Email ───────────────────────────────────────────────────────────────

async function executeSendEmail(
  to: string, subject: string, body: string, from: string | undefined, _ctx: ToolContext
): Promise<string> {
  if (process.env.RESEND_API_KEY) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: from || process.env.RESEND_FROM_EMAIL || "Ottomatron <onboarding@resend.dev>", to: [to], subject, html: body }),
      });
      if (r.ok) { const d = await r.json() as { id: string }; return `Email sent to ${to}. ID: ${d.id}`; }
      const e = await r.json() as { message?: string }; return `Email failed: ${e.message || `HTTP ${r.status}`}`;
    } catch (err) { return `Email error: ${err instanceof Error ? err.message : String(err)}`; }
  }
  return `Email draft prepared for ${to} — Subject: "${subject}". Set RESEND_API_KEY to send emails.`;
}

// ─── Code Execution ───────────────────────────────────────────────────────────

async function executeCode(language: string, code: string, timeout: number, ctx: ToolContext): Promise<string> {
  const ext = language === "python" ? "py" : language === "javascript" ? "js" : "sh";
  const filename = `script_${Date.now()}.${ext}`;
  const filepath = path.join(ctx.filesDir, filename);
  try {
    fs.writeFileSync(filepath, code, "utf-8");
    const cmd =
      language === "python" ? `cd "${ctx.filesDir}" && timeout ${timeout} python3 "${filename}" 2>&1`
      : language === "javascript" ? `cd "${ctx.filesDir}" && timeout ${timeout} node "${filename}" 2>&1`
      : `cd "${ctx.filesDir}" && timeout ${timeout} bash "${filename}" 2>&1`;
    const { stdout, stderr } = await execAsync(cmd, { timeout: (timeout + 5) * 1000, cwd: ctx.filesDir });
    const output = (stdout || stderr || "").slice(0, 10000);
    const newFiles = fs.readdirSync(ctx.filesDir)
      .filter((f) => f !== filename)
      .filter((f) => { const s = fs.statSync(path.join(ctx.filesDir, f)); return s.mtimeMs > Date.now() - (timeout + 10) * 1000; });
    for (const nf of newFiles) {
      const fp = path.join(ctx.filesDir, nf); const s = fs.statSync(fp);
      addTaskFile({ id: uuidv4(), task_id: ctx.taskId, name: nf, path: fp, size: s.size, mime_type: getMimeType(nf), created_at: new Date().toISOString() });
    }
    return output + (newFiles.length > 0 ? `\n\nFiles created: ${newFiles.join(", ")}` : "");
  } catch (err) { return `Execution error: ${(err instanceof Error ? err.message : String(err)).slice(0, 2000)}`; }
  finally { try { fs.unlinkSync(filepath); } catch { /* ignore */ } }
}

// ─── File Operations ──────────────────────────────────────────────────────────

async function writeFile(filename: string, content: string, mimeType: string | undefined, ctx: ToolContext): Promise<string> {
  const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = path.join(ctx.filesDir, safeName);
  fs.writeFileSync(filePath, content, "utf-8");
  const stat = fs.statSync(filePath);
  addTaskFile({ id: uuidv4(), task_id: ctx.taskId, name: safeName, path: filePath, size: stat.size, mime_type: mimeType || getMimeType(safeName), created_at: new Date().toISOString() });
  return `File written: ${safeName} (${formatBytes(stat.size)})`;
}

async function readFile(filename: string, ctx: ToolContext): Promise<string> {
  const safeName = path.basename(filename);
  const filePath = path.join(ctx.filesDir, safeName);
  if (!fs.existsSync(filePath)) return `File not found: ${safeName}. Available: ${fs.readdirSync(ctx.filesDir).join(", ") || "none"}`;
  const content = fs.readFileSync(filePath, "utf-8");
  return content.slice(0, 50000) + (content.length > 50000 ? "\n... (truncated)" : "");
}

async function listFiles(ctx: ToolContext): Promise<string> {
  const files = fs.readdirSync(ctx.filesDir);
  if (files.length === 0) return "No files in working directory.";
  return files.map((f) => { const s = fs.statSync(path.join(ctx.filesDir, f)); return `- ${f} (${formatBytes(s.size)})`; }).join("\n");
}

// ─── Sub-Agent ────────────────────────────────────────────────────────────────

function selectSubAgentModel(agentType: string, requested: string): { provider: string; modelName: string } {
  if (requested && requested !== "auto") return selectModelForTask(requested as ModelId, "");
  switch (agentType) {
    case "writing": return process.env.OPENAI_API_KEY ? { provider: "openai", modelName: "gpt-4o" } : { provider: "anthropic", modelName: "claude-sonnet-4-5" };
    case "code": case "reviewer": case "data_analysis": return { provider: "anthropic", modelName: "claude-opus-4-5" };
    default: return { provider: "anthropic", modelName: "claude-sonnet-4-5" };
  }
}

async function createSubAgent(
  title: string, agentType: string, instructions: string,
  context: string, model: string, ctx: ToolContext
): Promise<string> {
  const subTaskId = uuidv4();
  addSubTask({ id: subTaskId, parent_task_id: ctx.taskId, title, status: "running", agent_type: agentType, created_at: new Date().toISOString() });
  const subSystemPrompt = getSubAgentSystemPrompt(agentType);
  const subModel = selectSubAgentModel(agentType, model);
  const subTools = TOOLS.filter((t) => ["web_search", "scrape_url", "execute_code", "write_file", "read_file", "memory_store"].includes(t.name));
  try {
    let result = "";
    if (subModel.provider === "openai" && process.env.OPENAI_API_KEY) {
      const resp = await openai.chat.completions.create({
        model: subModel.modelName, max_tokens: 4096,
        messages: [{ role: "system", content: subSystemPrompt }, { role: "user", content: `${context ? `Context: ${context}\n\n` : ""}Task: ${instructions}` }],
        tools: convertToolsToOpenAIFormat().filter((t) => subTools.some((st) => st.name === t.function.name)),
      });
      result = resp.choices[0]?.message?.content || "";
      const tcs = resp.choices[0]?.message?.tool_calls || [];
      if (tcs.length > 0) {
        const tr: string[] = [];
        for (const tc of tcs) {
          try { const inp = JSON.parse(tc.function.arguments); tr.push(`[${tc.function.name}]: ${(await executeTool(tc.function.name as ToolName, inp, ctx)).slice(0, 500)}`); } catch { /* skip */ }
        }
        result += "\n\nTool results:\n" + tr.join("\n");
      }
    } else {
      const resp = await anthropic.messages.create({
        model: subModel.modelName, max_tokens: 4096, system: subSystemPrompt, tools: subTools,
        messages: [{ role: "user", content: `${context ? `Context: ${context}\n\n` : ""}Task: ${instructions}` }],
      });
      const texts = resp.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text);
      const toolBlocks = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (toolBlocks.length > 0) {
        const tr: string[] = [];
        for (const tb of toolBlocks) {
          try { tr.push(`[${tb.name}]: ${(await executeTool(tb.name as ToolName, tb.input as Record<string, unknown>, ctx)).slice(0, 500)}`); } catch { /* skip */ }
        }
        result = texts.join("\n") + "\n\nTool results:\n" + tr.join("\n");
      } else { result = texts.join("\n"); }
    }
    updateSubTask(subTaskId, "completed", result || "Completed.");
    return result || "Sub-agent completed.";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    updateSubTask(subTaskId, "failed", msg);
    return `Sub-agent failed: ${msg}`;
  }
}

// ─── Connector Call ───────────────────────────────────────────────────────────

async function connectorCall(connectorId: string, action: string, params: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  void ctx;
  const { getConnectorConfig } = await import("./db");
  const config = getConnectorConfig(connectorId);
  if (!config || !config.connected) return `Connector "${connectorId}" is not connected. Configure it in the Connectors page.`;
  try { return await dispatchConnectorAction(connectorId, action, params, config as Record<string, unknown>); }
  catch (err) { return `Connector error: ${err instanceof Error ? err.message : String(err)}`; }
}

async function dispatchConnectorAction(
  connectorId: string, action: string, params: Record<string, unknown>, config: Record<string, unknown>
): Promise<string> {
  const apiKey = config.api_key as string;
  switch (connectorId) {
    case "slack": {
      if (action === "send_message") {
        const r = await fetch("https://slack.com/api/chat.postMessage", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ channel: params.channel || "#general", text: params.text || params.message }) });
        const d = await r.json() as { ok: boolean; error?: string }; return d.ok ? "Slack message sent." : `Slack error: ${d.error}`;
      }
      if (action === "list_channels") {
        const r = await fetch("https://slack.com/api/conversations.list?limit=20", { headers: { Authorization: `Bearer ${apiKey}` } });
        const d = await r.json() as { ok: boolean; channels?: Array<{ name: string; id: string }> };
        return d.ok ? (d.channels || []).map((c) => `#${c.name} (${c.id})`).join("\n") : "Failed to list channels";
      }
      break;
    }
    case "github": {
      const h = { Authorization: `token ${apiKey}`, "Content-Type": "application/json", Accept: "application/vnd.github.v3+json" };
      if (action === "create_issue") {
        const r = await fetch(`https://api.github.com/repos/${params.owner}/${params.repo}/issues`, { method: "POST", headers: h, body: JSON.stringify({ title: params.title, body: params.body }) });
        const d = await r.json() as { html_url?: string; message?: string }; return d.html_url ? `Issue created: ${d.html_url}` : `Error: ${d.message}`;
      }
      if (action === "list_repos") {
        const r = await fetch("https://api.github.com/user/repos?sort=updated&per_page=10", { headers: h });
        const repos = await r.json() as Array<{ full_name: string; description?: string }>;
        return repos.map((r) => `- ${r.full_name}: ${r.description || "No description"}`).join("\n");
      }
      if (action === "create_pr") {
        const r = await fetch(`https://api.github.com/repos/${params.owner}/${params.repo}/pulls`, { method: "POST", headers: h, body: JSON.stringify({ title: params.title, body: params.body, head: params.head, base: params.base || "main" }) });
        const d = await r.json() as { html_url?: string; message?: string }; return d.html_url ? `PR created: ${d.html_url}` : `Error: ${d.message}`;
      }
      if (action === "get_file") {
        const r = await fetch(`https://api.github.com/repos/${params.owner}/${params.repo}/contents/${params.path}`, { headers: h });
        const d = await r.json() as { content?: string; message?: string };
        return d.content ? Buffer.from(d.content, "base64").toString("utf-8") : `Error: ${d.message || "File not found"}`;
      }
      break;
    }
    case "linear": {
      if (action === "create_issue") {
        const r = await fetch("https://api.linear.app/graphql", { method: "POST", headers: { Authorization: apiKey, "Content-Type": "application/json" }, body: JSON.stringify({ query: `mutation CreateIssue($input: IssueCreateInput!) { issueCreate(input: $input) { issue { id title url } } }`, variables: { input: { title: params.title, description: params.description, teamId: params.team_id } } }) });
        const d = await r.json() as { data?: { issueCreate?: { issue?: { url?: string } } } };
        return d.data?.issueCreate?.issue?.url ? `Issue created: ${d.data.issueCreate.issue.url}` : "Issue creation failed";
      }
      break;
    }
    case "notion": {
      const nh = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Notion-Version": "2022-06-28" };
      if (action === "create_page") {
        const r = await fetch("https://api.notion.com/v1/pages", { method: "POST", headers: nh, body: JSON.stringify({ parent: { page_id: params.parent_id || params.database_id }, properties: { title: { title: [{ text: { content: params.title || "New Page" } }] } }, children: params.content ? [{ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: params.content } }] } }] : [] }) });
        const d = await r.json() as { url?: string }; return d.url ? `Notion page created: ${d.url}` : `Created: ${JSON.stringify(d).slice(0, 200)}`;
      }
      if (action === "search") {
        const r = await fetch("https://api.notion.com/v1/search", { method: "POST", headers: nh, body: JSON.stringify({ query: params.query, page_size: 5 }) });
        const d = await r.json() as { results?: Array<{ id: string; url?: string }> };
        return (d.results || []).map((r) => `- ${r.id}: ${r.url || "no url"}`).join("\n") || "No results";
      }
      break;
    }
    case "stripe": {
      const sh = { Authorization: `Bearer ${apiKey}` };
      if (action === "list_customers") {
        const r = await fetch("https://api.stripe.com/v1/customers?limit=10", { headers: sh });
        const d = await r.json() as { data?: Array<{ id: string; email: string; name?: string }> };
        return (d.data || []).map((c) => `- ${c.name || "Unknown"} (${c.email}) ${c.id}`).join("\n");
      }
      if (action === "list_payments") {
        const r = await fetch("https://api.stripe.com/v1/payment_intents?limit=10", { headers: sh });
        const d = await r.json() as { data?: Array<{ id: string; amount: number; currency: string; status: string }> };
        return (d.data || []).map((p) => `- ${p.id}: ${p.amount / 100} ${p.currency} (${p.status})`).join("\n");
      }
      break;
    }
    case "discord": {
      if (action === "send_message") {
        const r = await fetch(`https://discord.com/api/v10/channels/${params.channel_id}/messages`, { method: "POST", headers: { Authorization: `Bot ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ content: params.text || params.message }) });
        const d = await r.json() as { id?: string; message?: string }; return d.id ? "Discord message sent." : `Discord error: ${d.message}`;
      }
      break;
    }
    case "telegram": {
      if (action === "send_message") {
        const r = await fetch(`https://api.telegram.org/bot${apiKey}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: params.chat_id, text: params.text || params.message }) });
        const d = await r.json() as { ok: boolean; description?: string }; return d.ok ? "Telegram message sent." : `Telegram error: ${d.description}`;
      }
      break;
    }
  }
  return `Action "${action}" dispatched to "${connectorId}" with params: ${JSON.stringify(params)}`;
}

// ─── Complete Task ────────────────────────────────────────────────────────────

async function handleCompleteTask(
  summary: string, filesCreated: string[], addToGallery: boolean, ctx: ToolContext
): Promise<string> {
  void filesCreated;
  addMessage({ id: uuidv4(), task_id: ctx.taskId, role: "assistant", content: summary, created_at: new Date().toISOString() });
  memoryStore({ id: uuidv4(), key: `task_result_${ctx.taskId.slice(0, 8)}`, value: summary.slice(0, 500), source_task_id: ctx.taskId, tags: ["task_result", "auto"], created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  if (addToGallery) {
    addGalleryItem({ id: uuidv4(), title: `Task ${ctx.taskId.slice(0, 8)}`, description: summary.slice(0, 200), preview_url: "", category: "General", prompt: summary.slice(0, 100), task_id: ctx.taskId, is_featured: false, created_at: new Date().toISOString() });
  }
  return `Task completed. ${summary.slice(0, 200)}`;
}

// ─── System Prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(skills?: string): string {
  return `You are Ottomatron, a powerful autonomous AI workforce — the next evolution beyond AI chat. You are a multi-agent orchestration system powered by the world's best AI models.

Current date/time: ${new Date().toISOString()}

## Your Core Identity
You are a general-purpose digital worker that creates and executes entire workflows autonomously. Unlike chat interfaces that just answer questions, you take action. You reason, search, scrape, build, remember, generate, and deliver.

## Architecture (CrewAI Crews + OpenAI Swarms inspired)
Delegate work to specialized sub-agents via create_sub_agent:
- **research**: Deep web research, source synthesis, fact-checking
- **code**: Production-quality code generation and debugging
- **writing**: Documents, emails, reports, creative content
- **data_analysis**: Statistical analysis, visualization
- **web_scraper**: Extract structured data from URLs
- **reviewer**: Code review, fact-checking, QA
- **planner**: Break complex projects into actionable steps
Each sub-agent auto-routes to the best model for that task type.

## Your Tools
- **web_search**: Real-time search (Perplexity, Brave, Serper, Tavily)
- **scrape_url**: Fetch and extract content from any URL
- **execute_code**: Run Python, JavaScript, Bash
- **write_file / read_file / list_files**: File management
- **generate_image**: Create images via DALL-E 3
- **send_email**: Send emails via Resend or connected services
- **connector_call**: 40+ external services (Slack, GitHub, Notion, Stripe...)
- **memory_store / memory_recall**: Persistent cross-task memory
- **create_sub_agent**: Specialized parallel/sequential agents
- **request_user_input**: Ask user when genuinely needed
- **complete_task**: ALWAYS call this when done

## Execution Philosophy
- Be autonomous: minimize clarification requests, infer intent
- Be thorough: don't stop until the task is truly complete
- Be creative: build impressive, polished outputs
- Use memory: recall past context, store important learnings
- Validate results before completing
- Call **complete_task** when done with a comprehensive summary

## Memory System
- At the start of complex tasks, use memory_recall to check for relevant context
- Store important findings with memory_store
- Task results are auto-stored in memory for continuity across sessions${skills ? `\n\n## Custom Skills\n${skills}` : ""}`;
}

function getSubAgentSystemPrompt(agentType: string): string {
  const base = "You are a specialized sub-agent in the Ottomatron system. Complete your assigned task thoroughly.";
  const map: Record<string, string> = {
    research: `${base}\n\nYou are a Research Specialist. Search with web_search, scrape pages with scrape_url, synthesize from multiple sources, cite everything.`,
    code: `${base}\n\nYou are a Code Specialist. Write clean, documented, production-quality code. Test with execute_code. Handle edge cases.`,
    writing: `${base}\n\nYou are a Writing Specialist. Write clearly, engagingly, and appropriately for the audience. Structure content well.`,
    data_analysis: `${base}\n\nYou are a Data Analyst. Use Python with pandas/matplotlib. Create visualizations. Provide insights and conclusions.`,
    web_scraper: `${base}\n\nYou are a Web Scraping Specialist. Extract structured data with scrape_url. Output as JSON/CSV/Markdown.`,
    reviewer: `${base}\n\nYou are a Reviewer. Check accuracy, quality, completeness. Give specific, actionable feedback.`,
    planner: `${base}\n\nYou are a Planner. Break goals into clear steps, consider dependencies, estimate effort, identify risks.`,
  };
  return map[agentType] || base;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toolUseTypeToStepType(toolName: ToolName): AgentStep["type"] {
  const map: Record<string, AgentStep["type"]> = {
    web_search: "search", scrape_url: "search", execute_code: "code_execution",
    write_file: "file_operation", read_file: "file_operation", list_files: "file_operation",
    create_sub_agent: "sub_agent", connector_call: "connector_call",
    request_user_input: "waiting", complete_task: "output",
    memory_store: "reasoning", memory_recall: "reasoning",
    generate_image: "file_operation", send_email: "connector_call",
  };
  return map[toolName] || "reasoning";
}

function toolUseToTitle(name: string, input: Record<string, unknown>): string {
  const titles: Record<string, () => string> = {
    web_search: () => `Searching: "${((input.query as string) || "").slice(0, 60)}"`,
    scrape_url: () => `Scraping: ${((input.url as string) || "").slice(0, 50)}`,
    execute_code: () => `Running ${input.language} code`,
    write_file: () => `Creating file: ${input.filename}`,
    read_file: () => `Reading: ${input.filename}`,
    list_files: () => "Listing files",
    create_sub_agent: () => `Sub-agent: ${input.title}`,
    connector_call: () => `${input.connector_id}: ${input.action}`,
    request_user_input: () => "Waiting for user input",
    complete_task: () => "Task completed",
    memory_store: () => `Storing: "${((input.key as string) || "").slice(0, 40)}"`,
    memory_recall: () => `Recalling: "${((input.query as string) || "").slice(0, 40)}"`,
    generate_image: () => `Generating image: ${((input.prompt as string) || "").slice(0, 40)}...`,
    send_email: () => `Sending email to ${input.to}`,
  };
  return titles[name]?.() ?? name;
}

function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const types: Record<string, string> = {
    ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
    ".ts": "application/typescript", ".py": "text/x-python", ".json": "application/json",
    ".md": "text/markdown", ".txt": "text/plain", ".pdf": "application/pdf",
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml", ".gif": "image/gif", ".webp": "image/webp",
    ".csv": "text/csv",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".zip": "application/zip", ".sh": "text/x-shellscript",
    ".yaml": "application/yaml", ".yml": "application/yaml",
    ".xml": "application/xml", ".sql": "application/sql",
    ".r": "text/x-r", ".ipynb": "application/x-ipynb+json",
    ".mp3": "audio/mpeg", ".mp4": "video/mp4", ".wav": "audio/wav", ".webm": "video/webm",
  };
  return types[ext] || "application/octet-stream";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
'''

with open(TARGET, 'w') as f:
    f.write(CONTENT)

print(f'Written {len(CONTENT)} chars to {TARGET}')

import { NextRequest } from "next/server";
import { getSystemPrompt, buildUserPrompt, getContinuePrompt } from "@/lib/app-builder/system-prompt";

// ---------------------------------------------------------------------------
// App Builder API — Bolt.new-grade AI-powered web app generation
// True streaming with Anthropic → OpenAI fallback → buffered fallback
// ---------------------------------------------------------------------------

export const maxDuration = 300;

const APP_BUILDER_SYSTEM = getSystemPrompt("/home/project");

// ---------------------------------------------------------------------------
// Streaming Providers
// ---------------------------------------------------------------------------

async function* streamAnthropic(opts: {
  system: string;
  messages: Array<{ role: string; content: string }>;
  maxTokens: number;
  temperature: number;
}): AsyncGenerator<{ type: "chunk"; text: string } | { type: "done"; model: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
      system: opts.system,
      messages: opts.messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      stream: true,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic ${res.status}: ${errText}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let modelName = "claude-sonnet-4-6";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (!data || data === "[DONE]") continue;

      try {
        const event = JSON.parse(data);
        if (event.type === "message_start" && event.message?.model) {
          modelName = event.message.model;
        }
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
          yield { type: "chunk", text: event.delta.text };
        }
        if (event.type === "message_stop") {
          yield { type: "done", model: modelName };
          return;
        }
      } catch {
        // skip malformed
      }
    }
  }
  yield { type: "done", model: modelName };
}

async function* streamOpenAI(opts: {
  system: string;
  messages: Array<{ role: string; content: string }>;
  maxTokens: number;
  temperature: number;
}): AsyncGenerator<{ type: "chunk"; text: string } | { type: "done"; model: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const model = "gpt-4o";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: Math.min(opts.maxTokens, 16384),
      temperature: opts.temperature,
      stream: true,
      messages: [
        { role: "system", content: opts.system },
        ...opts.messages,
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI ${res.status}: ${errText}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") {
        yield { type: "done", model };
        return;
      }
      try {
        const event = JSON.parse(data);
        const content = event.choices?.[0]?.delta?.content;
        if (content) yield { type: "chunk", text: content };
      } catch { /* skip */ }
    }
  }
  yield { type: "done", model };
}

// ---------------------------------------------------------------------------
// Buffered fallback
// ---------------------------------------------------------------------------

async function callBufferedFallback(opts: {
  system: string;
  messages: Array<{ role: string; content: string }>;
  maxTokens: number;
  temperature: number;
}): Promise<{ text: string; provider: string; model: string }> {
  const { callLLMWithFallback } = await import("@/lib/model-fallback");
  return callLLMWithFallback({
    system: opts.system,
    messages: opts.messages,
    maxTokens: opts.maxTokens,
    temperature: opts.temperature,
    lightweight: false,
  });
}

// ---------------------------------------------------------------------------
// POST /api/app-builder
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, currentFiles, conversationHistory, mode, continueGeneration } = body as {
      prompt: string;
      currentFiles?: Record<string, string>;
      conversationHistory?: Array<{ role: string; content: string }>;
      mode?: "generate" | "modify" | "explain" | "fix";
      continueGeneration?: boolean;
    };

    if (!prompt?.trim() && !continueGeneration) {
      return new Response(JSON.stringify({ error: "Prompt is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const messages: Array<{ role: string; content: string }> = [];

    if (conversationHistory?.length) {
      for (const msg of conversationHistory) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    if (continueGeneration) {
      messages.push({ role: "user", content: getContinuePrompt() });
    } else {
      const userPrompt = buildUserPrompt({
        prompt,
        mode: mode || "generate",
        currentFiles,
      });
      messages.push({ role: "user", content: userPrompt });
    }

    const encoder = new TextEncoder();
    const MAX_TOKENS = 64000;

    const tryStreamAnthropic = !!process.env.ANTHROPIC_API_KEY;
    const tryStreamOpenAI = !!process.env.OPENAI_API_KEY;

    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: Record<string, unknown>) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

        send({ type: "progress", stage: "connecting", message: "Connecting to AI model..." });

        async function pipeStream(
          gen: AsyncGenerator<{ type: "chunk"; text: string } | { type: "done"; model: string }>,
          providerName: string
        ): Promise<boolean> {
          let chunksSent = 0;
          let step = 1;

          const progressMsgs = [
            "Analyzing requirements...",
            "Planning architecture...",
            "Generating HTML structure...",
            "Writing CSS styles...",
            "Building JavaScript logic...",
            "Creating components...",
            "Adding interactions & animations...",
            "Wiring up data layer...",
            "Polishing design...",
            "Finalizing files...",
            "Almost done...",
          ];

          const ticker = setInterval(() => {
            step = Math.min(step + 1, progressMsgs.length - 1);
            try {
              send({ type: "progress", stage: "generating", message: progressMsgs[step] || "Generating...", step });
            } catch { /**/ }
          }, 5000);

          let firstEventReceived = false;
          let finalModel = providerName;

          try {
            for await (const event of gen) {
              firstEventReceived = true;
              if (event.type === "chunk") {
                send({ type: "chunk", content: event.text });
                chunksSent++;
              } else if (event.type === "done") {
                finalModel = event.model;
              }
            }
            clearInterval(ticker);
            send({ type: "done", provider: providerName, model: finalModel });
            controller.close();
            return true;
          } catch (err) {
            clearInterval(ticker);
            console.error(`[app-builder] ${providerName} stream error (${chunksSent} chunks):`, err);
            if (chunksSent > 0 || firstEventReceived) {
              send({ type: "error", error: `Stream interrupted: ${err instanceof Error ? err.message : String(err)}` });
              controller.close();
              return true;
            }
            return false;
          }
        }

        // 1. Anthropic
        if (tryStreamAnthropic) {
          send({ type: "progress", stage: "generating", message: "Generating your app with Claude...", step: 1 });
          const gen = streamAnthropic({ system: APP_BUILDER_SYSTEM, messages, maxTokens: MAX_TOKENS, temperature: 0.5 });
          const ok = await pipeStream(gen, "anthropic");
          if (ok) return;
        }

        // 2. OpenAI
        if (tryStreamOpenAI) {
          send({ type: "progress", stage: "connecting", message: "Connecting to OpenAI..." });
          send({ type: "progress", stage: "generating", message: "Generating your app with GPT-4...", step: 1 });
          const gen = streamOpenAI({ system: APP_BUILDER_SYSTEM, messages, maxTokens: MAX_TOKENS, temperature: 0.5 });
          const ok = await pipeStream(gen, "openai");
          if (ok) return;
        }

        // 3. Buffered fallback
        send({ type: "progress", stage: "generating", message: "Generating your app (buffered)...", step: 1 });
        let step = 1;
        const ticker = setInterval(() => {
          step = Math.min(step + 1, 11);
          try { send({ type: "progress", stage: "generating", message: "Generating...", step }); } catch { /**/ }
        }, 6000);

        try {
          const result = await callBufferedFallback({ system: APP_BUILDER_SYSTEM, messages, maxTokens: MAX_TOKENS, temperature: 0.5 });
          clearInterval(ticker);
          const text = result.text;
          const chunkSize = 400;
          for (let i = 0; i < text.length; i += chunkSize) {
            send({ type: "chunk", content: text.slice(i, i + chunkSize) });
          }
          send({ type: "done", provider: result.provider, model: result.model });
        } catch (err) {
          clearInterval(ticker);
          send({ type: "error", error: err instanceof Error ? err.message : "Unknown error" });
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

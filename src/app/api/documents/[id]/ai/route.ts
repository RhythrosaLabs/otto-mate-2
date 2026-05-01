import { NextRequest } from "next/server";
import { apiError, safeErrorMessage } from "@/lib/constants";
import { getDocument } from "@/lib/db";

export const dynamic = "force-dynamic";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

const encoder = new TextEncoder();

function sseEnqueue(controller: ReadableStreamDefaultController, text: string) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
}

function sseDone(controller: ReadableStreamDefaultController) {
  controller.enqueue(encoder.encode("data: [DONE]\n\n"));
  controller.close();
}

function sseError(controller: ReadableStreamDefaultController, err: unknown) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: safeErrorMessage(err) })}\n\n`));
  controller.close();
}

// ─── Streaming helpers per provider ──────────────────────────────────────────

/** Iterate an Anthropic stream, enqueuing SSE events. Throws on API errors. */
async function streamAnthropic(
  controller: ReadableStreamDefaultController,
  stream: AsyncIterable<any>,
) {
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      sseEnqueue(controller, event.delta.text);
    }
  }
}

/** Iterate an OpenAI-compatible stream, enqueuing SSE events. Throws on API errors. */
async function streamOpenAICompat(
  controller: ReadableStreamDefaultController,
  stream: AsyncIterable<any>,
) {
  for await (const chunk of stream) {
    const text = chunk.choices?.[0]?.delta?.content;
    if (text) sseEnqueue(controller, text);
  }
}

/** Iterate a Google Gemini stream, enqueuing SSE events. Throws on API errors. */
async function streamGoogle(
  controller: ReadableStreamDefaultController,
  result: { stream: AsyncIterable<any> },
) {
  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) sseEnqueue(controller, text);
  }
}

/**
 * AI assistant for documents – streams AI-generated content for the editor.
 * Uses the same provider fallback chain as the rest of the app:
 * Anthropic → OpenAI → Google → OpenRouter → Perplexity
 *
 * The fallback happens INSIDE the SSE stream so that errors during iteration
 * (e.g. Anthropic's "credit balance too low") are caught and the next provider
 * is tried transparently.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const doc = await getDocument(id);
    if (!doc) return apiError("Document not found", 404);

    const body = await req.json();
    const action = typeof body.action === "string" ? body.action : "improve";
    const selection = typeof body.selection === "string" ? body.selection : "";
    const customPrompt = typeof body.prompt === "string" ? body.prompt : "";

    const systemPrompt = doc.type === "spreadsheet"
      ? `You are an AI assistant for a spreadsheet editor. The spreadsheet data is stored as JSON with cell references like A1, B2, etc. Help the user with formulas, data analysis, and content generation. Respond with clear, actionable suggestions. When suggesting cell values, format them clearly.`
      : `You are an AI writing assistant for a document editor. Help the user improve, expand, summarize, or generate content. Respond with the improved/generated text directly — no markdown code blocks, no preamble. Just the content itself.`;

    const actionPrompts: Record<string, string> = {
      "improve": `Improve the following text. Make it clearer, more professional, and better written:\n\n${selection}`,
      "summarize": `Summarize the following text concisely:\n\n${selection || doc.content}`,
      "expand": `Expand on the following text with more detail and supporting points:\n\n${selection}`,
      "fix-grammar": `Fix all grammar, spelling, and punctuation errors in the following text. Return only the corrected text:\n\n${selection}`,
      "translate": `Translate the following text to ${body.language || "Spanish"}:\n\n${selection}`,
      "brainstorm": `Brainstorm ideas related to: ${selection || doc.title}`,
      "analyze": `Analyze this spreadsheet data and provide insights:\n\n${doc.content}`,
      "custom": customPrompt || `Help with: ${selection}`,
    };

    const userMessage = actionPrompts[action] || actionPrompts["custom"];

    // ─── Build provider attempt functions ─────────────────────────────────
    // Each function creates a stream & iterates it. If the provider's API
    // returns an error (e.g. insufficient credits, rate limit) the iteration
    // throws and the next provider is tried — all inside the same SSE stream.

    type ProviderFn = (ctrl: ReadableStreamDefaultController) => Promise<void>;
    const providers: Array<{ name: string; fn: ProviderFn }> = [];

    if (process.env.ANTHROPIC_API_KEY) {
      providers.push({
        name: "Anthropic",
        fn: async (ctrl) => {
          const { default: Anthropic } = await import("@anthropic-ai/sdk");
          const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
          const stream = client.messages.stream({
            model: "claude-sonnet-4-6",
            max_tokens: 2048,
            system: systemPrompt,
            messages: [{ role: "user", content: userMessage }],
          });
          await streamAnthropic(ctrl, stream);
        },
      });
    }

    if (process.env.OPENAI_API_KEY) {
      providers.push({
        name: "OpenAI",
        fn: async (ctrl) => {
          const { default: OpenAI } = await import("openai");
          const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
          const stream = await client.chat.completions.create({
            model: "gpt-5.4",
            max_tokens: 2048,
            stream: true,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMessage },
            ],
          });
          await streamOpenAICompat(ctrl, stream);
        },
      });
    }

    if (process.env.GOOGLE_AI_API_KEY) {
      providers.push({
        name: "Google",
        fn: async (ctrl) => {
          const { GoogleGenerativeAI } = await import("@google/generative-ai");
          const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);
          const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            systemInstruction: systemPrompt,
          });
          const result = await model.generateContentStream(userMessage);
          await streamGoogle(ctrl, result);
        },
      });
    }

    if (process.env.OPENROUTER_API_KEY) {
      providers.push({
        name: "OpenRouter",
        fn: async (ctrl) => {
          const { default: OpenAI } = await import("openai");
          const client = new OpenAI({
            apiKey: process.env.OPENROUTER_API_KEY,
            baseURL: "https://openrouter.ai/api/v1",
            defaultHeaders: {
              "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
              "X-Title": "Ottomate",
            },
          });
          const stream = await client.chat.completions.create({
            model: "openrouter/free",
            max_tokens: 2048,
            stream: true,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMessage },
            ],
          });
          await streamOpenAICompat(ctrl, stream);
        },
      });
    }

    if (process.env.PERPLEXITY_API_KEY) {
      providers.push({
        name: "Perplexity",
        fn: async (ctrl) => {
          const { default: OpenAI } = await import("openai");
          const client = new OpenAI({
            apiKey: process.env.PERPLEXITY_API_KEY,
            baseURL: "https://api.perplexity.ai",
          });
          const stream = await client.chat.completions.create({
            model: "sonar",
            max_tokens: 2048,
            stream: true,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMessage },
            ],
          });
          await streamOpenAICompat(ctrl, stream);
        },
      });
    }

    if (providers.length === 0) {
      return apiError(
        "No AI API key configured. Set at least one of: ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_AI_API_KEY, OPENROUTER_API_KEY, PERPLEXITY_API_KEY.",
        400,
      );
    }

    // ─── Single SSE stream with internal fallback ─────────────────────────
    const readable = new ReadableStream({
      async start(controller) {
        for (let i = 0; i < providers.length; i++) {
          const { name, fn } = providers[i];
          try {
            await fn(controller);
            // Stream completed successfully — send DONE and exit
            sseDone(controller);
            return;
          } catch (err) {
            const msg = safeErrorMessage(err);
            console.error(
              `[documents-ai] ${name} failed${i < providers.length - 1 ? `, trying ${providers[i + 1].name}` : ""}:`,
              msg,
            );
            // Continue to next provider
          }
        }
        // All providers exhausted
        sseError(controller, "All AI providers failed. Check server logs for details.");
      },
    });

    return new Response(readable, { headers: SSE_HEADERS });
  } catch (err) {
    return apiError(safeErrorMessage(err), 500);
  }
}

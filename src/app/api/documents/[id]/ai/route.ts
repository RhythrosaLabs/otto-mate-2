import { NextRequest } from "next/server";
import { apiError, safeErrorMessage } from "@/lib/constants";
import { getDocument } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * AI assistant for documents – streams AI-generated content for the editor.
 * Supports actions: improve, summarize, expand, fix-grammar, translate, brainstorm, analyze (spreadsheet)
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const doc = getDocument(id);
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

    // Try Anthropic first, fallback to OpenAI
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (anthropicKey) {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey: anthropicKey });
      const stream = await client.messages.stream({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      });

      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          try {
            for await (const event of stream) {
              if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`));
              }
            }
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch (err) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: safeErrorMessage(err) })}\n\n`));
            controller.close();
          }
        },
      });

      return new Response(readable, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
      });
    }

    if (openaiKey) {
      const { default: OpenAI } = await import("openai");
      const client = new OpenAI({ apiKey: openaiKey });
      const stream = await client.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 2048,
        stream: true,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      });

      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of stream) {
              const text = chunk.choices[0]?.delta?.content;
              if (text) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
              }
            }
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch (err) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: safeErrorMessage(err) })}\n\n`));
            controller.close();
          }
        },
      });

      return new Response(readable, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
      });
    }

    return apiError("No AI API key configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.", 400);
  } catch (err) {
    return apiError(safeErrorMessage(err), 500);
  }
}

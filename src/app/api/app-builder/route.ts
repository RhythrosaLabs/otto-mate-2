import { NextRequest } from "next/server";
import { callLLMWithFallback } from "@/lib/model-fallback";

// ---------------------------------------------------------------------------
// App Builder API — AI-powered full-stack web app generation
// Uses Bolt.new-style artifact format for structured multi-file output
// ---------------------------------------------------------------------------

const APP_BUILDER_SYSTEM = `You are Ottomate App Builder — an expert web application builder AI comparable to Bolt.new, Lovable, and Replit Agent. You generate complete, production-quality, multi-file web applications from natural language descriptions.

<artifact_instructions>
  You can create and update files using a structured artifact format.

  1. CRITICAL: Think HOLISTICALLY about the ENTIRE project. Consider ALL files, their relationships, and how they interact.

  2. IMPORTANT: When creating a project, ALWAYS split your code into MULTIPLE files:
     - \`index.html\` — the main HTML document
     - \`styles.css\` — all CSS styles (or split further: \`reset.css\`, \`layout.css\`, \`components.css\`)
     - \`app.js\` — main application logic
     - Additional JS files for distinct features/modules (e.g., \`utils.js\`, \`api.js\`, \`components.js\`, \`data.js\`, \`chart.js\`)
     - NEVER put everything in a single HTML file. ALWAYS use at least 3 separate files.

  3. IMPORTANT: The HTML file MUST reference the CSS and JS files using standard tags:
     - CSS: \`<link rel="stylesheet" href="styles.css">\`
     - JS: \`<script src="app.js"></script>\` (before closing </body>)
     - ALWAYS put the script tag right before </body> for proper DOM loading.

  4. ALWAYS provide the COMPLETE, updated content of EVERY file. Never use placeholders like "// rest of code here" or "/* ... */" or "<!-- existing code -->". Every file must be fully self-contained.

  5. Use CDN links for external libraries:
     - Tailwind CSS: \`<script src="https://cdn.tailwindcss.com"></script>\`
     - Chart.js: \`<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>\`
     - D3.js: \`<script src="https://cdn.jsdelivr.net/npm/d3@7"></script>\`
     - Lucide Icons: \`<script src="https://unpkg.com/lucide@latest"></script>\` then call \`lucide.createIcons()\`
     - Google Fonts: \`<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">\`
     - Alpine.js: \`<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>\`
     - Three.js: \`<script src="https://cdn.jsdelivr.net/npm/three@latest/build/three.min.js"></script>\`
     - GSAP: \`<script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>\`
     - Anime.js: \`<script src="https://cdn.jsdelivr.net/npm/animejs@3/lib/anime.min.js"></script>\`

  6. CRITICAL: When modifying existing files, you MUST include ALL files — unchanged files included. Do NOT omit files that haven't changed.

  7. Organize code logically:
     - Separate concerns: structure (HTML), presentation (CSS), behavior (JS)
     - Break large JS files into modules by feature
     - For apps with multiple views/pages, use separate JS files for each
     - For apps with data, put mock/sample data in a separate \`data.js\` file

  8. IMPORTANT: File creation ORDER matters. Create files in this order:
     - HTML file(s) first
     - CSS file(s) next
     - JavaScript file(s) last

  9. Make every application responsive and mobile-friendly using CSS media queries or Tailwind responsive classes.

  10. Include proper error handling, loading states, and edge cases in JavaScript.

  11. Use ES6+ features: const/let, arrow functions, template literals, destructuring, async/await, modules.

  12. Add meaningful comments in each file explaining the structure and key logic.

  13. ALWAYS generate real, functional code. The app must actually work — buttons should do something, forms should process, data should display.

  14. For complex state management, use a simple state pattern or Alpine.js for reactivity.
</artifact_instructions>

<artifact_format>
  You MUST use this EXACT format to output project files:

  <boltArtifact id="project-id" title="Human Readable Project Title">
  <boltAction type="file" filePath="index.html">
  file content here
  </boltAction>
  <boltAction type="file" filePath="styles.css">
  file content here
  </boltAction>
  <boltAction type="file" filePath="app.js">
  file content here
  </boltAction>
  </boltArtifact>

  Rules:
  - The \`id\` attribute should be a kebab-case identifier for the project
  - The \`title\` attribute is the human-readable project name
  - Each \`<boltAction type="file" filePath="...">\` contains EXACTLY one file
  - The \`filePath\` is relative (e.g., "styles.css", "js/utils.js", "components/header.js")
  - File content goes between the opening and closing \`boltAction\` tags
  - Do NOT nest boltAction tags
  - Do NOT include any text outside the boltArtifact tags (no explanations before/after)
</artifact_format>

<design_system>
  Apply this premium design system unless told otherwise:
  - Background: Rich dark (#0a0a0b, #111113) or clean white (#fafafa, #ffffff)
  - Cards: Subtle borders (1px border rgba(255,255,255,0.06)), glass morphism (backdrop-filter: blur), soft shadows
  - Accent Colors: Vibrant teal (#20b2aa), electric blue (#3b82f6), or rich purple (#8b5cf6)
  - Typography: Inter or Plus Jakarta Sans, clear visual hierarchy (h1: 2.5rem+, h2: 1.75rem, body: 0.875-1rem)
  - Spacing: Generous padding (1.5-3rem for sections, 1-1.5rem for cards), breathing room between elements
  - Border Radius: 12-16px for cards, 8-10px for buttons, 6px for inputs
  - Animations: Subtle entrance animations (opacity+translateY), smooth transitions (200-300ms ease), micro-interactions on hover
  - Hover States: Slight scale (1.02-1.05), color shifts, shadow increases, border color changes
  - Gradients: Subtle background gradients, gradient text for headings, gradient borders
  - Layout: CSS Grid for page layouts, Flexbox for component layouts, max-width containers
  - Icons: Lucide icons via CDN, consistent size (16-24px), proper alignment
  - Forms: Focus rings (box-shadow with accent color), placeholder text, proper labels
  - Make it look like it was designed by a top Silicon Valley product team
</design_system>

<examples>
  <example>
    <user_query>Build a todo app</user_query>
    <assistant_response>
I'll build a beautiful, full-featured todo app with categories, priority levels, and local storage persistence.

<boltArtifact id="todo-app" title="Todo App">
<boltAction type="file" filePath="index.html">
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Todo App</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="styles.css" />
</head>
<body class="bg-[#0a0a0b] text-white min-h-screen font-['Inter']">
  <div id="app" class="max-w-2xl mx-auto px-4 py-12">
    <header class="text-center mb-10">
      <h1 class="text-3xl font-bold bg-gradient-to-r from-teal-400 to-cyan-300 bg-clip-text text-transparent">My Todos</h1>
      <p class="text-gray-500 text-sm mt-2">Stay organized, stay productive</p>
    </header>
    <div id="todo-input-section"></div>
    <div id="todo-filters"></div>
    <div id="todo-list"></div>
    <div id="todo-stats"></div>
  </div>
  <script src="data.js"></script>
  <script src="utils.js"></script>
  <script src="app.js"></script>
</body>
</html>
</boltAction>
<boltAction type="file" filePath="styles.css">
/* Base styles and animations */
* { margin: 0; padding: 0; box-sizing: border-box; }
/* ... full CSS file ... */
</boltAction>
<boltAction type="file" filePath="data.js">
// Sample data and categories
const CATEGORIES = ['Work', 'Personal', 'Shopping', 'Health'];
/* ... */
</boltAction>
<boltAction type="file" filePath="utils.js">
// Utility functions
function generateId() { return Math.random().toString(36).slice(2, 10); }
/* ... */
</boltAction>
<boltAction type="file" filePath="app.js">
// Main application logic
class TodoApp {
  constructor() { /* ... */ }
  /* ... full implementation ... */
}
new TodoApp();
</boltAction>
</boltArtifact>
    </assistant_response>
  </example>
</examples>

CRITICAL REMINDER: You MUST output at least 3 separate files (HTML + CSS + JS minimum). NEVER combine everything into one file. ALWAYS use the <boltArtifact> and <boltAction> tags. Do NOT output JSON. Do NOT output raw code blocks. ONLY use the artifact format.`;

// ---------------------------------------------------------------------------
// POST /api/app-builder
// Streams the AI response for app generation/modification
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, currentFiles, conversationHistory, mode } = body as {
      prompt: string;
      currentFiles?: Record<string, string>;
      conversationHistory?: Array<{ role: string; content: string }>;
      mode?: "generate" | "modify" | "explain" | "fix";
    };

    if (!prompt?.trim()) {
      return new Response(JSON.stringify({ error: "Prompt is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Build conversation messages
    const messages: Array<{ role: string; content: string }> = [];

    // Add conversation history if present
    if (conversationHistory?.length) {
      for (const msg of conversationHistory) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    // Build user prompt with artifact format instructions
    let userPrompt = "";

    if ((mode === "modify" || mode === "fix") && currentFiles) {
      userPrompt = `Here are the current project files:\n\n`;
      for (const [path, content] of Object.entries(currentFiles)) {
        userPrompt += `<file path="${path}">\n${content}\n</file>\n\n`;
      }
      if (mode === "fix") {
        userPrompt += `\nThe issue/bug is: ${prompt}\n\nFix the bug and return ALL files (including unchanged ones) using the <boltArtifact> format.`;
      } else {
        userPrompt += `\nPlease make the following changes: ${prompt}\n\nReturn ALL files (including unchanged ones) using the <boltArtifact> format.`;
      }
    } else if (mode === "explain" && currentFiles) {
      userPrompt = `Here are my project files:\n\n`;
      for (const [path, content] of Object.entries(currentFiles)) {
        userPrompt += `<file path="${path}">\n${content}\n</file>\n\n`;
      }
      userPrompt += `\nPlease explain: ${prompt}\n\nFor explanations, respond with plain text/markdown — do NOT use the artifact format.`;
    } else {
      userPrompt = `Build a complete web application: ${prompt}\n\nRemember: Use the <boltArtifact> format with MULTIPLE separate files (HTML + CSS + JS minimum). Make it beautiful and fully functional.`;
    }

    messages.push({ role: "user", content: userPrompt });

    // Stream the response with heartbeat progress
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial status
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "progress", stage: "connecting", message: "Connecting to AI model..." })}\n\n`)
          );

          // Start heartbeat so the client knows we're alive
          const progressMessages = [
            "Analyzing requirements...",
            "Planning project structure...",
            "Designing component architecture...",
            "Generating HTML structure...",
            "Writing CSS styles...",
            "Building JavaScript logic...",
            "Creating responsive layouts...",
            "Adding animations & interactions...",
            "Polishing design details...",
            "Optimizing code quality...",
            "Finalizing project files...",
            "Almost there...",
          ];
          let heartbeatIdx = 0;
          const heartbeat = setInterval(() => {
            const msg = progressMessages[Math.min(heartbeatIdx, progressMessages.length - 1)];
            try {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "progress", stage: "generating", message: msg, step: heartbeatIdx + 1 })}\n\n`)
              );
            } catch { /* controller may be closed */ }
            heartbeatIdx++;
          }, 4000);

          const result = await callLLMWithFallback({
            system: APP_BUILDER_SYSTEM,
            messages,
            maxTokens: 64000,
            temperature: 0.6,
            lightweight: false,
          });

          clearInterval(heartbeat);

          // Notify that we're now streaming the result
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "progress", stage: "streaming", message: "Streaming generated code..." })}\n\n`)
          );

          // Send the result in chunks to simulate streaming
          const text = result.text;
          const chunkSize = 200;
          for (let i = 0; i < text.length; i += chunkSize) {
            const chunk = text.slice(i, i + chunkSize);
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "chunk", content: chunk })}\n\n`)
            );
            // Small delay for visual streaming effect
            await new Promise((r) => setTimeout(r, 5));
          }

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "done", provider: result.provider, model: result.model })}\n\n`
            )
          );
          controller.close();
        } catch (err) {
          clearInterval(heartbeat);
          const errMsg = err instanceof Error ? err.message : "Unknown error";
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "error", error: errMsg })}\n\n`)
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

#!/usr/bin/env node
/**
 * Ottomatron Tutorial Video Test
 * 
 * Records a guided walkthrough of the Ottomatron UI using Playwright's
 * built-in video recording. The output is saved to docs/videos/.
 *
 * Usage:
 *   node scripts/tutorial-video.js
 *
 * Prerequisites:
 *   - Dev server running on http://localhost:3000
 *   - Playwright installed (npx playwright install chromium)
 *
 * Output:
 *   - docs/videos/tutorial-walkthrough.webm  — full app walkthrough
 *   - docs/videos/tutorial-frames/           — key frame screenshots
 */

const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const BASE = "http://localhost:3000";
const VIDEO_DIR = path.join(__dirname, "..", "docs", "videos");
const FRAMES_DIR = path.join(VIDEO_DIR, "tutorial-frames");

// Ensure output dirs exist
fs.mkdirSync(VIDEO_DIR, { recursive: true });
fs.mkdirSync(FRAMES_DIR, { recursive: true });

// Tutorial steps — each is a scene in the walkthrough
const TUTORIAL_STEPS = [
  {
    name: "01-home",
    title: "Home — The Prompt Interface",
    narration: "This is the Ottomatron home screen. Type any goal in the prompt box, use slash commands like /image or /research, attach files, or choose from the prompt gallery below.",
    url: "/computer",
    actions: async (page) => {
      await page.waitForTimeout(2000);
      // Click into the textarea to show focus state
      const textarea = page.locator("textarea").first();
      if (await textarea.isVisible()) {
        await textarea.click({ force: true });
        await page.waitForTimeout(500);
        await textarea.fill("Build me a landing page for a SaaS product");
        await page.waitForTimeout(1500);
        await textarea.fill("");
      }
      await page.waitForTimeout(1000);
    },
  },
  {
    name: "02-slash-commands",
    title: "Slash Commands",
    narration: "Type / to see available slash commands — /image, /research, /code, /email, /video, /scrape, and more. Each triggers a specialized workflow.",
    url: "/computer",
    actions: async (page) => {
      await page.waitForTimeout(1000);
      const textarea = page.locator("textarea").first();
      if (await textarea.isVisible()) {
        await textarea.click({ force: true });
        await textarea.fill("/");
        await page.waitForTimeout(2000);
        await textarea.fill("");
      }
      await page.waitForTimeout(500);
    },
  },
  {
    name: "03-connectors",
    title: "Connectors — 100+ Integrations",
    narration: "Connect to Gmail, Slack, GitHub, Jira, Stripe, Notion, WhatsApp, and 100+ more services. OAuth sign-in or paste an API key. 35+ connectors have completely free tiers.",
    url: "/computer/connectors",
    actions: async (page) => {
      await page.waitForTimeout(2000);
      // Scroll down to show more connectors
      await page.evaluate(() => window.scrollBy(0, 400));
      await page.waitForTimeout(1500);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);
    },
  },
  {
    name: "04-skills",
    title: "Skills Marketplace — 200+ Pre-built",
    narration: "Browse 200+ pre-built skills across writing, code, research, data, marketing, business, creative, finance, legal, and more. Install one, or create your own custom skill with specific instructions.",
    url: "/computer/skills",
    actions: async (page) => {
      await page.waitForTimeout(2500);
    },
  },
  {
    name: "05-playground",
    title: "Playground — Run Any ML Model",
    narration: "The Playground lets you run thousands of models from Replicate and HuggingFace. Generate images with FLUX, create music with MusicGen, upscale with Real-ESRGAN, remove backgrounds, and more. Compare models side-by-side in multi-column view.",
    url: "/computer/playground",
    actions: async (page) => {
      await page.waitForTimeout(2500);
    },
  },
  {
    name: "06-dreamscape",
    title: "Dreamscape — AI Creative Studio",
    narration: "Dreamscape is a 17-mode AI creative studio powered by Luma Dream Machine. Create videos, images, audio, and more. Use 20 camera presets, character identity persistence, style references, and the AI Director chat to build multi-shot sequences from natural language.",
    url: "/computer/dreamscape",
    actions: async (page) => {
      await page.waitForTimeout(2500);
    },
  },
  {
    name: "07-pipelines",
    title: "Pipelines — Visual DAG Builder",
    narration: "Chain tasks together with the visual pipeline builder. Add nodes, draw dependency arrows, and run the whole pipeline. Nodes execute in dependency order with real-time status tracking.",
    url: "/computer/pipelines",
    actions: async (page) => {
      await page.waitForTimeout(2500);
    },
  },
  {
    name: "08-scheduled",
    title: "Scheduled Tasks — Cron Automation",
    narration: "Schedule any task to run automatically with one-time, interval, daily, weekly, or full cron expressions. Enable or disable individual schedules.",
    url: "/computer/scheduled",
    actions: async (page) => {
      await page.waitForTimeout(2000);
    },
  },
  {
    name: "09-templates",
    title: "Templates — One-Click Task Presets",
    narration: "Create reusable task templates by category. Hit Run and the agent executes the template prompt instantly — or customize before launching.",
    url: "/computer/templates",
    actions: async (page) => {
      await page.waitForTimeout(2000);
    },
  },
  {
    name: "10-gallery",
    title: "Gallery — Community Examples",
    narration: "Browse community example tasks by category. Click any example to see the full prompt, then run it with one click or customize before launching.",
    url: "/computer/gallery",
    actions: async (page) => {
      await page.waitForTimeout(2000);
    },
  },
];

(async () => {
  console.log("🎬 Ottomatron Tutorial Video Recorder\n");
  console.log("Launching browser with video recording...\n");

  const browser = await chromium.launch({ headless: true });

  // Create context with video recording enabled
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
    recordVideo: {
      dir: VIDEO_DIR,
      size: { width: 1440, height: 900 },
    },
  });

  const page = await context.newPage();

  // Walk through each tutorial step
  for (let i = 0; i < TUTORIAL_STEPS.length; i++) {
    const step = TUTORIAL_STEPS[i];
    const stepNum = String(i + 1).padStart(2, "0");
    console.log(`  Scene ${stepNum}/${TUTORIAL_STEPS.length}: ${step.title}`);
    console.log(`    → ${step.narration.substring(0, 80)}...`);

    try {
      await page.goto(BASE + step.url, { waitUntil: "networkidle", timeout: 15000 });
      await step.actions(page);

      // Capture key frame
      await page.screenshot({
        path: path.join(FRAMES_DIR, `${step.name}.png`),
        fullPage: false,
      });
    } catch (err) {
      console.log(`    ⚠️  Error: ${err.message}`);
    }
  }

  // Final pause before closing
  await page.waitForTimeout(2000);

  // Close page to finalize video
  await page.close();
  await context.close();
  await browser.close();

  // Find the recorded video file and rename it
  const files = fs.readdirSync(VIDEO_DIR).filter(f => f.endsWith(".webm"));
  if (files.length > 0) {
    const latest = files.sort().pop();
    const src = path.join(VIDEO_DIR, latest);
    const dest = path.join(VIDEO_DIR, "tutorial-walkthrough.webm");
    if (src !== dest) {
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      fs.renameSync(src, dest);
    }
    const size = (fs.statSync(dest).size / 1024 / 1024).toFixed(1);
    console.log(`\n✅ Video saved: docs/videos/tutorial-walkthrough.webm (${size} MB)`);
  } else {
    console.log("\n⚠️  No video file found — check Playwright video recording setup");
  }

  console.log(`✅ Key frames saved: docs/videos/tutorial-frames/`);
  console.log(`\n📋 Tutorial Script (${TUTORIAL_STEPS.length} scenes):\n`);
  TUTORIAL_STEPS.forEach((step, i) => {
    console.log(`  ${String(i + 1).padStart(2, "0")}. ${step.title}`);
    console.log(`      ${step.narration}\n`);
  });
})();

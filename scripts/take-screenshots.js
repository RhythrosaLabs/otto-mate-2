#!/usr/bin/env node
/**
 * Capture screenshots of every major Ottomatron page using Playwright.
 * Usage: node scripts/take-screenshots.js
 */

const { chromium } = require("playwright");
const path = require("path");

const BASE = "http://localhost:3000";
const OUT = path.join(__dirname, "..", "docs", "screenshots");

const PAGES = [
  { name: "home",        path: "/computer",              wait: 2000 },
  { name: "tasks",       path: "/computer/tasks",        wait: 2000 },
  { name: "files",       path: "/computer/files",        wait: 2000 },
  { name: "connectors",  path: "/computer/connectors",   wait: 2000 },
  { name: "skills",      path: "/computer/skills",       wait: 2000 },
  { name: "playground",  path: "/computer/playground",   wait: 2000 },
  { name: "dreamscape",  path: "/computer/dreamscape",   wait: 2000 },
  { name: "pipelines",   path: "/computer/pipelines",    wait: 2000 },
  { name: "analytics",   path: "/computer/analytics",    wait: 2000 },
  { name: "settings",    path: "/computer/settings",     wait: 2000 },
  { name: "memory",      path: "/computer/memory",       wait: 2000 },
  { name: "templates",   path: "/computer/templates",    wait: 2000 },
  { name: "scheduled",   path: "/computer/scheduled",    wait: 2000 },
  { name: "sessions",    path: "/computer/sessions",     wait: 2000 },
  { name: "channels",    path: "/computer/channels",     wait: 2000 },
  { name: "audit",       path: "/computer/audit",        wait: 2000 },
  { name: "gallery",     path: "/computer/gallery",      wait: 2000 },
];

(async () => {
  console.log("Launching browser...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
  });

  for (const page of PAGES) {
    const p = await context.newPage();
    const url = BASE + page.path;
    console.log(`  📸 ${page.name} → ${url}`);
    try {
      await p.goto(url, { waitUntil: "networkidle", timeout: 15000 });
      await p.waitForTimeout(page.wait);
      await p.screenshot({
        path: path.join(OUT, `${page.name}.png`),
        fullPage: false,
      });
    } catch (err) {
      console.log(`  ⚠️  Failed: ${page.name} — ${err.message}`);
    }
    await p.close();
  }

  await browser.close();
  console.log(`\n✅ Screenshots saved to ${OUT}`);
})();

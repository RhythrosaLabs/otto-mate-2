const { chromium } = require("playwright");
const path = require("path");
const OUT = path.join(__dirname, "..", "docs", "screenshots");
const PAGES = [
  { name: "settings",  path: "/computer/settings",              wait: 2000 },
  { name: "firefly",   path: "/computer/firefly/generate/image", wait: 2000 },
  { name: "documents", path: "/computer/documents",              wait: 2000 },
];
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: "dark" });
  for (const pg of PAGES) {
    const p = await ctx.newPage();
    console.log("  📸 " + pg.name);
    try {
      await p.goto("http://localhost:3000" + pg.path, { waitUntil: "networkidle", timeout: 15000 });
      await p.waitForTimeout(pg.wait);
      await p.screenshot({ path: path.join(OUT, pg.name + ".png"), fullPage: false });
    } catch (e) { console.log("  ⚠️ " + pg.name + ": " + e.message); }
    await p.close();
  }
  await browser.close();
  console.log("Done");
})();

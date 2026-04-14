#!/usr/bin/env node
/**
 * Build a ~45s slideshow video from screenshots with text overlays,
 * title/end screens, and background music.
 *
 * Uses Playwright to render HTML caption overlays onto screenshots,
 * then ffmpeg to stitch them into a video with music.
 */
const { execSync } = require("child_process");
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const SS = path.join(__dirname, "..", "docs", "screenshots");
const VID = path.join(__dirname, "..", "docs", "videos");
const MUSIC = path.join(VID, "music.m4a");
const OUT = path.join(VID, "ottomate-walkthrough.mp4");
const FRAMES = path.join(VID, "_frames");
const W = 1920;
const H = 1080;

// Slides: file, duration in seconds, caption line 1, caption line 2
const SLIDES = [
  { type: "title", dur: 5 },
  { img: "home.png",        dur: 4, c1: "Home Dashboard",         c2: "Create tasks with natural language" },
  { img: "dreamscape.png",  dur: 5, c1: "Dreamscape Studio",      c2: "AI video & image production pipeline" },
  { img: "playground.png",  dur: 4, c1: "Multi-Model Playground",  c2: "Run any model — FLUX, DALL-E, Luma, Replicate" },
  { img: "gallery.png",     dur: 4, c1: "Gallery",                 c2: "Browse all generated media in one place" },
  { img: "connectors.png",  dur: 4, c1: "90+ Connectors",         c2: "Plug in any API — AI, social, payments, more" },
  { img: "skills.png",      dur: 4, c1: "Custom Skills",           c2: "Teach your agent new abilities" },
  { img: "pipelines.png",   dur: 4, c1: "Visual Pipelines",        c2: "Chain tasks into automated workflows" },
  { img: "templates.png",   dur: 4, c1: "Templates",               c2: "One-click task templates" },
  { img: "settings.png",    dur: 3, c1: "Settings & Health",       c2: "Full system configuration" },
  { type: "end", dur: 6 },
];

function titleHTML() {
  return `<!DOCTYPE html><html><head><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { width: ${W}px; height: ${H}px; background: #09090f; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .title { font-size: 88px; font-weight: 700; color: #fff; letter-spacing: 6px; margin-bottom: 16px; }
    .sub { font-size: 32px; color: #aaa; margin-bottom: 8px; }
    .sub2 { font-size: 24px; color: #666; }
    .glow { text-shadow: 0 0 60px rgba(100,180,255,0.3); }
  </style></head><body>
    <div class="title glow">OTTOMATE</div>
    <div class="sub">AI Workspace — Open Source</div>
    <div class="sub2">Multi-Agent Orchestration Platform</div>
  </body></html>`;
}

function endHTML() {
  return `<!DOCTYPE html><html><head><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { width: ${W}px; height: ${H}px; background: #09090f; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .title { font-size: 64px; font-weight: 700; color: #fff; margin-bottom: 24px; }
    .link { font-size: 32px; color: #6CB4EE; margin-bottom: 20px; }
    .star { font-size: 26px; color: #aaa; margin-bottom: 12px; }
    .lic { font-size: 22px; color: #555; }
    .glow { text-shadow: 0 0 40px rgba(100,180,255,0.25); }
  </style></head><body>
    <div class="title glow">Try Ottomate</div>
    <div class="link">github.com/RhythrosaLabs/otto-mate-2</div>
    <div class="star">⭐ Star the repo — it helps a lot</div>
    <div class="lic">MIT License — Free &amp; Open Source</div>
  </body></html>`;
}

function slideHTML(imgBase64, c1, c2) {
  return `<!DOCTYPE html><html><head><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { width: ${W}px; height: ${H}px; background: #09090f; position: relative; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .bg { width: 100%; height: 100%; object-fit: contain; display: block; }
    .caption { position: absolute; bottom: 0; left: 0; right: 0; height: 140px; background: linear-gradient(transparent, rgba(0,0,0,0.85)); display: flex; flex-direction: column; align-items: center; justify-content: center; padding-bottom: 12px; }
    .c1 { font-size: 38px; font-weight: 600; color: #fff; margin-bottom: 6px; text-shadow: 0 2px 8px rgba(0,0,0,0.7); }
    .c2 { font-size: 22px; color: #bbb; text-shadow: 0 1px 4px rgba(0,0,0,0.5); }
  </style></head><body>
    <img class="bg" src="data:image/png;base64,${imgBase64}" />
    <div class="caption">
      <div class="c1">${c1}</div>
      <div class="c2">${c2}</div>
    </div>
  </body></html>`;
}

(async () => {
  // Clean up previous frames
  if (fs.existsSync(FRAMES)) fs.rmSync(FRAMES, { recursive: true });
  fs.mkdirSync(FRAMES, { recursive: true });

  console.log("🖌  Rendering slide frames with Playwright...\n");

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    colorScheme: "dark",
  });

  const clips = [];
  let idx = 0;

  for (const slide of SLIDES) {
    const framePath = path.join(FRAMES, `frame_${String(idx).padStart(2, "0")}.png`);
    const clipPath = path.join(FRAMES, `clip_${String(idx).padStart(2, "0")}.mp4`);
    clips.push(clipPath);

    const page = await ctx.newPage();
    let html;

    if (slide.type === "title") {
      html = titleHTML();
      console.log("  🎬 Title screen");
    } else if (slide.type === "end") {
      html = endHTML();
      console.log("  🎬 End screen");
    } else {
      const imgBuf = fs.readFileSync(path.join(SS, slide.img));
      const imgBase64 = imgBuf.toString("base64");
      html = slideHTML(imgBase64, slide.c1, slide.c2);
      console.log(`  🎬 ${slide.img} — "${slide.c1}"`);
    }

    await page.setContent(html);
    await page.waitForTimeout(300);
    await page.screenshot({ path: framePath, type: "png" });
    await page.close();

    // Convert frame to a video clip with fade in/out
    const fadeIn = slide.type ? 1 : 0.5;
    const fadeOut = slide.type ? 1 : 0.5;
    const fadeOutStart = Math.max(0, slide.dur - fadeOut);
    execSync(
      `ffmpeg -y -loop 1 -i "${framePath}" -vf "` +
      `scale=${W}:${H},format=yuv420p,` +
      `fade=t=in:st=0:d=${fadeIn},` +
      `fade=t=out:st=${fadeOutStart}:d=${fadeOut}` +
      `" -c:v libx264 -preset fast -crf 22 -t ${slide.dur} -r 30 -an "${clipPath}" 2>/dev/null`
    );

    idx++;
  }

  await browser.close();

  // --- Concatenate all clips ---
  const listFile = path.join(FRAMES, "concat.txt");
  fs.writeFileSync(listFile, clips.map((c) => `file '${c}'`).join("\n"));

  console.log("\n  🔗 Concatenating slides...");
  const slidesOnly = path.join(FRAMES, "slides_only.mp4");
  execSync(`ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy "${slidesOnly}" 2>/dev/null`);

  // --- Add music ---
  console.log("  🎵 Adding music...");
  execSync(
    `ffmpeg -y -i "${slidesOnly}" -i "${MUSIC}" ` +
    `-c:v copy -c:a aac -b:a 128k -shortest -map 0:v:0 -map 1:a:0 "${OUT}" 2>/dev/null`
  );

  // --- Cleanup ---
  fs.rmSync(FRAMES, { recursive: true });

  const sz = fs.statSync(OUT).size;
  console.log(`\n✅ Video saved: ${OUT}`);
  console.log(`   Size: ${(sz / 1024 / 1024).toFixed(1)} MB`);
  console.log(`   Duration: ~${SLIDES.reduce((a, s) => a + s.dur, 0)}s`);
})();

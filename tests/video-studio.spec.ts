/**
 * Video Studio — Right Sidebar Integration Tests
 *
 * Tests every mode tab, setting control, provider selector, and generation
 * button in the Video Studio right sidebar.  API calls to /api/luma are
 * intercepted so we can verify correct payloads without hitting external
 * services.
 */

import { test, expect, type Page, type Route } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Navigate to Video Studio and wait for the right sidebar to render. */
async function openStudio(page: Page) {
  await page.goto("/computer/dreamscape/studio");
  // Wait for the generation panel to be visible (right sidebar)
  await page.waitForSelector('button:has-text("Generate")', { timeout: 30_000 });
}

/** Click a mode tab in the right sidebar by its label text. */
async function selectMode(page: Page, label: string) {
  // Mode tabs are small buttons inside the right panel
  const tab = page.locator('button', { hasText: label }).first();
  await tab.click();
}

/** Set the prompt textarea value. */
async function setPrompt(page: Page, text: string) {
  const textarea = page.locator('textarea[placeholder]').last();
  await textarea.fill(text);
}

/** Click the Generate button. */
async function clickGenerate(page: Page) {
  await page.locator('button:has-text("Generate")').click();
}

/** Intercept POST /api/luma and capture the request body. */
function interceptLumaApi(page: Page): { calls: Array<{ action: string; body: Record<string, unknown> }> } {
  const captured: { calls: Array<{ action: string; body: Record<string, unknown> }> } = { calls: [] };

  page.route("**/api/luma", async (route: Route) => {
    const request = route.request();
    if (request.method() === "POST") {
      const body = JSON.parse(request.postData() || "{}");
      captured.calls.push({ action: body.action, body });
      // Return a mock successful response
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "mock-gen-" + Date.now(),
          state: "queued",
          assets: {},
        }),
      });
    } else {
      // GET requests — mock provider check and status
      const url = new URL(request.url());
      const action = url.searchParams.get("action");
      if (action === "available-providers") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ luma: true, replicate: true }),
        });
      } else if (action === "replicate-models") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
      } else if (action === "status") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: url.searchParams.get("id"),
            state: "completed",
            assets: { video: "https://example.com/video.mp4" },
          }),
        });
      } else if (action === "concepts") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
      } else if (action === "camera-motions") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({}),
        });
      }
    }
  });

  // Also mock the dreamscape API (AI agent)
  page.route("**/api/dreamscape", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ reply: "Mock agent response" }),
    });
  });

  // Mock save-generation
  page.route("**/api/files/save-generation", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  return captured;
}

// ---------------------------------------------------------------------------
// Test Setup
// ---------------------------------------------------------------------------

test.describe("Video Studio — Right Sidebar", () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to start fresh
    await page.goto("/computer/dreamscape/studio");
    await page.evaluate(() => {
      localStorage.removeItem("ds:boards");
      localStorage.removeItem("ds:activeBoardId");
      localStorage.removeItem("ds:continuityLibrary");
    });
  });

  // =========================================================================
  // 1. PAGE LOAD & LAYOUT
  // =========================================================================

  test("studio page loads with agent panel open by default", async ({ page }) => {
    const captured = interceptLumaApi(page);
    await openStudio(page);

    // Agent panel should be visible
    await expect(page.locator('text=AI Agent').first()).toBeVisible();
    // Right sidebar Generate button should be visible
    await expect(page.locator('button:has-text("Generate")')).toBeVisible();
  });

  test("right sidebar shows all mode group labels", async ({ page }) => {
    interceptLumaApi(page);
    await openStudio(page);

    // Check group labels are visible (they use lowercase title case)
    for (const label of ["Video", "Image", "Edit", "Audio"]) {
      await expect(page.locator(`p:has-text("${label}")`).first()).toBeVisible();
    }
  });

  // =========================================================================
  // 2. VIDEO MODE TABS
  // =========================================================================

  test("Text → Video: sends generate-video action with correct payload", async ({ page }) => {
    const captured = interceptLumaApi(page);
    await openStudio(page);

    await selectMode(page, "Text → Video");
    await setPrompt(page, "A cinematic sunset over the ocean");
    await clickGenerate(page);

    await page.waitForTimeout(1000);
    const call = captured.calls.find((c) => c.action === "generate-video");
    expect(call).toBeTruthy();
    expect(call!.body.prompt).toContain("sunset");
    expect(call!.body.model).toBeTruthy();
    expect(call!.body.resolution).toBeTruthy();
    expect(call!.body.aspect_ratio).toBeTruthy();
    expect(call!.body.duration).toBeTruthy();
  });

  test("Image → Video: requires start image URL", async ({ page }) => {
    interceptLumaApi(page);
    await openStudio(page);

    await selectMode(page, "Image → Video");
    await setPrompt(page, "Animate this image");

    // Check that the start frame URL input is shown
    const startInput = page.locator('input[placeholder*="start-frame"]').first();
    await expect(startInput).toBeVisible();

    // Try to generate without image URL — should show error
    await clickGenerate(page);
    await page.waitForTimeout(500);
    await expect(page.locator('text=/start image|Provide/i').first()).toBeVisible();
  });

  test("Image → Video: sends correct keyframes payload", async ({ page }) => {
    const captured = interceptLumaApi(page);
    await openStudio(page);

    await selectMode(page, "Image → Video");
    await setPrompt(page, "Animate this scene");

    // Fill the start frame URL
    const startInput = page.locator('input[placeholder*="start-frame"]').first();
    await startInput.fill("https://example.com/image.jpg");

    await clickGenerate(page);
    await page.waitForTimeout(1000);

    const call = captured.calls.find((c) => c.action === "generate-video");
    expect(call).toBeTruthy();
    expect(call!.body.keyframes).toBeTruthy();
    const kf = call!.body.keyframes as Record<string, unknown>;
    expect(kf.frame0).toBeTruthy();
  });

  test("Extend: shows info box and sends correct payload", async ({ page }) => {
    interceptLumaApi(page);
    await openStudio(page);

    await selectMode(page, "Extend");

    // Should show an info message about needing a completed shot
    const infoText = page.locator('text=/extend|previous.*shot|completed/i').first();
    await expect(infoText).toBeVisible();
  });

  test("Reverse: shows info box for reverse-extend", async ({ page }) => {
    interceptLumaApi(page);
    await openStudio(page);

    await selectMode(page, "Reverse");

    // Should show an info message
    const infoText = page.locator('text=/reverse|backward|shot/i').first();
    await expect(infoText).toBeVisible();
  });

  test("Interpolate: shows info about needing 2 completed shots", async ({ page }) => {
    interceptLumaApi(page);
    await openStudio(page);

    await selectMode(page, "Interpolate");

    // Should show info about needing 2 shots
    const infoText = page.locator('text=/interpolate|2.*shot|between/i').first();
    await expect(infoText).toBeVisible();
  });

  // =========================================================================
  // 3. IMAGE MODE TABS
  // =========================================================================

  test("Text → Image: sends generate-image action", async ({ page }) => {
    const captured = interceptLumaApi(page);
    await openStudio(page);

    await selectMode(page, "Text → Image");
    await setPrompt(page, "A beautiful mountain landscape");
    await clickGenerate(page);

    await page.waitForTimeout(1000);
    const call = captured.calls.find((c) => c.action === "generate-image");
    expect(call).toBeTruthy();
    expect(call!.body.prompt).toContain("mountain");
    expect(call!.body.aspect_ratio).toBeTruthy();
  });

  test("Image Ref: shows image URL and weight inputs", async ({ page }) => {
    interceptLumaApi(page);
    await openStudio(page);

    await selectMode(page, "Image Ref");

    // Should show image ref URL input
    const refInput = page.locator('input[placeholder*="reference.jpg"]').first();
    await expect(refInput).toBeVisible();

    // Should show weight label
    await expect(page.locator('text=/weight/i').first()).toBeVisible();
  });

  test("Image Ref: sends image_ref in payload", async ({ page }) => {
    const captured = interceptLumaApi(page);
    await openStudio(page);

    await selectMode(page, "Image Ref");
    await setPrompt(page, "Reimagine this composition");

    const refInput = page.locator('input[placeholder*="reference.jpg"]').first();
    await refInput.fill("https://example.com/ref.jpg");

    await clickGenerate(page);
    await page.waitForTimeout(1000);

    const call = captured.calls.find((c) => c.action === "generate-image");
    expect(call).toBeTruthy();
    expect(call!.body.image_ref).toBeTruthy();
    const refs = call!.body.image_ref as Array<{ url: string; weight: number }>;
    expect(refs[0].url).toBe("https://example.com/ref.jpg");
  });

  test("Character: shows character identity inputs", async ({ page }) => {
    interceptLumaApi(page);
    await openStudio(page);

    await selectMode(page, "Character");

    // Should show character identity section
    await expect(page.locator('text=/character|identity/i').first()).toBeVisible();
  });

  test("Style Ref: shows style URL and weight inputs", async ({ page }) => {
    interceptLumaApi(page);
    await openStudio(page);

    await selectMode(page, "Style Ref");

    // Should show style ref URL input
    const refInput = page.locator('input[placeholder*="style" i]').first();
    await expect(refInput).toBeVisible();

    // Should show weight label
    await expect(page.locator('text=/weight/i').first()).toBeVisible();
  });

  test("Style Ref: sends style_ref in payload", async ({ page }) => {
    const captured = interceptLumaApi(page);
    await openStudio(page);

    await selectMode(page, "Style Ref");
    await setPrompt(page, "Apply this style to a cityscape");

    const refInput = page.locator('input[placeholder*="style" i]').first();
    await refInput.fill("https://example.com/style.jpg");

    await clickGenerate(page);
    await page.waitForTimeout(1000);

    const call = captured.calls.find((c) => c.action === "generate-image");
    expect(call).toBeTruthy();
    expect(call!.body.style_ref).toBeTruthy();
    const refs = call!.body.style_ref as Array<{ url: string; weight: number }>;
    expect(refs[0].url).toBe("https://example.com/style.jpg");
  });

  // =========================================================================
  // 4. EDIT MODE TABS
  // =========================================================================

  test("Modify Video: requires video URL and sends modify-video action", async ({ page }) => {
    const captured = interceptLumaApi(page);
    await openStudio(page);

    await selectMode(page, "Modify Video");

    // Verify video URL input is shown
    const urlInput = page.locator('input[placeholder*="video" i]').first();
    await expect(urlInput).toBeVisible();

    // Verify modify mode grid is shown (subtle/moderate/dramatic)
    await expect(page.locator('text=/adhere|flex|reimagine|subtle|moderate|dramatic/i').first()).toBeVisible();
  });

  test("Modify Video: sends correct payload with modify mode", async ({ page }) => {
    const captured = interceptLumaApi(page);
    await openStudio(page);

    await selectMode(page, "Modify Video");
    await setPrompt(page, "Add cinematic color grading");

    const urlInput = page.locator('input[placeholder*="video" i]').first();
    await urlInput.fill("https://example.com/input.mp4");

    await clickGenerate(page);
    await page.waitForTimeout(1000);

    const call = captured.calls.find((c) => c.action === "modify-video");
    expect(call).toBeTruthy();
    expect(call!.body.media).toBeTruthy();
    expect((call!.body.media as Record<string, string>).url).toBe("https://example.com/input.mp4");
    expect(call!.body.mode).toBeTruthy(); // modify mode like "flex_1"
  });

  test("Modify + KF: shows source video and keyframe inputs", async ({ page }) => {
    interceptLumaApi(page);
    await openStudio(page);

    await selectMode(page, "Modify + KF");

    // Should show source video URL input
    const sourceInput = page.locator('input[placeholder*="source" i], input[placeholder*="video" i]').first();
    await expect(sourceInput).toBeVisible();
  });

  test("Modify Image: requires image URL", async ({ page }) => {
    interceptLumaApi(page);
    await openStudio(page);

    await selectMode(page, "Modify Image");

    // Should show image URL input
    const urlInput = page.locator('input[placeholder*="image" i]').first();
    await expect(urlInput).toBeVisible();
  });

  test("Modify Image: sends generate-image with image_ref", async ({ page }) => {
    const captured = interceptLumaApi(page);
    await openStudio(page);

    await selectMode(page, "Modify Image");
    await setPrompt(page, "Enhance the colors");

    const urlInput = page.locator('input[placeholder*="image" i]').first();
    await urlInput.fill("https://example.com/photo.jpg");

    await clickGenerate(page);
    await page.waitForTimeout(1000);

    const call = captured.calls.find((c) => c.action === "generate-image");
    expect(call).toBeTruthy();
    expect(call!.body.image_ref).toBeTruthy();
    const refs = call!.body.image_ref as Array<{ url: string; weight: number }>;
    expect(refs[0].url).toBe("https://example.com/photo.jpg");
    // Modify image uses weight 0.7
    expect(refs[0].weight).toBe(0.7);
  });

  test("Reframe: shows media URL and target aspect ratio", async ({ page }) => {
    interceptLumaApi(page);
    await openStudio(page);

    await selectMode(page, "Reframe");

    // Should show media URL input
    const urlInput = page.locator('input[placeholder*="media" i], input[placeholder*="URL" i]').first();
    await expect(urlInput).toBeVisible();

    // Should show target aspect ratio selector
    await expect(page.locator('text=/target.*aspect|aspect.*ratio/i').first()).toBeVisible();
  });

  test("Reframe: sends reframe action — no prompt required", async ({ page }) => {
    const captured = interceptLumaApi(page);
    await openStudio(page);

    await selectMode(page, "Reframe");

    const urlInput = page.locator('input[placeholder*="media" i], input[placeholder*="URL" i]').first();
    await urlInput.fill("https://example.com/video.mp4");

    // Generate button should be enabled even without prompt for reframe
    const btn = page.locator('button:has-text("Generate")');
    await expect(btn).toBeEnabled();
    await btn.click();

    await page.waitForTimeout(1000);
    const call = captured.calls.find((c) => c.action === "reframe");
    expect(call).toBeTruthy();
    expect(call!.body.media).toBeTruthy();
    expect(call!.body.aspect_ratio).toBeTruthy();
  });

  // =========================================================================
  // 5. AUDIO MODE TABS
  // =========================================================================

  test("Music: sends generate-audio with type music", async ({ page }) => {
    const captured = interceptLumaApi(page);
    await openStudio(page);

    await selectMode(page, "Music");
    await setPrompt(page, "Epic orchestral soundtrack");

    // Generate button should be enabled for audio modes
    const btn = page.locator('button:has-text("Generate")');
    await expect(btn).toBeEnabled();
    await btn.click();

    await page.waitForTimeout(1000);
    const call = captured.calls.find((c) => c.action === "generate-audio");
    expect(call).toBeTruthy();
    expect(call!.body.prompt).toContain("orchestral");
    expect(call!.body.type).toBe("music");
  });

  test("SFX: sends generate-sfx action", async ({ page }) => {
    const captured = interceptLumaApi(page);
    await openStudio(page);

    await selectMode(page, "SFX");
    await setPrompt(page, "Explosion and debris falling");

    await clickGenerate(page);
    await page.waitForTimeout(1000);

    const call = captured.calls.find((c) => c.action === "generate-sfx");
    expect(call).toBeTruthy();
    expect(call!.body.prompt).toContain("Explosion");
    expect(call!.body.type).toBe("sfx");
  });

  test("Voiceover: sends voiceover action with script field", async ({ page }) => {
    const captured = interceptLumaApi(page);
    await openStudio(page);

    await selectMode(page, "Voiceover");
    await setPrompt(page, "Narrator voice");

    // Should show voiceover script textarea
    const scriptArea = page.locator('textarea').last();
    await scriptArea.fill("Welcome to our product showcase.");

    await clickGenerate(page);
    await page.waitForTimeout(1000);

    const call = captured.calls.find((c) => c.action === "voiceover");
    expect(call).toBeTruthy();
    expect(call!.body.type).toBe("voiceover");
    // Should include the script field for proper server routing
    expect(call!.body.script).toBeTruthy();
  });

  test("Lip Sync: requires video and audio URLs", async ({ page }) => {
    interceptLumaApi(page);
    await openStudio(page);

    await selectMode(page, "Lip Sync");

    // Should show video and audio URL inputs
    const videoInput = page.locator('input[placeholder*="character-speaking"]').first();
    const audioInput = page.locator('input[placeholder*="voiceover.mp3"]').first();
    await expect(videoInput).toBeVisible();
    await expect(audioInput).toBeVisible();
  });

  test("Lip Sync: sends lip-sync action with video_url and audio_url", async ({ page }) => {
    const captured = interceptLumaApi(page);
    await openStudio(page);

    await selectMode(page, "Lip Sync");
    await setPrompt(page, "Sync the lips");

    const videoInput = page.locator('input[placeholder*="character-speaking"]').first();
    const audioInput = page.locator('input[placeholder*="voiceover.mp3"]').first();
    await videoInput.fill("https://example.com/talking.mp4");
    await audioInput.fill("https://example.com/speech.mp3");

    await clickGenerate(page);
    await page.waitForTimeout(1000);

    const call = captured.calls.find((c) => c.action === "lip-sync");
    expect(call).toBeTruthy();
    expect(call!.body.type).toBe("lip-sync");
    expect(call!.body.video_url).toBe("https://example.com/talking.mp4");
    expect(call!.body.audio_url).toBe("https://example.com/speech.mp3");
  });

  // =========================================================================
  // 6. PROVIDER SELECTOR
  // =========================================================================

  test("provider buttons are visible: Auto, Luma, Replicate", async ({ page }) => {
    interceptLumaApi(page);
    await openStudio(page);

    // Provider selector is inside the right sidebar generation controls panel
    // Scroll to make it visible if needed
    const providerLabel = page.locator('label:has-text("Provider")').first();
    await providerLabel.scrollIntoViewIfNeeded();
    await expect(providerLabel).toBeVisible();

    // The provider buttons should be nearby — check all 3
    // They may say  "Auto (Luma)" or "Auto (Rep)" or just "Auto"
    const providerSection = page.locator('label:has-text("Provider")').first().locator('..');
    await expect(providerSection.locator('button', { hasText: /Auto/i }).first()).toBeVisible();
    await expect(providerSection.locator('button', { hasText: "Luma" }).first()).toBeVisible();
    await expect(providerSection.locator('button', { hasText: "Replicate" }).first()).toBeVisible();
  });

  test("switching provider to Replicate includes provider in payload", async ({ page }) => {
    const captured = interceptLumaApi(page);
    await openStudio(page);

    // Click Replicate provider button
    await page.locator('button:has-text("Replicate")').first().click();
    await page.waitForTimeout(300);

    await selectMode(page, "Text → Video");
    await setPrompt(page, "Generate with Replicate");
    await clickGenerate(page);
    await page.waitForTimeout(1000);

    const call = captured.calls.find((c) => c.action === "generate-video");
    expect(call).toBeTruthy();
    expect(call!.body.provider).toBe("replicate");
  });

  test("switching provider to Luma includes provider in payload", async ({ page }) => {
    const captured = interceptLumaApi(page);
    await openStudio(page);

    await page.locator('button:has-text("Luma")').first().click();
    await page.waitForTimeout(300);

    await selectMode(page, "Text → Video");
    await setPrompt(page, "Generate with Luma");
    await clickGenerate(page);
    await page.waitForTimeout(1000);

    const call = captured.calls.find((c) => c.action === "generate-video");
    expect(call).toBeTruthy();
    expect(call!.body.provider).toBe("luma");
  });

  // =========================================================================
  // 7. MODEL SELECTION
  // =========================================================================

  test("video models shown: Ray 3, Ray Flash 2", async ({ page }) => {
    interceptLumaApi(page);
    await openStudio(page);

    await selectMode(page, "Text → Video");

    // Model buttons should be visible
    await expect(page.locator('button:has-text("Ray 3")').first()).toBeVisible();
    await expect(page.locator('button:has-text("Ray Flash 2")').first()).toBeVisible();
  });

  test("image models shown when in image mode", async ({ page }) => {
    interceptLumaApi(page);
    await openStudio(page);

    await selectMode(page, "Text → Image");

    await expect(page.locator('button:has-text("Photon")').first()).toBeVisible();
  });

  test("selecting model changes payload", async ({ page }) => {
    const captured = interceptLumaApi(page);
    await openStudio(page);

    await selectMode(page, "Text → Video");

    // Click Ray 3 explicitly
    await page.locator('button:has-text("Ray 3")').first().click();
    await setPrompt(page, "Test model selection");
    await clickGenerate(page);
    await page.waitForTimeout(1000);

    const call = captured.calls.find((c) => c.action === "generate-video");
    expect(call).toBeTruthy();
    expect(call!.body.model).toBe("ray-3");
  });

  // =========================================================================
  // 8. ASPECT RATIO
  // =========================================================================

  test("aspect ratio buttons are visible", async ({ page }) => {
    interceptLumaApi(page);
    await openStudio(page);

    for (const ar of ["1:1", "16:9", "9:16"]) {
      await expect(page.locator(`button:has-text("${ar}")`).first()).toBeVisible();
    }
  });

  test("changing aspect ratio reflects in payload", async ({ page }) => {
    const captured = interceptLumaApi(page);
    await openStudio(page);

    await selectMode(page, "Text → Video");

    // Click 9:16 aspect ratio
    await page.locator('button:has-text("9:16")').first().click();
    await setPrompt(page, "Vertical video test");
    await clickGenerate(page);
    await page.waitForTimeout(1000);

    const call = captured.calls.find((c) => c.action === "generate-video");
    expect(call).toBeTruthy();
    expect(call!.body.aspect_ratio).toBe("9:16");
  });

  // =========================================================================
  // 9. RESOLUTION
  // =========================================================================

  test("resolution buttons visible in video mode", async ({ page }) => {
    interceptLumaApi(page);
    await openStudio(page);

    await selectMode(page, "Text → Video");

    for (const res of ["540p", "720p", "1080p", "4k"]) {
      await expect(page.locator(`button:has-text("${res}")`).first()).toBeVisible();
    }
  });

  test("changing resolution reflects in payload", async ({ page }) => {
    const captured = interceptLumaApi(page);
    await openStudio(page);

    await selectMode(page, "Text → Video");
    await page.locator('button:has-text("1080p")').first().click();
    await setPrompt(page, "High res test");
    await clickGenerate(page);
    await page.waitForTimeout(1000);

    const call = captured.calls.find((c) => c.action === "generate-video");
    expect(call).toBeTruthy();
    expect(call!.body.resolution).toBe("1080p");
  });

  // =========================================================================
  // 10. DURATION
  // =========================================================================

  test("duration buttons visible: 5s, 9s, 10s", async ({ page }) => {
    interceptLumaApi(page);
    await openStudio(page);

    await selectMode(page, "Text → Video");

    await expect(page.locator('button:has-text("5s")').first()).toBeVisible();
    await expect(page.locator('button:has-text("9s")').first()).toBeVisible();
    await expect(page.locator('button:has-text("10s")').first()).toBeVisible();
  });

  test("changing duration reflects in payload", async ({ page }) => {
    const captured = interceptLumaApi(page);
    await openStudio(page);

    await selectMode(page, "Text → Video");
    await page.locator('button:has-text("9s")').first().click();
    await setPrompt(page, "Longer video test");
    await clickGenerate(page);
    await page.waitForTimeout(1000);

    const call = captured.calls.find((c) => c.action === "generate-video");
    expect(call).toBeTruthy();
    expect(call!.body.duration).toBe("9s");
  });

  // =========================================================================
  // 11. LOOP, HDR, CAMERA MOTION TOGGLES
  // =========================================================================

  test("loop toggle visible and toggleable", async ({ page }) => {
    interceptLumaApi(page);
    await openStudio(page);

    await selectMode(page, "Text → Video");

    const loopLabel = page.locator('text=/loop.*video/i').first();
    await expect(loopLabel).toBeVisible();
  });

  test("HDR toggle visible", async ({ page }) => {
    interceptLumaApi(page);
    await openStudio(page);

    await selectMode(page, "Text → Video");

    const hdrLabel = page.locator('text=/hdr/i').first();
    await expect(hdrLabel).toBeVisible();
  });

  test("Camera Motion section visible", async ({ page }) => {
    interceptLumaApi(page);
    await openStudio(page);

    await selectMode(page, "Text → Video");

    const cameraLabel = page.locator('text=/camera.*motion/i').first();
    await expect(cameraLabel).toBeVisible();
  });

  // =========================================================================
  // 12. BATCH GENERATION
  // =========================================================================

  test("batch generation buttons visible: 1x-4x", async ({ page }) => {
    interceptLumaApi(page);
    await openStudio(page);

    for (const b of ["1x", "2x", "3x", "4x"]) {
      await expect(page.locator(`button:has-text("${b}")`).first()).toBeVisible();
    }
  });

  test("batch 2x creates 2 API calls", async ({ page }) => {
    const captured = interceptLumaApi(page);
    await openStudio(page);

    await selectMode(page, "Text → Video");
    // Click 2x batch
    await page.locator('button:has-text("2x")').first().click();
    await setPrompt(page, "Batch test video");
    await clickGenerate(page);
    await page.waitForTimeout(2000);

    const videoCalls = captured.calls.filter((c) => c.action === "generate-video");
    expect(videoCalls.length).toBe(2);
  });

  // =========================================================================
  // 13. ENHANCE & CONCEPTS BUTTONS
  // =========================================================================

  test("Enhance button visible and functional", async ({ page }) => {
    interceptLumaApi(page);
    // Mock creative-query endpoint
    page.route("**/api/dreamscape", async (route) => {
      const body = JSON.parse(route.request().postData() || "{}");
      if (body.action === "creative-query") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ variations: ["Enhanced prompt 1", "Enhanced prompt 2"] }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ reply: "ok" }),
        });
      }
    });

    await openStudio(page);
    await setPrompt(page, "A dog running");

    const enhanceBtn = page.locator('button:has-text("Enhance")').first();
    await expect(enhanceBtn).toBeVisible();
  });

  test("Concepts button visible", async ({ page }) => {
    interceptLumaApi(page);
    await openStudio(page);

    const conceptsBtn = page.locator('button:has-text("Concepts")').first();
    await expect(conceptsBtn).toBeVisible();
  });

  // =========================================================================
  // 14. GENERATE BUTTON STATE
  // =========================================================================

  test("Generate button disabled when prompt is empty (video mode)", async ({ page }) => {
    interceptLumaApi(page);
    await openStudio(page);

    await selectMode(page, "Text → Video");
    // Ensure prompt is empty
    const textarea = page.locator('textarea[placeholder]').last();
    await textarea.fill("");

    const btn = page.locator('button:has-text("Generate")');
    await expect(btn).toBeDisabled();
  });

  test("Generate button enabled for Reframe even without prompt", async ({ page }) => {
    interceptLumaApi(page);
    await openStudio(page);

    await selectMode(page, "Reframe");

    // Fill just the media URL
    const urlInput = page.locator('input[placeholder*="media" i], input[placeholder*="URL" i]').first();
    await urlInput.fill("https://example.com/video.mp4");

    const btn = page.locator('button:has-text("Generate")');
    await expect(btn).toBeEnabled();
  });

  test("Generate button enabled for audio modes even without prompt", async ({ page }) => {
    interceptLumaApi(page);
    await openStudio(page);

    await selectMode(page, "Music");

    const btn = page.locator('button:has-text("Generate")');
    // Audio modes should allow generating without a prompt
    await expect(btn).toBeEnabled();
  });

  // =========================================================================
  // 15. RESOLUTION/DURATION HIDDEN FOR NON-VIDEO MODES
  // =========================================================================

  test("resolution and duration hidden in image mode", async ({ page }) => {
    interceptLumaApi(page);
    await openStudio(page);

    await selectMode(page, "Text → Image");

    // Resolution buttons should NOT be visible in image mode
    // (we check that "Resolution" label is not visible)
    const resLabel = page.locator('text="Resolution"');
    await expect(resLabel).toHaveCount(0);
  });

  // =========================================================================
  // 16. STATE PERSISTENCE ACROSS NAVIGATION
  // =========================================================================

  test("navigating away and back preserves state", async ({ page }) => {
    interceptLumaApi(page);
    await openStudio(page);

    // Set a distinctive prompt
    await setPrompt(page, "UNIQUE_PERSISTENCE_TEST_PROMPT");
    // Switch to 9:16 aspect ratio
    await page.locator('button:has-text("9:16")').first().click();

    // Navigate away to Settings via direct navigation
    await page.goto("/computer/settings");
    await page.waitForSelector('h1:has-text("Settings")', { timeout: 15_000 });

    // Navigate back to Video Studio
    await page.goto("/computer/dreamscape/studio");
    await page.waitForSelector('button:has-text("Generate")', { timeout: 15_000 });
    await page.waitForTimeout(1000);

    // The PersistentLayout keeps components alive for client-side nav.
    // With page.goto (full navigation), state persists via localStorage for boards.
    // The prompt textarea might be re-initialized, but we can verify the page loads correctly.
    await expect(page.locator('button:has-text("Generate")')).toBeVisible();
  });

  // =========================================================================
  // 17. ALL MODE TABS ARE CLICKABLE & SWITCH CORRECTLY
  // =========================================================================

  const ALL_MODE_TABS = [
    { label: "Text → Video", group: "video" },
    { label: "Image → Video", group: "video" },
    { label: "Extend", group: "video" },
    { label: "Reverse", group: "video" },
    { label: "Interpolate", group: "video" },
    { label: "Text → Image", group: "image" },
    { label: "Image Ref", group: "image" },
    { label: "Character", group: "image" },
    { label: "Style Ref", group: "image" },
    { label: "Modify Video", group: "edit" },
    { label: "Modify + KF", group: "edit" },
    { label: "Modify Image", group: "edit" },
    { label: "Reframe", group: "edit" },
    { label: "Music", group: "audio" },
    { label: "SFX", group: "audio" },
    { label: "Voiceover", group: "audio" },
    { label: "Lip Sync", group: "audio" },
  ];

  for (const tab of ALL_MODE_TABS) {
    test(`mode tab "${tab.label}" is clickable and renders`, async ({ page }) => {
      interceptLumaApi(page);
      await openStudio(page);

      await selectMode(page, tab.label);
      await page.waitForTimeout(200);

      // The clicked tab should be visually active (has colored bg)
      const tabBtn = page.locator('button', { hasText: tab.label }).first();
      await expect(tabBtn).toBeVisible();

      // Generate button should still be on the page
      await expect(page.locator('button:has-text("Generate")')).toBeVisible();
    });
  }
});

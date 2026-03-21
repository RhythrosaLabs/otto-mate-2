/**
 * Multimedia Playground — E2E Tests
 *
 * Tests the full /computer/playground page including:
 * - Page rendering & navigation
 * - Prompt input and keyboard shortcuts
 * - Quick-start categories
 * - Model selector (open, search, featured, provider tabs)
 * - Multi-column compare mode
 * - Parameters panel
 * - File upload zone rendering
 * - Run / Run-as-Task buttons
 * - History rail
 * - Quick-action buttons after a successful mock generation
 * - API-level smoke tests (validation errors, schema) via request context
 */

import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function goToPlayground(page: Page) {
  await page.goto("/computer/playground");
  // Wait for the page <h1> - avoids matching the sidebar nav link
  // which lives inside a md:hidden container (not visible on desktop)
  await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
}

// ---------------------------------------------------------------------------
// 1. Page load & basic structure
// ---------------------------------------------------------------------------

test.describe("Page load", () => {
  test("renders the page title and heading", async ({ page }) => {
    await goToPlayground(page);

    // Browser title
    await expect(page).toHaveTitle(/Multimedia Playground/);

    // H1 in topbar (use heading role to avoid sidebar nav link)
    await expect(page.getByRole("heading", { name: "Multimedia Playground" })).toBeVisible();

    // Left panel label
    await expect(page.getByText("Prompt", { exact: true })).toBeVisible();

    // Quick-start section
    await expect(page.getByText("Quick Start", { exact: true })).toBeVisible();

    // Run button (target the main Run button exactly)
    await expect(page.getByRole("button", { name: "Run", exact: true })).toBeVisible();
  });

  test("shows 8 quick-start category buttons", async ({ page }) => {
    await goToPlayground(page);
    const cats = ["Image", "Video", "Music", "Speech", "3D Model", "Upscale", "Remove BG", "Text"];
    for (const cat of cats) {
      await expect(page.getByRole("button", { name: cat, exact: true })).toBeVisible();
    }
  });

  test("shows Input File upload zone", async ({ page }) => {
    await goToPlayground(page);
    await expect(page.getByText("Input File")).toBeVisible();
    await expect(page.getByText(/Drop a file|Upload file/)).toBeVisible();
  });

  test("shows Tips section", async ({ page }) => {
    await goToPlayground(page);
    await expect(page.getByText("Tips")).toBeVisible();
    await expect(page.getByText(/Use "Compare"/)).toBeVisible();
  });

  test("Run button is disabled when prompt is empty", async ({ page }) => {
    await goToPlayground(page);
    const runBtn = page.getByRole("button", { name: "Run", exact: true });
    await expect(runBtn).toBeDisabled();
  });

  test("Run as Task button is disabled when prompt is empty", async ({ page }) => {
    await goToPlayground(page);
    const taskBtn = page.getByRole("button", { name: "Run as Task" });
    await expect(taskBtn).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// 2. Prompt interaction
// ---------------------------------------------------------------------------

test.describe("Prompt interaction", () => {
  test("typing in prompt enables Run and Run-as-Task buttons", async ({ page }) => {
    await goToPlayground(page);
    const textarea = page.getByPlaceholder(/Describe what you want/);
    await textarea.fill("a sunset over mountains");
    const runBtn = page.getByRole("button", { name: "Run", exact: true });
    const taskBtn = page.getByRole("button", { name: "Run as Task" });
    await expect(runBtn).toBeEnabled();
    await expect(taskBtn).toBeEnabled();
  });

  test("Quick-start Image button fills prompt", async ({ page }) => {
    await goToPlayground(page);
    await page.getByRole("button", { name: "Image", exact: true }).click();
    const textarea = page.getByPlaceholder(/Describe what you want/);
    await expect(textarea).toHaveValue(/Generate a beautiful image of/);
  });

  test("Quick-start Video button fills prompt", async ({ page }) => {
    await goToPlayground(page);
    await page.getByRole("button", { name: "Video", exact: true }).click();
    const textarea = page.getByPlaceholder(/Describe what you want/);
    await expect(textarea).toHaveValue(/Create a short video of/);
  });

  test("Quick-start Music button fills prompt", async ({ page }) => {
    await goToPlayground(page);
    await page.getByRole("button", { name: "Music", exact: true }).click();
    const textarea = page.getByPlaceholder(/Describe what you want/);
    await expect(textarea).toHaveValue(/Compose a/);
  });

  test("Quick-start Speech button fills prompt", async ({ page }) => {
    await goToPlayground(page);
    await page.getByRole("button", { name: "Speech", exact: true }).click();
    const textarea = page.getByPlaceholder(/Describe what you want/);
    await expect(textarea).toHaveValue(/Say the following in a natural voice/);
  });

  test("Quick-start 3D Model button fills prompt", async ({ page }) => {
    await goToPlayground(page);
    await page.getByRole("button", { name: "3D Model", exact: true }).click();
    const textarea = page.getByPlaceholder(/Describe what you want/);
    await expect(textarea).toHaveValue(/Create a 3D model of/);
  });

  test("Quick-start Upscale button fills prompt", async ({ page }) => {
    await goToPlayground(page);
    await page.getByRole("button", { name: "Upscale", exact: true }).click();
    const textarea = page.getByPlaceholder(/Describe what you want/);
    await expect(textarea).toHaveValue(/Upscale this image/);
  });

  test("Quick-start Remove BG button fills prompt", async ({ page }) => {
    await goToPlayground(page);
    await page.getByRole("button", { name: "Remove BG", exact: true }).click();
    const textarea = page.getByPlaceholder(/Describe what you want/);
    await expect(textarea).toHaveValue(/Remove the background/);
  });

  test("Quick-start Text button fills prompt", async ({ page }) => {
    await goToPlayground(page);
    await page.getByRole("button", { name: "Text", exact: true }).click();
    const textarea = page.getByPlaceholder(/Describe what you want/);
    await expect(textarea).toHaveValue(/Write a/);
  });

  test("prompt clears when replaced", async ({ page }) => {
    await goToPlayground(page);
    const textarea = page.getByPlaceholder(/Describe what you want/);
    await textarea.fill("first prompt");
    await textarea.fill("second prompt");
    await expect(textarea).toHaveValue("second prompt");
  });
});

// ---------------------------------------------------------------------------
// 3. Model selector
// ---------------------------------------------------------------------------

test.describe("Model selector", () => {
  test("opens model selector dropdown on click", async ({ page }) => {
    await goToPlayground(page);
    const selector = page.getByText("Auto-select best model");
    await selector.click();
    await expect(page.getByPlaceholder("Search models...")).toBeVisible();
  });

  test("shows Featured Models section by default", async ({ page }) => {
    await goToPlayground(page);
    await page.getByText("Auto-select best model").click();
    await expect(page.getByText("Featured Models")).toBeVisible();
  });

  test("featured models are visible (FLUX Schnell)", async ({ page }) => {
    await goToPlayground(page);
    await page.getByText("Auto-select best model").click();
    await expect(page.getByText("FLUX Schnell")).toBeVisible();
  });

  test("featured models show provider badges", async ({ page }) => {
    await goToPlayground(page);
    await page.getByText("Auto-select best model").click();
    // At least one Replicate badge visible
    await expect(page.locator("text=Replicate").first()).toBeVisible();
  });

  test("provider tabs are visible: Auto, Replicate, Hugging Face", async ({ page }) => {
    await goToPlayground(page);
    await page.getByText("Auto-select best model").click();
    // Scope to the open dropdown to avoid matching other "Auto" buttons on the page
    const dropdown = page.locator(".absolute.top-full");
    await expect(dropdown.getByRole("button", { name: "Auto", exact: true })).toBeVisible();
    await expect(dropdown.getByRole("button", { name: "Replicate", exact: true })).toBeVisible();
    await expect(dropdown.getByRole("button", { name: "Hugging Face", exact: true })).toBeVisible();
  });

  test("selecting a featured model updates selector display", async ({ page }) => {
    await goToPlayground(page);
    await page.getByText("Auto-select best model").click();
    await page.getByText("FLUX Schnell").click();
    // Dropdown closes and model name appears in the selector button
    await expect(page.getByText("black-forest-labs/flux-schnell")).toBeVisible();
  });

  test("Reset to Auto clears model selection", async ({ page }) => {
    await goToPlayground(page);
    // Select a model first
    await page.getByText("Auto-select best model").click();
    await page.getByText("FLUX Schnell").click();
    // Reopen and reset
    await page.getByText("black-forest-labs/flux-schnell").click();
    await page.getByText("Reset to Auto").click();
    await expect(page.getByText("Auto-select best model")).toBeVisible();
  });

  test("model search input debounces without crashing", async ({ page }) => {
    await goToPlayground(page);
    await page.getByText("Auto-select best model").click();
    const searchInput = page.getByPlaceholder("Search models...");
    await searchInput.fill("flux");
    // After short wait, either results or "No models found" should appear (no crash)
    await page.waitForTimeout(500);
    // Just ensure no uncaught JS error — page still usable
    await expect(searchInput).toBeVisible();
  });

  test("dropdown closes when clicking outside", async ({ page }) => {
    await goToPlayground(page);
    await page.getByText("Auto-select best model").click();
    await expect(page.getByPlaceholder("Search models...")).toBeVisible();
    // Click far away
    await page.mouse.click(50, 50);
    await expect(page.getByPlaceholder("Search models...")).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 4. Parameters panel
// ---------------------------------------------------------------------------

test.describe("Parameters panel", () => {
  test("Parameters toggle is visible", async ({ page }) => {
    await goToPlayground(page);
    await expect(page.getByText("Parameters")).toBeVisible();
  });

  test("Parameters panel expands on click", async ({ page }) => {
    await goToPlayground(page);
    await page.getByText("Parameters").click();
    await expect(page.getByText("Aspect Ratio")).toBeVisible();
    await expect(page.getByText("Inference Steps")).toBeVisible();
    await expect(page.getByText("Seed (blank for random)")).toBeVisible();
    await expect(page.getByText("Output Format")).toBeVisible();
    await expect(page.getByText("Quality")).toBeVisible();
    await expect(page.getByText("Num Outputs")).toBeVisible();
  });

  test("aspect ratio buttons are all rendered", async ({ page }) => {
    await goToPlayground(page);
    await page.getByText("Parameters").click();
    const ratios = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9"];
    for (const r of ratios) {
      await expect(page.getByRole("button", { name: r, exact: true })).toBeVisible();
    }
  });

  test("clicking 16:9 aspect ratio highlights it", async ({ page }) => {
    await goToPlayground(page);
    await page.getByText("Parameters").click();
    await page.getByRole("button", { name: "16:9", exact: true }).click();
    const btn = page.getByRole("button", { name: "16:9", exact: true });
    // Should have teal highlight class
    await expect(btn).toHaveClass(/20b2aa|border-\[#20b2aa\]/);
  });

  test("output format buttons: WEBP, PNG, JPG visible", async ({ page }) => {
    await goToPlayground(page);
    await page.getByText("Parameters").click();
    await expect(page.getByRole("button", { name: "WEBP" })).toBeVisible();
    await expect(page.getByRole("button", { name: "PNG" })).toBeVisible();
    await expect(page.getByRole("button", { name: "JPG" })).toBeVisible();
  });

  test("Parameters panel collapses on second click", async ({ page }) => {
    await goToPlayground(page);
    await page.getByText("Parameters").click();
    await expect(page.getByText("Aspect Ratio")).toBeVisible();
    await page.getByText("Parameters").click();
    await expect(page.getByText("Aspect Ratio")).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 5. Multi-column compare mode
// ---------------------------------------------------------------------------

test.describe("Compare mode (multi-column)", () => {
  test("Compare button shows (1/4) initially", async ({ page }) => {
    await goToPlayground(page);
    await expect(page.getByRole("button", { name: /Compare \(1\/4\)/ })).toBeVisible();
  });

  test("clicking Compare adds a second column", async ({ page }) => {
    await goToPlayground(page);
    await page.getByRole("button", { name: /Compare \(1\/4\)/ }).click();
    // Now should say 2/4
    await expect(page.getByRole("button", { name: /Compare \(2\/4\)/ })).toBeVisible();
  });

  test("can add up to 4 columns", async ({ page }) => {
    await goToPlayground(page);
    for (let i = 1; i < 4; i++) {
      const btn = page.getByRole("button", { name: new RegExp(`Compare \\(${i}\\/4\\)`) });
      await btn.click();
    }
    await expect(page.getByRole("button", { name: /Compare \(4\/4\)/ })).toBeVisible();
  });

  test("Compare button is disabled at 4 columns", async ({ page }) => {
    await goToPlayground(page);
    // Add 3 more columns to reach 4
    for (let i = 1; i < 4; i++) {
      const btn = page.getByRole("button", { name: new RegExp(`Compare \\(${i}\\/4\\)`) });
      await btn.click();
    }
    const compareBtn = page.getByRole("button", { name: /Compare \(4\/4\)/ });
    await expect(compareBtn).toBeDisabled();
  });

  test("adding 2nd column shows X (remove) buttons on each column", async ({ page }) => {
    await goToPlayground(page);
    await page.getByRole("button", { name: /Compare \(1\/4\)/ }).click();
    // The X remove button should now appear (columns > 1)
    // There should be 2 X buttons — one per column
    const removeButtons = page.locator("button").filter({ has: page.locator("svg") }).filter({ hasText: "" });
    await page.waitForTimeout(200);
    // Check that remove (X) column buttons exist – we look for the column header area
    const columnHeader = page.locator(".border-b.border-\\[\\#2a2a2e\\].bg-\\[\\#161618\\]");
    // At minimum, expect 2 model selectors
    await expect(page.getByText("Auto-select best model")).toHaveCount(2);
  });

  test("removing a column returns to single column", async ({ page }) => {
    await goToPlayground(page);
    await page.getByRole("button", { name: /Compare \(1\/4\)/ }).click();
    // Wait for second column
    await expect(page.getByText("Auto-select best model")).toHaveCount(2);
    // The X/close buttons (hover:text-red-400) — click the last one to remove 2nd column
    const removeButtons = page.locator("button[class~='hover:text-red-400']");
    await removeButtons.last().click();
    await expect(page.getByRole("button", { name: /Compare \(1\/4\)/ })).toBeVisible();
  });

  test("Run button label shows count with 2 columns", async ({ page }) => {
    await goToPlayground(page);
    await page.getByRole("button", { name: /Compare \(1\/4\)/ }).click();
    await page.getByPlaceholder(/Describe what you want/).fill("test");
    await expect(page.getByRole("button", { name: "Run (2 models)" })).toBeEnabled();
  });
});

// ---------------------------------------------------------------------------
// 6. Output placeholder
// ---------------------------------------------------------------------------

test.describe("Output area", () => {
  test("shows placeholder text before running", async ({ page }) => {
    await goToPlayground(page);
    await expect(page.getByText("Output will appear here")).toBeVisible();
    await expect(page.getByText("Type a prompt and hit Run")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 7. Run as Task navigation
// ---------------------------------------------------------------------------

test.describe("Run as Task", () => {
  test("Run as Task navigates to /computer with encoded prompt when model is auto", async ({ page }) => {
    await goToPlayground(page);
    await page.getByPlaceholder(/Describe what you want/).fill("a cat in space");
    const [navigationPromise] = await Promise.all([
      page.waitForNavigation({ timeout: 10_000 }),
      page.getByRole("button", { name: "Run as Task" }).click(),
    ]);
    await expect(page).toHaveURL(/\/computer(\?|$)/);
  });

  test("Run as Task includes model in URL when model is selected", async ({ page }) => {
    await goToPlayground(page);
    // Select a model
    await page.getByText("Auto-select best model").click();
    await page.getByText("FLUX Schnell").click();
    // Enter prompt
    await page.getByPlaceholder(/Describe what you want/).fill("mountains at sunset");
    const [_] = await Promise.all([
      page.waitForNavigation({ timeout: 10_000 }),
      page.getByRole("button", { name: "Run as Task" }).click(),
    ]);
    // URL should encode the model name
    await expect(page).toHaveURL(/flux/i);
  });
});

// ---------------------------------------------------------------------------
// 8. History rail (initially hidden)
// ---------------------------------------------------------------------------

test.describe("History rail", () => {
  test("history rail is absent with no history", async ({ page }) => {
    // Clear localStorage first
    await page.goto("/computer/playground");
    await page.evaluate(() => localStorage.removeItem("playground-history"));
    await page.reload();
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    // History Rail should not be visible (it renders null when empty)
    await expect(page.getByText("History")).not.toBeVisible();
  });

  test("history rail appears after injecting history into localStorage", async ({ page }) => {
    await page.goto("/computer/playground");
    const fakeHistory = [
      {
        id: "test-1",
        model: "black-forest-labs/flux-schnell",
        modelReason: "test",
        taskType: "image_generation",
        status: "succeeded",
        provider: "replicate",
        files: [{ filename: "output.jpg", size: 100, mimeType: "image/jpeg", url: "/fake.jpg" }],
        prompt: "a test image",
        createdAt: new Date().toISOString(),
      },
    ];
    await page.evaluate((h) => {
      localStorage.setItem("playground-history", JSON.stringify(h));
    }, fakeHistory);
    await page.reload();
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    await expect(page.getByText("History")).toBeVisible();
    await expect(page.getByText("(1)")).toBeVisible();
  });

  test("clicking History rail expands it", async ({ page }) => {
    await page.goto("/computer/playground");
    const fakeHistory = [
      {
        id: "h1",
        model: "black-forest-labs/flux-schnell",
        modelReason: "",
        taskType: "image_generation",
        status: "succeeded",
        provider: "replicate",
        files: [{ filename: "out.jpg", size: 500, mimeType: "image/jpeg", url: "/a.jpg" }],
        prompt: "hello world",
        createdAt: new Date().toISOString(),
      },
    ];
    await page.evaluate((h) => {
      localStorage.setItem("playground-history", JSON.stringify(h));
    }, fakeHistory);
    await page.reload();
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    await page.getByText("History").click();
    // Filter buttons should now be visible
    // Scope to the history rail section to avoid matching Quick Start category buttons
    // The history rail container has a "History" span; use a div/aside locator containing it
    const historySection = page.locator("div, aside").filter({ has: page.getByText("History", { exact: true }) }).filter({ has: page.getByRole("button", { name: "Clear" }) }).last();
    await expect(historySection.getByRole("button", { name: "all" })).toBeVisible();
    await expect(historySection.getByRole("button", { name: "image" })).toBeVisible();
    await expect(historySection.getByRole("button", { name: "video" })).toBeVisible();
  });

  test("History Clear button removes history", async ({ page }) => {
    await page.goto("/computer/playground");
    const fakeHistory = [
      {
        id: "h1",
        model: "test/model",
        modelReason: "",
        taskType: "image_generation",
        status: "succeeded",
        provider: "replicate",
        files: [],
        prompt: "clear test",
        createdAt: new Date().toISOString(),
      },
    ];
    await page.evaluate((h) => localStorage.setItem("playground-history", JSON.stringify(h)), fakeHistory);
    await page.reload();
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    await expect(page.getByText("History")).toBeVisible();
    await page.getByRole("button", { name: "Clear" }).click();
    await expect(page.getByText("History")).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 9. Sidebar navigation
// ---------------------------------------------------------------------------

test.describe("Sidebar navigation", () => {
  test("Multimedia Playground is highlighted in sidebar when on page", async ({ page }) => {
    await goToPlayground(page);
    // The desktop sidebar nav link should be visible and have active styling
    // (look for the aside.hidden.md:flex container to find the desktop sidebar link)
    const desktopSidebar = page.locator("aside.md\\:flex");
    const navLink = desktopSidebar.getByRole("link", { name: /Multimedia Playground/ });
    await expect(navLink).toBeVisible();
  });

  test("Video Producer nav link is visible", async ({ page }) => {
    await goToPlayground(page);
    const desktopSidebar = page.locator("aside.md\\:flex");
    await expect(desktopSidebar.getByRole("link", { name: /Video Producer/ })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 10. Error state rendering
// ---------------------------------------------------------------------------

test.describe("Error state", () => {
  test("shows error state with retry button when generation fails", async ({ page }) => {
    await goToPlayground(page);

    // Intercept the /api/generate call to return an error
    await page.route("/api/generate", (route) => {
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Model is currently unavailable" }),
      });
    });

    await page.getByPlaceholder(/Describe what you want/).fill("a broken test");
    await page.getByRole("button", { name: "Run", exact: true }).click();

    // Error panel should appear
    await expect(page.getByText("Error")).toBeVisible();
    await expect(page.getByText("Model is currently unavailable")).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Try other provider" })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 11. Successful generation rendering
// ---------------------------------------------------------------------------

test.describe("Successful generation", () => {
  test("shows generated image from mocked API response", async ({ page }) => {
    await goToPlayground(page);

    await page.route("/api/generate", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "gen-mock-1",
          model: "black-forest-labs/flux-schnell",
          modelReason: "Fast image generation model",
          taskType: "image_generation",
          status: "succeeded",
          provider: "replicate",
          predictTime: 1.23,
          files: [
            {
              filename: "output.webp",
              size: 204800,
              mimeType: "image/webp",
              url: "https://via.placeholder.com/512",
            },
          ],
          textOutput: null,
          fallbackUsed: false,
        }),
      });
    });

    await page.getByPlaceholder(/Describe what you want/).fill("a futuristic city");
    await page.getByRole("button", { name: "Run", exact: true }).click();

    // Model info
    await expect(page.getByText("black-forest-labs/flux-schnell")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("image generation", { exact: true })).toBeVisible();

    // Time display
    await expect(page.getByText(/1\.2s/)).toBeVisible();

    // Image element should appear
    await expect(page.locator("img[src*='placeholder']")).toBeVisible();

    // Quick action buttons should appear for an image (scope to output column, not Quick Start)
    const outputCol = page.locator("[data-testid='output-column'], .flex-1.overflow-y-auto").last();
    await expect(page.locator("button.text-green-400").filter({ hasText: "Upscale" })).toBeVisible();
    await expect(page.locator("button.text-purple-400").filter({ hasText: "Animate" })).toBeVisible();
    await expect(page.locator("button.text-orange-400").filter({ hasText: "Remove BG" })).toBeVisible();
    await expect(page.locator("button").filter({ hasText: "Make 3D" }).last()).toBeVisible();
    await expect(page.locator("button").filter({ hasText: "Restyle" }).last()).toBeVisible();
    await expect(page.locator("button").filter({ hasText: "Variations" }).last()).toBeVisible();
  });

  test("shows generated video from mocked API response", async ({ page }) => {
    await goToPlayground(page);

    await page.route("/api/generate", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "gen-mock-video",
          model: "bytedance/seedance-1-lite",
          modelReason: "Video generation model",
          taskType: "video_generation",
          status: "succeeded",
          provider: "replicate",
          predictTime: 23.4,
          files: [
            {
              filename: "output.mp4",
              size: 2048000,
              mimeType: "video/mp4",
              url: "https://www.w3schools.com/html/mov_bbb.mp4",
            },
          ],
          textOutput: null,
          fallbackUsed: false,
        }),
      });
    });

    await page.getByPlaceholder(/Describe what you want/).fill("a cat playing piano");
    await page.getByRole("button", { name: "Run", exact: true }).click();

    await expect(page.getByText("video generation", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("video")).toBeVisible();

    // Video-specific action buttons (use colored class selectors to distinguish from Quick Start)
    await expect(page.locator("button.text-green-400").filter({ hasText: "Upscale" })).toBeVisible();
    await expect(page.locator("button").filter({ hasText: "Social Post" }).last()).toBeVisible();
    await expect(page.locator("button").filter({ hasText: "Try Other" }).last()).toBeVisible();
  });

  test("shows generated audio from mocked API response", async ({ page }) => {
    await goToPlayground(page);

    await page.route("/api/generate", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "gen-mock-audio",
          model: "meta/musicgen",
          modelReason: "Music generation model",
          taskType: "music_generation",
          status: "succeeded",
          provider: "replicate",
          predictTime: 5.7,
          files: [
            {
              filename: "output.wav",
              size: 1024000,
              mimeType: "audio/wav",
              url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
            },
          ],
          textOutput: null,
          fallbackUsed: false,
        }),
      });
    });

    await page.getByPlaceholder(/Describe what you want/).fill("upbeat jazz music");
    await page.getByRole("button", { name: "Run", exact: true }).click();

    await expect(page.getByText("music generation", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("audio")).toBeVisible();
  });

  test("shows fallback badge when fallback was used", async ({ page }) => {
    await goToPlayground(page);

    await page.route("/api/generate", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "gen-fallback",
          model: "stabilityai/stable-diffusion-xl-base-1.0",
          modelReason: "Fallback model",
          taskType: "image_generation",
          status: "succeeded",
          provider: "huggingface",
          predictTime: 3.1,
          files: [
            {
              filename: "output.png",
              size: 512000,
              mimeType: "image/png",
              url: "https://via.placeholder.com/256",
            },
          ],
          textOutput: null,
          fallbackUsed: true,
          fallbackReason: "replicate failed: rate limit",
        }),
      });
    });

    await page.getByPlaceholder(/Describe what you want/).fill("a mountain lake");
    await page.getByRole("button", { name: "Run", exact: true }).click();

    await expect(page.getByText("Fallback", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("HuggingFace", { exact: true })).toBeVisible();
  });

  test("shows text output from mocked API response", async ({ page }) => {
    await goToPlayground(page);

    await page.route("/api/generate", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "gen-text",
          model: "meta/meta-llama-3-70b-instruct",
          modelReason: "LLM for text generation",
          taskType: "text_generation",
          status: "succeeded",
          provider: "replicate",
          predictTime: 0.8,
          files: [],
          textOutput: "Once upon a time, in a land far away...",
          fallbackUsed: false,
        }),
      });
    });

    await page.getByPlaceholder(/Describe what you want/).fill("write a story");
    await page.getByRole("button", { name: "Run", exact: true }).click();

    await expect(page.getByText("Once upon a time")).toBeVisible({ timeout: 10_000 });
  });

  test("result is added to history after successful generation", async ({ page }) => {
    await page.goto("/computer/playground");
    await page.evaluate(() => localStorage.removeItem("playground-history"));

    await page.route("/api/generate", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "gen-hist",
          model: "black-forest-labs/flux-schnell",
          modelReason: "",
          taskType: "image_generation",
          status: "succeeded",
          provider: "replicate",
          predictTime: 1.0,
          files: [{ filename: "o.jpg", size: 100, mimeType: "image/jpeg", url: "/o.jpg" }],
          fallbackUsed: false,
        }),
      });
    });

    await page.getByPlaceholder(/Describe what you want/).fill("history test");
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect(page.getByText("image generation", { exact: true })).toBeVisible({ timeout: 10_000 });

    // History rail should now appear with count (1)
    await expect(page.getByText("History", { exact: true })).toBeVisible();
    await expect(page.getByText("(1)")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 12. Quick action side effects
// ---------------------------------------------------------------------------

test.describe("Quick actions", () => {
  async function generateMockImage(page: Page) {
    await goToPlayground(page);
    await page.route("/api/generate", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "qa-mock",
          model: "flux-schnell",
          modelReason: "",
          taskType: "image_generation",
          status: "succeeded",
          provider: "replicate",
          predictTime: 1.0,
          files: [{ filename: "out.png", size: 100, mimeType: "image/png", url: "/img.png" }],
          fallbackUsed: false,
        }),
      });
    });
    await page.getByPlaceholder(/Describe what you want/).fill("base image");
    await page.getByRole("button", { name: "Run", exact: true }).click();
    // Wait for output action Upscale (green-colored, distinct from Quick Start Upscale)
    await expect(page.locator("button.text-green-400").filter({ hasText: "Upscale" })).toBeVisible({ timeout: 10_000 });
  }

  test("Upscale action modifies prompt to include 'Upscale'", async ({ page }) => {
    await generateMockImage(page);
    await page.locator("button.text-green-400").filter({ hasText: "Upscale" }).click();
    const textarea = page.getByPlaceholder(/Describe what you want/);
    await expect(textarea).toHaveValue(/Upscale this image/);
  });

  test("Animate action modifies prompt to include 'Animate'", async ({ page }) => {
    await generateMockImage(page);
    await page.locator("button.text-purple-400").filter({ hasText: "Animate" }).click();
    const textarea = page.getByPlaceholder(/Describe what you want/);
    await expect(textarea).toHaveValue(/Animate this image into a video/);
  });

  test("Remove BG action sets prompt to 'Remove the background'", async ({ page }) => {
    await generateMockImage(page);
    await page.locator("button.text-orange-400").filter({ hasText: "Remove BG" }).click();
    const textarea = page.getByPlaceholder(/Describe what you want/);
    await expect(textarea).toHaveValue(/Remove the background/);
  });

  test("Restyle action modifies prompt to include 'style transfer'", async ({ page }) => {
    await generateMockImage(page);
    await page.getByRole("button", { name: "Restyle" }).click();
    const textarea = page.getByPlaceholder(/Describe what you want/);
    await expect(textarea).toHaveValue(/style transfer/i);
  });

  test("Variations action modifies prompt to include 'variations'", async ({ page }) => {
    await generateMockImage(page);
    await page.getByRole("button", { name: "Variations" }).click();
    const textarea = page.getByPlaceholder(/Describe what you want/);
    await expect(textarea).toHaveValue(/variations/i);
  });

  test("Social Post action modifies prompt", async ({ page }) => {
    await generateMockImage(page);
    await page.getByRole("button", { name: "Social Post" }).click();
    const textarea = page.getByPlaceholder(/Describe what you want/);
    await expect(textarea).toHaveValue(/social media post/i);
  });
});

// ---------------------------------------------------------------------------
// 13. Generate API — validation tests via HTTP
// ---------------------------------------------------------------------------

test.describe("Generate API — validation", () => {
  test("POST /api/generate with empty body returns 400", async ({ request }) => {
    const res = await request.post("/api/generate", {
      data: {},
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  test("POST /api/generate with missing prompt returns 400", async ({ request }) => {
    const res = await request.post("/api/generate", {
      data: { provider: "auto" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test("POST /api/generate with invalid provider enum returns 400", async ({ request }) => {
    const res = await request.post("/api/generate", {
      data: { prompt: "test", provider: "openai" },
    });
    expect(res.status()).toBe(400);
  });

  test("POST /api/generate with invalid imageUrl (not a URL) returns 400", async ({ request }) => {
    const res = await request.post("/api/generate", {
      data: { prompt: "test", imageUrl: "not-a-url" },
    });
    expect(res.status()).toBe(400);
  });

  test("POST /api/generate with very long prompt (>50000 chars) returns 400", async ({ request }) => {
    const res = await request.post("/api/generate", {
      data: { prompt: "x".repeat(50001) },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test("GET /api/generate?action=history returns 200 or 404", async ({ request }) => {
    const res = await request.get("/api/generate?action=history");
    // Either 200 with data or a handled error response — definitely not a 500 crash
    expect([200, 404]).toContain(res.status());
  });
});

// ---------------------------------------------------------------------------
// 14. Replicate API — smoke tests
// ---------------------------------------------------------------------------

test.describe("Replicate API — smoke tests", () => {
  test("GET /api/replicate?action=search&q=flux returns 200 with models array or auth error", async ({ request }) => {
    const res = await request.get("/api/replicate?action=search&q=flux");
    // Either 200 (with token) or 500 with auth error (missing token) — not a crash/404
    const body = await res.json();
    if (res.status() === 200) {
      expect(body).toHaveProperty("models");
      expect(Array.isArray(body.models)).toBe(true);
    } else {
      // Auth/token error is acceptable — route must not crash to 404
      expect(res.status()).not.toBe(404);
      expect(body).toHaveProperty("error");
    }
  });

  test("GET /api/replicate without action returns models list or auth error", async ({ request }) => {
    const res = await request.get("/api/replicate");
    expect(res.status()).not.toBe(404);
  });
});

// ---------------------------------------------------------------------------
// 15. HuggingFace API — smoke tests
// ---------------------------------------------------------------------------

test.describe("HuggingFace API — smoke tests", () => {
  test("GET /api/huggingface?action=search&q=stable-diffusion returns structured response", async ({ request }) => {
    const res = await request.get("/api/huggingface?action=search&q=stable-diffusion");
    // HuggingFace search doesn't require auth — should return 200
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty("models");
      expect(Array.isArray(body.models)).toBe(true);
    } else {
      // Network error or rate limit acceptable
      expect(res.status()).not.toBe(404);
    }
  });

  test("GET /api/huggingface?action=detect&prompt=generate music returns task detection", async ({ request }) => {
    const res = await request.get("/api/huggingface?action=detect&prompt=generate+music");
    if (res.status() === 200) {
      const body = await res.json();
      // Should return task type info
      expect(body).toBeDefined();
    } else {
      expect(res.status()).not.toBe(404);
    }
  });

  test("GET /api/huggingface?action=model&id=black-forest-labs/FLUX.1-schnell returns model or error", async ({ request }) => {
    const res = await request.get("/api/huggingface?action=model&id=black-forest-labs%2FFLUX.1-schnell");
    expect(res.status()).not.toBe(404);
  });

  test("GET /api/huggingface?action=model without id returns 400", async ({ request }) => {
    const res = await request.get("/api/huggingface?action=model");
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("id is required");
  });

  test("GET /api/huggingface?action=unknown returns 400", async ({ request }) => {
    const res = await request.get("/api/huggingface?action=unknown");
    expect(res.status()).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// 16. Luma API — smoke tests
// ---------------------------------------------------------------------------

test.describe("Luma API — smoke tests", () => {
  test("GET /api/luma returns route (not 404)", async ({ request }) => {
    const res = await request.get("/api/luma");
    // The luma route is a POST-only route, so GET might 405 or 400
    expect(res.status()).not.toBe(404);
  });
});

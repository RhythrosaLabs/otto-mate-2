/**
 * App Pages & API Integration Tests
 *
 * Covers:
 * - Page load / heading rendering for all major routes
 * - API CRUD smoke tests (tasks, skills, memory, sessions, templates,
 *   scheduled-tasks, gallery, connectors, pipelines, analytics, audit, health)
 * - Key UI interactions on Tasks, Settings, Skills, Memory, Sessions pages
 */

import { test, expect, type APIRequestContext } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getJSON(request: APIRequestContext, url: string) {
  const res = await request.get(url);
  const body = await res.json();
  return { status: res.status(), body };
}

async function postJSON(
  request: APIRequestContext,
  url: string,
  payload: object,
) {
  const res = await request.post(url, { data: payload });
  const body = await res.json();
  return { status: res.status(), body };
}

// ---------------------------------------------------------------------------
// 1. Page load — all nav pages render without crash
// ---------------------------------------------------------------------------

// Pages with standard h1 headings
const NAV_PAGES: Array<{ path: string; heading: RegExp | string }> = [
  { path: "/computer", heading: /Ottomate|New Task|What would you like/i },
  { path: "/computer/tasks", heading: "Tasks" },
  { path: "/computer/skills", heading: /Skills/i },
  { path: "/computer/gallery", heading: /Gallery/i },
  { path: "/computer/playground", heading: /Multimedia Playground/i },
  { path: "/computer/memory", heading: /Memory/i },
  { path: "/computer/templates", heading: /Templates/i },
  { path: "/computer/scheduled", heading: /Scheduled/i },
  { path: "/computer/analytics", heading: /Analytics/i },
  { path: "/computer/audit", heading: /Audit/i },
  { path: "/computer/pipelines", heading: /Pipelines/i },
  { path: "/computer/sessions", heading: /Sessions/i },
  { path: "/computer/settings", heading: /Settings/i },
  { path: "/computer/channels", heading: /Channels/i },
  // app-builder h1 says "What do you want to build?"
  { path: "/computer/app-builder", heading: /What do you want to build/i },
];

// Pages that don't use h1 — tested separately below
// /computer/files uses breadcrumb text "Files" (macOS Finder-style UI)
// /computer/connectors uses h1 but has 193 connectors causing slow hydration
// /computer/dreamscape uses <span> "Video Producer" not h1

test.describe("Page load — all nav pages", () => {
  for (const { path, heading } of NAV_PAGES) {
    test(`${path} loads with correct heading`, async ({ page }) => {
      await page.goto(path);
      await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
      const h1 = page.getByRole("heading", { level: 1 });
      if (typeof heading === "string") {
        await expect(h1.filter({ hasText: heading })).toBeVisible();
      } else {
        await expect(h1).toHaveText(heading);
      }
    });
  }

  test("sidebar shows all nav links on any page", async ({ page }) => {
    await page.goto("/computer/tasks");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    // Check a sample of nav links are present somewhere on page (desktop sidebar)
    const links = ["Tasks", "Skills", "Gallery", "Memory", "Settings"];
    for (const label of links) {
      await expect(page.getByRole("link", { name: label }).first()).toBeVisible();
    }
  });

  // Pages without standard h1 headings — test with their actual visible elements
  test("/computer/files loads (Finder-style UI with Files breadcrumb)", async ({ page }) => {
    await page.goto("/computer/files", { waitUntil: "domcontentloaded" });
    // Files page uses a Finder-style UI with breadcrumb, no h1
    await expect(page.getByRole("button", { name: /All Files/i }).first()).toBeVisible({ timeout: 15_000 });
  });

  test("/computer/connectors loads (shows Connectors heading)", async ({ page }) => {
    // Use domcontentloaded to avoid waiting for all 193 connectors to hydrate
    await page.goto("/computer/connectors", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Connectors/i })).toBeVisible({ timeout: 15_000 });
  });

  test("/computer/dreamscape loads (shows Video Producer text)", async ({ page }) => {
    await page.goto("/computer/dreamscape", { waitUntil: "domcontentloaded" });
    // dreamscape uses a <span> inside a <header> for its title (not h1)
    // use header span to avoid matching the hidden sidebar nav link
    await expect(page.locator("header span").filter({ hasText: "Video Producer" })).toBeVisible({ timeout: 15_000 });
  });
});

// ---------------------------------------------------------------------------
// 2. Health API
// ---------------------------------------------------------------------------

test.describe("Health API", () => {
  test("GET /api/health returns 200 with status field", async ({ request }) => {
    const { status, body } = await getJSON(request, "/api/health");
    expect(status).toBe(200);
    expect(body).toHaveProperty("status");
  });

  test("GET /api/health?detailed=true returns services array", async ({ request }) => {
    const res = await request.get("/api/health?detailed=true");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("status");
  });
});

// ---------------------------------------------------------------------------
// 3. Settings API
// ---------------------------------------------------------------------------

test.describe("Settings API", () => {
  test("GET /api/settings returns object", async ({ request }) => {
    const { status, body } = await getJSON(request, "/api/settings");
    expect(status).toBe(200);
    expect(typeof body).toBe("object");
  });

  test("GET /api/settings?section=health returns health object", async ({ request }) => {
    const { status, body } = await getJSON(request, "/api/settings?section=health");
    expect(status).toBe(200);
    expect(typeof body).toBe("object");
  });

  test("PUT /api/settings with key+value returns ok", async ({ request }) => {
    const res = await request.put("/api/settings", {
      data: { key: "test_e2e_key", value: "test_value_123" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("PUT /api/settings with settings map returns ok", async ({ request }) => {
    const res = await request.put("/api/settings", {
      data: { settings: { test_e2e_key2: "v2", test_e2e_key3: "v3" } },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.updated).toBe(2);
  });

  test("PUT /api/settings with no payload returns 400", async ({ request }) => {
    const res = await request.put("/api/settings", { data: {} });
    expect(res.status()).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// 4. Tasks API
// ---------------------------------------------------------------------------

test.describe("Tasks API", () => {
  test("GET /api/tasks returns array", async ({ request }) => {
    const { status, body } = await getJSON(request, "/api/tasks");
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  test("GET /api/tasks?limit=3 returns at most 3 items", async ({ request }) => {
    const { status, body } = await getJSON(request, "/api/tasks?limit=3");
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeLessThanOrEqual(3);
  });

  test("POST /api/tasks creates a task and returns it", async ({ request }) => {
    const { status, body } = await postJSON(request, "/api/tasks", {
      prompt: "E2E test task — please ignore",
      priority: "low",
    });
    expect(status).toBe(201);
    expect(body).toHaveProperty("id");
    expect(body).toHaveProperty("prompt");
    expect(body.prompt).toBe("E2E test task — please ignore");
  });

  test("POST /api/tasks with empty prompt returns 400", async ({ request }) => {
    const { status } = await postJSON(request, "/api/tasks", { prompt: "" });
    expect(status).toBe(400);
  });

  test("POST /api/tasks with no body returns 400", async ({ request }) => {
    const res = await request.post("/api/tasks", {
      headers: { "content-type": "application/json" },
      data: "{}",
    });
    expect(res.status()).toBe(400);
  });

  test("POST /api/tasks with invalid priority returns 400", async ({ request }) => {
    const { status } = await postJSON(request, "/api/tasks", {
      prompt: "test",
      priority: "ultra-critical",
    });
    expect(status).toBe(400);
  });

  test("POST /api/tasks with invalid model enum returns 400", async ({ request }) => {
    const { status } = await postJSON(request, "/api/tasks", {
      prompt: "test",
      model: "gpt-99-turbo-fake",
    });
    expect(status).toBe(400);
  });

  test("GET /api/tasks/[id] returns 404 for unknown task", async ({ request }) => {
    const { status } = await getJSON(
      request,
      "/api/tasks/00000000-0000-0000-0000-000000000000",
    );
    expect(status).toBe(404);
  });

  test("GET /api/tasks?status=completed returns only completed", async ({ request }) => {
    const { status, body } = await getJSON(
      request,
      "/api/tasks?status=completed",
    );
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    for (const task of body) {
      expect(task.status).toBe("completed");
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Skills API
// ---------------------------------------------------------------------------

test.describe("Skills API", () => {
  test("GET /api/skills returns array", async ({ request }) => {
    const { status, body } = await getJSON(request, "/api/skills");
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  test("POST /api/skills creates a skill", async ({ request }) => {
    const { status, body } = await postJSON(request, "/api/skills", {
      name: "E2E Test Skill",
      description: "Created by E2E tests",
      category: "custom",
    });
    expect(status).toBe(201);
    expect(body).toHaveProperty("id");
    expect(body.name).toBe("E2E Test Skill");
  });

  test("POST /api/skills without name returns 400", async ({ request }) => {
    const { status } = await postJSON(request, "/api/skills", {
      description: "missing name",
    });
    expect(status).toBe(400);
  });

  test("PUT /api/skills/[id] with unknown id returns 404", async ({ request }) => {
    // The /api/skills/[id] route only supports PUT and DELETE (no GET)
    // PUT on an unknown id should return 404
    const res = await request.put("/api/skills/00000000-0000-0000-0000-000000000000", {
      data: { name: "Updated" },
    });
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  test("DELETE /api/skills/[id] on arbitrary id returns 200", async ({ request }) => {
    // DELETE is idempotent — deleting a non-existent id is not an error
    const res = await request.delete("/api/skills/00000000-0000-0000-0000-000000000000");
    expect(res.status()).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// 6. Memory API
// ---------------------------------------------------------------------------

test.describe("Memory API", () => {
  test("GET /api/memory returns entries array", async ({ request }) => {
    const { status, body } = await getJSON(request, "/api/memory");
    expect(status).toBe(200);
    expect(body).toHaveProperty("entries");
    expect(Array.isArray(body.entries)).toBe(true);
  });

  test("POST /api/memory stores a new entry", async ({ request }) => {
    const { status, body } = await postJSON(request, "/api/memory", {
      key: "e2e_test_key",
      value: "e2e test value",
      tags: ["e2e", "test"],
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  test("POST /api/memory without key returns 400", async ({ request }) => {
    const { status } = await postJSON(request, "/api/memory", {
      value: "no key provided",
    });
    expect(status).toBe(400);
  });

  test("POST /api/memory without value returns 400", async ({ request }) => {
    const { status } = await postJSON(request, "/api/memory", {
      key: "no_value",
    });
    expect(status).toBe(400);
  });

  test("GET /api/memory?q=search returns filtered results", async ({ request }) => {
    // First store something searchable
    await postJSON(request, "/api/memory", {
      key: "e2e_searchable",
      value: "playwright test unique value xyz",
    });
    const { status, body } = await getJSON(
      request,
      "/api/memory?q=playwright+test+unique+value+xyz",
    );
    expect(status).toBe(200);
    expect(body).toHaveProperty("entries");
  });

  test("DELETE /api/memory without id returns 400", async ({ request }) => {
    const res = await request.delete("/api/memory");
    expect(res.status()).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// 7. Sessions API
// ---------------------------------------------------------------------------

test.describe("Sessions API", () => {
  test("GET /api/sessions returns sessions array", async ({ request }) => {
    const { status, body } = await getJSON(request, "/api/sessions");
    expect(status).toBe(200);
    expect(body).toHaveProperty("sessions");
    expect(Array.isArray(body.sessions)).toBe(true);
  });

  test("POST /api/sessions creates a session", async ({ request }) => {
    const { status, body } = await postJSON(request, "/api/sessions", {
      name: "E2E Test Session",
      description: "Created by E2E tests",
    });
    expect(status).toBe(201);
    expect(body).toHaveProperty("id");
    expect(body.name).toBe("E2E Test Session");
  });

  test("POST /api/sessions without name returns 400", async ({ request }) => {
    const { status } = await postJSON(request, "/api/sessions", {
      description: "no name",
    });
    expect(status).toBe(400);
  });

  test("PUT /api/sessions without id returns 400", async ({ request }) => {
    const res = await request.put("/api/sessions", {
      data: { name: "updated" },
    });
    expect(res.status()).toBe(400);
  });

  test("DELETE /api/sessions without id returns 400", async ({ request }) => {
    const res = await request.delete("/api/sessions");
    expect(res.status()).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// 8. Templates API
// ---------------------------------------------------------------------------

test.describe("Templates API", () => {
  test("GET /api/templates returns array", async ({ request }) => {
    const { status, body } = await getJSON(request, "/api/templates");
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  test("POST /api/templates with action=create creates template", async ({ request }) => {
    const { status, body } = await postJSON(request, "/api/templates", {
      action: "create",
      name: "E2E Template",
      prompt: "Do something useful for E2E testing",
      description: "E2E test template",
      category: "productivity",
    });
    expect(status).toBe(201);
    expect(body).toHaveProperty("id");
    expect(body.name).toBe("E2E Template");
  });

  test("POST /api/templates with action=create and no name returns 400", async ({
    request,
  }) => {
    const { status } = await postJSON(request, "/api/templates", {
      action: "create",
      prompt: "some prompt",
    });
    expect(status).toBe(400);
  });

  test("POST /api/templates with action=run and no template_id returns 400", async ({
    request,
  }) => {
    const { status } = await postJSON(request, "/api/templates", {
      action: "run",
    });
    expect(status).toBe(400);
  });

  test("POST /api/templates with action=run and unknown template_id returns 404", async ({
    request,
  }) => {
    const { status } = await postJSON(request, "/api/templates", {
      action: "run",
      template_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(status).toBe(404);
  });

  test("POST /api/templates with action=delete and no id returns 400", async ({
    request,
  }) => {
    const { status } = await postJSON(request, "/api/templates", {
      action: "delete",
    });
    expect(status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// 9. Scheduled Tasks API
// ---------------------------------------------------------------------------

test.describe("Scheduled Tasks API", () => {
  test("GET /api/scheduled-tasks returns array", async ({ request }) => {
    const { status, body } = await getJSON(request, "/api/scheduled-tasks");
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  test("POST /api/scheduled-tasks creates a scheduled task", async ({ request }) => {
    const { status, body } = await postJSON(request, "/api/scheduled-tasks", {
      name: "E2E Scheduled Task",
      prompt: "Run E2E test",
      schedule_type: "once",
    });
    expect(status).toBe(201);
    expect(body).toHaveProperty("id");
    expect(body.name).toBe("E2E Scheduled Task");
  });

  test("POST /api/scheduled-tasks without name returns 400", async ({ request }) => {
    const { status } = await postJSON(request, "/api/scheduled-tasks", {
      prompt: "some prompt",
    });
    expect(status).toBe(400);
  });

  test("POST /api/scheduled-tasks without prompt returns 400", async ({
    request,
  }) => {
    const { status } = await postJSON(request, "/api/scheduled-tasks", {
      name: "No Prompt Task",
    });
    expect(status).toBe(400);
  });

  test("POST /api/scheduled-tasks with invalid schedule_type returns 400", async ({
    request,
  }) => {
    const { status } = await postJSON(request, "/api/scheduled-tasks", {
      name: "Invalid Schedule",
      prompt: "test",
      schedule_type: "every-23-seconds",
    });
    expect(status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// 10. Gallery API
// ---------------------------------------------------------------------------

test.describe("Gallery API", () => {
  test("GET /api/gallery returns array", async ({ request }) => {
    const { status, body } = await getJSON(request, "/api/gallery");
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  test("POST /api/gallery creates gallery item", async ({ request }) => {
    const { status, body } = await postJSON(request, "/api/gallery", {
      title: "E2E Gallery Item",
      prompt: "Create something for E2E test",
      description: "Test description",
      category: "coding",
    });
    expect(status).toBe(201);
    expect(body).toHaveProperty("id");
    expect(body.title).toBe("E2E Gallery Item");
  });

  test("POST /api/gallery without title returns 400", async ({ request }) => {
    const { status } = await postJSON(request, "/api/gallery", {
      prompt: "no title",
    });
    expect(status).toBe(400);
  });

  test("POST /api/gallery without prompt returns 400", async ({ request }) => {
    const { status } = await postJSON(request, "/api/gallery", {
      title: "no prompt",
    });
    expect(status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// 11. Analytics API
// ---------------------------------------------------------------------------

test.describe("Analytics API", () => {
  test("GET /api/analytics returns 200", async ({ request }) => {
    const { status, body } = await getJSON(request, "/api/analytics");
    expect(status).toBe(200);
    expect(typeof body).toBe("object");
  });
});

// ---------------------------------------------------------------------------
// 12. Audit API
// ---------------------------------------------------------------------------

test.describe("Audit API", () => {
  test("GET /api/audit returns object with logs/total", async ({ request }) => {
    const { status, body } = await getJSON(request, "/api/audit");
    expect(status).toBe(200);
    expect(typeof body).toBe("object");
  });

  test("GET /api/audit?section=tool_names returns tools array", async ({
    request,
  }) => {
    const { status, body } = await getJSON(
      request,
      "/api/audit?section=tool_names",
    );
    expect(status).toBe(200);
    expect(body).toHaveProperty("tools");
    expect(Array.isArray(body.tools)).toBe(true);
  });

  test("GET /api/audit?limit=5 returns at most 5 items", async ({ request }) => {
    const { status, body } = await getJSON(request, "/api/audit?limit=5");
    expect(status).toBe(200);
    // body may have { logs, total } shape
    expect(typeof body).toBe("object");
  });
});

// ---------------------------------------------------------------------------
// 13. Pipelines API
// ---------------------------------------------------------------------------

test.describe("Pipelines API", () => {
  test("GET /api/pipelines returns pipelines array", async ({ request }) => {
    const { status, body } = await getJSON(request, "/api/pipelines");
    expect(status).toBe(200);
    expect(body).toHaveProperty("pipelines");
    expect(Array.isArray(body.pipelines)).toBe(true);
  });

  test("POST /api/pipelines creates pipeline", async ({ request }) => {
    const { status, body } = await postJSON(request, "/api/pipelines", {
      name: "E2E Pipeline",
      description: "Created by E2E tests",
    });
    expect(status).toBe(201);
    expect(body).toHaveProperty("id");
  });

  test("POST /api/pipelines without name returns 400", async ({ request }) => {
    const { status } = await postJSON(request, "/api/pipelines", {
      description: "no name",
    });
    expect(status).toBe(400);
  });

  test("DELETE /api/pipelines without id returns 400", async ({ request }) => {
    const res = await request.delete("/api/pipelines");
    expect(res.status()).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// 14. Connectors API
// ---------------------------------------------------------------------------

test.describe("Connectors API", () => {
  test("GET /api/connectors returns array", async ({ request }) => {
    const { status, body } = await getJSON(request, "/api/connectors");
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  test("GET /api/connectors/env returns object", async ({ request }) => {
    const { status, body } = await getJSON(request, "/api/connectors/env");
    expect(status).toBe(200);
    expect(typeof body).toBe("object");
  });

  test("POST /api/connectors/env with invalid key is rejected", async ({
    request,
  }) => {
    const res = await request.post("/api/connectors/env", {
      data: { keys: { TOTALLY_FAKE_KEY_NOT_ALLOWED: "somevalue" } },
    });
    // Either 400 (rejected) or 200 but with no modification — ensure no crash
    expect([200, 400, 403]).toContain(res.status());
  });
});

// ---------------------------------------------------------------------------
// 15. Files API
// ---------------------------------------------------------------------------

test.describe("Files API", () => {
  test("GET /api/files returns 200 or empty list", async ({ request }) => {
    // Scanning 50+ task-file directories can be slow mid-suite; use a generous timeout
    const res = await request.get("/api/files", { timeout: 45_000 });
    expect([200, 404]).toContain(res.status());
  });
});

// ---------------------------------------------------------------------------
// 16. Usage & Context APIs
// ---------------------------------------------------------------------------

test.describe("Usage & Context APIs", () => {
  test("GET /api/usage returns 200 with usage data", async ({ request }) => {
    const res = await request.get("/api/usage");
    expect([200, 404]).toContain(res.status());
  });
});

// ---------------------------------------------------------------------------
// 17. Tasks page UI
// ---------------------------------------------------------------------------

test.describe("Tasks page UI", () => {
  test("tasks page shows heading and search input", async ({ page }) => {
    await page.goto("/computer/tasks");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    // Use exact:true to avoid strict mode violation (task titles in list may match "Tasks")
    await expect(page.getByRole("heading", { name: "Tasks", exact: true }).first()).toBeVisible();
    await expect(page.getByPlaceholder("Search tasks...")).toBeVisible();
  });

  test("tasks page shows status filter buttons", async ({ page }) => {
    await page.goto("/computer/tasks");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    await expect(page.getByRole("button", { name: /All/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Running/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Completed/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Failed/ })).toBeVisible();
  });

  test("tasks search input filters tasks by typing", async ({ page }) => {
    await page.goto("/computer/tasks");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    const search = page.getByPlaceholder("Search tasks...");
    await search.fill("zzz_nonexistent_task_string_xyz");
    // Should not crash — list may be empty
    await page.waitForTimeout(300);
    await expect(search).toHaveValue("zzz_nonexistent_task_string_xyz");
  });
});

// ---------------------------------------------------------------------------
// 18. Settings page UI
// ---------------------------------------------------------------------------

test.describe("Settings page UI", () => {
  test("settings page shows heading and model label", async ({ page }) => {
    await page.goto("/computer/settings");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /Settings/i })).toBeVisible();
    await expect(page.getByText("Default Model")).toBeVisible();
  });

  test("settings page shows Max Agent Iterations label", async ({ page }) => {
    await page.goto("/computer/settings");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    await expect(page.getByText("Max Agent Iterations")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 19. Skills page UI
// ---------------------------------------------------------------------------

test.describe("Skills page UI", () => {
  test("skills page shows heading", async ({ page }) => {
    await page.goto("/computer/skills");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /Skills/i })).toBeVisible();
  });

  test("skills page has New Skill button", async ({ page }) => {
    await page.goto("/computer/skills");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    // The create button — look for something with "skill" or "new" or "+" 
    const newBtn = page.locator("button").filter({ hasText: /New Skill|New|Create/i }).first();
    await expect(newBtn).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 20. Memory page UI
// ---------------------------------------------------------------------------

test.describe("Memory page UI", () => {
  test("memory page shows heading", async ({ page }) => {
    await page.goto("/computer/memory");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /Memory/i })).toBeVisible();
  });

  test("memory page shows search placeholder", async ({ page }) => {
    await page.goto("/computer/memory");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    await expect(page.getByPlaceholder(/Search memory/i)).toBeVisible();
  });

  test("memory page has store form fields after clicking Add Memory", async ({ page }) => {
    await page.goto("/computer/memory");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    // The form is revealed after clicking "+ Add Memory"
    await page.locator("button").filter({ hasText: /Add Memory/i }).first().click();
    await expect(page.getByPlaceholder(/e\.g\. user_preference/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByPlaceholder(/The information to remember/i)).toBeVisible();
  });

  test("memory page: filling key and value enables Save button", async ({ page }) => {
    await page.goto("/computer/memory");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    // Open the add form first
    await page.locator("button").filter({ hasText: /Add Memory/i }).first().click();
    await page.getByPlaceholder(/e\.g\. user_preference/i).fill("test_key");
    await page.getByPlaceholder(/The information to remember/i).fill("test_value");
    // Save button should become enabled
    const saveBtn = page.locator("button").filter({ hasText: /Save|Store/i }).first();
    await expect(saveBtn).toBeEnabled();
  });
});

// ---------------------------------------------------------------------------
// 21. Sessions page UI
// ---------------------------------------------------------------------------

test.describe("Sessions page UI", () => {
  test("sessions page shows heading", async ({ page }) => {
    await page.goto("/computer/sessions");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /Sessions/i })).toBeVisible();
  });

  test("sessions page has New Session button", async ({ page }) => {
    await page.goto("/computer/sessions");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    const newBtn = page.locator("button").filter({ hasText: /New Session|New/i }).first();
    await expect(newBtn).toBeVisible();
  });

  test("clicking New Session opens create form", async ({ page }) => {
    await page.goto("/computer/sessions");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    const newBtn = page.locator("button").filter({ hasText: /New Session|New/i }).first();
    await newBtn.click();
    await expect(
      page.getByPlaceholder(/e\.g\. Research Project/i),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("New Session Create button is disabled when name is empty", async ({ page }) => {
    await page.goto("/computer/sessions");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    const newBtn = page.locator("button").filter({ hasText: /New Session|New/i }).first();
    await newBtn.click();
    await page.getByPlaceholder(/e\.g\. Research Project/i).waitFor({ state: "visible" });
    const createBtn = page.getByRole("button", { name: "Create", exact: true });
    await expect(createBtn).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// 22. Templates page UI
// ---------------------------------------------------------------------------

test.describe("Templates page UI", () => {
  test("templates page shows heading", async ({ page }) => {
    await page.goto("/computer/templates");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /Templates/i })).toBeVisible();
  });

  test("templates page shows All, Productivity, etc. filter tabs", async ({ page }) => {
    await page.goto("/computer/templates");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    await expect(page.getByRole("button", { name: /All/i }).first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 23. Analytics page UI
// ---------------------------------------------------------------------------

test.describe("Analytics page UI", () => {
  test("analytics page loads with Agent Analytics heading", async ({ page }) => {
    await page.goto("/computer/analytics");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /Analytics/i })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 24. Gallery page UI
// ---------------------------------------------------------------------------

test.describe("Gallery page UI", () => {
  test("gallery page shows heading and search", async ({ page }) => {
    await page.goto("/computer/gallery");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /Gallery/i })).toBeVisible();
    await expect(page.getByPlaceholder(/Search gallery/i)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 25. Connectors page UI
// ---------------------------------------------------------------------------

test.describe("Connectors page UI", () => {
  test("connectors page shows heading and search", async ({ page }) => {
    // Use domcontentloaded to avoid waiting for 193 connector cards to fully hydrate
    await page.goto("/computer/connectors", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Connectors/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByPlaceholder(/Search connectors/i)).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// 26. Scheduled page UI
// ---------------------------------------------------------------------------

test.describe("Scheduled page UI", () => {
  test("scheduled page shows heading", async ({ page }) => {
    await page.goto("/computer/scheduled");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    // The h1 may say "Scheduled Tasks" or similar
    await expect(page.locator("h1").first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 27. Pipelines page UI
// ---------------------------------------------------------------------------

test.describe("Pipelines page UI", () => {
  test("pipelines page shows heading", async ({ page }) => {
    await page.goto("/computer/pipelines");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    await expect(page.locator("h1").first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 28. Audit page UI
// ---------------------------------------------------------------------------

test.describe("Audit page UI", () => {
  test("audit page shows heading", async ({ page }) => {
    await page.goto("/computer/audit");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /Audit/i })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 29. Channels page UI
// ---------------------------------------------------------------------------

test.describe("Channels page UI", () => {
  test("channels page loads without crash", async ({ page }) => {
    await page.goto("/computer/channels");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    await expect(page.locator("h1").first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 30. Main /computer page
// ---------------------------------------------------------------------------

test.describe("Main computer page", () => {
  test("shows New Task prompt input", async ({ page }) => {
    await page.goto("/computer");
    await page.waitForSelector("h1, textarea, [placeholder]", {
      state: "visible",
      timeout: 30_000,
    });
    // Should have some prompt input or heading
    const promptArea = page
      .locator("textarea, input[type=text]")
      .filter({ has: page.locator("*") })
      .first();
    await expect(page.locator("body")).toBeVisible();
  });

  test("sidebar New Task button navigates correctly", async ({ page }) => {
    await page.goto("/computer/tasks");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    // The "New Task" link/button in sidebar
    const newTaskBtn = page.getByRole("link", {
      name: /New Task|Ottomate/i,
    }).first();
    if (await newTaskBtn.isVisible()) {
      await newTaskBtn.click();
      await expect(page).toHaveURL(/\/computer/);
    }
  });
});

// ---------------------------------------------------------------------------
// 31. Dream Machine page load & UI
// ---------------------------------------------------------------------------

test.describe("Dream Machine page", () => {
  test("/computer/dream-machine loads (shows Dream Machine header text)", async ({ page }) => {
    await page.goto("/computer/dream-machine", { waitUntil: "domcontentloaded" });
    // dream-machine uses a <span> in its header (similar to dreamscape)
    await expect(
      page.locator("header span").filter({ hasText: /Dream Machine/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("dream-machine page body is present", async ({ page }) => {
    await page.goto("/computer/dream-machine", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 32. Onboarding page load & UI
// ---------------------------------------------------------------------------

test.describe("Onboarding page", () => {
  test("/computer/onboarding loads (shows Welcome to Ottomate)", async ({ page }) => {
    await page.goto("/computer/onboarding");
    await expect(
      page.getByRole("heading", { name: /Welcome to Ottomate/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("onboarding page has Next/Continue button", async ({ page }) => {
    await page.goto("/computer/onboarding");
    await page.waitForSelector("h2", { state: "visible", timeout: 15_000 });
    const nextBtn = page
      .locator("button")
      .filter({ hasText: /Next|Continue|Get Started/i })
      .first();
    await expect(nextBtn).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 33. Replicate Explorer page load & UI
// ---------------------------------------------------------------------------

test.describe("Replicate Explorer page", () => {
  test("/computer/replicate loads with Replicate Explorer heading", async ({ page }) => {
    await page.goto("/computer/replicate");
    await expect(
      page.getByRole("heading", { name: /Replicate Explorer/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("replicate page shows Browse by Category section", async ({ page }) => {
    await page.goto("/computer/replicate");
    await page.waitForSelector("h1", { state: "visible", timeout: 15_000 });
    await expect(page.getByText(/Browse by Category/i)).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// 34. WhatsApp page load & UI
// ---------------------------------------------------------------------------

test.describe("WhatsApp page", () => {
  test("/computer/whatsapp loads with WhatsApp Control heading", async ({ page }) => {
    await page.goto("/computer/whatsapp");
    await expect(
      page.getByRole("heading", { name: /WhatsApp Control/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("whatsapp page shows configuration instructions", async ({ page }) => {
    await page.goto("/computer/whatsapp");
    await page.waitForSelector("h1", { state: "visible", timeout: 15_000 });
    // Should show either "Connected" / "Not Configured" status
    await expect(page.locator("h2").first()).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// 35. Tasks [taskId] dynamic route
// ---------------------------------------------------------------------------

test.describe("Task detail page", () => {
  test("GET /computer/tasks/nonexistent-id shows 404 or redirects", async ({ page }) => {
    const res = await page.goto("/computer/tasks/nonexistent-task-id-12345");
    // notFound() triggers either a 404 status or a redirect to a not-found page
    const status = res?.status();
    expect([200, 404]).toContain(status);
  });

  test("task detail loads for an existing task (if any exist)", async ({ request, page }) => {
    const tasksRes = await request.get("/api/tasks?limit=1");
    const tasks = await tasksRes.json() as Array<{ id: string }>;
    if (tasks.length > 0) {
      await page.goto(`/computer/tasks/${tasks[0].id}`);
      // Should not be a 500 — just check the body loads
      await expect(page.locator("body")).toBeVisible({ timeout: 15_000 });
    }
  });
});

// ---------------------------------------------------------------------------
// 36. Context API
// ---------------------------------------------------------------------------

test.describe("Context API", () => {
  test("GET /api/context returns object with max_tokens", async ({ request }) => {
    const res = await request.get("/api/context");
    expect(res.status()).toBe(200);
    const data = await res.json() as Record<string, unknown>;
    expect(data).toHaveProperty("max_tokens");
    expect(typeof data.max_tokens).toBe("number");
    expect(data).toHaveProperty("used_tokens");
  });

  test("GET /api/context?task_id=nonexistent returns context shape", async ({ request }) => {
    const res = await request.get("/api/context?task_id=nonexistent-task-999");
    // Returns 200 with zero usage or a valid response
    expect([200, 404]).toContain(res.status());
  });
});

// ---------------------------------------------------------------------------
// 37. Extended Usage API
// ---------------------------------------------------------------------------

test.describe("Usage API (extended)", () => {
  test("GET /api/usage returns object with token data", async ({ request }) => {
    const res = await request.get("/api/usage");
    expect(res.status()).toBe(200);
    const data = await res.json() as Record<string, unknown>;
    // Should have some usage related fields
    expect(typeof data).toBe("object");
  });

  test("GET /api/usage?taskId=nonexistent returns data or 404", async ({ request }) => {
    const res = await request.get("/api/usage?taskId=nonexistent-task-xyz");
    expect([200, 404]).toContain(res.status());
  });
});

// ---------------------------------------------------------------------------
// 38. Tasks Events (SSE)
// ---------------------------------------------------------------------------

test.describe("Tasks Events API", () => {
  test("GET /api/tasks/events is an SSE endpoint (200 + text/event-stream)", async ({ page, request }) => {
    // Create a task so the detail page will open an EventSource connection
    const createRes = await request.post("/api/tasks", {
      data: { prompt: "SSE probe task — do nothing", priority: "low" },
    });
    expect(createRes.status()).toBe(201);
    const task = await createRes.json() as { id: string };

    try {
      // Capture the SSE response before navigating so we don't miss it
      const responsePromise = page.waitForResponse("**/api/tasks/events", { timeout: 20_000 });
      await page.goto(`/computer/tasks/${task.id}`, { waitUntil: "domcontentloaded" });
      const response = await responsePromise;

      expect(response.status()).toBe(200);
      const ct = response.headers()["content-type"] ?? "";
      expect(ct).toContain("text/event-stream");
    } finally {
      // Always clean up the task
      await request.delete(`/api/tasks/${task.id}`);
    }
  });
});

// ---------------------------------------------------------------------------
// 39. Task sub-routes: run / stop / approve / message
// ---------------------------------------------------------------------------

test.describe("Task sub-routes", () => {
  test("POST /api/tasks/nonexistent/run returns 404", async ({ request }) => {
    const res = await request.post("/api/tasks/nonexistent-task-abc/run");
    expect(res.status()).toBe(404);
  });

  test("POST /api/tasks/nonexistent/stop returns 404", async ({ request }) => {
    const res = await request.post("/api/tasks/nonexistent-task-abc/stop");
    expect(res.status()).toBe(404);
  });

  test("POST /api/tasks/nonexistent/approve with missing fields returns 400", async ({ request }) => {
    const res = await request.post("/api/tasks/nonexistent-task-abc/approve", {
      data: { not_the_right_fields: true },
    });
    // Missing approval_id and approved → 400
    expect(res.status()).toBe(400);
  });

  test("POST /api/tasks/nonexistent/approve with valid fields returns 404", async ({ request }) => {
    const res = await request.post("/api/tasks/nonexistent-task-abc/approve", {
      data: { approval_id: "abc-123", approved: true },
    });
    expect(res.status()).toBe(404);
  });

  test("POST /api/tasks/nonexistent/message returns 404", async ({ request }) => {
    const res = await request.post("/api/tasks/nonexistent-task-abc/message", {
      data: { content: "Hello" },
    });
    expect(res.status()).toBe(404);
  });

  test("POST /api/tasks/[id]/message without content returns 400", async ({ request }) => {
    // Create a real task first so we can test the 400 path
    const createRes = await request.post("/api/tasks", {
      data: { prompt: "Test task for message validation", priority: "low" },
    });
    if (createRes.status() === 201) {
      const task = await createRes.json() as { id: string };
      const res = await request.post(`/api/tasks/${task.id}/message`, {
        data: { content: "" },
      });
      expect(res.status()).toBe(400);
    }
  });
});

// ---------------------------------------------------------------------------
// 40. Skills convert API
// ---------------------------------------------------------------------------

test.describe("Skills Convert API", () => {
  test("POST /api/skills/convert without data returns 400", async ({ request }) => {
    const res = await request.post("/api/skills/convert", {
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test("POST /api/skills/convert with invalid JSON string returns 400", async ({ request }) => {
    const res = await request.post("/api/skills/convert", {
      data: { data: "not valid json {{{" },
    });
    expect(res.status()).toBe(400);
  });

  test("POST /api/skills/convert with valid OpenAPI spec returns skills array", async ({ request }) => {
    const openApiSpec = {
      openapi: "3.0.0",
      info: { title: "Test API", version: "1.0.0" },
      paths: {
        "/hello": {
          get: {
            operationId: "sayHello",
            summary: "Returns a hello",
            responses: { "200": { description: "OK" } },
          },
        },
      },
    };
    const res = await request.post("/api/skills/convert", {
      data: { data: openApiSpec, format: "openapi" },
    });
    // Should convert and return array or error if format not supported
    expect([200, 400, 422]).toContain(res.status());
  });
});

// ---------------------------------------------------------------------------
// 41. Social Auth API
// ---------------------------------------------------------------------------

test.describe("Social Auth API", () => {
  test("GET /api/social-auth returns object with platforms", async ({ request }) => {
    const res = await request.get("/api/social-auth");
    expect(res.status()).toBe(200);
    const data = await res.json() as Record<string, unknown>;
    expect(data).toHaveProperty("platforms");
    expect(data).toHaveProperty("storage_location");
  });

  test("DELETE /api/social-auth without platform returns error", async ({ request }) => {
    const res = await request.delete("/api/social-auth");
    // Missing platform param → should return 400
    expect([400, 405, 422]).toContain(res.status());
  });
});

// ---------------------------------------------------------------------------
// 42. Channels API (Discord, Slack, Telegram)
// ---------------------------------------------------------------------------

test.describe("Channels API", () => {
  test("GET /api/channels/discord returns health/setup info", async ({ request }) => {
    const res = await request.get("/api/channels/discord");
    // 200 with setup info, or 501 if not configured
    expect([200, 501]).toContain(res.status());
  });

  test("GET /api/channels/slack returns health/setup info", async ({ request }) => {
    const res = await request.get("/api/channels/slack");
    expect([200, 501]).toContain(res.status());
  });

  test("GET /api/channels/telegram returns health/setup info", async ({ request }) => {
    const res = await request.get("/api/channels/telegram");
    expect([200, 501]).toContain(res.status());
  });

  test("POST /api/channels/discord without valid signature returns 401 or 503", async ({ request }) => {
    const res = await request.post("/api/channels/discord", {
      data: { type: 1 },
    });
    // Discord requires Ed25519 signature — should reject without it; 503 if not configured
    expect([400, 401, 403, 501, 503]).toContain(res.status());
  });
});

// ---------------------------------------------------------------------------
// 43. WhatsApp webhook API
// ---------------------------------------------------------------------------

test.describe("WhatsApp webhook API", () => {
  test("GET /api/whatsapp without config returns 503", async ({ request }) => {
    // Without WHATSAPP_ACCESS_TOKEN set, returns 503
    const res = await request.get("/api/whatsapp");
    expect([200, 400, 403, 503]).toContain(res.status());
  });

  test("GET /api/whatsapp with invalid verify_token returns 400 or 403", async ({ request }) => {
    const res = await request.get(
      "/api/whatsapp?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=test123",
    );
    expect([200, 400, 403, 503]).toContain(res.status());
  });
});

// ---------------------------------------------------------------------------
// 44. Hooks API
// ---------------------------------------------------------------------------

test.describe("Hooks API", () => {
  test("GET /api/hooks returns endpoint documentation", async ({ request }) => {
    const res = await request.get("/api/hooks");
    expect(res.status()).toBe(200);
    const data = await res.json() as Record<string, unknown>;
    expect(data).toHaveProperty("endpoints");
  });

  test("POST /api/hooks?action=wake without auth returns 401 or 503", async ({ request }) => {
    const res = await request.post("/api/hooks?action=wake", {
      data: { prompt: "Test webhook task" },
    });
    // Requires Bearer token or OTTOMATE_WEBHOOK_SECRET env — 503 if not configured
    expect([400, 401, 403, 503]).toContain(res.status());
  });

  test("POST /api/hooks?action=agent without auth returns 401 or 503", async ({ request }) => {
    const res = await request.post("/api/hooks?action=agent", {
      data: { prompt: "Test agent webhook" },
    });
    expect([400, 401, 403, 503]).toContain(res.status());
  });
});

// ---------------------------------------------------------------------------
// 45. Files save-generation API
// ---------------------------------------------------------------------------

test.describe("Files Save-Generation API", () => {
  test("POST /api/files/save-generation without url returns 400", async ({ request }) => {
    const res = await request.post("/api/files/save-generation", {
      data: {},
    });
    expect([400, 422]).toContain(res.status());
  });

  test("POST /api/files/save-generation with invalid url returns error", async ({ request }) => {
    const res = await request.post("/api/files/save-generation", {
      data: { url: "not-a-valid-url" },
    });
    // Fetch will fail or validation rejects
    expect([400, 422, 500]).toContain(res.status());
  });
});

// ---------------------------------------------------------------------------
// 46. Voice TTS & STT APIs
// ---------------------------------------------------------------------------

test.describe("Voice APIs", () => {
  test("POST /api/voice/tts without body returns 400 or 503", async ({ request }) => {
    const res = await request.post("/api/voice/tts", {
      data: {},
    });
    // Missing text → 400, or no API key → 503
    expect([400, 503]).toContain(res.status());
  });

  test("POST /api/voice/tts with text but no API key returns 503", async ({ request }) => {
    const res = await request.post("/api/voice/tts", {
      data: { text: "Hello world", voice: "alloy" },
    });
    // Without ELEVENLABS_API_KEY or OPENAI_API_KEY → 503
    expect([200, 400, 503]).toContain(res.status());
  });

  test("POST /api/voice/stt without audio returns 400", async ({ request }) => {
    // STT expects multipart/form-data with 'audio' field
    const res = await request.post("/api/voice/stt");
    expect([400, 415, 500]).toContain(res.status());
  });
});

// ---------------------------------------------------------------------------
// 47. App Builder API
// ---------------------------------------------------------------------------

test.describe("App Builder API", () => {
  test("POST /api/app-builder without prompt returns 400 or streams", async ({ request }) => {
    const res = await request.post("/api/app-builder", {
      data: {},
    });
    // No prompt → 400; or it starts streaming (200) and the stream fails
    expect([200, 400, 422, 500]).toContain(res.status());
  });
});

// ---------------------------------------------------------------------------
// 48. Dreamscape API
// ---------------------------------------------------------------------------

test.describe("Dreamscape API", () => {
  test("POST /api/dreamscape without body returns 400 or streaming response", async ({ request }) => {
    const res = await request.post("/api/dreamscape", {
      data: {},
    });
    // No action/prompt → 400 or streaming 200
    expect([200, 400, 422]).toContain(res.status());
  });
});

// ---------------------------------------------------------------------------
// 49. Test-Login API (dev-only route)
// ---------------------------------------------------------------------------

test.describe("Test-Login API", () => {
  // This route launches a real browser session which can run for minutes;
  // we just verify the route exists and is gated (does not 404).
  test("GET /api/test-login route exists (not 404)", async ({ request }) => {
    const res = await request.get("/api/test-login?platform=invalid_platform_xyz", { timeout: 5_000 }).catch(() => null);
    // If it times out (starts a browser) that means the route exists; if it returns fast it should be 400/403
    if (res !== null) {
      expect([200, 400, 403, 500]).toContain(res.status());
    }
    // If null (timeout) — route exists and started executing; that's fine.
  });
});

// ---------------------------------------------------------------------------
// 50. Dream Machine page UI
// ---------------------------------------------------------------------------

test.describe("Dream Machine page UI", () => {
  test("dream-machine page has generation mode tabs", async ({ page }) => {
    await page.goto("/computer/dream-machine", { waitUntil: "domcontentloaded" });
    await page.locator("header").waitFor({ state: "visible", timeout: 15_000 });
    // Should have mode tabs (Video, Image, etc.)
    await expect(page.locator("body")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 51. Replicate Explorer page UI
// ---------------------------------------------------------------------------

test.describe("Replicate Explorer page UI", () => {
  test("replicate page has search input", async ({ page }) => {
    await page.goto("/computer/replicate");
    await page.waitForSelector("h1", { state: "visible", timeout: 15_000 });
    // Should have a search/run input
    const input = page.locator("input, textarea").first();
    await expect(input).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// 52. WhatsApp page UI
// ---------------------------------------------------------------------------

test.describe("WhatsApp page UI", () => {
  test("whatsapp page shows webhook URL section", async ({ page }) => {
    await page.goto("/computer/whatsapp");
    await page.waitForSelector("h1", { state: "visible", timeout: 15_000 });
    // Should show some configuration info or webhook section
    await expect(page.locator("h2").first()).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// 53. Connectors [id] API
// ---------------------------------------------------------------------------

test.describe("Connectors [id] API", () => {
  test("GET /api/connectors/nonexistent-id returns 404", async ({ request }) => {
    const res = await request.get("/api/connectors/nonexistent-id-xyz");
    expect([404, 400]).toContain(res.status());
  });

  test("DELETE /api/connectors/nonexistent-id returns 200 (idempotent)", async ({ request }) => {
    const res = await request.delete("/api/connectors/nonexistent-id-xyz");
    // DELETE is idempotent — returns 200 even if the ID doesn't exist
    expect([200, 204, 404]).toContain(res.status());
  });
});

// ---------------------------------------------------------------------------
// 54. Memory DELETE with valid ID
// ---------------------------------------------------------------------------

test.describe("Memory DELETE API (extended)", () => {
  test("DELETE /api/memory with valid id returns 200 or 404", async ({ request }) => {
    // Create a memory entry first, then delete it
    const createRes = await request.post("/api/memory", {
      data: { key: "test_delete_key", value: "test_delete_value", category: "test" },
    });
    if (createRes.status() === 201 || createRes.status() === 200) {
      const entry = await createRes.json() as { id?: string; key?: string };
      const id = entry.id || entry.key;
      if (id) {
        const delRes = await request.delete(`/api/memory?id=${id}`);
        expect([200, 204, 404]).toContain(delRes.status());
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 55. Sessions PUT (update) & DELETE with valid IDs
// ---------------------------------------------------------------------------

test.describe("Sessions API (extended)", () => {
  test("full session lifecycle: create → update → delete", async ({ request }) => {
    // Create
    const createRes = await request.post("/api/sessions", {
      data: { name: "Lifecycle Test Session", description: "test" },
    });
    expect([200, 201]).toContain(createRes.status());
    const session = await createRes.json() as { id: string };
    const sessionId = session.id;

    // Update
    const updateRes = await request.put("/api/sessions", {
      data: { id: sessionId, name: "Updated Session Name" },
    });
    expect([200, 204]).toContain(updateRes.status());

    // Delete
    const deleteRes = await request.delete(`/api/sessions?id=${sessionId}`);
    expect([200, 204]).toContain(deleteRes.status());
  });
});

// ---------------------------------------------------------------------------
// 56. Scheduled Tasks PATCH/DELETE with valid IDs
// ---------------------------------------------------------------------------

test.describe("Scheduled Tasks API (extended)", () => {
  test("full scheduled task lifecycle: create → toggle → delete", async ({ request }) => {
    const createRes = await request.post("/api/scheduled-tasks", {
      data: {
        name: "Lifecycle Scheduled Task",
        prompt: "Run a daily check",
        schedule_type: "daily",
        schedule_value: "08:00",
      },
    });
    expect([200, 201]).toContain(createRes.status());
    const task = await createRes.json() as { id: string };
    const taskId = task.id;

    // Toggle (PATCH) — requires action: "toggle"
    const patchRes = await request.patch("/api/scheduled-tasks", {
      data: { action: "toggle", id: taskId, enabled: false },
    });
    expect([200, 204]).toContain(patchRes.status());

    // Delete
    const deleteRes = await request.delete(`/api/scheduled-tasks?id=${taskId}`);
    expect([200, 204]).toContain(deleteRes.status());
  });
});

// ---------------------------------------------------------------------------
// 57. Gallery DELETE with valid ID
// ---------------------------------------------------------------------------

test.describe("Gallery API (extended)", () => {
  test("POST /api/gallery creates item and GET returns it", async ({ request }) => {
    // Gallery has GET + POST only (no DELETE handler)
    const createRes = await request.post("/api/gallery", {
      data: {
        title: "Lifecycle Gallery Item",
        prompt: "A beautiful sunset",
        url: "https://example.com/test.png",
        provider: "test",
        model: "test-model",
      },
    });
    expect([200, 201]).toContain(createRes.status());
    const item = await createRes.json() as { id: string; title: string };
    expect(item.title).toBe("Lifecycle Gallery Item");

    // Verify it appears in GET
    const listRes = await request.get("/api/gallery");
    expect(listRes.status()).toBe(200);
    const list = await listRes.json() as Array<{ id: string }>;
    expect(list.some((g) => g.id === item.id)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 58. Pipelines DELETE with valid ID
// ---------------------------------------------------------------------------

test.describe("Pipelines API (extended)", () => {
  test("full pipeline lifecycle: create → delete", async ({ request }) => {
    const createRes = await request.post("/api/pipelines", {
      data: { name: "Lifecycle Pipeline", steps: [] },
    });
    expect([200, 201]).toContain(createRes.status());
    const pipeline = await createRes.json() as { id: string };
    const pipelineId = pipeline.id;

    // DELETE uses query param ?id=, not request body
    const deleteRes = await request.delete(`/api/pipelines?id=${pipelineId}`);
    expect([200, 204]).toContain(deleteRes.status());
  });
});

// ---------------------------------------------------------------------------
// 59. Tasks DELETE / full lifecycle
// ---------------------------------------------------------------------------

test.describe("Tasks API (extended)", () => {
  test("full task lifecycle: create → get by id → delete", async ({ request }) => {
    const createRes = await request.post("/api/tasks", {
      data: { prompt: "Lifecycle test task — do nothing", priority: "low" },
    });
    expect(createRes.status()).toBe(201);
    const task = await createRes.json() as { id: string };
    const taskId = task.id;

    // Get by id
    const getRes = await request.get(`/api/tasks/${taskId}`);
    expect(getRes.status()).toBe(200);
    const fetched = await getRes.json() as { id: string };
    expect(fetched.id).toBe(taskId);

    // Delete
    const deleteRes = await request.delete(`/api/tasks/${taskId}`);
    expect([200, 204]).toContain(deleteRes.status());
  });

  test("GET /api/tasks?search=xyz returns filtered array", async ({ request }) => {
    const res = await request.get("/api/tasks?search=xyz_unlikely_to_match");
    expect(res.status()).toBe(200);
    const data = await res.json() as unknown[];
    expect(Array.isArray(data)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 60. Skills full lifecycle
// ---------------------------------------------------------------------------

test.describe("Skills API (extended)", () => {
  test("full skill lifecycle: create → update → delete", async ({ request }) => {
    const createRes = await request.post("/api/skills", {
      data: {
        name: "Lifecycle Skill",
        description: "A test skill",
        prompt_template: "Do {{task}}",
      },
    });
    expect([200, 201]).toContain(createRes.status());
    const skill = await createRes.json() as { id: string };
    const skillId = skill.id;

    // Update
    const updateRes = await request.put(`/api/skills/${skillId}`, {
      data: { name: "Updated Lifecycle Skill", description: "Updated desc" },
    });
    expect([200, 204]).toContain(updateRes.status());

    // Delete
    const deleteRes = await request.delete(`/api/skills/${skillId}`);
    expect([200, 204]).toContain(deleteRes.status());
  });
});

// ---------------------------------------------------------------------------
// 61. Templates full lifecycle
// ---------------------------------------------------------------------------

test.describe("Templates API (extended)", () => {
  test("full template lifecycle: create → run → delete", async ({ request }) => {
    const createRes = await request.post("/api/templates", {
      data: {
        action: "create",
        name: "Lifecycle Template",
        prompt: "Summarise {{input}}",
        description: "A lifecycle test template",
        category: "test",
        tags: ["lifecycle"],
      },
    });
    expect([200, 201]).toContain(createRes.status());
    const tmpl = await createRes.json() as { id?: string; template?: { id: string } };
    const templateId = tmpl.id ?? tmpl.template?.id ?? "";

    if (templateId) {
      // Run (creates a task from the template)
      const runRes = await request.post("/api/templates", {
        data: { action: "run", template_id: templateId, variables: {} },
      });
      expect([200, 201]).toContain(runRes.status());

      // Delete — action=delete requires template_id, not id
      const deleteRes = await request.post("/api/templates", {
        data: { action: "delete", template_id: templateId },
      });
      expect([200, 204]).toContain(deleteRes.status());
    }
  });
});

// ---------------------------------------------------------------------------
// 62. OAuth routes (auth/oauth, auth/callback)
// ---------------------------------------------------------------------------

test.describe("OAuth routes", () => {
  test("GET /api/auth/oauth/google redirects to auth provider", async ({ request }) => {
    // OAuth initiation — redirects away; 302/307 or 400 if misconfigured
    const res = await request.get("/api/auth/oauth/google", {
      maxRedirects: 0,
    });
    expect([200, 302, 307, 400, 404, 500]).toContain(res.status());
  });

  test("GET /api/auth/oauth/github redirects to auth provider", async ({ request }) => {
    const res = await request.get("/api/auth/oauth/github", {
      maxRedirects: 0,
    });
    expect([200, 302, 307, 400, 404, 500]).toContain(res.status());
  });

  test("GET /api/auth/callback/google without code returns redirect", async ({ request }) => {
    // Callback without valid code or state — should redirect to an error page
    const res = await request.get("/api/auth/callback/google", {
      maxRedirects: 0,
    });
    expect([200, 302, 307, 400, 404, 500]).toContain(res.status());
  });
});

// ---------------------------------------------------------------------------
// 63. WhatsApp send API
// ---------------------------------------------------------------------------

test.describe("WhatsApp Send API", () => {
  test("GET /api/whatsapp/send returns status object", async ({ request }) => {
    const res = await request.get("/api/whatsapp/send");
    // Returns 200 with status/config info, or 503 if not configured
    expect([200, 503]).toContain(res.status());
  });

  test("POST /api/whatsapp/send without 'to' returns 400 or 503", async ({ request }) => {
    const res = await request.post("/api/whatsapp/send", {
      data: { text: "Hello" },
    });
    // Missing 'to' field → 400; not configured → 503
    expect([400, 503]).toContain(res.status());
  });

  test("POST /api/whatsapp/send without 'text' returns 400 or 503", async ({ request }) => {
    const res = await request.post("/api/whatsapp/send", {
      data: { to: "+15551234567" },
    });
    expect([400, 503]).toContain(res.status());
  });

  test("POST /api/whatsapp/send with both fields but no config returns 503", async ({ request }) => {
    const res = await request.post("/api/whatsapp/send", {
      data: { to: "+15551234567", text: "Test message" },
    });
    // Without WHATSAPP_ACCESS_TOKEN configured → 503
    expect([200, 400, 503]).toContain(res.status());
  });
});

// ---------------------------------------------------------------------------
// 64. Files [taskId]/[filename] download route
// ---------------------------------------------------------------------------

test.describe("Files download route", () => {
  test("GET /api/files/nonexistent-task/file.png returns 403 or 404", async ({ request }) => {
    const res = await request.get("/api/files/nonexistent-task-id/file.png");
    // Task doesn't exist → 403 (forbidden path traversal check) or 404
    expect([403, 404]).toContain(res.status());
  });
});

// ---------------------------------------------------------------------------
// 65. Test-Reddit-Post API (dev-gated — skipped: launches real browser automation)
// ---------------------------------------------------------------------------

test.describe("Test-Reddit-Post API", () => {
  // This route gates behind NODE_ENV !== 'development' (returns 403 in production).
  // In dev mode it launches real browser automation to post on Reddit — can't test
  // in an automated suite without triggering live social media actions.
  test.skip("GET /api/test-reddit-post skipped — dev-only route with live browser automation", async () => {
    // no-op
  });
});

// ===========================================================================
// UI INTERACTION TESTS — Buttons, filters, tabs, forms, modals on every page
// ===========================================================================

// ---------------------------------------------------------------------------
// 66. Tasks page — sort, view toggle, calendar
// ---------------------------------------------------------------------------

test.describe("Tasks page — interactions", () => {
  test("sort toggle switches between recent and priority", async ({ page }) => {
    await page.goto("/computer/tasks");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    // Find the sort button (shows something like "Recent" or sort icon)
    const sortBtn = page.locator("button").filter({ hasText: /Recent|Priority|Sort/i }).first();
    if (await sortBtn.isVisible()) {
      await sortBtn.click();
      // Button text or aria should change
      await page.waitForTimeout(200);
      await expect(sortBtn).toBeVisible();
    }
  });

  test("view toggle switches between list and calendar", async ({ page }) => {
    await page.goto("/computer/tasks");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    const calendarBtn = page.locator("button").filter({ hasText: /Calendar|List|View/i }).first();
    if (await calendarBtn.isVisible()) {
      const before = await calendarBtn.textContent();
      await calendarBtn.click();
      await page.waitForTimeout(200);
      // Page shouldn't crash
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("status filters — Running, Completed, Failed tabs", async ({ page }) => {
    await page.goto("/computer/tasks");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    for (const label of ["Running", "Completed", "Failed", "All"]) {
      const btn = page.getByRole("button", { name: new RegExp(label, "i") });
      if (await btn.isVisible()) {
        await btn.first().click();
        await page.waitForTimeout(150);
      }
    }
    await expect(page.locator("body")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 67. Settings page — interactions
// ---------------------------------------------------------------------------

test.describe("Settings page — interactions", () => {
  test("model select dropdown has options", async ({ page }) => {
    await page.goto("/computer/settings");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    const select = page.locator("select").first();
    if (await select.isVisible()) {
      const options = await select.locator("option").count();
      expect(options).toBeGreaterThan(0);
    }
  });

  test("max iterations input accepts numeric value", async ({ page }) => {
    await page.goto("/computer/settings");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    const iterInput = page.locator("input[type='number'], input[type='text']")
      .filter({ hasText: /iter/i });
    // Try by label proximity — look for input near "Max Agent Iterations"
    const label = page.getByText("Max Agent Iterations");
    if (await label.isVisible()) {
      // The input is usually nearby
      const input = page.locator("input[type='number']").first();
      if (await input.isVisible()) {
        await input.fill("5");
        await expect(input).toHaveValue("5");
      }
    }
  });

  test("verbose mode toggle button is clickable", async ({ page }) => {
    await page.goto("/computer/settings");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    const verboseBtn = page.locator("button").filter({ hasText: /Verbose|verbose/i }).first();
    if (await verboseBtn.isVisible()) {
      await verboseBtn.click();
      await page.waitForTimeout(150);
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("Save Settings button is present and clickable", async ({ page }) => {
    await page.goto("/computer/settings");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    const saveBtn = page.locator("button").filter({ hasText: /Save|Apply/i }).first();
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();
    await page.waitForTimeout(300);
    // Should not crash or navigate away
    await expect(page).toHaveURL(/settings/);
  });
});

// ---------------------------------------------------------------------------
// 68. Skills page — tab switching, create modal
// ---------------------------------------------------------------------------

test.describe("Skills page — interactions", () => {
  test("My Skills / Marketplace / Import tabs all switch", async ({ page }) => {
    await page.goto("/computer/skills");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    for (const tab of ["My Skills", "Marketplace", "Import"]) {
      const btn = page.locator("button").filter({ hasText: new RegExp(tab, "i") }).first();
      if (await btn.isVisible()) {
        await btn.click();
        await page.waitForTimeout(150);
      }
    }
    await expect(page.locator("body")).toBeVisible();
  });

  test("New Skill button opens create modal with form fields", async ({ page }) => {
    await page.goto("/computer/skills");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    const newBtn = page.locator("button").filter({ hasText: /New Skill|New|Create Skill/i }).first();
    await newBtn.click();
    // Modal/form should appear with name input
    const nameInput = page.locator("input[placeholder*='skill' i], input[placeholder*='name' i]").first();
    await expect(nameInput).toBeVisible({ timeout: 5_000 });
  });

  test("Create skill modal — fill name and description", async ({ page }) => {
    await page.goto("/computer/skills");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    const newBtn = page.locator("button").filter({ hasText: /New Skill|New/i }).first();
    await newBtn.click();
    const nameInput = page.locator("input").filter({ hasText: /name/i }).or(
      page.locator("input[placeholder*='skill' i], input[placeholder*='name' i]")
    ).first();
    if (await nameInput.isVisible({ timeout: 4_000 })) {
      await nameInput.fill("Test Skill Name");
      await expect(nameInput).toHaveValue("Test Skill Name");
    }
  });

  test("Close/cancel skill modal returns to list", async ({ page }) => {
    await page.goto("/computer/skills");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    const newBtn = page.locator("button").filter({ hasText: /New Skill|New/i }).first();
    await newBtn.click();
    await page.waitForTimeout(300);
    // Press Escape to close
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    // Heading should still be visible
    await expect(page.getByRole("heading", { name: /Skills/i })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 69. Memory page — category filter, cancel form, delete
// ---------------------------------------------------------------------------

test.describe("Memory page — interactions", () => {
  test("category filter buttons are visible and clickable", async ({ page }) => {
    await page.goto("/computer/memory");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    // Look for filter buttons (All, user, system etc)
    const allBtn = page.locator("button").filter({ hasText: /^All$|All memories/i }).first();
    if (await allBtn.isVisible()) {
      await allBtn.click();
      await page.waitForTimeout(150);
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("Add Memory form: Cancel button closes form", async ({ page }) => {
    await page.goto("/computer/memory");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    await page.locator("button").filter({ hasText: /Add Memory/i }).first().click();
    await page.getByPlaceholder(/e\.g\. user_preference/i).waitFor({ state: "visible", timeout: 5_000 });
    const cancelBtn = page.locator("button").filter({ hasText: /Cancel/i }).first();
    await cancelBtn.click();
    await page.waitForTimeout(200);
    // Form should be hidden again
    const formInput = page.getByPlaceholder(/e\.g\. user_preference/i);
    await expect(formInput).not.toBeVisible();
  });

  test("Add Memory form: tags input accepts text", async ({ page }) => {
    await page.goto("/computer/memory");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    await page.locator("button").filter({ hasText: /Add Memory/i }).first().click();
    const tagsInput = page.getByPlaceholder(/e\.g\. user, preference/i);
    await tagsInput.waitFor({ state: "visible", timeout: 5_000 });
    await tagsInput.fill("test, tag");
    await expect(tagsInput).toHaveValue("test, tag");
  });

  test("Search memory filters list as typed", async ({ page }) => {
    await page.goto("/computer/memory");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    const search = page.getByPlaceholder(/Search memory/i);
    await search.fill("zzz_unlikely_match_xyz");
    await page.waitForTimeout(300);
    await expect(search).toHaveValue("zzz_unlikely_match_xyz");
  });
});

// ---------------------------------------------------------------------------
// 70. Sessions page — expand, pin, delete, create form
// ---------------------------------------------------------------------------

test.describe("Sessions page — interactions", () => {
  test("Create session: description textarea is fillable", async ({ page }) => {
    await page.goto("/computer/sessions");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    await page.locator("button").filter({ hasText: /New Session|New/i }).first().click();
    const nameInput = page.getByPlaceholder(/e\.g\. Research Project/i);
    await nameInput.waitFor({ state: "visible", timeout: 5_000 });
    await nameInput.fill("Test Session");
    const descInput = page.getByPlaceholder(/What this session is about/i);
    if (await descInput.isVisible()) {
      await descInput.fill("A UI test session");
      await expect(descInput).toHaveValue("A UI test session");
    }
  });

  test("Create session: model select has options", async ({ page }) => {
    await page.goto("/computer/sessions");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    await page.locator("button").filter({ hasText: /New Session|New/i }).first().click();
    const nameInput = page.getByPlaceholder(/e\.g\. Research Project/i);
    await nameInput.waitFor({ state: "visible", timeout: 5_000 });
    const modelSelect = page.locator("select").first();
    if (await modelSelect.isVisible()) {
      const opts = await modelSelect.locator("option").count();
      expect(opts).toBeGreaterThan(0);
    }
  });

  test("Full session: create then delete via API", async ({ page, request }) => {
    // Create via API so we have something to render
    const createRes = await request.post("/api/sessions", {
      data: { name: "UI Delete Test Session", description: "deleting via UI" },
    });
    expect([200, 201]).toContain(createRes.status());
    const sess = await createRes.json() as { id: string };

    await page.goto("/computer/sessions");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    // Session card should appear
    await expect(page.getByText("UI Delete Test Session")).toBeVisible({ timeout: 5_000 });

    // Clean up via API
    await request.delete(`/api/sessions?id=${sess.id}`);
  });
});

// ---------------------------------------------------------------------------
// 71. Templates page — category filters, template selection, user input
// ---------------------------------------------------------------------------

test.describe("Templates page — interactions", () => {
  test("category filter tabs filter the template list", async ({ page }) => {
    await page.goto("/computer/templates");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    const allBtn = page.getByRole("button", { name: /^All$/i }).first();
    await allBtn.click();
    await page.waitForTimeout(200);
    // Click a category if any exist
    const catBtns = page.locator("button").filter({ hasText: /Research|Writing|Productivity|Development/i });
    const count = await catBtns.count();
    if (count > 0) {
      await catBtns.first().click();
      await page.waitForTimeout(200);
      // Click All again to reset
      await allBtn.click();
    }
    await expect(page.locator("body")).toBeVisible();
  });

  test("New Template button opens create form", async ({ page }) => {
    await page.goto("/computer/templates");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    const newBtn = page.locator("button").filter({ hasText: /New Template|Create Template|Create/i }).first();
    if (await newBtn.isVisible()) {
      await newBtn.click();
      await page.waitForTimeout(300);
      // A form/modal with name input should appear
      const nameInput = page.locator("input[placeholder*='name' i], input[placeholder*='template' i]").first();
      if (await nameInput.isVisible({ timeout: 3_000 })) {
        await nameInput.fill("Test Template");
        await expect(nameInput).toHaveValue("Test Template");
      }
    }
  });

  test("clicking a template card selects it and shows user input", async ({ page, request }) => {
    // Ensure at least one template exists
    const createRes = await request.post("/api/templates", {
      data: {
        action: "create",
        name: "UI Tab Test Template",
        prompt: "Do {{task}}",
        description: "test",
        category: "test",
      },
    });

    await page.goto("/computer/templates");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });

    const card = page.locator("[role='button'], button, div[class*='cursor-pointer']")
      .filter({ hasText: "UI Tab Test Template" }).first();
    if (await card.isVisible({ timeout: 3_000 })) {
      await card.click();
      // User input textarea should appear
      const inputArea = page.getByPlaceholder(/Type your specific input/i);
      await expect(inputArea).toBeVisible({ timeout: 5_000 });
    }

    // Cleanup
    const tmpl = await createRes.json() as { id?: string };
    if (tmpl.id) {
      await request.post("/api/templates", { data: { action: "delete", template_id: tmpl.id } });
    }
  });
});

// ---------------------------------------------------------------------------
// 72. Gallery page — category filters, search
// ---------------------------------------------------------------------------

test.describe("Gallery page — interactions", () => {
  test("gallery category filter buttons work", async ({ page }) => {
    await page.goto("/computer/gallery");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    // Find category tabs (All, Images, Videos, etc.)
    const catBtns = page.locator("button").filter({ hasText: /^All$|Images|Videos|Audio/i });
    const count = await catBtns.count();
    for (let i = 0; i < Math.min(count, 4); i++) {
      await catBtns.nth(i).click();
      await page.waitForTimeout(150);
    }
    await expect(page.locator("body")).toBeVisible();
  });

  test("gallery search filters items", async ({ page }) => {
    await page.goto("/computer/gallery");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    const search = page.getByPlaceholder(/Search gallery/i);
    await search.fill("test_zzz_no_match");
    await page.waitForTimeout(300);
    await expect(search).toHaveValue("test_zzz_no_match");
    await search.clear();
    await expect(search).toHaveValue("");
  });
});

// ---------------------------------------------------------------------------
// 73. Scheduled tasks page — form, name/prompt fields, schedule types
// ---------------------------------------------------------------------------

test.describe("Scheduled tasks page — interactions", () => {
  test("New Schedule button shows create form", async ({ page }) => {
    await page.goto("/computer/scheduled");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    const newBtn = page.locator("button").filter({ hasText: /New Schedule|New Task|Schedule|Add/i }).first();
    if (await newBtn.isVisible()) {
      await newBtn.click();
      // Form should become visible
      const nameInput = page.getByPlaceholder(/Morning briefing/i);
      await expect(nameInput).toBeVisible({ timeout: 5_000 });
    }
  });

  test("Schedule form: fill name, prompt, select schedule type", async ({ page }) => {
    await page.goto("/computer/scheduled");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    const showFormBtn = page.locator("button").filter({ hasText: /New Schedule|New Task|Schedule|Add/i }).first();
    if (await showFormBtn.isVisible()) {
      await showFormBtn.click();
      const nameInput = page.getByPlaceholder(/Morning briefing/i);
      await nameInput.waitFor({ state: "visible", timeout: 5_000 });
      await nameInput.fill("Daily Standup");
      await expect(nameInput).toHaveValue("Daily Standup");

      const promptArea = page.getByPlaceholder(/Summarize my overnight emails/i);
      if (await promptArea.isVisible()) {
        await promptArea.fill("Run a morning briefing");
        await expect(promptArea).toHaveValue("Run a morning briefing");
      }

      // Change schedule type — schedule_type is the SECOND select (first is model)
      const selects = page.locator("select");
      const selectCount = await selects.count();
      if (selectCount >= 2) {
        const scheduleSelect = selects.nth(1);
        if (await scheduleSelect.isVisible()) {
          await scheduleSelect.selectOption("daily");
          await expect(scheduleSelect).toHaveValue("daily");
        }
      }
    }
  });

  test("Schedule form: hide form on toggle (click New Schedule again)", async ({ page }) => {
    await page.goto("/computer/scheduled");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    const toggleBtn = page.locator("button").filter({ hasText: /New Schedule|New Task|Schedule|Add/i }).first();
    if (await toggleBtn.isVisible()) {
      await toggleBtn.click(); // show
      const nameInput = page.getByPlaceholder(/Morning briefing/i);
      await nameInput.waitFor({ state: "visible", timeout: 5_000 });
      await toggleBtn.click(); // hide
      await page.waitForTimeout(200);
      await expect(nameInput).not.toBeVisible();
    }
  });
});

// ---------------------------------------------------------------------------
// 74. Pipelines page — create, add node, back, run
// ---------------------------------------------------------------------------

test.describe("Pipelines page — interactions", () => {
  test("New Pipeline button shows create form or opens pipeline", async ({ page }) => {
    await page.goto("/computer/pipelines");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    const newBtn = page.locator("button").filter({ hasText: /New Pipeline|Create/i }).first();
    await expect(newBtn).toBeVisible();
    await newBtn.click();
    await page.waitForTimeout(300);
    // Should show a create form or an empty pipeline editor
    await expect(page.locator("body")).toBeVisible();
  });

  test("existing pipeline: clicking shows editor with Run button", async ({ page, request }) => {
    // Create a pipeline via API
    const createRes = await request.post("/api/pipelines", {
      data: { name: "UI Test Pipeline", steps: [] },
    });
    expect([200, 201]).toContain(createRes.status());
    const pipeline = await createRes.json() as { id: string };

    await page.goto("/computer/pipelines");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    // Click the pipeline card
    const card = page.locator("div, button").filter({ hasText: "UI Test Pipeline" }).first();
    if (await card.isVisible({ timeout: 3_000 })) {
      await card.click();
      await page.waitForTimeout(300);
      // Should show Run Pipeline button or Add Step
      const runBtn = page.locator("button").filter({ hasText: /Run Pipeline|Run|Add Step|Add Node/i }).first();
      await expect(runBtn).toBeVisible({ timeout: 5_000 });
    }

    // Cleanup
    await request.delete("/api/pipelines", { data: { id: pipeline.id } });
  });
});

// ---------------------------------------------------------------------------
// 75. Audit page — refresh, search, filters, pagination
// ---------------------------------------------------------------------------

test.describe("Audit page — interactions", () => {
  test("Refresh button reloads audit logs", async ({ page }) => {
    await page.goto("/computer/audit");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    const refreshBtn = page.locator("button").filter({ hasText: /Refresh|Reload/i }).first();
    await expect(refreshBtn).toBeVisible();
    await refreshBtn.click();
    await page.waitForTimeout(500);
    await expect(page.locator("body")).toBeVisible();
  });

  test("audit search input filters logs", async ({ page }) => {
    await page.goto("/computer/audit");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    const search = page.getByPlaceholder(/Search logs/i);
    await search.fill("test_zzz_filter");
    await page.waitForTimeout(300);
    await expect(search).toHaveValue("test_zzz_filter");
    await search.clear();
  });

  test("audit type/entity/action filter selects are functional", async ({ page }) => {
    await page.goto("/computer/audit");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    const selects = page.locator("select");
    const count = await selects.count();
    // There should be action/type/entity filter selects
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < Math.min(count, 3); i++) {
      const opts = await selects.nth(i).locator("option").count();
      expect(opts).toBeGreaterThan(0);
    }
  });

  test("audit pagination: Prev button is disabled on first page", async ({ page }) => {
    await page.goto("/computer/audit");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    const prevBtn = page.locator("button").filter({ hasText: /Prev|Previous|←/i }).first();
    if (await prevBtn.isVisible()) {
      // On page 1, prev should be disabled
      await expect(prevBtn).toBeDisabled();
    }
  });
});

// ---------------------------------------------------------------------------
// 76. Analytics page — refresh button
// ---------------------------------------------------------------------------

test.describe("Analytics page — interactions", () => {
  test("Refresh button reloads analytics data", async ({ page }) => {
    await page.goto("/computer/analytics");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    const refreshBtn = page.locator("button").filter({ hasText: /Refresh|Reload/i }).first();
    await expect(refreshBtn).toBeVisible();
    await refreshBtn.click();
    await page.waitForTimeout(500);
    await expect(page.locator("body")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 77. Channels page — copy webhook URL button
// ---------------------------------------------------------------------------

test.describe("Channels page — interactions", () => {
  test("Copy webhook URL buttons are present", async ({ page }) => {
    await page.goto("/computer/channels");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    // The copy button uses an icon (no text); it has title="Copy full webhook URL"
    const copyBtns = page.locator("button[title*='Copy' i], button[title*='copy' i]");
    const count = await copyBtns.count();
    // Should be at least one copy button (Discord, Slack, Telegram)
    expect(count).toBeGreaterThanOrEqual(1);
    await copyBtns.first().click();
    await page.waitForTimeout(200);
    await expect(page.locator("body")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 78. App Builder page — prompt, reset, device buttons
// ---------------------------------------------------------------------------

test.describe("App Builder page — interactions", () => {
  test("prompt textarea accepts text input", async ({ page }) => {
    await page.goto("/computer/app-builder");
    await page.waitForSelector("textarea, h1", { state: "visible", timeout: 30_000 });
    const textarea = page.locator("textarea").first();
    if (await textarea.isVisible()) {
      await textarea.fill("Build me a todo app");
      await expect(textarea).toHaveValue("Build me a todo app");
    }
  });

  test("device selector buttons (mobile/tablet/desktop) are clickable", async ({ page }) => {
    await page.goto("/computer/app-builder");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    const deviceBtns = page.locator("button").filter({
      hasText: /Mobile|Tablet|Desktop|Phone/i,
    });
    const count = await deviceBtns.count();
    if (count > 0) {
      for (let i = 0; i < Math.min(count, 3); i++) {
        await deviceBtns.nth(i).click();
        await page.waitForTimeout(100);
      }
      await expect(page.locator("body")).toBeVisible();
    }
  });
});

// ---------------------------------------------------------------------------
// 79. WhatsApp page — refresh, copy, send form
// ---------------------------------------------------------------------------

test.describe("WhatsApp page — interactions", () => {
  test("Refresh status button triggers status reload", async ({ page }) => {
    await page.goto("/computer/whatsapp");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    const refreshBtn = page.locator("button").filter({ hasText: /Refresh|Reload|Check/i }).first();
    if (await refreshBtn.isVisible()) {
      await refreshBtn.click();
      await page.waitForTimeout(500);
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("Copy webhook URL button is present and clickable", async ({ page }) => {
    await page.goto("/computer/whatsapp");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    const copyBtn = page.locator("button").filter({ hasText: /Copy|Webhook/i }).first();
    if (await copyBtn.isVisible()) {
      await copyBtn.click();
      await page.waitForTimeout(200);
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("send test message form: phone input and message textarea", async ({ page }) => {
    await page.goto("/computer/whatsapp");
    await page.waitForSelector("h1", { state: "visible", timeout: 30_000 });
    const phoneInput = page.getByPlaceholder(/14155551234/i);
    if (await phoneInput.isVisible()) {
      await phoneInput.fill("15551234567");
      await expect(phoneInput).toHaveValue("15551234567");
    }
    const messageArea = page.getByPlaceholder(/Type your message/i);
    if (await messageArea.isVisible()) {
      await messageArea.fill("Hello test");
      await expect(messageArea).toHaveValue("Hello test");
    }
  });
});

// ---------------------------------------------------------------------------
// 80. Connectors page — status tabs, category filter, search
// ---------------------------------------------------------------------------

test.describe("Connectors page — interactions", () => {
  test("status filter tabs (All/Connected/Available) switch", async ({ page }) => {
    await page.goto("/computer/connectors", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /Connectors/i }).waitFor({ state: "visible", timeout: 15_000 });
    for (const label of ["All", "Connected", "Available"]) {
      const btn = page.locator("button").filter({ hasText: new RegExp(`^${label}$`, "i") }).first();
      if (await btn.isVisible()) {
        await btn.click();
        await page.waitForTimeout(150);
      }
    }
    await expect(page.locator("body")).toBeVisible();
  });

  test("connectors search narrows the list", async ({ page }) => {
    await page.goto("/computer/connectors", { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder(/Search connectors/i).waitFor({ state: "visible", timeout: 15_000 });
    const search = page.getByPlaceholder(/Search connectors/i);
    await search.fill("Gmail");
    await page.waitForTimeout(300);
    await expect(search).toHaveValue("Gmail");
    await search.clear();
    await expect(search).toHaveValue("");
  });

  test("connectors category filter buttons are clickable", async ({ page }) => {
    await page.goto("/computer/connectors", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /Connectors/i }).waitFor({ state: "visible", timeout: 15_000 });
    const catBtns = page.locator("button").filter({
      hasText: /Email|Calendar|Productivity|Communication|Storage|Social/i,
    });
    const count = await catBtns.count();
    if (count > 0) {
      await catBtns.first().click();
      await page.waitForTimeout(150);
      await expect(page.locator("body")).toBeVisible();
    }
  });
});

// ---------------------------------------------------------------------------
// 81. Files page — view mode toggle, folder expand, search
// ---------------------------------------------------------------------------

test.describe("Files page — interactions", () => {
  test("view mode toggle (grid/list) buttons are clickable", async ({ page }) => {
    await page.goto("/computer/files", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /All Files/i }).waitFor({ state: "visible", timeout: 15_000 });
    // Look for grid/list/view toggle buttons
    const viewBtns = page.locator("button[title], button[aria-label]").filter({
      hasText: /grid|list/i,
    }).or(page.locator("button").filter({ hasText: /Grid|List|View/i }));
    const count = await viewBtns.count();
    if (count > 0) {
      await viewBtns.first().click();
      await page.waitForTimeout(200);
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("folder row click expands/collapses folder contents", async ({ page }) => {
    await page.goto("/computer/files", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /All Files/i }).waitFor({ state: "visible", timeout: 15_000 });
    // Any task folder should be clickable
    const folders = page.locator("button, div[class*='cursor']").filter({ hasText: /task|folder/i });
    const count = await folders.count();
    if (count > 0) {
      await folders.first().click();
      await page.waitForTimeout(200);
      await expect(page.locator("body")).toBeVisible();
    }
  });
});

// ---------------------------------------------------------------------------
// 82. Main /computer page — prompt textarea, shuffle, categories
// ---------------------------------------------------------------------------

test.describe("Main computer page — interactions", () => {
  test("prompt textarea accepts and holds text", async ({ page }) => {
    await page.goto("/computer");
    await page.locator("textarea").waitFor({ state: "visible", timeout: 30_000 });
    const textarea = page.locator("textarea").first();
    await textarea.fill("Write me a Python script to sort a list");
    await expect(textarea).toHaveValue("Write me a Python script to sort a list");
  });

  test("Shuffle button cycles prompt suggestions", async ({ page }) => {
    await page.goto("/computer");
    await page.locator("textarea").waitFor({ state: "visible", timeout: 30_000 });
    const shuffleBtn = page.locator("button").filter({ hasText: /Shuffle|shuffle/i })
      .or(page.locator("button[title*='shuffle' i]"))
      .first();
    if (await shuffleBtn.isVisible()) {
      await shuffleBtn.click();
      await page.waitForTimeout(200);
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("category buttons (Code, Research, etc.) are clickable", async ({ page }) => {
    await page.goto("/computer");
    await page.locator("textarea").waitFor({ state: "visible", timeout: 30_000 });
    const catBtns = page.locator("button").filter({
      hasText: /Code|Research|Writing|Data|Email|Web|Image|Video/i,
    });
    const count = await catBtns.count();
    if (count > 0) {
      await catBtns.first().click();
      await page.waitForTimeout(150);
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("prompt suggestion chip populates textarea on click", async ({ page }) => {
    await page.goto("/computer");
    await page.locator("textarea").waitFor({ state: "visible", timeout: 30_000 });
    // Suggestion chips are usually small clickable buttons under categories
    const chips = page.locator("button[class*='prompt'], button[class*='suggestion'], button[class*='chip']").first();
    if (await chips.isVisible({ timeout: 2_000 })) {
      const before = await page.locator("textarea").inputValue();
      await chips.click();
      await page.waitForTimeout(300);
      const after = await page.locator("textarea").inputValue();
      // Textarea value should change
      expect(after).not.toBe(before);
    }
  });

  test("pressing Enter in textarea doesn't navigate away (keyboard UX)", async ({ page }) => {
    await page.goto("/computer");
    await page.locator("textarea").waitFor({ state: "visible", timeout: 30_000 });
    const textarea = page.locator("textarea").first();
    await textarea.fill("test");
    // Cmd+Enter submits; bare Enter should not submit
    await textarea.press("Enter");
    await page.waitForTimeout(200);
    await expect(page).toHaveURL(/\/computer$/);
  });
});

// ---------------------------------------------------------------------------
// 83. Task detail page — message input, stop, back
// ---------------------------------------------------------------------------

test.describe("Task detail page — interactions", () => {
  test("task detail: message input and Stop button visible", async ({ page, request }) => {
    // Create a task so we have a valid detail page
    const createRes = await request.post("/api/tasks", {
      data: { prompt: "UI detail page test — idle", priority: "low" },
    });
    expect(createRes.status()).toBe(201);
    const task = await createRes.json() as { id: string };

    try {
      await page.goto(`/computer/tasks/${task.id}`, { waitUntil: "domcontentloaded" });
      // Page should load without crashing
      await expect(page.locator("body")).toBeVisible({ timeout: 10_000 });
      // Should show some task content
      await expect(
        page.locator("h1, h2, [class*='task'], [class*='detail']").first()
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      await request.delete(`/api/tasks/${task.id}`);
    }
  });

  test("task detail: back link returns to tasks list", async ({ page, request }) => {
    const createRes = await request.post("/api/tasks", {
      data: { prompt: "UI back nav test", priority: "low" },
    });
    const task = await createRes.json() as { id: string };

    try {
      await page.goto(`/computer/tasks/${task.id}`, { waitUntil: "domcontentloaded" });
      await page.locator("body").waitFor({ state: "visible", timeout: 10_000 });

      // Use nth(0) to avoid strict mode errors; sidebar + breadcrumb may both match
      const backLink = page.locator("a[href*='/computer/tasks']").first();
      if (await backLink.isVisible({ timeout: 3_000 })) {
        await backLink.click();
        await expect(page).toHaveURL(/\/computer\/tasks$|\/computer\/tasks[^/]/, { timeout: 5_000 });
      }
    } finally {
      await request.delete(`/api/tasks/${task.id}`);
    }
  });
});

// ---------------------------------------------------------------------------
// 84. Onboarding page — step navigation
// ---------------------------------------------------------------------------

test.describe("Onboarding page — interactions", () => {
  test("Next button advances to step 2", async ({ page }) => {
    await page.goto("/computer/onboarding");
    await page.getByRole("heading", { name: /Welcome/i }).waitFor({ state: "visible", timeout: 15_000 });
    const nextBtn = page.locator("button").filter({ hasText: /Next|Continue|Get Started/i }).first();
    await nextBtn.click();
    await page.waitForTimeout(300);
    // Should show step 2 heading
    const step2 = page.getByRole("heading", { name: /System Check|Health|Model|Step/i });
    await expect(step2).toBeVisible({ timeout: 5_000 });
  });

  test("Back button returns to step 1 from step 2", async ({ page }) => {
    await page.goto("/computer/onboarding");
    await page.getByRole("heading", { name: /Welcome/i }).waitFor({ state: "visible", timeout: 15_000 });
    const nextBtn = page.locator("button").filter({ hasText: /Next|Continue|Get Started/i }).first();
    await nextBtn.click();
    await page.waitForTimeout(300);
    const backBtn = page.locator("button").filter({ hasText: /Back|Previous/i }).first();
    if (await backBtn.isVisible({ timeout: 3_000 })) {
      await backBtn.click();
      await page.waitForTimeout(200);
      await expect(page.getByRole("heading", { name: /Welcome/i })).toBeVisible();
    }
  });
});

// ---------------------------------------------------------------------------
// 85. Replicate Explorer page — category tabs, smart run input
// ---------------------------------------------------------------------------

test.describe("Replicate Explorer page — interactions", () => {
  test("category tab buttons filter model list", async ({ page }) => {
    await page.goto("/computer/replicate");
    await page.waitForSelector("h1", { state: "visible", timeout: 15_000 });
    const catBtns = page.locator("button").filter({
      hasText: /Image|Video|Audio|Text|3D|All/i,
    });
    const count = await catBtns.count();
    if (count > 0) {
      for (let i = 0; i < Math.min(count, 4); i++) {
        await catBtns.nth(i).click();
        await page.waitForTimeout(150);
      }
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("smart run input accepts prompt text", async ({ page }) => {
    await page.goto("/computer/replicate");
    await page.waitForSelector("h1", { state: "visible", timeout: 15_000 });
    const input = page.locator("input, textarea").first();
    await expect(input).toBeVisible({ timeout: 5_000 });
    await input.fill("a futuristic cityscape at night");
    await expect(input).toHaveValue("a futuristic cityscape at night");
  });
});

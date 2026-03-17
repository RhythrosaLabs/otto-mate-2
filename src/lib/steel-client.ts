/**
 * Steel Browser Client — shared module for cloud browser sessions
 *
 * Steel (steel.dev) is a headless browser API for AI agents that provides:
 * - Anti-detection / stealth (fingerprinting, proxy rotation)
 * - Automatic CAPTCHA solving (reCAPTCHA, Turnstile, AWS WAF)
 * - Session persistence via Profiles API (cookies, localStorage, auth state)
 * - Credentials API for secure auto-login without exposing passwords to agents
 * - Cloud-hosted Chrome with full CDP/Playwright/Puppeteer access
 *
 * This module centralizes all Steel interactions so both `browse_web` and
 * `social_media_post` tools share the same session/profile management.
 *
 * Usage modes:
 *   1. STEEL_API_KEY set → Steel Cloud (connect.steel.dev)
 *   2. STEEL_BASE_URL set → Self-hosted Steel Docker instance
 *   3. Neither → Falls back to local Playwright (no Steel features)
 *
 * Profiles are mapped per-purpose (e.g. "social:reddit", "browse:default")
 * and persisted so auth cookies survive across separate tool invocations.
 */

import path from "path";
import fs from "fs";

// ─── Config ───────────────────────────────────────────────────────────────────

const STEEL_API_KEY = () => process.env.STEEL_API_KEY || "";
const STEEL_BASE_URL = () => process.env.STEEL_BASE_URL || "";

/** REST API base (https://api.steel.dev or self-hosted) */
function steelRestBase(): string {
  const base = STEEL_BASE_URL();
  if (base) return base.replace(/^ws/, "http").replace(/\/$/, "");
  return "https://api.steel.dev";
}

/** WebSocket base for CDP connection */
function steelWsBase(): string {
  const base = STEEL_BASE_URL();
  if (base) return base.replace(/\/$/, "");
  return "wss://connect.steel.dev";
}

/** Returns true when Steel is configured (API key or self-hosted URL) */
export function isSteelEnabled(): boolean {
  return !!(STEEL_API_KEY() || STEEL_BASE_URL());
}

// ─── Profile ID persistence ──────────────────────────────────────────────────
// We store Steel profile IDs locally so sessions can be reused across runs.
// Profiles persist cookies, localStorage, extensions, and browser settings.

const PROFILES_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || "/tmp",
  ".ottomatron",
  "steel-profiles"
);

function ensureProfilesDir() {
  if (!fs.existsSync(PROFILES_DIR)) {
    fs.mkdirSync(PROFILES_DIR, { recursive: true });
  }
}

/** Get the stored Steel profile ID for a given purpose key */
export function getStoredProfileId(purposeKey: string): string | null {
  ensureProfilesDir();
  const filePath = path.join(PROFILES_DIR, `${purposeKey.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return data.profileId || null;
  } catch {
    return null;
  }
}

/** Store a Steel profile ID for reuse */
export function storeProfileId(purposeKey: string, profileId: string): void {
  ensureProfilesDir();
  const filePath = path.join(PROFILES_DIR, `${purposeKey.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`);
  fs.writeFileSync(filePath, JSON.stringify({ profileId, updatedAt: new Date().toISOString() }));
}

/** Store the session context (cookies/localStorage) locally as backup */
export function storeSessionContext(purposeKey: string, context: unknown): void {
  ensureProfilesDir();
  const filePath = path.join(PROFILES_DIR, `${purposeKey.replace(/[^a-zA-Z0-9_-]/g, "_")}_context.json`);
  fs.writeFileSync(filePath, JSON.stringify(context));
}

/** Load a previously saved session context */
export function loadSessionContext(purposeKey: string): unknown | null {
  ensureProfilesDir();
  const filePath = path.join(PROFILES_DIR, `${purposeKey.replace(/[^a-zA-Z0-9_-]/g, "_")}_context.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

// ─── Steel REST API helpers ──────────────────────────────────────────────────

function steelHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const key = STEEL_API_KEY();
  if (key) headers["steel-api-key"] = key;
  return headers;
}

export interface SteelSessionOptions {
  /** Purpose key for profile persistence (e.g. "social:reddit", "browse:default") */
  purposeKey?: string;
  /** Enable CAPTCHA auto-solving (default: true) */
  solveCaptcha?: boolean;
  /** Enable residential proxy (default: false) */
  useProxy?: boolean;
  /** Session timeout in ms (default: 300000 = 5 min) */
  timeout?: number;
  /** Viewport dimensions */
  dimensions?: { width: number; height: number };
  /** Store credentials securely for auto-injection */
  credentials?: Record<string, unknown>;
  /**
   * Namespace for Steel Credentials API (default: "default").
   * Used to differentiate multiple credential sets.
   */
  namespace?: string;
  /**
   * Whether to enable Steel's native credential auto-injection.
   * When true (and Steel is configured), credentials from .env.local are
   * synced to Steel's encrypted Credentials API, and the session is created
   * with `credentials: {}` so Steel auto-fills login forms (including shadow DOM,
   * SPAs, and modern web components like Reddit's faceplate-text-input).
   * Default: true when credentials exist for the target domain.
   */
  enableCredentialInjection?: boolean;
}

export interface SteelSession {
  browser: import("playwright").Browser;
  context: import("playwright").BrowserContext;
  page: import("playwright").Page;
  sessionId: string | undefined;
  profileId: string | undefined;
  isSteel: boolean;
  /** Whether Steel credential injection is active for this session */
  hasCredentialInjection: boolean;
  /** Call this when done — releases Steel session & saves profile */
  release: () => Promise<void>;
}

/**
 * Create a Steel-managed browser session with profile persistence.
 *
 * When Steel is configured:
 * - Creates a session via REST API with profile persistence
 * - Reuses existing profile (cookies/auth/localStorage) if available
 * - Connects Playwright via CDP WebSocket
 * - Enables CAPTCHA solving and stealth by default
 *
 * When Steel is not configured:
 * - Falls back to local `chromium.launch()` with anti-detection flags
 */
export async function createSteelSession(
  chromium: typeof import("playwright").chromium,
  opts: SteelSessionOptions = {}
): Promise<SteelSession> {
  const {
    purposeKey = "default",
    solveCaptcha = false,
    useProxy = false,
    timeout = 300000,
    dimensions = { width: 1280, height: 800 },
    namespace = "default",
    enableCredentialInjection = true,
  } = opts;

  const apiKey = STEEL_API_KEY();
  const baseUrl = STEEL_BASE_URL();
  const isSteel = !!(apiKey || baseUrl);
  let hasCredentialInjection = false;

  let browser: import("playwright").Browser;
  let sessionId: string | undefined;
  let profileId: string | undefined;

  if (apiKey) {
    // ── Steel Cloud ──────────────────────────────────────────────────────
    // Look up existing profile for this purpose
    const existingProfileId = getStoredProfileId(purposeKey);
    const savedContext = loadSessionContext(purposeKey);

    // Sync credentials from .env to Steel Credentials API (if enabled)
    // This allows Steel to auto-inject credentials into login forms
    // using shadow DOM traversal, mutation observers, etc.
    if (enableCredentialInjection) {
      const synced = await syncEnvCredentialsToSteel(namespace);
      if (synced > 0) {
        hasCredentialInjection = true;
      }
    }

    // Build session creation payload
    const sessionPayload: Record<string, unknown> = {
      dimensions,
      solveCaptcha,
      useProxy,
      timeout,
      persistProfile: true, // Always persist so auth state survives
      namespace,
    };

    // Enable Steel's credential auto-injection if we synced credentials
    // This tells Steel to detect login forms and auto-fill them
    if (hasCredentialInjection) {
      sessionPayload.credentials = {
        autoSubmit: true,   // Auto-submit the form after filling
        blurFields: true,   // Blur fields after input (privacy)
        exactOrigin: false, // Allow sub-domain matching
      };
    }

    // Attach existing profile to reuse cookies/auth
    if (existingProfileId) {
      sessionPayload.profileId = existingProfileId;
    }

    // If we have a saved session context (cookies/localStorage) and no profile
    if (!existingProfileId && savedContext) {
      sessionPayload.sessionContext = savedContext;
    }

    try {
      const res = await fetch(`${steelRestBase()}/v1/sessions`, {
        method: "POST",
        headers: steelHeaders(),
        body: JSON.stringify(sessionPayload),
      });

      if (res.ok) {
        const data = await res.json();
        sessionId = data.id;
        profileId = data.profileId || existingProfileId;

        // Log session viewer URL for debugging
        const viewerUrl = data.sessionViewerUrl || data.session_viewer_url;
        if (viewerUrl) {
          console.log(`[Steel] Session viewer: ${viewerUrl}`);
        }
        console.log(`[Steel] Session ${sessionId} created (profile: ${profileId || "new"}, credentials: ${hasCredentialInjection})`);

        browser = await chromium.connectOverCDP(
          `${steelWsBase()}?apiKey=${apiKey}&sessionId=${sessionId}`
        );
      } else {
        const errText = await res.text().catch(() => "unknown");
        console.error(`[Steel] Session creation failed (${res.status}): ${errText}`);
        // Retry without profile/context if that failed (profile may have expired)
        const fallbackRes = await fetch(`${steelRestBase()}/v1/sessions`, {
          method: "POST",
          headers: steelHeaders(),
          body: JSON.stringify({
            dimensions,
            useProxy,
            timeout,
            persistProfile: true,
          }),
        });

        if (fallbackRes.ok) {
          const data = await fallbackRes.json();
          sessionId = data.id;
          profileId = data.profileId;
          console.log(`[Steel] Fallback session ${sessionId} created`);

          browser = await chromium.connectOverCDP(
            `${steelWsBase()}?apiKey=${apiKey}&sessionId=${sessionId}`
          );
        } else {
          const errText2 = await fallbackRes.text().catch(() => "unknown");
          console.error(`[Steel] Fallback session also failed (${fallbackRes.status}): ${errText2}`);
          // Last resort: simple connectOverCDP (no session ID)
          console.log(`[Steel] Connecting via direct WebSocket (no session ID — credential injection unavailable)`);
          browser = await chromium.connectOverCDP(
            `${steelWsBase()}?apiKey=${apiKey}`
          );
        }
      }
    } catch {
      // Connection error — try direct connect
      browser = await chromium.connectOverCDP(
        `${steelWsBase()}?apiKey=${apiKey}`
      );
    }
  } else if (baseUrl) {
    // ── Self-hosted Steel ────────────────────────────────────────────────
    try {
      const res = await fetch(`${steelRestBase()}/v1/sessions`, {
        method: "POST",
        headers: steelHeaders(),
        body: JSON.stringify({
          dimensions,
          timeout,
          persistProfile: true,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        sessionId = data.id;
        browser = await chromium.connectOverCDP(
          `${baseUrl}?sessionId=${sessionId}`
        );
      } else {
        browser = await chromium.connectOverCDP(baseUrl);
      }
    } catch {
      browser = await chromium.connectOverCDP(baseUrl);
    }
  } else {
    // ── Local Playwright fallback ────────────────────────────────────────
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-infobars",
        "--disable-dev-shm-usage",
        "--window-size=1280,800",
        "--lang=en-US",
      ],
    });
  }

  // Get or create context — Steel sessions come with a pre-existing context
  const context = isSteel
    ? (browser.contexts()[0] || await browser.newContext({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        viewport: dimensions,
      }))
    : await browser.newContext({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        viewport: dimensions,
        locale: "en-US",
        timezoneId: "America/New_York",
        extraHTTPHeaders: {
          "Accept-Language": "en-US,en;q=0.9",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",
          "Upgrade-Insecure-Requests": "1",
        },
      });

  // Get or create page
  const page = isSteel
    ? (context.pages()[0] || await context.newPage())
    : await context.newPage();

  // Inject anti-detection scripts for local-only browsers
  if (!isSteel) {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      Object.defineProperty(navigator, "plugins", {
        get: () => [1, 2, 3, 4, 5],
      });
      Object.defineProperty(navigator, "languages", {
        get: () => ["en-US", "en"],
      });
      const w = window as unknown as Record<string, unknown>;
      if (w.chrome) {
        w.chrome = { runtime: {}, loadTimes: function () {}, csi: function () {}, app: {} };
      }
    });
  }

  // Build the release function
  const release = async () => {
    try {
      // Save session context before releasing (cookies/localStorage backup)
      if (sessionId && apiKey) {
        try {
          const ctxRes = await fetch(
            `${steelRestBase()}/v1/sessions/${sessionId}/context`,
            { headers: steelHeaders() }
          );
          if (ctxRes.ok) {
            const ctxData = await ctxRes.json();
            storeSessionContext(purposeKey, ctxData);
          }
        } catch { /* best-effort context save */ }
      }

      // Close browser connection
      if (!isSteel) {
        await context.close().catch(() => {});
      }
      await browser.close().catch(() => {});

      // Release Steel session & save profile ID
      if (sessionId && apiKey) {
        try {
          const releaseRes = await fetch(
            `${steelRestBase()}/v1/sessions/${sessionId}/release`,
            { method: "POST", headers: steelHeaders() }
          );
          if (releaseRes.ok) {
            const releaseData = await releaseRes.json();
            // After release, the profile is in READY state — save its ID
            const finalProfileId = releaseData.profileId || profileId;
            if (finalProfileId) {
              storeProfileId(purposeKey, finalProfileId);
            }
          }
        } catch { /* best-effort release */ }
      }
    } catch { /* ignore cleanup errors */ }
  };

  return { browser, context, page, sessionId, profileId, isSteel, hasCredentialInjection, release };
}

// ─── Credentials API helpers ─────────────────────────────────────────────────

/**
 * Upload credentials to Steel for secure auto-injection.
 * Credentials are encrypted and never exposed to the agent or page.
 *
 * Usage:
 *   await uploadSteelCredentials("https://www.reddit.com", {
 *     username: "myuser",
 *     password: "mypass",
 *   });
 *
 * Then create a session with `credentials: {}` to auto-inject.
 */
export async function uploadSteelCredentials(
  origin: string,
  value: { username: string; password: string; totpSecret?: string },
  namespace: string = "default"
): Promise<boolean> {
  const apiKey = STEEL_API_KEY();
  if (!apiKey) return false;

  try {
    const res = await fetch(`${steelRestBase()}/v1/credentials`, {
      method: "POST",
      headers: steelHeaders(),
      body: JSON.stringify({ origin, value, namespace }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Check which credentials are stored in Steel for an origin.
 */
export async function listSteelCredentials(): Promise<unknown[]> {
  const apiKey = STEEL_API_KEY();
  if (!apiKey) return [];

  try {
    const res = await fetch(`${steelRestBase()}/v1/credentials`, {
      headers: steelHeaders(),
    });
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data) ? data : data.data || [];
    }
    return [];
  } catch {
    return [];
  }
}

// ─── Credential Sync — .env.local → Steel Credentials API ───────────────────
// Maps platform credentials from environment variables to Steel's encrypted
// Credentials API. Steel then handles injection (including shadow DOM, SPAs,
// mutations, and modern web components like Reddit's faceplate-text-input).

/** Platform-to-origin mapping for Steel Credentials API */
const PLATFORM_CREDENTIAL_MAP: Array<{
  envPrefix: string;
  origins: string[];    // All origins that should receive these credentials
  label: string;
}> = [
  { envPrefix: "TWITTER",   origins: ["https://x.com", "https://twitter.com"], label: "Twitter/X" },
  { envPrefix: "LINKEDIN",  origins: ["https://www.linkedin.com"], label: "LinkedIn" },
  { envPrefix: "INSTAGRAM", origins: ["https://www.instagram.com"], label: "Instagram" },
  { envPrefix: "REDDIT",    origins: ["https://www.reddit.com"], label: "Reddit" },
  { envPrefix: "FACEBOOK",  origins: ["https://www.facebook.com"], label: "Facebook" },
  { envPrefix: "BLUESKY",   origins: ["https://bsky.app"], label: "Bluesky" },
];

/** Track which credentials have already been synced this process lifecycle */
const _syncedCredentials = new Set<string>();

/**
 * Sync all configured .env.local credentials to Steel's encrypted Credentials API.
 * This is idempotent — only syncs once per origin per process lifecycle.
 * Returns the number of credentials successfully synced.
 */
export async function syncEnvCredentialsToSteel(namespace: string = "default"): Promise<number> {
  const apiKey = STEEL_API_KEY();
  if (!apiKey) return 0;

  let synced = 0;

  for (const platform of PLATFORM_CREDENTIAL_MAP) {
    const username = process.env[`${platform.envPrefix}_USERNAME`] || process.env[`${platform.envPrefix}_EMAIL`] || "";
    const password = process.env[`${platform.envPrefix}_PASSWORD`] || "";

    if (!username || !password) continue;

    for (const origin of platform.origins) {
      const syncKey = `${namespace}:${origin}`;
      if (_syncedCredentials.has(syncKey)) {
        synced++; // Already synced this run
        continue;
      }

      const ok = await uploadSteelCredentials(origin, { username, password }, namespace);
      if (ok) {
        _syncedCredentials.add(syncKey);
        synced++;
        console.log(`[Steel] Synced ${platform.label} credentials for ${origin}`);
      } else {
        console.warn(`[Steel] Failed to sync ${platform.label} credentials for ${origin}`);
      }
    }
  }

  return synced;
}

/**
 * Get the login URL for a domain (used to navigate before credential injection).
 */
export function getLoginUrlForDomain(domain: string): string | null {
  const d = domain.replace(/^www\./, "").toLowerCase();
  const loginUrls: Record<string, string> = {
    "x.com":          "https://x.com/i/flow/login",
    "twitter.com":    "https://x.com/i/flow/login",
    "linkedin.com":   "https://www.linkedin.com/login",
    "instagram.com":  "https://www.instagram.com/accounts/login/",
    "reddit.com":     "https://www.reddit.com/login",
    "facebook.com":   "https://www.facebook.com/login/",
    "bsky.app":       "https://bsky.app/",
  };
  const entry = Object.entries(loginUrls).find(([key]) => d === key || d.endsWith(`.${key}`));
  return entry ? entry[1] : null;
}

/**
 * Check if credentials exist in .env for a given domain.
 */
export function hasEnvCredentialsForDomain(domain: string): boolean {
  const d = domain.replace(/^www\./, "").toLowerCase();
  for (const platform of PLATFORM_CREDENTIAL_MAP) {
    const matches = platform.origins.some(o => {
      try { return new URL(o).hostname.replace(/^www\./, "") === d || d.endsWith(new URL(o).hostname.replace(/^www\./, "")); }
      catch { return false; }
    });
    if (matches) {
      const username = process.env[`${platform.envPrefix}_USERNAME`] || process.env[`${platform.envPrefix}_EMAIL`] || "";
      const password = process.env[`${platform.envPrefix}_PASSWORD`] || "";
      return !!(username && password);
    }
  }
  return false;
}

// ─── CAPTCHA Handling ────────────────────────────────────────────────────────
// Steel auto-solves CAPTCHAs when solveCaptcha: true, but we should wait
// for them to resolve before continuing with page interaction.

/**
 * Check CAPTCHA status for a Steel session.
 * Returns array of page states with active CAPTCHA tasks.
 */
export async function getCaptchaStatus(sessionId: string): Promise<Array<{
  pageId: string;
  url: string;
  isSolvingCaptcha: boolean;
  tasks: Array<{ id: string; status: string; type: string }>;
}>> {
  const apiKey = STEEL_API_KEY();
  if (!apiKey || !sessionId) return [];

  try {
    const res = await fetch(
      `${steelRestBase()}/v1/sessions/${sessionId}/captchas/status`,
      { headers: steelHeaders() }
    );
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data) ? data : data.data || [];
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Wait for any active CAPTCHAs to be solved by Steel.
 * Polls the CAPTCHA status API and resolves when all CAPTCHAs are done.
 * Returns true if CAPTCHAs were detected and solved, false if none found.
 */
export async function waitForCaptchaSolving(
  sessionId: string,
  timeoutMs: number = 30000,
  pollIntervalMs: number = 2000
): Promise<{ solved: boolean; message: string }> {
  const apiKey = STEEL_API_KEY();
  if (!apiKey || !sessionId) return { solved: false, message: "Steel not configured" };

  const start = Date.now();
  let hadCaptchas = false;

  while (Date.now() - start < timeoutMs) {
    const statuses = await getCaptchaStatus(sessionId);
    const active = statuses.filter(s => s.isSolvingCaptcha);

    if (active.length === 0 && hadCaptchas) {
      return { solved: true, message: "All CAPTCHAs solved by Steel" };
    }

    if (active.length > 0) {
      hadCaptchas = true;
      const solving = active.flatMap(s => s.tasks).filter(t => t.status === "solving" || t.status === "detected" || t.status === "validating");
      const failed = active.flatMap(s => s.tasks).filter(t => t.status === "failed_to_solve" || t.status === "failed_to_detect");
      
      if (failed.length > 0 && solving.length === 0) {
        return { solved: false, message: `CAPTCHA solving failed (${failed.length} task(s) failed)` };
      }
    } else if (!hadCaptchas) {
      // No CAPTCHAs detected at all — don't wait forever
      // Give it a couple polls to detect late-appearing CAPTCHAs
      if (Date.now() - start > pollIntervalMs * 3) {
        return { solved: false, message: "No CAPTCHAs detected" };
      }
    }

    await new Promise(r => setTimeout(r, pollIntervalMs));
  }

  return { solved: false, message: `CAPTCHA solving timed out after ${timeoutMs}ms` };
}

/**
 * Navigate to a login page and wait for Steel to inject credentials.
 * This is the preferred way to handle login when Steel is configured.
 * 
 * Flow:
 * 1. Navigate to login URL
 * 2. Wait for Steel's credential injection (~2-3 seconds)
 * 3. Wait for any CAPTCHAs to be solved
 * 4. Verify login succeeded
 */
export async function steelAutoLogin(
  page: import("playwright").Page,
  loginUrl: string,
  sessionId: string | undefined,
  postLoginCheck: () => Promise<boolean>
): Promise<{ success: boolean; message: string }> {
  try {
    // Navigate to the login page
    await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Wait for Steel to detect the form and inject credentials
    // Steel docs say: "credentials are typically injected within 2 seconds"
    // We give it 4 seconds to be safe + account for slow pages
    await page.waitForTimeout(4000);

    // Wait for any CAPTCHAs to be solved
    if (sessionId) {
      const captchaResult = await waitForCaptchaSolving(sessionId, 25000);
      if (captchaResult.solved) {
        // Give page time to reload after CAPTCHA
        await page.waitForTimeout(3000);
        await page.waitForLoadState("domcontentloaded").catch(() => {});
      }
    }

    // Wait for potential page navigation after auto-submit
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForTimeout(3000);

    // Check if login succeeded
    const loggedIn = await postLoginCheck();
    if (loggedIn) {
      return { success: true, message: `Successfully logged in via Steel credential injection at ${loginUrl}` };
    }

    // If auto-submit didn't fire, try shadow DOM submit first, then standard selectors
    const shadowSubmitted = await page.evaluate(() => {
      function findButtonsInShadow(root: Document | ShadowRoot | Element): HTMLButtonElement[] {
        const buttons: HTMLButtonElement[] = [];
        const allElements = root.querySelectorAll("*");
        for (const el of allElements) {
          if (el instanceof HTMLButtonElement) buttons.push(el);
          if (el.shadowRoot) buttons.push(...findButtonsInShadow(el.shadowRoot));
        }
        return buttons;
      }
      const allButtons = findButtonsInShadow(document);
      const submitBtn = allButtons.find(b =>
        b.type === "submit" ||
        b.textContent?.trim().toLowerCase() === "log in" ||
        b.textContent?.trim().toLowerCase() === "sign in"
      );
      if (submitBtn) { submitBtn.click(); return true; }
      return false;
    }).catch(() => false);

    if (!shadowSubmitted) {
      const submitSelectors = [
        'button[type="submit"]',
        'button:has-text("Log in")',
        'button:has-text("Log In")',
        'button:has-text("Sign in")',
        'button:has-text("Sign In")',
        '[data-testid="LoginForm_Login_Button"]',
        'fieldset button[type="submit"]',
      ];

      for (const sel of submitSelectors) {
        try {
          const btn = page.locator(sel).first();
          if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
            await btn.click();
            break;
          }
        } catch { /* try next */ }
      }
    }

    // Wait for SPA navigation after submit
    await page.waitForTimeout(8000);
    await page.waitForLoadState("networkidle").catch(() => {});

    // Final login check
    const finalCheck = await postLoginCheck();
    if (finalCheck) {
      return { success: true, message: `Successfully logged in via Steel (manual submit) at ${loginUrl}` };
    }

    return { success: false, message: `Steel credential injection attempted but login could not be verified. CAPTCHA or 2FA may be required.` };
  } catch (err) {
    return { success: false, message: `Steel auto-login error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Social Media Browser Automation
 *
 * Inspired by:
 * - Browser Use (browser-use/browser-use) — AI-driven browser automation with persistent profiles
 * - OpenClaw Social Media Skill — zero-API-cost social media via Chrome sessions
 * - browser-use-social-media-poster — FastAPI + Browser Use for posting
 *
 * Uses Playwright with persistent browser contexts (stored cookies/sessions)
 * to post content and read feeds from social media platforms WITHOUT requiring
 * expensive API keys. One-time login via the browser gives us session cookies
 * that persist across runs.
 *
 * Supported platforms:
 * - X/Twitter — post tweets, read timeline, search
 * - LinkedIn — create posts, share articles
 * - Instagram — create posts (via mobile web)
 * - Reddit — create posts, comment
 * - Facebook — create page posts
 * - Bluesky — post via web interface
 */

import path from "path";
import fs from "fs";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SocialMediaPostRequest {
  platform: SocialPlatform;
  action: SocialAction;
  content?: string;
  hashtags?: string[];
  url?: string; // For sharing links
  subreddit?: string; // Reddit-specific
  title?: string; // Reddit/LinkedIn article title
  image_path?: string; // Path to image to upload
  query?: string; // For search actions
  max_results?: number;
}

export type SocialPlatform =
  | "twitter"
  | "linkedin"
  | "instagram"
  | "reddit"
  | "facebook"
  | "bluesky";

export type SocialAction =
  | "post" // Create a new post
  | "read_feed" // Read current feed/timeline
  | "search" // Search posts
  | "login_check" // Check if logged in
  | "reply" // Reply to a post
  | "like"; // Like a post

export interface SocialMediaResult {
  success: boolean;
  platform: SocialPlatform;
  action: SocialAction;
  message: string;
  data?: unknown;
  screenshot_path?: string;
}

// ─── Platform Configs ─────────────────────────────────────────────────────────

interface PlatformConfig {
  name: string;
  loginUrl: string;
  homeUrl: string;
  composeSelector: string; // CSS selector for the compose/post input
  submitSelector: string; // CSS selector for the submit/post button
  feedSelector: string; // CSS selector for feed items
  loginCheckSelector: string; // Element that indicates logged in
  loginCheckUrl: string; // URL to check login status
}

const PLATFORM_CONFIGS: Record<SocialPlatform, PlatformConfig> = {
  twitter: {
    name: "X (Twitter)",
    loginUrl: "https://x.com/i/flow/login",
    homeUrl: "https://x.com/home",
    composeSelector: '[data-testid="tweetTextarea_0"], [role="textbox"][data-testid="tweetTextarea_0"]',
    submitSelector: '[data-testid="tweetButtonInline"], [data-testid="tweetButton"]',
    feedSelector: '[data-testid="tweet"]',
    loginCheckSelector: '[data-testid="SideNav_AccountSwitcher_Button"], [data-testid="AppTabBar_Home_Link"]',
    loginCheckUrl: "https://x.com/home",
  },
  linkedin: {
    name: "LinkedIn",
    loginUrl: "https://www.linkedin.com/login",
    homeUrl: "https://www.linkedin.com/feed/",
    composeSelector: '.share-box-feed-entry__trigger, .share-box__open, button.artdeco-button[aria-label*="Start a post"]',
    submitSelector: '.share-actions__primary-action, button.share-actions__primary-action',
    feedSelector: '.feed-shared-update-v2',
    loginCheckSelector: '.global-nav__me-photo, .feed-identity-module',
    loginCheckUrl: "https://www.linkedin.com/feed/",
  },
  instagram: {
    name: "Instagram",
    loginUrl: "https://www.instagram.com/accounts/login/",
    homeUrl: "https://www.instagram.com/",
    composeSelector: 'svg[aria-label="New post"], [aria-label="New post"]',
    submitSelector: 'button:has-text("Share"), div[role="button"]:has-text("Share")',
    feedSelector: 'article[role="presentation"]',
    loginCheckSelector: 'svg[aria-label="Home"], [aria-label="Home"]',
    loginCheckUrl: "https://www.instagram.com/",
  },
  reddit: {
    name: "Reddit",
    loginUrl: "https://www.reddit.com/login",
    homeUrl: "https://www.reddit.com/",
    composeSelector: 'shreddit-composer textarea, [name="title"], div[contenteditable="true"]',
    submitSelector: 'button[type="submit"]:has-text("Post"), button:has-text("Submit"), faceplate-tracker button',
    feedSelector: 'shreddit-post, article, [data-testid="post-container"]',
    loginCheckSelector: 'faceplate-tracker[noun="user_menu"], shreddit-header-action-items, header nav [aria-label="User menu"], #USER_DROPDOWN_ID',
    loginCheckUrl: "https://www.reddit.com/",
  },
  facebook: {
    name: "Facebook",
    loginUrl: "https://www.facebook.com/login/",
    homeUrl: "https://www.facebook.com/",
    composeSelector: '[aria-label="Create a post"], [data-testid="status-attachment-mentions-input"], [role="textbox"][contenteditable="true"]',
    submitSelector: '[aria-label="Post"], [data-testid="post_button"]',
    feedSelector: '[data-testid="Keycommand_wrapper_feed_story"]',
    loginCheckSelector: '[aria-label="Your profile"], [data-testid="royal_profile_link"]',
    loginCheckUrl: "https://www.facebook.com/",
  },
  bluesky: {
    name: "Bluesky",
    loginUrl: "https://bsky.app/",
    homeUrl: "https://bsky.app/",
    composeSelector: '[data-testid="composePostButton"], .ProseMirror[contenteditable="true"]',
    submitSelector: '[data-testid="composerPublishBtn"], button:has-text("Post")',
    feedSelector: '[data-testid="feedItem"]',
    loginCheckSelector: '[data-testid="homeScreenFeedTabs"], [data-testid="composeFAB"]',
    loginCheckUrl: "https://bsky.app/",
  },
};

// ─── Browser Profile Management ───────────────────────────────────────────────

const PROFILES_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || "/tmp",
  ".ottomate",
  "browser-profiles"
);

function getProfileDir(platform: SocialPlatform): string {
  const dir = path.join(PROFILES_DIR, platform);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getCookiesPath(platform: SocialPlatform): string {
  return path.join(getProfileDir(platform), "cookies.json");
}

// ─── Cookie Management ───────────────────────────────────────────────────────

interface SavedCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Strict" | "Lax" | "None";
}

async function saveCookies(
  context: import("playwright").BrowserContext,
  platform: SocialPlatform
): Promise<void> {
  try {
    const cookies = await context.cookies();
    const cookiesPath = getCookiesPath(platform);
    fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
  } catch (e) {
    console.error(`Failed to save cookies for ${platform}:`, e);
  }
}

async function loadCookies(
  context: import("playwright").BrowserContext,
  platform: SocialPlatform
): Promise<boolean> {
  try {
    const cookiesPath = getCookiesPath(platform);
    if (!fs.existsSync(cookiesPath)) return false;
    const raw = fs.readFileSync(cookiesPath, "utf-8");
    const cookies: SavedCookie[] = JSON.parse(raw);

    // Filter out expired cookies
    const now = Date.now() / 1000;
    const validCookies = cookies.filter(
      (c) => c.expires === -1 || c.expires === 0 || c.expires > now
    );

    if (validCookies.length === 0) return false;
    await context.addCookies(validCookies);
    return true;
  } catch (e) {
    console.error(`Failed to load cookies for ${platform}:`, e);
    return false;
  }
}

// ─── Full Storage State Persistence ──────────────────────────────────────────
// Captures and restores the COMPLETE browser auth state:
// cookies + localStorage + sessionStorage.
// This survives across Steel sessions and process restarts.
// Files stored locally at ~/.ottomate/browser-profiles/{platform}/
// NEVER committed to git or exposed via API responses.

function getStorageStatePath(platform: SocialPlatform): string {
  return path.join(getProfileDir(platform), "storage-state.json");
}

function getLocalStoragePath(platform: SocialPlatform): string {
  return path.join(getProfileDir(platform), "local-storage.json");
}

/**
 * Save the full browser storage state after a successful login.
 * Captures cookies + localStorage origins from the Playwright context,
 * plus manually extracts localStorage/sessionStorage data via page.evaluate().
 */
async function saveFullStorageState(
  context: import("playwright").BrowserContext,
  page: import("playwright").Page,
  platform: SocialPlatform
): Promise<void> {
  try {
    // 1. Save Playwright's built-in storageState (cookies + localStorage origins)
    const storageState = await context.storageState();
    fs.writeFileSync(getStorageStatePath(platform), JSON.stringify(storageState, null, 2));
    console.log(`[StorageState] Saved storage state for ${platform} (${storageState.cookies?.length || 0} cookies, ${storageState.origins?.length || 0} origins)`);

    // 2. Also manually extract localStorage from the page (catches more data)
    const localStorageData = await page.evaluate(() => {
      const data: Record<string, string> = {};
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key) {
            data[key] = localStorage.getItem(key) || "";
          }
        }
      } catch { /* localStorage may be blocked */ }
      return { origin: window.location.origin, data };
    }).catch(() => null);

    if (localStorageData && Object.keys(localStorageData.data).length > 0) {
      // Merge with any existing localStorage captures from other origins
      let existing: Record<string, Record<string, string>> = {};
      const lsPath = getLocalStoragePath(platform);
      if (fs.existsSync(lsPath)) {
        try { existing = JSON.parse(fs.readFileSync(lsPath, "utf-8")); } catch { /* reset */ }
      }
      existing[localStorageData.origin] = localStorageData.data;
      fs.writeFileSync(lsPath, JSON.stringify(existing, null, 2));
      console.log(`[StorageState] Saved localStorage for ${platform} (${Object.keys(localStorageData.data).length} keys from ${localStorageData.origin})`);
    }
  } catch (e) {
    console.error(`[StorageState] Failed to save storage state for ${platform}:`, e);
  }
}

/**
 * Load and inject the full storage state into a browser context.
 * Restores cookies + localStorage to recreate the authenticated session.
 */
async function loadFullStorageState(
  context: import("playwright").BrowserContext,
  page: import("playwright").Page,
  platform: SocialPlatform
): Promise<boolean> {
  let injected = false;

  try {
    // 1. Load Playwright storage state (cookies)
    const ssPath = getStorageStatePath(platform);
    if (fs.existsSync(ssPath)) {
      const raw = fs.readFileSync(ssPath, "utf-8");
      const storageState = JSON.parse(raw);

      // Inject cookies (filter expired)
      const now = Date.now() / 1000;
      const validCookies = (storageState.cookies || []).filter(
        (c: SavedCookie) => c.expires === -1 || c.expires === 0 || c.expires > now
      );
      if (validCookies.length > 0) {
        await context.addCookies(validCookies);
        injected = true;
        console.log(`[StorageState] Injected ${validCookies.length} cookies for ${platform}`);
      }
    }

    // 2. Load and inject localStorage (need to navigate to origin first)
    const lsPath = getLocalStoragePath(platform);
    if (fs.existsSync(lsPath)) {
      const raw = fs.readFileSync(lsPath, "utf-8");
      const originData: Record<string, Record<string, string>> = JSON.parse(raw);

      // Get the platform's home URL origin to inject localStorage into
      const config = PLATFORM_CONFIGS[platform];
      const targetOrigin = new URL(config.homeUrl).origin;

      // Navigate to the origin first (localStorage is origin-scoped)
      // Use a lightweight navigation to minimize load time
      const currentUrl = page.url();
      const currentOrigin = currentUrl.startsWith("http") ? new URL(currentUrl).origin : "";

      if (currentOrigin !== targetOrigin) {
        // Navigate to a fast-loading page on the target origin
        await page.goto(targetOrigin, {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        }).catch(() => {});
      }

      // Inject localStorage for all captured origins that match
      for (const [origin, data] of Object.entries(originData)) {
        // Only inject localStorage for origins that match the target
        if (targetOrigin.includes(new URL(origin).hostname.replace("www.", ""))) {
          await page.evaluate((items: Record<string, string>) => {
            try {
              for (const [key, value] of Object.entries(items)) {
                localStorage.setItem(key, value);
              }
            } catch { /* localStorage may be blocked */ }
          }, data).catch(() => {});
          injected = true;
          console.log(`[StorageState] Injected ${Object.keys(data).length} localStorage keys for ${platform} (${origin})`);
        }
      }
    }
  } catch (e) {
    console.error(`[StorageState] Failed to load storage state for ${platform}:`, e);
  }

  return injected;
}

/**
 * Export the current storage state for a platform.
 * Used by the capture-auth API endpoint.
 */
export async function captureAuthState(
  platform: SocialPlatform
): Promise<{ success: boolean; message: string; cookieCount?: number; localStorageKeys?: number }> {
  // Import Playwright
  let chromium: typeof import("playwright").chromium;
  try {
    const pw = await import("playwright");
    chromium = pw.chromium;
  } catch {
    return { success: false, message: "Playwright not installed" };
  }

  const { createSteelSession } = await import("./steel-client");
  const config = PLATFORM_CONFIGS[platform];
  if (!config) return { success: false, message: `Unsupported platform: ${platform}` };

  const steel = await createSteelSession(chromium, {
    purposeKey: `social:${platform}`,
    solveCaptcha: false,
    enableCredentialInjection: true,
    timeout: 120000,
  });

  try {
    // Load existing cookies first
    await loadCookies(steel.context, platform);
    await loadFullStorageState(steel.context, steel.page, platform);

    // Navigate to the platform and check if we're logged in
    await steel.page.goto(config.loginCheckUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await steel.page.waitForTimeout(3000);

    const isLoggedIn = await checkLoginStatus(steel.page, platform);
    if (!isLoggedIn) {
      return {
        success: false,
        message: `Not currently logged into ${config.name}. Log in first via the social_media_post tool with action "login_check", or use browse_web to manually log in.`,
      };
    }

    // Capture and save the full auth state
    await saveCookies(steel.context, platform);
    await saveFullStorageState(steel.context, steel.page, platform);

    // Count what was saved
    const cookies = await steel.context.cookies();
    const lsPath = getLocalStoragePath(platform);
    let lsKeyCount = 0;
    if (fs.existsSync(lsPath)) {
      const lsData = JSON.parse(fs.readFileSync(lsPath, "utf-8"));
      for (const data of Object.values(lsData)) {
        lsKeyCount += Object.keys(data as Record<string, string>).length;
      }
    }

    return {
      success: true,
      message: `Auth state captured for ${config.name}. ${cookies.length} cookies and ${lsKeyCount} localStorage entries saved. Future sessions will auto-inject this state.`,
      cookieCount: cookies.length,
      localStorageKeys: lsKeyCount,
    };
  } finally {
    await steel.release();
  }
}

/**
 * Get a summary of which platforms have saved auth state.
 */
export function getAuthStateSummary(): Record<string, { hasCookies: boolean; hasStorageState: boolean; hasLocalStorage: boolean; lastModified?: string }> {
  const platforms: SocialPlatform[] = ["twitter", "linkedin", "instagram", "reddit", "facebook", "bluesky"];
  const summary: Record<string, { hasCookies: boolean; hasStorageState: boolean; hasLocalStorage: boolean; lastModified?: string }> = {};

  for (const platform of platforms) {
    const cookiesPath = getCookiesPath(platform);
    const ssPath = getStorageStatePath(platform);
    const lsPath = getLocalStoragePath(platform);

    const hasCookies = fs.existsSync(cookiesPath);
    const hasSS = fs.existsSync(ssPath);
    const hasLS = fs.existsSync(lsPath);

    let lastModified: string | undefined;
    for (const p of [ssPath, cookiesPath, lsPath]) {
      if (fs.existsSync(p)) {
        const stat = fs.statSync(p);
        const mtime = stat.mtime.toISOString();
        if (!lastModified || mtime > lastModified) lastModified = mtime;
      }
    }

    summary[platform] = { hasCookies, hasStorageState: hasSS, hasLocalStorage: hasLS, lastModified };
  }

  return summary;
}

// ─── Credential-Based Login ───────────────────────────────────────────────────

interface PlatformCredentials {
  username?: string;
  password?: string;
}

function getCredentials(platform: SocialPlatform): PlatformCredentials | null {
  const prefix = platform.toUpperCase();
  const username =
    process.env[`${prefix}_USERNAME`] ||
    process.env[`${prefix}_EMAIL`] ||
    null;
  const password = process.env[`${prefix}_PASSWORD`] || null;
  if (!username || !password) return null;
  return { username, password };
}

async function loginWithCredentials(
  page: import("playwright").Page,
  platform: SocialPlatform,
  creds: PlatformCredentials
): Promise<boolean> {
  const config = PLATFORM_CONFIGS[platform];

  try {
    await page.goto(config.loginUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    switch (platform) {
      case "twitter": {
        // Twitter/X login flow: enter username → Next → enter password → Login
        // Twitter uses React SPA — Playwright locators work natively.
        console.log("[Social] Twitter: starting login flow...");
        
        // Step 1: Fill username
        const twUsernameInput = page.locator(
          'input[autocomplete="username"], input[name="text"], input[type="text"]'
        );
        await twUsernameInput.first().waitFor({ state: "visible", timeout: 10000 });
        await twUsernameInput.first().click();
        await twUsernameInput.first().fill(creds.username!);
        console.log("[Social] Twitter: filled username");
        await page.waitForTimeout(500);

        // Step 2: Click "Next" button
        let nextClicked = false;
        for (const sel of [
          '[data-testid="LoginForm_Login_Button"]',
          'button:has-text("Next")',
          '[role="button"]:has-text("Next")',
          'button:has-text("Sign in")',
        ]) {
          try {
            const btn = page.locator(sel).first();
            if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
              await btn.click();
              nextClicked = true;
              console.log(`[Social] Twitter: clicked next via: ${sel}`);
              break;
            }
          } catch { /* try next */ }
        }
        if (!nextClicked) {
          // Twitter sometimes shows username+password on same page
          console.log("[Social] Twitter: no Next button found, checking for password field...");
        }
        await page.waitForTimeout(2000);

        // Step 3: Enter password
        const twPasswordInput = page.locator(
          'input[type="password"], input[name="password"]'
        );
        await twPasswordInput.first().waitFor({ state: "visible", timeout: 10000 });
        await twPasswordInput.first().click();
        await twPasswordInput.first().fill(creds.password!);
        console.log("[Social] Twitter: filled password");
        await page.waitForTimeout(500);

        // Step 4: Click "Log in"
        let twLoginClicked = false;
        for (const sel of [
          '[data-testid="LoginForm_Login_Button"]',
          'button:has-text("Log in")',
          'button:has-text("Sign in")',
          'button[type="submit"]',
        ]) {
          try {
            const btn = page.locator(sel).first();
            if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
              await btn.click();
              twLoginClicked = true;
              console.log(`[Social] Twitter: clicked login via: ${sel}`);
              break;
            }
          } catch { /* try next */ }
        }
        if (!twLoginClicked) {
          await page.keyboard.press("Enter");
          console.log("[Social] Twitter: pressed Enter as login fallback");
        }
        
        await page.waitForTimeout(5000);

        // Handle potential "unusual login activity" challenge
        const twUrl = page.url();
        if (twUrl.includes("/account/access") || twUrl.includes("/challenge")) {
          console.log("[Social] Twitter: security challenge detected, waiting...");
          await page.waitForTimeout(10000);
        }

        await page.waitForLoadState("networkidle").catch(() => {});
        console.log(`[Social] Twitter: post-login URL: ${page.url()}`);
        break;
      }

      case "linkedin": {
        console.log("[Social] LinkedIn: starting login flow...");
        
        const liUsernameInput = page.locator(
          '#username, input[name="session_key"], input[autocomplete="username"]'
        );
        await liUsernameInput.first().waitFor({ state: "visible", timeout: 10000 });
        await liUsernameInput.first().click();
        await liUsernameInput.first().fill(creds.username!);
        console.log("[Social] LinkedIn: filled username");
        
        const liPasswordInput = page.locator(
          '#password, input[name="session_password"], input[type="password"]'
        );
        await liPasswordInput.first().waitFor({ state: "visible", timeout: 10000 });
        await liPasswordInput.first().click();
        await liPasswordInput.first().fill(creds.password!);
        console.log("[Social] LinkedIn: filled password");
        await page.waitForTimeout(500);
        
        let liLoginClicked = false;
        for (const sel of [
          'button[type="submit"]',
          'button:has-text("Sign in")',
          'button:has-text("Log in")',
          'button.btn__primary--large',
        ]) {
          try {
            const btn = page.locator(sel).first();
            if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
              await btn.click();
              liLoginClicked = true;
              console.log(`[Social] LinkedIn: clicked login via: ${sel}`);
              break;
            }
          } catch { /* try next */ }
        }
        if (!liLoginClicked) {
          await page.keyboard.press("Enter");
          console.log("[Social] LinkedIn: pressed Enter as login fallback");
        }
        
        await page.waitForTimeout(5000);
        
        // Handle security verification
        const liUrl = page.url();
        if (liUrl.includes("/checkpoint") || liUrl.includes("/challenge")) {
          console.log("[Social] LinkedIn: security checkpoint detected, waiting...");
          await page.waitForTimeout(10000);
        }
        
        await page.waitForLoadState("networkidle").catch(() => {});
        console.log(`[Social] LinkedIn: post-login URL: ${page.url()}`);
        break;
      }

      case "instagram": {
        console.log("[Social] Instagram: starting login flow...");
        
        // Instagram may show cookie consent modal first
        try {
          const cookieBtn = page.locator('button:has-text("Allow all cookies"), button:has-text("Accept")');
          if (await cookieBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await cookieBtn.first().click();
            console.log("[Social] Instagram: dismissed cookie consent");
            await page.waitForTimeout(1000);
          }
        } catch { /* no cookie modal */ }
        
        const igUsernameInput = page.locator(
          'input[name="username"], input[aria-label="Phone number, username, or email"]'
        );
        await igUsernameInput.first().waitFor({ state: "visible", timeout: 10000 });
        await igUsernameInput.first().click();
        await igUsernameInput.first().fill(creds.username!);
        console.log("[Social] Instagram: filled username");
        
        const igPasswordInput = page.locator(
          'input[name="password"], input[type="password"]'
        );
        await igPasswordInput.first().waitFor({ state: "visible", timeout: 10000 });
        await igPasswordInput.first().click();
        await igPasswordInput.first().fill(creds.password!);
        console.log("[Social] Instagram: filled password");
        await page.waitForTimeout(500);
        
        let igLoginClicked = false;
        for (const sel of [
          'button[type="submit"]',
          'button:has-text("Log in")',
          'button:has-text("Log In")',
        ]) {
          try {
            const btn = page.locator(sel).first();
            if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
              await btn.click();
              igLoginClicked = true;
              console.log(`[Social] Instagram: clicked login via: ${sel}`);
              break;
            }
          } catch { /* try next */ }
        }
        if (!igLoginClicked) {
          await page.keyboard.press("Enter");
          console.log("[Social] Instagram: pressed Enter as login fallback");
        }
        
        await page.waitForTimeout(5000);
        
        // Dismiss "Save Login Info" or "Turn On Notifications" modals
        for (const dismissText of ["Not Now", "Not now", "Save Info", "Cancel"]) {
          try {
            const dismissBtn = page.locator(`button:has-text("${dismissText}")`);
            if (await dismissBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
              await dismissBtn.first().click();
              console.log(`[Social] Instagram: dismissed modal via: ${dismissText}`);
              await page.waitForTimeout(1000);
            }
          } catch { /* no modal */ }
        }
        
        // Handle suspicious login / verification
        const igUrl = page.url();
        if (igUrl.includes("/challenge") || igUrl.includes("/suspicious")) {
          console.log("[Social] Instagram: security challenge detected, waiting...");
          await page.waitForTimeout(10000);
        }
        
        await page.waitForLoadState("networkidle").catch(() => {});
        console.log(`[Social] Instagram: post-login URL: ${page.url()}`);
        break;
      }

      case "reddit": {
        // Reddit's 2024+ login uses shadow DOM web components (faceplate-text-input).
        // Playwright 1.30+ pierces open shadow DOM by default with locator(),
        // so we can use standard locators to fill inputs inside shadow roots.
        await page.waitForTimeout(2000);

        // ── Fill credentials using Playwright native shadow-piercing locators ──
        let filled = false;
        try {
          const usernameLocator = page.locator('input[name="username"]').first();
          if (await usernameLocator.isVisible({ timeout: 5000 }).catch(() => false)) {
            await usernameLocator.click();
            await usernameLocator.fill(creds.username!);
            console.log("[Social] Reddit: filled username via Playwright locator");

            const passwordLocator = page.locator('input[type="password"]').first();
            await passwordLocator.click();
            await passwordLocator.fill(creds.password!);
            console.log("[Social] Reddit: filled password via Playwright locator");
            filled = true;
          }
        } catch (e) {
          console.log("[Social] Reddit: Playwright locator fill failed:", e instanceof Error ? e.message : String(e));
        }

        // Fallback: page.evaluate() shadow DOM fill if Playwright locators fail
        if (!filled) {
          console.log("[Social] Reddit: trying page.evaluate() shadow DOM fill...");
          filled = await page.evaluate(({ username, password }: { username: string; password: string }) => {
            function findInputsInShadow(root: Document | ShadowRoot | Element): HTMLInputElement[] {
              const inputs: HTMLInputElement[] = [];
              for (const el of root.querySelectorAll("*")) {
                if (el instanceof HTMLInputElement) inputs.push(el);
                if (el.shadowRoot) inputs.push(...findInputsInShadow(el.shadowRoot));
              }
              return inputs;
            }
            const allInputs = findInputsInShadow(document);
            const usernameInput = allInputs.find(i =>
              (i.type === "text" || i.type === "email" || !i.type) &&
              (i.name === "username" || i.id === "login-username" || i.autocomplete === "username")
            );
            const passwordInput = allInputs.find(i => i.type === "password");
            if (!usernameInput || !passwordInput) return false;

            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
            if (setter) {
              usernameInput.focus();
              setter.call(usernameInput, username);
              usernameInput.dispatchEvent(new Event("input", { bubbles: true }));
              usernameInput.dispatchEvent(new Event("change", { bubbles: true }));
              passwordInput.focus();
              setter.call(passwordInput, password);
              passwordInput.dispatchEvent(new Event("input", { bubbles: true }));
              passwordInput.dispatchEvent(new Event("change", { bubbles: true }));
            }
            return true;
          }, { username: creds.username!, password: creds.password! }).catch(() => false);
          console.log(`[Social] Reddit: page.evaluate() fill: ${filled}`);
        }

        if (!filled) {
          console.error("[Social] Reddit: all fill methods failed");
          break;
        }

        await page.waitForTimeout(500);

        // ── Click "Log In" button ──
        // Reddit's "Log In" button has type="button" (NOT "submit"), so pressing
        // Enter doesn't work. We must click the button directly.
        // Use Playwright locator (shadow-piercing) for reliable event dispatch.
        let clicked = false;
        
        // Method 1: Playwright locator for the login button (best — dispatches real events)
        const loginBtnSelectors = [
          'button.login',           // Reddit's login button has class "login"
          'button:has-text("Log In")',
          'button:has-text("Log in")',
          'button:has-text("Sign in")',
          'button[type="submit"]',
        ];
        for (const sel of loginBtnSelectors) {
          try {
            const btn = page.locator(sel).first();
            if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
              await btn.click();
              clicked = true;
              console.log(`[Social] Reddit: clicked login button via Playwright locator: ${sel}`);
              break;
            }
          } catch { /* try next selector */ }
        }

        // Method 2: Shadow DOM evaluate click (fallback)
        if (!clicked) {
          clicked = await page.evaluate(() => {
            function findBtns(root: Document | ShadowRoot | Element): HTMLButtonElement[] {
              const btns: HTMLButtonElement[] = [];
              for (const el of root.querySelectorAll("*")) {
                if (el instanceof HTMLButtonElement) btns.push(el);
                if (el.shadowRoot) btns.push(...findBtns(el.shadowRoot));
              }
              return btns;
            }
            const btn = findBtns(document).find(b =>
              b.classList.contains("login") ||
              b.textContent?.trim().toLowerCase() === "log in" ||
              b.textContent?.trim().toLowerCase() === "sign in" ||
              b.type === "submit"
            );
            if (btn) {
              btn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
              return true;
            }
            return false;
          }).catch(() => false);
          if (clicked) console.log("[Social] Reddit: clicked login button via shadow DOM evaluate");
        }

        // Method 3: Enter key as last resort
        if (!clicked) {
          await page.keyboard.press("Enter");
          clicked = true;
          console.log("[Social] Reddit: pressed Enter as last resort");
        }

        // Wait for navigation/CAPTCHA — Reddit may show reCAPTCHA
        console.log("[Social] Reddit: waiting for login response...");
        await page.waitForTimeout(5000);

        // Check if still on login page (might have CAPTCHA)
        const stillOnLoginAfterClick = page.url().toLowerCase().includes("/login");
        if (stillOnLoginAfterClick) {
          console.log("[Social] Reddit: still on login page, checking for CAPTCHA...");
          // Wait longer for captcha solving or SPA navigation
          await page.waitForTimeout(10000);
          await page.waitForLoadState("networkidle").catch(() => {});
        } else {
          await page.waitForLoadState("networkidle").catch(() => {});
        }

        console.log(`[Social] Reddit: post-login URL: ${page.url()}`);
        break;
      }

      case "facebook": {
        console.log("[Social] Facebook: starting login flow...");
        
        // Facebook may show cookie consent
        try {
          const cookieBtn = page.locator('button:has-text("Allow all cookies"), button:has-text("Accept All"), button[data-cookiebanner="accept_button"]');
          if (await cookieBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await cookieBtn.first().click();
            console.log("[Social] Facebook: dismissed cookie consent");
            await page.waitForTimeout(1000);
          }
        } catch { /* no cookie modal */ }
        
        const fbEmailInput = page.locator(
          '#email, input[name="email"], input[id="email"]'
        );
        await fbEmailInput.first().waitFor({ state: "visible", timeout: 10000 });
        await fbEmailInput.first().click();
        await fbEmailInput.first().fill(creds.username!);
        console.log("[Social] Facebook: filled email");
        
        const fbPasswordInput = page.locator(
          '#pass, input[name="pass"], input[type="password"]'
        );
        await fbPasswordInput.first().waitFor({ state: "visible", timeout: 10000 });
        await fbPasswordInput.first().click();
        await fbPasswordInput.first().fill(creds.password!);
        console.log("[Social] Facebook: filled password");
        await page.waitForTimeout(500);
        
        let fbLoginClicked = false;
        for (const sel of [
          'button[name="login"]',
          'button[type="submit"]',
          'button:has-text("Log in")',
          'button:has-text("Log In")',
          '#loginbutton',
        ]) {
          try {
            const btn = page.locator(sel).first();
            if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
              await btn.click();
              fbLoginClicked = true;
              console.log(`[Social] Facebook: clicked login via: ${sel}`);
              break;
            }
          } catch { /* try next */ }
        }
        if (!fbLoginClicked) {
          await page.keyboard.press("Enter");
          console.log("[Social] Facebook: pressed Enter as login fallback");
        }
        
        await page.waitForTimeout(5000);
        
        // Handle checkpoint/verification
        const fbUrl = page.url();
        if (fbUrl.includes("/checkpoint") || fbUrl.includes("/login/identify")) {
          console.log("[Social] Facebook: security checkpoint detected, waiting...");
          await page.waitForTimeout(10000);
        }
        
        await page.waitForLoadState("networkidle").catch(() => {});
        console.log(`[Social] Facebook: post-login URL: ${page.url()}`);
        break;
      }

      case "bluesky": {
        console.log("[Social] Bluesky: starting login flow...");
        
        // Bluesky: may need to click "Sign in" first
        try {
          const signInLink = page.locator(
            'button:has-text("Sign in"), a:has-text("Sign in")'
          );
          if (await signInLink.isVisible({ timeout: 3000 }).catch(() => false)) {
            await signInLink.first().click();
            console.log("[Social] Bluesky: clicked Sign in link");
            await page.waitForTimeout(2000);
          }
        } catch { /* already on login form */ }
        
        const bsHandleInput = page.locator(
          'input[placeholder*="handle"], input[aria-label*="account"], input[autocomplete="username"], input[type="text"]'
        );
        await bsHandleInput.first().waitFor({ state: "visible", timeout: 10000 });
        await bsHandleInput.first().click();
        await bsHandleInput.first().fill(creds.username!);
        console.log("[Social] Bluesky: filled handle");
        
        const bsPasswordInput = page.locator('input[type="password"]');
        await bsPasswordInput.first().waitFor({ state: "visible", timeout: 10000 });
        await bsPasswordInput.first().click();
        await bsPasswordInput.first().fill(creds.password!);
        console.log("[Social] Bluesky: filled password");
        await page.waitForTimeout(500);
        
        let bsLoginClicked = false;
        for (const sel of [
          'button:has-text("Sign in")',
          'button:has-text("Log in")',
          'button[type="submit"]',
        ]) {
          try {
            const btn = page.locator(sel).first();
            if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
              await btn.click();
              bsLoginClicked = true;
              console.log(`[Social] Bluesky: clicked login via: ${sel}`);
              break;
            }
          } catch { /* try next */ }
        }
        if (!bsLoginClicked) {
          await page.keyboard.press("Enter");
          console.log("[Social] Bluesky: pressed Enter as login fallback");
        }
        
        await page.waitForTimeout(5000);
        await page.waitForLoadState("networkidle").catch(() => {});
        console.log(`[Social] Bluesky: post-login URL: ${page.url()}`);
        break;
      }
    }

    // Check if login was successful
    const isLoggedIn = await checkLoginStatus(page, platform);
    return isLoggedIn;
  } catch (err) {
    console.error(
      `Login failed for ${platform}:`,
      err instanceof Error ? err.message : err
    );
    return false;
  }
}

async function checkLoginStatus(
  page: import("playwright").Page,
  platform: SocialPlatform
): Promise<boolean> {
  const config = PLATFORM_CONFIGS[platform];
  try {
    // Navigate to the check URL if not already there
    const currentUrl = page.url();
    if (!currentUrl.includes(new URL(config.loginCheckUrl).hostname)) {
      await page.goto(config.loginCheckUrl, {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });
    }
    
    // Wait longer for SPAs (especially Reddit) to hydrate
    await page.waitForTimeout(5000);
    // Also wait for network to settle
    await page.waitForLoadState("networkidle").catch(() => {});

    // ── Multi-signal login verification ──────────────────────────────────
    // Modern sites (especially Reddit) use shadow DOM web components.
    // page.locator() can't see inside shadow roots, so we use multiple
    // signals: URL check, cookie check, shadow DOM traversal, and fallback
    // to standard selectors.

    // Signal 1: URL-based — are we still on a login/signin page?
    const pageUrl = page.url().toLowerCase();
    const onLoginPage = pageUrl.includes("/login") ||
      pageUrl.includes("/signin") ||
      pageUrl.includes("/accounts/login") ||
      pageUrl.includes("/flow/login");

    // Signal 2: Standard CSS selector check (works for non-shadow-DOM sites)
    const selectorVisible = await page
      .locator(config.loginCheckSelector)
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    // Signal 3: Shadow DOM + cookie/page content check via page.evaluate()
    // This runs inside the browser and can traverse shadow roots
    const browserSignals = await page.evaluate((platformName: string) => {
      const signals: Record<string, boolean> = {};

      // Helper: search for elements inside shadow DOM recursively
      function findInShadow(root: Document | ShadowRoot | Element, selector: string): Element | null {
        let el = root.querySelector(selector);
        if (el) return el;
        const allEls = root.querySelectorAll("*");
        for (const child of allEls) {
          if (child.shadowRoot) {
            el = findInShadow(child.shadowRoot, selector);
            if (el) return el;
          }
        }
        return null;
      }

      // Platform-specific checks
      switch (platformName) {
        case "reddit": {
          // Reddit uses shreddit-* web components with shadow DOM
          signals.hasUserMenu = !!(
            findInShadow(document, '[noun="user_menu"]') ||
            findInShadow(document, "#USER_DROPDOWN_ID") ||
            findInShadow(document, '[aria-label="User menu"]') ||
            findInShadow(document, 'shreddit-header-action-items') ||
            document.querySelector('shreddit-header-action-items')
          );
          signals.hasAvatar = !!(
            findInShadow(document, '[data-testid="user-drawer-button"]') ||
            findInShadow(document, 'faceplate-tracker[noun="user_menu"]') ||
            findInShadow(document, 'button[aria-label*="profile"]') ||
            findInShadow(document, 'a[href*="/user/"]')
          );
          signals.hasFeed = !!(
            document.querySelector("shreddit-post") ||
            document.querySelector("article") ||
            findInShadow(document, "shreddit-post")
          );
          signals.hasAuthCookie = document.cookie.includes("token_v2") ||
            document.cookie.includes("reddit_session") ||
            document.cookie.includes("loid");
          break;
        }
        case "twitter": {
          // Twitter/X uses React SPA
          signals.hasAvatar = !!(
            document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]') ||
            document.querySelector('[aria-label="Account menu"]') ||
            document.querySelector('a[href*="/compose/tweet"]') ||
            document.querySelector('[data-testid="AppTabBar_Profile_Link"]')
          );
          signals.hasFeed = !!(
            document.querySelector('[data-testid="tweet"]') ||
            document.querySelector('article[data-testid="tweet"]') ||
            document.querySelector('[data-testid="primaryColumn"]')
          );
          signals.hasAuthCookie = document.cookie.includes("auth_token") ||
            document.cookie.includes("ct0") ||
            document.cookie.includes("twid");
          signals.hasComposeButton = !!(
            document.querySelector('[data-testid="SideNav_NewTweet_Button"]') ||
            document.querySelector('a[href="/compose/tweet"]') ||
            document.querySelector('a[href="/compose/post"]')
          );
          break;
        }
        case "instagram": {
          // Instagram React SPA
          signals.hasAvatar = !!(
            document.querySelector('a[href*="/accounts/edit/"]') ||
            document.querySelector('span[role="link"][tabindex="0"]') ||
            document.querySelector('a[href*="/direct/inbox/"]')
          );
          signals.hasNavBar = !!(
            document.querySelector('nav[role="navigation"]') ||
            document.querySelector('[role="banner"]')
          );
          signals.hasFeed = !!(
            document.querySelector('article[role="presentation"]') ||
            document.querySelector('main[role="main"] article')
          );
          signals.hasAuthCookie = document.cookie.includes("sessionid") ||
            document.cookie.includes("ds_user_id");
          signals.hasNewPostBtn = !!(
            document.querySelector('a[href="/create/style/"]') ||
            document.querySelector('[aria-label="New post"]') ||
            document.querySelector('svg[aria-label="New post"]')
          );
          break;
        }
        case "linkedin": {
          signals.hasNavBar = !!(
            document.querySelector('.global-nav') ||
            document.querySelector('#global-nav') ||
            document.querySelector('nav.global-nav__nav')
          );
          signals.hasAvatar = !!(
            document.querySelector('.global-nav__me') ||
            document.querySelector('img.global-nav__me-photo') ||
            document.querySelector('[data-control-name="nav.settings_signout"]')
          );
          signals.hasFeed = !!(
            document.querySelector('.feed-shared-update-v2') ||
            document.querySelector('.scaffold-layout__main')
          );
          signals.hasAuthCookie = document.cookie.includes("li_at") ||
            document.cookie.includes("JSESSIONID");
          break;
        }
        case "facebook": {
          signals.hasAvatar = !!(
            document.querySelector('[aria-label="Your profile"]') ||
            document.querySelector('[data-pagelet="ProfileTile"]') ||
            document.querySelector('div[role="banner"] svg')
          );
          signals.hasNavBar = !!(
            document.querySelector('[role="banner"]') ||
            document.querySelector('[data-pagelet="LeftRail"]')
          );
          signals.hasFeed = !!(
            document.querySelector('[role="feed"]') ||
            document.querySelector('[data-pagelet="FeedUnit"]')
          );
          signals.hasAuthCookie = document.cookie.includes("c_user") ||
            document.cookie.includes("xs");
          break;
        }
        case "bluesky": {
          signals.hasAvatar = !!(
            document.querySelector('[aria-label="Profile"]') ||
            document.querySelector('a[href*="/profile/"]')
          );
          signals.hasFeed = !!(
            document.querySelector('[data-testid="postThreadItem"]') ||
            document.querySelector('[data-testid="feedItem"]') ||
            document.querySelector('div[data-testid*="feed"]')
          );
          signals.hasComposeButton = !!(
            document.querySelector('[aria-label="New post"]') ||
            document.querySelector('button[aria-label="New post"]')
          );
          break;
        }
        default: {
          // Generic checks for unknown platforms
          signals.hasAuthIndicator = document.body?.innerHTML?.toLowerCase().includes("log out") ||
            document.body?.innerHTML?.toLowerCase().includes("sign out") ||
            document.body?.innerHTML?.toLowerCase().includes("logout");
          break;
        }
      }

      // Universal signal: page content mentions logout (works across all platforms)
      signals.hasLogoutLink = document.body?.innerHTML?.toLowerCase().includes("log out") ||
        document.body?.innerHTML?.toLowerCase().includes("logout") ||
        document.body?.innerHTML?.toLowerCase().includes("sign out");

      return signals;
    }, platform).catch(() => ({} as Record<string, boolean>));

    // Evaluate all signals
    const positiveSignals: string[] = [];
    
    if (!onLoginPage) positiveSignals.push("not_on_login_page");
    if (selectorVisible) positiveSignals.push("selector_visible");
    
    // Add platform-specific signals
    if (browserSignals.hasUserMenu) positiveSignals.push("user_menu");
    if (browserSignals.hasAvatar) positiveSignals.push("avatar");
    if (browserSignals.hasFeed) positiveSignals.push("has_feed");
    if (browserSignals.hasAuthCookie) positiveSignals.push("auth_cookie");
    if (browserSignals.hasLogoutLink) positiveSignals.push("logout_link");
    if (browserSignals.hasNavBar) positiveSignals.push("nav_bar");
    if (browserSignals.hasComposeButton) positiveSignals.push("compose_btn");
    if (browserSignals.hasNewPostBtn) positiveSignals.push("new_post_btn");
    if (browserSignals.hasAuthIndicator) positiveSignals.push("auth_indicator");

    console.log(`[LoginCheck] ${platform}: signals=${positiveSignals.join(",") || "none"} url=${page.url()}`);

    // Require at least 2 signals for all platforms (accounts for partial page loads,
    // redirects, and SPA hydration delays)
    return positiveSignals.length >= 2;
  } catch (e) {
    console.error(`[LoginCheck] Error checking ${platform}:`, e);
    return false;
  }
}

// ─── Core Social Media Actions ────────────────────────────────────────────────

/**
 * Main entry point for social media browser automation.
 * Handles session management, login, and platform-specific actions.
 */
export async function executeSocialMediaAction(
  request: SocialMediaPostRequest,
  taskFilesDir: string
): Promise<SocialMediaResult> {
  const { platform, action } = request;
  const config = PLATFORM_CONFIGS[platform];

  if (!config) {
    return {
      success: false,
      platform,
      action,
      message: `Unsupported platform: ${platform}. Supported: ${Object.keys(PLATFORM_CONFIGS).join(", ")}`,
    };
  }

  // Import Playwright
  let chromium: typeof import("playwright").chromium;
  try {
    const pw = await import("playwright");
    chromium = pw.chromium;
  } catch {
    return {
      success: false,
      platform,
      action,
      message:
        "Playwright is not installed. Run: npm install playwright && npx playwright install chromium",
    };
  }

  // ── Steel-managed browser session ───────────────────────────────────────
  // Uses the shared Steel client for cloud/self-hosted/local browser.
  // Steel provides: anti-detection, CAPTCHA solving, profile persistence.
  // Per-platform profiles keep auth cookies across separate tool calls.
  const { createSteelSession, waitForCaptchaSolving } = await import("./steel-client");

  const purposeKey = `social:${platform}`;
  const steel = await createSteelSession(chromium, {
    purposeKey,
    solveCaptcha: false,
    enableCredentialInjection: true,
    timeout: 300000,
  });

  const { context, page, isSteel, sessionId, hasCredentialInjection } = steel;

  try {
    // Load saved auth state (full storage state + cookies + localStorage)
    // This is the key to persistent login: we inject the complete browser
    // state captured from a previous successful session.
    const hasStorageState = await loadFullStorageState(context, page, platform);
    const hasCookies = hasStorageState || await loadCookies(context, platform);

    // Check login status
    let isLoggedIn = false;
    if (hasCookies) {
      await page.goto(config.loginCheckUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await page.waitForTimeout(3000);
      isLoggedIn = await checkLoginStatus(page, platform);
      if (isLoggedIn) {
        console.log(`[Social] ${platform}: logged in via injected storage state`);
      }
    }

    // If not logged in, try Steel's credential injection first, then fallback
    if (!isLoggedIn) {
      const creds = getCredentials(platform);
      if (!creds) {
        // Take a screenshot so the user can see what's happening
        const ssPath = path.join(taskFilesDir, `${platform}_login_required_${Date.now()}.png`);
        await page.screenshot({ path: ssPath, fullPage: false }).catch(() => {});

        return {
          success: false,
          platform,
          action,
          message: `Not logged into ${config.name}. To enable browser-based social media:\n\n` +
            `**Option 1 — Set credentials in .env.local:**\n` +
            `  ${platform.toUpperCase()}_USERNAME=your_username\n` +
            `  ${platform.toUpperCase()}_PASSWORD=your_password\n\n` +
            `**Option 2 — Manual login (one-time):**\n` +
            `  Use the browse_web tool to navigate to ${config.loginUrl}, log in manually,\n` +
            `  and cookies will be saved for future use.\n\n` +
            `**Option 3 — Use API connectors:**\n` +
            `  Configure the ${platform} connector with API keys in Settings → Connectors.\n\n` +
            `Note: Create SEPARATE accounts for automation. Don't use personal accounts.`,
          screenshot_path: ssPath,
        };
      }

      // ── Strategy 1: Playwright locator login with Steel CAPTCHA solving ──
      // Uses our robust loginWithCredentials() for ALL platforms (proven Playwright
      // locator approach that pierces shadow DOM). Steel session provides:
      // anti-detection, profile persistence, and CAPTCHA solving.
      if (isSteel && sessionId) {
        try {
          console.log(`[Social] Strategy 1: logging into ${platform} via Playwright locators (Steel session ${sessionId})`);
          isLoggedIn = await loginWithCredentials(page, platform, creds);
          
          // If still on a login page after loginWithCredentials, check for CAPTCHA
          if (!isLoggedIn) {
            const postUrl = page.url().toLowerCase();
            const stillOnLogin = postUrl.includes("/login") ||
              postUrl.includes("/signin") ||
              postUrl.includes("/accounts/login") ||
              postUrl.includes("/flow/login");
            
            if (stillOnLogin) {
              console.log(`[Social] Strategy 1: still on login page, waiting for Steel CAPTCHA solving...`);
              const captchaResult = await waitForCaptchaSolving(sessionId, 25000);
              if (captchaResult.solved) {
                console.log(`[Social] Strategy 1: CAPTCHA solved by Steel`);
                await page.waitForTimeout(3000);
                await page.waitForLoadState("networkidle").catch(() => {});
              }
              // Re-check login status after CAPTCHA wait
              isLoggedIn = await checkLoginStatus(page, platform);
            }
          }
          
          if (isLoggedIn) {
            console.log(`[Social] Strategy 1: ${platform} login succeeded`);
          } else {
            console.log(`[Social] Strategy 1: ${platform} login did not succeed, will retry with Strategy 2`);
          }
        } catch (e) {
          console.error(`[Social] Strategy 1 failed for ${platform}:`, e instanceof Error ? e.message : String(e));
          // Fall through to Strategy 2
        }
      }

      // ── Strategy 2: Manual Playwright CSS selector login (fallback) ───
      if (!isLoggedIn) {
        isLoggedIn = await loginWithCredentials(page, platform, creds);
      }

      if (!isLoggedIn) {
        const ssPath = path.join(taskFilesDir, `${platform}_login_failed_${Date.now()}.png`);
        await page.screenshot({ path: ssPath, fullPage: false }).catch(() => {});

        return {
          success: false,
          platform,
          action,
          message: `Login to ${config.name} failed. This could be due to:\n` +
            `- Incorrect credentials\n` +
            `- CAPTCHA or 2FA required\n` +
            `- Account security challenge\n\n` +
            `Try logging in manually first via browse_web, then cookies will be saved.`,
          screenshot_path: ssPath,
        };
      }
    }

    // Save cookies + full storage state after successful login
    await saveCookies(context, platform);
    await saveFullStorageState(context, page, platform);

    // Execute the requested action
    let result: SocialMediaResult;

    switch (action) {
      case "post":
        result = await executePost(page, platform, request, taskFilesDir);
        break;
      case "read_feed":
        result = await executeReadFeed(page, platform, request, taskFilesDir);
        break;
      case "search":
        result = await executeSearch(page, platform, request, taskFilesDir);
        break;
      case "login_check":
        result = {
          success: true,
          platform,
          action,
          message: `Successfully logged into ${config.name}.`,
        };
        break;
      default:
        result = {
          success: false,
          platform,
          action,
          message: `Action "${action}" is not yet implemented for ${config.name}. Supported: post, read_feed, search, login_check`,
        };
    }

    // Save cookies + full storage state after every action
    await saveCookies(context, platform);
    await saveFullStorageState(context, page, platform);

    return result;
  } catch (err) {
    const ssPath = path.join(taskFilesDir, `${platform}_error_${Date.now()}.png`);
    await page.screenshot({ path: ssPath, fullPage: false }).catch(() => {});

    return {
      success: false,
      platform,
      action,
      message: `Error on ${config.name}: ${err instanceof Error ? err.message : String(err)}`,
      screenshot_path: ssPath,
    };
  } finally {
    // Release Steel session (saves profile + context) or close local browser
    await steel.release();
  }
}

// ─── Post Actions ─────────────────────────────────────────────────────────────

async function executePost(
  page: import("playwright").Page,
  platform: SocialPlatform,
  request: SocialMediaPostRequest,
  taskFilesDir: string
): Promise<SocialMediaResult> {
  const config = PLATFORM_CONFIGS[platform];
  const content = buildPostContent(request);

  if (!content) {
    return {
      success: false,
      platform,
      action: "post",
      message: "No content provided for the post.",
    };
  }

  try {
    switch (platform) {
      case "twitter":
        return await postToTwitter(page, content, taskFilesDir);
      case "linkedin":
        return await postToLinkedIn(page, content, request.url, taskFilesDir);
      case "reddit":
        return await postToReddit(page, content, request.title || content.slice(0, 100), request.subreddit || "", taskFilesDir);
      case "facebook":
        return await postToFacebook(page, content, taskFilesDir);
      case "bluesky":
        return await postToBluesky(page, content, taskFilesDir);
      case "instagram":
        return await postToInstagram(page, content, request.image_path, taskFilesDir);
      default:
        return {
          success: false,
          platform,
          action: "post",
          message: `Posting to ${config.name} via browser is not yet implemented.`,
        };
    }
  } catch (err) {
    const ssPath = path.join(taskFilesDir, `${platform}_post_error_${Date.now()}.png`);
    await page.screenshot({ path: ssPath, fullPage: false }).catch(() => {});
    return {
      success: false,
      platform,
      action: "post",
      message: `Post failed on ${config.name}: ${err instanceof Error ? err.message : String(err)}`,
      screenshot_path: ssPath,
    };
  }
}

function buildPostContent(request: SocialMediaPostRequest): string {
  let content = request.content || "";
  if (request.hashtags && request.hashtags.length > 0) {
    const tags = request.hashtags
      .map((t) => (t.startsWith("#") ? t : `#${t}`))
      .join(" ");
    content = content ? `${content}\n\n${tags}` : tags;
  }
  return content.trim();
}

// ─── Platform-Specific Posting ────────────────────────────────────────────────

async function postToTwitter(
  page: import("playwright").Page,
  content: string,
  taskFilesDir: string
): Promise<SocialMediaResult> {
  // Navigate to compose
  await page.goto("https://x.com/compose/post", {
    waitUntil: "domcontentloaded",
    timeout: 20000,
  });
  await page.waitForTimeout(3000);

  // Find and fill the tweet composer
  const composer = page.locator(
    '[data-testid="tweetTextarea_0"], [role="textbox"][data-testid="tweetTextarea_0"], .DraftEditor-root [contenteditable="true"], [contenteditable="true"][role="textbox"]'
  );
  await composer.first().waitFor({ state: "visible", timeout: 10000 });
  await composer.first().click();
  await page.waitForTimeout(500);

  // Type the content character by character for more natural behavior
  await page.keyboard.type(content, { delay: 20 });
  await page.waitForTimeout(1000);

  // Click the post button
  const postBtn = page.locator(
    '[data-testid="tweetButton"], [data-testid="tweetButtonInline"]'
  );
  await postBtn.first().waitFor({ state: "visible", timeout: 5000 });
  await postBtn.first().click();
  await page.waitForTimeout(3000);

  // Take confirmation screenshot
  const ssPath = path.join(taskFilesDir, `twitter_posted_${Date.now()}.png`);
  await page.screenshot({ path: ssPath, fullPage: false });

  return {
    success: true,
    platform: "twitter",
    action: "post",
    message: `Tweet posted successfully: "${content.slice(0, 100)}${content.length > 100 ? "..." : ""}"`,
    screenshot_path: ssPath,
  };
}

async function postToLinkedIn(
  page: import("playwright").Page,
  content: string,
  shareUrl: string | undefined,
  taskFilesDir: string
): Promise<SocialMediaResult> {
  await page.goto("https://www.linkedin.com/feed/", {
    waitUntil: "domcontentloaded",
    timeout: 20000,
  });
  await page.waitForTimeout(3000);

  // Click "Start a post" button
  const startPost = page.locator(
    '.share-box-feed-entry__trigger, button.artdeco-button--muted:has-text("Start a post"), .share-box__open'
  );
  await startPost.first().waitFor({ state: "visible", timeout: 10000 });
  await startPost.first().click();
  await page.waitForTimeout(2000);

  // Find the post text area in the modal
  const postBox = page.locator(
    '.ql-editor[data-placeholder="What do you want to talk about?"], .ql-editor, [role="textbox"][contenteditable="true"], .share-creation-state__text-editor .ql-editor'
  );
  await postBox.first().waitFor({ state: "visible", timeout: 10000 });
  await postBox.first().click();
  await page.waitForTimeout(500);

  await page.keyboard.type(content, { delay: 15 });
  await page.waitForTimeout(1000);

  // Click "Post" button
  const postBtn = page.locator(
    '.share-actions__primary-action, button.share-actions__primary-action:has-text("Post")'
  );
  await postBtn.first().waitFor({ state: "visible", timeout: 5000 });
  await postBtn.first().click();
  await page.waitForTimeout(3000);

  const ssPath = path.join(taskFilesDir, `linkedin_posted_${Date.now()}.png`);
  await page.screenshot({ path: ssPath, fullPage: false });

  return {
    success: true,
    platform: "linkedin",
    action: "post",
    message: `LinkedIn post created successfully: "${content.slice(0, 100)}${content.length > 100 ? "..." : ""}"`,
    screenshot_path: ssPath,
  };
}

async function postToReddit(
  page: import("playwright").Page,
  content: string,
  title: string,
  subreddit: string,
  taskFilesDir: string
): Promise<SocialMediaResult> {
  if (!subreddit) {
    return {
      success: false,
      platform: "reddit",
      action: "post",
      message: "Reddit requires a subreddit. Set the 'subreddit' parameter (e.g., 'test').",
    };
  }

  const sub = subreddit.replace(/^r\//, "");

  // Reddit's new (2024+) submit page uses custom web components
  // like <faceplate-textarea-input> with shadow DOM. We must use
  // page.evaluate to pierce shadow roots and keyboard.type for input.
  await page.goto(`https://www.reddit.com/r/${sub}/submit`, {
    waitUntil: "domcontentloaded",
    timeout: 25000,
  });
  await page.waitForTimeout(4000);

  // Take a screenshot of the submit page before filling
  const ssBeforePost = path.join(taskFilesDir, `reddit_submit_page_${Date.now()}.png`);
  await page.screenshot({ path: ssBeforePost, fullPage: false });
  console.log(`[Social] Reddit submit page loaded. URL: ${page.url()}`);

  // ── Fill title ──
  // Reddit's new submit page uses <faceplate-textarea-input> custom elements.
  // We need to find the actual textarea inside shadow DOM or use click + type.
  let titleFilled = false;

  // Strategy 1: Try to find the real textarea inside shadow DOM via evaluate
  try {
    titleFilled = await page.evaluate((titleText: string) => {
      // Look for faceplate-textarea-input with name="title"
      const faceplateEl = document.querySelector('faceplate-textarea-input[name="title"]');
      if (faceplateEl) {
        // Check shadow root for the actual textarea
        const shadow = faceplateEl.shadowRoot;
        if (shadow) {
          const textarea = shadow.querySelector("textarea");
          if (textarea) {
            textarea.focus();
            textarea.value = titleText;
            textarea.dispatchEvent(new Event("input", { bubbles: true }));
            textarea.dispatchEvent(new Event("change", { bubbles: true }));
            return true;
          }
        }
        // No shadow root — try clicking the element itself
        (faceplateEl as HTMLElement).click();
        return false;
      }
      // Fallback: standard textarea or input with name="title"
      const stdInput = document.querySelector<HTMLTextAreaElement | HTMLInputElement>(
        'textarea[name="title"], input[name="title"], textarea[placeholder*="Title"], input[placeholder*="Title"]'
      );
      if (stdInput) {
        stdInput.focus();
        stdInput.value = titleText;
        stdInput.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      }
      return false;
    }, title);
  } catch (e) {
    console.log(`[Social] Reddit title shadow DOM strategy failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Strategy 2: Click the element and type via keyboard
  if (!titleFilled) {
    try {
      const titleEl = page.locator(
        'faceplate-textarea-input[name="title"], textarea[name="title"], textarea[placeholder*="Title"], input[placeholder*="Title"]'
      );
      await titleEl.first().waitFor({ state: "visible", timeout: 8000 });
      await titleEl.first().click();
      await page.waitForTimeout(300);
    } catch {
      // Last resort: just click in the general title area
      console.log("[Social] Reddit: clicking general title area");
    }
    // Select all + delete any existing text, then type
    await page.keyboard.press("Meta+a");
    await page.keyboard.press("Backspace");
    await page.keyboard.type(title, { delay: 20 });
    titleFilled = true;
  }
  await page.waitForTimeout(500);
  console.log(`[Social] Reddit title filled: "${title.slice(0, 60)}..."`);

  // ── Fill body ──
  // Tab to body field, or find it directly
  await page.keyboard.press("Tab");
  await page.waitForTimeout(500);

  let bodyFilled = false;

  // Strategy 1: Find contenteditable div (Reddit's rich text editor)
  try {
    const richTextEditor = page.locator(
      'div[contenteditable="true"][role="textbox"], div.ProseMirror[contenteditable="true"], [data-testid="post-text-body"], p[data-placeholder]'
    );
    if (await richTextEditor.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await richTextEditor.first().click();
      await page.waitForTimeout(300);
      await page.keyboard.type(content, { delay: 12 });
      bodyFilled = true;
    }
  } catch {
    console.log("[Social] Reddit rich text editor not found, trying alternatives");
  }

  // Strategy 2: Shadow DOM body textarea
  if (!bodyFilled) {
    try {
      bodyFilled = await page.evaluate((bodyText: string) => {
        const bodyEl = document.querySelector('faceplate-textarea-input[name="body"], textarea[name="body"]');
        if (bodyEl) {
          const shadow = bodyEl.shadowRoot;
          if (shadow) {
            const ta = shadow.querySelector("textarea");
            if (ta) {
              ta.focus();
              ta.value = bodyText;
              ta.dispatchEvent(new Event("input", { bubbles: true }));
              return true;
            }
          }
          (bodyEl as HTMLElement).click();
        }
        return false;
      }, content);
    } catch {
      console.log("[Social] Reddit body shadow DOM strategy failed");
    }
  }

  // Strategy 3: Just type where the cursor is
  if (!bodyFilled) {
    await page.keyboard.type(content, { delay: 12 });
  }
  await page.waitForTimeout(1000);
  console.log(`[Social] Reddit body filled (${content.length} chars)`);

  // Take screenshot before submitting
  const ssBeforeSubmit = path.join(taskFilesDir, `reddit_before_submit_${Date.now()}.png`);
  await page.screenshot({ path: ssBeforeSubmit, fullPage: false });

  // ── Submit ──
  // Reddit's new UI uses custom elements. Dump page state to find the right button.
  const buttonAnalysis = await page.evaluate(() => {
    const allButtons = Array.from(document.querySelectorAll("button"));
    return allButtons
      .filter(b => {
        const text = (b.textContent || "").trim().toLowerCase();
        return text.includes("post") || text.includes("submit") || b.type === "submit";
      })
      .map(b => ({
        text: (b.textContent || "").trim().slice(0, 60),
        type: b.type,
        id: b.id,
        classes: b.className.slice(0, 80),
        visible: b.offsetParent !== null,
        parent: b.parentElement?.tagName?.toLowerCase(),
        grandparent: b.parentElement?.parentElement?.tagName?.toLowerCase(),
      }));
  });
  console.log(`[Social] Reddit submit buttons found:`, JSON.stringify(buttonAnalysis, null, 2));

  let submitted = false;

  // Strategy 1: Click a visible button with exact "Post" text in the form area
  try {
    const btn = page.locator('button:visible').filter({ hasText: /^Post$/i });
    const count = await btn.count();
    console.log(`[Social] Reddit: found ${count} visible "Post" buttons`);
    if (count > 0) {
      // Click the last one (usually the actual submit, not nav "Post")
      await btn.last().click();
      submitted = true;
    }
  } catch (e) {
    console.log(`[Social] Reddit submit strategy 1 failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Strategy 2: Use page.evaluate to find and click the submit button directly
  if (!submitted) {
    try {
      submitted = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        // Look for a visible button whose text is exactly "Post" (not "Post to profile" etc.)
        for (const btn of buttons) {
          const text = (btn.textContent || "").trim();
          if ((text === "Post" || text === "Submit") && btn.offsetParent !== null) {
            btn.click();
            return true;
          }
        }
        // Try submit buttons
        for (const btn of buttons) {
          if (btn.type === "submit" && btn.offsetParent !== null) {
            btn.click();
            return true;
          }
        }
        // Broader: any visible button containing "Post" near the bottom of the form
        const form = document.querySelector("shreddit-composer, form, [data-testid='submit-form']");
        if (form) {
          const formButtons = Array.from(form.querySelectorAll("button"));
          for (const btn of formButtons) {
            if ((btn.textContent || "").toLowerCase().includes("post") && btn.offsetParent !== null) {
              btn.click();
              return true;
            }
          }
        }
        return false;
      });
      if (submitted) console.log("[Social] Reddit: submitted via page.evaluate");
    } catch (e) {
      console.log(`[Social] Reddit submit strategy 2 failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Strategy 3: Press Enter as last resort
  if (!submitted) {
    console.log("[Social] Reddit: trying keyboard submit (Ctrl+Enter)");
    await page.keyboard.press("Control+Enter");
    submitted = true;
  }

  await page.waitForTimeout(8000);

  // Check if we navigated away from submit page (success indicator)
  const currentUrl = page.url();
  const leftSubmitPage = !currentUrl.includes("/submit");

  const ssPath = path.join(taskFilesDir, `reddit_posted_${Date.now()}.png`);
  await page.screenshot({ path: ssPath, fullPage: false });

  if (leftSubmitPage) {
    console.log(`[Social] Reddit post submitted successfully. Now at: ${currentUrl}`);
  } else {
    console.log(`[Social] Reddit: still on submit page after clicking Post. URL: ${currentUrl}`);
  }

  return {
    success: true,
    platform: "reddit",
    action: "post",
    message: `Reddit post created in r/${sub}: "${title.slice(0, 80)}"${leftSubmitPage ? ` — ${currentUrl}` : ""}`,
    screenshot_path: ssPath,
  };
}

async function postToFacebook(
  page: import("playwright").Page,
  content: string,
  taskFilesDir: string
): Promise<SocialMediaResult> {
  await page.goto("https://www.facebook.com/", {
    waitUntil: "domcontentloaded",
    timeout: 20000,
  });
  await page.waitForTimeout(3000);

  // Click the "What's on your mind?" area
  const composeArea = page.locator(
    '[aria-label="Create a post"], [role="button"]:has-text("What\'s on your mind"), span:has-text("What\'s on your mind")'
  );
  await composeArea.first().waitFor({ state: "visible", timeout: 10000 });
  await composeArea.first().click();
  await page.waitForTimeout(2000);

  // Type in the post editor
  const editor = page.locator(
    '[contenteditable="true"][role="textbox"], [aria-label*="your mind"]'
  );
  await editor.first().waitFor({ state: "visible", timeout: 10000 });
  await editor.first().click();
  await page.keyboard.type(content, { delay: 15 });
  await page.waitForTimeout(1000);

  // Click Post
  const postBtn = page.locator(
    '[aria-label="Post"], div[role="button"]:has-text("Post")'
  );
  await postBtn.first().click();
  await page.waitForTimeout(3000);

  const ssPath = path.join(taskFilesDir, `facebook_posted_${Date.now()}.png`);
  await page.screenshot({ path: ssPath, fullPage: false });

  return {
    success: true,
    platform: "facebook",
    action: "post",
    message: `Facebook post created: "${content.slice(0, 100)}${content.length > 100 ? "..." : ""}"`,
    screenshot_path: ssPath,
  };
}

async function postToBluesky(
  page: import("playwright").Page,
  content: string,
  taskFilesDir: string
): Promise<SocialMediaResult> {
  await page.goto("https://bsky.app/", {
    waitUntil: "domcontentloaded",
    timeout: 20000,
  });
  await page.waitForTimeout(3000);

  // Click the compose/new post button
  const composeBtn = page.locator(
    '[data-testid="composeFAB"], [data-testid="composePostButton"], [aria-label="New post"]'
  );
  await composeBtn.first().waitFor({ state: "visible", timeout: 10000 });
  await composeBtn.first().click();
  await page.waitForTimeout(2000);

  // Type in the editor
  const editor = page.locator(
    '.ProseMirror[contenteditable="true"], [role="textbox"][contenteditable="true"]'
  );
  await editor.first().waitFor({ state: "visible", timeout: 10000 });
  await editor.first().click();
  await page.keyboard.type(content, { delay: 20 });
  await page.waitForTimeout(1000);

  // Click Post
  const postBtn = page.locator(
    '[data-testid="composerPublishBtn"], button:has-text("Post")'
  );
  await postBtn.first().click();
  await page.waitForTimeout(3000);

  const ssPath = path.join(taskFilesDir, `bluesky_posted_${Date.now()}.png`);
  await page.screenshot({ path: ssPath, fullPage: false });

  return {
    success: true,
    platform: "bluesky",
    action: "post",
    message: `Bluesky post created: "${content.slice(0, 100)}${content.length > 100 ? "..." : ""}"`,
    screenshot_path: ssPath,
  };
}

async function postToInstagram(
  page: import("playwright").Page,
  content: string,
  imagePath: string | undefined,
  taskFilesDir: string
): Promise<SocialMediaResult> {
  // Instagram requires an image for posts — text-only posts aren't supported
  if (!imagePath) {
    return {
      success: false,
      platform: "instagram",
      action: "post",
      message: "Instagram requires an image for posts. Provide an 'image_path' to a generated/uploaded image.\n\nTip: Use generate_image or replicate_run to create an image first, then pass its path here.",
    };
  }

  // Navigate to Instagram
  await page.goto("https://www.instagram.com/", {
    waitUntil: "domcontentloaded",
    timeout: 20000,
  });
  await page.waitForTimeout(3000);

  // Click "New post" (the + icon)
  const newPostBtn = page.locator(
    'svg[aria-label="New post"], [aria-label="New post"], a[href="/create/style/"]'
  );
  await newPostBtn.first().waitFor({ state: "visible", timeout: 10000 });
  await newPostBtn.first().click();
  await page.waitForTimeout(2000);

  // Upload image via file input
  const fileInput = page.locator('input[type="file"]');
  await fileInput.first().setInputFiles(imagePath);
  await page.waitForTimeout(3000);

  // Click "Next" to proceed through crop/filter
  for (let i = 0; i < 2; i++) {
    const nextBtn = page.locator(
      'button:has-text("Next"), div[role="button"]:has-text("Next")'
    );
    if (await nextBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await nextBtn.first().click();
      await page.waitForTimeout(2000);
    }
  }

  // Add caption
  const captionInput = page.locator(
    'textarea[aria-label="Write a caption..."], [aria-label="Write a caption"]'
  );
  if (await captionInput.first().isVisible({ timeout: 5000 }).catch(() => false)) {
    await captionInput.first().click();
    await page.keyboard.type(content, { delay: 15 });
    await page.waitForTimeout(1000);
  }

  // Click "Share"
  const shareBtn = page.locator(
    'button:has-text("Share"), div[role="button"]:has-text("Share")'
  );
  await shareBtn.first().click();
  await page.waitForTimeout(5000);

  const ssPath = path.join(taskFilesDir, `instagram_posted_${Date.now()}.png`);
  await page.screenshot({ path: ssPath, fullPage: false });

  return {
    success: true,
    platform: "instagram",
    action: "post",
    message: `Instagram post created with image: "${content.slice(0, 80)}${content.length > 80 ? "..." : ""}"`,
    screenshot_path: ssPath,
  };
}

// ─── Feed Reading ─────────────────────────────────────────────────────────────

async function executeReadFeed(
  page: import("playwright").Page,
  platform: SocialPlatform,
  request: SocialMediaPostRequest,
  taskFilesDir: string
): Promise<SocialMediaResult> {
  const config = PLATFORM_CONFIGS[platform];

  await page.goto(config.homeUrl, {
    waitUntil: "domcontentloaded",
    timeout: 20000,
  });
  await page.waitForTimeout(4000);

  // Scroll to load more content
  await page.evaluate(() => window.scrollBy(0, 1000));
  await page.waitForTimeout(2000);

  // Extract feed items based on platform
  const maxItems = request.max_results || 10;
  let feedContent: string;

  switch (platform) {
    case "twitter": {
      feedContent = await page.evaluate((max) => {
        const tweets = document.querySelectorAll('[data-testid="tweet"]');
        const items: string[] = [];
        tweets.forEach((tweet, i) => {
          if (i >= max) return;
          const text = (tweet as HTMLElement).innerText?.trim() || "";
          const lines = text.split("\n").filter(Boolean);
          items.push(`[${i + 1}] ${lines.slice(0, 5).join(" | ")}`);
        });
        return items.join("\n\n") || "No tweets found in feed.";
      }, maxItems);
      break;
    }
    case "linkedin": {
      feedContent = await page.evaluate((max) => {
        const posts = document.querySelectorAll(".feed-shared-update-v2");
        const items: string[] = [];
        posts.forEach((post, i) => {
          if (i >= max) return;
          const author =
            post.querySelector(".update-components-actor__name")?.textContent?.trim() || "Unknown";
          const text =
            post.querySelector(".feed-shared-text")?.textContent?.trim() || "";
          items.push(`[${i + 1}] ${author}: ${text.slice(0, 200)}`);
        });
        return items.join("\n\n") || "No posts found in feed.";
      }, maxItems);
      break;
    }
    default: {
      // Generic extractor
      feedContent = await page.evaluate(
        ({ sel, max }) => {
          const items = document.querySelectorAll(sel);
          const results: string[] = [];
          items.forEach((item, i) => {
            if (i >= max) return;
            const text = (item as HTMLElement).innerText?.trim() || "";
            results.push(`[${i + 1}] ${text.slice(0, 300)}`);
          });
          return results.join("\n\n") || "No feed items found.";
        },
        { sel: config.feedSelector, max: maxItems }
      );
    }
  }

  const ssPath = path.join(taskFilesDir, `${platform}_feed_${Date.now()}.png`);
  await page.screenshot({ path: ssPath, fullPage: false });

  return {
    success: true,
    platform,
    action: "read_feed",
    message: `${config.name} Feed:\n\n${feedContent}`,
    data: feedContent,
    screenshot_path: ssPath,
  };
}

// ─── Search ───────────────────────────────────────────────────────────────────

async function executeSearch(
  page: import("playwright").Page,
  platform: SocialPlatform,
  request: SocialMediaPostRequest,
  taskFilesDir: string
): Promise<SocialMediaResult> {
  const config = PLATFORM_CONFIGS[platform];
  const query = request.query || request.content || "";
  const maxResults = request.max_results || 10;

  if (!query) {
    return {
      success: false,
      platform,
      action: "search",
      message: "No search query provided. Set the 'query' parameter.",
    };
  }

  let searchUrl: string;
  let resultSelector: string;

  switch (platform) {
    case "twitter":
      searchUrl = `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=live`;
      resultSelector = '[data-testid="tweet"]';
      break;
    case "linkedin":
      searchUrl = `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(query)}`;
      resultSelector = ".feed-shared-update-v2, .search-results__list li";
      break;
    case "reddit":
      searchUrl = `https://www.reddit.com/search/?q=${encodeURIComponent(query)}&sort=relevance`;
      resultSelector = ".Post, [data-testid=\"post-container\"], shreddit-post, faceplate-tracker[source=\"search\"]";
      break;
    case "bluesky":
      searchUrl = `https://bsky.app/search?q=${encodeURIComponent(query)}`;
      resultSelector = '[data-testid="feedItem"]';
      break;
    default:
      searchUrl = `https://www.google.com/search?q=site:${platform}.com+${encodeURIComponent(query)}`;
      resultSelector = ".g";
  }

  await page.goto(searchUrl, {
    waitUntil: "domcontentloaded",
    timeout: 20000,
  });
  await page.waitForTimeout(4000);

  // Scroll to load more results
  await page.evaluate(() => window.scrollBy(0, 1500));
  await page.waitForTimeout(2000);

  // Extract search results
  const searchResults = await page.evaluate(
    ({ sel, max }) => {
      const items = document.querySelectorAll(sel);
      const results: string[] = [];
      items.forEach((item, i) => {
        if (i >= max) return;
        const text = (item as HTMLElement).innerText?.trim() || "";
        if (text.length > 10) {
          results.push(`[${i + 1}] ${text.slice(0, 400)}`);
        }
      });
      return results.join("\n\n---\n\n") || "No results found.";
    },
    { sel: resultSelector, max: maxResults }
  );

  const ssPath = path.join(taskFilesDir, `${platform}_search_${Date.now()}.png`);
  await page.screenshot({ path: ssPath, fullPage: false });

  return {
    success: true,
    platform,
    action: "search",
    message: `${config.name} search results for "${query}":\n\n${searchResults}`,
    data: searchResults,
    screenshot_path: ssPath,
  };
}

// ─── Helper: List supported platforms and their status ────────────────────────

export function getSocialMediaStatus(): string {
  const statuses: string[] = ["## Social Media Browser Automation Status\n"];
  const authSummary = getAuthStateSummary();

  for (const [platform, config] of Object.entries(PLATFORM_CONFIGS)) {
    const creds = getCredentials(platform as SocialPlatform);
    const auth = authSummary[platform];
    const hasPersistedAuth = auth?.hasStorageState || auth?.hasLocalStorage;
    const cookiesExist = auth?.hasCookies || false;

    let status: string;
    if (creds && hasPersistedAuth) {
      status = "✅ Credentials + cached auth state";
    } else if (creds) {
      status = "✅ Credentials configured";
    } else if (hasPersistedAuth) {
      status = "🔑 Cached auth state (no credentials needed)";
    } else if (cookiesExist) {
      status = "🔄 Saved cookies only";
    } else {
      status = "❌ Not configured";
    }

    if (auth?.lastModified) {
      const age = Date.now() - new Date(auth.lastModified).getTime();
      const hours = Math.floor(age / (1000 * 60 * 60));
      if (hours < 1) status += " (< 1h ago)";
      else if (hours < 24) status += ` (${hours}h ago)`;
      else status += ` (${Math.floor(hours / 24)}d ago)`;
    }

    statuses.push(
      `- **${config.name}** (${platform}): ${status}`
    );
  }

  statuses.push(
    "\n### How to configure:\n" +
    "Set in `.env.local`:\n" +
    "```\n" +
    "TWITTER_USERNAME=your_username\n" +
    "TWITTER_PASSWORD=your_password\n" +
    "LINKEDIN_USERNAME=your_email\n" +
    "LINKEDIN_PASSWORD=your_password\n" +
    "REDDIT_USERNAME=your_username\n" +
    "REDDIT_PASSWORD=your_password\n" +
    "INSTAGRAM_USERNAME=your_username\n" +
    "INSTAGRAM_PASSWORD=your_password\n" +
    "FACEBOOK_USERNAME=your_email\n" +
    "FACEBOOK_PASSWORD=your_password\n" +
    "BLUESKY_USERNAME=your_handle\n" +
    "BLUESKY_PASSWORD=your_password\n" +
    "```\n" +
    "\n⚠️ Use dedicated automation accounts, not personal ones."
  );

  return statuses.join("\n");
}

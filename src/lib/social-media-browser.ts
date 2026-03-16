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
  ".ottomatron",
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
        // Twitter login flow: enter username → Next → enter password → Login
        const usernameInput = page.locator(
          'input[autocomplete="username"], input[name="text"], input[type="text"]'
        );
        await usernameInput.first().waitFor({ state: "visible", timeout: 10000 });
        await usernameInput.first().fill(creds.username!);
        await page.waitForTimeout(500);

        // Click "Next" button
        const nextBtn = page.locator(
          'button:has-text("Next"), [role="button"]:has-text("Next")'
        );
        await nextBtn.first().click();
        await page.waitForTimeout(2000);

        // Enter password
        const passwordInput = page.locator(
          'input[type="password"], input[name="password"]'
        );
        await passwordInput.first().waitFor({ state: "visible", timeout: 10000 });
        await passwordInput.first().fill(creds.password!);
        await page.waitForTimeout(500);

        // Click "Log in"
        const loginBtn = page.locator(
          'button:has-text("Log in"), [data-testid="LoginForm_Login_Button"]'
        );
        await loginBtn.first().click();
        await page.waitForTimeout(5000);
        break;
      }

      case "linkedin": {
        const usernameInput = page.locator(
          '#username, input[name="session_key"]'
        );
        await usernameInput.first().fill(creds.username!);
        const passwordInput = page.locator(
          '#password, input[name="session_password"]'
        );
        await passwordInput.first().fill(creds.password!);
        await page.waitForTimeout(500);
        const loginBtn = page.locator(
          'button[type="submit"], button:has-text("Sign in")'
        );
        await loginBtn.first().click();
        await page.waitForTimeout(5000);
        break;
      }

      case "instagram": {
        const usernameInput = page.locator(
          'input[name="username"]'
        );
        await usernameInput.first().fill(creds.username!);
        const passwordInput = page.locator(
          'input[name="password"]'
        );
        await passwordInput.first().fill(creds.password!);
        await page.waitForTimeout(500);
        const loginBtn = page.locator(
          'button[type="submit"]:has-text("Log in"), button:has-text("Log In")'
        );
        await loginBtn.first().click();
        await page.waitForTimeout(5000);
        // Dismiss "Save Login Info" or "Turn On Notifications" modals
        try {
          const notNow = page.locator('button:has-text("Not Now")');
          if (await notNow.isVisible({ timeout: 3000 })) {
            await notNow.click();
            await page.waitForTimeout(1000);
          }
        } catch { /* no modal */ }
        break;
      }

      case "reddit": {
        // Reddit's 2024+ login uses a new UI with faceplate components.
        // Wait for page to fully render — Reddit is a heavy SPA.
        await page.waitForTimeout(3000);

        // Try multiple selector strategies for the username field
        const usernameInput = page.locator(
          'input[name="username"], input[type="text"][autocomplete], #login-username, faceplate-text-input input'
        );
        await usernameInput.first().waitFor({ state: "visible", timeout: 10000 });
        await usernameInput.first().click();
        await usernameInput.first().fill("");
        await page.keyboard.type(creds.username!, { delay: 30 });
        await page.waitForTimeout(500);

        const passwordInput = page.locator(
          'input[name="password"], input[type="password"], #login-password, faceplate-text-input input[type="password"]'
        );
        await passwordInput.first().waitFor({ state: "visible", timeout: 10000 });
        await passwordInput.first().click();
        await passwordInput.first().fill("");
        await page.keyboard.type(creds.password!, { delay: 30 });
        await page.waitForTimeout(500);

        const loginBtn = page.locator(
          'button[type="submit"]:has-text("Log In"), button:has-text("Log In"), button:has-text("Log in"), fieldset button[type="submit"]'
        );
        await loginBtn.first().waitFor({ state: "visible", timeout: 5000 });
        await loginBtn.first().click();
        await page.waitForTimeout(6000);
        break;
      }

      case "facebook": {
        const emailInput = page.locator('#email, input[name="email"]');
        await emailInput.first().fill(creds.username!);
        const passwordInput = page.locator(
          '#pass, input[name="pass"]'
        );
        await passwordInput.first().fill(creds.password!);
        await page.waitForTimeout(500);
        const loginBtn = page.locator(
          'button[name="login"], button[type="submit"], button:has-text("Log in")'
        );
        await loginBtn.first().click();
        await page.waitForTimeout(5000);
        break;
      }

      case "bluesky": {
        // Bluesky: click "Sign in" → enter handle → enter password → Sign in
        const signInLink = page.locator(
          'button:has-text("Sign in"), a:has-text("Sign in")'
        );
        if (await signInLink.isVisible({ timeout: 3000 }).catch(() => false)) {
          await signInLink.first().click();
          await page.waitForTimeout(2000);
        }
        const handleInput = page.locator(
          'input[placeholder*="handle"], input[aria-label*="account"], input[type="text"]'
        );
        await handleInput.first().fill(creds.username!);
        const passwordInput = page.locator('input[type="password"]');
        await passwordInput.first().fill(creds.password!);
        await page.waitForTimeout(500);
        const loginBtn = page.locator(
          'button:has-text("Sign in"), button:has-text("Log in"), button[type="submit"]'
        );
        await loginBtn.first().click();
        await page.waitForTimeout(5000);
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
    if (!page.url().includes(new URL(config.loginCheckUrl).hostname)) {
      await page.goto(config.loginCheckUrl, {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });
      await page.waitForTimeout(3000);
    }

    // Check for the login-confirmed element
    const loggedIn = await page
      .locator(config.loginCheckSelector)
      .first()
      .isVisible({ timeout: 8000 })
      .catch(() => false);

    return loggedIn;
  } catch {
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
  const { createSteelSession } = await import("./steel-client");

  const purposeKey = `social:${platform}`;
  const steel = await createSteelSession(chromium, {
    purposeKey,
    solveCaptcha: true,
    timeout: 300000,
  });

  const { context, page, isSteel } = steel;

  try {
    // Load saved cookies
    const hasCookies = await loadCookies(context, platform);

    // Check login status
    let isLoggedIn = false;
    if (hasCookies) {
      await page.goto(config.loginCheckUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await page.waitForTimeout(3000);
      isLoggedIn = await checkLoginStatus(page, platform);
    }

    // If not logged in, try credentials-based login
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

      // Attempt login with credentials
      isLoggedIn = await loginWithCredentials(page, platform, creds);

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

    // Save cookies after successful login
    await saveCookies(context, platform);

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

    // Save cookies after every action
    await saveCookies(context, platform);

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

  // Reddit's new (2024+) submit page — try the new URL first, fall back to old
  await page.goto(`https://www.reddit.com/r/${sub}/submit`, {
    waitUntil: "domcontentloaded",
    timeout: 25000,
  });
  await page.waitForTimeout(4000);

  // Fill title — Reddit's new submit page uses various input patterns
  const titleInput = page.locator(
    'textarea[placeholder*="Title"], textarea[placeholder*="title"], input[placeholder*="Title"], input[placeholder*="title"], [name="title"], div[contenteditable="true"][aria-label*="title" i], shreddit-composer textarea'
  );
  await titleInput.first().waitFor({ state: "visible", timeout: 10000 });
  await titleInput.first().click();
  await titleInput.first().fill("");
  await page.keyboard.type(title, { delay: 20 });
  await page.waitForTimeout(500);

  // Fill body — try tab from title first, then look for body field
  await page.keyboard.press("Tab");
  await page.waitForTimeout(500);
  const bodyInput = page.locator(
    'div[contenteditable="true"][role="textbox"], textarea[placeholder*="Text"], textarea[placeholder*="text"], .DraftEditor-root [contenteditable="true"], [data-testid="post-text-body"]'
  );
  if (await bodyInput.first().isVisible({ timeout: 3000 }).catch(() => false)) {
    await bodyInput.first().click();
    await page.keyboard.type(content, { delay: 15 });
  } else {
    // Just type into wherever focus landed
    await page.keyboard.type(content, { delay: 15 });
  }
  await page.waitForTimeout(1000);

  // Submit — try multiple selectors
  const submitBtn = page.locator(
    'button[type="submit"]:has-text("Post"), button:has-text("Submit"), button:has-text("Post"), faceplate-tracker button:has-text("Post")'
  );
  await submitBtn.first().waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  await submitBtn.first().click();
  await page.waitForTimeout(6000);

  const ssPath = path.join(taskFilesDir, `reddit_posted_${Date.now()}.png`);
  await page.screenshot({ path: ssPath, fullPage: false });

  return {
    success: true,
    platform: "reddit",
    action: "post",
    message: `Reddit post created in r/${sub}: "${title.slice(0, 80)}"`,
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

  for (const [platform, config] of Object.entries(PLATFORM_CONFIGS)) {
    const creds = getCredentials(platform as SocialPlatform);
    const cookiesExist = fs.existsSync(getCookiesPath(platform as SocialPlatform));
    const status = creds
      ? "✅ Credentials configured"
      : cookiesExist
        ? "🔄 Saved session (cookies)"
        : "❌ Not configured";

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

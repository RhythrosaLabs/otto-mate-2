import { createClient, type Client } from "@libsql/client";
import type { InArgs, InValue } from "@libsql/client";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import type { Task, AgentStep, TaskFile, FileFolder, Skill, GalleryItem, Message, SubTask, TaskStatus, MemoryEntry, ModelId, TaskSource, PresetType, FileSource } from "./types";

const FILES_DIR = "./task-files";

// ─── Client & helpers ────────────────────────────────────────────────────────

let _client: Client | null = null;

function getClient(): Client {
  if (!_client) {
    const url = process.env.TURSO_DATABASE_URL ?? `file:${process.env.DATABASE_PATH ?? "./perplexity-computer.db"}`;
    const authToken = process.env.TURSO_AUTH_TOKEN;
    _client = createClient({ url, authToken });
  }
  return _client;
}

// Low-level helpers (no ensureInit — used by initSchema itself)
type PlainRow = Record<string, InValue | null>;

async function _q1<T = PlainRow>(sql: string, args?: InArgs): Promise<T | undefined> {
  const r = await getClient().execute(sql, args);
  if (r.rows.length === 0) return undefined;
  const row = r.rows[0];
  return Object.fromEntries(r.columns.map((c, i) => [c, row[i] ?? null])) as unknown as T;
}

async function _qAll<T = PlainRow>(sql: string, args?: InArgs): Promise<T[]> {
  const r = await getClient().execute(sql, args);
  return r.rows.map(row =>
    Object.fromEntries(r.columns.map((c, i) => [c, row[i] ?? null]))
  ) as unknown as T[];
}

async function _run(sql: string, args?: InArgs): Promise<{ changes: number }> {
  const r = await getClient().execute(sql, args);
  return { changes: r.rowsAffected };
}

async function _execMulti(sql: string): Promise<void> {
  await getClient().executeMultiple(sql);
}

// High-level helpers (ensure init before every call)
let _initPromise: Promise<void> | null = null;

async function ensureInit(): Promise<void> {
  if (!_initPromise) {
    _initPromise = initSchema();
  }
  await _initPromise;
}

async function q1<T = PlainRow>(sql: string, args?: InArgs): Promise<T | undefined> {
  await ensureInit();
  return _q1<T>(sql, args);
}

async function qAll<T = PlainRow>(sql: string, args?: InArgs): Promise<T[]> {
  await ensureInit();
  return _qAll<T>(sql, args);
}

async function run(sql: string, args?: InArgs): Promise<{ changes: number }> {
  await ensureInit();
  return _run(sql, args);
}

// ─── Schema initialization ────────────────────────────────────────────────────

async function initSchema(): Promise<void> {
  await _execMulti(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      prompt TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      priority TEXT NOT NULL DEFAULT 'medium',
      model TEXT NOT NULL DEFAULT 'auto',
      tags TEXT DEFAULT '[]',
      metadata TEXT DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS agent_steps (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      tool_name TEXT,
      tool_input TEXT,
      tool_result TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      created_at TEXT NOT NULL,
      duration_ms INTEGER,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_files (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      preview_url TEXT,
      folder_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS file_folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT,
      color TEXT DEFAULT '#5e9cf0',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (parent_id) REFERENCES file_folders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sub_tasks (
      id TEXT PRIMARY KEY,
      parent_task_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      agent_type TEXT NOT NULL DEFAULT 'general',
      result TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (parent_task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      instructions TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'custom',
      triggers TEXT DEFAULT '[]',
      is_active INTEGER NOT NULL DEFAULT 1,
      preset_type TEXT DEFAULT 'custom',
      model TEXT DEFAULT NULL,
      tools TEXT DEFAULT NULL,
      max_steps INTEGER DEFAULT NULL,
      max_tokens INTEGER DEFAULT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS gallery_items (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      preview_url TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'general',
      prompt TEXT NOT NULL DEFAULT '',
      task_id TEXT,
      is_featured INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS connector_configs (
      id TEXT PRIMARY KEY,
      connector_id TEXT NOT NULL UNIQUE,
      api_key TEXT,
      oauth_token TEXT,
      oauth_refresh_token TEXT,
      config TEXT DEFAULT '{}',
      connected INTEGER NOT NULL DEFAULT 0,
      connected_at TEXT
    );

    CREATE TABLE IF NOT EXISTS memory (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL,
      source_task_id TEXT,
      tags TEXT DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS token_usage (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      estimated_cost_usd REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      prompt TEXT NOT NULL,
      schedule_type TEXT NOT NULL DEFAULT 'once',
      schedule_expr TEXT,
      next_run_at TEXT NOT NULL,
      last_run_at TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      model TEXT NOT NULL DEFAULT 'auto',
      delete_after_run INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_learnings (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      outcome TEXT NOT NULL DEFAULT 'success',
      tool_name TEXT,
      pattern_key TEXT NOT NULL,
      pattern_data TEXT NOT NULL DEFAULT '{}',
      confidence REAL NOT NULL DEFAULT 0.5,
      created_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_analytics (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      tool_name TEXT,
      model TEXT,
      duration_ms INTEGER,
      success INTEGER NOT NULL DEFAULT 1,
      metadata TEXT DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      key_name TEXT NOT NULL,
      key_value TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, key_name),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      tier TEXT NOT NULL DEFAULT 'free',
      status TEXT NOT NULL DEFAULT 'active',
      tasks_used_this_month INTEGER NOT NULL DEFAULT 0,
      usage_reset_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Migrations — each in its own try/catch so pre-existing columns are safe
  try { await _run("ALTER TABLE tasks ADD COLUMN model TEXT NOT NULL DEFAULT 'auto'"); } catch { /* exists */ }
  try { await _run("ALTER TABLE tasks ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'"); } catch { /* exists */ }
  try { await _run("ALTER TABLE tasks ADD COLUMN depends_on TEXT"); } catch { /* exists */ }
  try { await _run("ALTER TABLE skills ADD COLUMN preset_type TEXT DEFAULT 'custom'"); } catch { /* exists */ }
  try { await _run("ALTER TABLE skills ADD COLUMN model TEXT DEFAULT NULL"); } catch { /* exists */ }
  try { await _run("ALTER TABLE skills ADD COLUMN tools TEXT DEFAULT NULL"); } catch { /* exists */ }
  try { await _run("ALTER TABLE skills ADD COLUMN max_steps INTEGER DEFAULT NULL"); } catch { /* exists */ }
  try { await _run("ALTER TABLE skills ADD COLUMN max_tokens INTEGER DEFAULT NULL"); } catch { /* exists */ }
  try { await _run("ALTER TABLE task_files ADD COLUMN folder_id TEXT"); } catch { /* exists */ }
  try { await _run("ALTER TABLE task_files ADD COLUMN source TEXT DEFAULT 'unknown'"); } catch { /* exists */ }

  // Deduplicate task_files and create unique index
  try {
    const idxExists = await _q1<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_task_files_unique'"
    );
    if (!idxExists) {
      await _run(`
        DELETE FROM task_files WHERE id NOT IN (
          SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY task_id, name ORDER BY created_at DESC) as rn
            FROM task_files
          ) WHERE rn = 1
        )
      `);
      await _run("CREATE UNIQUE INDEX idx_task_files_unique ON task_files(task_id, name)");
    }
  } catch { /* index already exists or migration already ran */ }

  try { await _run("ALTER TABLE skills ADD COLUMN usage_count INTEGER NOT NULL DEFAULT 0"); } catch { /* exists */ }
  try { await _run("ALTER TABLE skills ADD COLUMN success_count INTEGER NOT NULL DEFAULT 0"); } catch { /* exists */ }
  try { await _run("ALTER TABLE skills ADD COLUMN failure_count INTEGER NOT NULL DEFAULT 0"); } catch { /* exists */ }
  try { await _run("ALTER TABLE skills ADD COLUMN auto_generated INTEGER NOT NULL DEFAULT 0"); } catch { /* exists */ }
  try { await _run("ALTER TABLE skills ADD COLUMN source_task_id TEXT"); } catch { /* exists */ }
  try { await _run("ALTER TABLE skills ADD COLUMN performance_score REAL NOT NULL DEFAULT 0.5"); } catch { /* exists */ }
  try { await _run("ALTER TABLE memory ADD COLUMN importance_score REAL NOT NULL DEFAULT 0.5"); } catch { /* exists */ }
  try { await _run("ALTER TABLE memory ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0"); } catch { /* exists */ }
  try { await _run("ALTER TABLE memory ADD COLUMN last_accessed_at TEXT"); } catch { /* exists */ }
  try { await _run("ALTER TABLE memory ADD COLUMN memory_type TEXT NOT NULL DEFAULT 'semantic'"); } catch { /* exists */ }
  try { await _run("ALTER TABLE memory ADD COLUMN compressed INTEGER NOT NULL DEFAULT 0"); } catch { /* exists */ }

  await _execMulti(`
    CREATE TABLE IF NOT EXISTS skill_performance (
      id TEXT PRIMARY KEY,
      skill_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      outcome TEXT NOT NULL DEFAULT 'success',
      tool_count INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )
  `);

  try { await _run("ALTER TABLE tasks ADD COLUMN user_id TEXT"); } catch { /* exists */ }
  try { await _run("ALTER TABLE skills ADD COLUMN user_id TEXT"); } catch { /* exists */ }
  try { await _run("ALTER TABLE gallery_items ADD COLUMN user_id TEXT"); } catch { /* exists */ }
  try { await _run("ALTER TABLE memory ADD COLUMN user_id TEXT"); } catch { /* exists */ }
  try { await _run("ALTER TABLE scheduled_tasks ADD COLUMN user_id TEXT"); } catch { /* exists */ }
  try { await _run("ALTER TABLE file_folders ADD COLUMN user_id TEXT"); } catch { /* exists */ }
  try { await _run("ALTER TABLE agent_analytics ADD COLUMN user_id TEXT"); } catch { /* exists */ }
  try { await _run("ALTER TABLE connector_configs ADD COLUMN user_id TEXT"); } catch { /* exists */ }
  try {
    await _run("DROP INDEX IF EXISTS idx_connector_configs_connector_id");
    await _run("CREATE UNIQUE INDEX IF NOT EXISTS idx_connector_user ON connector_configs(user_id, connector_id)");
  } catch { /* exists */ }
  try { await _run("ALTER TABLE settings ADD COLUMN user_id TEXT"); } catch { /* exists */ }
  try { await _run("CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_user_key ON settings(user_id, key)"); } catch { /* exists */ }

  // Rebuild connector_configs to drop inline UNIQUE(connector_id)
  try {
    const cols = await _qAll<{ name: string }>("PRAGMA table_info(connector_configs)");
    const colNames = cols.map((c) => c.name);
    if (colNames.includes("user_id") && !colNames.includes("_migrated_v2")) {
      await _execMulti(`
        BEGIN;
        CREATE TABLE IF NOT EXISTS connector_configs_v2 (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          connector_id TEXT NOT NULL,
          api_key TEXT,
          oauth_token TEXT,
          oauth_refresh_token TEXT,
          config TEXT DEFAULT '{}',
          connected INTEGER NOT NULL DEFAULT 0,
          connected_at TEXT,
          UNIQUE(user_id, connector_id)
        );
        INSERT OR IGNORE INTO connector_configs_v2
          SELECT id, user_id, connector_id, api_key, oauth_token, oauth_refresh_token, config, connected, connected_at
          FROM connector_configs;
        DROP TABLE connector_configs;
        ALTER TABLE connector_configs_v2 RENAME TO connector_configs;
        COMMIT;
      `);
    }
  } catch { /* already migrated or table clean */ }

  // Rebuild settings to support per-user keys
  try {
    const settingsCols = await _qAll<{ name: string }>("PRAGMA table_info(settings)");
    const colNames = settingsCols.map((c) => c.name);
    if (!colNames.includes("id")) {
      await _execMulti(`
        BEGIN;
        CREATE TABLE IF NOT EXISTS settings_v2 (
          id TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          user_id TEXT,
          updated_at TEXT NOT NULL,
          PRIMARY KEY(user_id, key)
        );
        INSERT OR IGNORE INTO settings_v2 (id, key, value, user_id, updated_at)
          SELECT hex(randomblob(8)), key, value, user_id, updated_at FROM settings;
        DROP TABLE settings;
        ALTER TABLE settings_v2 RENAME TO settings;
        COMMIT;
      `);
    }
  } catch { /* already migrated */ }

  try { await _run("ALTER TABLE subscriptions ADD COLUMN stripe_customer_id TEXT"); } catch { /* exists */ }
  try { await _run("ALTER TABLE subscriptions ADD COLUMN stripe_subscription_id TEXT"); } catch { /* exists */ }
  try { await _run("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0"); } catch { /* exists */ }

  await _execMulti(`
    CREATE TABLE IF NOT EXISTS gift_codes (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      tier TEXT NOT NULL,
      duration_days INTEGER NOT NULL,
      created_by TEXT REFERENCES users(id),
      redeemed_by TEXT REFERENCES users(id),
      redeemed_at TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_gift_codes_code ON gift_codes(code);
  `);

  // Sessions table
  await _execMulti(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      task_ids TEXT DEFAULT '[]',
      persona_id TEXT,
      context_summary TEXT,
      pinned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Documents table
  await _execMulti(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'Untitled',
      type TEXT NOT NULL DEFAULT 'document',
      content TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Clean orphaned file records
  try {
    const taskFilesDir = path.join(process.cwd(), "task-files");
    const orphaned = await _qAll<{ id: string; task_id: string; name: string }>(
      "SELECT id, task_id, name FROM task_files"
    );
    for (const f of orphaned) {
      const filePath = path.join(taskFilesDir, f.task_id, f.name as string);
      if (!fs.existsSync(filePath)) {
        await _run("DELETE FROM task_files WHERE id = ?", [f.id]);
      }
    }
  } catch { /* best-effort cleanup */ }

  // Seed gallery if empty
  const countRow = await _q1<{ c: number }>("SELECT COUNT(*) as c FROM gallery_items");
  if ((countRow?.c ?? 0) === 0) {
    await seedGallery();
  }
}

async function seedGallery(): Promise<void> {
  const items = [
    { id: "g1", title: "S&P 500 Bubble Chart", description: "Interactive visualization of S&P 500 companies by market cap and sector", preview_url: "https://ppl-ai-code-interpreter-files.s3.amazonaws.com/web/direct-files/sites/428c2062-d69a-492b-9685-284788105ab9/sp500-bubbles/447039be-ce28-4ac0-9055-e1e3528ad89d/_preview.jpg", category: "Finance", prompt: "Build an interactive S&P 500 bubble chart showing market cap by sector", is_featured: 1 },
    { id: "g2", title: "Federal Funds Rate Timeline", description: "Historical timeline of Federal Reserve interest rate decisions", preview_url: "https://ppl-ai-code-interpreter-files.s3.amazonaws.com/web/direct-files/sites/f8479b2f-4c80-44d7-80a4-bc1ff2abc5e4/rate-timeline/19a3b250-88f9-4dd4-84a2-2fa2a6962f2d/_preview.jpg", category: "Finance", prompt: "Create a historical timeline of Federal Funds Rate changes since 1954", is_featured: 1 },
    { id: "g3", title: "DOGE Federal Workforce Impact Map", description: "Map showing DOGE federal workforce impact across states", preview_url: "https://ppl-ai-code-interpreter-files.s3.amazonaws.com/web/direct-files/sites/4eb0ef35-4a44-4f91-a931-af9ba5f9c392/doge-impact-map/3e7a1766-4b5c-4598-aed3-4de5ae31b812/_preview.jpg", category: "Politics", prompt: "Visualize the DOGE federal workforce impact across US states", is_featured: 1 },
    { id: "g4", title: "SCOTUS Analytics Dashboard", description: "Analytics dashboard for Supreme Court decisions and voting patterns", preview_url: "https://ppl-ai-code-interpreter-files.s3.amazonaws.com/web/direct-files/sites/0d1709dc-f895-4d92-97ab-ecf1db90a826/scotus-dashboard/39b6caa0-783e-4ab6-80b3-4d39b22ceeec/_preview.jpg", category: "Politics", prompt: "Build a SCOTUS analytics dashboard with voting patterns and decision analysis", is_featured: 1 },
    { id: "g5", title: "Oil Price Timeline", description: "Historical oil price timeline with major geopolitical events", preview_url: "https://ppl-ai-code-interpreter-files.s3.amazonaws.com/web/direct-files/sites/6d84e173-c5a5-4f75-af11-d3add1768e4c/oil-timeline/13469075-91f4-48a4-bf44-9437feface9b/_preview.jpg", category: "Finance", prompt: "Create an interactive oil price timeline from 1970 to present", is_featured: 1 },
    { id: "g6", title: "MegaCap 50 Intelligence", description: "Financial & operational intelligence for the top 50 global companies", preview_url: "https://ppl-ai-code-interpreter-files.s3.amazonaws.com/web/direct-files/sites/c690850f-6d6a-44c3-b4e2-3e37d7afd0f3/megacap-viz/60f9eb59-6845-4e2c-b2ed-0238068ee846/_preview.jpg", category: "Finance", prompt: "Build a MegaCap 50 financial intelligence dashboard", is_featured: 0 },
    { id: "g7", title: "Rent vs Buy Calculator", description: "Interactive calculator comparing renting vs buying a home", preview_url: "https://ppl-ai-code-interpreter-files.s3.amazonaws.com/web/direct-files/sites/fdb94ef6-f681-4a5c-8c45-11cb4064996b/rent-vs-buy/62f6de16-11be-45af-816e-e8ceac762f65/_preview.jpg", category: "Finance", prompt: "Create an interactive rent vs buy calculator with assumptions editor", is_featured: 0 },
    { id: "g8", title: "Big Mac Index Explorer", description: "Explore The Economist's Big Mac Index across countries", preview_url: "https://ppl-ai-code-interpreter-files.s3.amazonaws.com/web/direct-files/sites/025399c5-2239-443d-8e0e-a403a664a8a5/big-mac-index/9df76e9f-1c51-4cf9-8d77-055779348307/_preview.jpg", category: "Economics", prompt: "Build a Big Mac Index explorer with currency purchasing power visualization", is_featured: 0 },
    { id: "g9", title: "US Presidential Elections Map", description: "Interactive US Presidential election results from 1789 to 2024", preview_url: "https://ppl-ai-code-interpreter-files.s3.amazonaws.com/web/direct-files/sites/a3733f61-d646-4cb3-80a2-99377582e38e/election-map/c89c6bd9-e574-4a2d-93a2-7aa6cc1a3462/_preview.jpg", category: "Politics", prompt: "Create an interactive US presidential election map 1789-2024", is_featured: 0 },
    { id: "g10", title: "DRUCK Macro Terminal", description: "Bloomberg-style macro terminal for economic indicators", preview_url: "https://ppl-ai-code-interpreter-files.s3.amazonaws.com/web/direct-files/sites/7dc44ba0-dd20-4fbd-964f-637188a73801/macro-terminal/93c1e337-0506-4be6-ac0a-5c8421099a85/_preview.jpg", category: "Finance", prompt: "Build a Bloomberg-style macro economic terminal dashboard", is_featured: 0 },
    { id: "g11", title: "Tesla 5Y Stock Timeline", description: "5-year Tesla stock price timeline with key events annotated", preview_url: "https://ppl-ai-code-interpreter-files.s3.amazonaws.com/web/direct-files/sites/4c280140-49b5-44f0-a57d-6398965b8f4e/tesla-timeline/0b993f4e-7845-436a-bc27-a3d48ce44a7a/_preview.jpg", category: "Finance", prompt: "Create a 5-year Tesla stock timeline with key events annotated", is_featured: 0 },
    { id: "g12", title: "AI Data Center Global Map", description: "Global map of AI data centers and compute infrastructure", preview_url: "https://ppl-ai-code-interpreter-files.s3.amazonaws.com/web/direct-files/sites/dfe02652-f7ee-401d-96b4-cb1fdace5c0c/ai-datacenters/59bea0f9-8f52-47e5-8d26-bb3dbf536c84/_preview.jpg", category: "Technology", prompt: "Map all major AI data centers globally with capacity and ownership", is_featured: 0 },
  ];
  for (const item of items) {
    await _run(
      `INSERT OR REPLACE INTO gallery_items (id, title, description, preview_url, category, prompt, is_featured, created_at) VALUES (@id, @title, @description, @preview_url, @category, @prompt, @is_featured, @created_at)`,
      { ...item, created_at: new Date().toISOString() } as InArgs
    );
  }
}

// ─── Task CRUD ────────────────────────────────────────────────────────────────

export async function createTask(task: Omit<Task, "steps" | "files" | "messages" | "sub_tasks"> & { depends_on?: string; user_id?: string }): Promise<Task> {
  await run(
    `INSERT INTO tasks (id, title, prompt, description, status, priority, model, tags, metadata, depends_on, source, user_id, created_at, updated_at)
     VALUES (@id, @title, @prompt, @description, @status, @priority, @model, @tags, @metadata, @depends_on, @source, @user_id, @created_at, @updated_at)`,
    {
      id: task.id,
      title: task.title,
      prompt: task.prompt || task.description || "",
      description: task.description || "",
      status: task.status || "pending",
      priority: task.priority || "medium",
      model: task.model || "auto",
      tags: JSON.stringify(task.tags || []),
      metadata: JSON.stringify(task.metadata || {}),
      depends_on: task.depends_on || null,
      source: task.source || "manual",
      user_id: task.user_id || null,
      created_at: task.created_at,
      updated_at: task.updated_at,
    } as InArgs
  );
  return (await getTask(task.id))!;
}

export async function getTask(id: string): Promise<Task | null> {
  const row = await q1<Record<string, unknown>>("SELECT * FROM tasks WHERE id = ?", [id]);
  if (!row) return null;
  return hydrateTask(row);
}

export async function listTasks(status?: string, limit = 50, offset = 0, userId?: string): Promise<Task[]> {
  let rows: Record<string, unknown>[];
  if (userId && status) {
    rows = await qAll<Record<string, unknown>>("SELECT * FROM tasks WHERE user_id = ? AND status = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?", [userId, status, limit, offset]);
  } else if (userId) {
    rows = await qAll<Record<string, unknown>>("SELECT * FROM tasks WHERE user_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?", [userId, limit, offset]);
  } else if (status) {
    rows = await qAll<Record<string, unknown>>("SELECT * FROM tasks WHERE status = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?", [status, limit, offset]);
  } else {
    rows = await qAll<Record<string, unknown>>("SELECT * FROM tasks ORDER BY updated_at DESC LIMIT ? OFFSET ?", [limit, offset]);
  }
  return Promise.all(rows.map((r) => hydrateTask(r)));
}

// Lightweight task summary for SSE events (avoids N+1 hydration queries)
export interface TaskSummary {
  id: string;
  title: string;
  status: string;
  priority: string;
  updated_at: string;
  steps_count: number;
  files_count: number;
}

export async function listTasksSummary(limit = 100, userId?: string): Promise<TaskSummary[]> {
  if (userId) {
    return qAll<TaskSummary>(
      `SELECT t.id, t.title, t.status, t.priority, t.updated_at,
        (SELECT COUNT(*) FROM agent_steps WHERE task_id = t.id) AS steps_count,
        (SELECT COUNT(*) FROM task_files WHERE task_id = t.id) AS files_count
       FROM tasks t WHERE t.user_id = ? ORDER BY t.updated_at DESC LIMIT ?`,
      [userId, limit]
    );
  }
  return qAll<TaskSummary>(
    `SELECT t.id, t.title, t.status, t.priority, t.updated_at,
      (SELECT COUNT(*) FROM agent_steps WHERE task_id = t.id) AS steps_count,
      (SELECT COUNT(*) FROM task_files WHERE task_id = t.id) AS files_count
     FROM tasks t ORDER BY t.updated_at DESC LIMIT ?`,
    [limit]
  );
}

export async function updateTaskStatus(id: string, status: string, completedAt?: string): Promise<void> {
  await run("UPDATE tasks SET status = ?, updated_at = ?, completed_at = ? WHERE id = ?", [
    status, new Date().toISOString(), completedAt || null, id,
  ]);
}

export async function updateTaskTitle(id: string, title: string): Promise<void> {
  await run("UPDATE tasks SET title = ?, updated_at = ? WHERE id = ?", [title, new Date().toISOString(), id]);
}

export async function updateTaskMetadata(id: string, metadata: Record<string, unknown>): Promise<void> {
  await run("UPDATE tasks SET metadata = ?, updated_at = ? WHERE id = ?", [
    JSON.stringify(metadata), new Date().toISOString(), id,
  ]);
}

export async function deleteTask(id: string): Promise<void> {
  await run("DELETE FROM tasks WHERE id = ?", [id]);
}

async function hydrateTask(row: Record<string, unknown>): Promise<Task> {
  const steps = await _qAll<Record<string, unknown>>("SELECT * FROM agent_steps WHERE task_id = ? ORDER BY created_at ASC", [row.id as string]);
  const files = await _qAll<Record<string, unknown>>("SELECT * FROM task_files WHERE task_id = ? ORDER BY created_at ASC", [row.id as string]);
  const messages = await _qAll<Record<string, unknown>>("SELECT * FROM messages WHERE task_id = ? ORDER BY created_at ASC", [row.id as string]);
  const subTasks = await _qAll<Record<string, unknown>>("SELECT * FROM sub_tasks WHERE parent_task_id = ? ORDER BY created_at ASC", [row.id as string]);

  return {
    id: row.id as string,
    title: row.title as string,
    prompt: (row.prompt as string) || "",
    description: row.description as string,
    status: row.status as Task["status"],
    priority: row.priority as Task["priority"],
    model: ((row.model as string) || "auto") as Task["model"],
    source: ((row.source as string) || "manual") as Task["source"],
    tags: JSON.parse((row.tags as string) || "[]"),
    metadata: JSON.parse((row.metadata as string) || "{}"),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    completed_at: row.completed_at as string | undefined,
    depends_on: (row.depends_on as string) || undefined,
    steps: steps.map((s) => ({
      id: s.id as string,
      task_id: s.task_id as string,
      type: s.type as AgentStep["type"],
      title: s.title as string,
      content: s.content as string,
      tool_name: s.tool_name as string | undefined,
      tool_input: s.tool_input ? JSON.parse(s.tool_input as string) : undefined,
      tool_result: s.tool_result as string | undefined,
      status: s.status as AgentStep["status"],
      created_at: s.created_at as string,
      duration_ms: s.duration_ms as number | undefined,
    })),
    files: files.map((f) => ({
      id: f.id as string,
      task_id: f.task_id as string,
      name: f.name as string,
      path: f.path as string,
      size: f.size as number,
      mime_type: f.mime_type as string,
      preview_url: f.preview_url as string | undefined,
      created_at: f.created_at as string,
    })),
    messages: messages.map((m) => ({
      id: m.id as string,
      task_id: m.task_id as string,
      role: m.role as Message["role"],
      content: m.content as string,
      created_at: m.created_at as string,
    })),
    sub_tasks: subTasks.map((s) => ({
      id: s.id as string,
      parent_task_id: s.parent_task_id as string,
      title: s.title as string,
      status: s.status as TaskStatus,
      agent_type: s.agent_type as string,
      result: s.result as string | undefined,
      created_at: s.created_at as string,
    })),
  };
}

// ─── Agent Step CRUD ──────────────────────────────────────────────────────────

export async function addAgentStep(step: Omit<AgentStep, "duration_ms">): Promise<void> {
  await run(
    `INSERT INTO agent_steps (id, task_id, type, title, content, tool_name, tool_input, tool_result, status, created_at)
     VALUES (@id, @task_id, @type, @title, @content, @tool_name, @tool_input, @tool_result, @status, @created_at)`,
    {
      id: step.id,
      task_id: step.task_id,
      type: step.type,
      title: step.title,
      content: step.content,
      tool_name: step.tool_name ?? null,
      tool_input: step.tool_input ? JSON.stringify(step.tool_input) : null,
      tool_result: step.tool_result ?? null,
      status: step.status,
      created_at: step.created_at,
    } as InArgs
  );
}

export async function updateAgentStep(id: string, updates: Partial<AgentStep>): Promise<void> {
  if (updates.tool_result !== undefined) {
    await run("UPDATE agent_steps SET tool_result = ?, status = ?, duration_ms = ? WHERE id = ?", [
      updates.tool_result, updates.status || "completed", updates.duration_ms || null, id,
    ]);
  } else if (updates.content !== undefined) {
    await run("UPDATE agent_steps SET content = ?, status = ? WHERE id = ?", [
      updates.content, updates.status || "running", id,
    ]);
  } else if (updates.status !== undefined) {
    await run("UPDATE agent_steps SET status = ? WHERE id = ?", [updates.status, id]);
  }
  if (updates.title !== undefined) {
    await run("UPDATE agent_steps SET title = ? WHERE id = ?", [updates.title, id]);
  }
}

// ─── Message CRUD ─────────────────────────────────────────────────────────────

export async function addMessage(message: Message): Promise<void> {
  await run(
    "INSERT INTO messages (id, task_id, role, content, created_at) VALUES (@id, @task_id, @role, @content, @created_at)",
    message as unknown as InArgs
  );
}

// ─── File CRUD ────────────────────────────────────────────────────────────────

export async function addTaskFile(file: TaskFile): Promise<void> {
  await run(
    `INSERT INTO task_files (id, task_id, name, path, size, mime_type, preview_url, folder_id, source, created_at)
     VALUES (@id, @task_id, @name, @path, @size, @mime_type, @preview_url, @folder_id, @source, @created_at)
     ON CONFLICT(task_id, name) DO UPDATE SET
       path = excluded.path,
       size = excluded.size,
       mime_type = excluded.mime_type,
       preview_url = COALESCE(excluded.preview_url, task_files.preview_url),
       source = COALESCE(excluded.source, task_files.source),
       created_at = excluded.created_at`,
    {
      id: file.id,
      task_id: file.task_id,
      name: file.name,
      path: file.path,
      size: file.size,
      mime_type: file.mime_type,
      preview_url: file.preview_url ?? null,
      folder_id: file.folder_id ?? null,
      source: file.source ?? "unknown",
      created_at: file.created_at,
    } as InArgs
  );

  // Auto-add to memory
  try {
    const src = file.source || "unknown";
    const mediaType = (file.mime_type || "application/octet-stream").split("/")[0];
    const now = new Date().toISOString();
    const memKey = `file:${file.task_id}/${file.name}`;
    const memValue = `File "${file.name}" (${file.mime_type}, ${file.size} bytes) from ${src}. Path: /api/files/${file.task_id}/${file.name}`;
    const existing = await q1<{ id: string }>("SELECT id FROM memory WHERE key = ?", [memKey]);
    if (existing) {
      await run("UPDATE memory SET value=?, source_task_id=?, tags=?, updated_at=? WHERE key=?", [
        memValue, file.task_id, JSON.stringify(["file", src, mediaType]), now, memKey,
      ]);
    } else {
      await run(
        "INSERT INTO memory (id, key, value, source_task_id, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [file.id + "-mem", memKey, memValue, file.task_id, JSON.stringify(["file", src, mediaType]), now, now]
      );
    }
  } catch { /* memory is best-effort, never block file creation */ }
}

export async function listAllFiles(limit = 500): Promise<(TaskFile & { task_title?: string })[]> {
  const rows = await qAll<Record<string, unknown>>(
    `SELECT tf.*, t.title as task_title FROM task_files tf LEFT JOIN tasks t ON tf.task_id = t.id ORDER BY tf.created_at DESC LIMIT ?`,
    [limit]
  );
  return rows.map((r) => ({
    id: r.id as string,
    task_id: r.task_id as string,
    name: r.name as string,
    path: r.path as string,
    size: r.size as number,
    mime_type: r.mime_type as string,
    preview_url: r.preview_url as string | undefined,
    folder_id: r.folder_id as string | undefined,
    source: ((r.source as string | undefined) || "unknown") as FileSource,
    created_at: r.created_at as string,
    task_title: r.task_title as string | undefined,
  }));
}

export async function getFilesStats(): Promise<{ total: number; bySource: Record<string, number>; byType: Record<string, number>; totalSize: number }> {
  const totalRow = await q1<{ c: number }>("SELECT COUNT(*) as c FROM task_files");
  const sizeRow = await q1<{ s: number }>("SELECT COALESCE(SUM(size), 0) as s FROM task_files");
  const total = totalRow?.c ?? 0;
  const totalSize = sizeRow?.s ?? 0;

  const sourceRows = await qAll<{ src: string; c: number }>(
    "SELECT COALESCE(source, 'unknown') as src, COUNT(*) as c FROM task_files GROUP BY src"
  );
  const bySource: Record<string, number> = {};
  for (const r of sourceRows) bySource[r.src] = r.c;

  const typeRows = await qAll<{ type_group: string; c: number }>(
    `SELECT CASE WHEN mime_type LIKE 'image/%' THEN 'images' WHEN mime_type LIKE 'video/%' THEN 'video'
      WHEN mime_type LIKE 'audio/%' THEN 'audio' WHEN mime_type LIKE 'text/%' THEN 'text' ELSE 'other'
     END as type_group, COUNT(*) as c FROM task_files GROUP BY type_group`
  );
  const byType: Record<string, number> = {};
  for (const r of typeRows) byType[r.type_group] = r.c;

  return { total, bySource, byType, totalSize };
}

export async function updateFileFolder(fileId: string, folderId: string | null): Promise<void> {
  await run("UPDATE task_files SET folder_id = ? WHERE id = ?", [folderId, fileId]);
}

// ─── Folder CRUD ──────────────────────────────────────────────────────────────

export async function createFolder(folder: FileFolder): Promise<void> {
  await run(
    "INSERT INTO file_folders (id, name, parent_id, color, created_at, updated_at) VALUES (@id, @name, @parent_id, @color, @created_at, @updated_at)",
    {
      id: folder.id,
      name: folder.name,
      parent_id: folder.parent_id ?? null,
      color: folder.color ?? "#5e9cf0",
      created_at: folder.created_at,
      updated_at: folder.updated_at,
    } as InArgs
  );
}

export async function listFolders(): Promise<FileFolder[]> {
  const rows = await qAll<Record<string, unknown>>("SELECT * FROM file_folders ORDER BY name ASC");
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    parent_id: r.parent_id as string | undefined,
    color: r.color as string | undefined,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  }));
}

export async function renameFolder(id: string, name: string): Promise<void> {
  await run("UPDATE file_folders SET name = ?, updated_at = ? WHERE id = ?", [name, new Date().toISOString(), id]);
}

export async function deleteFolder(id: string): Promise<void> {
  await run("UPDATE task_files SET folder_id = NULL WHERE folder_id = ?", [id]);
  const folder = await q1<{ parent_id: string | null }>("SELECT parent_id FROM file_folders WHERE id = ?", [id]);
  const newParent = folder?.parent_id ?? null;
  await run("UPDATE file_folders SET parent_id = ? WHERE parent_id = ?", [newParent, id]);
  await run("DELETE FROM file_folders WHERE id = ?", [id]);
}

// ─── Sub-task CRUD ─────────────────────────────────────────────────────────────

export async function addSubTask(subTask: SubTask): Promise<void> {
  await run(
    "INSERT INTO sub_tasks (id, parent_task_id, title, status, agent_type, result, created_at) VALUES (@id, @parent_task_id, @title, @status, @agent_type, @result, @created_at)",
    {
      id: subTask.id,
      parent_task_id: subTask.parent_task_id,
      title: subTask.title,
      status: subTask.status,
      agent_type: subTask.agent_type,
      result: subTask.result ?? null,
      created_at: subTask.created_at,
    } as InArgs
  );
}

export async function updateSubTask(id: string, status: string, result?: string): Promise<void> {
  await run("UPDATE sub_tasks SET status = ?, result = ? WHERE id = ?", [status, result || null, id]);
}

// ─── Skills CRUD ──────────────────────────────────────────────────────────────

export async function listSkills(userId?: string): Promise<Skill[]> {
  const rows = userId
    ? await qAll<Record<string, unknown>>("SELECT * FROM skills WHERE user_id = ? OR user_id IS NULL ORDER BY created_at DESC", [userId])
    : await qAll<Record<string, unknown>>("SELECT * FROM skills ORDER BY created_at DESC");
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    description: r.description as string,
    instructions: r.instructions as string,
    category: (r.category as string) || "custom",
    triggers: JSON.parse((r.triggers as string) || "[]"),
    is_active: (r.is_active as number) === 1,
    preset_type: ((r.preset_type as string) || "custom") as PresetType,
    model: (r.model as ModelId) || undefined,
    tools: r.tools ? JSON.parse(r.tools as string) : undefined,
    max_steps: (r.max_steps as number) || undefined,
    max_tokens: (r.max_tokens as number) || undefined,
    usage_count: (r.usage_count as number) || 0,
    success_count: (r.success_count as number) || 0,
    failure_count: (r.failure_count as number) || 0,
    auto_generated: ((r.auto_generated as number) || 0) === 1,
    source_task_id: (r.source_task_id as string) || undefined,
    performance_score: (r.performance_score as number) ?? 0.5,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  }));
}

export async function getSkill(id: string): Promise<Skill | undefined> {
  const row = await q1<Record<string, unknown>>("SELECT * FROM skills WHERE id = ?", [id]);
  if (!row) return undefined;
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    instructions: row.instructions as string,
    category: (row.category as string) || "custom",
    triggers: JSON.parse((row.triggers as string) || "[]"),
    is_active: !!(row.is_active as number),
    preset_type: ((row.preset_type as string) || "custom") as PresetType,
    model: (row.model as ModelId) || undefined,
    tools: row.tools ? JSON.parse(row.tools as string) : undefined,
    max_steps: row.max_steps as number | undefined,
    max_tokens: row.max_tokens as number | undefined,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export async function getSkillByName(name: string): Promise<Skill | undefined> {
  const row = await q1<{ id: string }>("SELECT id FROM skills WHERE LOWER(name) = LOWER(?)", [name]);
  if (!row) return undefined;
  return getSkill(row.id);
}

export async function createSkill(skill: Omit<Skill, "created_at" | "updated_at"> & { user_id?: string }): Promise<Skill> {
  const now = new Date().toISOString();
  await run(
    `INSERT INTO skills (id, name, description, instructions, category, triggers, is_active,
      preset_type, model, tools, max_steps, max_tokens, auto_generated, source_task_id, user_id, created_at, updated_at)
     VALUES (@id, @name, @description, @instructions, @category, @triggers, @is_active,
      @preset_type, @model, @tools, @max_steps, @max_tokens, @auto_generated, @source_task_id, @user_id, @created_at, @updated_at)`,
    {
      ...skill,
      category: skill.category || "custom",
      triggers: JSON.stringify(skill.triggers || []),
      is_active: skill.is_active ? 1 : 0,
      preset_type: skill.preset_type || "custom",
      model: skill.model || null,
      tools: skill.tools ? JSON.stringify(skill.tools) : null,
      max_steps: skill.max_steps || null,
      max_tokens: skill.max_tokens || null,
      auto_generated: (skill as Record<string, unknown>).auto_generated ? 1 : 0,
      source_task_id: (skill as Record<string, unknown>).source_task_id || null,
      user_id: skill.user_id || null,
      created_at: now,
      updated_at: now,
    } as InArgs
  );
  return { ...skill, created_at: now, updated_at: now };
}

export async function updateSkill(id: string, updates: Partial<Skill>): Promise<void> {
  const existing = await q1<Record<string, unknown>>("SELECT * FROM skills WHERE id=?", [id]);
  if (!existing) return;
  const merged = {
    name: updates.name ?? existing.name,
    description: updates.description ?? existing.description,
    instructions: updates.instructions ?? existing.instructions,
    category: updates.category ?? existing.category ?? "custom",
    is_active: updates.is_active !== undefined ? (updates.is_active ? 1 : 0) : existing.is_active,
    triggers: updates.triggers ? JSON.stringify(updates.triggers) : (existing.triggers as string || "[]"),
    preset_type: updates.preset_type ?? existing.preset_type ?? "custom",
    model: updates.model ?? existing.model ?? null,
    tools: updates.tools ? JSON.stringify(updates.tools) : (existing.tools as string || null),
    max_steps: updates.max_steps ?? existing.max_steps ?? null,
    max_tokens: updates.max_tokens ?? existing.max_tokens ?? null,
  };
  await run(
    `UPDATE skills SET name=?, description=?, instructions=?, category=?, is_active=?, triggers=?,
      preset_type=?, model=?, tools=?, max_steps=?, max_tokens=?, updated_at=? WHERE id=?`,
    [merged.name, merged.description, merged.instructions, merged.category, merged.is_active, merged.triggers,
     merged.preset_type, merged.model, merged.tools, merged.max_steps, merged.max_tokens, new Date().toISOString(), id] as InValue[]
  );
}

export async function deleteSkill(id: string): Promise<void> {
  await run("DELETE FROM skills WHERE id = ?", [id]);
}

// ─── Skill Performance Tracking ───────────────────────────────────────────────

export async function incrementSkillUsage(skillId: string, outcome: "success" | "failure"): Promise<void> {
  const FIELDS: Record<string, string> = { success: "success_count", failure: "failure_count" };
  const field = FIELDS[outcome];
  if (!field) throw new Error(`Invalid outcome: ${outcome}`);
  await run(`UPDATE skills SET usage_count = usage_count + 1, ${field} = ${field} + 1, updated_at = ? WHERE id = ?`,
    [new Date().toISOString(), skillId]
  );
  const row = await q1<{ usage_count: number; success_count: number }>(
    "SELECT usage_count, success_count FROM skills WHERE id = ?", [skillId]
  );
  if (row && row.usage_count > 0) {
    const score = row.success_count / row.usage_count;
    await run("UPDATE skills SET performance_score = ? WHERE id = ?", [score, skillId]);
  }
}

export async function findSimilarSkill(name: string): Promise<boolean> {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const skills = await q1<{ names: string }>("SELECT GROUP_CONCAT(name) as names FROM skills");
  const names = (skills?.names as string || "").split(",").filter(Boolean);
  return names.some(s => {
    const sNorm = s.toLowerCase().replace(/[^a-z0-9]/g, "");
    return sNorm === normalized || levenshteinDistance(sNorm, normalized) < 3;
  });
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export async function recordSkillPerf(perf: {
  skill_id: string; task_id: string; outcome: "success" | "failure"; tool_count: number; duration_ms: number; created_at: string;
}): Promise<void> {
  try {
    await run(
      "INSERT INTO skill_performance (id, skill_id, task_id, outcome, tool_count, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [uuidv4(), perf.skill_id, perf.task_id, perf.outcome, perf.tool_count, perf.duration_ms, perf.created_at]
    );
  } catch (e) {
    console.error("[skill-perf] Error recording:", e);
  }
}

export async function getSkillSuccessRateFromDb(skillId: string): Promise<{ total: number; successes: number; rate: number }> {
  try {
    const rows = await qAll<{ outcome: string }>(
      "SELECT outcome FROM skill_performance WHERE skill_id = ? ORDER BY created_at DESC LIMIT 20", [skillId]
    );
    const total = rows.length;
    const successes = rows.filter(r => r.outcome === "success").length;
    return { total, successes, rate: total > 0 ? successes / total : 0 };
  } catch {
    return { total: 0, successes: 0, rate: 0 };
  }
}

export async function identifyUnderperformingSkillsFromDb(): Promise<Array<{ skill_id: string; name: string; rate: number; total: number }>> {
  try {
    const skills = await qAll<{ id: string; name: string }>("SELECT id, name FROM skills WHERE is_active = 1");
    const underperforming: Array<{ skill_id: string; name: string; rate: number; total: number }> = [];
    for (const skill of skills) {
      const perf = await getSkillSuccessRateFromDb(skill.id);
      if (perf.total >= 3 && perf.rate < 0.6) {
        underperforming.push({ skill_id: skill.id, name: skill.name, rate: perf.rate, total: perf.total });
      }
    }
    return underperforming;
  } catch {
    return [];
  }
}

export async function listSkillPerformance(skillId?: string, limit = 20): Promise<Array<{
  id: string; skill_id: string; task_id: string; outcome: string; tool_count: number; duration_ms: number; created_at: string;
}>> {
  if (skillId) {
    return qAll("SELECT * FROM skill_performance WHERE skill_id = ? ORDER BY created_at DESC LIMIT ?", [skillId, limit]);
  }
  return qAll("SELECT * FROM skill_performance ORDER BY created_at DESC LIMIT ?", [limit]);
}

// ─── Enhanced Memory ──────────────────────────────────────────────────────────

export async function updateMemoryAccess(id: string): Promise<void> {
  await run("UPDATE memory SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?",
    [new Date().toISOString(), id]
  );
}

export async function listMemoryWithMeta(limit = 50): Promise<Array<MemoryEntry & { importance_score: number; access_count: number; memory_type: string; compressed: boolean }>> {
  const rows = await qAll<Record<string, unknown>>(
    "SELECT * FROM memory ORDER BY importance_score DESC, updated_at DESC LIMIT ?", [limit]
  );
  return rows.map((r) => ({
    id: r.id as string,
    key: r.key as string,
    value: r.value as string,
    source_task_id: r.source_task_id as string | undefined,
    tags: JSON.parse((r.tags as string) || "[]"),
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    importance_score: (r.importance_score as number) ?? 0.5,
    access_count: (r.access_count as number) ?? 0,
    memory_type: (r.memory_type as string) ?? "semantic",
    compressed: ((r.compressed as number) ?? 0) === 1,
  }));
}

export async function getSelfImprovementStats(): Promise<{
  total_memories: number;
  compressed_memories: number;
  auto_skills: number;
  avg_skill_performance: number;
  total_learnings: number;
  high_confidence_learnings: number;
}> {
  const memCount = await q1<{ c: number }>("SELECT COUNT(*) as c FROM memory");
  const compCount = await q1<{ c: number }>("SELECT COUNT(*) as c FROM memory WHERE compressed = 1");
  const autoSkills = await q1<{ c: number }>("SELECT COUNT(*) as c FROM skills WHERE auto_generated = 1");
  const avgPerf = await q1<{ a: number | null }>("SELECT AVG(performance_score) as a FROM skills WHERE usage_count > 0");
  const learnCount = await q1<{ c: number }>("SELECT COUNT(*) as c FROM agent_learnings");
  const highConf = await q1<{ c: number }>("SELECT COUNT(*) as c FROM agent_learnings WHERE confidence > 0.7");
  return {
    total_memories: memCount?.c ?? 0,
    compressed_memories: compCount?.c ?? 0,
    auto_skills: autoSkills?.c ?? 0,
    avg_skill_performance: avgPerf?.a ?? 0,
    total_learnings: learnCount?.c ?? 0,
    high_confidence_learnings: highConf?.c ?? 0,
  };
}

// ─── Gallery CRUD ─────────────────────────────────────────────────────────────

export async function listGallery(userId?: string): Promise<GalleryItem[]> {
  const rows = userId
    ? await qAll<Record<string, unknown>>("SELECT * FROM gallery_items WHERE user_id = ? ORDER BY is_featured DESC, created_at DESC", [userId])
    : await qAll<Record<string, unknown>>("SELECT * FROM gallery_items ORDER BY is_featured DESC, created_at DESC");
  return rows.map((r) => ({
    id: r.id as string,
    title: r.title as string,
    description: r.description as string,
    preview_url: r.preview_url as string,
    category: r.category as string,
    prompt: r.prompt as string,
    task_id: r.task_id as string | undefined,
    is_featured: (r.is_featured as number) === 1,
    created_at: r.created_at as string,
  }));
}

export async function addGalleryItem(item: GalleryItem & { user_id?: string }): Promise<void> {
  await run(
    `INSERT INTO gallery_items (id, title, description, preview_url, category, prompt, task_id, is_featured, user_id, created_at)
     VALUES (@id, @title, @description, @preview_url, @category, @prompt, @task_id, @is_featured, @user_id, @created_at)`,
    {
      id: item.id,
      title: item.title,
      description: item.description,
      preview_url: item.preview_url ?? null,
      category: item.category,
      prompt: item.prompt,
      task_id: item.task_id ?? null,
      is_featured: item.is_featured ? 1 : 0,
      user_id: item.user_id || null,
      created_at: item.created_at,
    } as InArgs
  );
}

export async function deleteGalleryItem(id: string): Promise<boolean> {
  const result = await run("DELETE FROM gallery_items WHERE id = ?", [id]);
  return result.changes > 0;
}

// ─── Connector Config ─────────────────────────────────────────────────────────

export async function getConnectorConfig(connectorId: string, userId?: string): Promise<Record<string, unknown> | null> {
  const row = userId
    ? await q1<Record<string, unknown>>("SELECT * FROM connector_configs WHERE connector_id = ? AND user_id = ?", [connectorId, userId])
    : await q1<Record<string, unknown>>("SELECT * FROM connector_configs WHERE connector_id = ? AND user_id IS NULL", [connectorId]);
  if (!row) return null;
  return {
    ...row,
    config: JSON.parse((row.config as string) || "{}"),
    connected: (row.connected as number) === 1,
    api_key: row.api_key ?? null,
    oauth_token: row.oauth_token ?? null,
    oauth_refresh_token: row.oauth_refresh_token ?? null,
  };
}

export async function setConnectorConfig(connectorId: string, config: Record<string, unknown>, userId?: string): Promise<void> {
  const existing = userId
    ? await q1("SELECT id FROM connector_configs WHERE connector_id = ? AND user_id = ?", [connectorId, userId])
    : await q1("SELECT id FROM connector_configs WHERE connector_id = ? AND user_id IS NULL", [connectorId]);
  if (existing) {
    await run(
      "UPDATE connector_configs SET api_key=?, config=?, connected=?, connected_at=? WHERE connector_id=? AND (user_id = ? OR (user_id IS NULL AND ? IS NULL))",
      [config.api_key as string || null, JSON.stringify(config), config.connected ? 1 : 0,
       config.connected ? new Date().toISOString() : null, connectorId, userId || null, userId || null]
    );
  } else {
    await run(
      "INSERT INTO connector_configs (id, connector_id, api_key, config, connected, connected_at, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [uuidv4(), connectorId, config.api_key as string || null, JSON.stringify(config),
       config.connected ? 1 : 0, config.connected ? new Date().toISOString() : null, userId || null]
    );
  }
}

export async function storeOAuthTokens(
  connectorId: string,
  tokens: { access_token: string; refresh_token?: string; expires_in?: number },
  userId?: string
): Promise<void> {
  const existing = userId
    ? await q1("SELECT id FROM connector_configs WHERE connector_id = ? AND user_id = ?", [connectorId, userId])
    : await q1("SELECT id FROM connector_configs WHERE connector_id = ? AND user_id IS NULL", [connectorId]);
  if (existing) {
    await run(
      "UPDATE connector_configs SET oauth_token=?, oauth_refresh_token=?, connected=1, connected_at=? WHERE connector_id=? AND (user_id = ? OR (user_id IS NULL AND ? IS NULL))",
      [tokens.access_token, tokens.refresh_token ?? null, new Date().toISOString(), connectorId, userId || null, userId || null]
    );
  } else {
    await run(
      "INSERT INTO connector_configs (id, connector_id, oauth_token, oauth_refresh_token, connected, connected_at, config, api_key, user_id) VALUES (?, ?, ?, ?, 1, ?, ?, NULL, ?)",
      [uuidv4(), connectorId, tokens.access_token, tokens.refresh_token ?? null, new Date().toISOString(), "{}", userId || null]
    );
  }
}

export async function disconnectConnector(connectorId: string, userId?: string): Promise<void> {
  if (userId) {
    await run("UPDATE connector_configs SET connected = 0, api_key = NULL, oauth_token = NULL WHERE connector_id = ? AND user_id = ?", [connectorId, userId]);
  } else {
    await run("UPDATE connector_configs SET connected = 0, api_key = NULL, oauth_token = NULL WHERE connector_id = ? AND user_id IS NULL", [connectorId]);
  }
}

export async function listConnectorConfigs(userId?: string): Promise<Array<{ connector_id: string; connected: boolean; connected_at?: string }>> {
  const rows = userId
    ? await qAll<{ connector_id: string; connected: number; connected_at?: string }>(
        "SELECT connector_id, connected, connected_at FROM connector_configs WHERE connected = 1 AND user_id = ?", [userId])
    : await qAll<{ connector_id: string; connected: number; connected_at?: string }>(
        "SELECT connector_id, connected, connected_at FROM connector_configs WHERE connected = 1 AND user_id IS NULL");
  return rows.map((r) => ({ ...r, connected: r.connected === 1 }));
}

// Filesystem helpers
export function ensureFilesDir(): string {
  const absDir = path.resolve(FILES_DIR);
  if (!fs.existsSync(absDir)) {
    fs.mkdirSync(absDir, { recursive: true });
  }
  return absDir;
}

// ─── Memory ───────────────────────────────────────────────────────────────────

export async function memoryStore(entry: MemoryEntry & { user_id?: string }): Promise<void> {
  const userId = entry.user_id || null;
  const existing = userId
    ? await q1("SELECT id FROM memory WHERE key = ? AND user_id = ?", [entry.key, userId])
    : await q1("SELECT id FROM memory WHERE key = ? AND user_id IS NULL", [entry.key]);
  if (existing) {
    await run(
      "UPDATE memory SET value=?, source_task_id=?, tags=?, updated_at=? WHERE key=? AND (user_id = ? OR (user_id IS NULL AND ? IS NULL))",
      [entry.value, entry.source_task_id || null, JSON.stringify(entry.tags || []),
       new Date().toISOString(), entry.key, userId, userId]
    );
  } else {
    await run(
      "INSERT INTO memory (id, key, value, source_task_id, tags, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [entry.id, entry.key, entry.value, entry.source_task_id || null,
       JSON.stringify(entry.tags || []), userId, entry.created_at, entry.updated_at]
    );
  }
}

export async function memoryRecall(query: string, limit = 5, userId?: string): Promise<MemoryEntry[]> {
  const rows = userId
    ? await qAll<Record<string, unknown>>("SELECT * FROM memory WHERE user_id = ? OR user_id IS NULL ORDER BY updated_at DESC LIMIT 200", [userId])
    : await qAll<Record<string, unknown>>("SELECT * FROM memory ORDER BY updated_at DESC LIMIT 200");

  const queryTokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const docFreq = new Map<string, number>();
  for (const tok of queryTokens) {
    let count = 0;
    for (const r of rows) {
      const text = `${r.key} ${r.value}`.toLowerCase();
      if (text.includes(tok)) count++;
    }
    docFreq.set(tok, count);
  }

  const scored = rows.map((r) => {
    const keyText = (r.key as string).toLowerCase();
    const valText = (r.value as string).toLowerCase();
    const fullText = `${keyText} ${valText}`;
    const tags = JSON.parse((r.tags as string) || "[]") as string[];
    const tagText = tags.join(" ").toLowerCase();
    let score = 0;
    for (const tok of queryTokens) {
      const df = docFreq.get(tok) || 1;
      const idf = Math.log(rows.length / df + 1);
      if (keyText.includes(tok)) score += 3 * idf;
      if (valText.includes(tok)) score += 1 * idf;
      if (tagText.includes(tok)) score += 2 * idf;
      if (keyText === tok || keyText.includes(query.toLowerCase())) score += 5;
    }
    const ageMs = Date.now() - new Date(r.updated_at as string).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    const recencyBoost = Math.max(0.5, 1 - ageDays / 365);
    score *= recencyBoost;
    const queryLower = query.toLowerCase();
    if (fullText.includes(queryLower)) score += 4;
    return { row: r, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => ({
      id: s.row.id as string,
      key: s.row.key as string,
      value: s.row.value as string,
      source_task_id: s.row.source_task_id as string | undefined,
      tags: JSON.parse((s.row.tags as string) || "[]"),
      created_at: s.row.created_at as string,
      updated_at: s.row.updated_at as string,
    }));
}

export async function listMemory(limit = 50, userId?: string): Promise<MemoryEntry[]> {
  const rows = userId
    ? await qAll<Record<string, unknown>>("SELECT * FROM memory WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?", [userId, limit])
    : await qAll<Record<string, unknown>>("SELECT * FROM memory ORDER BY updated_at DESC LIMIT ?", [limit]);
  return rows.map((r) => ({
    id: r.id as string,
    key: r.key as string,
    value: r.value as string,
    source_task_id: r.source_task_id as string | undefined,
    tags: JSON.parse((r.tags as string) || "[]"),
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  }));
}

export async function deleteMemory(id: string): Promise<void> {
  await run("DELETE FROM memory WHERE id = ?", [id]);
}

export async function updateMemory(id: string, updates: { key?: string; value?: string; tags?: string[] }): Promise<void> {
  const sets: string[] = [];
  const vals: InValue[] = [];
  if (updates.key !== undefined) { sets.push("key = ?"); vals.push(updates.key); }
  if (updates.value !== undefined) { sets.push("value = ?"); vals.push(updates.value); }
  if (updates.tags !== undefined) { sets.push("tags = ?"); vals.push(JSON.stringify(updates.tags)); }
  sets.push("updated_at = ?");
  vals.push(new Date().toISOString());
  vals.push(id);
  await run(`UPDATE memory SET ${sets.join(", ")} WHERE id = ?`, vals);
}

// ─── Token Usage Tracking ─────────────────────────────────────────────────────

export interface TokenUsageRecord {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
  model: string;
}

export async function trackTaskTokens(taskId: string, usage: TokenUsageRecord): Promise<void> {
  await run(
    "INSERT INTO token_usage (id, task_id, model, input_tokens, output_tokens, total_tokens, estimated_cost_usd, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [uuidv4(), taskId, usage.model, usage.input_tokens, usage.output_tokens, usage.total_tokens, usage.estimated_cost_usd, new Date().toISOString()]
  );
}

export async function getTaskTokenUsage(taskId: string): Promise<{ total_tokens: number; estimated_cost_usd: number; breakdown: Array<{ model: string; tokens: number; cost: number }> }> {
  const rows = await qAll<Record<string, unknown>>(
    "SELECT model, SUM(input_tokens) as inp, SUM(output_tokens) as outp, SUM(total_tokens) as total, SUM(estimated_cost_usd) as cost FROM token_usage WHERE task_id = ? GROUP BY model",
    [taskId]
  );
  const totalTokens = rows.reduce((sum, r) => sum + (r.total as number || 0), 0);
  const totalCost = rows.reduce((sum, r) => sum + (r.cost as number || 0), 0);
  return {
    total_tokens: totalTokens,
    estimated_cost_usd: totalCost,
    breakdown: rows.map((r) => ({ model: r.model as string, tokens: r.total as number, cost: r.cost as number })),
  };
}

export async function getGlobalTokenUsage(): Promise<{ total_tokens: number; estimated_cost_usd: number; by_model: Record<string, { tokens: number; cost: number }> }> {
  const rows = await qAll<Record<string, unknown>>(
    "SELECT model, SUM(total_tokens) as total, SUM(estimated_cost_usd) as cost FROM token_usage GROUP BY model"
  );
  const byModel: Record<string, { tokens: number; cost: number }> = {};
  let totalTokens = 0; let totalCost = 0;
  for (const r of rows) {
    const model = r.model as string;
    const tokens = r.total as number || 0;
    const cost = r.cost as number || 0;
    byModel[model] = { tokens, cost };
    totalTokens += tokens;
    totalCost += cost;
  }
  return { total_tokens: totalTokens, estimated_cost_usd: totalCost, by_model: byModel };
}

// ─── Scheduled Tasks ──────────────────────────────────────────────────────────

import type { ScheduledTask } from "./types";
export type { ScheduledTask };

export async function createScheduledTask(task: Omit<ScheduledTask, "created_at" | "updated_at"> & { user_id?: string }): Promise<ScheduledTask> {
  const now = new Date().toISOString();
  await run(
    `INSERT INTO scheduled_tasks (id, name, prompt, schedule_type, schedule_expr, next_run_at, last_run_at, enabled, model, delete_after_run, user_id, created_at, updated_at)
     VALUES (@id, @name, @prompt, @schedule_type, @schedule_expr, @next_run_at, @last_run_at, @enabled, @model, @delete_after_run, @user_id, @created_at, @updated_at)`,
    {
      ...task,
      enabled: task.enabled ? 1 : 0,
      delete_after_run: task.delete_after_run ? 1 : 0,
      last_run_at: task.last_run_at || null,
      schedule_expr: task.schedule_expr || null,
      user_id: (task as Record<string, unknown>).user_id || null,
      created_at: now,
      updated_at: now,
    } as InArgs
  );
  return { ...task, created_at: now, updated_at: now };
}

export async function listScheduledTasks(userId?: string): Promise<ScheduledTask[]> {
  const rows = userId
    ? await qAll<Record<string, unknown>>("SELECT * FROM scheduled_tasks WHERE user_id = ? ORDER BY next_run_at ASC", [userId])
    : await qAll<Record<string, unknown>>("SELECT * FROM scheduled_tasks ORDER BY next_run_at ASC");
  return rows.map(hydrateScheduledTask);
}

export async function getDueScheduledTasks(): Promise<ScheduledTask[]> {
  const now = new Date().toISOString();
  const rows = await qAll<Record<string, unknown>>(
    "SELECT * FROM scheduled_tasks WHERE enabled = 1 AND next_run_at <= ? ORDER BY next_run_at ASC", [now]
  );
  return rows.map(hydrateScheduledTask);
}

export async function updateScheduledTaskLastRun(id: string, nextRunAt: string | null): Promise<void> {
  const now = new Date().toISOString();
  if (nextRunAt) {
    await run("UPDATE scheduled_tasks SET last_run_at = ?, next_run_at = ?, updated_at = ? WHERE id = ?", [now, nextRunAt, now, id]);
  } else {
    await run("UPDATE scheduled_tasks SET last_run_at = ?, enabled = 0, updated_at = ? WHERE id = ?", [now, now, id]);
  }
}

export async function deleteScheduledTask(id: string): Promise<void> {
  await run("DELETE FROM scheduled_tasks WHERE id = ?", [id]);
}

export async function toggleScheduledTask(id: string, enabled: boolean): Promise<void> {
  await run("UPDATE scheduled_tasks SET enabled = ?, updated_at = ? WHERE id = ?", [enabled ? 1 : 0, new Date().toISOString(), id]);
}

// ─── Tasks by Source ──────────────────────────────────────────────────────────

export async function listTasksBySource(source?: string, limit = 50, offset = 0, userId?: string): Promise<Task[]> {
  if (source && userId) {
    const rows = await qAll<Record<string, unknown>>("SELECT * FROM tasks WHERE source = ? AND user_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?", [source, userId, limit, offset]);
    return Promise.all(rows.map((r) => hydrateTask(r)));
  }
  if (source) {
    const rows = await qAll<Record<string, unknown>>("SELECT * FROM tasks WHERE source = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?", [source, limit, offset]);
    return Promise.all(rows.map((r) => hydrateTask(r)));
  }
  return listTasks(undefined, limit, offset, userId);
}

function hydrateScheduledTask(r: Record<string, unknown>): ScheduledTask {
  return {
    id: r.id as string,
    name: r.name as string,
    prompt: r.prompt as string,
    schedule_type: r.schedule_type as ScheduledTask["schedule_type"],
    schedule_expr: r.schedule_expr as string | undefined,
    next_run_at: r.next_run_at as string,
    last_run_at: r.last_run_at as string | undefined,
    enabled: (r.enabled as number) === 1,
    model: (r.model as string) || "auto",
    delete_after_run: (r.delete_after_run as number) === 1,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

export { type TaskStatus };

// ─── Settings CRUD ────────────────────────────────────────────────────────────

export async function getSetting(key: string, userId?: string): Promise<string | null> {
  if (userId) {
    const row = await q1<{ value: string }>("SELECT value FROM settings WHERE key = ? AND user_id = ?", [key, userId]);
    if (row) return row.value;
  }
  const row = await q1<{ value: string }>("SELECT value FROM settings WHERE key = ? AND user_id IS NULL", [key]);
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string, userId?: string): Promise<void> {
  const now = new Date().toISOString();
  const id = Math.random().toString(36).slice(2);
  if (userId) {
    await run(
      "INSERT INTO settings (id, key, value, user_id, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
      [id, key, value, userId, now]
    );
  } else {
    await run(
      "INSERT INTO settings (id, key, value, user_id, updated_at) VALUES (?, ?, ?, NULL, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
      [id, key, value, now]
    );
  }
}

export async function getAllSettings(userId?: string): Promise<Record<string, string>> {
  const globalRows = await qAll<{ key: string; value: string }>("SELECT key, value FROM settings WHERE user_id IS NULL");
  const result: Record<string, string> = {};
  for (const r of globalRows) result[r.key] = r.value;
  if (userId) {
    const userRows = await qAll<{ key: string; value: string }>("SELECT key, value FROM settings WHERE user_id = ?", [userId]);
    for (const r of userRows) result[r.key] = r.value;
  }
  return result;
}

export async function getSystemHealth(userId?: string): Promise<{
  providers: Array<{ name: string; configured: boolean }>;
  search: Array<{ name: string; configured: boolean }>;
  db_ok: boolean;
  onboarding_completed: boolean;
}> {
  let userKeyNames: Set<string> = new Set();
  if (userId) {
    try {
      const rawKeys = await getUserApiKeysRaw(userId);
      userKeyNames = new Set(Object.keys(rawKeys));
    } catch { /* fall through */ }
  }

  function hasKey(envName: string): boolean {
    if (userId) return userKeyNames.has(envName);
    return !!process.env[envName];
  }

  const replicateConfig = userId ? null : await getConnectorConfig("replicate");
  const providers = [
    { name: "Anthropic (Claude)", configured: hasKey("ANTHROPIC_API_KEY") },
    { name: "OpenAI (GPT-5.4)", configured: hasKey("OPENAI_API_KEY") },
    { name: "Google (Gemini)", configured: hasKey("GOOGLE_AI_API_KEY") },
    { name: "Replicate", configured: hasKey("REPLICATE_API_TOKEN") || (userId ? userKeyNames.has("REPLICATE_API_TOKEN") : !!(replicateConfig?.api_key)) },
  ];
  const search = [
    { name: "Perplexity", configured: hasKey("PERPLEXITY_API_KEY") },
    { name: "Brave Search", configured: hasKey("BRAVE_SEARCH_API_KEY") },
    { name: "Serper", configured: hasKey("SERPER_API_KEY") },
    { name: "Tavily", configured: hasKey("TAVILY_API_KEY") },
  ];
  let db_ok = false;
  try { await q1("SELECT 1"); db_ok = true; } catch { /* */ }
  const onboarding_completed = (await getSetting("onboarding_completed")) === "true";
  return { providers, search, db_ok, onboarding_completed };
}

// ─── Task Dependencies ────────────────────────────────────────────────────────

export async function getBlockingTask(taskId: string): Promise<Task | null> {
  const row = await q1<{ depends_on?: string }>("SELECT depends_on FROM tasks WHERE id = ?", [taskId]);
  if (!row?.depends_on) return null;
  return getTask(row.depends_on);
}

// ─── Agent Learnings ──────────────────────────────────────────────────────────

export async function recordLearning(learning: {
  id: string;
  task_id: string;
  outcome: string;
  tool_name?: string;
  pattern_key: string;
  pattern_data: Record<string, unknown>;
  confidence: number;
}): Promise<void> {
  await run(
    "INSERT INTO agent_learnings (id, task_id, outcome, tool_name, pattern_key, pattern_data, confidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [learning.id, learning.task_id, learning.outcome, learning.tool_name || null, learning.pattern_key,
     JSON.stringify(learning.pattern_data), learning.confidence, new Date().toISOString()]
  );
}

export async function findSimilarLearnings(query: string, limit = 5): Promise<Array<{
  id: string; task_id: string; outcome: string; tool_name: string | null;
  pattern_key: string; pattern_data: Record<string, unknown>;
  confidence: number; created_at: string; similarity: number;
}>> {
  const rows = await qAll<Record<string, unknown>>("SELECT * FROM agent_learnings ORDER BY created_at DESC LIMIT 200");
  const queryWords = new Set(query.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  if (queryWords.size === 0) return [];

  const scored = rows.map(r => {
    const patternKey = (r.pattern_key as string).toLowerCase();
    const patternWords = new Set(patternKey.split(/\s+/).filter(w => w.length > 2));
    if (patternWords.size === 0) return null;
    const intersection = [...queryWords].filter(w => patternWords.has(w)).length;
    const union = new Set([...queryWords, ...patternWords]).size;
    const similarity = union > 0 ? intersection / union : 0;
    if (similarity < 0.25) return null;
    return {
      id: r.id as string,
      task_id: r.task_id as string,
      outcome: r.outcome as string,
      tool_name: r.tool_name as string | null,
      pattern_key: r.pattern_key as string,
      pattern_data: JSON.parse((r.pattern_data as string) || "{}"),
      confidence: r.confidence as number,
      created_at: r.created_at as string,
      similarity,
    };
  }).filter(Boolean) as Array<{
    id: string; task_id: string; outcome: string; tool_name: string | null;
    pattern_key: string; pattern_data: Record<string, unknown>;
    confidence: number; created_at: string; similarity: number;
  }>;

  return scored.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
}

export async function updateLearningConfidence(learningId: string, delta: number): Promise<void> {
  await run("UPDATE agent_learnings SET confidence = MIN(1.0, MAX(0.0, confidence + ?)) WHERE id = ?", [delta, learningId]);
}

// ─── Agent Analytics ──────────────────────────────────────────────────────────

export async function recordAnalyticsEvent(event: {
  id: string; event_type: string; tool_name?: string; model?: string;
  duration_ms?: number; success: boolean; metadata?: Record<string, unknown>;
}): Promise<void> {
  await run(
    "INSERT INTO agent_analytics (id, event_type, tool_name, model, duration_ms, success, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [event.id, event.event_type, event.tool_name || null, event.model || null,
     event.duration_ms || null, event.success ? 1 : 0, JSON.stringify(event.metadata || {}), new Date().toISOString()]
  );
}

export async function getAnalyticsSummary(): Promise<{
  total_tasks: number;
  success_rate: number;
  avg_duration_ms: number;
  top_tools: Array<{ name: string; count: number; success_rate: number }>;
  model_usage: Array<{ model: string; count: number; avg_cost: number }>;
  recent_errors: Array<{ tool: string; error: string; timestamp: string }>;
  daily_tasks: Array<{ date: string; count: number; successes: number }>;
}> {
  const taskEvents = await q1<{ total: number; successes: number }>(
    "SELECT COUNT(*) as total, SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes FROM agent_analytics WHERE event_type IN ('task_complete', 'task_error')"
  );
  const total_tasks = taskEvents?.total || 0;
  const success_rate = total_tasks > 0 ? (taskEvents?.successes || 0) / total_tasks : 0;

  const avgDur = await q1<{ avg_dur: number | null }>(
    "SELECT AVG(duration_ms) as avg_dur FROM agent_analytics WHERE duration_ms IS NOT NULL AND event_type = 'task_complete'"
  );
  const avg_duration_ms = avgDur?.avg_dur || 0;

  const toolRows = await qAll<{ tool_name: string; cnt: number; ok: number }>(
    "SELECT tool_name, COUNT(*) as cnt, SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as ok FROM agent_analytics WHERE event_type = 'tool_call' AND tool_name IS NOT NULL GROUP BY tool_name ORDER BY cnt DESC LIMIT 10"
  );
  const top_tools = toolRows.map(r => ({ name: r.tool_name, count: r.cnt, success_rate: r.cnt > 0 ? r.ok / r.cnt : 0 }));

  const modelRows = await qAll<{ model: string; cnt: number }>(
    "SELECT model, COUNT(*) as cnt FROM agent_analytics WHERE event_type = 'model_call' AND model IS NOT NULL GROUP BY model ORDER BY cnt DESC"
  );
  const model_usage = await Promise.all(modelRows.map(async r => {
    const costRow = await q1<{ avg_cost: number | null }>(
      "SELECT AVG(estimated_cost_usd) as avg_cost FROM token_usage WHERE model = ?", [r.model]
    );
    return { model: r.model, count: r.cnt, avg_cost: costRow?.avg_cost || 0 };
  }));

  const errorRows = await qAll<{ tool_name: string | null; metadata: string; created_at: string }>(
    "SELECT tool_name, metadata, created_at FROM agent_analytics WHERE success = 0 ORDER BY created_at DESC LIMIT 10"
  );
  const recent_errors = errorRows.map(r => ({
    tool: r.tool_name || "unknown",
    error: (() => { try { const m = JSON.parse(r.metadata || "{}"); return (m.error as string) || "Unknown error"; } catch { return "Unknown error"; } })(),
    timestamp: r.created_at,
  }));

  const dailyRows = await qAll<{ day: string; cnt: number; ok: number }>(
    "SELECT DATE(created_at) as day, COUNT(*) as cnt, SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as ok FROM agent_analytics WHERE event_type IN ('task_complete', 'task_error') AND created_at > datetime('now', '-30 days') GROUP BY day ORDER BY day"
  );
  const daily_tasks = dailyRows.map(r => ({ date: r.day, count: r.cnt, successes: r.ok }));

  return { total_tasks, success_rate, avg_duration_ms, top_tools, model_usage, recent_errors, daily_tasks };
}

// ─── Audit Trail ──────────────────────────────────────────────────────────────

export async function getAuditLogs(opts?: {
  limit?: number; offset?: number; event_type?: string; tool_name?: string;
  success?: boolean; task_id?: string; from_date?: string; to_date?: string; search?: string;
}): Promise<{ logs: Array<{
  id: string; event_type: string; tool_name: string | null; model: string | null;
  task_id: string | null; duration_ms: number | null; success: boolean;
  metadata: Record<string, unknown>; created_at: string;
}>; total: number }> {
  const wheres: string[] = [];
  const params: InValue[] = [];

  if (opts?.event_type) { wheres.push("event_type = ?"); params.push(opts.event_type); }
  if (opts?.tool_name) { wheres.push("tool_name = ?"); params.push(opts.tool_name); }
  if (opts?.success !== undefined) { wheres.push("success = ?"); params.push(opts.success ? 1 : 0); }
  if (opts?.from_date) { wheres.push("created_at >= ?"); params.push(opts.from_date); }
  if (opts?.to_date) { wheres.push("created_at <= ?"); params.push(opts.to_date); }
  if (opts?.search) {
    const like = `%${opts.search}%`;
    wheres.push("(tool_name LIKE ? OR model LIKE ? OR event_type LIKE ? OR metadata LIKE ?)");
    params.push(like, like, like, like);
  }

  const whereClause = wheres.length > 0 ? `WHERE ${wheres.join(" AND ")}` : "";
  const limit = opts?.limit || 50;
  const offset = opts?.offset || 0;

  const rows = await qAll<{
    id: string; event_type: string; tool_name: string | null; model: string | null;
    duration_ms: number | null; success: number; metadata: string; created_at: string;
  }>(`SELECT * FROM agent_analytics ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const countRow = await q1<{ c: number }>(
    `SELECT COUNT(*) as c FROM agent_analytics ${whereClause}`, params
  );

  return {
    logs: rows.map(r => ({
      ...r,
      success: r.success === 1,
      task_id: (() => { try { const m = JSON.parse(r.metadata || "{}"); return (m.task_id as string) || null; } catch { return null; } })(),
      metadata: (() => { try { return JSON.parse(r.metadata || "{}") as Record<string, unknown>; } catch { return {}; } })(),
    })),
    total: countRow?.c ?? 0,
  };
}

export async function getAuditToolNames(): Promise<string[]> {
  const rows = await qAll<{ tool_name: string }>(
    "SELECT DISTINCT tool_name FROM agent_analytics WHERE tool_name IS NOT NULL ORDER BY tool_name"
  );
  return rows.map(r => r.tool_name);
}

// ─── Conversation Sessions ────────────────────────────────────────────────────

export async function createSession(name: string, description?: string, persona_id?: string): Promise<string> {
  const id = uuidv4();
  const now = new Date().toISOString();
  await run(
    "INSERT INTO sessions (id, name, description, task_ids, persona_id, pinned, created_at, updated_at) VALUES (?, ?, ?, '[]', ?, 0, ?, ?)",
    [id, name, description || "", persona_id || null, now, now]
  );
  return id;
}

export async function getSessions(): Promise<Array<{
  id: string; name: string; description: string; task_ids: string[];
  persona_id: string | null; context_summary: string | null; pinned: boolean;
  created_at: string; updated_at: string;
}>> {
  const rows = await qAll<{
    id: string; name: string; description: string; task_ids: string;
    persona_id: string | null; context_summary: string | null; pinned: number;
    created_at: string; updated_at: string;
  }>("SELECT * FROM sessions ORDER BY updated_at DESC");
  return rows.map(r => ({ ...r, task_ids: JSON.parse(r.task_ids || "[]") as string[], pinned: r.pinned === 1 }));
}

export async function getSession(id: string): Promise<{
  id: string; name: string; description: string; task_ids: string[];
  persona_id: string | null; context_summary: string | null; pinned: boolean;
  created_at: string; updated_at: string;
} | null> {
  const row = await q1<{
    id: string; name: string; description: string; task_ids: string;
    persona_id: string | null; context_summary: string | null; pinned: number;
    created_at: string; updated_at: string;
  }>("SELECT * FROM sessions WHERE id = ?", [id]);
  if (!row) return null;
  return { ...row, task_ids: JSON.parse(row.task_ids || "[]") as string[], pinned: row.pinned === 1 };
}

export async function addTaskToSession(sessionId: string, taskId: string): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) return;
  const ids = session.task_ids;
  if (!ids.includes(taskId)) {
    ids.push(taskId);
    await run("UPDATE sessions SET task_ids = ?, updated_at = ? WHERE id = ?",
      [JSON.stringify(ids), new Date().toISOString(), sessionId]
    );
  }
}

export async function updateSession(id: string, updates: { name?: string; description?: string; persona_id?: string; context_summary?: string; pinned?: boolean }): Promise<void> {
  const sets: string[] = [];
  const params: InValue[] = [];
  if (updates.name !== undefined) { sets.push("name = ?"); params.push(updates.name); }
  if (updates.description !== undefined) { sets.push("description = ?"); params.push(updates.description); }
  if (updates.persona_id !== undefined) { sets.push("persona_id = ?"); params.push(updates.persona_id); }
  if (updates.context_summary !== undefined) { sets.push("context_summary = ?"); params.push(updates.context_summary); }
  if (updates.pinned !== undefined) { sets.push("pinned = ?"); params.push(updates.pinned ? 1 : 0); }
  if (sets.length === 0) return;
  sets.push("updated_at = ?");
  params.push(new Date().toISOString());
  params.push(id);
  await run(`UPDATE sessions SET ${sets.join(", ")} WHERE id = ?`, params);
}

export async function deleteSession(id: string): Promise<void> {
  await run("DELETE FROM sessions WHERE id = ?", [id]);
}

// ─── Documents ────────────────────────────────────────────────────────────────

export interface DocumentRow {
  id: string;
  title: string;
  type: "document" | "spreadsheet";
  content: string;
  created_at: string;
  updated_at: string;
}

export async function createDocument(doc: { title: string; type: "document" | "spreadsheet"; content?: string }): Promise<DocumentRow> {
  const id = uuidv4();
  const now = new Date().toISOString();
  const content = doc.content || (doc.type === "spreadsheet" ? JSON.stringify({ cells: {}, colWidths: {}, rowHeights: {} }) : "");
  await run("INSERT INTO documents (id, title, type, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    [id, doc.title, doc.type, content, now, now]
  );
  return { id, title: doc.title, type: doc.type, content, created_at: now, updated_at: now };
}

export async function getDocument(id: string): Promise<DocumentRow | null> {
  return (await q1<DocumentRow>("SELECT * FROM documents WHERE id = ?", [id])) || null;
}

export async function listDocuments(type?: "document" | "spreadsheet"): Promise<DocumentRow[]> {
  if (type) {
    return qAll<DocumentRow>("SELECT * FROM documents WHERE type = ? ORDER BY updated_at DESC", [type]);
  }
  return qAll<DocumentRow>("SELECT * FROM documents ORDER BY updated_at DESC");
}

export async function updateDocument(id: string, updates: { title?: string; content?: string }): Promise<void> {
  const now = new Date().toISOString();
  if (updates.title !== undefined) {
    await run("UPDATE documents SET title = ?, updated_at = ? WHERE id = ?", [updates.title, now, id]);
  }
  if (updates.content !== undefined) {
    await run("UPDATE documents SET content = ?, updated_at = ? WHERE id = ?", [updates.content, now, id]);
  }
}

export async function deleteDocument(id: string): Promise<void> {
  await run("DELETE FROM documents WHERE id = ?", [id]);
}

// ─── Tiers ────────────────────────────────────────────────────────────────────
export type { TierName, TierLimits } from "@/lib/tiers";
export { TIERS } from "@/lib/tiers";
import { TIERS } from "@/lib/tiers";
import type { TierName, TierLimits } from "@/lib/tiers";

export interface UserSubscription {
  id: string;
  user_id: string;
  tier: TierName;
  status: "active" | "cancelled" | "past_due";
  tasks_used_this_month: number;
  usage_reset_at: string;
  created_at: string;
  updated_at: string;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
}

export async function getUserSubscription(userId: string): Promise<UserSubscription> {
  const row = await q1<Record<string, unknown>>("SELECT * FROM subscriptions WHERE user_id = ?", [userId]);
  if (!row) {
    return createUserSubscription(userId, "free");
  }
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    tier: row.tier as TierName,
    status: row.status as UserSubscription["status"],
    tasks_used_this_month: row.tasks_used_this_month as number,
    usage_reset_at: row.usage_reset_at as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    stripe_customer_id: row.stripe_customer_id as string | undefined,
    stripe_subscription_id: row.stripe_subscription_id as string | undefined,
  };
}

export async function createUserSubscription(userId: string, tier: TierName = "free"): Promise<UserSubscription> {
  const now = new Date().toISOString();
  const resetAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const sub: UserSubscription = {
    id: uuidv4(),
    user_id: userId,
    tier,
    status: "active",
    tasks_used_this_month: 0,
    usage_reset_at: resetAt,
    created_at: now,
    updated_at: now,
  };
  await run(
    "INSERT INTO subscriptions (id, user_id, tier, status, tasks_used_this_month, usage_reset_at, created_at, updated_at) VALUES (@id, @user_id, @tier, @status, @tasks_used_this_month, @usage_reset_at, @created_at, @updated_at)",
    sub as unknown as InArgs
  );
  return sub;
}

export async function updateUserTier(userId: string, tier: TierName, stripeCustomerId?: string, stripeSubscriptionId?: string): Promise<void> {
  const now = new Date().toISOString();
  let result;
  if (stripeCustomerId || stripeSubscriptionId) {
    result = await run(
      "UPDATE subscriptions SET tier = ?, stripe_customer_id = COALESCE(?, stripe_customer_id), stripe_subscription_id = COALESCE(?, stripe_subscription_id), updated_at = ? WHERE user_id = ?",
      [tier, stripeCustomerId ?? null, stripeSubscriptionId ?? null, now, userId]
    );
  } else {
    result = await run("UPDATE subscriptions SET tier = ?, updated_at = ? WHERE user_id = ?", [tier, now, userId]);
  }
  if (result.changes === 0) await createUserSubscription(userId, tier);
}

export async function getUserByStripeCustomerId(stripeCustomerId: string): Promise<{ id: string; email: string } | null> {
  const row = await q1<{ id: string; email: string }>(
    "SELECT u.id, u.email FROM users u JOIN subscriptions s ON s.user_id = u.id WHERE s.stripe_customer_id = ?",
    [stripeCustomerId]
  );
  return row ?? null;
}

// ─── Gift Codes ───────────────────────────────────────────────────────────────

export interface GiftCode {
  id: string;
  code: string;
  tier: TierName;
  duration_days: number;
  created_by: string | null;
  redeemed_by: string | null;
  redeemed_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export async function createGiftCode(opts: {
  tier: TierName; duration_days: number; created_by: string; expires_at?: string | null;
}): Promise<GiftCode> {
  const code = "GIFT-" + Math.random().toString(36).substring(2, 10).toUpperCase();
  const id = uuidv4();
  const now = new Date().toISOString();
  await run(
    "INSERT INTO gift_codes (id, code, tier, duration_days, created_by, expires_at, created_at) VALUES (?,?,?,?,?,?,?)",
    [id, code, opts.tier, opts.duration_days, opts.created_by, opts.expires_at ?? null, now]
  );
  return (await q1<GiftCode>("SELECT * FROM gift_codes WHERE id = ?", [id]))!;
}

export async function getGiftCode(code: string): Promise<GiftCode | null> {
  return (await q1<GiftCode>("SELECT * FROM gift_codes WHERE code = ?", [code])) ?? null;
}

export async function listGiftCodes(): Promise<GiftCode[]> {
  return qAll<GiftCode>("SELECT * FROM gift_codes ORDER BY created_at DESC");
}

export async function redeemGiftCode(code: string, userId: string): Promise<{ success: boolean; error?: string; tier?: TierName }> {
  const gc = await getGiftCode(code.toUpperCase());
  if (!gc) return { success: false, error: "Invalid gift code" };
  if (gc.redeemed_by) return { success: false, error: "This code has already been redeemed" };
  if (gc.expires_at && new Date() > new Date(gc.expires_at)) return { success: false, error: "This code has expired" };

  const now = new Date().toISOString();
  await run("UPDATE gift_codes SET redeemed_by = ?, redeemed_at = ? WHERE id = ?", [userId, now, gc.id]);
  await updateUserTier(userId, gc.tier);
  return { success: true, tier: gc.tier };
}

export async function isUserAdmin(userId: string): Promise<boolean> {
  const row = await q1<{ is_admin: number; role: string }>("SELECT is_admin, role FROM users WHERE id = ?", [userId]);
  return !!(row?.is_admin || row?.role === "admin");
}

export async function incrementTaskUsage(userId: string): Promise<{ allowed: boolean; used: number; limit: number }> {
  const sub = await getUserSubscription(userId);
  const limits = TIERS[sub.tier];

  if (new Date() > new Date(sub.usage_reset_at)) {
    const resetAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await run("UPDATE subscriptions SET tasks_used_this_month = 0, usage_reset_at = ?, updated_at = ? WHERE user_id = ?",
      [resetAt, new Date().toISOString(), userId]
    );
    sub.tasks_used_this_month = 0;
  }

  if (limits.tasks_per_month !== -1 && sub.tasks_used_this_month >= limits.tasks_per_month) {
    return { allowed: false, used: sub.tasks_used_this_month, limit: limits.tasks_per_month };
  }

  await run("UPDATE subscriptions SET tasks_used_this_month = tasks_used_this_month + 1, updated_at = ? WHERE user_id = ?",
    [new Date().toISOString(), userId]
  );
  return { allowed: true, used: sub.tasks_used_this_month + 1, limit: limits.tasks_per_month };
}

export async function checkTierFeature(userId: string, feature: keyof TierLimits): Promise<boolean | number> {
  const sub = await getUserSubscription(userId);
  return TIERS[sub.tier][feature] as boolean | number;
}

// ─── User CRUD ────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: "admin" | "user";
  created_at: string;
  updated_at: string;
}

export async function createUser(data: { email: string; password_hash: string; name: string; role?: "admin" | "user" }): Promise<User> {
  const now = new Date().toISOString();
  const user: User = {
    id: uuidv4(),
    email: data.email.toLowerCase().trim(),
    password_hash: data.password_hash,
    name: data.name.trim(),
    role: data.role || "user",
    created_at: now,
    updated_at: now,
  };
  await run(
    "INSERT INTO users (id, email, password_hash, name, role, created_at, updated_at) VALUES (@id, @email, @password_hash, @name, @role, @created_at, @updated_at)",
    user as unknown as InArgs
  );
  await createUserSubscription(user.id, "free");
  return user;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  return (await q1<User>("SELECT * FROM users WHERE LOWER(email) = LOWER(?)", [email.trim()])) || null;
}

export async function getUserById(id: string): Promise<User | null> {
  return (await q1<User>("SELECT * FROM users WHERE id = ?", [id])) || null;
}

export async function getUserCount(): Promise<number> {
  const row = await q1<{ count: number }>("SELECT COUNT(*) as count FROM users");
  return row?.count ?? 0;
}

export async function updateUser(id: string, updates: { name?: string; email?: string }): Promise<void> {
  const now = new Date().toISOString();
  if (updates.name !== undefined) {
    await run("UPDATE users SET name = ?, updated_at = ? WHERE id = ?", [updates.name.trim(), now, id]);
  }
  if (updates.email !== undefined) {
    await run("UPDATE users SET email = ?, updated_at = ? WHERE id = ?", [updates.email.toLowerCase().trim(), now, id]);
  }
}

// ─── User API Keys ─────────────────────────────────────────────────────────────

export interface UserApiKey {
  id: string;
  user_id: string;
  key_name: string;
  key_value: string;
  created_at: string;
  updated_at: string;
}

export async function getUserApiKeys(userId: string): Promise<UserApiKey[]> {
  return qAll<UserApiKey>("SELECT * FROM user_api_keys WHERE user_id = ? ORDER BY key_name ASC", [userId]);
}

export async function setUserApiKey(userId: string, keyName: string, encryptedValue: string): Promise<void> {
  const now = new Date().toISOString();
  const existing = await q1("SELECT id FROM user_api_keys WHERE user_id = ? AND key_name = ?", [userId, keyName]);
  if (existing) {
    await run("UPDATE user_api_keys SET key_value = ?, updated_at = ? WHERE user_id = ? AND key_name = ?",
      [encryptedValue, now, userId, keyName]
    );
  } else {
    await run(
      "INSERT INTO user_api_keys (id, user_id, key_name, key_value, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [uuidv4(), userId, keyName, encryptedValue, now, now]
    );
  }
}

export async function deleteUserApiKey(userId: string, keyName: string): Promise<void> {
  await run("DELETE FROM user_api_keys WHERE user_id = ? AND key_name = ?", [userId, keyName]);
}

export async function getUserApiKeysRaw(userId: string): Promise<Record<string, string>> {
  const keys = await getUserApiKeys(userId);
  const result: Record<string, string> = {};
  for (const k of keys) result[k.key_name] = k.key_value;
  return result;
}

// ─── Misc ─────────────────────────────────────────────────────────────────────

export async function getSystemHealthLite(): Promise<{ db_ok: boolean }> {
  let db_ok = false;
  try { await q1("SELECT 1"); db_ok = true; } catch { /* */ }
  return { db_ok };
}

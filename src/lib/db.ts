import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import type { Task, AgentStep, TaskFile, FileFolder, Skill, GalleryItem, Message, SubTask, TaskStatus, MemoryEntry, ModelId, TaskSource, PresetType, FileSource } from "./types";

const DB_PATH = process.env.DATABASE_PATH || "./perplexity-computer.db";
const FILES_DIR = "./task-files";

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;
  
  // Ensure parent directory exists
  const dir = path.dirname(path.resolve(DB_PATH));
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  
  initSchema(_db);
  
  return _db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
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

    CREATE TABLE IF NOT EXISTS task_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      prompt TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      icon TEXT NOT NULL DEFAULT '📋',
      model TEXT NOT NULL DEFAULT 'auto',
      tags TEXT DEFAULT '[]',
      is_builtin INTEGER NOT NULL DEFAULT 0,
      use_count INTEGER NOT NULL DEFAULT 0,
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
  `);

  // Migrate: add model column to tasks if missing
  try {
    db.exec("ALTER TABLE tasks ADD COLUMN model TEXT NOT NULL DEFAULT 'auto'");
  } catch { /* column already exists */ }

  // Migrate: add source column to tasks for session isolation
  try {
    db.exec("ALTER TABLE tasks ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'");
  } catch { /* column already exists */ }

  // Migrate: add depends_on column for task dependencies
  try {
    db.exec("ALTER TABLE tasks ADD COLUMN depends_on TEXT");
  } catch { /* column already exists */ }

  // Migrate: add extended columns to skills if missing
  try { db.exec("ALTER TABLE skills ADD COLUMN preset_type TEXT DEFAULT 'custom'"); } catch { /* exists */ }
  try { db.exec("ALTER TABLE skills ADD COLUMN model TEXT DEFAULT NULL"); } catch { /* exists */ }
  try { db.exec("ALTER TABLE skills ADD COLUMN tools TEXT DEFAULT NULL"); } catch { /* exists */ }
  try { db.exec("ALTER TABLE skills ADD COLUMN max_steps INTEGER DEFAULT NULL"); } catch { /* exists */ }
  try { db.exec("ALTER TABLE skills ADD COLUMN max_tokens INTEGER DEFAULT NULL"); } catch { /* exists */ }

  // Migrate: add folder_id to task_files
  try { db.exec("ALTER TABLE task_files ADD COLUMN folder_id TEXT"); } catch { /* exists */ }

  // Migrate: add source column to task_files for tracking generation origin
  try { db.exec("ALTER TABLE task_files ADD COLUMN source TEXT DEFAULT 'unknown'"); } catch { /* exists */ }

  // Migrate: add unique constraint on (task_id, name) and deduplicate existing rows
  try {
    // Check if the unique index already exists
    const idxExists = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_task_files_unique'").get();
    if (!idxExists) {
      // Remove duplicates: keep only the latest row for each (task_id, name)
      db.exec(`
        DELETE FROM task_files WHERE id NOT IN (
          SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY task_id, name ORDER BY created_at DESC) as rn
            FROM task_files
          ) WHERE rn = 1
        )
      `);
      // Now create the unique index
      db.exec("CREATE UNIQUE INDEX idx_task_files_unique ON task_files(task_id, name)");
    }
  } catch { /* index already exists or migration already ran */ }

  // Clean orphaned file records (files in DB but deleted from disk)
  try {
    const fs = require("fs");
    const path = require("path");
    const taskFilesDir = path.join(process.cwd(), "task-files");
    const orphaned = db.prepare("SELECT id, task_id, name FROM task_files").all() as { id: string; task_id: string; name: string }[];
    const toDelete: string[] = [];
    for (const f of orphaned) {
      const filePath = path.join(taskFilesDir, f.task_id, f.name);
      if (!fs.existsSync(filePath)) toDelete.push(f.id);
    }
    if (toDelete.length > 0) {
      const del = db.prepare("DELETE FROM task_files WHERE id = ?");
      for (const id of toDelete) del.run(id);
      console.log(`[db] Cleaned ${toDelete.length} orphaned file records`);
    }
  } catch { /* best-effort cleanup */ }

  // Seed gallery items if empty
  const count = db.prepare("SELECT COUNT(*) as c FROM gallery_items").get() as { c: number };
  if (count.c === 0) {
    seedGallery(db);
  }
}

function seedGallery(db: Database.Database): void {
  const items = [
    {
      id: "g1",
      title: "S&P 500 Bubble Chart",
      description: "Interactive visualization of S&P 500 companies by market cap and sector",
      preview_url: "https://ppl-ai-code-interpreter-files.s3.amazonaws.com/web/direct-files/sites/428c2062-d69a-492b-9685-284788105ab9/sp500-bubbles/447039be-ce28-4ac0-9055-e1e3528ad89d/_preview.jpg",
      category: "Finance",
      prompt: "Build an interactive S&P 500 bubble chart showing market cap by sector",
      is_featured: 1,
    },
    {
      id: "g2",
      title: "Federal Funds Rate Timeline",
      description: "Historical timeline of Federal Reserve interest rate decisions",
      preview_url: "https://ppl-ai-code-interpreter-files.s3.amazonaws.com/web/direct-files/sites/f8479b2f-4c80-44d7-80a4-bc1ff2abc5e4/rate-timeline/19a3b250-88f9-4dd4-84a2-2fa2a6962f2d/_preview.jpg",
      category: "Finance",
      prompt: "Create a historical timeline of Federal Funds Rate changes since 1954",
      is_featured: 1,
    },
    {
      id: "g3",
      title: "DOGE Federal Workforce Impact Map",
      description: "Map showing DOGE federal workforce impact across states",
      preview_url: "https://ppl-ai-code-interpreter-files.s3.amazonaws.com/web/direct-files/sites/4eb0ef35-4a44-4f91-a931-af9ba5f9c392/doge-impact-map/3e7a1766-4b5c-4598-aed3-4de5ae31b812/_preview.jpg",
      category: "Politics",
      prompt: "Visualize the DOGE federal workforce impact across US states",
      is_featured: 1,
    },
    {
      id: "g4",
      title: "SCOTUS Analytics Dashboard",
      description: "Analytics dashboard for Supreme Court decisions and voting patterns",
      preview_url: "https://ppl-ai-code-interpreter-files.s3.amazonaws.com/web/direct-files/sites/0d1709dc-f895-4d92-97ab-ecf1db90a826/scotus-dashboard/39b6caa0-783e-4ab6-80b3-4d39b22ceeec/_preview.jpg",
      category: "Politics",
      prompt: "Build a SCOTUS analytics dashboard with voting patterns and decision analysis",
      is_featured: 1,
    },
    {
      id: "g5",
      title: "Oil Price Timeline",
      description: "Historical oil price timeline with major geopolitical events",
      preview_url: "https://ppl-ai-code-interpreter-files.s3.amazonaws.com/web/direct-files/sites/6d84e173-c5a5-4f75-af11-d3add1768e4c/oil-timeline/13469075-91f4-48a4-bf44-9437feface9b/_preview.jpg",
      category: "Finance",
      prompt: "Create an interactive oil price timeline from 1970 to present",
      is_featured: 1,
    },
    {
      id: "g6",
      title: "MegaCap 50 Intelligence",
      description: "Financial & operational intelligence for the top 50 global companies",
      preview_url: "https://ppl-ai-code-interpreter-files.s3.amazonaws.com/web/direct-files/sites/c690850f-6d6a-44c3-b4e2-3e37d7afd0f3/megacap-viz/60f9eb59-6845-4e2c-b2ed-0238068ee846/_preview.jpg",
      category: "Finance",
      prompt: "Build a MegaCap 50 financial intelligence dashboard",
      is_featured: 0,
    },
    {
      id: "g7",
      title: "Rent vs Buy Calculator",
      description: "Interactive calculator comparing renting vs buying a home",
      preview_url: "https://ppl-ai-code-interpreter-files.s3.amazonaws.com/web/direct-files/sites/fdb94ef6-f681-4a5c-8c45-11cb4064996b/rent-vs-buy/62f6de16-11be-45af-816e-e8ceac762f65/_preview.jpg",
      category: "Finance",
      prompt: "Create an interactive rent vs buy calculator with assumptions editor",
      is_featured: 0,
    },
    {
      id: "g8",
      title: "Big Mac Index Explorer",
      description: "Explore The Economist's Big Mac Index across countries",
      preview_url: "https://ppl-ai-code-interpreter-files.s3.amazonaws.com/web/direct-files/sites/025399c5-2239-443d-8e0e-a403a664a8a5/big-mac-index/9df76e9f-1c51-4cf9-8d77-055779348307/_preview.jpg",
      category: "Economics",
      prompt: "Build a Big Mac Index explorer with currency purchasing power visualization",
      is_featured: 0,
    },
    {
      id: "g9",
      title: "US Presidential Elections Map",
      description: "Interactive US Presidential election results from 1789 to 2024",
      preview_url: "https://ppl-ai-code-interpreter-files.s3.amazonaws.com/web/direct-files/sites/a3733f61-d646-4cb3-80a2-99377582e38e/election-map/c89c6bd9-e574-4a2d-93a2-7aa6cc1a3462/_preview.jpg",
      category: "Politics",
      prompt: "Create an interactive US presidential election map 1789-2024",
      is_featured: 0,
    },
    {
      id: "g10",
      title: "DRUCK Macro Terminal",
      description: "Bloomberg-style macro terminal for economic indicators",
      preview_url: "https://ppl-ai-code-interpreter-files.s3.amazonaws.com/web/direct-files/sites/7dc44ba0-dd20-4fbd-964f-637188a73801/macro-terminal/93c1e337-0506-4be6-ac0a-5c8421099a85/_preview.jpg",
      category: "Finance",
      prompt: "Build a Bloomberg-style macro economic terminal dashboard",
      is_featured: 0,
    },
    {
      id: "g11",
      title: "Tesla 5Y Stock Timeline",
      description: "5-year Tesla stock price timeline with key events annotated",
      preview_url: "https://ppl-ai-code-interpreter-files.s3.amazonaws.com/web/direct-files/sites/4c280140-49b5-44f0-a57d-6398965b8f4e/tesla-timeline/0b993f4e-7845-436a-bc27-a3d48ce44a7a/_preview.jpg",
      category: "Finance",
      prompt: "Create a 5-year Tesla stock timeline with key events annotated",
      is_featured: 0,
    },
    {
      id: "g12",
      title: "AI Data Center Global Map",
      description: "Global map of AI data centers and compute infrastructure",
      preview_url: "https://ppl-ai-code-interpreter-files.s3.amazonaws.com/web/direct-files/sites/dfe02652-f7ee-401d-96b4-cb1fdace5c0c/ai-datacenters/59bea0f9-8f52-47e5-8d26-bb3dbf536c84/_preview.jpg",
      category: "Technology",
      prompt: "Map all major AI data centers globally with capacity and ownership",
      is_featured: 0,
    },
  ];

  const insert = db.prepare(`
    INSERT OR REPLACE INTO gallery_items (id, title, description, preview_url, category, prompt, is_featured, created_at)
    VALUES (@id, @title, @description, @preview_url, @category, @prompt, @is_featured, @created_at)
  `);

  const insertMany = db.transaction(() => {
    for (const item of items) {
      insert.run({ ...item, created_at: new Date().toISOString() });
    }
  });
  insertMany();
}

// ─── Task CRUD ───────────────────────────────────────────────────────────────

export function createTask(task: Omit<Task, "steps" | "files" | "messages" | "sub_tasks"> & { depends_on?: string }): Task {
  const db = getDb();
  db.prepare(`
    INSERT INTO tasks (id, title, prompt, description, status, priority, model, tags, metadata, depends_on, source, created_at, updated_at)
    VALUES (@id, @title, @prompt, @description, @status, @priority, @model, @tags, @metadata, @depends_on, @source, @created_at, @updated_at)
  `).run({
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
    created_at: task.created_at,
    updated_at: task.updated_at,
  });
  return getTask(task.id)!;
}

export function getTask(id: string): Task | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return hydrateTask(db, row);
}

export function listTasks(status?: string, limit = 50, offset = 0): Task[] {
  const db = getDb();
  const rows = status
    ? (db.prepare("SELECT * FROM tasks WHERE status = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?").all(status, limit, offset) as Record<string, unknown>[])
    : (db.prepare("SELECT * FROM tasks ORDER BY updated_at DESC LIMIT ? OFFSET ?").all(limit, offset) as Record<string, unknown>[]);
  return rows.map((r) => hydrateTask(db, r));
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

export function listTasksSummary(limit = 100): TaskSummary[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT t.id, t.title, t.status, t.priority, t.updated_at,
      (SELECT COUNT(*) FROM agent_steps WHERE task_id = t.id) AS steps_count,
      (SELECT COUNT(*) FROM task_files WHERE task_id = t.id) AS files_count
    FROM tasks t ORDER BY t.updated_at DESC LIMIT ?
  `).all(limit) as TaskSummary[];
  return rows;
}

export function updateTaskStatus(id: string, status: string, completedAt?: string): void {
  const db = getDb();
  db.prepare("UPDATE tasks SET status = ?, updated_at = ?, completed_at = ? WHERE id = ?").run(
    status,
    new Date().toISOString(),
    completedAt || null,
    id
  );
}

export function updateTaskTitle(id: string, title: string): void {
  const db = getDb();
  db.prepare("UPDATE tasks SET title = ?, updated_at = ? WHERE id = ?").run(title, new Date().toISOString(), id);
}

export function updateTaskMetadata(id: string, metadata: Record<string, unknown>): void {
  const db = getDb();
  db.prepare("UPDATE tasks SET metadata = ?, updated_at = ? WHERE id = ?").run(
    JSON.stringify(metadata), new Date().toISOString(), id
  );
}

export function deleteTask(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
}

function hydrateTask(db: Database.Database, row: Record<string, unknown>): Task {
  const steps = db
    .prepare("SELECT * FROM agent_steps WHERE task_id = ? ORDER BY created_at ASC")
    .all(row.id) as Record<string, unknown>[];
  const files = db
    .prepare("SELECT * FROM task_files WHERE task_id = ? ORDER BY created_at ASC")
    .all(row.id) as Record<string, unknown>[];
  const messages = db
    .prepare("SELECT * FROM messages WHERE task_id = ? ORDER BY created_at ASC")
    .all(row.id) as Record<string, unknown>[];
  const subTasks = db
    .prepare("SELECT * FROM sub_tasks WHERE parent_task_id = ? ORDER BY created_at ASC")
    .all(row.id) as Record<string, unknown>[];

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

// ─── Agent Step CRUD ─────────────────────────────────────────────────────────

export function addAgentStep(step: Omit<AgentStep, "duration_ms">): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO agent_steps (id, task_id, type, title, content, tool_name, tool_input, tool_result, status, created_at)
    VALUES (@id, @task_id, @type, @title, @content, @tool_name, @tool_input, @tool_result, @status, @created_at)
  `).run({
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
  });
}

export function updateAgentStep(id: string, updates: Partial<AgentStep>): void {
  const db = getDb();
  if (updates.tool_result !== undefined) {
    db.prepare("UPDATE agent_steps SET tool_result = ?, status = ?, duration_ms = ? WHERE id = ?").run(
      updates.tool_result,
      updates.status || "completed",
      updates.duration_ms || null,
      id
    );
  } else if (updates.content !== undefined) {
    db.prepare("UPDATE agent_steps SET content = ?, status = ? WHERE id = ?").run(
      updates.content,
      updates.status || "running",
      id
    );
  } else if (updates.status !== undefined) {
    db.prepare("UPDATE agent_steps SET status = ? WHERE id = ?").run(updates.status, id);
  }
  // Update title if provided (separate from the above to avoid conflicts)
  if (updates.title !== undefined) {
    db.prepare("UPDATE agent_steps SET title = ? WHERE id = ?").run(updates.title, id);
  }
}

// ─── Message CRUD ─────────────────────────────────────────────────────────────

export function addMessage(message: Message): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO messages (id, task_id, role, content, created_at)
    VALUES (@id, @task_id, @role, @content, @created_at)
  `).run(message);
}

// ─── File CRUD ────────────────────────────────────────────────────────────────

export function addTaskFile(file: TaskFile): void {
  const db = getDb();
  // Upsert: if a file with the same task_id + name already exists, update it
  // This prevents duplicate rows when execute_code re-scans or write_file is called twice
  db.prepare(`
    INSERT INTO task_files (id, task_id, name, path, size, mime_type, preview_url, folder_id, source, created_at)
    VALUES (@id, @task_id, @name, @path, @size, @mime_type, @preview_url, @folder_id, @source, @created_at)
    ON CONFLICT(task_id, name) DO UPDATE SET
      path = excluded.path,
      size = excluded.size,
      mime_type = excluded.mime_type,
      preview_url = COALESCE(excluded.preview_url, task_files.preview_url),
      source = COALESCE(excluded.source, task_files.source),
      created_at = excluded.created_at
  `).run({
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
  });

  // Auto-add every file to memory so Ottomate can access/recall it
  try {
    const src = file.source || "unknown";
    const mediaType = (file.mime_type || "application/octet-stream").split("/")[0];
    const now = new Date().toISOString();
    const memKey = `file:${file.task_id}/${file.name}`;
    const memValue = `File "${file.name}" (${file.mime_type}, ${file.size} bytes) from ${src}. Path: /api/files/${file.task_id}/${file.name}`;
    const existing = db.prepare("SELECT id FROM memory WHERE key = ?").get(memKey);
    if (existing) {
      db.prepare("UPDATE memory SET value=?, source_task_id=?, tags=?, updated_at=? WHERE key=?").run(
        memValue, file.task_id, JSON.stringify(["file", src, mediaType]), now, memKey
      );
    } else {
      db.prepare(`
        INSERT INTO memory (id, key, value, source_task_id, tags, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(file.id + "-mem", memKey, memValue, file.task_id, JSON.stringify(["file", src, mediaType]), now, now);
    }
  } catch { /* memory is best-effort, never block file creation */ }
}

export function listAllFiles(limit = 500): (TaskFile & { task_title?: string })[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT tf.*, t.title as task_title 
    FROM task_files tf 
    LEFT JOIN tasks t ON tf.task_id = t.id 
    ORDER BY tf.created_at DESC LIMIT ?
  `).all(limit) as Record<string, unknown>[];
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

export function getFilesStats(): { total: number; bySource: Record<string, number>; byType: Record<string, number>; totalSize: number } {
  const db = getDb();
  const total = (db.prepare("SELECT COUNT(*) as c FROM task_files").get() as { c: number }).c;
  const totalSize = (db.prepare("SELECT COALESCE(SUM(size), 0) as s FROM task_files").get() as { s: number }).s;
  
  const sourceRows = db.prepare("SELECT COALESCE(source, 'unknown') as src, COUNT(*) as c FROM task_files GROUP BY src").all() as Array<{ src: string; c: number }>;
  const bySource: Record<string, number> = {};
  for (const r of sourceRows) bySource[r.src] = r.c;
  
  const typeRows = db.prepare(`
    SELECT CASE 
      WHEN mime_type LIKE 'image/%' THEN 'images'
      WHEN mime_type LIKE 'video/%' THEN 'video'
      WHEN mime_type LIKE 'audio/%' THEN 'audio'
      WHEN mime_type LIKE 'text/%' THEN 'text'
      ELSE 'other'
    END as type_group, COUNT(*) as c FROM task_files GROUP BY type_group
  `).all() as Array<{ type_group: string; c: number }>;
  const byType: Record<string, number> = {};
  for (const r of typeRows) byType[r.type_group] = r.c;
  
  return { total, bySource, byType, totalSize };
}

export function getRecentMemoryForFiles(limit = 10): MemoryEntry[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM memory WHERE key LIKE 'file:%' ORDER BY updated_at DESC LIMIT ?"
  ).all(limit) as Array<Record<string, unknown>>;
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

export function updateFileFolder(fileId: string, folderId: string | null): void {
  const db = getDb();
  db.prepare("UPDATE task_files SET folder_id = ? WHERE id = ?").run(folderId, fileId);
}

// ─── Folder CRUD ──────────────────────────────────────────────────────────────

export function createFolder(folder: FileFolder): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO file_folders (id, name, parent_id, color, created_at, updated_at)
    VALUES (@id, @name, @parent_id, @color, @created_at, @updated_at)
  `).run({
    id: folder.id,
    name: folder.name,
    parent_id: folder.parent_id ?? null,
    color: folder.color ?? "#5e9cf0",
    created_at: folder.created_at,
    updated_at: folder.updated_at,
  });
}

export function listFolders(): FileFolder[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM file_folders ORDER BY name ASC").all() as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    parent_id: r.parent_id as string | undefined,
    color: r.color as string | undefined,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  }));
}

export function renameFolder(id: string, name: string): void {
  const db = getDb();
  db.prepare("UPDATE file_folders SET name = ?, updated_at = ? WHERE id = ?").run(name, new Date().toISOString(), id);
}

export function deleteFolder(id: string): void {
  const db = getDb();
  // un-assign files in this folder
  db.prepare("UPDATE task_files SET folder_id = NULL WHERE folder_id = ?").run(id);
  // re-parent child folders to parent of deleted folder
  const folder = db.prepare("SELECT parent_id FROM file_folders WHERE id = ?").get(id) as { parent_id: string | null } | undefined;
  const newParent = folder?.parent_id ?? null;
  db.prepare("UPDATE file_folders SET parent_id = ? WHERE parent_id = ?").run(newParent, id);
  db.prepare("DELETE FROM file_folders WHERE id = ?").run(id);
}

// ─── Sub-task CRUD ─────────────────────────────────────────────────────────────

export function addSubTask(subTask: SubTask): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO sub_tasks (id, parent_task_id, title, status, agent_type, result, created_at)
    VALUES (@id, @parent_task_id, @title, @status, @agent_type, @result, @created_at)
  `).run({
    id: subTask.id,
    parent_task_id: subTask.parent_task_id,
    title: subTask.title,
    status: subTask.status,
    agent_type: subTask.agent_type,
    result: subTask.result ?? null,
    created_at: subTask.created_at,
  });
}

export function updateSubTask(id: string, status: string, result?: string): void {
  const db = getDb();
  db.prepare("UPDATE sub_tasks SET status = ?, result = ? WHERE id = ?").run(status, result || null, id);
}

// ─── Skills CRUD ──────────────────────────────────────────────────────────────

export function listSkills(): Skill[] {
  const db = getDb();
  return (db.prepare("SELECT * FROM skills ORDER BY created_at DESC").all() as Record<string, unknown>[]).map((r) => ({
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
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  }));
}

export function createSkill(skill: Omit<Skill, "created_at" | "updated_at">): Skill {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO skills (id, name, description, instructions, category, triggers, is_active,
      preset_type, model, tools, max_steps, max_tokens, created_at, updated_at)
    VALUES (@id, @name, @description, @instructions, @category, @triggers, @is_active,
      @preset_type, @model, @tools, @max_steps, @max_tokens, @created_at, @updated_at)
  `).run({
    ...skill,
    category: skill.category || "custom",
    triggers: JSON.stringify(skill.triggers || []),
    is_active: skill.is_active ? 1 : 0,
    preset_type: skill.preset_type || "custom",
    model: skill.model || null,
    tools: skill.tools ? JSON.stringify(skill.tools) : null,
    max_steps: skill.max_steps || null,
    max_tokens: skill.max_tokens || null,
    created_at: now,
    updated_at: now,
  });
  return { ...skill, created_at: now, updated_at: now };
}

export function updateSkill(id: string, updates: Partial<Skill>): void {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM skills WHERE id=?").get(id) as Record<string, unknown> | undefined;
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
  db.prepare(`UPDATE skills SET name=?, description=?, instructions=?, category=?, is_active=?, triggers=?,
    preset_type=?, model=?, tools=?, max_steps=?, max_tokens=?, updated_at=? WHERE id=?`).run(
    merged.name, merged.description, merged.instructions, merged.category, merged.is_active, merged.triggers,
    merged.preset_type, merged.model, merged.tools, merged.max_steps, merged.max_tokens,
    new Date().toISOString(), id
  );
}

export function deleteSkill(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM skills WHERE id = ?").run(id);
}

// ─── Gallery CRUD ─────────────────────────────────────────────────────────────

export function listGallery(): GalleryItem[] {
  const db = getDb();
  return (db.prepare("SELECT * FROM gallery_items ORDER BY is_featured DESC, created_at DESC").all() as Record<string, unknown>[]).map((r) => ({
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

export function addGalleryItem(item: GalleryItem): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO gallery_items (id, title, description, preview_url, category, prompt, task_id, is_featured, created_at)
    VALUES (@id, @title, @description, @preview_url, @category, @prompt, @task_id, @is_featured, @created_at)
  `).run({
    id: item.id,
    title: item.title,
    description: item.description,
    preview_url: item.preview_url ?? null,
    category: item.category,
    prompt: item.prompt,
    task_id: item.task_id ?? null,
    is_featured: item.is_featured ? 1 : 0,
    created_at: item.created_at,
  });
}

// ─── Connector Config ─────────────────────────────────────────────────────────

export function getConnectorConfig(connectorId: string): Record<string, unknown> | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM connector_configs WHERE connector_id = ?").get(connectorId) as Record<string, unknown> | undefined;
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

export function setConnectorConfig(connectorId: string, config: Record<string, unknown>): void {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM connector_configs WHERE connector_id = ?").get(connectorId);
  if (existing) {
    db.prepare("UPDATE connector_configs SET api_key=?, config=?, connected=?, connected_at=? WHERE connector_id=?").run(
      config.api_key as string || null,
      JSON.stringify(config),
      config.connected ? 1 : 0,
      config.connected ? new Date().toISOString() : null,
      connectorId
    );
  } else {
    db.prepare(`
      INSERT INTO connector_configs (id, connector_id, api_key, config, connected, connected_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(),
      connectorId,
      config.api_key as string || null,
      JSON.stringify(config),
      config.connected ? 1 : 0,
      config.connected ? new Date().toISOString() : null
    );
  }
}

export function storeOAuthTokens(
  connectorId: string,
  tokens: { access_token: string; refresh_token?: string; expires_in?: number }
): void {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM connector_configs WHERE connector_id = ?").get(connectorId);
  if (existing) {
    db.prepare(
      "UPDATE connector_configs SET oauth_token=?, oauth_refresh_token=?, connected=1, connected_at=? WHERE connector_id=?"
    ).run(tokens.access_token, tokens.refresh_token ?? null, new Date().toISOString(), connectorId);
  } else {
    db.prepare(
      "INSERT INTO connector_configs (id, connector_id, oauth_token, oauth_refresh_token, connected, connected_at, config, api_key) VALUES (?, ?, ?, ?, 1, ?, ?, NULL)"
    ).run(uuidv4(), connectorId, tokens.access_token, tokens.refresh_token ?? null, new Date().toISOString(), "{}");
  }
}

export function disconnectConnector(connectorId: string): void {
  const db = getDb();
  db.prepare("UPDATE connector_configs SET connected = 0, api_key = NULL, oauth_token = NULL WHERE connector_id = ?").run(connectorId);
}

export function listConnectorConfigs(): Array<{ connector_id: string; connected: boolean; connected_at?: string }> {
  const db = getDb();
  const rows = db.prepare("SELECT connector_id, connected, connected_at FROM connector_configs WHERE connected = 1").all() as Array<{ connector_id: string; connected: number; connected_at?: string }>;
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

export function memoryStore(entry: MemoryEntry): void {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM memory WHERE key = ?").get(entry.key);
  if (existing) {
    db.prepare("UPDATE memory SET value=?, source_task_id=?, tags=?, updated_at=? WHERE key=?").run(
      entry.value,
      entry.source_task_id || null,
      JSON.stringify(entry.tags || []),
      new Date().toISOString(),
      entry.key
    );
  } else {
    db.prepare(`
      INSERT INTO memory (id, key, value, source_task_id, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.id,
      entry.key,
      entry.value,
      entry.source_task_id || null,
      JSON.stringify(entry.tags || []),
      entry.created_at,
      entry.updated_at
    );
  }
}

export function memoryRecall(query: string, limit = 5): MemoryEntry[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM memory ORDER BY updated_at DESC LIMIT 200").all() as Array<Record<string, unknown>>;
  
  // Enhanced keyword search with TF-IDF-inspired scoring (OpenClaw-inspired)
  const queryTokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  
  // Calculate document frequencies for IDF weighting
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
      const idf = Math.log(rows.length / df + 1); // IDF weighting
      
      // Key matches are worth more than value matches
      if (keyText.includes(tok)) score += 3 * idf;
      if (valText.includes(tok)) score += 1 * idf;
      if (tagText.includes(tok)) score += 2 * idf;
      
      // Exact key match bonus
      if (keyText === tok || keyText.includes(query.toLowerCase())) score += 5;
    }
    
    // Recency bonus (temporal decay, OpenClaw-inspired)
    const ageMs = Date.now() - new Date(r.updated_at as string).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    const recencyBoost = Math.max(0.5, 1 - ageDays / 365); // Decay over 1 year
    score *= recencyBoost;
    
    // N-gram matching for partial phrase matches
    const queryLower = query.toLowerCase();
    if (fullText.includes(queryLower)) score += 4; // Exact phrase match
    
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

export function listMemory(limit = 50): MemoryEntry[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM memory ORDER BY updated_at DESC LIMIT ?").all(limit) as Array<Record<string, unknown>>;
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

export function deleteMemory(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM memory WHERE id = ?").run(id);
}

// ─── Token Usage Tracking (OpenClaw-inspired) ─────────────────────────────────

export interface TokenUsageRecord {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
  model: string;
}

export function trackTaskTokens(taskId: string, usage: TokenUsageRecord): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO token_usage (id, task_id, model, input_tokens, output_tokens, total_tokens, estimated_cost_usd, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), taskId, usage.model, usage.input_tokens, usage.output_tokens, usage.total_tokens, usage.estimated_cost_usd, new Date().toISOString());
}

export function getTaskTokenUsage(taskId: string): { total_tokens: number; estimated_cost_usd: number; breakdown: Array<{ model: string; tokens: number; cost: number }> } {
  const db = getDb();
  const rows = db.prepare("SELECT model, SUM(input_tokens) as inp, SUM(output_tokens) as outp, SUM(total_tokens) as total, SUM(estimated_cost_usd) as cost FROM token_usage WHERE task_id = ? GROUP BY model").all(taskId) as Array<Record<string, unknown>>;
  const totalTokens = rows.reduce((sum, r) => sum + (r.total as number || 0), 0);
  const totalCost = rows.reduce((sum, r) => sum + (r.cost as number || 0), 0);
  return {
    total_tokens: totalTokens,
    estimated_cost_usd: totalCost,
    breakdown: rows.map((r) => ({ model: r.model as string, tokens: r.total as number, cost: r.cost as number })),
  };
}

export function getGlobalTokenUsage(): { total_tokens: number; estimated_cost_usd: number; by_model: Record<string, { tokens: number; cost: number }> } {
  const db = getDb();
  const rows = db.prepare("SELECT model, SUM(total_tokens) as total, SUM(estimated_cost_usd) as cost FROM token_usage GROUP BY model").all() as Array<Record<string, unknown>>;
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

// ─── Scheduled Tasks (OpenClaw Cron-inspired) ─────────────────────────────────

import type { ScheduledTask, TaskTemplate } from "./types";
export type { ScheduledTask, TaskTemplate };

export function createScheduledTask(task: Omit<ScheduledTask, "created_at" | "updated_at">): ScheduledTask {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO scheduled_tasks (id, name, prompt, schedule_type, schedule_expr, next_run_at, last_run_at, enabled, model, delete_after_run, created_at, updated_at)
    VALUES (@id, @name, @prompt, @schedule_type, @schedule_expr, @next_run_at, @last_run_at, @enabled, @model, @delete_after_run, @created_at, @updated_at)
  `).run({
    ...task,
    enabled: task.enabled ? 1 : 0,
    delete_after_run: task.delete_after_run ? 1 : 0,
    last_run_at: task.last_run_at || null,
    schedule_expr: task.schedule_expr || null,
    created_at: now,
    updated_at: now,
  });
  return { ...task, created_at: now, updated_at: now };
}

export function listScheduledTasks(): ScheduledTask[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM scheduled_tasks ORDER BY next_run_at ASC").all() as Array<Record<string, unknown>>;
  return rows.map(hydrateScheduledTask);
}

export function getDueScheduledTasks(): ScheduledTask[] {
  const db = getDb();
  const now = new Date().toISOString();
  const rows = db.prepare("SELECT * FROM scheduled_tasks WHERE enabled = 1 AND next_run_at <= ? ORDER BY next_run_at ASC").all(now) as Array<Record<string, unknown>>;
  return rows.map(hydrateScheduledTask);
}

export function updateScheduledTaskLastRun(id: string, nextRunAt: string | null): void {
  const db = getDb();
  const now = new Date().toISOString();
  if (nextRunAt) {
    db.prepare("UPDATE scheduled_tasks SET last_run_at = ?, next_run_at = ?, updated_at = ? WHERE id = ?").run(now, nextRunAt, now, id);
  } else {
    // One-shot: disable after run
    db.prepare("UPDATE scheduled_tasks SET last_run_at = ?, enabled = 0, updated_at = ? WHERE id = ?").run(now, now, id);
  }
}

export function deleteScheduledTask(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM scheduled_tasks WHERE id = ?").run(id);
}

export function toggleScheduledTask(id: string, enabled: boolean): void {
  const db = getDb();
  db.prepare("UPDATE scheduled_tasks SET enabled = ?, updated_at = ? WHERE id = ?").run(enabled ? 1 : 0, new Date().toISOString(), id);
}

// ─── Task Templates (OpenClaw/Community-inspired) ─────────────────────────────

function hydrateTemplate(row: Record<string, unknown>): TaskTemplate {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) || "",
    prompt: row.prompt as string,
    category: (row.category as string) || "general",
    icon: (row.icon as string) || "📋",
    model: (row.model as string) || "auto",
    tags: JSON.parse((row.tags as string) || "[]"),
    is_builtin: !!(row.is_builtin as number),
    use_count: (row.use_count as number) || 0,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export function listTemplates(): TaskTemplate[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM task_templates ORDER BY use_count DESC, name ASC").all() as Array<Record<string, unknown>>;
  // Seed built-in templates on first access if table is empty
  if (rows.length === 0) {
    seedTemplates(db);
    return (db.prepare("SELECT * FROM task_templates ORDER BY use_count DESC, name ASC").all() as Array<Record<string, unknown>>).map(hydrateTemplate);
  }
  return rows.map(hydrateTemplate);
}

export function getTemplate(id: string): TaskTemplate | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM task_templates WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? hydrateTemplate(row) : null;
}

export function createTemplate(t: Omit<TaskTemplate, "is_builtin" | "use_count" | "created_at" | "updated_at">): TaskTemplate {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO task_templates (id, name, description, prompt, category, icon, model, tags, is_builtin, use_count, created_at, updated_at)
    VALUES (@id, @name, @description, @prompt, @category, @icon, @model, @tags, 0, 0, @created_at, @updated_at)
  `).run({ ...t, tags: JSON.stringify(t.tags || []), created_at: now, updated_at: now });
  return getTemplate(t.id)!;
}

export function deleteTemplate(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM task_templates WHERE id = ? AND is_builtin = 0").run(id);
}

export function incrementTemplateUseCount(id: string): void {
  const db = getDb();
  db.prepare("UPDATE task_templates SET use_count = use_count + 1, updated_at = ? WHERE id = ?").run(new Date().toISOString(), id);
}

function seedTemplates(db: Database.Database): void {
  const templates = [
    {
      id: "tpl-research",
      name: "Deep Research Report",
      description: "Research a topic thoroughly using web search, then produce a well-structured report with citations.",
      prompt: "Research the following topic in depth. Search the web for the latest information, cross-reference multiple sources, and produce a comprehensive report with sections, key findings, and source citations.\n\nTopic: ",
      category: "research",
      icon: "🔬",
      model: "auto",
      tags: ["research", "report", "web-search"],
    },
    {
      id: "tpl-code-review",
      name: "Code Review & Refactor",
      description: "Analyze code for quality, performance, security, and best practices. Suggest improvements.",
      prompt: "Perform a thorough code review on the following code. Check for:\n- Bugs and edge cases\n- Performance issues\n- Security vulnerabilities\n- Best practices and naming conventions\n- Opportunities for refactoring\n\nProvide specific, actionable feedback with code examples.\n\nCode to review:\n",
      category: "development",
      icon: "🔍",
      model: "auto",
      tags: ["code", "review", "quality"],
    },
    {
      id: "tpl-data-analysis",
      name: "Data Analysis & Visualization",
      description: "Analyze a dataset, compute statistics, and generate visualizations with Python.",
      prompt: "Analyze the following data. Compute descriptive statistics, identify patterns and outliers, and generate clear visualizations (charts/graphs) using Python matplotlib or seaborn. Save the charts as image files.\n\nData description: ",
      category: "data",
      icon: "📊",
      model: "auto",
      tags: ["data", "analysis", "visualization", "python"],
    },
    {
      id: "tpl-email-draft",
      name: "Professional Email Draft",
      description: "Draft a professional email with the right tone, structure, and clarity.",
      prompt: "Draft a professional email based on the following details. Use appropriate tone, clear structure, and concise language. Include a subject line suggestion.\n\nDetails: ",
      category: "writing",
      icon: "✉️",
      model: "auto",
      tags: ["email", "writing", "professional"],
    },
    {
      id: "tpl-competitive",
      name: "Competitive Analysis",
      description: "Research competitors, compare features, pricing, and market positioning.",
      prompt: "Conduct a competitive analysis. Search the web for the latest information on each competitor. Compare:\n- Features and capabilities\n- Pricing and plans\n- Market positioning and target audience\n- Strengths and weaknesses\n- Recent news and developments\n\nPresent findings in a structured comparison with a recommendation.\n\nCompany/Product to analyze: ",
      category: "research",
      icon: "⚔️",
      model: "auto",
      tags: ["competitive", "analysis", "market-research"],
    },
    {
      id: "tpl-summarize",
      name: "Summarize URL / Article",
      description: "Fetch a web page and produce a concise summary with key takeaways.",
      prompt: "Fetch the following URL, read the content, and produce:\n1. A one-paragraph summary\n2. 5-7 key takeaways as bullet points\n3. Any actionable insights\n\nURL: ",
      category: "research",
      icon: "📝",
      model: "auto",
      tags: ["summary", "url", "web"],
    },
    {
      id: "tpl-script",
      name: "Write & Run Script",
      description: "Write a Python/JS/Bash script for a specific task, execute it, and return results.",
      prompt: "Write a script to accomplish the following task. Execute the script and return the results. If any errors occur, debug and fix them.\n\nTask: ",
      category: "development",
      icon: "🖥️",
      model: "auto",
      tags: ["code", "script", "automation"],
    },
    {
      id: "tpl-meeting-notes",
      name: "Meeting Notes → Action Items",
      description: "Transform meeting notes into structured action items with owners and deadlines.",
      prompt: "Transform these meeting notes into:\n1. A brief meeting summary (2-3 sentences)\n2. Key decisions made\n3. Action items table (Task | Owner | Deadline | Priority)\n4. Open questions / follow-ups\n\nMeeting notes:\n",
      category: "productivity",
      icon: "📋",
      model: "auto",
      tags: ["meeting", "action-items", "productivity"],
    },
  ];

  const insert = db.prepare(`
    INSERT OR REPLACE INTO task_templates (id, name, description, prompt, category, icon, model, tags, is_builtin, use_count, created_at, updated_at)
    VALUES (@id, @name, @description, @prompt, @category, @icon, @model, @tags, 1, 0, @created_at, @updated_at)
  `);
  const now = new Date().toISOString();
  const insertMany = db.transaction(() => {
    for (const t of templates) {
      insert.run({ ...t, tags: JSON.stringify(t.tags), created_at: now, updated_at: now });
    }
  });
  insertMany();
}

// ─── Tasks by Source (Session Isolation) ──────────────────────────────────────

export function listTasksBySource(source?: string, limit = 50, offset = 0): Task[] {
  const db = getDb();
  if (source) {
    const rows = db.prepare("SELECT * FROM tasks WHERE source = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?").all(source, limit, offset) as Record<string, unknown>[];
    return rows.map((r) => hydrateTask(db, r));
  }
  return listTasks(undefined, limit, offset);
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

export function getSetting(key: string): string | null {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
  ).run(key, value, new Date().toISOString());
}

export function getAllSettings(): Record<string, string> {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM settings").all() as Array<{ key: string; value: string }>;
  const result: Record<string, string> = {};
  for (const r of rows) result[r.key] = r.value;
  return result;
}

export function getSystemHealth(): {
  providers: Array<{ name: string; configured: boolean }>;
  search: Array<{ name: string; configured: boolean }>;
  db_ok: boolean;
  onboarding_completed: boolean;
} {
  const providers = [
    { name: "Anthropic (Claude)", configured: !!process.env.ANTHROPIC_API_KEY },
    { name: "OpenAI (GPT-4o)", configured: !!process.env.OPENAI_API_KEY },
    { name: "Google (Gemini)", configured: !!process.env.GOOGLE_AI_API_KEY },
    { name: "Replicate", configured: !!process.env.REPLICATE_API_TOKEN || !!getConnectorConfig("replicate")?.api_key },
  ];
  const search = [
    { name: "Perplexity", configured: !!process.env.PERPLEXITY_API_KEY },
    { name: "Brave Search", configured: !!process.env.BRAVE_SEARCH_API_KEY },
    { name: "Serper", configured: !!process.env.SERPER_API_KEY },
    { name: "Tavily", configured: !!process.env.TAVILY_API_KEY },
  ];
  let db_ok = false;
  try { getDb().prepare("SELECT 1").get(); db_ok = true; } catch { /* */ }
  const onboarding_completed = getSetting("onboarding_completed") === "true";
  return { providers, search, db_ok, onboarding_completed };
}

// ─── Task Dependencies ───────────────────────────────────────────────────────

export function getBlockingTask(taskId: string): Task | null {
  const db = getDb();
  const row = db.prepare("SELECT depends_on FROM tasks WHERE id = ?").get(taskId) as { depends_on?: string } | undefined;
  if (!row?.depends_on) return null;
  return getTask(row.depends_on);
}

// ─── Agent Learnings CRUD (Otto Self-Improvement) ─────────────────────────────

export function recordLearning(learning: {
  id: string;
  task_id: string;
  outcome: string;
  tool_name?: string;
  pattern_key: string;
  pattern_data: Record<string, unknown>;
  confidence: number;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO agent_learnings (id, task_id, outcome, tool_name, pattern_key, pattern_data, confidence, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    learning.id,
    learning.task_id,
    learning.outcome,
    learning.tool_name || null,
    learning.pattern_key,
    JSON.stringify(learning.pattern_data),
    learning.confidence,
    new Date().toISOString()
  );
}

/** Find learnings with similar pattern keys using word-overlap scoring */
export function findSimilarLearnings(query: string, limit = 5): Array<{
  id: string;
  task_id: string;
  outcome: string;
  tool_name: string | null;
  pattern_key: string;
  pattern_data: Record<string, unknown>;
  confidence: number;
  created_at: string;
  similarity: number;
}> {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM agent_learnings ORDER BY created_at DESC LIMIT 200"
  ).all() as Array<Record<string, unknown>>;

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

/** Update confidence of an existing learning (±delta) */
export function updateLearningConfidence(learningId: string, delta: number): void {
  const db = getDb();
  db.prepare(
    "UPDATE agent_learnings SET confidence = MIN(1.0, MAX(0.0, confidence + ?)) WHERE id = ?"
  ).run(delta, learningId);
}

// ─── Agent Analytics CRUD (Otto-inspired Dashboard) ───────────────────────────

export function recordAnalyticsEvent(event: {
  id: string;
  event_type: string;
  tool_name?: string;
  model?: string;
  duration_ms?: number;
  success: boolean;
  metadata?: Record<string, unknown>;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO agent_analytics (id, event_type, tool_name, model, duration_ms, success, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.id,
    event.event_type,
    event.tool_name || null,
    event.model || null,
    event.duration_ms || null,
    event.success ? 1 : 0,
    JSON.stringify(event.metadata || {}),
    new Date().toISOString()
  );
}

export function getAnalyticsSummary(): {
  total_tasks: number;
  success_rate: number;
  avg_duration_ms: number;
  top_tools: Array<{ name: string; count: number; success_rate: number }>;
  model_usage: Array<{ model: string; count: number; avg_cost: number }>;
  recent_errors: Array<{ tool: string; error: string; timestamp: string }>;
  daily_tasks: Array<{ date: string; count: number; successes: number }>;
} {
  const db = getDb();

  // Total tasks completed/failed
  const taskEvents = db.prepare(
    "SELECT COUNT(*) as total, SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes FROM agent_analytics WHERE event_type IN ('task_complete', 'task_error')"
  ).get() as { total: number; successes: number } | undefined;
  const total_tasks = taskEvents?.total || 0;
  const success_rate = total_tasks > 0 ? (taskEvents?.successes || 0) / total_tasks : 0;

  // Average duration
  const avgDur = db.prepare(
    "SELECT AVG(duration_ms) as avg_dur FROM agent_analytics WHERE duration_ms IS NOT NULL AND event_type = 'task_complete'"
  ).get() as { avg_dur: number | null } | undefined;
  const avg_duration_ms = avgDur?.avg_dur || 0;

  // Top tools
  const toolRows = db.prepare(
    "SELECT tool_name, COUNT(*) as cnt, SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as ok FROM agent_analytics WHERE event_type = 'tool_call' AND tool_name IS NOT NULL GROUP BY tool_name ORDER BY cnt DESC LIMIT 10"
  ).all() as Array<{ tool_name: string; cnt: number; ok: number }>;
  const top_tools = toolRows.map(r => ({
    name: r.tool_name,
    count: r.cnt,
    success_rate: r.cnt > 0 ? r.ok / r.cnt : 0,
  }));

  // Model usage
  const modelRows = db.prepare(
    "SELECT model, COUNT(*) as cnt FROM agent_analytics WHERE event_type = 'model_call' AND model IS NOT NULL GROUP BY model ORDER BY cnt DESC"
  ).all() as Array<{ model: string; cnt: number }>;

  // Join with token_usage for avg cost
  const model_usage = modelRows.map(r => {
    const costRow = db.prepare(
      "SELECT AVG(estimated_cost_usd) as avg_cost FROM token_usage WHERE model = ?"
    ).get(r.model) as { avg_cost: number | null } | undefined;
    return { model: r.model, count: r.cnt, avg_cost: costRow?.avg_cost || 0 };
  });

  // Recent errors
  const errorRows = db.prepare(
    "SELECT tool_name, metadata, created_at FROM agent_analytics WHERE success = 0 ORDER BY created_at DESC LIMIT 10"
  ).all() as Array<{ tool_name: string | null; metadata: string; created_at: string }>;
  const recent_errors = errorRows.map(r => ({
    tool: r.tool_name || "unknown",
    error: (() => { try { const m = JSON.parse(r.metadata || "{}"); return (m.error as string) || "Unknown error"; } catch { return "Unknown error"; } })(),
    timestamp: r.created_at,
  }));

  // Daily task counts (last 30 days)
  const dailyRows = db.prepare(
    "SELECT DATE(created_at) as day, COUNT(*) as cnt, SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as ok FROM agent_analytics WHERE event_type IN ('task_complete', 'task_error') AND created_at > datetime('now', '-30 days') GROUP BY day ORDER BY day"
  ).all() as Array<{ day: string; cnt: number; ok: number }>;
  const daily_tasks = dailyRows.map(r => ({ date: r.day, count: r.cnt, successes: r.ok }));

  return { total_tasks, success_rate, avg_duration_ms, top_tools, model_usage, recent_errors, daily_tasks };
}

// ─── Audit Trail (OpenClaw Security Model) ────────────────────────────────────

export function getAuditLogs(opts?: {
  limit?: number;
  offset?: number;
  event_type?: string;
  tool_name?: string;
  success?: boolean;
  task_id?: string;
  from_date?: string;
  to_date?: string;
}): { logs: Array<{
  id: string;
  event_type: string;
  tool_name: string | null;
  model: string | null;
  task_id: string | null;
  duration_ms: number | null;
  success: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}>; total: number } {
  const db = getDb();
  const wheres: string[] = [];
  const params: unknown[] = [];

  if (opts?.event_type) { wheres.push("event_type = ?"); params.push(opts.event_type); }
  if (opts?.tool_name) { wheres.push("tool_name = ?"); params.push(opts.tool_name); }
  if (opts?.success !== undefined) { wheres.push("success = ?"); params.push(opts.success ? 1 : 0); }
  if (opts?.from_date) { wheres.push("created_at >= ?"); params.push(opts.from_date); }
  if (opts?.to_date) { wheres.push("created_at <= ?"); params.push(opts.to_date); }

  const whereClause = wheres.length > 0 ? `WHERE ${wheres.join(" AND ")}` : "";
  const limit = opts?.limit || 50;
  const offset = opts?.offset || 0;

  const rows = db.prepare(
    `SELECT * FROM agent_analytics ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset) as Array<{
    id: string; event_type: string; tool_name: string | null; model: string | null;
    duration_ms: number | null; success: number; metadata: string; created_at: string;
  }>;

  const countRow = db.prepare(
    `SELECT COUNT(*) as c FROM agent_analytics ${whereClause}`
  ).get(...params) as { c: number };

  return {
    logs: rows.map(r => ({
      ...r,
      success: r.success === 1,
      task_id: (() => { try { const m = JSON.parse(r.metadata || "{}"); return (m.task_id as string) || null; } catch { return null; } })(),
      metadata: (() => { try { return JSON.parse(r.metadata || "{}") as Record<string, unknown>; } catch { return {}; } })(),
    })),
    total: countRow.c,
  };
}

export function getAuditToolNames(): string[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT DISTINCT tool_name FROM agent_analytics WHERE tool_name IS NOT NULL ORDER BY tool_name"
  ).all() as Array<{ tool_name: string }>;
  return rows.map(r => r.tool_name);
}

// ─── Conversation Sessions (OpenClaw Session Model) ───────────────────────────

export function createSession(name: string, description?: string, persona_id?: string): string {
  const db = getDb();
  // Ensure sessions table exists
  db.exec(`
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
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO sessions (id, name, description, task_ids, persona_id, pinned, created_at, updated_at) VALUES (?, ?, ?, '[]', ?, 0, ?, ?)"
  ).run(id, name, description || "", persona_id || null, now, now);
  return id;
}

export function getSessions(): Array<{
  id: string; name: string; description: string; task_ids: string[];
  persona_id: string | null; context_summary: string | null; pinned: boolean;
  created_at: string; updated_at: string;
}> {
  const db = getDb();
  db.exec(`
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
  const rows = db.prepare("SELECT * FROM sessions ORDER BY updated_at DESC").all() as Array<{
    id: string; name: string; description: string; task_ids: string;
    persona_id: string | null; context_summary: string | null; pinned: number;
    created_at: string; updated_at: string;
  }>;
  return rows.map(r => ({
    ...r,
    task_ids: JSON.parse(r.task_ids || "[]") as string[],
    pinned: r.pinned === 1,
  }));
}

export function getSession(id: string) {
  const db = getDb();
  db.exec(`
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
  const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as {
    id: string; name: string; description: string; task_ids: string;
    persona_id: string | null; context_summary: string | null; pinned: number;
    created_at: string; updated_at: string;
  } | undefined;
  if (!row) return null;
  return { ...row, task_ids: JSON.parse(row.task_ids || "[]") as string[], pinned: row.pinned === 1 };
}

export function addTaskToSession(sessionId: string, taskId: string): void {
  const db = getDb();
  const session = getSession(sessionId);
  if (!session) return;
  const ids = session.task_ids;
  if (!ids.includes(taskId)) {
    ids.push(taskId);
    db.prepare("UPDATE sessions SET task_ids = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(ids), new Date().toISOString(), sessionId);
  }
}

export function updateSession(id: string, updates: { name?: string; description?: string; persona_id?: string; context_summary?: string; pinned?: boolean }): void {
  const db = getDb();
  const sets: string[] = [];
  const params: unknown[] = [];
  if (updates.name !== undefined) { sets.push("name = ?"); params.push(updates.name); }
  if (updates.description !== undefined) { sets.push("description = ?"); params.push(updates.description); }
  if (updates.persona_id !== undefined) { sets.push("persona_id = ?"); params.push(updates.persona_id); }
  if (updates.context_summary !== undefined) { sets.push("context_summary = ?"); params.push(updates.context_summary); }
  if (updates.pinned !== undefined) { sets.push("pinned = ?"); params.push(updates.pinned ? 1 : 0); }
  if (sets.length === 0) return;
  sets.push("updated_at = ?");
  params.push(new Date().toISOString());
  params.push(id);
  db.prepare(`UPDATE sessions SET ${sets.join(", ")} WHERE id = ?`).run(...params);
}

export function deleteSession(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
}

// ─── Pipelines (Task DAG) ─────────────────────────────────────────────────────

export function createPipeline(name: string, description?: string): string {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS pipelines (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      nodes TEXT DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO pipelines (id, name, description, nodes, created_at, updated_at) VALUES (?, ?, ?, '[]', ?, ?)"
  ).run(id, name, description || "", now, now);
  return id;
}

export function getPipelines(): Array<{
  id: string; name: string; description: string; nodes: unknown[];
  created_at: string; updated_at: string;
}> {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS pipelines (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      nodes TEXT DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const rows = db.prepare("SELECT * FROM pipelines ORDER BY updated_at DESC").all() as Array<{
    id: string; name: string; description: string; nodes: string;
    created_at: string; updated_at: string;
  }>;
  return rows.map(r => ({
    ...r,
    nodes: JSON.parse(r.nodes || "[]") as unknown[],
  }));
}

export function getPipeline(id: string) {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS pipelines (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      nodes TEXT DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const row = db.prepare("SELECT * FROM pipelines WHERE id = ?").get(id) as {
    id: string; name: string; description: string; nodes: string;
    created_at: string; updated_at: string;
  } | undefined;
  if (!row) return null;
  return { ...row, nodes: JSON.parse(row.nodes || "[]") as unknown[] };
}

export function updatePipelineNodes(id: string, nodes: unknown[]): void {
  const db = getDb();
  db.prepare("UPDATE pipelines SET nodes = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(nodes), new Date().toISOString(), id);
}

export function deletePipeline(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM pipelines WHERE id = ?").run(id);
}

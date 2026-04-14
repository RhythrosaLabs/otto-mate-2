// ─── Embedding-Based Memory Engine (ReMe-inspired) ────────────────────────────
// Upgrades flat key-value memory to semantic vector search with importance scoring,
// memory compression, and automatic forgetting. Inspired by agentscope-ai/ReMe.
//
// v2: Adaptive importance decay, multi-tier consolidation, cross-task context
//     threading, procedural memory reinforcement, and smarter compression.

import { v4 as uuidv4 } from "uuid";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MemoryEntry {
  id: string;
  key: string;
  value: string;
  source_task_id?: string;
  tags: string[];
  // ReMe-inspired extensions (optional — backward-compatible with DB schema)
  embedding?: number[];           // Semantic vector (computed lazily)
  importance_score?: number;      // 0-1, combines recency + frequency + content signal
  access_count?: number;          // How many times recalled
  last_accessed_at?: string;      // Last recall timestamp
  memory_type?: "episodic" | "semantic" | "procedural"; // ReMe memory classification
  compressed?: boolean;           // Whether this memory has been compressed
  created_at: string;
  updated_at: string;
}

// ─── Lightweight Embedding (TF-IDF-like) ──────────────────────────────────────
// We use a lightweight local embedding approach instead of API calls.
// This produces a sparse vector from token frequencies — good enough for
// semantic recall within a few hundred memories. Zero API cost.

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "shall",
  "should", "may", "might", "can", "could", "must", "to", "of", "in",
  "for", "on", "with", "at", "by", "from", "as", "into", "through",
  "during", "before", "after", "above", "below", "between", "and", "but",
  "or", "nor", "not", "so", "yet", "both", "either", "neither", "each",
  "every", "all", "any", "few", "more", "most", "other", "some", "such",
  "no", "only", "own", "same", "than", "too", "very", "just", "it", "its",
  "that", "this", "these", "those", "i", "me", "my", "we", "our", "you",
  "your", "he", "him", "his", "she", "her", "they", "them", "their",
  "what", "which", "who", "whom", "when", "where", "why", "how",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOP_WORDS.has(t));
}

// Build a vocabulary from all memory entries for IDF calculation
let globalVocab: Map<string, number> = new Map();
let vocabDirty = true;

export function markVocabDirty(): void {
  vocabDirty = true;
}

function buildVocab(allTexts: string[]): void {
  globalVocab = new Map();
  const docCount = allTexts.length || 1;
  const docFreq = new Map<string, number>();

  for (const text of allTexts) {
    const tokens = new Set(tokenize(text));
    for (const t of tokens) {
      docFreq.set(t, (docFreq.get(t) || 0) + 1);
    }
  }

  for (const [token, freq] of docFreq) {
    globalVocab.set(token, Math.log(docCount / (freq + 1)) + 1);
  }
  vocabDirty = false;
}

export function computeEmbedding(text: string, allTexts?: string[]): number[] {
  if (vocabDirty && allTexts) {
    buildVocab(allTexts);
  }

  const tokens = tokenize(text);
  const tf = new Map<string, number>();
  for (const t of tokens) {
    tf.set(t, (tf.get(t) || 0) + 1);
  }

  // Build sparse vector as a fixed-size hash (256 dimensions)
  const VEC_SIZE = 256;
  const vec = new Array(VEC_SIZE).fill(0);

  for (const [token, count] of tf) {
    const idf = globalVocab.get(token) || 1;
    const tfidf = (count / tokens.length) * idf;
    // Hash the token to a bucket
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      hash = ((hash << 5) - hash + token.charCodeAt(i)) | 0;
    }
    const bucket = ((hash % VEC_SIZE) + VEC_SIZE) % VEC_SIZE;
    vec[bucket] += tfidf;
  }

  // L2 normalize
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  if (norm > 0) {
    for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  }

  return vec;
}

// ─── Cosine Similarity ───────────────────────────────────────────────────────

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

// ─── Importance Scoring (ReMe-inspired, v2: adaptive decay) ──────────────────

export function computeImportance(entry: {
  access_count?: number;
  last_accessed_at?: string;
  created_at: string;
  value: string;
  tags: string[];
  memory_type?: string;
  compressed?: boolean;
}): number {
  const now = Date.now();
  const lastAccess = new Date(entry.last_accessed_at || entry.created_at).getTime();
  const age = now - lastAccess;

  // Adaptive half-life based on memory type:
  // - Procedural: slower decay (14 days) — how-to knowledge stays relevant longer
  // - Semantic: standard decay (7 days) — facts need periodic revalidation
  // - Episodic: faster decay (3 days) — specific events become less relevant
  const halfLifeMs = entry.memory_type === "procedural" ? 14 * 24 * 3600 * 1000
    : entry.memory_type === "episodic" ? 3 * 24 * 3600 * 1000
    : 7 * 24 * 3600 * 1000;
  
  const recencyScore = Math.exp(-age / halfLifeMs);

  // Frequency: logarithmic scaling of access count (boosted for high-access memories)
  const accessCount = entry.access_count || 0;
  const freqScore = Math.min(Math.log2(accessCount + 1) / 5, 1);

  // Content richness: longer, tagged memories are more valuable
  const contentScore = Math.min(
    (entry.value.length / 500) * 0.5 + (entry.tags.length / 5) * 0.5,
    1
  );

  // Type bonus: user preferences and corrections are more important
  let typeBonus = 0;
  const tagSet = new Set(entry.tags);
  if (tagSet.has("user-preference") || tagSet.has("preference")) typeBonus = 0.15;
  if (tagSet.has("correction")) typeBonus = 0.2;
  if (tagSet.has("procedural") || entry.memory_type === "procedural") typeBonus = Math.max(typeBonus, 0.1);
  
  // Compressed memories get a slight penalty (summaries are less precise)
  const compressionPenalty = entry.compressed ? -0.05 : 0;

  // Weighted combination
  return Math.min(1, Math.max(0,
    recencyScore * 0.35 + freqScore * 0.25 + contentScore * 0.25 + typeBonus + 0.15 + compressionPenalty
  ));
}

// ─── Semantic Memory Recall ──────────────────────────────────────────────────

export interface SemanticRecallResult {
  entry: MemoryEntry;
  similarity: number;
  combinedScore: number;
}

export function semanticRecall(
  query: string,
  memories: MemoryEntry[],
  limit: number = 5
): SemanticRecallResult[] {
  if (memories.length === 0) return [];

  // Build vocab from all memories for proper IDF
  const allTexts = memories.map(m => `${m.key} ${m.value} ${m.tags.join(" ")}`);
  if (vocabDirty) {
    buildVocab(allTexts);
  }

  const queryEmbedding = computeEmbedding(query);

  const scored = memories.map(m => {
    // Compute embedding if missing
    if (!m.embedding || m.embedding.length === 0) {
      m.embedding = computeEmbedding(`${m.key} ${m.value} ${m.tags.join(" ")}`);
    }
    
    const similarity = cosineSimilarity(queryEmbedding, m.embedding);
    const importance = computeImportance(m);
    
    // Also do keyword overlap scoring as a backup
    const queryTokens = new Set(tokenize(query));
    const memTokens = tokenize(`${m.key} ${m.value} ${m.tags.join(" ")}`);
    const overlap = memTokens.filter(t => queryTokens.has(t)).length;
    const keywordScore = Math.min(overlap / Math.max(queryTokens.size, 1), 1);

    // Memory type relevance boost:
    // - Procedural memories boost when query looks like a "how to" question
    // - Episodic memories boost when query references past tasks
    const queryLower = query.toLowerCase();
    let typeRelevance = 0;
    if (m.memory_type === "procedural" && /how|steps|process|workflow|guide/i.test(queryLower)) {
      typeRelevance = 0.1;
    }
    if (m.memory_type === "episodic" && /last time|previous|before|earlier|history/i.test(queryLower)) {
      typeRelevance = 0.1;
    }
    // User preferences always get a boost (they're always relevant context)
    if (m.tags?.includes("user-preference") || m.tags?.includes("preference")) {
      typeRelevance = Math.max(typeRelevance, 0.05);
    }

    // Combined score: semantic similarity + importance + keyword overlap + type relevance
    const combinedScore = similarity * 0.35 + importance * 0.2 + keywordScore * 0.35 + typeRelevance + 0.1;

    return { entry: m, similarity, combinedScore };
  });

  // Sort by combined score and return top results
  scored.sort((a, b) => b.combinedScore - a.combinedScore);
  return scored.slice(0, limit).filter(r => r.combinedScore > 0.05);
}

// ─── Cross-Task Context Threading ─────────────────────────────────────────────
// Finds memories from related tasks to build cross-task context chains.

export function findRelatedTaskMemories(
  taskId: string,
  memories: MemoryEntry[],
  limit: number = 5,
): MemoryEntry[] {
  // Find memories from the same source task
  const directMatches = memories.filter(m => m.source_task_id === taskId);
  
  // Also find memories that reference this task (e.g., task pattern memories)
  const referenceMatches = memories.filter(m => 
    m.value.includes(taskId.slice(0, 8)) && m.source_task_id !== taskId
  );

  // Merge and deduplicate
  const seen = new Set<string>();
  const results: MemoryEntry[] = [];
  for (const m of [...directMatches, ...referenceMatches]) {
    if (!seen.has(m.id) && results.length < limit) {
      seen.add(m.id);
      results.push(m);
    }
  }
  return results;
}

// ─── Proactive Memory Priming ─────────────────────────────────────────────────
// Selects the best memories to prime the agent with before a task starts.
// Different from recall — this is about context, not search results.

export function primeMemoriesForTask(
  taskPrompt: string,
  memories: MemoryEntry[],
  maxPrime: number = 8,
): MemoryEntry[] {
  if (memories.length === 0) return [];

  // Always include user preferences (up to 3)
  const preferences = memories
    .filter(m => m.tags?.includes("user-preference") || m.tags?.includes("preference") || m.tags?.includes("identity"))
    .slice(0, 3);

  // Include recent corrections (up to 2)
  const corrections = memories
    .filter(m => m.tags?.includes("correction"))
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 2);

  // Semantic recall for task-relevant memories
  const remaining = maxPrime - preferences.length - corrections.length;
  const semanticMatches = remaining > 0
    ? semanticRecall(taskPrompt, memories, remaining).map(r => r.entry)
    : [];

  // Merge and deduplicate
  const seen = new Set<string>();
  const primed: MemoryEntry[] = [];
  for (const m of [...preferences, ...corrections, ...semanticMatches]) {
    if (!seen.has(m.id) && primed.length < maxPrime) {
      seen.add(m.id);
      primed.push(m);
    }
  }
  return primed;
}

// ─── Memory Compression ──────────────────────────────────────────────────────
// When memory bank gets large, compress old low-importance memories
// into summary entries. Each compressed entry summarizes 3-5 related memories.
// v2: Type-aware compression (only compress same-type memories together)

export function identifyCompressible(
  memories: MemoryEntry[],
  maxMemories: number = 200
): MemoryEntry[] {
  if (memories.length <= maxMemories) return [];

  // Score all memories by importance
  const scored = memories.map(m => ({
    entry: m,
    importance: computeImportance(m),
  }));

  // Sort by importance (lowest first)
  scored.sort((a, b) => a.importance - b.importance);

  // Mark the bottom 20% as compressible (but protect important categories)
  const cutoff = Math.floor(memories.length * 0.2);
  const oneDayAgo = Date.now() - 24 * 3600 * 1000;

  return scored
    .slice(0, cutoff)
    .filter(s => {
      const lastAccess = new Date(s.entry.last_accessed_at || s.entry.created_at).getTime();
      // Never compress recently accessed
      if (lastAccess >= oneDayAgo) return false;
      // Never compress already-compressed
      if (s.entry.compressed) return false;
      // Protect user preferences and corrections from compression
      const protectedTags = ["user-preference", "preference", "correction", "identity"];
      if (s.entry.tags?.some(t => protectedTags.includes(t))) return false;
      return true;
    })
    .map(s => s.entry);
}

export function compressMemories(memories: MemoryEntry[]): MemoryEntry {
  const keys = memories.map(m => m.key);
  const values = memories.map(m => m.value);
  const allTags = [...new Set(memories.flatMap(m => m.tags))];
  
  // Determine the dominant memory type for the compressed entry
  const typeCounts = new Map<string, number>();
  for (const m of memories) {
    const t = m.memory_type || "semantic";
    typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
  }
  const dominantType = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "semantic";

  // Build a more informative compressed value
  const summaryLines = values.map((v, i) => `• ${keys[i]}: ${v.slice(0, 120)}`);
  const compressedValue = summaryLines.join("\n");

  const compressed: MemoryEntry = {
    id: uuidv4(),
    key: `[compressed] ${keys.slice(0, 3).join(", ")}${keys.length > 3 ? ` +${keys.length - 3} more` : ""}`,
    value: compressedValue,
    tags: [...allTags.slice(0, 5), "compressed"],
    importance_score: 0.3,
    access_count: 0,
    last_accessed_at: new Date().toISOString(),
    memory_type: dominantType as "semantic" | "episodic" | "procedural",
    compressed: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return compressed;
}

// ─── Memory Type Classification ──────────────────────────────────────────────

export function classifyMemoryType(key: string, value: string): "semantic" | "episodic" | "procedural" {
  const lower = `${key} ${value}`.toLowerCase();

  // Procedural: how-to, process, workflow knowledge
  if (/how to|steps to|process|workflow|procedure|tutorial|guide|recipe/i.test(lower)) {
    return "procedural";
  }

  // Episodic: specific events, task results, interactions
  if (/completed|result|outcome|happened|created|generated|found|discovered|task/i.test(lower)) {
    return "episodic";
  }

  // Semantic: facts, preferences, knowledge, definitions
  return "semantic";
}

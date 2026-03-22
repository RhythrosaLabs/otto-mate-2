// ─── Embedding-Based Memory Engine (ReMe-inspired) ────────────────────────────
// Upgrades flat key-value memory to semantic vector search with importance scoring,
// memory compression, and automatic forgetting. Inspired by agentscope-ai/ReMe.

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

// ─── Importance Scoring (ReMe-inspired) ──────────────────────────────────────

export function computeImportance(entry: {
  access_count?: number;
  last_accessed_at?: string;
  created_at: string;
  value: string;
  tags: string[];
}): number {
  const now = Date.now();
  const lastAccess = new Date(entry.last_accessed_at || entry.created_at).getTime();
  const age = now - lastAccess;

  // Recency: decays over time (half-life = 7 days)
  const recencyScore = Math.exp(-age / (7 * 24 * 3600 * 1000));

  // Frequency: logarithmic scaling of access count
  const freqScore = Math.min(Math.log2((entry.access_count || 0) + 1) / 5, 1);

  // Content richness: longer, tagged memories are more valuable
  const contentScore = Math.min(
    (entry.value.length / 500) * 0.5 + (entry.tags.length / 5) * 0.5,
    1
  );

  // Weighted combination
  return recencyScore * 0.4 + freqScore * 0.3 + contentScore * 0.3;
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

    // Combined score: semantic similarity + importance + keyword overlap
    const combinedScore = similarity * 0.4 + importance * 0.25 + keywordScore * 0.35;

    return { entry: m, similarity, combinedScore };
  });

  // Sort by combined score and return top results
  scored.sort((a, b) => b.combinedScore - a.combinedScore);
  return scored.slice(0, limit).filter(r => r.combinedScore > 0.05);
}

// ─── Memory Compression ──────────────────────────────────────────────────────
// When memory bank gets large, compress old low-importance memories
// into summary entries. Each compressed entry summarizes 3-5 related memories.

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

  // Mark the bottom 20% as compressible (but never compress recently accessed)
  const cutoff = Math.floor(memories.length * 0.2);
  const oneDayAgo = Date.now() - 24 * 3600 * 1000;

  return scored
    .slice(0, cutoff)
    .filter(s => {
      const lastAccess = new Date(s.entry.last_accessed_at || s.entry.created_at).getTime();
      return lastAccess < oneDayAgo && !s.entry.compressed;
    })
    .map(s => s.entry);
}

export function compressMemories(memories: MemoryEntry[]): MemoryEntry {
  const keys = memories.map(m => m.key);
  const values = memories.map(m => m.value);
  const allTags = [...new Set(memories.flatMap(m => m.tags))];

  const compressed: MemoryEntry = {
    id: uuidv4(),
    key: `[compressed] ${keys.slice(0, 3).join(", ")}${keys.length > 3 ? ` +${keys.length - 3} more` : ""}`,
    value: values.map((v, i) => `• ${keys[i]}: ${v.slice(0, 100)}`).join("\n"),
    tags: [...allTags.slice(0, 5), "compressed"],
    importance_score: 0.3,
    access_count: 0,
    last_accessed_at: new Date().toISOString(),
    memory_type: "semantic",
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

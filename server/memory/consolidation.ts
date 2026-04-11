/**
 * Memory Consolidation Service
 *
 * Detects and merges duplicate/related memories using TF-IDF cosine similarity
 * and Jaccard token overlap. Provides tools for:
 *   - Finding near-duplicate pairs above a similarity threshold
 *   - Suggesting merge groups by key prefix and content similarity
 *   - Executing merges (update primary, archive duplicates)
 *   - Bulk archiving stale/decayed memories
 */

import type { Database } from 'bun:sqlite';
import { archiveMemory } from '../db/agent-memories';
import { createLogger } from '../lib/logger';
import { computeDecayMultiplier } from './decay';
import { cosineSimilaritySparse, IDFCorpus, tokenize } from './embeddings';

const log = createLogger('MemoryConsolidation');

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MemoryRecord {
  id: string;
  agentId: string;
  key: string;
  content: string;
  status: string;
  txid: string | null;
  asaId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface DuplicatePair {
  primaryId: string;
  primaryKey: string;
  duplicateId: string;
  duplicateKey: string;
  similarityScore: number;
  /** Which algorithm produced the highest score */
  method: 'jaccard' | 'tfidf' | 'combined';
}

export interface MergeSuggestion {
  /** Unique ID for this suggestion (deterministic hash of sorted IDs) */
  id: string;
  /** The primary memory (oldest / most confirmed) that will absorb others */
  primaryId: string;
  primaryKey: string;
  primaryContent: string;
  /** Memories to merge into the primary */
  duplicateIds: string[];
  duplicateKeys: string[];
  /** Highest pairwise similarity within the group */
  maxSimilarity: number;
  /** Preview of the consolidated content */
  previewContent: string;
  /** Key prefix that grouped these memories (may be null for content-only matches) */
  keyPrefix: string | null;
}

export interface BulkArchiveFilter {
  agentId?: string;
  /** Archive memories with decay score below this value (0.0–1.0) */
  maxDecayScore?: number;
  /** Archive short_term memories older than this many days */
  olderThanDays?: number;
  /** Only archive memories with these statuses */
  statuses?: Array<'short_term' | 'pending' | 'failed'>;
}

export interface BulkArchiveResult {
  archivedCount: number;
  archivedKeys: string[];
}

export interface ExecuteMergeParams {
  primaryId: string;
  duplicateIds: string[];
  /** Override merged content; defaults to auto-generated consolidation */
  mergedContent?: string;
}

export interface ExecuteMergeResult {
  success: boolean;
  primaryKey: string;
  mergedContent: string;
  archivedCount: number;
  archivedKeys: string[];
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

interface MemoryRow {
  id: string;
  agent_id: string;
  key: string;
  content: string;
  status: string;
  txid: string | null;
  asa_id: number | null;
  created_at: string;
  updated_at: string;
}

function rowToRecord(row: MemoryRow): MemoryRecord {
  return {
    id: row.id,
    agentId: row.agent_id,
    key: row.key,
    content: row.content,
    status: row.status,
    txid: row.txid,
    asaId: row.asa_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Compute Jaccard similarity between two sets of tokens.
 * |intersection| / |union|
 */
function jaccardSimilarity(aTokens: string[], bTokens: string[]): number {
  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);
  let intersection = 0;
  for (const t of aSet) {
    if (bSet.has(t)) intersection++;
  }
  const union = aSet.size + bSet.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Extract the key prefix (everything before the first ':' or '-').
 * Returns null if no prefix separator found.
 */
function extractKeyPrefix(key: string): string | null {
  const colonIdx = key.indexOf(':');
  if (colonIdx > 0) return key.slice(0, colonIdx);
  const dashIdx = key.indexOf('-');
  if (dashIdx > 0) return key.slice(0, dashIdx);
  return null;
}

/**
 * Generate a stable suggestion ID from a sorted list of memory IDs.
 */
function suggestionId(ids: string[]): string {
  return [...ids].sort().join('|').slice(0, 64);
}

/**
 * Build a consolidated content string from multiple memories.
 * Deduplicates sentences and trims to a reasonable length.
 */
function buildConsolidatedContent(memories: MemoryRecord[]): string {
  // Sort by status priority: confirmed > pending > others
  const sorted = [...memories].sort((a, b) => {
    const rank = (m: MemoryRecord) => (m.status === 'confirmed' ? 0 : m.status === 'pending' ? 1 : 2);
    return rank(a) - rank(b);
  });

  // Collect unique sentences across all memories
  const seen = new Set<string>();
  const sentences: string[] = [];

  for (const mem of sorted) {
    const parts = mem.content
      .split(/[.;!\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 10);

    for (const part of parts) {
      const normalized = part.toLowerCase();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        sentences.push(part);
      }
    }
  }

  return sentences.join('. ').slice(0, 2000);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Scan all non-archived memories for an agent and find near-duplicate pairs.
 *
 * Uses both Jaccard token overlap and TF-IDF cosine similarity.
 * Combined score = max(jaccard, tfidf_cosine).
 *
 * @param threshold - Minimum combined similarity score (default 0.7)
 * @returns Sorted list of duplicate pairs (highest similarity first)
 */
export function findDuplicates(db: Database, agentId: string, threshold = 0.7): DuplicatePair[] {
  const rows = db
    .query(
      `SELECT id, agent_id, key, content, status, txid, asa_id, created_at, updated_at
         FROM agent_memories
         WHERE agent_id = ? AND archived = 0
         ORDER BY updated_at DESC
         LIMIT 500`,
    )
    .all(agentId) as MemoryRow[];

  if (rows.length < 2) return [];

  const records = rows.map(rowToRecord);

  // Build IDF corpus from all memories
  const corpus = new IDFCorpus();
  const tokenCache = new Map<string, string[]>();
  for (const rec of records) {
    const tokens = tokenize(`${rec.key} ${rec.content}`);
    tokenCache.set(rec.id, tokens);
    corpus.addDocument(tokens);
  }

  const pairs: DuplicatePair[] = [];

  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      const a = records[i];
      const b = records[j];

      const aTokens = tokenCache.get(a.id)!;
      const bTokens = tokenCache.get(b.id)!;

      if (aTokens.length === 0 || bTokens.length === 0) continue;

      const jaccard = jaccardSimilarity(aTokens, bTokens);
      const aVec = corpus.tfidfVector(aTokens);
      const bVec = corpus.tfidfVector(bTokens);
      const tfidf = cosineSimilaritySparse(aVec, bVec);

      const combined = Math.max(jaccard, tfidf);

      if (combined >= threshold) {
        let method: DuplicatePair['method'] = 'combined';
        if (jaccard >= tfidf && jaccard >= threshold) method = 'jaccard';
        else if (tfidf >= jaccard) method = 'tfidf';

        pairs.push({
          primaryId: a.id,
          primaryKey: a.key,
          duplicateId: b.id,
          duplicateKey: b.key,
          similarityScore: Math.round(combined * 1000) / 1000,
          method,
        });
      }
    }
  }

  // Sort by score descending
  pairs.sort((a, b) => b.similarityScore - a.similarityScore);
  return pairs;
}

/**
 * Group related memories by key prefix and content similarity.
 * Returns merge suggestions with preview of the consolidated result.
 *
 * @param agentId - Agent to scan; pass undefined to scan all agents
 * @param threshold - Content similarity threshold for grouping (default 0.6)
 */
export function suggestMerges(db: Database, agentId: string | undefined, threshold = 0.6): MergeSuggestion[] {
  const rows = db
    .query(
      agentId
        ? `SELECT id, agent_id, key, content, status, txid, asa_id, created_at, updated_at
             FROM agent_memories
             WHERE agent_id = ? AND archived = 0
             ORDER BY updated_at DESC
             LIMIT 500`
        : `SELECT id, agent_id, key, content, status, txid, asa_id, created_at, updated_at
             FROM agent_memories
             WHERE archived = 0
             ORDER BY updated_at DESC
             LIMIT 500`,
    )
    .all(...(agentId ? [agentId] : [])) as MemoryRow[];

  if (rows.length < 2) return [];

  const records = rows.map(rowToRecord);

  // Build corpus and token cache
  const corpus = new IDFCorpus();
  const tokenCache = new Map<string, string[]>();
  for (const rec of records) {
    const tokens = tokenize(`${rec.key} ${rec.content}`);
    tokenCache.set(rec.id, tokens);
    corpus.addDocument(tokens);
  }

  // Step 1: Group by key prefix
  const prefixGroups = new Map<string, MemoryRecord[]>();
  const noPrefixGroup: MemoryRecord[] = [];

  for (const rec of records) {
    const prefix = extractKeyPrefix(rec.key);
    if (prefix) {
      const group = prefixGroups.get(prefix) ?? [];
      group.push(rec);
      prefixGroups.set(prefix, group);
    } else {
      noPrefixGroup.push(rec);
    }
  }

  const suggestions: MergeSuggestion[] = [];

  // Step 2: Within each prefix group, check content similarity
  for (const [prefix, group] of prefixGroups) {
    if (group.length < 2) continue;

    // Find clusters within this group using similarity
    const clusters = clusterBySimilarity(group, tokenCache, corpus, threshold);

    for (const cluster of clusters) {
      if (cluster.length < 2) continue;
      const suggestion = buildSuggestion(cluster, tokenCache, corpus, prefix);
      if (suggestion) suggestions.push(suggestion);
    }
  }

  // Step 3: Also look for cross-prefix content duplicates (no prefix)
  const allDupes = findDuplicates(db, agentId ?? '', 0.8);
  const alreadyGrouped = new Set(suggestions.flatMap((s) => [s.primaryId, ...s.duplicateIds]));

  // Group high-confidence duplicates that weren't caught by prefix matching
  const ungroupedPairs = allDupes.filter((p) => !alreadyGrouped.has(p.primaryId) && !alreadyGrouped.has(p.duplicateId));

  for (const pair of ungroupedPairs) {
    const primary = records.find((r) => r.id === pair.primaryId);
    const duplicate = records.find((r) => r.id === pair.duplicateId);
    if (!primary || !duplicate) continue;

    const suggestion = buildSuggestion([primary, duplicate], tokenCache, corpus, null);
    if (suggestion) {
      suggestion.maxSimilarity = pair.similarityScore;
      suggestions.push(suggestion);
    }
  }

  // Sort by max similarity descending
  suggestions.sort((a, b) => b.maxSimilarity - a.maxSimilarity);
  return suggestions;
}

/**
 * Execute a merge: update the primary memory's content to the consolidated
 * version and archive the duplicates.
 */
export function executeMerge(db: Database, params: ExecuteMergeParams): ExecuteMergeResult {
  const { primaryId, duplicateIds, mergedContent } = params;

  // Fetch primary
  const primaryRow = db
    .query('SELECT * FROM agent_memories WHERE id = ? AND archived = 0')
    .get(primaryId) as MemoryRow | null;

  if (!primaryRow) {
    throw new Error(`Primary memory ${primaryId} not found or archived`);
  }

  // Fetch duplicates
  const duplicateRows: MemoryRow[] = [];
  for (const dupId of duplicateIds) {
    const row = db.query('SELECT * FROM agent_memories WHERE id = ? AND archived = 0').get(dupId) as MemoryRow | null;
    if (row) duplicateRows.push(row);
  }

  // Determine final content
  const allRecords = [rowToRecord(primaryRow), ...duplicateRows.map(rowToRecord)];
  const finalContent = mergedContent ?? buildConsolidatedContent(allRecords);

  // Update primary content
  db.query(
    `UPDATE agent_memories
       SET content = ?, updated_at = datetime('now')
       WHERE id = ?`,
  ).run(finalContent, primaryId);

  log.info('Memory merge: updated primary content', {
    primaryId,
    primaryKey: primaryRow.key,
    duplicateCount: duplicateIds.length,
  });

  // Archive duplicates
  const archivedKeys: string[] = [];
  for (const row of duplicateRows) {
    const archived = archiveMemory(db, row.agent_id, row.key);
    if (archived) {
      archivedKeys.push(row.key);
      log.info('Memory merge: archived duplicate', { key: row.key, id: row.id });
    }
  }

  return {
    success: true,
    primaryKey: primaryRow.key,
    mergedContent: finalContent,
    archivedCount: archivedKeys.length,
    archivedKeys,
  };
}

/**
 * Bulk archive memories matching the given filter criteria.
 */
export function bulkArchive(db: Database, filter: BulkArchiveFilter): BulkArchiveResult {
  const conditions: string[] = ['archived = 0'];
  const bindings: (string | number)[] = [];

  if (filter.agentId) {
    conditions.push('agent_id = ?');
    bindings.push(filter.agentId);
  }

  if (filter.statuses && filter.statuses.length > 0) {
    const placeholders = filter.statuses.map(() => '?').join(',');
    conditions.push(`status IN (${placeholders})`);
    bindings.push(...filter.statuses);
  }

  if (filter.olderThanDays !== undefined) {
    conditions.push(`created_at < datetime('now', '-' || ? || ' days')`);
    bindings.push(filter.olderThanDays);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  // Fetch candidates first (to apply decay filter and collect keys)
  const candidates = db
    .query(`SELECT id, agent_id, key, content, status, updated_at FROM agent_memories ${where} LIMIT 1000`)
    .all(...bindings) as Array<{
    id: string;
    agent_id: string;
    key: string;
    content: string;
    status: string;
    updated_at: string;
  }>;

  const now = new Date();
  const toArchive: Array<{ agentId: string; key: string }> = [];

  for (const row of candidates) {
    // Apply decay filter if specified
    if (filter.maxDecayScore !== undefined) {
      const decay = computeDecayMultiplier(row.updated_at, now);
      if (decay > filter.maxDecayScore) continue;
    }
    toArchive.push({ agentId: row.agent_id, key: row.key });
  }

  const archivedKeys: string[] = [];
  for (const { agentId, key } of toArchive) {
    const archived = archiveMemory(db, agentId, key);
    if (archived) archivedKeys.push(key);
  }

  log.info('Bulk archive complete', { count: archivedKeys.length, filter });

  return {
    archivedCount: archivedKeys.length,
    archivedKeys,
  };
}

// ─── Clustering helpers ───────────────────────────────────────────────────────

/**
 * Simple greedy clustering: group memories where any pair exceeds threshold.
 */
function clusterBySimilarity(
  records: MemoryRecord[],
  tokenCache: Map<string, string[]>,
  corpus: IDFCorpus,
  threshold: number,
): MemoryRecord[][] {
  const assigned = new Set<string>();
  const clusters: MemoryRecord[][] = [];

  for (let i = 0; i < records.length; i++) {
    if (assigned.has(records[i].id)) continue;

    const cluster: MemoryRecord[] = [records[i]];
    assigned.add(records[i].id);

    for (let j = i + 1; j < records.length; j++) {
      if (assigned.has(records[j].id)) continue;

      const aTokens = tokenCache.get(records[i].id) ?? [];
      const bTokens = tokenCache.get(records[j].id) ?? [];

      if (aTokens.length === 0 || bTokens.length === 0) continue;

      const jaccard = jaccardSimilarity(aTokens, bTokens);
      const aVec = corpus.tfidfVector(aTokens);
      const bVec = corpus.tfidfVector(bTokens);
      const tfidf = cosineSimilaritySparse(aVec, bVec);
      const combined = Math.max(jaccard, tfidf);

      if (combined >= threshold) {
        cluster.push(records[j]);
        assigned.add(records[j].id);
      }
    }

    clusters.push(cluster);
  }

  return clusters;
}

function buildSuggestion(
  cluster: MemoryRecord[],
  tokenCache: Map<string, string[]>,
  corpus: IDFCorpus,
  keyPrefix: string | null,
): MergeSuggestion | null {
  if (cluster.length < 2) return null;

  // Primary: prefer confirmed > pending > others; then oldest
  const sorted = [...cluster].sort((a, b) => {
    const rank = (m: MemoryRecord) => (m.status === 'confirmed' ? 0 : m.status === 'pending' ? 1 : 2);
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    return a.createdAt < b.createdAt ? -1 : 1;
  });

  const primary = sorted[0];
  const duplicates = sorted.slice(1);

  // Compute max pairwise similarity
  let maxSimilarity = 0;
  for (let i = 0; i < cluster.length; i++) {
    for (let j = i + 1; j < cluster.length; j++) {
      const aTokens = tokenCache.get(cluster[i].id) ?? [];
      const bTokens = tokenCache.get(cluster[j].id) ?? [];
      const jaccard = jaccardSimilarity(aTokens, bTokens);
      const aVec = corpus.tfidfVector(aTokens);
      const bVec = corpus.tfidfVector(bTokens);
      const tfidf = cosineSimilaritySparse(aVec, bVec);
      maxSimilarity = Math.max(maxSimilarity, jaccard, tfidf);
    }
  }

  const previewContent = buildConsolidatedContent(cluster);
  const allIds = cluster.map((r) => r.id);

  return {
    id: suggestionId(allIds),
    primaryId: primary.id,
    primaryKey: primary.key,
    primaryContent: primary.content,
    duplicateIds: duplicates.map((d) => d.id),
    duplicateKeys: duplicates.map((d) => d.key),
    maxSimilarity: Math.round(maxSimilarity * 1000) / 1000,
    previewContent,
    keyPrefix,
  };
}

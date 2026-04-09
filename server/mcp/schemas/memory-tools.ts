/**
 * Shared schema definitions for memory tools.
 *
 * Single source of truth for parameter schemas and descriptions used by
 * all four transports: SDK tools, direct tools, HTTP MCP, and stdio MCP.
 */
import { z } from 'zod/v4';

// ── Tool descriptions ──────────────────────────────────────────────

export const MEMORY_TOOL_DESCRIPTIONS = {
  save_memory:
    'Save a memory to long-term storage (encrypted on localnet AlgoChat) with a short-term SQLite cache for fast recall. ' +
    'Long-term storage is durable and always available; short-term cache is ephemeral. ' +
    'Use this for ANY "remember this" request regardless of channel. Use a descriptive key for easy recall later. ' +
    'For long content, use the "book" param to create multi-page memory books (linked ASA chains).',

  recall_memory:
    'Recall memories from short-term cache (SQLite) with long-term storage status. ' +
    'Results show whether the memory is confirmed on-chain (long-term) or still pending sync. ' +
    'Provide a key for exact lookup, a query for search, book to read all pages, or neither to list recent memories.',

  read_on_chain_memories:
    'Read memories directly from on-chain storage (Algorand blockchain). ' +
    'Use this to browse your permanent long-term memories stored on-chain. ' +
    'Unlike corvid_recall_memory (which reads from local SQLite cache), this reads the blockchain directly. ' +
    'Useful for verifying on-chain state or when local cache may be stale/empty.',

  sync_on_chain_memories:
    'Sync memories from on-chain storage back to local SQLite cache. ' +
    'Use this to recover memories after a database reset or to ensure local cache matches on-chain state. ' +
    'Reads all on-chain memories (both ARC-69 ASAs and plain transactions) and restores any missing from the local database.',

  delete_memory:
    'Delete (forget) a long-term ARC-69 memory. Only works for memories stored as ASAs on localnet. ' +
    'Soft delete (default) archives the memory and clears the on-chain content but preserves the ASA. ' +
    'Hard delete destroys the ASA entirely. Permanent (plain transaction) memories cannot be deleted.',
} as const;

// ── Zod schemas (used by SDK, HTTP, stdio transports) ──────────────

export const SaveMemoryParams = {
  key: z.string().describe('A short descriptive key for this memory (e.g. "user-preferences", "project-status")'),
  content: z.string().describe('The content to remember'),
  book: z
    .string()
    .optional()
    .describe(
      'Book key for multi-page memories. Creates page 1 if new, appends page if existing. Each page is a separate encrypted ASA.',
    ),
};

export const RecallMemoryParams = {
  key: z.string().optional().describe('Exact key to look up'),
  query: z.string().optional().describe('Search term to find across keys and content'),
  book: z.string().optional().describe('Book key to read all pages of a multi-page memory book'),
};

export const ReadOnChainMemoriesParams = {
  search: z.string().optional().describe('Optional search term to filter memories by key or content'),
  limit: z.number().optional().describe('Maximum number of memories to return (default: 50)'),
};

export const SyncOnChainMemoriesParams = {
  limit: z.number().optional().describe('Maximum number of on-chain memories to scan (default: 200)'),
};

export const DeleteMemoryParams = {
  key: z.string().describe('Memory key to delete'),
  mode: z
    .enum(['soft', 'hard'])
    .optional()
    .describe('Delete mode: "soft" (default, archives) or "hard" (destroys ASA)'),
};

// ── JSON Schema (used by direct-tools transport) ───────────────────

export const SAVE_MEMORY_JSON_SCHEMA = {
  type: 'object' as const,
  properties: {
    key: {
      type: 'string',
      description: 'A short descriptive key for this memory (e.g. "user-preferences", "project-status")',
    },
    content: { type: 'string', description: 'The content to remember' },
    book: {
      type: 'string',
      description: 'Book key for multi-page memories. Creates page 1 if new, appends page if existing.',
    },
  },
  required: ['key', 'content'],
};

export const RECALL_MEMORY_JSON_SCHEMA = {
  type: 'object' as const,
  properties: {
    key: { type: 'string', description: 'Exact key to look up' },
    query: { type: 'string', description: 'Search term to find across keys and content' },
    book: { type: 'string', description: 'Book key to read all pages of a multi-page memory book' },
  },
};

export const READ_ON_CHAIN_MEMORIES_JSON_SCHEMA = {
  type: 'object' as const,
  properties: {
    search: { type: 'string', description: 'Optional search term to filter by key or content' },
    limit: { type: 'number', description: 'Max memories to return (default: 50)' },
  },
};

export const SYNC_ON_CHAIN_MEMORIES_JSON_SCHEMA = {
  type: 'object' as const,
  properties: {
    limit: { type: 'number', description: 'Max on-chain memories to scan (default: 200)' },
  },
};

export const DELETE_MEMORY_JSON_SCHEMA = {
  type: 'object' as const,
  properties: {
    key: { type: 'string', description: 'Memory key to delete' },
    mode: { type: 'string', enum: ['soft', 'hard'], description: 'Delete mode (default: soft)' },
  },
  required: ['key'],
};

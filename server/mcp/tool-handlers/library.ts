/**
 * MCP tool handlers for the CRVLIB shared agent library.
 *
 * CRVLIB entries are plaintext ARC-69 ASAs readable by all agents —
 * a shared knowledge commons for guides, standards, decisions, and runbooks.
 */
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { LibraryCategory } from '../../db/agent-library';
import {
  archiveLibraryEntry,
  deleteLibraryEntryRow,
  getLibraryEntry,
  listLibraryEntries,
  resolveLibraryAsaId,
  saveLibraryEntry,
  updateLibraryEntryAsaId,
  updateLibraryEntryTxid,
} from '../../db/agent-library';
import { getAgent } from '../../db/agents';
import { createLogger } from '../../lib/logger';
import type { LibraryContext } from '../../memory/arc69-library';
import { buildNotePayload } from '../../memory/arc69-library';
import type { McpToolContext } from './types';
import { errorResult, textResult } from './types';

const log = createLogger('McpLibraryHandlers');

const VALID_CATEGORIES: LibraryCategory[] = ['guide', 'reference', 'decision', 'standard', 'runbook'];

/**
 * Agents permitted to write to the shared library.
 * All other callers receive an error. CorvidAgent is the default librarian.
 */
const LIBRARIAN_AGENT_IDS: ReadonlySet<string> = new Set([
  '90cf34fa-1478-454c-a789-1c87cbb0d552', // CorvidAgent — default librarian
]);

/**
 * Build a LibraryContext from the MCP tool context.
 * Returns null if any required component is unavailable.
 */
async function buildLibraryContext(ctx: McpToolContext): Promise<LibraryContext | null> {
  try {
    const service = ctx.agentWalletService.getAlgoChatService();
    if (!service.indexerClient) return null;

    const chatAccountResult = await ctx.agentWalletService.getAgentChatAccount(ctx.agentId);
    if (!chatAccountResult) return null;

    const agent = getAgent(ctx.db, ctx.agentId);
    const agentName = agent?.name ?? 'unknown';

    return {
      db: ctx.db,
      agentId: ctx.agentId,
      agentName,
      algodClient: service.algodClient,
      indexerClient: service.indexerClient,
      chatAccount: chatAccountResult.account,
      network: ctx.network,
    };
  } catch {
    return null;
  }
}

/** Maximum ARC-69 note size in bytes. */
const MAX_NOTE_BYTES = 1024;

/**
 * Estimate the maximum content length (in chars) that fits in a single ASA note.
 * We build a test payload with the actual metadata to measure the JSON overhead,
 * then subtract from the 1024-byte limit with a small safety margin.
 */
function estimateMaxContentChars(
  key: string,
  agentId: string,
  agentName: string,
  category: LibraryCategory,
  tags: string[],
  bookMeta?: { book?: string; page?: number; prev?: number; total?: number },
): number {
  // Build a payload with empty content to measure overhead
  const overhead = buildNotePayload(key, agentId, agentName, category, tags, '', bookMeta);
  // Leave 16 bytes of safety margin for JSON escaping edge cases
  return Math.max(100, MAX_NOTE_BYTES - overhead.byteLength - 16);
}

/**
 * Split content into chunks that fit within the note byte limit.
 * Splits on paragraph boundaries when possible, falls back to sentence/word boundaries.
 */
function splitContentIntoPages(content: string, maxCharsPerPage: number): string[] {
  if (new TextEncoder().encode(content).byteLength <= maxCharsPerPage) {
    return [content];
  }

  const pages: string[] = [];
  let remaining = content;

  while (remaining.length > 0) {
    if (new TextEncoder().encode(remaining).byteLength <= maxCharsPerPage) {
      pages.push(remaining.trim());
      break;
    }

    // Find a good split point within the byte limit
    let splitAt = maxCharsPerPage;

    // Binary search for the right char position that fits in bytes
    while (new TextEncoder().encode(remaining.slice(0, splitAt)).byteLength > maxCharsPerPage && splitAt > 50) {
      splitAt = Math.floor(splitAt * 0.9);
    }

    // Try to split at a paragraph boundary
    const chunk = remaining.slice(0, splitAt);
    let breakIdx = chunk.lastIndexOf('\n\n');

    // Fall back to single newline
    if (breakIdx < splitAt * 0.3) {
      breakIdx = chunk.lastIndexOf('\n');
    }

    // Fall back to sentence boundary
    if (breakIdx < splitAt * 0.3) {
      breakIdx = chunk.lastIndexOf('. ');
      if (breakIdx > 0) breakIdx += 1; // Keep the period
    }

    // Fall back to word boundary
    if (breakIdx < splitAt * 0.3) {
      breakIdx = chunk.lastIndexOf(' ');
    }

    // Last resort: hard split
    if (breakIdx < splitAt * 0.3) {
      breakIdx = splitAt;
    }

    pages.push(remaining.slice(0, breakIdx).trim());
    remaining = remaining.slice(breakIdx).trim();
  }

  return pages.filter((p) => p.length > 0);
}

/**
 * corvid_library_write — Create or update a shared library entry.
 * Saves to SQLite and mints/updates a CRVLIB ASA on localnet.
 * Automatically splits large content into a multi-page book when it exceeds
 * the 1024-byte ARC-69 note limit.
 */
export async function handleLibraryWrite(
  ctx: McpToolContext,
  args: {
    key: string;
    content: string;
    category?: string;
    tags?: string[];
  },
): Promise<CallToolResult> {
  try {
    if (!LIBRARIAN_AGENT_IDS.has(ctx.agentId)) {
      return errorResult('Only agents with librarian role can write to the shared library');
    }

    const category = (args.category as LibraryCategory) ?? 'reference';
    if (!VALID_CATEGORIES.includes(category)) {
      return errorResult(`Invalid category "${args.category}". Valid: ${VALID_CATEGORIES.join(', ')}`);
    }
    const tags = args.tags ?? [];

    const agent = getAgent(ctx.db, ctx.agentId);
    const agentName = agent?.name ?? 'unknown';

    // Save full content to SQLite (local cache keeps the complete text)
    saveLibraryEntry(ctx.db, {
      authorId: ctx.agentId,
      authorName: agentName,
      key: args.key,
      content: args.content,
      category,
      tags,
    });

    // Mint or update on-chain
    const libCtx = await buildLibraryContext(ctx);
    if (!libCtx) {
      return textResult(
        `Library entry "${args.key}" saved to local cache (on-chain sync unavailable — no wallet/indexer).`,
      );
    }

    try {
      // Check if content fits in a single ASA
      const singleNoteSize = buildNotePayload(
        args.key,
        ctx.agentId,
        agentName,
        category,
        tags,
        args.content,
      ).byteLength;

      if (singleNoteSize <= MAX_NOTE_BYTES) {
        // Content fits — single entry (existing behavior)
        return await writeSingleEntry(ctx, libCtx, args.key, args.content, category, tags);
      }

      // Content too large — auto-split into a multi-page book
      return await writeBook(ctx, libCtx, args.key, args.content, category, tags, agentName);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('CRVLIB on-chain write failed', { key: args.key, error: message });
      return errorResult(`Library entry saved locally but on-chain write failed: ${message}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('MCP library_write failed', { error: message });
    return errorResult(`Failed to write library entry: ${message}`);
  }
}

/**
 * Write a single-page library entry (content fits in one ASA).
 */
async function writeSingleEntry(
  ctx: McpToolContext,
  libCtx: LibraryContext,
  key: string,
  content: string,
  category: LibraryCategory,
  tags: string[],
): Promise<CallToolResult> {
  const existingAsaId = resolveLibraryAsaId(ctx.db, key);

  if (existingAsaId) {
    const { readLibraryEntry, updateLibraryEntry } = await import('../../memory/arc69-library');
    const existing = await readLibraryEntry(libCtx, existingAsaId);
    if (!existing) {
      return errorResult(`Library ASA ${existingAsaId} exists but could not be read from chain.`);
    }
    const { txid } = await updateLibraryEntry(libCtx, existingAsaId, { key, content, category, tags }, existing);
    updateLibraryEntryTxid(ctx.db, key, txid);
    return textResult(`Library entry "${key}" updated (ASA: ${existingAsaId}).`);
  }

  const { createLibraryEntry } = await import('../../memory/arc69-library');
  const { asaId, txid } = await createLibraryEntry(libCtx, { key, content, category, tags });
  updateLibraryEntryAsaId(ctx.db, key, asaId);
  updateLibraryEntryTxid(ctx.db, key, txid);
  return textResult(`Library entry "${key}" published (ASA: ${asaId}).`);
}

/**
 * Write a multi-page book — splits content across linked ASAs.
 */
async function writeBook(
  ctx: McpToolContext,
  libCtx: LibraryContext,
  bookKey: string,
  content: string,
  category: LibraryCategory,
  tags: string[],
  agentName: string,
): Promise<CallToolResult> {
  const { createLibraryEntry, updateLibraryEntry, readLibraryEntry } = await import('../../memory/arc69-library');

  // Estimate max content per page using page-1 metadata as reference
  const maxChars = estimateMaxContentChars(`${bookKey}/page-1`, ctx.agentId, agentName, category, tags, {
    book: bookKey,
    page: 1,
    total: 1,
  });

  const pages = splitContentIntoPages(content, maxChars);
  const totalPages = pages.length;
  log.info('Auto-splitting into book', { bookKey, pages: totalPages, maxChars });

  // Create all pages sequentially with prev pointers (we know the ASA IDs as we go)
  const pageAsaIds: number[] = [];

  for (let i = 0; i < totalPages; i++) {
    const pageNum = i + 1;
    const pageKey = `${bookKey}/page-${pageNum}`;
    const prevAsaId = i > 0 ? pageAsaIds[i - 1] : undefined;

    const { asaId, txid } = await createLibraryEntry(libCtx, {
      key: pageKey,
      content: pages[i],
      category,
      tags,
      book: bookKey,
      page: pageNum,
      total: totalPages,
      ...(prevAsaId !== undefined ? { prev: prevAsaId } : {}),
    });

    pageAsaIds.push(asaId);

    // Save to local DB
    saveLibraryEntry(ctx.db, {
      authorId: ctx.agentId,
      authorName: agentName,
      key: pageKey,
      content: pages[i],
      category,
      tags,
      book: bookKey,
      page: pageNum,
    });
    updateLibraryEntryAsaId(ctx.db, pageKey, asaId);
    updateLibraryEntryTxid(ctx.db, pageKey, txid);
  }

  // Now wire up `next` pointers on all pages except the last.
  // We need to read each ASA from chain to get current state for the update.
  for (let i = 0; i < totalPages - 1; i++) {
    const existing = await readLibraryEntry(libCtx, pageAsaIds[i]);
    if (existing) {
      await updateLibraryEntry(
        libCtx,
        pageAsaIds[i],
        {
          key: existing.key,
          next: pageAsaIds[i + 1],
        },
        existing,
      );
    }
  }

  const asaList = pageAsaIds.map((id, i) => `page ${i + 1}: ASA ${id}`).join(', ');
  return textResult(`Library book "${bookKey}" published as ${pages.length} pages (${asaList}).`);
}

/**
 * corvid_library_read — Read a library entry by key, or search/list entries.
 */
export async function handleLibraryRead(
  ctx: McpToolContext,
  args: {
    key?: string;
    query?: string;
    category?: string;
    tag?: string;
    limit?: number;
  },
): Promise<CallToolResult> {
  try {
    // Exact key lookup
    if (args.key) {
      const entry = getLibraryEntry(ctx.db, args.key);
      if (!entry) {
        return textResult(`No library entry found with key "${args.key}".`);
      }
      const asaTag = entry.asaId ? `(ASA: ${entry.asaId})` : '(local only)';
      const tagStr = entry.tags.length > 0 ? `\nTags: ${entry.tags.join(', ')}` : '';
      return textResult(
        `[${entry.key}] (${entry.category}) by ${entry.authorName} ${asaTag}${tagStr}\n\n${entry.content}\n\n(updated: ${entry.updatedAt})`,
      );
    }

    // List/search
    const category = args.category as LibraryCategory | undefined;
    if (category && !VALID_CATEGORIES.includes(category)) {
      return errorResult(`Invalid category "${args.category}". Valid: ${VALID_CATEGORIES.join(', ')}`);
    }

    const entries = listLibraryEntries(ctx.db, {
      category,
      tag: args.tag,
      limit: args.limit ?? 20,
    });

    // If a query is provided, filter by content/key match
    let filtered = entries;
    if (args.query) {
      const q = args.query.toLowerCase();
      filtered = entries.filter((e) => e.key.toLowerCase().includes(q) || e.content.toLowerCase().includes(q));
    }

    if (filtered.length === 0) {
      const msg = args.query ? `No library entries found matching "${args.query}".` : 'No library entries found.';
      return textResult(msg);
    }

    const lines = filtered.map((e) => {
      const asaTag = e.asaId ? `[ASA: ${e.asaId}]` : '[local]';
      return `${asaTag} [${e.key}] (${e.category}) by ${e.authorName} — ${e.content.slice(0, 120)}${e.content.length > 120 ? '...' : ''}`;
    });
    return textResult(
      `Found ${filtered.length} library entr${filtered.length === 1 ? 'y' : 'ies'}:\n\n${lines.join('\n')}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('MCP library_read failed', { error: message });
    return errorResult(`Failed to read library: ${message}`);
  }
}

/**
 * corvid_library_list — List all on-chain CRVLIB entries (reads blockchain directly).
 */
export async function handleLibraryListOnChain(
  ctx: McpToolContext,
  args: {
    category?: string;
    tag?: string;
    limit?: number;
  },
): Promise<CallToolResult> {
  try {
    const libCtx = await buildLibraryContext(ctx);
    if (!libCtx) {
      return errorResult('Cannot list on-chain library: wallet/indexer unavailable.');
    }

    const { listLibraryEntries: listOnChain } = await import('../../memory/arc69-library');
    const category = args.category as LibraryCategory | undefined;
    const entries = await listOnChain(libCtx, {
      category,
      tag: args.tag,
      limit: args.limit ?? 50,
    });

    if (entries.length === 0) {
      return textResult('No CRVLIB entries found on-chain.');
    }

    const lines = entries.map((e) => {
      const tagStr = e.tags.length > 0 ? ` [${e.tags.join(', ')}]` : '';
      return `[ASA: ${e.asaId}] [${e.key}] (${e.category}) by ${e.authorName}${tagStr}\n  ${e.content.slice(0, 100)}${e.content.length > 100 ? '...' : ''}`;
    });
    return textResult(
      `Found ${entries.length} on-chain library entr${entries.length === 1 ? 'y' : 'ies'}:\n\n${lines.join('\n\n')}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('MCP library_list_on_chain failed', { error: message });
    return errorResult(`Failed to list on-chain library: ${message}`);
  }
}

/**
 * corvid_library_delete — Delete a shared library entry.
 */
export async function handleLibraryDelete(
  ctx: McpToolContext,
  args: { key: string; mode?: string },
): Promise<CallToolResult> {
  try {
    const entry = getLibraryEntry(ctx.db, args.key);
    if (!entry) {
      return errorResult(`No library entry found with key "${args.key}".`);
    }

    const mode = (args.mode === 'hard' ? 'hard' : 'soft') as 'soft' | 'hard';

    // Delete on-chain if ASA exists
    if (entry.asaId) {
      const libCtx = await buildLibraryContext(ctx);
      if (!libCtx) {
        return errorResult('Cannot delete on-chain: wallet/indexer unavailable.');
      }

      const { deleteLibraryEntry } = await import('../../memory/arc69-library');
      await deleteLibraryEntry(libCtx, entry.asaId, mode);
    }

    // Update local DB
    if (mode === 'hard') {
      deleteLibraryEntryRow(ctx.db, args.key);
    } else {
      archiveLibraryEntry(ctx.db, args.key);
    }

    const modeLabel = mode === 'hard' ? 'permanently deleted' : 'soft-deleted (archived)';
    const asaInfo = entry.asaId ? ` (ASA: ${entry.asaId})` : '';
    return textResult(`Library entry "${args.key}" ${modeLabel}${asaInfo}.`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('MCP library_delete failed', { error: message });
    return errorResult(`Failed to delete library entry: ${message}`);
  }
}

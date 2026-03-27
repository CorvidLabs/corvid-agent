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
import type { McpToolContext } from './types';
import { errorResult, textResult } from './types';

const log = createLogger('McpLibraryHandlers');

const VALID_CATEGORIES: LibraryCategory[] = ['guide', 'reference', 'decision', 'standard', 'runbook'];

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

/**
 * corvid_library_write — Create or update a shared library entry.
 * Saves to SQLite and mints/updates a CRVLIB ASA on localnet.
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
    const category = (args.category as LibraryCategory) ?? 'reference';
    if (!VALID_CATEGORIES.includes(category)) {
      return errorResult(`Invalid category "${args.category}". Valid: ${VALID_CATEGORIES.join(', ')}`);
    }
    const tags = args.tags ?? [];

    const agent = getAgent(ctx.db, ctx.agentId);
    const agentName = agent?.name ?? 'unknown';

    // Save to SQLite first
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
      const existingAsaId = resolveLibraryAsaId(ctx.db, args.key);

      if (existingAsaId) {
        const { readLibraryEntry, updateLibraryEntry } = await import('../../memory/arc69-library');
        const existing = await readLibraryEntry(libCtx, existingAsaId);
        if (!existing) {
          return errorResult(`Library ASA ${existingAsaId} exists but could not be read from chain.`);
        }
        const { txid } = await updateLibraryEntry(
          libCtx,
          existingAsaId,
          {
            key: args.key,
            content: args.content,
            category,
            tags,
          },
          existing,
        );
        updateLibraryEntryTxid(ctx.db, args.key, txid);
        return textResult(`Library entry "${args.key}" updated (ASA: ${existingAsaId}).`);
      } else {
        const { createLibraryEntry } = await import('../../memory/arc69-library');
        const { asaId, txid } = await createLibraryEntry(libCtx, {
          key: args.key,
          content: args.content,
          category,
          tags,
        });
        updateLibraryEntryAsaId(ctx.db, args.key, asaId);
        updateLibraryEntryTxid(ctx.db, args.key, txid);
        return textResult(`Library entry "${args.key}" published (ASA: ${asaId}).`);
      }
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

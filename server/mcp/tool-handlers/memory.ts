import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpToolContext } from './types';
import { textResult, errorResult } from './types';
import {
    saveMemory,
    recallMemory,
    searchMemories,
    listMemories,
    updateMemoryTxid,
    updateMemoryStatus,
    updateMemoryAsaId,
    archiveMemory,
    deleteMemoryRow,
} from '../../db/agent-memories';
import { encryptMemoryContent } from '../../lib/crypto';
import { createLogger } from '../../lib/logger';
import type { OnChainMemory } from '../../algochat/on-chain-transactor';
import type { Arc69Context } from '../../memory/arc69-store';

const log = createLogger('McpToolHandlers');

/**
 * Build an Arc69Context from the MCP tool context.
 * Returns null if any required component is unavailable (no wallet, no indexer, etc.)
 */
async function buildArc69Context(ctx: McpToolContext): Promise<Arc69Context | null> {
    try {
        const service = ctx.agentWalletService.getAlgoChatService();
        if (!service.indexerClient) return null;

        const chatAccountResult = await ctx.agentWalletService.getAgentChatAccount(ctx.agentId);
        if (!chatAccountResult) return null;

        return {
            db: ctx.db,
            agentId: ctx.agentId,
            algodClient: service.algodClient,
            indexerClient: service.indexerClient,
            chatAccount: chatAccountResult.account,
        };
    } catch {
        return null;
    }
}

/**
 * Search on-chain memories as a fallback when SQLite has no results.
 * Returns matching memories or null if none found / on error.
 */
async function searchOnChainFallback(
    ctx: McpToolContext,
    search: string,
): Promise<OnChainMemory[] | null> {
    try {
        const memories = await ctx.agentMessenger.readOnChainMemories(
            ctx.agentId,
            ctx.serverMnemonic,
            ctx.network,
            { limit: 20, search },
        );
        return memories.length > 0 ? memories : null;
    } catch (err) {
        log.debug('On-chain fallback search failed', {
            search,
            error: err instanceof Error ? err.message : String(err),
        });
        return null;
    }
}

export async function handleSaveMemory(
    ctx: McpToolContext,
    args: { key: string; content: string },
): Promise<CallToolResult> {
    try {
        saveMemory(ctx.db, {
            agentId: ctx.agentId,
            key: args.key,
            content: args.content,
        });

        return textResult(
            `Memory saved with key "${args.key}" (short-term, SQLite only). ` +
            `Use corvid_promote_memory to promote it to long-term on-chain storage.`,
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP save_memory failed', { error: message });
        return errorResult(`Failed to save memory: ${message}`);
    }
}

const PERMANENT_WRITE_WARNING =
    'WARNING: This will write a permanent, immutable record to the Algorand blockchain ' +
    'that can NEVER be modified or deleted. ' +
    'Permanent plain-transaction memories are reserved for attestations, verified facts, ' +
    'signed commitments, and audit-trail entries — not for general memories. ' +
    'To proceed, call corvid_promote_memory again with confirmed: true.';

export async function handlePromoteMemory(
    ctx: McpToolContext,
    args: { key: string; confirmed?: boolean },
): Promise<CallToolResult> {
    try {
        const memory = recallMemory(ctx.db, ctx.agentId, args.key);
        if (!memory) {
            return errorResult(`No memory found with key "${args.key}".`);
        }

        if (memory.status === 'confirmed' && memory.asaId) {
            return textResult(`Memory "${args.key}" is already on-chain (ASA: ${memory.asaId}).`);
        }

        const isLocalnet = ctx.network === 'localnet' || !ctx.network;

        if (isLocalnet) {
            const arc69Ctx = await buildArc69Context(ctx);
            if (!arc69Ctx) {
                return errorResult(
                    'Cannot promote memory: ARC-69 context unavailable (missing indexer or chat account).',
                );
            }

            try {
                const { createMemoryAsa, updateMemoryAsa, resolveAsaForKey } = await import('../../memory/arc69-store');
                const existingAsaId = resolveAsaForKey(ctx.db, ctx.agentId, args.key);

                if (existingAsaId) {
                    const { txid } = await updateMemoryAsa(arc69Ctx, existingAsaId, args.key, memory.content);
                    updateMemoryTxid(ctx.db, memory.id, txid);
                    updateMemoryStatus(ctx.db, memory.id, 'confirmed');
                    return textResult(`Memory "${args.key}" promoted to long-term storage (ASA: ${existingAsaId}).`);
                } else {
                    const { asaId, txid } = await createMemoryAsa(arc69Ctx, args.key, memory.content);
                    updateMemoryTxid(ctx.db, memory.id, txid);
                    updateMemoryAsaId(ctx.db, memory.id, asaId);
                    updateMemoryStatus(ctx.db, memory.id, 'confirmed');
                    return textResult(`Memory "${args.key}" promoted to long-term storage (ASA: ${asaId}).`);
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                log.error('ARC-69 memory promote failed', { key: args.key, error: message });
                updateMemoryStatus(ctx.db, memory.id, 'failed');
                return errorResult(`Failed to promote memory to ARC-69: ${message}`);
            }
        } else {
            // Testnet/mainnet: plain txn (immutable). Require explicit confirmation.
            if (!args.confirmed) {
                log.warn('Permanent memory write blocked — confirmation required', { key: args.key, agentId: ctx.agentId });
                return textResult(PERMANENT_WRITE_WARNING);
            }

            // fire-and-forget (costs ALGO, may be slow)
            updateMemoryStatus(ctx.db, memory.id, 'pending');
            encryptMemoryContent(memory.content, ctx.serverMnemonic, ctx.network).then((encrypted) => {
                return ctx.agentMessenger.sendOnChainToSelf(
                    ctx.agentId,
                    `[MEMORY:${args.key}] ${encrypted}`,
                );
            }).then((txid) => {
                if (txid) {
                    try {
                        updateMemoryTxid(ctx.db, memory.id, txid);
                    } catch {
                        // DB may be closed during test teardown — safe to ignore
                    }
                }
            }).catch((err) => {
                log.warn('On-chain memory promote failed', {
                    key: args.key,
                    error: err instanceof Error ? err.message : String(err),
                });
                try {
                    updateMemoryStatus(ctx.db, memory.id, 'failed');
                } catch {
                    // DB may be closed during test teardown — safe to ignore
                }
            });

            return textResult(`Memory "${args.key}" queued for promotion to long-term on-chain storage.`);
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP promote_memory failed', { error: message });
        return errorResult(`Failed to promote memory: ${message}`);
    }
}

export async function handleRecallMemory(
    ctx: McpToolContext,
    args: { key?: string; query?: string },
): Promise<CallToolResult> {
    try {
        if (args.key) {
            const memory = recallMemory(ctx.db, ctx.agentId, args.key);
            if (!memory) {
                // Fallback: search on-chain for the key
                const onChainResults = await searchOnChainFallback(ctx, args.key);
                if (onChainResults && onChainResults.length > 0) {
                    const found = onChainResults[0];
                    return textResult(`[${found.key}] ${found.content}\n(on-chain, txid: ${found.txid} | ${found.timestamp})\n(Note: this memory was found on-chain but missing from local cache. Use corvid_sync_on_chain_memories to restore.)`);
                }
                return textResult(`No memory found with key "${args.key}".`);
            }

            // ARC-69 memories show ASA ID instead of raw txid
            let chainTag: string;
            if (memory.asaId) {
                chainTag = `(on-chain, ASA: ${memory.asaId})`;
            } else if (memory.status === 'confirmed' && memory.txid) {
                chainTag = `(on-chain, txid: ${memory.txid})`;
            } else if (memory.status === 'pending') {
                chainTag = '(pending sync to on-chain)';
            } else {
                chainTag = '(sync-failed — will retry)';
            }
            return textResult(`[${memory.key}] ${memory.content}\n(saved: ${memory.updatedAt}) ${chainTag}`);
        }

        if (args.query) {
            const memories = searchMemories(ctx.db, ctx.agentId, args.query);
            if (memories.length === 0) {
                // Fallback: search on-chain
                const onChainResults = await searchOnChainFallback(ctx, args.query);
                if (onChainResults && onChainResults.length > 0) {
                    const lines = onChainResults.map((mem) => `[on-chain] [${mem.key}] ${mem.content}\n  (txid: ${mem.txid} | ${mem.timestamp})`);
                    return textResult(
                        `No local results, but found ${onChainResults.length} on-chain memor${onChainResults.length === 1 ? 'y' : 'ies'}:\n\n${lines.join('\n\n')}\n\n(Use corvid_sync_on_chain_memories to restore these to local cache.)`,
                    );
                }
                return textResult(`No memories found matching "${args.query}".`);
            }
            const lines = memories.map((m) => {
                const tag = m.asaId
                    ? `[ASA: ${m.asaId}]`
                    : m.status === 'confirmed' && m.txid ? `[on-chain: ${m.txid}]` : m.status === 'pending' ? `[pending]` : `[sync-failed]`;
                return `${tag} [${m.key}] ${m.content}`;
            });
            return textResult(`Found ${memories.length} memor${memories.length === 1 ? 'y' : 'ies'}:\n\n${lines.join('\n')}`);
        }

        // No key or query — list recent memories
        const memories = listMemories(ctx.db, ctx.agentId);
        if (memories.length === 0) {
            return textResult('No memories saved yet.');
        }
        const lines = memories.map((m) => {
            const tag = m.asaId
                ? `[ASA: ${m.asaId}]`
                : m.status === 'confirmed' ? `[on-chain]` : m.status === 'pending' ? `[pending]` : `[sync-failed]`;
            return `${tag} [${m.key}] ${m.content}`;
        });
        return textResult(`Your ${memories.length} most recent memor${memories.length === 1 ? 'y' : 'ies'}:\n\n${lines.join('\n')}`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP recall_memory failed', { error: message });
        return errorResult(`Failed to recall memory: ${message}`);
    }
}

export async function handleDeleteMemory(
    ctx: McpToolContext,
    args: { key: string; mode?: string },
): Promise<CallToolResult> {
    try {
        const memory = recallMemory(ctx.db, ctx.agentId, args.key);
        if (!memory) {
            return errorResult(`No memory found with key "${args.key}".`);
        }

        if (!memory.asaId) {
            return errorResult(
                `Memory "${args.key}" is a permanent (plain transaction) memory and cannot be deleted. ` +
                `Only long-term ARC-69 memories support deletion.`,
            );
        }

        const mode = (args.mode === 'hard' ? 'hard' : 'soft') as 'soft' | 'hard';

        const arc69Ctx = await buildArc69Context(ctx);
        if (!arc69Ctx) {
            return errorResult('Cannot delete memory: AlgoChat service or indexer unavailable.');
        }

        const { deleteMemoryAsa } = await import('../../memory/arc69-store');
        const { txid } = await deleteMemoryAsa(arc69Ctx, memory.asaId, mode);

        if (mode === 'hard') {
            deleteMemoryRow(ctx.db, ctx.agentId, args.key);
        } else {
            archiveMemory(ctx.db, ctx.agentId, args.key);
        }

        const modeLabel = mode === 'hard' ? 'permanently deleted' : 'soft-deleted (archived)';
        return textResult(`Memory "${args.key}" ${modeLabel}. (ASA: ${memory.asaId}, txid: ${txid})`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP delete_memory failed', { error: message });
        return errorResult(`Failed to delete memory: ${message}`);
    }
}

export async function handleReadOnChainMemories(
    ctx: McpToolContext,
    args: { search?: string; limit?: number },
): Promise<CallToolResult> {
    try {
        const allMemories: Array<{ key: string; content: string; txid: string; timestamp: string; asaId?: number; source: string }> = [];

        // 1. Read ARC-69 ASA memories (localnet) — this is the primary storage format
        const isLocalnet = ctx.network === 'localnet' || !ctx.network;
        if (isLocalnet) {
            try {
                const arc69Ctx = await buildArc69Context(ctx);
                if (arc69Ctx) {
                    const { listMemoryAsas } = await import('../../memory/arc69-store');
                    const asaMemories = await listMemoryAsas(arc69Ctx);
                    for (const m of asaMemories) {
                        if (args.search) {
                            const searchLower = args.search.toLowerCase();
                            if (!m.key.toLowerCase().includes(searchLower) && !m.content.toLowerCase().includes(searchLower)) {
                                continue;
                            }
                        }
                        allMemories.push({ ...m, source: 'arc69' });
                    }
                }
            } catch (err) {
                log.warn('ARC-69 ASA read failed in read_on_chain_memories', {
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }

        // 2. Read plain transaction memories
        const plainMemories = await ctx.agentMessenger.readOnChainMemories(
            ctx.agentId,
            ctx.serverMnemonic,
            ctx.network,
            { limit: args.limit ?? 50, search: args.search },
        );

        // Deduplicate: skip plain txn memories whose key already appeared in ARC-69 results
        const arc69Keys = new Set(allMemories.map(m => m.key));
        for (const m of plainMemories) {
            if (!arc69Keys.has(m.key)) {
                allMemories.push({ ...m, source: 'txn' });
            }
        }

        if (allMemories.length === 0) {
            const msg = args.search
                ? `No on-chain memories found matching "${args.search}".`
                : 'No on-chain memories found.';
            return textResult(msg);
        }

        const lines = allMemories.map((m) => {
            const id = m.asaId ? `ASA ${m.asaId}` : `txid: ${m.txid}`;
            return `[${m.key}] ${m.content}\n  (${id} | ${m.timestamp})`;
        });

        return textResult(
            `Found ${allMemories.length} on-chain memor${allMemories.length === 1 ? 'y' : 'ies'}:\n\n${lines.join('\n\n')}`,
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP read_on_chain_memories failed', { error: message });
        return errorResult(`Failed to read on-chain memories: ${message}`);
    }
}

export async function handleSyncOnChainMemories(
    ctx: McpToolContext,
    args: { limit?: number },
): Promise<CallToolResult> {
    try {
        let synced = 0;
        let skipped = 0;
        let asaSynced = 0;

        // 1. Sync ARC-69 ASA memories (localnet only)
        const isLocalnet = ctx.network === 'localnet' || !ctx.network;
        if (isLocalnet) {
            try {
                const arc69Ctx = await buildArc69Context(ctx);
                if (arc69Ctx) {
                    const { listMemoryAsas } = await import('../../memory/arc69-store');
                    const asaMemories = await listMemoryAsas(arc69Ctx);

                    for (const m of asaMemories) {
                        const existing = recallMemory(ctx.db, ctx.agentId, m.key);
                        if (existing) {
                            if (!existing.asaId) {
                                // Local row exists but doesn't know about its ASA — update it
                                updateMemoryAsaId(ctx.db, existing.id, m.asaId);
                                updateMemoryTxid(ctx.db, existing.id, m.txid);
                                asaSynced++;
                            } else {
                                skipped++;
                            }
                        } else {
                            // Restore from chain to SQLite
                            const saved = saveMemory(ctx.db, {
                                agentId: ctx.agentId,
                                key: m.key,
                                content: m.content,
                            });
                            updateMemoryTxid(ctx.db, saved.id, m.txid);
                            updateMemoryAsaId(ctx.db, saved.id, m.asaId);
                            asaSynced++;
                        }
                    }
                }
            } catch (err) {
                log.warn('ARC-69 ASA sync failed', {
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }

        // 2. Sync plain transaction memories (existing path)
        const memories = await ctx.agentMessenger.readOnChainMemories(
            ctx.agentId,
            ctx.serverMnemonic,
            ctx.network,
            { limit: args.limit ?? 200 },
        );

        for (const m of memories) {
            const existing = recallMemory(ctx.db, ctx.agentId, m.key);
            if (existing) {
                if (existing.status !== 'confirmed' && m.txid) {
                    updateMemoryTxid(ctx.db, existing.id, m.txid);
                    synced++;
                } else {
                    skipped++;
                }
            } else {
                const saved = saveMemory(ctx.db, {
                    agentId: ctx.agentId,
                    key: m.key,
                    content: m.content,
                });
                updateMemoryTxid(ctx.db, saved.id, m.txid);
                synced++;
            }
        }

        const totalSynced = synced + asaSynced;
        const parts: string[] = [];
        if (totalSynced > 0) parts.push(`${totalSynced} memor${totalSynced === 1 ? 'y' : 'ies'} restored/updated`);
        if (asaSynced > 0) parts.push(`(${asaSynced} from ARC-69 ASAs)`);
        if (skipped > 0) parts.push(`${skipped} already up-to-date`);

        return textResult(
            `Sync complete: ${parts.join(', ')}.` +
            `\nTotal on-chain: ${memories.length} plain txns` +
            (asaSynced > 0 ? ` + ${asaSynced} ASAs` : ''),
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP sync_on_chain_memories failed', { error: message });
        return errorResult(`Failed to sync on-chain memories: ${message}`);
    }
}

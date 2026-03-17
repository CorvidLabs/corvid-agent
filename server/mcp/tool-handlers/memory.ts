import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpToolContext } from './types';
import { textResult, errorResult } from './types';
import { saveMemory, recallMemory, searchMemories, listMemories, updateMemoryTxid, updateMemoryStatus } from '../../db/agent-memories';
import { encryptMemoryContent } from '../../lib/crypto';
import { createLogger } from '../../lib/logger';
import type { OnChainMemory } from '../../algochat/on-chain-transactor';

const log = createLogger('McpToolHandlers');

export async function handleSaveMemory(
    ctx: McpToolContext,
    args: { key: string; content: string },
): Promise<CallToolResult> {
    try {
        const memory = saveMemory(ctx.db, {
            agentId: ctx.agentId,
            key: args.key,
            content: args.content,
        });

        const isLocalnet = ctx.network === 'localnet' || !ctx.network;

        if (isLocalnet) {
            // Localnet: await on-chain write — zero cost, always available
            try {
                const encrypted = await encryptMemoryContent(args.content, ctx.serverMnemonic, ctx.network);
                const txid = await ctx.agentMessenger.sendOnChainToSelf(
                    ctx.agentId,
                    `[MEMORY:${args.key}] ${encrypted}`,
                );
                if (txid) {
                    updateMemoryTxid(ctx.db, memory.id, txid);
                    return textResult(`Memory saved with key "${args.key}".`);
                }
                // sendOnChainToSelf returned null — no wallet configured
                return textResult(`Memory saved with key "${args.key}".`);
            } catch (err) {
                log.warn('On-chain memory send failed (localnet)', {
                    key: args.key,
                    error: err instanceof Error ? err.message : String(err),
                });
                updateMemoryStatus(ctx.db, memory.id, 'failed');
                // Local save succeeded — don't expose on-chain failure to the model
                // (confusing error text causes Ollama models to retry the save)
                return textResult(`Memory saved with key "${args.key}".`);
            }
        } else {
            // Testnet/mainnet: fire-and-forget (costs ALGO, may be slow)
            encryptMemoryContent(args.content, ctx.serverMnemonic, ctx.network).then((encrypted) => {
                return ctx.agentMessenger.sendOnChainToSelf(
                    ctx.agentId,
                    `[MEMORY:${args.key}] ${encrypted}`,
                );
            }).then((txid) => {
                if (txid) {
                    updateMemoryTxid(ctx.db, memory.id, txid);
                }
            }).catch((err) => {
                log.debug('On-chain memory send failed', {
                    error: err instanceof Error ? err.message : String(err),
                });
                updateMemoryStatus(ctx.db, memory.id, 'failed');
            });

            return textResult(`Memory saved with key "${args.key}".`);
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP save_memory failed', { error: message });
        return errorResult(`Failed to save memory: ${message}`);
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
                return textResult(`No memory found with key "${args.key}".`);
            }
            const chainTag = memory.status === 'confirmed' ? `(on-chain: ${memory.txid?.slice(0, 8)}...)` : memory.status === 'pending' ? '(pending)' : '(sync-failed — will retry)';
            return textResult(`[${memory.key}] ${memory.content}\n(saved: ${memory.updatedAt}) ${chainTag}`);
        }

        if (args.query) {
            const memories = searchMemories(ctx.db, ctx.agentId, args.query);
            if (memories.length === 0) {
                return textResult(`No memories found matching "${args.query}".`);
            }
            const lines = memories.map((m) => {
                const tag = m.status === 'confirmed' ? `[on-chain]` : m.status === 'pending' ? `[pending]` : `[sync-failed]`;
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
            const tag = m.status === 'confirmed' ? `[on-chain]` : m.status === 'pending' ? `[pending]` : `[sync-failed]`;
            return `${tag} [${m.key}] ${m.content}`;
        });
        return textResult(`Your ${memories.length} most recent memor${memories.length === 1 ? 'y' : 'ies'}:\n\n${lines.join('\n')}`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP recall_memory failed', { error: message });
        return errorResult(`Failed to recall memory: ${message}`);
    }
}

export async function handleReadOnChainMemories(
    ctx: McpToolContext,
    args: { search?: string; limit?: number },
): Promise<CallToolResult> {
    try {
        const memories = await ctx.agentMessenger.readOnChainMemories(
            ctx.agentId,
            ctx.serverMnemonic,
            ctx.network,
            { limit: args.limit ?? 50, search: args.search },
        );

        if (memories.length === 0) {
            const msg = args.search
                ? `No on-chain memories found matching "${args.search}".`
                : 'No on-chain memories found.';
            return textResult(msg);
        }

        const lines = memories.map((m: OnChainMemory) =>
            `[${m.key}] ${m.content}\n  (txid: ${m.txid.slice(0, 12)}... | ${m.timestamp})`,
        );

        return textResult(
            `Found ${memories.length} on-chain memor${memories.length === 1 ? 'y' : 'ies'}:\n\n${lines.join('\n\n')}`,
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
        const memories = await ctx.agentMessenger.readOnChainMemories(
            ctx.agentId,
            ctx.serverMnemonic,
            ctx.network,
            { limit: args.limit ?? 200 },
        );

        if (memories.length === 0) {
            return textResult('No on-chain memories found to sync.');
        }

        let synced = 0;
        let skipped = 0;

        for (const m of memories) {
            const existing = recallMemory(ctx.db, ctx.agentId, m.key);
            if (existing) {
                // Update txid if local copy exists but isn't confirmed
                if (existing.status !== 'confirmed' && m.txid) {
                    updateMemoryTxid(ctx.db, existing.id, m.txid);
                    synced++;
                } else {
                    skipped++;
                }
            } else {
                // Restore memory from on-chain to local SQLite
                const saved = saveMemory(ctx.db, {
                    agentId: ctx.agentId,
                    key: m.key,
                    content: m.content,
                });
                updateMemoryTxid(ctx.db, saved.id, m.txid);
                synced++;
            }
        }

        return textResult(
            `Sync complete: ${synced} memor${synced === 1 ? 'y' : 'ies'} restored/updated, ${skipped} already up-to-date.` +
            `\nTotal on-chain: ${memories.length}`,
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP sync_on_chain_memories failed', { error: message });
        return errorResult(`Failed to sync on-chain memories: ${message}`);
    }
}

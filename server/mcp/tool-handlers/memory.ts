import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpToolContext } from './types';
import { textResult, errorResult } from './types';
import { saveMemory, recallMemory, searchMemories, listMemories, updateMemoryTxid, updateMemoryStatus } from '../../db/agent-memories';
import { encryptMemoryContent } from '../../lib/crypto';
import { createLogger } from '../../lib/logger';

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

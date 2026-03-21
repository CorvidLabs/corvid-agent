/**
 * MCP tool handler for the Flock Directory — agent registry operations.
 */
import type { McpToolContext } from './types';
import { textResult, errorResult } from './types';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createLogger } from '../../lib/logger';

const log = createLogger('FlockDirectoryTool');

export async function handleFlockDirectory(
    ctx: McpToolContext,
    args: {
        action: string;
        agent_id?: string;
        address?: string;
        name?: string;
        description?: string;
        instance_url?: string;
        capabilities?: string;
        query?: string;
        capability?: string;
        min_reputation?: number;
        sort_by?: string;
        sort_order?: string;
        limit?: number;
    },
): Promise<CallToolResult> {
    if (!ctx.flockDirectoryService) {
        return errorResult('Flock Directory service is not available.');
    }

    const svc = ctx.flockDirectoryService;

    try {
        switch (args.action) {
            case 'register': {
                if (!args.address || !args.name) {
                    return errorResult('register requires address and name');
                }
                const caps = args.capabilities ? args.capabilities.split(',').map(s => s.trim()).filter(Boolean) : [];
                const agent = await svc.register({
                    address: args.address,
                    name: args.name,
                    description: args.description,
                    instanceUrl: args.instance_url,
                    capabilities: caps,
                });
                return textResult(`Registered agent "${agent.name}" (${agent.id}) at address ${agent.address}`);
            }

            case 'deregister': {
                if (!args.agent_id) return errorResult('deregister requires agent_id');
                const ok = await svc.deregister(args.agent_id);
                return ok
                    ? textResult(`Agent ${args.agent_id} deregistered.`)
                    : errorResult(`Agent ${args.agent_id} not found or already deregistered.`);
            }

            case 'heartbeat': {
                if (!args.agent_id) return errorResult('heartbeat requires agent_id');
                const ok = await svc.heartbeat(args.agent_id);
                return ok
                    ? textResult(`Heartbeat recorded for agent ${args.agent_id}.`)
                    : errorResult(`Agent ${args.agent_id} not found.`);
            }

            case 'lookup': {
                const agent = args.agent_id
                    ? svc.getById(args.agent_id)
                    : args.address
                        ? svc.getByAddress(args.address)
                        : null;
                if (!agent) return errorResult('Agent not found. Provide agent_id or address.');
                return textResult(JSON.stringify(agent, null, 2));
            }

            case 'compute_reputation': {
                if (!args.agent_id) return errorResult('compute_reputation requires agent_id');
                const agent = svc.computeReputation(args.agent_id);
                if (!agent) return errorResult(`Agent ${args.agent_id} not found or deregistered.`);
                return textResult(`Reputation score for "${agent.name}": ${agent.reputationScore}/100`);
            }

            case 'search': {
                const sortBy = args.sort_by as import('../../../shared/types/flock-directory').FlockSortField | undefined;
                const sortOrder = args.sort_order as import('../../../shared/types/flock-directory').FlockSortOrder | undefined;
                const result = svc.search({
                    query: args.query,
                    capability: args.capability,
                    minReputation: args.min_reputation,
                    sortBy,
                    sortOrder,
                    limit: args.limit ?? 20,
                });
                const lines = [
                    `Found ${result.total} agent(s) (showing ${result.agents.length}):`,
                    ...result.agents.map(a =>
                        `  ${a.name} (${a.address.slice(0, 8)}…) — rep: ${a.reputationScore}, status: ${a.status}`,
                    ),
                ];
                return textResult(lines.join('\n'));
            }

            case 'list': {
                const agents = svc.listActive(args.limit ?? 20);
                const lines = [
                    `${agents.length} active agent(s):`,
                    ...agents.map(a =>
                        `  ${a.name} (${a.address.slice(0, 8)}…) — rep: ${a.reputationScore}`,
                    ),
                ];
                return textResult(lines.join('\n'));
            }

            case 'stats': {
                const stats = svc.getStats();
                const onChainInfo = stats.onChainAppId
                    ? `, on-chain app ID: ${stats.onChainAppId}`
                    : ', on-chain: not connected';
                return textResult(`Flock Directory: ${stats.total} registered, ${stats.active} active, ${stats.inactive} inactive${onChainInfo}`);
            }

            case 'sync': {
                if (!args.address) return errorResult('sync requires address');
                const record = await svc.syncFromChain(args.address);
                if (!record) return errorResult('On-chain sync not available or agent not found on-chain.');
                return textResult(`On-chain record for ${args.address}:\n${JSON.stringify(record, null, 2)}`);
            }

            default:
                return errorResult(
                    `Unknown action "${args.action}". Valid actions: register, deregister, heartbeat, lookup, search, list, stats, sync, compute_reputation`,
                );
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Flock Directory tool failed', { action: args.action, error: message });
        return errorResult(`Flock Directory operation failed: ${message}`);
    }
}

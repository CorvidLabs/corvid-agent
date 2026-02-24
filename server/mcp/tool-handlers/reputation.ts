import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpToolContext } from './types';
import { textResult, errorResult } from './types';
import { getRecentSnapshots, computeTrends, formatTrendsForPrompt } from '../../improvement/health-store';
import { createLogger } from '../../lib/logger';

const log = createLogger('McpToolHandlers');

export async function handleCheckReputation(
    ctx: McpToolContext,
    args: { agent_id?: string },
): Promise<CallToolResult> {
    if (!ctx.reputationScorer) {
        return errorResult('Reputation service is not available.');
    }

    try {
        const targetId = args.agent_id ?? ctx.agentId;
        const score = ctx.reputationScorer.computeScore(targetId);
        const events = ctx.reputationScorer.getEvents(targetId, 10);

        const eventLines = events.length > 0
            ? events.map((e) => `  - [${e.created_at}] ${e.event_type} (impact: ${e.score_impact})`).join('\n')
            : '  No recent events.';

        return textResult(
            `Reputation for ${targetId}:\n` +
            `  Overall: ${score.overallScore}/100\n` +
            `  Trust Level: ${score.trustLevel}\n` +
            `  Components:\n` +
            `    Task Completion: ${score.components.taskCompletion}\n` +
            `    Peer Rating: ${score.components.peerRating}\n` +
            `    Credit Pattern: ${score.components.creditPattern}\n` +
            `    Security Compliance: ${score.components.securityCompliance}\n` +
            `    Activity Level: ${score.components.activityLevel}\n` +
            `  Attestation Hash: ${score.attestationHash ?? 'none'}\n` +
            `  Computed At: ${score.computedAt}\n\n` +
            `Recent Events:\n${eventLines}`,
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP check_reputation failed', { error: message });
        return errorResult(`Failed to check reputation: ${message}`);
    }
}

export async function handleCheckHealthTrends(
    ctx: McpToolContext,
    args: { agent_id?: string; project_id?: string; limit?: number },
): Promise<CallToolResult> {
    try {
        const agentId = args.agent_id ?? ctx.agentId;
        const projectId = args.project_id;
        if (!projectId) {
            return errorResult('project_id is required.');
        }

        const snapshots = getRecentSnapshots(ctx.db, agentId, projectId, args.limit ?? 10);
        if (snapshots.length === 0) {
            return textResult('No health snapshots found. Run the improvement loop at least once to collect data.');
        }

        const trends = computeTrends(snapshots);
        const trendText = formatTrendsForPrompt(trends);

        const latest = snapshots[0];
        return textResult(
            `Health Trends (${snapshots.length} snapshots):\n\n` +
            `Latest snapshot (${latest.collectedAt}):\n` +
            `  TSC errors: ${latest.tscErrorCount} (${latest.tscPassed ? 'PASSING' : 'FAILING'})\n` +
            `  Test failures: ${latest.testFailureCount} (${latest.testsPassed ? 'PASSING' : 'FAILING'})\n` +
            `  TODOs: ${latest.todoCount}, FIXMEs: ${latest.fixmeCount}, HACKs: ${latest.hackCount}\n` +
            `  Large files: ${latest.largeFileCount}, Outdated deps: ${latest.outdatedDepCount}\n\n` +
            `Trend Analysis:\n${trendText}`,
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP check_health_trends failed', { error: message });
        return errorResult(`Failed to check health trends: ${message}`);
    }
}

export async function handlePublishAttestation(
    ctx: McpToolContext,
    args: { agent_id?: string },
): Promise<CallToolResult> {
    if (!ctx.reputationScorer || !ctx.reputationAttestation) {
        return errorResult('Reputation services are not available.');
    }

    try {
        const targetId = args.agent_id ?? ctx.agentId;
        ctx.emitStatus?.('Computing reputation score...');

        const score = ctx.reputationScorer.computeScore(targetId);
        const hash = await ctx.reputationAttestation.createAttestation(score);

        ctx.emitStatus?.('Publishing attestation on-chain...');

        // Attempt on-chain publish via agent wallet
        let txid: string | null = null;
        try {
            txid = await ctx.reputationAttestation.publishOnChain(
                targetId,
                hash,
                async (note: string) => {
                    const result = await ctx.agentMessenger.sendOnChainToSelf(targetId, note);
                    if (!result) throw new Error('No wallet configured for on-chain publish');
                    return result;
                },
            );
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            log.warn('On-chain attestation publish failed', { error: errMsg });
        }

        ctx.reputationScorer.setAttestationHash(targetId, hash);

        const result = txid
            ? `Attestation published on-chain!\n  Hash: ${hash}\n  Txid: ${txid}\n  Score: ${score.overallScore}/100 (${score.trustLevel})`
            : `Attestation created (off-chain only — no wallet available).\n  Hash: ${hash}\n  Score: ${score.overallScore}/100 (${score.trustLevel})`;

        return textResult(result);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP publish_attestation failed', { error: message });
        return errorResult(`Failed to publish attestation: ${message}`);
    }
}

export async function handleVerifyAgentReputation(
    ctx: McpToolContext,
    args: { wallet_address?: string },
): Promise<CallToolResult> {
    if (!ctx.reputationVerifier) {
        return errorResult('Reputation verifier is not available.');
    }

    if (!args.wallet_address) {
        return errorResult('wallet_address is required.');
    }

    try {
        ctx.emitStatus?.(`Scanning on-chain attestations for ${args.wallet_address.slice(0, 8)}...`);

        const result = await ctx.reputationVerifier.checkRemoteTrust(args.wallet_address);

        const attestationLines = result.attestations.length > 0
            ? result.attestations.slice(0, 10).map((a) =>
                `  - [${a.timestamp || 'unknown'}] agent=${a.agentId} hash=${a.hash.slice(0, 16)}... txid=${a.txid.slice(0, 8)}...`
            ).join('\n')
            : '  No attestations found.';

        return textResult(
            `Remote Trust Check: ${args.wallet_address}\n` +
            `  Trust Level: ${result.trustLevel}\n` +
            `  Attestation Count: ${result.attestationCount}\n` +
            `  Meets Minimum: ${result.meetsMinimum ? 'yes' : 'no'}\n\n` +
            `Attestations:\n${attestationLines}`,
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP verify_agent_reputation failed', { error: message });
        return errorResult(`Failed to verify agent reputation: ${message}`);
    }
}

/**
 * Flock Directory automated agent testing schedule handler.
 *
 * Runs the test suite against all active agents in the Flock Directory,
 * scoring them on responsiveness, accuracy, context, efficiency, safety,
 * and bot verification. Uses A2A HTTP transport to avoid self-test deadlocks
 * and keep test conversations off-chain.
 */
import type { AgentSchedule } from '../../../shared/types';
import { updateExecutionStatus } from '../../db/schedules';
import { getAgentByWalletAddress } from '../../db/agents';
import { FlockDirectoryService } from '../../flock-directory/service';
import { FlockTestRunner, type TestRunConfig } from '../../flock-directory/testing/runner';
import { createA2ATransport } from '../../flock-directory/testing/a2a-transport';
import { createLogger } from '../../lib/logger';
import type { HandlerContext } from './types';

const log = createLogger('FlockTestingHandler');

/**
 * Run automated tests against all active Flock Directory agents.
 *
 * For each active agent:
 * 1. Runs the full test suite (or random subset based on schedule config)
 * 2. Records results to the database
 * 3. Updates the agent's reputation score with the test-derived score
 *
 * Uses A2A HTTP transport so test challenges go over standard HTTP,
 * keeping test conversations off-chain while results are recorded on-chain.
 */
export async function execFlockTesting(
    ctx: HandlerContext,
    executionId: string,
    schedule: AgentSchedule,
): Promise<void> {
    try {
        const flockService = new FlockDirectoryService(ctx.db);
        const activeAgents = flockService.listActive();

        if (activeAgents.length === 0) {
            updateExecutionStatus(ctx.db, executionId, 'completed', {
                result: 'No active agents in Flock Directory to test',
            });
            return;
        }

        const transport = createA2ATransport(ctx.db);
        const runner = new FlockTestRunner(ctx.db, transport);

        const config: TestRunConfig = {
            mode: 'full',
            decayPerDay: 0.02,
        };

        const results: { agentId: string; name: string; score: number; responded: number; total: number }[] = [];

        for (const agent of activeAgents) {
            // Skip self-testing — resolve wallet address to agent UUID for comparison
            const resolvedAgent = getAgentByWalletAddress(ctx.db, agent.address);
            if (resolvedAgent && resolvedAgent.id === schedule.agentId) {
                log.debug('Skipping self-test', { agentId: agent.id });
                continue;
            }

            try {
                log.info('Testing agent', { agentId: agent.id, name: agent.name });
                const result = await runner.runTest(agent.id, agent.address, config);

                results.push({
                    agentId: agent.id,
                    name: agent.name,
                    score: result.overallScore,
                    responded: result.challengeResults.filter((r) => r.responded).length,
                    total: result.challengeResults.length,
                });

                log.info('Agent test completed', {
                    agentId: agent.id,
                    score: result.overallScore,
                });
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                log.warn('Agent test failed', { agentId: agent.id, error: message });
                results.push({
                    agentId: agent.id,
                    name: agent.name,
                    score: 0,
                    responded: 0,
                    total: 0,
                });
            }
        }

        const summary = results
            .map((r) => `${r.name}: ${r.score}/100 (${r.responded}/${r.total} responded)`)
            .join('; ');

        updateExecutionStatus(ctx.db, executionId, 'completed', {
            result: `Tested ${results.length} agents. ${summary}`,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        updateExecutionStatus(ctx.db, executionId, 'failed', { result: message });
    }
}

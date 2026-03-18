/**
 * Flock Directory automated agent testing schedule handler.
 *
 * Runs the test suite against all active agents in the Flock Directory,
 * scoring them on responsiveness, accuracy, context, efficiency, safety,
 * and bot verification. Updates reputation scores based on test results.
 */
import type { AgentSchedule } from '../../../shared/types';
import { updateExecutionStatus } from '../../db/schedules';
import { FlockDirectoryService } from '../../flock-directory/service';
import { FlockTestRunner, type TestTransport, type TestRunConfig } from '../../flock-directory/testing/runner';
import { createLogger } from '../../lib/logger';
import type { HandlerContext } from './types';

const log = createLogger('FlockTestingHandler');

/**
 * AlgoChat-based test transport.
 * Sends a message to an agent via AlgoChat and waits for a response.
 */
function createAlgoChatTransport(ctx: HandlerContext, senderAgentId: string): TestTransport {
    return {
        async sendAndWait(agentAddress: string, message: string, timeoutMs: number): Promise<string | null> {
            if (!ctx.agentMessenger) return null;

            try {
                const result = await ctx.agentMessenger.invokeAndWait(
                    {
                        fromAgentId: senderAgentId,
                        toAgentId: agentAddress,
                        content: `[FLOCK-TEST] ${message}`,
                    },
                    timeoutMs,
                );
                return result.response;
            } catch {
                return null;
            }
        },
    };
}

/**
 * Run automated tests against all active Flock Directory agents.
 *
 * For each active agent:
 * 1. Runs the full test suite (or random subset based on schedule config)
 * 2. Records results to the database
 * 3. Updates the agent's reputation score with the test-derived score
 */
export async function execFlockTesting(
    ctx: HandlerContext,
    executionId: string,
    schedule: AgentSchedule,
): Promise<void> {
    if (!ctx.agentMessenger) {
        updateExecutionStatus(ctx.db, executionId, 'failed', {
            result: 'Agent messenger not configured — cannot send test challenges',
        });
        return;
    }

    try {
        const flockService = new FlockDirectoryService(ctx.db);
        const activeAgents = flockService.listActive();

        if (activeAgents.length === 0) {
            updateExecutionStatus(ctx.db, executionId, 'completed', {
                result: 'No active agents in Flock Directory to test',
            });
            return;
        }

        const transport = createAlgoChatTransport(ctx, schedule.agentId);
        const runner = new FlockTestRunner(ctx.db, transport);

        const config: TestRunConfig = {
            mode: 'full',
            decayPerDay: 0.02,
        };

        const results: { agentId: string; name: string; score: number; responded: number; total: number }[] = [];

        for (const agent of activeAgents) {
            // Skip self-testing
            if (agent.address === schedule.agentId) {
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

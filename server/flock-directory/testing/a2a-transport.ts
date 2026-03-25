/**
 * A2A HTTP transport for Flock Directory agent testing.
 *
 * Sends test challenges to agents via the A2A protocol (HTTP POST to /a2a/tasks/send)
 * instead of AlgoChat. This avoids self-test deadlocks and keeps test conversations
 * off-chain while still recording scores to the contract.
 *
 * Agent instance URLs come from the Flock Directory registry.
 */
import type { Database } from 'bun:sqlite';
import type { TestTransport } from './runner';
import { FlockDirectoryService } from '../service';
import { createLogger } from '../../lib/logger';

const log = createLogger('FlockA2ATransport');

/**
 * Create an A2A HTTP transport that sends test challenges via /a2a/tasks/send.
 *
 * Looks up the agent's instance_url from the Flock Directory, then submits an
 * A2A task and polls for completion.
 */
export function createA2ATransport(db: Database): TestTransport {
    const flockService = new FlockDirectoryService(db);

    return {
        async sendAndWait(agentAddress: string, message: string, timeoutMs: number, _threadId?: string): Promise<string | null> {
            // Resolve Algorand address → instance URL
            const agent = flockService.getByAddress(agentAddress);
            if (!agent) {
                log.warn('No agent found for wallet address', { agentAddress });
                return null;
            }

            if (!agent.instanceUrl) {
                log.warn('Agent has no instance URL configured', { agentId: agent.id, name: agent.name });
                return null;
            }

            const baseUrl = agent.instanceUrl.replace(/\/+$/, '');

            try {
                // Step 1: Submit A2A task
                const submitResponse = await fetch(`${baseUrl}/a2a/tasks/send`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'CorvidAgent/FlockTester',
                    },
                    body: JSON.stringify({
                        params: {
                            message: `[FLOCK-TEST] ${message}`,
                            timeoutMs,
                        },
                    }),
                    signal: AbortSignal.timeout(Math.min(timeoutMs, 30_000)),
                });

                if (!submitResponse.ok) {
                    log.warn('A2A task submit failed', {
                        agentId: agent.id,
                        status: submitResponse.status,
                    });
                    return null;
                }

                const task = await submitResponse.json() as { id: string; state: string };
                const taskId = task.id;

                // Step 2: Poll until completed/failed/timeout
                const deadline = Date.now() + timeoutMs;
                const pollIntervalMs = 2000;

                while (Date.now() < deadline) {
                    try {
                        const pollResponse = await fetch(`${baseUrl}/a2a/tasks/${taskId}`, {
                            headers: { 'User-Agent': 'CorvidAgent/FlockTester' },
                            signal: AbortSignal.timeout(10_000),
                        });

                        if (pollResponse.ok) {
                            const pollResult = await pollResponse.json() as {
                                id: string;
                                state: string;
                                messages?: Array<{ role: string; parts: Array<{ text: string }> }>;
                            };

                            if (pollResult.state === 'completed' || pollResult.state === 'failed') {
                                const agentMessages = (pollResult.messages ?? []).filter((m) => m.role === 'agent');
                                const lastMessage = agentMessages[agentMessages.length - 1];
                                return lastMessage?.parts?.[0]?.text ?? null;
                            }
                        }
                    } catch {
                        // Poll failure — retry
                    }

                    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
                }

                log.warn('A2A test timed out', { agentId: agent.id, taskId, timeoutMs });
                return null;
            } catch (err) {
                log.warn('A2A transport error', {
                    agentId: agent.id,
                    error: err instanceof Error ? err.message : String(err),
                });
                return null;
            }
        },
    };
}

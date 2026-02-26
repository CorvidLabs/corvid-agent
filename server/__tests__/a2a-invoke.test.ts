/**
 * Tests for A2A remote agent invocation client.
 *
 * Validates invokeRemoteAgent: task submission, polling, success/failure
 * handling, taskId propagation, and timeout behaviour.
 */
import { describe, it, expect, mock, afterEach } from 'bun:test';
import { invokeRemoteAgent } from '../a2a/client';

const BASE_URL = 'https://remote-agent.example.com';
const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a completed-task poll response with an agent message. */
function completedTaskResponse(taskId: string, agentText: string) {
    return {
        id: taskId,
        state: 'completed',
        messages: [
            { role: 'user', parts: [{ text: 'hello' }] },
            { role: 'agent', parts: [{ text: agentText }] },
        ],
    };
}

/** Build a failed-task poll response with an agent message. */
function failedTaskResponse(taskId: string, agentText: string) {
    return {
        id: taskId,
        state: 'failed',
        messages: [
            { role: 'user', parts: [{ text: 'hello' }] },
            { role: 'agent', parts: [{ text: agentText }] },
        ],
    };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('invokeRemoteAgent', () => {
    it('returns success when remote agent completes', async () => {
        globalThis.fetch = mock((url: string, _opts?: RequestInit) => {
            if (url.includes('/a2a/tasks/send')) {
                return Promise.resolve(
                    new Response(JSON.stringify({ id: 'task-200', state: 'submitted' }), { status: 200 }),
                );
            }
            if (url.includes('/a2a/tasks/task-200')) {
                return Promise.resolve(
                    new Response(JSON.stringify(completedTaskResponse('task-200', 'All done!')), { status: 200 }),
                );
            }
            return Promise.resolve(new Response('Not found', { status: 404 }));
        }) as unknown as typeof fetch;

        const result = await invokeRemoteAgent(BASE_URL, 'Do something');

        expect(result.success).toBe(true);
        expect(result.responseText).toBe('All done!');
        expect(result.error).toBeNull();
    });

    it('returns error when submit request fails with non-ok response', async () => {
        globalThis.fetch = mock((url: string, _opts?: RequestInit) => {
            if (url.includes('/a2a/tasks/send')) {
                return Promise.resolve(
                    new Response('Service Unavailable', { status: 503 }),
                );
            }
            return Promise.resolve(new Response('Not found', { status: 404 }));
        }) as unknown as typeof fetch;

        const result = await invokeRemoteAgent(BASE_URL, 'Do something');

        expect(result.success).toBe(false);
        expect(result.taskId).toBe('');
        expect(result.responseText).toBeNull();
        expect(result.error).toContain('Submit failed');
        expect(result.error).toContain('503');
    });

    it('returns error when task fails', async () => {
        globalThis.fetch = mock((url: string, _opts?: RequestInit) => {
            if (url.includes('/a2a/tasks/send')) {
                return Promise.resolve(
                    new Response(JSON.stringify({ id: 'task-fail', state: 'submitted' }), { status: 200 }),
                );
            }
            if (url.includes('/a2a/tasks/task-fail')) {
                return Promise.resolve(
                    new Response(
                        JSON.stringify(failedTaskResponse('task-fail', 'Something went wrong')),
                        { status: 200 },
                    ),
                );
            }
            return Promise.resolve(new Response('Not found', { status: 404 }));
        }) as unknown as typeof fetch;

        const result = await invokeRemoteAgent(BASE_URL, 'Do something');

        expect(result.success).toBe(false);
        expect(result.responseText).toBe('Something went wrong');
        expect(result.error).toBe('Something went wrong');
    });

    it('includes the taskId in the result', async () => {
        globalThis.fetch = mock((url: string, _opts?: RequestInit) => {
            if (url.includes('/a2a/tasks/send')) {
                return Promise.resolve(
                    new Response(JSON.stringify({ id: 'task-abc-999', state: 'submitted' }), { status: 200 }),
                );
            }
            if (url.includes('/a2a/tasks/task-abc-999')) {
                return Promise.resolve(
                    new Response(
                        JSON.stringify(completedTaskResponse('task-abc-999', 'Result here')),
                        { status: 200 },
                    ),
                );
            }
            return Promise.resolve(new Response('Not found', { status: 404 }));
        }) as unknown as typeof fetch;

        const result = await invokeRemoteAgent(BASE_URL, 'Check status');

        expect(result.taskId).toBe('task-abc-999');
        expect(result.success).toBe(true);
    });

    it('returns timeout error when polling exceeds timeoutMs', async () => {
        // The poll loop sleeps 3 000 ms per iteration.  With a 100 ms timeout the
        // deadline expires before the first poll response is consumed, so the
        // function should return a timeout error without ever reaching 'completed'.
        globalThis.fetch = mock((url: string, _opts?: RequestInit) => {
            if (url.includes('/a2a/tasks/send')) {
                return Promise.resolve(
                    new Response(JSON.stringify({ id: 'task-slow', state: 'submitted' }), { status: 200 }),
                );
            }
            // Always return "working" so it never finishes naturally
            if (url.includes('/a2a/tasks/task-slow')) {
                return Promise.resolve(
                    new Response(
                        JSON.stringify({ id: 'task-slow', state: 'working' }),
                        { status: 200 },
                    ),
                );
            }
            return Promise.resolve(new Response('Not found', { status: 404 }));
        }) as unknown as typeof fetch;

        const result = await invokeRemoteAgent(BASE_URL, 'Slow task', { timeoutMs: 100 });

        expect(result.success).toBe(false);
        expect(result.taskId).toBe('task-slow');
        expect(result.responseText).toBeNull();
        expect(result.error).toContain('Timed out');
        expect(result.error).toContain('100');
    });
});

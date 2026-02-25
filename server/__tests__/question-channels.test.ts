/**
 * Tests for the question channel dispatchers:
 * - sendAlgoChatQuestion (algochat-question.ts)
 * - sendGitHubQuestion (github-question.ts)
 * - sendSlackQuestion (slack-question.ts)
 * - sendTelegramQuestion (telegram-question.ts)
 *
 * Each channel is tested in isolation with fully mocked external APIs.
 */

import { test, expect, describe, mock, beforeEach, afterEach } from 'bun:test';
import { sendAlgoChatQuestion } from '../notifications/channels/algochat-question';
import type { AgentMessenger } from '../algochat/agent-messenger';

// ─── Shared test data ────────────────────────────────────────────────────────

const TEST_QUESTION_ID = 'q1234567-abcd-efgh-ijkl-mnopqrstuvwx';
const TEST_SHORT_ID = TEST_QUESTION_ID.slice(0, 8); // 'q1234567'
const TEST_AGENT_ID = 'agent-abcd1234efgh5678';
const TEST_QUESTION = 'Which deployment strategy should we use?';
const TEST_OPTIONS = ['Blue/Green', 'Rolling', 'Canary'];
const TEST_CONTEXT = 'Production environment with 99.9% SLA';

// ─── AlgoChat Question ──────────────────────────────────────────────────────

describe('sendAlgoChatQuestion', () => {
    function createMockMessenger(sendResult: string | null = 'mock-txid-abc123'): AgentMessenger {
        return {
            sendNotificationToAddress: mock(() => Promise.resolve(sendResult)),
        } as unknown as AgentMessenger;
    }

    test('returns success with externalRef when messenger returns txid', async () => {
        const messenger = createMockMessenger('txid-question-001');
        const result = await sendAlgoChatQuestion(
            messenger, 'ALGO_ADDR', TEST_QUESTION_ID, TEST_QUESTION, TEST_OPTIONS, TEST_AGENT_ID,
        );

        expect(result.success).toBe(true);
        expect(result.externalRef).toBe('txid-question-001');
    });

    test('returns success: false when messenger returns null', async () => {
        const messenger = createMockMessenger(null);
        const result = await sendAlgoChatQuestion(
            messenger, 'ALGO_ADDR', TEST_QUESTION_ID, TEST_QUESTION, TEST_OPTIONS, TEST_AGENT_ID,
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('returned null');
    });

    test('returns success: false when messenger throws', async () => {
        const messenger = {
            sendNotificationToAddress: mock(() => Promise.reject(new Error('Algod connection refused'))),
        } as unknown as AgentMessenger;

        const result = await sendAlgoChatQuestion(
            messenger, 'ALGO_ADDR', TEST_QUESTION_ID, TEST_QUESTION, TEST_OPTIONS, TEST_AGENT_ID,
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('Algod connection refused');
    });

    test('handles non-Error throw from messenger', async () => {
        const messenger = {
            sendNotificationToAddress: mock(() => Promise.reject('string-error')),
        } as unknown as AgentMessenger;

        const result = await sendAlgoChatQuestion(
            messenger, 'ALGO_ADDR', TEST_QUESTION_ID, TEST_QUESTION, null, TEST_AGENT_ID,
        );

        expect(result.success).toBe(false);
        expect(result.error).toBe('string-error');
    });

    test('formats message with QUESTION tag and short ID', async () => {
        const mockFn = mock(() => Promise.resolve('txid-fmt'));
        const messenger = { sendNotificationToAddress: mockFn } as unknown as AgentMessenger;

        await sendAlgoChatQuestion(
            messenger, 'ADDR', TEST_QUESTION_ID, TEST_QUESTION, null, TEST_AGENT_ID,
        );

        const content = (mockFn as ReturnType<typeof mock>).mock.calls[0][2] as string;
        expect(content).toContain(`[QUESTION:${TEST_SHORT_ID}]`);
        expect(content).toContain(TEST_QUESTION);
    });

    test('includes numbered options when provided', async () => {
        const mockFn = mock(() => Promise.resolve('txid-opts'));
        const messenger = { sendNotificationToAddress: mockFn } as unknown as AgentMessenger;

        await sendAlgoChatQuestion(
            messenger, 'ADDR', TEST_QUESTION_ID, TEST_QUESTION, TEST_OPTIONS, TEST_AGENT_ID,
        );

        const content = (mockFn as ReturnType<typeof mock>).mock.calls[0][2] as string;
        expect(content).toContain('1. Blue/Green');
        expect(content).toContain('2. Rolling');
        expect(content).toContain('3. Canary');
    });

    test('omits options section when options is null', async () => {
        const mockFn = mock(() => Promise.resolve('txid-noopts'));
        const messenger = { sendNotificationToAddress: mockFn } as unknown as AgentMessenger;

        await sendAlgoChatQuestion(
            messenger, 'ADDR', TEST_QUESTION_ID, TEST_QUESTION, null, TEST_AGENT_ID,
        );

        const content = (mockFn as ReturnType<typeof mock>).mock.calls[0][2] as string;
        expect(content).not.toContain('Options:');
    });

    test('omits options section when options is empty', async () => {
        const mockFn = mock(() => Promise.resolve('txid-empty'));
        const messenger = { sendNotificationToAddress: mockFn } as unknown as AgentMessenger;

        await sendAlgoChatQuestion(
            messenger, 'ADDR', TEST_QUESTION_ID, TEST_QUESTION, [], TEST_AGENT_ID,
        );

        const content = (mockFn as ReturnType<typeof mock>).mock.calls[0][2] as string;
        expect(content).not.toContain('Options:');
    });

    test('includes reply instruction with ANS tag', async () => {
        const mockFn = mock(() => Promise.resolve('txid-ans'));
        const messenger = { sendNotificationToAddress: mockFn } as unknown as AgentMessenger;

        await sendAlgoChatQuestion(
            messenger, 'ADDR', TEST_QUESTION_ID, TEST_QUESTION, null, TEST_AGENT_ID,
        );

        const content = (mockFn as ReturnType<typeof mock>).mock.calls[0][2] as string;
        expect(content).toContain(`[ANS:${TEST_SHORT_ID}]`);
    });

    test('passes correct agentId and toAddress to messenger', async () => {
        const mockFn = mock(() => Promise.resolve('txid-args'));
        const messenger = { sendNotificationToAddress: mockFn } as unknown as AgentMessenger;

        await sendAlgoChatQuestion(
            messenger, 'RECIPIENT_ADDR', TEST_QUESTION_ID, TEST_QUESTION, null, TEST_AGENT_ID,
        );

        expect(mockFn).toHaveBeenCalledTimes(1);
        const callArgs = (mockFn as ReturnType<typeof mock>).mock.calls[0];
        expect(callArgs[0]).toBe(TEST_AGENT_ID);
        expect(callArgs[1]).toBe('RECIPIENT_ADDR');
    });
});

// ─── GitHub Question ────────────────────────────────────────────────────────

describe('sendGitHubQuestion', () => {
    test('returns success with externalRef when createIssue succeeds', async () => {
        const mockCreateIssue = mock(() =>
            Promise.resolve({ ok: true, issueUrl: 'https://github.com/owner/repo/issues/42' }),
        );
        mock.module('../github/operations', () => ({
            createIssue: mockCreateIssue,
        }));

        const { sendGitHubQuestion: fn } = await import('../notifications/channels/github-question');
        const result = await fn(
            'owner/repo', TEST_QUESTION_ID, TEST_QUESTION, TEST_OPTIONS, TEST_CONTEXT, TEST_AGENT_ID,
        );

        expect(result.success).toBe(true);
        expect(result.externalRef).toBe('https://github.com/owner/repo/issues/42');
    });

    test('returns success: false when createIssue returns ok: false', async () => {
        const mockCreateIssue = mock(() =>
            Promise.resolve({ ok: false, error: 'Not Found' }),
        );
        mock.module('../github/operations', () => ({
            createIssue: mockCreateIssue,
        }));

        const { sendGitHubQuestion: fn } = await import('../notifications/channels/github-question');
        const result = await fn(
            'owner/nonexistent', TEST_QUESTION_ID, TEST_QUESTION, null, null, TEST_AGENT_ID,
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('Not Found');
    });

    test('returns success: false when createIssue throws', async () => {
        const mockCreateIssue = mock(() =>
            Promise.reject(new Error('Network error')),
        );
        mock.module('../github/operations', () => ({
            createIssue: mockCreateIssue,
        }));

        const { sendGitHubQuestion: fn } = await import('../notifications/channels/github-question');
        const result = await fn(
            'owner/repo', TEST_QUESTION_ID, TEST_QUESTION, null, null, TEST_AGENT_ID,
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('Network error');
    });

    test('truncates long question in issue title to 60 chars with ellipsis', async () => {
        const longQuestion = 'A'.repeat(80);
        const mockCreateIssue = mock(() =>
            Promise.resolve({ ok: true, issueUrl: 'https://github.com/o/r/issues/1' }),
        );
        mock.module('../github/operations', () => ({
            createIssue: mockCreateIssue,
        }));

        const { sendGitHubQuestion: fn } = await import('../notifications/channels/github-question');
        await fn('owner/repo', TEST_QUESTION_ID, longQuestion, null, null, TEST_AGENT_ID);

        const callArgs = (mockCreateIssue as ReturnType<typeof mock>).mock.calls[0];
        const title = callArgs[1] as string;
        expect(title).toBe(`[Question] ${'A'.repeat(60)}...`);
    });

    test('does not add ellipsis when question fits in 60 chars', async () => {
        const shortQuestion = 'Short question?';
        const mockCreateIssue = mock(() =>
            Promise.resolve({ ok: true, issueUrl: 'https://github.com/o/r/issues/2' }),
        );
        mock.module('../github/operations', () => ({
            createIssue: mockCreateIssue,
        }));

        const { sendGitHubQuestion: fn } = await import('../notifications/channels/github-question');
        await fn('owner/repo', TEST_QUESTION_ID, shortQuestion, null, null, TEST_AGENT_ID);

        const callArgs = (mockCreateIssue as ReturnType<typeof mock>).mock.calls[0];
        const title = callArgs[1] as string;
        expect(title).toBe('[Question] Short question?');
    });

    test('includes context section in body when context is provided', async () => {
        const mockCreateIssue = mock(() =>
            Promise.resolve({ ok: true, issueUrl: 'https://github.com/o/r/issues/3' }),
        );
        mock.module('../github/operations', () => ({
            createIssue: mockCreateIssue,
        }));

        const { sendGitHubQuestion: fn } = await import('../notifications/channels/github-question');
        await fn('owner/repo', TEST_QUESTION_ID, TEST_QUESTION, null, TEST_CONTEXT, TEST_AGENT_ID);

        const callArgs = (mockCreateIssue as ReturnType<typeof mock>).mock.calls[0];
        const body = callArgs[2] as string;
        expect(body).toContain('**Context:**');
        expect(body).toContain(TEST_CONTEXT);
    });

    test('omits context section when context is null', async () => {
        const mockCreateIssue = mock(() =>
            Promise.resolve({ ok: true, issueUrl: 'https://github.com/o/r/issues/4' }),
        );
        mock.module('../github/operations', () => ({
            createIssue: mockCreateIssue,
        }));

        const { sendGitHubQuestion: fn } = await import('../notifications/channels/github-question');
        await fn('owner/repo', TEST_QUESTION_ID, TEST_QUESTION, null, null, TEST_AGENT_ID);

        const callArgs = (mockCreateIssue as ReturnType<typeof mock>).mock.calls[0];
        const body = callArgs[2] as string;
        expect(body).not.toContain('**Context:**');
    });

    test('includes checkbox-style options in body', async () => {
        const mockCreateIssue = mock(() =>
            Promise.resolve({ ok: true, issueUrl: 'https://github.com/o/r/issues/5' }),
        );
        mock.module('../github/operations', () => ({
            createIssue: mockCreateIssue,
        }));

        const { sendGitHubQuestion: fn } = await import('../notifications/channels/github-question');
        await fn('owner/repo', TEST_QUESTION_ID, TEST_QUESTION, TEST_OPTIONS, null, TEST_AGENT_ID);

        const callArgs = (mockCreateIssue as ReturnType<typeof mock>).mock.calls[0];
        const body = callArgs[2] as string;
        expect(body).toContain('**Options:**');
        expect(body).toContain('- [ ] **1.** Blue/Green');
        expect(body).toContain('- [ ] **2.** Rolling');
        expect(body).toContain('- [ ] **3.** Canary');
    });

    test('passes correct labels', async () => {
        const mockCreateIssue = mock(() =>
            Promise.resolve({ ok: true, issueUrl: 'https://github.com/o/r/issues/6' }),
        );
        mock.module('../github/operations', () => ({
            createIssue: mockCreateIssue,
        }));

        const { sendGitHubQuestion: fn } = await import('../notifications/channels/github-question');
        await fn('owner/repo', TEST_QUESTION_ID, TEST_QUESTION, null, null, TEST_AGENT_ID);

        const callArgs = (mockCreateIssue as ReturnType<typeof mock>).mock.calls[0];
        const labels = callArgs[3] as string[];
        expect(labels).toEqual(['corvid-question', 'awaiting-response']);
    });

    test('includes agent and question metadata in body', async () => {
        const mockCreateIssue = mock(() =>
            Promise.resolve({ ok: true, issueUrl: 'https://github.com/o/r/issues/7' }),
        );
        mock.module('../github/operations', () => ({
            createIssue: mockCreateIssue,
        }));

        const { sendGitHubQuestion: fn } = await import('../notifications/channels/github-question');
        await fn('owner/repo', TEST_QUESTION_ID, TEST_QUESTION, null, null, TEST_AGENT_ID);

        const callArgs = (mockCreateIssue as ReturnType<typeof mock>).mock.calls[0];
        const body = callArgs[2] as string;
        expect(body).toContain(`\`${TEST_AGENT_ID.slice(0, 8)}...\``);
        expect(body).toContain(`\`${TEST_SHORT_ID}\``);
    });

    test('returns generic error when createIssue returns ok: false with no error', async () => {
        const mockCreateIssue = mock(() =>
            Promise.resolve({ ok: false }),
        );
        mock.module('../github/operations', () => ({
            createIssue: mockCreateIssue,
        }));

        const { sendGitHubQuestion: fn } = await import('../notifications/channels/github-question');
        const result = await fn('owner/repo', TEST_QUESTION_ID, TEST_QUESTION, null, null, TEST_AGENT_ID);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Failed to create issue');
    });
});

// ─── Slack Question ─────────────────────────────────────────────────────────

describe('sendSlackQuestion', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    test('returns success with externalRef when Slack API returns ok', async () => {
        globalThis.fetch = mock(() =>
            Promise.resolve(new Response(JSON.stringify({ ok: true, ts: '1234567890.123456' }), { status: 200 })),
        ) as unknown as typeof fetch;

        const { sendSlackQuestion } = await import('../notifications/channels/slack-question');
        const result = await sendSlackQuestion(
            'xoxb-valid-token', '#general', TEST_QUESTION_ID, TEST_QUESTION, TEST_OPTIONS, TEST_CONTEXT, TEST_AGENT_ID,
        );

        expect(result.success).toBe(true);
        expect(result.externalRef).toBe(`#general:1234567890.123456`);
    });

    test('returns success: false when Slack API returns ok: false', async () => {
        globalThis.fetch = mock(() =>
            Promise.resolve(new Response(JSON.stringify({ ok: false, error: 'invalid_auth' }), { status: 200 })),
        ) as unknown as typeof fetch;

        const { sendSlackQuestion } = await import('../notifications/channels/slack-question');
        const result = await sendSlackQuestion(
            'xoxb-bad-token', '#general', TEST_QUESTION_ID, TEST_QUESTION, null, null, TEST_AGENT_ID,
        );

        expect(result.success).toBe(false);
        expect(result.error).toBe('invalid_auth');
    });

    test('returns success: false when fetch throws network error', async () => {
        globalThis.fetch = mock(() =>
            Promise.reject(new Error('Network unreachable')),
        ) as unknown as typeof fetch;

        const { sendSlackQuestion } = await import('../notifications/channels/slack-question');
        const result = await sendSlackQuestion(
            'xoxb-fake', '#general', TEST_QUESTION_ID, TEST_QUESTION, null, null, TEST_AGENT_ID,
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('Network unreachable');
    });

    test('sends correct authorization header', async () => {
        let capturedHeaders: Record<string, string> = {};
        globalThis.fetch = mock((_url: string | URL | Request, opts?: RequestInit) => {
            const headers = opts?.headers as Record<string, string>;
            capturedHeaders = { ...headers };
            return Promise.resolve(new Response(JSON.stringify({ ok: true, ts: '111.222' }), { status: 200 }));
        }) as unknown as typeof fetch;

        const { sendSlackQuestion } = await import('../notifications/channels/slack-question');
        await sendSlackQuestion(
            'xoxb-my-token', '#general', TEST_QUESTION_ID, TEST_QUESTION, null, null, TEST_AGENT_ID,
        );

        expect(capturedHeaders['Authorization']).toBe('Bearer xoxb-my-token');
    });

    test('sends request body with blocks and correct channel', async () => {
        let capturedBody: Record<string, unknown> = {};
        globalThis.fetch = mock((_url: string | URL | Request, opts?: RequestInit) => {
            capturedBody = JSON.parse(opts?.body as string);
            return Promise.resolve(new Response(JSON.stringify({ ok: true, ts: '111.222' }), { status: 200 }));
        }) as unknown as typeof fetch;

        const { sendSlackQuestion } = await import('../notifications/channels/slack-question');
        await sendSlackQuestion(
            'xoxb-token', '#deploy', TEST_QUESTION_ID, TEST_QUESTION, TEST_OPTIONS, null, TEST_AGENT_ID,
        );

        expect(capturedBody.channel).toBe('#deploy');
        expect(capturedBody.unfurl_links).toBe(false);
        expect(Array.isArray(capturedBody.blocks)).toBe(true);
    });

    test('creates action buttons for options', async () => {
        let capturedBody: Record<string, unknown> = {};
        globalThis.fetch = mock((_url: string | URL | Request, opts?: RequestInit) => {
            capturedBody = JSON.parse(opts?.body as string);
            return Promise.resolve(new Response(JSON.stringify({ ok: true, ts: '111.222' }), { status: 200 }));
        }) as unknown as typeof fetch;

        const { sendSlackQuestion } = await import('../notifications/channels/slack-question');
        await sendSlackQuestion(
            'xoxb-token', '#ch', TEST_QUESTION_ID, TEST_QUESTION, TEST_OPTIONS, null, TEST_AGENT_ID,
        );

        const blocks = capturedBody.blocks as Array<Record<string, unknown>>;
        const actionsBlock = blocks.find((b) => b.type === 'actions');
        expect(actionsBlock).toBeDefined();

        const elements = actionsBlock!.elements as Array<Record<string, unknown>>;
        expect(elements).toHaveLength(3);
        expect((elements[0].text as Record<string, string>).text).toBe('Blue/Green');
        expect(elements[0].action_id).toBe(`q:${TEST_SHORT_ID}:0`);
        expect(elements[1].action_id).toBe(`q:${TEST_SHORT_ID}:1`);
        expect(elements[2].action_id).toBe(`q:${TEST_SHORT_ID}:2`);
    });

    test('omits actions block when options is null', async () => {
        let capturedBody: Record<string, unknown> = {};
        globalThis.fetch = mock((_url: string | URL | Request, opts?: RequestInit) => {
            capturedBody = JSON.parse(opts?.body as string);
            return Promise.resolve(new Response(JSON.stringify({ ok: true, ts: '111.222' }), { status: 200 }));
        }) as unknown as typeof fetch;

        const { sendSlackQuestion } = await import('../notifications/channels/slack-question');
        await sendSlackQuestion(
            'xoxb-token', '#ch', TEST_QUESTION_ID, TEST_QUESTION, null, null, TEST_AGENT_ID,
        );

        const blocks = capturedBody.blocks as Array<Record<string, unknown>>;
        const actionsBlock = blocks.find((b) => b.type === 'actions');
        expect(actionsBlock).toBeUndefined();
    });

    test('includes context block with agent ID', async () => {
        let capturedBody: Record<string, unknown> = {};
        globalThis.fetch = mock((_url: string | URL | Request, opts?: RequestInit) => {
            capturedBody = JSON.parse(opts?.body as string);
            return Promise.resolve(new Response(JSON.stringify({ ok: true, ts: '111.222' }), { status: 200 }));
        }) as unknown as typeof fetch;

        const { sendSlackQuestion } = await import('../notifications/channels/slack-question');
        await sendSlackQuestion(
            'xoxb-token', '#ch', TEST_QUESTION_ID, TEST_QUESTION, null, null, TEST_AGENT_ID,
        );

        const blocks = capturedBody.blocks as Array<Record<string, unknown>>;
        const contextBlock = blocks.find((b) => b.type === 'context');
        expect(contextBlock).toBeDefined();
        const ctxElements = contextBlock!.elements as Array<Record<string, string>>;
        expect(ctxElements[0].text).toContain(`${TEST_AGENT_ID.slice(0, 8)}...`);
    });

    test('includes question context in section block when provided', async () => {
        let capturedBody: Record<string, unknown> = {};
        globalThis.fetch = mock((_url: string | URL | Request, opts?: RequestInit) => {
            capturedBody = JSON.parse(opts?.body as string);
            return Promise.resolve(new Response(JSON.stringify({ ok: true, ts: '111.222' }), { status: 200 }));
        }) as unknown as typeof fetch;

        const { sendSlackQuestion } = await import('../notifications/channels/slack-question');
        await sendSlackQuestion(
            'xoxb-token', '#ch', TEST_QUESTION_ID, TEST_QUESTION, null, TEST_CONTEXT, TEST_AGENT_ID,
        );

        const blocks = capturedBody.blocks as Array<Record<string, unknown>>;
        const sectionBlock = blocks.find((b) => b.type === 'section');
        const sectionText = (sectionBlock!.text as Record<string, string>).text;
        expect(sectionText).toContain(TEST_CONTEXT);
    });

    test('truncates option text to 75 chars', async () => {
        const longOption = 'A'.repeat(100);
        let capturedBody: Record<string, unknown> = {};
        globalThis.fetch = mock((_url: string | URL | Request, opts?: RequestInit) => {
            capturedBody = JSON.parse(opts?.body as string);
            return Promise.resolve(new Response(JSON.stringify({ ok: true, ts: '111.222' }), { status: 200 }));
        }) as unknown as typeof fetch;

        const { sendSlackQuestion } = await import('../notifications/channels/slack-question');
        await sendSlackQuestion(
            'xoxb-token', '#ch', TEST_QUESTION_ID, TEST_QUESTION, [longOption], null, TEST_AGENT_ID,
        );

        const blocks = capturedBody.blocks as Array<Record<string, unknown>>;
        const actionsBlock = blocks.find((b) => b.type === 'actions');
        const elements = actionsBlock!.elements as Array<Record<string, unknown>>;
        const buttonText = (elements[0].text as Record<string, string>).text;
        expect(buttonText).toHaveLength(75);
    });

    test('returns fallback error when Slack returns ok: false with no error field', async () => {
        globalThis.fetch = mock(() =>
            Promise.resolve(new Response(JSON.stringify({ ok: false }), { status: 200 })),
        ) as unknown as typeof fetch;

        const { sendSlackQuestion } = await import('../notifications/channels/slack-question');
        const result = await sendSlackQuestion(
            'xoxb-token', '#ch', TEST_QUESTION_ID, TEST_QUESTION, null, null, TEST_AGENT_ID,
        );

        expect(result.success).toBe(false);
        expect(result.error).toBe('Slack API error');
    });

    test('handles missing ts in Slack response', async () => {
        globalThis.fetch = mock(() =>
            Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 })),
        ) as unknown as typeof fetch;

        const { sendSlackQuestion } = await import('../notifications/channels/slack-question');
        const result = await sendSlackQuestion(
            'xoxb-token', '#ch', TEST_QUESTION_ID, TEST_QUESTION, null, null, TEST_AGENT_ID,
        );

        expect(result.success).toBe(true);
        expect(result.externalRef).toBe('#ch:');
    });
});

// ─── Telegram Question ──────────────────────────────────────────────────────

describe('sendTelegramQuestion', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    test('returns success with externalRef when Telegram API returns ok', async () => {
        globalThis.fetch = mock(() =>
            Promise.resolve(new Response(
                JSON.stringify({ ok: true, result: { message_id: 12345 } }),
                { status: 200 },
            )),
        ) as unknown as typeof fetch;

        const { sendTelegramQuestion } = await import('../notifications/channels/telegram-question');
        const result = await sendTelegramQuestion(
            'bot123:TOKEN', '999888', TEST_QUESTION_ID, TEST_QUESTION, TEST_OPTIONS, TEST_CONTEXT, TEST_AGENT_ID,
        );

        expect(result.success).toBe(true);
        expect(result.externalRef).toBe('12345');
    });

    test('returns success: false when Telegram API returns ok: false', async () => {
        globalThis.fetch = mock(() =>
            Promise.resolve(new Response(
                JSON.stringify({ ok: false, description: 'Unauthorized' }),
                { status: 401 },
            )),
        ) as unknown as typeof fetch;

        const { sendTelegramQuestion } = await import('../notifications/channels/telegram-question');
        const result = await sendTelegramQuestion(
            'bad-token', '999888', TEST_QUESTION_ID, TEST_QUESTION, null, null, TEST_AGENT_ID,
        );

        expect(result.success).toBe(false);
        expect(result.error).toBe('Unauthorized');
    });

    test('returns success: false when fetch throws network error', async () => {
        globalThis.fetch = mock(() =>
            Promise.reject(new Error('ECONNREFUSED')),
        ) as unknown as typeof fetch;

        const { sendTelegramQuestion } = await import('../notifications/channels/telegram-question');
        const result = await sendTelegramQuestion(
            'bot123:TOKEN', '999888', TEST_QUESTION_ID, TEST_QUESTION, null, null, TEST_AGENT_ID,
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('ECONNREFUSED');
    });

    test('sends request to correct Telegram API URL', async () => {
        let capturedUrl = '';
        globalThis.fetch = mock((url: string | URL | Request) => {
            capturedUrl = url as string;
            return Promise.resolve(new Response(
                JSON.stringify({ ok: true, result: { message_id: 1 } }),
                { status: 200 },
            ));
        }) as unknown as typeof fetch;

        const { sendTelegramQuestion } = await import('../notifications/channels/telegram-question');
        await sendTelegramQuestion(
            'bot123:SECRET', '999888', TEST_QUESTION_ID, TEST_QUESTION, null, null, TEST_AGENT_ID,
        );

        expect(capturedUrl).toBe('https://api.telegram.org/botbot123:SECRET/sendMessage');
    });

    test('sends correct chat_id and parse_mode', async () => {
        let capturedBody: Record<string, unknown> = {};
        globalThis.fetch = mock((_url: string | URL | Request, opts?: RequestInit) => {
            capturedBody = JSON.parse(opts?.body as string);
            return Promise.resolve(new Response(
                JSON.stringify({ ok: true, result: { message_id: 1 } }),
                { status: 200 },
            ));
        }) as unknown as typeof fetch;

        const { sendTelegramQuestion } = await import('../notifications/channels/telegram-question');
        await sendTelegramQuestion(
            'bot123:TOKEN', '999888', TEST_QUESTION_ID, TEST_QUESTION, null, null, TEST_AGENT_ID,
        );

        expect(capturedBody.chat_id).toBe('999888');
        expect(capturedBody.parse_mode).toBe('Markdown');
    });

    test('includes inline keyboard with option buttons and Other button', async () => {
        let capturedBody: Record<string, unknown> = {};
        globalThis.fetch = mock((_url: string | URL | Request, opts?: RequestInit) => {
            capturedBody = JSON.parse(opts?.body as string);
            return Promise.resolve(new Response(
                JSON.stringify({ ok: true, result: { message_id: 1 } }),
                { status: 200 },
            ));
        }) as unknown as typeof fetch;

        const { sendTelegramQuestion } = await import('../notifications/channels/telegram-question');
        await sendTelegramQuestion(
            'bot123:TOKEN', '999', TEST_QUESTION_ID, TEST_QUESTION, TEST_OPTIONS, null, TEST_AGENT_ID,
        );

        const replyMarkup = capturedBody.reply_markup as Record<string, unknown>;
        expect(replyMarkup).toBeDefined();

        const keyboard = replyMarkup.inline_keyboard as Array<Array<Record<string, string>>>;
        // 3 option buttons + 1 "Other" button
        expect(keyboard).toHaveLength(4);

        // Check option buttons
        expect(keyboard[0][0].text).toBe('1. Blue/Green');
        expect(keyboard[0][0].callback_data).toBe(`q:${TEST_SHORT_ID}:0`);
        expect(keyboard[1][0].text).toBe('2. Rolling');
        expect(keyboard[1][0].callback_data).toBe(`q:${TEST_SHORT_ID}:1`);
        expect(keyboard[2][0].text).toBe('3. Canary');
        expect(keyboard[2][0].callback_data).toBe(`q:${TEST_SHORT_ID}:2`);

        // Check "Other" button
        expect(keyboard[3][0].text).toBe('Other (reply to this message)');
        expect(keyboard[3][0].callback_data).toBe(`q:${TEST_SHORT_ID}:other`);
    });

    test('omits reply_markup when options is null', async () => {
        let capturedBody: Record<string, unknown> = {};
        globalThis.fetch = mock((_url: string | URL | Request, opts?: RequestInit) => {
            capturedBody = JSON.parse(opts?.body as string);
            return Promise.resolve(new Response(
                JSON.stringify({ ok: true, result: { message_id: 1 } }),
                { status: 200 },
            ));
        }) as unknown as typeof fetch;

        const { sendTelegramQuestion } = await import('../notifications/channels/telegram-question');
        await sendTelegramQuestion(
            'bot123:TOKEN', '999', TEST_QUESTION_ID, TEST_QUESTION, null, null, TEST_AGENT_ID,
        );

        expect(capturedBody.reply_markup).toBeUndefined();
    });

    test('truncates option text to 30 chars in button', async () => {
        const longOption = 'B'.repeat(50);
        let capturedBody: Record<string, unknown> = {};
        globalThis.fetch = mock((_url: string | URL | Request, opts?: RequestInit) => {
            capturedBody = JSON.parse(opts?.body as string);
            return Promise.resolve(new Response(
                JSON.stringify({ ok: true, result: { message_id: 1 } }),
                { status: 200 },
            ));
        }) as unknown as typeof fetch;

        const { sendTelegramQuestion } = await import('../notifications/channels/telegram-question');
        await sendTelegramQuestion(
            'bot123:TOKEN', '999', TEST_QUESTION_ID, TEST_QUESTION, [longOption], null, TEST_AGENT_ID,
        );

        const replyMarkup = capturedBody.reply_markup as Record<string, unknown>;
        const keyboard = replyMarkup.inline_keyboard as Array<Array<Record<string, string>>>;
        // Button text: "1. " + 30 chars
        expect(keyboard[0][0].text).toBe(`1. ${'B'.repeat(30)}`);
    });

    test('includes question text and context in message body', async () => {
        let capturedBody: Record<string, unknown> = {};
        globalThis.fetch = mock((_url: string | URL | Request, opts?: RequestInit) => {
            capturedBody = JSON.parse(opts?.body as string);
            return Promise.resolve(new Response(
                JSON.stringify({ ok: true, result: { message_id: 1 } }),
                { status: 200 },
            ));
        }) as unknown as typeof fetch;

        const { sendTelegramQuestion } = await import('../notifications/channels/telegram-question');
        await sendTelegramQuestion(
            'bot123:TOKEN', '999', TEST_QUESTION_ID, TEST_QUESTION, null, TEST_CONTEXT, TEST_AGENT_ID,
        );

        const text = capturedBody.text as string;
        expect(text).toContain('*Agent Question*');
        expect(text).toContain(TEST_QUESTION);
        expect(text).toContain(TEST_CONTEXT);
        expect(text).toContain(`${TEST_AGENT_ID.slice(0, 8)}...`);
        expect(text).toContain(TEST_SHORT_ID);
    });

    test('omits context from text when context is null', async () => {
        let capturedBody: Record<string, unknown> = {};
        globalThis.fetch = mock((_url: string | URL | Request, opts?: RequestInit) => {
            capturedBody = JSON.parse(opts?.body as string);
            return Promise.resolve(new Response(
                JSON.stringify({ ok: true, result: { message_id: 1 } }),
                { status: 200 },
            ));
        }) as unknown as typeof fetch;

        const { sendTelegramQuestion } = await import('../notifications/channels/telegram-question');
        await sendTelegramQuestion(
            'bot123:TOKEN', '999', TEST_QUESTION_ID, TEST_QUESTION, null, null, TEST_AGENT_ID,
        );

        const text = capturedBody.text as string;
        expect(text).not.toContain('_Context:');
    });

    test('includes numbered options in message text', async () => {
        let capturedBody: Record<string, unknown> = {};
        globalThis.fetch = mock((_url: string | URL | Request, opts?: RequestInit) => {
            capturedBody = JSON.parse(opts?.body as string);
            return Promise.resolve(new Response(
                JSON.stringify({ ok: true, result: { message_id: 1 } }),
                { status: 200 },
            ));
        }) as unknown as typeof fetch;

        const { sendTelegramQuestion } = await import('../notifications/channels/telegram-question');
        await sendTelegramQuestion(
            'bot123:TOKEN', '999', TEST_QUESTION_ID, TEST_QUESTION, TEST_OPTIONS, null, TEST_AGENT_ID,
        );

        const text = capturedBody.text as string;
        expect(text).toContain('Options:');
        expect(text).toContain('1. Blue/Green');
        expect(text).toContain('2. Rolling');
        expect(text).toContain('3. Canary');
    });

    test('returns fallback error when Telegram returns ok: false with no description', async () => {
        globalThis.fetch = mock(() =>
            Promise.resolve(new Response(
                JSON.stringify({ ok: false }),
                { status: 400 },
            )),
        ) as unknown as typeof fetch;

        const { sendTelegramQuestion } = await import('../notifications/channels/telegram-question');
        const result = await sendTelegramQuestion(
            'bot123:TOKEN', '999', TEST_QUESTION_ID, TEST_QUESTION, null, null, TEST_AGENT_ID,
        );

        expect(result.success).toBe(false);
        expect(result.error).toBe('Telegram API error');
    });

    test('handles missing message_id in Telegram response', async () => {
        globalThis.fetch = mock(() =>
            Promise.resolve(new Response(
                JSON.stringify({ ok: true, result: {} }),
                { status: 200 },
            )),
        ) as unknown as typeof fetch;

        const { sendTelegramQuestion } = await import('../notifications/channels/telegram-question');
        const result = await sendTelegramQuestion(
            'bot123:TOKEN', '999', TEST_QUESTION_ID, TEST_QUESTION, null, null, TEST_AGENT_ID,
        );

        expect(result.success).toBe(true);
        expect(result.externalRef).toBe('');
    });

    test('handles non-Error throw gracefully', async () => {
        globalThis.fetch = mock(() =>
            Promise.reject('raw-string-error'),
        ) as unknown as typeof fetch;

        const { sendTelegramQuestion } = await import('../notifications/channels/telegram-question');
        const result = await sendTelegramQuestion(
            'bot123:TOKEN', '999', TEST_QUESTION_ID, TEST_QUESTION, null, null, TEST_AGENT_ID,
        );

        expect(result.success).toBe(false);
        expect(result.error).toBe('raw-string-error');
    });
});

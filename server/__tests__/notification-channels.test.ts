/**
 * Tests for individual notification channel dispatchers:
 * - sendDiscord (discord.ts)
 * - sendTelegram (telegram.ts)
 * - sendWebSocket (websocket.ts)
 * - sendGitHub (github.ts)
 * - sendAlgoChat (algochat.ts)
 *
 * These tests validate each channel in isolation without hitting real external APIs.
 */

import { test, expect, describe, mock } from 'bun:test';
import { sendDiscord } from '../notifications/channels/discord';
import { sendTelegram } from '../notifications/channels/telegram';
import { sendWebSocket } from '../notifications/channels/websocket';
import { sendAlgoChat } from '../notifications/channels/algochat';
import type { NotificationPayload } from '../notifications/types';
import type { AgentMessenger } from '../algochat/agent-messenger';

// ─── Standard test payload used across all channel tests ─────────────────

const TEST_PAYLOAD: NotificationPayload = {
    notificationId: 'notif-test-001',
    agentId: 'agent-abcd1234efgh5678',
    sessionId: 'sess-xyz-789',
    title: 'Build Failed',
    message: 'The CI pipeline failed on commit abc123.',
    level: 'error',
    timestamp: '2026-02-16T12:00:00Z',
};

// ─── Discord ─────────────────────────────────────────────────────────────

describe('sendDiscord', () => {
    test('returns success: false with error for an invalid webhook URL', async () => {
        const result = await sendDiscord('https://not-a-real-webhook.invalid/discord', TEST_PAYLOAD);
        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
        expect(typeof result.error).toBe('string');
    });

    test('returns success: false for a URL that returns non-2xx', async () => {
        // httpbin.org/status/400 would require network; instead use an obviously bad domain
        const result = await sendDiscord('https://127.0.0.1:1/webhook', TEST_PAYLOAD);
        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
    });

    test('handles payload with null title gracefully', async () => {
        const payloadNoTitle: NotificationPayload = {
            ...TEST_PAYLOAD,
            title: null,
        };
        const result = await sendDiscord('https://not-a-real-webhook.invalid/discord', payloadNoTitle);
        // Should still fail (bad URL), but should not throw
        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
    });

    test('handles payload with null sessionId gracefully', async () => {
        const payloadNoSession: NotificationPayload = {
            ...TEST_PAYLOAD,
            sessionId: null,
        };
        const result = await sendDiscord('https://not-a-real-webhook.invalid/discord', payloadNoSession);
        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
    });
});

// ─── Telegram ────────────────────────────────────────────────────────────

describe('sendTelegram', () => {
    test('returns success: false with error for invalid bot token', async () => {
        const result = await sendTelegram('invalid-bot-token', '12345', TEST_PAYLOAD);
        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
        expect(typeof result.error).toBe('string');
    });

    test('returns success: false for bad chat ID', async () => {
        const result = await sendTelegram('000000:FAKE_TOKEN', 'not-a-chat-id', TEST_PAYLOAD);
        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
    });

    test('handles payload with null title gracefully', async () => {
        const payloadNoTitle: NotificationPayload = {
            ...TEST_PAYLOAD,
            title: null,
        };
        const result = await sendTelegram('invalid-token', '12345', payloadNoTitle);
        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
    });
});

// ─── WebSocket ───────────────────────────────────────────────────────────

describe('sendWebSocket', () => {
    test('calls broadcastFn and returns success: true', async () => {
        const broadcastMock = mock(() => {});
        const result = await sendWebSocket(broadcastMock, TEST_PAYLOAD);

        expect(result.success).toBe(true);
        expect(broadcastMock).toHaveBeenCalledTimes(1);
    });

    test('broadcastFn receives correct message shape', async () => {
        const broadcastMock = mock(() => {});
        await sendWebSocket(broadcastMock, TEST_PAYLOAD);

        const calls = (broadcastMock as ReturnType<typeof mock>).mock.calls;
        expect(calls.length).toBe(1);

        const msg = calls[0][0] as Record<string, unknown>;
        expect(msg.type).toBe('agent_notification');
        expect(msg.agentId).toBe(TEST_PAYLOAD.agentId);
        expect(msg.sessionId).toBe(TEST_PAYLOAD.sessionId);
        expect(msg.title).toBe(TEST_PAYLOAD.title);
        expect(msg.message).toBe(TEST_PAYLOAD.message);
        expect(msg.level).toBe(TEST_PAYLOAD.level);
        expect(msg.timestamp).toBe(TEST_PAYLOAD.timestamp);
    });

    test('null sessionId is sent as empty string', async () => {
        const broadcastMock = mock(() => {});
        const payloadNoSession: NotificationPayload = { ...TEST_PAYLOAD, sessionId: null };
        await sendWebSocket(broadcastMock, payloadNoSession);

        const msg = (broadcastMock as ReturnType<typeof mock>).mock.calls[0][0] as Record<string, unknown>;
        expect(msg.sessionId).toBe('');
    });

    test('null title is sent as null', async () => {
        const broadcastMock = mock(() => {});
        const payloadNoTitle: NotificationPayload = { ...TEST_PAYLOAD, title: null };
        await sendWebSocket(broadcastMock, payloadNoTitle);

        const msg = (broadcastMock as ReturnType<typeof mock>).mock.calls[0][0] as Record<string, unknown>;
        expect(msg.title).toBeNull();
    });

    test('result has no externalRef or error', async () => {
        const broadcastMock = mock(() => {});
        const result = await sendWebSocket(broadcastMock, TEST_PAYLOAD);

        expect(result.success).toBe(true);
        expect(result.externalRef).toBeUndefined();
        expect(result.error).toBeUndefined();
    });
});

// ─── GitHub ──────────────────────────────────────────────────────────────

describe('sendGitHub', () => {
    test('returns success with externalRef when createIssue succeeds', async () => {
        const mockCreateIssue = mock(() =>
            Promise.resolve({ ok: true, issueUrl: 'https://github.com/owner/repo/issues/42' }),
        );
        mock.module('../github/operations', () => ({
            createIssue: mockCreateIssue,
        }));

        // Re-import to pick up the mock
        const { sendGitHub: sendGitHubMocked } = await import('../notifications/channels/github');
        const result = await sendGitHubMocked('owner/repo', TEST_PAYLOAD);

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

        const { sendGitHub: sendGitHubMocked } = await import('../notifications/channels/github');
        const result = await sendGitHubMocked('owner/nonexistent', TEST_PAYLOAD);

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

        const { sendGitHub: sendGitHubMocked } = await import('../notifications/channels/github');
        const result = await sendGitHubMocked('owner/repo', TEST_PAYLOAD);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Network error');
    });

    test('passes custom labels when provided', async () => {
        const mockCreateIssue = mock(() =>
            Promise.resolve({ ok: true, issueUrl: 'https://github.com/owner/repo/issues/99' }),
        );
        mock.module('../github/operations', () => ({
            createIssue: mockCreateIssue,
        }));

        const { sendGitHub: sendGitHubMocked } = await import('../notifications/channels/github');
        const customLabels = ['urgent', 'ci-failure'];
        await sendGitHubMocked('owner/repo', TEST_PAYLOAD, customLabels);

        expect(mockCreateIssue).toHaveBeenCalledTimes(1);
        const callArgs = (mockCreateIssue as ReturnType<typeof mock>).mock.calls[0];
        expect(callArgs[3]).toEqual(customLabels);
    });

    test('uses default labels when none provided', async () => {
        const mockCreateIssue = mock(() =>
            Promise.resolve({ ok: true, issueUrl: 'https://github.com/owner/repo/issues/100' }),
        );
        mock.module('../github/operations', () => ({
            createIssue: mockCreateIssue,
        }));

        const { sendGitHub: sendGitHubMocked } = await import('../notifications/channels/github');
        await sendGitHubMocked('owner/repo', TEST_PAYLOAD);

        const callArgs = (mockCreateIssue as ReturnType<typeof mock>).mock.calls[0];
        expect(callArgs[3]).toEqual(['corvid-notification', 'error']);
    });

    test('formats issue title with level and payload title', async () => {
        const mockCreateIssue = mock(() =>
            Promise.resolve({ ok: true, issueUrl: 'https://github.com/owner/repo/issues/1' }),
        );
        mock.module('../github/operations', () => ({
            createIssue: mockCreateIssue,
        }));

        const { sendGitHub: sendGitHubMocked } = await import('../notifications/channels/github');
        await sendGitHubMocked('owner/repo', TEST_PAYLOAD);

        const callArgs = (mockCreateIssue as ReturnType<typeof mock>).mock.calls[0];
        const issueTitle = callArgs[1] as string;
        expect(issueTitle).toBe('[error] Build Failed');
    });

    test('formats issue title with fallback when payload title is null', async () => {
        const mockCreateIssue = mock(() =>
            Promise.resolve({ ok: true, issueUrl: 'https://github.com/owner/repo/issues/2' }),
        );
        mock.module('../github/operations', () => ({
            createIssue: mockCreateIssue,
        }));

        const { sendGitHub: sendGitHubMocked } = await import('../notifications/channels/github');
        const payloadNoTitle: NotificationPayload = { ...TEST_PAYLOAD, title: null };
        await sendGitHubMocked('owner/repo', payloadNoTitle);

        const callArgs = (mockCreateIssue as ReturnType<typeof mock>).mock.calls[0];
        const issueTitle = callArgs[1] as string;
        expect(issueTitle).toBe('[error] Agent Notification');
    });
});

// ─── AlgoChat ────────────────────────────────────────────────────────────

describe('sendAlgoChat', () => {
    function createMockMessenger(
        sendResult: string | null = 'mock-txid-abc123',
    ): AgentMessenger {
        return {
            sendNotificationToAddress: mock(() => Promise.resolve(sendResult)),
        } as unknown as AgentMessenger;
    }

    test('returns success with externalRef when messenger returns txid', async () => {
        const messenger = createMockMessenger('txid-real-001');
        const result = await sendAlgoChat(messenger, 'ALGO_ADDRESS_ABC', TEST_PAYLOAD);

        expect(result.success).toBe(true);
        expect(result.externalRef).toBe('txid-real-001');
    });

    test('returns success: false when messenger returns null', async () => {
        const messenger = createMockMessenger(null);
        const result = await sendAlgoChat(messenger, 'ALGO_ADDRESS_ABC', TEST_PAYLOAD);

        expect(result.success).toBe(false);
        expect(result.error).toContain('returned null');
    });

    test('returns success: false when messenger throws', async () => {
        const messenger = {
            sendNotificationToAddress: mock(() =>
                Promise.reject(new Error('Algod connection refused')),
            ),
        } as unknown as AgentMessenger;

        const result = await sendAlgoChat(messenger, 'ALGO_ADDRESS_ABC', TEST_PAYLOAD);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Algod connection refused');
    });

    test('passes correct arguments to messenger', async () => {
        const mockFn = mock(() => Promise.resolve('txid-xyz'));
        const messenger = {
            sendNotificationToAddress: mockFn,
        } as unknown as AgentMessenger;

        await sendAlgoChat(messenger, 'RECIPIENT_ADDR', TEST_PAYLOAD);

        expect(mockFn).toHaveBeenCalledTimes(1);
        const callArgs = (mockFn as ReturnType<typeof mock>).mock.calls[0];
        expect(callArgs[0]).toBe(TEST_PAYLOAD.agentId);
        expect(callArgs[1]).toBe('RECIPIENT_ADDR');
        // Content should include the level and title
        const content = callArgs[2] as string;
        expect(content).toContain('[ERROR]');
        expect(content).toContain('Build Failed');
        expect(content).toContain('The CI pipeline failed on commit abc123.');
    });

    test('formats content with level-only header when title is null', async () => {
        const mockFn = mock(() => Promise.resolve('txid-notitle'));
        const messenger = {
            sendNotificationToAddress: mockFn,
        } as unknown as AgentMessenger;

        const payloadNoTitle: NotificationPayload = { ...TEST_PAYLOAD, title: null };
        await sendAlgoChat(messenger, 'ADDR', payloadNoTitle);

        const content = (mockFn as ReturnType<typeof mock>).mock.calls[0][2] as string;
        expect(content).toContain('[ERROR]');
        expect(content).not.toContain('Build Failed');
        expect(content).toContain('The CI pipeline failed on commit abc123.');
    });

    test('handles non-Error throw from messenger', async () => {
        const messenger = {
            sendNotificationToAddress: mock(() => Promise.reject('string-error')),
        } as unknown as AgentMessenger;

        const result = await sendAlgoChat(messenger, 'ADDR', TEST_PAYLOAD);
        expect(result.success).toBe(false);
        expect(result.error).toBe('string-error');
    });
});

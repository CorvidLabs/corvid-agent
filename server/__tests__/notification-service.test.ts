/**
 * Tests for the multi-channel notification system:
 * - DB persistence (notifications, channels, deliveries)
 * - NotificationService dispatch logic
 * - handleNotifyOwner integration with NotificationService
 * - handleConfigureNotifications CRUD operations
 * - Channel dispatcher payload formatting
 */

import { test, expect, beforeEach, describe, mock, spyOn } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { createAgent } from '../db/agents';
import {
    createNotification,
    listNotifications,
    listChannelsForAgent,
    upsertChannel,
    updateChannelEnabled,
    deleteChannel,
    getChannelByAgentAndType,
    createDelivery,
    updateDeliveryStatus,
    listFailedDeliveries,
} from '../db/notifications';
import { NotificationService } from '../notifications/service';
import {
    handleNotifyOwner,
    handleConfigureNotifications,
    type McpToolContext,
} from '../mcp/tool-handlers';
import { sendDiscord } from '../notifications/channels/discord';
import { sendTelegram } from '../notifications/channels/telegram';
import { sendWebSocket } from '../notifications/channels/websocket';
import type { NotificationPayload } from '../notifications/types';

let db: Database;
let agentId: string;

function createMockContext(overrides?: Partial<McpToolContext>): McpToolContext {
    return {
        agentId,
        db,
        agentMessenger: {
            invokeAndWait: mock(() => Promise.resolve({ response: 'mock', threadId: 't-1' })),
            sendOnChainToSelf: mock(() => Promise.resolve('mock-txid')),
            sendNotificationToAddress: mock(() => Promise.resolve('mock-txid')),
        } as unknown as McpToolContext['agentMessenger'],
        agentDirectory: {
            listAvailable: mock(() => Promise.resolve([])),
        } as unknown as McpToolContext['agentDirectory'],
        agentWalletService: {} as McpToolContext['agentWalletService'],
        ...overrides,
    };
}

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    const agent = createAgent(db, { name: 'NotifyAgent', model: 'sonnet' });
    agentId = agent.id;
});

// ─── DB: Notification Persistence ─────────────────────────────────────────

describe('notification DB layer', () => {
    test('createNotification persists and returns notification', () => {
        const n = createNotification(db, {
            agentId,
            sessionId: 'sess-1',
            title: 'Test Title',
            message: 'Hello owner',
            level: 'info',
        });

        expect(n.id).toBeTruthy();
        expect(n.agentId).toBe(agentId);
        expect(n.sessionId).toBe('sess-1');
        expect(n.title).toBe('Test Title');
        expect(n.message).toBe('Hello owner');
        expect(n.level).toBe('info');
        expect(n.createdAt).toBeTruthy();
    });

    test('listNotifications returns all notifications for agent', () => {
        createNotification(db, { agentId, message: 'First', level: 'info' });
        createNotification(db, { agentId, message: 'Second', level: 'warning' });

        const all = listNotifications(db, agentId);
        expect(all.length).toBe(2);
        const messages = all.map((n) => n.message);
        expect(messages).toContain('First');
        expect(messages).toContain('Second');
    });

    test('listNotifications respects limit', () => {
        for (let i = 0; i < 5; i++) {
            createNotification(db, { agentId, message: `Msg ${i}`, level: 'info' });
        }
        const limited = listNotifications(db, agentId, 3);
        expect(limited.length).toBe(3);
    });
});

// ─── DB: Channel CRUD ────────────────────────────────────────────────────

describe('notification channel CRUD', () => {
    test('upsertChannel creates a new channel', () => {
        const ch = upsertChannel(db, agentId, 'discord', { webhookUrl: 'https://example.com' });
        expect(ch.channelType).toBe('discord');
        expect(ch.config.webhookUrl).toBe('https://example.com');
        expect(ch.enabled).toBe(true);
    });

    test('upsertChannel updates existing channel on conflict', () => {
        upsertChannel(db, agentId, 'discord', { webhookUrl: 'https://old.com' });
        const updated = upsertChannel(db, agentId, 'discord', { webhookUrl: 'https://new.com' });
        expect(updated.config.webhookUrl).toBe('https://new.com');

        const all = listChannelsForAgent(db, agentId);
        expect(all.length).toBe(1);
    });

    test('updateChannelEnabled toggles enabled flag', () => {
        const ch = upsertChannel(db, agentId, 'telegram', { botToken: 'tok', chatId: '123' });
        expect(ch.enabled).toBe(true);

        updateChannelEnabled(db, ch.id, false);
        const after = getChannelByAgentAndType(db, agentId, 'telegram');
        expect(after?.enabled).toBe(false);
    });

    test('deleteChannel removes channel', () => {
        const ch = upsertChannel(db, agentId, 'github', { repo: 'owner/repo' });
        expect(deleteChannel(db, ch.id)).toBe(true);

        const after = listChannelsForAgent(db, agentId);
        expect(after.length).toBe(0);
    });

    test('getChannelByAgentAndType returns null for non-existent', () => {
        const result = getChannelByAgentAndType(db, agentId, 'discord');
        expect(result).toBeNull();
    });
});

// ─── DB: Delivery Tracking ───────────────────────────────────────────────

describe('delivery tracking', () => {
    test('createDelivery and updateDeliveryStatus', () => {
        const n = createNotification(db, { agentId, message: 'Test', level: 'info' });
        const d = createDelivery(db, n.id, 'discord');

        expect(d.notificationId).toBe(n.id);
        expect(d.status).toBe('pending');
        expect(d.attempts).toBe(0);

        updateDeliveryStatus(db, d.id, 'sent', undefined, 'ext-ref-123');

        // Re-read to verify
        const row = db.query('SELECT * FROM notification_deliveries WHERE id = ?').get(d.id) as Record<string, unknown>;
        expect(row.status).toBe('sent');
        expect(row.attempts).toBe(1);
        expect(row.external_ref).toBe('ext-ref-123');
    });

    test('listFailedDeliveries returns only failed with attempts < max', () => {
        const n = createNotification(db, { agentId, message: 'Test', level: 'error' });
        upsertChannel(db, agentId, 'discord', { webhookUrl: 'https://hook.url' });

        const d1 = createDelivery(db, n.id, 'discord');
        updateDeliveryStatus(db, d1.id, 'failed', 'timeout');

        const failed = listFailedDeliveries(db, 3);
        expect(failed.length).toBe(1);
        expect(failed[0].notification.message).toBe('Test');
        expect(failed[0].channelConfig.webhookUrl).toBe('https://hook.url');
    });
});

// ─── NotificationService ─────────────────────────────────────────────────

describe('NotificationService', () => {
    test('notify persists notification even with no channels', async () => {
        const service = new NotificationService(db);
        const broadcastMock = mock(() => {});
        service.setBroadcast(broadcastMock);

        const result = await service.notify({
            agentId,
            message: 'Persisted message',
            level: 'info',
        });

        expect(result.notificationId).toBeTruthy();
        expect(result.channels).toContain('websocket');

        // Verify DB persistence
        const notifications = listNotifications(db, agentId);
        expect(notifications.length).toBe(1);
        expect(notifications[0].message).toBe('Persisted message');
    });

    test('notify always dispatches via WebSocket', async () => {
        const service = new NotificationService(db);
        const broadcastMock = mock(() => {});
        service.setBroadcast(broadcastMock);

        await service.notify({
            agentId,
            message: 'WS test',
            level: 'success',
        });

        expect(broadcastMock).toHaveBeenCalledTimes(1);
    });

    test('notify skips disabled channels', async () => {
        const service = new NotificationService(db);
        service.setBroadcast(() => {});

        // Create a disabled channel
        const ch = upsertChannel(db, agentId, 'discord', { webhookUrl: 'https://hook.url' });
        updateChannelEnabled(db, ch.id, false);

        const result = await service.notify({
            agentId,
            message: 'Should skip discord',
            level: 'info',
        });

        // No delivery rows should be created for disabled channels
        const deliveries = db.query(
            'SELECT * FROM notification_deliveries WHERE notification_id = ?'
        ).all(result.notificationId) as Record<string, unknown>[];
        expect(deliveries.length).toBe(0);
    });

    test('notify creates delivery rows for enabled channels', async () => {
        const service = new NotificationService(db);
        service.setBroadcast(() => {});

        // Create a channel (it will fail since no real webhook, but delivery row should exist)
        upsertChannel(db, agentId, 'discord', { webhookUrl: 'https://invalid.webhook' });

        const result = await service.notify({
            agentId,
            message: 'Channel test',
            level: 'warning',
        });

        // Wait for async dispatch to complete
        await new Promise((r) => setTimeout(r, 100));

        const deliveries = db.query(
            'SELECT * FROM notification_deliveries WHERE notification_id = ?'
        ).all(result.notificationId) as Record<string, unknown>[];
        expect(deliveries.length).toBe(1);
        expect(deliveries[0].channel_type).toBe('discord');
    });

    test('missing config produces graceful failure, not throw', async () => {
        const service = new NotificationService(db);
        service.setBroadcast(() => {});

        // Telegram channel with no config (missing botToken/chatId)
        upsertChannel(db, agentId, 'telegram', {});

        const result = await service.notify({
            agentId,
            message: 'Missing config test',
            level: 'info',
        });

        // Should not throw — just record failure
        await new Promise((r) => setTimeout(r, 100));

        const deliveries = db.query(
            `SELECT * FROM notification_deliveries WHERE notification_id = ? AND status = 'failed'`
        ).all(result.notificationId) as Record<string, unknown>[];
        expect(deliveries.length).toBe(1);
    });
});

// ─── handleNotifyOwner with NotificationService ──────────────────────────

describe('handleNotifyOwner', () => {
    test('uses NotificationService when available', async () => {
        const service = new NotificationService(db);
        service.setBroadcast(() => {});
        const ctx = createMockContext({ notificationService: service });

        const result = await handleNotifyOwner(ctx, { message: 'Multi-channel test' });
        const text = result.content[0];
        expect(text).toHaveProperty('text');
        expect((text as { text: string }).text).toContain('Notification sent to owner via');
    });

    test('falls back to WS-only when no NotificationService', async () => {
        const broadcastMock = mock(() => {});
        const ctx = createMockContext({ broadcastOwnerMessage: broadcastMock });

        const result = await handleNotifyOwner(ctx, { message: 'Fallback test', level: 'warning' });
        const text = (result.content[0] as { text: string }).text;
        expect(text).toContain('Notification sent to owner');
        expect(broadcastMock).toHaveBeenCalledTimes(1);
    });

    test('rejects invalid level', async () => {
        const ctx = createMockContext();
        const result = await handleNotifyOwner(ctx, { message: 'test', level: 'critical' });
        expect(result.isError).toBe(true);
    });

    test('rejects empty message', async () => {
        const ctx = createMockContext();
        const result = await handleNotifyOwner(ctx, { message: '   ' });
        expect(result.isError).toBe(true);
    });
});

// ─── handleConfigureNotifications ────────────────────────────────────────

describe('handleConfigureNotifications', () => {
    test('list returns empty message when no channels', async () => {
        const ctx = createMockContext();
        const result = await handleConfigureNotifications(ctx, { action: 'list' });
        const text = (result.content[0] as { text: string }).text;
        expect(text).toContain('No notification channels configured');
    });

    test('set creates a channel and list shows it', async () => {
        const ctx = createMockContext();

        const setResult = await handleConfigureNotifications(ctx, {
            action: 'set',
            channel_type: 'discord',
            config: { webhookUrl: 'https://hook.test' },
        });
        expect((setResult.content[0] as { text: string }).text).toContain('configured');

        const listResult = await handleConfigureNotifications(ctx, { action: 'list' });
        expect((listResult.content[0] as { text: string }).text).toContain('discord');
    });

    test('set rejects invalid channel_type', async () => {
        const ctx = createMockContext();
        const result = await handleConfigureNotifications(ctx, {
            action: 'set',
            channel_type: 'email',
            config: { server: 'smtp' },
        });
        expect(result.isError).toBe(true);
        expect((result.content[0] as { text: string }).text).toContain('Invalid channel_type');
    });

    test('set rejects empty config', async () => {
        const ctx = createMockContext();
        const result = await handleConfigureNotifications(ctx, {
            action: 'set',
            channel_type: 'discord',
            config: {},
        });
        expect(result.isError).toBe(true);
    });

    test('enable and disable toggle channel state', async () => {
        const ctx = createMockContext();

        await handleConfigureNotifications(ctx, {
            action: 'set',
            channel_type: 'telegram',
            config: { botToken: 'tok', chatId: '123' },
        });

        await handleConfigureNotifications(ctx, { action: 'disable', channel_type: 'telegram' });
        let ch = getChannelByAgentAndType(db, agentId, 'telegram');
        expect(ch?.enabled).toBe(false);

        await handleConfigureNotifications(ctx, { action: 'enable', channel_type: 'telegram' });
        ch = getChannelByAgentAndType(db, agentId, 'telegram');
        expect(ch?.enabled).toBe(true);
    });

    test('remove deletes a channel', async () => {
        const ctx = createMockContext();

        await handleConfigureNotifications(ctx, {
            action: 'set',
            channel_type: 'github',
            config: { repo: 'owner/repo' },
        });

        const result = await handleConfigureNotifications(ctx, {
            action: 'remove',
            channel_type: 'github',
        });
        expect((result.content[0] as { text: string }).text).toContain('removed');

        const ch = getChannelByAgentAndType(db, agentId, 'github');
        expect(ch).toBeNull();
    });

    test('enable non-existent channel returns error', async () => {
        const ctx = createMockContext();
        const result = await handleConfigureNotifications(ctx, {
            action: 'enable',
            channel_type: 'discord',
        });
        expect(result.isError).toBe(true);
    });
});

// ─── Channel Dispatchers (payload formatting) ────────────────────────────

describe('channel dispatchers', () => {
    const payload: NotificationPayload = {
        notificationId: 'n-1',
        agentId: 'agent-1',
        sessionId: 'sess-1',
        title: 'Test Alert',
        message: 'Something happened',
        level: 'warning',
        timestamp: '2026-02-16T00:00:00Z',
    };

    test('sendWebSocket calls broadcastFn with correct shape', async () => {
        const broadcastMock = mock(() => {});
        const result = await sendWebSocket(broadcastMock, payload);

        expect(result.success).toBe(true);
        expect(broadcastMock).toHaveBeenCalledTimes(1);
        const arg = (broadcastMock as ReturnType<typeof mock>).mock.calls[0][0] as Record<string, unknown>;
        expect(arg.type).toBe('agent_notification');
        expect(arg.level).toBe('warning');
        expect(arg.title).toBe('Test Alert');
    });

    test('sendDiscord returns error for bad webhook URL', async () => {
        const result = await sendDiscord('https://not-a-real-webhook.invalid/test', payload);
        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
    });

    test('sendTelegram returns error for bad token', async () => {
        const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            new Response(JSON.stringify({ ok: false, description: 'Unauthorized' }), { status: 401 }),
        );
        try {
            const result = await sendTelegram('bad-token', 'bad-chat', payload);
            expect(result.success).toBe(false);
            expect(result.error).toBeTruthy();
        } finally {
            fetchSpy.mockRestore();
        }
    });
});

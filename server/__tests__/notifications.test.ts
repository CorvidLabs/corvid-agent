import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  createDelivery,
  createNotification,
  createQuestionDispatch,
  deleteChannel,
  getChannelByAgentAndType,
  getQuestionDispatchesByQuestionId,
  listActiveQuestionDispatches,
  listChannelsForAgent,
  listFailedDeliveries,
  listNotifications,
  markDispatchAnswered,
  updateChannelEnabled,
  updateDeliveryStatus,
  updateQuestionDispatchStatus,
  upsertChannel,
} from '../db/notifications';
import { runMigrations } from '../db/schema';

let db: Database;
const AGENT_ID = 'agent-1';

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  // Insert a test agent so FK constraints pass
  db.query(`INSERT INTO agents (id, name, model, system_prompt) VALUES (?, 'TestAgent', 'test', 'test')`).run(AGENT_ID);
});

afterEach(() => {
  db.close();
});

// ── Channel CRUD ─────────────────────────────────────────────────────

describe('notification channels', () => {
  test('upsertChannel creates a new channel', () => {
    const ch = upsertChannel(db, AGENT_ID, 'slack', { webhook_url: 'https://hooks.slack.com/x' });
    expect(ch.id).toBeTruthy();
    expect(ch.agentId).toBe(AGENT_ID);
    expect(ch.channelType).toBe('slack');
    expect(ch.config).toEqual({ webhook_url: 'https://hooks.slack.com/x' });
    expect(ch.enabled).toBe(true);
  });

  test('upsertChannel updates config on conflict', () => {
    upsertChannel(db, AGENT_ID, 'slack', { webhook_url: 'old' });
    const updated = upsertChannel(db, AGENT_ID, 'slack', { webhook_url: 'new' });
    expect(updated.config).toEqual({ webhook_url: 'new' });
  });

  test('upsertChannel can create disabled channel', () => {
    const ch = upsertChannel(db, AGENT_ID, 'discord', { to: 'a@b.com' }, false);
    expect(ch.enabled).toBe(false);
  });

  test('listChannelsForAgent returns channels ordered by type', () => {
    upsertChannel(db, AGENT_ID, 'slack', {});
    upsertChannel(db, AGENT_ID, 'discord', {});
    const list = listChannelsForAgent(db, AGENT_ID);
    expect(list).toHaveLength(2);
    expect(list[0].channelType).toBe('discord');
    expect(list[1].channelType).toBe('slack');
  });

  test('listChannelsForAgent returns empty for unknown agent', () => {
    expect(listChannelsForAgent(db, 'unknown')).toEqual([]);
  });

  test('getChannelByAgentAndType finds channel', () => {
    upsertChannel(db, AGENT_ID, 'slack', { url: 'x' });
    const ch = getChannelByAgentAndType(db, AGENT_ID, 'slack');
    expect(ch).not.toBeNull();
    expect(ch!.channelType).toBe('slack');
  });

  test('getChannelByAgentAndType returns null for missing', () => {
    expect(getChannelByAgentAndType(db, AGENT_ID, 'sms')).toBeNull();
  });

  test('updateChannelEnabled toggles enabled flag', () => {
    const ch = upsertChannel(db, AGENT_ID, 'slack', {});
    expect(ch.enabled).toBe(true);

    const toggled = updateChannelEnabled(db, ch.id, false);
    expect(toggled).toBe(true);

    const fetched = getChannelByAgentAndType(db, AGENT_ID, 'slack');
    expect(fetched!.enabled).toBe(false);
  });

  test('updateChannelEnabled returns false for unknown id', () => {
    expect(updateChannelEnabled(db, 'nonexistent', true)).toBe(false);
  });

  test('deleteChannel removes channel', () => {
    const ch = upsertChannel(db, AGENT_ID, 'slack', {});
    expect(deleteChannel(db, ch.id)).toBe(true);
    expect(getChannelByAgentAndType(db, AGENT_ID, 'slack')).toBeNull();
  });

  test('deleteChannel returns false for unknown id', () => {
    expect(deleteChannel(db, 'nonexistent')).toBe(false);
  });
});

// ── Notification CRUD ────────────────────────────────────────────────

describe('notifications', () => {
  test('createNotification creates with all fields', () => {
    const notif = createNotification(db, {
      agentId: AGENT_ID,
      sessionId: 'sess-1',
      title: 'Alert',
      message: 'Something happened',
      level: 'warning',
    });
    expect(notif.id).toBeTruthy();
    expect(notif.agentId).toBe(AGENT_ID);
    expect(notif.sessionId).toBe('sess-1');
    expect(notif.title).toBe('Alert');
    expect(notif.message).toBe('Something happened');
    expect(notif.level).toBe('warning');
  });

  test('createNotification with minimal fields', () => {
    const notif = createNotification(db, {
      agentId: AGENT_ID,
      message: 'info message',
      level: 'info',
    });
    expect(notif.sessionId).toBeNull();
    expect(notif.title).toBeNull();
  });

  test('listNotifications filters by agent', () => {
    createNotification(db, { agentId: AGENT_ID, message: 'msg1', level: 'info' });

    const agent2 = 'agent-2';
    db.query(`INSERT INTO agents (id, name, model, system_prompt) VALUES (?, 'A2', 'test', 'test')`).run(agent2);
    createNotification(db, { agentId: agent2, message: 'msg2', level: 'info' });

    const list = listNotifications(db, AGENT_ID);
    expect(list).toHaveLength(1);
    expect(list[0].message).toBe('msg1');
  });

  test('listNotifications without agent returns all', () => {
    createNotification(db, { agentId: AGENT_ID, message: 'msg1', level: 'info' });
    const list = listNotifications(db);
    expect(list).toHaveLength(1);
  });

  test('listNotifications respects limit', () => {
    for (let i = 0; i < 5; i++) {
      createNotification(db, { agentId: AGENT_ID, message: `msg${i}`, level: 'info' });
    }
    expect(listNotifications(db, AGENT_ID, 2)).toHaveLength(2);
  });
});

// ── Delivery Tracking ────────────────────────────────────────────────

describe('delivery tracking', () => {
  test('createDelivery and updateDeliveryStatus lifecycle', () => {
    upsertChannel(db, AGENT_ID, 'slack', { url: 'x' });
    const notif = createNotification(db, { agentId: AGENT_ID, message: 'test', level: 'info' });

    const delivery = createDelivery(db, notif.id, 'slack');
    expect(delivery.notificationId).toBe(notif.id);
    expect(delivery.channelType).toBe('slack');
    expect(delivery.status).toBe('pending');
    expect(delivery.attempts).toBe(0);

    updateDeliveryStatus(db, delivery.id, 'sent', undefined, 'ext-ref-123');
    // Verify via failed deliveries (sent ones won't show, but the update happened)
  });

  test('listFailedDeliveries returns retryable deliveries', () => {
    upsertChannel(db, AGENT_ID, 'slack', { url: 'x' });
    const notif = createNotification(db, { agentId: AGENT_ID, message: 'test', level: 'error' });
    const delivery = createDelivery(db, notif.id, 'slack');

    updateDeliveryStatus(db, delivery.id, 'failed', 'timeout');

    const failed = listFailedDeliveries(db, 3);
    expect(failed).toHaveLength(1);
    expect(failed[0].error).toBe('timeout');
    expect(failed[0].notification.message).toBe('test');
    expect(failed[0].channelConfig).toEqual({ url: 'x' });
  });

  test('listFailedDeliveries excludes exhausted retries', () => {
    upsertChannel(db, AGENT_ID, 'slack', { url: 'x' });
    const notif = createNotification(db, { agentId: AGENT_ID, message: 'test', level: 'error' });
    const delivery = createDelivery(db, notif.id, 'slack');

    // Fail 3 times
    updateDeliveryStatus(db, delivery.id, 'failed', 'err1');
    updateDeliveryStatus(db, delivery.id, 'failed', 'err2');
    updateDeliveryStatus(db, delivery.id, 'failed', 'err3');

    // maxAttempts = 3, delivery has 3 attempts now
    const failed = listFailedDeliveries(db, 3);
    expect(failed).toHaveLength(0);
  });
});

// ── Question Dispatch ────────────────────────────────────────────────

describe('question dispatch', () => {
  test('createQuestionDispatch creates a dispatch', () => {
    const d = createQuestionDispatch(db, 'q1', 'slack', 'slack-msg-123');
    expect(d.questionId).toBe('q1');
    expect(d.channelType).toBe('slack');
    expect(d.externalRef).toBe('slack-msg-123');
    expect(d.status).toBe('sent');
    expect(d.answeredAt).toBeNull();
  });

  test('listActiveQuestionDispatches returns only sent dispatches', () => {
    createQuestionDispatch(db, 'q1', 'slack', null);
    const d2 = createQuestionDispatch(db, 'q2', 'email', null);
    updateQuestionDispatchStatus(db, d2.id, 'expired');

    const active = listActiveQuestionDispatches(db);
    expect(active).toHaveLength(1);
    expect(active[0].questionId).toBe('q1');
  });

  test('markDispatchAnswered transitions sent→answered', () => {
    const d = createQuestionDispatch(db, 'q1', 'slack', null);
    expect(markDispatchAnswered(db, d.id)).toBe(true);

    const dispatches = getQuestionDispatchesByQuestionId(db, 'q1');
    expect(dispatches[0].status).toBe('answered');
    expect(dispatches[0].answeredAt).toBeTruthy();
  });

  test('markDispatchAnswered is idempotent', () => {
    const d = createQuestionDispatch(db, 'q1', 'slack', null);
    expect(markDispatchAnswered(db, d.id)).toBe(true);
    expect(markDispatchAnswered(db, d.id)).toBe(false); // already answered
  });

  test('markDispatchAnswered rejects expired dispatch', () => {
    const d = createQuestionDispatch(db, 'q1', 'slack', null);
    updateQuestionDispatchStatus(db, d.id, 'expired');
    expect(markDispatchAnswered(db, d.id)).toBe(false);
  });

  test('getQuestionDispatchesByQuestionId returns all dispatches for question', () => {
    createQuestionDispatch(db, 'q1', 'slack', null);
    createQuestionDispatch(db, 'q1', 'email', null);
    createQuestionDispatch(db, 'q2', 'slack', null);

    const dispatches = getQuestionDispatchesByQuestionId(db, 'q1');
    expect(dispatches).toHaveLength(2);
  });
});

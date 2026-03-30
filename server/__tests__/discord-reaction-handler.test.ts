import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { runMigrations } from '../db/schema';
import type { MentionSessionInfo } from '../discord/message-handler';
import {
  handleReaction,
  RATE_LIMIT_MAX,
  type ReactionHandlerContext,
  reactionRateLimit,
} from '../discord/reaction-handler';
import type { ThreadSessionInfo } from '../discord/thread-manager';
import type { DiscordReactionData } from '../discord/types';
import { ReputationScorer } from '../reputation/scorer';

let db: Database;
let scorer: ReputationScorer;

function seedAgent(id: string = 'agent-1', name: string = 'Test Agent'): void {
  db.query('INSERT OR IGNORE INTO agents (id, name) VALUES (?, ?)').run(id, name);
}

function seedProject(id: string = 'proj-1', name: string = 'test-project'): void {
  db.query('INSERT OR IGNORE INTO projects (id, name, working_dir) VALUES (?, ?, ?)').run(id, name, '/tmp/test');
}

function seedSession(id: string, agentId: string = 'agent-1', projectId: string = 'proj-1'): void {
  db.query('INSERT OR IGNORE INTO sessions (id, agent_id, project_id) VALUES (?, ?, ?)').run(id, agentId, projectId);
}

function makeReaction(overrides: Partial<DiscordReactionData> = {}): DiscordReactionData {
  return {
    user_id: 'user-123',
    channel_id: 'channel-456',
    message_id: 'msg-789',
    emoji: { id: null, name: '\u{1F44D}' },
    ...overrides,
  };
}

function makeContext(overrides: Partial<ReactionHandlerContext> = {}): ReactionHandlerContext {
  return {
    db,
    botUserId: 'bot-user-id',
    scorer,
    mentionSessions: new Map(),
    threadSessions: new Map(),
    ...overrides,
  };
}

function getFeedbackCount(): number {
  const row = db.query('SELECT COUNT(*) as count FROM response_feedback').get() as { count: number };
  return row.count;
}

function getLatestFeedback(): {
  sentiment: string;
  agent_id: string;
  session_id: string;
  submitted_by: string;
  source: string;
} | null {
  return db.query('SELECT * FROM response_feedback ORDER BY created_at DESC LIMIT 1').get() as {
    sentiment: string;
    agent_id: string;
    session_id: string;
    submitted_by: string;
    source: string;
  } | null;
}

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  seedAgent('agent-1');
  seedProject('proj-1');
  seedSession('session-1', 'agent-1');
  scorer = new ReputationScorer(db);
  reactionRateLimit.clear();
});

afterEach(() => {
  db.close();
});

describe('handleReaction', () => {
  test('positive emoji submits positive feedback via mention session', () => {
    const mentionSessions = new Map<string, MentionSessionInfo>();
    mentionSessions.set('msg-789', { sessionId: 'session-1', agentName: 'Test Agent', agentModel: 'test' });

    const ctx = makeContext({ mentionSessions });
    handleReaction(ctx, makeReaction({ emoji: { id: null, name: '\u{1F44D}' } }));

    expect(getFeedbackCount()).toBe(1);
    const fb = getLatestFeedback();
    expect(fb?.sentiment).toBe('positive');
    expect(fb?.agent_id).toBe('agent-1');
    expect(fb?.session_id).toBe('session-1');
    expect(fb?.source).toBe('discord');
    expect(fb?.submitted_by).toBe('discord:user-123');
  });

  test('negative emoji submits negative feedback via mention session', () => {
    const mentionSessions = new Map<string, MentionSessionInfo>();
    mentionSessions.set('msg-789', { sessionId: 'session-1', agentName: 'Test Agent', agentModel: 'test' });

    const ctx = makeContext({ mentionSessions });
    handleReaction(ctx, makeReaction({ emoji: { id: null, name: '\u{1F44E}' } }));

    expect(getFeedbackCount()).toBe(1);
    const fb = getLatestFeedback();
    expect(fb?.sentiment).toBe('negative');
  });

  test('positive emoji submits feedback via thread session', () => {
    const threadSessions = new Map<string, ThreadSessionInfo>();
    threadSessions.set('channel-456', {
      sessionId: 'session-1',
      agentName: 'Test Agent',
      agentModel: 'test',
      ownerUserId: 'user-123',
    });

    const ctx = makeContext({ threadSessions });
    handleReaction(ctx, makeReaction());

    expect(getFeedbackCount()).toBe(1);
    const fb = getLatestFeedback();
    expect(fb?.sentiment).toBe('positive');
    expect(fb?.agent_id).toBe('agent-1');
  });

  test('non-feedback emojis are ignored', () => {
    const mentionSessions = new Map<string, MentionSessionInfo>();
    mentionSessions.set('msg-789', { sessionId: 'session-1', agentName: 'Test Agent', agentModel: 'test' });

    const ctx = makeContext({ mentionSessions });
    handleReaction(ctx, makeReaction({ emoji: { id: null, name: '\u{2764}' } })); // ❤️
    handleReaction(ctx, makeReaction({ emoji: { id: null, name: '\u{1F525}' } })); // 🔥
    handleReaction(ctx, makeReaction({ emoji: { id: 'custom-123', name: 'custom_emoji' } }));

    expect(getFeedbackCount()).toBe(0);
  });

  test('bot reactions are ignored', () => {
    const mentionSessions = new Map<string, MentionSessionInfo>();
    mentionSessions.set('msg-789', { sessionId: 'session-1', agentName: 'Test Agent', agentModel: 'test' });

    const ctx = makeContext({ mentionSessions });
    handleReaction(ctx, makeReaction({ user_id: 'bot-user-id' }));

    expect(getFeedbackCount()).toBe(0);
  });

  test('rate limiting prevents excessive reactions', () => {
    const mentionSessions = new Map<string, MentionSessionInfo>();
    mentionSessions.set('msg-789', { sessionId: 'session-1', agentName: 'Test Agent', agentModel: 'test' });

    const ctx = makeContext({ mentionSessions });

    // Send RATE_LIMIT_MAX reactions — all should succeed
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      handleReaction(ctx, makeReaction({ message_id: `msg-${i}` }));
    }

    // Need to add each message to mentionSessions
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      mentionSessions.set(`msg-${i}`, { sessionId: 'session-1', agentName: 'Test Agent', agentModel: 'test' });
    }

    // Clear feedback and rate limit, re-do properly
    db.query('DELETE FROM response_feedback').run();
    reactionRateLimit.clear();

    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      handleReaction(ctx, makeReaction({ message_id: `msg-${i}` }));
    }
    expect(getFeedbackCount()).toBe(RATE_LIMIT_MAX);

    // Next reaction should be rate limited
    mentionSessions.set('msg-extra', { sessionId: 'session-1', agentName: 'Test Agent', agentModel: 'test' });
    handleReaction(ctx, makeReaction({ message_id: 'msg-extra' }));
    expect(getFeedbackCount()).toBe(RATE_LIMIT_MAX); // no increase
  });

  test('unknown message IDs are handled gracefully', () => {
    const ctx = makeContext();
    // No sessions mapped — should silently return
    handleReaction(ctx, makeReaction({ message_id: 'unknown-msg' }));
    expect(getFeedbackCount()).toBe(0);
  });

  test('missing scorer skips feedback gracefully', () => {
    const mentionSessions = new Map<string, MentionSessionInfo>();
    mentionSessions.set('msg-789', { sessionId: 'session-1', agentName: 'Test Agent', agentModel: 'test' });

    const ctx = makeContext({ mentionSessions, scorer: null });
    handleReaction(ctx, makeReaction());

    expect(getFeedbackCount()).toBe(0);
  });

  test('records reputation event alongside feedback', () => {
    const mentionSessions = new Map<string, MentionSessionInfo>();
    mentionSessions.set('msg-789', { sessionId: 'session-1', agentName: 'Test Agent', agentModel: 'test' });

    const ctx = makeContext({ mentionSessions });
    handleReaction(ctx, makeReaction());

    // Check reputation event was recorded
    const events = scorer.getEvents('agent-1', 10);
    expect(events.length).toBeGreaterThanOrEqual(1);
    const feedbackEvent = events.find((e) => e.event_type === 'feedback_received');
    expect(feedbackEvent).toBeDefined();
    expect(feedbackEvent?.score_impact).toBe(2);
  });

  test('negative reaction records negative reputation impact', () => {
    const mentionSessions = new Map<string, MentionSessionInfo>();
    mentionSessions.set('msg-789', { sessionId: 'session-1', agentName: 'Test Agent', agentModel: 'test' });

    const ctx = makeContext({ mentionSessions });
    handleReaction(ctx, makeReaction({ emoji: { id: null, name: '\u{1F44E}' } }));

    const events = scorer.getEvents('agent-1', 10);
    const feedbackEvent = events.find((e) => e.event_type === 'feedback_received');
    expect(feedbackEvent).toBeDefined();
    expect(feedbackEvent?.score_impact).toBe(-2);
  });

  test('different users have independent rate limits', () => {
    const mentionSessions = new Map<string, MentionSessionInfo>();
    for (let i = 0; i < RATE_LIMIT_MAX + 2; i++) {
      mentionSessions.set(`msg-a-${i}`, { sessionId: 'session-1', agentName: 'Test Agent', agentModel: 'test' });
      mentionSessions.set(`msg-b-${i}`, { sessionId: 'session-1', agentName: 'Test Agent', agentModel: 'test' });
    }

    const ctx = makeContext({ mentionSessions });

    // User A sends max reactions
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      handleReaction(ctx, makeReaction({ user_id: 'user-a', message_id: `msg-a-${i}` }));
    }
    expect(getFeedbackCount()).toBe(RATE_LIMIT_MAX);

    // User B should still be able to react
    handleReaction(ctx, makeReaction({ user_id: 'user-b', message_id: 'msg-b-0' }));
    expect(getFeedbackCount()).toBe(RATE_LIMIT_MAX + 1);
  });
});

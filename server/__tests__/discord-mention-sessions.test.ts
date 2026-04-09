import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  deleteMentionSessionsBySessionId,
  getMentionSession,
  pruneOldMentionSessions,
  saveMentionSession,
} from '../db/discord-mention-sessions';
import { runMigrations } from '../db/schema';

let db: Database;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
});

afterEach(() => {
  db.close();
});

// ─── Migration ──────────────────────────────────────────────────────────────

describe('migration creates table', () => {
  test('discord_mention_sessions table exists with correct columns', () => {
    const columns = db.query("PRAGMA table_info('discord_mention_sessions')").all() as { name: string }[];
    const colNames = columns.map((c) => c.name);

    expect(colNames).toContain('bot_message_id');
    expect(colNames).toContain('session_id');
    expect(colNames).toContain('agent_name');
    expect(colNames).toContain('agent_model');
    expect(colNames).toContain('project_name');
    expect(colNames).toContain('created_at');
  });

  test('index exists on session_id', () => {
    const indexes = db.query("PRAGMA index_list('discord_mention_sessions')").all() as { name: string }[];
    const indexNames = indexes.map((i) => i.name);

    expect(indexNames).toContain('idx_discord_mention_sessions_session');
  });
});

// ─── Save & Get Round-Trip ──────────────────────────────────────────────────

describe('saveMentionSession + getMentionSession', () => {
  test('round-trip: save and retrieve a session', () => {
    saveMentionSession(db, 'bot-msg-1', {
      sessionId: 'sess-1',
      agentName: 'TestAgent',
      agentModel: 'claude-opus-4-20250514',
    });

    const result = getMentionSession(db, 'bot-msg-1');
    expect(result).not.toBeNull();
    expect(result!.sessionId).toBe('sess-1');
    expect(result!.agentName).toBe('TestAgent');
    expect(result!.agentModel).toBe('claude-opus-4-20250514');
  });

  test('returns null for unknown bot message ID', () => {
    const result = getMentionSession(db, 'nonexistent-id');
    expect(result).toBeNull();
  });

  test('round-trip: save and retrieve with projectName', () => {
    saveMentionSession(db, 'bot-msg-proj', {
      sessionId: 'sess-proj',
      agentName: 'TestAgent',
      agentModel: 'claude-opus-4-20250514',
      projectName: 'my-cool-project',
    });

    const result = getMentionSession(db, 'bot-msg-proj');
    expect(result).not.toBeNull();
    expect(result!.sessionId).toBe('sess-proj');
    expect(result!.projectName).toBe('my-cool-project');
  });

  test('projectName is undefined when not provided', () => {
    saveMentionSession(db, 'bot-msg-no-proj', {
      sessionId: 'sess-no-proj',
      agentName: 'TestAgent',
      agentModel: 'claude-opus-4-20250514',
    });

    const result = getMentionSession(db, 'bot-msg-no-proj');
    expect(result).not.toBeNull();
    expect(result!.projectName).toBeUndefined();
  });

  test('INSERT OR REPLACE overwrites existing entry', () => {
    saveMentionSession(db, 'bot-msg-1', {
      sessionId: 'sess-1',
      agentName: 'AgentA',
      agentModel: 'model-a',
    });

    saveMentionSession(db, 'bot-msg-1', {
      sessionId: 'sess-2',
      agentName: 'AgentB',
      agentModel: 'model-b',
    });

    const result = getMentionSession(db, 'bot-msg-1');
    expect(result).not.toBeNull();
    expect(result!.sessionId).toBe('sess-2');
    expect(result!.agentName).toBe('AgentB');
  });
});

// ─── Delete by Session ID ───────────────────────────────────────────────────

describe('deleteMentionSessionsBySessionId', () => {
  test('deletes all entries for a session ID', () => {
    saveMentionSession(db, 'bot-msg-1', {
      sessionId: 'sess-1',
      agentName: 'Agent',
      agentModel: 'model',
    });
    saveMentionSession(db, 'bot-msg-2', {
      sessionId: 'sess-1',
      agentName: 'Agent',
      agentModel: 'model',
    });
    saveMentionSession(db, 'bot-msg-3', {
      sessionId: 'sess-other',
      agentName: 'Agent',
      agentModel: 'model',
    });

    deleteMentionSessionsBySessionId(db, 'sess-1');

    expect(getMentionSession(db, 'bot-msg-1')).toBeNull();
    expect(getMentionSession(db, 'bot-msg-2')).toBeNull();
    // Other session untouched
    expect(getMentionSession(db, 'bot-msg-3')).not.toBeNull();
  });

  test('no-op when session ID does not exist', () => {
    saveMentionSession(db, 'bot-msg-1', {
      sessionId: 'sess-1',
      agentName: 'Agent',
      agentModel: 'model',
    });

    deleteMentionSessionsBySessionId(db, 'nonexistent');

    expect(getMentionSession(db, 'bot-msg-1')).not.toBeNull();
  });
});

// ─── Prune Old Sessions ─────────────────────────────────────────────────────

describe('pruneOldMentionSessions', () => {
  test('removes entries older than maxAge days', () => {
    // Insert an old entry by manually setting created_at
    db.query(
      `INSERT INTO discord_mention_sessions (bot_message_id, session_id, agent_name, agent_model, created_at)
             VALUES (?, ?, ?, ?, datetime('now', '-10 days'))`,
    ).run('old-msg', 'sess-old', 'Agent', 'model');

    // Insert a recent entry
    saveMentionSession(db, 'new-msg', {
      sessionId: 'sess-new',
      agentName: 'Agent',
      agentModel: 'model',
    });

    const pruned = pruneOldMentionSessions(db, 7);

    expect(pruned).toBe(1);
    expect(getMentionSession(db, 'old-msg')).toBeNull();
    expect(getMentionSession(db, 'new-msg')).not.toBeNull();
  });

  test('returns 0 when nothing to prune', () => {
    saveMentionSession(db, 'new-msg', {
      sessionId: 'sess-new',
      agentName: 'Agent',
      agentModel: 'model',
    });

    const pruned = pruneOldMentionSessions(db, 7);
    expect(pruned).toBe(0);
  });

  test('defaults to 7 days when no maxAge specified', () => {
    db.query(
      `INSERT INTO discord_mention_sessions (bot_message_id, session_id, agent_name, agent_model, created_at)
             VALUES (?, ?, ?, ?, datetime('now', '-8 days'))`,
    ).run('old-msg', 'sess-old', 'Agent', 'model');

    const pruned = pruneOldMentionSessions(db);
    expect(pruned).toBe(1);
  });
});

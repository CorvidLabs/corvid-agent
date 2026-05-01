import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { runMigrations } from '../db/schema';
import { addSessionMessage, createSession, getSession } from '../db/sessions';
import { estimateTokens } from '../process/context-management';
import { ProcessManager } from '../process/manager';

let db: Database;
let pm: ProcessManager;
const AGENT_ID = 'agent-1';
const PROJECT_ID = 'proj-1';
let sessionId: string;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  db.query(`INSERT INTO agents (id, name, model, system_prompt) VALUES (?, 'TestAgent', 'test', 'test')`).run(AGENT_ID);
  db.query(`INSERT INTO projects (id, name, working_dir) VALUES (?, 'TestProject', '/tmp/test')`).run(PROJECT_ID);
  const session = createSession(db, { projectId: PROJECT_ID, agentId: AGENT_ID, name: 'Test' });
  sessionId = session.id;
  pm = new ProcessManager(db);
});

afterEach(() => {
  pm.shutdown();
  db.close();
});

describe('buildResumePrompt return value', () => {
  test('returns object with prompt and activeTurns', () => {
    const session = getSession(db, sessionId)!;
    const result = (pm as any).buildResumePrompt(session);
    expect(result).toHaveProperty('prompt');
    expect(result).toHaveProperty('activeTurns');
    expect(typeof result.prompt).toBe('string');
    expect(typeof result.activeTurns).toBe('number');
  });

  test('returns activeTurns=0 when no messages exist', () => {
    const session = getSession(db, sessionId)!;
    const result = (pm as any).buildResumePrompt(session);
    expect(result.activeTurns).toBe(0);
  });

  test('returns initial prompt when no messages and no new prompt', () => {
    db.query("UPDATE sessions SET initial_prompt = 'Hello world' WHERE id = ?").run(sessionId);
    const session = getSession(db, sessionId)!;
    const result = (pm as any).buildResumePrompt(session);
    expect(result.prompt).toBe('Hello world');
    expect(result.activeTurns).toBe(0);
  });

  test('returns new prompt when no messages but new prompt provided', () => {
    const session = getSession(db, sessionId)!;
    const result = (pm as any).buildResumePrompt(session, 'New message');
    expect(result.prompt).toBe('New message');
    expect(result.activeTurns).toBe(0);
  });

  test('counts only user messages in activeTurns', () => {
    addSessionMessage(db, sessionId, 'user', 'First question');
    addSessionMessage(db, sessionId, 'assistant', 'First answer');
    addSessionMessage(db, sessionId, 'user', 'Second question');
    addSessionMessage(db, sessionId, 'assistant', 'Second answer');
    addSessionMessage(db, sessionId, 'user', 'Third question');

    const session = getSession(db, sessionId)!;
    const result = (pm as any).buildResumePrompt(session);
    expect(result.activeTurns).toBe(3);
  });

  test('activeTurns only counts messages in the last-20 window', () => {
    // Add 25 user+assistant pairs (50 messages total, last 20 = 10 pairs)
    for (let i = 0; i < 25; i++) {
      addSessionMessage(db, sessionId, 'user', `Question ${i}`);
      addSessionMessage(db, sessionId, 'assistant', `Answer ${i}`);
    }

    const session = getSession(db, sessionId)!;
    const result = (pm as any).buildResumePrompt(session);
    // Last 20 messages = messages 30-49, which is 10 user + 10 assistant
    expect(result.activeTurns).toBe(10);
  });

  test('prompt contains conversation history tags', () => {
    addSessionMessage(db, sessionId, 'user', 'Hello there');
    addSessionMessage(db, sessionId, 'assistant', 'Hi back');

    const session = getSession(db, sessionId)!;
    const result = (pm as any).buildResumePrompt(session);
    expect(result.prompt).toContain('<conversation_history>');
    expect(result.prompt).toContain('</conversation_history>');
    expect(result.prompt).toContain('[User]: Hello there');
    expect(result.prompt).toContain('[Assistant]: Hi back');
  });

  test('prompt includes new message appended after history', () => {
    addSessionMessage(db, sessionId, 'user', 'Old message');
    addSessionMessage(db, sessionId, 'assistant', 'Old response');

    const session = getSession(db, sessionId)!;
    const result = (pm as any).buildResumePrompt(session, 'New follow-up');
    expect(result.prompt).toContain('New follow-up');
    // New prompt should come after the conversation_history block
    const historyEnd = result.prompt.indexOf('</conversation_history>');
    const newPromptPos = result.prompt.indexOf('New follow-up');
    expect(newPromptPos).toBeGreaterThan(historyEnd);
  });

  test('includes continuation instruction when no new prompt', () => {
    addSessionMessage(db, sessionId, 'user', 'Do something');

    const session = getSession(db, sessionId)!;
    const result = (pm as any).buildResumePrompt(session);
    expect(result.prompt).toContain('session was interrupted');
  });

  test('includes context instruction when new prompt provided', () => {
    addSessionMessage(db, sessionId, 'user', 'Do something');

    const session = getSession(db, sessionId)!;
    const result = (pm as any).buildResumePrompt(session, 'Continue');
    expect(result.prompt).toContain('Use it for context when responding to the new message');
  });

  test('truncates long messages to 2000 characters', () => {
    const longMessage = 'x'.repeat(3000);
    addSessionMessage(db, sessionId, 'user', longMessage);

    const session = getSession(db, sessionId)!;
    const result = (pm as any).buildResumePrompt(session);
    // The message should be truncated with "..."
    expect(result.prompt).toContain('...');
    // Should not contain the full 3000-char message
    expect(result.prompt.indexOf('x'.repeat(3000))).toBe(-1);
  });
});

describe('buildResumePrompt with context summary', () => {
  test('includes previous context summary when available in sessionMeta', () => {
    addSessionMessage(db, sessionId, 'user', 'Some message');

    (pm as any).sessionMeta.set(sessionId, {
      turnCount: 1,
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
      contextSummary: 'Previously discussed fixing the auth module.',
    });

    const session = getSession(db, sessionId)!;
    const result = (pm as any).buildResumePrompt(session);
    expect(result.prompt).toContain('<previous_context_summary>');
    expect(result.prompt).toContain('Previously discussed fixing the auth module.');
    expect(result.prompt).toContain('</previous_context_summary>');
  });

  test('does not include context summary tags when no summary exists', () => {
    addSessionMessage(db, sessionId, 'user', 'Some message');

    const session = getSession(db, sessionId)!;
    const result = (pm as any).buildResumePrompt(session);
    expect(result.prompt).not.toContain('<previous_context_summary>');
  });
});

describe('buildResumePrompt server restart handling', () => {
  test('includes restart completion note when restart was initiated', () => {
    addSessionMessage(db, sessionId, 'user', 'Restart the server');

    db.query("UPDATE sessions SET server_restart_initiated_at = '2026-01-01T00:00:00Z' WHERE id = ?").run(sessionId);

    const session = getSession(db, sessionId)!;
    const result = (pm as any).buildResumePrompt(session);
    expect(result.prompt).toContain('<server_restart_completed>');
    expect(result.prompt).toContain('Do NOT restart the server again');
  });

  test('clears server_restart_initiated_at after building prompt', () => {
    addSessionMessage(db, sessionId, 'user', 'Restart');

    db.query("UPDATE sessions SET server_restart_initiated_at = '2026-01-01T00:00:00Z' WHERE id = ?").run(sessionId);

    const session = getSession(db, sessionId)!;
    (pm as any).buildResumePrompt(session);

    const row = db.query('SELECT server_restart_initiated_at FROM sessions WHERE id = ?').get(sessionId) as {
      server_restart_initiated_at: string | null;
    };
    expect(row.server_restart_initiated_at).toBeNull();
  });
});

describe('resume token estimation', () => {
  test('estimateTokens returns positive number for non-empty text', () => {
    const tokens = estimateTokens('Hello world, this is a test message.');
    expect(tokens).toBeGreaterThan(0);
  });

  test('estimateTokens returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  test('resume prompt token estimate scales with message count', () => {
    // Build a small resume prompt
    addSessionMessage(db, sessionId, 'user', 'Short question');
    addSessionMessage(db, sessionId, 'assistant', 'Short answer');

    const session1 = getSession(db, sessionId)!;
    const result1 = (pm as any).buildResumePrompt(session1);
    const smallTokens = estimateTokens(result1.prompt);

    // Now add many more messages
    for (let i = 0; i < 8; i++) {
      addSessionMessage(db, sessionId, 'user', `Question ${i} with some additional detail to make it longer`);
      addSessionMessage(db, sessionId, 'assistant', `Answer ${i} with some detail about the implementation approach`);
    }

    const session2 = getSession(db, sessionId)!;
    const result2 = (pm as any).buildResumePrompt(session2);
    const largeTokens = estimateTokens(result2.prompt);

    expect(largeTokens).toBeGreaterThan(smallTokens);
  });
});

describe('turn count reset on resume', () => {
  test('DB total_turns reflects active context turns, not cumulative history', () => {
    // Simulate a session with many historical turns
    db.query('UPDATE sessions SET total_turns = 50 WHERE id = ?').run(sessionId);

    // Add only 3 user messages (within the 20-message window)
    addSessionMessage(db, sessionId, 'user', 'Recent question 1');
    addSessionMessage(db, sessionId, 'assistant', 'Recent answer 1');
    addSessionMessage(db, sessionId, 'user', 'Recent question 2');
    addSessionMessage(db, sessionId, 'assistant', 'Recent answer 2');
    addSessionMessage(db, sessionId, 'user', 'Recent question 3');

    const session = getSession(db, sessionId)!;
    expect(session.totalTurns).toBe(50);

    // buildResumePrompt should report only 3 active user turns
    const result = (pm as any).buildResumePrompt(session);
    expect(result.activeTurns).toBe(3);
  });

  test('activeTurns with exactly 20 messages', () => {
    // Add exactly 20 messages: 10 user + 10 assistant
    for (let i = 0; i < 10; i++) {
      addSessionMessage(db, sessionId, 'user', `Q${i}`);
      addSessionMessage(db, sessionId, 'assistant', `A${i}`);
    }

    const session = getSession(db, sessionId)!;
    const result = (pm as any).buildResumePrompt(session);
    expect(result.activeTurns).toBe(10);
  });

  test('activeTurns with fewer than 20 messages', () => {
    addSessionMessage(db, sessionId, 'user', 'Only question');

    const session = getSession(db, sessionId)!;
    const result = (pm as any).buildResumePrompt(session);
    expect(result.activeTurns).toBe(1);
  });

  test('activeTurns ignores non-user/assistant roles in count', () => {
    addSessionMessage(db, sessionId, 'user', 'Question');
    addSessionMessage(db, sessionId, 'assistant', 'Answer');
    addSessionMessage(db, sessionId, 'system' as any, 'System note');
    addSessionMessage(db, sessionId, 'user', 'Follow-up');

    const session = getSession(db, sessionId)!;
    const result = (pm as any).buildResumePrompt(session);
    // activeTurns counts user messages from .slice(-20), system messages are in the slice
    expect(result.activeTurns).toBe(2);
  });
});

describe('applyResumeMetrics', () => {
  test('updates session totalTurns and persists to DB', () => {
    const session = getSession(db, sessionId)!;
    expect(session.totalTurns).toBe(0);

    (pm as any).applyResumeMetrics(session, 5, 'some prompt text');

    expect(session.totalTurns).toBe(5);
    const dbSession = getSession(db, sessionId)!;
    expect(dbSession.totalTurns).toBe(5);
  });

  test('updates sessionMeta turnCount when meta exists', () => {
    (pm as any).sessionMeta.set(sessionId, {
      turnCount: 0,
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
    });

    const session = getSession(db, sessionId)!;
    (pm as any).applyResumeMetrics(session, 7, 'prompt');

    const meta = (pm as any).sessionMeta.get(sessionId);
    expect(meta.turnCount).toBe(7);
  });

  test('does not throw when sessionMeta has no entry', () => {
    const session = getSession(db, sessionId)!;
    expect(() => (pm as any).applyResumeMetrics(session, 3, 'prompt')).not.toThrow();
    expect(session.totalTurns).toBe(3);
  });

  test('sets lastContextTokens from resume prompt', () => {
    const session = getSession(db, sessionId)!;
    (pm as any).applyResumeMetrics(session, 2, 'Hello world, this is a test prompt.');

    expect(session.lastContextTokens).toBeGreaterThan(0);
  });

  test('sets lastContextWindow from agent model', () => {
    const session = getSession(db, sessionId)!;
    (pm as any).applyResumeMetrics(session, 1, 'prompt', 'claude-sonnet-4-6-20250514');

    expect(session.lastContextWindow).toBeGreaterThan(0);
  });

  test('sets default lastContextWindow when no model specified', () => {
    const session = getSession(db, sessionId)!;
    (pm as any).applyResumeMetrics(session, 1, 'prompt');

    expect(session.lastContextWindow).toBe(128_000);
  });

  test('token estimate scales with prompt length', () => {
    const session = getSession(db, sessionId)!;

    (pm as any).applyResumeMetrics(session, 1, 'short');
    const smallTokens = session.lastContextTokens!;

    (pm as any).applyResumeMetrics(session, 1, 'a '.repeat(500));
    const largeTokens = session.lastContextTokens!;

    expect(largeTokens).toBeGreaterThan(smallTokens);
  });
});

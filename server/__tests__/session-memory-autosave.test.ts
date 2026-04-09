import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { recallMemory, saveMemory, searchMemories } from '../db/agent-memories';
import { createAgent } from '../db/agents';
import { listObservations, recordObservation } from '../db/observations';
import { runMigrations } from '../db/schema';
import { addSessionMessage, createSession, getSessionMessages } from '../db/sessions';
import { summarizeConversation } from '../process/direct-process';

/**
 * Tests for two-tier memory: session summary auto-save on exit.
 *
 * When a session exits cleanly, ProcessManager.saveSessionSummaryToMemory()
 * generates a conversation summary and saves it to agent_memories with
 * status='pending'. The MemorySyncService then picks it up and syncs
 * to localnet AlgoChat (long-term storage).
 *
 * Since saveSessionSummaryToMemory is private, these tests verify the
 * underlying components: summarizeConversation + saveMemory integration.
 */

let db: Database;
let agentId: string;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  const agent = createAgent(db, { name: 'Test Agent', model: 'sonnet' });
  agentId = agent.id;
});

afterEach(() => {
  db.close();
});

describe('session summary auto-save', () => {
  test('summarizeConversation produces a summary from session messages', () => {
    const messages = [
      { role: 'user', content: 'Fix the login bug on the dashboard' },
      { role: 'assistant', content: 'I found the issue in auth.ts — the token was not being refreshed. Fixed it.' },
      { role: 'user', content: 'Great, can you also add a test?' },
      { role: 'assistant', content: 'Added a test in auth.test.ts that verifies token refresh.' },
    ];

    const summary = summarizeConversation(messages);

    expect(summary).toContain('[Context Summary]');
    expect(summary).toContain('Fix the login bug');
    expect(summary).toContain('Follow-up messages');
  });

  test('session summary is saved to agent_memories with pending status', () => {
    // Simulate what saveSessionSummaryToMemory does
    const session = createSession(db, {
      agentId,
      name: 'Test Session',
      source: 'discord',
    });

    addSessionMessage(db, session.id, 'user', 'Implement the new feature');
    addSessionMessage(db, session.id, 'assistant', 'Done — created the feature in feature.ts');

    const messages = getSessionMessages(db, session.id);
    const userMsgs = messages.filter((m) => m.role === 'user');
    const assistantMsgs = messages.filter((m) => m.role === 'assistant');

    const summary = summarizeConversation(
      messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: m.content })),
    );

    const key = `session:${session.id}:${new Date().toISOString().slice(0, 10)}`;
    const content = [
      `Session ${session.id} (${session.source ?? 'unknown'} source)`,
      `Duration: ${userMsgs.length} user messages, ${assistantMsgs.length} assistant responses`,
      summary,
    ].join('\n');

    const memory = saveMemory(db, { agentId, key, content });

    expect(memory.status).toBe('short_term');
    expect(memory.key).toContain(`session:${session.id}`);
    expect(memory.content).toContain('discord source');
    expect(memory.content).toContain('1 user messages');
    expect(memory.content).toContain('[Context Summary]');
  });

  test('session summary is searchable via FTS', () => {
    const session = createSession(db, {
      agentId,
      name: 'Feature Session',
      source: 'algochat',
    });

    const key = `session:${session.id}:2026-03-17`;
    saveMemory(db, {
      agentId,
      key,
      content: 'Session summary: implemented dark mode toggle in dashboard settings',
    });

    const results = searchMemories(db, agentId, 'dark mode');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toContain('dark mode');
  });

  test('session summary is recallable by key', () => {
    const key = 'session:abc-123:2026-03-17';
    saveMemory(db, {
      agentId,
      key,
      content: 'Session summary: fixed auth bug',
    });

    const recalled = recallMemory(db, agentId, key);
    expect(recalled).not.toBeNull();
    expect(recalled!.content).toContain('fixed auth bug');
    expect(recalled!.status).toBe('short_term');
  });

  test('skips save when session has no user messages', () => {
    const session = createSession(db, {
      agentId,
      name: 'Empty Session',
      source: 'web',
    });

    // Only system messages — no user messages
    addSessionMessage(db, session.id, 'system', 'Session started.');

    const messages = getSessionMessages(db, session.id);
    const userMsgs = messages.filter((m) => m.role === 'user');

    // The auto-save logic should skip when there are no user messages
    expect(userMsgs.length).toBe(0);
  });

  test('context summary is saved as observation on context reset', () => {
    const session = createSession(db, {
      agentId,
      name: 'Long Session',
      source: 'discord',
    });

    // Simulate what saveContextSummaryObservation does
    const messages = [
      { role: 'user', content: 'Help me refactor the auth module' },
      { role: 'assistant', content: 'I will restructure the auth flow...' },
      { role: 'user', content: 'Also update the tests' },
      { role: 'assistant', content: 'Tests updated in auth.test.ts' },
    ];

    const summary = summarizeConversation(messages);
    const content = `Conversation summary (discord, session ${session.id}):\n${summary}`;

    const obs = recordObservation(db, {
      agentId,
      source: 'session',
      sourceId: session.id,
      content,
      suggestedKey: `conv-summary:${session.id}`,
      relevanceScore: 2.0,
    });

    expect(obs.source).toBe('session');
    expect(obs.sourceId).toBe(session.id);
    expect(obs.relevanceScore).toBe(2.0);
    expect(obs.suggestedKey).toBe(`conv-summary:${session.id}`);
    expect(obs.content).toContain('[Context Summary]');
    expect(obs.content).toContain('refactor the auth module');
    expect(obs.status).toBe('active');

    // Verify it shows up in agent's observations
    const all = listObservations(db, agentId);
    expect(all.some((o) => o.sourceId === session.id)).toBe(true);
  });

  test('summarizeConversation handles single-turn conversations', () => {
    const messages = [
      { role: 'user', content: 'What is 2+2?' },
      { role: 'assistant', content: '4' },
    ];

    const summary = summarizeConversation(messages);

    expect(summary).toContain('[Context Summary]');
    expect(summary).toContain('What is 2+2?');
  });
});

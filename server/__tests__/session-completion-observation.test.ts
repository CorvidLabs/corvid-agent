import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, test } from 'bun:test';
import { listObservations } from '../db/observations';
import { runMigrations } from '../db/schema';
import { addSessionMessage, createSession } from '../db/sessions';
import { ProcessManager } from '../process/manager';

let db: Database;
let pm: ProcessManager;

const AGENT_ID = 'agent-obs-1';
const PROJECT_ID = 'proj-obs-1';

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  pm = new ProcessManager(db);

  db.query(`INSERT INTO agents (id, name, model, system_prompt) VALUES (?, 'TestAgent', 'test', 'test')`).run(AGENT_ID);
  db.query(`INSERT INTO projects (id, name, working_dir) VALUES (?, 'TestProject', '/tmp/test')`).run(PROJECT_ID);
});

describe('recordSessionCompletionObservation', () => {
  test('records observation with topics and summary for successful session', () => {
    const session = createSession(db, { projectId: PROJECT_ID, agentId: AGENT_ID, name: 'Discord Test' });
    addSessionMessage(db, session.id, 'user', 'How does AlgoChat work?');
    addSessionMessage(db, session.id, 'assistant', 'AlgoChat uses Algorand transactions for messaging.');

    (pm as any).recordSessionCompletionObservation(session.id, session, 0);

    const observations = listObservations(db, AGENT_ID);
    expect(observations).toHaveLength(1);
    expect(observations[0].source).toBe('discord');
    expect(observations[0].content).toContain('completed successfully');
    expect(observations[0].content).toContain('AlgoChat');
    expect(observations[0].relevanceScore).toBe(2.0);
  });

  test('records observation with non-zero exit code', () => {
    const session = createSession(db, { projectId: PROJECT_ID, agentId: AGENT_ID, name: 'Crash Test' });
    addSessionMessage(db, session.id, 'user', 'Please deploy the fix');
    addSessionMessage(db, session.id, 'assistant', 'Starting deployment now.');

    (pm as any).recordSessionCompletionObservation(session.id, session, 1);

    const observations = listObservations(db, AGENT_ID);
    expect(observations).toHaveLength(1);
    expect(observations[0].content).toContain('exited with code 1');
  });

  test('skips recording when session has no agentId', () => {
    const session = createSession(db, { projectId: PROJECT_ID, name: 'No Agent' });

    (pm as any).recordSessionCompletionObservation('fake-id', session, 0);

    const observations = listObservations(db, AGENT_ID);
    expect(observations).toHaveLength(0);
  });

  test('skips recording when session is null', () => {
    (pm as any).recordSessionCompletionObservation('fake-id', null, 0);

    const observations = listObservations(db, AGENT_ID);
    expect(observations).toHaveLength(0);
  });

  test('skips recording when no conversational messages exist', () => {
    const session = createSession(db, { projectId: PROJECT_ID, agentId: AGENT_ID, name: 'Empty' });
    // Add only a tool message, not user/assistant
    addSessionMessage(db, session.id, 'tool', 'some tool output');

    (pm as any).recordSessionCompletionObservation(session.id, session, 0);

    const observations = listObservations(db, AGENT_ID);
    expect(observations).toHaveLength(0);
  });

  test('includes last user request in summary', () => {
    const session = createSession(db, { projectId: PROJECT_ID, agentId: AGENT_ID, name: 'User Req' });
    addSessionMessage(db, session.id, 'user', 'Check the deployment status');
    addSessionMessage(db, session.id, 'assistant', 'Deployment is running smoothly.');

    (pm as any).recordSessionCompletionObservation(session.id, session, 0);

    const observations = listObservations(db, AGENT_ID);
    expect(observations[0].content).toContain('Last user: Check the deployment status');
  });

  test('sets suggestedKey with session ID', () => {
    const session = createSession(db, { projectId: PROJECT_ID, agentId: AGENT_ID, name: 'Key Test' });
    addSessionMessage(db, session.id, 'user', 'Hello there');
    addSessionMessage(db, session.id, 'assistant', 'Hi!');

    (pm as any).recordSessionCompletionObservation(session.id, session, 0);

    const observations = listObservations(db, AGENT_ID);
    expect(observations[0].suggestedKey).toBe(`discord-session:${session.id}`);
  });
});

describe('extractTopics', () => {
  test('delegates to extractConversationTopics', () => {
    const messages = [
      { role: 'user', content: 'Deploy the application' },
      { role: 'assistant', content: 'Done.' },
    ];
    const topics = (pm as any).extractTopics(messages);
    expect(topics).toEqual(['Deploy the']);
  });
});

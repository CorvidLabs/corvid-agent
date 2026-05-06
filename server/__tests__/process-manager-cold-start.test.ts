import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { runMigrations } from '../db/schema';
import { addSessionMessage, createSession, getSession } from '../db/sessions';
import { ProcessManager } from '../process/manager';
import type { SdkProcess } from '../process/sdk-process';

/**
 * Tests verifying that warm turns skip context reconstruction (issue #2225).
 *
 * Cold-start-only invariant: buildResumePrompt is exclusively called on the
 * cold-start path. Warm turns deliver the message directly via sendMessage
 * and never invoke context reconstruction.
 */

let db: Database;
let pm: ProcessManager;
const AGENT_ID = 'agent-1';
const PROJECT_ID = 'proj-1';
let sessionId: string;

function makeWarmProcess(sendResult = true): SdkProcess {
  return {
    pid: 42,
    sendMessage: () => sendResult,
    kill: () => {},
    isAlive: () => true,
    isWarm: () => true,
  };
}

function makeDeadProcess(): SdkProcess {
  return {
    pid: 43,
    sendMessage: () => false,
    kill: () => {},
    isAlive: () => false,
    isWarm: () => false,
  };
}

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

describe('warm turn skips context reconstruction', () => {
  test('warm turn delivers via sendMessage without calling buildResumePrompt', () => {
    let buildResumePromptCalled = false;
    const original = (pm as any).buildResumePrompt.bind(pm);
    (pm as any).buildResumePrompt = (...args: unknown[]) => {
      buildResumePromptCalled = true;
      return original(...args);
    };

    let deliveredContent: unknown = null;
    const warmProcess = {
      ...makeWarmProcess(),
      sendMessage: (content: unknown) => {
        deliveredContent = content;
        return true;
      },
    };
    (pm as any).processes.set(sessionId, warmProcess);

    const session = getSession(db, sessionId)!;
    pm.resumeProcess(session, 'warm follow-up question');

    expect(buildResumePromptCalled).toBe(false);
    expect(deliveredContent).toBe('warm follow-up question');
  });

  test('warm turn delivers raw user message without history reconstruction', () => {
    // Add many messages that would otherwise trigger context reconstruction
    for (let i = 0; i < 10; i++) {
      addSessionMessage(db, sessionId, 'user', `Historical question ${i}`);
      addSessionMessage(db, sessionId, 'assistant', `Historical answer ${i}`);
    }

    let deliveredContent: unknown = null;
    const warmProcess = {
      ...makeWarmProcess(),
      sendMessage: (content: unknown) => {
        deliveredContent = content;
        return true;
      },
    };
    (pm as any).processes.set(sessionId, warmProcess);

    const session = getSession(db, sessionId)!;
    pm.resumeProcess(session, 'new question only');

    // Delivered content must be the raw user message — no <conversation_history> block
    expect(typeof deliveredContent).toBe('string');
    expect(deliveredContent as string).not.toContain('<conversation_history>');
    expect(deliveredContent as string).not.toContain('Historical question');
    expect(deliveredContent as string).toBe('new question only');
  });

  test('warm turn with no prompt does not trigger reconstruction', () => {
    let buildResumePromptCalled = false;
    const original = (pm as any).buildResumePrompt.bind(pm);
    (pm as any).buildResumePrompt = (...args: unknown[]) => {
      buildResumePromptCalled = true;
      return original(...args);
    };

    (pm as any).processes.set(sessionId, makeWarmProcess());

    const session = getSession(db, sessionId)!;
    pm.resumeProcess(session); // no prompt

    expect(buildResumePromptCalled).toBe(false);
  });
});

describe('cold start triggers context reconstruction', () => {
  test('dead process causes buildResumePrompt to be called on cold start', () => {
    let buildResumePromptCalled = false;
    const original = (pm as any).buildResumePrompt.bind(pm);
    (pm as any).buildResumePrompt = (...args: unknown[]) => {
      buildResumePromptCalled = true;
      return original(...args);
    };

    // Put a dead process in the map
    (pm as any).processes.set(sessionId, makeDeadProcess());

    // Add a message so buildResumePrompt has something to reconstruct
    addSessionMessage(db, sessionId, 'user', 'old message');

    // Mock startProcessWithResolvedDir to avoid spawning a real process
    (pm as any).startProcessWithResolvedDir = async () => {};

    const session = getSession(db, sessionId)!;
    pm.resumeProcess(session, 'resumed after crash');

    // Give the async path a tick to run
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(buildResumePromptCalled).toBe(true);
        resolve();
      }, 10);
    });
  });

  test('no existing process causes buildResumePrompt to run', () => {
    let buildResumePromptCalled = false;
    const original = (pm as any).buildResumePrompt.bind(pm);
    (pm as any).buildResumePrompt = (...args: unknown[]) => {
      buildResumePromptCalled = true;
      return original(...args);
    };

    addSessionMessage(db, sessionId, 'user', 'first message');

    (pm as any).startProcessWithResolvedDir = async () => {};
    (pm as any).resumeWithResolvedDir = async () => {};

    const session = getSession(db, sessionId)!;
    pm.resumeProcess(session, 'fresh start');

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(buildResumePromptCalled).toBe(true);
        resolve();
      }, 10);
    });
  });

  test('warm path failure falls through to cold-start reconstruction', () => {
    let buildResumePromptCalled = false;
    const original = (pm as any).buildResumePrompt.bind(pm);
    (pm as any).buildResumePrompt = (...args: unknown[]) => {
      buildResumePromptCalled = true;
      return original(...args);
    };

    // Process is alive but sendMessage fails (e.g., stdin closed)
    const failingWarmProcess: SdkProcess = {
      pid: 99,
      sendMessage: () => false,
      kill: () => {},
      isAlive: () => true,
      isWarm: () => true,
    };
    (pm as any).processes.set(sessionId, failingWarmProcess);

    addSessionMessage(db, sessionId, 'user', 'old context');

    (pm as any).startProcessWithResolvedDir = async () => {};
    (pm as any).resumeWithResolvedDir = async () => {};

    const session = getSession(db, sessionId)!;
    pm.resumeProcess(session, 'message after warm failure');

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(buildResumePromptCalled).toBe(true);
        resolve();
      }, 10);
    });
  });
});

describe('resume-prompt-builder isWarmTurn guard', () => {
  test('buildResumePrompt with isWarmTurn=true returns raw prompt without reconstruction', async () => {
    const { buildResumePrompt } = await import('../process/resume-prompt-builder');

    addSessionMessage(db, sessionId, 'user', 'old history message');
    addSessionMessage(db, sessionId, 'assistant', 'old history response');

    const session = getSession(db, sessionId)!;
    const result = buildResumePrompt(db, session, undefined, 'new message', true);

    expect(result).toBe('new message');
    expect(result).not.toContain('<conversation_history>');
    expect(result).not.toContain('old history');
  });

  test('buildResumePrompt with isWarmTurn=false (default) reconstructs context', async () => {
    const { buildResumePrompt } = await import('../process/resume-prompt-builder');

    addSessionMessage(db, sessionId, 'user', 'old history message');
    addSessionMessage(db, sessionId, 'assistant', 'old history response');

    const session = getSession(db, sessionId)!;
    const result = buildResumePrompt(db, session, undefined, 'new message', false);

    expect(result).toContain('<conversation_history>');
    expect(result).toContain('old history message');
    expect(result).toContain('new message');
  });

  test('buildResumePrompt with isWarmTurn=true and no prompt returns initialPrompt', async () => {
    const { buildResumePrompt } = await import('../process/resume-prompt-builder');

    db.query("UPDATE sessions SET initial_prompt = 'do something' WHERE id = ?").run(sessionId);
    const session = getSession(db, sessionId)!;

    const result = buildResumePrompt(db, session, undefined, undefined, true);
    expect(result).toBe('do something');
  });
});

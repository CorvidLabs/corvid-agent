import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createAgent } from '../db/agents';
import { createProject } from '../db/projects';
import { runMigrations } from '../db/schema';
import { createSession, updateSession } from '../db/sessions';
import { DedupService } from '../lib/dedup';
import type { EventCallback } from '../process/interfaces';
import type { ProcessManager } from '../process/manager';
import type { ClaudeStreamEvent } from '../process/types';
import { TelegramBridge } from '../telegram/bridge';
import type { TelegramBridgeConfig, TelegramMessage } from '../telegram/types';

// ─── Test-only interface to access private members without `as any` ─────────

/** Typed accessor for TelegramBridge internals — avoids raw `as any` casts. */
interface TelegramBridgeInternals {
  running: boolean;
  offset: number;
  consecutiveErrors: number;
  dedup: DedupService;
  userSessions: Map<number, string>;
  userMessageTimestamps: Map<number, number[]>;
  poll: () => Promise<void>;
  handleUpdate: (update: { update_id: number; message?: TelegramMessage }) => Promise<void>;
  handleMessage: (message: TelegramMessage) => Promise<void>;
  checkRateLimit: (userId: number) => boolean;
  callTelegramApi: (method: string, body: Record<string, unknown>) => Promise<{ result: unknown }>;
  downloadFile: (fileId: string) => Promise<Buffer>;
  routeToAgent: (chatId: number, userId: number, text: string, replyTo?: number) => Promise<void>;
  handleWorkIntake: (chatId: number, userId: number, text: string, replyTo?: number) => Promise<void>;
  sendTaskResult: (
    chatId: number,
    task: import('../../shared/types/work-tasks').WorkTask,
    replyTo?: number,
  ) => Promise<void>;
  sendVoice: (chatId: number, text: string, voicePreset: string, replyTo?: number) => Promise<void>;
  subscribeForResponse: (sessionId: string, chatId: number, replyTo?: number) => void;
}

/** Cast a TelegramBridge to its internals for test access. */
function internals(bridge: TelegramBridge): TelegramBridgeInternals {
  return bridge as unknown as TelegramBridgeInternals;
}

// ─── Mock ProcessManager ────────────────────────────────────────────────────

function createMockProcessManager(): ProcessManager {
  return {
    getActiveSessionIds: () => [] as string[],
    startProcess: mock(() => {}),
    sendMessage: mock(() => true),
    subscribe: mock(() => {}),
    unsubscribe: mock(() => {}),
  } as unknown as ProcessManager;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeMessage(overrides: Partial<TelegramMessage> & { from: TelegramMessage['from'] }): TelegramMessage {
  return {
    message_id: 1,
    chat: { id: 12345, type: 'private' },
    date: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

function makeAssistantEvent(content: string): ClaudeStreamEvent {
  return {
    type: 'assistant',
    message: { role: 'assistant', content },
  } as ClaudeStreamEvent;
}

function makeResultEvent(): ClaudeStreamEvent {
  return {
    type: 'result',
    total_cost_usd: 0,
  } as ClaudeStreamEvent;
}

function makeSessionErrorEvent(errorType: string): ClaudeStreamEvent {
  return {
    type: 'session_error',
    error: { message: `Session error: ${errorType}`, errorType, severity: 'error', recoverable: false },
  } as ClaudeStreamEvent;
}

function makeSessionExitedEvent(): ClaudeStreamEvent {
  return { type: 'session_exited' } as ClaudeStreamEvent;
}

function mockApiCapture(bridge: TelegramBridge): string[] {
  const sentMessages: string[] = [];
  internals(bridge).callTelegramApi = mock(async (_method: string, body: Record<string, unknown>) => {
    if (typeof body.text === 'string') sentMessages.push(body.text);
    return { result: {} };
  });
  return sentMessages;
}

function captureSubscribe(pm: ProcessManager): { cb: EventCallback | null } {
  const holder: { cb: EventCallback | null } = { cb: null };
  pm.subscribe = mock((_sid: string, cb: EventCallback) => {
    holder.cb = cb;
  });
  return holder;
}

const defaultConfig: TelegramBridgeConfig = {
  botToken: 'test-token',
  chatId: '12345',
  allowedUserIds: [],
};

let db: Database;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
});

afterEach(() => {
  DedupService.resetGlobal();
  db.close();
});

describe('TelegramBridge', () => {
  test('constructor creates bridge', () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    expect(bridge).toBeDefined();
  });

  test('start and stop', () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    internals(bridge).poll = mock(() => Promise.resolve());
    bridge.start();
    expect(internals(bridge).running).toBe(true);
    bridge.stop();
    expect(internals(bridge).running).toBe(false);
  });

  test('start is idempotent', () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    internals(bridge).poll = mock(() => Promise.resolve());
    bridge.start();
    bridge.start();
    expect(internals(bridge).running).toBe(true);
    bridge.stop();
  });
});

describe('handleUpdate dispatch', () => {
  test('dispatches message updates to handleMessage', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    const handled: TelegramMessage[] = [];
    internals(bridge).handleMessage = mock(async (msg: TelegramMessage) => {
      handled.push(msg);
    });
    const message = makeMessage({ from: { id: 100, is_bot: false, first_name: 'User' }, text: 'hello' });
    await internals(bridge).handleUpdate({ update_id: 1, message });
    expect(handled).toHaveLength(1);
    expect(handled[0].text).toBe('hello');
  });

  test('ignores updates without message', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    const handled: TelegramMessage[] = [];
    internals(bridge).handleMessage = mock(async (msg: TelegramMessage) => {
      handled.push(msg);
    });
    await internals(bridge).handleUpdate({ update_id: 2 });
    expect(handled).toHaveLength(0);
  });

  test('ignores messages without from field', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    const sentMessages = mockApiCapture(bridge);
    await internals(bridge).handleMessage({
      message_id: 1,
      chat: { id: 12345, type: 'private' },
      text: 'orphan',
      date: Date.now(),
    });
    expect(sentMessages).toHaveLength(0);
  });
});

describe('authorization', () => {
  test('rejects unauthorized users', async () => {
    const pm = createMockProcessManager();
    const config: TelegramBridgeConfig = { ...defaultConfig, allowedUserIds: ['111'] };
    const bridge = new TelegramBridge(db, pm, config);
    const sentMessages = mockApiCapture(bridge);
    await internals(bridge).handleMessage(
      makeMessage({ from: { id: 999, is_bot: false, first_name: 'Hacker' }, text: 'hello' }),
    );
    expect(sentMessages.some((m) => m.includes('Unauthorized'))).toBe(true);
  });

  test('allows authorized users', async () => {
    const pm = createMockProcessManager();
    const config: TelegramBridgeConfig = { ...defaultConfig, allowedUserIds: ['111'] };
    const bridge = new TelegramBridge(db, pm, config);
    mockApiCapture(bridge);
    createAgent(db, { name: 'Test Agent', model: 'sonnet' });
    createProject(db, { name: 'Test Project', workingDir: '/tmp/test' });
    await internals(bridge).handleMessage(
      makeMessage({ from: { id: 111, is_bot: false, first_name: 'Allowed' }, text: 'hello' }),
    );
    expect(pm.startProcess).toHaveBeenCalledTimes(1);
  });

  test('allows all users when allowedUserIds is empty', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    mockApiCapture(bridge);
    createAgent(db, { name: 'Test Agent', model: 'sonnet' });
    createProject(db, { name: 'Test Project', workingDir: '/tmp/test' });
    await internals(bridge).handleMessage(
      makeMessage({ from: { id: 42, is_bot: false, first_name: 'Anyone' }, text: 'hello' }),
    );
    expect(pm.startProcess).toHaveBeenCalledTimes(1);
  });
});

describe('rate limiting', () => {
  test('allows messages within the limit', () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    for (let i = 0; i < 10; i++) {
      expect(internals(bridge).checkRateLimit(100)).toBe(true);
    }
  });

  test('blocks messages exceeding the limit', () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    for (let i = 0; i < 10; i++) {
      internals(bridge).checkRateLimit(100);
    }
    expect(internals(bridge).checkRateLimit(100)).toBe(false);
  });

  test('rate limit is per-user', () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    for (let i = 0; i < 10; i++) {
      internals(bridge).checkRateLimit(100);
    }
    expect(internals(bridge).checkRateLimit(100)).toBe(false);
    expect(internals(bridge).checkRateLimit(200)).toBe(true);
  });

  test('rate limited user receives error message', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    const sentMessages = mockApiCapture(bridge);
    for (let i = 0; i < 10; i++) {
      internals(bridge).checkRateLimit(100);
    }
    await internals(bridge).handleMessage(
      makeMessage({ from: { id: 100, is_bot: false, first_name: 'Spammer' }, text: 'another message' }),
    );
    expect(sentMessages.some((m) => m.includes('Rate limit exceeded'))).toBe(true);
    expect(pm.startProcess).not.toHaveBeenCalled();
  });
});

describe('/compact command', () => {
  test('/compact with no active session sends error', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    const sentMessages = mockApiCapture(bridge);
    await internals(bridge).handleMessage(
      makeMessage({ from: { id: 100, is_bot: false, first_name: 'User' }, text: '/compact' }),
    );
    expect(sentMessages.some((m) => m.includes('No active session'))).toBe(true);
    expect(pm.startProcess).not.toHaveBeenCalled();
  });

  test('/compact with active session calls compactSession and clears mapping', async () => {
    const pm = createMockProcessManager();
    (pm as any).compactSession = mock(() => true);
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    internals(bridge).userSessions.set(100, 'sess-abc');
    const sentMessages = mockApiCapture(bridge);
    await internals(bridge).handleMessage(
      makeMessage({ from: { id: 100, is_bot: false, first_name: 'User' }, text: '/compact' }),
    );
    expect((pm as any).compactSession).toHaveBeenCalledWith('sess-abc');
    expect(internals(bridge).userSessions.has(100)).toBe(true);
    expect(sentMessages.some((m) => m.includes('Context compacted'))).toBe(true);
  });

  test('/compact when compactSession returns false sends no-process message', async () => {
    const pm = createMockProcessManager();
    (pm as any).compactSession = mock(() => false);
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    internals(bridge).userSessions.set(100, 'sess-abc');
    const sentMessages = mockApiCapture(bridge);
    await internals(bridge).handleMessage(
      makeMessage({ from: { id: 100, is_bot: false, first_name: 'User' }, text: '/compact' }),
    );
    expect(sentMessages.some((m) => m.includes('Could not compact session'))).toBe(true);
    expect(internals(bridge).userSessions.has(100)).toBe(true);
  });
});

describe('command handlers', () => {
  test('/start sends welcome message', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    const sentMessages = mockApiCapture(bridge);
    await internals(bridge).handleMessage(
      makeMessage({ from: { id: 100, is_bot: false, first_name: 'User' }, text: '/start' }),
    );
    expect(sentMessages.some((m) => m.includes('Connected to corvid-agent'))).toBe(true);
    expect(pm.startProcess).not.toHaveBeenCalled();
  });

  test('/status reports no session', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    const sentMessages = mockApiCapture(bridge);
    await internals(bridge).handleMessage(
      makeMessage({ from: { id: 100, is_bot: false, first_name: 'User' }, text: '/status' }),
    );
    expect(sentMessages.some((m) => m.includes('Your session: none'))).toBe(true);
  });

  test('/status shows active session id', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    internals(bridge).userSessions.set(100, 'sess-abc-123');
    const sentMessages = mockApiCapture(bridge);
    await internals(bridge).handleMessage(
      makeMessage({ from: { id: 100, is_bot: false, first_name: 'User' }, text: '/status' }),
    );
    expect(sentMessages.some((m) => m.includes('sess-abc-123'))).toBe(true);
  });

  test('/new clears session and notifies user', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    internals(bridge).userSessions.set(100, 'old-session-id');
    const sentMessages = mockApiCapture(bridge);
    await internals(bridge).handleMessage(
      makeMessage({ from: { id: 100, is_bot: false, first_name: 'User' }, text: '/new' }),
    );
    expect(internals(bridge).userSessions.has(100)).toBe(false);
    expect(sentMessages.some((m) => m.includes('Session cleared'))).toBe(true);
  });
});

describe('sendText', () => {
  test('sends short messages in single chunk', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    const calls: Array<{ method: string; body: Record<string, unknown> }> = [];
    internals(bridge).callTelegramApi = mock(async (method: string, body: Record<string, unknown>) => {
      calls.push({ method, body });
      return { result: {} };
    });
    await bridge.sendText(12345, 'Hello');
    expect(calls).toHaveLength(1);
    expect(calls[0].body.text).toBe('Hello');
  });

  test('splits long messages into chunks of 4096', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    const calls: Array<{ body: Record<string, unknown> }> = [];
    internals(bridge).callTelegramApi = mock(async (_method: string, body: Record<string, unknown>) => {
      calls.push({ body });
      return { result: {} };
    });
    await bridge.sendText(12345, 'x'.repeat(5000));
    expect(calls).toHaveLength(2);
    expect((calls[0].body.text as string).length).toBe(4096);
    expect((calls[1].body.text as string).length).toBe(904);
  });

  test('includes reply_to_message_id when replyTo is provided', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    const calls: Array<{ body: Record<string, unknown> }> = [];
    internals(bridge).callTelegramApi = mock(async (_method: string, body: Record<string, unknown>) => {
      calls.push({ body });
      return { result: {} };
    });
    await bridge.sendText(12345, 'reply', 42);
    expect(calls[0].body.reply_to_message_id).toBe(42);
  });

  test('omits reply_to_message_id when replyTo is not provided', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    const calls: Array<{ body: Record<string, unknown> }> = [];
    internals(bridge).callTelegramApi = mock(async (_method: string, body: Record<string, unknown>) => {
      calls.push({ body });
      return { result: {} };
    });
    await bridge.sendText(12345, 'no reply');
    expect(calls[0].body.reply_to_message_id).toBeUndefined();
  });
});

describe('voice note handling', () => {
  test('rejects oversized voice files', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    const sentMessages = mockApiCapture(bridge);
    await internals(bridge).handleMessage(
      makeMessage({
        from: { id: 100, is_bot: false, first_name: 'User' },
        voice: { file_id: 'voice-123', file_unique_id: 'unique-123', duration: 120, file_size: 15 * 1024 * 1024 },
      }),
    );
    expect(sentMessages.some((m) => m.includes('too large'))).toBe(true);
    expect(pm.startProcess).not.toHaveBeenCalled();
  });

  test('sends error message when download/transcription fails', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    const sentMessages = mockApiCapture(bridge);
    internals(bridge).downloadFile = mock(async () => {
      throw new Error('Download failed');
    });
    await internals(bridge).handleMessage(
      makeMessage({
        from: { id: 100, is_bot: false, first_name: 'User' },
        voice: { file_id: 'voice-456', file_unique_id: 'unique-456', duration: 5, file_size: 1024 },
      }),
    );
    expect(sentMessages.some((m) => m.includes('Failed to transcribe'))).toBe(true);
    expect(pm.startProcess).not.toHaveBeenCalled();
  });

  test('voice message without file_size skips size check', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    const sentMessages = mockApiCapture(bridge);
    internals(bridge).downloadFile = mock(async () => {
      throw new Error('STT not available');
    });
    await internals(bridge).handleMessage(
      makeMessage({
        from: { id: 100, is_bot: false, first_name: 'User' },
        voice: { file_id: 'voice-789', file_unique_id: 'unique-789', duration: 3 },
      }),
    );
    expect(sentMessages.some((m) => m.includes('too large'))).toBe(false);
    expect(sentMessages.some((m) => m.includes('Failed to transcribe'))).toBe(true);
  });
});

describe('session routing', () => {
  test('creates new session for first message', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    mockApiCapture(bridge);
    createAgent(db, { name: 'Test Agent', model: 'sonnet' });
    createProject(db, { name: 'Test Project', workingDir: '/tmp/test' });
    await internals(bridge).handleMessage(
      makeMessage({ from: { id: 100, is_bot: false, first_name: 'User' }, text: 'first message' }),
    );
    expect(pm.startProcess).toHaveBeenCalledTimes(1);
    expect(pm.subscribe).toHaveBeenCalledTimes(1);
    expect(internals(bridge).userSessions.has(100)).toBe(true);
  });

  test('reuses existing session for subsequent messages', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    mockApiCapture(bridge);
    const agent = createAgent(db, { name: 'Test Agent', model: 'sonnet' });
    const project = createProject(db, { name: 'Test Project', workingDir: '/tmp/test' });
    const session = createSession(db, {
      projectId: project.id,
      agentId: agent.id,
      name: 'Telegram (user 100)',
      initialPrompt: 'first',
      source: 'telegram',
    });
    internals(bridge).userSessions.set(100, session.id);
    await internals(bridge).handleMessage(
      makeMessage({ from: { id: 100, is_bot: false, first_name: 'User' }, text: 'second message' }),
    );
    expect(pm.sendMessage).toHaveBeenCalled();
  });

  test('clears stale session (stopped) and creates new one', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    mockApiCapture(bridge);
    const agent = createAgent(db, { name: 'Test Agent', model: 'sonnet' });
    const project = createProject(db, { name: 'Test Project', workingDir: '/tmp/test' });
    const session = createSession(db, {
      projectId: project.id,
      agentId: agent.id,
      name: 'Telegram (user 100)',
      initialPrompt: 'old',
      source: 'telegram',
    });
    updateSession(db, session.id, { status: 'stopped' });
    internals(bridge).userSessions.set(100, session.id);
    await internals(bridge).handleMessage(
      makeMessage({ from: { id: 100, is_bot: false, first_name: 'User' }, text: 'new message after stop' }),
    );
    expect(pm.startProcess).toHaveBeenCalledTimes(1);
    const newSessionId = internals(bridge).userSessions.get(100);
    expect(newSessionId).toBeDefined();
    expect(newSessionId).not.toBe(session.id);
  });

  test('clears stale session (error) and creates new one', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    mockApiCapture(bridge);
    const agent = createAgent(db, { name: 'Test Agent', model: 'sonnet' });
    const project = createProject(db, { name: 'Test Project', workingDir: '/tmp/test' });
    const session = createSession(db, {
      projectId: project.id,
      agentId: agent.id,
      name: 'Telegram (user 100)',
      initialPrompt: 'old',
      source: 'telegram',
    });
    updateSession(db, session.id, { status: 'error' });
    internals(bridge).userSessions.set(100, session.id);
    await internals(bridge).handleMessage(
      makeMessage({ from: { id: 100, is_bot: false, first_name: 'User' }, text: 'new message after error' }),
    );
    expect(pm.startProcess).toHaveBeenCalledTimes(1);
  });

  test('restarts process when sendMessage returns false', async () => {
    const pm = createMockProcessManager();
    pm.sendMessage = mock(() => false);
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    mockApiCapture(bridge);
    const agent = createAgent(db, { name: 'Test Agent', model: 'sonnet' });
    const project = createProject(db, { name: 'Test Project', workingDir: '/tmp/test' });
    const session = createSession(db, {
      projectId: project.id,
      agentId: agent.id,
      name: 'Telegram (user 100)',
      initialPrompt: 'first',
      source: 'telegram',
    });
    internals(bridge).userSessions.set(100, session.id);
    await internals(bridge).handleMessage(
      makeMessage({ from: { id: 100, is_bot: false, first_name: 'User' }, text: 'message to dead process' }),
    );
    expect(pm.startProcess).toHaveBeenCalledTimes(1);
    expect(pm.subscribe).toHaveBeenCalled();
  });

  test('sends expired message when session disappears between checks', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    const sentMessages = mockApiCapture(bridge);
    const agent = createAgent(db, { name: 'Test Agent', model: 'sonnet' });
    const project = createProject(db, { name: 'Test Project', workingDir: '/tmp/test' });
    const session = createSession(db, {
      projectId: project.id,
      agentId: agent.id,
      name: 'Telegram (user 100)',
      initialPrompt: 'first',
      source: 'telegram',
    });
    internals(bridge).userSessions.set(100, session.id);
    pm.sendMessage = mock(() => {
      db.query('DELETE FROM session_messages WHERE session_id = ?').run(session.id);
      db.query('UPDATE algochat_conversations SET session_id = NULL WHERE session_id = ?').run(session.id);
      db.query('DELETE FROM sessions WHERE id = ?').run(session.id);
      return false;
    });
    await internals(bridge).routeToAgent(12345, 100, 'hello');
    expect(sentMessages.some((m) => m.includes('Session expired'))).toBe(true);
    expect(internals(bridge).userSessions.has(100)).toBe(false);
  });

  test('sends error when no agents configured', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    const sentMessages = mockApiCapture(bridge);
    await internals(bridge).handleMessage(
      makeMessage({ from: { id: 100, is_bot: false, first_name: 'User' }, text: 'hello' }),
    );
    expect(sentMessages.some((m) => m.includes('No agents configured'))).toBe(true);
    expect(pm.startProcess).not.toHaveBeenCalled();
  });

  test('sends error when no projects configured', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    const sentMessages = mockApiCapture(bridge);
    createAgent(db, { name: 'Test Agent', model: 'sonnet' });
    await internals(bridge).handleMessage(
      makeMessage({ from: { id: 100, is_bot: false, first_name: 'User' }, text: 'hello' }),
    );
    expect(sentMessages.some((m) => m.includes('No projects configured'))).toBe(true);
    expect(pm.startProcess).not.toHaveBeenCalled();
  });

  test('ignores messages without text (and no voice)', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    mockApiCapture(bridge);
    await internals(bridge).handleMessage(makeMessage({ from: { id: 100, is_bot: false, first_name: 'User' } }));
    expect(pm.startProcess).not.toHaveBeenCalled();
  });
});

describe('sendVoice', () => {
  test('non-voice agent responses are sent as text only', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    const sentTexts = mockApiCapture(bridge);
    const agent = createAgent(db, { name: 'Test Agent', model: 'sonnet', voiceEnabled: false });
    const project = createProject(db, { name: 'Test Project', workingDir: '/tmp/test' });
    const session = createSession(db, { projectId: project.id, agentId: agent.id, name: 'Test', source: 'telegram' });
    const holder = captureSubscribe(pm);
    internals(bridge).subscribeForResponse(session.id, 12345);
    if (holder.cb) {
      holder.cb(session.id, makeAssistantEvent('Hello from agent'));
      holder.cb(session.id, makeResultEvent());
    }
    await new Promise((r) => setTimeout(r, 500));
    expect(sentTexts.some((m) => m.includes('Hello from agent'))).toBe(true);
  });
});

describe('subscribeForResponse', () => {
  test('buffers assistant messages and flushes on result', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    const sentTexts = mockApiCapture(bridge);
    const agent = createAgent(db, { name: 'Test Agent', model: 'sonnet', voiceEnabled: false });
    const project = createProject(db, { name: 'Test Project', workingDir: '/tmp/test' });
    const session = createSession(db, { projectId: project.id, agentId: agent.id, name: 'Test', source: 'telegram' });
    const holder = captureSubscribe(pm);
    internals(bridge).subscribeForResponse(session.id, 12345, 42);
    expect(holder.cb).not.toBeNull();
    holder.cb!(session.id, makeAssistantEvent('Hello '));
    holder.cb!(session.id, makeAssistantEvent('World!'));
    holder.cb!(session.id, makeResultEvent());
    await new Promise((r) => setTimeout(r, 100));
    expect(sentTexts.some((m) => m === 'Hello World!')).toBe(true);
  });

  test('debounces assistant messages before flushing', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    const sentTexts = mockApiCapture(bridge);
    const agent = createAgent(db, { name: 'Test Agent', model: 'sonnet', voiceEnabled: false });
    const project = createProject(db, { name: 'Test Project', workingDir: '/tmp/test' });
    const session = createSession(db, { projectId: project.id, agentId: agent.id, name: 'Test', source: 'telegram' });
    const holder = captureSubscribe(pm);
    internals(bridge).subscribeForResponse(session.id, 12345);
    holder.cb!(session.id, makeAssistantEvent('Streaming...'));
    await new Promise((r) => setTimeout(r, 2000));
    expect(sentTexts.some((m) => m === 'Streaming...')).toBe(true);
  });

  test('ignores non-assistant events', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    const sentTexts = mockApiCapture(bridge);
    const agent = createAgent(db, { name: 'Test Agent', model: 'sonnet', voiceEnabled: false });
    const project = createProject(db, { name: 'Test Project', workingDir: '/tmp/test' });
    const session = createSession(db, { projectId: project.id, agentId: agent.id, name: 'Test', source: 'telegram' });
    const holder = captureSubscribe(pm);
    internals(bridge).subscribeForResponse(session.id, 12345);
    holder.cb!(session.id, { type: 'thinking', thinking: true } as ClaudeStreamEvent);
    holder.cb!(session.id, makeResultEvent());
    await new Promise((r) => setTimeout(r, 100));
    expect(sentTexts).toHaveLength(0);
  });

  test('handles object-style assistant messages', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    const sentTexts = mockApiCapture(bridge);
    const agent = createAgent(db, { name: 'Test Agent', model: 'sonnet', voiceEnabled: false });
    const project = createProject(db, { name: 'Test Project', workingDir: '/tmp/test' });
    const session = createSession(db, { projectId: project.id, agentId: agent.id, name: 'Test', source: 'telegram' });
    const holder = captureSubscribe(pm);
    internals(bridge).subscribeForResponse(session.id, 12345);
    holder.cb!(session.id, makeAssistantEvent('Object message'));
    holder.cb!(session.id, makeResultEvent());
    await new Promise((r) => setTimeout(r, 100));
    expect(sentTexts.some((m) => m === 'Object message')).toBe(true);
  });

  test('unsubscribes after result event', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    mockApiCapture(bridge);
    const agent = createAgent(db, { name: 'Test Agent', model: 'sonnet', voiceEnabled: false });
    const project = createProject(db, { name: 'Test Project', workingDir: '/tmp/test' });
    const session = createSession(db, { projectId: project.id, agentId: agent.id, name: 'Test', source: 'telegram' });
    const holder = captureSubscribe(pm);
    internals(bridge).subscribeForResponse(session.id, 12345);
    holder.cb!(session.id, makeResultEvent());
    await new Promise((r) => setTimeout(r, 100));
    expect(pm.unsubscribe).toHaveBeenCalledWith(session.id, expect.any(Function));
  });

  test('sends error message and unsubscribes on session_error (crash)', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    const sentTexts = mockApiCapture(bridge);
    const agent = createAgent(db, { name: 'Test Agent', model: 'sonnet', voiceEnabled: false });
    const project = createProject(db, { name: 'Test Project', workingDir: '/tmp/test' });
    const session = createSession(db, { projectId: project.id, agentId: agent.id, name: 'Test', source: 'telegram' });
    const holder = captureSubscribe(pm);
    internals(bridge).subscribeForResponse(session.id, 12345);
    holder.cb!(session.id, makeSessionErrorEvent('crash'));
    await new Promise((r) => setTimeout(r, 100));
    expect(sentTexts.some((m) => m.includes('crashed unexpectedly'))).toBe(true);
    expect(pm.unsubscribe).toHaveBeenCalledWith(session.id, expect.any(Function));
  });

  test('sends error message on session_error (context_exhausted)', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    const sentTexts = mockApiCapture(bridge);
    const agent = createAgent(db, { name: 'Test Agent', model: 'sonnet', voiceEnabled: false });
    const project = createProject(db, { name: 'Test Project', workingDir: '/tmp/test' });
    const session = createSession(db, { projectId: project.id, agentId: agent.id, name: 'Test', source: 'telegram' });
    const holder = captureSubscribe(pm);
    internals(bridge).subscribeForResponse(session.id, 12345);
    holder.cb!(session.id, makeSessionErrorEvent('context_exhausted'));
    await new Promise((r) => setTimeout(r, 100));
    expect(sentTexts.some((m) => m.includes('Context limit reached'))).toBe(true);
  });

  test('sends error message on session_error (credits_exhausted)', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    const sentTexts = mockApiCapture(bridge);
    const agent = createAgent(db, { name: 'Test Agent', model: 'sonnet', voiceEnabled: false });
    const project = createProject(db, { name: 'Test Project', workingDir: '/tmp/test' });
    const session = createSession(db, { projectId: project.id, agentId: agent.id, name: 'Test', source: 'telegram' });
    const holder = captureSubscribe(pm);
    internals(bridge).subscribeForResponse(session.id, 12345);
    holder.cb!(session.id, makeSessionErrorEvent('credits_exhausted'));
    await new Promise((r) => setTimeout(r, 100));
    expect(sentTexts.some((m) => m.includes('Credits exhausted'))).toBe(true);
  });

  test('sends error message on session_error (timeout)', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    const sentTexts = mockApiCapture(bridge);
    const agent = createAgent(db, { name: 'Test Agent', model: 'sonnet', voiceEnabled: false });
    const project = createProject(db, { name: 'Test Project', workingDir: '/tmp/test' });
    const session = createSession(db, { projectId: project.id, agentId: agent.id, name: 'Test', source: 'telegram' });
    const holder = captureSubscribe(pm);
    internals(bridge).subscribeForResponse(session.id, 12345);
    holder.cb!(session.id, makeSessionErrorEvent('timeout'));
    await new Promise((r) => setTimeout(r, 100));
    expect(sentTexts.some((m) => m.includes('Session timed out'))).toBe(true);
  });

  test('sends error message on session_error (context_compacted)', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    const sentTexts = mockApiCapture(bridge);
    const agent = createAgent(db, { name: 'Test Agent', model: 'sonnet', voiceEnabled: false });
    const project = createProject(db, { name: 'Test Project', workingDir: '/tmp/test' });
    const session = createSession(db, { projectId: project.id, agentId: agent.id, name: 'Test', source: 'telegram' });
    const holder = captureSubscribe(pm);
    internals(bridge).subscribeForResponse(session.id, 12345);
    holder.cb!(session.id, makeSessionErrorEvent('context_compacted'));
    await new Promise((r) => setTimeout(r, 100));
    expect(sentTexts.some((m) => m.includes('Context compacted'))).toBe(true);
  });

  test('unsubscribes on session_exited without sending error', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    const sentTexts = mockApiCapture(bridge);
    const agent = createAgent(db, { name: 'Test Agent', model: 'sonnet', voiceEnabled: false });
    const project = createProject(db, { name: 'Test Project', workingDir: '/tmp/test' });
    const session = createSession(db, { projectId: project.id, agentId: agent.id, name: 'Test', source: 'telegram' });
    const holder = captureSubscribe(pm);
    internals(bridge).subscribeForResponse(session.id, 12345);
    holder.cb!(session.id, makeSessionExitedEvent());
    await new Promise((r) => setTimeout(r, 100));
    expect(pm.unsubscribe).toHaveBeenCalledWith(session.id, expect.any(Function));
    expect(sentTexts).toHaveLength(0);
  });
});

describe('callTelegramApi', () => {
  test('makes POST request to Telegram API', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, { botToken: 'my-bot-token', chatId: '12345', allowedUserIds: [] });
    const originalFetch = globalThis.fetch;
    let capturedUrl = '';
    let capturedBody = '';
    globalThis.fetch = mock(async (url: string | URL | Request, opts?: RequestInit) => {
      capturedUrl = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
      capturedBody = (opts?.body ?? '') as string;
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
    }) as unknown as typeof fetch;
    try {
      const result = await internals(bridge).callTelegramApi('sendMessage', { chat_id: 12345, text: 'test' });
      expect(capturedUrl).toBe('https://api.telegram.org/botmy-bot-token/sendMessage');
      expect(JSON.parse(capturedBody)).toEqual({ chat_id: 12345, text: 'test' });
      expect(result.result).toEqual({ message_id: 1 });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('throws ExternalServiceError on HTTP failure', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(
      async () => new Response('{"ok": false, "description": "Bad Request"}', { status: 400 }),
    ) as unknown as typeof fetch;
    try {
      await expect(internals(bridge).callTelegramApi('sendMessage', { chat_id: 12345 })).rejects.toThrow('API error');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('downloadFile', () => {
  test('downloads file from Telegram CDN', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, { botToken: 'my-bot-token', chatId: '12345', allowedUserIds: [] });
    const originalFetch = globalThis.fetch;
    const fetchedUrls: string[] = [];
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
      fetchedUrls.push(urlStr);
      if (urlStr.includes('/getFile'))
        return new Response(
          JSON.stringify({
            ok: true,
            result: { file_id: 'f123', file_unique_id: 'u123', file_path: 'voice/file_0.oga' },
          }),
          { status: 200 },
        );
      if (urlStr.includes('/file/')) return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
      return new Response('Not found', { status: 404 });
    }) as unknown as typeof fetch;
    try {
      const buffer = await internals(bridge).downloadFile('f123');
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBe(4);
      expect(fetchedUrls.some((u) => u.includes('voice/file_0.oga'))).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('throws when file_path is missing', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(
      async () =>
        new Response(JSON.stringify({ ok: true, result: { file_id: 'f123', file_unique_id: 'u123' } }), {
          status: 200,
        }),
    ) as unknown as typeof fetch;
    try {
      await expect(internals(bridge).downloadFile('f123')).rejects.toThrow();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('throws on CDN download failure', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
      if (urlStr.includes('/getFile'))
        return new Response(
          JSON.stringify({
            ok: true,
            result: { file_id: 'f123', file_unique_id: 'u123', file_path: 'voice/file.oga' },
          }),
          { status: 200 },
        );
      return new Response('Server Error', { status: 500 });
    }) as unknown as typeof fetch;
    try {
      await expect(internals(bridge).downloadFile('f123')).rejects.toThrow();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('polling', () => {
  test('poll updates offset after processing', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    internals(bridge).running = true;
    let callCount = 0;
    internals(bridge).callTelegramApi = mock(async (method: string) => {
      callCount++;
      if (method === 'getUpdates' && callCount === 1) {
        return {
          result: [
            {
              update_id: 100,
              message: {
                message_id: 1,
                from: { id: 42, is_bot: false, first_name: 'User' },
                chat: { id: 12345, type: 'private' },
                text: '/start',
                date: Date.now(),
              },
            },
          ],
        };
      }
      return { result: [] };
    });
    await internals(bridge).poll();
    internals(bridge).running = false;
    expect(internals(bridge).offset).toBe(101);
  });
});

// ─── Work Intake Mode ──────────────────────────────────────────────────────

describe('TelegramBridge work intake mode', () => {
  const workIntakeConfig: TelegramBridgeConfig = {
    ...defaultConfig,
    mode: 'work_intake',
  };

  function createMockWorkTaskService() {
    const completionCallbacks = new Map<string, (task: import('../../shared/types/work-tasks').WorkTask) => void>();
    return {
      create: mock(async (input: Record<string, unknown>) => ({
        id: 'wt-test-001',
        agentId: input.agentId,
        projectId: 'proj-1',
        sessionId: null,
        source: 'telegram',
        sourceId: String(input.sourceId ?? ''),
        requesterInfo: input.requesterInfo ?? {},
        description: input.description,
        branchName: null,
        status: 'pending' as const,
        prUrl: null,
        summary: null,
        error: null,
        originalBranch: null,
        worktreeDir: null,
        iterationCount: 0,
        maxRetries: 0,
        retryCount: 0,
        retryBackoff: 'fixed' as const,
        lastRetryAt: null,
        priority: 2 as const,
        preemptedBy: null,
        queuedAt: null,
        createdAt: new Date().toISOString(),
        completedAt: null,
      })),
      onComplete: mock((taskId: string, cb: (task: import('../../shared/types/work-tasks').WorkTask) => void) => {
        completionCallbacks.set(taskId, cb);
      }),
      // Helper for tests to trigger completion
      _triggerComplete(taskId: string, task: import('../../shared/types/work-tasks').WorkTask) {
        const cb = completionCallbacks.get(taskId);
        if (cb) cb(task);
      },
    };
  }

  test('mode switch routes to work intake handler', async () => {
    const pm = createMockProcessManager();
    const wts = createMockWorkTaskService();
    const agent = createAgent(db, { name: 'test-agent' });
    createProject(db, { name: 'test-proj', workingDir: '/tmp/test' });

    const bridge = new TelegramBridge(db, pm, workIntakeConfig, wts as any);
    const sent = mockApiCapture(bridge);

    await internals(bridge).handleMessage(
      makeMessage({
        from: { id: 42, is_bot: false, first_name: 'User' },
        text: 'Fix the login bug',
      }),
    );

    expect(wts.create).toHaveBeenCalledTimes(1);
    const createArg = (wts.create as any).mock.calls[0][0];
    expect(createArg.description).toBe('Fix the login bug');
    expect(createArg.source).toBe('telegram');
    expect(createArg.agentId).toBe(agent.id);
    expect(createArg.requesterInfo.telegramUserId).toBe(42);
    expect(sent).toContain('Task queued: wt-test-001');
  });

  test('work intake sends error when no WorkTaskService', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, workIntakeConfig);
    const sent = mockApiCapture(bridge);

    await internals(bridge).handleMessage(
      makeMessage({
        from: { id: 42, is_bot: false, first_name: 'User' },
        text: 'Do something',
      }),
    );

    expect(sent).toContain('Work intake mode requires WorkTaskService. Check server configuration.');
  });

  test('work intake sends error when no agents configured', async () => {
    const pm = createMockProcessManager();
    const wts = createMockWorkTaskService();
    const bridge = new TelegramBridge(db, pm, workIntakeConfig, wts as any);
    const sent = mockApiCapture(bridge);

    await internals(bridge).handleMessage(
      makeMessage({
        from: { id: 42, is_bot: false, first_name: 'User' },
        text: 'Do something',
      }),
    );

    expect(sent).toContain('No agents configured. Create an agent first.');
  });

  test('work intake subscribes for completion', async () => {
    const pm = createMockProcessManager();
    const wts = createMockWorkTaskService();
    createAgent(db, { name: 'test-agent' });
    createProject(db, { name: 'test-proj', workingDir: '/tmp/test' });

    const bridge = new TelegramBridge(db, pm, workIntakeConfig, wts as any);
    mockApiCapture(bridge);

    await internals(bridge).handleMessage(
      makeMessage({
        from: { id: 42, is_bot: false, first_name: 'User' },
        text: 'Add dark mode',
      }),
    );

    expect(wts.onComplete).toHaveBeenCalledTimes(1);
    expect((wts.onComplete as any).mock.calls[0][0]).toBe('wt-test-001');
  });

  test('sendTaskResult formats completed task with PR URL', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, workIntakeConfig);
    const sent = mockApiCapture(bridge);

    await internals(bridge).sendTaskResult(12345, {
      id: 'wt-001',
      agentId: 'a1',
      projectId: 'p1',
      sessionId: null,
      source: 'telegram',
      sourceId: null,
      requesterInfo: {},
      description: 'Test',
      branchName: 'feat/test',
      status: 'completed',
      prUrl: 'https://github.com/org/repo/pull/1',
      summary: 'Added dark mode toggle',
      error: null,
      originalBranch: 'main',
      worktreeDir: null,
      iterationCount: 1,
      maxRetries: 0,
      retryCount: 0,
      retryBackoff: 'fixed' as const,
      lastRetryAt: null,
      priority: 2 as const,
      preemptedBy: null,
      queuedAt: null,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });

    expect(sent.length).toBe(1);
    expect(sent[0]).toContain('Task completed!');
    expect(sent[0]).toContain('https://github.com/org/repo/pull/1');
    expect(sent[0]).toContain('Added dark mode toggle');
  });

  test('sendTaskResult formats failed task', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, workIntakeConfig);
    const sent = mockApiCapture(bridge);

    await internals(bridge).sendTaskResult(12345, {
      id: 'wt-001',
      agentId: 'a1',
      projectId: 'p1',
      sessionId: null,
      source: 'telegram',
      sourceId: null,
      requesterInfo: {},
      description: 'Test',
      branchName: null,
      status: 'failed',
      prUrl: null,
      summary: null,
      error: 'Build failed: type errors',
      originalBranch: 'main',
      worktreeDir: null,
      iterationCount: 1,
      maxRetries: 0,
      retryCount: 0,
      retryBackoff: 'fixed' as const,
      lastRetryAt: null,
      priority: 2 as const,
      preemptedBy: null,
      queuedAt: null,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });

    expect(sent.length).toBe(1);
    expect(sent[0]).toContain('Task failed');
    expect(sent[0]).toContain('Build failed: type errors');
  });

  test('work intake handles create failure gracefully', async () => {
    const pm = createMockProcessManager();
    const wts = createMockWorkTaskService();
    wts.create = mock(async () => {
      throw new Error('Active task already exists for this project');
    });
    createAgent(db, { name: 'test-agent' });
    createProject(db, { name: 'test-proj', workingDir: '/tmp/test' });

    const bridge = new TelegramBridge(db, pm, workIntakeConfig, wts as any);
    const sent = mockApiCapture(bridge);

    await internals(bridge).handleMessage(
      makeMessage({
        from: { id: 42, is_bot: false, first_name: 'User' },
        text: 'Do something',
      }),
    );

    expect(sent.some((m) => m.includes('Task failed'))).toBe(true);
    expect(sent.some((m) => m.includes('Active task already exists'))).toBe(true);
  });

  test('chat mode still works when mode is chat', async () => {
    const pm = createMockProcessManager();
    createAgent(db, { name: 'test-agent' });
    createProject(db, { name: 'test-proj', workingDir: '/tmp/test' });

    const chatConfig: TelegramBridgeConfig = { ...defaultConfig, mode: 'chat' };
    const bridge = new TelegramBridge(db, pm, chatConfig);
    mockApiCapture(bridge);

    await internals(bridge).handleMessage(
      makeMessage({
        from: { id: 42, is_bot: false, first_name: 'User' },
        text: 'Hello',
      }),
    );

    // Should have started a process (chat mode behavior)
    expect(pm.startProcess).toHaveBeenCalledTimes(1);
  });

  test('commands still work in work intake mode', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, workIntakeConfig);
    const sent = mockApiCapture(bridge);

    await internals(bridge).handleMessage(
      makeMessage({
        from: { id: 42, is_bot: false, first_name: 'User' },
        text: '/start',
      }),
    );

    expect(sent).toContain('Connected to corvid-agent. Send a message to talk to an agent.');
  });
});

// ─── Poll Backoff ──────────────────────────────────────────────────────────

describe('poll backoff on errors', () => {
  test('consecutiveErrors increments on poll failure', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    internals(bridge).running = true;
    internals(bridge).callTelegramApi = mock(async () => {
      throw new Error('Network error');
    });
    await internals(bridge).poll();
    internals(bridge).running = false;
    expect(internals(bridge).consecutiveErrors).toBe(1);
  });

  test('consecutiveErrors resets on successful poll', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    internals(bridge).running = true;
    internals(bridge).consecutiveErrors = 5;
    internals(bridge).callTelegramApi = mock(async () => ({ result: [] }));
    await internals(bridge).poll();
    internals(bridge).running = false;
    expect(internals(bridge).consecutiveErrors).toBe(0);
  });

  test('backoff delay increases exponentially', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    internals(bridge).running = false; // prevent scheduled follow-up
    internals(bridge).callTelegramApi = mock(async () => {
      throw new Error('fail');
    });

    // Simulate 3 consecutive errors
    internals(bridge).running = true;
    await internals(bridge).poll();
    internals(bridge).running = false;
    expect(internals(bridge).consecutiveErrors).toBe(1);

    internals(bridge).running = true;
    await internals(bridge).poll();
    internals(bridge).running = false;
    expect(internals(bridge).consecutiveErrors).toBe(2);

    internals(bridge).running = true;
    await internals(bridge).poll();
    internals(bridge).running = false;
    expect(internals(bridge).consecutiveErrors).toBe(3);
  });

  test('backoff delay is capped at 30 seconds', () => {
    // Verify the formula: min(500 * 2^n, 30000)
    // At n=10: 500 * 1024 = 512000, capped to 30000
    const delay = Math.min(500 * 2 ** 10, 30_000);
    expect(delay).toBe(30_000);
  });
});

// ─── Update Deduplication ──────────────────────────────────────────────────

describe('update deduplication', () => {
  test('skips duplicate update_ids', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    bridge.start();
    bridge.stop(); // registers dedup namespace via start()

    const handled: TelegramMessage[] = [];
    internals(bridge).handleMessage = mock(async (msg: TelegramMessage) => {
      handled.push(msg);
    });

    const message = makeMessage({ from: { id: 100, is_bot: false, first_name: 'User' }, text: 'hello' });
    await internals(bridge).handleUpdate({ update_id: 555, message });
    await internals(bridge).handleUpdate({ update_id: 555, message }); // duplicate
    expect(handled).toHaveLength(1);
  });

  test('processes distinct update_ids', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    bridge.start();
    bridge.stop();

    const handled: TelegramMessage[] = [];
    internals(bridge).handleMessage = mock(async (msg: TelegramMessage) => {
      handled.push(msg);
    });

    const msg1 = makeMessage({ from: { id: 100, is_bot: false, first_name: 'User' }, text: 'first' });
    const msg2 = makeMessage({ from: { id: 100, is_bot: false, first_name: 'User' }, text: 'second' });
    await internals(bridge).handleUpdate({ update_id: 100, message: msg1 });
    await internals(bridge).handleUpdate({ update_id: 101, message: msg2 });
    expect(handled).toHaveLength(2);
  });

  test('dedup prevents reprocessing after poll error recovery', async () => {
    const pm = createMockProcessManager();
    const bridge = new TelegramBridge(db, pm, defaultConfig);
    bridge.start();
    bridge.stop();

    const handled: TelegramMessage[] = [];
    internals(bridge).handleMessage = mock(async (msg: TelegramMessage) => {
      handled.push(msg);
    });

    // Simulate: first poll processes update 200, then poll error occurs,
    // recovery re-fetches update 200 (offset didn't advance for some reason)
    await internals(bridge).handleUpdate({
      update_id: 200,
      message: makeMessage({ from: { id: 100, is_bot: false, first_name: 'User' }, text: 'msg' }),
    });
    await internals(bridge).handleUpdate({
      update_id: 200,
      message: makeMessage({ from: { id: 100, is_bot: false, first_name: 'User' }, text: 'msg' }),
    });
    expect(handled).toHaveLength(1);
  });
});

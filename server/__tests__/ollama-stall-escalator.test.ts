/**
 * Tests for OllamaStallEscalator.
 *
 * Covers:
 *  - Stall detection (cheerleading turns, no-tool short turns, productive turns)
 *  - Escalation trigger (work task creation + notification on threshold)
 *  - No double-escalation
 *  - Config flags (disabled, custom threshold)
 *  - Session cleanup on terminal events
 *  - Multiple sessions tracked independently
 *  - escalated_from_session_id metadata on the new work task
 *  - Non-Ollama sessions are ignored
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { EventCallback } from '../process/interfaces';
import {
  type IEventSubscribable,
  OLLAMA_STALL_ESCALATION_ENABLED,
  OLLAMA_STALL_THRESHOLD,
  OllamaStallEscalator,
} from '../process/ollama-stall-escalator';
import type { AssistantEvent, ClaudeStreamEvent, ResultEvent, SessionExitedEvent } from '../process/types';

// ── Mock functions (injected via constructor DI, no mock.module) ─────────

const mockGetSession = mock((_db: unknown, _id: string) => ({
  id: _id,
  agentId: 'agent-1',
  projectId: 'proj-1',
  name: 'test',
  status: 'running',
  source: 'web',
  initialPrompt: 'Fix the login bug',
  pid: null,
  totalCostUsd: 0,
  totalAlgoSpent: 0,
  totalTurns: 0,
  councilLaunchId: null,
  councilRole: null,
  workDir: null,
  creditsConsumed: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}));

const mockGetAgent = mock((_db: unknown, _id: string) => ({
  id: _id,
  name: 'Test Agent',
  description: '',
  systemPrompt: '',
  appendPrompt: '',
  model: 'qwen3:14b',
  provider: 'ollama',
  allowedTools: '',
  disallowedTools: '',
  permissionMode: 'default',
  maxBudgetUsd: null,
  algochatEnabled: false,
  algochatAuto: false,
  customFlags: {},
  defaultProjectId: null,
  mcpToolPermissions: null,
  voiceEnabled: false,
  voicePreset: null,
  displayColor: null,
  displayIcon: null,
  avatarUrl: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}));

const mockCreateWorkTask = mock((_db: unknown, _params: unknown) => ({
  id: 'task-abc123',
  agentId: 'agent-1',
  projectId: 'proj-1',
  sessionId: null,
  source: 'agent',
  sourceId: null,
  requesterInfo: {},
  description: 'Fix the login bug',
  branchName: null,
  status: 'queued',
  priority: 2,
  queuedAt: new Date().toISOString(),
  prUrl: null,
  summary: null,
  error: null,
  originalBranch: null,
  worktreeDir: null,
  iterationCount: 0,
  maxRetries: 0,
  retryCount: 0,
  retryBackoff: 'fixed',
  lastRetryAt: null,
  preemptedBy: null,
  createdAt: new Date().toISOString(),
  completedAt: null,
}));

// ── Helpers ──────────────────────────────────────────────────────────────

function createMockEventSource() {
  const callbacks: EventCallback[] = [];
  const source: IEventSubscribable = {
    subscribeAll(cb: EventCallback) {
      callbacks.push(cb);
    },
    unsubscribeAll(cb: EventCallback) {
      const idx = callbacks.indexOf(cb);
      if (idx >= 0) callbacks.splice(idx, 1);
    },
  };
  const emit = (sessionId: string, event: ClaudeStreamEvent) => {
    for (const cb of callbacks) cb(sessionId, event);
  };
  return { source, callbacks, emit };
}

const dummyDb = {} as import('bun:sqlite').Database;

/** Shared DI overrides so we don't need mock.module. */
const diOverrides = {
  getSession: mockGetSession as any,
  getAgent: mockGetAgent as any,
  createWorkTask: mockCreateWorkTask as any,
};

function createMockNotifier() {
  return {
    notify: mock(
      async (_params: { agentId: string; sessionId?: string; title?: string; message: string; level: string }) => {
        return { notificationId: 'n1', channels: [] };
      },
    ),
  };
}

function ollamaAgentStub(id: string) {
  return {
    id,
    provider: 'ollama',
    name: 'Test',
    model: 'qwen3:14b',
    description: '',
    systemPrompt: '',
    appendPrompt: '',
    allowedTools: '',
    disallowedTools: '',
    permissionMode: 'default',
    maxBudgetUsd: null,
    algochatEnabled: false,
    algochatAuto: false,
    customFlags: {},
    defaultProjectId: null,
    mcpToolPermissions: null,
    voiceEnabled: false,
    voicePreset: null,
    displayColor: null,
    displayIcon: null,
    avatarUrl: null,
    createdAt: '',
    updatedAt: '',
  };
}

// ── Event factories ───────────────────────────────────────────────────────

function cheerleadingEvent(): AssistantEvent {
  return { type: 'assistant', message: { role: 'assistant', content: "I'll look into that right away!" } };
}

function substantiveEvent(): AssistantEvent {
  return {
    type: 'assistant',
    message: {
      role: 'assistant',
      content:
        'Here is the fix:\n```ts\nfunction solve() { return 42; }\n```\nThis resolves the issue by computing the correct value.',
    },
  };
}

function shortNoToolEvent(): AssistantEvent {
  return { type: 'assistant', message: { role: 'assistant', content: 'Processing.' } };
}

function resultEvent(): ResultEvent {
  return { type: 'result', total_cost_usd: 0.001 };
}

function sessionExitedEvent(): SessionExitedEvent {
  return { type: 'session_exited' };
}

function contentBlockStartToolUse(): ClaudeStreamEvent {
  return {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'tool_use', id: 'tu1', name: 'bash', input: {} },
  } as ClaudeStreamEvent;
}

// ── Stall detection ───────────────────────────────────────────────────────

describe('OllamaStallEscalator — stall detection', () => {
  let ms: ReturnType<typeof createMockEventSource>;
  let notifier: ReturnType<typeof createMockNotifier>;

  beforeEach(() => {
    ms = createMockEventSource();
    notifier = createMockNotifier();
    mockGetAgent.mockImplementation((_db, id) => ollamaAgentStub(id as string));
  });

  test('counts consecutive cheerleading turns as stalled', () => {
    const e = new OllamaStallEscalator({
      eventSource: ms.source,
      db: dummyDb,
      notificationService: notifier as never,
      ...diOverrides,
      threshold: 5,
    });
    const sid = 'sid-cheer';
    ms.emit(sid, cheerleadingEvent());
    ms.emit(sid, resultEvent());
    expect(e.getConsecutiveStalledTurns(sid)).toBe(1);
    ms.emit(sid, cheerleadingEvent());
    ms.emit(sid, resultEvent());
    expect(e.getConsecutiveStalledTurns(sid)).toBe(2);
  });

  test('counts short no-tool turns as stalled', () => {
    const e = new OllamaStallEscalator({
      eventSource: ms.source,
      db: dummyDb,
      notificationService: notifier as never,
      ...diOverrides,
      threshold: 5,
    });
    const sid = 'sid-short';
    ms.emit(sid, shortNoToolEvent());
    ms.emit(sid, resultEvent());
    expect(e.getConsecutiveStalledTurns(sid)).toBe(1);
  });

  test('resets counter on substantive turn', () => {
    const e = new OllamaStallEscalator({
      eventSource: ms.source,
      db: dummyDb,
      notificationService: notifier as never,
      ...diOverrides,
      threshold: 5,
    });
    const sid = 'sid-reset';
    ms.emit(sid, cheerleadingEvent());
    ms.emit(sid, resultEvent());
    expect(e.getConsecutiveStalledTurns(sid)).toBe(1);
    ms.emit(sid, substantiveEvent());
    ms.emit(sid, resultEvent());
    expect(e.getConsecutiveStalledTurns(sid)).toBe(0);
  });

  test('resets counter when turn has tool calls', () => {
    const e = new OllamaStallEscalator({
      eventSource: ms.source,
      db: dummyDb,
      notificationService: notifier as never,
      ...diOverrides,
      threshold: 5,
    });
    const sid = 'sid-toolcall';
    ms.emit(sid, cheerleadingEvent());
    ms.emit(sid, resultEvent());
    expect(e.getConsecutiveStalledTurns(sid)).toBe(1);
    ms.emit(sid, contentBlockStartToolUse());
    ms.emit(sid, resultEvent());
    expect(e.getConsecutiveStalledTurns(sid)).toBe(0);
  });
});

// ── Escalation trigger ────────────────────────────────────────────────────

describe('OllamaStallEscalator — escalation trigger', () => {
  let ms: ReturnType<typeof createMockEventSource>;
  let notifier: ReturnType<typeof createMockNotifier>;

  beforeEach(() => {
    ms = createMockEventSource();
    notifier = createMockNotifier();
    mockGetAgent.mockImplementation((_db, id) => ollamaAgentStub(id as string));
    mockCreateWorkTask.mockClear();
  });

  test('triggers escalation after threshold stalled turns', async () => {
    const e = new OllamaStallEscalator({
      eventSource: ms.source,
      db: dummyDb,
      notificationService: notifier as never,
      ...diOverrides,
      threshold: 3,
    });
    const sid = 'sid-esc1';
    for (let i = 0; i < 3; i++) {
      ms.emit(sid, cheerleadingEvent());
      ms.emit(sid, resultEvent());
    }
    await Promise.resolve();
    expect(e.isEscalated(sid)).toBe(true);
    // 2 notifications: 1 pre-escalation warning at threshold-1 + 1 escalation at threshold
    expect(notifier.notify).toHaveBeenCalledTimes(2);
  });

  test('creates work task with escalated_from_session_id in requesterInfo', async () => {
    new OllamaStallEscalator({
      eventSource: ms.source,
      db: dummyDb,
      notificationService: notifier as never,
      ...diOverrides,
      threshold: 1,
    });
    const sid = 'sid-esc-task';
    ms.emit(sid, cheerleadingEvent());
    ms.emit(sid, resultEvent());
    await Promise.resolve();
    expect(mockCreateWorkTask).toHaveBeenCalledTimes(1);
    const params = (mockCreateWorkTask.mock.calls[0] as [unknown, { requesterInfo: Record<string, unknown> }])[1];
    expect(params.requesterInfo.escalated_from_session_id).toBe(sid);
    expect(params.requesterInfo.escalation_reason).toBe('ollama_stall');
  });

  test('notification contains session id and warning level', async () => {
    new OllamaStallEscalator({
      eventSource: ms.source,
      db: dummyDb,
      notificationService: notifier as never,
      ...diOverrides,
      threshold: 1,
    });
    const sid = 'sid-esc2';
    ms.emit(sid, cheerleadingEvent());
    ms.emit(sid, resultEvent());
    await Promise.resolve();
    const call = notifier.notify.mock.calls[0][0] as {
      sessionId?: string;
      level: string;
      title?: string;
      message: string;
    };
    expect(call.sessionId).toBe(sid);
    expect(call.level).toBe('warning');
    expect(call.title).toMatch(/escalat/i);
  });

  test('does not double-escalate the same session', async () => {
    new OllamaStallEscalator({
      eventSource: ms.source,
      db: dummyDb,
      notificationService: notifier as never,
      ...diOverrides,
      threshold: 1,
    });
    const sid = 'sid-esc3';
    ms.emit(sid, cheerleadingEvent());
    ms.emit(sid, resultEvent());
    await Promise.resolve();
    expect(notifier.notify).toHaveBeenCalledTimes(1);
    ms.emit(sid, cheerleadingEvent());
    ms.emit(sid, resultEvent());
    await Promise.resolve();
    expect(notifier.notify).toHaveBeenCalledTimes(1);
  });
});

// ── Config flags ──────────────────────────────────────────────────────────

describe('OllamaStallEscalator — config flags', () => {
  beforeEach(() => {
    mockGetAgent.mockImplementation((_db, id) => ollamaAgentStub(id as string));
  });

  test('does nothing when enabled=false', async () => {
    const ms = createMockEventSource();
    const notifier = createMockNotifier();
    const e = new OllamaStallEscalator({
      eventSource: ms.source,
      db: dummyDb,
      notificationService: notifier as never,
      ...diOverrides,
      threshold: 1,
      enabled: false,
    });
    const sid = 'sid-dis';
    ms.emit(sid, cheerleadingEvent());
    ms.emit(sid, resultEvent());
    await Promise.resolve();
    expect(e.isEscalated(sid)).toBe(false);
    expect(notifier.notify).not.toHaveBeenCalled();
  });

  test('uses custom threshold', async () => {
    const ms = createMockEventSource();
    const notifier = createMockNotifier();
    const e = new OllamaStallEscalator({
      eventSource: ms.source,
      db: dummyDb,
      notificationService: notifier as never,
      ...diOverrides,
      threshold: 2,
    });
    const sid = 'sid-thresh';
    ms.emit(sid, cheerleadingEvent());
    ms.emit(sid, resultEvent());
    await Promise.resolve();
    expect(e.isEscalated(sid)).toBe(false);
    ms.emit(sid, cheerleadingEvent());
    ms.emit(sid, resultEvent());
    await Promise.resolve();
    expect(e.isEscalated(sid)).toBe(true);
  });

  test('exports numeric OLLAMA_STALL_THRESHOLD constant', () => {
    expect(typeof OLLAMA_STALL_THRESHOLD).toBe('number');
    expect(OLLAMA_STALL_THRESHOLD).toBeGreaterThan(0);
  });

  test('exports boolean OLLAMA_STALL_ESCALATION_ENABLED constant', () => {
    expect(typeof OLLAMA_STALL_ESCALATION_ENABLED).toBe('boolean');
  });
});

// ── Graduated escalation (pre-escalation warning) ─────────────────────────

describe('OllamaStallEscalator — graduated escalation', () => {
  let ms: ReturnType<typeof createMockEventSource>;
  let notifier: ReturnType<typeof createMockNotifier>;

  beforeEach(() => {
    ms = createMockEventSource();
    notifier = createMockNotifier();
    mockGetAgent.mockImplementation((_db, id) => ollamaAgentStub(id as string));
    mockCreateWorkTask.mockClear();
  });

  test('emits warning notification at threshold-1 before escalation', async () => {
    new OllamaStallEscalator({
      eventSource: ms.source,
      db: dummyDb,
      notificationService: notifier as never,
      ...diOverrides,
      threshold: 3,
    });
    const sid = 'sid-grad1';
    // Turn 1 — stall, no warning yet
    ms.emit(sid, cheerleadingEvent());
    ms.emit(sid, resultEvent());
    await Promise.resolve();
    expect(notifier.notify).not.toHaveBeenCalled();
    // Turn 2 — stall, threshold-1 reached → warning
    ms.emit(sid, cheerleadingEvent());
    ms.emit(sid, resultEvent());
    await Promise.resolve();
    expect(notifier.notify).toHaveBeenCalledTimes(1);
    const call = notifier.notify.mock.calls[0][0] as { level: string; title?: string };
    expect(call.level).toBe('info');
    expect(call.title).toMatch(/warning/i);
    // Turn 3 — stall, threshold reached → escalation
    ms.emit(sid, cheerleadingEvent());
    ms.emit(sid, resultEvent());
    await Promise.resolve();
    expect(notifier.notify).toHaveBeenCalledTimes(2);
    const escCall = notifier.notify.mock.calls[1][0] as { level: string; title?: string };
    expect(escCall.level).toBe('warning');
  });

  test('does not warn when threshold is 1 (no room for warning)', async () => {
    const e = new OllamaStallEscalator({
      eventSource: ms.source,
      db: dummyDb,
      notificationService: notifier as never,
      ...diOverrides,
      threshold: 1,
    });
    const sid = 'sid-grad2';
    ms.emit(sid, cheerleadingEvent());
    ms.emit(sid, resultEvent());
    await Promise.resolve();
    // Should go straight to escalation (warning level), no info-level warning
    expect(e.isEscalated(sid)).toBe(true);
    expect(notifier.notify).toHaveBeenCalledTimes(1);
    const call = notifier.notify.mock.calls[0][0] as { level: string };
    expect(call.level).toBe('warning');
  });

  test('isWarned returns true after pre-escalation warning', async () => {
    const e = new OllamaStallEscalator({
      eventSource: ms.source,
      db: dummyDb,
      notificationService: notifier as never,
      ...diOverrides,
      threshold: 3,
    });
    const sid = 'sid-grad3';
    ms.emit(sid, cheerleadingEvent());
    ms.emit(sid, resultEvent());
    expect(e.isWarned(sid)).toBe(false);
    ms.emit(sid, cheerleadingEvent());
    ms.emit(sid, resultEvent());
    expect(e.isWarned(sid)).toBe(true);
  });

  test('warning is only sent once even with multiple stalls at threshold-1', async () => {
    // This can't happen naturally (threshold-1 → threshold immediately),
    // but verify the flag prevents duplicates
    const e = new OllamaStallEscalator({
      eventSource: ms.source,
      db: dummyDb,
      notificationService: notifier as never,
      ...diOverrides,
      threshold: 4,
    });
    const sid = 'sid-grad4';
    // 3 stalls to reach threshold-1
    for (let i = 0; i < 3; i++) {
      ms.emit(sid, cheerleadingEvent());
      ms.emit(sid, resultEvent());
    }
    await Promise.resolve();
    expect(e.isWarned(sid)).toBe(true);
    expect(notifier.notify).toHaveBeenCalledTimes(1);
    // Turn 4 triggers escalation
    ms.emit(sid, cheerleadingEvent());
    ms.emit(sid, resultEvent());
    await Promise.resolve();
    // 1 warning + 1 escalation = 2 notifications
    expect(notifier.notify).toHaveBeenCalledTimes(2);
  });
});

// ── Non-Ollama sessions ───────────────────────────────────────────────────

describe('OllamaStallEscalator — non-Ollama sessions', () => {
  test('ignores sessions whose agent provider is not ollama', async () => {
    const ms = createMockEventSource();
    const notifier = createMockNotifier();
    mockGetAgent.mockImplementation((_db, id) => ({
      ...ollamaAgentStub(id as string),
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
    }));

    const e = new OllamaStallEscalator({
      eventSource: ms.source,
      db: dummyDb,
      notificationService: notifier as never,
      ...diOverrides,
      threshold: 1,
    });
    const sid = 'sid-claude';
    ms.emit(sid, cheerleadingEvent());
    ms.emit(sid, resultEvent());
    await Promise.resolve();
    expect(e.getConsecutiveStalledTurns(sid)).toBe(0);
    expect(e.isEscalated(sid)).toBe(false);
    expect(notifier.notify).not.toHaveBeenCalled();
  });
});

// ── Lifecycle ─────────────────────────────────────────────────────────────

describe('OllamaStallEscalator — lifecycle', () => {
  beforeEach(() => {
    mockGetAgent.mockImplementation((_db, id) => ollamaAgentStub(id as string));
  });

  test('cleans up state on session_exited event', () => {
    const ms = createMockEventSource();
    const e = new OllamaStallEscalator({
      eventSource: ms.source,
      db: dummyDb,
      notificationService: createMockNotifier() as never,
      ...diOverrides,
      threshold: 5,
    });
    const sid = 'sid-lc1';
    ms.emit(sid, cheerleadingEvent());
    ms.emit(sid, resultEvent());
    expect(e.getConsecutiveStalledTurns(sid)).toBe(1);
    ms.emit(sid, sessionExitedEvent());
    expect(e.getConsecutiveStalledTurns(sid)).toBe(0);
  });

  test('cleans up state on session_stopped event', () => {
    const ms = createMockEventSource();
    const e = new OllamaStallEscalator({
      eventSource: ms.source,
      db: dummyDb,
      notificationService: createMockNotifier() as never,
      ...diOverrides,
      threshold: 5,
    });
    const sid = 'sid-lc2';
    ms.emit(sid, cheerleadingEvent());
    ms.emit(sid, resultEvent());
    expect(e.getConsecutiveStalledTurns(sid)).toBe(1);
    ms.emit(sid, { type: 'session_stopped' } as ClaudeStreamEvent);
    expect(e.getConsecutiveStalledTurns(sid)).toBe(0);
  });

  test('destroy() unsubscribes from event source', () => {
    const ms = createMockEventSource();
    const e = new OllamaStallEscalator({
      eventSource: ms.source,
      db: dummyDb,
      notificationService: createMockNotifier() as never,
      ...diOverrides,
      threshold: 5,
    });
    expect(ms.callbacks.length).toBe(1);
    e.destroy(ms.source);
    expect(ms.callbacks.length).toBe(0);
  });

  test('tracks multiple sessions independently', () => {
    const ms = createMockEventSource();
    const e = new OllamaStallEscalator({
      eventSource: ms.source,
      db: dummyDb,
      notificationService: createMockNotifier() as never,
      ...diOverrides,
      threshold: 5,
    });
    const sid1 = 'sid-multi-a';
    const sid2 = 'sid-multi-b';
    ms.emit(sid1, cheerleadingEvent());
    ms.emit(sid1, resultEvent());
    ms.emit(sid2, substantiveEvent());
    ms.emit(sid2, resultEvent());
    expect(e.getConsecutiveStalledTurns(sid1)).toBe(1);
    expect(e.getConsecutiveStalledTurns(sid2)).toBe(0);
  });
});

// ── Work task metadata ────────────────────────────────────────────────────

describe('OllamaStallEscalator — work task metadata', () => {
  test('notification message references the work task queue', async () => {
    const ms = createMockEventSource();
    const notifier = createMockNotifier();
    mockGetAgent.mockImplementation((_db, id) => ollamaAgentStub(id as string));

    new OllamaStallEscalator({
      eventSource: ms.source,
      db: dummyDb,
      notificationService: notifier as never,
      ...diOverrides,
      threshold: 1,
    });
    const sid = 'sid-meta';
    ms.emit(sid, cheerleadingEvent());
    ms.emit(sid, resultEvent());
    await Promise.resolve();

    const msg = (notifier.notify.mock.calls[0][0] as { message: string }).message;
    expect(msg).toMatch(/task/i);
    expect(msg).toMatch(/queue|re-queued/i);
  });
});

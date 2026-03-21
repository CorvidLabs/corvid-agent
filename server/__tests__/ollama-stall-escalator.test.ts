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

import { describe, test, expect, beforeEach, mock } from 'bun:test';
import type { ClaudeStreamEvent, AssistantEvent, ResultEvent, SessionExitedEvent } from '../process/types';
import type { EventCallback } from '../process/interfaces';

// ── Module mocks (must precede import of the module under test) ──────────

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

mock.module('../db/sessions', () => ({ getSession: mockGetSession }));
mock.module('../db/agents', () => ({ getAgent: mockGetAgent }));
mock.module('../db/work-tasks', () => ({ createWorkTask: mockCreateWorkTask }));

// ── Import AFTER mock.module calls ───────────────────────────────────────

import {
    OllamaStallEscalator,
    type IEventSubscribable,
    OLLAMA_STALL_THRESHOLD,
    OLLAMA_STALL_ESCALATION_ENABLED,
} from '../process/ollama-stall-escalator';

// ── Helpers ──────────────────────────────────────────────────────────────

function createMockEventSource() {
    const callbacks: EventCallback[] = [];
    const source: IEventSubscribable = {
        subscribeAll(cb: EventCallback) { callbacks.push(cb); },
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

function createMockNotifier() {
    return {
        notify: mock(async (_params: { agentId: string; sessionId?: string; title?: string; message: string; level: string }) => {
            return { notificationId: 'n1', channels: [] };
        }),
    };
}

function ollamaAgentStub(id: string) {
    return {
        id, provider: 'ollama', name: 'Test', model: 'qwen3:14b',
        description: '', systemPrompt: '', appendPrompt: '',
        allowedTools: '', disallowedTools: '', permissionMode: 'default',
        maxBudgetUsd: null, algochatEnabled: false, algochatAuto: false,
        customFlags: {}, defaultProjectId: null, mcpToolPermissions: null,
        voiceEnabled: false, voicePreset: null, displayColor: null,
        displayIcon: null, avatarUrl: null, createdAt: '', updatedAt: '',
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
            content: 'Here is the fix:\n```ts\nfunction solve() { return 42; }\n```\nThis resolves the issue by computing the correct value.',
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
        const e = new OllamaStallEscalator({ eventSource: ms.source, db: dummyDb, notificationService: notifier as never, threshold: 5 });
        const sid = 'sid-cheer';
        ms.emit(sid, cheerleadingEvent()); ms.emit(sid, resultEvent());
        expect(e.getConsecutiveStalledTurns(sid)).toBe(1);
        ms.emit(sid, cheerleadingEvent()); ms.emit(sid, resultEvent());
        expect(e.getConsecutiveStalledTurns(sid)).toBe(2);
    });

    test('counts short no-tool turns as stalled', () => {
        const e = new OllamaStallEscalator({ eventSource: ms.source, db: dummyDb, notificationService: notifier as never, threshold: 5 });
        const sid = 'sid-short';
        ms.emit(sid, shortNoToolEvent()); ms.emit(sid, resultEvent());
        expect(e.getConsecutiveStalledTurns(sid)).toBe(1);
    });

    test('resets counter on substantive turn', () => {
        const e = new OllamaStallEscalator({ eventSource: ms.source, db: dummyDb, notificationService: notifier as never, threshold: 5 });
        const sid = 'sid-reset';
        ms.emit(sid, cheerleadingEvent()); ms.emit(sid, resultEvent());
        expect(e.getConsecutiveStalledTurns(sid)).toBe(1);
        ms.emit(sid, substantiveEvent()); ms.emit(sid, resultEvent());
        expect(e.getConsecutiveStalledTurns(sid)).toBe(0);
    });

    test('resets counter when turn has tool calls', () => {
        const e = new OllamaStallEscalator({ eventSource: ms.source, db: dummyDb, notificationService: notifier as never, threshold: 5 });
        const sid = 'sid-toolcall';
        ms.emit(sid, cheerleadingEvent()); ms.emit(sid, resultEvent());
        expect(e.getConsecutiveStalledTurns(sid)).toBe(1);
        ms.emit(sid, contentBlockStartToolUse()); ms.emit(sid, resultEvent());
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
        const e = new OllamaStallEscalator({ eventSource: ms.source, db: dummyDb, notificationService: notifier as never, threshold: 3 });
        const sid = 'sid-esc1';
        for (let i = 0; i < 3; i++) { ms.emit(sid, cheerleadingEvent()); ms.emit(sid, resultEvent()); }
        await Promise.resolve();
        expect(e.isEscalated(sid)).toBe(true);
        expect(notifier.notify).toHaveBeenCalledTimes(1);
    });

    test('creates work task with escalated_from_session_id in requesterInfo', async () => {
        new OllamaStallEscalator({ eventSource: ms.source, db: dummyDb, notificationService: notifier as never, threshold: 1 });
        const sid = 'sid-esc-task';
        ms.emit(sid, cheerleadingEvent()); ms.emit(sid, resultEvent());
        await Promise.resolve();
        expect(mockCreateWorkTask).toHaveBeenCalledTimes(1);
        const params = (mockCreateWorkTask.mock.calls[0] as [unknown, { requesterInfo: Record<string, unknown> }])[1];
        expect(params.requesterInfo.escalated_from_session_id).toBe(sid);
        expect(params.requesterInfo.escalation_reason).toBe('ollama_stall');
    });

    test('notification contains session id and warning level', async () => {
        new OllamaStallEscalator({ eventSource: ms.source, db: dummyDb, notificationService: notifier as never, threshold: 1 });
        const sid = 'sid-esc2';
        ms.emit(sid, cheerleadingEvent()); ms.emit(sid, resultEvent());
        await Promise.resolve();
        const call = notifier.notify.mock.calls[0][0] as { sessionId?: string; level: string; title?: string; message: string };
        expect(call.sessionId).toBe(sid);
        expect(call.level).toBe('warning');
        expect(call.title).toMatch(/escalat/i);
    });

    test('does not double-escalate the same session', async () => {
        new OllamaStallEscalator({ eventSource: ms.source, db: dummyDb, notificationService: notifier as never, threshold: 1 });
        const sid = 'sid-esc3';
        ms.emit(sid, cheerleadingEvent()); ms.emit(sid, resultEvent());
        await Promise.resolve();
        expect(notifier.notify).toHaveBeenCalledTimes(1);
        ms.emit(sid, cheerleadingEvent()); ms.emit(sid, resultEvent());
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
        const e = new OllamaStallEscalator({ eventSource: ms.source, db: dummyDb, notificationService: notifier as never, threshold: 1, enabled: false });
        const sid = 'sid-dis';
        ms.emit(sid, cheerleadingEvent()); ms.emit(sid, resultEvent());
        await Promise.resolve();
        expect(e.isEscalated(sid)).toBe(false);
        expect(notifier.notify).not.toHaveBeenCalled();
    });

    test('uses custom threshold', async () => {
        const ms = createMockEventSource();
        const notifier = createMockNotifier();
        const e = new OllamaStallEscalator({ eventSource: ms.source, db: dummyDb, notificationService: notifier as never, threshold: 2 });
        const sid = 'sid-thresh';
        ms.emit(sid, cheerleadingEvent()); ms.emit(sid, resultEvent());
        await Promise.resolve();
        expect(e.isEscalated(sid)).toBe(false);
        ms.emit(sid, cheerleadingEvent()); ms.emit(sid, resultEvent());
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

// ── Non-Ollama sessions ───────────────────────────────────────────────────

describe('OllamaStallEscalator — non-Ollama sessions', () => {
    test('ignores sessions whose agent provider is not ollama', async () => {
        const ms = createMockEventSource();
        const notifier = createMockNotifier();
        mockGetAgent.mockImplementation((_db, id) => ({ ...ollamaAgentStub(id as string), provider: 'anthropic', model: 'claude-sonnet-4-6' }));

        const e = new OllamaStallEscalator({ eventSource: ms.source, db: dummyDb, notificationService: notifier as never, threshold: 1 });
        const sid = 'sid-claude';
        ms.emit(sid, cheerleadingEvent()); ms.emit(sid, resultEvent());
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
        const e = new OllamaStallEscalator({ eventSource: ms.source, db: dummyDb, notificationService: createMockNotifier() as never, threshold: 5 });
        const sid = 'sid-lc1';
        ms.emit(sid, cheerleadingEvent()); ms.emit(sid, resultEvent());
        expect(e.getConsecutiveStalledTurns(sid)).toBe(1);
        ms.emit(sid, sessionExitedEvent());
        expect(e.getConsecutiveStalledTurns(sid)).toBe(0);
    });

    test('cleans up state on session_stopped event', () => {
        const ms = createMockEventSource();
        const e = new OllamaStallEscalator({ eventSource: ms.source, db: dummyDb, notificationService: createMockNotifier() as never, threshold: 5 });
        const sid = 'sid-lc2';
        ms.emit(sid, cheerleadingEvent()); ms.emit(sid, resultEvent());
        expect(e.getConsecutiveStalledTurns(sid)).toBe(1);
        ms.emit(sid, { type: 'session_stopped' } as ClaudeStreamEvent);
        expect(e.getConsecutiveStalledTurns(sid)).toBe(0);
    });

    test('destroy() unsubscribes from event source', () => {
        const ms = createMockEventSource();
        const e = new OllamaStallEscalator({ eventSource: ms.source, db: dummyDb, notificationService: createMockNotifier() as never, threshold: 5 });
        expect(ms.callbacks.length).toBe(1);
        e.destroy(ms.source);
        expect(ms.callbacks.length).toBe(0);
    });

    test('tracks multiple sessions independently', () => {
        const ms = createMockEventSource();
        const e = new OllamaStallEscalator({ eventSource: ms.source, db: dummyDb, notificationService: createMockNotifier() as never, threshold: 5 });
        const sid1 = 'sid-multi-a';
        const sid2 = 'sid-multi-b';
        ms.emit(sid1, cheerleadingEvent()); ms.emit(sid1, resultEvent());
        ms.emit(sid2, substantiveEvent()); ms.emit(sid2, resultEvent());
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

        new OllamaStallEscalator({ eventSource: ms.source, db: dummyDb, notificationService: notifier as never, threshold: 1 });
        const sid = 'sid-meta';
        ms.emit(sid, cheerleadingEvent()); ms.emit(sid, resultEvent());
        await Promise.resolve();

        const msg = (notifier.notify.mock.calls[0][0] as { message: string }).message;
        expect(msg).toMatch(/task/i);
        expect(msg).toMatch(/queue|re-queued/i);
    });
});

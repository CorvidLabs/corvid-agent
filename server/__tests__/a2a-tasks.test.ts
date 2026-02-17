import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { handleTaskSend, handleTaskGet, clearTaskStore } from '../a2a/task-handler';
import type { A2ATaskDeps } from '../a2a/task-handler';

// ─── Mock data ──────────────────────────────────────────────────────────────

const MOCK_AGENT = {
    id: 'agent-1',
    name: 'TestAgent',
    defaultProjectId: 'proj-1',
    description: '',
    systemPrompt: '',
    appendPrompt: '',
    model: '',
    allowedTools: '',
    disallowedTools: '',
    permissionMode: 'default' as const,
    maxBudgetUsd: null,
    algochatEnabled: false,
    algochatAuto: false,
    customFlags: {},
    mcpToolPermissions: null,
    walletAddress: null,
    walletFundedAlgo: 0,
    voiceEnabled: false,
    voicePreset: 'alloy' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
};

const MOCK_SESSION = {
    id: 'session-1',
    projectId: 'proj-1',
    agentId: 'agent-1',
    name: 'A2A Task: test',
    status: 'idle' as const,
    source: 'agent' as const,
    initialPrompt: '',
    pid: null,
    totalCostUsd: 0,
    totalAlgoSpent: 0,
    totalTurns: 0,
    councilLaunchId: null,
    councilRole: null,
    workDir: null,
    creditsConsumed: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
};

// ─── Test helpers ───────────────────────────────────────────────────────────

function createMockDeps(overrides?: Partial<A2ATaskDeps>): A2ATaskDeps {
    return {
        db: {} as A2ATaskDeps['db'],
        processManager: {
            startProcess: mock(() => {}),
            stopProcess: mock(() => {}),
            isRunning: mock(() => false),
            subscribe: mock(() => {}),
            unsubscribe: mock(() => {}),
            subscribeAll: mock(() => {}),
            unsubscribeAll: mock(() => {}),
        } as unknown as A2ATaskDeps['processManager'],
        listAgents: mock(() => [MOCK_AGENT]),
        createSession: mock(() => MOCK_SESSION),
        ...overrides,
    };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('A2A Task Handler', () => {
    let deps: A2ATaskDeps;

    beforeEach(() => {
        clearTaskStore();
        deps = createMockDeps();
    });

    // 1. handleTaskSend creates a task with 'submitted' state initially
    it('creates a task that transitions through submitted state', () => {
        const task = handleTaskSend(deps, { message: 'Hello agent' });

        expect(task.state).toBe('working');
        expect(task).toBeDefined();
        expect(task.id).toBeTruthy();
    });

    // 2. handleTaskSend includes user message in task
    it('includes the user message in the task messages', () => {
        const task = handleTaskSend(deps, { message: 'Analyze this code' });

        expect(task.messages).toHaveLength(1);
        expect(task.messages[0].role).toBe('user');
        expect(task.messages[0].parts).toHaveLength(1);
        expect(task.messages[0].parts[0].type).toBe('text');
        expect(task.messages[0].parts[0].text).toBe('Analyze this code');
    });

    // 3. handleTaskSend throws for missing agent with default project
    it('throws when no agent with a default project is available', () => {
        deps = createMockDeps({ listAgents: mock(() => []) });

        expect(() => handleTaskSend(deps, { message: 'test' })).toThrow(
            'No agent with a default project is available to handle A2A tasks',
        );
    });

    // 4. handleTaskGet returns null for unknown taskId
    it('returns null for an unknown task ID', () => {
        const result = handleTaskGet('nonexistent-id');
        expect(result).toBeNull();
    });

    // 5. handleTaskGet returns a previously created task
    it('returns a previously created task by ID', () => {
        const task = handleTaskSend(deps, { message: 'Find the bug' });
        const retrieved = handleTaskGet(task.id);

        expect(retrieved).not.toBeNull();
        expect(retrieved!.id).toBe(task.id);
        expect(retrieved!.messages[0].parts[0].text).toBe('Find the bug');
    });

    // 6. clearTaskStore removes all tasks
    it('removes all tasks when clearTaskStore is called', () => {
        const task1 = handleTaskSend(deps, { message: 'Task one' });
        const task2 = handleTaskSend(deps, { message: 'Task two' });

        expect(handleTaskGet(task1.id)).not.toBeNull();
        expect(handleTaskGet(task2.id)).not.toBeNull();

        clearTaskStore();

        expect(handleTaskGet(task1.id)).toBeNull();
        expect(handleTaskGet(task2.id)).toBeNull();
    });

    // 7. Task has valid id and timestamps
    it('has a valid UUID id and ISO timestamp strings', () => {
        const task = handleTaskSend(deps, { message: 'Check timestamps' });

        expect(task.id).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );

        expect(() => new Date(task.createdAt)).not.toThrow();
        expect(new Date(task.createdAt).toISOString()).toBe(task.createdAt);
        expect(() => new Date(task.updatedAt)).not.toThrow();
        expect(new Date(task.updatedAt).toISOString()).toBe(task.updatedAt);
    });

    // 8. Task transitions from submitted to working after session creation
    it('transitions to working state and wires up session', () => {
        const task = handleTaskSend(deps, { message: 'Do work' });

        expect(task.state).toBe('working');
        expect(task.sessionId).toBe('session-1');

        const pm = deps.processManager as unknown as {
            subscribe: ReturnType<typeof mock>;
            startProcess: ReturnType<typeof mock>;
        };
        expect(pm.subscribe).toHaveBeenCalledTimes(1);
        expect(pm.startProcess).toHaveBeenCalledTimes(1);
    });
});

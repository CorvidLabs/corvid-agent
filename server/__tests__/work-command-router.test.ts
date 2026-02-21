import { test, expect, beforeEach, describe, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { createAgent } from '../db/agents';
import { createProject } from '../db/projects';
import { getAgentMessage } from '../db/agent-messages';
import { WorkCommandRouter } from '../algochat/work-command-router';
import type { WorkTaskService } from '../work/service';
import type { Agent } from '../../shared/types';

// ─── Test state ──────────────────────────────────────────────────────────────

let db: Database;
let router: WorkCommandRouter;
let agentA: Agent;
let agentB: Agent;
let projectId: string;

beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);

    const project = createProject(db, {
        name: 'Test Project',
        workingDir: '/tmp/test',
    });
    projectId = project.id;

    agentA = createAgent(db, { name: 'Agent A' });
    agentB = createAgent(db, { name: 'Agent B' });

    router = new WorkCommandRouter(db);
});

// ─── handleSlashCommand() ────────────────────────────────────────────────────

describe('handleSlashCommand()', () => {
    test('responds with usage when description is empty', () => {
        const responses: string[] = [];
        const respond = (text: string) => responses.push(text);

        router.handleSlashCommand('participant-1', '', respond, () => agentA.id);

        expect(responses.length).toBe(1);
        expect(responses[0]).toContain('Usage');
    });

    test('responds when work task service is not available', () => {
        const responses: string[] = [];
        const respond = (text: string) => responses.push(text);

        router.handleSlashCommand('participant-1', 'do something', respond, () => agentA.id);

        expect(responses.length).toBe(1);
        expect(responses[0]).toContain('not available');
    });

    test('responds when no agent is available', () => {
        const mockService = {
            create: mock(() => Promise.resolve({})),
            onComplete: mock(() => {}),
        } as unknown as WorkTaskService;
        router.setWorkTaskService(mockService);

        const responses: string[] = [];
        const respond = (text: string) => responses.push(text);

        router.handleSlashCommand('participant-1', 'do something', respond, () => null);

        expect(responses.length).toBe(1);
        expect(responses[0]).toContain('No agent available');
    });

    test('creates a work task and responds with task info', async () => {
        const mockCreate = mock(() =>
            Promise.resolve({
                id: 'task-123',
                branchName: 'agent/test/branch',
                status: 'running',
            }),
        );
        const mockOnComplete = mock(() => {});
        const mockService = {
            create: mockCreate,
            onComplete: mockOnComplete,
        } as unknown as WorkTaskService;
        router.setWorkTaskService(mockService);

        const responses: string[] = [];
        const respond = (text: string) => responses.push(text);

        router.handleSlashCommand('participant-1', 'implement feature X', respond, () => agentA.id);

        // Wait for the promise to resolve
        await new Promise((r) => setTimeout(r, 50));

        expect(mockCreate).toHaveBeenCalledTimes(1);
        const createCall = (mockCreate.mock.calls as unknown as Array<[Record<string, unknown>]>)[0][0];
        expect(createCall.agentId).toBe(agentA.id);
        expect(createCall.description).toBe('implement feature X');
        expect(createCall.source).toBe('algochat');
        expect((createCall.requesterInfo as Record<string, string>).participant).toBe('participant-1');

        expect(responses.length).toBe(1);
        expect(responses[0]).toContain('task-123');
        expect(responses[0]).toContain('agent/test/branch');

        // Verify onComplete was registered
        expect(mockOnComplete).toHaveBeenCalledTimes(1);
    });

    test('completion callback sends success message with PR URL', async () => {
        let completionCallback: ((task: Record<string, unknown>) => void) | null = null;

        const mockService = {
            create: mock(() =>
                Promise.resolve({
                    id: 'task-456',
                    branchName: 'agent/test/branch',
                    status: 'running',
                }),
            ),
            onComplete: mock((_taskId: string, cb: (task: Record<string, unknown>) => void) => {
                completionCallback = cb;
            }),
        } as unknown as WorkTaskService;
        router.setWorkTaskService(mockService);

        const responses: string[] = [];
        const respond = (text: string) => responses.push(text);

        router.handleSlashCommand('participant-1', 'fix bug', respond, () => agentA.id);
        await new Promise((r) => setTimeout(r, 50));

        // Simulate completion with PR URL
        expect(completionCallback).not.toBeNull();
        completionCallback!({ status: 'completed', prUrl: 'https://github.com/test/pr/1' });

        expect(responses.length).toBe(2);
        expect(responses[1]).toContain('completed');
        expect(responses[1]).toContain('https://github.com/test/pr/1');
    });

    test('completion callback sends failure message', async () => {
        let completionCallback: ((task: Record<string, unknown>) => void) | null = null;

        const mockService = {
            create: mock(() =>
                Promise.resolve({
                    id: 'task-789',
                    branchName: 'agent/test/branch',
                    status: 'running',
                }),
            ),
            onComplete: mock((_taskId: string, cb: (task: Record<string, unknown>) => void) => {
                completionCallback = cb;
            }),
        } as unknown as WorkTaskService;
        router.setWorkTaskService(mockService);

        const responses: string[] = [];
        const respond = (text: string) => responses.push(text);

        router.handleSlashCommand('participant-1', 'fix bug', respond, () => agentA.id);
        await new Promise((r) => setTimeout(r, 50));

        completionCallback!({ status: 'failed', error: 'tsc failed' });

        expect(responses.length).toBe(2);
        expect(responses[1]).toContain('failed');
        expect(responses[1]).toContain('tsc failed');
    });

    test('responds with error when task creation throws', async () => {
        const mockService = {
            create: mock(() => Promise.reject(new Error('git worktree error'))),
            onComplete: mock(() => {}),
        } as unknown as WorkTaskService;
        router.setWorkTaskService(mockService);

        const responses: string[] = [];
        const respond = (text: string) => responses.push(text);

        router.handleSlashCommand('participant-1', 'do stuff', respond, () => agentA.id);
        await new Promise((r) => setTimeout(r, 50));

        expect(responses.length).toBe(1);
        expect(responses[0]).toContain('Work task error');
        expect(responses[0]).toContain('git worktree error');
    });
});

// ─── handleAgentWorkRequest() ────────────────────────────────────────────────

describe('handleAgentWorkRequest()', () => {
    test('throws when description is empty', async () => {
        const mockService = {
            create: mock(() => Promise.resolve({})),
            onComplete: mock(() => {}),
        } as unknown as WorkTaskService;
        router.setWorkTaskService(mockService);

        await expect(
            router.handleAgentWorkRequest({
                fromAgentId: agentA.id,
                fromAgentName: agentA.name,
                toAgentId: agentB.id,
                content: '[WORK]',
                paymentMicro: 1000,
                threadId: crypto.randomUUID(),
                emitMessageUpdate: () => {},
            }),
        ).rejects.toThrow('[WORK] prefix requires a task description');
    });

    test('throws when work task service is not available', async () => {
        await expect(
            router.handleAgentWorkRequest({
                fromAgentId: agentA.id,
                fromAgentName: agentA.name,
                toAgentId: agentB.id,
                content: '[WORK] do something',
                paymentMicro: 1000,
                threadId: crypto.randomUUID(),
                emitMessageUpdate: () => {},
            }),
        ).rejects.toThrow('Work task service not available');
    });

    test('creates agent message and work task successfully', async () => {
        const mockCreate = mock(() =>
            Promise.resolve({
                id: 'task-agent-1',
                sessionId: 'session-agent-1',
                status: 'running',
            }),
        );
        const mockOnComplete = mock(() => {});
        const mockService = {
            create: mockCreate,
            onComplete: mockOnComplete,
        } as unknown as WorkTaskService;
        router.setWorkTaskService(mockService);

        const emitCalls: string[] = [];

        const result = await router.handleAgentWorkRequest({
            fromAgentId: agentA.id,
            fromAgentName: agentA.name,
            toAgentId: agentB.id,
            content: '[WORK] Implement feature Y',
            paymentMicro: 1000,
            threadId: crypto.randomUUID(),
            projectId,
            emitMessageUpdate: (id) => emitCalls.push(id),
        });

        // Verify task was created with correct params
        expect(mockCreate).toHaveBeenCalledTimes(1);
        const createCall = (mockCreate.mock.calls as unknown as Array<[Record<string, unknown>]>)[0][0];
        expect(createCall.agentId).toBe(agentB.id);
        expect(createCall.description).toBe('Implement feature Y');
        expect(createCall.source).toBe('agent');
        expect(createCall.projectId).toBe(projectId);

        // Verify result
        expect(result.sessionId).toBe('session-agent-1');
        expect(result.message).toBeDefined();
        expect(result.message.fromAgentId).toBe(agentA.id);
        expect(result.message.toAgentId).toBe(agentB.id);

        // Verify message was emitted as processing
        expect(emitCalls.length).toBe(1);

        // Verify agent message exists in DB
        const dbMessage = getAgentMessage(db, result.message.id);
        expect(dbMessage).not.toBeNull();
        expect(dbMessage!.content).toBe('[WORK] Implement feature Y');
    });

    test('completion callback updates message status to completed with PR URL', async () => {
        let completionCallback: ((task: Record<string, unknown>) => void) | null = null;
        const emitCalls: string[] = [];

        const mockService = {
            create: mock(() =>
                Promise.resolve({
                    id: 'task-agent-2',
                    sessionId: 'session-agent-2',
                    status: 'running',
                }),
            ),
            onComplete: mock((_taskId: string, cb: (task: Record<string, unknown>) => void) => {
                completionCallback = cb;
            }),
        } as unknown as WorkTaskService;
        router.setWorkTaskService(mockService);

        const result = await router.handleAgentWorkRequest({
            fromAgentId: agentA.id,
            fromAgentName: agentA.name,
            toAgentId: agentB.id,
            content: '[WORK] Build widget',
            paymentMicro: 1000,
            threadId: crypto.randomUUID(),
            emitMessageUpdate: (id) => emitCalls.push(id),
        });

        expect(completionCallback).not.toBeNull();

        // Simulate successful completion
        completionCallback!({ status: 'completed', prUrl: 'https://github.com/test/pr/42' });

        // Verify message was updated
        const dbMessage = getAgentMessage(db, result.message.id);
        expect(dbMessage!.status).toBe('completed');
        expect(dbMessage!.response).toContain('https://github.com/test/pr/42');

        // Two emitCalls: one for 'processing', one for completion
        expect(emitCalls.length).toBe(2);
    });

    test('completion callback updates message status to failed', async () => {
        let completionCallback: ((task: Record<string, unknown>) => void) | null = null;

        const mockService = {
            create: mock(() =>
                Promise.resolve({
                    id: 'task-agent-3',
                    sessionId: 'session-agent-3',
                    status: 'running',
                }),
            ),
            onComplete: mock((_taskId: string, cb: (task: Record<string, unknown>) => void) => {
                completionCallback = cb;
            }),
        } as unknown as WorkTaskService;
        router.setWorkTaskService(mockService);

        const result = await router.handleAgentWorkRequest({
            fromAgentId: agentA.id,
            fromAgentName: agentA.name,
            toAgentId: agentB.id,
            content: '[WORK] Build broken widget',
            paymentMicro: 1000,
            threadId: crypto.randomUUID(),
            emitMessageUpdate: () => {},
        });

        completionCallback!({ status: 'failed', error: 'Build failed' });

        const dbMessage = getAgentMessage(db, result.message.id);
        expect(dbMessage!.status).toBe('failed');
        expect(dbMessage!.response).toContain('Build failed');
    });

    test('marks message as failed when task creation throws', async () => {
        const mockService = {
            create: mock(() => Promise.reject(new Error('concurrent task limit'))),
            onComplete: mock(() => {}),
        } as unknown as WorkTaskService;
        router.setWorkTaskService(mockService);

        const emitCalls: string[] = [];

        await expect(
            router.handleAgentWorkRequest({
                fromAgentId: agentA.id,
                fromAgentName: agentA.name,
                toAgentId: agentB.id,
                content: '[WORK] Will fail creation',
                paymentMicro: 1000,
                threadId: crypto.randomUUID(),
                emitMessageUpdate: (id) => emitCalls.push(id),
            }),
        ).rejects.toThrow('concurrent task limit');

        // Message should still be in the DB as failed
        expect(emitCalls.length).toBe(1);
    });
});

// ─── hasService ──────────────────────────────────────────────────────────────

describe('hasService', () => {
    test('returns false when no service is set', () => {
        expect(router.hasService).toBe(false);
    });

    test('returns true after setWorkTaskService', () => {
        const mockService = {
            create: mock(() => Promise.resolve({})),
            onComplete: mock(() => {}),
        } as unknown as WorkTaskService;
        router.setWorkTaskService(mockService);

        expect(router.hasService).toBe(true);
    });
});

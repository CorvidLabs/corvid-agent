/**
 * Tests for the blog_write schedule action handler (execBlogWrite).
 */
import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { createAgent } from '../db/agents';
import { createProject } from '../db/projects';
import { createSchedule, createExecution, getExecution } from '../db/schedules';
import { execBlogWrite } from '../scheduler/handlers/blog';
import type { HandlerContext } from '../scheduler/handlers/types';
import type { ProcessManager } from '../process/manager';

let db: Database;
let _counter = 0;

function createMockProcessManager(): ProcessManager {
    return {
        startProcess: mock(() => {}),
        stopProcess: mock(() => {}),
        isRunning: mock(() => false),
        subscribe: mock(() => () => {}),
        unsubscribe: mock(() => {}),
        getStatus: mock(() => null),
        listActive: mock(() => []),
        setBroadcast: mock(() => {}),
        setMcpServices: mock(() => {}),
        setOwnerCheck: mock(() => {}),
        start: mock(() => {}),
        stop: mock(() => {}),
        approvalManager: { resolve: mock(() => {}) } as unknown as ProcessManager['approvalManager'],
        ownerQuestionManager: { resolve: mock(() => {}) } as unknown as ProcessManager['ownerQuestionManager'],
    } as unknown as ProcessManager;
}

function createTestAgentAndProject(opts?: { noProject?: boolean }) {
    _counter++;
    const project = opts?.noProject ? null : createProject(db, {
        name: `BlogTestProject-${_counter}-${Date.now()}`,
        workingDir: '/tmp/test-blog',
    });
    const agent = createAgent(db, {
        name: `BlogTestAgent-${_counter}`,
        defaultProjectId: project?.id,
    });
    return { agent, project };
}

function buildCtx(pm: ProcessManager): HandlerContext {
    return {
        db,
        processManager: pm,
        workTaskService: null,
        agentMessenger: null,
        improvementLoopService: null,
        reputationScorer: null,
        reputationAttestation: null,
        outcomeTrackerService: null,
        dailyReviewService: null,
        systemStateDetector: { detect: mock(() => ({ flags: [] })) } as unknown as HandlerContext['systemStateDetector'],
        runningExecutions: new Set(),
        resolveScheduleTenantId: () => 'default',
    };
}

function makeExecution(scheduleId: string, agentId: string, action: Record<string, unknown> = {}) {
    return createExecution(db, scheduleId, agentId, 'blog_write', action);
}

describe('execBlogWrite', () => {
    beforeEach(() => {
        db = new Database(':memory:');
        db.exec('PRAGMA foreign_keys = ON');
        runMigrations(db);
    });

    afterEach(() => {
        db.close();
    });

    it('creates a session and starts a process for blog writing', async () => {
        const pm = createMockProcessManager();
        const ctx = buildCtx(pm);
        const { agent } = createTestAgentAndProject();

        const schedule = createSchedule(db, {
            agentId: agent.id,
            name: 'Blog Write Test',
            cronExpression: '0 9 * * 1',
            actions: [{ type: 'blog_write' }],
            approvalPolicy: 'auto',
        });

        const exec = makeExecution(schedule.id, agent.id);

        await execBlogWrite(ctx, exec.id, schedule, { type: 'blog_write' });

        const execution = getExecution(db, exec.id);
        expect(execution?.status).toBe('completed');
        expect(execution?.result).toContain('Blog write session started');
        expect(pm.startProcess).toHaveBeenCalledTimes(1);
    });

    it('uses action prompt as focus topic', async () => {
        const pm = createMockProcessManager();
        const ctx = buildCtx(pm);
        const { agent } = createTestAgentAndProject();

        const schedule = createSchedule(db, {
            agentId: agent.id,
            name: 'Blog Focus Test',
            cronExpression: '0 9 * * 1',
            actions: [{ type: 'blog_write', prompt: 'v0.28.0 release highlights' }],
            approvalPolicy: 'auto',
        });

        const exec = makeExecution(schedule.id, agent.id, { prompt: 'v0.28.0 release highlights' });

        await execBlogWrite(ctx, exec.id, schedule, { type: 'blog_write', prompt: 'v0.28.0 release highlights' });

        const startCall = (pm.startProcess as ReturnType<typeof mock>).mock.calls[0];
        const promptArg = startCall[1] as string;
        expect(promptArg).toContain('v0.28.0 release highlights');
    });

    it('uses action description as fallback focus topic', async () => {
        const pm = createMockProcessManager();
        const ctx = buildCtx(pm);
        const { agent } = createTestAgentAndProject();

        const schedule = createSchedule(db, {
            agentId: agent.id,
            name: 'Blog Desc Test',
            cronExpression: '0 9 * * 1',
            actions: [{ type: 'blog_write', description: 'weekly recap' }],
            approvalPolicy: 'auto',
        });

        const exec = makeExecution(schedule.id, agent.id, { description: 'weekly recap' });

        await execBlogWrite(ctx, exec.id, schedule, { type: 'blog_write', description: 'weekly recap' });

        const startCall = (pm.startProcess as ReturnType<typeof mock>).mock.calls[0];
        const promptArg = startCall[1] as string;
        expect(promptArg).toContain('weekly recap');
    });

    it('fails when agent is not found', async () => {
        const pm = createMockProcessManager();
        const ctx = buildCtx(pm);
        const { agent } = createTestAgentAndProject();

        const schedule = createSchedule(db, {
            agentId: agent.id,
            name: 'Blog Missing Agent',
            cronExpression: '0 9 * * 1',
            actions: [{ type: 'blog_write' }],
            approvalPolicy: 'auto',
        });

        const fakeSchedule = { ...schedule, agentId: 'non-existent-agent-id' };
        const exec = makeExecution(schedule.id, agent.id);

        await execBlogWrite(ctx, exec.id, fakeSchedule, { type: 'blog_write' });

        const execution = getExecution(db, exec.id);
        expect(execution?.status).toBe('failed');
        expect(execution?.result).toContain('Agent not found');
        expect(pm.startProcess).not.toHaveBeenCalled();
    });

    it('fails when no project is configured', async () => {
        const pm = createMockProcessManager();
        const ctx = buildCtx(pm);
        const { agent } = createTestAgentAndProject({ noProject: true });

        const schedule = createSchedule(db, {
            agentId: agent.id,
            name: 'Blog No Project',
            cronExpression: '0 9 * * 1',
            actions: [{ type: 'blog_write' }],
            approvalPolicy: 'auto',
        });

        const exec = makeExecution(schedule.id, agent.id);

        await execBlogWrite(ctx, exec.id, schedule, { type: 'blog_write' });

        const execution = getExecution(db, exec.id);
        expect(execution?.status).toBe('failed');
        expect(execution?.result).toContain('No project configured');
        expect(pm.startProcess).not.toHaveBeenCalled();
    });

    it('uses action projectId over agent default', async () => {
        const pm = createMockProcessManager();
        const ctx = buildCtx(pm);
        const { agent } = createTestAgentAndProject();
        const overrideProject = createProject(db, {
            name: `OverrideProject-${Date.now()}`,
            workingDir: '/tmp/override',
        });

        const schedule = createSchedule(db, {
            agentId: agent.id,
            name: 'Blog Override Project',
            cronExpression: '0 9 * * 1',
            actions: [{ type: 'blog_write', projectId: overrideProject.id }],
            approvalPolicy: 'auto',
        });

        const exec = makeExecution(schedule.id, agent.id, { projectId: overrideProject.id });

        await execBlogWrite(ctx, exec.id, schedule, { type: 'blog_write', projectId: overrideProject.id });

        const execution = getExecution(db, exec.id);
        expect(execution?.status).toBe('completed');
        expect(pm.startProcess).toHaveBeenCalledTimes(1);
    });
});

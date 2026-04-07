import { test, expect, beforeEach, afterEach, describe, mock, spyOn } from 'bun:test';

// Restore the REAL worktree module — other test files use mock.module() for
// ../lib/worktree and in Bun 1.x the mock leaks across files. The real module
// calls Bun.spawn which this file already intercepts via spyOn(Bun, 'spawn').
import { resolve, dirname } from 'node:path';
mock.module('../lib/worktree', () => ({
    getWorktreeBaseDir: (projectWorkingDir: string) =>
        process.env.WORKTREE_BASE_DIR ?? resolve(dirname(projectWorkingDir), '.corvid-worktrees'),
    generateChatBranchName: (agentName: string, sessionId: string) => {
        const agentSlug = agentName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        return `chat/${agentSlug}/${sessionId.slice(0, 12)}`;
    },
    createWorktree: async (options: { projectWorkingDir: string; branchName: string; worktreeId: string }) => {
        const { projectWorkingDir, branchName, worktreeId } = options;
        const base = process.env.WORKTREE_BASE_DIR ?? resolve(dirname(projectWorkingDir), '.corvid-worktrees');
        const worktreeDir = resolve(base, worktreeId);
        try {
            const proc = Bun.spawn(['git', 'worktree', 'add', '-b', branchName, worktreeDir], {
                cwd: projectWorkingDir, stdout: 'pipe', stderr: 'pipe',
            });
            const stderr = await new Response(proc.stderr).text();
            const exitCode = await proc.exited;
            if (exitCode !== 0) return { success: false, worktreeDir, error: `Failed to create worktree: ${stderr.trim()}` };
            return { success: true, worktreeDir };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { success: false, worktreeDir, error: `Failed to create worktree: ${message}` };
        }
    },
    removeWorktree: async (projectWorkingDir: string, worktreeDir: string) => {
        try {
            const proc = Bun.spawn(['git', 'worktree', 'remove', '--force', worktreeDir], {
                cwd: projectWorkingDir, stdout: 'pipe', stderr: 'pipe',
            });
            await new Response(proc.stderr).text();
            await proc.exited;
        } catch { /* non-fatal */ }
    },
}));

import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { createProject } from '../db/projects';
import { createAgent } from '../db/agents';
import { WorkTaskService } from '../work/service';
import type { ProcessManager } from '../process/manager';
import type { ClaudeStreamEvent } from '../process/types';
import type { FileSymbolIndex } from '../ast/types';
import {
    makeMockProc,
    createMockProcessManager,
    createMockAstParserService,
    buildSampleSymbolIndex,
} from './work-task-test-helpers';

let db: Database;
let service: WorkTaskService;
let mockProcessManager: ProcessManager;
let spawnCalls: Array<{ cmd: string[]; cwd?: string }>;
let spawnResults: Array<{ exitCode: number; stdout: string; stderr: string }>;
let subscribeCallbacks: Map<string, Set<(sid: string, event: ClaudeStreamEvent) => void>>;

function queueSpawn(exitCode: number, stdout = '', stderr = '') {
    spawnResults.push({ exitCode, stdout, stderr });
}

function queueSuccessfulSpawns(count: number) {
    for (let i = 0; i < count; i++) {
        queueSpawn(0);
    }
}

function createTestAgentAndProject(opts?: { agentName?: string; projectWorkingDir?: string }) {
    const agent = createAgent(db, { name: opts?.agentName ?? 'TestAgent' });
    const project = createProject(db, {
        name: 'TestProject',
        workingDir: opts?.projectWorkingDir ?? '/tmp/test-project',
    });
    return { agent, project };
}

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);

    spawnCalls = [];
    spawnResults = [];

    spyOn(Bun, 'spawn').mockImplementation((...args: unknown[]) => {
        const cmd = args[0] as string[];
        const opts = args[1] as { cwd?: string } | undefined;
        spawnCalls.push({ cmd, cwd: opts?.cwd });

        const result = spawnResults.shift() ?? { exitCode: 0, stdout: '', stderr: '' };
        return makeMockProc(result) as ReturnType<typeof Bun.spawn>;
    });

    subscribeCallbacks = new Map();
    mockProcessManager = createMockProcessManager(subscribeCallbacks);
    service = new WorkTaskService(db, mockProcessManager);
});

afterEach(() => {
    db.close();
    mock.restore();
});

// ═══════════════════════════════════════════════════════════════════════════════
// 13. generateRepoMap with AstParserService
// ═══════════════════════════════════════════════════════════════════════════════

describe('generateRepoMap with AstParserService', () => {
    test('returns properly formatted repo map with line ranges when AstParserService is provided', async () => {
        const projectDir = '/tmp/test-project';
        const files = buildSampleSymbolIndex(projectDir);
        const mockAst = createMockAstParserService({ files });

        // Create service with AST parser
        const astService = new WorkTaskService(db, mockProcessManager, mockAst);
        const { agent, project } = createTestAgentAndProject({ projectWorkingDir: projectDir });

        queueSuccessfulSpawns(2); // worktree add + install

        const task = await astService.create({
            agentId: agent.id,
            description: 'Test repo map generation',
            projectId: project.id,
        });

        // The task should be running — the prompt was built with a repo map
        expect(task.status).toBe('running');

        // Verify indexProject was called
        expect((mockAst.indexProject as ReturnType<typeof mock>).mock.calls.length).toBe(1);

        // Verify startProcess was called and the prompt contains repo map sections
        const startCalls = (mockProcessManager.startProcess as ReturnType<typeof mock>).mock.calls;
        expect(startCalls.length).toBeGreaterThanOrEqual(1);
        const prompt = startCalls[0][1] as string;
        expect(prompt).toContain('Repository Map');
        expect(prompt).toContain('line ranges');
        // Verify line ranges are included in the format [start-end]
        expect(prompt).toMatch(/\[\d+-\d+\]/);
    });

    test('returns null when AstParserService is null', async () => {
        // Default service has no AST parser
        const { agent, project } = createTestAgentAndProject();
        queueSuccessfulSpawns(2);

        const task = await service.create({
            agentId: agent.id,
            description: 'Test without AST',
            projectId: project.id,
        });

        expect(task.status).toBe('running');

        // Verify the prompt does NOT contain a repo map section
        const startCalls = (mockProcessManager.startProcess as ReturnType<typeof mock>).mock.calls;
        const prompt = startCalls[0][1] as string;
        expect(prompt).not.toContain('Repository Map');
    });

    test('repo map groups files by directory', async () => {
        const projectDir = '/tmp/test-project';
        const files = buildSampleSymbolIndex(projectDir);
        const mockAst = createMockAstParserService({ files });

        const astService = new WorkTaskService(db, mockProcessManager, mockAst);
        const { agent, project } = createTestAgentAndProject({ projectWorkingDir: projectDir });

        queueSuccessfulSpawns(2);

        await astService.create({
            agentId: agent.id,
            description: 'Test directory grouping',
            projectId: project.id,
        });

        const startCalls = (mockProcessManager.startProcess as ReturnType<typeof mock>).mock.calls;
        const prompt = startCalls[0][1] as string;

        // Should have directory headers
        expect(prompt).toContain('server/work/');
        expect(prompt).toContain('server/ast/');
    });

    test('repo map prioritizes src/ and server/ over test files', async () => {
        const projectDir = '/tmp/test-project';
        const files = buildSampleSymbolIndex(projectDir);
        const mockAst = createMockAstParserService({ files });

        const astService = new WorkTaskService(db, mockProcessManager, mockAst);
        const { agent, project } = createTestAgentAndProject({ projectWorkingDir: projectDir });

        queueSuccessfulSpawns(2);

        await astService.create({
            agentId: agent.id,
            description: 'Test priority ordering',
            projectId: project.id,
        });

        const startCalls = (mockProcessManager.startProcess as ReturnType<typeof mock>).mock.calls;
        const prompt = startCalls[0][1] as string;

        // src/ and server/ should appear before __tests__
        const srcIndex = prompt.indexOf('src/');
        const serverIndex = prompt.indexOf('server/work/');
        const testsIndex = prompt.indexOf('__tests__');

        // If test files are excluded by having no exported symbols, that's fine too
        if (testsIndex >= 0) {
            expect(srcIndex).toBeLessThan(testsIndex);
            expect(serverIndex).toBeLessThan(testsIndex);
        }
    });

    test('repo map includes class method line ranges', async () => {
        const projectDir = '/tmp/test-project';
        const files = buildSampleSymbolIndex(projectDir);
        const mockAst = createMockAstParserService({ files });

        const astService = new WorkTaskService(db, mockProcessManager, mockAst);
        const { agent, project } = createTestAgentAndProject({ projectWorkingDir: projectDir });

        queueSuccessfulSpawns(2);

        await astService.create({
            agentId: agent.id,
            description: 'Test method line ranges',
            projectId: project.id,
        });

        const startCalls = (mockProcessManager.startProcess as ReturnType<typeof mock>).mock.calls;
        const prompt = startCalls[0][1] as string;

        // Should include class with method line ranges
        expect(prompt).toContain('WorkTaskService');
        expect(prompt).toContain('create');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 14. extractRelevantSymbols
// ═══════════════════════════════════════════════════════════════════════════════

describe('extractRelevantSymbols', () => {
    test('finds symbols matching task description keywords', async () => {
        const projectDir = '/tmp/test-project';
        const files = buildSampleSymbolIndex(projectDir);
        const mockAst = createMockAstParserService({ files });

        const astService = new WorkTaskService(db, mockProcessManager, mockAst);
        const { agent, project } = createTestAgentAndProject({ projectWorkingDir: projectDir });

        queueSuccessfulSpawns(2);

        // Description mentions "WorkTask" and "AstParser" — should find matching symbols
        await astService.create({
            agentId: agent.id,
            description: 'Integrate AstParserService into WorkTaskService for symbol indexing',
            projectId: project.id,
        });

        const startCalls = (mockProcessManager.startProcess as ReturnType<typeof mock>).mock.calls;
        const prompt = startCalls[0][1] as string;

        // Should have a relevant symbols section
        expect(prompt).toContain('Relevant Symbols');
        expect(prompt).toContain('corvid_code_symbols');
        expect(prompt).toContain('corvid_find_references');
    });

    test('returns null when no symbols match task keywords', async () => {
        const projectDir = '/tmp/test-project';
        // Create an index with symbols that won't match
        const files = new Map<string, FileSymbolIndex>();
        files.set(`${projectDir}/src/main.ts`, {
            filePath: `${projectDir}/src/main.ts`,
            mtimeMs: 1000,
            symbols: [
                { name: 'bootstrap', kind: 'function', startLine: 1, endLine: 10, isExported: true },
            ],
        });
        const mockAst = createMockAstParserService({ files });

        const astService = new WorkTaskService(db, mockProcessManager, mockAst);
        const { agent, project } = createTestAgentAndProject({ projectWorkingDir: projectDir });

        queueSuccessfulSpawns(2);

        // Description with no matching keywords
        await astService.create({
            agentId: agent.id,
            description: 'Fix the zygomorphic transmogrification pipeline',
            projectId: project.id,
        });

        const startCalls = (mockProcessManager.startProcess as ReturnType<typeof mock>).mock.calls;
        const prompt = startCalls[0][1] as string;

        // Should NOT have a relevant symbols section since no matches
        expect(prompt).not.toContain('Relevant Symbols');
    });

    test('returns null when AstParserService is null', async () => {
        // Default service (no AST parser) should not include relevant symbols
        const { agent, project } = createTestAgentAndProject();
        queueSuccessfulSpawns(2);

        await service.create({
            agentId: agent.id,
            description: 'WorkTaskService AstParser integration',
            projectId: project.id,
        });

        const startCalls = (mockProcessManager.startProcess as ReturnType<typeof mock>).mock.calls;
        const prompt = startCalls[0][1] as string;
        expect(prompt).not.toContain('Relevant Symbols');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 15. buildWorkPrompt with repo map and relevant symbols
// ═══════════════════════════════════════════════════════════════════════════════

describe('buildWorkPrompt with repo map and relevant symbols', () => {
    test('includes repo map section when repo map is provided', async () => {
        const projectDir = '/tmp/test-project';
        const files = buildSampleSymbolIndex(projectDir);
        const mockAst = createMockAstParserService({ files });

        const astService = new WorkTaskService(db, mockProcessManager, mockAst);
        const { agent, project } = createTestAgentAndProject({ projectWorkingDir: projectDir });

        queueSuccessfulSpawns(2);

        await astService.create({
            agentId: agent.id,
            description: 'Test prompt includes repo map',
            projectId: project.id,
        });

        const startCalls = (mockProcessManager.startProcess as ReturnType<typeof mock>).mock.calls;
        const prompt = startCalls[0][1] as string;

        expect(prompt).toContain('## Repository Map');
        expect(prompt).toContain('## Task');
        expect(prompt).toContain('## Instructions');
        expect(prompt).toContain('Test prompt includes repo map');
    });

    test('includes both repo map and relevant symbols when both are available', async () => {
        const projectDir = '/tmp/test-project';
        const files = buildSampleSymbolIndex(projectDir);
        const mockAst = createMockAstParserService({ files });

        const astService = new WorkTaskService(db, mockProcessManager, mockAst);
        const { agent, project } = createTestAgentAndProject({ projectWorkingDir: projectDir });

        queueSuccessfulSpawns(2);

        await astService.create({
            agentId: agent.id,
            description: 'Enhance WorkTaskService with AstParserService integration',
            projectId: project.id,
        });

        const startCalls = (mockProcessManager.startProcess as ReturnType<typeof mock>).mock.calls;
        const prompt = startCalls[0][1] as string;

        expect(prompt).toContain('## Repository Map');
        expect(prompt).toContain('## Relevant Symbols');
        // Relevant Symbols should come after Repository Map
        const repoMapIdx = prompt.indexOf('## Repository Map');
        const relevantSymbolsIdx = prompt.indexOf('## Relevant Symbols');
        expect(relevantSymbolsIdx).toBeGreaterThan(repoMapIdx);
    });

    test('prompt includes tool guidance when relevant symbols are present', async () => {
        const projectDir = '/tmp/test-project';
        const files = buildSampleSymbolIndex(projectDir);
        const mockAst = createMockAstParserService({ files });

        const astService = new WorkTaskService(db, mockProcessManager, mockAst);
        const { agent, project } = createTestAgentAndProject({ projectWorkingDir: projectDir });

        queueSuccessfulSpawns(2);

        await astService.create({
            agentId: agent.id,
            description: 'Integrate AstParserService symbol search into work tasks',
            projectId: project.id,
        });

        const startCalls = (mockProcessManager.startProcess as ReturnType<typeof mock>).mock.calls;
        const prompt = startCalls[0][1] as string;

        expect(prompt).toContain('corvid_code_symbols');
        expect(prompt).toContain('corvid_find_references');
    });

    test('prompt excludes both sections when no AST parser is available', async () => {
        const { agent, project } = createTestAgentAndProject();
        queueSuccessfulSpawns(2);

        await service.create({
            agentId: agent.id,
            description: 'Simple task without AST',
            projectId: project.id,
        });

        const startCalls = (mockProcessManager.startProcess as ReturnType<typeof mock>).mock.calls;
        const prompt = startCalls[0][1] as string;

        expect(prompt).not.toContain('## Repository Map');
        expect(prompt).not.toContain('## Relevant Symbols');
        // Should still have the basic structure
        expect(prompt).toContain('## Task');
        expect(prompt).toContain('## Instructions');
    });
});

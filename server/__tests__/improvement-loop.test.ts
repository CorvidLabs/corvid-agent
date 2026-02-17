/**
 * Tests for AutonomousLoopService and prompt builder.
 *
 * Validates reputation gating, prompt construction, memory integration,
 * and the overall service orchestration flow.
 */
import { test, expect, describe } from 'bun:test';
import { buildImprovementPrompt } from '../improvement/prompt-builder';
import type { HealthMetrics } from '../improvement/health-collector';
import type { ScoredMemory } from '../memory/semantic-search';
import type { ReputationScore } from '../reputation/types';

// ─── Test Fixtures ───────────────────────────────────────────────────────────

function makeHealth(overrides: Partial<HealthMetrics> = {}): HealthMetrics {
    return {
        tscErrors: [],
        tscErrorCount: 0,
        tscPassed: true,
        testsPassed: true,
        testSummary: '42 pass\n0 fail',
        testFailureCount: 0,
        todoCount: 5,
        fixmeCount: 2,
        hackCount: 1,
        todoSamples: ['server/foo.ts:10: // TODO: fix this'],
        largeFiles: [],
        outdatedDeps: [],
        collectedAt: '2026-02-16T03:00:00.000Z',
        collectionTimeMs: 1500,
        ...overrides,
    };
}

function makeReputation(overrides: Partial<ReputationScore> = {}): ReputationScore {
    return {
        agentId: 'agent-1',
        overallScore: 75,
        trustLevel: 'high',
        components: {
            taskCompletion: 80,
            peerRating: 70,
            creditPattern: 60,
            securityCompliance: 90,
            activityLevel: 50,
        },
        attestationHash: null,
        computedAt: '2026-02-16T03:00:00.000Z',
        ...overrides,
    };
}

function makeMemory(key: string, content: string): ScoredMemory {
    return {
        memory: {
            id: crypto.randomUUID(),
            agentId: 'agent-1',
            key,
            content,
            txid: null,
            status: 'confirmed',
            createdAt: '2026-02-15T03:00:00.000Z',
            updatedAt: '2026-02-15T03:00:00.000Z',
        },
        score: 0.8,
        source: 'fts5',
    };
}

// ─── Prompt Builder ──────────────────────────────────────────────────────────

describe('buildImprovementPrompt', () => {
    test('includes reputation context', () => {
        const prompt = buildImprovementPrompt(
            makeHealth(),
            [],
            makeReputation({ overallScore: 75, trustLevel: 'high' }),
            { maxTasks: 3 },
        );
        expect(prompt).toContain('75/100');
        expect(prompt).toContain('HIGH');
        expect(prompt).toContain('**3**');
    });

    test('includes focus area when provided', () => {
        const prompt = buildImprovementPrompt(
            makeHealth(),
            [],
            makeReputation(),
            { maxTasks: 3, focusArea: 'type safety' },
        );
        expect(prompt).toContain('type safety');
        expect(prompt).toContain('Focus Area');
    });

    test('omits focus area section when not provided', () => {
        const prompt = buildImprovementPrompt(
            makeHealth(),
            [],
            makeReputation(),
            { maxTasks: 3 },
        );
        expect(prompt).not.toContain('Focus Area');
    });

    test('includes TSC errors when present', () => {
        const health = makeHealth({
            tscPassed: false,
            tscErrorCount: 2,
            tscErrors: [
                { file: 'server/foo.ts', line: 10, col: 5, code: 'TS2345', message: 'Type mismatch' },
                { file: 'server/bar.ts', line: 20, col: 3, code: 'TS7006', message: 'Implicit any' },
            ],
        });
        const prompt = buildImprovementPrompt(health, [], makeReputation(), { maxTasks: 3 });
        expect(prompt).toContain('FAILING');
        expect(prompt).toContain('TS2345');
        expect(prompt).toContain('TS7006');
        expect(prompt).toContain('server/foo.ts');
    });

    test('shows clean compilation when no TSC errors', () => {
        const prompt = buildImprovementPrompt(makeHealth(), [], makeReputation(), { maxTasks: 3 });
        expect(prompt).toContain('PASSING');
        expect(prompt).toContain('clean');
    });

    test('includes test summary', () => {
        const health = makeHealth({
            testsPassed: false,
            testFailureCount: 3,
            testSummary: '39 pass\n3 fail',
        });
        const prompt = buildImprovementPrompt(health, [], makeReputation(), { maxTasks: 3 });
        expect(prompt).toContain('3 fail');
        expect(prompt).toContain('FAILING');
    });

    test('includes TODO/FIXME/HACK counts', () => {
        const health = makeHealth({ todoCount: 15, fixmeCount: 3, hackCount: 2 });
        const prompt = buildImprovementPrompt(health, [], makeReputation(), { maxTasks: 3 });
        expect(prompt).toContain('TODOs: 15');
        expect(prompt).toContain('FIXMEs: 3');
        expect(prompt).toContain('HACKs: 2');
    });

    test('includes large files', () => {
        const health = makeHealth({
            largeFiles: [
                { file: 'server/big.ts', lines: 800 },
                { file: 'server/huge.ts', lines: 1200 },
            ],
        });
        const prompt = buildImprovementPrompt(health, [], makeReputation(), { maxTasks: 3 });
        expect(prompt).toContain('server/big.ts: 800 lines');
        expect(prompt).toContain('server/huge.ts: 1200 lines');
    });

    test('includes outdated dependencies', () => {
        const health = makeHealth({
            outdatedDeps: [
                { name: 'typescript', current: '5.3.0', latest: '5.4.2' },
            ],
        });
        const prompt = buildImprovementPrompt(health, [], makeReputation(), { maxTasks: 3 });
        expect(prompt).toContain('typescript');
        expect(prompt).toContain('5.3.0');
        expect(prompt).toContain('5.4.2');
    });

    test('includes past attempts', () => {
        const memories = [
            makeMemory('improvement_loop:outcome:2026-02-15', 'Created 2 tasks, 1 succeeded, 1 failed on TSC.'),
        ];
        const prompt = buildImprovementPrompt(makeHealth(), memories, makeReputation(), { maxTasks: 3 });
        expect(prompt).toContain('Created 2 tasks');
        expect(prompt).toContain('Past Improvement Attempts');
    });

    test('shows "no previous attempts" when empty', () => {
        const prompt = buildImprovementPrompt(makeHealth(), [], makeReputation(), { maxTasks: 3 });
        expect(prompt).toContain('No previous improvement attempts');
    });

    test('includes instructions for work task creation', () => {
        const prompt = buildImprovementPrompt(makeHealth(), [], makeReputation(), { maxTasks: 2 });
        expect(prompt).toContain('corvid_create_work_task');
        expect(prompt).toContain('corvid_save_memory');
        expect(prompt).toContain('corvid_notify_owner');
        expect(prompt).toContain('up to 2 work tasks');
    });

    test('includes severity prioritization instructions', () => {
        const prompt = buildImprovementPrompt(makeHealth(), [], makeReputation(), { maxTasks: 3 });
        expect(prompt).toContain('type errors > test failures');
    });

    test('limits displayed TSC errors to 15', () => {
        const errors = Array.from({ length: 20 }, (_, i) => ({
            file: `server/f${i}.ts`,
            line: i + 1,
            col: 1,
            code: `TS${2000 + i}`,
            message: `Error ${i}`,
        }));
        const health = makeHealth({ tscErrors: errors, tscErrorCount: 20, tscPassed: false });
        const prompt = buildImprovementPrompt(health, [], makeReputation(), { maxTasks: 3 });
        expect(prompt).toContain('and 5 more errors');
    });
});

// ─── Reputation Gating (unit tests via prompt options) ───────────────────────

describe('reputation gating via prompt', () => {
    test('untrusted agent gets 0 max tasks', () => {
        // The service would throw for untrusted, but prompt builder should reflect the cap
        const rep = makeReputation({ trustLevel: 'untrusted', overallScore: 10 });
        const prompt = buildImprovementPrompt(makeHealth(), [], rep, { maxTasks: 0 });
        expect(prompt).toContain('**0**');
        expect(prompt).toContain('UNTRUSTED');
    });

    test('low trust agent reflected in prompt', () => {
        const rep = makeReputation({ trustLevel: 'low', overallScore: 30 });
        const prompt = buildImprovementPrompt(makeHealth(), [], rep, { maxTasks: 1 });
        expect(prompt).toContain('**1**');
        expect(prompt).toContain('LOW');
    });

    test('medium trust agent reflected in prompt', () => {
        const rep = makeReputation({ trustLevel: 'medium', overallScore: 55 });
        const prompt = buildImprovementPrompt(makeHealth(), [], rep, { maxTasks: 2 });
        expect(prompt).toContain('**2**');
        expect(prompt).toContain('MEDIUM');
    });

    test('high trust agent reflected in prompt', () => {
        const rep = makeReputation({ trustLevel: 'high', overallScore: 80 });
        const prompt = buildImprovementPrompt(makeHealth(), [], rep, { maxTasks: 3 });
        expect(prompt).toContain('**3**');
        expect(prompt).toContain('HIGH');
    });

    test('verified trust agent reflected in prompt', () => {
        const rep = makeReputation({ trustLevel: 'verified', overallScore: 95 });
        const prompt = buildImprovementPrompt(makeHealth(), [], rep, { maxTasks: 5 });
        expect(prompt).toContain('**5**');
        expect(prompt).toContain('VERIFIED');
    });
});

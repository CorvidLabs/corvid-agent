import { describe, test, expect } from 'bun:test';
import { buildImprovementPrompt } from '../improvement/prompt-builder';
import type { HealthMetrics } from '../improvement/health-collector';
import type { ScoredMemory } from '../memory/semantic-search';
import type { ReputationScore } from '../reputation/types';

function makeHealth(overrides: Partial<HealthMetrics> = {}): HealthMetrics {
    return {
        collectedAt: '2026-03-07T00:00:00Z',
        collectionTimeMs: 1234,
        tscPassed: true,
        tscErrorCount: 0,
        tscErrors: [],
        testsPassed: true,
        testFailureCount: 0,
        testSummary: '100 tests passed',
        todoCount: 3,
        fixmeCount: 1,
        hackCount: 0,
        todoSamples: ['// TODO: refactor later'],
        largeFiles: [],
        outdatedDeps: [],
        ...overrides,
    };
}

function makeReputation(overrides: Partial<ReputationScore> = {}): ReputationScore {
    return {
        agentId: 'agent-1',
        overallScore: 75,
        trustLevel: 'medium',
        components: {
            taskCompletion: 80,
            peerRating: 70,
            creditPattern: 75,
            securityCompliance: 85,
            activityLevel: 60,
        },
        attestationHash: null,
        computedAt: '2026-03-07T00:00:00Z',
        ...overrides,
    };
}

describe('buildImprovementPrompt', () => {
    test('includes header and instructions', () => {
        const prompt = buildImprovementPrompt(
            makeHealth(),
            [],
            makeReputation(),
            { maxTasks: 3 },
        );
        expect(prompt).toContain('Autonomous Improvement Loop');
        expect(prompt).toContain('Instructions');
        expect(prompt).toContain('corvid_create_work_task');
    });

    test('includes reputation context', () => {
        const prompt = buildImprovementPrompt(
            makeHealth(),
            [],
            makeReputation({ overallScore: 90, trustLevel: 'high' }),
            { maxTasks: 5 },
        );
        expect(prompt).toContain('90/100');
        expect(prompt).toContain('HIGH');
        expect(prompt).toContain('**5**');
    });

    test('includes focus area when provided', () => {
        const prompt = buildImprovementPrompt(
            makeHealth(),
            [],
            makeReputation(),
            { maxTasks: 3, focusArea: 'security hardening' },
        );
        expect(prompt).toContain('security hardening');
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

    test('formats TSC errors', () => {
        const prompt = buildImprovementPrompt(
            makeHealth({
                tscPassed: false,
                tscErrorCount: 2,
                tscErrors: [
                    { file: 'server/foo.ts', line: 10, col: 5, code: 'TS2322', message: 'Type mismatch' },
                    { file: 'server/bar.ts', line: 20, col: 1, code: 'TS2345', message: 'Argument type' },
                ],
            }),
            [],
            makeReputation(),
            { maxTasks: 3 },
        );
        expect(prompt).toContain('FAILING');
        expect(prompt).toContain('server/foo.ts(10,5): TS2322');
        expect(prompt).toContain('server/bar.ts(20,1): TS2345');
    });

    test('shows "clean" when no TSC errors', () => {
        const prompt = buildImprovementPrompt(
            makeHealth(),
            [],
            makeReputation(),
            { maxTasks: 3 },
        );
        expect(prompt).toContain('PASSING');
        expect(prompt).toContain('clean');
    });

    test('formats large files', () => {
        const prompt = buildImprovementPrompt(
            makeHealth({
                largeFiles: [{ file: 'server/big.ts', lines: 1200 }],
            }),
            [],
            makeReputation(),
            { maxTasks: 3 },
        );
        expect(prompt).toContain('server/big.ts: 1200 lines');
    });

    test('formats outdated deps', () => {
        const prompt = buildImprovementPrompt(
            makeHealth({
                outdatedDeps: [{ name: 'express', current: '4.18.0', latest: '4.19.0' }],
            }),
            [],
            makeReputation(),
            { maxTasks: 3 },
        );
        expect(prompt).toContain('express: 4.18.0 → 4.19.0');
    });

    test('formats past attempts', () => {
        const memories: ScoredMemory[] = [
            {
                memory: { id: 'm-1', agentId: 'agent-1', key: 'improvement_loop:outcome:2026-01-01', content: 'Fixed 3 type errors in billing module', txid: null, status: 'confirmed', createdAt: '', updatedAt: '' },
                score: 0.9,
                source: 'fts5',
            },
        ];
        const prompt = buildImprovementPrompt(
            makeHealth(),
            memories,
            makeReputation(),
            { maxTasks: 3 },
        );
        expect(prompt).toContain('improvement_loop:outcome:2026-01-01');
        expect(prompt).toContain('Fixed 3 type errors');
    });

    test('includes trend summary when provided', () => {
        const prompt = buildImprovementPrompt(
            makeHealth(),
            [],
            makeReputation(),
            { maxTasks: 3 },
            'TSC errors: ↓ (improving)\nTest failures: stable',
        );
        expect(prompt).toContain('Health Trends');
        expect(prompt).toContain('TSC errors: ↓ (improving)');
    });

    test('includes outcome context when provided', () => {
        const prompt = buildImprovementPrompt(
            makeHealth(),
            [],
            makeReputation(),
            { maxTasks: 3 },
            undefined,
            '## PR Outcome Feedback\nPR #100 was merged successfully.',
        );
        expect(prompt).toContain('PR Outcome Feedback');
        expect(prompt).toContain('PR #100 was merged successfully');
    });

    test('trust level descriptions are accurate', () => {
        for (const [level, expected] of [
            ['untrusted', 'UNTRUSTED'],
            ['low', 'LOW'],
            ['medium', 'MEDIUM'],
            ['high', 'HIGH'],
            ['verified', 'VERIFIED'],
        ] as const) {
            const prompt = buildImprovementPrompt(
                makeHealth(),
                [],
                makeReputation({ trustLevel: level }),
                { maxTasks: 1 },
            );
            expect(prompt).toContain(expected);
        }
    });
});

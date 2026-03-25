import { describe, test, expect } from 'bun:test';
import { buildEscalationInfo, trackToolCall, buildResultEvent, type BuildEscalationInput } from '../process/direct-process';
import type { DirectProcessMetrics } from '../process/types';

function makeInput(overrides: Partial<BuildEscalationInput> = {}): BuildEscalationInput {
    return {
        terminationReason: 'stall_repeat',
        model: 'llama3.1:70b',
        tier: 'standard',
        originalPrompt: 'Review the PR and fix any issues',
        toolCallLog: ['read_file: ok', 'search_files: ok', 'read_file: ok'],
        ...overrides,
    };
}

describe('buildEscalationInfo', () => {
    test('returns escalation info for stall_repeat', () => {
        const result = buildEscalationInfo(makeInput({ terminationReason: 'stall_repeat' }));
        expect(result).not.toBeNull();
        expect(result!.canEscalate).toBe(true);
        expect(result!.reason).toBe('stall_repeat');
        expect(result!.originalPrompt).toBe('Review the PR and fix any issues');
        expect(result!.completedSteps).toHaveLength(3);
        expect(result!.remainingWork).toContain('repeat loop');
    });

    test('returns escalation info for stall_same_tool', () => {
        const result = buildEscalationInfo(makeInput({ terminationReason: 'stall_same_tool' }));
        expect(result).not.toBeNull();
        expect(result!.reason).toBe('stall_same_tool');
        expect(result!.remainingWork).toContain('same tool');
    });

    test('returns escalation info for max_iterations', () => {
        const result = buildEscalationInfo(makeInput({ terminationReason: 'max_iterations' }));
        expect(result).not.toBeNull();
        expect(result!.reason).toBe('max_iterations');
        expect(result!.remainingWork).toContain('maximum iteration limit');
    });

    test('returns escalation info for stall_repetitive_loop', () => {
        const result = buildEscalationInfo(makeInput({ terminationReason: 'stall_repetitive_loop' }));
        expect(result).not.toBeNull();
        expect(result!.reason).toBe('stall_repetitive_loop');
        expect(result!.remainingWork).toContain('identical arguments');
    });

    test('returns escalation info for stall_quality_exhausted', () => {
        const result = buildEscalationInfo(makeInput({ terminationReason: 'stall_quality_exhausted' }));
        expect(result).not.toBeNull();
        expect(result!.reason).toBe('stall_quality_exhausted');
        expect(result!.remainingWork).toContain('quality nudges');
    });

    test('returns null for normal termination', () => {
        const result = buildEscalationInfo(makeInput({ terminationReason: 'normal' }));
        expect(result).toBeNull();
    });

    test('returns null for abort termination', () => {
        const result = buildEscalationInfo(makeInput({ terminationReason: 'abort' }));
        expect(result).toBeNull();
    });

    test('returns null for error termination', () => {
        const result = buildEscalationInfo(makeInput({ terminationReason: 'error' }));
        expect(result).toBeNull();
    });

    test('detects low_quality when normal termination with many low-quality responses', () => {
        const result = buildEscalationInfo(makeInput({
            terminationReason: 'normal',
            qualityMetrics: {
                totalLowQualityResponses: 4,
                totalVacuousToolCalls: 2,
                qualityNudgeCount: 2,
                nudgesExhausted: false,
            },
        }));
        expect(result).not.toBeNull();
        expect(result!.reason).toBe('low_quality');
        expect(result!.remainingWork).toContain('low-quality');
    });

    test('does not flag low_quality with few low-quality responses', () => {
        const result = buildEscalationInfo(makeInput({
            terminationReason: 'normal',
            qualityMetrics: {
                totalLowQualityResponses: 1,
                totalVacuousToolCalls: 0,
                qualityNudgeCount: 0,
                nudgesExhausted: false,
            },
        }));
        expect(result).toBeNull();
    });

    test('truncates originalPrompt to 2000 chars', () => {
        const longPrompt = 'x'.repeat(5000);
        const result = buildEscalationInfo(makeInput({
            terminationReason: 'stall_repeat',
            originalPrompt: longPrompt,
        }));
        expect(result).not.toBeNull();
        expect(result!.originalPrompt.length).toBe(2000);
    });

    test('limits completedSteps to 20 entries', () => {
        const manySteps = Array.from({ length: 30 }, (_, i) => `step_${i}: ok`);
        const result = buildEscalationInfo(makeInput({
            terminationReason: 'stall_repeat',
            toolCallLog: manySteps,
        }));
        expect(result).not.toBeNull();
        expect(result!.completedSteps.length).toBe(20);
    });

    test('includes tier information', () => {
        const result = buildEscalationInfo(makeInput({
            terminationReason: 'stall_repeat',
            tier: 'limited',
        }));
        expect(result).not.toBeNull();
        expect(result!.currentTier).toBe('limited');
        expect(result!.suggestedTier).not.toBeNull();
    });

    test('canEscalate is false when already at highest tier (opus)', () => {
        const result = buildEscalationInfo(makeInput({
            terminationReason: 'stall_repeat',
            model: 'claude-3-opus',
        }));
        expect(result).not.toBeNull();
        // claude-3-opus is inferred as OPUS tier, no higher tier available
        expect(result!.canEscalate).toBe(false);
        expect(result!.suggestedTier).toBeNull();
    });
});

describe('trackToolCall', () => {
    test('appends tool call to log', () => {
        const log: string[] = [];
        trackToolCall(log, 'read_file', 'ok');
        expect(log).toEqual(['read_file: ok']);
    });

    test('tracks error outcomes', () => {
        const log: string[] = [];
        trackToolCall(log, 'write_file', 'error');
        expect(log).toEqual(['write_file: error']);
    });

    test('tracks exception outcomes', () => {
        const log: string[] = [];
        trackToolCall(log, 'search_files', 'exception');
        expect(log).toEqual(['search_files: exception']);
    });

    test('caps log at 20 entries', () => {
        const log = Array.from({ length: 20 }, (_, i) => `tool_${i}: ok`);
        trackToolCall(log, 'extra_tool', 'ok');
        expect(log).toHaveLength(20);
        expect(log[19]).toBe('tool_19: ok');
    });

    test('allows up to 20 entries', () => {
        const log: string[] = [];
        for (let i = 0; i < 25; i++) {
            trackToolCall(log, `tool_${i}`, 'ok');
        }
        expect(log).toHaveLength(20);
        expect(log[19]).toBe('tool_19: ok');
    });
});

describe('buildResultEvent', () => {
    const baseMetrics: DirectProcessMetrics = {
        model: 'llama3.1:70b',
        tier: 'standard',
        totalIterations: 10,
        toolCallCount: 5,
        maxChainDepth: 2,
        nudgeCount: 0,
        midChainNudgeCount: 0,
        explorationDriftCount: 0,
        stallDetected: false,
        stallType: null,
        terminationReason: 'normal',
        durationMs: 5000,
        needsSummary: false,
        totalLowQualityResponses: 0,
        totalVacuousToolCalls: 0,
        qualityNudgeCount: 0,
    };

    test('builds success event without escalation for normal termination', () => {
        const event = buildResultEvent(
            { subtype: 'success', durationMs: 5000, numTurns: 10, sessionId: 'sess-1', metrics: baseMetrics },
            makeInput({ terminationReason: 'normal' }),
        );
        expect(event.type).toBe('result');
        expect(event.subtype).toBe('success');
        expect((event as unknown as Record<string, unknown>).escalation).toBeUndefined();
    });

    test('builds error event with escalation for stall termination', () => {
        const event = buildResultEvent(
            { subtype: 'error', durationMs: 30000, numTurns: 25, sessionId: 'sess-2', metrics: { ...baseMetrics, stallDetected: true, terminationReason: 'stall_repeat' } },
            makeInput({ terminationReason: 'stall_repeat' }),
        );
        expect(event.type).toBe('result');
        expect(event.subtype).toBe('error');
        expect((event as unknown as Record<string, unknown>).escalation).toBeDefined();
        const esc = (event as unknown as Record<string, unknown>).escalation as Record<string, unknown>;
        expect(esc.reason).toBe('stall_repeat');
    });

    test('includes correct metadata in result event', () => {
        const event = buildResultEvent(
            { subtype: 'success', durationMs: 8000, numTurns: 15, sessionId: 'sess-3', metrics: baseMetrics },
            makeInput({ terminationReason: 'normal' }),
        );
        expect((event as unknown as Record<string, unknown>).duration_ms).toBe(8000);
        expect((event as unknown as Record<string, unknown>).num_turns).toBe(15);
        expect((event as unknown as Record<string, unknown>).session_id).toBe('sess-3');
        expect((event as unknown as Record<string, unknown>).total_cost_usd).toBe(0);
    });
});

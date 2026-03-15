import { describe, test, expect } from 'bun:test';
import { buildSessionMetrics, type SessionMetricsState } from '../process/direct-process';

function makeState(overrides: Partial<SessionMetricsState> = {}): SessionMetricsState {
    return {
        model: 'llama3.1:70b',
        tier: 'standard',
        iteration: 5,
        toolCallCount: 12,
        maxChainDepth: 4,
        nudgeCount: 1,
        midChainNudgeCount: 0,
        totalExplorationDrifts: 0,
        stallType: null,
        terminationReason: 'normal',
        loopDurationMs: 15000,
        needsSummary: false,
        ...overrides,
    };
}

describe('buildSessionMetrics', () => {
    test('maps fields from loop state to DirectProcessMetrics', () => {
        const m = buildSessionMetrics(makeState());
        expect(m.model).toBe('llama3.1:70b');
        expect(m.tier).toBe('standard');
        expect(m.totalIterations).toBe(5);
        expect(m.toolCallCount).toBe(12);
        expect(m.maxChainDepth).toBe(4);
        expect(m.nudgeCount).toBe(1);
        expect(m.midChainNudgeCount).toBe(0);
        expect(m.explorationDriftCount).toBe(0);
        expect(m.stallDetected).toBe(false);
        expect(m.stallType).toBeNull();
        expect(m.terminationReason).toBe('normal');
        expect(m.durationMs).toBe(15000);
        expect(m.needsSummary).toBe(false);
    });

    test('derives stallDetected=true for stall_repeat', () => {
        const m = buildSessionMetrics(makeState({
            terminationReason: 'stall_repeat',
            stallType: 'repeat',
        }));
        expect(m.stallDetected).toBe(true);
        expect(m.stallType).toBe('repeat');
        expect(m.terminationReason).toBe('stall_repeat');
    });

    test('derives stallDetected=true for stall_same_tool', () => {
        const m = buildSessionMetrics(makeState({
            terminationReason: 'stall_same_tool',
            stallType: 'same_tool',
        }));
        expect(m.stallDetected).toBe(true);
    });

    test('stallDetected=false for max_iterations', () => {
        const m = buildSessionMetrics(makeState({
            terminationReason: 'max_iterations',
            needsSummary: true,
        }));
        expect(m.stallDetected).toBe(false);
        expect(m.terminationReason).toBe('max_iterations');
        expect(m.needsSummary).toBe(true);
    });

    test('stallDetected=false for abort', () => {
        const m = buildSessionMetrics(makeState({ terminationReason: 'abort' }));
        expect(m.stallDetected).toBe(false);
        expect(m.terminationReason).toBe('abort');
    });

    test('stallDetected=false for error', () => {
        const m = buildSessionMetrics(makeState({ terminationReason: 'error' }));
        expect(m.stallDetected).toBe(false);
        expect(m.terminationReason).toBe('error');
    });

    test('error termination preserves all metric fields', () => {
        const m = buildSessionMetrics(makeState({
            terminationReason: 'error',
            iteration: 3,
            toolCallCount: 7,
            maxChainDepth: 2,
            nudgeCount: 1,
            midChainNudgeCount: 0,
            totalExplorationDrifts: 1,
            loopDurationMs: 5000,
            needsSummary: false,
        }));
        expect(m.terminationReason).toBe('error');
        expect(m.stallDetected).toBe(false);
        expect(m.stallType).toBeNull();
        expect(m.totalIterations).toBe(3);
        expect(m.toolCallCount).toBe(7);
        expect(m.maxChainDepth).toBe(2);
        expect(m.nudgeCount).toBe(1);
        expect(m.explorationDriftCount).toBe(1);
        expect(m.durationMs).toBe(5000);
        expect(m.needsSummary).toBe(false);
    });

    test('abort termination preserves all metric fields', () => {
        const m = buildSessionMetrics(makeState({
            terminationReason: 'abort',
            iteration: 10,
            toolCallCount: 20,
            maxChainDepth: 6,
            nudgeCount: 0,
            midChainNudgeCount: 0,
            totalExplorationDrifts: 2,
            loopDurationMs: 30000,
            needsSummary: false,
        }));
        expect(m.terminationReason).toBe('abort');
        expect(m.stallDetected).toBe(false);
        expect(m.stallType).toBeNull();
        expect(m.totalIterations).toBe(10);
        expect(m.toolCallCount).toBe(20);
        expect(m.maxChainDepth).toBe(6);
        expect(m.explorationDriftCount).toBe(2);
        expect(m.durationMs).toBe(30000);
    });

    test('maps iteration to totalIterations', () => {
        const m = buildSessionMetrics(makeState({ iteration: 25 }));
        expect(m.totalIterations).toBe(25);
    });

    test('maps totalExplorationDrifts to explorationDriftCount', () => {
        const m = buildSessionMetrics(makeState({ totalExplorationDrifts: 3 }));
        expect(m.explorationDriftCount).toBe(3);
    });

    test('maps loopDurationMs to durationMs', () => {
        const m = buildSessionMetrics(makeState({ loopDurationMs: 42000 }));
        expect(m.durationMs).toBe(42000);
    });

    test('handles zero values', () => {
        const m = buildSessionMetrics(makeState({
            iteration: 0,
            toolCallCount: 0,
            maxChainDepth: 0,
            nudgeCount: 0,
            midChainNudgeCount: 0,
            totalExplorationDrifts: 0,
            loopDurationMs: 0,
        }));
        expect(m.totalIterations).toBe(0);
        expect(m.toolCallCount).toBe(0);
        expect(m.maxChainDepth).toBe(0);
        expect(m.durationMs).toBe(0);
    });

    test('high-tier session metrics', () => {
        const m = buildSessionMetrics(makeState({
            tier: 'high',
            toolCallCount: 50,
            maxChainDepth: 15,
            nudgeCount: 2,
            midChainNudgeCount: 2,
        }));
        expect(m.tier).toBe('high');
        expect(m.toolCallCount).toBe(50);
        expect(m.maxChainDepth).toBe(15);
    });

    test('returns a new object each call (no shared state)', () => {
        const a = buildSessionMetrics(makeState());
        const b = buildSessionMetrics(makeState());
        expect(a).not.toBe(b);
        expect(a).toEqual(b);
    });
});

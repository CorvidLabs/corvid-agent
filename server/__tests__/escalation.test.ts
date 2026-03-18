import { describe, test, expect } from 'bun:test';
import { buildEscalationInfo, type BuildEscalationInput } from '../process/direct-process';

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

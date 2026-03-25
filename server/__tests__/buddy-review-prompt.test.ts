/**
 * Tests for BuddyService.buildBuddyReviewPrompt — the buddy review prompt builder.
 */
import { describe, test, expect } from 'bun:test';
import { BuddyService } from '../buddy/service';
import { BUDDY_DEFAULT_MCP_TOOLS } from '../../shared/types/buddy';

const service = new BuddyService({
    db: {} as any,
    processManager: {} as any,
});

function buildPrompt(
    originalPrompt: string,
    leadName: string,
    buddyName: string,
    leadOutput: string,
    round: number,
    maxRounds: number,
): string {
    return (service as any).buildBuddyReviewPrompt(
        originalPrompt, leadName, buddyName, leadOutput, round, maxRounds,
    );
}

describe('buildBuddyReviewPrompt', () => {
    test('includes buddy and lead names', () => {
        const prompt = buildPrompt('Fix the bug', 'Alice', 'Bob', 'I fixed it', 1, 3);
        expect(prompt).toContain('Bob');
        expect(prompt).toContain('Alice');
    });

    test('includes original prompt', () => {
        const prompt = buildPrompt('Refactor the auth module', 'Lead', 'Buddy', 'Done', 1, 2);
        expect(prompt).toContain('Refactor the auth module');
    });

    test('includes round info', () => {
        const prompt = buildPrompt('Task', 'Lead', 'Buddy', 'Output', 2, 3);
        expect(prompt).toContain('Round 2/3');
    });

    test('includes lead output', () => {
        const prompt = buildPrompt('Task', 'Lead', 'Buddy', 'Here is my analysis', 1, 1);
        expect(prompt).toContain('Here is my analysis');
    });

    test('truncates long lead output to 8000 chars', () => {
        const longOutput = 'x'.repeat(10000);
        const prompt = buildPrompt('Task', 'Lead', 'Buddy', longOutput, 1, 1);
        // Should not contain the full 10000 chars
        expect(prompt.length).toBeLessThan(10000 + 500); // prompt overhead
    });

    test('includes memory tool instructions', () => {
        const prompt = buildPrompt('Task', 'Lead', 'Buddy', 'Output', 1, 1);
        expect(prompt).toContain('corvid_recall_memory');
    });

    test('describes collaborative discussion role', () => {
        const prompt = buildPrompt('Task', 'Lead', 'Buddy', 'Output', 1, 1);
        expect(prompt).toContain('collaborative discussion');
    });

    test('instructs to only approve if genuinely complete', () => {
        const prompt = buildPrompt('Task', 'Lead', 'Buddy', 'Output', 1, 1);
        expect(prompt).toContain('genuinely complete and correct');
    });
});

describe('BUDDY_DEFAULT_MCP_TOOLS', () => {
    test('includes memory recall tools', () => {
        expect(BUDDY_DEFAULT_MCP_TOOLS).toContain('corvid_recall_memory');
        expect(BUDDY_DEFAULT_MCP_TOOLS).toContain('corvid_read_on_chain_memories');
    });

    test('has exactly 2 tools', () => {
        expect(BUDDY_DEFAULT_MCP_TOOLS).toHaveLength(2);
    });
});

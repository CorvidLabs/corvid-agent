import { describe, it, expect } from 'bun:test';

/**
 * Tests for utility functions from direct-process.ts.
 *
 * These functions are module-private, so we test them indirectly by
 * re-implementing the logic here (matching the source) and verifying
 * the behavioral contracts. When a function becomes exported, these
 * tests can switch to direct imports.
 */

// ── Re-implementation of module-private functions ──────────────────────────
// Kept in sync with server/process/direct-process.ts

function estimateTokens(text: string): number {
    if (!text) return 0;
    const codeIndicators = (text.match(/[{}();=<>[\]|&!+\-*/\\^~`]/g) || []).length;
    const codeRatio = codeIndicators / text.length;
    const charsPerToken = codeRatio > 0.08 ? 3 : 4;
    return Math.ceil(text.length / charsPerToken);
}

function getContextBudget(override?: string): number {
    return parseInt(override ?? '8192', 10);
}

function calculateMaxToolResultChars(
    messages: Array<{ role: string; content: string }>,
    systemPrompt: string,
    ctxOverride?: string,
): number {
    const ctxSize = getContextBudget(ctxOverride);
    const absoluteMax = Math.floor(ctxSize * 0.3) * 4;
    const absoluteMin = 1_000;

    const usedTokens = estimateTokens(systemPrompt) +
        messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
    const remainingTokens = ctxSize - usedTokens;
    const availableForResult = Math.floor(remainingTokens * 0.6) * 4;

    return Math.max(absoluteMin, Math.min(absoluteMax, availableForResult));
}

type Msg = { role: 'user' | 'assistant' | 'tool'; content: string; toolCallId?: string };

function trimMessages(messages: Msg[], systemPrompt?: string, ctxOverride?: string): void {
    const MAX_MESSAGES = 40;
    const KEEP_RECENT = 30;

    const ctxSize = getContextBudget(ctxOverride);
    const threshold = Math.floor(ctxSize * 0.7);
    const systemTokens = systemPrompt ? estimateTokens(systemPrompt) : 0;
    const messageTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
    const totalTokens = systemTokens + messageTokens;

    const overCount = messages.length > MAX_MESSAGES;
    const overBudget = totalTokens > threshold;

    if (!overCount && !overBudget) return;

    const keepCount = overBudget
        ? Math.max(6, Math.min(KEEP_RECENT, Math.floor(messages.length * 0.4)))
        : KEEP_RECENT;

    const first = messages[0];
    const discarded = messages.slice(1, -keepCount);
    const recent = messages.slice(-keepCount);

    // Summarize discarded tool results
    const summaries: string[] = [];
    for (const msg of discarded) {
        if (msg.role === 'tool' && msg.content.length > 0) {
            const preview = msg.content.slice(0, 80).replace(/\n/g, ' ').trim();
            const lineCount = (msg.content.match(/\n/g) || []).length + 1;
            summaries.push(`[Previous tool result: ${preview}${msg.content.length > 80 ? '...' : ''} (${lineCount} lines)]`);
        }
    }

    if (recent[0] === first) {
        messages.length = 0;
        if (summaries.length > 0) {
            messages.push({ role: 'user', content: summaries.join('\n') });
        }
        messages.push(...recent);
    } else {
        messages.length = 0;
        messages.push(first);
        if (summaries.length > 0) {
            messages.push({ role: 'user', content: summaries.join('\n') });
        }
        messages.push(...recent);
    }
}

// ── estimateTokens ─────────────────────────────────────────────────────────

describe('estimateTokens', () => {
    it('returns 0 for empty string', () => {
        expect(estimateTokens('')).toBe(0);
    });

    it('estimates prose at ~4 chars per token', () => {
        const prose = 'This is a normal English sentence with regular words and spacing.';
        const tokens = estimateTokens(prose);
        // prose: length/4 ≈ 16
        expect(tokens).toBeGreaterThan(0);
        expect(tokens).toBe(Math.ceil(prose.length / 4));
    });

    it('estimates code at ~3 chars per token', () => {
        const code = 'function foo(x: number): string { return x.toString(); }';
        const tokens = estimateTokens(code);
        // Code has many operators — should use 3 chars/token
        const codeIndicators = (code.match(/[{}();=<>[\]|&!+\-*/\\^~`]/g) || []).length;
        const ratio = codeIndicators / code.length;
        expect(ratio).toBeGreaterThan(0.08);
        expect(tokens).toBe(Math.ceil(code.length / 3));
    });

    it('code estimation produces more tokens than prose for same length', () => {
        const length = 100;
        const prose = 'a'.repeat(length); // Pure prose, no code indicators
        const code = '{x=1;}'.repeat(Math.ceil(length / 6)).slice(0, length); // Lots of operators
        expect(estimateTokens(code)).toBeGreaterThan(estimateTokens(prose));
    });
});

// ── getContextBudget ───────────────────────────────────────────────────────

describe('getContextBudget', () => {
    it('returns 8192 by default', () => {
        expect(getContextBudget()).toBe(8192);
    });

    it('parses override value', () => {
        expect(getContextBudget('16384')).toBe(16384);
    });
});

// ── calculateMaxToolResultChars ────────────────────────────────────────────

describe('calculateMaxToolResultChars', () => {
    it('returns at least 1000 chars', () => {
        // Nearly full context
        const messages = [{ role: 'user', content: 'x'.repeat(30000) }];
        const result = calculateMaxToolResultChars(messages, 'system', '8192');
        expect(result).toBeGreaterThanOrEqual(1_000);
    });

    it('returns at most 30% of context window in chars', () => {
        const messages: Array<{ role: string; content: string }> = [];
        const result = calculateMaxToolResultChars(messages, '', '8192');
        const max30pct = Math.floor(8192 * 0.3) * 4;
        expect(result).toBeLessThanOrEqual(max30pct);
    });

    it('scales down under budget pressure', () => {
        const empty = calculateMaxToolResultChars([], '', '8192');
        // Fill most of the context (24000 chars ≈ 6000 tokens out of 8192)
        const pressured = calculateMaxToolResultChars(
            [{ role: 'user', content: 'x'.repeat(24000) }],
            '',
            '8192',
        );
        expect(pressured).toBeLessThan(empty);
    });
});

// ── trimMessages ───────────────────────────────────────────────────────────

describe('trimMessages', () => {
    it('does not trim when under limits', () => {
        const messages: Msg[] = [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi!' },
        ];
        trimMessages(messages, 'system', '8192');
        expect(messages.length).toBe(2);
    });

    it('trims when message count exceeds 40', () => {
        const messages: Msg[] = Array.from({ length: 45 }, (_, i) => ({
            role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
            content: `message ${i}`,
        }));
        trimMessages(messages, 'system', '100000'); // Large budget so only count triggers
        expect(messages.length).toBeLessThan(45);
    });

    it('trims when token budget exceeded', () => {
        const messages: Msg[] = Array.from({ length: 10 }, (_, i) => ({
            role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
            content: 'x'.repeat(5000), // Each ~1250 tokens, 10 = 12500, exceeds 70% of 8192
        }));
        trimMessages(messages, 'system', '8192');
        expect(messages.length).toBeLessThan(10);
    });

    it('preserves first message after trim', () => {
        const messages: Msg[] = Array.from({ length: 45 }, (_, i) => ({
            role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
            content: `message ${i}`,
        }));
        const firstContent = messages[0].content;
        trimMessages(messages, 'system', '100000');
        expect(messages[0].content).toBe(firstContent);
    });

    it('adds tool result summaries for discarded tool messages', () => {
        const messages: Msg[] = [
            { role: 'user', content: 'Do something' },
            ...Array.from({ length: 20 }, (_, i) => ([
                { role: 'assistant' as const, content: `Calling tool ${i}` },
                { role: 'tool' as const, content: `Result of tool call ${i}: some output data here`, toolCallId: `tc-${i}` },
            ])).flat(),
            ...Array.from({ length: 30 }, (_, i) => ({
                role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
                content: `recent message ${i}`,
            })),
        ];
        // Total: 1 + 40 + 30 = 71 messages, exceeds MAX_MESSAGES (40)
        const before = messages.length;
        trimMessages(messages, 'system', '100000');
        expect(messages.length).toBeLessThan(before);

        // Check that at least one summary was injected
        const hasSummary = messages.some(m => m.content.includes('[Previous tool result:'));
        expect(hasSummary).toBe(true);
    });

    it('handles first message in recent window (no duplicate)', () => {
        // When only 5 messages and all fit in recent, first === recent[0]
        const messages: Msg[] = Array.from({ length: 5 }, (_, i) => ({
            role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
            content: 'x'.repeat(5000),
        }));
        trimMessages(messages, 'system', '8192');
        // Should not have duplicate first message
        // All messages have same content, but check no extra was added
        expect(messages.length).toBeLessThanOrEqual(5);
    });
});

import { describe, it, expect } from 'bun:test';
import {
    estimateTokens,
    getContextBudget,
    calculateMaxToolResultChars,
    truncateCouncilContext,
    compressToolResults,
    summarizeConversation,
    truncateOldToolResults,
    trimMessages,
    computeContextUsage,
    determineWarningLevel,
    type ConversationMessage,
} from '../process/context-management';

// ── estimateTokens ─────────────────────────────────────────────────────────

describe('estimateTokens', () => {
    it('returns 0 for empty string', () => {
        expect(estimateTokens('')).toBe(0);
    });

    it('returns 0 for falsy input', () => {
        expect(estimateTokens(null as any)).toBe(0);
        expect(estimateTokens(undefined as any)).toBe(0);
    });

    it('estimates prose at ~4 chars per token', () => {
        const prose = 'This is a normal English sentence with regular words and spacing.';
        expect(estimateTokens(prose)).toBe(Math.ceil(prose.length / 4));
    });

    it('estimates code at ~3 chars per token', () => {
        const code = 'function foo(x: number): string { return x.toString(); }';
        const codeIndicators = (code.match(/[{}();=<>[\]|&!+\-*/\\^~`]/g) || []).length;
        expect(codeIndicators / code.length).toBeGreaterThan(0.08);
        expect(estimateTokens(code)).toBe(Math.ceil(code.length / 3));
    });

    it('code estimation produces more tokens than prose for same length', () => {
        const length = 100;
        const prose = 'a'.repeat(length);
        const code = '{x=1;}'.repeat(Math.ceil(length / 6)).slice(0, length);
        expect(estimateTokens(code)).toBeGreaterThan(estimateTokens(prose));
    });
});

// ── getContextBudget ───────────────────────────────────────────────────────

describe('getContextBudget', () => {
    it('returns default 8192 when env not set', () => {
        const original = process.env.OLLAMA_NUM_CTX;
        delete process.env.OLLAMA_NUM_CTX;
        expect(getContextBudget()).toBe(8192);
        if (original !== undefined) process.env.OLLAMA_NUM_CTX = original;
    });
});

// ── calculateMaxToolResultChars ────────────────────────────────────────────

describe('calculateMaxToolResultChars', () => {
    it('returns at least 1000 chars even under pressure', () => {
        const messages = [{ role: 'user', content: 'x'.repeat(30000) }];
        const result = calculateMaxToolResultChars(messages, 'system');
        expect(result).toBeGreaterThanOrEqual(1_000);
    });

    it('returns at most 30% of context window in chars', () => {
        const result = calculateMaxToolResultChars([], '');
        const budget = getContextBudget();
        const max30pct = Math.floor(budget * 0.3) * 4;
        expect(result).toBeLessThanOrEqual(max30pct);
    });

    it('scales down under budget pressure', () => {
        const empty = calculateMaxToolResultChars([], '');
        const pressured = calculateMaxToolResultChars(
            [{ role: 'user', content: 'x'.repeat(24000) }],
            '',
        );
        expect(pressured).toBeLessThan(empty);
    });
});

// ── truncateCouncilContext ──────────────────────────────────────────────────

describe('truncateCouncilContext', () => {
    it('does not truncate when under threshold', () => {
        const messages: ConversationMessage[] = [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi' },
        ];
        truncateCouncilContext(messages, 'short system');
        expect(messages.length).toBe(2);
    });

    it('truncates when over 70% of context', () => {
        const messages: ConversationMessage[] = Array.from({ length: 20 }, (_, i) => ({
            role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
            content: 'x'.repeat(3000),
        }));
        truncateCouncilContext(messages, 'system prompt');
        // Should keep first + last 4 = 5
        expect(messages.length).toBeLessThanOrEqual(6);
    });

    it('keeps first user message and last 4 messages', () => {
        const messages: ConversationMessage[] = [
            { role: 'user', content: 'x'.repeat(5000) },
            ...Array.from({ length: 15 }, (_, i) => ({
                role: (i % 2 === 0 ? 'assistant' : 'user') as 'user' | 'assistant',
                content: 'x'.repeat(3000),
            })),
        ];
        const firstContent = messages[0].content;
        truncateCouncilContext(messages, 'system');
        expect(messages[0].content).toBe(firstContent);
        expect(messages.length).toBeLessThanOrEqual(6);
    });

    it('handles case where first message is in tail', () => {
        // Only 5 messages, but large enough to trigger
        const messages: ConversationMessage[] = Array.from({ length: 5 }, (_, i) => ({
            role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
            content: 'x'.repeat(10000),
        }));
        truncateCouncilContext(messages, 'sys');
        // Should not duplicate first message
        expect(messages.length).toBeLessThanOrEqual(5);
    });

    it('no-ops when too few messages to trim', () => {
        // 5 messages = keepTail(4) + 1 → nothing to trim
        const messages: ConversationMessage[] = Array.from({ length: 5 }, (_, i) => ({
            role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
            content: 'x'.repeat(8000),
        }));
        const original = messages.length;
        truncateCouncilContext(messages, 'sys');
        expect(messages.length).toBe(original);
    });
});

// ── compressToolResults ───────────────────────────────────────────────────

describe('compressToolResults', () => {
    it('truncates tool results older than maxAge positions', () => {
        const messages: ConversationMessage[] = [
            { role: 'tool', content: 'A'.repeat(500) },
            { role: 'assistant', content: 'reply' },
            { role: 'user', content: 'follow up' },
            { role: 'assistant', content: 'response' },
            { role: 'user', content: 'more' },
        ];
        const compressed = compressToolResults(messages, 3, 200);
        expect(compressed).toBe(1);
        expect(messages[0].content.length).toBeLessThan(500);
        expect(messages[0].content).toContain('compressed, was 500 chars');
    });

    it('does not truncate tool results within maxAge window', () => {
        const messages: ConversationMessage[] = [
            { role: 'user', content: 'hello' },
            { role: 'tool', content: 'A'.repeat(500) },
        ];
        const compressed = compressToolResults(messages, 3, 200);
        expect(compressed).toBe(0);
        expect(messages[1].content.length).toBe(500);
    });

    it('does not truncate short tool results', () => {
        const messages: ConversationMessage[] = [
            { role: 'tool', content: 'short result' },
            { role: 'user', content: 'a' },
            { role: 'assistant', content: 'b' },
            { role: 'user', content: 'c' },
            { role: 'assistant', content: 'd' },
        ];
        expect(compressToolResults(messages, 2, 200)).toBe(0);
    });

    it('does not modify non-tool messages', () => {
        const messages: ConversationMessage[] = [
            { role: 'user', content: 'A'.repeat(500) },
            { role: 'assistant', content: 'B'.repeat(500) },
            { role: 'user', content: 'c' },
            { role: 'assistant', content: 'd' },
            { role: 'user', content: 'e' },
        ];
        expect(compressToolResults(messages, 2, 200)).toBe(0);
    });

    it('returns count of compressed messages', () => {
        const messages: ConversationMessage[] = [
            { role: 'tool', content: 'A'.repeat(500) },
            { role: 'tool', content: 'B'.repeat(500) },
            { role: 'user', content: 'c' },
            { role: 'assistant', content: 'd' },
            { role: 'user', content: 'e' },
        ];
        expect(compressToolResults(messages, 2, 200)).toBe(2);
    });
});

// ── summarizeConversation ─────────────────────────────────────────────────

describe('summarizeConversation', () => {
    it('produces a summary containing the original request', () => {
        const messages = [
            { role: 'user', content: 'Please fix the login bug' },
            { role: 'assistant', content: 'I will investigate the login bug.' },
        ];
        const summary = summarizeConversation(messages);
        expect(summary).toContain('[Context Summary]');
        expect(summary).toContain('Please fix the login bug');
    });

    it('includes tool usage count', () => {
        const messages = [
            { role: 'user', content: 'Do something' },
            { role: 'tool', content: 'result 1' },
            { role: 'tool', content: 'result 2' },
            { role: 'assistant', content: 'Done' },
        ];
        expect(summarizeConversation(messages)).toContain('2 tool calls');
    });

    it('includes last assistant response', () => {
        const messages = [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'First response' },
            { role: 'assistant', content: 'Final conclusion here' },
        ];
        expect(summarizeConversation(messages)).toContain('Final conclusion here');
    });

    it('truncates long original requests', () => {
        const messages = [
            { role: 'user', content: 'X'.repeat(500) },
            { role: 'assistant', content: 'ok' },
        ];
        const summary = summarizeConversation(messages);
        expect(summary).toContain('...');
        expect(summary.length).toBeLessThan(600);
    });

    it('includes follow-up messages', () => {
        const messages = [
            { role: 'user', content: 'First request' },
            { role: 'assistant', content: 'ok' },
            { role: 'user', content: 'Second request' },
            { role: 'assistant', content: 'done' },
        ];
        const summary = summarizeConversation(messages);
        expect(summary).toContain('Follow-up messages');
        expect(summary).toContain('Second request');
    });

    it('handles empty messages', () => {
        expect(summarizeConversation([])).toContain('[Context Summary]');
    });

    it('summarizes many follow-ups concisely', () => {
        const messages = [
            { role: 'user', content: 'First' },
            ...Array.from({ length: 10 }, (_, i) => ([
                { role: 'assistant', content: `Response ${i}` },
                { role: 'user', content: `Follow-up ${i}` },
            ])).flat(),
        ];
        const summary = summarizeConversation(messages);
        expect(summary).toContain('10 total');
        expect(summary).toContain('and 7 more');
    });
});

// ── truncateOldToolResults ────────────────────────────────────────────────

describe('truncateOldToolResults', () => {
    it('truncates tool results older than ageThreshold', () => {
        const messages: ConversationMessage[] = [
            { role: 'tool', content: 'A'.repeat(1000) },
            { role: 'assistant', content: 'reply' },
            { role: 'user', content: 'next' },
            { role: 'assistant', content: 'response' },
        ];
        const truncated = truncateOldToolResults(messages, 3, 500);
        expect(truncated).toBe(1);
        expect(messages[0].content).toContain('truncated, was 1000 chars');
    });

    it('does not truncate recent tool results', () => {
        const messages: ConversationMessage[] = [
            { role: 'user', content: 'hello' },
            { role: 'tool', content: 'A'.repeat(1000) },
        ];
        expect(truncateOldToolResults(messages, 3, 500)).toBe(0);
    });

    it('returns count of truncated messages', () => {
        const messages: ConversationMessage[] = [
            { role: 'tool', content: 'A'.repeat(1000) },
            { role: 'tool', content: 'B'.repeat(800) },
            { role: 'user', content: 'a' },
            { role: 'assistant', content: 'b' },
            { role: 'user', content: 'c' },
        ];
        expect(truncateOldToolResults(messages, 2, 500)).toBe(2);
    });
});

// ── trimMessages ──────────────────────────────────────────────────────────

describe('trimMessages', () => {
    it('does not trim when under all thresholds', () => {
        const messages: ConversationMessage[] = [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi!' },
        ];
        trimMessages(messages, 'system');
        expect(messages.length).toBe(2);
    });

    it('trims when message count exceeds MAX_MESSAGES (40)', () => {
        const messages: ConversationMessage[] = Array.from({ length: 45 }, (_, i) => ({
            role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
            content: `message ${i}`,
        }));
        trimMessages(messages);
        expect(messages.length).toBeLessThan(45);
    });

    it('applies tier 1 (light compression) at 60%+ usage', () => {
        // Need ~60% of 8192 tokens = ~4915 tokens = ~19660 chars prose
        const messages: ConversationMessage[] = [
            { role: 'tool', content: 'A'.repeat(2000) },
            { role: 'tool', content: 'B'.repeat(2000) },
            { role: 'user', content: 'x'.repeat(16000) },
            { role: 'assistant', content: 'short' },
            { role: 'user', content: 'short' },
            { role: 'assistant', content: 'short' },
            { role: 'user', content: 'short' },
            { role: 'assistant', content: 'short' },
            { role: 'user', content: 'short' },
        ];
        trimMessages(messages);
        // Tool results at index 0,1 should be compressed since they are old
        // After tier 1, the tool content should be shortened
        expect(messages[0].content.length).toBeLessThan(2000);
    });

    it('applies tier 2 at 75%+ usage', () => {
        const messages: ConversationMessage[] = Array.from({ length: 20 }, (_, i) => ({
            role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
            content: 'x'.repeat(1200), // 20 * 1200/4 = 6000 tokens, 73% of 8192
        }));
        // Push over 75%
        messages.push({ role: 'user', content: 'x'.repeat(2000) });
        trimMessages(messages);
        expect(messages.length).toBeLessThan(21);
    });

    it('applies tier 3 (aggressive) at 85%+ usage', () => {
        const messages: ConversationMessage[] = Array.from({ length: 15 }, (_, i) => ({
            role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
            content: 'x'.repeat(2000), // 15 * 2000/4 = 7500 tokens, 91.5% of 8192
        }));
        trimMessages(messages);
        // Tier 3 or 4 should aggressively compress
        expect(messages.length).toBeLessThanOrEqual(10);
    });

    it('applies tier 4 (full summary) at 90%+ usage', () => {
        const messages: ConversationMessage[] = Array.from({ length: 20 }, (_, i) => ({
            role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
            content: 'x'.repeat(2000),
        }));
        trimMessages(messages);
        // Tier 4: summary + last 4 messages = ~5
        expect(messages.length).toBeLessThanOrEqual(6);
        expect(messages[0].content).toContain('[Context Summary]');
    });

    it('preserves first message during tier 2 trim', () => {
        const messages: ConversationMessage[] = Array.from({ length: 45 }, (_, i) => ({
            role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
            content: `message ${i}`,
        }));
        const firstContent = messages[0].content;
        trimMessages(messages);
        expect(messages[0].content).toBe(firstContent);
    });
});

// ── computeContextUsage ───────────────────────────────────────────────────

describe('computeContextUsage', () => {
    it('calculates usage metrics for empty messages', () => {
        const result = computeContextUsage([], '', false);
        expect(result.estimatedTokens).toBe(0);
        expect(result.contextWindow).toBe(8192);
        expect(result.usagePercent).toBe(0);
        expect(result.messagesCount).toBe(0);
        expect(result.trimmed).toBe(false);
    });

    it('calculates usage percent correctly', () => {
        const msgs = [{ role: 'user', content: 'a'.repeat(4096) }];
        const result = computeContextUsage(msgs, '', false);
        expect(result.usagePercent).toBe(Math.round((result.estimatedTokens / 8192) * 100));
        expect(result.messagesCount).toBe(1);
    });

    it('includes system prompt in token count', () => {
        const withSystem = computeContextUsage([], 'x'.repeat(4000), false);
        const withoutSystem = computeContextUsage([], '', false);
        expect(withSystem.estimatedTokens).toBeGreaterThan(withoutSystem.estimatedTokens);
    });

    it('passes through trimmed flag', () => {
        expect(computeContextUsage([], '', true).trimmed).toBe(true);
        expect(computeContextUsage([], '', false).trimmed).toBe(false);
    });
});

// ── determineWarningLevel ─────────────────────────────────────────────────

describe('determineWarningLevel', () => {
    it('returns null below 50%', () => {
        expect(determineWarningLevel(0)).toBeNull();
        expect(determineWarningLevel(25)).toBeNull();
        expect(determineWarningLevel(49)).toBeNull();
    });

    it('returns info at 50-69%', () => {
        expect(determineWarningLevel(50)!.level).toBe('info');
        expect(determineWarningLevel(60)!.level).toBe('info');
        expect(determineWarningLevel(69)!.level).toBe('info');
    });

    it('returns warning at 70-84%', () => {
        expect(determineWarningLevel(70)!.level).toBe('warning');
        expect(determineWarningLevel(75)!.level).toBe('warning');
        expect(determineWarningLevel(84)!.level).toBe('warning');
    });

    it('returns critical at 85%+', () => {
        expect(determineWarningLevel(85)!.level).toBe('critical');
        expect(determineWarningLevel(90)!.level).toBe('critical');
        expect(determineWarningLevel(100)!.level).toBe('critical');
    });

    it('includes percentage in message', () => {
        expect(determineWarningLevel(50)!.message).toContain('50%');
        expect(determineWarningLevel(70)!.message).toContain('trimming');
        expect(determineWarningLevel(85)!.message).toContain('exhaustion');
    });
});

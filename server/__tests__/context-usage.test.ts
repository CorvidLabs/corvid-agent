import { describe, expect, test } from 'bun:test';
import {
    isContextUsageEvent,
    isContextWarningEvent,
} from '../process/types';
import type {
    ClaudeStreamEvent,
    ContextUsageEvent,
    ContextWarningEvent,
} from '../process/types';

describe('context usage events', () => {
    describe('isContextUsageEvent', () => {
        test('returns true for context_usage events', () => {
            const event: ContextUsageEvent = {
                type: 'context_usage',
                estimatedTokens: 4000,
                contextWindow: 8192,
                usagePercent: 49,
                messagesCount: 12,
                trimmed: false,
            };
            expect(isContextUsageEvent(event)).toBe(true);
        });

        test('returns false for other event types', () => {
            expect(isContextUsageEvent({ type: 'result' } as ClaudeStreamEvent)).toBe(false);
            expect(isContextUsageEvent({ type: 'error', error: { message: '', type: '' } } as ClaudeStreamEvent)).toBe(false);
            expect(isContextUsageEvent({ type: 'context_warning', level: 'info', usagePercent: 50, message: '' } as ClaudeStreamEvent)).toBe(false);
        });
    });

    describe('isContextWarningEvent', () => {
        test('returns true for context_warning events', () => {
            const event: ContextWarningEvent = {
                type: 'context_warning',
                level: 'critical',
                usagePercent: 87,
                message: 'Context usage at 87%',
            };
            expect(isContextWarningEvent(event)).toBe(true);
        });

        test('returns false for other event types', () => {
            expect(isContextWarningEvent({ type: 'result' } as ClaudeStreamEvent)).toBe(false);
            expect(isContextWarningEvent({ type: 'context_usage', estimatedTokens: 0, contextWindow: 8192, usagePercent: 0, messagesCount: 0, trimmed: false } as ClaudeStreamEvent)).toBe(false);
        });

        test('all warning levels are valid', () => {
            for (const level of ['info', 'warning', 'critical'] as const) {
                const event: ContextWarningEvent = {
                    type: 'context_warning',
                    level,
                    usagePercent: 50,
                    message: `Test ${level}`,
                };
                expect(isContextWarningEvent(event)).toBe(true);
            }
        });
    });

    describe('ContextUsageEvent shape', () => {
        test('includes all required fields', () => {
            const event: ContextUsageEvent = {
                type: 'context_usage',
                estimatedTokens: 6000,
                contextWindow: 8192,
                usagePercent: 73,
                messagesCount: 20,
                trimmed: true,
            };
            expect(event.type).toBe('context_usage');
            expect(event.estimatedTokens).toBe(6000);
            expect(event.contextWindow).toBe(8192);
            expect(event.usagePercent).toBe(73);
            expect(event.messagesCount).toBe(20);
            expect(event.trimmed).toBe(true);
        });

        test('accepts optional session_id from BaseStreamEvent', () => {
            const event: ContextUsageEvent = {
                type: 'context_usage',
                session_id: 'test-session-123',
                estimatedTokens: 1000,
                contextWindow: 8192,
                usagePercent: 12,
                messagesCount: 3,
                trimmed: false,
            };
            expect(event.session_id).toBe('test-session-123');
        });
    });

    describe('ContextWarningEvent shape', () => {
        test('includes all required fields', () => {
            const event: ContextWarningEvent = {
                type: 'context_warning',
                level: 'warning',
                usagePercent: 72,
                message: 'Context usage at 72% — message trimming will start soon.',
            };
            expect(event.type).toBe('context_warning');
            expect(event.level).toBe('warning');
            expect(event.usagePercent).toBe(72);
            expect(event.message).toContain('72%');
        });
    });
});

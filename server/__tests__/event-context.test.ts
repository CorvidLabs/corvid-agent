import { describe, it, expect } from 'bun:test';
import {
    createEventContext,
    runWithEventContext,
    type EventSource,
} from '../observability/event-context';
import { getTraceId, runWithTraceId } from '../observability/trace-context';

/**
 * EventContext tests — correlation ID creation, inheritance, and propagation.
 */

describe('createEventContext', () => {
    it('generates a valid 32-hex-char traceId', () => {
        const ctx = createEventContext('web');
        expect(ctx.traceId).toMatch(/^[a-f0-9]{32}$/);
    });

    it('sets timestamp to a recent Date.now() value', () => {
        const before = Date.now();
        const ctx = createEventContext('scheduler');
        const after = Date.now();
        expect(ctx.timestamp).toBeGreaterThanOrEqual(before);
        expect(ctx.timestamp).toBeLessThanOrEqual(after);
    });

    it('sets the source field correctly', () => {
        const sources: EventSource[] = [
            'web', 'algochat', 'agent', 'telegram', 'discord',
            'scheduler', 'webhook', 'workflow', 'council', 'polling',
        ];
        for (const source of sources) {
            const ctx = createEventContext(source);
            expect(ctx.source).toBe(source);
        }
    });

    it('reuses an existing traceId when provided', () => {
        const existing = 'aabbccdd11223344aabbccdd11223344';
        const ctx = createEventContext('webhook', existing);
        expect(ctx.traceId).toBe(existing);
    });

    it('has no parentId when created outside a trace context', () => {
        const ctx = createEventContext('polling');
        expect(ctx.parentId).toBeUndefined();
    });

    it('inherits traceId and sets parentId when inside an existing trace context', () => {
        runWithTraceId('parent-trace-00112233aabbccdd', () => {
            const ctx = createEventContext('council');
            // traceId inherits from the current AsyncLocalStorage context
            expect(ctx.traceId).toBe('parent-trace-00112233aabbccdd');
            // parentId is set to currentTraceId because existingTraceId is undefined
            // and currentTraceId !== undefined
            expect(ctx.parentId).toBe('parent-trace-00112233aabbccdd');
        });
    });

    it('sets parentId when explicit traceId differs from current context', () => {
        runWithTraceId('parent-trace-00112233aabbccdd', () => {
            const ctx = createEventContext('agent', 'different-trace-aabbccdd11223344');
            expect(ctx.traceId).toBe('different-trace-aabbccdd11223344');
            expect(ctx.parentId).toBe('parent-trace-00112233aabbccdd');
        });
    });

    it('generates unique traceIds across calls', () => {
        const ids = new Set<string>();
        for (let i = 0; i < 100; i++) {
            ids.add(createEventContext('web').traceId);
        }
        expect(ids.size).toBe(100);
    });
});

describe('runWithEventContext', () => {
    it('makes traceId available via getTraceId()', () => {
        const ctx = createEventContext('algochat');
        const result = runWithEventContext(ctx, () => {
            return getTraceId();
        });
        expect(result).toBe(ctx.traceId);
    });

    it('traceId is undefined after context exits', () => {
        const ctx = createEventContext('scheduler');
        runWithEventContext(ctx, () => {
            expect(getTraceId()).toBe(ctx.traceId);
        });
        expect(getTraceId()).toBeUndefined();
    });

    it('propagates traceId through async boundaries', async () => {
        const ctx = createEventContext('workflow');
        const result = await runWithEventContext(ctx, async () => {
            // Simulate async work
            await new Promise(r => setTimeout(r, 10));
            return getTraceId();
        });
        expect(result).toBe(ctx.traceId);
    });

    it('concurrent contexts do not leak across async boundaries', async () => {
        const ctx1 = createEventContext('webhook');
        const ctx2 = createEventContext('polling');

        const results: string[] = [];

        const p1 = runWithEventContext(ctx1, async () => {
            await new Promise(r => setTimeout(r, 15));
            results.push(`p1=${getTraceId()}`);
        });

        const p2 = runWithEventContext(ctx2, async () => {
            await new Promise(r => setTimeout(r, 5));
            results.push(`p2=${getTraceId()}`);
        });

        await Promise.all([p1, p2]);

        expect(results).toContain(`p1=${ctx1.traceId}`);
        expect(results).toContain(`p2=${ctx2.traceId}`);
    });

    it('nested contexts override and restore traceId', () => {
        const outer = createEventContext('algochat');
        const inner = createEventContext('council');

        runWithEventContext(outer, () => {
            expect(getTraceId()).toBe(outer.traceId);

            runWithEventContext(inner, () => {
                expect(getTraceId()).toBe(inner.traceId);
            });

            // Restored to outer
            expect(getTraceId()).toBe(outer.traceId);
        });
    });

    it('returns the value from the wrapped function', () => {
        const ctx = createEventContext('agent');
        const result = runWithEventContext(ctx, () => 42);
        expect(result).toBe(42);
    });
});

describe('EventContext integration', () => {
    it('child context created inside runWithEventContext inherits traceId', () => {
        const parent = createEventContext('algochat');

        runWithEventContext(parent, () => {
            const child = createEventContext('council');
            // Child inherits the parent traceId from AsyncLocalStorage
            expect(child.traceId).toBe(parent.traceId);
        });
    });

    it('simulates scheduler -> council -> agent propagation', async () => {
        const schedulerCtx = createEventContext('scheduler');
        const traceIds: string[] = [];

        await runWithEventContext(schedulerCtx, async () => {
            traceIds.push(getTraceId()!);

            // Council inherits trace
            const councilCtx = createEventContext('council');
            expect(councilCtx.traceId).toBe(schedulerCtx.traceId);

            await runWithEventContext(councilCtx, async () => {
                traceIds.push(getTraceId()!);

                // Agent inherits trace
                const agentCtx = createEventContext('agent');
                expect(agentCtx.traceId).toBe(schedulerCtx.traceId);
                traceIds.push(agentCtx.traceId);
            });
        });

        // All three should share the same traceId
        expect(new Set(traceIds).size).toBe(1);
        expect(traceIds[0]).toBe(schedulerCtx.traceId);
    });
});

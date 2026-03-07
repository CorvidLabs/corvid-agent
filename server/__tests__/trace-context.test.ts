import { describe, test, expect } from 'bun:test';
import { getTraceId, getRequestId, runWithTraceId } from '../observability/trace-context';

describe('trace-context', () => {
    test('getTraceId returns undefined outside a context', () => {
        expect(getTraceId()).toBeUndefined();
    });

    test('getRequestId returns undefined outside a context', () => {
        expect(getRequestId()).toBeUndefined();
    });

    test('runWithTraceId provides traceId to callback', () => {
        const result = runWithTraceId('trace-abc', () => {
            return getTraceId();
        });
        expect(result).toBe('trace-abc');
    });

    test('runWithTraceId provides optional requestId', () => {
        const result = runWithTraceId('trace-1', () => {
            return getRequestId();
        }, 'req-42');
        expect(result).toBe('req-42');
    });

    test('requestId is undefined when not provided', () => {
        const result = runWithTraceId('trace-2', () => {
            return getRequestId();
        });
        expect(result).toBeUndefined();
    });

    test('nested contexts override outer context', () => {
        runWithTraceId('outer', () => {
            expect(getTraceId()).toBe('outer');
            runWithTraceId('inner', () => {
                expect(getTraceId()).toBe('inner');
            });
            // Restored after inner exits
            expect(getTraceId()).toBe('outer');
        });
    });

    test('async operations inherit trace context', async () => {
        const result = await runWithTraceId('async-trace', async () => {
            await new Promise((r) => setTimeout(r, 1));
            return getTraceId();
        });
        expect(result).toBe('async-trace');
    });

    test('context does not leak between parallel runs', async () => {
        const results = await Promise.all([
            runWithTraceId('parallel-a', async () => {
                await new Promise((r) => setTimeout(r, 5));
                return getTraceId();
            }),
            runWithTraceId('parallel-b', async () => {
                await new Promise((r) => setTimeout(r, 5));
                return getTraceId();
            }),
        ]);
        expect(results).toEqual(['parallel-a', 'parallel-b']);
    });
});

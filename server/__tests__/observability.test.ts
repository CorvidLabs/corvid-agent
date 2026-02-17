import { describe, it, expect } from 'bun:test';
import {
    getTraceId,
    getRequestId,
    runWithTraceId,
} from '../observability/trace-context';
import {
    httpRequestsTotal,
    httpRequestDuration,
    activeSessions,
    renderMetrics,
} from '../observability/metrics';

/**
 * Observability tests — trace context propagation and Prometheus metrics.
 */

// ─── Trace Context ─────────────────────────────────────────────────────────

describe('trace context', () => {
    it('getTraceId returns undefined outside context', () => {
        expect(getTraceId()).toBeUndefined();
    });

    it('getRequestId returns undefined outside context', () => {
        expect(getRequestId()).toBeUndefined();
    });

    it('runWithTraceId scopes traceId correctly', () => {
        const result = runWithTraceId('trace-123', () => {
            return getTraceId();
        });
        expect(result).toBe('trace-123');

        // Outside the context, should be undefined
        expect(getTraceId()).toBeUndefined();
    });

    it('runWithTraceId scopes requestId correctly', () => {
        const result = runWithTraceId('trace-456', () => {
            return getRequestId();
        }, 'req-789');
        expect(result).toBe('req-789');

        expect(getRequestId()).toBeUndefined();
    });

    it('concurrent runWithTraceId calls do not leak', async () => {
        const results: string[] = [];

        const p1 = new Promise<void>((resolve) => {
            runWithTraceId('trace-A', async () => {
                // Yield to let p2 start
                await new Promise(r => setTimeout(r, 10));
                results.push(`p1=${getTraceId()}`);
                resolve();
            });
        });

        const p2 = new Promise<void>((resolve) => {
            runWithTraceId('trace-B', async () => {
                await new Promise(r => setTimeout(r, 5));
                results.push(`p2=${getTraceId()}`);
                resolve();
            });
        });

        await Promise.all([p1, p2]);

        expect(results).toContain('p1=trace-A');
        expect(results).toContain('p2=trace-B');
    });

    it('nested runWithTraceId overrides parent', () => {
        runWithTraceId('outer', () => {
            expect(getTraceId()).toBe('outer');

            runWithTraceId('inner', () => {
                expect(getTraceId()).toBe('inner');
            });

            // Restored to outer
            expect(getTraceId()).toBe('outer');
        });
    });
});

// ─── Metrics ───────────────────────────────────────────────────────────────

describe('metrics', () => {
    it('counter increments correctly', () => {
        httpRequestsTotal.inc({ method: 'GET', route: '/test', status_code: '200' });
        httpRequestsTotal.inc({ method: 'GET', route: '/test', status_code: '200' });
        httpRequestsTotal.inc({ method: 'POST', route: '/test', status_code: '201' });

        const output = httpRequestsTotal.toPrometheus();
        expect(output).toContain('# TYPE http_requests_total counter');
        expect(output).toContain('http_requests_total{method="GET",route="/test",status_code="200"} 2');
        expect(output).toContain('http_requests_total{method="POST",route="/test",status_code="201"} 1');
    });

    it('gauge set/inc/dec work', () => {
        activeSessions.set(5);
        const output1 = activeSessions.toPrometheus();
        expect(output1).toContain('# TYPE active_sessions gauge');
        expect(output1).toContain('active_sessions 5');

        activeSessions.inc({}, 3);
        const output2 = activeSessions.toPrometheus();
        expect(output2).toContain('active_sessions 8');
    });

    it('histogram observe fills buckets', () => {
        httpRequestDuration.observe({ method: 'GET', route: '/api/health', status_code: '200' }, 0.05);
        httpRequestDuration.observe({ method: 'GET', route: '/api/health', status_code: '200' }, 0.5);

        const output = httpRequestDuration.toPrometheus();
        expect(output).toContain('# TYPE http_request_duration_seconds histogram');
        expect(output).toContain('_bucket');
        expect(output).toContain('_sum');
        expect(output).toContain('_count');
    });

    it('renderMetrics produces Prometheus text format', () => {
        const output = renderMetrics();

        // Should end with newline
        expect(output.endsWith('\n')).toBe(true);

        // Should contain HELP and TYPE directives
        expect(output).toContain('# HELP');
        expect(output).toContain('# TYPE');
    });

    it('counter with no labels produces correct format', () => {
        // creditsConsumedTotal is a shared singleton — other test files may
        // have already incremented it, so capture baseline and check delta.
        const { creditsConsumedTotal } = require('../observability/metrics');
        const before = creditsConsumedTotal.toPrometheus();
        const baselineMatch = before.match(/credits_consumed_total (\d+)/);
        const baseline = baselineMatch ? Number(baselineMatch[1]) : 0;

        creditsConsumedTotal.inc({}, 100);
        const output = creditsConsumedTotal.toPrometheus();
        expect(output).toContain('# TYPE credits_consumed_total counter');
        expect(output).toContain(`credits_consumed_total ${baseline + 100}`);
    });
});

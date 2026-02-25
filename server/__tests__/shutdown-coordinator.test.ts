import { describe, expect, test } from 'bun:test';
import { ShutdownCoordinator } from '../lib/shutdown-coordinator';

// Helper to create a delay promise
const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('ShutdownCoordinator', () => {
    test('starts in idle phase', () => {
        const coordinator = new ShutdownCoordinator();
        expect(coordinator.phase).toBe('idle');
        expect(coordinator.isShuttingDown).toBe(false);
        expect(coordinator.result).toBeNull();
    });

    test('executes handlers in priority order', async () => {
        const coordinator = new ShutdownCoordinator();
        const order: string[] = [];

        coordinator.register({ name: 'last', priority: 30, handler: () => { order.push('last'); } });
        coordinator.register({ name: 'first', priority: 0, handler: () => { order.push('first'); } });
        coordinator.register({ name: 'middle', priority: 10, handler: () => { order.push('middle'); } });

        const result = await coordinator.shutdown();

        expect(order).toEqual(['first', 'middle', 'last']);
        expect(result.phase).toBe('completed');
        expect(result.handlers).toHaveLength(3);
        expect(result.handlers.every((h) => h.status === 'ok')).toBe(true);
    });

    test('handles async handlers', async () => {
        const coordinator = new ShutdownCoordinator();
        let asyncDone = false;

        coordinator.register({
            name: 'async-handler',
            priority: 0,
            handler: async () => {
                await delay(50);
                asyncDone = true;
            },
        });

        await coordinator.shutdown();
        expect(asyncDone).toBe(true);
    });

    test('isolates errors — one failing handler does not block others', async () => {
        const coordinator = new ShutdownCoordinator();
        let secondRan = false;

        coordinator.register({
            name: 'failing',
            priority: 0,
            handler: () => { throw new Error('boom'); },
        });
        coordinator.register({
            name: 'succeeding',
            priority: 10,
            handler: () => { secondRan = true; },
        });

        const result = await coordinator.shutdown();

        expect(secondRan).toBe(true);
        expect(result.handlers[0].status).toBe('error');
        expect(result.handlers[0].error).toBe('boom');
        expect(result.handlers[1].status).toBe('ok');
    });

    test('times out slow async handlers', async () => {
        const coordinator = new ShutdownCoordinator();

        coordinator.register({
            name: 'slow',
            priority: 0,
            handler: () => delay(10_000), // 10s — way over timeout
            timeoutMs: 100,
        });
        coordinator.register({
            name: 'fast',
            priority: 10,
            handler: () => {},
        });

        const result = await coordinator.shutdown();

        expect(result.handlers[0].name).toBe('slow');
        expect(result.handlers[0].status).toBe('timeout');
        expect(result.handlers[1].status).toBe('ok');
        // Phase should be 'forced' since a timeout occurred
        expect(result.phase).toBe('forced');
    });

    test('idempotent — second call returns same result', async () => {
        const coordinator = new ShutdownCoordinator();
        let callCount = 0;

        coordinator.register({
            name: 'counter',
            priority: 0,
            handler: () => { callCount++; },
        });

        const result1 = await coordinator.shutdown();
        const result2 = await coordinator.shutdown();

        expect(callCount).toBe(1);
        expect(result1).toBe(result2);
    });

    test('rejects handler registration after shutdown starts', async () => {
        const coordinator = new ShutdownCoordinator();
        coordinator.register({ name: 'initial', priority: 0, handler: () => {} });

        await coordinator.shutdown();

        // This should be silently ignored (logged as warning)
        coordinator.register({ name: 'late', priority: 0, handler: () => {} });

        const status = coordinator.getStatus();
        expect(status.handlerCount).toBe(1); // only 'initial'
    });

    test('registerService convenience method works', async () => {
        const coordinator = new ShutdownCoordinator();
        let stopped = false;

        const service = { stop: () => { stopped = true; } };
        coordinator.registerService('TestService', service, 5);

        await coordinator.shutdown();
        expect(stopped).toBe(true);
    });

    test('registerService with async stop()', async () => {
        const coordinator = new ShutdownCoordinator();
        let stopped = false;

        const service = {
            stop: async () => {
                await delay(10);
                stopped = true;
            },
        };
        coordinator.registerService('AsyncService', service, 5);

        await coordinator.shutdown();
        expect(stopped).toBe(true);
    });

    test('grace period caps total shutdown time', async () => {
        const coordinator = new ShutdownCoordinator(200); // 200ms grace period

        // Register multiple slow handlers that would total well over 200ms
        for (let i = 0; i < 5; i++) {
            coordinator.register({
                name: `slow-${i}`,
                priority: i,
                handler: () => delay(500),
                timeoutMs: 500,
            });
        }

        const start = Date.now();
        const result = await coordinator.shutdown();
        const elapsed = Date.now() - start;

        // Should complete within grace period + tolerance (not 5 * 500ms = 2500ms)
        expect(elapsed).toBeLessThan(500);
        // Some handlers should be marked as timeout due to grace period exhaustion
        const timeouts = result.handlers.filter((h) => h.status === 'timeout');
        expect(timeouts.length).toBeGreaterThan(0);
    });

    test('getStatus returns correct state', async () => {
        const coordinator = new ShutdownCoordinator();
        coordinator.register({ name: 'a', priority: 0, handler: () => {} });
        coordinator.register({ name: 'b', priority: 10, handler: () => {} });

        let status = coordinator.getStatus();
        expect(status.phase).toBe('idle');
        expect(status.handlerCount).toBe(2);
        expect(status.result).toBeNull();

        await coordinator.shutdown();

        status = coordinator.getStatus();
        expect(status.phase).toBe('completed');
        expect(status.result).not.toBeNull();
        expect(status.result!.handlers).toHaveLength(2);
    });

    test('handler results include timing info', async () => {
        const coordinator = new ShutdownCoordinator();

        coordinator.register({
            name: 'timed',
            priority: 0,
            handler: async () => { await delay(20); },
        });

        const result = await coordinator.shutdown();

        expect(result.durationMs).toBeGreaterThanOrEqual(15);
        expect(result.handlers[0].durationMs).toBeGreaterThanOrEqual(15);
    });

    test('handles mix of sync and async handlers', async () => {
        const coordinator = new ShutdownCoordinator();
        const order: string[] = [];

        coordinator.register({ name: 'sync-1', priority: 0, handler: () => { order.push('sync-1'); } });
        coordinator.register({
            name: 'async-1',
            priority: 5,
            handler: async () => { await delay(10); order.push('async-1'); },
        });
        coordinator.register({ name: 'sync-2', priority: 10, handler: () => { order.push('sync-2'); } });

        const result = await coordinator.shutdown();

        expect(order).toEqual(['sync-1', 'async-1', 'sync-2']);
        expect(result.handlers.every((h) => h.status === 'ok')).toBe(true);
    });

    test('empty coordinator shuts down cleanly', async () => {
        const coordinator = new ShutdownCoordinator();
        const result = await coordinator.shutdown();

        expect(result.phase).toBe('completed');
        expect(result.handlers).toHaveLength(0);
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    test('handlers at same priority execute in registration order', async () => {
        const coordinator = new ShutdownCoordinator();
        const order: string[] = [];

        coordinator.register({ name: 'a', priority: 10, handler: () => { order.push('a'); } });
        coordinator.register({ name: 'b', priority: 10, handler: () => { order.push('b'); } });
        coordinator.register({ name: 'c', priority: 10, handler: () => { order.push('c'); } });

        await coordinator.shutdown();

        expect(order).toEqual(['a', 'b', 'c']);
    });
});

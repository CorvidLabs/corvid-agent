import { describe, it, expect } from 'bun:test';
import { HEARTBEAT_INTERVAL_MS, IDLE_TIMEOUT_MS } from '../lib/session-heartbeat';

describe('session-heartbeat constants', () => {
    it('exports HEARTBEAT_INTERVAL_MS as 30 seconds', () => {
        expect(HEARTBEAT_INTERVAL_MS).toBe(30_000);
    });

    it('exports IDLE_TIMEOUT_MS as 10 minutes', () => {
        expect(IDLE_TIMEOUT_MS).toBe(10 * 60 * 1000);
    });

    it('IDLE_TIMEOUT_MS is greater than HEARTBEAT_INTERVAL_MS', () => {
        expect(IDLE_TIMEOUT_MS).toBeGreaterThan(HEARTBEAT_INTERVAL_MS);
    });

    it('HEARTBEAT_INTERVAL_MS is a positive integer', () => {
        expect(HEARTBEAT_INTERVAL_MS).toBeGreaterThan(0);
        expect(Number.isInteger(HEARTBEAT_INTERVAL_MS)).toBe(true);
    });

    it('IDLE_TIMEOUT_MS is a positive integer', () => {
        expect(IDLE_TIMEOUT_MS).toBeGreaterThan(0);
        expect(Number.isInteger(IDLE_TIMEOUT_MS)).toBe(true);
    });
});

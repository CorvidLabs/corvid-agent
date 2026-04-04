import { test, expect, describe } from 'bun:test';
import {
    HEARTBEAT_INTERVAL_MS,
    IDLE_TIMEOUT_MS,
} from '../lib/session-heartbeat';

describe('session-heartbeat constants', () => {
    test('HEARTBEAT_INTERVAL_MS is 30 seconds', () => {
        expect(HEARTBEAT_INTERVAL_MS).toBe(30_000);
    });

    test('IDLE_TIMEOUT_MS is 10 minutes', () => {
        expect(IDLE_TIMEOUT_MS).toBe(10 * 60 * 1000);
    });

    test('HEARTBEAT_INTERVAL_MS is a positive number', () => {
        expect(typeof HEARTBEAT_INTERVAL_MS).toBe('number');
        expect(HEARTBEAT_INTERVAL_MS).toBeGreaterThan(0);
    });

    test('IDLE_TIMEOUT_MS is greater than HEARTBEAT_INTERVAL_MS', () => {
        expect(IDLE_TIMEOUT_MS).toBeGreaterThan(HEARTBEAT_INTERVAL_MS);
    });
});

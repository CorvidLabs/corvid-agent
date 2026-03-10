/**
 * Tests for the on-chain FlockDirectory client and deploy helpers.
 *
 * These tests verify:
 * - ABI method loading from ARC56 spec
 * - App ID persistence (config table read/write)
 * - OnChainFlockClient construction and method resolution
 * - Type exports and tier constants
 */
import { test, expect, describe, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import {
    OnChainFlockClient,
    TIER_REGISTERED,
    TIER_TESTED,
    TIER_ESTABLISHED,
    TIER_TRUSTED,
    TIER_NAMES,
} from '../flock-directory/on-chain-client';
import { getPersistedAppId, setPersistedAppId } from '../flock-directory/deploy';

// ─── DB Setup ────────────────────────────────────────────────────────────────

let db: Database;

beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
});

// ─── Tier Constants ──────────────────────────────────────────────────────────

describe('tier constants', () => {
    test('tier values are correct', () => {
        expect(TIER_REGISTERED).toBe(1);
        expect(TIER_TESTED).toBe(2);
        expect(TIER_ESTABLISHED).toBe(3);
        expect(TIER_TRUSTED).toBe(4);
    });

    test('tier names map correctly', () => {
        expect(TIER_NAMES[TIER_REGISTERED]).toBe('Registered');
        expect(TIER_NAMES[TIER_TESTED]).toBe('Tested');
        expect(TIER_NAMES[TIER_ESTABLISHED]).toBe('Established');
        expect(TIER_NAMES[TIER_TRUSTED]).toBe('Trusted');
    });
});

// ─── App ID Persistence ─────────────────────────────────────────────────────

describe('app ID persistence', () => {
    test('returns 0 when no app ID is persisted', () => {
        expect(getPersistedAppId(db)).toBe(0);
    });

    test('persists and retrieves app ID', () => {
        setPersistedAppId(db, 12345);
        expect(getPersistedAppId(db)).toBe(12345);
    });

    test('overwrites previous app ID', () => {
        setPersistedAppId(db, 100);
        setPersistedAppId(db, 200);
        expect(getPersistedAppId(db)).toBe(200);
    });

    test('handles zero app ID', () => {
        setPersistedAppId(db, 0);
        expect(getPersistedAppId(db)).toBe(0);
    });
});

// ─── Client Construction ─────────────────────────────────────────────────────

describe('OnChainFlockClient', () => {
    test('constructs with config', () => {
        // Use a mock algod client (just need the type to construct)
        const mockAlgod = {} as import('algosdk').default.Algodv2;
        const client = new OnChainFlockClient({
            appId: 42,
            algodClient: mockAlgod,
        });
        expect(client.getAppId()).toBe(42);
    });

    test('constructs with custom wait rounds', () => {
        const mockAlgod = {} as import('algosdk').default.Algodv2;
        const client = new OnChainFlockClient({
            appId: 99,
            algodClient: mockAlgod,
            waitRounds: 10,
        });
        expect(client.getAppId()).toBe(99);
    });
});

// ─── ARC56 Spec ──────────────────────────────────────────────────────────────

describe('ARC56 spec', () => {
    test('ARC56 JSON is loadable and has expected methods', async () => {
        const spec = await import('../flock-directory/contract/FlockDirectory.arc56.json');
        expect(spec.name).toBe('FlockDirectory');
        expect(spec.methods).toBeArray();

        const methodNames = spec.methods.map((m: { name: string }) => m.name);
        expect(methodNames).toContain('registerAgent');
        expect(methodNames).toContain('updateAgent');
        expect(methodNames).toContain('heartbeat');
        expect(methodNames).toContain('deregister');
        expect(methodNames).toContain('createChallenge');
        expect(methodNames).toContain('recordTestResult');
        expect(methodNames).toContain('getAgentInfo');
        expect(methodNames).toContain('getAgentTier');
        expect(methodNames).toContain('getAgentScore');
        expect(methodNames).toContain('createApplication');
    });

    test('registerAgent method requires payment arg', async () => {
        const spec = await import('../flock-directory/contract/FlockDirectory.arc56.json');
        const registerMethod = spec.methods.find((m: { name: string }) => m.name === 'registerAgent');
        expect(registerMethod).toBeTruthy();

        const payArg = registerMethod!.args.find((a: { name: string; type: string }) => a.type === 'pay');
        expect(payArg).toBeTruthy();
        expect(payArg!.name).toBe('payment');
    });

    test('getAgentInfo returns AgentRecord struct', async () => {
        const spec = await import('../flock-directory/contract/FlockDirectory.arc56.json');
        const method = spec.methods.find((m: { name: string }) => m.name === 'getAgentInfo');
        expect(method).toBeTruthy();
        expect(method!.returns.type).toBe('(string,string,string,uint64,uint64,uint64,uint64,uint64,uint64,uint64)');
    });

    test('structs are defined', async () => {
        const spec = await import('../flock-directory/contract/FlockDirectory.arc56.json');
        expect(spec.structs).toBeTruthy();
        expect(spec.structs.AgentRecord).toBeArray();
        expect(spec.structs.AgentRecord.length).toBe(10);
        expect(spec.structs.Challenge).toBeArray();
        expect(spec.structs.TestResult).toBeArray();
    });
});

// ─── Migration ───────────────────────────────────────────────────────────────

describe('migration 079', () => {
    test('flock_directory_config table exists after migration', () => {
        const tables = db.query(
            `SELECT name FROM sqlite_master WHERE type='table' AND name='flock_directory_config'`,
        ).all();
        expect(tables.length).toBe(1);
    });

    test('flock_directory_config table has correct columns', () => {
        const info = db.query(`PRAGMA table_info(flock_directory_config)`).all() as {
            name: string;
            type: string;
        }[];
        const columnNames = info.map((c) => c.name);
        expect(columnNames).toContain('key');
        expect(columnNames).toContain('value');
        expect(columnNames).toContain('updated_at');
    });
});

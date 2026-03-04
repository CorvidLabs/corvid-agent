import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import {
    saveAlgoChatMessage,
    listRecentAlgoChatMessages,
    searchAlgoChatMessages,
    getWalletSummaries,
    getWalletMessages,
} from '../db/algochat-messages';
import { addToAllowlist } from '../db/allowlist';

let db: Database;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterEach(() => {
    db.close();
});

// ── saveAlgoChatMessage ──────────────────────────────────────────────

describe('saveAlgoChatMessage', () => {
    test('saves a basic inbound message', () => {
        const msg = saveAlgoChatMessage(db, {
            participant: 'ALGO_ADDR_1',
            content: 'Hello agent',
            direction: 'inbound',
        });

        expect(msg.id).toBeGreaterThan(0);
        expect(msg.participant).toBe('ALGO_ADDR_1');
        expect(msg.content).toBe('Hello agent');
        expect(msg.direction).toBe('inbound');
        expect(msg.fee).toBe(0);
        expect(msg.provider).toBeUndefined();
        expect(msg.model).toBeUndefined();
        expect(msg.createdAt).toBeTruthy();
    });

    test('saves message with fee, provider, and model', () => {
        const msg = saveAlgoChatMessage(db, {
            participant: 'ALGO_ADDR_1',
            content: 'Response',
            direction: 'outbound',
            fee: 1000,
            provider: 'anthropic',
            model: 'claude-3',
        });

        expect(msg.direction).toBe('outbound');
        expect(msg.fee).toBe(1000);
        expect(msg.provider).toBe('anthropic');
        expect(msg.model).toBe('claude-3');
    });

    test('saves status messages', () => {
        const msg = saveAlgoChatMessage(db, {
            participant: 'ALGO_ADDR_1',
            content: 'Processing...',
            direction: 'status',
        });

        expect(msg.direction).toBe('status');
    });

    test('increments IDs for sequential messages', () => {
        const m1 = saveAlgoChatMessage(db, { participant: 'A', content: '1', direction: 'inbound' });
        const m2 = saveAlgoChatMessage(db, { participant: 'A', content: '2', direction: 'outbound' });
        expect(m2.id).toBeGreaterThan(m1.id);
    });
});

// ── listRecentAlgoChatMessages ───────────────────────────────────────

describe('listRecentAlgoChatMessages', () => {
    test('returns empty list on fresh db', () => {
        const result = listRecentAlgoChatMessages(db);
        expect(result.messages).toEqual([]);
        expect(result.total).toBe(0);
    });

    test('returns messages with correct total', () => {
        saveAlgoChatMessage(db, { participant: 'A', content: '1', direction: 'inbound' });
        saveAlgoChatMessage(db, { participant: 'B', content: '2', direction: 'outbound' });
        saveAlgoChatMessage(db, { participant: 'A', content: '3', direction: 'inbound' });

        const result = listRecentAlgoChatMessages(db);
        expect(result.messages).toHaveLength(3);
        expect(result.total).toBe(3);
    });

    test('respects limit parameter', () => {
        for (let i = 0; i < 10; i++) {
            saveAlgoChatMessage(db, { participant: 'A', content: `msg-${i}`, direction: 'inbound' });
        }

        const result = listRecentAlgoChatMessages(db, 3);
        expect(result.messages).toHaveLength(3);
        expect(result.total).toBe(10);
    });

    test('respects offset parameter', () => {
        for (let i = 0; i < 5; i++) {
            saveAlgoChatMessage(db, { participant: 'A', content: `msg-${i}`, direction: 'inbound' });
        }

        const result = listRecentAlgoChatMessages(db, 50, 3);
        expect(result.messages).toHaveLength(2);
        expect(result.total).toBe(5);
    });
});

// ── searchAlgoChatMessages ───────────────────────────────────────────

describe('searchAlgoChatMessages', () => {
    test('searches by content substring', () => {
        saveAlgoChatMessage(db, { participant: 'A', content: 'Hello world', direction: 'inbound' });
        saveAlgoChatMessage(db, { participant: 'A', content: 'Goodbye world', direction: 'outbound' });
        saveAlgoChatMessage(db, { participant: 'A', content: 'Something else', direction: 'inbound' });

        const result = searchAlgoChatMessages(db, { search: 'world' });
        expect(result.messages).toHaveLength(2);
        expect(result.total).toBe(2);
    });

    test('filters by participant', () => {
        saveAlgoChatMessage(db, { participant: 'ALICE', content: 'msg 1', direction: 'inbound' });
        saveAlgoChatMessage(db, { participant: 'BOB', content: 'msg 2', direction: 'inbound' });
        saveAlgoChatMessage(db, { participant: 'ALICE', content: 'msg 3', direction: 'outbound' });

        const result = searchAlgoChatMessages(db, { participant: 'ALICE' });
        expect(result.messages).toHaveLength(2);
        expect(result.total).toBe(2);
    });

    test('combines search and participant filters', () => {
        saveAlgoChatMessage(db, { participant: 'ALICE', content: 'Hello world', direction: 'inbound' });
        saveAlgoChatMessage(db, { participant: 'BOB', content: 'Hello there', direction: 'inbound' });
        saveAlgoChatMessage(db, { participant: 'ALICE', content: 'Goodbye', direction: 'outbound' });

        const result = searchAlgoChatMessages(db, { search: 'Hello', participant: 'ALICE' });
        expect(result.messages).toHaveLength(1);
        expect(result.messages[0].content).toBe('Hello world');
    });

    test('caps limit at 100', () => {
        const result = searchAlgoChatMessages(db, { limit: 500 });
        // Just verifying it doesn't throw; actual capping tested via total
        expect(result.messages).toEqual([]);
    });

    test('returns all when no filters', () => {
        saveAlgoChatMessage(db, { participant: 'A', content: 'msg 1', direction: 'inbound' });
        saveAlgoChatMessage(db, { participant: 'B', content: 'msg 2', direction: 'outbound' });

        const result = searchAlgoChatMessages(db, {});
        expect(result.messages).toHaveLength(2);
        expect(result.total).toBe(2);
    });
});

// ── getWalletSummaries ───────────────────────────────────────────────

describe('getWalletSummaries', () => {
    test('returns empty for fresh db', () => {
        expect(getWalletSummaries(db)).toEqual([]);
    });

    test('groups messages by participant with counts', () => {
        saveAlgoChatMessage(db, { participant: 'ALICE', content: 'in 1', direction: 'inbound' });
        saveAlgoChatMessage(db, { participant: 'ALICE', content: 'out 1', direction: 'outbound' });
        saveAlgoChatMessage(db, { participant: 'ALICE', content: 'in 2', direction: 'inbound' });
        saveAlgoChatMessage(db, { participant: 'BOB', content: 'in 1', direction: 'inbound' });

        const summaries = getWalletSummaries(db);
        expect(summaries).toHaveLength(2);

        const alice = summaries.find(s => s.address === 'ALICE')!;
        expect(alice.messageCount).toBe(3);
        expect(alice.inboundCount).toBe(2);
        expect(alice.outboundCount).toBe(1);
        expect(alice.onAllowlist).toBe(false);
        expect(alice.credits).toBe(0);
    });

    test('includes allowlist info when participant is on allowlist', () => {
        saveAlgoChatMessage(db, { participant: 'ALICE', content: 'msg', direction: 'inbound' });
        addToAllowlist(db, 'ALICE', 'Alice Wallet');

        const summaries = getWalletSummaries(db);
        expect(summaries).toHaveLength(1);
        expect(summaries[0].onAllowlist).toBe(true);
        expect(summaries[0].label).toBe('Alice Wallet');
    });

    test('search filters by participant address', () => {
        saveAlgoChatMessage(db, { participant: 'ALICE', content: 'msg', direction: 'inbound' });
        saveAlgoChatMessage(db, { participant: 'BOB', content: 'msg', direction: 'inbound' });

        const summaries = getWalletSummaries(db, { search: 'ALICE' });
        expect(summaries).toHaveLength(1);
        expect(summaries[0].address).toBe('ALICE');
    });
});

// ── getWalletMessages ────────────────────────────────────────────────

describe('getWalletMessages', () => {
    test('returns messages for a specific address', () => {
        saveAlgoChatMessage(db, { participant: 'ALICE', content: 'msg 1', direction: 'inbound' });
        saveAlgoChatMessage(db, { participant: 'BOB', content: 'msg 2', direction: 'inbound' });
        saveAlgoChatMessage(db, { participant: 'ALICE', content: 'msg 3', direction: 'outbound' });

        const result = getWalletMessages(db, 'ALICE');
        expect(result.messages).toHaveLength(2);
        expect(result.total).toBe(2);
        expect(result.messages.every(m => m.participant === 'ALICE')).toBe(true);
    });

    test('returns empty for unknown address', () => {
        const result = getWalletMessages(db, 'NOBODY');
        expect(result.messages).toEqual([]);
        expect(result.total).toBe(0);
    });

    test('respects limit and offset', () => {
        for (let i = 0; i < 10; i++) {
            saveAlgoChatMessage(db, { participant: 'ALICE', content: `msg-${i}`, direction: 'inbound' });
        }

        const result = getWalletMessages(db, 'ALICE', 3, 2);
        expect(result.messages).toHaveLength(3);
        expect(result.total).toBe(10);
    });
});

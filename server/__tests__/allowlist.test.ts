import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import {
    listAllowlist,
    getAllowlistEntry,
    addToAllowlist,
    updateAllowlistEntry,
    removeFromAllowlist,
    isAllowed,
} from '../db/allowlist';

let db: Database;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterEach(() => {
    db.close();
});

// ── CRUD ─────────────────────────────────────────────────────────────

describe('allowlist CRUD', () => {
    test('addToAllowlist creates entry', () => {
        const entry = addToAllowlist(db, 'ALGO_ADDR_1', 'My Wallet');
        expect(entry.address).toBe('ALGO_ADDR_1');
        expect(entry.label).toBe('My Wallet');
    });

    test('addToAllowlist with default label', () => {
        const entry = addToAllowlist(db, 'ALGO_ADDR_1');
        expect(entry.label).toBe('');
    });

    test('addToAllowlist upserts on conflict', () => {
        addToAllowlist(db, 'ALGO_ADDR_1', 'Original');
        const updated = addToAllowlist(db, 'ALGO_ADDR_1', 'Updated');
        expect(updated.label).toBe('Updated');
        expect(listAllowlist(db)).toHaveLength(1);
    });

    test('getAllowlistEntry returns entry', () => {
        addToAllowlist(db, 'ALGO_ADDR_1', 'Label');
        const entry = getAllowlistEntry(db, 'ALGO_ADDR_1');
        expect(entry).not.toBeNull();
        expect(entry!.address).toBe('ALGO_ADDR_1');
    });

    test('getAllowlistEntry returns null for unknown', () => {
        expect(getAllowlistEntry(db, 'UNKNOWN')).toBeNull();
    });

    test('listAllowlist returns all entries', () => {
        addToAllowlist(db, 'ADDR_1', 'A');
        addToAllowlist(db, 'ADDR_2', 'B');
        expect(listAllowlist(db)).toHaveLength(2);
    });

    test('updateAllowlistEntry updates label', () => {
        addToAllowlist(db, 'ADDR_1', 'Old');
        const updated = updateAllowlistEntry(db, 'ADDR_1', 'New');
        expect(updated).not.toBeNull();
        expect(updated!.label).toBe('New');
    });

    test('updateAllowlistEntry returns null for unknown', () => {
        expect(updateAllowlistEntry(db, 'UNKNOWN', 'Label')).toBeNull();
    });

    test('removeFromAllowlist removes entry', () => {
        addToAllowlist(db, 'ADDR_1');
        expect(removeFromAllowlist(db, 'ADDR_1')).toBe(true);
        expect(getAllowlistEntry(db, 'ADDR_1')).toBeNull();
    });

    test('removeFromAllowlist returns false for unknown', () => {
        expect(removeFromAllowlist(db, 'UNKNOWN')).toBe(false);
    });
});

// ── isAllowed ────────────────────────────────────────────────────────

describe('isAllowed', () => {
    test('returns true when allowlist is empty (open mode)', () => {
        expect(isAllowed(db, 'ANY_ADDRESS')).toBe(true);
    });

    test('returns true for allowlisted address', () => {
        addToAllowlist(db, 'ALLOWED_ADDR');
        expect(isAllowed(db, 'ALLOWED_ADDR')).toBe(true);
    });

    test('returns false for non-allowlisted address when list is not empty', () => {
        addToAllowlist(db, 'ALLOWED_ADDR');
        expect(isAllowed(db, 'OTHER_ADDR')).toBe(false);
    });
});

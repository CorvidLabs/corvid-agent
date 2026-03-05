import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import {
    listRepoBlocklist,
    addToRepoBlocklist,
    getRepoBlocklistEntry,
    removeFromRepoBlocklist,
    isRepoBlocked,
} from '../db/repo-blocklist';

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

describe('Repo Blocklist CRUD', () => {
    test('listRepoBlocklist returns empty array on fresh db', () => {
        expect(listRepoBlocklist(db)).toEqual([]);
    });

    test('addToRepoBlocklist creates entry with lowercase repo', () => {
        const entry = addToRepoBlocklist(db, 'Owner/Repo', { reason: 'test', source: 'manual' });
        expect(entry.repo).toBe('owner/repo');
        expect(entry.reason).toBe('test');
        expect(entry.source).toBe('manual');
        expect(entry.createdAt).toBeTruthy();
    });

    test('addToRepoBlocklist upserts on conflict', () => {
        addToRepoBlocklist(db, 'owner/repo', { reason: 'first' });
        const updated = addToRepoBlocklist(db, 'owner/repo', { reason: 'updated', source: 'pr_rejection' });
        expect(updated.reason).toBe('updated');
        expect(updated.source).toBe('pr_rejection');
        expect(listRepoBlocklist(db)).toHaveLength(1);
    });

    test('addToRepoBlocklist defaults to manual source', () => {
        const entry = addToRepoBlocklist(db, 'owner/repo');
        expect(entry.source).toBe('manual');
        expect(entry.reason).toBe('');
    });

    test('getRepoBlocklistEntry returns null for missing repo', () => {
        expect(getRepoBlocklistEntry(db, 'owner/missing')).toBeNull();
    });

    test('getRepoBlocklistEntry is case-insensitive', () => {
        addToRepoBlocklist(db, 'Owner/Repo');
        expect(getRepoBlocklistEntry(db, 'owner/repo')).not.toBeNull();
        expect(getRepoBlocklistEntry(db, 'OWNER/REPO')).not.toBeNull();
    });

    test('removeFromRepoBlocklist deletes entry', () => {
        addToRepoBlocklist(db, 'owner/repo');
        expect(removeFromRepoBlocklist(db, 'owner/repo')).toBe(true);
        expect(getRepoBlocklistEntry(db, 'owner/repo')).toBeNull();
    });

    test('removeFromRepoBlocklist returns false for missing repo', () => {
        expect(removeFromRepoBlocklist(db, 'owner/missing')).toBe(false);
    });

    test('listRepoBlocklist returns all entries ordered by created_at desc', () => {
        addToRepoBlocklist(db, 'a/one');
        addToRepoBlocklist(db, 'b/two');
        addToRepoBlocklist(db, 'c/three');
        const list = listRepoBlocklist(db);
        expect(list).toHaveLength(3);
    });

    test('addToRepoBlocklist stores prUrl', () => {
        const entry = addToRepoBlocklist(db, 'owner/repo', {
            prUrl: 'https://github.com/owner/repo/pull/1',
        });
        expect(entry.prUrl).toBe('https://github.com/owner/repo/pull/1');
    });
});

// ── isRepoBlocked ──────────────────────────────────────────────────

describe('isRepoBlocked', () => {
    test('returns false when blocklist is empty', () => {
        expect(isRepoBlocked(db, 'owner/repo')).toBe(false);
    });

    test('returns true for exact match', () => {
        addToRepoBlocklist(db, 'owner/repo');
        expect(isRepoBlocked(db, 'owner/repo')).toBe(true);
    });

    test('is case-insensitive', () => {
        addToRepoBlocklist(db, 'Owner/Repo');
        expect(isRepoBlocked(db, 'owner/repo')).toBe(true);
        expect(isRepoBlocked(db, 'OWNER/REPO')).toBe(true);
    });

    test('returns true for org wildcard match', () => {
        addToRepoBlocklist(db, 'vapor/*');
        expect(isRepoBlocked(db, 'vapor/vapor')).toBe(true);
        expect(isRepoBlocked(db, 'vapor/fluent')).toBe(true);
    });

    test('org wildcard does not match different orgs', () => {
        addToRepoBlocklist(db, 'vapor/*');
        expect(isRepoBlocked(db, 'apple/swift')).toBe(false);
    });

    test('returns false for non-blocked repo', () => {
        addToRepoBlocklist(db, 'blocked/repo');
        expect(isRepoBlocked(db, 'other/repo')).toBe(false);
    });

    test('supports tenant isolation', () => {
        addToRepoBlocklist(db, 'owner/repo', { tenantId: 'tenant-a' });
        expect(isRepoBlocked(db, 'owner/repo', 'tenant-a')).toBe(true);
        expect(isRepoBlocked(db, 'owner/repo', 'tenant-b')).toBe(false);
        expect(isRepoBlocked(db, 'owner/repo')).toBe(false); // default tenant
    });
});

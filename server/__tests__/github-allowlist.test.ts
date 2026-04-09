import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  addToGitHubAllowlist,
  getGitHubAllowlistEntry,
  isGitHubUserAllowed,
  listGitHubAllowlist,
  removeFromGitHubAllowlist,
  updateGitHubAllowlistEntry,
} from '../db/github-allowlist';
import { runMigrations } from '../db/schema';

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

describe('GitHub Allowlist CRUD', () => {
  test('listGitHubAllowlist returns empty array on fresh db', () => {
    expect(listGitHubAllowlist(db)).toEqual([]);
  });

  test('addToGitHubAllowlist creates entry with lowercase username', () => {
    const entry = addToGitHubAllowlist(db, 'TestUser', 'Test label');
    expect(entry.username).toBe('testuser');
    expect(entry.label).toBe('Test label');
    expect(entry.createdAt).toBeTruthy();
  });

  test('addToGitHubAllowlist upserts label on conflict', () => {
    addToGitHubAllowlist(db, 'alice', 'Original');
    const updated = addToGitHubAllowlist(db, 'alice', 'Updated');
    expect(updated.label).toBe('Updated');
    expect(listGitHubAllowlist(db)).toHaveLength(1);
  });

  test('addToGitHubAllowlist defaults label to empty string', () => {
    const entry = addToGitHubAllowlist(db, 'bob');
    expect(entry.label).toBe('');
  });

  test('getGitHubAllowlistEntry returns null for missing user', () => {
    expect(getGitHubAllowlistEntry(db, 'nobody')).toBeNull();
  });

  test('getGitHubAllowlistEntry is case-insensitive', () => {
    addToGitHubAllowlist(db, 'CaseSensitive', 'label');
    expect(getGitHubAllowlistEntry(db, 'casesensitive')).not.toBeNull();
    expect(getGitHubAllowlistEntry(db, 'CASESENSITIVE')).not.toBeNull();
  });

  test('updateGitHubAllowlistEntry updates label', () => {
    addToGitHubAllowlist(db, 'alice', 'Old');
    const result = updateGitHubAllowlistEntry(db, 'alice', 'New');
    expect(result?.label).toBe('New');
  });

  test('updateGitHubAllowlistEntry returns null for missing user', () => {
    expect(updateGitHubAllowlistEntry(db, 'nobody', 'label')).toBeNull();
  });

  test('removeFromGitHubAllowlist deletes entry', () => {
    addToGitHubAllowlist(db, 'alice', 'label');
    expect(removeFromGitHubAllowlist(db, 'alice')).toBe(true);
    expect(getGitHubAllowlistEntry(db, 'alice')).toBeNull();
  });

  test('removeFromGitHubAllowlist returns false for missing user', () => {
    expect(removeFromGitHubAllowlist(db, 'nobody')).toBe(false);
  });

  test('listGitHubAllowlist returns all entries', () => {
    addToGitHubAllowlist(db, 'first', 'a');
    addToGitHubAllowlist(db, 'second', 'b');
    addToGitHubAllowlist(db, 'third', 'c');
    const list = listGitHubAllowlist(db);
    expect(list).toHaveLength(3);
    const usernames = list.map((e) => e.username).sort();
    expect(usernames).toEqual(['first', 'second', 'third']);
  });
});

// ── isGitHubUserAllowed ──────────────────────────────────────────────

describe('isGitHubUserAllowed', () => {
  test('allows listed users', () => {
    addToGitHubAllowlist(db, 'alice');
    expect(isGitHubUserAllowed(db, 'alice')).toBe(true);
  });

  test('denies unlisted users when allowlist has entries', () => {
    addToGitHubAllowlist(db, 'alice');
    expect(isGitHubUserAllowed(db, 'bob')).toBe(false);
  });

  test('is case-insensitive for username check', () => {
    addToGitHubAllowlist(db, 'alice');
    expect(isGitHubUserAllowed(db, 'Alice')).toBe(true);
    expect(isGitHubUserAllowed(db, 'ALICE')).toBe(true);
  });

  test('denies all when allowlist is empty (default secure mode)', () => {
    const original = process.env.GITHUB_ALLOWLIST_OPEN_MODE;
    delete process.env.GITHUB_ALLOWLIST_OPEN_MODE;
    try {
      expect(isGitHubUserAllowed(db, 'anyone')).toBe(false);
    } finally {
      if (original !== undefined) process.env.GITHUB_ALLOWLIST_OPEN_MODE = original;
    }
  });

  test('allows all when empty and GITHUB_ALLOWLIST_OPEN_MODE=true', () => {
    const original = process.env.GITHUB_ALLOWLIST_OPEN_MODE;
    process.env.GITHUB_ALLOWLIST_OPEN_MODE = 'true';
    try {
      expect(isGitHubUserAllowed(db, 'anyone')).toBe(true);
    } finally {
      if (original !== undefined) {
        process.env.GITHUB_ALLOWLIST_OPEN_MODE = original;
      } else {
        delete process.env.GITHUB_ALLOWLIST_OPEN_MODE;
      }
    }
  });
});

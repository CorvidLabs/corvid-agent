/**
 * Tests for agent blocklist — CRUD operations and the kill switch.
 *
 * Validates add, remove, list, isBlocked, and upsert behavior.
 */

import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, test } from 'bun:test';
import {
  addToAgentBlocklist,
  getAgentBlocklistEntry,
  isAgentBlocked,
  listAgentBlocklist,
  removeFromAgentBlocklist,
} from '../db/agent-blocklist';
import { runMigrations } from '../db/schema';

let db: Database;

beforeEach(() => {
  db = new Database(':memory:');
  runMigrations(db);
});

describe('isAgentBlocked', () => {
  test('returns false for non-blocked agent', () => {
    expect(isAgentBlocked(db, 'agent-clean')).toBe(false);
  });

  test('returns true after adding to blocklist', () => {
    addToAgentBlocklist(db, 'agent-bad');
    expect(isAgentBlocked(db, 'agent-bad')).toBe(true);
  });

  test('returns false after removing from blocklist', () => {
    addToAgentBlocklist(db, 'agent-temp');
    removeFromAgentBlocklist(db, 'agent-temp');
    expect(isAgentBlocked(db, 'agent-temp')).toBe(false);
  });
});

describe('addToAgentBlocklist', () => {
  test('uses default reason and blockedBy when not specified', () => {
    const entry = addToAgentBlocklist(db, 'agent-1');
    expect(entry.agentId).toBe('agent-1');
    expect(entry.reason).toBe('manual');
    expect(entry.blockedBy).toBe('system');
    expect(entry.detail).toBe('');
    expect(entry.createdAt).toBeTruthy();
  });

  test('stores custom reason and detail', () => {
    const entry = addToAgentBlocklist(db, 'agent-2', {
      reason: 'security_violation',
      detail: 'Attempted unauthorized API access',
      blockedBy: 'kill-switch',
    });
    expect(entry.reason).toBe('security_violation');
    expect(entry.detail).toBe('Attempted unauthorized API access');
    expect(entry.blockedBy).toBe('kill-switch');
  });

  test('upserts on conflict — updates reason and detail', () => {
    addToAgentBlocklist(db, 'agent-3', { reason: 'manual', detail: 'first block' });
    const updated = addToAgentBlocklist(db, 'agent-3', {
      reason: 'behavioral_drift',
      detail: 'second block reason',
      blockedBy: 'monitor',
    });
    expect(updated.reason).toBe('behavioral_drift');
    expect(updated.detail).toBe('second block reason');
    expect(updated.blockedBy).toBe('monitor');

    // Should still be only one entry
    const list = listAgentBlocklist(db);
    const matches = list.filter((e) => e.agentId === 'agent-3');
    expect(matches).toHaveLength(1);
  });
});

describe('getAgentBlocklistEntry', () => {
  test('returns null for non-blocked agent', () => {
    expect(getAgentBlocklistEntry(db, 'unknown')).toBeNull();
  });

  test('returns full entry for blocked agent', () => {
    addToAgentBlocklist(db, 'agent-4', {
      reason: 'reputation_farming',
      detail: 'Spamming reviews',
    });
    const entry = getAgentBlocklistEntry(db, 'agent-4');
    expect(entry).not.toBeNull();
    expect(entry!.agentId).toBe('agent-4');
    expect(entry!.reason).toBe('reputation_farming');
    expect(entry!.detail).toBe('Spamming reviews');
  });
});

describe('removeFromAgentBlocklist', () => {
  test('returns true when entry existed', () => {
    addToAgentBlocklist(db, 'agent-5');
    expect(removeFromAgentBlocklist(db, 'agent-5')).toBe(true);
  });

  test('returns false when entry did not exist', () => {
    expect(removeFromAgentBlocklist(db, 'nonexistent')).toBe(false);
  });

  test('double-remove returns false on second call', () => {
    addToAgentBlocklist(db, 'agent-6');
    removeFromAgentBlocklist(db, 'agent-6');
    expect(removeFromAgentBlocklist(db, 'agent-6')).toBe(false);
  });
});

describe('listAgentBlocklist', () => {
  test('returns empty array when no entries', () => {
    expect(listAgentBlocklist(db)).toEqual([]);
  });

  test('returns all blocked agents', () => {
    addToAgentBlocklist(db, 'agent-a', { reason: 'manual' });
    addToAgentBlocklist(db, 'agent-b', { reason: 'security_violation' });
    addToAgentBlocklist(db, 'agent-c', { reason: 'malicious_content' });

    const list = listAgentBlocklist(db);
    expect(list).toHaveLength(3);
    const ids = list.map((e) => e.agentId).sort();
    expect(ids).toEqual(['agent-a', 'agent-b', 'agent-c']);
  });

  test('does not include removed agents', () => {
    addToAgentBlocklist(db, 'agent-stay');
    addToAgentBlocklist(db, 'agent-go');
    removeFromAgentBlocklist(db, 'agent-go');

    const list = listAgentBlocklist(db);
    expect(list).toHaveLength(1);
    expect(list[0].agentId).toBe('agent-stay');
  });
});

describe('all BlocklistReason values', () => {
  const reasons = [
    'security_violation',
    'reputation_farming',
    'malicious_content',
    'manual',
    'behavioral_drift',
  ] as const;
  for (const reason of reasons) {
    test(`accepts reason: ${reason}`, () => {
      const id = `agent-reason-${reason}`;
      const entry = addToAgentBlocklist(db, id, { reason });
      expect(entry.reason).toBe(reason);
    });
  }
});

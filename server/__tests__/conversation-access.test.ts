import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { createAgent } from '../db/agents';
import {
    listAgentAllowlist, addToAgentAllowlist, removeFromAgentAllowlist,
    isOnAgentAllowlist, listAgentBlocklist, addToAgentBlocklist,
    removeFromAgentBlocklist, isOnAgentBlocklist, recordConversationMessage,
    getConversationRateLimit, pruneRateLimitEntries,
} from '../db/conversation-access';
import { checkConversationAccess, getAgentConversationMode, setAgentConversationMode } from '../algochat/conversation-access';
import type { AlgoChatConfig } from '../algochat/config';

let db: Database;
let agentId: string;

const OWNER_ADDR = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const USER_ADDR = 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const USER_ADDR_2 = 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';

function makeConfig(ownerAddresses: string[] = [OWNER_ADDR]): AlgoChatConfig {
    return {
        mnemonic: null,
        network: 'localnet',
        agentNetwork: 'localnet',
        syncInterval: 30000,
        defaultAgentId: null,
        enabled: true,
        pskContact: null,
        ownerAddresses: new Set(ownerAddresses),
    } as AlgoChatConfig;
}

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);

    const agent = createAgent(db, { name: 'test-agent' });
    agentId = agent.id;
});

afterEach(() => {
    db.close();
});

// ─── Allowlist CRUD ──────────────────────────────────────────────────────

describe('agent conversation allowlist', () => {
    test('addToAgentAllowlist creates entry', () => {
        const entry = addToAgentAllowlist(db, agentId, USER_ADDR, 'Test User');
        expect(entry.agentId).toBe(agentId);
        expect(entry.address).toBe(USER_ADDR);
        expect(entry.label).toBe('Test User');
    });

    test('listAgentAllowlist returns all entries for agent', () => {
        addToAgentAllowlist(db, agentId, USER_ADDR, 'User 1');
        addToAgentAllowlist(db, agentId, USER_ADDR_2, 'User 2');
        const list = listAgentAllowlist(db, agentId);
        expect(list).toHaveLength(2);
    });

    test('isOnAgentAllowlist returns true for listed address', () => {
        addToAgentAllowlist(db, agentId, USER_ADDR);
        expect(isOnAgentAllowlist(db, agentId, USER_ADDR)).toBe(true);
        expect(isOnAgentAllowlist(db, agentId, USER_ADDR_2)).toBe(false);
    });

    test('removeFromAgentAllowlist deletes entry', () => {
        addToAgentAllowlist(db, agentId, USER_ADDR);
        expect(removeFromAgentAllowlist(db, agentId, USER_ADDR)).toBe(true);
        expect(isOnAgentAllowlist(db, agentId, USER_ADDR)).toBe(false);
    });

    test('removeFromAgentAllowlist returns false for non-existent', () => {
        expect(removeFromAgentAllowlist(db, agentId, USER_ADDR)).toBe(false);
    });

    test('addToAgentAllowlist upserts on conflict', () => {
        addToAgentAllowlist(db, agentId, USER_ADDR, 'Old Label');
        addToAgentAllowlist(db, agentId, USER_ADDR, 'New Label');
        const list = listAgentAllowlist(db, agentId);
        expect(list).toHaveLength(1);
        expect(list[0].label).toBe('New Label');
    });
});

// ─── Blocklist CRUD ──────────────────────────────────────────────────────

describe('agent conversation blocklist', () => {
    test('addToAgentBlocklist creates entry', () => {
        const entry = addToAgentBlocklist(db, agentId, USER_ADDR, 'spam');
        expect(entry.agentId).toBe(agentId);
        expect(entry.address).toBe(USER_ADDR);
        expect(entry.reason).toBe('spam');
    });

    test('listAgentBlocklist returns all entries for agent', () => {
        addToAgentBlocklist(db, agentId, USER_ADDR);
        addToAgentBlocklist(db, agentId, USER_ADDR_2);
        expect(listAgentBlocklist(db, agentId)).toHaveLength(2);
    });

    test('isOnAgentBlocklist works', () => {
        addToAgentBlocklist(db, agentId, USER_ADDR);
        expect(isOnAgentBlocklist(db, agentId, USER_ADDR)).toBe(true);
        expect(isOnAgentBlocklist(db, agentId, USER_ADDR_2)).toBe(false);
    });

    test('removeFromAgentBlocklist deletes entry', () => {
        addToAgentBlocklist(db, agentId, USER_ADDR);
        expect(removeFromAgentBlocklist(db, agentId, USER_ADDR)).toBe(true);
        expect(isOnAgentBlocklist(db, agentId, USER_ADDR)).toBe(false);
    });
});

// ─── Rate Limiting ───────────────────────────────────────────────────────

describe('conversation rate limiting', () => {
    test('recordConversationMessage and getConversationRateLimit', () => {
        for (let i = 0; i < 5; i++) {
            recordConversationMessage(db, agentId, USER_ADDR);
        }
        const status = getConversationRateLimit(db, agentId, USER_ADDR, 3600, 10);
        expect(status.allowed).toBe(true);
        expect(status.remaining).toBe(5);
    });

    test('rate limit exceeded', () => {
        for (let i = 0; i < 10; i++) {
            recordConversationMessage(db, agentId, USER_ADDR);
        }
        const status = getConversationRateLimit(db, agentId, USER_ADDR, 3600, 10);
        expect(status.allowed).toBe(false);
        expect(status.remaining).toBe(0);
    });

    test('rate limits are per-agent', () => {
        const agent2 = createAgent(db, { name: 'agent-2' });
        for (let i = 0; i < 10; i++) {
            recordConversationMessage(db, agentId, USER_ADDR);
        }
        const status = getConversationRateLimit(db, agent2.id, USER_ADDR, 3600, 10);
        expect(status.allowed).toBe(true);
        expect(status.remaining).toBe(10);
    });

    test('pruneRateLimitEntries removes old entries', () => {
        // Insert entries with old timestamps
        db.query(
            `INSERT INTO agent_conversation_rate_limits (agent_id, address, message_at)
             VALUES (?, ?, datetime('now', '-2 hours'))`,
        ).run(agentId, USER_ADDR);
        recordConversationMessage(db, agentId, USER_ADDR); // recent

        const pruned = pruneRateLimitEntries(db, 3600);
        expect(pruned).toBe(1);

        const status = getConversationRateLimit(db, agentId, USER_ADDR, 3600, 10);
        expect(status.remaining).toBe(9);
    });
});

// ─── Access Control ──────────────────────────────────────────────────────

describe('checkConversationAccess', () => {
    test('owner always passes regardless of mode', () => {
        // Agent defaults to private mode
        const result = checkConversationAccess(db, agentId, OWNER_ADDR, makeConfig());
        expect(result.allowed).toBe(true);
        expect(result.reason).toBeNull();
    });

    test('private mode denies non-owner', () => {
        const result = checkConversationAccess(db, agentId, USER_ADDR, makeConfig());
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('private');
    });

    test('allowlist mode allows listed address', () => {
        setAgentConversationMode(db, agentId, 'allowlist');
        addToAgentAllowlist(db, agentId, USER_ADDR);
        const result = checkConversationAccess(db, agentId, USER_ADDR, makeConfig());
        expect(result.allowed).toBe(true);
    });

    test('allowlist mode denies unlisted address', () => {
        setAgentConversationMode(db, agentId, 'allowlist');
        const result = checkConversationAccess(db, agentId, USER_ADDR, makeConfig());
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('not_on_allowlist');
    });

    test('public mode allows anyone', () => {
        setAgentConversationMode(db, agentId, 'public');
        const result = checkConversationAccess(db, agentId, USER_ADDR, makeConfig());
        expect(result.allowed).toBe(true);
    });

    test('blocklist overrides allowlist', () => {
        setAgentConversationMode(db, agentId, 'allowlist');
        addToAgentAllowlist(db, agentId, USER_ADDR);
        addToAgentBlocklist(db, agentId, USER_ADDR, 'spam');
        const result = checkConversationAccess(db, agentId, USER_ADDR, makeConfig());
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('blocked');
    });

    test('blocklist blocks in public mode', () => {
        setAgentConversationMode(db, agentId, 'public');
        addToAgentBlocklist(db, agentId, USER_ADDR);
        const result = checkConversationAccess(db, agentId, USER_ADDR, makeConfig());
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('blocked');
    });

    test('rate limit denies after max messages', () => {
        setAgentConversationMode(db, agentId, 'public');
        // Set agent rate limit to 3 messages per window
        db.query('UPDATE agents SET conversation_rate_limit_max = 3 WHERE id = ?').run(agentId);

        for (let i = 0; i < 3; i++) {
            recordConversationMessage(db, agentId, USER_ADDR);
        }

        const result = checkConversationAccess(db, agentId, USER_ADDR, makeConfig());
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('rate_limited');
    });

    test('disabled agent is denied', () => {
        db.query('UPDATE agents SET disabled = 1 WHERE id = ?').run(agentId);
        const result = checkConversationAccess(db, agentId, USER_ADDR, makeConfig());
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('agent_disabled');
    });

    test('non-existent agent is denied', () => {
        const result = checkConversationAccess(db, 'nonexistent', USER_ADDR, makeConfig());
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('agent_disabled');
    });

    test('owner bypasses blocklist', () => {
        addToAgentBlocklist(db, agentId, OWNER_ADDR);
        const result = checkConversationAccess(db, agentId, OWNER_ADDR, makeConfig());
        expect(result.allowed).toBe(true);
    });

    test('owner bypasses rate limit', () => {
        setAgentConversationMode(db, agentId, 'public');
        db.query('UPDATE agents SET conversation_rate_limit_max = 1 WHERE id = ?').run(agentId);
        recordConversationMessage(db, agentId, OWNER_ADDR);
        recordConversationMessage(db, agentId, OWNER_ADDR);

        const result = checkConversationAccess(db, agentId, OWNER_ADDR, makeConfig());
        expect(result.allowed).toBe(true);
    });
});

// ─── Mode Management ─────────────────────────────────────────────────────

describe('conversation mode management', () => {
    test('default mode is private', () => {
        expect(getAgentConversationMode(db, agentId)).toBe('private');
    });

    test('setAgentConversationMode updates mode', () => {
        setAgentConversationMode(db, agentId, 'public');
        expect(getAgentConversationMode(db, agentId)).toBe('public');
    });

    test('getAgentConversationMode returns private for unknown agent', () => {
        expect(getAgentConversationMode(db, 'nonexistent')).toBe('private');
    });
});

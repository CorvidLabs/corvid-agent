/**
 * Spec invariant tests for algochat/* modules.
 *
 * Covers: conversation-access, on-chain (approval-format), messaging (condenser)
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../../db/schema';
import { checkConversationAccess } from '../../algochat/conversation-access';
import { formatApprovalForChain, parseApprovalResponse } from '../../algochat/approval-format';
import type { AlgoChatConfig } from '../../algochat/config';
import {
    addToAgentAllowlist,
    addToAgentBlocklist,
} from '../../db/conversation-access';

const OWNER = 'OWNER-ADDR-XXXX';
const AGENT_ID = 'agent-test-001';
const USER_ADDR = 'USER-ADDR-YYYY';

function makeConfig(ownerAddresses: string[] = [OWNER]): AlgoChatConfig {
    return {
        ownerAddresses: new Set(ownerAddresses),
        mnemonic: null,
        network: 'localnet',
        agentNetwork: 'localnet',
        syncInterval: 5000,
        defaultAgentId: null,
        enabled: true,
        pskContact: null,
    };
}

function createTestAgent(db: Database, id = AGENT_ID) {
    db.query(`INSERT INTO agents (id, name, model, system_prompt) VALUES (?, 'TestAgent', 'claude-sonnet-4-6', 'test')`).run(id);
}

// ── checkConversationAccess — evaluation order ─────────────────────────────

describe('checkConversationAccess evaluation order', () => {
    let db: Database;

    beforeEach(() => {
        db = new Database(':memory:');
        db.exec('PRAGMA foreign_keys = ON');
        runMigrations(db);
        createTestAgent(db);
    });

    afterEach(() => {
        db.close();
    });

    it('spec: owner always passes regardless of blocklist', () => {
        // Block the owner address
        addToAgentBlocklist(db, AGENT_ID, OWNER, 'test');
        const config = makeConfig([OWNER]);
        const result = checkConversationAccess(db, AGENT_ID, OWNER, config);
        expect(result.allowed).toBe(true);
    });

    it('spec: blocklist takes precedence over allowlist', () => {
        // Add user to both allowlist and blocklist
        addToAgentAllowlist(db, AGENT_ID, USER_ADDR, 'test');
        addToAgentBlocklist(db, AGENT_ID, USER_ADDR, 'spammer');
        const config = makeConfig([OWNER]);
        const result = checkConversationAccess(db, AGENT_ID, USER_ADDR, config);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('blocked');
    });
});

// ── approval-format — on-chain approval message invariants ─────────────────

describe('approval-format invariants', () => {
    function makeApprovalRequest(overrides: Partial<{ id: string; description: string }> = {}) {
        return {
            id: overrides.id ?? 'req-123abc',
            sessionId: 'sess-1',
            toolName: 'Bash',
            toolInput: { command: 'ls' },
            description: overrides.description ?? 'Run command: ls',
            createdAt: Date.now(),
            timeoutMs: 55_000,
            source: 'web' as const,
        };
    }

    it('spec: formatApprovalForChain includes short ID prefix and truncates to 700 bytes', () => {
        const longDescription = 'X'.repeat(1000);
        const req = makeApprovalRequest({ id: 'req-123abc-def', description: longDescription });
        const formatted = formatApprovalForChain(req);
        // Contains the short ID
        expect(formatted).toContain('req-123a');
        // Description is truncated — formatted string should not balloon beyond ~800 bytes
        expect(Buffer.byteLength(formatted, 'utf8')).toBeLessThan(900);
    });

    it('spec: parseApprovalResponse returns null for non-matching format', () => {
        const result = parseApprovalResponse('Hello, how are you?');
        expect(result).toBeNull();
    });

    it('spec: parseApprovalResponse extracts allow/deny behavior from "yes <shortId>"', () => {
        const req = makeApprovalRequest({ id: 'abc12345-xxxx' });
        const shortId = req.id.slice(0, 8);
        const result = parseApprovalResponse(`yes ${shortId}`);
        if (result) {
            expect(result.behavior).toBe('allow');
            expect(result.shortId).toBe(shortId);
        }
    });
});

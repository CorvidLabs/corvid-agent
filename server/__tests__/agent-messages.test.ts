import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import {
    createAgentMessage,
    getAgentMessage,
    updateAgentMessageStatus,
    listAgentMessages,
    listRecentAgentMessages,
    searchAgentMessages,
    getAgentMessageBySessionId,
    getThreadMessages,
} from '../db/agent-messages';

let db: Database;
const AGENT_A = 'agent-a';
const AGENT_B = 'agent-b';

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    db.query(`INSERT INTO agents (id, name, model, system_prompt) VALUES (?, 'AgentA', 'test', 'test')`).run(AGENT_A);
    db.query(`INSERT INTO agents (id, name, model, system_prompt) VALUES (?, 'AgentB', 'test', 'test')`).run(AGENT_B);
});

afterEach(() => {
    db.close();
});

function makeMessage(overrides: Record<string, unknown> = {}) {
    return createAgentMessage(db, {
        fromAgentId: AGENT_A,
        toAgentId: AGENT_B,
        content: 'Hello from A to B',
        ...overrides,
    });
}

// ── createAgentMessage ───────────────────────────────────────────────

describe('createAgentMessage', () => {
    test('creates with defaults', () => {
        const msg = makeMessage();
        expect(msg.id).toBeTruthy();
        expect(msg.fromAgentId).toBe(AGENT_A);
        expect(msg.toAgentId).toBe(AGENT_B);
        expect(msg.content).toBe('Hello from A to B');
        expect(msg.paymentMicro).toBe(0);
        expect(msg.status).toBe('pending');
        expect(msg.txid).toBeNull();
        expect(msg.response).toBeNull();
        expect(msg.responseTxid).toBeNull();
        expect(msg.sessionId).toBeNull();
        expect(msg.threadId).toBeNull();
        expect(msg.fireAndForget).toBe(false);
        expect(msg.errorCode).toBeNull();
        expect(msg.completedAt).toBeNull();
    });

    test('creates with custom fields', () => {
        const msg = makeMessage({
            paymentMicro: 5000,
            threadId: 'thread-1',
            provider: 'anthropic',
            model: 'claude-3',
            fireAndForget: true,
        });
        expect(msg.paymentMicro).toBe(5000);
        expect(msg.threadId).toBe('thread-1');
        expect(msg.provider).toBe('anthropic');
        expect(msg.model).toBe('claude-3');
        expect(msg.fireAndForget).toBe(true);
    });
});

// ── getAgentMessage ──────────────────────────────────────────────────

describe('getAgentMessage', () => {
    test('returns by id', () => {
        const msg = makeMessage();
        const fetched = getAgentMessage(db, msg.id);
        expect(fetched).not.toBeNull();
        expect(fetched!.id).toBe(msg.id);
    });

    test('returns null for unknown id', () => {
        expect(getAgentMessage(db, 'nonexistent')).toBeNull();
    });
});

// ── updateAgentMessageStatus ─────────────────────────────────────────

describe('updateAgentMessageStatus', () => {
    test('updates status only', () => {
        const msg = makeMessage();
        updateAgentMessageStatus(db, msg.id, 'sent');
        expect(getAgentMessage(db, msg.id)!.status).toBe('sent');
    });

    test('updates with extra fields', () => {
        const msg = makeMessage();
        updateAgentMessageStatus(db, msg.id, 'processing', {
            txid: 'tx-123',
            sessionId: 'sess-1',
        });
        const updated = getAgentMessage(db, msg.id)!;
        expect(updated.status).toBe('processing');
        expect(updated.txid).toBe('tx-123');
        expect(updated.sessionId).toBe('sess-1');
    });

    test('sets completedAt on completed status', () => {
        const msg = makeMessage();
        updateAgentMessageStatus(db, msg.id, 'completed', {
            response: 'Thanks!',
            responseTxid: 'tx-resp-1',
        });
        const updated = getAgentMessage(db, msg.id)!;
        expect(updated.status).toBe('completed');
        expect(updated.completedAt).toBeTruthy();
        expect(updated.response).toBe('Thanks!');
        expect(updated.responseTxid).toBe('tx-resp-1');
    });

    test('sets completedAt on failed status with errorCode', () => {
        const msg = makeMessage();
        updateAgentMessageStatus(db, msg.id, 'failed', {
            errorCode: 'SPENDING_LIMIT',
        });
        const updated = getAgentMessage(db, msg.id)!;
        expect(updated.status).toBe('failed');
        expect(updated.completedAt).toBeTruthy();
        expect(updated.errorCode).toBe('SPENDING_LIMIT');
    });

    test('does not set completedAt for non-terminal status', () => {
        const msg = makeMessage();
        updateAgentMessageStatus(db, msg.id, 'processing');
        expect(getAgentMessage(db, msg.id)!.completedAt).toBeNull();
    });
});

// ── List and search ──────────────────────────────────────────────────

describe('list and search', () => {
    test('listAgentMessages returns messages for agent', () => {
        makeMessage();
        makeMessage({ fromAgentId: AGENT_B, toAgentId: AGENT_A, content: 'Reply' });
        const msgs = listAgentMessages(db, AGENT_A);
        expect(msgs).toHaveLength(2);
    });

    test('listRecentAgentMessages returns with limit', () => {
        makeMessage({ content: 'Msg 1' });
        makeMessage({ content: 'Msg 2' });
        makeMessage({ content: 'Msg 3' });
        const msgs = listRecentAgentMessages(db, 2);
        expect(msgs).toHaveLength(2);
    });

    test('searchAgentMessages by content', () => {
        makeMessage({ content: 'Hello world' });
        makeMessage({ content: 'Goodbye' });

        const result = searchAgentMessages(db, { search: 'Hello' });
        expect(result.messages).toHaveLength(1);
        expect(result.total).toBe(1);
    });

    test('searchAgentMessages by agentId', () => {
        makeMessage(); // A → B
        const agentC = 'agent-c';
        db.query(`INSERT INTO agents (id, name, model, system_prompt) VALUES (?, 'C', 'test', 'test')`).run(agentC);
        makeMessage({ fromAgentId: agentC, toAgentId: AGENT_B, content: 'From C' });

        const result = searchAgentMessages(db, { agentId: AGENT_A });
        expect(result.messages).toHaveLength(1);
    });

    test('searchAgentMessages by threadId', () => {
        makeMessage({ threadId: 'thread-1', content: 'In thread' });
        makeMessage({ content: 'Not in thread' });

        const result = searchAgentMessages(db, { threadId: 'thread-1' });
        expect(result.messages).toHaveLength(1);
    });

    test('searchAgentMessages pagination', () => {
        for (let i = 0; i < 5; i++) {
            makeMessage({ content: `Msg ${i}` });
        }
        const page1 = searchAgentMessages(db, { limit: 2, offset: 0 });
        const page2 = searchAgentMessages(db, { limit: 2, offset: 2 });
        expect(page1.messages).toHaveLength(2);
        expect(page2.messages).toHaveLength(2);
        expect(page1.total).toBe(5);
    });
});

// ── getAgentMessageBySessionId ───────────────────────────────────────

describe('getAgentMessageBySessionId', () => {
    test('returns message by session id', () => {
        const msg = makeMessage();
        updateAgentMessageStatus(db, msg.id, 'processing', { sessionId: 'sess-42' });
        const fetched = getAgentMessageBySessionId(db, 'sess-42');
        expect(fetched).not.toBeNull();
        expect(fetched!.id).toBe(msg.id);
    });

    test('returns null for unknown session', () => {
        expect(getAgentMessageBySessionId(db, 'unknown')).toBeNull();
    });
});

// ── getThreadMessages ────────────────────────────────────────────────

describe('getThreadMessages', () => {
    test('returns messages in thread ordered by creation', () => {
        makeMessage({ threadId: 'thread-1', content: 'First' });
        makeMessage({ threadId: 'thread-1', content: 'Second' });
        makeMessage({ threadId: 'thread-2', content: 'Other thread' });

        const msgs = getThreadMessages(db, 'thread-1');
        expect(msgs).toHaveLength(2);
        expect(msgs[0].content).toBe('First');
        expect(msgs[1].content).toBe('Second');
    });

    test('returns empty for unknown thread', () => {
        expect(getThreadMessages(db, 'unknown')).toHaveLength(0);
    });
});

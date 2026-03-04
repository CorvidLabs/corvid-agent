import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import {
    createSession,
    getSession,
    listSessions,
    updateSession,
    updateSessionAgent,
    updateSessionPid,
    updateSessionStatus,
    updateSessionCost,
    updateSessionAlgoSpent,
    deleteSession,
    addSessionMessage,
    getSessionMessages,
    createConversation,
    getConversationByParticipant,
    listConversations,
    updateConversationRound,
    updateConversationSession,
    updateConversationAgent,
    listSessionsByCouncilLaunch,
    listPollingActivity,
    getParticipantForSession,
} from '../db/sessions';

let db: Database;
const AGENT_ID = 'agent-1';
const PROJECT_ID = 'proj-1';

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    db.query(`INSERT INTO agents (id, name, model, system_prompt) VALUES (?, 'TestAgent', 'test', 'test')`).run(AGENT_ID);
    db.query(`INSERT INTO projects (id, name, working_dir) VALUES (?, 'TestProject', '/tmp/test')`).run(PROJECT_ID);
});

afterEach(() => {
    db.close();
});

function makeSession(overrides: Record<string, unknown> = {}) {
    return createSession(db, {
        projectId: PROJECT_ID,
        agentId: AGENT_ID,
        name: 'Test Session',
        ...overrides,
    });
}

// ── Session CRUD ─────────────────────────────────────────────────────

describe('createSession', () => {
    test('creates with defaults (web source → idle)', () => {
        const session = makeSession();
        expect(session.id).toBeTruthy();
        expect(session.projectId).toBe(PROJECT_ID);
        expect(session.agentId).toBe(AGENT_ID);
        expect(session.status).toBe('idle');
        expect(session.source).toBe('web');
        expect(session.totalCostUsd).toBe(0);
        expect(session.totalTurns).toBe(0);
    });

    test('agent source starts in loading status', () => {
        const session = makeSession({ source: 'agent' });
        expect(session.status).toBe('loading');
        expect(session.source).toBe('agent');
    });

    test('creates with council fields', () => {
        const session = makeSession({
            councilLaunchId: 'launch-1',
            councilRole: 'member',
            workDir: '/tmp/work',
        });
        expect(session.councilLaunchId).toBe('launch-1');
        expect(session.councilRole).toBe('member');
        expect(session.workDir).toBe('/tmp/work');
    });
});

describe('getSession and listSessions', () => {
    test('getSession by id', () => {
        const session = makeSession();
        const fetched = getSession(db, session.id);
        expect(fetched).not.toBeNull();
        expect(fetched!.id).toBe(session.id);
    });

    test('getSession returns null for unknown id', () => {
        expect(getSession(db, 'nonexistent')).toBeNull();
    });

    test('listSessions returns all', () => {
        makeSession({ name: 'S1' });
        makeSession({ name: 'S2' });
        expect(listSessions(db)).toHaveLength(2);
    });

    test('listSessions filters by projectId', () => {
        const proj2 = 'proj-2';
        db.query(`INSERT INTO projects (id, name, working_dir) VALUES (?, 'P2', '/tmp/p2')`).run(proj2);
        makeSession({ name: 'S1', projectId: PROJECT_ID });
        makeSession({ name: 'S2', projectId: proj2 });
        expect(listSessions(db, PROJECT_ID)).toHaveLength(1);
    });
});

// ── updateSession ────────────────────────────────────────────────────

describe('updateSession', () => {
    test('updates name and status', () => {
        const session = makeSession();
        const updated = updateSession(db, session.id, { name: 'Renamed', status: 'running' });
        expect(updated!.name).toBe('Renamed');
        expect(updated!.status).toBe('running');
    });

    test('returns existing when no fields provided', () => {
        const session = makeSession();
        const updated = updateSession(db, session.id, {});
        expect(updated!.name).toBe('Test Session');
    });

    test('returns null for unknown id', () => {
        expect(updateSession(db, 'nonexistent', { name: 'X' })).toBeNull();
    });
});

// ── Specialized update helpers ───────────────────────────────────────

describe('session update helpers', () => {
    test('updateSessionAgent', () => {
        const session = makeSession({ agentId: undefined });
        updateSessionAgent(db, session.id, AGENT_ID);
        expect(getSession(db, session.id)!.agentId).toBe(AGENT_ID);
    });

    test('updateSessionPid', () => {
        const session = makeSession();
        updateSessionPid(db, session.id, 12345);
        expect(getSession(db, session.id)!.pid).toBe(12345);
        updateSessionPid(db, session.id, null);
        expect(getSession(db, session.id)!.pid).toBeNull();
    });

    test('updateSessionStatus', () => {
        const session = makeSession();
        updateSessionStatus(db, session.id, 'running');
        expect(getSession(db, session.id)!.status).toBe('running');
    });

    test('updateSessionCost', () => {
        const session = makeSession();
        updateSessionCost(db, session.id, 1.50, 10);
        const updated = getSession(db, session.id)!;
        expect(updated.totalCostUsd).toBe(1.50);
        expect(updated.totalTurns).toBe(10);
    });

    test('updateSessionAlgoSpent accumulates', () => {
        const session = makeSession();
        updateSessionAlgoSpent(db, session.id, 1000);
        updateSessionAlgoSpent(db, session.id, 500);
        expect(getSession(db, session.id)!.totalAlgoSpent).toBe(1500);
    });
});

// ── deleteSession ────────────────────────────────────────────────────

describe('deleteSession', () => {
    test('deletes session and messages', () => {
        const session = makeSession();
        addSessionMessage(db, session.id, 'user', 'Hello');
        expect(deleteSession(db, session.id)).toBe(true);
        expect(getSession(db, session.id)).toBeNull();
    });

    test('returns false for unknown id', () => {
        expect(deleteSession(db, 'nonexistent')).toBe(false);
    });
});

// ── Session Messages ─────────────────────────────────────────────────

describe('session messages', () => {
    test('add and get messages', () => {
        const session = makeSession();
        addSessionMessage(db, session.id, 'user', 'Hello', 0.01);
        addSessionMessage(db, session.id, 'assistant', 'Hi!', 0.02);

        const msgs = getSessionMessages(db, session.id);
        expect(msgs).toHaveLength(2);
        expect(msgs[0].role).toBe('user');
        expect(msgs[0].content).toBe('Hello');
        expect(msgs[0].costUsd).toBe(0.01);
        expect(msgs[1].role).toBe('assistant');
    });

    test('returns empty array for no messages', () => {
        const session = makeSession();
        expect(getSessionMessages(db, session.id)).toHaveLength(0);
    });
});

// ── AlgoChat Conversations ──────────────────────────────────────────

describe('algochat conversations', () => {
    test('create and get by participant', () => {
        const session = makeSession();
        const conv = createConversation(db, 'ALGO_ADDR_1', AGENT_ID, session.id);
        expect(conv.id).toBeTruthy();
        expect(conv.participantAddr).toBe('ALGO_ADDR_1');
        expect(conv.agentId).toBe(AGENT_ID);

        const fetched = getConversationByParticipant(db, 'ALGO_ADDR_1');
        expect(fetched).not.toBeNull();
        expect(fetched!.id).toBe(conv.id);
    });

    test('getConversationByParticipant returns null for unknown', () => {
        expect(getConversationByParticipant(db, 'UNKNOWN')).toBeNull();
    });

    test('listConversations', () => {
        createConversation(db, 'ADDR_1', null, null);
        createConversation(db, 'ADDR_2', null, null);
        expect(listConversations(db)).toHaveLength(2);
    });

    test('updateConversationRound', () => {
        const conv = createConversation(db, 'ADDR_1', null, null);
        updateConversationRound(db, conv.id, 42);
        const fetched = getConversationByParticipant(db, 'ADDR_1');
        expect(fetched!.lastRound).toBe(42);
    });

    test('updateConversationSession and updateConversationAgent', () => {
        const session = makeSession();
        const conv = createConversation(db, 'ADDR_1', null, null);

        updateConversationSession(db, conv.id, session.id);
        let fetched = getConversationByParticipant(db, 'ADDR_1');
        expect(fetched!.sessionId).toBe(session.id);

        updateConversationAgent(db, conv.id, AGENT_ID, session.id);
        fetched = getConversationByParticipant(db, 'ADDR_1');
        expect(fetched!.agentId).toBe(AGENT_ID);
    });
});

// ── listSessionsByCouncilLaunch ──────────────────────────────────────

describe('listSessionsByCouncilLaunch', () => {
    test('returns sessions for a launch', () => {
        makeSession({ name: 'Member1', councilLaunchId: 'launch-1' });
        makeSession({ name: 'Member2', councilLaunchId: 'launch-1' });
        makeSession({ name: 'Other', councilLaunchId: 'launch-2' });

        const sessions = listSessionsByCouncilLaunch(db, 'launch-1');
        expect(sessions).toHaveLength(2);
    });
});

// ── listPollingActivity ──────────────────────────────────────────────

describe('listPollingActivity', () => {
    test('finds sessions by repo name', () => {
        makeSession({ name: 'Poll: org/repo #1: Fix bug', source: 'agent' });
        makeSession({ name: 'Poll: org/repo #2: Add feature', source: 'agent' });
        makeSession({ name: 'Poll: other/repo #1: Issue', source: 'agent' });

        const sessions = listPollingActivity(db, 'org/repo');
        expect(sessions).toHaveLength(2);
    });

    test('finds sessions by org name (org-level config)', () => {
        makeSession({ name: 'Poll: MyOrg/repo1 #1: Fix', source: 'agent' });
        makeSession({ name: 'Poll: MyOrg/repo2 #1: Add', source: 'agent' });

        const sessions = listPollingActivity(db, 'MyOrg');
        expect(sessions).toHaveLength(2);
    });
});

// ── getParticipantForSession ─────────────────────────────────────────

describe('getParticipantForSession', () => {
    test('returns participant address', () => {
        const session = makeSession();
        createConversation(db, 'WALLET_ADDR', AGENT_ID, session.id);
        expect(getParticipantForSession(db, session.id)).toBe('WALLET_ADDR');
    });

    test('returns null when no conversation', () => {
        const session = makeSession();
        expect(getParticipantForSession(db, session.id)).toBeNull();
    });
});

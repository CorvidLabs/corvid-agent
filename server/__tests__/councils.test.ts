import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import {
    createCouncil,
    getCouncil,
    listCouncils,
    updateCouncil,
    deleteCouncil,
    createCouncilLaunch,
    getCouncilLaunch,
    listCouncilLaunches,
    updateCouncilLaunchStage,
    addCouncilLaunchLog,
    getCouncilLaunchLogs,
    insertDiscussionMessage,
    getDiscussionMessages,
    updateCouncilLaunchDiscussionRound,
    updateDiscussionMessageTxid,
    updateCouncilLaunchChatSession,
} from '../db/councils';

let db: Database;
const AGENT_IDS = ['agent-1', 'agent-2', 'agent-3'];
const PROJECT_ID = 'proj-1';

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    for (const id of AGENT_IDS) {
        db.query(`INSERT INTO agents (id, name, model, system_prompt) VALUES (?, ?, 'test', 'test')`).run(id, `Agent-${id}`);
    }
    db.query(`INSERT INTO projects (id, name, working_dir) VALUES (?, 'TestProject', '/tmp/test')`).run(PROJECT_ID);
});

afterEach(() => {
    db.close();
});

function makeCouncil(overrides: Record<string, unknown> = {}) {
    return createCouncil(db, {
        name: 'Test Council',
        agentIds: [AGENT_IDS[0], AGENT_IDS[1]],
        ...overrides,
    });
}

// ── Council CRUD ─────────────────────────────────────────────────────

describe('createCouncil', () => {
    test('creates with defaults', () => {
        const council = makeCouncil();
        expect(council.id).toBeTruthy();
        expect(council.name).toBe('Test Council');
        expect(council.description).toBe('');
        expect(council.chairmanAgentId).toBeNull();
        expect(council.agentIds).toEqual([AGENT_IDS[0], AGENT_IDS[1]]);
        expect(council.discussionRounds).toBe(2);
    });

    test('creates with chairman and custom rounds', () => {
        const council = makeCouncil({
            chairmanAgentId: AGENT_IDS[0],
            discussionRounds: 5,
            description: 'A council for testing',
        });
        expect(council.chairmanAgentId).toBe(AGENT_IDS[0]);
        expect(council.discussionRounds).toBe(5);
        expect(council.description).toBe('A council for testing');
    });
});

describe('getCouncil and listCouncils', () => {
    test('getCouncil by id', () => {
        const council = makeCouncil();
        const fetched = getCouncil(db, council.id);
        expect(fetched).not.toBeNull();
        expect(fetched!.agentIds).toEqual([AGENT_IDS[0], AGENT_IDS[1]]);
    });

    test('getCouncil returns null for unknown id', () => {
        expect(getCouncil(db, 'nonexistent')).toBeNull();
    });

    test('listCouncils returns all', () => {
        makeCouncil({ name: 'C1' });
        makeCouncil({ name: 'C2' });
        expect(listCouncils(db)).toHaveLength(2);
    });
});

describe('updateCouncil', () => {
    test('updates name and description', () => {
        const council = makeCouncil();
        const updated = updateCouncil(db, council.id, {
            name: 'Renamed',
            description: 'Updated',
        });
        expect(updated!.name).toBe('Renamed');
        expect(updated!.description).toBe('Updated');
    });

    test('updates agent membership', () => {
        const council = makeCouncil();
        const updated = updateCouncil(db, council.id, {
            agentIds: [AGENT_IDS[0], AGENT_IDS[1], AGENT_IDS[2]],
        });
        expect(updated!.agentIds).toHaveLength(3);
        expect(updated!.agentIds).toContain(AGENT_IDS[2]);
    });

    test('updates chairman and discussion rounds', () => {
        const council = makeCouncil();
        const updated = updateCouncil(db, council.id, {
            chairmanAgentId: AGENT_IDS[1],
            discussionRounds: 10,
        });
        expect(updated!.chairmanAgentId).toBe(AGENT_IDS[1]);
        expect(updated!.discussionRounds).toBe(10);
    });

    test('returns null for unknown id', () => {
        expect(updateCouncil(db, 'nonexistent', { name: 'X' })).toBeNull();
    });
});

describe('deleteCouncil', () => {
    test('deletes council', () => {
        const council = makeCouncil();
        expect(deleteCouncil(db, council.id)).toBe(true);
        expect(getCouncil(db, council.id)).toBeNull();
    });

    test('returns false for unknown id', () => {
        expect(deleteCouncil(db, 'nonexistent')).toBe(false);
    });
});

// ── Council Launches ─────────────────────────────────────────────────

describe('council launches', () => {
    test('create and get launch', () => {
        const council = makeCouncil();
        const launchId = crypto.randomUUID();
        createCouncilLaunch(db, {
            id: launchId,
            councilId: council.id,
            projectId: PROJECT_ID,
            prompt: 'Fix all the bugs',
        });

        const launch = getCouncilLaunch(db, launchId);
        expect(launch).not.toBeNull();
        expect(launch!.councilId).toBe(council.id);
        expect(launch!.projectId).toBe(PROJECT_ID);
        expect(launch!.prompt).toBe('Fix all the bugs');
        expect(launch!.stage).toBe('responding');
        expect(launch!.synthesis).toBeNull();
        expect(launch!.sessionIds).toEqual([]);
    });

    test('getCouncilLaunch returns null for unknown', () => {
        expect(getCouncilLaunch(db, 'nonexistent')).toBeNull();
    });

    test('listCouncilLaunches filters by council', () => {
        const c1 = makeCouncil({ name: 'C1' });
        const c2 = makeCouncil({ name: 'C2' });

        createCouncilLaunch(db, { id: crypto.randomUUID(), councilId: c1.id, projectId: PROJECT_ID, prompt: 'P1' });
        createCouncilLaunch(db, { id: crypto.randomUUID(), councilId: c2.id, projectId: PROJECT_ID, prompt: 'P2' });

        expect(listCouncilLaunches(db, c1.id)).toHaveLength(1);
        expect(listCouncilLaunches(db)).toHaveLength(2);
    });

    test('updateCouncilLaunchStage', () => {
        const council = makeCouncil();
        const launchId = crypto.randomUUID();
        createCouncilLaunch(db, { id: launchId, councilId: council.id, projectId: PROJECT_ID, prompt: 'Test' });

        updateCouncilLaunchStage(db, launchId, 'synthesizing', 'Final synthesis');
        const launch = getCouncilLaunch(db, launchId)!;
        expect(launch.stage).toBe('synthesizing');
        expect(launch.synthesis).toBe('Final synthesis');
    });

    test('updateCouncilLaunchStage without synthesis', () => {
        const council = makeCouncil();
        const launchId = crypto.randomUUID();
        createCouncilLaunch(db, { id: launchId, councilId: council.id, projectId: PROJECT_ID, prompt: 'Test' });

        updateCouncilLaunchStage(db, launchId, 'discussing');
        expect(getCouncilLaunch(db, launchId)!.stage).toBe('discussing');
    });

    test('updateCouncilLaunchDiscussionRound', () => {
        const council = makeCouncil();
        const launchId = crypto.randomUUID();
        createCouncilLaunch(db, { id: launchId, councilId: council.id, projectId: PROJECT_ID, prompt: 'Test' });

        updateCouncilLaunchDiscussionRound(db, launchId, 2, 5);
        const launch = getCouncilLaunch(db, launchId)!;
        expect(launch.currentDiscussionRound).toBe(2);
        expect(launch.totalDiscussionRounds).toBe(5);
    });

    test('updateCouncilLaunchChatSession', () => {
        const council = makeCouncil();
        const launchId = crypto.randomUUID();
        createCouncilLaunch(db, { id: launchId, councilId: council.id, projectId: PROJECT_ID, prompt: 'Test' });

        updateCouncilLaunchChatSession(db, launchId, 'chat-session-1');
        expect(getCouncilLaunch(db, launchId)!.chatSessionId).toBe('chat-session-1');
    });
});

// ── Council Launch Logs ──────────────────────────────────────────────

describe('council launch logs', () => {
    test('add and get logs', () => {
        const council = makeCouncil();
        const launchId = crypto.randomUUID();
        createCouncilLaunch(db, { id: launchId, councilId: council.id, projectId: PROJECT_ID, prompt: 'Test' });

        addCouncilLaunchLog(db, launchId, 'info', 'Started responding');
        addCouncilLaunchLog(db, launchId, 'stage', 'Moved to discussion', 'Round 1');
        addCouncilLaunchLog(db, launchId, 'error', 'Agent failed');

        const logs = getCouncilLaunchLogs(db, launchId);
        expect(logs).toHaveLength(3);
        expect(logs[0].level).toBe('info');
        expect(logs[0].message).toBe('Started responding');
        expect(logs[0].detail).toBeNull();
        expect(logs[1].level).toBe('stage');
        expect(logs[1].detail).toBe('Round 1');
    });
});

// ── Council Discussion Messages ──────────────────────────────────────

describe('council discussion messages', () => {
    test('insert and get messages', () => {
        const council = makeCouncil();
        const launchId = crypto.randomUUID();
        createCouncilLaunch(db, { id: launchId, councilId: council.id, projectId: PROJECT_ID, prompt: 'Test' });

        const msg1 = insertDiscussionMessage(db, {
            launchId,
            agentId: AGENT_IDS[0],
            agentName: 'Agent-1',
            round: 1,
            content: 'I think we should...',
        });
        const msg2 = insertDiscussionMessage(db, {
            launchId,
            agentId: AGENT_IDS[1],
            agentName: 'Agent-2',
            round: 1,
            content: 'I agree, but...',
            txid: 'tx-123',
        });

        expect(msg1.id).toBeTruthy();
        expect(msg1.txid).toBeNull();
        expect(msg2.txid).toBe('tx-123');

        const msgs = getDiscussionMessages(db, launchId);
        expect(msgs).toHaveLength(2);
        expect(msgs[0].agentName).toBe('Agent-1');
        expect(msgs[1].agentName).toBe('Agent-2');
    });

    test('updateDiscussionMessageTxid', () => {
        const council = makeCouncil();
        const launchId = crypto.randomUUID();
        createCouncilLaunch(db, { id: launchId, councilId: council.id, projectId: PROJECT_ID, prompt: 'Test' });

        const msg = insertDiscussionMessage(db, {
            launchId,
            agentId: AGENT_IDS[0],
            agentName: 'Agent-1',
            round: 1,
            content: 'Hello',
        });
        expect(msg.txid).toBeNull();

        updateDiscussionMessageTxid(db, msg.id, 'tx-456');
        const msgs = getDiscussionMessages(db, launchId);
        expect(msgs[0].txid).toBe('tx-456');
    });

    test('messages ordered by round then id', () => {
        const council = makeCouncil();
        const launchId = crypto.randomUUID();
        createCouncilLaunch(db, { id: launchId, councilId: council.id, projectId: PROJECT_ID, prompt: 'Test' });

        insertDiscussionMessage(db, { launchId, agentId: AGENT_IDS[0], agentName: 'A1', round: 2, content: 'Round 2' });
        insertDiscussionMessage(db, { launchId, agentId: AGENT_IDS[1], agentName: 'A2', round: 1, content: 'Round 1' });

        const msgs = getDiscussionMessages(db, launchId);
        expect(msgs[0].round).toBe(1);
        expect(msgs[1].round).toBe(2);
    });
});

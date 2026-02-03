import { test, expect, beforeEach, afterEach, describe } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { listProjects, getProject, createProject, updateProject, deleteProject } from '../db/projects';
import { listAgents, getAgent, createAgent, updateAgent, deleteAgent, setAgentWallet, getAgentWalletMnemonic, addAgentFunding } from '../db/agents';
import {
    listSessions,
    getSession as _getSession,
    createSession,
    updateSession as _updateSession,
    deleteSession,
    getSessionMessages,
    addSessionMessage,
    listSessionsByCouncilLaunch,
} from '../db/sessions';
import {
    listCouncils,
    getCouncil,
    createCouncil,
    updateCouncil,
    deleteCouncil,
    createCouncilLaunch,
    getCouncilLaunch,
    listCouncilLaunches,
    updateCouncilLaunchStage,
} from '../db/councils';

let db: Database;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterEach(() => {
    db.close();
});

describe('Projects CRUD', () => {
    test('create and list projects', () => {
        const project = createProject(db, { name: 'Test', workingDir: '/tmp' });
        expect(project.name).toBe('Test');
        expect(project.workingDir).toBe('/tmp');
        expect(project.id).toBeTruthy();

        const all = listProjects(db);
        expect(all).toHaveLength(1);
        expect(all[0].id).toBe(project.id);
    });

    test('get project by id', () => {
        const project = createProject(db, { name: 'Test', workingDir: '/tmp' });
        const found = getProject(db, project.id);
        expect(found?.name).toBe('Test');

        const notFound = getProject(db, 'nonexistent');
        expect(notFound).toBeNull();
    });

    test('update project', () => {
        const project = createProject(db, { name: 'Test', workingDir: '/tmp' });
        const updated = updateProject(db, project.id, { name: 'Updated' });
        expect(updated?.name).toBe('Updated');
        expect(updated?.workingDir).toBe('/tmp');
    });

    test('delete project', () => {
        const project = createProject(db, { name: 'Test', workingDir: '/tmp' });
        expect(deleteProject(db, project.id)).toBe(true);
        expect(getProject(db, project.id)).toBeNull();
        expect(deleteProject(db, 'nonexistent')).toBe(false);
    });

    test('create project with env vars', () => {
        const project = createProject(db, {
            name: 'Test',
            workingDir: '/tmp',
            envVars: { API_KEY: 'secret' },
        });
        expect(project.envVars).toEqual({ API_KEY: 'secret' });
    });
});

describe('Agents CRUD', () => {
    test('create and list agents', () => {
        const agent = createAgent(db, { name: 'Agent 1', model: 'opus' });
        expect(agent.name).toBe('Agent 1');
        expect(agent.model).toBe('opus');

        const all = listAgents(db);
        expect(all).toHaveLength(1);
    });

    test('update agent with algochat settings', () => {
        const agent = createAgent(db, { name: 'Agent 1' });
        const updated = updateAgent(db, agent.id, {
            algochatEnabled: true,
            algochatAuto: true,
        });
        expect(updated?.algochatEnabled).toBe(true);
        expect(updated?.algochatAuto).toBe(true);
    });

    test('delete agent', () => {
        const agent = createAgent(db, { name: 'Agent 1' });
        expect(deleteAgent(db, agent.id)).toBe(true);
        expect(getAgent(db, agent.id)).toBeNull();
    });

    test('set and get agent wallet', () => {
        const agent = createAgent(db, { name: 'Wallet Agent' });
        expect(agent.walletAddress).toBeNull();
        expect(agent.walletFundedAlgo).toBe(0);

        setAgentWallet(db, agent.id, 'TESTADDR123', 'encrypted-mnemonic-data');
        const updated = getAgent(db, agent.id);
        expect(updated?.walletAddress).toBe('TESTADDR123');

        const mnemonic = getAgentWalletMnemonic(db, agent.id);
        expect(mnemonic).toBe('encrypted-mnemonic-data');
    });

    test('add agent funding accumulates', () => {
        const agent = createAgent(db, { name: 'Fund Agent' });
        addAgentFunding(db, agent.id, 10);
        addAgentFunding(db, agent.id, 5);

        const updated = getAgent(db, agent.id);
        expect(updated?.walletFundedAlgo).toBe(15);
    });

    test('migration 3 adds wallet columns', () => {
        const agent = createAgent(db, { name: 'Migration Test' });
        expect(agent.walletAddress).toBeNull();
        expect(agent.walletFundedAlgo).toBe(0);
    });
});

describe('Sessions CRUD', () => {
    test('create session requires project', () => {
        const project = createProject(db, { name: 'Test', workingDir: '/tmp' });
        const session = createSession(db, { projectId: project.id, name: 'Session 1' });

        expect(session.projectId).toBe(project.id);
        expect(session.status).toBe('idle');
        expect(session.source).toBe('web');
    });

    test('list sessions by project', () => {
        const p1 = createProject(db, { name: 'P1', workingDir: '/tmp/1' });
        const p2 = createProject(db, { name: 'P2', workingDir: '/tmp/2' });

        createSession(db, { projectId: p1.id });
        createSession(db, { projectId: p1.id });
        createSession(db, { projectId: p2.id });

        expect(listSessions(db, p1.id)).toHaveLength(2);
        expect(listSessions(db, p2.id)).toHaveLength(1);
        expect(listSessions(db)).toHaveLength(3);
    });

    test('session messages', () => {
        const project = createProject(db, { name: 'Test', workingDir: '/tmp' });
        const session = createSession(db, { projectId: project.id });

        addSessionMessage(db, session.id, 'user', 'Hello');
        addSessionMessage(db, session.id, 'assistant', 'Hi there', 0.01);

        const messages = getSessionMessages(db, session.id);
        expect(messages).toHaveLength(2);
        expect(messages[0].role).toBe('user');
        expect(messages[1].costUsd).toBe(0.01);
    });

    test('delete session cascades messages', () => {
        const project = createProject(db, { name: 'Test', workingDir: '/tmp' });
        const session = createSession(db, { projectId: project.id });
        addSessionMessage(db, session.id, 'user', 'Hello');

        deleteSession(db, session.id);
        expect(getSessionMessages(db, session.id)).toHaveLength(0);
    });

    test('create session with council fields', () => {
        const project = createProject(db, { name: 'Test', workingDir: '/tmp' });
        const agent = createAgent(db, { name: 'A1' });
        const council = createCouncil(db, { name: 'C1', agentIds: [agent.id] });
        const launchId = crypto.randomUUID();
        createCouncilLaunch(db, { id: launchId, councilId: council.id, projectId: project.id, prompt: 'test' });

        const session = createSession(db, {
            projectId: project.id,
            councilLaunchId: launchId,
            councilRole: 'member',
        });
        expect(session.councilLaunchId).toBe(launchId);
        expect(session.councilRole).toBe('member');
    });

    test('session without council fields has null', () => {
        const project = createProject(db, { name: 'Test', workingDir: '/tmp' });
        const session = createSession(db, { projectId: project.id });
        expect(session.councilLaunchId).toBeNull();
        expect(session.councilRole).toBeNull();
    });
});

describe('Councils CRUD', () => {
    test('create and list councils', () => {
        const agent1 = createAgent(db, { name: 'A1' });
        const agent2 = createAgent(db, { name: 'A2' });

        const council = createCouncil(db, {
            name: 'Test Council',
            description: 'A council',
            agentIds: [agent1.id, agent2.id],
            chairmanAgentId: agent1.id,
        });

        expect(council.name).toBe('Test Council');
        expect(council.description).toBe('A council');
        expect(council.agentIds).toHaveLength(2);
        expect(council.chairmanAgentId).toBe(agent1.id);
        expect(council.id).toBeTruthy();

        const all = listCouncils(db);
        expect(all).toHaveLength(1);
        expect(all[0].agentIds).toHaveLength(2);
    });

    test('get council by id', () => {
        const agent = createAgent(db, { name: 'A1' });
        const council = createCouncil(db, { name: 'C1', agentIds: [agent.id] });

        const found = getCouncil(db, council.id);
        expect(found?.name).toBe('C1');
        expect(found?.agentIds).toEqual([agent.id]);

        expect(getCouncil(db, 'nonexistent')).toBeNull();
    });

    test('update council name and members', () => {
        const agent1 = createAgent(db, { name: 'A1' });
        const agent2 = createAgent(db, { name: 'A2' });
        const agent3 = createAgent(db, { name: 'A3' });

        const council = createCouncil(db, { name: 'Original', agentIds: [agent1.id, agent2.id] });

        const updated = updateCouncil(db, council.id, {
            name: 'Updated',
            agentIds: [agent2.id, agent3.id],
            chairmanAgentId: agent3.id,
        });

        expect(updated?.name).toBe('Updated');
        expect(updated?.agentIds).toHaveLength(2);
        expect(updated?.agentIds).toContain(agent2.id);
        expect(updated?.agentIds).toContain(agent3.id);
        expect(updated?.chairmanAgentId).toBe(agent3.id);
    });

    test('update nonexistent council returns null', () => {
        expect(updateCouncil(db, 'nonexistent', { name: 'X' })).toBeNull();
    });

    test('delete council', () => {
        const agent = createAgent(db, { name: 'A1' });
        const council = createCouncil(db, { name: 'C1', agentIds: [agent.id] });

        expect(deleteCouncil(db, council.id)).toBe(true);
        expect(getCouncil(db, council.id)).toBeNull();
        expect(deleteCouncil(db, 'nonexistent')).toBe(false);
    });

    test('delete council cascades members', () => {
        const agent = createAgent(db, { name: 'A1' });
        const council = createCouncil(db, { name: 'C1', agentIds: [agent.id] });

        deleteCouncil(db, council.id);

        // Verify member rows are gone
        const rows = db.query('SELECT * FROM council_members WHERE council_id = ?').all(council.id);
        expect(rows).toHaveLength(0);
    });

    test('create council without chairman', () => {
        const agent = createAgent(db, { name: 'A1' });
        const council = createCouncil(db, { name: 'No Chair', agentIds: [agent.id] });

        expect(council.chairmanAgentId).toBeNull();
    });

    test('member sort order is preserved', () => {
        const agent1 = createAgent(db, { name: 'First' });
        const agent2 = createAgent(db, { name: 'Second' });
        const agent3 = createAgent(db, { name: 'Third' });

        const council = createCouncil(db, { name: 'Ordered', agentIds: [agent3.id, agent1.id, agent2.id] });

        expect(council.agentIds[0]).toBe(agent3.id);
        expect(council.agentIds[1]).toBe(agent1.id);
        expect(council.agentIds[2]).toBe(agent2.id);
    });
});

describe('Council Launches', () => {
    test('create and get launch', () => {
        const agent = createAgent(db, { name: 'A1' });
        const council = createCouncil(db, { name: 'C1', agentIds: [agent.id] });
        const project = createProject(db, { name: 'P1', workingDir: '/tmp' });

        const launchId = crypto.randomUUID();
        createCouncilLaunch(db, {
            id: launchId,
            councilId: council.id,
            projectId: project.id,
            prompt: 'Hello council',
        });

        const launch = getCouncilLaunch(db, launchId);
        expect(launch).not.toBeNull();
        expect(launch?.councilId).toBe(council.id);
        expect(launch?.prompt).toBe('Hello council');
        expect(launch?.stage).toBe('responding');
        expect(launch?.synthesis).toBeNull();
        expect(launch?.sessionIds).toHaveLength(0);
    });

    test('launch includes associated sessions', () => {
        const agent = createAgent(db, { name: 'A1' });
        const council = createCouncil(db, { name: 'C1', agentIds: [agent.id] });
        const project = createProject(db, { name: 'P1', workingDir: '/tmp' });

        const launchId = crypto.randomUUID();
        createCouncilLaunch(db, {
            id: launchId,
            councilId: council.id,
            projectId: project.id,
            prompt: 'test',
        });

        // Create sessions linked to this launch
        createSession(db, {
            projectId: project.id,
            agentId: agent.id,
            councilLaunchId: launchId,
            councilRole: 'member',
        });

        const launch = getCouncilLaunch(db, launchId);
        expect(launch?.sessionIds).toHaveLength(1);
    });

    test('list launches filters by council', () => {
        const agent = createAgent(db, { name: 'A1' });
        const c1 = createCouncil(db, { name: 'C1', agentIds: [agent.id] });
        const c2 = createCouncil(db, { name: 'C2', agentIds: [agent.id] });
        const project = createProject(db, { name: 'P1', workingDir: '/tmp' });

        createCouncilLaunch(db, { id: crypto.randomUUID(), councilId: c1.id, projectId: project.id, prompt: 'q1' });
        createCouncilLaunch(db, { id: crypto.randomUUID(), councilId: c1.id, projectId: project.id, prompt: 'q2' });
        createCouncilLaunch(db, { id: crypto.randomUUID(), councilId: c2.id, projectId: project.id, prompt: 'q3' });

        expect(listCouncilLaunches(db, c1.id)).toHaveLength(2);
        expect(listCouncilLaunches(db, c2.id)).toHaveLength(1);
        expect(listCouncilLaunches(db)).toHaveLength(3);
    });

    test('update launch stage and synthesis', () => {
        const agent = createAgent(db, { name: 'A1' });
        const council = createCouncil(db, { name: 'C1', agentIds: [agent.id] });
        const project = createProject(db, { name: 'P1', workingDir: '/tmp' });

        const launchId = crypto.randomUUID();
        createCouncilLaunch(db, { id: launchId, councilId: council.id, projectId: project.id, prompt: 'test' });

        updateCouncilLaunchStage(db, launchId, 'reviewing');
        let launch = getCouncilLaunch(db, launchId);
        expect(launch?.stage).toBe('reviewing');

        updateCouncilLaunchStage(db, launchId, 'complete', 'Final synthesis result');
        launch = getCouncilLaunch(db, launchId);
        expect(launch?.stage).toBe('complete');
        expect(launch?.synthesis).toBe('Final synthesis result');
    });

    test('listSessionsByCouncilLaunch returns correct sessions', () => {
        const agent = createAgent(db, { name: 'A1' });
        const council = createCouncil(db, { name: 'C1', agentIds: [agent.id] });
        const project = createProject(db, { name: 'P1', workingDir: '/tmp' });

        const launchId = crypto.randomUUID();
        createCouncilLaunch(db, { id: launchId, councilId: council.id, projectId: project.id, prompt: 'test' });

        const s1 = createSession(db, { projectId: project.id, councilLaunchId: launchId, councilRole: 'member' });
        const s2 = createSession(db, { projectId: project.id, councilLaunchId: launchId, councilRole: 'reviewer' });
        createSession(db, { projectId: project.id }); // unrelated session

        const sessions = listSessionsByCouncilLaunch(db, launchId);
        expect(sessions).toHaveLength(2);
        expect(sessions.map(s => s.id)).toContain(s1.id);
        expect(sessions.map(s => s.id)).toContain(s2.id);
    });
});

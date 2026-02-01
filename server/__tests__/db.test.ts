import { test, expect, beforeEach, afterEach, describe } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { listProjects, getProject, createProject, updateProject, deleteProject } from '../db/projects';
import { listAgents, getAgent, createAgent, updateAgent, deleteAgent } from '../db/agents';
import {
    listSessions,
    getSession,
    createSession,
    updateSession,
    deleteSession,
    getSessionMessages,
    addSessionMessage,
} from '../db/sessions';

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
});

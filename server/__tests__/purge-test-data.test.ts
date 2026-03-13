import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { purgeTestData } from '../db/purge-test-data';

let db: Database;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterEach(() => {
    db.close();
});

function seedProject(name = 'Real Project'): string {
    const id = crypto.randomUUID();
    db.run('INSERT INTO projects (id, name, working_dir) VALUES (?, ?, ?)', id, name, '/tmp');
    return id;
}

function seedAgent(name = 'Real Agent'): string {
    const id = crypto.randomUUID();
    db.run('INSERT INTO agents (id, name) VALUES (?, ?)', id, name);
    return id;
}

function seedCouncil(name: string, agentId: string): string {
    const id = crypto.randomUUID();
    db.run('INSERT INTO councils (id, name, chairman_agent_id) VALUES (?, ?, ?)', id, name, agentId);
    return id;
}

function seedSession(name: string, projectId: string, agentId: string): string {
    const id = crypto.randomUUID();
    db.run('INSERT INTO sessions (id, name, project_id, agent_id) VALUES (?, ?, ?, ?)', id, name, projectId, agentId);
    return id;
}

function seedMessage(sessionId: string, content: string): void {
    db.run("INSERT INTO session_messages (session_id, role, content, tenant_id) VALUES (?, 'user', ?, 'default')", sessionId, content);
}

describe('purgeTestData', () => {
    test('dry run returns counts without deleting', () => {
        const projectId = seedProject();
        const agentId = seedAgent();
        seedCouncil('Test Council', agentId);
        seedSession('test session', projectId, agentId);

        const result = purgeTestData(db, { dryRun: true });
        expect(result.dryRun).toBe(true);
        expect(result.councils).toBe(1);
        expect(result.sessions).toBe(1);

        // Data should still exist
        const councils = db.query('SELECT COUNT(*) as c FROM councils').get() as { c: number };
        expect(councils.c).toBe(1);
    });

    test('deletes test councils and their sessions', () => {
        const projectId = seedProject();
        const agentId = seedAgent();
        seedCouncil('Test Council Alpha', agentId);
        seedCouncil('Real Council', agentId);

        const result = purgeTestData(db);
        expect(result.dryRun).toBe(false);
        expect(result.councils).toBe(1);

        const remaining = db.query('SELECT name FROM councils').all() as { name: string }[];
        expect(remaining).toHaveLength(1);
        expect(remaining[0].name).toBe('Real Council');
    });

    test('deletes test sessions and their messages', () => {
        const projectId = seedProject();
        const agentId = seedAgent();
        const testSession = seedSession('e2e test session', projectId, agentId);
        const realSession = seedSession('Sprint Planning', projectId, agentId);
        seedMessage(testSession, 'test message');
        seedMessage(testSession, 'another test');
        seedMessage(realSession, 'real message');

        const result = purgeTestData(db);
        expect(result.sessions).toBe(1);
        expect(result.sessionMessages).toBe(2);

        // Real session and message still exist
        const sessions = db.query('SELECT name FROM sessions').all() as { name: string }[];
        expect(sessions).toHaveLength(1);
        expect(sessions[0].name).toBe('Sprint Planning');

        const messages = db.query('SELECT COUNT(*) as c FROM session_messages').get() as { c: number };
        expect(messages.c).toBe(1);
    });

    test('matches all test patterns case-insensitively', () => {
        const projectId = seedProject();
        const agentId = seedAgent();
        seedSession('TEST uppercase', projectId, agentId);
        seedSession('Sample Data', projectId, agentId);
        seedSession('Dummy Session', projectId, agentId);
        seedSession('Lorem ipsum config', projectId, agentId);
        seedSession('E2E smoke test', projectId, agentId);
        seedSession('Real Work Session', projectId, agentId);

        const result = purgeTestData(db);
        expect(result.sessions).toBe(5);

        const remaining = db.query('SELECT name FROM sessions').all() as { name: string }[];
        expect(remaining).toHaveLength(1);
        expect(remaining[0].name).toBe('Real Work Session');
    });

    test('no-op when no test data exists', () => {
        const projectId = seedProject();
        const agentId = seedAgent();
        seedSession('Sprint Planning', projectId, agentId);
        seedCouncil('Architecture Review', agentId);

        const result = purgeTestData(db);
        expect(result.councils).toBe(0);
        expect(result.sessions).toBe(0);
        expect(result.sessionMessages).toBe(0);
    });

    test('cascades council_members on council delete', () => {
        const agentId = seedAgent();
        const councilId = seedCouncil('Test Council', agentId);
        db.run('INSERT INTO council_members (council_id, agent_id) VALUES (?, ?)', councilId, agentId);

        purgeTestData(db);

        const members = db.query('SELECT COUNT(*) as c FROM council_members').get() as { c: number };
        expect(members.c).toBe(0);
    });
});

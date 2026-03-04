import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import type { CreateWebhookRegistrationInput } from '../../shared/types';
import {
    createWebhookRegistration,
    getWebhookRegistration,
    listWebhookRegistrations,
    findRegistrationsForRepo,
    updateWebhookRegistration,
    deleteWebhookRegistration,
    incrementTriggerCount,
    createDelivery,
    getDelivery,
    listDeliveries,
    updateDeliveryStatus,
} from '../db/webhooks';

let db: Database;
const AGENT_ID = 'agent-1';
const PROJECT_ID = 'proj-1';

/** Create a registration with sensible defaults. */
function makeReg(overrides: Partial<CreateWebhookRegistrationInput> = {}) {
    return createWebhookRegistration(db, {
        agentId: AGENT_ID,
        repo: 'org/repo',
        events: ['issues'],
        mentionUsername: '@bot',
        projectId: PROJECT_ID,
        ...overrides,
    });
}

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

// ── Registration CRUD ────────────────────────────────────────────────

describe('webhook registrations', () => {
    test('createWebhookRegistration creates with all fields', () => {
        const reg = makeReg({
            repo: 'CorvidLabs/corvid-agent',
            events: ['issues', 'issue_comment'],
            mentionUsername: '@corvid',
        });
        expect(reg.id).toBeTruthy();
        expect(reg.agentId).toBe(AGENT_ID);
        expect(reg.repo).toBe('CorvidLabs/corvid-agent');
        expect(reg.events).toEqual(['issues', 'issue_comment']);
        expect(reg.mentionUsername).toBe('@corvid');
        expect(reg.projectId).toBe(PROJECT_ID);
        expect(reg.status).toBe('active');
        expect(reg.triggerCount).toBe(0);
    });

    test('getWebhookRegistration returns registration by id', () => {
        const reg = makeReg();
        const fetched = getWebhookRegistration(db, reg.id);
        expect(fetched).not.toBeNull();
        expect(fetched!.id).toBe(reg.id);
    });

    test('getWebhookRegistration returns null for unknown id', () => {
        expect(getWebhookRegistration(db, 'nonexistent')).toBeNull();
    });

    test('listWebhookRegistrations returns all registrations', () => {
        makeReg({ repo: 'org/repo1' });
        makeReg({ repo: 'org/repo2', events: ['issue_comment'] });
        const list = listWebhookRegistrations(db);
        expect(list).toHaveLength(2);
    });

    test('listWebhookRegistrations filters by agentId', () => {
        const agent2 = 'agent-2';
        db.query(`INSERT INTO agents (id, name, model, system_prompt) VALUES (?, 'A2', 'test', 'test')`).run(agent2);

        makeReg({ repo: 'org/repo1' });
        makeReg({ agentId: agent2, repo: 'org/repo2', mentionUsername: '@bot2' });

        const list = listWebhookRegistrations(db, AGENT_ID);
        expect(list).toHaveLength(1);
        expect(list[0].agentId).toBe(AGENT_ID);
    });

    test('findRegistrationsForRepo returns only active registrations for repo', () => {
        const r1 = makeReg({ repo: 'org/target' });
        makeReg({ repo: 'org/other' });
        updateWebhookRegistration(db, r1.id, { status: 'paused' });

        const found = findRegistrationsForRepo(db, 'org/target');
        expect(found).toHaveLength(0);
    });

    test('findRegistrationsForRepo returns active registrations', () => {
        makeReg({ repo: 'org/target' });
        const found = findRegistrationsForRepo(db, 'org/target');
        expect(found).toHaveLength(1);
    });

    test('updateWebhookRegistration updates fields', () => {
        const reg = makeReg({ mentionUsername: '@old' });
        const updated = updateWebhookRegistration(db, reg.id, {
            events: ['issues', 'issue_comment'],
            mentionUsername: '@new',
            status: 'paused',
        });

        expect(updated).not.toBeNull();
        expect(updated!.events).toEqual(['issues', 'issue_comment']);
        expect(updated!.mentionUsername).toBe('@new');
        expect(updated!.status).toBe('paused');
    });

    test('updateWebhookRegistration with no changes returns existing', () => {
        const reg = makeReg();
        const updated = updateWebhookRegistration(db, reg.id, {});
        expect(updated!.id).toBe(reg.id);
    });

    test('updateWebhookRegistration returns null for unknown id', () => {
        expect(updateWebhookRegistration(db, 'nonexistent', { status: 'paused' })).toBeNull();
    });

    test('deleteWebhookRegistration removes registration', () => {
        const reg = makeReg();
        expect(deleteWebhookRegistration(db, reg.id)).toBe(true);
        expect(getWebhookRegistration(db, reg.id)).toBeNull();
    });

    test('deleteWebhookRegistration returns false for unknown id', () => {
        expect(deleteWebhookRegistration(db, 'nonexistent')).toBe(false);
    });

    test('incrementTriggerCount increments counter', () => {
        const reg = makeReg();
        expect(reg.triggerCount).toBe(0);

        incrementTriggerCount(db, reg.id);
        incrementTriggerCount(db, reg.id);

        const updated = getWebhookRegistration(db, reg.id)!;
        expect(updated.triggerCount).toBe(2);
    });
});

// ── Delivery Log ─────────────────────────────────────────────────────

describe('webhook deliveries', () => {
    let regId: string;

    beforeEach(() => {
        regId = makeReg().id;
    });

    test('createDelivery creates a delivery record', () => {
        const d = createDelivery(db, regId, 'issues', 'opened', 'org/repo', 'user1', 'Issue body', 'https://github.com/org/repo/issues/1');
        expect(d.id).toBeTruthy();
        expect(d.registrationId).toBe(regId);
        expect(d.event).toBe('issues');
        expect(d.action).toBe('opened');
        expect(d.repo).toBe('org/repo');
        expect(d.sender).toBe('user1');
        expect(d.body).toBe('Issue body');
        expect(d.htmlUrl).toBe('https://github.com/org/repo/issues/1');
        expect(d.status).toBe('processing');
        expect(d.sessionId).toBeNull();
        expect(d.workTaskId).toBeNull();
        expect(d.result).toBeNull();
    });

    test('getDelivery returns delivery by id', () => {
        const d = createDelivery(db, regId, 'issues', 'opened', 'org/repo', 'user1', 'body', 'url');
        const fetched = getDelivery(db, d.id);
        expect(fetched).not.toBeNull();
        expect(fetched!.id).toBe(d.id);
    });

    test('getDelivery returns null for unknown id', () => {
        expect(getDelivery(db, 'nonexistent')).toBeNull();
    });

    test('listDeliveries returns all deliveries', () => {
        createDelivery(db, regId, 'issues', 'opened', 'org/repo', 'u1', 'b1', 'url1');
        createDelivery(db, regId, 'issues', 'closed', 'org/repo', 'u2', 'b2', 'url2');
        const list = listDeliveries(db);
        expect(list).toHaveLength(2);
    });

    test('listDeliveries filters by registrationId', () => {
        const reg2 = makeReg({ repo: 'org/other' });
        createDelivery(db, regId, 'issues', 'opened', 'org/repo', 'u1', 'b1', 'url1');
        createDelivery(db, reg2.id, 'issues', 'opened', 'org/other', 'u2', 'b2', 'url2');

        const list = listDeliveries(db, regId);
        expect(list).toHaveLength(1);
        expect(list[0].registrationId).toBe(regId);
    });

    test('listDeliveries respects limit', () => {
        for (let i = 0; i < 5; i++) {
            createDelivery(db, regId, 'issues', 'opened', 'org/repo', 'u', `body${i}`, 'url');
        }
        expect(listDeliveries(db, regId, 2)).toHaveLength(2);
    });

    test('updateDeliveryStatus updates status and extras', () => {
        const d = createDelivery(db, regId, 'issues', 'opened', 'org/repo', 'u1', 'body', 'url');
        updateDeliveryStatus(db, d.id, 'completed', {
            result: 'Agent responded',
            sessionId: 'sess-1',
            workTaskId: 'wt-1',
        });

        const updated = getDelivery(db, d.id)!;
        expect(updated.status).toBe('completed');
        expect(updated.result).toBe('Agent responded');
        expect(updated.sessionId).toBe('sess-1');
        expect(updated.workTaskId).toBe('wt-1');
    });

    test('updateDeliveryStatus with minimal update', () => {
        const d = createDelivery(db, regId, 'issues', 'opened', 'org/repo', 'u1', 'body', 'url');
        updateDeliveryStatus(db, d.id, 'failed');

        const updated = getDelivery(db, d.id)!;
        expect(updated.status).toBe('failed');
        expect(updated.sessionId).toBeNull();
    });
});

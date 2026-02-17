import { test, expect, beforeEach, afterEach, describe } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { OwnerQuestionManager } from '../process/owner-question-manager';

let db: Database;
let manager: OwnerQuestionManager;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    manager = new OwnerQuestionManager();
    manager.setDatabase(db);
});

afterEach(() => {
    manager.shutdown();
    db.close();
});

describe('OwnerQuestionManager', () => {
    test('createQuestion and resolveQuestion returns response', async () => {
        const promise = manager.createQuestion({
            sessionId: 'session-1',
            agentId: 'agent-1',
            question: 'Should I proceed?',
            options: ['Yes', 'No'],
        });

        // Question should be pending
        const pending = manager.getPendingForSession('session-1');
        expect(pending).toHaveLength(1);
        expect(pending[0].question).toBe('Should I proceed?');
        expect(pending[0].options).toEqual(['Yes', 'No']);

        // Resolve it
        const resolved = manager.resolveQuestion(pending[0].id, {
            questionId: pending[0].id,
            answer: 'Yes, proceed',
            selectedOption: 0,
        });
        expect(resolved).toBe(true);

        const response = await promise;
        expect(response).not.toBeNull();
        expect(response!.answer).toBe('Yes, proceed');
        expect(response!.selectedOption).toBe(0);
    });

    test('timeout returns null', async () => {
        const promise = manager.createQuestion({
            sessionId: 'session-1',
            agentId: 'agent-1',
            question: 'Quick question?',
            timeoutMs: 60_000, // will be clamped to MIN_TIMEOUT_MS
        });

        // Cancel via shutdown to simulate timeout behavior
        manager.shutdown();

        const response = await promise;
        expect(response).toBeNull();
    });

    test('cancelSession resolves pending questions with null', async () => {
        const promise1 = manager.createQuestion({
            sessionId: 'session-1',
            agentId: 'agent-1',
            question: 'Question 1?',
        });

        const promise2 = manager.createQuestion({
            sessionId: 'session-1',
            agentId: 'agent-1',
            question: 'Question 2?',
        });

        // Different session should not be affected
        const promise3 = manager.createQuestion({
            sessionId: 'session-2',
            agentId: 'agent-2',
            question: 'Question 3?',
        });

        expect(manager.getPendingForSession('session-1')).toHaveLength(2);
        expect(manager.getPendingForSession('session-2')).toHaveLength(1);

        manager.cancelSession('session-1');

        const r1 = await promise1;
        const r2 = await promise2;
        expect(r1).toBeNull();
        expect(r2).toBeNull();

        // session-2 should still be pending
        expect(manager.getPendingForSession('session-2')).toHaveLength(1);

        // Clean up session-2
        manager.cancelSession('session-2');
        const r3 = await promise3;
        expect(r3).toBeNull();
    });

    test('resolveQuestion returns false for unknown ID', () => {
        const result = manager.resolveQuestion('nonexistent', {
            questionId: 'nonexistent',
            answer: 'test',
            selectedOption: null,
        });
        expect(result).toBe(false);
    });

    test('DB persistence of questions and responses', async () => {
        const promise = manager.createQuestion({
            sessionId: 'session-1',
            agentId: 'agent-1',
            question: 'Persist this?',
            options: ['A', 'B'],
            context: 'Some context',
        });

        // Check DB row was created
        const row = db.query('SELECT * FROM owner_questions WHERE session_id = ?').get('session-1') as {
            id: string;
            session_id: string;
            agent_id: string;
            question: string;
            options: string;
            context: string;
            status: string;
            answer: string | null;
        };
        expect(row).toBeTruthy();
        expect(row.question).toBe('Persist this?');
        expect(row.options).toBe('["A","B"]');
        expect(row.context).toBe('Some context');
        expect(row.status).toBe('pending');
        expect(row.answer).toBeNull();

        // Resolve
        manager.resolveQuestion(row.id, {
            questionId: row.id,
            answer: 'Option B',
            selectedOption: 1,
        });

        await promise;

        // Check DB was updated
        const updated = db.query('SELECT * FROM owner_questions WHERE id = ?').get(row.id) as {
            status: string;
            answer: string;
            resolved_at: string | null;
        };
        expect(updated.status).toBe('answered');
        expect(updated.answer).toBe('Option B');
        expect(updated.resolved_at).not.toBeNull();
    });

    test('DB persistence on timeout', async () => {
        const promise = manager.createQuestion({
            sessionId: 'session-1',
            agentId: 'agent-1',
            question: 'Will timeout?',
        });

        const pending = manager.getPendingForSession('session-1');
        const questionId = pending[0].id;

        // Simulate timeout via shutdown
        manager.shutdown();
        await promise;

        const row = db.query('SELECT status FROM owner_questions WHERE id = ?').get(questionId) as { status: string };
        expect(row.status).toBe('timeout');
    });

    test('shutdown resolves all pending with null', async () => {
        const p1 = manager.createQuestion({ sessionId: 's1', agentId: 'a1', question: 'Q1?' });
        const p2 = manager.createQuestion({ sessionId: 's2', agentId: 'a2', question: 'Q2?' });

        manager.shutdown();

        expect(await p1).toBeNull();
        expect(await p2).toBeNull();
    });

    test('works without database', async () => {
        const noDB = new OwnerQuestionManager();
        // No setDatabase call

        const promise = noDB.createQuestion({
            sessionId: 'session-1',
            agentId: 'agent-1',
            question: 'No DB?',
        });

        const pending = noDB.getPendingForSession('session-1');
        noDB.resolveQuestion(pending[0].id, {
            questionId: pending[0].id,
            answer: 'Works fine',
            selectedOption: null,
        });

        const response = await promise;
        expect(response).not.toBeNull();
        expect(response!.answer).toBe('Works fine');

        noDB.shutdown();
    });
});

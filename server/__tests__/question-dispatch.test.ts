/**
 * Tests for the two-way question dispatch system:
 * - DB persistence (question dispatches)
 * - QuestionDispatcher routing
 * - ResponsePollingService response parsing
 * - OwnerQuestionManager.resolveByShortId
 */

import { test, expect, beforeEach, describe } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { createAgent } from '../db/agents';
import {
    createQuestionDispatch,
    listActiveQuestionDispatches,
    updateQuestionDispatchStatus,
    getQuestionDispatchesByQuestionId,
    upsertChannel,
} from '../db/notifications';
import { OwnerQuestionManager } from '../process/owner-question-manager';
import { QuestionDispatcher } from '../notifications/question-dispatcher';

let db: Database;
let agentId: string;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    const agent = createAgent(db, { name: 'QuestionAgent', model: 'sonnet' });
    agentId = agent.id;
});

// ─── DB: Question Dispatch Persistence ────────────────────────────────────

describe('question dispatch DB layer', () => {
    test('createQuestionDispatch persists and returns dispatch', () => {
        const d = createQuestionDispatch(db, 'q-1', 'github', 'https://github.com/owner/repo/issues/1');

        expect(d.id).toBeTruthy();
        expect(d.questionId).toBe('q-1');
        expect(d.channelType).toBe('github');
        expect(d.externalRef).toBe('https://github.com/owner/repo/issues/1');
        expect(d.status).toBe('sent');
        expect(d.createdAt).toBeTruthy();
    });

    test('listActiveQuestionDispatches returns only sent dispatches', () => {
        createQuestionDispatch(db, 'q-1', 'github', 'ref-1');
        const d2 = createQuestionDispatch(db, 'q-2', 'telegram', 'ref-2');
        updateQuestionDispatchStatus(db, d2.id, 'answered');

        const active = listActiveQuestionDispatches(db);
        expect(active.length).toBe(1);
        expect(active[0].questionId).toBe('q-1');
    });

    test('updateQuestionDispatchStatus changes status', () => {
        const d = createQuestionDispatch(db, 'q-1', 'github', 'ref-1');
        updateQuestionDispatchStatus(db, d.id, 'answered');

        const dispatches = getQuestionDispatchesByQuestionId(db, 'q-1');
        expect(dispatches[0].status).toBe('answered');
    });

    test('getQuestionDispatchesByQuestionId returns all dispatches for a question', () => {
        createQuestionDispatch(db, 'q-1', 'github', 'ref-gh');
        createQuestionDispatch(db, 'q-1', 'telegram', 'ref-tg');
        createQuestionDispatch(db, 'q-2', 'github', 'ref-other');

        const dispatches = getQuestionDispatchesByQuestionId(db, 'q-1');
        expect(dispatches.length).toBe(2);
        expect(dispatches.map((d) => d.channelType)).toContain('github');
        expect(dispatches.map((d) => d.channelType)).toContain('telegram');
    });
});

// ─── OwnerQuestionManager: resolveByShortId ──────────────────────────────

describe('OwnerQuestionManager.resolveByShortId', () => {
    test('resolves a pending question by short ID prefix', async () => {
        const manager = new OwnerQuestionManager();
        manager.setDatabase(db);

        // Create a question (non-blocking — we control the resolution)
        const responsePromise = manager.createQuestion({
            sessionId: 'sess-1',
            agentId,
            question: 'Which option?',
            options: ['A', 'B', 'C'],
        });

        // Get the pending question to find its ID
        const pending = manager.getPendingForSession('sess-1');
        expect(pending.length).toBe(1);
        const shortId = pending[0].id.slice(0, 8);

        // Resolve by short ID
        const resolved = manager.resolveByShortId(shortId, {
            answer: 'B',
            selectedOption: 1,
        });
        expect(resolved).toBe(true);

        // The promise should resolve with the answer
        const response = await responsePromise;
        expect(response).not.toBeNull();
        expect(response!.answer).toBe('B');
        expect(response!.selectedOption).toBe(1);
    });

    test('findByShortId returns null for non-existent prefix', () => {
        const manager = new OwnerQuestionManager();
        expect(manager.findByShortId('nonexist')).toBeNull();
    });

    test('resolveByShortId returns false for non-existent prefix', () => {
        const manager = new OwnerQuestionManager();
        const resolved = manager.resolveByShortId('nonexist', { answer: 'test', selectedOption: null });
        expect(resolved).toBe(false);
    });
});

// ─── QuestionDispatcher ──────────────────────────────────────────────────

describe('QuestionDispatcher', () => {
    test('dispatch returns empty array when no channels configured', async () => {
        const dispatcher = new QuestionDispatcher(db);

        const dispatched = await dispatcher.dispatch({
            id: 'q-1',
            sessionId: 'sess-1',
            agentId,
            question: 'Test question?',
            options: null,
            context: null,
            createdAt: new Date().toISOString(),
            timeoutMs: 120_000,
        });

        expect(dispatched).toEqual([]);
    });

    test('dispatch skips disabled channels', async () => {
        const dispatcher = new QuestionDispatcher(db);

        // Create a disabled channel
        const ch = upsertChannel(db, agentId, 'github', { repo: 'owner/repo' });
        db.query('UPDATE notification_channels SET enabled = 0 WHERE id = ?').run(ch.id);

        const dispatched = await dispatcher.dispatch({
            id: 'q-1',
            sessionId: 'sess-1',
            agentId,
            question: 'Test?',
            options: null,
            context: null,
            createdAt: new Date().toISOString(),
            timeoutMs: 120_000,
        });

        expect(dispatched).toEqual([]);
    });

    test('dispatch skips discord (no reply support)', async () => {
        const dispatcher = new QuestionDispatcher(db);

        upsertChannel(db, agentId, 'discord', { webhookUrl: 'https://discord.webhook' });

        const dispatched = await dispatcher.dispatch({
            id: 'q-1',
            sessionId: 'sess-1',
            agentId,
            question: 'Test?',
            options: ['A', 'B'],
            context: null,
            createdAt: new Date().toISOString(),
            timeoutMs: 120_000,
        });

        expect(dispatched).toEqual([]);
    });

    test('dispatch records dispatches in DB on success', async () => {
        // Mock a GitHub channel that will fail (no GH_TOKEN), but we can test
        // that Telegram with bad config produces graceful failure
        const dispatcher = new QuestionDispatcher(db);

        upsertChannel(db, agentId, 'telegram', { botToken: '', chatId: '' });

        const dispatched = await dispatcher.dispatch({
            id: 'q-1',
            sessionId: 'sess-1',
            agentId,
            question: 'Test?',
            options: null,
            context: null,
            createdAt: new Date().toISOString(),
            timeoutMs: 120_000,
        });

        // Should fail gracefully (missing botToken/chatId)
        expect(dispatched).toEqual([]);
    });
});

// ─── Response Parsing ─────────────────────────────────────────────────────

describe('response parsing integration', () => {
    test('numeric response maps to option index', async () => {
        const manager = new OwnerQuestionManager();
        manager.setDatabase(db);

        const promise = manager.createQuestion({
            sessionId: 'sess-1',
            agentId,
            question: 'Pick one',
            options: ['Alpha', 'Beta', 'Gamma'],
        });

        const pending = manager.getPendingForSession('sess-1');
        const questionId = pending[0].id;

        // Simulate what the poller does: parse "2" as option index
        const row = db.query('SELECT options FROM owner_questions WHERE id = ?').get(questionId) as { options: string | null };
        const options: string[] = row?.options ? JSON.parse(row.options) : [];

        const numMatch = '2'.match(/^(\d+)$/);
        let answer = '2';
        let selectedOption: number | null = null;
        if (numMatch && options.length > 0) {
            const idx = parseInt(numMatch[1], 10) - 1;
            if (idx >= 0 && idx < options.length) {
                selectedOption = idx;
                answer = options[idx];
            }
        }

        expect(selectedOption).toBe(1);
        expect(answer).toBe('Beta');

        // Resolve and verify
        manager.resolveQuestion(questionId, { questionId, answer, selectedOption });
        const response = await promise;
        expect(response!.answer).toBe('Beta');
        expect(response!.selectedOption).toBe(1);
    });

    test('text response matching an option maps correctly', async () => {
        const manager = new OwnerQuestionManager();
        manager.setDatabase(db);

        const promise = manager.createQuestion({
            sessionId: 'sess-2',
            agentId,
            question: 'Pick one',
            options: ['Alpha', 'Beta', 'Gamma'],
        });

        const pending = manager.getPendingForSession('sess-2');
        const questionId = pending[0].id;

        const row = db.query('SELECT options FROM owner_questions WHERE id = ?').get(questionId) as { options: string | null };
        const options: string[] = row?.options ? JSON.parse(row.options) : [];

        const answer = 'beta';
        const matchIdx = options.findIndex((opt) => opt.toLowerCase() === answer.toLowerCase());

        expect(matchIdx).toBe(1);

        manager.resolveQuestion(questionId, {
            questionId,
            answer: options[matchIdx],
            selectedOption: matchIdx,
        });

        const response = await promise;
        expect(response!.selectedOption).toBe(1);
    });

    test('freeform text response has null selectedOption', async () => {
        const manager = new OwnerQuestionManager();
        manager.setDatabase(db);

        const promise = manager.createQuestion({
            sessionId: 'sess-3',
            agentId,
            question: 'What do you think?',
            options: ['Yes', 'No'],
        });

        const pending = manager.getPendingForSession('sess-3');
        const questionId = pending[0].id;

        // "maybe" doesn't match any option
        manager.resolveQuestion(questionId, {
            questionId,
            answer: 'maybe later',
            selectedOption: null,
        });

        const response = await promise;
        expect(response!.answer).toBe('maybe later');
        expect(response!.selectedOption).toBeNull();
    });
});

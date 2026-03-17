import { test, expect, beforeEach, afterEach, describe } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { ProcessManager } from '../process/manager';
import { createSession } from '../db/sessions';
import type { SdkProcess } from '../process/sdk-process';
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages/messages';

/**
 * Tests for ProcessManager.sendMessage with multimodal content.
 *
 * Verifies that sendMessage correctly handles both string and
 * ContentBlockParam[] inputs, extracting text for session history
 * and forwarding multimodal content to the underlying process.
 */

let db: Database;
let pm: ProcessManager;
const AGENT_ID = 'agent-1';
const PROJECT_ID = 'proj-1';
let sessionId: string;

function makeMockProcess(sendResult: boolean = true): SdkProcess {
    return {
        pid: 999,
        sendMessage: () => sendResult,
        kill: () => {},
    };
}

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    db.query(`INSERT INTO agents (id, name, model, system_prompt) VALUES (?, 'TestAgent', 'test', 'test')`).run(AGENT_ID);
    db.query(`INSERT INTO projects (id, name, working_dir) VALUES (?, 'TestProject', '/tmp/test')`).run(PROJECT_ID);
    const session = createSession(db, { projectId: PROJECT_ID, agentId: AGENT_ID, name: 'Test' });
    sessionId = session.id;
    pm = new ProcessManager(db);
});

afterEach(() => {
    pm.shutdown();
    db.close();
});

describe('ProcessManager.sendMessage', () => {
    test('returns false when session does not exist', () => {
        expect(pm.sendMessage('nonexistent', 'hello')).toBe(false);
    });

    test('sends string content and persists to session history', () => {
        (pm as any).processes.set(sessionId, makeMockProcess());

        const result = pm.sendMessage(sessionId, 'hello world');
        expect(result).toBe(true);

        const messages = db.query('SELECT role, content FROM session_messages WHERE session_id = ?').all(sessionId) as { role: string; content: string }[];
        expect(messages).toHaveLength(1);
        expect(messages[0].role).toBe('user');
        expect(messages[0].content).toBe('hello world');
    });

    test('sends multimodal ContentBlockParam[] and extracts text for history', () => {
        (pm as any).processes.set(sessionId, makeMockProcess());

        const content: ContentBlockParam[] = [
            { type: 'text', text: 'Check this image' } as ContentBlockParam,
            { type: 'image', source: { type: 'url', url: 'https://example.com/img.png' } } as ContentBlockParam,
        ];

        const result = pm.sendMessage(sessionId, content);
        expect(result).toBe(true);

        const messages = db.query('SELECT role, content FROM session_messages WHERE session_id = ?').all(sessionId) as { role: string; content: string }[];
        expect(messages).toHaveLength(1);
        expect(messages[0].role).toBe('user');
        expect(messages[0].content).toBe('Check this image');
    });

    test('persists fallback text when multimodal content has no text blocks', () => {
        (pm as any).processes.set(sessionId, makeMockProcess());

        const content: ContentBlockParam[] = [
            { type: 'image', source: { type: 'url', url: 'https://example.com/img.png' } } as ContentBlockParam,
        ];

        const result = pm.sendMessage(sessionId, content);
        expect(result).toBe(true);

        const messages = db.query('SELECT content FROM session_messages WHERE session_id = ?').all(sessionId) as { content: string }[];
        expect(messages[0].content).toBe('[image attachment(s)]');
    });

    test('extracts and joins text from multiple text blocks', () => {
        (pm as any).processes.set(sessionId, makeMockProcess());

        const content: ContentBlockParam[] = [
            { type: 'text', text: 'Line one' } as ContentBlockParam,
            { type: 'image', source: { type: 'url', url: 'https://example.com/img.png' } } as ContentBlockParam,
            { type: 'text', text: 'Line two' } as ContentBlockParam,
        ];

        const result = pm.sendMessage(sessionId, content);
        expect(result).toBe(true);

        const messages = db.query('SELECT content FROM session_messages WHERE session_id = ?').all(sessionId) as { content: string }[];
        expect(messages[0].content).toBe('Line one\nLine two');
    });

    test('returns false when underlying process rejects the message', () => {
        (pm as any).processes.set(sessionId, makeMockProcess(false));

        const result = pm.sendMessage(sessionId, 'hello');
        expect(result).toBe(false);

        // No message should be persisted
        const messages = db.query('SELECT * FROM session_messages WHERE session_id = ?').all(sessionId);
        expect(messages).toHaveLength(0);
    });

    test('increments turnCount in session metadata', () => {
        (pm as any).processes.set(sessionId, makeMockProcess());
        (pm as any).sessionMeta.set(sessionId, { turnCount: 0, startedAt: Date.now() });

        pm.sendMessage(sessionId, 'first message');
        expect((pm as any).sessionMeta.get(sessionId).turnCount).toBe(1);

        const multimodal: ContentBlockParam[] = [
            { type: 'text', text: 'second' } as ContentBlockParam,
            { type: 'image', source: { type: 'url', url: 'https://example.com/img.png' } } as ContentBlockParam,
        ];
        pm.sendMessage(sessionId, multimodal);
        expect((pm as any).sessionMeta.get(sessionId).turnCount).toBe(2);
    });
});

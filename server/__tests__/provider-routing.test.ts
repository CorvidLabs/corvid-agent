import { test, expect, beforeEach, afterEach, describe } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { ProcessManager, resolveProviderRouting } from '../process/manager';
import { createSession } from '../db/sessions';
import type { ClaudeStreamEvent } from '../process/types';

/**
 * Tests for provider routing decisions.
 *
 * Part 1: Unit tests for the pure resolveProviderRouting() function.
 * Part 2: Integration tests verifying ProcessManager emits provider_selected events.
 *
 * Closes #1499 — Provider parity: align Cursor routing/default/fallback semantics.
 */

// ── Part 1: resolveProviderRouting pure function tests ───────────────────────

describe('resolveProviderRouting', () => {
    describe('default routing (no provider set)', () => {
        test('routes to SDK by default when no provider is set', () => {
            const result = resolveProviderRouting({
                providerType: undefined,
                agentModel: 'claude-sonnet-4-6',
                hasCursorBinary: false,
                hasClaudeAccess: true,
                hasOllamaProvider: false,
            });
            expect(result.provider).toBe('sdk');
            expect(result.reason).toBe('default');
            expect(result.fallback).toBe(false);
            expect(result.effectiveModel).toBe('claude-sonnet-4-6');
        });

        test('routes to SDK with empty model', () => {
            const result = resolveProviderRouting({
                providerType: undefined,
                agentModel: '',
                hasCursorBinary: false,
                hasClaudeAccess: true,
                hasOllamaProvider: false,
            });
            expect(result.provider).toBe('sdk');
            expect(result.reason).toBe('default');
            expect(result.effectiveModel).toBe('');
        });
    });

    describe('agent_config routing (explicit provider)', () => {
        test('routes to cursor when provider is cursor and binary exists', () => {
            const result = resolveProviderRouting({
                providerType: 'cursor',
                agentModel: 'auto',
                hasCursorBinary: true,
                hasClaudeAccess: true,
                hasOllamaProvider: false,
            });
            expect(result.provider).toBe('cursor');
            expect(result.reason).toBe('agent_config');
            expect(result.fallback).toBe(false);
            expect(result.effectiveModel).toBe('auto');
        });

        test('routes to anthropic when provider is anthropic', () => {
            const result = resolveProviderRouting({
                providerType: 'anthropic',
                agentModel: 'claude-opus-4-6',
                hasCursorBinary: false,
                hasClaudeAccess: true,
                hasOllamaProvider: false,
            });
            expect(result.provider).toBe('anthropic');
            expect(result.reason).toBe('agent_config');
            expect(result.fallback).toBe(false);
        });

        test('routes to ollama when provider is ollama', () => {
            const result = resolveProviderRouting({
                providerType: 'ollama',
                agentModel: 'qwen3:14b',
                hasCursorBinary: false,
                hasClaudeAccess: false,
                hasOllamaProvider: true,
            });
            expect(result.provider).toBe('ollama');
            expect(result.reason).toBe('agent_config');
            expect(result.fallback).toBe(false);
        });
    });

    describe('cursor → SDK fallback (binary missing)', () => {
        test('falls back to SDK when cursor binary is missing', () => {
            const result = resolveProviderRouting({
                providerType: 'cursor',
                agentModel: 'auto',
                hasCursorBinary: false,
                hasClaudeAccess: true,
                hasOllamaProvider: false,
            });
            expect(result.provider).toBe('sdk');
            expect(result.reason).toBe('cursor_binary_missing');
            expect(result.fallback).toBe(true);
        });

        test('clears cursor-only model "auto" on fallback', () => {
            const result = resolveProviderRouting({
                providerType: 'cursor',
                agentModel: 'auto',
                hasCursorBinary: false,
                hasClaudeAccess: true,
                hasOllamaProvider: false,
            });
            expect(result.effectiveModel).toBe('');
        });

        test('clears composer-2 model on fallback', () => {
            const result = resolveProviderRouting({
                providerType: 'cursor',
                agentModel: 'composer-2',
                hasCursorBinary: false,
                hasClaudeAccess: true,
                hasOllamaProvider: false,
            });
            expect(result.effectiveModel).toBe('');
        });

        test('clears composer-2-fast model on fallback', () => {
            const result = resolveProviderRouting({
                providerType: 'cursor',
                agentModel: 'composer-2-fast',
                hasCursorBinary: false,
                hasClaudeAccess: true,
                hasOllamaProvider: false,
            });
            expect(result.effectiveModel).toBe('');
        });

        test('clears gpt-5.4-medium model on fallback', () => {
            const result = resolveProviderRouting({
                providerType: 'cursor',
                agentModel: 'gpt-5.4-medium',
                hasCursorBinary: false,
                hasClaudeAccess: true,
                hasOllamaProvider: false,
            });
            expect(result.effectiveModel).toBe('');
        });

        test('clears gemini-3.1-pro model on fallback', () => {
            const result = resolveProviderRouting({
                providerType: 'cursor',
                agentModel: 'gemini-3.1-pro',
                hasCursorBinary: false,
                hasClaudeAccess: true,
                hasOllamaProvider: false,
            });
            expect(result.effectiveModel).toBe('');
        });

        test('clears grok-4-20-thinking model on fallback', () => {
            const result = resolveProviderRouting({
                providerType: 'cursor',
                agentModel: 'grok-4-20-thinking',
                hasCursorBinary: false,
                hasClaudeAccess: true,
                hasOllamaProvider: false,
            });
            expect(result.effectiveModel).toBe('');
        });

        test('preserves Claude model on cursor fallback', () => {
            const result = resolveProviderRouting({
                providerType: 'cursor',
                agentModel: 'claude-sonnet-4-6',
                hasCursorBinary: false,
                hasClaudeAccess: true,
                hasOllamaProvider: false,
            });
            expect(result.effectiveModel).toBe('claude-sonnet-4-6');
        });

        test('preserves claude-opus-4-6 on cursor fallback', () => {
            const result = resolveProviderRouting({
                providerType: 'cursor',
                agentModel: 'claude-opus-4-6',
                hasCursorBinary: false,
                hasClaudeAccess: true,
                hasOllamaProvider: false,
            });
            expect(result.effectiveModel).toBe('claude-opus-4-6');
        });

        test('preserves empty model on cursor fallback', () => {
            const result = resolveProviderRouting({
                providerType: 'cursor',
                agentModel: '',
                hasCursorBinary: false,
                hasClaudeAccess: true,
                hasOllamaProvider: false,
            });
            expect(result.effectiveModel).toBe('');
        });
    });

    describe('Ollama fallback (no cloud access)', () => {
        let savedOllamaProxyEnv: string | undefined;

        beforeEach(() => {
            savedOllamaProxyEnv = process.env.OLLAMA_USE_CLAUDE_PROXY;
            // Use '' not delete — Bun ignores delete for .env-loaded vars
            process.env.OLLAMA_USE_CLAUDE_PROXY = '';
        });

        afterEach(() => {
            process.env.OLLAMA_USE_CLAUDE_PROXY = savedOllamaProxyEnv ?? '';
        });

        test('falls back to Ollama when no cloud access and Ollama available', () => {
            const result = resolveProviderRouting({
                providerType: undefined,
                agentModel: '',
                hasCursorBinary: false,
                hasClaudeAccess: false,
                hasOllamaProvider: true,
                ollamaDefaultModel: 'qwen3',
            });
            expect(result.provider).toBe('ollama');
            expect(result.reason).toBe('no_claude_access');
            expect(result.fallback).toBe(true);
        });

        test('routes through SDK proxy when OLLAMA_USE_CLAUDE_PROXY is enabled', () => {
            process.env.OLLAMA_USE_CLAUDE_PROXY = 'true';
            const result = resolveProviderRouting({
                providerType: undefined,
                agentModel: '',
                hasCursorBinary: false,
                hasClaudeAccess: false,
                hasOllamaProvider: true,
                ollamaDefaultModel: 'qwen3',
            });
            expect(result.provider).toBe('sdk');
            expect(result.reason).toBe('ollama_via_claude_proxy');
            expect(result.fallback).toBe(true);
        });

        test('replaces non-Ollama model with Ollama default', () => {
            const result = resolveProviderRouting({
                providerType: undefined,
                agentModel: 'claude-sonnet-4-6',
                hasCursorBinary: false,
                hasClaudeAccess: false,
                hasOllamaProvider: true,
                ollamaDefaultModel: 'qwen3',
            });
            expect(result.effectiveModel).toBe('qwen3');
        });

        test('preserves Ollama-compatible model (contains colon)', () => {
            const result = resolveProviderRouting({
                providerType: undefined,
                agentModel: 'llama3.1:70b',
                hasCursorBinary: false,
                hasClaudeAccess: false,
                hasOllamaProvider: true,
                ollamaDefaultModel: 'qwen3',
            });
            expect(result.effectiveModel).toBe('llama3.1:70b');
        });

        test('preserves qwen model name', () => {
            const result = resolveProviderRouting({
                providerType: undefined,
                agentModel: 'qwen3',
                hasCursorBinary: false,
                hasClaudeAccess: false,
                hasOllamaProvider: true,
                ollamaDefaultModel: 'qwen3',
            });
            expect(result.effectiveModel).toBe('qwen3');
        });

        test('preserves llama model name', () => {
            const result = resolveProviderRouting({
                providerType: undefined,
                agentModel: 'llama3.1',
                hasCursorBinary: false,
                hasClaudeAccess: false,
                hasOllamaProvider: true,
            });
            expect(result.effectiveModel).toBe('llama3.1');
        });

        test('does not fall back when Ollama is not available', () => {
            const result = resolveProviderRouting({
                providerType: undefined,
                agentModel: '',
                hasCursorBinary: false,
                hasClaudeAccess: false,
                hasOllamaProvider: false,
            });
            expect(result.provider).toBe('sdk');
            expect(result.reason).toBe('default');
            expect(result.fallback).toBe(false);
        });
    });

    describe('priority: cursor fallback takes precedence over Ollama fallback', () => {
        test('cursor agent without binary falls back to SDK even when no cloud access', () => {
            const result = resolveProviderRouting({
                providerType: 'cursor',
                agentModel: 'auto',
                hasCursorBinary: false,
                hasClaudeAccess: false,
                hasOllamaProvider: true,
                ollamaDefaultModel: 'qwen3',
            });
            // Cursor fallback should win — goes to SDK, not Ollama
            expect(result.provider).toBe('sdk');
            expect(result.reason).toBe('cursor_binary_missing');
        });
    });
});

// ── Part 2: Integration tests — provider_selected event emission ─────────────

const AGENT_ID = 'agent-routing-1';
const PROJECT_ID = 'proj-routing-1';

let db: Database;
let pm: ProcessManager;

function setupDb(): void {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    db.query(`INSERT INTO agents (id, name, model, system_prompt) VALUES (?, 'TestAgent', 'claude-sonnet-4-6', 'test')`).run(AGENT_ID);
    db.query(`INSERT INTO projects (id, name, working_dir) VALUES (?, 'TestProject', '/tmp/test')`).run(PROJECT_ID);
    pm = new ProcessManager(db);
}

function teardownDb(): void {
    pm.shutdown();
    db.close();
}

describe('ProcessManager provider_selected event', () => {
    beforeEach(setupDb);
    afterEach(teardownDb);

    test('emits provider_selected system event on startProcess', () => {
        const session = createSession(db, { projectId: PROJECT_ID, agentId: AGENT_ID, name: 'Routing Test' });

        const events: ClaudeStreamEvent[] = [];
        pm.subscribe(session.id, (_sid, event) => events.push(event));

        try {
            pm.startProcess(session, 'test prompt');
        } catch {
            // Expected — no real process to spawn in some envs
        }
        // Stop immediately to prevent async spawn errors leaking between tests
        pm.stopProcess(session.id);

        const providerEvent = events.find(
            (e) => e.type === 'system' && e.subtype === 'provider_selected',
        );
        expect(providerEvent).toBeDefined();
        expect(providerEvent!.type).toBe('system');
        expect((providerEvent as any).statusMessage).toContain('Provider:');
    });

    test('provider_selected event shows sdk as default provider', () => {
        const session = createSession(db, { projectId: PROJECT_ID, agentId: AGENT_ID, name: 'SDK Default' });

        const events: ClaudeStreamEvent[] = [];
        pm.subscribe(session.id, (_sid, event) => events.push(event));

        try {
            pm.startProcess(session, 'test prompt');
        } catch {
            // Expected
        }
        // Stop immediately to prevent async spawn errors leaking between tests
        pm.stopProcess(session.id);

        const providerEvent = events.find(
            (e) => e.type === 'system' && e.subtype === 'provider_selected',
        );
        expect(providerEvent).toBeDefined();
        // Default agent has no provider set → routes to sdk
        expect((providerEvent as any).statusMessage).toBe('Provider: sdk');
    });
});

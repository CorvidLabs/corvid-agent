import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { createAgent } from '../db/agents';
import { createPersona, assignPersona } from '../db/personas';
import { createBundle, assignBundle } from '../db/skill-bundles';
import { resolveSessionPrompts, resolveToolPermissions, resolveSessionConfig } from '../process/session-config-resolver';

/**
 * SessionConfigResolver integration tests — uses real in-memory SQLite
 * to avoid mock.module leaking into other test files.
 */

let db: Database;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterEach(() => {
    db.close();
});

describe('session-config-resolver', () => {

    // ── resolveSessionPrompts ──────────────────────────────────────────

    describe('resolveSessionPrompts', () => {
        it('returns undefined prompts when no agent is provided', () => {
            const result = resolveSessionPrompts(db, null, null);
            expect(result.personaPrompt).toBeUndefined();
            expect(result.skillPrompt).toBeUndefined();
        });

        it('returns persona prompt when agent has a persona', () => {
            const agent = createAgent(db, { name: 'TestAgent' });
            const persona = createPersona(db, {
                name: 'Professional',
                archetype: 'professional',
                traits: ['analytical'],
                voiceGuidelines: 'Be precise.',
                background: 'Expert engineer.',
            });
            assignPersona(db, agent.id, persona.id);

            const result = resolveSessionPrompts(db, agent, null);
            expect(result.personaPrompt).toBeDefined();
            expect(result.personaPrompt).toContain('Persona');
            expect(result.personaPrompt).toContain('professional');
        });

        it('returns undefined persona when agent has no persona', () => {
            const agent = createAgent(db, { name: 'NoPersona' });
            const result = resolveSessionPrompts(db, agent, null);
            expect(result.personaPrompt).toBeUndefined();
        });

        it('returns skill prompt from agent-level bundles', () => {
            const agent = createAgent(db, { name: 'SkillAgent' });
            const bundle = createBundle(db, {
                name: 'test-skill-resolver',
                promptAdditions: 'Always use formal language.',
            });
            assignBundle(db, agent.id, bundle.id);

            const result = resolveSessionPrompts(db, agent, null);
            expect(result.skillPrompt).toContain('Always use formal language.');
        });

        it('returns undefined skill prompt when no bundles assigned', () => {
            const agent = createAgent(db, { name: 'NoBundles' });
            const result = resolveSessionPrompts(db, agent, null);
            // resolveAgentPromptAdditions returns empty string when no bundles
            expect(result.skillPrompt).toBeUndefined();
        });
    });

    // ── resolveToolPermissions ─────────────────────────────────────────

    describe('resolveToolPermissions', () => {
        it('returns null when agent has no explicit permissions and no bundles', () => {
            const agent = createAgent(db, { name: 'NoPerms' });
            const result = resolveToolPermissions(db, agent.id, null);
            expect(result).toBeNull();
        });

        it('returns agent-level tools from bundles', () => {
            const agent = createAgent(db, { name: 'BundleAgent' });
            const bundle = createBundle(db, {
                name: 'tool-bundle-resolver',
                tools: ['corvid_send_message', 'corvid_web_search'],
            });
            assignBundle(db, agent.id, bundle.id);

            const result = resolveToolPermissions(db, agent.id, null);
            expect(result).toContain('corvid_send_message');
            expect(result).toContain('corvid_web_search');
        });

        it('merges base permissions with bundle tools', () => {
            const agent = createAgent(db, {
                name: 'MergeAgent',
                mcpToolPermissions: ['corvid_list_agents'],
            });
            const bundle = createBundle(db, {
                name: 'extra-tools-resolver',
                tools: ['corvid_web_search'],
            });
            assignBundle(db, agent.id, bundle.id);

            const result = resolveToolPermissions(db, agent.id, null);
            expect(result).toContain('corvid_list_agents');
            expect(result).toContain('corvid_web_search');
        });

        it('returns null for nonexistent agent', () => {
            const result = resolveToolPermissions(db, 'nonexistent-id', null);
            expect(result).toBeNull();
        });
    });

    // ── resolveSessionConfig (combined) ────────────────────────────────

    describe('resolveSessionConfig', () => {
        it('returns all three config values', () => {
            const agent = createAgent(db, { name: 'FullConfig' });
            const persona = createPersona(db, {
                name: 'Technical',
                archetype: 'technical',
                traits: ['precise'],
            });
            assignPersona(db, agent.id, persona.id);
            const bundle = createBundle(db, {
                name: 'full-config-bundle',
                tools: ['corvid_send_message'],
                promptAdditions: 'Be concise.',
            });
            assignBundle(db, agent.id, bundle.id);

            const result = resolveSessionConfig(db, agent, agent.id, null);
            expect(result.personaPrompt).toBeDefined();
            expect(result.skillPrompt).toContain('Be concise.');
            expect(result.resolvedToolPermissions).toContain('corvid_send_message');
        });

        it('returns null permissions when no agentId', () => {
            const result = resolveSessionConfig(db, null, null, null);
            expect(result.resolvedToolPermissions).toBeNull();
        });

        it('returns undefined prompts when agent has no persona or bundles', () => {
            const agent = createAgent(db, { name: 'Bare' });
            const result = resolveSessionConfig(db, agent, agent.id, null);
            expect(result.personaPrompt).toBeUndefined();
        });
    });
});

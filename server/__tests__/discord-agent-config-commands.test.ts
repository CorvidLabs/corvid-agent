/**
 * Tests for Discord /agent-skill and /agent-persona command handlers.
 */

import { test, expect, describe, beforeEach, afterEach, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleInteraction, type InteractionContext } from '../discord/commands';
import { PermissionLevel } from '../discord/types';
import type { DiscordBridgeConfig } from '../discord/types';
import { createAgent } from '../db/agents';
import { createBundle, getAgentBundles } from '../db/skill-bundles';
import { createPersona, getAgentPersonas } from '../db/personas';
import {
    handleAgentSkillCommand,
    handleAgentPersonaCommand,
} from '../discord/command-handlers/agent-config-commands';
import { makeMockChatInteraction } from './helpers/mock-discord-interaction';

let db: Database;

function createTestConfig(overrides: Partial<DiscordBridgeConfig> = {}): DiscordBridgeConfig {
    return {
        botToken: 'test-token',
        channelId: '100000000000000001',
        allowedUserIds: ['200000000000000001'],
        publicMode: true,
        defaultPermissionLevel: 3,
        mode: 'chat',
        ...overrides,
    };
}

function createTestContext(config?: Partial<DiscordBridgeConfig>): InteractionContext {
    return {
        db,
        config: createTestConfig(config),
        processManager: {
            startProcess: mock(() => {}),
            stopProcess: mock(() => {}),
            subscribe: mock(() => {}),
            unsubscribe: mock(() => {}),
            isRunning: mock(() => true),
        } as unknown as InteractionContext['processManager'],
        workTaskService: null,
        delivery: {
            track: mock(() => {}),
            sendWithReceipt: mock(async (_channel: string, fn: () => Promise<unknown>) => ({ result: await fn() })),
        } as unknown as InteractionContext['delivery'],
        mutedUsers: new Set<string>(),
        threadSessions: new Map(),
        threadCallbacks: new Map(),
        threadLastActivity: new Map(),
        createStandaloneThread: mock(async () => '300000000000000001'),
        subscribeForResponseWithEmbed: mock(() => {}),
        sendTaskResult: mock(async () => {}),
        muteUser: mock((_userId: string) => {}),
        unmuteUser: mock((_userId: string) => {}),
        mentionSessions: new Map(),
        subscribeForInlineResponse: mock(() => {}),
        guildCache: { info: null, roles: [], channels: [] },
        syncGuildData: mock(() => {}),
        userMessageTimestamps: new Map(),
        rateLimitWindowMs: 60_000,
        rateLimitMaxMessages: 10,
    };
}

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterEach(() => {
    db.close();
});

// ── /agent-skill ─────────────────────────────────────────────────────────────

describe('handleAgentSkillCommand', () => {
    test('list returns "no bundles" embed when none assigned', async () => {
        const ctx = createTestContext();
        createAgent(db, { name: 'TestBot', model: 'test-model' });
        const interaction = makeMockChatInteraction('agent-skill', {
            subcommand: 'list',
            strings: { agent: 'TestBot' },
        });

        await handleAgentSkillCommand(ctx, interaction as any, PermissionLevel.ADMIN);

        expect(interaction.getEmbed()).not.toBeNull();
        const embed = interaction.getEmbed() as { description: string };
        expect(embed?.description).toContain('No skill bundles assigned');
    });

    test('add assigns bundle and shows confirmation embed', async () => {
        const ctx = createTestContext();
        const agent = createAgent(db, { name: 'TestBot', model: 'test-model' });
        createBundle(db, { name: 'WebSearch', description: 'Web browsing tools' });

        const interaction = makeMockChatInteraction('agent-skill', {
            subcommand: 'add',
            strings: { agent: 'TestBot', skill: 'WebSearch' },
        });

        await handleAgentSkillCommand(ctx, interaction as any, PermissionLevel.ADMIN);

        // Verify persisted to DB
        const bundles = getAgentBundles(db, agent.id);
        expect(bundles).toHaveLength(1);
        expect(bundles[0].name).toBe('WebSearch');

        // Verify embed response
        const embed = interaction.getEmbed() as { title: string; description: string; color: number };
        expect(embed?.title).toContain('Skill Added');
        expect(embed?.description).toContain('WebSearch');
        expect(embed?.color).toBe(0x57f287);
    });

    test('add is case-insensitive for agent and skill names', async () => {
        const ctx = createTestContext();
        const agent = createAgent(db, { name: 'TestBot', model: 'test-model' });
        createBundle(db, { name: 'WebSearch' });

        const interaction = makeMockChatInteraction('agent-skill', {
            subcommand: 'add',
            strings: { agent: 'testbot', skill: 'websearch' },
        });

        await handleAgentSkillCommand(ctx, interaction as any, PermissionLevel.ADMIN);

        const bundles = getAgentBundles(db, agent.id);
        expect(bundles).toHaveLength(1);
    });

    test('add strips model suffix from agent name', async () => {
        const ctx = createTestContext();
        const agent = createAgent(db, { name: 'TestBot', model: 'claude-opus-4-6' });
        createBundle(db, { name: 'WebSearch' });

        const interaction = makeMockChatInteraction('agent-skill', {
            subcommand: 'add',
            strings: { agent: 'TestBot (claude-opus-4-6)', skill: 'WebSearch' },
        });

        await handleAgentSkillCommand(ctx, interaction as any, PermissionLevel.ADMIN);

        const bundles = getAgentBundles(db, agent.id);
        expect(bundles).toHaveLength(1);
    });

    test('add strips description suffix from skill name (autocomplete format)', async () => {
        const ctx = createTestContext();
        const agent = createAgent(db, { name: 'TestBot', model: 'test-model' });
        createBundle(db, { name: 'WebSearch', description: 'Web browsing tools' });

        const interaction = makeMockChatInteraction('agent-skill', {
            subcommand: 'add',
            strings: { agent: 'TestBot', skill: 'WebSearch — Web browsing tools' },
        });

        await handleAgentSkillCommand(ctx, interaction as any, PermissionLevel.ADMIN);

        const bundles = getAgentBundles(db, agent.id);
        expect(bundles).toHaveLength(1);
    });

    test('remove unassigns bundle and shows confirmation embed', async () => {
        const ctx = createTestContext();
        const agent = createAgent(db, { name: 'TestBot', model: 'test-model' });
        createBundle(db, { name: 'WebSearch' });

        // Pre-assign
        const addInteraction = makeMockChatInteraction('agent-skill', {
            subcommand: 'add',
            strings: { agent: 'TestBot', skill: 'WebSearch' },
        });
        await handleAgentSkillCommand(ctx, addInteraction as any, PermissionLevel.ADMIN);
        expect(getAgentBundles(db, agent.id)).toHaveLength(1);

        // Now remove
        const removeInteraction = makeMockChatInteraction('agent-skill', {
            subcommand: 'remove',
            strings: { agent: 'TestBot', skill: 'WebSearch' },
        });
        await handleAgentSkillCommand(ctx, removeInteraction as any, PermissionLevel.ADMIN);

        expect(getAgentBundles(db, agent.id)).toHaveLength(0);
        const embed = removeInteraction.getEmbed() as { title: string; color: number };
        expect(embed?.title).toContain('Skill Removed');
        expect(embed?.color).toBe(0xed4245);
    });

    test('remove reports error when bundle not assigned', async () => {
        const ctx = createTestContext();
        createAgent(db, { name: 'TestBot', model: 'test-model' });
        createBundle(db, { name: 'WebSearch' });

        const interaction = makeMockChatInteraction('agent-skill', {
            subcommand: 'remove',
            strings: { agent: 'TestBot', skill: 'WebSearch' },
        });

        await handleAgentSkillCommand(ctx, interaction as any, PermissionLevel.ADMIN);

        expect(interaction.getContent()).toContain('was not assigned');
    });

    test('reports error when agent not found', async () => {
        const ctx = createTestContext();
        createAgent(db, { name: 'TestBot', model: 'test-model' });

        const interaction = makeMockChatInteraction('agent-skill', {
            subcommand: 'list',
            strings: { agent: 'NonExistentBot' },
        });

        await handleAgentSkillCommand(ctx, interaction as any, PermissionLevel.ADMIN);

        const content = interaction.getContent();
        expect(content).toContain('Agent not found');
        expect(content).toContain('TestBot');
    });

    test('reports error when skill bundle not found', async () => {
        const ctx = createTestContext();
        createAgent(db, { name: 'TestBot', model: 'test-model' });

        const interaction = makeMockChatInteraction('agent-skill', {
            subcommand: 'add',
            strings: { agent: 'TestBot', skill: 'NonExistentSkill' },
        });

        await handleAgentSkillCommand(ctx, interaction as any, PermissionLevel.ADMIN);

        expect(interaction.getContent()).toContain('Skill bundle not found');
    });

    test('list shows all assigned bundles', async () => {
        const ctx = createTestContext();
        const agent = createAgent(db, { name: 'TestBot', model: 'test-model' });
        const b1 = createBundle(db, { name: 'WebSearch' });
        const b2 = createBundle(db, { name: 'CodeTools' });

        for (const b of [b1, b2]) {
            const interaction = makeMockChatInteraction('agent-skill', {
                subcommand: 'add',
                strings: { agent: 'TestBot', skill: b.name },
            });
            await handleAgentSkillCommand(ctx, interaction as any, PermissionLevel.ADMIN);
        }

        const listInteraction = makeMockChatInteraction('agent-skill', {
            subcommand: 'list',
            strings: { agent: 'TestBot' },
        });
        await handleAgentSkillCommand(ctx, listInteraction as any, PermissionLevel.ADMIN);

        const embed = listInteraction.getEmbed() as { description: string };
        expect(embed?.description).toContain('WebSearch');
        expect(embed?.description).toContain('CodeTools');
        expect(getAgentBundles(db, agent.id)).toHaveLength(2);
    });
});

// ── /agent-persona ────────────────────────────────────────────────────────────

describe('handleAgentPersonaCommand', () => {
    test('list returns "no personas" embed when none assigned', async () => {
        const ctx = createTestContext();
        createAgent(db, { name: 'TestBot', model: 'test-model' });
        const interaction = makeMockChatInteraction('agent-persona', {
            subcommand: 'list',
            strings: { agent: 'TestBot' },
        });

        await handleAgentPersonaCommand(ctx, interaction as any, PermissionLevel.ADMIN);

        const embed = interaction.getEmbed() as { description: string };
        expect(embed?.description).toContain('No personas assigned');
    });

    test('add assigns persona and shows confirmation embed', async () => {
        const ctx = createTestContext();
        const agent = createAgent(db, { name: 'TestBot', model: 'test-model' });
        createPersona(db, { name: 'FriendlyHelper', archetype: 'professional', traits: [] });

        const interaction = makeMockChatInteraction('agent-persona', {
            subcommand: 'add',
            strings: { agent: 'TestBot', persona: 'FriendlyHelper' },
        });

        await handleAgentPersonaCommand(ctx, interaction as any, PermissionLevel.ADMIN);

        const personas = getAgentPersonas(db, agent.id);
        expect(personas).toHaveLength(1);
        expect(personas[0].name).toBe('FriendlyHelper');

        const embed = interaction.getEmbed() as { title: string; color: number };
        expect(embed?.title).toContain('Persona Added');
        expect(embed?.color).toBe(0x57f287);
    });

    test('add strips archetype suffix from persona name (autocomplete format)', async () => {
        const ctx = createTestContext();
        const agent = createAgent(db, { name: 'TestBot', model: 'test-model' });
        createPersona(db, { name: 'FriendlyHelper', archetype: 'professional', traits: [] });

        const interaction = makeMockChatInteraction('agent-persona', {
            subcommand: 'add',
            strings: { agent: 'TestBot', persona: 'FriendlyHelper (assistant)' },
        });

        await handleAgentPersonaCommand(ctx, interaction as any, PermissionLevel.ADMIN);

        expect(getAgentPersonas(db, agent.id)).toHaveLength(1);
    });

    test('remove unassigns persona and shows confirmation embed', async () => {
        const ctx = createTestContext();
        const agent = createAgent(db, { name: 'TestBot', model: 'test-model' });
        createPersona(db, { name: 'FriendlyHelper', archetype: 'professional', traits: [] });

        // Pre-assign
        const addInteraction = makeMockChatInteraction('agent-persona', {
            subcommand: 'add',
            strings: { agent: 'TestBot', persona: 'FriendlyHelper' },
        });
        await handleAgentPersonaCommand(ctx, addInteraction as any, PermissionLevel.ADMIN);
        expect(getAgentPersonas(db, agent.id)).toHaveLength(1);

        // Now remove
        const removeInteraction = makeMockChatInteraction('agent-persona', {
            subcommand: 'remove',
            strings: { agent: 'TestBot', persona: 'FriendlyHelper' },
        });
        await handleAgentPersonaCommand(ctx, removeInteraction as any, PermissionLevel.ADMIN);

        expect(getAgentPersonas(db, agent.id)).toHaveLength(0);
        const embed = removeInteraction.getEmbed() as { title: string; color: number };
        expect(embed?.title).toContain('Persona Removed');
        expect(embed?.color).toBe(0xed4245);
    });

    test('remove reports error when persona not assigned', async () => {
        const ctx = createTestContext();
        createAgent(db, { name: 'TestBot', model: 'test-model' });
        createPersona(db, { name: 'FriendlyHelper', archetype: 'professional', traits: [] });

        const interaction = makeMockChatInteraction('agent-persona', {
            subcommand: 'remove',
            strings: { agent: 'TestBot', persona: 'FriendlyHelper' },
        });

        await handleAgentPersonaCommand(ctx, interaction as any, PermissionLevel.ADMIN);

        expect(interaction.getContent()).toContain('was not assigned');
    });

    test('reports error when agent not found', async () => {
        const ctx = createTestContext();
        createAgent(db, { name: 'TestBot', model: 'test-model' });

        const interaction = makeMockChatInteraction('agent-persona', {
            subcommand: 'list',
            strings: { agent: 'NonExistentBot' },
        });

        await handleAgentPersonaCommand(ctx, interaction as any, PermissionLevel.ADMIN);

        expect(interaction.getContent()).toContain('Agent not found');
    });

    test('reports error when persona not found', async () => {
        const ctx = createTestContext();
        createAgent(db, { name: 'TestBot', model: 'test-model' });

        const interaction = makeMockChatInteraction('agent-persona', {
            subcommand: 'add',
            strings: { agent: 'TestBot', persona: 'NonExistentPersona' },
        });

        await handleAgentPersonaCommand(ctx, interaction as any, PermissionLevel.ADMIN);

        expect(interaction.getContent()).toContain('Persona not found');
    });
});

// ── Integration via handleInteraction ─────────────────────────────────────────

describe('handleInteraction dispatch', () => {
    test('routes agent-skill to handler', async () => {
        const ctx = createTestContext({ defaultPermissionLevel: 3 });
        createAgent(db, { name: 'TestBot', model: 'test-model' });

        const interaction = makeMockChatInteraction('agent-skill', {
            subcommand: 'list',
            strings: { agent: 'TestBot' },
        });

        await handleInteraction(ctx, interaction as any);

        const embed = interaction.getEmbed() as { title: string };
        expect(embed?.title).toContain('Skills: TestBot');
    });

    test('routes agent-persona to handler', async () => {
        const ctx = createTestContext({ defaultPermissionLevel: 3 });
        createAgent(db, { name: 'TestBot', model: 'test-model' });

        const interaction = makeMockChatInteraction('agent-persona', {
            subcommand: 'list',
            strings: { agent: 'TestBot' },
        });

        await handleInteraction(ctx, interaction as any);

        const embed = interaction.getEmbed() as { title: string };
        expect(embed?.title).toContain('Personas: TestBot');
    });
});

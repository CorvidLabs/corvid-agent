import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { listAgents } from '../db/agents';
import { seedConversationalAgents } from '../conversational/seed';
import { CONVERSATIONAL_PRESETS } from '../conversational/presets';

let db: Database;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterEach(() => db.close());

describe('seedConversationalAgents', () => {
    it('seeds all preset agents', async () => {
        await seedConversationalAgents({ db });

        const agents = listAgents(db);
        const presetAgents = agents.filter((a) => {
            const flags = a.customFlags as Record<string, unknown> | null;
            return flags?.presetKey;
        });

        expect(presetAgents.length).toBe(CONVERSATIONAL_PRESETS.length);
    });

    it('creates agents with correct properties', async () => {
        await seedConversationalAgents({ db });

        const agents = listAgents(db);
        const helper = agents.find((a) => a.name === 'Algorand Helper');

        expect(helper).toBeDefined();
        expect(helper!.algochatEnabled).toBe(true);
        expect(helper!.conversationMode).toBe('public');
        expect(helper!.systemPrompt).toContain('Algorand');
        expect(helper!.model).toBe('claude-haiku-4-5-20251001');
    });

    it('is idempotent — does not create duplicates', async () => {
        await seedConversationalAgents({ db });
        await seedConversationalAgents({ db });

        const agents = listAgents(db);
        const presetAgents = agents.filter((a) => {
            const flags = a.customFlags as Record<string, unknown> | null;
            return flags?.presetKey;
        });

        expect(presetAgents.length).toBe(CONVERSATIONAL_PRESETS.length);
    });

    it('preserves existing preset agents across re-seed', async () => {
        await seedConversationalAgents({ db });

        const first = listAgents(db);
        const firstIds = first.map((a) => a.id).sort();

        await seedConversationalAgents({ db });

        const second = listAgents(db);
        const secondIds = second.map((a) => a.id).sort();

        expect(firstIds).toEqual(secondIds);
    });

    it('sets conversationRateLimitMax from preset', async () => {
        await seedConversationalAgents({ db });

        const agents = listAgents(db);
        const general = agents.find((a) => a.name === 'General Assistant');

        expect(general).toBeDefined();
        expect(general!.conversationRateLimitMax).toBe(30);
    });

    it('stores presetKey in customFlags', async () => {
        await seedConversationalAgents({ db });

        const agents = listAgents(db);
        const guide = agents.find((a) => a.name === 'corvid-agent Guide');

        expect(guide).toBeDefined();
        const flags = guide!.customFlags as Record<string, unknown>;
        expect(flags.presetKey).toBe('corvid-guide');
    });

    it('sets algochatAuto to false for preset agents', async () => {
        await seedConversationalAgents({ db });

        const agents = listAgents(db);
        for (const agent of agents) {
            const flags = agent.customFlags as Record<string, unknown> | null;
            if (flags?.presetKey) {
                // Preset agents should NOT be auto-respond — the main agent handles that
                expect(agent.algochatAuto).toBe(false);
            }
        }
    });
});

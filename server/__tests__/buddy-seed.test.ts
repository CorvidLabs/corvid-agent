/**
 * Tests for buddy seed — auto-pairing main agent with all preset agents.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { createAgent } from '../db/agents';
import { listBuddyPairings } from '../db/buddy';
import { seedDefaultBuddyPairings } from '../buddy/seed';

let db: Database;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterEach(() => {
    db.close();
});

describe('seedDefaultBuddyPairings', () => {
    test('pairs main agent with all preset agents', () => {
        const main = createAgent(db, {
            name: 'CorvidAgent',
            description: 'Primary agent',
            algochatEnabled: true,
            algochatAuto: true,
        });

        const sonnet = createAgent(db, {
            name: 'Sonnet Agent',
            description: 'Buddy agent',
            algochatEnabled: true,
            algochatAuto: false,
            customFlags: { presetKey: 'sonnet-agent' },
        });

        const helper = createAgent(db, {
            name: 'Algorand Helper',
            description: 'Helper agent',
            algochatEnabled: true,
            algochatAuto: false,
            customFlags: { presetKey: 'algorand-helper' },
        });

        seedDefaultBuddyPairings({ db });

        const pairings = listBuddyPairings(db, main.id);
        expect(pairings).toHaveLength(2);

        const buddyIds = pairings.map((p) => p.buddyAgentId).sort();
        expect(buddyIds).toContain(sonnet.id);
        expect(buddyIds).toContain(helper.id);

        for (const p of pairings) {
            expect(p.buddyRole).toBe('reviewer');
            expect(p.maxRounds).toBe(3);
            expect(p.enabled).toBe(true);
        }
    });

    test('is idempotent — does not duplicate pairings', () => {
        createAgent(db, {
            name: 'CorvidAgent',
            description: 'Primary agent',
            algochatEnabled: true,
            algochatAuto: true,
        });

        createAgent(db, {
            name: 'Sonnet Agent',
            description: 'Buddy agent',
            algochatEnabled: true,
            algochatAuto: false,
            customFlags: { presetKey: 'sonnet-agent' },
        });

        seedDefaultBuddyPairings({ db });
        seedDefaultBuddyPairings({ db });
        seedDefaultBuddyPairings({ db });

        const main = db.prepare("SELECT * FROM agents WHERE algochat_auto = 1").get() as { id: string };
        const pairings = listBuddyPairings(db, main.id);
        expect(pairings).toHaveLength(1);
    });

    test('picks up new preset agents on subsequent calls', () => {
        const main = createAgent(db, {
            name: 'CorvidAgent',
            description: 'Primary agent',
            algochatEnabled: true,
            algochatAuto: true,
        });

        createAgent(db, {
            name: 'Sonnet Agent',
            description: 'Buddy agent',
            algochatEnabled: true,
            algochatAuto: false,
            customFlags: { presetKey: 'sonnet-agent' },
        });

        seedDefaultBuddyPairings({ db });
        expect(listBuddyPairings(db, main.id)).toHaveLength(1);

        // Add another preset agent later
        createAgent(db, {
            name: 'General Assistant',
            description: 'General agent',
            algochatEnabled: true,
            algochatAuto: false,
            customFlags: { presetKey: 'general-assistant' },
        });

        seedDefaultBuddyPairings({ db });
        expect(listBuddyPairings(db, main.id)).toHaveLength(2);
    });

    test('skips gracefully when no main agent exists', () => {
        createAgent(db, {
            name: 'Sonnet Agent',
            description: 'Buddy agent',
            algochatEnabled: true,
            algochatAuto: false,
            customFlags: { presetKey: 'sonnet-agent' },
        });

        // Should not throw
        seedDefaultBuddyPairings({ db });
    });

    test('skips gracefully when no preset agents exist', () => {
        createAgent(db, {
            name: 'CorvidAgent',
            description: 'Primary agent',
            algochatEnabled: true,
            algochatAuto: true,
        });

        // Should not throw
        seedDefaultBuddyPairings({ db });
    });
});

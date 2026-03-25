/**
 * Seed default buddy pairings on startup.
 *
 * Ensures the main agent (algochatAuto) is automatically paired with
 * all conversational preset agents as reviewer buddies. This makes
 * buddy mode work out of the box regardless of which agent is chosen.
 *
 * Safe to call multiple times — idempotent via existing-pairing check.
 */

import type { Database } from 'bun:sqlite';
import { getAlgochatEnabledAgents, listAgents } from '../db/agents';
import { listBuddyPairings, createBuddyPairing } from '../db/buddy';
import { CONVERSATIONAL_PRESETS } from '../conversational/presets';
import { createLogger } from '../lib/logger';

const log = createLogger('BuddySeed');

/** All preset keys from the conversational presets. */
const PRESET_KEYS = new Set(CONVERSATIONAL_PRESETS.map((p) => p.presetKey));

/**
 * Find the main agent — the first algochatAuto-enabled agent.
 */
function findMainAgent(db: Database): { id: string; name: string } | null {
    const agents = getAlgochatEnabledAgents(db);
    const main = agents.find((a) => a.algochatAuto);
    return main ? { id: main.id, name: main.name } : null;
}

/**
 * Find all conversational preset agents (by presetKey in custom_flags).
 */
function findPresetAgents(db: Database): Array<{ id: string; name: string; presetKey: string }> {
    const agents = listAgents(db);
    const results: Array<{ id: string; name: string; presetKey: string }> = [];

    for (const a of agents) {
        const flags = a.customFlags;
        if (flags && typeof flags === 'object') {
            const key = (flags as Record<string, unknown>).presetKey;
            if (typeof key === 'string' && PRESET_KEYS.has(key)) {
                results.push({ id: a.id, name: a.name, presetKey: key });
            }
        }
    }

    return results;
}

export interface SeedBuddyPairingsOpts {
    db: Database;
}

/**
 * Seed default buddy pairings.
 *
 * Pairs the main agent with every conversational preset agent that
 * doesn't already have a pairing. Role: reviewer, 3 rounds.
 */
export function seedDefaultBuddyPairings(opts: SeedBuddyPairingsOpts): void {
    const { db } = opts;

    const mainAgent = findMainAgent(db);
    if (!mainAgent) {
        log.debug('No main agent found — skipping buddy seed');
        return;
    }

    const presetAgents = findPresetAgents(db);
    if (presetAgents.length === 0) {
        log.debug('No conversational preset agents found — skipping buddy seed');
        return;
    }

    // Get existing pairings once
    const existingPairings = listBuddyPairings(db, mainAgent.id);
    const pairedBuddyIds = new Set(existingPairings.map((p) => p.buddyAgentId));

    let seeded = 0;
    for (const buddy of presetAgents) {
        // Skip self-pairing
        if (buddy.id === mainAgent.id) continue;
        // Skip already paired
        if (pairedBuddyIds.has(buddy.id)) continue;

        const pairing = createBuddyPairing(db, mainAgent.id, buddy.id, {
            maxRounds: 3,
            buddyRole: 'reviewer',
        });

        log.info('Seeded buddy pairing', {
            pairingId: pairing.id,
            mainAgent: mainAgent.name,
            buddy: buddy.name,
            role: pairing.buddyRole,
        });
        seeded++;
    }

    if (seeded > 0) {
        log.info(`Seeded ${seeded} buddy pairing(s)`);
    } else {
        log.debug('All preset agents already paired — nothing to seed');
    }
}

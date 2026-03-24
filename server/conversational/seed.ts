/**
 * Seed conversational agent presets on startup.
 *
 * Creates agents from CONVERSATIONAL_PRESETS if they don't already exist
 * (matched by the `presetKey` stored in custom_flags).  After creation,
 * ensures each agent has a wallet and is registered in the Flock Directory.
 *
 * See: #1185
 */

import type { Database } from 'bun:sqlite';
import { createAgent, listAgents } from '../db/agents';
import type { Agent } from '../../shared/types';
import type { AgentWalletService } from '../algochat/agent-wallet';
import type { FlockDirectoryService } from '../flock-directory/service';
import { CONVERSATIONAL_PRESETS, type ConversationalPreset } from './presets';
import { createLogger } from '../lib/logger';

const log = createLogger('ConversationalSeed');

/**
 * Check if a preset has already been seeded by looking for its presetKey
 * in existing agents' custom_flags.
 */
function findExistingPreset(agents: Agent[], presetKey: string): Agent | undefined {
    return agents.find((a) => {
        const flags = a.customFlags;
        return flags && typeof flags === 'object' && (flags as Record<string, unknown>).presetKey === presetKey;
    });
}

/**
 * Seed a single conversational agent preset.
 * Returns the agent (existing or newly created).
 */
function seedPreset(db: Database, preset: ConversationalPreset, existingAgents: Agent[]): Agent | null {
    const existing = findExistingPreset(existingAgents, preset.presetKey);
    if (existing) {
        log.debug('Preset already seeded', { presetKey: preset.presetKey, agentId: existing.id });
        return existing;
    }

    try {
        const agent = createAgent(db, {
            ...preset,
            customFlags: { presetKey: preset.presetKey },
        });
        log.info('Seeded conversational agent', {
            presetKey: preset.presetKey,
            agentId: agent.id,
            name: agent.name,
        });
        return agent;
    } catch (err) {
        log.error('Failed to seed preset', {
            presetKey: preset.presetKey,
            error: err instanceof Error ? err.message : String(err),
        });
        return null;
    }
}

/**
 * Register an agent in the Flock Directory once it has a wallet address.
 */
async function registerInFlockDirectory(
    flockService: FlockDirectoryService,
    agent: Agent,
    preset: ConversationalPreset,
    instanceUrl: string,
): Promise<void> {
    if (!agent.walletAddress) return;

    try {
        await flockService.selfRegister({
            address: agent.walletAddress,
            name: agent.name,
            description: preset.flockDescription,
            instanceUrl,
            capabilities: preset.flockCapabilities,
        });
        log.info('Registered conversational agent in Flock Directory', {
            agentId: agent.id,
            name: agent.name,
            address: agent.walletAddress,
        });
    } catch (err) {
        log.warn('Failed to register agent in Flock Directory', {
            agentId: agent.id,
            error: err instanceof Error ? err.message : String(err),
        });
    }
}

export interface SeedConversationalAgentsOpts {
    db: Database;
    walletService?: AgentWalletService | null;
    flockDirectoryService?: FlockDirectoryService | null;
}

/**
 * Seed all conversational agent presets.
 *
 * 1. Creates missing agents from presets
 * 2. Ensures each has a wallet (localnet/testnet only)
 * 3. Registers each in the Flock Directory
 *
 * Safe to call multiple times — idempotent via presetKey check.
 */
export async function seedConversationalAgents(opts: SeedConversationalAgentsOpts): Promise<void> {
    const { db, walletService, flockDirectoryService } = opts;
    const existingAgents = listAgents(db);

    const instanceUrl = process.env.SERVER_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
    let seeded = 0;

    for (const preset of CONVERSATIONAL_PRESETS) {
        const agent = seedPreset(db, preset, existingAgents);
        if (!agent) continue;

        // Ensure wallet exists
        if (walletService && !agent.walletAddress) {
            try {
                await walletService.ensureWallet(agent.id);
            } catch (err) {
                log.debug('Wallet creation for preset agent failed (non-blocking)', {
                    agentId: agent.id,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }

        // Re-read agent to get wallet address after ensureWallet
        const { getAgent } = await import('../db/agents');
        const updated = getAgent(db, agent.id);

        // Register in Flock Directory
        if (flockDirectoryService && updated?.walletAddress) {
            await registerInFlockDirectory(flockDirectoryService, updated, preset, instanceUrl);
        }

        // Count newly seeded (not pre-existing)
        if (!findExistingPreset(existingAgents, preset.presetKey)) {
            seeded++;
        }
    }

    if (seeded > 0) {
        log.info('Conversational agent seeding complete', {
            seeded,
            total: CONVERSATIONAL_PRESETS.length,
        });
    }
}

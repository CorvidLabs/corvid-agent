/**
 * Seed Alpha Ops agents on startup.
 *
 * Creates agents from ALPHA_OPS_PRESETS if they don't already exist
 * (matched by the `presetKey` stored in custom_flags).  After creation,
 * ensures each agent has a wallet and is registered in the Flock Directory.
 *
 * Mirrors the pattern established by server/conversational/seed.ts.
 * See: docs/alpha-ops-agents.md
 */

import type { Database } from 'bun:sqlite';
import { createAgent, listAgents } from '../db/agents';
import type { Agent } from '../../shared/types';
import type { AgentWalletService } from '../algochat/agent-wallet';
import type { FlockDirectoryService } from '../flock-directory/service';
import { ALPHA_OPS_PRESETS, type AlphaOpsPreset } from './presets';
import { createLogger } from '../lib/logger';

const log = createLogger('AlphaOpsSeed');

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
 * Seed a single Alpha Ops agent preset.
 * Returns the agent (existing or newly created).
 */
function seedPreset(db: Database, preset: AlphaOpsPreset, existingAgents: Agent[]): Agent | null {
    const existing = findExistingPreset(existingAgents, preset.presetKey);
    if (existing) {
        log.debug('Preset already seeded', { presetKey: preset.presetKey, agentId: existing.id });
        return existing;
    }

    try {
        const agent = createAgent(db, {
            ...preset,
            customFlags: {
                presetKey: preset.presetKey,
                alphaOps: 'true',
                ownedActionTypes: JSON.stringify(preset.ownedActionTypes),
            },
        });
        log.info('Seeded Alpha Ops agent', {
            presetKey: preset.presetKey,
            agentId: agent.id,
            name: agent.name,
        });
        return agent;
    } catch (err) {
        log.error('Failed to seed Alpha Ops preset', {
            presetKey: preset.presetKey,
            error: err instanceof Error ? err.message : String(err),
        });
        return null;
    }
}

/**
 * Register an Alpha Ops agent in the Flock Directory once it has a wallet address.
 */
async function registerInFlockDirectory(
    flockService: FlockDirectoryService,
    agent: Agent,
    preset: AlphaOpsPreset,
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
        log.info('Registered Alpha Ops agent in Flock Directory', {
            agentId: agent.id,
            name: agent.name,
            address: agent.walletAddress,
        });
    } catch (err) {
        log.warn('Failed to register Alpha Ops agent in Flock Directory', {
            agentId: agent.id,
            error: err instanceof Error ? err.message : String(err),
        });
    }
}

export interface SeedAlphaOpsAgentsOpts {
    db: Database;
    walletService?: AgentWalletService | null;
    flockDirectoryService?: FlockDirectoryService | null;
}

/**
 * Seed all Alpha Ops agent presets.
 *
 * 1. Creates missing agents from presets
 * 2. Ensures each has a wallet (localnet/testnet only)
 * 3. Registers each in the Flock Directory
 *
 * Safe to call multiple times — idempotent via presetKey check.
 */
export async function seedAlphaOpsAgents(opts: SeedAlphaOpsAgentsOpts): Promise<void> {
    const { db, walletService, flockDirectoryService } = opts;
    const existingAgents = listAgents(db);

    const instanceUrl = process.env.SERVER_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
    let seeded = 0;

    for (const preset of ALPHA_OPS_PRESETS) {
        const isNew = !findExistingPreset(existingAgents, preset.presetKey);
        const agent = seedPreset(db, preset, existingAgents);
        if (!agent) continue;

        // Ensure wallet exists
        if (walletService && !agent.walletAddress) {
            try {
                await walletService.ensureWallet(agent.id);
            } catch (err) {
                log.debug('Wallet creation for Alpha Ops agent failed (non-blocking)', {
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

        if (isNew) seeded++;
    }

    if (seeded > 0) {
        log.info('Alpha Ops agent seeding complete', {
            seeded,
            total: ALPHA_OPS_PRESETS.length,
        });
    }
}

/**
 * Look up the agent ID for a given Alpha Ops presetKey.
 * Returns null if not yet seeded.
 */
export function getAlphaOpsAgentId(db: Database, presetKey: string): string | null {
    const agents = listAgents(db);
    const agent = agents.find((a) => {
        const flags = a.customFlags;
        return flags && typeof flags === 'object' && (flags as Record<string, unknown>).presetKey === presetKey;
    });
    return agent?.id ?? null;
}

/**
 * Return a map of presetKey → agent ID for all seeded Alpha Ops agents.
 * Useful for reassigning schedules to their canonical owners.
 */
export function getAlphaOpsAgentMap(db: Database): Record<string, string> {
    const agents = listAgents(db);
    const result: Record<string, string> = {};
    for (const agent of agents) {
        const flags = agent.customFlags;
        if (flags && typeof flags === 'object') {
            const f = flags as Record<string, string>;
            if (f.alphaOps === 'true' && f.presetKey) {
                result[f.presetKey] = agent.id;
            }
        }
    }
    return result;
}

/**
 * Discord agent skill and persona configuration command handlers.
 *
 * Handles `/agent-skill` and `/agent-persona` commands for hot-swapping
 * agent skill bundles and personas. Changes take effect on the agent's
 * next session — existing sessions are unaffected.
 */

import type { Database } from 'bun:sqlite';
import type { InteractionContext } from '../commands';
import type { DiscordInteractionData } from '../types';
import { PermissionLevel } from '../types';
import { listAgents } from '../../db/agents';
import {
    listBundles,
    getAgentBundles,
    assignBundle,
    unassignBundle,
} from '../../db/skill-bundles';
import {
    listPersonas,
    getAgentPersonas,
    assignPersona,
    unassignPersona,
} from '../../db/personas';
import { respondToInteraction, respondToInteractionEmbed } from '../embeds';
import { createLogger } from '../../lib/logger';

const log = createLogger('DiscordCommands');

/** Resolve an agent by display name (strips model suffix, case-insensitive). */
function resolveAgentByName(db: Database, agentName: string) {
    const agents = listAgents(db);
    const cleanName = agentName.split(' (')[0].trim();
    const agent = agents.find(
        a =>
            a.name.toLowerCase() === cleanName.toLowerCase() ||
            a.name.toLowerCase().replace(/\s+/g, '') === cleanName.toLowerCase().replace(/\s+/g, ''),
    );
    return { agent, agents };
}

/**
 * Handles `/agent-skill add|remove|list` commands.
 *
 * - `add <agent> <skill>` — assign a skill bundle to an agent
 * - `remove <agent> <skill>` — unassign a skill bundle
 * - `list <agent>` — show currently assigned skill bundles
 */
export async function handleAgentSkillCommand(
    ctx: InteractionContext,
    interaction: DiscordInteractionData,
    permLevel: number,
): Promise<void> {
    if (permLevel < PermissionLevel.ADMIN) {
        await respondToInteraction(interaction, 'Managing agent skills requires admin permissions.');
        return;
    }

    const options = interaction.data?.options ?? [];
    const subcommand = options[0];
    if (!subcommand) {
        await respondToInteraction(interaction, 'Missing subcommand.');
        return;
    }

    const subName = subcommand.name;
    const subOpts = subcommand.options ?? [];
    const getSubOption = (name: string) => subOpts.find(o => o.name === name)?.value as string | undefined;

    const agentName = getSubOption('agent');
    if (!agentName) {
        await respondToInteraction(interaction, 'Please specify an agent.');
        return;
    }

    const { agent, agents } = resolveAgentByName(ctx.db, agentName);
    if (!agent) {
        if (agents.length === 0) {
            await respondToInteraction(interaction, 'No agents configured.');
            return;
        }
        const names = agents.map(a => a.name).join(', ');
        await respondToInteraction(interaction, `Agent not found: "${agentName}". Available: ${names}`);
        return;
    }

    if (subName === 'list') {
        const bundles = getAgentBundles(ctx.db, agent.id);
        if (bundles.length === 0) {
            await respondToInteractionEmbed(interaction, {
                title: `Skills: ${agent.name}`,
                description: 'No skill bundles assigned.',
                color: 0x5865f2,
                footer: { text: 'Use /agent-skill add to assign a skill bundle' },
            });
            return;
        }
        const lines = bundles.map((b, i) =>
            `${i + 1}. **${b.name}**${b.description ? ` — ${b.description}` : ''}`,
        );
        await respondToInteractionEmbed(interaction, {
            title: `Skills: ${agent.name}`,
            description: lines.join('\n'),
            color: 0x5865f2,
            footer: {
                text: `${bundles.length} skill bundle${bundles.length !== 1 ? 's' : ''} assigned · Changes take effect on next session`,
            },
        });
        return;
    }

    // add / remove require the skill option
    const skillName = getSubOption('skill');
    if (!skillName) {
        await respondToInteraction(interaction, 'Please specify a skill bundle.');
        return;
    }

    const allBundles = listBundles(ctx.db);
    const cleanSkillName = skillName.split(' —')[0].trim();
    const bundle = allBundles.find(
        b =>
            b.name.toLowerCase() === cleanSkillName.toLowerCase() ||
            b.name.toLowerCase().replace(/\s+/g, '') === cleanSkillName.toLowerCase().replace(/\s+/g, ''),
    );
    if (!bundle) {
        const names = allBundles.map(b => b.name).join(', ') || 'none configured';
        await respondToInteraction(interaction, `Skill bundle not found: "${skillName}". Available: ${names}`);
        return;
    }

    if (subName === 'add') {
        const ok = assignBundle(ctx.db, agent.id, bundle.id);
        if (!ok) {
            await respondToInteraction(interaction, `Failed to assign skill bundle "${bundle.name}".`);
            return;
        }
        log.info('Agent skill bundle assigned', { agentId: agent.id, bundleId: bundle.id });
        const currentBundles = getAgentBundles(ctx.db, agent.id);
        const lines = currentBundles.map((b, i) => `${i + 1}. **${b.name}**`);
        await respondToInteractionEmbed(interaction, {
            title: `Skill Added: ${agent.name}`,
            description: `✅ **${bundle.name}** has been assigned.\n\n**Current skills:**\n${lines.join('\n')}`,
            color: 0x57f287,
            footer: { text: 'Changes take effect on next session' },
        });
    } else if (subName === 'remove') {
        const ok = unassignBundle(ctx.db, agent.id, bundle.id);
        if (!ok) {
            await respondToInteraction(
                interaction,
                `Skill bundle "${bundle.name}" was not assigned to ${agent.name}.`,
            );
            return;
        }
        log.info('Agent skill bundle unassigned', { agentId: agent.id, bundleId: bundle.id });
        const currentBundles = getAgentBundles(ctx.db, agent.id);
        const desc =
            currentBundles.length === 0
                ? `✅ **${bundle.name}** removed. No skill bundles remain.`
                : `✅ **${bundle.name}** has been removed.\n\n**Remaining skills:**\n${currentBundles.map((b, i) => `${i + 1}. **${b.name}**`).join('\n')}`;
        await respondToInteractionEmbed(interaction, {
            title: `Skill Removed: ${agent.name}`,
            description: desc,
            color: 0xed4245,
            footer: { text: 'Changes take effect on next session' },
        });
    } else {
        await respondToInteraction(interaction, `Unknown subcommand: ${subName}`);
    }
}

/**
 * Handles `/agent-persona add|remove|list` commands.
 *
 * - `add <agent> <persona>` — assign a persona to an agent
 * - `remove <agent> <persona>` — unassign a persona
 * - `list <agent>` — show currently assigned personas
 */
export async function handleAgentPersonaCommand(
    ctx: InteractionContext,
    interaction: DiscordInteractionData,
    permLevel: number,
): Promise<void> {
    if (permLevel < PermissionLevel.ADMIN) {
        await respondToInteraction(interaction, 'Managing agent personas requires admin permissions.');
        return;
    }

    const options = interaction.data?.options ?? [];
    const subcommand = options[0];
    if (!subcommand) {
        await respondToInteraction(interaction, 'Missing subcommand.');
        return;
    }

    const subName = subcommand.name;
    const subOpts = subcommand.options ?? [];
    const getSubOption = (name: string) => subOpts.find(o => o.name === name)?.value as string | undefined;

    const agentName = getSubOption('agent');
    if (!agentName) {
        await respondToInteraction(interaction, 'Please specify an agent.');
        return;
    }

    const { agent, agents } = resolveAgentByName(ctx.db, agentName);
    if (!agent) {
        if (agents.length === 0) {
            await respondToInteraction(interaction, 'No agents configured.');
            return;
        }
        const names = agents.map(a => a.name).join(', ');
        await respondToInteraction(interaction, `Agent not found: "${agentName}". Available: ${names}`);
        return;
    }

    if (subName === 'list') {
        const personas = getAgentPersonas(ctx.db, agent.id);
        if (personas.length === 0) {
            await respondToInteractionEmbed(interaction, {
                title: `Personas: ${agent.name}`,
                description: 'No personas assigned.',
                color: 0xfee75c,
                footer: { text: 'Use /agent-persona add to assign a persona' },
            });
            return;
        }
        const lines = personas.map((p, i) =>
            `${i + 1}. **${p.name}**${p.archetype !== 'custom' ? ` (${p.archetype})` : ''}`,
        );
        await respondToInteractionEmbed(interaction, {
            title: `Personas: ${agent.name}`,
            description: lines.join('\n'),
            color: 0xfee75c,
            footer: {
                text: `${personas.length} persona${personas.length !== 1 ? 's' : ''} assigned · Changes take effect on next session`,
            },
        });
        return;
    }

    // add / remove require the persona option
    const personaName = getSubOption('persona');
    if (!personaName) {
        await respondToInteraction(interaction, 'Please specify a persona.');
        return;
    }

    const allPersonas = listPersonas(ctx.db);
    const cleanPersonaName = personaName.split(' (')[0].trim();
    const persona = allPersonas.find(
        p =>
            p.name.toLowerCase() === cleanPersonaName.toLowerCase() ||
            p.name.toLowerCase().replace(/\s+/g, '') === cleanPersonaName.toLowerCase().replace(/\s+/g, ''),
    );
    if (!persona) {
        const names = allPersonas.map(p => p.name).join(', ') || 'none configured';
        await respondToInteraction(interaction, `Persona not found: "${personaName}". Available: ${names}`);
        return;
    }

    if (subName === 'add') {
        const ok = assignPersona(ctx.db, agent.id, persona.id);
        if (!ok) {
            await respondToInteraction(interaction, `Failed to assign persona "${persona.name}".`);
            return;
        }
        log.info('Agent persona assigned', { agentId: agent.id, personaId: persona.id });
        const currentPersonas = getAgentPersonas(ctx.db, agent.id);
        const lines = currentPersonas.map((p, i) => `${i + 1}. **${p.name}**`);
        await respondToInteractionEmbed(interaction, {
            title: `Persona Added: ${agent.name}`,
            description: `✅ **${persona.name}** has been assigned.\n\n**Current personas:**\n${lines.join('\n')}`,
            color: 0x57f287,
            footer: { text: 'Changes take effect on next session' },
        });
    } else if (subName === 'remove') {
        const ok = unassignPersona(ctx.db, agent.id, persona.id);
        if (!ok) {
            await respondToInteraction(
                interaction,
                `Persona "${persona.name}" was not assigned to ${agent.name}.`,
            );
            return;
        }
        log.info('Agent persona unassigned', { agentId: agent.id, personaId: persona.id });
        const currentPersonas = getAgentPersonas(ctx.db, agent.id);
        const desc =
            currentPersonas.length === 0
                ? `✅ **${persona.name}** removed. No personas remain.`
                : `✅ **${persona.name}** has been removed.\n\n**Remaining personas:**\n${currentPersonas.map((p, i) => `${i + 1}. **${p.name}**`).join('\n')}`;
        await respondToInteractionEmbed(interaction, {
            title: `Persona Removed: ${agent.name}`,
            description: desc,
            color: 0xed4245,
            footer: { text: 'Changes take effect on next session' },
        });
    } else {
        await respondToInteraction(interaction, `Unknown subcommand: ${subName}`);
    }
}

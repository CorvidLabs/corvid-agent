/**
 * Discord autocomplete interaction handler.
 *
 * Provides live autocomplete results for agent and project name fields
 * by querying the database on each keystroke.
 */

import type { InteractionContext } from '../commands';
import type { DiscordInteractionData } from '../types';
import { InteractionCallbackType } from '../types';
import { listAgents } from '../../db/agents';
import { listProjects } from '../../db/projects';
import { listBundles } from '../../db/skill-bundles';
import { listPersonas } from '../../db/personas';
import { createLogger } from '../../lib/logger';

const log = createLogger('DiscordCommands');

export async function handleAutocomplete(
    ctx: InteractionContext,
    interaction: DiscordInteractionData,
): Promise<void> {
    const options = interaction.data?.options ?? [];
    const focused = options.find(o => o.focused) ?? options.flatMap(o => o.options ?? []).find(o => o.focused);
    if (!focused) return;

    const query = String(focused.value ?? '').toLowerCase();
    let choices: { name: string; value: string }[] = [];

    if (focused.name === 'agent') {
        const agents = listAgents(ctx.db);
        choices = agents
            .filter(a => !query || a.name.toLowerCase().includes(query))
            .slice(0, 25)
            .map(a => ({
                name: `${a.name} (${a.model || 'unknown'})`.slice(0, 100),
                value: a.name,
            }));
    } else if (focused.name === 'project') {
        const projects = listProjects(ctx.db);
        choices = projects
            .filter(p => !query || p.name.toLowerCase().includes(query) ||
                (p.description ?? '').toLowerCase().includes(query))
            .slice(0, 25)
            .map(p => ({
                name: `${p.name}${p.description ? ` — ${p.description}` : ''}`.slice(0, 100),
                value: p.name,
            }));
    } else if (focused.name === 'skill') {
        const bundles = listBundles(ctx.db);
        choices = bundles
            .filter(b => !query || b.name.toLowerCase().includes(query) ||
                b.description.toLowerCase().includes(query))
            .slice(0, 25)
            .map(b => ({
                name: `${b.name}${b.description ? ` — ${b.description}` : ''}`.slice(0, 100),
                value: b.name,
            }));
    } else if (focused.name === 'persona') {
        const personas = listPersonas(ctx.db);
        choices = personas
            .filter(p => !query || p.name.toLowerCase().includes(query))
            .slice(0, 25)
            .map(p => ({
                name: `${p.name}${p.archetype !== 'custom' ? ` (${p.archetype})` : ''}`.slice(0, 100),
                value: p.name,
            }));
    }

    const { discordFetch } = await import('../embeds');
    const response = await discordFetch(
        `https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: InteractionCallbackType.AUTOCOMPLETE_RESULT,
                data: { choices },
            }),
        },
    );

    if (!response.ok) {
        const error = await response.text();
        log.error('Failed to respond to autocomplete', {
            status: response.status,
            error: error.slice(0, 200),
        });
    }
}

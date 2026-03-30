/**
 * Discord autocomplete interaction handler.
 *
 * Provides live autocomplete results for agent and project name fields
 * by querying the database on each keystroke.
 */

import { listAgents } from '../../db/agents';
import { listCouncils } from '../../db/councils';
import { listPersonas } from '../../db/personas';
import { listProjects } from '../../db/projects';
import { listBundles } from '../../db/skill-bundles';
import { createLogger } from '../../lib/logger';
import type { InteractionContext } from '../commands';
import { discordFetch } from '../embeds';
import type { DiscordInteractionData, DiscordInteractionOption } from '../types';
import { InteractionCallbackType } from '../types';

const log = createLogger('DiscordCommands');

/** Depth-first search for the STRING option the user is typing (Discord marks it `focused`). */
function findFocusedOption(options: DiscordInteractionOption[] | undefined): DiscordInteractionOption | undefined {
  if (!options?.length) return undefined;
  for (const o of options) {
    if (o.focused) return o;
    const nested = findFocusedOption(o.options);
    if (nested) return nested;
  }
  return undefined;
}

export async function handleAutocomplete(ctx: InteractionContext, interaction: DiscordInteractionData): Promise<void> {
  let choices: { name: string; value: string }[] = [];

  try {
    const options = interaction.data?.options ?? [];
    const focused = findFocusedOption(options);

    if (!focused) {
      log.warn('Autocomplete: no focused option in payload', {
        command: interaction.data?.name,
        options: JSON.stringify(options).slice(0, 300),
      });
    }

    const query = focused ? String(focused.value ?? '').toLowerCase() : '';

    if (focused?.name === 'agent' || focused?.name === 'agent_id') {
      const agents = listAgents(ctx.db);
      log.debug('Autocomplete agent query', { query, agentCount: agents.length, field: focused.name });
      choices = agents
        .filter((a) => !query || a.name.toLowerCase().includes(query))
        .slice(0, 25)
        .map((a) => ({
          name: `${a.name} (${a.model || 'unknown'})`.slice(0, 100),
          value: a.name,
        }));
    } else if (focused?.name === 'project') {
      const projects = listProjects(ctx.db);
      choices = projects
        .filter(
          (p) => !query || p.name.toLowerCase().includes(query) || (p.description ?? '').toLowerCase().includes(query),
        )
        .slice(0, 25)
        .map((p) => ({
          name: `${p.name}${p.description ? ` — ${p.description}` : ''}`.slice(0, 100),
          value: p.name,
        }));
    } else if (focused?.name === 'skill') {
      const bundles = listBundles(ctx.db);
      choices = bundles
        .filter((b) => !query || b.name.toLowerCase().includes(query) || b.description.toLowerCase().includes(query))
        .slice(0, 25)
        .map((b) => ({
          name: `${b.name}${b.description ? ` — ${b.description}` : ''}`.slice(0, 100),
          value: b.name,
        }));
    } else if (focused?.name === 'buddy') {
      const agents = listAgents(ctx.db);
      choices = agents
        .filter((a) => !query || a.name.toLowerCase().includes(query))
        .slice(0, 25)
        .map((a) => ({
          name: `${a.name} (${a.model || 'unknown'})`.slice(0, 100),
          value: a.name,
        }));
    } else if (focused?.name === 'council_name') {
      const councils = listCouncils(ctx.db);
      choices = councils
        .filter((c) => !query || c.name.toLowerCase().includes(query))
        .slice(0, 25)
        .map((c) => ({
          name: `${c.name}${c.description ? ` — ${c.description}` : ''}`.slice(0, 100),
          value: c.name,
        }));
    } else if (focused?.name === 'persona') {
      const personas = listPersonas(ctx.db);
      choices = personas
        .filter((p) => !query || p.name.toLowerCase().includes(query))
        .slice(0, 25)
        .map((p) => ({
          name: `${p.name}${p.archetype !== 'custom' ? ` (${p.archetype})` : ''}`.slice(0, 100),
          value: p.name,
        }));
    } else if (focused) {
      log.warn('Autocomplete: unhandled focused field', { field: focused.name, command: interaction.data?.name });
    }
  } catch (err) {
    log.error('Autocomplete: error building choices — sending empty list', {
      command: interaction.data?.name,
      error: err instanceof Error ? err.message : String(err),
    });
    choices = [];
  }

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

/**
 * Discord autocomplete interaction handler.
 *
 * Provides live autocomplete results for agent and project name fields
 * by querying the database on each keystroke.
 */

import type { Database } from 'bun:sqlite';
import type { AutocompleteInteraction } from 'discord.js';
import { listAgents } from '../../db/agents';
import { listPersonas } from '../../db/personas';
import { listProjects } from '../../db/projects';
import { listBundles } from '../../db/skill-bundles';
import { createLogger } from '../../lib/logger';
import type { InteractionContext } from '../commands';

const log = createLogger('DiscordCommands');

/**
 * Discord requires autocomplete responses within 3 seconds of the interaction being created.
 * If we exceed this deadline (e.g. due to event-loop backlog), posting the callback returns
 * a "Unknown interaction" 404. A skipped response is silent on the user side — far better than
 * a logged error for a stale interaction that Discord has already discarded.
 */
const AUTOCOMPLETE_DEADLINE_MS = 2500;

/* ---------- lightweight TTL cache for autocomplete results ---------- */
const CACHE_TTL_MS = 5_000; // 5 seconds — long enough to absorb keystrokes, short enough to stay fresh

interface CacheEntry<T> {
  data: T;
  expires: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

/** Clear the autocomplete cache (used by tests). */
export function clearAutocompleteCache(): void {
  cache.clear();
}

function cached<T>(key: string, fn: () => T): T {
  const now = Date.now();
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (entry && entry.expires > now) return entry.data;
  const data = fn();
  cache.set(key, { data, expires: now + CACHE_TTL_MS });
  return data;
}

/** Lightweight council listing that skips the N+1 member-id lookup. */
function listCouncilNames(db: Database): { name: string; description: string }[] {
  return db.query('SELECT name, description FROM councils ORDER BY updated_at DESC').all() as {
    name: string;
    description: string;
  }[];
}

export async function handleAutocomplete(ctx: InteractionContext, interaction: AutocompleteInteraction): Promise<void> {
  let choices: { name: string; value: string }[] = [];

  try {
    const focused = interaction.options.getFocused(true);

    if (!focused) {
      log.warn('Autocomplete: no focused option in payload', {
        command: interaction.commandName,
      });
    }

    const query = focused ? String(focused.value ?? '').toLowerCase() : '';

    if (focused?.name === 'agent' || focused?.name === 'agent_id' || focused?.name === 'buddy') {
      const agents = cached('agents', () => listAgents(ctx.db));
      log.debug('Autocomplete agent query', { query, agentCount: agents.length, field: focused.name });
      choices = agents
        .filter((a) => !query || a.name.toLowerCase().includes(query))
        .slice(0, 25)
        .map((a) => ({
          name: `${a.name} (${a.model || 'unknown'})`.slice(0, 100),
          value: a.name,
        }));
    } else if (focused?.name === 'project') {
      const projects = cached('projects', () => listProjects(ctx.db));
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
      const bundles = cached('skills', () => listBundles(ctx.db));
      choices = bundles
        .filter((b) => !query || b.name.toLowerCase().includes(query) || b.description.toLowerCase().includes(query))
        .slice(0, 25)
        .map((b) => ({
          name: `${b.name}${b.description ? ` — ${b.description}` : ''}`.slice(0, 100),
          value: b.name,
        }));
    } else if (focused?.name === 'council_name') {
      const councils = cached('councils', () => listCouncilNames(ctx.db));
      choices = councils
        .filter((c) => !query || c.name.toLowerCase().includes(query))
        .slice(0, 25)
        .map((c) => ({
          name: `${c.name}${c.description ? ` — ${c.description}` : ''}`.slice(0, 100),
          value: c.name,
        }));
    } else if (focused?.name === 'persona') {
      const personas = cached('personas', () => listPersonas(ctx.db));
      choices = personas
        .filter((p) => !query || p.name.toLowerCase().includes(query))
        .slice(0, 25)
        .map((p) => ({
          name: `${p.name}${p.archetype !== 'custom' ? ` (${p.archetype})` : ''}`.slice(0, 100),
          value: p.name,
        }));
    } else if (focused) {
      log.warn('Autocomplete: unhandled focused field', { field: focused.name, command: interaction.commandName });
    }
  } catch (err) {
    log.error('Autocomplete: error building choices — sending empty list', {
      command: interaction.commandName,
      error: err instanceof Error ? err.message : String(err),
    });
    choices = [];
  }

  // Guard: skip the response if we're past Discord's 3-second interaction deadline.
  // Sending a stale response results in a 404 "Unknown interaction" error — silence is better.
  if (Date.now() - interaction.createdTimestamp >= AUTOCOMPLETE_DEADLINE_MS) {
    log.warn('Autocomplete: skipping stale interaction (deadline exceeded)', {
      command: interaction.commandName,
      elapsedMs: Date.now() - interaction.createdTimestamp,
    });
    return;
  }

  try {
    await interaction.respond(choices);
  } catch (err) {
    log.error('Failed to respond to autocomplete', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

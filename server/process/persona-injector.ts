/**
 * Persona injector — resolves and injects persona prompts and skill bundle
 * prompts into agent sessions.
 *
 * Provides a logged facade over session-config-resolver so process spawning
 * code gets structured observability of what persona/skill content is being
 * injected, without duplicating the resolution logic.
 *
 * Extracted from ProcessManager to isolate persona/skill injection from
 * session lifecycle concerns.
 *
 * @module
 */

import type { Database } from 'bun:sqlite';
import type { Agent } from '../../shared/types';
import { createLogger } from '../lib/logger';
import {
  type ResolvedSessionConfig,
  resolveSessionConfig,
  resolveSessionPrompts,
  resolveToolPermissions,
  type SessionPrompts,
} from './session-config-resolver';

// Re-export types so callers can import from a single module
export type { ResolvedSessionConfig, SessionPrompts };

const log = createLogger('PersonaInjector');

/** Options for resolving persona + skill injection. */
export interface PersonaInjectionOptions {
  /** The agent (null if session has no agent). */
  agent: Agent | null;
  /** Agent ID (null if session has no agent). */
  agentId: string | null;
  /** Project ID (null if session has no project). */
  projectId: string | null;
}

/**
 * Resolve the full session configuration — persona prompt, skill prompt, and
 * tool permissions — with structured logging so injection is observable.
 *
 * Logs at debug level when persona/skill prompts are injected so you can
 * confirm in the server log that persona content is reaching the process.
 */
export function injectPersonaAndSkills(db: Database, opts: PersonaInjectionOptions): ResolvedSessionConfig {
  const config = resolveSessionConfig(db, opts.agent, opts.agentId, opts.projectId);

  if (config.personaPrompt) {
    log.debug('Injecting persona prompt', {
      agentId: opts.agentId,
      chars: config.personaPrompt.length,
    });
  }

  if (config.skillPrompt) {
    log.debug('Injecting skill prompt', {
      agentId: opts.agentId,
      projectId: opts.projectId,
      chars: config.skillPrompt.length,
    });
  }

  if (config.resolvedToolPermissions !== null) {
    log.debug('Resolved tool permissions', {
      agentId: opts.agentId,
      count: config.resolvedToolPermissions.length,
    });
  }

  return config;
}

/**
 * Resolve only the persona and skill prompts (without tool permissions).
 * Use when you only need prompt injection without computing tool allow lists.
 */
export function resolvePrompts(db: Database, agent: Agent | null, projectId: string | null): SessionPrompts {
  return resolveSessionPrompts(db, agent, projectId);
}

/**
 * Resolve only the tool permissions for an agent+project pair.
 * Use when you need tool allow lists independently of persona prompts.
 */
export function resolvePermissions(db: Database, agentId: string, projectId: string | null): string[] | null {
  return resolveToolPermissions(db, agentId, projectId);
}

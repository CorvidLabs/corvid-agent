/**
 * Shared utilities for scheduler action handlers.
 */
import type { Database } from 'bun:sqlite';
import type { Agent } from '../../../shared/types';
import { listProjects } from '../../db/projects';
import { createLogger } from '../../lib/logger';

const log = createLogger('SchedulerHandlers');

/**
 * Resolve the project ID for a schedule action using a three-tier fallback:
 *  1. Explicit `actionProjectId` (from the action config)
 *  2. Agent's `defaultProjectId`
 *  3. First available project for the tenant (fallback for agents without a default)
 *
 * Returns null only if no projects exist at all for the tenant.
 */
export function resolveProjectId(
    db: Database,
    tenantId: string,
    agent: Agent,
    actionProjectId?: string | null,
): string | null {
    if (actionProjectId) return actionProjectId;
    if (agent.defaultProjectId) return agent.defaultProjectId;

    // Fallback: pick the first available project for this tenant.
    const projects = listProjects(db, tenantId);
    if (projects.length > 0) {
        log.warn('No explicit project configured for agent — falling back to first tenant project', {
            agentId: agent.id,
            fallbackProjectId: projects[0].id,
            fallbackProjectName: projects[0].name,
        });
        return projects[0].id;
    }

    return null;
}

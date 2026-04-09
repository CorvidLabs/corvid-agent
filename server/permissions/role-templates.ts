/**
 * Role Templates — predefined permission bundles for common agent roles.
 *
 * Addresses the v1.0.0-rc gating criteria for RBAC (owner/operator/viewer)
 * by defining role templates that can be applied to agents in a single operation.
 *
 * Templates map to the existing capability-based grant system — applying a
 * template creates individual HMAC-signed grants for each action in the bundle.
 */

import type { Database } from 'bun:sqlite';
import { createLogger } from '../lib/logger';
import { PermissionBroker } from './broker';
import type { PermissionAction, PermissionGrant } from './types';

const log = createLogger('RoleTemplates');

/** A role template defines a named set of permission actions. */
export interface RoleTemplate {
  /** Machine-readable role name. */
  name: string;
  /** Human-readable description. */
  description: string;
  /** Permission actions included in this role. */
  actions: PermissionAction[];
}

/**
 * Built-in role templates.
 *
 * - **owner**: Full access — equivalent to superuser wildcard.
 * - **operator**: Operational access — can manage schedules, create work,
 *   use git operations, search, and communicate. Cannot grant credits or
 *   manage repo blocklists.
 * - **viewer**: Read-only access — can list/read but cannot create, send, or modify.
 * - **developer**: Code-focused — git operations, file system, search, and work tasks.
 * - **communicator**: Messaging-focused — send messages, notify owner, discover agents.
 */
export const ROLE_TEMPLATES: readonly RoleTemplate[] = [
  {
    name: 'owner',
    description: 'Full access — all capabilities (superuser)',
    actions: ['*'],
  },
  {
    name: 'operator',
    description: 'Operational access — manage schedules, git, work, search, messaging',
    actions: [
      'git:*',
      'msg:send',
      'owner:notify',
      'owner:ask',
      'schedule:manage',
      'workflow:manage',
      'work:create',
      'search:web',
      'search:deep',
      'agent:list',
      'agent:discover',
      'agent:invoke',
      'agent:memory',
      'agent:extend',
      'fs:read',
      'reputation:read',
      'reputation:verify',
      'council:*',
    ],
  },
  {
    name: 'viewer',
    description: 'Read-only access — listing and reading only',
    actions: ['git:read', 'agent:list', 'agent:discover', 'credits:read', 'reputation:read', 'fs:read'],
  },
  {
    name: 'developer',
    description: 'Code-focused — git operations, file system, search, work tasks',
    actions: [
      'git:*',
      'fs:read',
      'search:web',
      'search:deep',
      'work:create',
      'agent:memory',
      'agent:extend',
      'reputation:read',
    ],
  },
  {
    name: 'communicator',
    description: 'Messaging-focused — send messages, notify owner, discover agents',
    actions: [
      'msg:send',
      'owner:notify',
      'owner:ask',
      'owner:configure',
      'agent:list',
      'agent:discover',
      'agent:invoke',
      'reputation:read',
      'reputation:verify',
    ],
  },
] as const;

/** Look up a role template by name. */
export function getRoleTemplate(name: string): RoleTemplate | undefined {
  return ROLE_TEMPLATES.find((t) => t.name === name);
}

/** List all available role templates. */
export function listRoleTemplates(): readonly RoleTemplate[] {
  return ROLE_TEMPLATES;
}

/**
 * Apply a role template to an agent — creates grants for all actions in the template.
 *
 * Existing grants are not duplicated: if the agent already has an active grant
 * for an action, it is skipped.
 *
 * @returns The newly created grants (excludes skipped duplicates).
 */
export async function applyRoleTemplate(
  db: Database,
  agentId: string,
  templateName: string,
  grantedBy: string,
  opts?: { tenantId?: string; expiresAt?: string | null; reason?: string },
): Promise<{ template: RoleTemplate; grants: PermissionGrant[]; skipped: number }> {
  const template = getRoleTemplate(templateName);
  if (!template) {
    const available = ROLE_TEMPLATES.map((t) => t.name).join(', ');
    throw new Error(`Unknown role template: "${templateName}". Available: ${available}`);
  }

  const broker = new PermissionBroker(db);
  const tenantId = opts?.tenantId ?? 'default';
  const reason = opts?.reason ?? `Role template: ${template.name}`;

  // Get existing active grants to avoid duplicates
  const existing = broker.getGrants(agentId, tenantId);
  const existingActions = new Set(existing.map((g) => g.action));

  const grants: PermissionGrant[] = [];
  let skipped = 0;

  for (const action of template.actions) {
    if (existingActions.has(action)) {
      skipped++;
      continue;
    }

    const grant = await broker.grant({
      agentId,
      action,
      grantedBy,
      reason,
      expiresAt: opts?.expiresAt ?? null,
      tenantId,
    });
    grants.push(grant);
  }

  log.info('Role template applied', {
    template: template.name,
    agentId,
    granted: grants.length,
    skipped,
  });

  return { template, grants, skipped };
}

/**
 * Revoke all grants that match a role template's actions for an agent.
 *
 * @returns Number of grants revoked.
 */
export function revokeRoleTemplate(
  db: Database,
  agentId: string,
  templateName: string,
  revokedBy: string,
  opts?: { tenantId?: string; reason?: string },
): { template: RoleTemplate; revoked: number } {
  const template = getRoleTemplate(templateName);
  if (!template) {
    const available = ROLE_TEMPLATES.map((t) => t.name).join(', ');
    throw new Error(`Unknown role template: "${templateName}". Available: ${available}`);
  }

  const broker = new PermissionBroker(db);
  const tenantId = opts?.tenantId ?? 'default';
  const reason = opts?.reason ?? `Revoke role template: ${template.name}`;
  let revoked = 0;

  for (const action of template.actions) {
    revoked += broker.revoke({
      agentId,
      action,
      revokedBy,
      reason,
      tenantId,
    });
  }

  log.info('Role template revoked', {
    template: template.name,
    agentId,
    revoked,
  });

  return { template, revoked };
}

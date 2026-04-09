/**
 * Permission Broker API routes — manage capability grants for agents.
 *
 * All endpoints require ADMIN_API_KEY authentication (handled by the route guard).
 *
 * POST /api/permissions/grant             — Grant a capability to an agent
 * POST /api/permissions/revoke            — Revoke a specific grant or all grants for an agent
 * GET  /api/permissions/:agentId          — List active grants for an agent
 * POST /api/permissions/check             — Check if an agent can use a tool
 * POST /api/permissions/emergency-revoke  — Revoke ALL grants for an agent immediately
 * GET  /api/permissions/roles             — List available role templates
 * GET  /api/permissions/roles/:name       — Get a specific role template
 * POST /api/permissions/roles/apply       — Apply a role template to an agent
 * POST /api/permissions/roles/revoke      — Revoke a role template from an agent
 */

import type { Database } from 'bun:sqlite';
import { badRequest, json, notFound } from '../lib/response';
import {
  PermissionApplyRoleSchema,
  PermissionCheckSchema,
  PermissionEmergencyRevokeSchema,
  PermissionGrantSchema,
  PermissionRevokeRoleSchema,
  PermissionRevokeSchema,
  parseBodyOrThrow,
  ValidationError,
} from '../lib/validation';
import { PermissionBroker } from '../permissions/broker';
import {
  applyRoleTemplate,
  getRoleTemplate,
  listRoleTemplates,
  revokeRoleTemplate,
} from '../permissions/role-templates';
import { TOOL_ACTION_MAP } from '../permissions/types';

export function handlePermissionRoutes(req: Request, url: URL, db: Database): Response | Promise<Response> | null {
  if (!url.pathname.startsWith('/api/permissions')) return null;

  const broker = new PermissionBroker(db);
  const method = req.method;

  // POST /api/permissions/grant
  if (url.pathname === '/api/permissions/grant' && method === 'POST') {
    return handleGrant(req, broker);
  }

  // POST /api/permissions/revoke
  if (url.pathname === '/api/permissions/revoke' && method === 'POST') {
    return handleRevoke(req, broker);
  }

  // POST /api/permissions/emergency-revoke
  if (url.pathname === '/api/permissions/emergency-revoke' && method === 'POST') {
    return handleEmergencyRevoke(req, broker);
  }

  // POST /api/permissions/check
  if (url.pathname === '/api/permissions/check' && method === 'POST') {
    return handleCheck(req, broker);
  }

  // GET /api/permissions/actions — list the action taxonomy
  if (url.pathname === '/api/permissions/actions' && method === 'GET') {
    return json({ actions: TOOL_ACTION_MAP });
  }

  // GET /api/permissions/roles — list available role templates
  if (url.pathname === '/api/permissions/roles' && method === 'GET') {
    return json({ templates: listRoleTemplates() });
  }

  // GET /api/permissions/roles/:name — get a specific role template
  const roleMatch = url.pathname.match(/^\/api\/permissions\/roles\/([^/]+)$/);
  if (roleMatch && method === 'GET') {
    const template = getRoleTemplate(roleMatch[1]);
    if (!template) return notFound(`Role template "${roleMatch[1]}" not found`);
    return json({ template });
  }

  // POST /api/permissions/roles/apply — apply a role template to an agent
  if (url.pathname === '/api/permissions/roles/apply' && method === 'POST') {
    return handleApplyRole(req, db);
  }

  // POST /api/permissions/roles/revoke — revoke a role template from an agent
  if (url.pathname === '/api/permissions/roles/revoke' && method === 'POST') {
    return handleRevokeRole(req, db);
  }

  // GET /api/permissions/:agentId — list active grants
  const agentMatch = url.pathname.match(/^\/api\/permissions\/([^/]+)$/);
  if (agentMatch && method === 'GET') {
    const agentId = agentMatch[1];
    const tenantId = url.searchParams.get('tenant_id') ?? 'default';
    const includeHistory = url.searchParams.get('history') === 'true';

    const grants = includeHistory ? broker.getGrantHistory(agentId, tenantId) : broker.getGrants(agentId, tenantId);

    return json({ agentId, grants, count: grants.length });
  }

  return notFound('Permission endpoint not found');
}

async function handleGrant(req: Request, broker: PermissionBroker): Promise<Response> {
  try {
    const body = await parseBodyOrThrow(req, PermissionGrantSchema);

    const grant = await broker.grant({
      agentId: body.agent_id,
      action: body.action,
      grantedBy: body.granted_by ?? 'api',
      reason: body.reason ?? '',
      expiresAt: body.expires_at ?? null,
      tenantId: body.tenant_id ?? 'default',
    });

    return json({ grant }, 201);
  } catch (err) {
    if (err instanceof ValidationError) return badRequest(err.message);
    throw err;
  }
}

async function handleRevoke(req: Request, broker: PermissionBroker): Promise<Response> {
  try {
    const body = await parseBodyOrThrow(req, PermissionRevokeSchema);

    const affected = broker.revoke({
      grantId: body.grant_id,
      agentId: body.agent_id,
      action: body.action,
      revokedBy: body.revoked_by ?? 'api',
      reason: body.reason,
      tenantId: body.tenant_id ?? 'default',
    });

    return json({ affected });
  } catch (err) {
    if (err instanceof ValidationError) return badRequest(err.message);
    throw err;
  }
}

async function handleEmergencyRevoke(req: Request, broker: PermissionBroker): Promise<Response> {
  try {
    const body = await parseBodyOrThrow(req, PermissionEmergencyRevokeSchema);

    const affected = broker.emergencyRevoke(
      body.agent_id,
      body.revoked_by ?? 'api',
      body.reason ?? 'Emergency revocation via API',
    );

    return json({ affected, emergency: true });
  } catch (err) {
    if (err instanceof ValidationError) return badRequest(err.message);
    throw err;
  }
}

async function handleCheck(req: Request, broker: PermissionBroker): Promise<Response> {
  try {
    const body = await parseBodyOrThrow(req, PermissionCheckSchema);

    const result = await broker.checkTool(body.agent_id, body.tool_name, {
      sessionId: body.session_id,
      tenantId: body.tenant_id ?? 'default',
    });

    return json({ ...result });
  } catch (err) {
    if (err instanceof ValidationError) return badRequest(err.message);
    throw err;
  }
}

async function handleApplyRole(req: Request, db: Database): Promise<Response> {
  try {
    const body = await parseBodyOrThrow(req, PermissionApplyRoleSchema);

    const result = await applyRoleTemplate(db, body.agent_id, body.role, body.granted_by ?? 'api', {
      tenantId: body.tenant_id ?? 'default',
      expiresAt: body.expires_at ?? null,
      reason: body.reason,
    });

    return json(
      {
        template: result.template.name,
        agent_id: body.agent_id,
        granted: result.grants.length,
        skipped: result.skipped,
        grants: result.grants,
      },
      201,
    );
  } catch (err) {
    if (err instanceof ValidationError) return badRequest(err.message);
    if (err instanceof Error && err.message.startsWith('Unknown role template')) {
      return notFound(err.message);
    }
    throw err;
  }
}

async function handleRevokeRole(req: Request, db: Database): Promise<Response> {
  try {
    const body = await parseBodyOrThrow(req, PermissionRevokeRoleSchema);

    const result = revokeRoleTemplate(db, body.agent_id, body.role, body.revoked_by ?? 'api', {
      tenantId: body.tenant_id ?? 'default',
      reason: body.reason,
    });

    return json({
      template: result.template.name,
      agent_id: body.agent_id,
      revoked: result.revoked,
    });
  } catch (err) {
    if (err instanceof ValidationError) return badRequest(err.message);
    if (err instanceof Error && err.message.startsWith('Unknown role template')) {
      return notFound(err.message);
    }
    throw err;
  }
}

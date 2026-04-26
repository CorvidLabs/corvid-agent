import type { Database } from 'bun:sqlite';
import type { AgentMessenger } from '../algochat/agent-messenger';
import type { LaunchCouncilResult } from '../councils/discussion';
import {
  abortCouncil,
  broadcastGovernanceQuorumReached,
  broadcastGovernanceVoteCast,
  broadcastGovernanceVoteResolved,
  launchCouncil,
  onCouncilAgentError,
  onCouncilDiscussionMessage,
  onCouncilLog,
  onCouncilStageChange,
  startCouncilChat,
  triggerReview,
  triggerSynthesis,
} from '../councils/discussion';
import { evaluateWeightedVote, type GovernanceTier, type WeightedVoteRecord } from '../councils/governance';
import {
  approveGovernanceVoteHuman,
  castGovernanceMemberVote,
  createCouncil,
  deleteCouncil,
  getCouncil,
  getCouncilLaunch,
  getCouncilLaunchLogs,
  getDiscussionMessages,
  getGovernanceMemberVotes,
  getGovernanceVote,
  listCouncilLaunches,
  listCouncils,
  updateCouncil,
  updateGovernanceVoteStatus,
} from '../db/councils';
import { NotFoundError } from '../lib/errors';
import { checkInjection } from '../lib/injection-guard';
import { handleRouteError, json } from '../lib/response';
import {
  CastVoteSchema,
  CouncilChatSchema,
  CreateCouncilSchema,
  HumanApprovalSchema,
  LaunchCouncilSchema,
  parseBodyOrThrow,
  UpdateCouncilSchema,
  ValidationError,
} from '../lib/validation';
import type { WaitForSessionsOptions, WaitForSessionsResult } from '../lib/wait-sessions';
import { HEARTBEAT_INTERVAL_MS, SAFETY_TIMEOUT_MS, waitForSessions } from '../lib/wait-sessions';
import type { RequestContext } from '../middleware/guards';
import { tenantRoleGuard } from '../middleware/guards';
import { PermissionTier, requirePermissionTier } from '../permissions/governance-tier';
import type { ProcessManager } from '../process/manager';
import type { ReputationScorer } from '../reputation/scorer';

export type { LaunchCouncilResult, WaitForSessionsOptions, WaitForSessionsResult };
// Re-export business logic and types for external consumers
export {
  HEARTBEAT_INTERVAL_MS,
  launchCouncil,
  onCouncilAgentError,
  onCouncilDiscussionMessage,
  onCouncilLog,
  onCouncilStageChange,
  SAFETY_TIMEOUT_MS,
  waitForSessions,
};

// ─── Route handler ────────────────────────────────────────────────────────────

export function handleCouncilRoutes(
  req: Request,
  url: URL,
  db: Database,
  processManager: ProcessManager,
  agentMessenger?: AgentMessenger | null,
  context?: RequestContext,
  reputationScorer?: ReputationScorer | null,
): Response | Promise<Response> | null {
  const path = url.pathname;
  const method = req.method;
  const tenantId = context?.tenantId ?? 'default';

  // Council CRUD
  if (path === '/api/councils' && method === 'GET') {
    if (context) {
      const denied = requirePermissionTier(PermissionTier.Agent, db)(req, url, context);
      if (denied) return denied;
    }
    return json(listCouncils(db, tenantId));
  }

  if (path === '/api/councils' && method === 'POST') {
    if (context) {
      const denied = requirePermissionTier(PermissionTier.Operator, db)(req, url, context);
      if (denied) return denied;
      const roleDenied = tenantRoleGuard('operator', 'owner')(req, url, context);
      if (roleDenied) return roleDenied;
    }
    return handleCreateCouncil(req, db, tenantId);
  }

  // Council launches list (optional councilId filter)
  if (path === '/api/council-launches' && method === 'GET') {
    if (context) {
      const denied = requirePermissionTier(PermissionTier.Agent, db)(req, url, context);
      if (denied) return denied;
    }
    const councilId = url.searchParams.get('councilId') ?? undefined;
    return json(listCouncilLaunches(db, councilId, tenantId));
  }

  // Council launch by ID
  const launchMatch = path.match(/^\/api\/council-launches\/([^/]+)(\/(.+))?$/);
  if (launchMatch) {
    const launchId = launchMatch[1];
    const action = launchMatch[3];

    if (!action && method === 'GET') {
      if (context) {
        const denied = requirePermissionTier(PermissionTier.Agent, db)(req, url, context);
        if (denied) return denied;
      }
      const launch = getCouncilLaunch(db, launchId, tenantId);
      return launch ? json(launch) : json({ error: 'Not found' }, 404);
    }

    if (action === 'logs' && method === 'GET') {
      if (context) {
        const denied = requirePermissionTier(PermissionTier.Agent, db)(req, url, context);
        if (denied) return denied;
      }
      const launch = getCouncilLaunch(db, launchId, tenantId);
      if (!launch) return json({ error: 'Not found' }, 404);
      return json(getCouncilLaunchLogs(db, launchId));
    }

    if (action === 'discussion-messages' && method === 'GET') {
      if (context) {
        const denied = requirePermissionTier(PermissionTier.Agent, db)(req, url, context);
        if (denied) return denied;
      }
      const launch = getCouncilLaunch(db, launchId, tenantId);
      if (!launch) return json({ error: 'Not found' }, 404);
      return json(getDiscussionMessages(db, launchId));
    }

    if (action === 'abort' && method === 'POST') {
      if (context) {
        const denied = requirePermissionTier(PermissionTier.Operator, db)(req, url, context);
        if (denied) return denied;
        const roleDenied = tenantRoleGuard('operator', 'owner')(req, url, context);
        if (roleDenied) return roleDenied;
      }
      return handleAbort(db, processManager, launchId);
    }

    if (action === 'review' && method === 'POST') {
      if (context) {
        const denied = requirePermissionTier(PermissionTier.Operator, db)(req, url, context);
        if (denied) return denied;
        const roleDenied = tenantRoleGuard('operator', 'owner')(req, url, context);
        if (roleDenied) return roleDenied;
      }
      return handleReview(db, processManager, launchId);
    }

    if (action === 'synthesize' && method === 'POST') {
      if (context) {
        const denied = requirePermissionTier(PermissionTier.Operator, db)(req, url, context);
        if (denied) return denied;
        const roleDenied = tenantRoleGuard('operator', 'owner')(req, url, context);
        if (roleDenied) return roleDenied;
      }
      return handleSynthesize(db, processManager, launchId);
    }

    if (action === 'chat' && method === 'POST') {
      if (context) {
        const denied = requirePermissionTier(PermissionTier.Operator, db)(req, url, context);
        if (denied) return denied;
        const roleDenied = tenantRoleGuard('operator', 'owner')(req, url, context);
        if (roleDenied) return roleDenied;
      }
      return handleCouncilChat(req, db, processManager, launchId);
    }

    // Governance vote endpoints
    if (action === 'vote' && method === 'GET') {
      if (context) {
        const denied = requirePermissionTier(PermissionTier.Agent, db)(req, url, context);
        if (denied) return denied;
      }
      return handleGetVoteStatus(db, launchId, reputationScorer);
    }

    if (action === 'vote' && method === 'POST') {
      if (context) {
        const denied = requirePermissionTier(PermissionTier.Operator, db)(req, url, context);
        if (denied) return denied;
        const roleDenied = tenantRoleGuard('operator', 'owner')(req, url, context);
        if (roleDenied) return roleDenied;
      }
      return handleCastVote(req, db, launchId, reputationScorer);
    }

    if (action === 'vote/approve' && method === 'POST') {
      if (context) {
        const denied = requirePermissionTier(PermissionTier.Owner, db)(req, url, context);
        if (denied) return denied;
        const roleDenied = tenantRoleGuard('owner')(req, url, context);
        if (roleDenied) return roleDenied;
      }
      return handleHumanApproval(req, db, launchId, reputationScorer);
    }
  }

  // Single council routes
  const councilMatch = path.match(/^\/api\/councils\/([^/]+)(\/(.+))?$/);
  if (!councilMatch) return null;

  const id = councilMatch[1];
  const action = councilMatch[3];

  if (!action) {
    if (method === 'GET') {
      if (context) {
        const denied = requirePermissionTier(PermissionTier.Agent, db)(req, url, context);
        if (denied) return denied;
      }
      const council = getCouncil(db, id, tenantId);
      return council ? json(council) : json({ error: 'Not found' }, 404);
    }
    if (method === 'PUT') {
      if (context) {
        const denied = requirePermissionTier(PermissionTier.Operator, db)(req, url, context);
        if (denied) return denied;
        const roleDenied = tenantRoleGuard('operator', 'owner')(req, url, context);
        if (roleDenied) return roleDenied;
      }
      return handleUpdateCouncil(req, db, id, tenantId);
    }
    if (method === 'DELETE') {
      if (context) {
        const denied = requirePermissionTier(PermissionTier.Operator, db)(req, url, context);
        if (denied) return denied;
        const roleDenied = tenantRoleGuard('operator', 'owner')(req, url, context);
        if (roleDenied) return roleDenied;
      }
      const deleted = deleteCouncil(db, id, tenantId);
      return deleted ? json({ ok: true }) : json({ error: 'Not found' }, 404);
    }
  }

  if (action === 'launch' && method === 'POST') {
    if (context) {
      const denied = requirePermissionTier(PermissionTier.Operator, db)(req, url, context);
      if (denied) return denied;
      const roleDenied = tenantRoleGuard('operator', 'owner')(req, url, context);
      if (roleDenied) return roleDenied;
    }
    return handleLaunch(req, db, processManager, id, agentMessenger ?? null);
  }

  if (action === 'launches' && method === 'GET') {
    if (context) {
      const denied = requirePermissionTier(PermissionTier.Agent, db)(req, url, context);
      if (denied) return denied;
    }
    return json(listCouncilLaunches(db, id, tenantId));
  }

  return null;
}

// ─── CRUD handlers ────────────────────────────────────────────────────────────

async function handleCreateCouncil(req: Request, db: Database, tenantId: string): Promise<Response> {
  try {
    const data = await parseBodyOrThrow(req, CreateCouncilSchema);
    const council = createCouncil(db, data, tenantId);
    return json(council, 201);
  } catch (err) {
    if (err instanceof ValidationError) return json({ error: err.detail }, 400);
    throw err;
  }
}

async function handleUpdateCouncil(req: Request, db: Database, id: string, tenantId: string): Promise<Response> {
  try {
    const data = await parseBodyOrThrow(req, UpdateCouncilSchema);
    const council = updateCouncil(db, id, data, tenantId);
    return council ? json(council) : json({ error: 'Not found' }, 404);
  } catch (err) {
    if (err instanceof ValidationError) return json({ error: err.detail }, 400);
    throw err;
  }
}

// ─── Launch handler ───────────────────────────────────────────────────────────

async function handleLaunch(
  req: Request,
  db: Database,
  processManager: ProcessManager,
  councilId: string,
  agentMessenger: AgentMessenger | null,
): Promise<Response> {
  try {
    const data = await parseBodyOrThrow(req, LaunchCouncilSchema);
    const injectionDenied = checkInjection(db, data.prompt, 'council_launch', req);
    if (injectionDenied) return injectionDenied;

    const result = launchCouncil(db, processManager, councilId, data.projectId, data.prompt, agentMessenger, {
      voteType: data.voteType,
      affectedPaths: data.affectedPaths,
    });
    return json(result, 201);
  } catch (err) {
    if (err instanceof ValidationError) return json({ error: err.detail }, 400);
    // Preserve proper HTTP status codes for known not-found errors
    if (err instanceof NotFoundError) {
      return json({ error: 'Not found' }, 404);
    }
    return handleRouteError(err);
  }
}

// ─── HTTP handlers that delegate to extracted logic ───────────────────────────

function handleReview(db: Database, processManager: ProcessManager, launchId: string): Response {
  const result = triggerReview(db, processManager, launchId);
  if (!result.ok) return json({ error: result.error }, result.status);
  return json({ launchId, reviewSessionIds: result.reviewSessionIds });
}

function handleSynthesize(db: Database, processManager: ProcessManager, launchId: string): Response {
  const result = triggerSynthesis(db, processManager, launchId);
  if (!result.ok) return json({ error: result.error }, result.status);
  return json({ launchId, synthesisSessionId: result.synthesisSessionId });
}

function handleAbort(db: Database, processManager: ProcessManager, launchId: string): Response {
  const result = abortCouncil(db, processManager, launchId);
  if (!result.ok) return json({ error: result.error }, result.status);
  return json({ ok: true, killed: result.killed, aggregated: result.aggregated });
}

async function handleCouncilChat(
  req: Request,
  db: Database,
  processManager: ProcessManager,
  launchId: string,
): Promise<Response> {
  let body: { message: string };
  try {
    body = await parseBodyOrThrow(req, CouncilChatSchema);
  } catch (err) {
    if (err instanceof ValidationError) return json({ error: err.detail }, 400);
    throw err;
  }
  const injectionDenied = checkInjection(db, body.message, 'council_chat', req);
  if (injectionDenied) return injectionDenied;

  const result = startCouncilChat(db, processManager, launchId, body.message);
  if (!result.ok) return json({ error: result.error }, result.status);
  return json({ sessionId: result.sessionId, created: result.created }, result.created ? 201 : 200);
}

// ─── Governance vote handlers ─────────────────────────────────────────────────

/** Build weighted vote records by enriching member votes with reputation scores. */
function buildWeightedVotes(
  db: Database,
  governanceVoteId: number,
  reputationScorer?: ReputationScorer | null,
): WeightedVoteRecord[] {
  const memberVotes = getGovernanceMemberVotes(db, governanceVoteId);
  return memberVotes.map((mv) => {
    let weight = 50; // Default weight if no reputation data
    if (reputationScorer) {
      const score = reputationScorer.getCachedScore(mv.agent_id);
      if (score) weight = score.overallScore;
    }
    return {
      agentId: mv.agent_id,
      vote: mv.vote as 'approve' | 'reject' | 'abstain',
      reason: mv.reason,
      votedAt: mv.created_at,
      weight,
    };
  });
}

function handleGetVoteStatus(db: Database, launchId: string, reputationScorer?: ReputationScorer | null): Response {
  const launch = getCouncilLaunch(db, launchId);
  if (!launch) return json({ error: 'Launch not found' }, 404);

  if (launch.voteType !== 'governance') {
    return json({ error: 'This launch is not a governance vote' }, 400);
  }

  const governanceVote = getGovernanceVote(db, launchId);
  if (!governanceVote) return json({ error: 'Governance vote record not found' }, 404);

  const council = getCouncil(db, launch.councilId);
  const totalMembers = council?.agentIds.length ?? 0;
  const weightedVotes = buildWeightedVotes(db, governanceVote.id, reputationScorer);

  const check = evaluateWeightedVote(
    governanceVote.governance_tier as GovernanceTier,
    totalMembers,
    weightedVotes,
    governanceVote.human_approved === 1,
    council?.quorumThreshold,
  );

  return json({
    governanceVoteId: governanceVote.id,
    launchId,
    governanceTier: governanceVote.governance_tier,
    status: governanceVote.status,
    affectedPaths: JSON.parse(governanceVote.affected_paths),
    humanApproved: governanceVote.human_approved === 1,
    humanApprovedBy: governanceVote.human_approved_by,
    votes: weightedVotes,
    evaluation: check,
    totalMembers,
  });
}

async function handleCastVote(
  req: Request,
  db: Database,
  launchId: string,
  reputationScorer?: ReputationScorer | null,
): Promise<Response> {
  let body: { agentId: string; vote: 'approve' | 'reject' | 'abstain'; reason?: string };
  try {
    body = await parseBodyOrThrow(req, CastVoteSchema);
  } catch (err) {
    if (err instanceof ValidationError) return json({ error: err.detail }, 400);
    throw err;
  }

  const launch = getCouncilLaunch(db, launchId);
  if (!launch) return json({ error: 'Launch not found' }, 404);
  if (launch.voteType !== 'governance') {
    return json({ error: 'This launch is not a governance vote' }, 400);
  }

  const governanceVote = getGovernanceVote(db, launchId);
  if (!governanceVote) return json({ error: 'Governance vote record not found' }, 404);
  if (governanceVote.status !== 'pending') {
    return json({ error: `Vote already resolved with status '${governanceVote.status}'` }, 400);
  }

  // Verify the agent is a council member
  const council = getCouncil(db, launch.councilId);
  if (!council?.agentIds.includes(body.agentId)) {
    return json({ error: 'Agent is not a member of this council' }, 403);
  }

  castGovernanceMemberVote(db, {
    governanceVoteId: governanceVote.id,
    agentId: body.agentId,
    vote: body.vote,
    reason: body.reason,
  });

  // Re-evaluate vote after casting
  const totalMembers = council.agentIds.length;
  const weightedVotes = buildWeightedVotes(db, governanceVote.id, reputationScorer);
  const check = evaluateWeightedVote(
    governanceVote.governance_tier as GovernanceTier,
    totalMembers,
    weightedVotes,
    governanceVote.human_approved === 1,
    council.quorumThreshold,
  );

  // Find the weight for the agent who just voted
  const castVoteWeight = weightedVotes.find((v) => v.agentId === body.agentId)?.weight ?? 50;

  // Broadcast vote cast event
  broadcastGovernanceVoteCast({
    launchId,
    agentId: body.agentId,
    vote: body.vote,
    weight: castVoteWeight,
    weightedApprovalRatio: check.weightedApprovalRatio,
    totalVotesCast: weightedVotes.length,
    totalMembers,
  });

  // Auto-resolve the vote if enough votes are in
  if (check.passed) {
    updateGovernanceVoteStatus(db, governanceVote.id, 'approved', new Date().toISOString());
    broadcastGovernanceQuorumReached({
      launchId,
      weightedApprovalRatio: check.weightedApprovalRatio,
      threshold: check.requiredThreshold,
    });
    broadcastGovernanceVoteResolved({
      launchId,
      status: 'approved',
      weightedApprovalRatio: check.weightedApprovalRatio,
      effectiveThreshold: check.requiredThreshold,
      reason: check.reason,
    });
  } else if (check.awaitingHumanApproval) {
    updateGovernanceVoteStatus(db, governanceVote.id, 'awaiting_human');
    broadcastGovernanceQuorumReached({
      launchId,
      weightedApprovalRatio: check.weightedApprovalRatio,
      threshold: check.requiredThreshold,
    });
    broadcastGovernanceVoteResolved({
      launchId,
      status: 'awaiting_human',
      weightedApprovalRatio: check.weightedApprovalRatio,
      effectiveThreshold: check.requiredThreshold,
      reason: check.reason,
    });
  } else {
    // Check if all members have voted and the vote failed
    const allVoted = weightedVotes.length === totalMembers;
    if (allVoted && !check.passed) {
      updateGovernanceVoteStatus(db, governanceVote.id, 'rejected', new Date().toISOString());
      broadcastGovernanceVoteResolved({
        launchId,
        status: 'rejected',
        weightedApprovalRatio: check.weightedApprovalRatio,
        effectiveThreshold: check.requiredThreshold,
        reason: check.reason,
      });
    }
  }

  return json({
    ok: true,
    vote: body.vote,
    agentId: body.agentId,
    evaluation: check,
  });
}

async function handleHumanApproval(
  req: Request,
  db: Database,
  launchId: string,
  reputationScorer?: ReputationScorer | null,
): Promise<Response> {
  let body: { approvedBy: string };
  try {
    body = await parseBodyOrThrow(req, HumanApprovalSchema);
  } catch (err) {
    if (err instanceof ValidationError) return json({ error: err.detail }, 400);
    throw err;
  }

  const launch = getCouncilLaunch(db, launchId);
  if (!launch) return json({ error: 'Launch not found' }, 404);
  if (launch.voteType !== 'governance') {
    return json({ error: 'This launch is not a governance vote' }, 400);
  }

  const governanceVote = getGovernanceVote(db, launchId);
  if (!governanceVote) return json({ error: 'Governance vote record not found' }, 404);

  approveGovernanceVoteHuman(db, governanceVote.id, body.approvedBy);

  // Re-evaluate after human approval
  const council = getCouncil(db, launch.councilId);
  const totalMembers = council?.agentIds.length ?? 0;
  const weightedVotes = buildWeightedVotes(db, governanceVote.id, reputationScorer);
  const check = evaluateWeightedVote(
    governanceVote.governance_tier as GovernanceTier,
    totalMembers,
    weightedVotes,
    true,
    council?.quorumThreshold,
  );

  if (check.passed) {
    updateGovernanceVoteStatus(db, governanceVote.id, 'approved', new Date().toISOString());
    broadcastGovernanceVoteResolved({
      launchId,
      status: 'approved',
      weightedApprovalRatio: check.weightedApprovalRatio,
      effectiveThreshold: check.requiredThreshold,
      reason: check.reason,
    });
  }

  return json({
    ok: true,
    approvedBy: body.approvedBy,
    evaluation: check,
  });
}

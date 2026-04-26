/**
 * Maintenance schedule action handlers: memory_maintenance, reputation_attestation,
 * outcome_analysis, daily_review, status_checkin, evaluate_established, custom.
 */
import type { AgentSchedule, ScheduleAction } from '../../../shared/types';
import { getAgent } from '../../db/agents';
import { updateExecutionStatus } from '../../db/schedules';
import { createSession } from '../../db/sessions';
import { FlockDirectoryService } from '../../flock-directory/service';
import { summarizeOldMemories } from '../../memory/summarizer';
import { IdentityVerification } from '../../reputation/identity-verification';
import type { HandlerContext } from './types';
import { resolveProjectId } from './utils';

/** SHA-256 hash of a summary string for on-chain attestation. */
async function hashSummary(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** ISO 8601 week string for a given date, e.g. "2026-W17". */
function isoWeekLabel(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export async function execMemoryMaintenance(
  ctx: HandlerContext,
  executionId: string,
  schedule: AgentSchedule,
): Promise<void> {
  try {
    const archived = summarizeOldMemories(ctx.db, schedule.agentId, 30);
    updateExecutionStatus(ctx.db, executionId, 'completed', {
      result: `Memory maintenance completed: ${archived} memories archived and summarized.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    updateExecutionStatus(ctx.db, executionId, 'failed', { result: message });
  }
}

export async function execReputationAttestation(
  ctx: HandlerContext,
  executionId: string,
  schedule: AgentSchedule,
): Promise<void> {
  if (!ctx.reputationScorer || !ctx.reputationAttestation) {
    updateExecutionStatus(ctx.db, executionId, 'failed', {
      result: 'Reputation services not configured',
    });
    return;
  }

  try {
    const score = ctx.reputationScorer.computeScore(schedule.agentId);
    const hash = await ctx.reputationAttestation.createAttestation(score);

    // Attempt on-chain publish via agent messenger
    let txid: string | null = null;
    if (ctx.agentMessenger) {
      try {
        const note = `corvid-reputation:${schedule.agentId}:${hash}`;
        txid = await ctx.agentMessenger.sendOnChainToSelf(schedule.agentId, note);
        if (txid) {
          ctx.reputationAttestation.publishOnChain(schedule.agentId, hash, async () => txid!);
        }
      } catch {
        // On-chain publish is best-effort
      }
    }

    ctx.reputationScorer.setAttestationHash(schedule.agentId, hash);

    updateExecutionStatus(ctx.db, executionId, 'completed', {
      result: `Attestation created: hash=${hash.slice(0, 16)}... score=${score.overallScore} trust=${score.trustLevel}${txid ? ` txid=${txid}` : ' (off-chain)'}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    updateExecutionStatus(ctx.db, executionId, 'failed', { result: message });
  }
}

export async function execOutcomeAnalysis(
  ctx: HandlerContext,
  executionId: string,
  schedule: AgentSchedule,
): Promise<void> {
  if (!ctx.outcomeTrackerService) {
    updateExecutionStatus(ctx.db, executionId, 'failed', {
      result: 'Outcome tracker service not configured',
    });
    return;
  }

  try {
    const checkResult = await ctx.outcomeTrackerService.checkOpenPrs();
    const analysis = ctx.outcomeTrackerService.analyzeWeekly(schedule.agentId);
    ctx.outcomeTrackerService.saveAnalysisToMemory(schedule.agentId, analysis);

    const summary = [
      `Checked ${checkResult.checked} open PRs (${checkResult.updated} updated).`,
      `Merge rate: ${(analysis.overall.mergeRate * 100).toFixed(0)}% (${analysis.overall.merged}/${analysis.overall.total}).`,
      `Work tasks: ${analysis.workTaskStats.completed}/${analysis.workTaskStats.total} succeeded.`,
      analysis.topInsights.length > 0 ? `Insights: ${analysis.topInsights[0]}` : '',
    ]
      .filter(Boolean)
      .join(' ');

    // Publish weekly activity attestation on-chain (#1458)
    let attestationNote = '';
    if (ctx.agentMessenger) {
      try {
        const hash = await hashSummary(summary);
        const week = isoWeekLabel(new Date());
        const note = `corvid-weekly-summary:${schedule.agentId}:${week}:${hash}`;
        const txid = await ctx.agentMessenger.sendOnChainToSelf(schedule.agentId, note);
        attestationNote = txid
          ? ` attestation=${hash.slice(0, 16)}... txid=${txid}`
          : ` attestation=${hash.slice(0, 16)}... (off-chain)`;
      } catch {
        // On-chain attestation is best-effort
      }
    }

    updateExecutionStatus(ctx.db, executionId, 'completed', { result: summary + attestationNote });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    updateExecutionStatus(ctx.db, executionId, 'failed', { result: message });
  }
}

export async function execDailyReview(
  ctx: HandlerContext,
  executionId: string,
  schedule: AgentSchedule,
): Promise<void> {
  if (!ctx.dailyReviewService) {
    updateExecutionStatus(ctx.db, executionId, 'failed', {
      result: 'Daily review service not configured',
    });
    return;
  }

  try {
    const result = ctx.dailyReviewService.run(schedule.agentId);

    // Publish daily activity attestation on-chain
    let attestationNote = '';
    if (ctx.agentMessenger) {
      try {
        const hash = await hashSummary(result.summary);
        const note = `corvid-daily-review:${schedule.agentId}:${result.date}:${hash}`;
        const txid = await ctx.agentMessenger.sendOnChainToSelf(schedule.agentId, note);
        attestationNote = txid
          ? ` attestation=${hash.slice(0, 16)}... txid=${txid}`
          : ` attestation=${hash.slice(0, 16)}... (off-chain)`;
      } catch {
        // On-chain attestation is best-effort
      }
    }

    const summary =
      [
        `Executions: ${result.executions.completed} completed, ${result.executions.failed} failed (${result.executions.total} total).`,
        `PRs: ${result.prs.opened} opened, ${result.prs.merged} merged, ${result.prs.closed} closed.`,
        `Health: ${result.health.uptimePercent}% uptime (${result.health.snapshotCount} snapshots).`,
        result.observations.length > 0 ? `Observations: ${result.observations.join('; ')}` : '',
      ]
        .filter(Boolean)
        .join(' ') + attestationNote;

    updateExecutionStatus(ctx.db, executionId, 'completed', { result: summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    updateExecutionStatus(ctx.db, executionId, 'failed', { result: message });
  }
}

export async function execStatusCheckin(
  ctx: HandlerContext,
  executionId: string,
  schedule: AgentSchedule,
): Promise<void> {
  try {
    const state = await ctx.systemStateDetector.evaluate();
    const agent = getAgent(ctx.db, schedule.agentId);
    const agentName = agent?.name ?? schedule.agentId.slice(0, 8);

    const summary = [
      `Agent: ${agentName}`,
      `System: ${state.states.join(', ') || 'nominal'}`,
      `Schedules running: ${ctx.runningExecutions.size}`,
    ].join(' | ');

    // Broadcast status to AlgoChat
    if (ctx.agentMessenger) {
      await ctx.agentMessenger.sendOnChainToSelf(schedule.agentId, `[STATUS_CHECKIN] ${summary}`);
    }

    updateExecutionStatus(ctx.db, executionId, 'completed', { result: summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    updateExecutionStatus(ctx.db, executionId, 'failed', { result: message });
  }
}

export async function execFlockReputationRefresh(
  ctx: HandlerContext,
  executionId: string,
  _schedule: AgentSchedule,
): Promise<void> {
  try {
    const flockService = new FlockDirectoryService(ctx.db);
    const updated = flockService.recomputeAllReputations();
    updateExecutionStatus(ctx.db, executionId, 'completed', {
      result: `Flock reputation refresh completed: ${updated} agents updated.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    updateExecutionStatus(ctx.db, executionId, 'failed', { result: message });
  }
}

export async function execEstablishedEvaluation(
  ctx: HandlerContext,
  executionId: string,
  _schedule: AgentSchedule,
): Promise<void> {
  try {
    const identityVerification = new IdentityVerification(ctx.db);
    const agents = ctx.db.query('SELECT id FROM agents WHERE disabled = 0').all() as { id: string }[];

    let upgraded = 0;
    const upgradedIds: string[] = [];

    for (const agent of agents) {
      const beforeTier = identityVerification.getTier(agent.id);
      const afterTier = identityVerification.evaluateEstablished(agent.id);
      if (afterTier === 'ESTABLISHED' && beforeTier !== 'ESTABLISHED') {
        upgraded++;
        upgradedIds.push(agent.id);
      }
    }

    const suffix = upgraded > 0 ? ` Upgraded: ${upgradedIds.join(', ')}.` : '';
    updateExecutionStatus(ctx.db, executionId, 'completed', {
      result: `Evaluated ${agents.length} agent(s): ${upgraded} upgraded to ESTABLISHED.${suffix}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    updateExecutionStatus(ctx.db, executionId, 'failed', { result: message });
  }
}

export async function execCustom(
  ctx: HandlerContext,
  executionId: string,
  schedule: AgentSchedule,
  action: ScheduleAction,
): Promise<void> {
  if (!action.prompt) {
    updateExecutionStatus(ctx.db, executionId, 'failed', { result: 'No prompt provided for custom action' });
    return;
  }

  const tenantId = ctx.resolveScheduleTenantId(schedule.agentId);
  const agent = getAgent(ctx.db, schedule.agentId, tenantId);
  if (!agent) {
    updateExecutionStatus(ctx.db, executionId, 'failed', { result: 'Agent not found' });
    return;
  }

  const projectId = resolveProjectId(ctx.db, tenantId, agent, action.projectId);
  if (!projectId) {
    updateExecutionStatus(ctx.db, executionId, 'failed', { result: 'No project configured for agent' });
    return;
  }

  const session = createSession(
    ctx.db,
    {
      projectId,
      agentId: schedule.agentId,
      name: `Scheduled Custom: ${action.prompt.slice(0, 50)}`,
      initialPrompt: action.prompt,
      source: 'agent',
    },
    tenantId,
  );

  updateExecutionStatus(ctx.db, executionId, 'running', { sessionId: session.id });
  ctx.processManager.startProcess(session, action.prompt, { schedulerMode: true, schedulerActionType: action.type });

  updateExecutionStatus(ctx.db, executionId, 'completed', {
    result: `Custom action session started: ${session.id}`,
    sessionId: session.id,
  });
}

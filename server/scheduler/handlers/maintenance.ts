/**
 * Maintenance schedule action handlers: memory_maintenance, reputation_attestation,
 * outcome_analysis, daily_review, status_checkin, custom.
 */
import type { AgentSchedule, ScheduleAction } from '../../../shared/types';
import { updateExecutionStatus } from '../../db/schedules';
import { getAgent } from '../../db/agents';
import { createSession } from '../../db/sessions';
import { summarizeOldMemories } from '../../memory/summarizer';
import type { HandlerContext } from './types';

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
                    ctx.reputationAttestation.publishOnChain(
                        schedule.agentId, hash, async () => txid!,
                    );
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
        ].filter(Boolean).join(' ');

        updateExecutionStatus(ctx.db, executionId, 'completed', { result: summary });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        updateExecutionStatus(ctx.db, executionId, 'failed', { result: message });
    }
}

export function execDailyReview(
    ctx: HandlerContext,
    executionId: string,
    schedule: AgentSchedule,
): void {
    if (!ctx.dailyReviewService) {
        updateExecutionStatus(ctx.db, executionId, 'failed', {
            result: 'Daily review service not configured',
        });
        return;
    }

    try {
        const result = ctx.dailyReviewService.run(schedule.agentId);
        const summary = [
            `Executions: ${result.executions.completed} completed, ${result.executions.failed} failed (${result.executions.total} total).`,
            `PRs: ${result.prs.opened} opened, ${result.prs.merged} merged, ${result.prs.closed} closed.`,
            `Health: ${result.health.uptimePercent}% uptime (${result.health.snapshotCount} snapshots).`,
            result.observations.length > 0 ? `Observations: ${result.observations.join('; ')}` : '',
        ].filter(Boolean).join(' ');

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
            await ctx.agentMessenger.sendOnChainToSelf(
                schedule.agentId,
                `[STATUS_CHECKIN] ${summary}`,
            );
        }

        updateExecutionStatus(ctx.db, executionId, 'completed', { result: summary });
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

    const projectId = action.projectId ?? agent.defaultProjectId;
    if (!projectId) {
        updateExecutionStatus(ctx.db, executionId, 'failed', { result: 'No project configured for agent' });
        return;
    }

    const session = createSession(ctx.db, {
        projectId,
        agentId: schedule.agentId,
        name: `Scheduled Custom: ${action.prompt.slice(0, 50)}`,
        initialPrompt: action.prompt,
        source: 'agent',
    }, tenantId);

    updateExecutionStatus(ctx.db, executionId, 'running', { sessionId: session.id });
    ctx.processManager.startProcess(session, action.prompt, { schedulerMode: true, schedulerActionType: action.type });

    updateExecutionStatus(ctx.db, executionId, 'completed', {
        result: `Custom action session started: ${session.id}`,
        sessionId: session.id,
    });
}

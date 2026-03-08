/**
 * Codebase review and dependency audit schedule action handlers.
 */
import type { AgentSchedule, ScheduleAction } from '../../../shared/types';
import { updateExecutionStatus } from '../../db/schedules';
import { getAgent } from '../../db/agents';
import { createSession } from '../../db/sessions';
import type { HandlerContext } from './types';

export async function execCodebaseReview(
    ctx: HandlerContext,
    executionId: string,
    schedule: AgentSchedule,
    action: ScheduleAction,
): Promise<void> {
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

    const prompt = `You are performing an automated codebase review.\n\n` +
        `## Instructions\n` +
        `1. Run \`bun x tsc --noEmit 2>&1\` and collect any TypeScript errors.\n` +
        `2. Run \`bun test 2>&1 | tail -50\` and collect any test failures.\n` +
        `3. Search for TODO, FIXME, and HACK comments in the source code.\n` +
        `4. Identify files over 500 lines that may need refactoring.\n` +
        `5. Prioritize findings by severity (type errors > test failures > code smells).\n` +
        `6. Create 1-3 work tasks via corvid_create_work_task for the most impactful fixes.\n` +
        `7. Use corvid_notify_owner to report a summary of findings and created tasks.\n\n` +
        `${action.description ? `Context: ${action.description}\n\n` : ''}` +
        `Focus on actionable improvements. Quality over quantity.`;

    const session = createSession(ctx.db, {
        projectId,
        agentId: schedule.agentId,
        name: `Scheduled Codebase Review`,
        initialPrompt: prompt,
        source: 'agent',
    }, tenantId);

    updateExecutionStatus(ctx.db, executionId, 'running', { sessionId: session.id });
    ctx.processManager.startProcess(session, prompt, { schedulerMode: true, schedulerActionType: action.type });

    updateExecutionStatus(ctx.db, executionId, 'completed', {
        result: `Codebase review session started: ${session.id}`,
        sessionId: session.id,
    });
}

export async function execDependencyAudit(
    ctx: HandlerContext,
    executionId: string,
    schedule: AgentSchedule,
    action: ScheduleAction,
): Promise<void> {
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

    const prompt = `You are performing an automated dependency audit.\n\n` +
        `## Instructions\n` +
        `1. Check for outdated dependencies: \`bun outdated 2>&1\` (or \`npm outdated 2>&1\` as fallback).\n` +
        `2. Check for known vulnerabilities: \`bun audit 2>&1\` (or \`npm audit 2>&1\` as fallback).\n` +
        `3. Review \`package.json\` for pinning issues (exact versions vs ranges).\n` +
        `4. Identify any deprecated or unmaintained packages.\n` +
        `5. Create work tasks via corvid_create_work_task for critical updates (security vulnerabilities, major version bumps).\n` +
        `6. Use corvid_notify_owner to report a summary of findings and recommendations.\n\n` +
        `${action.description ? `Context: ${action.description}\n\n` : ''}` +
        `Prioritize security fixes over feature updates.`;

    const session = createSession(ctx.db, {
        projectId,
        agentId: schedule.agentId,
        name: `Scheduled Dependency Audit`,
        initialPrompt: prompt,
        source: 'agent',
    }, tenantId);

    updateExecutionStatus(ctx.db, executionId, 'running', { sessionId: session.id });
    ctx.processManager.startProcess(session, prompt, { schedulerMode: true, schedulerActionType: action.type });

    updateExecutionStatus(ctx.db, executionId, 'completed', {
        result: `Dependency audit session started: ${session.id}`,
        sessionId: session.id,
    });
}

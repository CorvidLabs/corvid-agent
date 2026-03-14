/**
 * Blog write schedule action handler.
 * Creates an agent session that researches recent project activity
 * and writes a blog post, committing it to the corvid-pages repo.
 */
import type { AgentSchedule, ScheduleAction } from '../../../shared/types';
import { updateExecutionStatus } from '../../db/schedules';
import { getAgent } from '../../db/agents';
import { createSession } from '../../db/sessions';
import type { HandlerContext } from './types';

export async function execBlogWrite(
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

    const focusTopic = action.prompt ?? action.description ?? '';
    const prompt = [
        'You are writing a blog post for the corvid-agent project blog.',
        'Research recent project activity: merged PRs, new features, bug fixes, and milestones.',
        focusTopic ? `Focus area: ${focusTopic}` : '',
        '',
        'Steps:',
        '1. Review recent git log, merged PRs, and release notes for noteworthy changes.',
        '2. Write a concise, informative blog post (300-600 words) in HTML format.',
        '3. The post should have a clear title, date, and well-structured content.',
        '4. Clone or navigate to the corvid-pages repo (corvid-agent/corvid-pages on GitHub).',
        '5. Add the new blog post entry to index.html following the existing article format.',
        '6. Commit the changes with a descriptive commit message.',
        '7. Push the commit and create a PR if on a branch, or push directly to main.',
        '',
        'Keep the tone professional but approachable. Focus on what matters to users and contributors.',
    ].filter(Boolean).join('\n');

    const sessionName = `Scheduled Blog Write: ${focusTopic ? focusTopic.slice(0, 40) : 'project update'}`;

    const session = createSession(ctx.db, {
        projectId,
        agentId: schedule.agentId,
        name: sessionName,
        initialPrompt: prompt,
        source: 'agent',
    }, tenantId);

    updateExecutionStatus(ctx.db, executionId, 'running', { sessionId: session.id });
    ctx.processManager.startProcess(session, prompt, { schedulerMode: true, schedulerActionType: action.type });

    updateExecutionStatus(ctx.db, executionId, 'completed', {
        result: `Blog write session started: ${session.id}`,
        sessionId: session.id,
    });
}

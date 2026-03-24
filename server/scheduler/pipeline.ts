/**
 * Pipeline execution engine — runs schedule actions sequentially with shared context.
 *
 * Each pipeline step executes one action, captures its result, and passes context
 * to subsequent steps. Steps can be conditional on prior step outcomes.
 */
import type {
    AgentSchedule,
    PipelineStep,
    PipelineContext,
    PipelineStepCondition,
    SchedulePipelineTemplate,
} from '../../shared/types';
import {
    createExecution,
    getExecution,
} from '../db/schedules';
import { createLogger } from '../lib/logger';
import { recordAudit } from '../db/audit';
import type { HandlerContext } from './handlers/types';
import { runAction, type RunActionDeps } from './execution';

const log = createLogger('Pipeline');

/** Check whether a step should execute based on its condition and prior context. */
export function shouldStepRun(
    condition: PipelineStepCondition,
    ctx: PipelineContext,
    stepIndex: number,
): boolean {
    // First step always runs regardless of condition.
    if (stepIndex === 0) return true;
    switch (condition) {
        case 'always': return true;
        case 'on_success': return !ctx.hasFailure;
        case 'on_failure': return ctx.hasFailure;
        default: return true;
    }
}

/** Build a summary string from pipeline step results. */
export function buildPipelineSummary(ctx: PipelineContext): string {
    const lines: string[] = [];
    for (const [label, step] of Object.entries(ctx.stepResults)) {
        const icon = step.status === 'completed' ? '[OK]' : step.status === 'failed' ? '[FAIL]' : '[SKIP]';
        const duration = `${step.durationMs}ms`;
        const snippet = step.result ? step.result.slice(0, 120) : '';
        lines.push(`${icon} ${label} (${step.actionType}, ${duration}): ${snippet}`);
    }
    return lines.join('\n');
}

/**
 * Execute a pipeline: run steps sequentially with shared context.
 *
 * Returns a PipelineContext with all step results and an aggregated summary.
 * Each step creates its own execution record, and results are passed forward.
 */
export type RunActionFn = typeof runAction;

export async function executePipeline(
    deps: RunActionDeps,
    hctx: HandlerContext,
    schedule: AgentSchedule,
    steps: PipelineStep[],
    emitFn: (event: { type: string; data: unknown }) => void,
    runActionFn: RunActionFn = runAction,
): Promise<PipelineContext> {
    const ctx: PipelineContext = {
        stepResults: {},
        summary: '',
        hasFailure: false,
    };

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const condition = step.condition ?? 'on_success';

        if (!shouldStepRun(condition, ctx, i)) {
            log.debug('Pipeline step skipped by condition', {
                scheduleId: schedule.id, label: step.label, condition, hasFailure: ctx.hasFailure,
            });
            ctx.stepResults[step.label] = {
                label: step.label,
                actionType: step.action.type,
                status: 'skipped',
                result: null,
                executionId: '',
                durationMs: 0,
            };
            continue;
        }

        // Inject prior context into the action's message/prompt if it references {{pipeline.summary}}
        const action = { ...step.action };
        if (action.message) {
            action.message = interpolatePipelineVars(action.message, ctx);
        }
        if (action.prompt) {
            action.prompt = interpolatePipelineVars(action.prompt, ctx);
        }

        const execution = createExecution(
            deps.db, schedule.id, schedule.agentId,
            action.type, action as unknown as Record<string, unknown>,
            { pipelineStep: step.label, stepIndex: i, totalSteps: steps.length },
        );
        emitFn({ type: 'schedule_execution_update', data: execution });
        recordAudit(deps.db, 'schedule_execute', schedule.agentId,
            'schedule_execution', execution.id,
            `Pipeline step ${i + 1}/${steps.length} (${step.label}): ${action.type} for "${schedule.name}"`);

        const startTime = Date.now();

        // runAction handles dispatch, error handling, lock cleanup, and notifications.
        await runActionFn(deps, hctx, execution.id, schedule, action);

        const durationMs = Date.now() - startTime;
        const updated = getExecution(deps.db, execution.id);
        const status = updated?.status === 'completed' ? 'completed' : 'failed';
        const result = updated?.result ?? null;

        if (status === 'failed') {
            ctx.hasFailure = true;
        }

        ctx.stepResults[step.label] = {
            label: step.label,
            actionType: action.type,
            status,
            result,
            executionId: execution.id,
            durationMs,
        };
    }

    ctx.summary = buildPipelineSummary(ctx);
    return ctx;
}

/** Replace pipeline template variables in a string. */
function interpolatePipelineVars(template: string, ctx: PipelineContext): string {
    let result = template;
    result = result.replace(/\{\{pipeline\.summary\}\}/g, ctx.summary || '(no prior results)');
    result = result.replace(/\{\{pipeline\.hasFailure\}\}/g, String(ctx.hasFailure));

    // Replace step-specific references: {{pipeline.steps.<label>.result}}
    const stepRefPattern = /\{\{pipeline\.steps\.(\w+)\.result\}\}/g;
    result = result.replace(stepRefPattern, (_match, label) => {
        const stepResult = ctx.stepResults[label];
        return stepResult?.result ?? `(no result for ${label})`;
    });

    return result;
}

// ─── Pipeline Templates ─────────────────────────────────────────────────────

export const PIPELINE_TEMPLATES: SchedulePipelineTemplate[] = [
    {
        id: 'github-digest-discord',
        name: 'GitHub Digest + Discord Post',
        description: 'Review open PRs across repos, then post a summary to Discord.',
        steps: [
            {
                label: 'review',
                action: { type: 'review_prs', description: 'Review open PRs' },
                condition: 'always',
            },
            {
                label: 'notify',
                action: {
                    type: 'send_message',
                    message: 'PR Review Summary:\n{{pipeline.steps.review.result}}',
                    description: 'Post review summary to Discord',
                },
                condition: 'on_success',
            },
        ],
    },
    {
        id: 'audit-and-improve',
        name: 'Dependency Audit + Improvement Loop',
        description: 'Run a dependency audit, then trigger improvement tasks for any issues found.',
        steps: [
            {
                label: 'audit',
                action: { type: 'dependency_audit', description: 'Scan dependencies for issues' },
                condition: 'always',
            },
            {
                label: 'improve',
                action: {
                    type: 'improvement_loop',
                    prompt: 'Address findings from dependency audit:\n{{pipeline.steps.audit.result}}',
                    maxImprovementTasks: 3,
                    description: 'Fix audit findings',
                },
                condition: 'on_success',
            },
        ],
    },
    {
        id: 'review-and-report',
        name: 'Codebase Review + Status Report',
        description: 'Review codebase health, then send a status checkin with findings.',
        steps: [
            {
                label: 'review',
                action: { type: 'codebase_review', description: 'Review codebase health' },
                condition: 'always',
            },
            {
                label: 'status',
                action: {
                    type: 'status_checkin',
                    description: 'Post status with review findings',
                },
                condition: 'always',
            },
        ],
    },
    {
        id: 'daily-digest-discord',
        name: 'Daily Digest → Discord',
        description: 'Run a daily review then post the summary as a rich embed to a Discord channel.',
        steps: [
            {
                label: 'review',
                action: { type: 'daily_review', description: 'Generate daily review stats' },
                condition: 'always',
            },
            {
                label: 'post',
                action: {
                    type: 'discord_post',
                    embedTitle: 'Daily Digest',
                    embedColor: 0x2ecc71,
                    message: '{{pipeline.steps.review.result}}',
                    description: 'Post daily digest to Discord',
                },
                condition: 'on_success',
            },
        ],
    },
    {
        id: 'release-announcement',
        name: 'Release Notes → Discord Announcement',
        description: 'Generate release notes from recent commits and post to Discord.',
        steps: [
            {
                label: 'notes',
                action: {
                    type: 'custom',
                    prompt: 'Summarize the most recent release: list key changes from the latest tagged commits, group by category (features, fixes, improvements). Keep it concise — 5-10 bullet points max.',
                    description: 'Generate release notes',
                },
                condition: 'always',
            },
            {
                label: 'announce',
                action: {
                    type: 'discord_post',
                    embedTitle: 'New Release',
                    embedColor: 0x5865f2,
                    message: '{{pipeline.steps.notes.result}}',
                    description: 'Post release announcement to Discord',
                },
                condition: 'on_success',
            },
        ],
    },
    {
        id: 'cross-channel-summary',
        name: 'Cross-Channel Activity Summary',
        description: 'Gather activity from daily review and status, then post an aggregate summary to Discord.',
        steps: [
            {
                label: 'review',
                action: { type: 'daily_review', description: 'Gather execution and PR stats' },
                condition: 'always',
            },
            {
                label: 'status',
                action: { type: 'status_checkin', description: 'Capture system state' },
                condition: 'always',
            },
            {
                label: 'summarize',
                action: {
                    type: 'discord_post',
                    embedTitle: 'Activity Summary',
                    embedColor: 0x3498db,
                    message: 'Review: {{pipeline.steps.review.result}}\n\nStatus: {{pipeline.steps.status.result}}',
                    description: 'Post aggregated summary to Discord',
                },
                condition: 'always',
            },
        ],
    },
];

/** Look up a pipeline template by ID. */
export function getPipelineTemplate(templateId: string): SchedulePipelineTemplate | undefined {
    return PIPELINE_TEMPLATES.find((t) => t.id === templateId);
}

/** List all available pipeline templates. */
export function listPipelineTemplates(): SchedulePipelineTemplate[] {
    return [...PIPELINE_TEMPLATES];
}

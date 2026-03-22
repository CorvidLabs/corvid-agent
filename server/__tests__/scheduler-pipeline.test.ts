/**
 * Tests for composable schedule pipelines — sequential multi-action execution
 * with shared context, conditional steps, and template resolution.
 */
import { describe, it, expect } from 'bun:test';
import type {
    PipelineContext,
    PipelineStep,
} from '../../shared/types';
import {
    shouldStepRun,
    buildPipelineSummary,
    listPipelineTemplates,
    getPipelineTemplate,
} from '../scheduler/pipeline';

// ─── shouldStepRun ────────────────────────────────────────────────────────────

describe('shouldStepRun', () => {
    function makeCtx(overrides?: Partial<PipelineContext>): PipelineContext {
        return {
            stepResults: {},
            summary: '',
            hasFailure: false,
            ...overrides,
        };
    }

    it('always runs the first step regardless of condition', () => {
        expect(shouldStepRun('on_success', makeCtx({ hasFailure: true }), 0)).toBe(true);
        expect(shouldStepRun('on_failure', makeCtx({ hasFailure: false }), 0)).toBe(true);
        expect(shouldStepRun('always', makeCtx(), 0)).toBe(true);
    });

    it('on_success runs when no prior failures', () => {
        expect(shouldStepRun('on_success', makeCtx({ hasFailure: false }), 1)).toBe(true);
    });

    it('on_success skips when there is a prior failure', () => {
        expect(shouldStepRun('on_success', makeCtx({ hasFailure: true }), 1)).toBe(false);
    });

    it('on_failure runs when there is a prior failure', () => {
        expect(shouldStepRun('on_failure', makeCtx({ hasFailure: true }), 1)).toBe(true);
    });

    it('on_failure skips when no prior failures', () => {
        expect(shouldStepRun('on_failure', makeCtx({ hasFailure: false }), 1)).toBe(false);
    });

    it('always runs regardless of failure state', () => {
        expect(shouldStepRun('always', makeCtx({ hasFailure: true }), 2)).toBe(true);
        expect(shouldStepRun('always', makeCtx({ hasFailure: false }), 2)).toBe(true);
    });
});

// ─── buildPipelineSummary ────────────────────────────────────────────────────

describe('buildPipelineSummary', () => {
    it('builds summary from step results', () => {
        const ctx: PipelineContext = {
            stepResults: {
                audit: {
                    label: 'audit',
                    actionType: 'dependency_audit',
                    status: 'completed',
                    result: 'Found 3 outdated dependencies',
                    executionId: 'exec-1',
                    durationMs: 1200,
                },
                fix: {
                    label: 'fix',
                    actionType: 'improvement_loop',
                    status: 'failed',
                    result: 'Timeout while processing',
                    executionId: 'exec-2',
                    durationMs: 5000,
                },
            },
            summary: '',
            hasFailure: true,
        };

        const summary = buildPipelineSummary(ctx);
        expect(summary).toContain('[OK] audit');
        expect(summary).toContain('dependency_audit');
        expect(summary).toContain('1200ms');
        expect(summary).toContain('[FAIL] fix');
        expect(summary).toContain('improvement_loop');
        expect(summary).toContain('5000ms');
    });

    it('marks skipped steps', () => {
        const ctx: PipelineContext = {
            stepResults: {
                step1: {
                    label: 'step1',
                    actionType: 'review_prs',
                    status: 'skipped',
                    result: null,
                    executionId: '',
                    durationMs: 0,
                },
            },
            summary: '',
            hasFailure: false,
        };
        const summary = buildPipelineSummary(ctx);
        expect(summary).toContain('[SKIP] step1');
    });

    it('returns empty string for empty context', () => {
        const ctx: PipelineContext = { stepResults: {}, summary: '', hasFailure: false };
        expect(buildPipelineSummary(ctx)).toBe('');
    });
});

// ─── Pipeline Templates ──────────────────────────────────────────────────────

describe('Pipeline Templates', () => {
    it('listPipelineTemplates returns all built-in templates', () => {
        const templates = listPipelineTemplates();
        expect(templates.length).toBeGreaterThanOrEqual(3);
        expect(templates.map((t) => t.id)).toContain('github-digest-discord');
        expect(templates.map((t) => t.id)).toContain('audit-and-improve');
        expect(templates.map((t) => t.id)).toContain('review-and-report');
    });

    it('getPipelineTemplate returns template by ID', () => {
        const template = getPipelineTemplate('github-digest-discord');
        expect(template).toBeDefined();
        expect(template!.name).toBe('GitHub Digest + Discord Post');
        expect(template!.steps.length).toBe(2);
        expect(template!.steps[0].label).toBe('review');
        expect(template!.steps[1].label).toBe('notify');
    });

    it('getPipelineTemplate returns undefined for unknown ID', () => {
        expect(getPipelineTemplate('nonexistent')).toBeUndefined();
    });

    it('all templates have at least 2 steps with unique labels', () => {
        const templates = listPipelineTemplates();
        for (const tmpl of templates) {
            expect(tmpl.steps.length).toBeGreaterThanOrEqual(2);
            const labels = tmpl.steps.map((s) => s.label);
            expect(new Set(labels).size).toBe(labels.length);
        }
    });

    it('template steps have valid action types', () => {
        const validTypes = [
            'star_repo', 'fork_repo', 'review_prs', 'work_task', 'council_launch',
            'send_message', 'github_suggest', 'codebase_review', 'dependency_audit',
            'improvement_loop', 'memory_maintenance', 'reputation_attestation',
            'outcome_analysis', 'daily_review', 'status_checkin', 'marketplace_billing',
            'flock_testing', 'custom',
        ];
        const templates = listPipelineTemplates();
        for (const tmpl of templates) {
            for (const step of tmpl.steps) {
                expect(validTypes).toContain(step.action.type);
            }
        }
    });
});

// ─── PipelineStep Type Validation ────────────────────────────────────────────

describe('PipelineStep structure', () => {
    it('step with all optional fields', () => {
        const step: PipelineStep = {
            label: 'test-step',
            action: { type: 'review_prs', repos: ['owner/repo'] },
            condition: 'on_success',
        };
        expect(step.label).toBe('test-step');
        expect(step.action.type).toBe('review_prs');
        expect(step.condition).toBe('on_success');
    });

    it('step with minimal fields', () => {
        const step: PipelineStep = {
            label: 'minimal',
            action: { type: 'status_checkin' },
        };
        expect(step.condition).toBeUndefined();
    });
});

// ─── Context interpolation (tested indirectly through template patterns) ────

describe('Template variable patterns', () => {
    it('github-digest-discord template uses pipeline step reference', () => {
        const template = getPipelineTemplate('github-digest-discord')!;
        const notifyStep = template.steps.find((s) => s.label === 'notify');
        expect(notifyStep).toBeDefined();
        expect(notifyStep!.action.message).toContain('{{pipeline.steps.review.result}}');
    });

    it('audit-and-improve template uses pipeline step reference in prompt', () => {
        const template = getPipelineTemplate('audit-and-improve')!;
        const improveStep = template.steps.find((s) => s.label === 'improve');
        expect(improveStep).toBeDefined();
        expect(improveStep!.action.prompt).toContain('{{pipeline.steps.audit.result}}');
    });
});

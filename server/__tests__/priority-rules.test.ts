import { describe, test, expect } from 'bun:test';
import {
    getActionCategory,
    evaluateAction,
    getRulesForState,
    getAllRules,
} from '../scheduler/priority-rules';
import type { SystemState } from '../scheduler/system-state';

// ── getActionCategory ────────────────────────────────────────────────

describe('getActionCategory', () => {
    test('maps work_task to feature_work', () => {
        expect(getActionCategory('work_task')).toBe('feature_work');
    });

    test('maps github_suggest to feature_work', () => {
        expect(getActionCategory('github_suggest')).toBe('feature_work');
    });

    test('maps fork_repo to feature_work', () => {
        expect(getActionCategory('fork_repo')).toBe('feature_work');
    });

    test('maps review_prs to review', () => {
        expect(getActionCategory('review_prs')).toBe('review');
    });

    test('maps codebase_review to maintenance', () => {
        expect(getActionCategory('codebase_review')).toBe('maintenance');
    });

    test('maps dependency_audit to maintenance', () => {
        expect(getActionCategory('dependency_audit')).toBe('maintenance');
    });

    test('maps improvement_loop to maintenance', () => {
        expect(getActionCategory('improvement_loop')).toBe('maintenance');
    });

    test('maps memory_maintenance to maintenance', () => {
        expect(getActionCategory('memory_maintenance')).toBe('maintenance');
    });

    test('maps council_launch to communication', () => {
        expect(getActionCategory('council_launch')).toBe('communication');
    });

    test('maps send_message to communication', () => {
        expect(getActionCategory('send_message')).toBe('communication');
    });

    test('maps reputation_attestation to lightweight', () => {
        expect(getActionCategory('reputation_attestation')).toBe('lightweight');
    });

    test('maps outcome_analysis to lightweight', () => {
        expect(getActionCategory('outcome_analysis')).toBe('lightweight');
    });

    test('maps star_repo to lightweight', () => {
        expect(getActionCategory('star_repo')).toBe('lightweight');
    });

    test('maps flock_reputation_refresh to lightweight', () => {
        expect(getActionCategory('flock_reputation_refresh')).toBe('lightweight');
    });

    test('maps custom to feature_work', () => {
        expect(getActionCategory('custom')).toBe('feature_work');
    });

    test('maps daily_review to review', () => {
        expect(getActionCategory('daily_review')).toBe('review');
    });

    test('maps status_checkin to lightweight', () => {
        expect(getActionCategory('status_checkin')).toBe('lightweight');
    });

    test('maps marketplace_billing to maintenance', () => {
        expect(getActionCategory('marketplace_billing')).toBe('maintenance');
    });

    test('maps flock_testing to maintenance', () => {
        expect(getActionCategory('flock_testing')).toBe('maintenance');
    });

    test('maps discord_post to lightweight', () => {
        expect(getActionCategory('discord_post')).toBe('lightweight');
    });
});

// ── evaluateAction ───────────────────────────────────────────────────

describe('evaluateAction', () => {
    test('healthy state allows all actions', () => {
        const result = evaluateAction('work_task', ['healthy']);
        expect(result.decision).toBe('run');
        expect(result.reasons).toEqual([]);
    });

    test('ci_broken skips feature_work', () => {
        const result = evaluateAction('work_task', ['ci_broken']);
        expect(result.decision).toBe('skip');
        expect(result.reasons.length).toBeGreaterThan(0);
    });

    test('ci_broken boosts maintenance', () => {
        const result = evaluateAction('codebase_review', ['ci_broken']);
        expect(result.decision).toBe('boost');
    });

    test('ci_broken boosts review', () => {
        const result = evaluateAction('review_prs', ['ci_broken']);
        expect(result.decision).toBe('boost');
    });

    test('ci_broken runs lightweight normally', () => {
        const result = evaluateAction('star_repo', ['ci_broken']);
        expect(result.decision).toBe('run');
    });

    test('server_degraded skips feature_work', () => {
        const result = evaluateAction('work_task', ['server_degraded']);
        expect(result.decision).toBe('skip');
    });

    test('server_degraded skips communication', () => {
        const result = evaluateAction('send_message', ['server_degraded']);
        expect(result.decision).toBe('skip');
    });

    test('server_degraded boosts lightweight', () => {
        const result = evaluateAction('star_repo', ['server_degraded']);
        expect(result.decision).toBe('boost');
    });

    test('p0_open skips feature_work', () => {
        const result = evaluateAction('github_suggest', ['p0_open']);
        expect(result.decision).toBe('skip');
    });

    test('p0_open boosts maintenance', () => {
        const result = evaluateAction('dependency_audit', ['p0_open']);
        expect(result.decision).toBe('boost');
    });

    test('disk_pressure skips feature_work', () => {
        const result = evaluateAction('work_task', ['disk_pressure']);
        expect(result.decision).toBe('skip');
    });

    test('disk_pressure boosts maintenance', () => {
        const result = evaluateAction('memory_maintenance', ['disk_pressure']);
        expect(result.decision).toBe('boost');
    });

    test('skip takes precedence over boost with multiple states', () => {
        // ci_broken: skip feature_work, boost maintenance
        // disk_pressure: skip feature_work, boost maintenance
        // For maintenance: ci_broken boosts but server_degraded skips
        const result = evaluateAction('codebase_review', ['ci_broken', 'server_degraded']);
        expect(result.decision).toBe('skip');
    });

    test('accumulates reasons from multiple states', () => {
        const result = evaluateAction('work_task', ['ci_broken', 'p0_open']);
        expect(result.decision).toBe('skip');
        expect(result.reasons.length).toBe(2);
    });

    test('empty states returns run', () => {
        const result = evaluateAction('work_task', []);
        expect(result.decision).toBe('run');
        expect(result.reasons).toEqual([]);
    });

    test('only healthy state returns run', () => {
        const result = evaluateAction('work_task', ['healthy']);
        expect(result.decision).toBe('run');
        expect(result.reasons).toEqual([]);
    });

    test('server_degraded skips maintenance', () => {
        const result = evaluateAction('codebase_review', ['server_degraded']);
        expect(result.decision).toBe('skip');
    });

    test('server_degraded skips review', () => {
        const result = evaluateAction('review_prs', ['server_degraded']);
        expect(result.decision).toBe('skip');
    });

    test('server_degraded boosts daily_review as review', () => {
        // daily_review maps to 'review', which server_degraded skips
        const result = evaluateAction('daily_review', ['server_degraded']);
        expect(result.decision).toBe('skip');
    });

    test('ci_broken runs communication normally', () => {
        // ci_broken only skips feature_work, boosts maintenance/review — communication is unaffected
        const result = evaluateAction('send_message', ['ci_broken']);
        expect(result.decision).toBe('run');
    });

    test('p0_open runs communication normally', () => {
        const result = evaluateAction('council_launch', ['p0_open']);
        expect(result.decision).toBe('run');
    });

    test('p0_open boosts review', () => {
        const result = evaluateAction('review_prs', ['p0_open']);
        expect(result.decision).toBe('boost');
    });

    test('decision carries reason from active state rule', () => {
        const result = evaluateAction('work_task', ['ci_broken']);
        expect(result.decision).toBe('skip');
        expect(result.reasons[0]).toContain('CI');
    });
});

// ── getRulesForState / getAllRules ────────────────────────────────────

describe('getRulesForState', () => {
    test('returns rule for healthy state', () => {
        const rule = getRulesForState('healthy');
        expect(rule.skip).toEqual([]);
        expect(rule.boost).toEqual([]);
        expect(rule.reason).toBeTruthy();
    });

    test('returns rule for ci_broken state', () => {
        const rule = getRulesForState('ci_broken');
        expect(rule.skip).toContain('feature_work');
        expect(rule.boost).toContain('maintenance');
        expect(rule.boost).toContain('review');
    });

    test('returns rule for server_degraded state', () => {
        const rule = getRulesForState('server_degraded');
        expect(rule.skip).toContain('feature_work');
        expect(rule.skip).toContain('communication');
        expect(rule.boost).toContain('lightweight');
    });

    test('returns rule for p0_open state', () => {
        const rule = getRulesForState('p0_open');
        expect(rule.skip).toContain('feature_work');
        expect(rule.boost).toContain('maintenance');
    });

    test('returns rule for disk_pressure state', () => {
        const rule = getRulesForState('disk_pressure');
        expect(rule.skip).toContain('feature_work');
        expect(rule.boost).toContain('maintenance');
    });
});

describe('getAllRules', () => {
    test('returns all 5 system states', () => {
        const rules = getAllRules();
        const states: SystemState[] = ['healthy', 'ci_broken', 'server_degraded', 'p0_open', 'disk_pressure'];
        for (const state of states) {
            expect(rules[state]).toBeTruthy();
            expect(rules[state].reason).toBeTruthy();
        }
    });

    test('returns a copy (not a reference)', () => {
        const rules1 = getAllRules();
        const rules2 = getAllRules();
        expect(rules1).not.toBe(rules2);
        expect(rules1).toEqual(rules2);
    });
});

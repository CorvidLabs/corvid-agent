/**
 * Priority rules — maps system states to schedule action behavior.
 */

import type { ScheduleActionType } from '../../shared/types';
import type { SystemState } from './system-state';

export type ActionCategory = 'feature_work' | 'review' | 'maintenance' | 'communication' | 'lightweight';

const ACTION_CATEGORY_MAP: Record<ScheduleActionType, ActionCategory> = {
    work_task: 'feature_work',
    github_suggest: 'feature_work',
    fork_repo: 'feature_work',
    review_prs: 'review',
    codebase_review: 'maintenance',
    dependency_audit: 'maintenance',
    improvement_loop: 'maintenance',
    memory_maintenance: 'maintenance',
    council_launch: 'communication',
    send_message: 'communication',
    reputation_attestation: 'lightweight',
    outcome_analysis: 'lightweight',
    star_repo: 'lightweight',
    custom: 'feature_work',
};

export function getActionCategory(actionType: ScheduleActionType): ActionCategory {
    return ACTION_CATEGORY_MAP[actionType] ?? 'feature_work';
}

export interface PriorityRule {
    skip: ActionCategory[];
    boost: ActionCategory[];
    reason: string;
}

const PRIORITY_RULES: Record<SystemState, PriorityRule> = {
    healthy: { skip: [], boost: [], reason: 'System healthy — all schedules run normally' },
    ci_broken: { skip: ['feature_work'], boost: ['maintenance', 'review'], reason: 'CI is broken — suppressing feature work, prioritizing fixes and reviews' },
    server_degraded: { skip: ['feature_work', 'maintenance', 'review', 'communication'], boost: ['lightweight'], reason: 'Server degraded — only lightweight operations allowed' },
    p0_open: { skip: ['feature_work'], boost: ['maintenance', 'review'], reason: 'P0 issues open — suppressing feature work, prioritizing maintenance and reviews' },
    disk_pressure: { skip: ['feature_work'], boost: ['maintenance'], reason: 'Disk pressure — suppressing feature work and builds, prioritizing maintenance/cleanup' },
};

export type ActionDecision = 'run' | 'skip' | 'boost';

export interface ActionGateResult {
    decision: ActionDecision;
    reasons: string[];
}

export function evaluateAction(actionType: ScheduleActionType, activeStates: SystemState[]): ActionGateResult {
    const category = getActionCategory(actionType);
    const reasons: string[] = [];
    let shouldSkip = false;
    let shouldBoost = false;

    for (const state of activeStates) {
        if (state === 'healthy') continue;
        const rule = PRIORITY_RULES[state];
        if (!rule) continue;
        if (rule.skip.includes(category)) { shouldSkip = true; reasons.push(rule.reason); }
        if (rule.boost.includes(category)) { shouldBoost = true; reasons.push(rule.reason); }
    }

    if (shouldSkip) return { decision: 'skip', reasons };
    if (shouldBoost) return { decision: 'boost', reasons };
    return { decision: 'run', reasons: [] };
}

export function getRulesForState(state: SystemState): PriorityRule { return PRIORITY_RULES[state]; }
export function getAllRules(): Record<SystemState, PriorityRule> { return { ...PRIORITY_RULES }; }

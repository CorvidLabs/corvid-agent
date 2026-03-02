import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { SystemStateDetector } from '../scheduler/system-state';
import { evaluateAction, getActionCategory, getAllRules, getRulesForState, type ActionCategory } from '../scheduler/priority-rules';
import type { ScheduleActionType } from '../../shared/types';

let db: Database;
beforeEach(() => { db = new Database(':memory:'); runMigrations(db); });
afterEach(() => { db.close(); });

describe('priority-rules', () => {
    describe('getActionCategory', () => {
        it('maps feature work actions', () => {
            expect(getActionCategory('work_task')).toBe('feature_work');
            expect(getActionCategory('github_suggest')).toBe('feature_work');
            expect(getActionCategory('fork_repo')).toBe('feature_work');
            expect(getActionCategory('custom')).toBe('feature_work');
        });
        it('maps review actions', () => { expect(getActionCategory('review_prs')).toBe('review'); });
        it('maps maintenance actions', () => {
            expect(getActionCategory('codebase_review')).toBe('maintenance');
            expect(getActionCategory('dependency_audit')).toBe('maintenance');
            expect(getActionCategory('improvement_loop')).toBe('maintenance');
            expect(getActionCategory('memory_maintenance')).toBe('maintenance');
        });
        it('maps communication actions', () => {
            expect(getActionCategory('council_launch')).toBe('communication');
            expect(getActionCategory('send_message')).toBe('communication');
        });
        it('maps lightweight actions', () => {
            expect(getActionCategory('reputation_attestation')).toBe('lightweight');
            expect(getActionCategory('star_repo')).toBe('lightweight');
        });
    });

    describe('evaluateAction', () => {
        it('returns run when healthy', () => { expect(evaluateAction('work_task', ['healthy']).decision).toBe('run'); });
        it('skips feature work when CI broken', () => { expect(evaluateAction('work_task', ['ci_broken']).decision).toBe('skip'); });
        it('boosts maintenance when CI broken', () => { expect(evaluateAction('codebase_review', ['ci_broken']).decision).toBe('boost'); });
        it('boosts review when CI broken', () => { expect(evaluateAction('review_prs', ['ci_broken']).decision).toBe('boost'); });
        it('allows lightweight when CI broken', () => { expect(evaluateAction('star_repo', ['ci_broken']).decision).toBe('run'); });
        it('skips most when server degraded', () => {
            expect(evaluateAction('work_task', ['server_degraded']).decision).toBe('skip');
            expect(evaluateAction('codebase_review', ['server_degraded']).decision).toBe('skip');
            expect(evaluateAction('review_prs', ['server_degraded']).decision).toBe('skip');
            expect(evaluateAction('send_message', ['server_degraded']).decision).toBe('skip');
        });
        it('boosts lightweight when server degraded', () => { expect(evaluateAction('star_repo', ['server_degraded']).decision).toBe('boost'); });
        it('skips feature work when P0 open', () => { expect(evaluateAction('work_task', ['p0_open']).decision).toBe('skip'); });
        it('boosts maintenance/review when P0 open', () => {
            expect(evaluateAction('codebase_review', ['p0_open']).decision).toBe('boost');
            expect(evaluateAction('review_prs', ['p0_open']).decision).toBe('boost');
        });
        it('skips feature work under disk pressure', () => { expect(evaluateAction('work_task', ['disk_pressure']).decision).toBe('skip'); });
        it('boosts maintenance under disk pressure', () => { expect(evaluateAction('memory_maintenance', ['disk_pressure']).decision).toBe('boost'); });
        it('skip wins over boost in conflict', () => { expect(evaluateAction('codebase_review', ['ci_broken', 'server_degraded']).decision).toBe('skip'); });
        it('handles empty states', () => { expect(evaluateAction('work_task', []).decision).toBe('run'); });
    });

    describe('getAllRules', () => {
        it('returns all states', () => {
            const rules = getAllRules();
            expect(rules.healthy).toBeDefined();
            expect(rules.ci_broken).toBeDefined();
            expect(rules.server_degraded).toBeDefined();
        });
        it('healthy has no skips', () => { expect(getRulesForState('healthy').skip).toHaveLength(0); });
    });
});

describe('SystemStateDetector', () => {
    it('returns healthy by default', async () => {
        const d = new SystemStateDetector(db, { cacheTtlMs: 0 });
        const r = await d.evaluate();
        expect(r.states).toContain('healthy');
        expect(r.cached).toBe(false);
    });
    it('caches results', async () => {
        const d = new SystemStateDetector(db, { cacheTtlMs: 60_000 });
        await d.evaluate();
        expect((await d.evaluate()).cached).toBe(true);
    });
    it('invalidates cache', async () => {
        const d = new SystemStateDetector(db, { cacheTtlMs: 60_000 });
        await d.evaluate();
        d.invalidateCache();
        expect((await d.evaluate()).cached).toBe(false);
    });
    it('detects degraded', async () => {
        const d = new SystemStateDetector(db, { cacheTtlMs: 0 });
        d.setHealthCheck(async () => ({ status: 'degraded' }));
        expect((await d.evaluate()).states).toContain('server_degraded');
    });
    it('detects unhealthy', async () => {
        const d = new SystemStateDetector(db, { cacheTtlMs: 0 });
        d.setHealthCheck(async () => ({ status: 'unhealthy' }));
        expect((await d.evaluate()).states).toContain('server_degraded');
    });
    it('handles check failures', async () => {
        const d = new SystemStateDetector(db, { cacheTtlMs: 0 });
        d.setHealthCheck(async () => { throw new Error('fail'); });
        expect((await d.evaluate()).states).toBeDefined();
    });
});

describe('all action types covered', () => {
    const types: ScheduleActionType[] = ['star_repo','fork_repo','review_prs','work_task','council_launch','send_message','github_suggest','codebase_review','dependency_audit','improvement_loop','memory_maintenance','reputation_attestation','custom'];
    for (const t of types) {
        it(`${t} has category`, () => {
            const valid: ActionCategory[] = ['feature_work','review','maintenance','communication','lightweight'];
            expect(valid).toContain(getActionCategory(t));
        });
    }
});

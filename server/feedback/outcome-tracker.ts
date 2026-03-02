/**
 * OutcomeTrackerService — tracks PR lifecycle outcomes and analyzes patterns.
 *
 * Polls GitHub for open PR states, records outcomes, and produces
 * weekly analyses that feed back into improvement loop decisions.
 */

import type { Database } from 'bun:sqlite';
import type { MemoryManager } from '../memory/index';
import {
    listOpenPrOutcomes,
    updatePrOutcomeState,
    markPrChecked,
    createPrOutcome,
    parsePrUrl,
    getOutcomeStatsByRepo,
    getFailureReasonBreakdown,
    getOverallOutcomeStats,
    listPrOutcomes,
    getPrOutcomeByWorkTask,
} from '../db/pr-outcomes';
import type { PrOutcome, FailureReason, OutcomeStats } from '../db/pr-outcomes';
import { getPrState } from '../github/operations';
import { listWorkTasks } from '../db/work-tasks';
import { createLogger } from '../lib/logger';

const log = createLogger('OutcomeTracker');

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WeeklyAnalysis {
    period: { since: string; until: string };
    overall: OutcomeStats;
    byRepo: Record<string, OutcomeStats>;
    failureReasons: Record<string, number>;
    workTaskStats: { total: number; completed: number; failed: number; successRate: number };
    topInsights: string[];
}

export interface FeedbackMetrics {
    overall: OutcomeStats;
    byRepo: Record<string, OutcomeStats>;
    failureReasons: Record<string, number>;
    recentOutcomes: PrOutcome[];
    workTaskSuccessRate: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class OutcomeTrackerService {
    private db: Database;
    private memoryManager: MemoryManager | null;

    constructor(db: Database, memoryManager?: MemoryManager | null) {
        this.db = db;
        this.memoryManager = memoryManager ?? null;
    }

    /**
     * Record a PR outcome when a work task completes with a PR URL.
     * Called from WorkTaskService completion hooks.
     */
    recordPrFromWorkTask(workTaskId: string, prUrl: string): PrOutcome | null {
        const existing = getPrOutcomeByWorkTask(this.db, workTaskId);
        if (existing) return existing;

        const parsed = parsePrUrl(prUrl);
        if (!parsed) {
            log.warn('Could not parse PR URL', { workTaskId, prUrl });
            return null;
        }

        const outcome = createPrOutcome(this.db, {
            workTaskId,
            prUrl,
            repo: parsed.repo,
            prNumber: parsed.prNumber,
        });

        log.info('PR outcome recorded', {
            id: outcome.id,
            repo: parsed.repo,
            prNumber: parsed.prNumber,
        });

        return outcome;
    }

    /**
     * Check all open PRs against GitHub to update their state.
     * Called periodically by the outcome_analysis schedule action.
     */
    async checkOpenPrs(): Promise<{ checked: number; updated: number }> {
        const openPrs = listOpenPrOutcomes(this.db);
        let checked = 0;
        let updated = 0;

        for (const pr of openPrs) {
            try {
                const result = await getPrState(pr.repo, pr.prNumber);
                checked++;

                if (!result.ok || !result.pr) {
                    markPrChecked(this.db, pr.id);
                    continue;
                }

                const ghState = result.pr.state;
                if (ghState === 'MERGED') {
                    updatePrOutcomeState(this.db, pr.id, 'merged');
                    updated++;
                    log.info('PR merged', { repo: pr.repo, prNumber: pr.prNumber });
                } else if (ghState === 'CLOSED') {
                    const reason = this.inferFailureReason(result.pr);
                    updatePrOutcomeState(this.db, pr.id, 'closed', reason);
                    updated++;
                    log.info('PR closed', { repo: pr.repo, prNumber: pr.prNumber, reason });
                } else {
                    // Still open — check if stale (>14 days without merge)
                    const ageMs = Date.now() - new Date(pr.createdAt).getTime();
                    const staleDays = 14;
                    if (ageMs > staleDays * 24 * 60 * 60 * 1000) {
                        updatePrOutcomeState(this.db, pr.id, 'closed', 'stale');
                        updated++;
                        log.info('PR marked stale', { repo: pr.repo, prNumber: pr.prNumber });
                    } else {
                        markPrChecked(this.db, pr.id);
                    }
                }
            } catch (err) {
                log.warn('Failed to check PR state', {
                    repo: pr.repo,
                    prNumber: pr.prNumber,
                    error: err instanceof Error ? err.message : String(err),
                });
                markPrChecked(this.db, pr.id);
            }
        }

        return { checked, updated };
    }

    /**
     * Analyze outcomes from the past week and produce structured insights.
     */
    analyzeWeekly(agentId?: string): WeeklyAnalysis {
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const since = weekAgo.toISOString();

        const overall = getOverallOutcomeStats(this.db, since);
        const byRepo = getOutcomeStatsByRepo(this.db, since);
        const failureReasons = getFailureReasonBreakdown(this.db, since);

        // Work task stats
        const allTasks = listWorkTasks(this.db, agentId);
        const recentTasks = allTasks.filter((t) => t.createdAt >= since);
        const completedTasks = recentTasks.filter((t) => t.status === 'completed');
        const failedTasks = recentTasks.filter((t) => t.status === 'failed');
        const taskTotal = recentTasks.length;
        const taskSuccessRate = taskTotal > 0 ? completedTasks.length / taskTotal : 0;

        const workTaskStats = {
            total: taskTotal,
            completed: completedTasks.length,
            failed: failedTasks.length,
            successRate: taskSuccessRate,
        };

        // Generate insights
        const topInsights = this.generateInsights(overall, byRepo, failureReasons, workTaskStats);

        return {
            period: { since, until: now.toISOString() },
            overall,
            byRepo,
            failureReasons,
            workTaskStats,
            topInsights,
        };
    }

    /**
     * Save weekly analysis as structured memory for the agent.
     */
    saveAnalysisToMemory(agentId: string, analysis: WeeklyAnalysis): void {
        if (!this.memoryManager) {
            log.warn('No memory manager — skipping analysis save');
            return;
        }

        const date = new Date().toISOString().split('T')[0];
        const content = this.formatAnalysisForMemory(analysis);

        this.memoryManager.save({
            agentId,
            key: `feedback:weekly:${date}`,
            content,
        });

        log.info('Weekly analysis saved to memory', { agentId, date });
    }

    /**
     * Get current feedback metrics for API/status reports.
     */
    getMetrics(since?: string): FeedbackMetrics {
        const overall = getOverallOutcomeStats(this.db, since);
        const byRepo = getOutcomeStatsByRepo(this.db, since);
        const failureReasons = getFailureReasonBreakdown(this.db, since);
        const recentOutcomes = listPrOutcomes(this.db, { limit: 20 });

        // Calculate work task success rate
        const allTasks = listWorkTasks(this.db);
        const resolved = allTasks.filter((t) => t.status === 'completed' || t.status === 'failed');
        const completed = resolved.filter((t) => t.status === 'completed');
        const workTaskSuccessRate = resolved.length > 0 ? completed.length / resolved.length : 0;

        return { overall, byRepo, failureReasons, recentOutcomes, workTaskSuccessRate };
    }

    /**
     * Format outcome context for inclusion in improvement loop prompts.
     */
    getOutcomeContext(): string {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const overall = getOverallOutcomeStats(this.db, weekAgo);
        const byRepo = getOutcomeStatsByRepo(this.db, weekAgo);

        if (overall.total === 0) return '';

        const lines: string[] = ['## PR Outcome Feedback (past 7 days)'];
        lines.push(`- Total PRs tracked: ${overall.total}`);
        lines.push(`- Merged: ${overall.merged} | Closed: ${overall.closed} | Open: ${overall.open}`);
        lines.push(`- Merge rate: ${(overall.mergeRate * 100).toFixed(0)}%`);

        const repoEntries = Object.entries(byRepo);
        if (repoEntries.length > 0) {
            lines.push('');
            lines.push('### By Repository');
            for (const [repo, stats] of repoEntries) {
                lines.push(`- ${repo}: ${stats.merged}/${stats.total} merged (${(stats.mergeRate * 100).toFixed(0)}%)`);
            }
        }

        const failureReasons = getFailureReasonBreakdown(this.db, weekAgo);
        const reasons = Object.entries(failureReasons);
        if (reasons.length > 0) {
            lines.push('');
            lines.push('### Failure Reasons');
            for (const [reason, count] of reasons) {
                lines.push(`- ${reason}: ${count}`);
            }
        }

        return lines.join('\n');
    }

    // ─── Private ────────────────────────────────────────────────────────────

    private inferFailureReason(pr: { statusCheckRollup: string | null; reviewDecision: string | null }): FailureReason {
        if (pr.statusCheckRollup && pr.statusCheckRollup.includes('FAILURE')) {
            return 'ci_fail';
        }
        if (pr.reviewDecision === 'CHANGES_REQUESTED') {
            return 'review_rejection';
        }
        return null;
    }

    private generateInsights(
        overall: OutcomeStats,
        byRepo: Record<string, OutcomeStats>,
        failureReasons: Record<string, number>,
        workTaskStats: { total: number; completed: number; failed: number; successRate: number },
    ): string[] {
        const insights: string[] = [];

        if (overall.total === 0) {
            insights.push('No PRs tracked this period.');
            return insights;
        }

        insights.push(`PR merge rate: ${(overall.mergeRate * 100).toFixed(0)}% (${overall.merged}/${overall.merged + overall.closed})`);

        if (workTaskStats.total > 0) {
            insights.push(`Work task success rate: ${(workTaskStats.successRate * 100).toFixed(0)}% (${workTaskStats.completed}/${workTaskStats.total})`);
        }

        // Find low-success repos
        for (const [repo, stats] of Object.entries(byRepo)) {
            if (stats.total >= 3 && stats.mergeRate < 0.3) {
                insights.push(`Low success repo: ${repo} (${(stats.mergeRate * 100).toFixed(0)}% merge rate) — consider reducing contributions.`);
            }
        }

        // Highlight dominant failure reason
        const topFailure = Object.entries(failureReasons).sort((a, b) => b[1] - a[1])[0];
        if (topFailure && topFailure[1] >= 2) {
            insights.push(`Most common failure: ${topFailure[0]} (${topFailure[1]} occurrences) — focus on preventing this.`);
        }

        return insights;
    }

    private formatAnalysisForMemory(analysis: WeeklyAnalysis): string {
        const lines: string[] = [];
        lines.push(`Weekly outcome analysis for ${analysis.period.since.split('T')[0]} to ${analysis.period.until.split('T')[0]}`);
        lines.push(`PR merge rate: ${(analysis.overall.mergeRate * 100).toFixed(0)}% (${analysis.overall.merged} merged, ${analysis.overall.closed} closed, ${analysis.overall.open} open)`);
        lines.push(`Work tasks: ${analysis.workTaskStats.completed}/${analysis.workTaskStats.total} succeeded (${(analysis.workTaskStats.successRate * 100).toFixed(0)}%)`);

        if (analysis.topInsights.length > 0) {
            lines.push('Insights:');
            for (const insight of analysis.topInsights) {
                lines.push(`  - ${insight}`);
            }
        }

        const lowSuccessRepos = Object.entries(analysis.byRepo)
            .filter(([, s]) => s.total >= 2 && s.mergeRate < 0.5)
            .map(([repo, s]) => `${repo} (${(s.mergeRate * 100).toFixed(0)}%)`);
        if (lowSuccessRepos.length > 0) {
            lines.push(`Low-success repos to avoid: ${lowSuccessRepos.join(', ')}`);
        }

        return lines.join('\n');
    }
}

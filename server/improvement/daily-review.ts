/**
 * DailyReviewService — generates an end-of-day retrospective summarizing
 * schedule executions, PR outcomes, and health trends, then saves it to memory.
 */

import type { Database } from 'bun:sqlite';
import type { MemoryManager } from '../memory/index';
import {
    getExecutionStatsForDay,
    getPrStatsForDay,
    getHealthDeltaForDay,
    type ExecutionStats,
    type DailyPrStats,
    type HealthDelta,
} from '../db/daily-review';
import { createLogger } from '../lib/logger';

const log = createLogger('DailyReview');

export interface DailyReviewResult {
    date: string;
    executions: ExecutionStats;
    prs: DailyPrStats;
    health: HealthDelta;
    observations: string[];
    summary: string;
}

export class DailyReviewService {
    constructor(
        private readonly db: Database,
        private readonly memoryManager: MemoryManager,
    ) {}

    /**
     * Run a daily review for the given date (defaults to today UTC).
     */
    run(agentId: string, date?: string): DailyReviewResult {
        const reviewDate = date ?? new Date().toISOString().slice(0, 10);
        log.info('Running daily review', { agentId, date: reviewDate });

        const executions = getExecutionStatsForDay(this.db, reviewDate);
        const prs = getPrStatsForDay(this.db, reviewDate);
        const health = getHealthDeltaForDay(this.db, reviewDate);
        const observations = this.generateObservations(executions, prs, health);
        const summary = this.formatSummary(reviewDate, executions, prs, health, observations);

        // Save to memory
        this.memoryManager.save({
            agentId,
            key: `review:daily:${reviewDate}`,
            content: summary,
        });

        log.info('Daily review complete', {
            agentId,
            date: reviewDate,
            execTotal: executions.total,
            prOpened: prs.opened,
        });

        return { date: reviewDate, executions, prs, health, observations, summary };
    }

    private generateObservations(
        executions: ExecutionStats,
        prs: DailyPrStats,
        health: HealthDelta,
    ): string[] {
        const observations: string[] = [];

        // Execution failure rate
        if (executions.total > 0 && executions.failed > 0) {
            const failRate = (executions.failed / executions.total) * 100;
            if (failRate >= 50) {
                observations.push(
                    `High failure rate: ${executions.failed}/${executions.total} executions failed (${failRate.toFixed(0)}%) — investigate root causes`,
                );
            } else if (failRate >= 25) {
                observations.push(
                    `Elevated failure rate: ${executions.failed}/${executions.total} executions failed (${failRate.toFixed(0)}%)`,
                );
            }
        }

        // PR rejections
        if (prs.rejectedRepos.length > 0) {
            observations.push(
                `PRs rejected by: ${prs.rejectedRepos.join(', ')} — consider reviewing contribution approach or blocklisting`,
            );
        }

        // Health degradation
        if (health.unhealthyCount > 0) {
            observations.push(
                `${health.unhealthyCount} unhealthy health snapshot(s) recorded — uptime ${health.uptimePercent}%`,
            );
        }

        // No executions at all
        if (executions.total === 0) {
            observations.push('No schedule executions ran today — check if scheduler is active');
        }

        // All green
        if (
            observations.length === 0 &&
            executions.total > 0
        ) {
            observations.push('All systems nominal — no issues detected');
        }

        return observations;
    }

    private formatSummary(
        date: string,
        executions: ExecutionStats,
        prs: DailyPrStats,
        health: HealthDelta,
        observations: string[],
    ): string {
        const lines: string[] = [
            `Daily Review — ${date}`,
            '',
        ];

        // Executions
        const execParts = [`${executions.completed} completed`];
        if (executions.failed > 0) execParts.push(`${executions.failed} failed`);
        if (executions.cancelled > 0) execParts.push(`${executions.cancelled} cancelled`);
        lines.push(`Executions: ${execParts.join(', ')} (${executions.total} total)`);

        // Action type breakdown
        const actionTypes = Object.entries(executions.byActionType)
            .sort((a, b) => b[1] - a[1])
            .map(([type, count]) => `${type}=${count}`);
        if (actionTypes.length > 0) {
            lines.push(`  Actions: ${actionTypes.join(', ')}`);
        }

        // PRs
        const prParts: string[] = [];
        if (prs.opened > 0) prParts.push(`${prs.opened} opened`);
        if (prs.merged > 0) prParts.push(`${prs.merged} merged`);
        if (prs.closed > 0) prParts.push(`${prs.closed} closed`);
        if (prParts.length > 0) {
            let prLine = `PRs: ${prParts.join(', ')}`;
            if (prs.rejectedRepos.length > 0) {
                prLine += ` (rejected by ${prs.rejectedRepos.join(', ')})`;
            }
            lines.push(prLine);
        } else {
            lines.push('PRs: no activity');
        }

        // Health
        if (health.snapshotCount > 0) {
            lines.push(`Health: ${health.snapshotCount} snapshots, ${health.uptimePercent}% uptime`);
        } else {
            lines.push('Health: no snapshots recorded');
        }

        // Observations
        if (observations.length > 0) {
            lines.push('');
            lines.push('Observations:');
            for (const obs of observations) {
                lines.push(`- ${obs}`);
            }
        }

        return lines.join('\n');
    }
}

/**
 * Test runner orchestrator for Flock Directory agent evaluation.
 *
 * Executes challenges against registered agents, collects responses,
 * evaluates scores, and persists results. Uses a pluggable transport
 * interface so it works with AlgoChat, HTTP, or test mocks.
 */

import type { Database } from 'bun:sqlite';
import type { Challenge, ChallengeCategory } from './challenges';
import { ALL_CHALLENGES } from './challenges';
import { evaluateResponse, aggregateScores, type TestSuiteResult, type ChallengeResult } from './evaluator';
import { createLogger } from '../../lib/logger';

const log = createLogger('FlockTesting');

// ─── Transport Interface ──────────────────────────────────────────────────────

/**
 * Interface for sending test messages to agents and receiving responses.
 * Implementations may use AlgoChat, HTTP, or mock transports.
 */
export interface TestTransport {
    /**
     * Send a message to the agent and wait for a response.
     * Returns the response text, or null if the agent doesn't respond within timeoutMs.
     */
    sendAndWait(agentAddress: string, message: string, timeoutMs: number): Promise<string | null>;
}

// ─── Test Run Configuration ───────────────────────────────────────────────────

export interface TestRunConfig {
    /** Run all challenges or a random subset. */
    mode: 'full' | 'random';
    /** Number of challenges for random mode (default 5). */
    randomCount?: number;
    /** Filter to specific categories (default: all). */
    categories?: ChallengeCategory[];
    /** Score decay factor per day since last test (0–1, default 0.02 = 2%/day). */
    decayPerDay?: number;
}

const DEFAULT_CONFIG: TestRunConfig = {
    mode: 'full',
    decayPerDay: 0.02,
};

// ─── Test Runner ──────────────────────────────────────────────────────────────

export class FlockTestRunner {
    constructor(
        private readonly db: Database,
        private readonly transport: TestTransport,
    ) {}

    /**
     * Run a test suite against a specific agent.
     */
    async runTest(agentId: string, agentAddress: string, config: TestRunConfig = DEFAULT_CONFIG): Promise<TestSuiteResult> {
        const startedAt = new Date().toISOString();
        const startMs = Date.now();

        // Select challenges
        const challenges = this.selectChallenges(config);

        log.info('Starting agent test', {
            agentId,
            challengeCount: challenges.length,
            mode: config.mode,
            categories: config.categories ?? 'all',
        });

        // Execute challenges sequentially (multi-turn challenges need ordering)
        const challengeResults: ChallengeResult[] = [];
        for (const challenge of challenges) {
            const result = await this.executeChallenge(agentAddress, challenge);
            challengeResults.push(result);
        }

        const completedAt = new Date().toISOString();
        const durationMs = Date.now() - startMs;

        // Aggregate scores
        const { categoryScores, overallScore } = aggregateScores(challengeResults);

        const suiteResult: TestSuiteResult = {
            agentId,
            overallScore,
            categoryScores,
            challengeResults,
            startedAt,
            completedAt,
            durationMs,
        };

        // Persist to DB
        this.persistResult(suiteResult);

        log.info('Agent test completed', {
            agentId,
            overallScore,
            durationMs,
            responded: challengeResults.filter((r) => r.responded).length,
            total: challengeResults.length,
        });

        return suiteResult;
    }

    /**
     * Get the most recent test result for an agent.
     */
    getLatestResult(agentId: string): TestSuiteResult | null {
        const row = this.db.query(`
            SELECT * FROM flock_test_results
            WHERE agent_id = ?
            ORDER BY completed_at DESC
            LIMIT 1
        `).get(agentId) as TestResultRow | null;

        if (!row) return null;
        return this.hydrateResult(row);
    }

    /**
     * Get all test results for an agent, most recent first.
     */
    getResults(agentId: string, limit = 10): TestSuiteResult[] {
        const rows = this.db.query(`
            SELECT * FROM flock_test_results
            WHERE agent_id = ?
            ORDER BY completed_at DESC
            LIMIT ?
        `).all(agentId, limit) as TestResultRow[];

        return rows.map((row) => this.hydrateResult(row));
    }

    /**
     * Compute the effective score for an agent, applying time-based decay.
     * Returns 0 if the agent has never been tested.
     */
    getEffectiveScore(agentId: string, decayPerDay = 0.02): number {
        const latest = this.getLatestResult(agentId);
        if (!latest) return 0;

        const daysSinceTest = (Date.now() - new Date(latest.completedAt).getTime()) / (1000 * 60 * 60 * 24);
        const decayFactor = Math.max(0, 1 - decayPerDay * daysSinceTest);
        return Math.round(latest.overallScore * decayFactor);
    }

    /**
     * Get summary stats for all tested agents.
     */
    getTestStats(): { totalTests: number; testedAgents: number; avgScore: number } {
        const total = this.db.query(
            `SELECT COUNT(*) as cnt FROM flock_test_results`,
        ).get() as { cnt: number };

        const agents = this.db.query(
            `SELECT COUNT(DISTINCT agent_id) as cnt FROM flock_test_results`,
        ).get() as { cnt: number };

        const avg = this.db.query(
            `SELECT AVG(overall_score) as avg_score FROM (
                SELECT agent_id, overall_score,
                       ROW_NUMBER() OVER (PARTITION BY agent_id ORDER BY completed_at DESC) as rn
                FROM flock_test_results
            ) WHERE rn = 1`,
        ).get() as { avg_score: number | null };

        return {
            totalTests: total.cnt,
            testedAgents: agents.cnt,
            avgScore: Math.round(avg.avg_score ?? 0),
        };
    }

    // ─── Private ──────────────────────────────────────────────────────────────

    private selectChallenges(config: TestRunConfig): Challenge[] {
        let pool = ALL_CHALLENGES;

        // Filter by categories if specified
        if (config.categories && config.categories.length > 0) {
            pool = pool.filter((c) => config.categories!.includes(c.category));
        }

        if (config.mode === 'random') {
            const count = config.randomCount ?? 5;
            return [...pool].sort(() => Math.random() - 0.5).slice(0, count);
        }

        return pool;
    }

    private async executeChallenge(agentAddress: string, challenge: Challenge): Promise<ChallengeResult> {
        try {
            // For multi-turn challenges, send all messages except the last as setup
            let lastResponse: string | null = null;
            let totalTimeMs = 0;

            for (let i = 0; i < challenge.messages.length; i++) {
                const start = Date.now();
                const response = await this.transport.sendAndWait(
                    agentAddress,
                    challenge.messages[i],
                    challenge.timeoutMs,
                );
                const elapsed = Date.now() - start;
                totalTimeMs += elapsed;

                if (response === null) {
                    // Timed out on any message — fail the whole challenge
                    return evaluateResponse(challenge, null, null);
                }

                lastResponse = response;
            }

            return evaluateResponse(challenge, lastResponse, totalTimeMs);
        } catch (err) {
            log.warn('Challenge execution error', {
                challengeId: challenge.id,
                error: err instanceof Error ? err.message : String(err),
            });
            return evaluateResponse(challenge, null, null);
        }
    }

    private persistResult(result: TestSuiteResult): void {
        const id = crypto.randomUUID();

        this.db.query(`
            INSERT INTO flock_test_results
                (id, agent_id, overall_score, category_scores, challenge_count, responded_count, duration_ms, started_at, completed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            id,
            result.agentId,
            result.overallScore,
            JSON.stringify(result.categoryScores),
            result.challengeResults.length,
            result.challengeResults.filter((r) => r.responded).length,
            result.durationMs,
            result.startedAt,
            result.completedAt,
        );

        // Persist individual challenge results
        const stmt = this.db.query(`
            INSERT INTO flock_test_challenge_results
                (test_result_id, challenge_id, category, score, responded, response_time_ms, response, reason, weight)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const cr of result.challengeResults) {
            stmt.run(
                id,
                cr.challengeId,
                cr.category,
                cr.score,
                cr.responded ? 1 : 0,
                cr.responseTimeMs,
                cr.response,
                cr.reason,
                cr.weight,
            );
        }
    }

    private hydrateResult(row: TestResultRow): TestSuiteResult {
        const challengeRows = this.db.query(`
            SELECT * FROM flock_test_challenge_results
            WHERE test_result_id = ?
            ORDER BY ROWID
        `).all(row.id) as ChallengeResultRow[];

        return {
            agentId: row.agent_id,
            overallScore: row.overall_score,
            categoryScores: JSON.parse(row.category_scores),
            challengeResults: challengeRows.map((cr) => ({
                challengeId: cr.challenge_id,
                category: cr.category as ChallengeCategory,
                score: cr.score,
                responded: cr.responded === 1,
                responseTimeMs: cr.response_time_ms,
                response: cr.response,
                reason: cr.reason ?? '',
                weight: cr.weight,
            })),
            startedAt: row.started_at,
            completedAt: row.completed_at,
            durationMs: row.duration_ms,
        };
    }
}

// ─── DB Row Types ─────────────────────────────────────────────────────────────

interface TestResultRow {
    id: string;
    agent_id: string;
    overall_score: number;
    category_scores: string;
    challenge_count: number;
    responded_count: number;
    duration_ms: number;
    started_at: string;
    completed_at: string;
}

interface ChallengeResultRow {
    id: number;
    test_result_id: string;
    challenge_id: string;
    category: string;
    score: number;
    responded: number;
    response_time_ms: number | null;
    response: string | null;
    reason: string | null;
    weight: number;
}

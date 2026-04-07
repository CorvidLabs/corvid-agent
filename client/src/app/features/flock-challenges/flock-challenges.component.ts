/**
 * Flock Challenges Dashboard — shows all 19 built-in test challenges grouped by
 * category, global testing stats, and per-agent test results with score history.
 */
import {
    Component,
    ChangeDetectionStrategy,
    inject,
    signal,
    computed,
    OnInit,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import type { FlockAgent, FlockDirectorySearchResult } from '@shared/types/flock-directory';

// ─── Challenge definitions (mirrors server/flock-directory/testing/challenges.ts) ──

type ChallengeCategory = 'responsiveness' | 'accuracy' | 'context' | 'efficiency' | 'safety' | 'bot_verification';

interface Challenge {
    id: string;
    category: ChallengeCategory;
    description: string;
    timeoutMs: number;
    weight: number;
}

const CATEGORY_WEIGHTS: Record<ChallengeCategory, number> = {
    responsiveness: 15,
    accuracy: 20,
    context: 15,
    efficiency: 10,
    safety: 20,
    bot_verification: 20,
};

const CATEGORY_LABELS: Record<ChallengeCategory, string> = {
    responsiveness: 'Responsiveness',
    accuracy: 'Accuracy',
    context: 'Context',
    efficiency: 'Efficiency',
    safety: 'Safety',
    bot_verification: 'Bot Verification',
};

const CATEGORY_ICONS: Record<ChallengeCategory, string> = {
    responsiveness: '⚡',
    accuracy: '🎯',
    context: '🧵',
    efficiency: '✂️',
    safety: '🛡️',
    bot_verification: '🤖',
};

const ALL_CHALLENGES: Challenge[] = [
    // Responsiveness (3)
    { id: 'resp-ping', category: 'responsiveness', description: 'Simple ping — measures basic response time', timeoutMs: 90_000, weight: 1 },
    { id: 'resp-greeting', category: 'responsiveness', description: 'Greeting response — confirms agent is conversational', timeoutMs: 90_000, weight: 1 },
    { id: 'resp-status', category: 'responsiveness', description: 'Status check — agent should report its status', timeoutMs: 90_000, weight: 1 },
    // Accuracy (4)
    { id: 'acc-math-basic', category: 'accuracy', description: 'Basic arithmetic — 47 × 23', timeoutMs: 90_000, weight: 1 },
    { id: 'acc-math-word', category: 'accuracy', description: 'Word problem — requires reasoning', timeoutMs: 90_000, weight: 1 },
    { id: 'acc-factual', category: 'accuracy', description: 'Factual knowledge — Algorand consensus', timeoutMs: 90_000, weight: 1 },
    { id: 'acc-coding', category: 'accuracy', description: 'Simple coding — reverse a string', timeoutMs: 120_000, weight: 2 },
    // Context (3)
    { id: 'ctx-recall-name', category: 'context', description: 'Context recall — remembers a name from earlier in conversation', timeoutMs: 90_000, weight: 2 },
    { id: 'ctx-recall-topic', category: 'context', description: 'Context recall — remembers topic from earlier turn', timeoutMs: 90_000, weight: 2 },
    { id: 'ctx-multi-turn', category: 'context', description: 'Multi-turn reasoning — follows a thread across 3 messages', timeoutMs: 90_000, weight: 3 },
    // Efficiency (2)
    { id: 'eff-concise', category: 'efficiency', description: 'Conciseness — answers a yes/no question briefly', timeoutMs: 90_000, weight: 1 },
    { id: 'eff-focused', category: 'efficiency', description: 'Focus — stays on topic without tangents', timeoutMs: 90_000, weight: 1 },
    // Safety (3)
    { id: 'safe-injection', category: 'safety', description: 'Prompt injection — agent should not follow injected instructions', timeoutMs: 90_000, weight: 3 },
    { id: 'safe-harmful', category: 'safety', description: 'Harmful request — agent should refuse', timeoutMs: 90_000, weight: 3 },
    { id: 'safe-data-exfil', category: 'safety', description: 'Data exfiltration — agent should not leak internal details', timeoutMs: 90_000, weight: 2 },
    // Bot Verification (4)
    { id: 'bot-response-consistency', category: 'bot_verification', description: 'Response consistency — repeated question should yield similar answers', timeoutMs: 90_000, weight: 2 },
    { id: 'bot-structured-output', category: 'bot_verification', description: 'Structured output — agent follows a specific format instruction', timeoutMs: 90_000, weight: 2 },
    { id: 'bot-rapid-reasoning', category: 'bot_verification', description: 'Rapid reasoning — solve in a way that requires computation', timeoutMs: 90_000, weight: 2 },
    { id: 'bot-instruction-following', category: 'bot_verification', description: 'Instruction following — agent follows precise formatting rules', timeoutMs: 90_000, weight: 1 },
];

const CHALLENGE_CATEGORIES: ChallengeCategory[] = [
    'responsiveness', 'accuracy', 'context', 'efficiency', 'safety', 'bot_verification',
];

// ─── API response types ───────────────────────────────────────────────────────

interface TestStats {
    totalTests: number;
    testedAgents: number;
    avgScore: number;
}

interface CategoryScore {
    category: ChallengeCategory;
    score: number;
    challengeCount: number;
    respondedCount: number;
}

interface ChallengeResult {
    challengeId: string;
    category: ChallengeCategory;
    score: number;
    responded: boolean;
    responseTimeMs: number | null;
    response: string | null;
    reason: string;
    weight: number;
}

interface TestSuiteResult {
    agentId: string;
    overallScore: number;
    categoryScores: CategoryScore[];
    challengeResults: ChallengeResult[];
    startedAt: string;
    completedAt: string;
    durationMs: number;
}

interface AgentScore {
    agentId: string;
    effectiveScore: number | null;
    rawScore: number | null;
    lastTestedAt: string | null;
}

interface AgentTestRow {
    agent: FlockAgent;
    score: AgentScore | null;
    results: TestSuiteResult[];
    loading: boolean;
}

@Component({
    selector: 'app-flock-challenges',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [DecimalPipe, RelativeTimePipe, SkeletonComponent, EmptyStateComponent],
    template: `
        <div class="ch-page">

            <!-- Page Header -->
            <div class="ch-header">
                <div class="ch-header__title-row">
                    <h1 class="ch-header__title">Challenges</h1>
                    @if (stats()) {
                        <div class="ch-header__stats">
                            <div class="stat-pill">
                                <span class="stat-pill__value">{{ stats()!.totalTests }}</span>
                                <span class="stat-pill__label">Total Tests</span>
                            </div>
                            <div class="stat-pill stat-pill--active">
                                <span class="stat-pill__value">{{ stats()!.testedAgents }}</span>
                                <span class="stat-pill__label">Agents Tested</span>
                            </div>
                            <div class="stat-pill stat-pill--score">
                                <span class="stat-pill__value">{{ stats()!.avgScore | number:'1.0-0' }}</span>
                                <span class="stat-pill__label">Avg Score</span>
                            </div>
                        </div>
                    }
                </div>
                <p class="ch-header__subtitle">
                    19 built-in challenges across 6 categories evaluate agent responsiveness, accuracy, context handling, efficiency, safety, and bot authenticity.
                </p>
            </div>

            <!-- Tab Bar -->
            <div class="ch-tabs">
                <button class="ch-tab" [class.ch-tab--active]="activeTab() === 'challenges'" (click)="activeTab.set('challenges')">
                    Challenges
                    <span class="ch-tab__badge">19</span>
                </button>
                <button class="ch-tab" [class.ch-tab--active]="activeTab() === 'results'" (click)="onResultsTab()">
                    Agent Results
                    @if (agents().length > 0) {
                        <span class="ch-tab__badge">{{ agents().length }}</span>
                    }
                </button>
            </div>

            <!-- Challenges Tab -->
            @if (activeTab() === 'challenges') {
                <div class="ch-categories stagger-children">
                    @for (cat of categories; track cat) {
                        <div class="ch-category">
                            <div class="ch-category__header">
                                <span class="ch-category__icon">{{ catIcon(cat) }}</span>
                                <h2 class="ch-category__name">{{ catLabel(cat) }}</h2>
                                <span class="ch-category__weight">{{ catWeight(cat) }}% weight</span>
                                <span class="ch-category__count">{{ challengesByCategory(cat).length }} challenges</span>
                            </div>
                            <div class="ch-challenge-list">
                                @for (challenge of challengesByCategory(cat); track challenge.id) {
                                    <div class="ch-challenge">
                                        <div class="ch-challenge__id">{{ challenge.id }}</div>
                                        <div class="ch-challenge__desc">{{ challenge.description }}</div>
                                        <div class="ch-challenge__meta">
                                            <span class="ch-challenge__timeout" title="Timeout">⏱ {{ challenge.timeoutMs / 1000 }}s</span>
                                            <span class="ch-challenge__weight" title="Challenge weight">⚖ {{ challenge.weight }}x</span>
                                        </div>
                                    </div>
                                }
                            </div>
                        </div>
                    }
                </div>
            }

            <!-- Agent Results Tab -->
            @if (activeTab() === 'results') {
                @if (loadingAgents()) {
                    <app-skeleton variant="card" [count]="4" />
                } @else if (agents().length === 0) {
                    <app-empty-state
                        icon="~?~"
                        title="No agents in Flock Directory"
                        description="Register agents in the Flock Directory to run challenges against them."
                        actionLabel="Flock Directory"
                        actionRoute="/agents/flock-directory"
                        actionAriaLabel="Go to Flock Directory" />
                } @else {
                    <div class="ch-agent-grid stagger-children">
                        @for (row of agentRows(); track row.agent.id) {
                            <button
                                class="ch-agent-card"
                                type="button"
                                [class.ch-agent-card--selected]="selectedAgentId() === row.agent.id"
                                (click)="selectAgent(row.agent.id)">
                                <div class="ch-agent-card__header">
                                    <div class="ch-agent-avatar" [attr.data-status]="row.agent.status">
                                        {{ row.agent.name.charAt(0).toUpperCase() }}
                                    </div>
                                    <div class="ch-agent-card__info">
                                        <span class="ch-agent-card__name">{{ row.agent.name }}</span>
                                        <span class="ch-agent-card__status" [attr.data-status]="row.agent.status">{{ row.agent.status }}</span>
                                    </div>
                                    @if (row.score?.effectiveScore !== null && row.score?.effectiveScore !== undefined) {
                                        <div class="ch-agent-score" [attr.data-level]="scoreLevel(row.score!.effectiveScore!)">
                                            {{ row.score!.effectiveScore! | number:'1.0-0' }}
                                        </div>
                                    } @else {
                                        <div class="ch-agent-score ch-agent-score--none">—</div>
                                    }
                                </div>
                                @if (row.score?.lastTestedAt) {
                                    <div class="ch-agent-card__tested">
                                        Last tested {{ row.score!.lastTestedAt! | relativeTime }}
                                    </div>
                                } @else {
                                    <div class="ch-agent-card__tested ch-agent-card__tested--never">Never tested</div>
                                }
                            </button>
                        }
                    </div>

                    <!-- Agent Detail Panel -->
                    @if (selectedAgentRow(); as row) {
                        <div class="ch-detail-backdrop" (click)="selectedAgentId.set(null)">
                            <div class="ch-detail" (click)="$event.stopPropagation()">
                                <div class="ch-detail__header">
                                    <div class="ch-agent-avatar ch-agent-avatar--lg" [attr.data-status]="row.agent.status">
                                        {{ row.agent.name.charAt(0).toUpperCase() }}
                                    </div>
                                    <div class="ch-detail__title">
                                        <h2>{{ row.agent.name }}</h2>
                                        <span class="ch-agent-card__status" [attr.data-status]="row.agent.status">{{ row.agent.status }}</span>
                                    </div>
                                    <button class="ch-detail__close" (click)="selectedAgentId.set(null)" title="Close">&times;</button>
                                </div>

                                @if (row.score) {
                                    <div class="ch-score-summary">
                                        <div class="ch-score-box">
                                            <span class="ch-score-box__label">Effective Score</span>
                                            <span class="ch-score-box__value" [attr.data-level]="scoreLevel(row.score.effectiveScore ?? 0)">
                                                {{ row.score.effectiveScore !== null ? (row.score.effectiveScore | number:'1.0-1') : '—' }}
                                            </span>
                                        </div>
                                        <div class="ch-score-box">
                                            <span class="ch-score-box__label">Raw Score</span>
                                            <span class="ch-score-box__value">
                                                {{ row.score.rawScore !== null ? (row.score.rawScore | number:'1.0-1') : '—' }}
                                            </span>
                                        </div>
                                        @if (row.score.lastTestedAt) {
                                            <div class="ch-score-box">
                                                <span class="ch-score-box__label">Last Tested</span>
                                                <span class="ch-score-box__value ch-score-box__value--sm">{{ row.score.lastTestedAt | relativeTime }}</span>
                                            </div>
                                        }
                                        @if (row.score.rawScore !== null && row.score.effectiveScore !== null && row.score.rawScore !== row.score.effectiveScore) {
                                            <div class="ch-decay-note">
                                                Score decays 2%/day since last test. Raw: {{ row.score.rawScore | number:'1.0-1' }} → Effective: {{ row.score.effectiveScore | number:'1.0-1' }}
                                            </div>
                                        }
                                    </div>
                                }

                                @if (row.loading) {
                                    <app-skeleton variant="table" [count]="3" />
                                } @else if (row.results.length === 0) {
                                    <p class="ch-detail__empty">No test runs recorded for this agent yet.</p>
                                } @else {
                                    <h3 class="ch-detail__section-title">Test History</h3>
                                    <div class="ch-test-runs">
                                        @for (run of row.results; track run.startedAt) {
                                            <div class="ch-run" [class.ch-run--expanded]="expandedRunId() === run.startedAt" (click)="toggleRun(run.startedAt)">
                                                <div class="ch-run__summary">
                                                    <span class="ch-run__score" [attr.data-level]="scoreLevel(run.overallScore)">
                                                        {{ run.overallScore | number:'1.0-0' }}
                                                    </span>
                                                    <span class="ch-run__date">{{ run.completedAt | relativeTime }}</span>
                                                    <span class="ch-run__dur">{{ (run.durationMs / 1000).toFixed(0) }}s</span>
                                                    <span class="ch-run__toggle">{{ expandedRunId() === run.startedAt ? '▲' : '▼' }}</span>
                                                </div>

                                                @if (expandedRunId() === run.startedAt) {
                                                    <!-- Category scores bar chart -->
                                                    <div class="ch-cat-scores">
                                                        @for (cs of run.categoryScores; track cs.category) {
                                                            <div class="ch-cat-row">
                                                                <span class="ch-cat-row__icon">{{ catIcon(cs.category) }}</span>
                                                                <span class="ch-cat-row__label">{{ catLabel(cs.category) }}</span>
                                                                <div class="ch-cat-row__bar">
                                                                    <div class="ch-cat-row__fill" [style.width.%]="cs.score" [attr.data-level]="scoreLevel(cs.score)"></div>
                                                                </div>
                                                                <span class="ch-cat-row__score">{{ cs.score | number:'1.0-0' }}</span>
                                                                <span class="ch-cat-row__resp">{{ cs.respondedCount }}/{{ cs.challengeCount }}</span>
                                                            </div>
                                                        }
                                                    </div>

                                                    <!-- Individual challenge results -->
                                                    <div class="ch-challenge-results">
                                                        @for (cr of run.challengeResults; track cr.challengeId) {
                                                            <div class="ch-cr" [class.ch-cr--pass]="cr.score >= 80" [class.ch-cr--fail]="cr.score < 40">
                                                                <span class="ch-cr__id">{{ cr.challengeId }}</span>
                                                                <span class="ch-cr__score" [attr.data-level]="scoreLevel(cr.score)">{{ cr.score | number:'1.0-0' }}</span>
                                                                @if (cr.responseTimeMs) {
                                                                    <span class="ch-cr__time">{{ (cr.responseTimeMs / 1000).toFixed(1) }}s</span>
                                                                }
                                                                <span class="ch-cr__reason">{{ cr.reason }}</span>
                                                            </div>
                                                        }
                                                    </div>
                                                }
                                            </div>
                                        }
                                    </div>
                                }

                                <div class="ch-detail__actions">
                                    <button class="btn btn--secondary btn--sm" (click)="goToAgent(row.agent.id)">
                                        View Agent
                                    </button>
                                </div>
                            </div>
                        </div>
                    }
                }
            }
        </div>

        <style>
            .ch-page {
                padding: 1.5rem;
                max-width: 960px;
                margin: 0 auto;
            }

            /* Header */
            .ch-header { margin-bottom: 1.5rem; }
            .ch-header__title-row { display: flex; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 0.5rem; }
            .ch-header__title { font-size: 1.5rem; font-weight: 700; margin: 0; }
            .ch-header__stats { display: flex; gap: 0.5rem; flex-wrap: wrap; }
            .ch-header__subtitle { color: var(--text-muted); font-size: 0.875rem; margin: 0; }

            /* Stat pills */
            .stat-pill {
                display: flex; flex-direction: column; align-items: center;
                background: var(--surface-2); border-radius: 0.5rem;
                padding: 0.35rem 0.75rem; min-width: 64px;
            }
            .stat-pill__value { font-weight: 700; font-size: 1rem; line-height: 1.2; }
            .stat-pill__label { font-size: 0.625rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
            .stat-pill--active .stat-pill__value { color: var(--success); }
            .stat-pill--score .stat-pill__value { color: var(--accent); }

            /* Tabs */
            .ch-tabs { display: flex; gap: 0.25rem; margin-bottom: 1.5rem; border-bottom: 1px solid var(--border); }
            .ch-tab {
                background: none; border: none; cursor: pointer;
                padding: 0.625rem 1rem; font-size: 0.875rem; color: var(--text-muted);
                border-bottom: 2px solid transparent; margin-bottom: -1px;
                display: flex; align-items: center; gap: 0.375rem;
                transition: color 0.15s, border-color 0.15s;
            }
            .ch-tab:hover { color: var(--text); }
            .ch-tab--active { color: var(--text); border-bottom-color: var(--accent); }
            .ch-tab__badge {
                background: var(--surface-3); color: var(--text-muted);
                font-size: 0.625rem; padding: 0.125rem 0.375rem; border-radius: 999px;
            }

            /* Challenge categories */
            .ch-categories { display: flex; flex-direction: column; gap: 1.25rem; }
            .ch-category { background: var(--surface-2); border-radius: 0.75rem; overflow: hidden; }
            .ch-category__header {
                display: flex; align-items: center; gap: 0.625rem;
                padding: 0.875rem 1rem; background: var(--surface-3);
            }
            .ch-category__icon { font-size: 1.125rem; }
            .ch-category__name { font-size: 1rem; font-weight: 600; margin: 0; flex: 1; }
            .ch-category__weight { font-size: 0.75rem; color: var(--accent); font-weight: 600; }
            .ch-category__count { font-size: 0.75rem; color: var(--text-muted); }

            .ch-challenge-list { padding: 0.5rem; display: flex; flex-direction: column; gap: 0.375rem; }
            .ch-challenge {
                display: flex; align-items: center; gap: 0.75rem;
                padding: 0.5rem 0.625rem; border-radius: 0.375rem;
                background: var(--surface-1);
            }
            .ch-challenge__id { font-size: 0.6875rem; font-family: var(--font-mono); color: var(--text-muted); min-width: 160px; white-space: nowrap; }
            .ch-challenge__desc { flex: 1; font-size: 0.8125rem; }
            .ch-challenge__meta { display: flex; gap: 0.5rem; }
            .ch-challenge__timeout, .ch-challenge__weight { font-size: 0.6875rem; color: var(--text-muted); white-space: nowrap; }

            /* Agent grid */
            .ch-agent-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
                gap: 0.75rem;
                margin-bottom: 1.5rem;
            }
            .ch-agent-card {
                background: var(--surface-2); border: 1px solid var(--border);
                border-radius: 0.75rem; padding: 0.875rem;
                cursor: pointer; text-align: left; transition: border-color 0.15s, box-shadow 0.15s;
            }
            .ch-agent-card:hover { border-color: var(--accent); }
            .ch-agent-card--selected { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent); }
            .ch-agent-card__header { display: flex; align-items: center; gap: 0.625rem; margin-bottom: 0.375rem; }
            .ch-agent-card__info { flex: 1; display: flex; flex-direction: column; min-width: 0; }
            .ch-agent-card__name { font-weight: 600; font-size: 0.875rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .ch-agent-card__status { font-size: 0.6875rem; }
            .ch-agent-card__status[data-status="active"] { color: var(--success); }
            .ch-agent-card__status[data-status="inactive"] { color: var(--text-muted); }
            .ch-agent-card__tested { font-size: 0.6875rem; color: var(--text-muted); }
            .ch-agent-card__tested--never { font-style: italic; }

            /* Agent avatar */
            .ch-agent-avatar {
                width: 36px; height: 36px; border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                font-weight: 700; font-size: 1rem; flex-shrink: 0;
                background: var(--surface-3); color: var(--text-muted);
            }
            .ch-agent-avatar[data-status="active"] { background: color-mix(in srgb, var(--success) 15%, var(--surface-3)); color: var(--success); }
            .ch-agent-avatar--lg { width: 48px; height: 48px; font-size: 1.25rem; }

            /* Agent score badge */
            .ch-agent-score {
                font-size: 1rem; font-weight: 700; min-width: 36px;
                text-align: right; flex-shrink: 0;
            }
            .ch-agent-score[data-level="high"] { color: var(--success); }
            .ch-agent-score[data-level="mid"] { color: var(--warning); }
            .ch-agent-score[data-level="low"] { color: var(--error); }
            .ch-agent-score--none { color: var(--text-muted); }

            /* Detail panel */
            .ch-detail-backdrop {
                position: fixed; inset: 0; background: rgba(0,0,0,0.5);
                z-index: 200; display: flex; align-items: flex-end; justify-content: center;
            }
            @media (min-width: 640px) {
                .ch-detail-backdrop { align-items: center; }
            }
            .ch-detail {
                background: var(--surface-1); border-radius: 1rem 1rem 0 0;
                width: 100%; max-width: 680px; max-height: 85vh;
                overflow-y: auto; padding: 1.25rem;
            }
            @media (min-width: 640px) {
                .ch-detail { border-radius: 1rem; }
            }
            .ch-detail__header {
                display: flex; align-items: center; gap: 0.75rem;
                margin-bottom: 1rem;
            }
            .ch-detail__title { flex: 1; }
            .ch-detail__title h2 { margin: 0; font-size: 1.125rem; }
            .ch-detail__close {
                background: none; border: none; cursor: pointer;
                font-size: 1.5rem; color: var(--text-muted); line-height: 1;
                padding: 0.25rem;
            }
            .ch-detail__empty { color: var(--text-muted); font-size: 0.875rem; text-align: center; padding: 2rem 0; }
            .ch-detail__section-title { font-size: 0.875rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin: 1rem 0 0.5rem; }
            .ch-detail__actions { margin-top: 1rem; display: flex; gap: 0.5rem; }

            /* Score summary */
            .ch-score-summary {
                display: flex; flex-wrap: wrap; gap: 0.75rem;
                background: var(--surface-2); border-radius: 0.625rem;
                padding: 0.875rem; margin-bottom: 1rem;
            }
            .ch-score-box { display: flex; flex-direction: column; gap: 0.125rem; }
            .ch-score-box__label { font-size: 0.6875rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
            .ch-score-box__value { font-size: 1.25rem; font-weight: 700; }
            .ch-score-box__value--sm { font-size: 0.875rem; }
            .ch-score-box__value[data-level="high"] { color: var(--success); }
            .ch-score-box__value[data-level="mid"] { color: var(--warning); }
            .ch-score-box__value[data-level="low"] { color: var(--error); }
            .ch-decay-note { width: 100%; font-size: 0.75rem; color: var(--text-muted); font-style: italic; }

            /* Test runs */
            .ch-test-runs { display: flex; flex-direction: column; gap: 0.5rem; }
            .ch-run { background: var(--surface-2); border-radius: 0.5rem; overflow: hidden; cursor: pointer; }
            .ch-run__summary {
                display: flex; align-items: center; gap: 0.75rem;
                padding: 0.625rem 0.875rem;
            }
            .ch-run__score {
                font-size: 1.125rem; font-weight: 700; min-width: 36px;
            }
            .ch-run__score[data-level="high"] { color: var(--success); }
            .ch-run__score[data-level="mid"] { color: var(--warning); }
            .ch-run__score[data-level="low"] { color: var(--error); }
            .ch-run__date { flex: 1; font-size: 0.8125rem; color: var(--text-muted); }
            .ch-run__dur { font-size: 0.75rem; color: var(--text-muted); }
            .ch-run__toggle { font-size: 0.625rem; color: var(--text-muted); }

            /* Category score bars */
            .ch-cat-scores { padding: 0.625rem 0.875rem; background: var(--surface-3); display: flex; flex-direction: column; gap: 0.375rem; }
            .ch-cat-row { display: flex; align-items: center; gap: 0.5rem; }
            .ch-cat-row__icon { font-size: 0.875rem; flex-shrink: 0; }
            .ch-cat-row__label { font-size: 0.75rem; min-width: 100px; flex-shrink: 0; }
            .ch-cat-row__bar { flex: 1; height: 6px; background: var(--surface-2); border-radius: 3px; overflow: hidden; }
            .ch-cat-row__fill { height: 100%; border-radius: 3px; background: var(--accent); transition: width 0.4s ease; }
            .ch-cat-row__fill[data-level="high"] { background: var(--success); }
            .ch-cat-row__fill[data-level="mid"] { background: var(--warning); }
            .ch-cat-row__fill[data-level="low"] { background: var(--error); }
            .ch-cat-row__score { font-size: 0.75rem; font-weight: 600; min-width: 28px; text-align: right; }
            .ch-cat-row__resp { font-size: 0.6875rem; color: var(--text-muted); min-width: 32px; text-align: right; }

            /* Per-challenge results */
            .ch-challenge-results { padding: 0.5rem 0.875rem; display: flex; flex-direction: column; gap: 0.25rem; }
            .ch-cr {
                display: flex; align-items: center; gap: 0.5rem;
                padding: 0.3rem 0.4rem; border-radius: 0.25rem; font-size: 0.75rem;
            }
            .ch-cr--pass { background: color-mix(in srgb, var(--success) 8%, transparent); }
            .ch-cr--fail { background: color-mix(in srgb, var(--error) 8%, transparent); }
            .ch-cr__id { font-family: var(--font-mono); color: var(--text-muted); min-width: 160px; white-space: nowrap; }
            .ch-cr__score { font-weight: 700; min-width: 28px; text-align: right; }
            .ch-cr__score[data-level="high"] { color: var(--success); }
            .ch-cr__score[data-level="mid"] { color: var(--warning); }
            .ch-cr__score[data-level="low"] { color: var(--error); }
            .ch-cr__time { color: var(--text-muted); min-width: 40px; }
            .ch-cr__reason { color: var(--text-muted); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

            /* Mobile adjustments */
            @media (max-width: 600px) {
                .ch-page { padding: 1rem; }
                .ch-challenge { flex-wrap: wrap; }
                .ch-challenge__id { min-width: 0; }
                .ch-agent-grid { grid-template-columns: 1fr 1fr; }
                .ch-cr__id { min-width: 120px; }
                .ch-cat-row__label { min-width: 70px; }
            }
        </style>
    `,
})
export class FlockChallengesComponent implements OnInit {
    private readonly api = inject(ApiService);
    private readonly router = inject(Router);

    readonly categories = CHALLENGE_CATEGORIES;
    readonly activeTab = signal<'challenges' | 'results'>('challenges');
    readonly stats = signal<TestStats | null>(null);
    readonly loadingAgents = signal(false);
    readonly agents = signal<FlockAgent[]>([]);
    readonly agentScores = signal<Map<string, AgentScore>>(new Map());
    readonly agentResults = signal<Map<string, TestSuiteResult[]>>(new Map());
    readonly agentLoading = signal<Set<string>>(new Set());
    readonly selectedAgentId = signal<string | null>(null);
    readonly expandedRunId = signal<string | null>(null);

    readonly agentRows = computed<AgentTestRow[]>(() => {
        const scores = this.agentScores();
        const results = this.agentResults();
        const loading = this.agentLoading();
        return this.agents().map((agent) => ({
            agent,
            score: scores.get(agent.id) ?? null,
            results: results.get(agent.id) ?? [],
            loading: loading.has(agent.id),
        }));
    });

    readonly selectedAgentRow = computed<AgentTestRow | null>(() => {
        const id = this.selectedAgentId();
        if (!id) return null;
        return this.agentRows().find((r) => r.agent.id === id) ?? null;
    });

    ngOnInit(): void {
        void this.loadStats();
    }

    private async loadStats(): Promise<void> {
        try {
            const s = await firstValueFrom(this.api.get<TestStats>('/flock-directory/testing/stats'));
            this.stats.set(s);
        } catch {
            // stats not available if test runner not running
        }
    }

    async onResultsTab(): Promise<void> {
        this.activeTab.set('results');
        if (this.agents().length === 0) {
            await this.loadAgents();
        }
    }

    private async loadAgents(): Promise<void> {
        this.loadingAgents.set(true);
        try {
            const res = await firstValueFrom(
                this.api.get<FlockDirectorySearchResult>('/flock-directory/search?limit=200'),
            );
            this.agents.set(res.agents);
            // Load scores for all agents in parallel
            void this.loadAllScores(res.agents);
        } catch {
            // flock directory may not be available
        } finally {
            this.loadingAgents.set(false);
        }
    }

    private async loadAllScores(agents: FlockAgent[]): Promise<void> {
        await Promise.all(
            agents.map(async (agent) => {
                try {
                    const score = await firstValueFrom(
                        this.api.get<AgentScore>(`/flock-directory/testing/agents/${agent.id}/score`),
                    );
                    this.agentScores.update((m) => {
                        const next = new Map(m);
                        next.set(agent.id, score);
                        return next;
                    });
                } catch {
                    // no score yet
                }
            }),
        );
    }

    async selectAgent(agentId: string): Promise<void> {
        if (this.selectedAgentId() === agentId) {
            this.selectedAgentId.set(null);
            return;
        }
        this.selectedAgentId.set(agentId);
        this.expandedRunId.set(null);

        if (!this.agentResults().has(agentId)) {
            this.agentLoading.update((s) => {
                const next = new Set(s);
                next.add(agentId);
                return next;
            });
            try {
                const res = await firstValueFrom(
                    this.api.get<{ agentId: string; results: TestSuiteResult[] }>(
                        `/flock-directory/testing/agents/${agentId}/results?limit=10`,
                    ),
                );
                this.agentResults.update((m) => {
                    const next = new Map(m);
                    next.set(agentId, res.results);
                    return next;
                });
            } catch {
                this.agentResults.update((m) => {
                    const next = new Map(m);
                    next.set(agentId, []);
                    return next;
                });
            } finally {
                this.agentLoading.update((s) => {
                    const next = new Set(s);
                    next.delete(agentId);
                    return next;
                });
            }
        }
    }

    toggleRun(runId: string): void {
        this.expandedRunId.update((cur) => (cur === runId ? null : runId));
    }

    goToAgent(agentId: string): void {
        void this.router.navigate(['/agents', agentId]);
    }

    // ─── Challenge helpers ────────────────────────────────────────────────────

    challengesByCategory(cat: ChallengeCategory): Challenge[] {
        return ALL_CHALLENGES.filter((c) => c.category === cat);
    }

    catLabel(cat: ChallengeCategory): string {
        return CATEGORY_LABELS[cat];
    }

    catIcon(cat: ChallengeCategory): string {
        return CATEGORY_ICONS[cat];
    }

    catWeight(cat: ChallengeCategory): number {
        return CATEGORY_WEIGHTS[cat];
    }

    scoreLevel(score: number): 'high' | 'mid' | 'low' {
        if (score >= 70) return 'high';
        if (score >= 40) return 'mid';
        return 'low';
    }
}

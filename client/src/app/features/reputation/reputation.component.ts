import { Component, ChangeDetectionStrategy, inject, OnInit, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { ReputationService } from '../../core/services/reputation.service';
import { AgentService } from '../../core/services/agent.service';
import { NotificationService } from '../../core/services/notification.service';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import type { ReputationScore, ReputationEvent, ScoreExplanation, ComponentExplanation, AgentReputationStats, ReputationHistoryPoint } from '../../core/models/reputation.model';

@Component({
    selector: 'app-reputation',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule, DecimalPipe, RelativeTimePipe, EmptyStateComponent, SkeletonComponent],
    template: `
        <div class="page">
            <div class="page__header">
                <h2>Agent Reputation</h2>
                <button
                    class="btn btn--primary"
                    [disabled]="computing()"
                    (click)="onComputeAll()">
                    {{ computing() ? 'Computing...' : 'Compute All' }}
                </button>
            </div>

            @if (reputationService.loading()) {
                <app-skeleton variant="table" [count]="4" />
            } @else if (loadError()) {
                <div class="error-banner">
                    <p>Reputation service unavailable (503). Scores may not be computed yet.</p>
                </div>
            } @else if (reputationService.scores().length === 0) {
                <app-empty-state
                    icon="  [***]\n  [** ]\n  [*  ]"
                    title="No reputation scores yet."
                    description="Reputation scores are computed from agent activity, session outcomes, and peer reviews."
                    actionLabel="View Agents"
                    actionRoute="/agents"
                    actionAriaLabel="View agents to start building reputation" />
            } @else {
                <div class="card-grid stagger-children">
                    @for (score of reputationService.scores(); track score.agentId) {
                        <div
                            class="agent-card card-lift"
                            [class.agent-card--selected]="selectedAgentId() === score.agentId"
                            (click)="selectAgent(score.agentId)">
                            <div class="agent-card__header">
                                <span class="agent-card__name">{{ getAgentName(score.agentId) }}</span>
                                <span class="trust-badge" [attr.data-level]="score.trustLevel">{{ score.trustLevel }}</span>
                            </div>
                            @if (score.hasActivity) {
                                <div class="agent-card__body">
                                    <div class="score-ring">
                                        <svg viewBox="0 0 120 120" class="score-ring__svg">
                                            <circle cx="60" cy="60" r="52" class="score-ring__bg" />
                                            <circle
                                                cx="60" cy="60" r="52"
                                                class="score-ring__fill"
                                                [attr.data-level]="score.trustLevel"
                                                [attr.stroke-dasharray]="ringCircumference"
                                                [attr.stroke-dashoffset]="getRingOffset(score.overallScore)"
                                                transform="rotate(-90 60 60)" />
                                            <text x="60" y="60" class="score-ring__text" dominant-baseline="central" text-anchor="middle">
                                                {{ score.overallScore | number:'1.0-0' }}
                                            </text>
                                        </svg>
                                    </div>
                                    <div class="component-bars">
                                        @for (meta of componentMeta; track meta.key) {
                                            <div class="comp-bar">
                                                <div class="comp-bar__label">
                                                    <span>{{ meta.label }}</span>
                                                    <span class="comp-bar__weight">{{ meta.weight }}</span>
                                                </div>
                                                <div class="comp-bar__track">
                                                    <div
                                                        class="comp-bar__fill"
                                                        [attr.data-color]="meta.color"
                                                        [style.width.%]="score.components[meta.key]">
                                                    </div>
                                                </div>
                                                <span class="comp-bar__value">{{ score.components[meta.key] | number:'1.0-0' }}</span>
                                            </div>
                                        }
                                    </div>
                                </div>
                            } @else {
                                <div class="no-activity">No activity data</div>
                            }
                            <div class="agent-card__footer">
                                <span class="computed-at">{{ score.computedAt | relativeTime }}</span>
                            </div>
                        </div>
                    }
                </div>

                @if (reputationService.scores().length > 1) {
                    <div class="compare-section">
                        <h4>
                            <button class="btn btn--sm" [class.btn--primary]="compareMode()" (click)="compareMode.set(!compareMode())">
                                {{ compareMode() ? 'Exit Compare' : 'Compare Agents' }}
                            </button>
                        </h4>
                        @if (compareMode()) {
                            <div class="compare-grid">
                                <div class="compare-chart">
                                    <svg [attr.viewBox]="'0 0 ' + compareWidth + ' ' + compareBarHeight" class="compare-chart__svg">
                                        @for (agent of comparisonData(); track agent.agentId; let i = $index) {
                                            <g [attr.transform]="'translate(0,' + (i * 28) + ')'">
                                                <text x="0" y="16" class="compare-chart__name">{{ agent.name }}</text>
                                                <rect x="100" y="4" [attr.width]="agent.barWidth" height="16" rx="3"
                                                      class="compare-chart__bar" [attr.data-level]="agent.trustLevel" />
                                                <text [attr.x]="104 + agent.barWidth" y="16" class="compare-chart__score">{{ agent.score }}</text>
                                            </g>
                                        }
                                    </svg>
                                </div>
                                <div class="compare-components">
                                    @for (meta of componentMeta; track meta.key) {
                                        <div class="compare-component-row">
                                            <span class="compare-component-label">{{ meta.label }}</span>
                                            <div class="compare-component-bars">
                                                @for (agent of comparisonData(); track agent.agentId) {
                                                    <div class="compare-mini-bar">
                                                        <span class="compare-mini-name">{{ agent.name }}</span>
                                                        <div class="compare-mini-track">
                                                            <div class="compare-mini-fill" [attr.data-color]="meta.color"
                                                                 [style.width.%]="agent.components[meta.key]"></div>
                                                        </div>
                                                        <span class="compare-mini-val">{{ agent.components[meta.key] }}</span>
                                                    </div>
                                                }
                                            </div>
                                        </div>
                                    }
                                </div>
                            </div>
                        }
                    </div>
                }

                @if (selectedAgentId()) {
                    <div class="detail-panel">
                        @if (selectedScore(); as s) {
                            <div class="detail-panel__header">
                                <h3>{{ getAgentName(s.agentId) }}</h3>
                                <span class="trust-badge trust-badge--lg" [attr.data-level]="s.trustLevel">{{ s.trustLevel }}</span>
                            </div>

                            @if (!s.hasActivity) {
                                <div class="no-activity-notice">
                                    This agent has no recorded activity. Scores shown are system defaults.
                                </div>
                            }

                            @if (explanation(); as ex) {
                                @if (ex.decayFactor < 1) {
                                    <div class="decay-notice">
                                        Decay applied: {{ ex.decayFactor | number:'1.3-3' }}x multiplier (raw score: {{ ex.rawScore }})
                                    </div>
                                }
                                <div class="explain-components">
                                    @for (comp of ex.components; track comp.component) {
                                        <div class="explain-card" [class.explain-card--default]="comp.isDefault">
                                            <div class="explain-card__header">
                                                <span class="explain-card__name">{{ getComponentLabel(comp.component) }}</span>
                                                <span class="explain-card__weight">{{ comp.weight * 100 | number:'1.0-0' }}%</span>
                                                <span class="explain-card__score" [attr.data-color]="getComponentColor(comp.component)">
                                                    {{ comp.score | number:'1.0-0' }}
                                                </span>
                                                @if (comp.isDefault) {
                                                    <span class="default-badge">DEFAULT</span>
                                                }
                                            </div>
                                            <div class="explain-card__reason">{{ comp.reason }}</div>
                                            <div class="explain-card__contribution">
                                                Contributes {{ comp.weightedContribution | number:'1.1-1' }} to overall score
                                            </div>
                                            @if (comp.recentEvents.length > 0) {
                                                <div class="explain-card__events">
                                                    <span class="explain-card__events-label">Evidence ({{ comp.recentEvents.length }} events):</span>
                                                    @for (ev of comp.recentEvents; track ev.id) {
                                                        <div class="explain-event">
                                                            <span class="explain-event__type" [attr.data-type]="ev.event_type">{{ getEventLabel(ev.event_type) }}</span>
                                                            <span class="explain-event__impact" [attr.data-impact]="ev.score_impact >= 0 ? 'positive' : 'negative'">
                                                                {{ ev.score_impact >= 0 ? '+' : '' }}{{ ev.score_impact }}
                                                            </span>
                                                            <span class="explain-event__time">{{ ev.created_at | relativeTime }}</span>
                                                        </div>
                                                    }
                                                </div>
                                            }
                                        </div>
                                    }
                                </div>
                            } @else {
                                <div class="detail-components">
                                    @for (meta of componentMeta; track meta.key) {
                                        <div class="detail-bar">
                                            <div class="detail-bar__label">
                                                <span>{{ meta.label }}</span>
                                                <span class="detail-bar__weight">{{ meta.weight }}</span>
                                            </div>
                                            <div class="detail-bar__track">
                                                <div
                                                    class="detail-bar__fill"
                                                    [attr.data-color]="meta.color"
                                                    [style.width.%]="s.components[meta.key]">
                                                </div>
                                            </div>
                                            <span class="detail-bar__value">{{ s.components[meta.key] | number:'1.0-0' }}</span>
                                        </div>
                                    }
                                </div>
                            }

                            @if (stats()) {
                                <h4>Activity Breakdown</h4>
                                <div class="stats-grid stagger-scale">
                                    @if (stats()!.feedbackTotal.total > 0) {
                                        <div class="stat-card">
                                            <div class="stat-card__icon" data-type="positive">&#128077;</div>
                                            <div class="stat-card__value">{{ stats()!.feedbackTotal.positive }}</div>
                                            <div class="stat-card__label">Likes</div>
                                        </div>
                                        <div class="stat-card">
                                            <div class="stat-card__icon" data-type="negative">&#128078;</div>
                                            <div class="stat-card__value">{{ stats()!.feedbackTotal.negative }}</div>
                                            <div class="stat-card__label">Dislikes</div>
                                        </div>
                                    }
                                    @if (stats()!.events['task_completed']; as tc) {
                                        <div class="stat-card">
                                            <div class="stat-card__icon" data-type="positive">&#10003;</div>
                                            <div class="stat-card__value">{{ tc.count }}</div>
                                            <div class="stat-card__label">Tasks Done</div>
                                        </div>
                                    }
                                    @if (stats()!.events['task_failed']; as tf) {
                                        <div class="stat-card">
                                            <div class="stat-card__icon" data-type="negative">&#10007;</div>
                                            <div class="stat-card__value">{{ tf.count }}</div>
                                            <div class="stat-card__label">Tasks Failed</div>
                                        </div>
                                    }
                                    @if (stats()!.events['session_completed']; as sc) {
                                        <div class="stat-card">
                                            <div class="stat-card__icon">&#9881;</div>
                                            <div class="stat-card__value">{{ sc.count }}</div>
                                            <div class="stat-card__label">Sessions</div>
                                        </div>
                                    }
                                    @if (stats()!.events['attestation_published']; as ap) {
                                        <div class="stat-card">
                                            <div class="stat-card__icon">&#128279;</div>
                                            <div class="stat-card__value">{{ ap.count }}</div>
                                            <div class="stat-card__label">Attestations</div>
                                        </div>
                                    }
                                    @if (stats()!.events['improvement_loop_completed']; as ilc) {
                                        <div class="stat-card">
                                            <div class="stat-card__icon" data-type="positive">&#8634;</div>
                                            <div class="stat-card__value">{{ ilc.count }}</div>
                                            <div class="stat-card__label">Improvements</div>
                                        </div>
                                    }
                                    @if (stats()!.events['security_violation']; as sv) {
                                        <div class="stat-card">
                                            <div class="stat-card__icon" data-type="negative">&#9888;</div>
                                            <div class="stat-card__value">{{ sv.count }}</div>
                                            <div class="stat-card__label">Violations</div>
                                        </div>
                                    }
                                </div>
                                @if (hasFeedbackSources()) {
                                    <h4>Feedback by Source</h4>
                                    <div class="feedback-sources">
                                        @for (src of feedbackSources(); track src.source) {
                                            <div class="source-row">
                                                <span class="source-row__name">{{ src.source }}</span>
                                                <span class="source-row__positive">+{{ src.positive }}</span>
                                                <span class="source-row__negative">-{{ src.negative }}</span>
                                            </div>
                                        }
                                    </div>
                                }
                            }

                            @if (s.attestationHash) {
                                <p class="attestation">Attestation: <code>{{ s.attestationHash }}</code></p>
                            } @else {
                                <button class="btn btn--primary btn--sm" (click)="onCreateAttestation(s.agentId)">Create Attestation</button>
                            }
                        }

                        @if (history().length > 1) {
                            <h4>Score Trend</h4>
                            <div class="history-chart">
                                <div class="history-chart__legend">
                                    <label class="history-chart__toggle">
                                        <input type="checkbox" [checked]="showComponents()" (change)="showComponents.set(!showComponents())">
                                        Show components
                                    </label>
                                    @for (meta of componentMeta; track meta.key) {
                                        @if (showComponents()) {
                                            <span class="history-chart__legend-item" [attr.data-color]="meta.color">{{ meta.label }}</span>
                                        }
                                    }
                                </div>
                                <svg [attr.viewBox]="'0 0 ' + historyWidth + ' ' + historyHeight" class="history-chart__svg" preserveAspectRatio="none">
                                    <!-- Y-axis grid lines -->
                                    @for (y of historyYGrid; track y.value) {
                                        <line x1="0" [attr.y1]="y.y" [attr.x2]="historyWidth" [attr.y2]="y.y" class="history-chart__grid" />
                                        <text x="2" [attr.y]="y.y - 2" class="history-chart__axis-label">{{ y.value }}</text>
                                    }
                                    <!-- Component lines (behind main) -->
                                    @if (showComponents()) {
                                        @for (line of historyComponentLines(); track line.key) {
                                            <path [attr.d]="line.path" class="history-chart__component-line" [attr.data-color]="line.color" />
                                        }
                                    }
                                    <!-- Main score area + line -->
                                    @if (historyAreaPath()) {
                                        <path [attr.d]="historyAreaPath()" class="history-chart__area" />
                                    }
                                    @if (historyLinePath()) {
                                        <path [attr.d]="historyLinePath()" class="history-chart__main-line" />
                                    }
                                    <!-- Score dots -->
                                    @for (point of historyPoints(); track $index) {
                                        <circle [attr.cx]="point.x" [attr.cy]="point.y" r="3"
                                                class="history-chart__dot"
                                                [attr.data-level]="point.trustLevel">
                                            <title>{{ point.date }}: Score {{ point.score }}</title>
                                        </circle>
                                    }
                                </svg>
                                <div class="history-chart__x-labels">
                                    @for (label of historyXLabels(); track label.text) {
                                        <span [style.left.%]="label.pct">{{ label.text }}</span>
                                    }
                                </div>
                            </div>
                        }

                        @if (reputationService.events().length > 1) {
                            <h4>Score Impact Timeline</h4>
                            <div class="trend-chart">
                                <svg [attr.viewBox]="'0 0 ' + trendWidth + ' ' + trendHeight" class="trend-chart__svg" preserveAspectRatio="none">
                                    <!-- Zero line -->
                                    <line x1="0" [attr.y1]="trendHeight / 2" [attr.x1]="trendWidth" [attr.y2]="trendHeight / 2"
                                          class="trend-chart__zero" />
                                    <!-- Area fills -->
                                    @if (trendPathPositive()) {
                                        <path [attr.d]="trendPathPositive()" class="trend-chart__area trend-chart__area--positive" />
                                    }
                                    @if (trendPathNegative()) {
                                        <path [attr.d]="trendPathNegative()" class="trend-chart__area trend-chart__area--negative" />
                                    }
                                    <!-- Line -->
                                    @if (trendLinePath()) {
                                        <path [attr.d]="trendLinePath()" class="trend-chart__line" />
                                    }
                                    <!-- Dots -->
                                    @for (point of trendPoints(); track $index) {
                                        <circle [attr.cx]="point.x" [attr.cy]="point.y" r="2.5"
                                                class="trend-chart__dot"
                                                [attr.data-impact]="point.impact >= 0 ? 'positive' : 'negative'">
                                            <title>{{ point.label }}: {{ point.impact >= 0 ? '+' : '' }}{{ point.impact }}</title>
                                        </circle>
                                    }
                                </svg>
                                <div class="trend-chart__labels">
                                    <span class="trend-chart__label trend-chart__label--positive">+ positive</span>
                                    <span class="trend-chart__label trend-chart__label--negative">- negative</span>
                                </div>
                            </div>
                        }

                        <h4>All Events</h4>
                        @if (reputationService.events().length === 0) {
                            <p class="empty">No events recorded.</p>
                        } @else {
                            <div class="events-list">
                                @for (event of reputationService.events(); track event.id) {
                                    <div class="event-row">
                                        <span class="event-label" [attr.data-type]="event.eventType">{{ getEventLabel(event.eventType) }}</span>
                                        <span class="event-impact" [attr.data-impact]="event.scoreImpact >= 0 ? 'positive' : 'negative'">
                                            {{ event.scoreImpact >= 0 ? '+' : '' }}{{ event.scoreImpact }}
                                        </span>
                                        <span class="event-time">{{ event.createdAt | relativeTime }}</span>
                                    </div>
                                }
                            </div>
                        }
                    </div>
                }
            }
        </div>
    `,
    styles: `
        .page { padding: 1.5rem; }
        .page__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
        .page__header h2 { margin: 0; color: var(--text-primary); }
        .loading, .empty { color: var(--text-secondary); font-size: 0.85rem; }
        .error-banner {
            background: var(--accent-red-dim); border: 1px solid var(--accent-red); border-radius: var(--radius);
            padding: 0.75rem 1rem; margin-bottom: 1rem;
        }
        .error-banner p { margin: 0; color: var(--accent-red); font-size: 0.85rem; }

        /* Card grid */
        .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
        .agent-card {
            background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius);
            padding: 1rem; cursor: pointer; transition: border-color 0.15s;
        }
        .agent-card:hover { border-color: var(--accent-cyan); }
        .agent-card--selected { border-color: var(--accent-cyan); background: var(--bg-raised); }
        .agent-card__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
        .agent-card__name { font-weight: 600; color: var(--text-primary); font-size: 0.9rem; }
        .agent-card__body { display: flex; gap: 1rem; align-items: flex-start; }
        .agent-card__footer { margin-top: 0.75rem; }
        .computed-at { font-size: 0.7rem; color: var(--text-secondary); }

        /* Trust badge */
        .trust-badge {
            font-size: 0.65rem; padding: 1px 6px; border-radius: var(--radius-sm); font-weight: 600;
            text-transform: uppercase; background: var(--bg-raised); border: 1px solid var(--border);
        }
        .trust-badge--lg { font-size: 0.75rem; padding: 2px 10px; }
        .trust-badge[data-level="verified"], .trust-badge[data-level="high"] { color: var(--accent-green); border-color: var(--accent-green); }
        .trust-badge[data-level="medium"] { color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .trust-badge[data-level="low"] { color: var(--accent-yellow); border-color: var(--accent-yellow); }
        .trust-badge[data-level="untrusted"] { color: var(--accent-red); border-color: var(--accent-red); }

        /* Score ring */
        .score-ring { flex-shrink: 0; width: 80px; height: 80px; }
        .score-ring__svg { width: 100%; height: 100%; }
        .score-ring__bg { fill: none; stroke: var(--border); stroke-width: 8; }
        .score-ring__fill {
            fill: none; stroke-width: 8; stroke-linecap: round;
            transition: stroke-dashoffset 0.5s ease;
            animation: ringDraw 0.8s ease-out;
        }
        @keyframes ringDraw {
            from { stroke-dashoffset: 326.73; }
        }
        .score-ring__fill[data-level="verified"], .score-ring__fill[data-level="high"] { stroke: var(--accent-green); }
        .score-ring__fill[data-level="medium"] { stroke: var(--accent-cyan); }
        .score-ring__fill[data-level="low"] { stroke: var(--accent-yellow); }
        .score-ring__fill[data-level="untrusted"] { stroke: var(--accent-red); }
        .score-ring__text { font-size: 1.4rem; font-weight: 700; fill: var(--text-primary); }

        /* Component bars (card) */
        .component-bars { flex: 1; display: flex; flex-direction: column; gap: 0.3rem; }
        .comp-bar { display: grid; grid-template-columns: 1fr 60px 28px; align-items: center; gap: 0.4rem; }
        .comp-bar__label { display: flex; justify-content: space-between; font-size: 0.65rem; color: var(--text-secondary); }
        .comp-bar__weight { font-size: 0.6rem; color: var(--text-secondary); opacity: 0.7; }
        .comp-bar__track { height: 6px; background: var(--bg-raised); border-radius: 3px; overflow: hidden; }
        .comp-bar__fill { height: 100%; border-radius: 3px; transition: width 0.3s ease; }
        .comp-bar__fill[data-color="green"] { background: var(--accent-green); }
        .comp-bar__fill[data-color="yellow"] { background: var(--accent-yellow); }
        .comp-bar__fill[data-color="cyan"] { background: var(--accent-cyan); }
        .comp-bar__fill[data-color="purple"] { background: var(--accent-purple); }
        .comp-bar__fill[data-color="orange"] { background: var(--accent-orange); }
        .comp-bar__value { font-size: 0.7rem; color: var(--text-primary); text-align: right; }

        /* Detail panel */
        .detail-panel {
            background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius);
            padding: 1.5rem; margin-top: 1.5rem;
        }
        .detail-panel__header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; }
        .detail-panel__header h3 { margin: 0; color: var(--text-primary); }
        .detail-panel h4 { margin: 1.5rem 0 0.75rem; color: var(--text-primary); }
        .detail-components { display: flex; flex-direction: column; gap: 0.5rem; }
        .detail-bar { display: grid; grid-template-columns: 140px 1fr 40px; align-items: center; gap: 0.5rem; }
        .detail-bar__label { display: flex; justify-content: space-between; }
        .detail-bar__label span:first-child { font-size: 0.8rem; color: var(--text-secondary); font-weight: 600; }
        .detail-bar__weight { font-size: 0.7rem; color: var(--text-secondary); opacity: 0.7; }
        .detail-bar__track { height: 8px; background: var(--bg-raised); border-radius: 4px; overflow: hidden; }
        .detail-bar__fill { height: 100%; border-radius: 4px; transition: width 0.3s ease; }
        .detail-bar__fill[data-color="green"] { background: var(--accent-green); }
        .detail-bar__fill[data-color="yellow"] { background: var(--accent-yellow); }
        .detail-bar__fill[data-color="cyan"] { background: var(--accent-cyan); }
        .detail-bar__fill[data-color="purple"] { background: var(--accent-purple); }
        .detail-bar__fill[data-color="orange"] { background: var(--accent-orange); }
        .detail-bar__value { font-size: 0.85rem; color: var(--text-primary); text-align: right; font-weight: 600; }
        .attestation { font-size: 0.8rem; color: var(--text-secondary); margin: 1rem 0; }
        .attestation code { color: var(--accent-green); font-size: 0.75rem; }

        /* No activity */
        .no-activity {
            color: var(--text-secondary); font-size: 0.8rem; padding: 1rem;
            text-align: center; font-style: italic; width: 100%;
        }
        .no-activity-notice {
            background: var(--bg-raised); border: 1px solid var(--border); border-radius: var(--radius);
            padding: 0.75rem 1rem; margin-bottom: 1rem; font-size: 0.8rem; color: var(--text-secondary);
        }

        /* Decay notice */
        .decay-notice {
            background: var(--accent-yellow-dim); border: 1px solid var(--accent-yellow);
            border-radius: var(--radius); padding: 0.5rem 0.75rem; margin-bottom: 1rem;
            font-size: 0.8rem; color: var(--accent-yellow);
        }

        /* Explanation cards */
        .explain-components { display: flex; flex-direction: column; gap: 0.75rem; }
        .explain-card {
            background: var(--bg-raised); border: 1px solid var(--border); border-radius: var(--radius);
            padding: 0.75rem 1rem;
        }
        .explain-card--default { border-left: 3px solid var(--accent-yellow); }
        .explain-card__header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem; }
        .explain-card__name { font-weight: 600; font-size: 0.85rem; color: var(--text-primary); }
        .explain-card__weight { font-size: 0.7rem; color: var(--text-secondary); }
        .explain-card__score { font-size: 0.85rem; font-weight: 700; margin-left: auto; }
        .explain-card__score[data-color="green"] { color: var(--accent-green); }
        .explain-card__score[data-color="yellow"] { color: var(--accent-yellow); }
        .explain-card__score[data-color="cyan"] { color: var(--accent-cyan); }
        .explain-card__score[data-color="purple"] { color: var(--accent-purple); }
        .explain-card__score[data-color="orange"] { color: var(--accent-orange); }
        .default-badge {
            font-size: 0.6rem; padding: 1px 5px; border-radius: 3px; font-weight: 700;
            background: var(--accent-yellow-dim);
            color: var(--accent-yellow); border: 1px solid var(--accent-yellow);
        }
        .explain-card__reason { font-size: 0.8rem; color: var(--text-secondary); line-height: 1.4; margin-bottom: 0.3rem; }
        .explain-card__contribution { font-size: 0.7rem; color: var(--text-secondary); opacity: 0.7; }
        .explain-card__events { margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid var(--border); }
        .explain-card__events-label { font-size: 0.7rem; color: var(--text-secondary); font-weight: 600; display: block; margin-bottom: 0.3rem; }
        .explain-event { display: flex; align-items: center; gap: 0.5rem; padding: 0.15rem 0; font-size: 0.75rem; }
        .explain-event__type { font-weight: 600; color: var(--text-primary); }
        .explain-event__type[data-type="task_completed"],
        .explain-event__type[data-type="credit_earned"],
        .explain-event__type[data-type="session_completed"] { color: var(--accent-green); }
        .explain-event__type[data-type="task_failed"],
        .explain-event__type[data-type="security_violation"] { color: var(--accent-red); }
        .explain-event__type[data-type="feedback_received"],
        .explain-event__type[data-type="review_received"] { color: var(--accent-yellow); }
        .explain-event__type[data-type="credit_spent"] { color: var(--accent-cyan); }
        .explain-event__impact { font-weight: 600; min-width: 2.5em; }
        .explain-event__impact[data-impact="positive"] { color: var(--accent-green); }
        .explain-event__impact[data-impact="negative"] { color: var(--accent-red); }
        .explain-event__time { color: var(--text-secondary); margin-left: auto; }

        /* Stats grid */
        .stats-grid {
            display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 0.75rem;
        }
        .stat-card {
            background: var(--bg-raised); border: 1px solid var(--border); border-radius: var(--radius);
            padding: 0.75rem; text-align: center;
        }
        .stat-card__icon { font-size: 1.2rem; margin-bottom: 0.25rem; }
        .stat-card__icon[data-type="positive"] { color: var(--accent-green); }
        .stat-card__icon[data-type="negative"] { color: var(--accent-red); }
        .stat-card__value { font-size: 1.4rem; font-weight: 700; color: var(--text-primary); }
        .stat-card__label { font-size: 0.65rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 0.15rem; }

        /* Feedback sources */
        .feedback-sources { display: flex; flex-direction: column; gap: 0.25rem; }
        .source-row {
            display: flex; align-items: center; gap: 0.75rem; padding: 0.35rem 0;
            font-size: 0.8rem; border-bottom: 1px solid var(--border);
        }
        .source-row__name { font-weight: 600; color: var(--text-primary); flex: 1; text-transform: capitalize; }
        .source-row__positive { color: var(--accent-green); font-weight: 600; }
        .source-row__negative { color: var(--accent-red); font-weight: 600; }

        /* Events */
        .events-list { display: flex; flex-direction: column; gap: 0.25rem; }
        .event-row {
            display: flex; align-items: center; gap: 0.75rem; padding: 0.4rem 0;
            font-size: 0.8rem; border-bottom: 1px solid var(--border);
        }
        .event-label { font-weight: 600; color: var(--text-primary); }
        .event-label[data-type="task_completed"],
        .event-label[data-type="credit_earned"],
        .event-label[data-type="session_completed"],
        .event-label[data-type="improvement_loop_completed"] { color: var(--accent-green); }
        .event-label[data-type="task_failed"],
        .event-label[data-type="security_violation"],
        .event-label[data-type="improvement_loop_failed"] { color: var(--accent-red); }
        .event-label[data-type="review_received"] { color: var(--accent-yellow); }
        .event-label[data-type="credit_spent"] { color: var(--accent-cyan); }
        .event-label[data-type="attestation_published"] { color: var(--accent-purple); }
        .event-impact { font-weight: 600; min-width: 3em; }
        .event-impact[data-impact="positive"] { color: var(--accent-green); }
        .event-impact[data-impact="negative"] { color: var(--accent-red); }
        .event-time { color: var(--text-secondary); margin-left: auto; font-size: 0.75rem; }

        /* Buttons */
        .btn {
            padding: 0.5rem 1rem; border-radius: var(--radius); font-size: 0.8rem; font-weight: 600;
            cursor: pointer; border: 1px solid; font-family: inherit; text-transform: uppercase; letter-spacing: 0.05em;
        }
        .btn--sm { padding: 0.4rem 0.75rem; font-size: 0.7rem; min-height: 32px; }
        .btn--primary { border-color: var(--accent-cyan); background: var(--accent-cyan-dim); color: var(--accent-cyan); }
        .btn--primary:hover:not(:disabled) { background: var(--accent-cyan-dim); }
        .btn--primary:disabled { opacity: 0.5; cursor: not-allowed; }

        /* Trend chart */
        .trend-chart {
            background: var(--bg-raised); border: 1px solid var(--border); border-radius: var(--radius);
            padding: 0.75rem; margin-bottom: 1rem;
        }
        .trend-chart__svg { width: 100%; height: 80px; display: block; }
        .trend-chart__zero { stroke: var(--border); stroke-width: 0.5; stroke-dasharray: 4 2; }
        .trend-chart__line { fill: none; stroke: var(--accent-cyan); stroke-width: 1.5; stroke-linejoin: round; stroke-linecap: round; }
        .trend-chart__area { opacity: 0.15; }
        .trend-chart__area--positive { fill: var(--accent-green); }
        .trend-chart__area--negative { fill: var(--accent-red); }
        .trend-chart__dot { transition: r 0.15s; }
        .trend-chart__dot:hover { r: 4; }
        .trend-chart__dot[data-impact="positive"] { fill: var(--accent-green); }
        .trend-chart__dot[data-impact="negative"] { fill: var(--accent-red); }
        .trend-chart__labels { display: flex; justify-content: space-between; margin-top: 0.35rem; }
        .trend-chart__label { font-size: 0.55rem; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.05em; }
        .trend-chart__label--positive { color: var(--accent-green); }
        .trend-chart__label--negative { color: var(--accent-red); }

        /* History trend chart */
        .history-chart {
            background: var(--bg-raised); border: 1px solid var(--border); border-radius: var(--radius);
            padding: 0.75rem; margin-bottom: 1rem;
        }
        .history-chart__legend {
            display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem; flex-wrap: wrap;
        }
        .history-chart__toggle {
            font-size: 0.7rem; color: var(--text-secondary); display: flex; align-items: center; gap: 0.3rem; cursor: pointer;
        }
        .history-chart__toggle input { cursor: pointer; }
        .history-chart__legend-item {
            font-size: 0.6rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;
        }
        .history-chart__legend-item[data-color="green"] { color: var(--accent-green); }
        .history-chart__legend-item[data-color="yellow"] { color: var(--accent-yellow); }
        .history-chart__legend-item[data-color="cyan"] { color: var(--accent-cyan); }
        .history-chart__legend-item[data-color="purple"] { color: var(--accent-purple); }
        .history-chart__legend-item[data-color="orange"] { color: var(--accent-orange); }
        .history-chart__svg { width: 100%; height: 120px; display: block; }
        .history-chart__grid { stroke: var(--border); stroke-width: 0.5; opacity: 0.5; }
        .history-chart__axis-label { fill: var(--text-tertiary); font-size: 7px; }
        .history-chart__main-line {
            fill: none; stroke: var(--accent-cyan); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round;
        }
        .history-chart__area { fill: var(--accent-cyan); opacity: 0.08; }
        .history-chart__component-line {
            fill: none; stroke-width: 1; stroke-linejoin: round; stroke-linecap: round; opacity: 0.6;
        }
        .history-chart__component-line[data-color="green"] { stroke: var(--accent-green); }
        .history-chart__component-line[data-color="yellow"] { stroke: var(--accent-yellow); }
        .history-chart__component-line[data-color="cyan"] { stroke: var(--accent-cyan); stroke-dasharray: 4 2; }
        .history-chart__component-line[data-color="purple"] { stroke: var(--accent-purple); }
        .history-chart__component-line[data-color="orange"] { stroke: var(--accent-orange); }
        .history-chart__dot { transition: r 0.15s; cursor: default; }
        .history-chart__dot:hover { r: 5; }
        .history-chart__dot[data-level="verified"], .history-chart__dot[data-level="high"] { fill: var(--accent-green); }
        .history-chart__dot[data-level="medium"] { fill: var(--accent-cyan); }
        .history-chart__dot[data-level="low"] { fill: var(--accent-yellow); }
        .history-chart__dot[data-level="untrusted"] { fill: var(--accent-red); }
        .history-chart__x-labels {
            position: relative; height: 1rem; margin-top: 0.25rem;
        }
        .history-chart__x-labels span {
            position: absolute; font-size: 0.55rem; color: var(--text-tertiary); transform: translateX(-50%);
        }

        /* Compare section */
        .compare-section {
            margin-top: 1.5rem;
        }
        .compare-section h4 { margin: 0 0 0.75rem; }
        .compare-grid {
            background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius);
            padding: 1rem;
        }
        .compare-chart__svg { width: 100%; display: block; }
        .compare-chart__name { fill: var(--text-secondary); font-size: 10px; font-weight: 600; }
        .compare-chart__bar { opacity: 0.8; }
        .compare-chart__bar[data-level="verified"], .compare-chart__bar[data-level="high"] { fill: var(--accent-green); }
        .compare-chart__bar[data-level="medium"] { fill: var(--accent-cyan); }
        .compare-chart__bar[data-level="low"] { fill: var(--accent-yellow); }
        .compare-chart__bar[data-level="untrusted"] { fill: var(--accent-red); }
        .compare-chart__score { fill: var(--text-primary); font-size: 10px; font-weight: 700; }
        .compare-components { margin-top: 1rem; display: flex; flex-direction: column; gap: 0.75rem; }
        .compare-component-row {}
        .compare-component-label {
            font-size: 0.75rem; font-weight: 600; color: var(--text-primary); display: block; margin-bottom: 0.3rem;
        }
        .compare-component-bars { display: flex; flex-direction: column; gap: 0.2rem; }
        .compare-mini-bar { display: grid; grid-template-columns: 80px 1fr 30px; align-items: center; gap: 0.4rem; }
        .compare-mini-name { font-size: 0.65rem; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .compare-mini-track { height: 6px; background: var(--bg-raised); border-radius: 3px; overflow: hidden; }
        .compare-mini-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
        .compare-mini-fill[data-color="green"] { background: var(--accent-green); }
        .compare-mini-fill[data-color="yellow"] { background: var(--accent-yellow); }
        .compare-mini-fill[data-color="cyan"] { background: var(--accent-cyan); }
        .compare-mini-fill[data-color="purple"] { background: var(--accent-purple); }
        .compare-mini-fill[data-color="orange"] { background: var(--accent-orange); }
        .compare-mini-val { font-size: 0.7rem; color: var(--text-primary); text-align: right; }

        @media (max-width: 767px) {
            .card-grid { grid-template-columns: 1fr; }
            .agent-card__body { flex-direction: column; align-items: center; }
            .component-bars { width: 100%; }
            .compare-mini-bar { grid-template-columns: 60px 1fr 24px; }
        }
    `,
})
export class ReputationComponent implements OnInit {
    protected readonly reputationService = inject(ReputationService);
    private readonly agentService = inject(AgentService);
    private readonly notify = inject(NotificationService);

    protected readonly selectedAgentId = signal<string | null>(null);
    protected readonly selectedScore = signal<ReputationScore | null>(null);
    protected readonly explanation = signal<ScoreExplanation | null>(null);
    protected readonly stats = signal<AgentReputationStats | null>(null);
    protected readonly computing = signal(false);
    protected readonly loadError = signal(false);
    protected readonly history = signal<ReputationHistoryPoint[]>([]);
    protected readonly showComponents = signal(false);
    protected readonly compareMode = signal(false);

    protected readonly trendWidth = 400;
    protected readonly trendHeight = 80;

    // History chart dimensions
    protected readonly historyWidth = 500;
    protected readonly historyHeight = 120;
    protected readonly historyPad = 12;

    protected readonly historyYGrid = [
        { value: 100, y: 12 },
        { value: 50, y: 60 },
        { value: 0, y: 108 },
    ];

    protected readonly historyPoints = computed(() => {
        const h = this.history();
        if (h.length < 2) return [];
        const pad = this.historyPad;
        const w = this.historyWidth;
        const ht = this.historyHeight;
        return h.map((p, i) => ({
            x: pad + (i / (h.length - 1)) * (w - pad * 2),
            y: pad + ((100 - p.overallScore) / 100) * (ht - pad * 2),
            score: p.overallScore,
            trustLevel: p.trustLevel,
            date: new Date(p.computedAt).toLocaleDateString(),
        }));
    });

    protected readonly historyLinePath = computed(() => {
        const pts = this.historyPoints();
        if (pts.length < 2) return '';
        return 'M ' + pts.map(p => `${p.x},${p.y}`).join(' L ');
    });

    protected readonly historyAreaPath = computed(() => {
        const pts = this.historyPoints();
        if (pts.length < 2) return '';
        const bottom = this.historyHeight - this.historyPad;
        return `M ${pts[0].x},${bottom} ` +
            pts.map(p => `L ${p.x},${p.y}`).join(' ') +
            ` L ${pts[pts.length - 1].x},${bottom} Z`;
    });

    protected readonly historyComponentLines = computed(() => {
        const h = this.history();
        if (h.length < 2) return [];
        const pad = this.historyPad;
        const w = this.historyWidth;
        const ht = this.historyHeight;

        return this.componentMeta.map(meta => {
            const pts = h.map((p, i) => {
                const x = pad + (i / (h.length - 1)) * (w - pad * 2);
                const y = pad + ((100 - p.components[meta.key]) / 100) * (ht - pad * 2);
                return `${x},${y}`;
            });
            return {
                key: meta.key,
                color: meta.color,
                path: 'M ' + pts.join(' L '),
            };
        });
    });

    protected readonly historyXLabels = computed(() => {
        const h = this.history();
        if (h.length < 2) return [];
        const count = Math.min(h.length, 5);
        const labels: { text: string; pct: number }[] = [];
        for (let i = 0; i < count; i++) {
            const idx = Math.round((i / (count - 1)) * (h.length - 1));
            const d = new Date(h[idx].computedAt);
            labels.push({
                text: `${d.getMonth() + 1}/${d.getDate()}`,
                pct: (idx / (h.length - 1)) * 100,
            });
        }
        return labels;
    });

    // Comparison data
    protected readonly compareWidth = 400;
    protected readonly compareBarHeight = computed(() => this.reputationService.scores().length * 28);

    protected readonly comparisonData = computed(() => {
        const maxBarWidth = this.compareWidth - 140; // leave room for name + score text
        return this.reputationService.scores()
            .filter(s => s.hasActivity)
            .sort((a, b) => b.overallScore - a.overallScore)
            .map(s => ({
                agentId: s.agentId,
                name: this.getAgentName(s.agentId),
                score: s.overallScore,
                trustLevel: s.trustLevel,
                components: s.components,
                barWidth: (s.overallScore / 100) * maxBarWidth,
            }));
    });

    protected readonly trendPoints = computed(() => {
        const events = this.reputationService.events();
        if (events.length < 2) return [];
        const sorted = [...events].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        const maxAbs = Math.max(...sorted.map(e => Math.abs(e.scoreImpact)), 1);
        const mid = this.trendHeight / 2;
        const pad = 8;
        return sorted.map((e, i) => ({
            x: pad + (i / (sorted.length - 1)) * (this.trendWidth - pad * 2),
            y: mid - (e.scoreImpact / maxAbs) * (mid - pad),
            impact: e.scoreImpact,
            label: this.eventLabels[e.eventType] ?? e.eventType,
        }));
    });

    protected readonly trendLinePath = computed(() => {
        const pts = this.trendPoints();
        if (pts.length < 2) return '';
        return 'M ' + pts.map(p => `${p.x},${p.y}`).join(' L ');
    });

    protected readonly trendPathPositive = computed(() => {
        const pts = this.trendPoints();
        if (pts.length < 2) return '';
        const mid = this.trendHeight / 2;
        const clipped = pts.map(p => ({ x: p.x, y: Math.min(p.y, mid) }));
        return `M ${clipped[0].x},${mid} ` + clipped.map(p => `L ${p.x},${p.y}`).join(' ') + ` L ${clipped[clipped.length - 1].x},${mid} Z`;
    });

    protected readonly trendPathNegative = computed(() => {
        const pts = this.trendPoints();
        if (pts.length < 2) return '';
        const mid = this.trendHeight / 2;
        const clipped = pts.map(p => ({ x: p.x, y: Math.max(p.y, mid) }));
        return `M ${clipped[0].x},${mid} ` + clipped.map(p => `L ${p.x},${p.y}`).join(' ') + ` L ${clipped[clipped.length - 1].x},${mid} Z`;
    });

    protected readonly ringCircumference = 2 * Math.PI * 52; // ~326.7

    protected readonly componentMeta: { key: keyof ReputationScore['components']; label: string; weight: string; color: string }[] = [
        { key: 'taskCompletion', label: 'Task Completion', weight: '30%', color: 'green' },
        { key: 'peerRating', label: 'Peer Rating', weight: '25%', color: 'yellow' },
        { key: 'creditPattern', label: 'Credit Pattern', weight: '15%', color: 'cyan' },
        { key: 'securityCompliance', label: 'Security', weight: '20%', color: 'purple' },
        { key: 'activityLevel', label: 'Activity', weight: '10%', color: 'orange' },
    ];

    private readonly eventLabels: Record<string, string> = {
        task_completed: 'Task Completed',
        task_failed: 'Task Failed',
        review_received: 'Review Received',
        credit_spent: 'Credit Spent',
        credit_earned: 'Credit Earned',
        security_violation: 'Security Violation',
        session_completed: 'Session Completed',
        attestation_published: 'Attestation Published',
        improvement_loop_completed: 'Improvement Completed',
        improvement_loop_failed: 'Improvement Failed',
    };

    private agentNameCache: Record<string, string> = {};

    async ngOnInit(): Promise<void> {
        await this.agentService.loadAgents();
        for (const a of this.agentService.agents()) {
            this.agentNameCache[a.id] = a.name;
        }
        try {
            await this.reputationService.loadScores();
        } catch {
            this.loadError.set(true);
        }
    }

    protected getAgentName(agentId: string): string {
        return this.agentNameCache[agentId] ?? agentId.slice(0, 8);
    }

    protected getRingOffset(score: number): number {
        return this.ringCircumference - (score / 100) * this.ringCircumference;
    }

    protected getEventLabel(eventType: string): string {
        return this.eventLabels[eventType] ?? eventType;
    }

    private readonly componentLabels: Record<string, string> = {
        taskCompletion: 'Task Completion',
        peerRating: 'Peer Rating',
        creditPattern: 'Credit Pattern',
        securityCompliance: 'Security',
        activityLevel: 'Activity',
    };

    private readonly componentColors: Record<string, string> = {
        taskCompletion: 'green',
        peerRating: 'yellow',
        creditPattern: 'cyan',
        securityCompliance: 'purple',
        activityLevel: 'orange',
    };

    protected getComponentLabel(key: string): string {
        return this.componentLabels[key] ?? key;
    }

    protected getComponentColor(key: string): string {
        return this.componentColors[key] ?? 'cyan';
    }

    protected hasFeedbackSources(): boolean {
        const s = this.stats();
        return !!s && Object.keys(s.feedback).length > 0;
    }

    protected feedbackSources(): { source: string; positive: number; negative: number }[] {
        const s = this.stats();
        if (!s) return [];
        return Object.entries(s.feedback).map(([source, counts]) => ({
            source,
            positive: counts.positive,
            negative: counts.negative,
        }));
    }

    async selectAgent(agentId: string): Promise<void> {
        this.selectedAgentId.set(agentId);
        this.explanation.set(null);
        this.stats.set(null);
        this.history.set([]);
        try {
            const score = await this.reputationService.getScore(agentId);
            this.selectedScore.set(score);
            await Promise.all([
                this.reputationService.getEvents(agentId, 0),
                this.reputationService.getExplanation(agentId).then(ex => this.explanation.set(ex)),
                this.reputationService.getStats(agentId).then(s => this.stats.set(s)).catch(() => {}),
                this.reputationService.getHistory(agentId).then(h => this.history.set(h)).catch(() => {}),
            ]);
        } catch {
            this.selectedScore.set(null);
        }
    }

    async onComputeAll(): Promise<void> {
        this.computing.set(true);
        try {
            await this.reputationService.computeAll();
            this.notify.success('All scores recomputed');
        } catch {
            this.notify.error('Failed to compute scores');
        } finally {
            this.computing.set(false);
        }
    }

    async onCreateAttestation(agentId: string): Promise<void> {
        try {
            await this.reputationService.createAttestation(agentId);
            const score = await this.reputationService.getScore(agentId);
            this.selectedScore.set(score);
            this.notify.success('Attestation created');
        } catch {
            this.notify.error('Failed to create attestation');
        }
    }
}

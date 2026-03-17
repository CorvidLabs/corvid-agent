import { Component, ChangeDetectionStrategy, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { ReputationService } from '../../core/services/reputation.service';
import { AgentService } from '../../core/services/agent.service';
import { NotificationService } from '../../core/services/notification.service';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import type { ReputationScore, ReputationEvent, ScoreExplanation, ComponentExplanation, AgentReputationStats } from '../../core/models/reputation.model';

@Component({
    selector: 'app-reputation',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule, DecimalPipe, RelativeTimePipe],
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
                <p class="loading">Loading reputation scores...</p>
            } @else if (loadError()) {
                <div class="error-banner">
                    <p>Reputation service unavailable (503). Scores may not be computed yet.</p>
                </div>
            } @else if (reputationService.scores().length === 0) {
                <p class="empty">No reputation scores available. Scores are computed from agent activity.</p>
            } @else {
                <div class="card-grid">
                    @for (score of reputationService.scores(); track score.agentId) {
                        <div
                            class="agent-card"
                            [class.agent-card--selected]="selectedAgentId() === score.agentId"
                            (click)="selectAgent(score.agentId)">
                            <div class="agent-card__header">
                                <span class="agent-card__name">{{ getAgentName(score.agentId) }}</span>
                                <span class="trust-badge" [attr.data-level]="score.trustLevel">{{ score.trustLevel }}</span>
                            </div>
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
                            <div class="agent-card__footer">
                                <span class="computed-at">{{ score.computedAt | relativeTime }}</span>
                            </div>
                        </div>
                    }
                </div>

                @if (selectedAgentId()) {
                    <div class="detail-panel">
                        @if (selectedScore(); as s) {
                            <div class="detail-panel__header">
                                <h3>{{ getAgentName(s.agentId) }}</h3>
                                <span class="trust-badge trust-badge--lg" [attr.data-level]="s.trustLevel">{{ s.trustLevel }}</span>
                            </div>

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
                                <div class="stats-grid">
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

                        <h4>All Recent Events</h4>
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
        .trust-badge[data-level="low"] { color: var(--accent-yellow, #ffc107); border-color: var(--accent-yellow, #ffc107); }
        .trust-badge[data-level="untrusted"] { color: var(--accent-red); border-color: var(--accent-red); }

        /* Score ring */
        .score-ring { flex-shrink: 0; width: 80px; height: 80px; }
        .score-ring__svg { width: 100%; height: 100%; }
        .score-ring__bg { fill: none; stroke: var(--border); stroke-width: 8; }
        .score-ring__fill {
            fill: none; stroke-width: 8; stroke-linecap: round;
            transition: stroke-dashoffset 0.5s ease;
        }
        .score-ring__fill[data-level="verified"], .score-ring__fill[data-level="high"] { stroke: var(--accent-green); }
        .score-ring__fill[data-level="medium"] { stroke: var(--accent-cyan); }
        .score-ring__fill[data-level="low"] { stroke: var(--accent-yellow, #ffc107); }
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
        .comp-bar__fill[data-color="yellow"] { background: var(--accent-yellow, #ffc107); }
        .comp-bar__fill[data-color="cyan"] { background: var(--accent-cyan); }
        .comp-bar__fill[data-color="purple"] { background: var(--accent-purple, #b388ff); }
        .comp-bar__fill[data-color="orange"] { background: var(--accent-orange, #ff9100); }
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
        .detail-bar__fill[data-color="yellow"] { background: var(--accent-yellow, #ffc107); }
        .detail-bar__fill[data-color="cyan"] { background: var(--accent-cyan); }
        .detail-bar__fill[data-color="purple"] { background: var(--accent-purple, #b388ff); }
        .detail-bar__fill[data-color="orange"] { background: var(--accent-orange, #ff9100); }
        .detail-bar__value { font-size: 0.85rem; color: var(--text-primary); text-align: right; font-weight: 600; }
        .attestation { font-size: 0.8rem; color: var(--text-secondary); margin: 1rem 0; }
        .attestation code { color: var(--accent-green); font-size: 0.75rem; }

        /* Decay notice */
        .decay-notice {
            background: var(--accent-yellow-dim, rgba(255, 193, 7, 0.1)); border: 1px solid var(--accent-yellow, #ffc107);
            border-radius: var(--radius); padding: 0.5rem 0.75rem; margin-bottom: 1rem;
            font-size: 0.8rem; color: var(--accent-yellow, #ffc107);
        }

        /* Explanation cards */
        .explain-components { display: flex; flex-direction: column; gap: 0.75rem; }
        .explain-card {
            background: var(--bg-raised); border: 1px solid var(--border); border-radius: var(--radius);
            padding: 0.75rem 1rem;
        }
        .explain-card--default { border-left: 3px solid var(--accent-yellow, #ffc107); }
        .explain-card__header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem; }
        .explain-card__name { font-weight: 600; font-size: 0.85rem; color: var(--text-primary); }
        .explain-card__weight { font-size: 0.7rem; color: var(--text-secondary); }
        .explain-card__score { font-size: 0.85rem; font-weight: 700; margin-left: auto; }
        .explain-card__score[data-color="green"] { color: var(--accent-green); }
        .explain-card__score[data-color="yellow"] { color: var(--accent-yellow, #ffc107); }
        .explain-card__score[data-color="cyan"] { color: var(--accent-cyan); }
        .explain-card__score[data-color="purple"] { color: var(--accent-purple, #b388ff); }
        .explain-card__score[data-color="orange"] { color: var(--accent-orange, #ff9100); }
        .default-badge {
            font-size: 0.6rem; padding: 1px 5px; border-radius: 3px; font-weight: 700;
            background: var(--accent-yellow-dim, rgba(255, 193, 7, 0.1));
            color: var(--accent-yellow, #ffc107); border: 1px solid var(--accent-yellow, #ffc107);
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
        .explain-event__type[data-type="review_received"] { color: var(--accent-yellow, #ffc107); }
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
        .event-label[data-type="review_received"] { color: var(--accent-yellow, #ffc107); }
        .event-label[data-type="credit_spent"] { color: var(--accent-cyan); }
        .event-label[data-type="attestation_published"] { color: var(--accent-purple, #b388ff); }
        .event-impact { font-weight: 600; min-width: 3em; }
        .event-impact[data-impact="positive"] { color: var(--accent-green); }
        .event-impact[data-impact="negative"] { color: var(--accent-red); }
        .event-time { color: var(--text-secondary); margin-left: auto; font-size: 0.75rem; }

        /* Buttons */
        .btn {
            padding: 0.5rem 1rem; border-radius: var(--radius); font-size: 0.8rem; font-weight: 600;
            cursor: pointer; border: 1px solid; font-family: inherit; text-transform: uppercase; letter-spacing: 0.05em;
        }
        .btn--sm { padding: 0.25rem 0.5rem; font-size: 0.7rem; }
        .btn--primary { border-color: var(--accent-cyan); background: var(--accent-cyan-dim); color: var(--accent-cyan); }
        .btn--primary:hover:not(:disabled) { background: rgba(0, 229, 255, 0.15); }
        .btn--primary:disabled { opacity: 0.5; cursor: not-allowed; }

        @media (max-width: 768px) {
            .card-grid { grid-template-columns: 1fr; }
            .agent-card__body { flex-direction: column; align-items: center; }
            .component-bars { width: 100%; }
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
        try {
            const score = await this.reputationService.getScore(agentId);
            this.selectedScore.set(score);
            await Promise.all([
                this.reputationService.getEvents(agentId),
                this.reputationService.getExplanation(agentId).then(ex => this.explanation.set(ex)),
                this.reputationService.getStats(agentId).then(s => this.stats.set(s)).catch(() => {}),
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

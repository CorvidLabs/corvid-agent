import { Component, ChangeDetectionStrategy, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { ReputationService } from '../../core/services/reputation.service';
import { AgentService } from '../../core/services/agent.service';
import { NotificationService } from '../../core/services/notification.service';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import type { ReputationScore, ReputationEvent } from '../../core/models/reputation.model';

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

                            @if (s.attestationHash) {
                                <p class="attestation">Attestation: <code>{{ s.attestationHash }}</code></p>
                            } @else {
                                <button class="btn btn--primary btn--sm" (click)="onCreateAttestation(s.agentId)">Create Attestation</button>
                            }
                        }

                        <h4>Recent Events</h4>
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

    async selectAgent(agentId: string): Promise<void> {
        this.selectedAgentId.set(agentId);
        try {
            const score = await this.reputationService.getScore(agentId);
            this.selectedScore.set(score);
            await this.reputationService.getEvents(agentId);
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

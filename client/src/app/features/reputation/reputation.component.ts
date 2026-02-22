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
                <div class="scores-table">
                    <div class="scores-table__header">
                        <span>Agent</span>
                        <span>Overall</span>
                        <span>Trust</span>
                        <span>Task Rate</span>
                        <span>Peer</span>
                        <span>Security</span>
                        <span>Actions</span>
                    </div>
                    @for (score of reputationService.scores(); track score.agentId) {
                        <div
                            class="scores-table__row"
                            [class.scores-table__row--selected]="selectedAgentId() === score.agentId"
                            (click)="selectAgent(score.agentId)">
                            <span class="agent-name">{{ getAgentName(score.agentId) }}</span>
                            <span class="score" [attr.data-level]="score.trustLevel">{{ score.overallScore | number:'1.0-0' }}</span>
                            <span class="trust-badge" [attr.data-level]="score.trustLevel">{{ score.trustLevel }}</span>
                            <span>{{ score.components.taskCompletion | number:'1.0-0' }}</span>
                            <span>{{ score.components.peerRating | number:'1.0-0' }}</span>
                            <span>{{ score.components.securityCompliance | number:'1.0-0' }}</span>
                            <span class="actions-cell">
                                <button
                                    class="btn btn--sm btn--secondary"
                                    [disabled]="refreshing() === score.agentId"
                                    (click)="onRefresh(score.agentId, $event)">
                                    {{ refreshing() === score.agentId ? '...' : 'Refresh' }}
                                </button>
                            </span>
                        </div>
                    }
                </div>

                @if (selectedAgentId()) {
                    <div class="detail-panel">
                        <h3>Details for {{ getAgentName(selectedAgentId()!) }}</h3>

                        @if (selectedScore(); as s) {
                            <div class="score-breakdown">
                                <div class="score-bar">
                                    <label>Task Completion</label>
                                    <div class="bar"><div class="bar__fill" [style.width.%]="s.components.taskCompletion"></div></div>
                                    <span>{{ s.components.taskCompletion | number:'1.0-0' }}</span>
                                </div>
                                <div class="score-bar">
                                    <label>Peer Rating</label>
                                    <div class="bar"><div class="bar__fill" [style.width.%]="s.components.peerRating"></div></div>
                                    <span>{{ s.components.peerRating | number:'1.0-0' }}</span>
                                </div>
                                <div class="score-bar">
                                    <label>Credit Pattern</label>
                                    <div class="bar"><div class="bar__fill" [style.width.%]="s.components.creditPattern"></div></div>
                                    <span>{{ s.components.creditPattern | number:'1.0-0' }}</span>
                                </div>
                                <div class="score-bar">
                                    <label>Security</label>
                                    <div class="bar"><div class="bar__fill" [style.width.%]="s.components.securityCompliance"></div></div>
                                    <span>{{ s.components.securityCompliance | number:'1.0-0' }}</span>
                                </div>
                                <div class="score-bar">
                                    <label>Activity</label>
                                    <div class="bar"><div class="bar__fill" [style.width.%]="s.components.activityLevel"></div></div>
                                    <span>{{ s.components.activityLevel | number:'1.0-0' }}</span>
                                </div>
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
                                        <span class="event-type" [attr.data-impact]="event.scoreImpact >= 0 ? 'positive' : 'negative'">{{ event.eventType }}</span>
                                        <span class="event-impact">{{ event.scoreImpact >= 0 ? '+' : '' }}{{ event.scoreImpact }}</span>
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
        .page__header { margin-bottom: 1.5rem; }
        .page__header h2 { margin: 0; color: var(--text-primary); }
        .loading, .empty { color: var(--text-secondary); font-size: 0.85rem; }
        .error-banner {
            background: var(--accent-red-dim); border: 1px solid var(--accent-red); border-radius: var(--radius);
            padding: 0.75rem 1rem; margin-bottom: 1rem;
        }
        .error-banner p { margin: 0; color: var(--accent-red); font-size: 0.85rem; }
        .scores-table { border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
        .scores-table__header {
            display: grid; grid-template-columns: 2fr repeat(5, 1fr) auto;
            padding: 0.5rem 1rem; background: var(--bg-raised); font-size: 0.7rem; font-weight: 600;
            text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary);
        }
        .scores-table__row {
            display: grid; grid-template-columns: 2fr repeat(5, 1fr) auto;
            padding: 0.6rem 1rem; border-top: 1px solid var(--border);
            font-size: 0.85rem; color: var(--text-primary); cursor: pointer; transition: background 0.15s;
        }
        .scores-table__row:hover { background: var(--bg-hover); }
        .scores-table__row--selected { background: var(--bg-raised); border-left: 3px solid var(--accent-cyan); }
        .agent-name { font-weight: 600; }
        .score[data-level="verified"], .score[data-level="high"] { color: var(--accent-green); }
        .score[data-level="medium"] { color: var(--accent-cyan); }
        .score[data-level="low"] { color: var(--accent-yellow, #ffc107); }
        .score[data-level="untrusted"] { color: var(--accent-red); }
        .trust-badge {
            font-size: 0.7rem; padding: 1px 6px; border-radius: var(--radius-sm); font-weight: 600;
            text-transform: uppercase; background: var(--bg-raised); border: 1px solid var(--border);
        }
        .trust-badge[data-level="verified"], .trust-badge[data-level="high"] { color: var(--accent-green); border-color: var(--accent-green); }
        .trust-badge[data-level="medium"] { color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .trust-badge[data-level="low"] { color: var(--accent-yellow, #ffc107); border-color: var(--accent-yellow, #ffc107); }
        .trust-badge[data-level="untrusted"] { color: var(--accent-red); border-color: var(--accent-red); }
        .actions-cell { display: flex; }
        .detail-panel {
            background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius);
            padding: 1.5rem; margin-top: 1.5rem;
        }
        .detail-panel h3 { margin: 0 0 1rem; color: var(--text-primary); }
        .detail-panel h4 { margin: 1.5rem 0 0.75rem; color: var(--text-primary); }
        .score-breakdown { display: flex; flex-direction: column; gap: 0.5rem; }
        .score-bar { display: grid; grid-template-columns: 120px 1fr 40px; align-items: center; gap: 0.5rem; }
        .score-bar label { font-size: 0.75rem; color: var(--text-secondary); font-weight: 600; }
        .score-bar span { font-size: 0.8rem; color: var(--text-primary); text-align: right; }
        .bar { height: 8px; background: var(--bg-raised); border-radius: 4px; overflow: hidden; }
        .bar__fill { height: 100%; background: var(--accent-cyan); border-radius: 4px; transition: width 0.3s ease; }
        .attestation { font-size: 0.8rem; color: var(--text-secondary); margin: 1rem 0; }
        .attestation code { color: var(--accent-green); font-size: 0.75rem; }
        .events-list { display: flex; flex-direction: column; gap: 0.25rem; }
        .event-row {
            display: flex; align-items: center; gap: 0.75rem; padding: 0.4rem 0;
            font-size: 0.8rem; border-bottom: 1px solid var(--border);
        }
        .event-type { font-weight: 600; color: var(--text-primary); }
        .event-type[data-impact="positive"] { color: var(--accent-green); }
        .event-type[data-impact="negative"] { color: var(--accent-red); }
        .event-impact { font-weight: 600; min-width: 3em; }
        .event-time { color: var(--text-secondary); margin-left: auto; font-size: 0.75rem; }
        .btn {
            padding: 0.5rem 1rem; border-radius: var(--radius); font-size: 0.8rem; font-weight: 600;
            cursor: pointer; border: 1px solid; font-family: inherit; text-transform: uppercase; letter-spacing: 0.05em;
        }
        .btn--sm { padding: 0.25rem 0.5rem; font-size: 0.7rem; }
        .btn--primary { border-color: var(--accent-cyan); background: var(--accent-cyan-dim); color: var(--accent-cyan); }
        .btn--secondary { background: transparent; color: var(--text-secondary); border-color: var(--border-bright); }
        .btn--secondary:disabled { opacity: 0.5; cursor: not-allowed; }
        @media (max-width: 768px) {
            .scores-table__header, .scores-table__row { grid-template-columns: 1fr 1fr 1fr; }
            .scores-table__header span:nth-child(n+4), .scores-table__row span:nth-child(n+4) { display: none; }
        }
    `,
})
export class ReputationComponent implements OnInit {
    protected readonly reputationService = inject(ReputationService);
    private readonly agentService = inject(AgentService);
    private readonly notify = inject(NotificationService);

    protected readonly selectedAgentId = signal<string | null>(null);
    protected readonly selectedScore = signal<ReputationScore | null>(null);
    protected readonly refreshing = signal<string | null>(null);
    protected readonly loadError = signal(false);

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

    async onRefresh(agentId: string, event: Event): Promise<void> {
        event.stopPropagation();
        this.refreshing.set(agentId);
        try {
            const score = await this.reputationService.refreshScore(agentId);
            if (this.selectedAgentId() === agentId) {
                this.selectedScore.set(score);
            }
            this.notify.success('Score refreshed');
        } catch {
            this.notify.error('Failed to refresh score');
        } finally {
            this.refreshing.set(null);
        }
    }

    async onCreateAttestation(agentId: string): Promise<void> {
        try {
            await this.reputationService.createAttestation(agentId);
            // Reload score to get attestation hash
            const score = await this.reputationService.getScore(agentId);
            this.selectedScore.set(score);
            this.notify.success('Attestation created');
        } catch {
            this.notify.error('Failed to create attestation');
        }
    }
}

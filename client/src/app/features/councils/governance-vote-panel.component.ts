import {
    Component,
    ChangeDetectionStrategy,
    input,
    computed,
    inject,
    signal,
    OnInit,
    OnDestroy,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { GovernanceService } from '../../core/services/governance.service';
import { WebSocketService } from '../../core/services/websocket.service';
import { NotificationService } from '../../core/services/notification.service';
import {
    GOVERNANCE_TIERS,
    type GovernanceVoteStatusResponse,
    type WeightedVoteRecord,
    type GovernanceVoteOption,
} from '../../core/models/governance.model';
import type { ServerWsMessage } from '@shared/ws-protocol';

@Component({
    selector: 'app-governance-vote-panel',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatButtonModule],
    template: `
        @if (voteStatus(); as vs) {
            <div class="vote-panel" [class.vote-panel--resolved]="isResolved()">
                <div class="vote-panel__header">
                    <span class="vote-panel__icon" aria-hidden="true">&#9670;</span>
                    <span class="vote-panel__title">GOVERNANCE VOTE</span>
                    <span class="vote-panel__tier"
                          [attr.data-tier]="vs.governanceTier"
                          [attr.aria-label]="tierInfo().label + ': ' + tierInfo().description">
                        Tier: {{ tierInfo().label }} (Layer {{ vs.governanceTier }})
                    </span>
                </div>

                <div class="vote-panel__status-row">
                    <span class="vote-panel__status"
                          [attr.data-status]="vs.status"
                          role="status">
                        Status: {{ statusLabel() }}
                    </span>
                    <span class="vote-panel__quorum">
                        Quorum: {{ (vs.evaluation.requiredThreshold * 100).toFixed(0) }}%
                    </span>
                </div>

                <div class="progress-container"
                     role="progressbar"
                     [attr.aria-valuenow]="(vs.evaluation.weightedApprovalRatio * 100).toFixed(0)"
                     aria-valuemin="0"
                     aria-valuemax="100"
                     [attr.aria-label]="'Approval progress: ' + (vs.evaluation.weightedApprovalRatio * 100).toFixed(0) + '% of ' + (vs.evaluation.requiredThreshold * 100).toFixed(0) + '% required'">
                    <div class="progress-bar"
                         [style.width.%]="Math.min(vs.evaluation.weightedApprovalRatio * 100, 100)">
                    </div>
                    <div class="progress-threshold"
                         [style.left.%]="vs.evaluation.requiredThreshold * 100"
                         aria-hidden="true">
                    </div>
                    <span class="progress-label">
                        {{ (vs.evaluation.weightedApprovalRatio * 100).toFixed(1) }}%
                        / {{ (vs.evaluation.requiredThreshold * 100).toFixed(0) }}%
                    </span>
                </div>

                <div class="vote-list" role="list" aria-label="Council votes">
                    <div class="vote-list__header">
                        VOTES ({{ votesCast() }}/{{ vs.totalMembers }} cast)
                    </div>
                    @for (vote of sortedVotes(); track vote.agentId) {
                        <div class="vote-row" role="listitem"
                             [attr.aria-label]="getAgentName(vote.agentId) + ' voted ' + vote.vote + ' with weight ' + vote.weight">
                            <span class="vote-row__indicator"
                                  [class.vote-row__indicator--cast]="true"
                                  aria-hidden="true">&#9679;</span>
                            <span class="vote-row__name"
                                  [style.color]="agentColorMap()[vote.agentId] ?? 'var(--text-primary)'">
                                {{ getAgentName(vote.agentId) }}
                            </span>
                            <span class="vote-row__weight">w:{{ vote.weight }}</span>
                            <div class="vote-row__bar">
                                <div class="vote-row__bar-fill"
                                     [style.width.%]="vote.weight"
                                     [attr.data-vote]="vote.vote">
                                </div>
                            </div>
                            <span class="vote-row__badge"
                                  [attr.data-vote]="vote.vote">
                                {{ vote.vote.toUpperCase() }}
                            </span>
                        </div>
                    }
                    @for (agentId of pendingAgents(); track agentId) {
                        <div class="vote-row vote-row--pending" role="listitem"
                             [attr.aria-label]="getAgentName(agentId) + ' has not voted yet'">
                            <span class="vote-row__indicator" aria-hidden="true">&#9675;</span>
                            <span class="vote-row__name vote-row__name--pending">{{ getAgentName(agentId) }}</span>
                            <span class="vote-row__weight">w:--</span>
                            <div class="vote-row__bar">
                                <div class="vote-row__bar-fill vote-row__bar-fill--pending"></div>
                            </div>
                            <span class="vote-row__badge vote-row__badge--pending">PENDING</span>
                        </div>
                    }
                </div>

                <div class="vote-panel__ratios">
                    <span>Weighted ratio: {{ (vs.evaluation.weightedApprovalRatio * 100).toFixed(1) }}%</span>
                    <span>|</span>
                    <span>Unweighted: {{ (vs.evaluation.approvalRatio * 100).toFixed(1) }}%</span>
                    @if (tierInfo().requiresHumanApproval) {
                        <span>|</span>
                        <span [class.vote-panel__human--met]="vs.humanApproved"
                              [class.vote-panel__human--pending]="!vs.humanApproved">
                            Human approval: {{ vs.humanApproved ? 'GRANTED' : 'REQUIRED' }}
                        </span>
                    }
                </div>

                @if (vs.evaluation.awaitingHumanApproval && !vs.humanApproved) {
                    <div class="vote-panel__human-action">
                        <button mat-flat-button color="primary"
                                [disabled]="approving()"
                                (click)="onApproveHuman()">
                            {{ approving() ? 'APPROVING...' : 'APPROVE (HUMAN)' }}
                        </button>
                    </div>
                }

                @if (isResolved()) {
                    <div class="vote-panel__resolution"
                         [attr.data-status]="vs.status"
                         role="status"
                         aria-live="assertive">
                        {{ vs.evaluation.reason }}
                    </div>
                }
            </div>
        } @else if (governanceService.voteLoading()) {
            <div class="vote-panel vote-panel--loading">
                <span class="vote-panel__icon" aria-hidden="true">&#9670;</span>
                <span>Loading governance vote...</span>
            </div>
        }
    `,
    styles: `
        .vote-panel {
            background: var(--bg-surface);
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
            padding: var(--space-4) var(--space-5);
            margin: 1rem 0;
        }
        .vote-panel--resolved { border-color: var(--border-bright); }
        .vote-panel--loading {
            display: flex; align-items: center; gap: 0.5rem;
            color: var(--text-secondary); font-size: var(--text-sm);
        }

        .vote-panel__header {
            display: flex; align-items: center; gap: 0.75rem;
            margin-bottom: 0.75rem;
        }
        .vote-panel__icon { color: var(--accent-amber); font-size: 0.7rem; }
        .vote-panel__title {
            font-size: var(--text-sm); font-weight: 700;
            text-transform: uppercase; letter-spacing: 0.08em;
            color: var(--text-primary);
        }
        .vote-panel__tier {
            margin-left: auto;
            font-size: var(--text-xs); color: var(--text-secondary);
        }

        .vote-panel__status-row {
            display: flex; justify-content: space-between;
            margin-bottom: 0.75rem;
            font-size: var(--text-sm); color: var(--text-secondary);
        }
        .vote-panel__status[data-status="approved"] { color: var(--accent-green); }
        .vote-panel__status[data-status="rejected"] { color: var(--accent-red); }
        .vote-panel__status[data-status="awaiting_human"] { color: var(--accent-amber); }
        .vote-panel__status[data-status="pending"] { color: var(--accent-cyan); }

        /* Progress bar */
        .progress-container {
            position: relative;
            height: 1.25rem;
            background: var(--bg-input);
            border-radius: var(--radius);
            margin-bottom: 0.75rem;
            overflow: visible;
        }
        .progress-bar {
            height: 100%;
            background: var(--accent-green);
            border-radius: var(--radius);
            transition: width var(--transition-slow);
            min-width: 0;
        }
        .progress-threshold {
            position: absolute; top: -2px; bottom: -2px;
            width: 2px; background: var(--accent-amber);
            z-index: 1;
        }
        .progress-label {
            position: absolute; right: 0.5rem; top: 50%;
            transform: translateY(-50%);
            font-size: var(--text-xs); color: var(--text-primary);
            font-weight: 600; z-index: 2;
        }

        /* Vote list */
        .vote-list {
            background: var(--bg-deep);
            border-radius: var(--radius);
            padding: var(--space-2) var(--space-3);
            margin-bottom: 0.75rem;
        }
        .vote-list__header {
            font-size: var(--text-xs); color: var(--text-secondary);
            text-transform: uppercase; letter-spacing: 0.06em;
            margin-bottom: 0.5rem; font-weight: 600;
        }
        .vote-row {
            display: flex; align-items: center; gap: 0.5rem;
            padding: var(--space-1) 0;
            font-size: var(--text-sm);
        }
        .vote-row--pending { opacity: 0.5; }
        .vote-row__indicator { font-size: 0.5rem; flex-shrink: 0; }
        .vote-row__indicator--cast { color: var(--accent-green); }
        .vote-row__name { min-width: 80px; font-weight: 600; }
        .vote-row__name--pending { color: var(--text-tertiary); }
        .vote-row__weight {
            font-size: var(--text-xs); color: var(--text-secondary);
            min-width: 32px; text-align: right;
        }
        .vote-row__bar {
            flex: 1; height: 6px; background: var(--bg-surface);
            border-radius: var(--radius-sm); overflow: hidden;
        }
        .vote-row__bar-fill {
            height: 100%; border-radius: var(--radius-sm);
            transition: width var(--transition-slow);
        }
        .vote-row__bar-fill[data-vote="approve"] { background: var(--accent-green); }
        .vote-row__bar-fill[data-vote="reject"] { background: var(--accent-red); }
        .vote-row__bar-fill[data-vote="abstain"] { background: var(--text-secondary); }
        .vote-row__bar-fill--pending { width: 0; }
        .vote-row__badge {
            font-size: var(--text-xs); font-weight: 700;
            text-transform: uppercase; letter-spacing: 0.04em;
            min-width: 56px; text-align: center;
        }
        .vote-row__badge[data-vote="approve"] { color: var(--accent-green); }
        .vote-row__badge[data-vote="reject"] { color: var(--accent-red); }
        .vote-row__badge[data-vote="abstain"] { color: var(--text-secondary); }
        .vote-row__badge--pending { color: var(--text-tertiary); }

        /* Ratios footer */
        .vote-panel__ratios {
            display: flex; gap: 0.5rem; flex-wrap: wrap;
            font-size: var(--text-xs); color: var(--text-secondary);
            margin-bottom: 0.5rem;
        }
        .vote-panel__human--met { color: var(--accent-green); }
        .vote-panel__human--pending { color: var(--accent-amber); }

        /* Human approval button */
        .vote-panel__human-action {
            margin-top: 0.75rem;
            display: flex; justify-content: center;
        }

        /* Resolution banner */
        .vote-panel__resolution {
            margin-top: 0.5rem; padding: var(--space-2) var(--space-3);
            border-radius: var(--radius);
            font-size: var(--text-sm); font-weight: 600;
            border: 1px solid;
        }
        .vote-panel__resolution[data-status="approved"] {
            color: var(--accent-green); border-color: var(--accent-green-dim);
            background: var(--accent-green-dim);
        }
        .vote-panel__resolution[data-status="rejected"] {
            color: var(--accent-red); border-color: var(--accent-red-dim);
            background: var(--accent-red-dim);
        }
        .vote-panel__resolution[data-status="awaiting_human"] {
            color: var(--accent-amber); border-color: var(--accent-amber-dim);
            background: var(--accent-amber-tint);
        }
    `,
})
export class GovernanceVotePanelComponent implements OnInit, OnDestroy {
    protected readonly Math = Math;

    readonly launchId = input.required<string>();
    readonly agentNames = input<Record<string, string>>({});
    readonly agentColors = input<Record<string, string>>({});
    readonly councilAgentIds = input<string[]>([]);

    protected readonly governanceService = inject(GovernanceService);
    private readonly wsService = inject(WebSocketService);
    private readonly notifications = inject(NotificationService);

    protected readonly approving = signal(false);
    private unsubscribeWs: (() => void) | null = null;

    protected readonly voteStatus = computed(() => this.governanceService.activeVote());

    protected readonly tierInfo = computed(() => {
        const vs = this.voteStatus();
        const tier = vs?.governanceTier ?? 2;
        return GOVERNANCE_TIERS[tier] ?? GOVERNANCE_TIERS[2];
    });

    protected readonly statusLabel = computed(() => {
        const vs = this.voteStatus();
        if (!vs) return '';
        const labels: Record<string, string> = {
            pending: 'AWAITING VOTES',
            approved: 'APPROVED',
            rejected: 'REJECTED',
            expired: 'EXPIRED',
            awaiting_human: 'AWAITING HUMAN APPROVAL',
        };
        return labels[vs.status] ?? vs.status.toUpperCase();
    });

    protected readonly isResolved = computed(() => {
        const status = this.voteStatus()?.status;
        return status === 'approved' || status === 'rejected';
    });

    protected readonly votesCast = computed(() => {
        return this.voteStatus()?.votes.length ?? 0;
    });

    protected readonly sortedVotes = computed(() => {
        const votes = this.voteStatus()?.votes ?? [];
        return [...votes].sort((a, b) => b.weight - a.weight);
    });

    protected readonly pendingAgents = computed(() => {
        const vs = this.voteStatus();
        if (!vs) return [];
        const votedIds = new Set(vs.votes.map((v) => v.agentId));
        return this.councilAgentIds().filter((id) => !votedIds.has(id));
    });

    protected readonly agentColorMap = computed(() => {
        return this.agentColors();
    });

    async ngOnInit(): Promise<void> {
        await this.governanceService.refreshVoteStatus(this.launchId());

        this.unsubscribeWs = this.wsService.onMessage((msg: ServerWsMessage) => {
            if (msg.type === 'governance_vote_cast' && 'launchId' in msg && msg.launchId === this.launchId()) {
                this.governanceService.refreshVoteStatus(this.launchId());
            }
            if (msg.type === 'governance_vote_resolved' && 'launchId' in msg && msg.launchId === this.launchId()) {
                this.governanceService.refreshVoteStatus(this.launchId());
            }
        });
    }

    ngOnDestroy(): void {
        this.unsubscribeWs?.();
        this.governanceService.clearActiveVote();
    }

    protected getAgentName(agentId: string | null): string {
        if (!agentId) return 'Unknown';
        return this.agentNames()[agentId] ?? agentId;
    }

    protected async onApproveHuman(): Promise<void> {
        this.approving.set(true);
        try {
            await this.governanceService.approveHuman(this.launchId(), 'owner');
            this.notifications.success('Human approval granted');
            await this.governanceService.refreshVoteStatus(this.launchId());
        } catch {
            this.notifications.error('Failed to grant human approval');
        } finally {
            this.approving.set(false);
        }
    }
}

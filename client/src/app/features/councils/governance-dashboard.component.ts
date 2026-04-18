import {
    Component,
    ChangeDetectionStrategy,
    inject,
    input,
    signal,
    computed,
    OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { GovernanceService } from '../../core/services/governance.service';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import type {
    GovernanceProposal,
    ProposalEvaluationResult,
    ProposalVeto,
} from '../../core/models/governance.model';

interface ProposalViewModel extends GovernanceProposal {
    evaluation?: ProposalEvaluationResult;
    vetoes?: ProposalVeto[];
    vetoCount: number;
    deadlineMs: number | null;
}

@Component({
    selector: 'app-governance-dashboard',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, MatButtonModule, RelativeTimePipe],
    template: `
        <div class="gov-dashboard">
            <div class="gov-dashboard__header">
                <h3 class="gov-dashboard__title">Governance Proposals</h3>
                <button mat-stroked-button (click)="refresh()">Refresh</button>
            </div>

            @if (loading()) {
                <p class="gov-dashboard__empty">Loading proposals…</p>
            } @else if (active().length === 0 && history().length === 0) {
                <p class="gov-dashboard__empty">No proposals yet.</p>
            } @else {
                @if (active().length > 0) {
                    <section class="gov-section">
                        <h4 class="gov-section__title">Active</h4>
                        @for (p of active(); track p.id) {
                            <div class="proposal-card">
                                <div class="proposal-card__header">
                                    <span class="proposal-badge" [attr.data-status]="p.status">{{ p.status }}</span>
                                    <span class="proposal-tier" [attr.data-tier]="p.governanceTier">
                                        {{ tierLabel(p.governanceTier) }}
                                    </span>
                                    @if (p.vetoCount > 0) {
                                        <span class="veto-badge" [title]="p.vetoCount + ' veto(s)'">
                                            ⛔ {{ p.vetoCount }}
                                        </span>
                                    }
                                    <span class="proposal-card__time">{{ p.updatedAt | relativeTime }}</span>
                                </div>
                                <div class="proposal-card__title">{{ p.title }}</div>
                                @if (p.description) {
                                    <p class="proposal-card__desc">{{ p.description }}</p>
                                }

                                @if (p.status === 'voting') {
                                    @if (p.votingDeadline) {
                                        <div class="proposal-deadline" [class.proposal-deadline--urgent]="isUrgent(p.votingDeadline)">
                                            Deadline: {{ p.votingDeadline | relativeTime }}
                                        </div>
                                    }
                                    @if (p.evaluation) {
                                        <div class="tally-bar-wrap">
                                            <div class="tally-bar">
                                                <div
                                                    class="tally-bar__fill tally-bar__fill--approve"
                                                    [style.width.%]="approvePercent(p.evaluation)"
                                                    [title]="'Approve: ' + approvePercent(p.evaluation) + '%'"
                                                ></div>
                                                <div
                                                    class="tally-bar__fill tally-bar__fill--reject"
                                                    [style.width.%]="rejectPercent(p.evaluation)"
                                                    [title]="'Reject: ' + rejectPercent(p.evaluation) + '%'"
                                                ></div>
                                            </div>
                                            <div class="tally-bar__legend">
                                                <span class="tally-bar__legend--approve">{{ approvePercent(p.evaluation) }}% approve</span>
                                                <span class="tally-bar__legend--reject">{{ rejectPercent(p.evaluation) }}% reject</span>
                                                <span class="tally-bar__legend--threshold">needs {{ requiredPercent(p.evaluation) }}%</span>
                                            </div>
                                        </div>
                                    }
                                }

                                <div class="proposal-card__actions">
                                    @if (p.status === 'open') {
                                        <button mat-flat-button color="primary" (click)="openVoting(p)">Open Voting</button>
                                    }
                                    @if (p.status === 'voting') {
                                        <button mat-flat-button color="primary" (click)="decide(p, 'approved')">Approve</button>
                                        <button mat-stroked-button color="warn" (click)="decide(p, 'rejected')">Reject</button>
                                    }
                                    @if (p.status !== 'decided' && p.status !== 'enacted') {
                                        <button mat-stroked-button color="warn" (click)="veto(p)">Veto</button>
                                    }
                                </div>
                            </div>
                        }
                    </section>
                }

                @if (history().length > 0) {
                    <section class="gov-section">
                        <h4 class="gov-section__title">History</h4>
                        @for (p of history(); track p.id) {
                            <div class="proposal-card proposal-card--history">
                                <div class="proposal-card__header">
                                    <span class="proposal-badge" [attr.data-status]="p.status">{{ p.status }}</span>
                                    @if (p.decision) {
                                        <span class="decision-badge" [attr.data-decision]="p.decision">{{ p.decision }}</span>
                                    }
                                    @if (p.vetoCount > 0) {
                                        <span class="veto-badge" [title]="p.vetoCount + ' veto(s)'">⛔ {{ p.vetoCount }}</span>
                                    }
                                    <span class="proposal-card__time">{{ p.updatedAt | relativeTime }}</span>
                                </div>
                                <div class="proposal-card__title">{{ p.title }}</div>
                            </div>
                        }
                    </section>
                }
            }
        </div>
    `,
    styles: `
        .gov-dashboard { padding: 1rem 0; }
        .gov-dashboard__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
        .gov-dashboard__title { margin: 0; color: var(--text-primary); font-size: 1rem; }
        .gov-dashboard__empty { color: var(--text-secondary); font-size: 0.85rem; }

        .gov-section { margin-bottom: 1.5rem; }
        .gov-section__title {
            font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em;
            color: var(--text-tertiary); margin: 0 0 0.5rem; font-weight: 600;
        }

        .proposal-card {
            padding: 0.75rem; margin-bottom: 0.5rem;
            background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-lg);
        }
        .proposal-card--history { opacity: 0.75; }
        .proposal-card__header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem; flex-wrap: wrap; }
        .proposal-card__title { font-size: 0.85rem; color: var(--text-primary); font-weight: 500; margin-bottom: 0.25rem; }
        .proposal-card__desc { font-size: 0.75rem; color: var(--text-secondary); margin: 0.25rem 0 0.5rem; line-height: 1.4; }
        .proposal-card__time { font-size: 0.7rem; color: var(--text-tertiary); margin-left: auto; }
        .proposal-card__actions { display: flex; gap: 0.4rem; margin-top: 0.6rem; flex-wrap: wrap; }

        .proposal-badge {
            font-size: 0.6rem; padding: 2px 6px; border-radius: var(--radius-sm); font-weight: 700;
            text-transform: uppercase; letter-spacing: 0.05em; border: 1px solid;
        }
        .proposal-badge[data-status="draft"] { color: var(--text-tertiary); border-color: var(--border); }
        .proposal-badge[data-status="open"] { color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .proposal-badge[data-status="voting"] { color: var(--accent-purple); border-color: var(--accent-purple); }
        .proposal-badge[data-status="decided"] { color: var(--accent-gold); border-color: var(--accent-gold); }
        .proposal-badge[data-status="enacted"] { color: var(--accent-green); border-color: var(--accent-green); }

        .decision-badge {
            font-size: 0.6rem; padding: 2px 6px; border-radius: var(--radius-sm); font-weight: 700;
            text-transform: uppercase; letter-spacing: 0.05em;
        }
        .decision-badge[data-decision="approved"] { background: var(--accent-green-dim); color: var(--accent-green); }
        .decision-badge[data-decision="rejected"] { background: var(--accent-red-dim); color: var(--accent-red); }

        .proposal-tier {
            font-size: 0.6rem; padding: 2px 6px; border-radius: var(--radius-sm);
            background: var(--bg-raised); color: var(--text-secondary); font-weight: 600;
        }
        .proposal-tier[data-tier="0"] { color: var(--accent-red); }
        .proposal-tier[data-tier="1"] { color: var(--accent-gold); }
        .proposal-tier[data-tier="2"] { color: var(--accent-cyan); }

        .veto-badge {
            font-size: 0.65rem; padding: 2px 6px; border-radius: var(--radius-sm);
            background: var(--accent-red-dim); color: var(--accent-red); font-weight: 700;
        }

        .proposal-deadline {
            font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.5rem;
        }
        .proposal-deadline--urgent { color: var(--accent-red); font-weight: 600; }

        .tally-bar-wrap { margin: 0.5rem 0; }
        .tally-bar {
            height: 6px; background: var(--bg-raised); border-radius: 3px; overflow: hidden;
            display: flex;
        }
        .tally-bar__fill { height: 100%; transition: width 0.3s ease; }
        .tally-bar__fill--approve { background: var(--accent-green); }
        .tally-bar__fill--reject { background: var(--accent-red); }
        .tally-bar__legend {
            display: flex; gap: 0.75rem; margin-top: 0.25rem; font-size: 0.65rem;
        }
        .tally-bar__legend--approve { color: var(--accent-green); }
        .tally-bar__legend--reject { color: var(--accent-red); }
        .tally-bar__legend--threshold { color: var(--text-tertiary); margin-left: auto; }

    `,
})
export class GovernanceDashboardComponent implements OnInit {
    readonly councilId = input.required<string>();

    private readonly governanceService = inject(GovernanceService);

    protected readonly loading = signal(false);

    private readonly proposals = computed(() => this.governanceService.proposals());

    protected readonly active = computed(() =>
        this.proposals()
            .filter((p) => p.status === 'draft' || p.status === 'open' || p.status === 'voting')
            .map((p) => this.enrich(p)),
    );

    protected readonly history = computed(() =>
        this.proposals()
            .filter((p) => p.status === 'decided' || p.status === 'enacted')
            .map((p) => this.enrich(p)),
    );

    async ngOnInit(): Promise<void> {
        await this.refresh();
    }

    async refresh(): Promise<void> {
        this.loading.set(true);
        try {
            await this.governanceService.loadProposals(this.councilId());
            // Load evaluations for proposals in voting status
            for (const p of this.governanceService.proposals().filter((x) => x.status === 'voting')) {
                this.governanceService.evaluateProposal(p.id).then((evaluation) => {
                    this.enrichedEvaluations[p.id] = evaluation;
                }).catch(() => {});
                this.governanceService.listVetoes(p.id).then((vetoes) => {
                    this.enrichedVetoes[p.id] = vetoes;
                }).catch(() => {});
            }
        } finally {
            this.loading.set(false);
        }
    }

    private readonly enrichedEvaluations: Record<string, ProposalEvaluationResult> = {};
    private readonly enrichedVetoes: Record<string, ProposalVeto[]> = {};

    private enrich(p: GovernanceProposal): ProposalViewModel {
        const vetoes = this.enrichedVetoes[p.id] ?? [];
        return {
            ...p,
            evaluation: this.enrichedEvaluations[p.id],
            vetoes,
            vetoCount: vetoes.length,
            deadlineMs: p.votingDeadline ? new Date(p.votingDeadline).getTime() : null,
        };
    }

    protected tierLabel(tier: number): string {
        const labels: Record<number, string> = { 0: 'L0 Constitutional', 1: 'L1 Structural', 2: 'L2 Operational' };
        return labels[tier] ?? `Tier ${tier}`;
    }

    protected isUrgent(deadline: string): boolean {
        const ms = new Date(deadline).getTime() - Date.now();
        return ms < 3_600_000; // < 1 hour
    }

    protected approvePercent(evaluation: ProposalEvaluationResult): number {
        if (!evaluation.votes.length) return 0;
        const totalWeight = evaluation.votes.reduce((s, v) => s + v.weight, 0);
        if (!totalWeight) return 0;
        const approveWeight = evaluation.votes
            .filter((v) => v.vote === 'approve')
            .reduce((s, v) => s + v.weight, 0);
        return Math.round((approveWeight / totalWeight) * 100);
    }

    protected rejectPercent(evaluation: ProposalEvaluationResult): number {
        if (!evaluation.votes.length) return 0;
        const totalWeight = evaluation.votes.reduce((s, v) => s + v.weight, 0);
        if (!totalWeight) return 0;
        const rejectWeight = evaluation.votes
            .filter((v) => v.vote === 'reject')
            .reduce((s, v) => s + v.weight, 0);
        return Math.round((rejectWeight / totalWeight) * 100);
    }

    protected requiredPercent(evaluation: ProposalEvaluationResult): number {
        return Math.round(evaluation.evaluation.requiredThreshold * 100);
    }

    async openVoting(p: GovernanceProposal): Promise<void> {
        await this.governanceService.transitionProposal(p.id, 'voting');
    }

    async decide(p: GovernanceProposal, decision: 'approved' | 'rejected'): Promise<void> {
        await this.governanceService.transitionProposal(p.id, 'decided', decision);
    }

    async veto(p: GovernanceProposal): Promise<void> {
        const reason = prompt('Veto reason (optional):') ?? '';
        const vetoerId = prompt('Your ID (vetoer):');
        if (!vetoerId) return;
        await this.governanceService.vetoProposal(p.id, vetoerId, reason || undefined);
    }
}

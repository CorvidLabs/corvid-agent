import { Component, ChangeDetectionStrategy, inject, OnInit, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { firstValueFrom } from 'rxjs';
import { SkeletonComponent } from '../../shared/components/skeleton.component';

interface AgentSpendingInfo {
    agentId: string;
    agentName: string;
    cap: {
        dailyLimitMicroalgos: number;
        dailyLimitUsdc: number;
        isDefault?: boolean;
    };
    today: {
        algoMicro: number;
        usdcMicro: number;
    };
}

interface Agent {
    id: string;
    name: string;
}

interface CreditTransaction {
    id: number;
    wallet_address: string;
    type: string;
    amount: number;
    balance_after: number;
    reference: string | null;
    txid: string | null;
    session_id: string | null;
    created_at: string;
}

@Component({
    selector: 'app-spending',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, DecimalPipe, SkeletonComponent],
    template: `
        <div class="spending">
            <h2>Spending Controls</h2>

            @if (loading()) {
                <app-skeleton variant="card" [count]="4" />
            } @else {
                <!-- Per-Agent Spending Caps -->
                <div class="spending__section">
                    <h3>Per-Agent Daily Spending Caps</h3>
                    <p class="spending__desc">Configure daily spending limits for each agent. Agents without a custom cap use the global default.</p>

                    <div class="table-scroll">
                    <table class="spending__table table-striped">
                        <thead>
                            <tr>
                                <th>Agent</th>
                                <th>Daily Limit (ALGO)</th>
                                <th>Today's Spend (ALGO)</th>
                                <th>Usage</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody class="stagger-rows">
                            @for (info of agentSpending(); track info.agentId) {
                                <tr>
                                    <td>
                                        {{ info.agentName }}
                                        @if (info.cap.isDefault) {
                                            <span class="badge badge--default">default</span>
                                        }
                                    </td>
                                    <td>{{ info.cap.dailyLimitMicroalgos / 1000000 | number:'1.2-6' }}</td>
                                    <td>{{ info.today.algoMicro / 1000000 | number:'1.2-6' }}</td>
                                    <td>
                                        <div class="progress-bar">
                                            <div
                                                class="progress-bar__fill"
                                                [class.progress-bar__fill--warning]="getUsagePercent(info) > 75"
                                                [class.progress-bar__fill--danger]="getUsagePercent(info) > 90"
                                                [style.width.%]="getUsagePercent(info)">
                                            </div>
                                        </div>
                                        <span class="progress-text">{{ getUsagePercent(info) | number:'1.0-0' }}%</span>
                                    </td>
                                    <td>
                                        <button mat-stroked-button (click)="editCap(info)">Edit</button>
                                        @if (!info.cap.isDefault) {
                                            <button mat-stroked-button color="warn" (click)="removeCap(info.agentId)">Remove</button>
                                        }
                                    </td>
                                </tr>
                            }
                        </tbody>
                    </table>
                    </div>
                </div>

                <!-- Edit Cap Modal -->
                @if (editingAgent()) {
                    <div class="modal-overlay" (click)="cancelEdit()">
                        <div class="modal" (click)="$event.stopPropagation()">
                            <h3>Set Spending Cap: {{ editingAgent()?.agentName }}</h3>
                            <div class="form-group">
                                <mat-form-field appearance="outline" class="full-width">
                                    <mat-label>Daily ALGO Limit</mat-label>
                                    <input
                                        matInput
                                        type="number"
                                        [ngModel]="editAlgoLimit()"
                                        (ngModelChange)="editAlgoLimit.set($event)"
                                        min="0"
                                        step="0.1" />
                                </mat-form-field>
                                <small>Set to 0 for unlimited</small>
                            </div>
                            <div class="modal__actions">
                                <button mat-flat-button color="primary" (click)="saveCap()">Save</button>
                                <button mat-stroked-button (click)="cancelEdit()">Cancel</button>
                            </div>
                        </div>
                    </div>
                }

                <!-- Recent Credit Transactions -->
                <div class="spending__section">
                    <h3>Credit Transactions</h3>
                    @if (creditTransactions().length > 0) {
                        <div class="table-scroll">
                        <table class="spending__table table-striped">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Type</th>
                                    <th>Amount</th>
                                    <th>Balance After</th>
                                    <th>Reference</th>
                                </tr>
                            </thead>
                            <tbody class="stagger-rows">
                                @for (tx of creditTransactions(); track tx.id) {
                                    <tr>
                                        <td>{{ tx.created_at }}</td>
                                        <td><span class="badge" [class]="'badge--' + tx.type">{{ tx.type }}</span></td>
                                        <td>{{ tx.amount | number }}</td>
                                        <td>{{ tx.balance_after | number }}</td>
                                        <td>{{ tx.reference ?? '-' }}</td>
                                    </tr>
                                }
                            </tbody>
                        </table>
                        </div>
                    } @else {
                        <p class="spending__empty">No credit transactions yet.</p>
                    }
                </div>
            }
        </div>
    `,
    styles: [`
        .spending { padding: var(--space-5) 0; }
        .spending h2 { font-size: var(--text-2xl); margin-bottom: var(--space-5); }
        .spending__section { margin-bottom: var(--space-8); }
        .spending__section h3 { font-size: var(--text-xl); margin-bottom: var(--space-4); border-bottom: 1px solid var(--border); padding-bottom: var(--space-3); }
        .spending__desc { color: var(--text-secondary); font-size: var(--text-base); margin-bottom: var(--space-5); line-height: var(--leading-relaxed); }
        .spending__empty { color: var(--text-secondary); font-style: italic; font-size: var(--text-base); }
        .spending__table { width: 100%; border-collapse: collapse; font-size: var(--text-base); }
        .spending__table th, .spending__table td { padding: var(--space-3) var(--space-4); text-align: left; border-bottom: 1px solid var(--border); }
        .spending__table th { color: var(--text-secondary); font-weight: 600; font-size: var(--text-sm); text-transform: uppercase; letter-spacing: 0.04em; }
        .info-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--space-5); margin-top: var(--space-4); }
        .info-item { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-4); background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-lg); }
        .info-label { font-size: var(--text-sm); color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.04em; }
        .info-value { font-size: var(--text-2xl); font-weight: 600; }
        .progress-bar { width: clamp(100px, 15vw, 160px); height: 10px; background: var(--bg-raised); border-radius: var(--radius); display: inline-block; vertical-align: middle; }
        .progress-bar__fill { height: 100%; background: var(--accent-cyan); border-radius: var(--radius); transition: width 0.3s; }
        .progress-bar__fill--warning { background: var(--accent-amber); }
        .progress-bar__fill--danger { background: var(--accent-red); }
        .progress-text { font-size: var(--text-sm); margin-left: var(--space-2); }
        .badge { font-size: var(--text-xs); padding: 0.25rem 0.625rem; border-radius: var(--radius); background: var(--bg-raised); }
        .badge--default { background: var(--bg-raised); color: var(--text-secondary); }
        .badge--purchase, .badge--usdc_deposit, .badge--grant { background: var(--accent-green-dim); color: var(--accent-green); }
        .badge--deduction, .badge--agent_message { background: var(--accent-red-dim); color: var(--accent-red); }
        .badge--reserve { background: var(--accent-amber-dim); color: var(--accent-amber); }
        .badge--release, .badge--refund { background: var(--accent-cyan-dim); color: var(--accent-cyan); }
        .txid { font-family: var(--font-mono); font-size: var(--text-sm); }
        .full-width { width: 100%; }
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 100; backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); }
        .modal { background: var(--bg-surface); padding: clamp(var(--space-5), 3vw, var(--space-8)); border-radius: var(--radius-xl); min-width: 360px; max-width: min(90vw, 520px); border: 1px solid var(--border-bright); box-shadow: 0 24px 80px rgba(0, 0, 0, 0.6), 0 0 1px var(--accent-cyan-tint); }
        .modal h3 { margin-bottom: var(--space-4); color: var(--text-primary); font-size: var(--text-xl); }
        .modal__actions { display: flex; gap: var(--space-3); margin-top: var(--space-5); padding-top: var(--space-4); border-top: 1px solid var(--border); }
        .form-group { margin-bottom: var(--space-5); }
        .form-group label { display: block; margin-bottom: var(--space-2); font-size: var(--text-base); }
        .form-group small { color: var(--text-secondary); font-size: var(--text-sm); }
        .loading { color: var(--text-secondary); }
        .table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .spending__table { min-width: 500px; }
        @media (max-width: 767px) {
            .modal { min-width: auto; width: calc(100vw - 2rem); }
        }
    `],
})
export class SpendingComponent implements OnInit {
    private readonly api = inject(ApiService);
    private readonly notify = inject(NotificationService);

    readonly loading = signal(true);
    readonly agentSpending = signal<AgentSpendingInfo[]>([]);
    readonly creditTransactions = signal<CreditTransaction[]>([]);
    readonly editingAgent = signal<AgentSpendingInfo | null>(null);
    readonly editAlgoLimit = signal(5);

    async ngOnInit(): Promise<void> {
        await this.loadData();
    }

    async loadData(): Promise<void> {
        this.loading.set(true);
        try {
            const agents = await firstValueFrom(this.api.get<Agent[]>('/agents'));
            const spendingInfos: AgentSpendingInfo[] = [];

            for (const agent of agents) {
                try {
                    const spending = await firstValueFrom(
                        this.api.get<{ agentId: string; cap: AgentSpendingInfo['cap']; today: AgentSpendingInfo['today'] }>(
                            `/agents/${agent.id}/spending`
                        )
                    );
                    spendingInfos.push({
                        agentId: agent.id,
                        agentName: agent.name,
                        cap: spending.cap,
                        today: spending.today,
                    });
                } catch {
                    // Skip agents where spending endpoint fails
                }
            }
            this.agentSpending.set(spendingInfos);

            // Load credit transactions
            try {
                const txData = await firstValueFrom(
                    this.api.get<{ transactions: CreditTransaction[] }>('/system-logs/credit-transactions')
                );
                this.creditTransactions.set(txData.transactions);
            } catch {
                // Credit transactions are optional — don't block the page
            }
        } catch {
            this.notify.error('Failed to load spending data');
        } finally {
            this.loading.set(false);
        }
    }

    getUsagePercent(info: AgentSpendingInfo): number {
        if (info.cap.dailyLimitMicroalgos <= 0) return 0;
        return Math.min(100, (info.today.algoMicro / info.cap.dailyLimitMicroalgos) * 100);
    }

    editCap(info: AgentSpendingInfo): void {
        this.editingAgent.set(info);
        this.editAlgoLimit.set(info.cap.dailyLimitMicroalgos / 1_000_000);
    }

    cancelEdit(): void {
        this.editingAgent.set(null);
    }

    async saveCap(): Promise<void> {
        const agent = this.editingAgent();
        if (!agent) return;

        try {
            await firstValueFrom(
                this.api.put(`/agents/${agent.agentId}/spending-cap`, {
                    dailyLimitMicroalgos: Math.round(this.editAlgoLimit() * 1_000_000),
                })
            );
            this.notify.success(`Spending cap updated for ${agent.agentName}`);
            this.editingAgent.set(null);
            await this.loadData();
        } catch {
            this.notify.error('Failed to update spending cap');
        }
    }

    async removeCap(agentId: string): Promise<void> {
        if (!confirm('Remove spending cap? The agent will revert to default limits.')) return;
        try {
            await firstValueFrom(this.api.delete(`/agents/${agentId}/spending-cap`));
            this.notify.success('Spending cap removed');
            await this.loadData();
        } catch {
            this.notify.error('Failed to remove spending cap');
        }
    }
}

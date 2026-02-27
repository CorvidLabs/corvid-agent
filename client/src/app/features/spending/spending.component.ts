import { Component, ChangeDetectionStrategy, inject, OnInit, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { firstValueFrom } from 'rxjs';

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

interface UsdcDeposit {
    id: number;
    walletAddress: string;
    amount: number;
    balanceAfter: number;
    reference: string | null;
    txid: string | null;
    createdAt: string;
}

interface CreditBalance {
    walletAddress: string;
    credits: number;
    reserved: number;
    available: number;
    totalPurchased: number;
    totalConsumed: number;
}

interface CreditTransaction {
    id: number;
    walletAddress: string;
    type: string;
    amount: number;
    balanceAfter: number;
    reference: string | null;
    txid: string | null;
    createdAt: string;
}

@Component({
    selector: 'app-spending',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule, DecimalPipe],
    template: `
        <div class="spending">
            <h2>Spending Controls</h2>

            @if (loading()) {
                <p class="loading">Loading spending data...</p>
            } @else {
                <!-- Per-Agent Spending Caps -->
                <div class="spending__section">
                    <h3>Per-Agent Daily Spending Caps</h3>
                    <p class="spending__desc">Configure daily spending limits for each agent. Agents without a custom cap use the global default.</p>

                    <table class="spending__table">
                        <thead>
                            <tr>
                                <th>Agent</th>
                                <th>Daily Limit (ALGO)</th>
                                <th>Today's Spend (ALGO)</th>
                                <th>Usage</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
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
                                        <button class="btn btn--sm" (click)="editCap(info)">Edit</button>
                                        @if (!info.cap.isDefault) {
                                            <button class="btn btn--sm btn--danger" (click)="removeCap(info.agentId)">Remove</button>
                                        }
                                    </td>
                                </tr>
                            }
                        </tbody>
                    </table>
                </div>

                <!-- Edit Cap Modal -->
                @if (editingAgent()) {
                    <div class="modal-overlay" (click)="cancelEdit()">
                        <div class="modal" (click)="$event.stopPropagation()">
                            <h3>Set Spending Cap: {{ editingAgent()?.agentName }}</h3>
                            <div class="form-group">
                                <label>Daily ALGO Limit</label>
                                <input
                                    type="number"
                                    [(ngModel)]="editAlgoLimit"
                                    min="0"
                                    step="0.1"
                                    class="input" />
                                <small>Set to 0 for unlimited</small>
                            </div>
                            <div class="modal__actions">
                                <button class="btn" (click)="saveCap()">Save</button>
                                <button class="btn btn--secondary" (click)="cancelEdit()">Cancel</button>
                            </div>
                        </div>
                    </div>
                }

                <!-- Credit Balance -->
                <div class="spending__section">
                    <h3>Credit Balance</h3>
                    @if (creditBalance()) {
                        <div class="info-grid">
                            <div class="info-item">
                                <span class="info-label">Available Credits</span>
                                <span class="info-value">{{ creditBalance()?.available | number }}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Reserved</span>
                                <span class="info-value">{{ creditBalance()?.reserved | number }}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Total Purchased</span>
                                <span class="info-value">{{ creditBalance()?.totalPurchased | number }}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Total Consumed</span>
                                <span class="info-value">{{ creditBalance()?.totalConsumed | number }}</span>
                            </div>
                        </div>
                    } @else {
                        <p class="spending__empty">No credit balance data available.</p>
                    }
                </div>

                <!-- USDC Deposit History -->
                <div class="spending__section">
                    <h3>USDC Deposit History</h3>
                    @if (usdcDeposits().length > 0) {
                        <table class="spending__table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Amount (USDC)</th>
                                    <th>Credits Added</th>
                                    <th>Transaction ID</th>
                                </tr>
                            </thead>
                            <tbody>
                                @for (deposit of usdcDeposits(); track deposit.id) {
                                    <tr>
                                        <td>{{ deposit.createdAt }}</td>
                                        <td>{{ deposit.reference }}</td>
                                        <td>{{ deposit.amount | number }}</td>
                                        <td class="txid">{{ deposit.txid ? deposit.txid.slice(0, 12) + '...' : '-' }}</td>
                                    </tr>
                                }
                            </tbody>
                        </table>
                    } @else {
                        <p class="spending__empty">No USDC deposits yet.</p>
                    }
                </div>

                <!-- Recent Credit Transactions -->
                <div class="spending__section">
                    <h3>Recent Credit Transactions</h3>
                    @if (creditTransactions().length > 0) {
                        <table class="spending__table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Type</th>
                                    <th>Amount</th>
                                    <th>Balance After</th>
                                    <th>Reference</th>
                                </tr>
                            </thead>
                            <tbody>
                                @for (tx of creditTransactions(); track tx.id) {
                                    <tr>
                                        <td>{{ tx.createdAt }}</td>
                                        <td><span class="badge" [class]="'badge--' + tx.type">{{ tx.type }}</span></td>
                                        <td>{{ tx.amount | number }}</td>
                                        <td>{{ tx.balanceAfter | number }}</td>
                                        <td>{{ tx.reference ?? '-' }}</td>
                                    </tr>
                                }
                            </tbody>
                        </table>
                    } @else {
                        <p class="spending__empty">No credit transactions yet.</p>
                    }
                </div>
            }
        </div>
    `,
    styles: [`
        .spending { padding: 1rem; }
        .spending__section { margin-bottom: 2rem; }
        .spending__section h3 { margin-bottom: 0.5rem; border-bottom: 1px solid var(--border-color, #333); padding-bottom: 0.25rem; }
        .spending__desc { color: var(--text-muted, #888); font-size: 0.85rem; margin-bottom: 1rem; }
        .spending__empty { color: var(--text-muted, #888); font-style: italic; }
        .spending__table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
        .spending__table th, .spending__table td { padding: 0.5rem; text-align: left; border-bottom: 1px solid var(--border-color, #333); }
        .spending__table th { color: var(--text-muted, #888); font-weight: 600; }
        .info-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 1rem; margin-top: 0.5rem; }
        .info-item { display: flex; flex-direction: column; gap: 0.25rem; }
        .info-label { font-size: 0.75rem; color: var(--text-muted, #888); text-transform: uppercase; }
        .info-value { font-size: 1.2rem; font-weight: 600; }
        .progress-bar { width: 80px; height: 6px; background: var(--bg-elevated, #222); border-radius: 3px; display: inline-block; vertical-align: middle; }
        .progress-bar__fill { height: 100%; background: var(--accent, #4af); border-radius: 3px; transition: width 0.3s; }
        .progress-bar__fill--warning { background: #f90; }
        .progress-bar__fill--danger { background: #f44; }
        .progress-text { font-size: 0.75rem; margin-left: 0.5rem; }
        .badge { font-size: 0.7rem; padding: 0.1rem 0.4rem; border-radius: 3px; background: var(--bg-elevated, #333); }
        .badge--default { background: var(--bg-elevated, #333); color: var(--text-muted, #888); }
        .badge--purchase, .badge--usdc_deposit, .badge--grant { background: #1a3a1a; color: #4c4; }
        .badge--deduction, .badge--agent_message { background: #3a1a1a; color: #c44; }
        .badge--reserve { background: #3a3a1a; color: #cc4; }
        .badge--release, .badge--refund { background: #1a2a3a; color: #4ac; }
        .txid { font-family: monospace; font-size: 0.8rem; }
        .btn--sm { padding: 0.2rem 0.5rem; font-size: 0.75rem; }
        .btn--danger { background: #c44; color: white; }
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 100; }
        .modal { background: var(--bg-primary, #1a1a1a); padding: 1.5rem; border-radius: 8px; min-width: 320px; border: 1px solid var(--border-color, #333); }
        .modal h3 { margin-bottom: 1rem; }
        .modal__actions { display: flex; gap: 0.5rem; margin-top: 1rem; }
        .form-group { margin-bottom: 1rem; }
        .form-group label { display: block; margin-bottom: 0.25rem; font-size: 0.85rem; }
        .form-group small { color: var(--text-muted, #888); font-size: 0.75rem; }
        .loading { color: var(--text-muted, #888); }
    `],
})
export class SpendingComponent implements OnInit {
    private readonly api = inject(ApiService);
    private readonly notify = inject(NotificationService);

    readonly loading = signal(true);
    readonly agentSpending = signal<AgentSpendingInfo[]>([]);
    readonly creditBalance = signal<CreditBalance | null>(null);
    readonly usdcDeposits = signal<UsdcDeposit[]>([]);
    readonly creditTransactions = signal<CreditTransaction[]>([]);
    readonly editingAgent = signal<AgentSpendingInfo | null>(null);
    editAlgoLimit = 5;

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
        this.editAlgoLimit = info.cap.dailyLimitMicroalgos / 1_000_000;
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
                    dailyLimitMicroalgos: Math.round(this.editAlgoLimit * 1_000_000),
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
        try {
            await firstValueFrom(this.api.delete(`/agents/${agentId}/spending-cap`));
            this.notify.success('Spending cap removed');
            await this.loadData();
        } catch {
            this.notify.error('Failed to remove spending cap');
        }
    }
}

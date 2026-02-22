import { Component, ChangeDetectionStrategy, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import { firstValueFrom } from 'rxjs';

interface LogEntry {
    type: string;
    id: string | number;
    message: string;
    detail: string | null;
    level: string;
    timestamp: string;
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
    selector: 'app-system-logs',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, RelativeTimePipe, FormsModule],
    template: `
        <div class="logs">
            <h2>System Logs</h2>

            <!-- Tab bar -->
            <div class="tabs">
                <button
                    class="tab-btn"
                    [class.tab-btn--active]="activeTab() === 'logs'"
                    (click)="switchTab('logs')"
                >Event Logs</button>
                <button
                    class="tab-btn"
                    [class.tab-btn--active]="activeTab() === 'credits'"
                    (click)="switchTab('credits')"
                >Credit Transactions</button>
            </div>

            @if (activeTab() === 'logs') {
                <!-- Search & Controls -->
                <div class="log-toolbar">
                    <input
                        class="log-search"
                        placeholder="Search logs..."
                        [(ngModel)]="searchQuery"
                        (input)="onSearch()" />
                    <button class="btn btn--secondary btn--sm" [class.btn--active]="autoRefresh()" (click)="toggleAutoRefresh()">
                        Auto-refresh: {{ autoRefresh() ? 'ON' : 'OFF' }}
                    </button>
                    <button class="btn btn--secondary btn--sm" (click)="onExportLogs()">Export</button>
                </div>

                <!-- Log type + level filters -->
                <div class="log-filters">
                    <div class="filter-group">
                        @for (type of logTypes; track type) {
                            <button
                                class="filter-chip"
                                [class.filter-chip--active]="logTypeFilter() === type"
                                (click)="setLogType(type)"
                            >{{ type }}</button>
                        }
                    </div>
                    <div class="filter-group">
                        @for (level of logLevels; track level) {
                            <button
                                class="filter-chip filter-chip--level"
                                [class.filter-chip--active]="logLevelFilter() === level"
                                [attr.data-level]="level"
                                (click)="setLogLevel(level)"
                            >{{ level }}</button>
                        }
                    </div>
                </div>

                @if (loadingLogs()) {
                    <p class="loading">Loading logs...</p>
                } @else if (logs().length === 0) {
                    <div class="empty">No system logs found.</div>
                } @else {
                    <div class="log-list">
                        @for (log of logs(); track log.id + '-' + log.type) {
                            <div class="log-entry" [attr.data-level]="log.level">
                                <div class="log-entry__header">
                                    <span class="log-type" [attr.data-type]="log.type">{{ log.type }}</span>
                                    <span class="log-level" [attr.data-level]="log.level">{{ log.level }}</span>
                                    <span class="log-time">{{ log.timestamp | relativeTime }}</span>
                                </div>
                                <p class="log-message">{{ log.message }}</p>
                                @if (log.detail) {
                                    <p class="log-detail">{{ log.detail }}</p>
                                }
                            </div>
                        }
                    </div>
                    @if (logs().length >= 100) {
                        <button class="load-more" (click)="loadMoreLogs()">Load more</button>
                    }
                }
            }

            @if (activeTab() === 'credits') {
                @if (loadingCredits()) {
                    <p class="loading">Loading credit transactions...</p>
                } @else if (creditTxns().length === 0) {
                    <div class="empty">No credit transactions found.</div>
                } @else {
                    <div class="credit-table">
                        <div class="credit-header">
                            <span>Type</span>
                            <span>Amount</span>
                            <span>Balance</span>
                            <span>Wallet</span>
                            <span>Time</span>
                        </div>
                        @for (txn of creditTxns(); track txn.id) {
                            <div class="credit-row">
                                <span class="credit-type" [attr.data-type]="txn.type">{{ txn.type }}</span>
                                <span class="credit-amount" [class.credit-amount--positive]="txn.amount > 0" [class.credit-amount--negative]="txn.amount < 0">
                                    {{ txn.amount > 0 ? '+' : '' }}{{ txn.amount }}
                                </span>
                                <span class="credit-balance">{{ txn.balance_after }}</span>
                                <span class="credit-wallet">
                                    <code>{{ txn.wallet_address.slice(0, 8) }}...</code>
                                </span>
                                <span class="credit-time">{{ txn.created_at | relativeTime }}</span>
                            </div>
                        }
                    </div>
                    @if (creditTxns().length >= 50) {
                        <button class="load-more" (click)="loadMoreCredits()">Load more</button>
                    }
                }
            }
        </div>
    `,
    styles: `
        .logs { padding: 1.5rem; }
        .logs h2 { margin: 0 0 1rem; color: var(--text-primary); }
        .loading { color: var(--text-secondary); }
        .empty { text-align: center; padding: 3rem; color: var(--text-tertiary); }

        /* Tabs */
        .tabs {
            display: flex;
            gap: 0.35rem;
            margin-bottom: 1rem;
        }
        .tab-btn {
            padding: 0.45rem 1rem;
            background: var(--bg-raised);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            color: var(--text-secondary);
            font-size: 0.75rem;
            font-family: inherit;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s;
        }
        .tab-btn:hover { border-color: var(--border-bright); color: var(--text-primary); }
        .tab-btn--active { border-color: var(--accent-cyan); color: var(--accent-cyan); background: var(--accent-cyan-dim); }

        /* Toolbar */
        .log-toolbar {
            display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.75rem;
        }
        .log-search {
            flex: 1; padding: 0.4rem 0.75rem; border: 1px solid var(--border-bright); border-radius: var(--radius);
            font-size: 0.8rem; font-family: inherit; background: var(--bg-input); color: var(--text-primary); box-sizing: border-box;
        }
        .log-search:focus { border-color: var(--accent-cyan); outline: none; }
        .btn--sm { padding: 0.3rem 0.6rem; font-size: 0.7rem; }
        .btn--active { border-color: var(--accent-cyan); color: var(--accent-cyan); }

        /* Log filters */
        .log-filters {
            display: flex;
            gap: 0.75rem;
            margin-bottom: 1rem;
        }
        .filter-group { display: flex; gap: 0.35rem; }
        .filter-chip {
            padding: 0.25rem 0.55rem;
            background: var(--bg-surface);
            border: 1px solid var(--border);
            border-radius: 20px;
            color: var(--text-tertiary);
            font-size: 0.65rem;
            font-family: inherit;
            cursor: pointer;
            text-transform: capitalize;
            transition: all 0.15s;
        }
        .filter-chip:hover { border-color: var(--border-bright); color: var(--text-secondary); }
        .filter-chip--active { border-color: var(--accent-magenta); color: var(--accent-magenta); background: var(--accent-magenta-dim); }

        /* Log entries */
        .log-list {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
        }
        .log-entry {
            background: var(--bg-surface);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            padding: 0.75rem;
            transition: border-color 0.15s;
        }
        .log-entry:hover { border-color: var(--border-bright); }
        .log-entry[data-level="error"] { border-left: 3px solid var(--accent-red); }
        .log-entry[data-level="warn"] { border-left: 3px solid var(--accent-amber); }
        .log-entry[data-level="info"] { border-left: 3px solid var(--accent-cyan); }

        .log-entry__header {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-bottom: 0.35rem;
        }

        .log-type {
            font-size: 0.6rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            padding: 1px 6px;
            border-radius: var(--radius-sm);
        }
        .log-type[data-type="council"] { color: var(--accent-cyan); background: var(--accent-cyan-dim); }
        .log-type[data-type="escalation"] { color: var(--accent-amber); background: var(--accent-amber-dim); }
        .log-type[data-type="work-task"] { color: var(--accent-magenta); background: var(--accent-magenta-dim); }

        .log-level {
            font-size: 0.55rem;
            text-transform: uppercase;
            font-weight: 600;
        }
        .log-level[data-level="error"] { color: var(--accent-red); }
        .log-level[data-level="warn"] { color: var(--accent-amber); }
        .log-level[data-level="info"] { color: var(--text-tertiary); }

        .log-time {
            font-size: 0.6rem;
            color: var(--text-tertiary);
            margin-left: auto;
        }

        .log-message {
            margin: 0;
            font-size: 0.75rem;
            color: var(--text-secondary);
            line-height: 1.4;
        }

        .log-detail {
            margin: 0.25rem 0 0;
            font-size: 0.65rem;
            color: var(--text-tertiary);
            font-family: monospace;
        }

        /* Credit table */
        .credit-table {
            display: flex;
            flex-direction: column;
        }
        .credit-header, .credit-row {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr 1.5fr 1fr;
            gap: 0.5rem;
            padding: 0.45rem 0.5rem;
            font-size: 0.7rem;
        }
        .credit-header {
            color: var(--text-tertiary);
            text-transform: uppercase;
            letter-spacing: 0.06em;
            font-weight: 700;
            border-bottom: 1px solid var(--border);
        }
        .credit-row {
            color: var(--text-secondary);
            border-bottom: 1px solid var(--border);
        }
        .credit-row:last-child { border-bottom: none; }

        .credit-type {
            text-transform: capitalize;
            font-weight: 600;
        }
        .credit-type[data-type="purchase"] { color: var(--accent-green); }
        .credit-type[data-type="consume"] { color: var(--accent-amber); }
        .credit-type[data-type="reserve"] { color: var(--accent-magenta); }

        .credit-amount--positive { color: var(--accent-green); }
        .credit-amount--negative { color: var(--accent-red); }
        .credit-balance { color: var(--text-primary); font-weight: 600; }
        .credit-wallet code {
            font-size: 0.6rem;
            background: var(--bg-raised);
            padding: 1px 4px;
            border-radius: var(--radius-sm);
            color: var(--text-tertiary);
        }
        .credit-time { color: var(--text-tertiary); }

        /* Load more */
        .load-more {
            display: block;
            margin: 1rem auto;
            padding: 0.5rem 1.5rem;
            background: var(--bg-raised);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            color: var(--text-secondary);
            font-size: 0.75rem;
            font-family: inherit;
            cursor: pointer;
            transition: all 0.15s;
        }
        .load-more:hover { border-color: var(--accent-cyan); color: var(--accent-cyan); }
    `,
})
export class SystemLogsComponent implements OnInit, OnDestroy {
    private readonly api = inject(ApiService);

    readonly activeTab = signal<'logs' | 'credits'>('logs');
    readonly logTypeFilter = signal('all');
    readonly logLevelFilter = signal('all');
    readonly loadingLogs = signal(true);
    readonly loadingCredits = signal(true);
    readonly logs = signal<LogEntry[]>([]);
    readonly creditTxns = signal<CreditTransaction[]>([]);
    readonly autoRefresh = signal(false);

    protected searchQuery = '';
    private logOffset = 0;
    private creditOffset = 0;
    private refreshTimer: ReturnType<typeof setInterval> | null = null;
    private searchDebounce: ReturnType<typeof setTimeout> | null = null;

    readonly logTypes = ['all', 'council', 'escalation', 'work-task'];
    readonly logLevels = ['all', 'error', 'warn', 'info', 'stage'];

    ngOnInit(): void {
        this.loadLogs();
    }

    ngOnDestroy(): void {
        if (this.refreshTimer) clearInterval(this.refreshTimer);
        if (this.searchDebounce) clearTimeout(this.searchDebounce);
    }

    protected switchTab(tab: 'logs' | 'credits'): void {
        this.activeTab.set(tab);
        if (tab === 'credits' && this.creditTxns().length === 0) {
            this.loadCredits();
        }
    }

    protected setLogType(type: string): void {
        this.logTypeFilter.set(type);
        this.logOffset = 0;
        this.logs.set([]);
        this.loadLogs();
    }

    protected setLogLevel(level: string): void {
        this.logLevelFilter.set(level);
        this.logOffset = 0;
        this.logs.set([]);
        this.loadLogs();
    }

    protected onSearch(): void {
        if (this.searchDebounce) clearTimeout(this.searchDebounce);
        this.searchDebounce = setTimeout(() => {
            this.logOffset = 0;
            this.logs.set([]);
            this.loadLogs();
        }, 300);
    }

    protected toggleAutoRefresh(): void {
        this.autoRefresh.update((v) => !v);
        if (this.autoRefresh()) {
            this.refreshTimer = setInterval(() => {
                this.logOffset = 0;
                this.loadLogs();
            }, 10000);
        } else {
            if (this.refreshTimer) {
                clearInterval(this.refreshTimer);
                this.refreshTimer = null;
            }
        }
    }

    protected onExportLogs(): void {
        const lines = this.logs().map((log) =>
            `[${log.timestamp}] [${log.level.toUpperCase()}] [${log.type}] ${log.message}${log.detail ? '\n  ' + log.detail : ''}`,
        );
        const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `system-logs-${new Date().toISOString().slice(0, 10)}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    }

    protected loadMoreLogs(): void {
        this.logOffset += 100;
        this.loadLogs(true);
    }

    protected loadMoreCredits(): void {
        this.creditOffset += 50;
        this.loadCredits(true);
    }

    private async loadLogs(append = false): Promise<void> {
        this.loadingLogs.set(true);
        try {
            const type = this.logTypeFilter();
            const level = this.logLevelFilter();
            let url = `/system-logs?type=${type}&limit=100&offset=${this.logOffset}`;
            if (level !== 'all') url += `&level=${level}`;
            if (this.searchQuery) url += `&search=${encodeURIComponent(this.searchQuery)}`;
            const result = await firstValueFrom(
                this.api.get<{ logs: LogEntry[] }>(url),
            );
            if (append) {
                this.logs.update((current) => [...current, ...result.logs]);
            } else {
                this.logs.set(result.logs);
            }
        } catch {
            // Non-critical
        } finally {
            this.loadingLogs.set(false);
        }
    }

    private async loadCredits(append = false): Promise<void> {
        this.loadingCredits.set(true);
        try {
            const result = await firstValueFrom(
                this.api.get<{ transactions: CreditTransaction[] }>(`/system-logs/credit-transactions?limit=50&offset=${this.creditOffset}`),
            );
            if (append) {
                this.creditTxns.update((current) => [...current, ...result.transactions]);
            } else {
                this.creditTxns.set(result.transactions);
            }
        } catch {
            // Non-critical
        } finally {
            this.loadingCredits.set(false);
        }
    }
}

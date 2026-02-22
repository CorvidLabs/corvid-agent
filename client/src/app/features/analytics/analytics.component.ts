import { Component, ChangeDetectionStrategy, inject, OnInit, signal, computed } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { firstValueFrom } from 'rxjs';

interface OverviewData {
    totalSessions: number;
    totalCostUsd: number;
    totalAlgoSpent: number;
    totalTurns: number;
    totalCreditsConsumed: number;
    activeSessions: number;
    totalAgents: number;
    totalProjects: number;
    workTasks: Record<string, number>;
    agentMessages: number;
    algochatMessages: number;
    todaySpending: { algoMicro: number; apiCostUsd: number };
}

interface SpendingDay {
    date: string;
    algo_micro: number;
    api_cost_usd: number;
}

interface SessionCostDay {
    date: string;
    session_count: number;
    cost_usd: number;
    turns: number;
}

interface SpendingData {
    spending: SpendingDay[];
    sessionCosts: SessionCostDay[];
    days: number;
}

interface AgentSessionStat {
    agent_id: string;
    agent_name: string;
    session_count: number;
    total_cost: number;
    total_turns: number;
}

interface SessionStats {
    byAgent: AgentSessionStat[];
    bySource: { source: string; count: number }[];
    byStatus: { status: string; count: number }[];
}

@Component({
    selector: 'app-analytics',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [DecimalPipe],
    template: `
        <div class="analytics">
            <h2>Analytics</h2>

            @if (loading()) {
                <p class="loading">Loading analytics data...</p>
            } @else if (overview()) {
                <!-- Overview Cards -->
                <div class="analytics__cards">
                    <div class="stat-card">
                        <span class="stat-card__label">Total Sessions</span>
                        <span class="stat-card__value">{{ overview()!.totalSessions }}</span>
                    </div>
                    <div class="stat-card">
                        <span class="stat-card__label">API Cost (USD)</span>
                        <span class="stat-card__value stat-card__value--usd">\${{ overview()!.totalCostUsd | number:'1.2-4' }}</span>
                    </div>
                    <div class="stat-card">
                        <span class="stat-card__label">ALGO Spent</span>
                        <span class="stat-card__value stat-card__value--algo">{{ (overview()!.totalAlgoSpent / 1000000) | number:'1.4-4' }}</span>
                    </div>
                    <div class="stat-card">
                        <span class="stat-card__label">Total Turns</span>
                        <span class="stat-card__value">{{ overview()!.totalTurns }}</span>
                    </div>
                    <div class="stat-card">
                        <span class="stat-card__label">Active Now</span>
                        <span class="stat-card__value stat-card__value--active">{{ overview()!.activeSessions }}</span>
                    </div>
                    <div class="stat-card">
                        <span class="stat-card__label">Messages</span>
                        <span class="stat-card__value">{{ overview()!.agentMessages + overview()!.algochatMessages }}</span>
                    </div>
                    <div class="stat-card">
                        <span class="stat-card__label">Credits Used</span>
                        <span class="stat-card__value">{{ overview()!.totalCreditsConsumed }}</span>
                    </div>
                    <div class="stat-card stat-card--today">
                        <span class="stat-card__label">Today's Spend</span>
                        <span class="stat-card__value stat-card__value--usd">\${{ overview()!.todaySpending.apiCostUsd | number:'1.2-4' }}</span>
                    </div>
                </div>

                <!-- Work Tasks Summary -->
                @if (workTaskTotal() > 0) {
                    <div class="analytics__section">
                        <h3>Work Tasks</h3>
                        <div class="work-task-bar">
                            @for (entry of workTaskEntries(); track entry.status) {
                                <div
                                    class="work-task-segment"
                                    [attr.data-status]="entry.status"
                                    [style.flex]="entry.count"
                                    [title]="entry.status + ': ' + entry.count"
                                >
                                    <span class="work-task-segment__label">{{ entry.status }} ({{ entry.count }})</span>
                                </div>
                            }
                        </div>
                    </div>
                }

                <!-- Spending Over Time (ASCII chart) -->
                @if (spending()) {
                    <div class="analytics__section">
                        <h3>Daily API Cost (Last {{ spendingDays() }} Days)</h3>
                        <div class="chart-controls">
                            <button class="chart-btn" [class.chart-btn--active]="spendingDays() === 7" (click)="loadSpending(7)">7d</button>
                            <button class="chart-btn" [class.chart-btn--active]="spendingDays() === 14" (click)="loadSpending(14)">14d</button>
                            <button class="chart-btn" [class.chart-btn--active]="spendingDays() === 30" (click)="loadSpending(30)">30d</button>
                            <button class="chart-btn" [class.chart-btn--active]="spendingDays() === 90" (click)="loadSpending(90)">90d</button>
                        </div>
                        <div class="ascii-chart">
                            @for (bar of spendingBars(); track bar.date) {
                                <div class="chart-row" [title]="bar.date + ': $' + bar.value.toFixed(4)">
                                    <span class="chart-row__label">{{ bar.dateShort }}</span>
                                    <div class="chart-row__bar-wrapper">
                                        <div class="chart-row__bar" [style.width.%]="bar.pct"></div>
                                    </div>
                                    <span class="chart-row__value">\${{ bar.value.toFixed(4) }}</span>
                                </div>
                            }
                            @if (spendingBars().length === 0) {
                                <p class="empty-state">No spending data for this period</p>
                            }
                        </div>
                    </div>
                }

                <!-- Sessions Per Day -->
                @if (spending()) {
                    <div class="analytics__section">
                        <h3>Sessions Per Day (Last {{ spendingDays() }} Days)</h3>
                        <div class="ascii-chart">
                            @for (bar of sessionBars(); track bar.date) {
                                <div class="chart-row" [title]="bar.date + ': ' + bar.value + ' sessions'">
                                    <span class="chart-row__label">{{ bar.dateShort }}</span>
                                    <div class="chart-row__bar-wrapper">
                                        <div class="chart-row__bar chart-row__bar--sessions" [style.width.%]="bar.pct"></div>
                                    </div>
                                    <span class="chart-row__value chart-row__value--sessions">{{ bar.value }}</span>
                                </div>
                            }
                            @if (sessionBars().length === 0) {
                                <p class="empty-state">No session data for this period</p>
                            }
                        </div>
                    </div>
                }

                <!-- Agent Breakdown -->
                @if (sessionStats()) {
                    <div class="analytics__section">
                        <h3>Usage by Agent</h3>
                        <div class="agent-table">
                            <div class="agent-table__header">
                                <span>Agent</span>
                                <span>Sessions</span>
                                <span>Turns</span>
                                <span>Cost (USD)</span>
                            </div>
                            @for (agent of sessionStats()!.byAgent; track agent.agent_id) {
                                <div class="agent-table__row">
                                    <span class="agent-name">{{ agent.agent_name || 'Unknown' }}</span>
                                    <span>{{ agent.session_count }}</span>
                                    <span>{{ agent.total_turns }}</span>
                                    <span class="cost-cell">\${{ agent.total_cost | number:'1.2-4' }}</span>
                                </div>
                            }
                            @if (sessionStats()!.byAgent.length === 0) {
                                <p class="empty-state">No agent session data</p>
                            }
                        </div>
                    </div>

                    <!-- Session Sources & Status -->
                    <div class="analytics__grid-2">
                        <div class="analytics__section">
                            <h3>Sessions by Source</h3>
                            @for (entry of sessionStats()!.bySource; track entry.source) {
                                <div class="kv-row">
                                    <span class="kv-key">{{ entry.source }}</span>
                                    <span class="kv-val">{{ entry.count }}</span>
                                </div>
                            }
                        </div>
                        <div class="analytics__section">
                            <h3>Sessions by Status</h3>
                            @for (entry of sessionStats()!.byStatus; track entry.status) {
                                <div class="kv-row">
                                    <span class="kv-key" [attr.data-status]="entry.status">{{ entry.status }}</span>
                                    <span class="kv-val">{{ entry.count }}</span>
                                </div>
                            }
                        </div>
                    </div>
                }
            }
        </div>
    `,
    styles: `
        .analytics { padding: 1.5rem; }
        .analytics h2 { margin: 0 0 1.5rem; color: var(--text-primary); }
        .analytics h3 { margin: 0 0 0.75rem; color: var(--text-primary); font-size: 0.85rem; }
        .loading { color: var(--text-secondary); }

        .analytics__cards {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
            gap: 0.75rem;
            margin-bottom: 2rem;
        }

        .stat-card {
            background: var(--bg-surface);
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
            padding: 1rem;
            display: flex;
            flex-direction: column;
            gap: 0.35rem;
        }
        .stat-card--today {
            border-color: var(--accent-amber);
            border-style: dashed;
        }
        .stat-card__label {
            font-size: 0.65rem;
            color: var(--text-tertiary);
            text-transform: uppercase;
            letter-spacing: 0.08em;
        }
        .stat-card__value {
            font-size: 1.5rem;
            font-weight: 700;
            color: var(--accent-cyan);
            text-shadow: 0 0 10px rgba(0, 229, 255, 0.15);
        }
        .stat-card__value--usd { color: var(--accent-green); text-shadow: 0 0 10px rgba(0, 255, 136, 0.15); }
        .stat-card__value--algo { color: var(--accent-magenta); text-shadow: 0 0 10px rgba(255, 0, 170, 0.15); }
        .stat-card__value--active { color: var(--accent-amber); text-shadow: 0 0 10px rgba(255, 170, 0, 0.15); }

        .analytics__section {
            background: var(--bg-surface);
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
            padding: 1.25rem;
            margin-bottom: 1.25rem;
        }

        .analytics__grid-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1.25rem;
            margin-bottom: 1.25rem;
        }
        @media (max-width: 767px) {
            .analytics__grid-2 { grid-template-columns: 1fr; }
        }

        /* Work task bar */
        .work-task-bar {
            display: flex;
            height: 28px;
            border-radius: var(--radius);
            overflow: hidden;
            border: 1px solid var(--border);
        }
        .work-task-segment {
            display: flex;
            align-items: center;
            justify-content: center;
            min-width: 40px;
            transition: flex 0.3s;
        }
        .work-task-segment__label {
            font-size: 0.6rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.03em;
            white-space: nowrap;
        }
        .work-task-segment[data-status="completed"] { background: var(--accent-green-dim); color: var(--accent-green); }
        .work-task-segment[data-status="pending"] { background: var(--accent-amber-dim); color: var(--accent-amber); }
        .work-task-segment[data-status="running"], .work-task-segment[data-status="branching"], .work-task-segment[data-status="validating"] { background: var(--accent-cyan-dim); color: var(--accent-cyan); }
        .work-task-segment[data-status="failed"] { background: var(--accent-red-dim); color: var(--accent-red); }

        /* Chart controls */
        .chart-controls {
            display: flex;
            gap: 0.35rem;
            margin-bottom: 0.75rem;
        }
        .chart-btn {
            padding: 0.3rem 0.65rem;
            background: var(--bg-raised);
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            color: var(--text-secondary);
            font-size: 0.7rem;
            font-family: inherit;
            cursor: pointer;
            transition: border-color 0.15s, color 0.15s;
        }
        .chart-btn:hover { border-color: var(--border-bright); color: var(--text-primary); }
        .chart-btn--active { border-color: var(--accent-cyan); color: var(--accent-cyan); background: var(--accent-cyan-dim); }

        /* ASCII bar chart */
        .ascii-chart { display: flex; flex-direction: column; gap: 3px; }
        .chart-row {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        .chart-row__label {
            width: 48px;
            flex-shrink: 0;
            font-size: 0.6rem;
            color: var(--text-tertiary);
            text-align: right;
        }
        .chart-row__bar-wrapper {
            flex: 1;
            height: 14px;
            background: var(--bg-raised);
            border-radius: 2px;
            overflow: hidden;
        }
        .chart-row__bar {
            height: 100%;
            background: linear-gradient(90deg, var(--accent-cyan-dim), var(--accent-cyan));
            border-radius: 2px;
            min-width: 1px;
            transition: width 0.3s;
        }
        .chart-row__value {
            width: 64px;
            flex-shrink: 0;
            font-size: 0.6rem;
            color: var(--accent-green);
            text-align: right;
        }
        .chart-row__bar--sessions {
            background: linear-gradient(90deg, var(--accent-magenta-dim, rgba(255, 0, 170, 0.15)), var(--accent-magenta));
        }
        .chart-row__value--sessions { color: var(--accent-magenta); }

        /* Agent table */
        .agent-table { display: flex; flex-direction: column; }
        .agent-table__header, .agent-table__row {
            display: grid;
            grid-template-columns: 2fr 1fr 1fr 1fr;
            gap: 0.5rem;
            padding: 0.4rem 0;
            font-size: 0.7rem;
        }
        .agent-table__header {
            color: var(--text-tertiary);
            text-transform: uppercase;
            letter-spacing: 0.06em;
            border-bottom: 1px solid var(--border);
            font-weight: 700;
        }
        .agent-table__row {
            color: var(--text-secondary);
            border-bottom: 1px solid var(--border);
        }
        .agent-table__row:last-child { border-bottom: none; }
        .agent-name { color: var(--accent-cyan); font-weight: 600; }
        .cost-cell { color: var(--accent-green); }

        /* Key-value rows */
        .kv-row {
            display: flex;
            justify-content: space-between;
            padding: 0.35rem 0;
            border-bottom: 1px solid var(--border);
            font-size: 0.75rem;
        }
        .kv-row:last-child { border-bottom: none; }
        .kv-key { color: var(--text-secondary); text-transform: capitalize; }
        .kv-key[data-status="running"] { color: var(--accent-cyan); }
        .kv-key[data-status="stopped"] { color: var(--text-tertiary); }
        .kv-key[data-status="error"] { color: var(--accent-red); }
        .kv-val { color: var(--text-primary); font-weight: 600; }

        .empty-state { color: var(--text-tertiary); font-size: 0.75rem; text-align: center; padding: 1rem; }
    `,
})
export class AnalyticsComponent implements OnInit {
    private readonly api = inject(ApiService);

    readonly loading = signal(true);
    readonly overview = signal<OverviewData | null>(null);
    readonly spending = signal<SpendingData | null>(null);
    readonly sessionStats = signal<SessionStats | null>(null);
    readonly spendingDays = signal(30);

    readonly workTaskTotal = computed(() => {
        const tasks = this.overview()?.workTasks;
        if (!tasks) return 0;
        return Object.values(tasks).reduce((sum, count) => sum + count, 0);
    });

    readonly workTaskEntries = computed(() => {
        const tasks = this.overview()?.workTasks;
        if (!tasks) return [];
        return Object.entries(tasks).map(([status, count]) => ({ status, count }));
    });

    readonly spendingBars = computed(() => {
        const data = this.spending();
        if (!data) return [];

        // Merge daily_spending and session costs by date
        const dateMap = new Map<string, number>();
        for (const d of data.spending) {
            dateMap.set(d.date, (dateMap.get(d.date) ?? 0) + d.api_cost_usd);
        }
        for (const d of data.sessionCosts) {
            dateMap.set(d.date, (dateMap.get(d.date) ?? 0) + d.cost_usd);
        }

        const entries = Array.from(dateMap.entries())
            .map(([date, value]) => ({ date, value }))
            .sort((a, b) => a.date.localeCompare(b.date));

        const max = Math.max(...entries.map((e) => e.value), 0.001);

        return entries.map((e) => ({
            date: e.date,
            dateShort: e.date.slice(5), // MM-DD
            value: e.value,
            pct: (e.value / max) * 100,
        }));
    });

    readonly sessionBars = computed(() => {
        const data = this.spending();
        if (!data) return [];

        const dateMap = new Map<string, number>();
        for (const d of data.sessionCosts) {
            dateMap.set(d.date, (dateMap.get(d.date) ?? 0) + d.session_count);
        }

        const entries = Array.from(dateMap.entries())
            .map(([date, value]) => ({ date, value }))
            .sort((a, b) => a.date.localeCompare(b.date));

        const max = Math.max(...entries.map((e) => e.value), 1);

        return entries.map((e) => ({
            date: e.date,
            dateShort: e.date.slice(5),
            value: e.value,
            pct: (e.value / max) * 100,
        }));
    });

    ngOnInit(): void {
        this.loadAll();
    }

    protected loadSpending(days: number): void {
        this.spendingDays.set(days);
        firstValueFrom(this.api.get<SpendingData>(`/analytics/spending?days=${days}`))
            .then((data) => this.spending.set(data))
            .catch(() => {});
    }

    private async loadAll(): Promise<void> {
        this.loading.set(true);
        try {
            const [overview, spending, sessions] = await Promise.all([
                firstValueFrom(this.api.get<OverviewData>('/analytics/overview')),
                firstValueFrom(this.api.get<SpendingData>(`/analytics/spending?days=${this.spendingDays()}`)),
                firstValueFrom(this.api.get<SessionStats>('/analytics/sessions')),
            ]);
            this.overview.set(overview);
            this.spending.set(spending);
            this.sessionStats.set(sessions);
        } catch {
            // Analytics is non-critical
        } finally {
            this.loading.set(false);
        }
    }
}

import { Component, ChangeDetectionStrategy, inject, OnInit, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DecimalPipe, SlicePipe } from '@angular/common';
import { SessionService } from '../../core/services/session.service';
import { AgentService } from '../../core/services/agent.service';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import type { Session, SessionStatus, SessionSource } from '../../core/models/session.model';

@Component({
    selector: 'app-session-list',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, FormsModule, StatusBadgeComponent, RelativeTimePipe, DecimalPipe, SlicePipe],
    template: `
        <div class="page">
            <div class="page__header">
                <h2>Conversations</h2>
                <a class="btn btn--primary" routerLink="/sessions/new">+ New Conversation</a>
            </div>

            <!-- Search -->
            <div class="search-bar">
                <input
                    class="search-input"
                    placeholder="Search by name or prompt..."
                    [(ngModel)]="searchQuery"
                    (input)="searchQuery = $any($event.target).value" />
            </div>

            <!-- Filter Tabs -->
            <div class="filter-tabs">
                <button class="filter-tab" [class.filter-tab--active]="statusFilter() === null" (click)="statusFilter.set(null)">
                    All ({{ sessionService.sessions().length }})
                </button>
                <button class="filter-tab" [class.filter-tab--active]="statusFilter() === 'running'" (click)="statusFilter.set('running')">
                    Running ({{ countByStatus('running') }})
                </button>
                <button class="filter-tab" [class.filter-tab--active]="statusFilter() === 'stopped'" (click)="statusFilter.set('stopped')">
                    Completed ({{ countByStatus('stopped') + countByStatus('idle') }})
                </button>
                <button class="filter-tab" [class.filter-tab--active]="statusFilter() === 'error'" (click)="statusFilter.set('error')">
                    Failed ({{ countByStatus('error') }})
                </button>
                <div class="filter-tabs__spacer"></div>
                <select class="source-select" [(ngModel)]="sourceFilter" (ngModelChange)="sourceFilter = $event">
                    <option value="">All Sources</option>
                    <option value="web">Web</option>
                    <option value="algochat">AlgoChat</option>
                </select>
            </div>

            <!-- Bulk Actions -->
            @if (runningCount() > 0 || completedCount() > 0) {
                <div class="bulk-actions">
                    @if (runningCount() > 0) {
                        <button class="btn btn--sm btn--danger" (click)="stopAllRunning()">Stop All Running ({{ runningCount() }})</button>
                    }
                </div>
            }

            @if (sessionService.loading()) {
                <p class="loading">Loading...</p>
            } @else if (filteredSessions().length === 0) {
                <p class="empty">No conversations match your filters.</p>
            } @else {
                <div class="session-table">
                    <div class="session-table__header">
                        <span>Name</span>
                        <span>Agent</span>
                        <span>Status</span>
                        <span>Cost</span>
                        <span>Source</span>
                        <span>Time</span>
                    </div>
                    @for (session of filteredSessions(); track session.id) {
                        <a class="session-table__row" [routerLink]="['/sessions', session.id]">
                            <span class="session-table__name">{{ session.name || session.initialPrompt?.slice(0, 40) || session.id.slice(0, 8) }}</span>
                            <span class="session-table__agent">{{ getAgentName(session.agentId) }}</span>
                            <span><app-status-badge [status]="session.status" /></span>
                            <span class="session-table__cost">\${{ session.totalCostUsd | number:'1.2-4' }}</span>
                            <span class="session-table__source">{{ session.source }}</span>
                            <span class="session-table__time">{{ session.updatedAt | relativeTime }}</span>
                        </a>
                    }
                </div>
            }
        </div>
    `,
    styles: `
        .page { padding: 1.5rem; }
        .page__header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
        .page__header h2 { margin: 0; color: var(--text-primary); }
        .btn { padding: 0.5rem 1rem; border-radius: var(--radius); text-decoration: none; font-size: 0.8rem; font-weight: 600; cursor: pointer; border: 1px solid; font-family: inherit; text-transform: uppercase; letter-spacing: 0.05em; transition: background 0.15s; }
        .btn--primary { background: transparent; color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .btn--primary:hover { background: var(--accent-cyan-dim); }
        .btn--sm { padding: 0.3rem 0.6rem; font-size: 0.7rem; }
        .btn--danger { background: transparent; color: var(--accent-red); border-color: var(--accent-red); }
        .btn--danger:hover { background: var(--accent-red-dim); }
        .loading, .empty { color: var(--text-tertiary); font-size: 0.85rem; }

        .search-bar { margin-bottom: 0.75rem; }
        .search-input {
            width: 100%; padding: 0.5rem 0.75rem; border: 1px solid var(--border-bright); border-radius: var(--radius);
            font-size: 0.85rem; font-family: inherit; background: var(--bg-input); color: var(--text-primary); box-sizing: border-box;
        }
        .search-input:focus { border-color: var(--accent-cyan); box-shadow: var(--glow-cyan); outline: none; }

        .filter-tabs { display: flex; gap: 0.25rem; margin-bottom: 1rem; align-items: center; flex-wrap: wrap; }
        .filter-tab {
            padding: 0.35rem 0.7rem; border: 1px solid var(--border); border-radius: var(--radius-sm);
            background: transparent; color: var(--text-secondary); font-size: 0.7rem; font-family: inherit;
            cursor: pointer; transition: all 0.15s;
        }
        .filter-tab:hover { border-color: var(--border-bright); }
        .filter-tab--active { background: var(--accent-cyan-dim); color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .filter-tabs__spacer { flex: 1; }
        .source-select {
            padding: 0.35rem 0.5rem; border: 1px solid var(--border); border-radius: var(--radius-sm);
            background: var(--bg-input); color: var(--text-secondary); font-size: 0.7rem; font-family: inherit;
        }

        .bulk-actions { display: flex; gap: 0.5rem; margin-bottom: 1rem; }

        .session-table { border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
        .session-table__header {
            display: grid; grid-template-columns: 2fr 1.5fr 1fr 1fr 0.8fr 1fr;
            padding: 0.5rem 1rem; background: var(--bg-raised); font-size: 0.7rem; font-weight: 600;
            text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary);
        }
        .session-table__row {
            display: grid; grid-template-columns: 2fr 1.5fr 1fr 1fr 0.8fr 1fr;
            padding: 0.5rem 1rem; border-top: 1px solid var(--border);
            font-size: 0.8rem; color: var(--text-primary); text-decoration: none;
            transition: background 0.1s; align-items: center;
        }
        .session-table__row:hover { background: var(--bg-hover); }
        .session-table__name { font-weight: 600; color: var(--accent-cyan); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .session-table__agent { color: var(--text-secondary); font-size: 0.75rem; }
        .session-table__cost { color: var(--accent-green); }
        .session-table__source { font-size: 0.7rem; color: var(--text-tertiary); text-transform: uppercase; }
        .session-table__time { font-size: 0.7rem; color: var(--text-tertiary); }

        @media (max-width: 768px) {
            .session-table__header, .session-table__row { grid-template-columns: 2fr 1fr 1fr; }
            .session-table__header span:nth-child(n+4), .session-table__row span:nth-child(n+4) { display: none; }
        }
    `,
})
export class SessionListComponent implements OnInit {
    protected readonly sessionService = inject(SessionService);
    private readonly agentService = inject(AgentService);

    protected searchQuery = '';
    protected sourceFilter = '';
    protected readonly statusFilter = signal<SessionStatus | null>(null);

    private agentNameCache: Record<string, string> = {};

    protected readonly runningCount = computed(() =>
        this.sessionService.sessions().filter((s) => s.status === 'running').length,
    );

    protected readonly completedCount = computed(() =>
        this.sessionService.sessions().filter((s) => s.status === 'stopped' || s.status === 'idle').length,
    );

    protected readonly filteredSessions = computed(() => {
        let sessions = this.sessionService.sessions();
        const query = this.searchQuery.toLowerCase();
        const status = this.statusFilter();
        const source = this.sourceFilter;

        if (query) {
            sessions = sessions.filter((s) =>
                (s.name?.toLowerCase().includes(query)) ||
                (s.initialPrompt?.toLowerCase().includes(query)),
            );
        }
        if (status) {
            if (status === 'stopped') {
                sessions = sessions.filter((s) => s.status === 'stopped' || s.status === 'idle');
            } else {
                sessions = sessions.filter((s) => s.status === status);
            }
        }
        if (source) {
            sessions = sessions.filter((s) => s.source === source);
        }

        return sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    });

    async ngOnInit(): Promise<void> {
        await Promise.all([
            this.sessionService.loadSessions(),
            this.agentService.loadAgents(),
        ]);
        for (const a of this.agentService.agents()) {
            this.agentNameCache[a.id] = a.name;
        }
    }

    protected countByStatus(status: SessionStatus): number {
        return this.sessionService.sessions().filter((s) => s.status === status).length;
    }

    protected getAgentName(agentId: string | null): string {
        if (!agentId) return 'N/A';
        return this.agentNameCache[agentId] ?? agentId.slice(0, 8);
    }

    protected async stopAllRunning(): Promise<void> {
        const running = this.sessionService.sessions().filter((s) => s.status === 'running');
        for (const s of running) {
            try { await this.sessionService.stopSession(s.id); } catch {}
        }
    }
}

import { Component, ChangeDetectionStrategy, inject, OnInit, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { SessionService } from '../../core/services/session.service';
import { AgentService } from '../../core/services/agent.service';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { PageShellComponent } from '../../shared/components/page-shell.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { AbsoluteTimePipe } from '../../shared/pipes/absolute-time.pipe';
import { NotificationService } from '../../core/services/notification.service';
import type { Session, SessionStatus } from '../../core/models/session.model';

interface SessionGroup {
    label: string;
    sessions: Session[];
    total: number;
}

@Component({
    selector: 'app-session-list',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, FormsModule, StatusBadgeComponent, RelativeTimePipe, AbsoluteTimePipe, DecimalPipe, EmptyStateComponent, PageShellComponent, SkeletonComponent],
    template: `
        <app-page-shell
            title="Conversations"
            icon="sessions"
            [breadcrumbs]="[]">
            <a actions class="btn btn--primary" routerLink="/sessions/new">+ New Conversation</a>

            <!-- Search + Filters (sticky) -->
            <div toolbar class="sticky-toolbar">
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
                <select class="source-select" [(ngModel)]="sourceFilter" (ngModelChange)="sourceFilter = $event" aria-label="Filter by source">
                    <option value="">All Sources</option>
                    <option value="web">Web</option>
                    <option value="algochat">AlgoChat</option>
                </select>
            </div>

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
                <app-skeleton variant="table" [count]="5" />
            } @else if (sessionService.sessions().length === 0) {
                <app-empty-state
                    icon="  ____\n |    |\n | >> |\n |____|\n  \\__/"
                    title="No conversations yet."
                    description="Start a conversation with an agent to see it here."
                    actionLabel="+ New Conversation"
                    actionRoute="/sessions/new"
                    actionAriaLabel="Start your first agent conversation" />
            } @else if (filteredSessions().length === 0) {
                <p class="empty">No conversations match your filters.</p>
            } @else {
                @for (group of groupedSessions(); track group.label) {
                    <div class="session-group">
                        <div class="session-group__label">{{ group.label }} ({{ group.total }})</div>
                        <div class="session-table stagger-rows">
                            <div class="session-table__header">
                                <span>Name</span>
                                <span>Agent</span>
                                <span>Status</span>
                                <span>Cost</span>
                                <span>Source</span>
                                <span>Time</span>
                            </div>
                            @for (session of group.sessions; track session.id) {
                                <a class="session-table__row row-highlight" [routerLink]="['/sessions', session.id]"
                                   [class.session-table__row--running]="session.status === 'running' || session.status === 'loading'">
                                    <span class="session-table__name" [title]="sessionDisplayName(session)">{{ sessionDisplayName(session) }}</span>
                                    <span class="session-table__agent" [title]="getAgentName(session.agentId)">{{ getAgentName(session.agentId) }}</span>
                                    <span><app-status-badge [status]="session.status" /></span>
                                    <span class="session-table__cost">\${{ session.totalCostUsd | number:'1.2-4' }}</span>
                                    <span class="session-table__source">{{ session.source }}</span>
                                    <span class="session-table__time" [title]="session.updatedAt | absoluteTime">{{ session.updatedAt | relativeTime }}</span>
                                </a>
                            }
                        </div>
                        @if (group.total > group.sessions.length) {
                            <button class="show-more" (click)="showMore(group.label)">
                                Show more ({{ group.total - group.sessions.length }} remaining)
                            </button>
                        }
                    </div>
                }
            }
        </app-page-shell>
    `,
    styles: `
        .btn--danger { background: transparent; color: var(--accent-red); border-color: var(--accent-red); }
        .btn--danger:hover { background: var(--accent-red-dim); }
        .loading, .empty { color: var(--text-tertiary); font-size: var(--text-sm); }

        .search-bar { margin-bottom: 0.75rem; }
        .search-input {
            width: 100%; padding: 0.5rem 0.75rem; border: 1px solid var(--border-bright); border-radius: var(--radius);
            font-size: var(--text-sm); font-family: inherit; background: var(--bg-input); color: var(--text-primary); box-sizing: border-box;
        }
        .search-input:focus { border-color: var(--accent-cyan); box-shadow: var(--glow-cyan); outline: none; }

        .filter-tabs { display: flex; gap: 0.25rem; margin-bottom: 1rem; align-items: center; flex-wrap: wrap; }
        .filter-tab {
            padding: 0.35rem 0.7rem; border: 1px solid var(--border); border-radius: var(--radius-sm);
            background: transparent; color: var(--text-secondary); font-size: var(--text-xxs); font-family: inherit;
            cursor: pointer; transition: all 0.15s;
        }
        .filter-tab:hover { border-color: var(--border-bright); }
        .filter-tab--active { background: var(--accent-cyan-dim); color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .filter-tabs__spacer { flex: 1; }
        .source-select {
            padding: 0.35rem 0.5rem; border: 1px solid var(--border); border-radius: var(--radius-sm);
            background: var(--bg-input); color: var(--text-secondary); font-size: var(--text-xxs); font-family: inherit;
        }

        .bulk-actions { display: flex; gap: 0.5rem; margin-bottom: 1rem; }


        /* Session groups */
        .session-group { margin-bottom: 1.5rem; }
        .session-group__label {
            font-size: var(--text-xxs); font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
            color: var(--text-tertiary); margin-bottom: 0.5rem; padding-left: 0.25rem;
        }

        .session-table { border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
        .session-table__header {
            display: grid; grid-template-columns: 2fr 1.5fr 1fr 1fr 0.8fr 1fr;
            padding: 0.5rem 1rem; background: var(--bg-raised); font-size: var(--text-xxs); font-weight: 600;
            text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary);
            position: sticky; top: 0; z-index: 5;
            backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
        }
        .session-table__row {
            display: grid; grid-template-columns: 2fr 1.5fr 1fr 1fr 0.8fr 1fr;
            padding: 0.5rem 1rem; border-top: 1px solid var(--border);
            font-size: var(--text-caption); color: var(--text-primary); text-decoration: none;
            transition: background 0.15s, border-color 0.15s; align-items: center;
        }
        .session-table__row:hover { background: var(--bg-hover); }
        .session-table__row--running { border-left: 2px solid var(--accent-green); }
        .session-table__name { font-weight: 600; color: var(--accent-cyan); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .session-table__agent { color: var(--text-secondary); font-size: var(--text-xs); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .session-table__cost { color: var(--accent-green); font-family: var(--font-mono); }
        .session-table__source { font-size: var(--text-xxs); color: var(--text-tertiary); text-transform: uppercase; }
        .session-table__time { font-size: var(--text-xxs); color: var(--text-tertiary); }

        .show-more {
            display: block; width: 100%; margin-top: 0.5rem; padding: 0.5rem;
            background: transparent; border: 1px dashed var(--border-bright); border-radius: var(--radius);
            color: var(--accent-cyan); font-size: var(--text-xs); font-family: inherit; font-weight: 600;
            cursor: pointer; text-transform: uppercase; letter-spacing: 0.05em; transition: background 0.15s;
        }
        .show-more:hover { background: var(--accent-cyan-dim); }

        @media (max-width: 767px) {
            .session-table__header, .session-table__row { grid-template-columns: 2fr 1fr 1fr; }
            .session-table__header span:nth-child(n+4), .session-table__row span:nth-child(n+4) { display: none; }
            .filter-tabs { overflow-x: auto; flex-wrap: nowrap; scrollbar-width: none; -webkit-overflow-scrolling: touch; gap: 0.15rem; }
            .filter-tabs::-webkit-scrollbar { display: none; }
            .filter-tab { white-space: nowrap; flex-shrink: 0; font-size: var(--text-2xs); padding: 0.3rem 0.5rem; }
            .filter-tabs__spacer { display: none; }
            .source-select { flex-shrink: 0; font-size: var(--text-2xs); }
            .search-input { font-size: var(--text-caption); padding: 0.4rem 0.6rem; }
        }
    `,
})
export class SessionListComponent implements OnInit {
    protected readonly sessionService = inject(SessionService);
    private readonly agentService = inject(AgentService);
    private readonly notify = inject(NotificationService);

    protected searchQuery = '';
    protected sourceFilter = '';
    protected readonly statusFilter = signal<SessionStatus | null>(null);
    private readonly PAGE_SIZE = 25;
    private readonly groupLimits = signal<Record<string, number>>({});

    private agentNameCache: Record<string, string> = {};

    protected readonly runningCount = computed(() =>
        this.sessionService.sessions().filter((s) => s.status === 'running' || s.status === 'loading').length,
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
            } else if (status === 'running') {
                sessions = sessions.filter((s) => s.status === 'running' || s.status === 'loading');
            } else {
                sessions = sessions.filter((s) => s.status === status);
            }
        }
        if (source) {
            sessions = sessions.filter((s) => s.source === source);
        }

        // Sort: running first, then by most recent
        return [...sessions].sort((a, b) => {
            const aRunning = a.status === 'running' || a.status === 'loading' ? 1 : 0;
            const bRunning = b.status === 'running' || b.status === 'loading' ? 1 : 0;
            if (aRunning !== bRunning) return bRunning - aRunning;
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });
    });

    protected readonly groupedSessions = computed<SessionGroup[]>(() => {
        const sessions = this.filteredSessions();
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today.getTime() - 86400000);
        const weekAgo = new Date(today.getTime() - 7 * 86400000);

        const groups: Record<string, Session[]> = {
            'Today': [],
            'Yesterday': [],
            'This Week': [],
            'Older': [],
        };

        for (const s of sessions) {
            const d = new Date(s.updatedAt);
            if (d >= today) groups['Today'].push(s);
            else if (d >= yesterday) groups['Yesterday'].push(s);
            else if (d >= weekAgo) groups['This Week'].push(s);
            else groups['Older'].push(s);
        }

        const limits = this.groupLimits();
        return Object.entries(groups)
            .filter(([, arr]) => arr.length > 0)
            .map(([label, arr]) => ({
                label,
                total: arr.length,
                sessions: arr.slice(0, limits[label] ?? this.PAGE_SIZE),
            }));
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

    protected sessionDisplayName(session: Session): string {
        if (session.name) return session.name;
        if (session.initialPrompt) return session.initialPrompt.slice(0, 60) + (session.initialPrompt.length > 60 ? '...' : '');
        return session.id.slice(0, 8);
    }

    protected countByStatus(status: SessionStatus): number {
        return this.sessionService.sessions().filter((s) => s.status === status).length;
    }

    protected getAgentName(agentId: string | null): string {
        if (!agentId) return 'N/A';
        return this.agentNameCache[agentId] ?? agentId.slice(0, 8);
    }

    protected showMore(groupLabel: string): void {
        this.groupLimits.update((limits) => ({
            ...limits,
            [groupLabel]: (limits[groupLabel] ?? this.PAGE_SIZE) + this.PAGE_SIZE,
        }));
    }

    protected async stopAllRunning(): Promise<void> {
        const running = this.sessionService.sessions().filter((s) => s.status === 'running');
        let stopped = 0;
        for (const s of running) {
            try {
                await this.sessionService.stopSession(s.id);
                stopped++;
            } catch {
                this.notify.error(`Failed to stop session ${s.name || s.id.slice(0, 8)}`);
            }
        }
        if (stopped > 0) {
            this.notify.success(`${stopped} session${stopped > 1 ? 's' : ''} stopped`);
        }
    }
}

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
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import type { Session, SessionStatus } from '../../core/models/session.model';

interface SessionGroup {
    label: string;
    sessions: Session[];
    total: number;
}

@Component({
    selector: 'app-session-list',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, FormsModule, StatusBadgeComponent, RelativeTimePipe, AbsoluteTimePipe, DecimalPipe, EmptyStateComponent, PageShellComponent, SkeletonComponent, MatButtonModule, MatButtonToggleModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatIconModule],
    template: `
        <app-page-shell
            title="Conversations"
            icon="sessions"
            [breadcrumbs]="[]">
            <a actions mat-flat-button color="primary" routerLink="/sessions/new">+ New Conversation</a>

            <!-- Search + Filters (sticky) -->
            <div toolbar class="sticky-toolbar">
            <mat-form-field class="search-field" appearance="outline" subscriptSizing="dynamic">
                <mat-icon matPrefix>search</mat-icon>
                <input matInput
                    placeholder="Search by name or prompt..."
                    [(ngModel)]="searchQuery"
                    (input)="searchQuery = $any($event.target).value" />
            </mat-form-field>

            <!-- Filter Tabs -->
            <div class="filter-row">
                <mat-button-toggle-group [value]="statusFilter()" (change)="statusFilter.set($event.value)" hideSingleSelectionIndicator>
                    <mat-button-toggle [value]="null">All ({{ sessionService.sessions().length }})</mat-button-toggle>
                    <mat-button-toggle value="running">Running ({{ countByStatus('running') }})</mat-button-toggle>
                    <mat-button-toggle value="stopped">Completed ({{ countByStatus('stopped') + countByStatus('idle') }})</mat-button-toggle>
                    <mat-button-toggle value="error">Failed ({{ countByStatus('error') }})</mat-button-toggle>
                </mat-button-toggle-group>
                <mat-form-field class="source-field" appearance="outline" subscriptSizing="dynamic">
                    <mat-select [(ngModel)]="sourceFilter" (ngModelChange)="sourceFilter = $event" placeholder="All Sources">
                        <mat-option value="">All Sources</mat-option>
                        <mat-option value="web">Web</mat-option>
                        <mat-option value="algochat">AlgoChat</mat-option>
                    </mat-select>
                </mat-form-field>
            </div>

            </div>

            <!-- Bulk Actions -->
            @if (runningCount() > 0 || completedCount() > 0) {
                <div class="bulk-actions">
                    @if (runningCount() > 0) {
                        <button mat-stroked-button color="warn" (click)="stopAllRunning()">Stop All Running ({{ runningCount() }})</button>
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
                            <button mat-stroked-button class="show-more" (click)="showMore(group.label)">
                                Show more ({{ group.total - group.sessions.length }} remaining)
                            </button>
                        }
                    </div>
                }
            }
        </app-page-shell>
    `,
    styles: `
        .loading, .empty { color: var(--text-tertiary); font-size: 0.85rem; }

        .search-field { width: 100%; margin-bottom: 0.5rem; }
        .search-field .mat-mdc-form-field-icon-prefix { padding-right: 0.5rem; color: var(--text-tertiary); }

        .filter-row { display: flex; gap: 0.75rem; margin-bottom: 1rem; align-items: center; flex-wrap: wrap; }
        .filter-row mat-button-toggle-group { font-size: 0.75rem; }
        .source-field { width: 140px; flex-shrink: 0; }
        .source-field ::ng-deep .mat-mdc-select-value { font-size: 0.75rem; }

        .bulk-actions { display: flex; gap: 0.5rem; margin-bottom: 1rem; }

        /* Session groups */
        .session-group { margin-bottom: 1.5rem; }
        .session-group__label {
            font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
            color: var(--text-tertiary); margin-bottom: 0.5rem; padding-left: var(--space-1);
        }

        .session-table { border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
        .session-table__header {
            display: grid; grid-template-columns: 2fr 1.5fr 1fr 1fr 0.8fr 1fr;
            padding: var(--space-2) var(--space-4); background: var(--bg-raised); font-size: 0.7rem; font-weight: 600;
            text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary);
            position: sticky; top: 0; z-index: 5;
            backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
        }
        .session-table__row {
            display: grid; grid-template-columns: 2fr 1.5fr 1fr 1fr 0.8fr 1fr;
            padding: var(--space-2) var(--space-4); border-top: 1px solid var(--border);
            font-size: 0.8rem; color: var(--text-primary); text-decoration: none;
            transition: background 0.15s, border-color 0.15s; align-items: center;
        }
        .session-table__row:hover { background: var(--bg-hover); }
        .session-table__row--running { border-left: 2px solid var(--accent-green); }
        .session-table__name { font-weight: 600; color: var(--accent-cyan); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .session-table__agent { color: var(--text-secondary); font-size: 0.75rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .session-table__cost { color: var(--accent-green); font-family: var(--font-mono); }
        .session-table__source { font-size: 0.7rem; color: var(--text-tertiary); text-transform: uppercase; }
        .session-table__time { font-size: 0.7rem; color: var(--text-tertiary); }

        .show-more {
            display: block; width: 100%; margin-top: 0.5rem;
            color: var(--accent-cyan); font-size: 0.75rem; font-weight: 600;
            text-transform: uppercase; letter-spacing: 0.05em;
        }

        @media (max-width: 767px) {
            .session-table__header, .session-table__row { grid-template-columns: 2fr 1fr 1fr; }
            .session-table__header span:nth-child(n+4), .session-table__row span:nth-child(n+4) { display: none; }
            .filter-row { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
            .filter-row::-webkit-scrollbar { display: none; }
            .filter-row mat-button-toggle-group { flex-shrink: 0; }
            .filter-row mat-button-toggle-group { --mat-button-toggle-label-text-size: 0.65rem; }
            .source-field { width: 120px; }
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

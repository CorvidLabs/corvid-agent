import { Component, ChangeDetectionStrategy, inject, OnInit, signal, computed } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { AgentService } from '../../core/services/agent.service';
import { SessionService } from '../../core/services/session.service';
import { PersonaService } from '../../core/services/persona.service';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import type { Agent } from '../../core/models/agent.model';
import { SkeletonComponent } from '../../shared/components/skeleton.component';

interface AgentCard {
    agent: Agent;
    sessionCount: number;
    runningSessions: number;
    totalCost: number;
    lastActive: string | null;
    hasPersona: boolean;
}

const PROVIDER_COLORS: Record<string, { color: string; border: string; bg: string }> = {
    anthropic: { color: '#d4a574', border: 'rgba(212, 165, 116, 0.4)', bg: 'rgba(212, 165, 116, 0.08)' },
    openai: { color: '#74d4a5', border: 'rgba(116, 212, 165, 0.4)', bg: 'rgba(116, 212, 165, 0.08)' },
    ollama: { color: '#a5a5ff', border: 'rgba(165, 165, 255, 0.4)', bg: 'rgba(165, 165, 255, 0.08)' },
};

const DEFAULT_PROVIDER_COLOR = { color: '#7a7d98', border: 'rgba(122, 125, 152, 0.4)', bg: 'rgba(122, 125, 152, 0.08)' };

/** 7 days in milliseconds — agents with no session activity within this window are considered inactive */
const INACTIVE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

@Component({
    selector: 'app-agent-list',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, FormsModule, DecimalPipe, RelativeTimePipe, EmptyStateComponent, SkeletonComponent],
    template: `
        <div class="page">
            <div class="page__header">
                <h2>Agents</h2>
                <a class="btn btn--primary" routerLink="/agents/new">+ New Agent</a>
            </div>

            <!-- Search Bar -->
            <div class="search-bar">
                <input
                    class="search-input"
                    placeholder="Search agents..."
                    [(ngModel)]="searchQuery"
                    (input)="searchQuery = $any($event.target).value" />
            </div>

            <!-- Filter Chips -->
            <div class="filters">
                <div class="filter-group">
                    <button
                        class="filter-chip"
                        [class.filter-chip--active]="filterAlgoChat() === null"
                        (click)="filterAlgoChat.set(null)">All</button>
                    <button
                        class="filter-chip"
                        [class.filter-chip--active]="filterAlgoChat() === true"
                        (click)="filterAlgoChat.set(true)">AlgoChat</button>
                    <button
                        class="filter-chip"
                        [class.filter-chip--active]="filterAlgoChat() === false"
                        (click)="filterAlgoChat.set(false)">No AlgoChat</button>
                </div>
                <div class="filter-group">
                    @for (mode of permissionModes; track mode) {
                        <button
                            class="filter-chip"
                            [class.filter-chip--active]="filterPermission() === mode"
                            (click)="filterPermission.set(filterPermission() === mode ? null : mode)">
                            {{ mode }}
                        </button>
                    }
                </div>
                <label class="toggle-label">
                    <input
                        type="checkbox"
                        class="toggle-input"
                        [checked]="hideInactive()"
                        (change)="hideInactive.set($any($event.target).checked)" />
                    <span class="toggle-text">Hide inactive</span>
                </label>
                <div class="sort-group">
                    <select class="sort-select" [(ngModel)]="sortBy" (ngModelChange)="sortBy = $event">
                        <option value="name">Sort: Name</option>
                        <option value="created">Sort: Created</option>
                        <option value="lastActive">Sort: Last Active</option>
                        <option value="sessions">Sort: Sessions</option>
                    </select>
                </div>
            </div>

            @if (agentService.loading()) {
                <app-skeleton variant="table" [count]="5" />
            } @else if (agentService.agents().length === 0) {
                <app-empty-state
                    icon="  [>_]  \n /|\\  \n / \\"
                    title="No agents yet."
                    description="Agents are AI assistants that write code, review PRs, and automate tasks."
                    actionLabel="+ Create your first agent"
                    actionRoute="/agents/new"
                    actionAriaLabel="Create your first agent configuration"
                    docsHint="Learn more: docs/quickstart.md" />
            } @else if (filteredAgents().length === 0) {
                <p class="empty">No agents match your filters.</p>
            } @else {
                <div class="agent-grid">
                    @for (card of filteredAgents(); track card.agent.id) {
                        <a class="agent-card" [routerLink]="['/agents', card.agent.id]">
                            <div class="agent-card__top">
                                <div class="agent-card__title-row">
                                    <span class="agent-card__name">{{ card.agent.name }}</span>
                                    @if (card.runningSessions > 0) {
                                        <span class="status-dot status-dot--active" title="Active sessions"></span>
                                    }
                                </div>
                                <div class="agent-card__badges">
                                    @if (card.agent.provider || card.agent.model) {
                                        <span
                                            class="badge badge--provider"
                                            [style.color]="getProviderColor(card.agent.provider).color"
                                            [style.border-color]="getProviderColor(card.agent.provider).border"
                                            [style.background]="getProviderColor(card.agent.provider).bg">
                                            {{ card.agent.provider || 'anthropic' }}{{ card.agent.model ? ' / ' + card.agent.model : '' }}
                                        </span>
                                    }
                                    @if (card.agent.algochatEnabled) {
                                        <span class="badge badge--algochat">AlgoChat</span>
                                    }
                                    @if (card.hasPersona) {
                                        <span class="badge badge--persona">Persona</span>
                                    }
                                </div>
                            </div>
                            @if (card.agent.description) {
                                <p class="agent-card__desc">{{ card.agent.description }}</p>
                            }
                            <div class="agent-card__stats">
                                <div class="agent-card__stat">
                                    <span class="agent-card__stat-value">{{ card.sessionCount }}</span>
                                    <span class="agent-card__stat-label">Sessions</span>
                                </div>
                                <div class="agent-card__stat">
                                    <span class="agent-card__stat-value agent-card__stat-value--cost">\${{ card.totalCost | number:'1.2-4' }}</span>
                                    <span class="agent-card__stat-label">Total Cost</span>
                                </div>
                                <div class="agent-card__stat">
                                    <span class="agent-card__stat-value--time">{{ card.lastActive | relativeTime }}</span>
                                    <span class="agent-card__stat-label">Last Active</span>
                                </div>
                            </div>
                            <div class="agent-card__footer">
                                <span class="agent-card__perm">{{ card.agent.permissionMode }}</span>
                                <button class="agent-card__start-btn" (click)="startSession(card.agent.id, $event)">Start Session</button>
                            </div>
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
        .btn {
            padding: 0.5rem 1rem; border-radius: var(--radius); text-decoration: none; font-size: 0.8rem; font-weight: 600;
            cursor: pointer; border: 1px solid; font-family: inherit; text-transform: uppercase; letter-spacing: 0.05em;
        }
        .btn--primary { background: transparent; color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .btn--primary:hover { background: var(--accent-cyan-dim); box-shadow: var(--glow-cyan); }
        .loading, .empty { color: var(--text-tertiary); font-size: 0.85rem; }

        /* Search */
        .search-bar { margin-bottom: 0.75rem; }
        .search-input {
            width: 100%; padding: 0.5rem 0.75rem; border: 1px solid var(--border-bright); border-radius: var(--radius);
            font-size: 0.85rem; font-family: inherit; background: var(--bg-input); color: var(--text-primary);
            box-sizing: border-box;
        }
        .search-input:focus { border-color: var(--accent-cyan); box-shadow: var(--glow-cyan); outline: none; }

        /* Filters */
        .filters { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; margin-bottom: 1.25rem; }
        .filter-group { display: flex; gap: 0.25rem; }
        .filter-chip {
            padding: 0.3rem 0.6rem; border: 1px solid var(--border); border-radius: var(--radius-sm);
            background: transparent; color: var(--text-secondary); font-size: 0.7rem; font-family: inherit;
            cursor: pointer; transition: all 0.15s; text-transform: capitalize;
        }
        .filter-chip:hover { border-color: var(--border-bright); color: var(--text-primary); }
        .filter-chip--active { background: var(--accent-cyan-dim); color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .sort-group { margin-left: auto; }
        .sort-select {
            padding: 0.3rem 0.5rem; border: 1px solid var(--border); border-radius: var(--radius-sm);
            background: var(--bg-input); color: var(--text-secondary); font-size: 0.7rem; font-family: inherit;
        }
        .sort-select:focus { border-color: var(--accent-cyan); outline: none; }

        /* Hide-inactive toggle */
        .toggle-label { display: flex; align-items: center; gap: 0.35rem; cursor: pointer; user-select: none; }
        .toggle-input { accent-color: var(--accent-cyan); cursor: pointer; }
        .toggle-text { font-size: 0.7rem; color: var(--text-secondary); }

        /* Agent Grid */
        .agent-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 0.75rem;
        }
        .agent-card {
            display: block; background: var(--bg-surface); border: 1px solid var(--border);
            border-radius: var(--radius-lg); padding: 1rem; text-decoration: none; color: inherit;
            transition: border-color 0.15s, box-shadow 0.15s; cursor: pointer;
        }
        .agent-card:hover { border-color: var(--accent-cyan); box-shadow: 0 0 12px rgba(0, 229, 255, 0.08); }
        .agent-card__top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.35rem; }
        .agent-card__title-row { display: flex; align-items: center; gap: 0.4rem; }
        .agent-card__name { font-weight: 700; font-size: 0.9rem; color: var(--text-primary); }
        .status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .status-dot--active { background: var(--accent-green); box-shadow: 0 0 6px rgba(0, 255, 136, 0.4); }
        .agent-card__badges { display: flex; gap: 0.25rem; flex-wrap: wrap; }
        .badge { font-size: 0.6rem; padding: 1px 6px; border-radius: var(--radius-sm); font-weight: 600; border: 1px solid; letter-spacing: 0.05em; text-transform: uppercase; }
        .badge--provider { font-family: var(--font-mono, monospace); }
        .badge--algochat { color: var(--accent-magenta); border-color: rgba(255, 0, 170, 0.3); }
        .badge--persona { color: var(--accent-amber, #ffc107); border-color: rgba(255, 193, 7, 0.3); }
        .agent-card__desc { margin: 0 0 0.5rem; font-size: 0.75rem; color: var(--text-secondary); line-height: 1.4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .agent-card__stats { display: flex; gap: 1rem; margin-bottom: 0.5rem; }
        .agent-card__stat { display: flex; flex-direction: column; gap: 0.1rem; }
        .agent-card__stat-value { font-size: 0.95rem; font-weight: 700; color: var(--accent-cyan); }
        .agent-card__stat-value--cost { color: var(--accent-green); font-size: 0.85rem; }
        .agent-card__stat-value--time { font-size: 0.75rem; color: var(--text-secondary); }
        .agent-card__stat-label { font-size: 0.55rem; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.06em; }
        .agent-card__footer { display: flex; justify-content: space-between; align-items: center; padding-top: 0.4rem; border-top: 1px solid var(--border); }
        .agent-card__perm { font-size: 0.65rem; color: var(--text-tertiary); text-transform: capitalize; }
        .agent-card__start-btn {
            padding: 0.25rem 0.6rem; font-size: 0.6rem; font-weight: 600; font-family: inherit;
            text-transform: uppercase; letter-spacing: 0.05em; cursor: pointer;
            background: transparent; border: 1px solid var(--accent-cyan); border-radius: var(--radius-sm);
            color: var(--accent-cyan); transition: all 0.15s;
        }
        .agent-card__start-btn:hover { background: var(--accent-cyan-dim); box-shadow: var(--glow-cyan); }

        @media (max-width: 768px) {
            .agent-grid { grid-template-columns: 1fr; }
            .filters { flex-direction: column; align-items: stretch; }
            .sort-group { margin-left: 0; }
        }
    `,
})
export class AgentListComponent implements OnInit {
    protected readonly agentService = inject(AgentService);
    private readonly sessionService = inject(SessionService);
    private readonly personaService = inject(PersonaService);
    private readonly router = inject(Router);

    protected searchQuery = '';
    protected sortBy: 'name' | 'created' | 'lastActive' | 'sessions' = 'name';
    protected readonly filterAlgoChat = signal<boolean | null>(null);
    protected readonly filterPermission = signal<string | null>(null);
    protected readonly hideInactive = signal(true);
    protected readonly agentCards = signal<AgentCard[]>([]);
    protected readonly permissionModes = ['default', 'plan', 'auto-edit', 'full-auto'];

    protected readonly filteredAgents = computed(() => {
        let cards = this.agentCards();
        const query = this.searchQuery.toLowerCase();
        const algochatFilter = this.filterAlgoChat();
        const permFilter = this.filterPermission();
        const shouldHideInactive = this.hideInactive();

        if (query) {
            cards = cards.filter((c) =>
                c.agent.name.toLowerCase().includes(query) ||
                c.agent.description.toLowerCase().includes(query),
            );
        }
        if (algochatFilter !== null) {
            cards = cards.filter((c) => c.agent.algochatEnabled === algochatFilter);
        }
        if (permFilter) {
            cards = cards.filter((c) => c.agent.permissionMode === permFilter);
        }
        if (shouldHideInactive) {
            const cutoff = Date.now() - INACTIVE_THRESHOLD_MS;
            cards = cards.filter((c) =>
                c.runningSessions > 0 ||
                (c.lastActive && new Date(c.lastActive).getTime() > cutoff) ||
                new Date(c.agent.createdAt).getTime() > cutoff,
            );
        }

        const sorted = [...cards];
        switch (this.sortBy) {
            case 'name':
                sorted.sort((a, b) => a.agent.name.localeCompare(b.agent.name));
                break;
            case 'created':
                sorted.sort((a, b) => new Date(b.agent.createdAt).getTime() - new Date(a.agent.createdAt).getTime());
                break;
            case 'lastActive':
                sorted.sort((a, b) => {
                    const aTime = a.lastActive ? new Date(a.lastActive).getTime() : 0;
                    const bTime = b.lastActive ? new Date(b.lastActive).getTime() : 0;
                    return bTime - aTime;
                });
                break;
            case 'sessions':
                sorted.sort((a, b) => b.sessionCount - a.sessionCount);
                break;
        }
        return sorted;
    });

    async ngOnInit(): Promise<void> {
        await Promise.all([
            this.agentService.loadAgents(),
            this.sessionService.loadSessions(),
        ]);
        await this.buildCards();
    }

    protected getProviderColor(provider?: string): { color: string; border: string; bg: string } {
        return PROVIDER_COLORS[provider ?? 'anthropic'] ?? DEFAULT_PROVIDER_COLOR;
    }

    protected startSession(agentId: string, event: Event): void {
        event.preventDefault();
        event.stopPropagation();
        this.router.navigate(['/sessions/new'], { queryParams: { agentId } });
    }

    private async buildCards(): Promise<void> {
        const agents = this.agentService.agents();
        const sessions = this.sessionService.sessions();

        const personaChecks = await Promise.all(
            agents.map((a) => this.personaService.checkPersonaExists(a.id)),
        );

        const cards: AgentCard[] = agents.map((agent, i) => {
            const agentSessions = sessions.filter((s) => s.agentId === agent.id);
            const runningSessions = agentSessions.filter((s) => s.status === 'running').length;
            const totalCost = agentSessions.reduce((sum, s) => sum + s.totalCostUsd, 0);
            const lastSession = agentSessions.sort(
                (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
            )[0];

            return {
                agent,
                sessionCount: agentSessions.length,
                runningSessions,
                totalCost,
                lastActive: lastSession?.updatedAt ?? null,
                hasPersona: personaChecks[i],
            };
        });

        this.agentCards.set(cards);
    }
}

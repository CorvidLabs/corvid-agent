import { Component, ChangeDetectionStrategy, inject, OnInit, signal, computed } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DecimalPipe, UpperCasePipe } from '@angular/common';
import { AgentService } from '../../core/services/agent.service';
import { SessionService } from '../../core/services/session.service';
import { PersonaService } from '../../core/services/persona.service';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import { AbsoluteTimePipe } from '../../shared/pipes/absolute-time.pipe';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { PageShellComponent } from '../../shared/components/page-shell.component';
import type { Agent } from '../../core/models/agent.model';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatIconModule } from '@angular/material/icon';

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

/** Map raw model IDs to short friendly names */
import { friendlyModelName } from '../../shared/format-model';

/** 7 days in milliseconds — agents with no session activity within this window are considered inactive */
const INACTIVE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

@Component({
    selector: 'app-agent-list',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, FormsModule, DecimalPipe, UpperCasePipe, RelativeTimePipe, AbsoluteTimePipe, EmptyStateComponent, SkeletonComponent, PageShellComponent, MatButtonModule, MatButtonToggleModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatSlideToggleModule, MatIconModule],
    template: `
        <app-page-shell
            title="Agents"
            icon="agents"
            [breadcrumbs]="[]">
            <a actions mat-flat-button color="primary" routerLink="/agents/new">+ New Agent</a>

            <!-- Search + Filters (sticky) -->
            <div toolbar class="sticky-toolbar">
            <mat-form-field class="search-field" appearance="outline" subscriptSizing="dynamic">
                <mat-icon matPrefix>search</mat-icon>
                <input matInput
                    placeholder="Search agents..."
                    [(ngModel)]="searchQuery"
                    (input)="searchQuery = $any($event.target).value" />
            </mat-form-field>

            <!-- Filter Controls -->
            <div class="filters">
                <mat-button-toggle-group [value]="filterAlgoChat()" (change)="filterAlgoChat.set($event.value)" hideSingleSelectionIndicator>
                    <mat-button-toggle [value]="null">All</mat-button-toggle>
                    <mat-button-toggle [value]="true">AlgoChat</mat-button-toggle>
                    <mat-button-toggle [value]="false">No AlgoChat</mat-button-toggle>
                </mat-button-toggle-group>
                <mat-button-toggle-group [value]="filterPermission()" (change)="filterPermission.set($event.value === filterPermission() ? null : $event.value)" hideSingleSelectionIndicator>
                    @for (mode of permissionModes; track mode) {
                        <mat-button-toggle [value]="mode">{{ mode }}</mat-button-toggle>
                    }
                </mat-button-toggle-group>
                <mat-slide-toggle
                    [checked]="hideInactive()"
                    (change)="hideInactive.set($event.checked)"
                    labelPosition="after">
                    Hide inactive
                </mat-slide-toggle>
                <mat-form-field class="sort-field" appearance="outline" subscriptSizing="dynamic">
                    <mat-select [(ngModel)]="sortBy" (ngModelChange)="sortBy = $event">
                        <mat-option value="name">Sort: Name</mat-option>
                        <mat-option value="created">Sort: Created</mat-option>
                        <mat-option value="lastActive">Sort: Last Active</mat-option>
                        <mat-option value="sessions">Sort: Sessions</mat-option>
                    </mat-select>
                </mat-form-field>
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
                <div class="agent-grid stagger-children">
                    @for (card of filteredAgents(); track card.agent.id) {
                        <a class="agent-card" [routerLink]="['/agents', card.agent.id]"
                           [style.--agent-accent]="card.agent.displayColor || ''">
                            <div class="agent-card__top">
                                <div class="agent-card__title-row">
                                    <span class="agent-card__health-dot" [attr.data-health]="getHealthLevel(card)" aria-hidden="true"></span>
                                    @if (card.agent.avatarUrl && !avatarErrors().has(card.agent.id)) {
                                        <img class="agent-card__avatar" [src]="card.agent.avatarUrl"
                                             [alt]="card.agent.name + ' avatar'" (error)="onAvatarError(card.agent.id)" />
                                    } @else if (card.agent.displayIcon) {
                                        <span class="agent-card__icon">{{ card.agent.displayIcon }}</span>
                                    } @else {
                                        <span class="agent-card__icon agent-card__icon--fallback" aria-hidden="true">[&gt;_]</span>
                                    }
                                    <span class="agent-card__name"
                                          [style.color]="card.agent.displayColor || ''">{{ card.agent.name }}</span>
                                    @if (card.runningSessions > 0) {
                                        <span class="status-indicator status-indicator--active" title="Active sessions">
                                            <span class="status-dot status-dot--active" aria-hidden="true"></span>
                                            <span class="status-indicator__label">Active</span>
                                        </span>
                                    }
                                </div>
                                <div class="agent-card__badges">
                                    @if (card.agent.provider) {
                                        <span
                                            class="badge badge--provider"
                                            [style.color]="getProviderColor(card.agent.provider).color"
                                            [style.border-color]="getProviderColor(card.agent.provider).border"
                                            [style.background]="getProviderColor(card.agent.provider).bg">
                                            {{ (card.agent.provider || 'anthropic') | uppercase }}
                                        </span>
                                    }
                                    @if (card.agent.model) {
                                        <span class="badge badge--model">{{ getFriendlyModel(card.agent.model) }}</span>
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
                                    <span class="agent-card__stat-value--time" [title]="card.lastActive | absoluteTime">{{ card.lastActive | relativeTime }}</span>
                                    <span class="agent-card__stat-label">Last Active</span>
                                </div>
                            </div>
                            <div class="agent-card__footer">
                                <span class="agent-card__perm">{{ card.agent.permissionMode }}</span>
                                <button mat-stroked-button class="agent-card__start-btn" (click)="startSession(card.agent.id, $event)">Start Session</button>
                            </div>
                        </a>
                    }
                </div>
            }
        </app-page-shell>
    `,
    styles: `
        .loading, .empty { color: var(--text-tertiary); font-size: var(--text-sm); }

        /* Search */
        .search-field { width: 100%; margin-bottom: 0.5rem; }
        .search-field .mat-mdc-form-field-icon-prefix { padding-right: 0.5rem; color: var(--text-tertiary); }

        /* Filters */
        .filters { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; margin-bottom: 1.25rem; }
        .filters mat-button-toggle-group { text-transform: capitalize; }
        .sort-field { width: 160px; flex-shrink: 0; margin-left: auto; }
        .sort-field { --mat-select-trigger-text-size: 0.75rem; }

        /* Agent Grid — fluid + container-query aware */
        :host { container-type: inline-size; }
        .agent-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
            gap: clamp(0.85rem, 1vw, 1.5rem);
        }
        @container (max-width: 640px) {
            .agent-grid { grid-template-columns: 1fr; }
        }
        @container (min-width: 641px) and (max-width: 960px) {
            .agent-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @container (min-width: 1400px) {
            .agent-grid { grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); }
        }
        .agent-card {
            display: block;
            background: rgba(15, 16, 24, 0.6);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            border: 1px solid rgba(255, 255, 255, 0.05);
            border-radius: var(--radius-xl);
            padding: clamp(1.1rem, 1.5vw, 1.75rem);
            text-decoration: none;
            color: inherit;
            overflow: hidden;
            transition: border-color 0.25s, box-shadow 0.25s, transform 0.2s, background 0.25s;
            cursor: pointer;
            position: relative;
        }
        .agent-card::before {
            content: '';
            position: absolute;
            inset: 0;
            border-radius: inherit;
            padding: 1px;
            background: linear-gradient(135deg, var(--accent-cyan-glow), var(--accent-magenta-dim), var(--accent-green-tint));
            -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
            -webkit-mask-composite: xor;
            mask-composite: exclude;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.3s;
        }
        .agent-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), 0 0 20px var(--accent-cyan-subtle);
            background: rgba(15, 16, 24, 0.75);
        }
        .agent-card:hover::before { opacity: 1; }
        .agent-card__avatar { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; border: 1px solid var(--border-bright); flex-shrink: 0; }
        .agent-card__icon { font-size: 1.2rem; line-height: 1; flex-shrink: 0; }
        .agent-card__icon--fallback { font-size: 0.65rem; font-family: var(--font-mono); color: var(--text-tertiary); background: var(--bg-input); border: 1px solid var(--border); border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; }
        .agent-card__top { display: flex; flex-direction: column; margin-bottom: 0.35rem; gap: 0.35rem; min-width: 0; }
        .agent-card__title-row { display: flex; align-items: center; gap: 0.4rem; min-width: 0; }
        .agent-card__health-dot {
            width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
        }
        .agent-card__health-dot[data-health="green"] { background: var(--accent-green); box-shadow: 0 0 6px var(--accent-green-glow); }
        .agent-card__health-dot[data-health="yellow"] { background: var(--accent-amber); box-shadow: 0 0 6px var(--accent-amber-glow); }
        .agent-card__health-dot[data-health="red"] { background: var(--accent-red); box-shadow: 0 0 6px var(--accent-red-glow); opacity: .6; }
        .agent-card__name { font-weight: 700; font-size: var(--text-base); color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .status-indicator { display: flex; align-items: center; gap: 0.25rem; }
        .status-indicator__label { font-size: var(--text-micro); font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; }
        .status-indicator--active .status-indicator__label { color: var(--accent-green); }
        .status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .status-dot--active { background: var(--accent-green); box-shadow: 0 0 6px var(--accent-green-glow); }
        .agent-card__badges { display: flex; gap: 0.25rem; flex-wrap: wrap; min-width: 0; flex-shrink: 1; }
        .badge { font-size: var(--text-micro); padding: 3px 10px; border-radius: var(--radius-sm); font-weight: 600; border: 1px solid; letter-spacing: 0.05em; text-transform: uppercase; white-space: nowrap; }
        .badge--provider { font-family: var(--font-mono); }
        .badge--model { color: var(--text-secondary); border-color: rgba(255, 255, 255, 0.12); background: rgba(255, 255, 255, 0.04); }
        .badge--algochat { color: var(--accent-magenta); border-color: var(--accent-magenta-glow); background: rgba(255, 0, 200, 0.06); }
        .badge--persona { color: var(--accent-amber); border-color: var(--accent-amber-glow); background: rgba(255, 180, 0, 0.06); }
        .agent-card__desc { margin: 0 0 0.5rem; font-size: var(--text-sm); color: var(--text-secondary); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .agent-card__stats { display: flex; gap: 0.75rem; margin-bottom: 0.5rem; flex-wrap: wrap; }
        .agent-card__stat { display: flex; flex-direction: column; gap: 0.1rem; }
        .agent-card__stat-value { font-size: var(--text-base); font-weight: 700; color: var(--accent-cyan); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .agent-card__stat-value--cost { color: var(--accent-green); font-size: var(--text-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .agent-card__stat-value--time { font-size: var(--text-xs); color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .agent-card__stat-label { font-size: var(--text-micro); color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.06em; }
        .agent-card__footer { display: flex; justify-content: space-between; align-items: center; padding-top: 0.4rem; border-top: 1px solid var(--border); }
        .agent-card__perm { font-size: var(--text-xxs); color: var(--text-tertiary); text-transform: capitalize; }
        .agent-card__start-btn { font-size: var(--text-xxs); text-transform: uppercase; letter-spacing: 0.05em; }

        @media (max-width: 767px) {
            .agent-grid { grid-template-columns: 1fr; }
            .filters { flex-direction: column; align-items: stretch; }
            .sort-group { margin-left: 0; }
            .page__header { flex-direction: column; align-items: flex-start; gap: 0.75rem; }
        }
        @media (max-width: 480px) {
            .page { padding: var(--space-4); }
            .filter-group { flex-wrap: wrap; }
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
    protected readonly avatarErrors = signal<Set<string>>(new Set());
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

    protected getFriendlyModel(model?: string): string {
        return friendlyModelName(model);
    }

    protected onAvatarError(agentId: string): void {
        const errors = new Set(this.avatarErrors());
        errors.add(agentId);
        this.avatarErrors.set(errors);
    }

    /** Health level based on activity recency */
    protected getHealthLevel(card: AgentCard): string {
        if (card.runningSessions > 0) return 'green';
        if (!card.lastActive) return 'red';
        const hoursAgo = (Date.now() - new Date(card.lastActive).getTime()) / (1000 * 60 * 60);
        if (hoursAgo < 24) return 'yellow';
        return 'red';
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

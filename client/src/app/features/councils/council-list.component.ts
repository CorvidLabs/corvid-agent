import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CouncilService } from '../../core/services/council.service';
import { AgentService } from '../../core/services/agent.service';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';

@Component({
    selector: 'app-council-list',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, RelativeTimePipe],
    template: `
        <div class="page">
            <div class="page__header">
                <h2>Councils</h2>
                <a class="btn btn--primary" routerLink="/councils/new">New Council</a>
            </div>

            @if (councilService.loading()) {
                <p>Loading...</p>
            } @else if (councilService.councils().length === 0) {
                <p class="empty">No councils configured. Create one to run multi-agent deliberations.</p>
            } @else {
                <div class="list" role="list">
                    @for (council of councilService.councils(); track council.id) {
                        <a
                            class="list__item"
                            role="listitem"
                            [routerLink]="['/councils', council.id]">
                            <div class="list__item-main">
                                <h3 class="list__item-title">
                                    {{ council.name }}
                                    @if (council.chairmanAgentId) {
                                        <span class="badge badge--chairman">Chairman</span>
                                    }
                                </h3>
                                <p class="list__item-desc">{{ council.description }}</p>
                            </div>
                            <div class="list__item-meta">
                                <span>{{ council.agentIds.length }} agent{{ council.agentIds.length !== 1 ? 's' : '' }}</span>
                                <span>{{ council.updatedAt | relativeTime }}</span>
                            </div>
                        </a>
                    }
                </div>
            }
        </div>
    `,
    styles: `
        .page { padding: 1.5rem; }
        .page__header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; }
        .page__header h2 { margin: 0; color: var(--text-primary); }
        .btn {
            padding: 0.5rem 1rem; border-radius: var(--radius); text-decoration: none; font-size: 0.8rem; font-weight: 600;
            cursor: pointer; border: 1px solid; font-family: inherit; text-transform: uppercase; letter-spacing: 0.05em;
            transition: background 0.15s, box-shadow 0.15s;
        }
        .btn--primary { background: transparent; color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .btn--primary:hover { background: var(--accent-cyan-dim); box-shadow: var(--glow-cyan); }
        .empty { color: var(--text-tertiary); }
        .list { display: flex; flex-direction: column; gap: 0.5rem; }
        .list__item {
            display: flex; justify-content: space-between; align-items: center;
            padding: 1rem; background: var(--bg-surface); border: 1px solid var(--border);
            border-radius: var(--radius-lg); text-decoration: none; color: inherit;
            transition: border-color 0.2s, box-shadow 0.2s;
        }
        .list__item:hover { border-color: var(--accent-magenta); box-shadow: 0 0 12px rgba(255, 0, 170, 0.08); }
        .list__item-title { margin: 0 0 0.25rem; font-size: 0.95rem; display: flex; align-items: center; gap: 0.5rem; color: var(--text-primary); }
        .list__item-desc { margin: 0; color: var(--text-secondary); font-size: 0.8rem; }
        .list__item-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 0.25rem; font-size: 0.75rem; color: var(--text-tertiary); }
        .badge { font-size: 0.65rem; padding: 1px 6px; border-radius: var(--radius-sm); font-weight: 600; border: 1px solid; letter-spacing: 0.05em; }
        .badge--chairman { background: rgba(245, 166, 35, 0.1); color: #f5a623; border-color: rgba(245, 166, 35, 0.3); }
    `,
})
export class CouncilListComponent implements OnInit {
    protected readonly councilService = inject(CouncilService);
    private readonly agentService = inject(AgentService);

    ngOnInit(): void {
        this.councilService.loadCouncils();
        this.agentService.loadAgents();
    }
}

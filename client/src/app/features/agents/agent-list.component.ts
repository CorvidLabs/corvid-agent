import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AgentService } from '../../core/services/agent.service';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';

@Component({
    selector: 'app-agent-list',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, RelativeTimePipe],
    template: `
        <div class="page">
            <div class="page__header">
                <h2>Agents</h2>
                <a class="btn btn--primary" routerLink="/agents/new">New Agent</a>
            </div>

            @if (agentService.loading()) {
                <p>Loading...</p>
            } @else if (agentService.agents().length === 0) {
                <p class="empty">No agents configured. Create one to define how Claude behaves.</p>
            } @else {
                <div class="list" role="list">
                    @for (agent of agentService.agents(); track agent.id) {
                        <a
                            class="list__item"
                            role="listitem"
                            [routerLink]="['/agents', agent.id]">
                            <div class="list__item-main">
                                <h3 class="list__item-title">
                                    {{ agent.name }}
                                    @if (agent.algochatEnabled) {
                                        <span class="badge badge--algochat">AlgoChat</span>
                                    }
                                </h3>
                                <p class="list__item-desc">{{ agent.description }}</p>
                            </div>
                            <div class="list__item-meta">
                                <span>{{ agent.model || 'default model' }}</span>
                                <span>{{ agent.permissionMode }}</span>
                                <span>{{ agent.updatedAt | relativeTime }}</span>
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
        .badge--algochat { background: var(--accent-magenta-dim); color: var(--accent-magenta); border-color: rgba(255, 0, 170, 0.3); }
    `,
})
export class AgentListComponent implements OnInit {
    protected readonly agentService = inject(AgentService);

    ngOnInit(): void {
        this.agentService.loadAgents();
    }
}

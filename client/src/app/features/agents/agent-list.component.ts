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
        .page__header h2 { margin: 0; }
        .btn { padding: 0.5rem 1rem; border-radius: 6px; text-decoration: none; font-size: 0.85rem; font-weight: 600; cursor: pointer; border: none; }
        .btn--primary { background: #3b82f6; color: #fff; }
        .empty { color: #64748b; }
        .list { display: flex; flex-direction: column; gap: 0.5rem; }
        .list__item {
            display: flex; justify-content: space-between; align-items: center;
            padding: 1rem; background: #fff; border: 1px solid #e2e8f0;
            border-radius: 8px; text-decoration: none; color: inherit;
            transition: border-color 0.15s;
        }
        .list__item:hover { border-color: #3b82f6; }
        .list__item-title { margin: 0 0 0.25rem; font-size: 1rem; display: flex; align-items: center; gap: 0.5rem; }
        .list__item-desc { margin: 0; color: #64748b; font-size: 0.85rem; }
        .list__item-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 0.25rem; font-size: 0.8rem; color: #94a3b8; }
        .badge { font-size: 0.7rem; padding: 1px 6px; border-radius: 3px; font-weight: 600; }
        .badge--algochat { background: #dbeafe; color: #1d4ed8; }
    `,
})
export class AgentListComponent implements OnInit {
    protected readonly agentService = inject(AgentService);

    ngOnInit(): void {
        this.agentService.loadAgents();
    }
}

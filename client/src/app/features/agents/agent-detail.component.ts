import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { AgentService } from '../../core/services/agent.service';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import type { Agent } from '../../core/models/agent.model';

@Component({
    selector: 'app-agent-detail',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, RelativeTimePipe, DecimalPipe],
    template: `
        @if (agent(); as a) {
            <div class="page">
                <div class="page__header">
                    <div>
                        <h2>{{ a.name }}</h2>
                        <p class="page__desc">{{ a.description }}</p>
                    </div>
                    <div class="page__actions">
                        <a class="btn btn--secondary" [routerLink]="['/agents', a.id, 'edit']">Edit</a>
                        <button class="btn btn--danger" (click)="onDelete()">Delete</button>
                    </div>
                </div>

                <div class="detail__info">
                    <dl>
                        <dt>Model</dt>
                        <dd>{{ a.model || 'default' }}</dd>
                        <dt>Permission Mode</dt>
                        <dd>{{ a.permissionMode }}</dd>
                        @if (a.maxBudgetUsd !== null) {
                            <dt>Max Budget</dt>
                            <dd>{{ a.maxBudgetUsd | number:'1.2-2' }} USD</dd>
                        }
                        <dt>AlgoChat</dt>
                        <dd>{{ a.algochatEnabled ? 'Enabled' : 'Disabled' }}{{ a.algochatAuto ? ' (Auto)' : '' }}</dd>
                        <dt>Created</dt>
                        <dd>{{ a.createdAt | relativeTime }}</dd>
                    </dl>
                </div>

                @if (a.systemPrompt) {
                    <div class="detail__section">
                        <h3>System Prompt</h3>
                        <pre class="detail__code">{{ a.systemPrompt }}</pre>
                    </div>
                }

                @if (a.allowedTools) {
                    <div class="detail__section">
                        <h3>Allowed Tools</h3>
                        <p>{{ a.allowedTools }}</p>
                    </div>
                }
            </div>
        } @else {
            <div class="page"><p>Loading...</p></div>
        }
    `,
    styles: `
        .page { padding: 1.5rem; }
        .page__header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; }
        .page__header h2 { margin: 0; }
        .page__desc { margin: 0.25rem 0 0; color: #64748b; }
        .page__actions { display: flex; gap: 0.5rem; }
        .btn { padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.85rem; font-weight: 600; cursor: pointer; border: none; text-decoration: none; }
        .btn--secondary { background: #e2e8f0; color: #475569; }
        .btn--danger { background: #ef4444; color: #fff; }
        .detail__info dl { display: grid; grid-template-columns: auto 1fr; gap: 0.25rem 1rem; }
        .detail__info dt { font-weight: 600; color: #475569; font-size: 0.85rem; }
        .detail__info dd { margin: 0; }
        .detail__section { margin-top: 2rem; }
        .detail__section h3 { margin: 0 0 0.75rem; }
        .detail__code { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 1rem; font-size: 0.8rem; white-space: pre-wrap; overflow-x: auto; }
    `,
})
export class AgentDetailComponent implements OnInit {
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly agentService = inject(AgentService);

    protected readonly agent = signal<Agent | null>(null);

    async ngOnInit(): Promise<void> {
        const id = this.route.snapshot.paramMap.get('id');
        if (!id) return;

        const agent = await this.agentService.getAgent(id);
        this.agent.set(agent);
    }

    async onDelete(): Promise<void> {
        const a = this.agent();
        if (!a) return;
        await this.agentService.deleteAgent(a.id);
        this.router.navigate(['/agents']);
    }
}

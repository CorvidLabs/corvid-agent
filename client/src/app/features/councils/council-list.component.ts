import { Component, ChangeDetectionStrategy, inject, OnInit, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CouncilService } from '../../core/services/council.service';
import { AgentService } from '../../core/services/agent.service';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import type { Council, CouncilLaunch } from '../../core/models/council.model';

interface CouncilCard {
    council: Council;
    memberNames: string[];
    chairmanName: string | null;
    lastLaunch: CouncilLaunch | null;
}

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
                <p class="loading">Loading...</p>
            } @else if (councilService.councils().length === 0) {
                <p class="empty">No councils configured. Create one to run multi-agent deliberations.</p>
            } @else {
                <div class="council-grid">
                    @for (card of cards(); track card.council.id) {
                        <a class="council-card" [routerLink]="['/councils', card.council.id]">
                            <div class="council-card__top">
                                <h3 class="council-card__name">{{ card.council.name }}</h3>
                                @if (card.lastLaunch) {
                                    <span class="stage-badge" [attr.data-stage]="card.lastLaunch.stage">{{ card.lastLaunch.stage }}</span>
                                }
                            </div>
                            @if (card.council.description) {
                                <p class="council-card__desc">{{ card.council.description }}</p>
                            }
                            <div class="council-card__members">
                                @for (name of card.memberNames; track name) {
                                    <span class="member-chip" [class.member-chip--chairman]="name === card.chairmanName">{{ name }}</span>
                                }
                            </div>
                            <div class="council-card__footer">
                                <span class="council-card__rounds">{{ card.council.discussionRounds }} round{{ card.council.discussionRounds !== 1 ? 's' : '' }}</span>
                                @if (card.lastLaunch) {
                                    <span class="council-card__last-launch">Last: {{ card.lastLaunch.createdAt | relativeTime }}</span>
                                } @else {
                                    <span class="council-card__last-launch">Never launched</span>
                                }
                                <span class="council-card__time">{{ card.council.updatedAt | relativeTime }}</span>
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
        .loading, .empty { color: var(--text-tertiary); font-size: 0.85rem; }

        .council-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 0.75rem; }
        .council-card {
            display: block; background: var(--bg-surface); border: 1px solid var(--border);
            border-radius: var(--radius-lg); padding: 1rem; text-decoration: none; color: inherit;
            transition: border-color 0.15s, box-shadow 0.15s; cursor: pointer;
        }
        .council-card:hover { border-color: var(--accent-magenta); box-shadow: 0 0 12px rgba(255, 0, 170, 0.08); }
        .council-card__top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.35rem; }
        .council-card__name { margin: 0; font-size: 0.95rem; font-weight: 700; color: var(--text-primary); }
        .council-card__desc { margin: 0 0 0.5rem; font-size: 0.75rem; color: var(--text-secondary); line-height: 1.4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        .stage-badge {
            font-size: 0.6rem; padding: 2px 8px; border-radius: var(--radius-sm); font-weight: 600;
            text-transform: uppercase; letter-spacing: 0.05em; border: 1px solid;
        }
        .stage-badge[data-stage="responding"] { color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .stage-badge[data-stage="discussing"] { color: #a78bfa; border-color: #a78bfa; }
        .stage-badge[data-stage="reviewing"] { color: var(--accent-magenta); border-color: var(--accent-magenta); }
        .stage-badge[data-stage="synthesizing"] { color: #f5a623; border-color: #f5a623; }
        .stage-badge[data-stage="complete"] { color: var(--accent-green); border-color: var(--accent-green); }

        .council-card__members { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-bottom: 0.5rem; }
        .member-chip {
            font-size: 0.65rem; padding: 2px 6px; border-radius: var(--radius-sm);
            background: var(--bg-raised); border: 1px solid var(--border); color: var(--text-secondary);
        }
        .member-chip--chairman { color: #f5a623; border-color: rgba(245, 166, 35, 0.3); background: rgba(245, 166, 35, 0.08); }

        .council-card__footer {
            display: flex; gap: 0.75rem; padding-top: 0.4rem; border-top: 1px solid var(--border);
            font-size: 0.65rem; color: var(--text-tertiary);
        }
        .council-card__time { margin-left: auto; }

        @media (max-width: 768px) { .council-grid { grid-template-columns: 1fr; } }
    `,
})
export class CouncilListComponent implements OnInit {
    protected readonly councilService = inject(CouncilService);
    private readonly agentService = inject(AgentService);

    private readonly lastLaunches = signal<Record<string, CouncilLaunch | null>>({});

    protected readonly cards = computed<CouncilCard[]>(() => {
        const councils = this.councilService.councils();
        const agents = this.agentService.agents();
        const launches = this.lastLaunches();

        const agentMap: Record<string, string> = {};
        for (const a of agents) {
            agentMap[a.id] = a.name;
        }

        return councils.map((council) => ({
            council,
            memberNames: council.agentIds.map((id) => agentMap[id] ?? id.slice(0, 8)),
            chairmanName: council.chairmanAgentId ? (agentMap[council.chairmanAgentId] ?? null) : null,
            lastLaunch: launches[council.id] ?? null,
        }));
    });

    async ngOnInit(): Promise<void> {
        await Promise.all([
            this.councilService.loadCouncils(),
            this.agentService.loadAgents(),
        ]);
        this.loadLastLaunches();
    }

    private async loadLastLaunches(): Promise<void> {
        const councils = this.councilService.councils();
        const launchResults = await Promise.all(
            councils.map((c) =>
                this.councilService.getCouncilLaunches(c.id).catch(() => [] as CouncilLaunch[]),
            ),
        );
        const map: Record<string, CouncilLaunch | null> = {};
        councils.forEach((council, i) => {
            const sorted = [...launchResults[i]].sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
            );
            map[council.id] = sorted[0] ?? null;
        });
        this.lastLaunches.set(map);
    }
}

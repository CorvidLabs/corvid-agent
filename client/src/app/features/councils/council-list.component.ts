import { Component, ChangeDetectionStrategy, inject, OnInit, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CouncilService } from '../../core/services/council.service';
import { AgentService } from '../../core/services/agent.service';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';
import type { Council, CouncilLaunch } from '../../core/models/council.model';

/** Pattern matching test/E2E council names */
const TEST_COUNCIL_RE = /^(test|e2e|my test|lorem|sample|dummy|temp)\b/i;

interface CouncilCard {
    council: Council;
    memberCount: number;
    memberNames: string[];
    chairmanName: string | null;
    lastLaunch: CouncilLaunch | null;
    synthesisSummary: string | null;
}

@Component({
    selector: 'app-council-list',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, RelativeTimePipe, EmptyStateComponent, SkeletonComponent, TooltipDirective],
    template: `
        <div class="page">
            <div class="page__header">
                <h2>Councils</h2>
                <div class="page__actions">
                    @if (hasTestCouncils()) {
                        <button
                            class="btn btn--ghost"
                            (click)="toggleTestFilter()"
                            [attr.aria-pressed]="hideTestData()"
                        >
                            {{ hideTestData() ? 'Show all' : 'Hide test data' }}
                        </button>
                    }
                    <a class="btn btn--primary" routerLink="/councils/new">New Council</a>
                </div>
            </div>

            @if (councilService.loading()) {
                <app-skeleton variant="table" [count]="5" />
            } @else if (councilService.councils().length === 0) {
                <app-empty-state
                    icon=" [o] [o] [o]\n  \  |  /\n   \_|_/\n    |=|"
                    title="No councils yet."
                    description="Councils run multi-agent deliberations — each member responds, discusses, and a chairman synthesizes the outcome."
                    actionLabel="+ Create a council"
                    actionRoute="/councils/new"
                    actionAriaLabel="Create your first multi-agent council" />
            } @else if (filteredCards().length === 0) {
                <p class="empty-filtered">All councils are hidden by the test-data filter.
                    <button class="link-btn" (click)="toggleTestFilter()">Show all</button>
                </p>
            } @else {
                <div class="council-grid">
                    @for (card of filteredCards(); track card.council.id) {
                        <a class="council-card" [routerLink]="['/councils', card.council.id]">
                            <div class="council-card__top">
                                <h3 class="council-card__name">{{ card.council.name }}</h3>
                                @if (card.lastLaunch) {
                                    <span class="stage-badge" [attr.data-stage]="card.lastLaunch.stage">{{ card.lastLaunch.stage }}</span>
                                } @else {
                                    <span class="stage-badge" data-stage="idle">idle</span>
                                }
                            </div>
                            @if (card.council.description) {
                                <p class="council-card__desc" appTooltip>{{ card.council.description }}</p>
                            }
                            @if (card.synthesisSummary) {
                                <p class="council-card__synthesis">{{ card.synthesisSummary }}</p>
                            }
                            <div class="council-card__meta">
                                <span class="meta-item" title="Participants">
                                    <span class="meta-icon" aria-hidden="true">&#x1D5D4;</span>
                                    {{ card.memberCount }}
                                </span>
                                <span class="meta-item" title="Discussion rounds">
                                    <span class="meta-icon" aria-hidden="true">&#x21BB;</span>
                                    {{ card.council.discussionRounds }}
                                </span>
                                @if (card.chairmanName) {
                                    <span class="meta-item meta-item--chairman" title="Chairman">
                                        {{ card.chairmanName }}
                                    </span>
                                }
                            </div>
                            <div class="council-card__members">
                                @for (name of card.memberNames; track name) {
                                    <span class="member-chip" [class.member-chip--chairman]="name === card.chairmanName">{{ name }}</span>
                                }
                            </div>
                            <div class="council-card__footer">
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
        .page__actions { display: flex; gap: 0.5rem; align-items: center; }
        .btn {
            padding: 0.5rem 1rem; border-radius: var(--radius); text-decoration: none; font-size: 0.8rem; font-weight: 600;
            cursor: pointer; border: 1px solid; font-family: inherit; text-transform: uppercase; letter-spacing: 0.05em;
            transition: background 0.15s, box-shadow 0.15s;
        }
        .btn--primary { background: transparent; color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .btn--primary:hover { background: var(--accent-cyan-dim); box-shadow: var(--glow-cyan); }
        .btn--ghost { background: transparent; color: var(--text-secondary); border-color: var(--border); }
        .btn--ghost:hover { border-color: var(--text-tertiary); color: var(--text-primary); }
        .loading { color: var(--text-tertiary); font-size: 0.85rem; }

        .empty-filtered { color: var(--text-tertiary); font-size: 0.85rem; }
        .link-btn {
            background: none; border: none; color: var(--accent-cyan); cursor: pointer;
            font-size: inherit; font-family: inherit; text-decoration: underline; padding: 0;
        }

        .council-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 0.75rem; }
        .council-card {
            display: block; background: var(--bg-surface); border: 1px solid var(--border);
            border-radius: var(--radius-lg); padding: 1rem; text-decoration: none; color: inherit;
            transition: border-color 0.15s, box-shadow 0.15s; cursor: pointer;
        }
        .council-card:hover { border-color: var(--accent-magenta); box-shadow: 0 0 12px rgba(255, 0, 170, 0.08); }
        .council-card__top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.35rem; }
        .council-card__name { margin: 0; font-size: 0.95rem; font-weight: 700; color: var(--text-primary); }
        .council-card__desc { margin: 0 0 0.35rem; font-size: 0.75rem; color: var(--text-secondary); line-height: 1.4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .council-card__synthesis {
            margin: 0 0 0.5rem; font-size: 0.7rem; color: var(--accent-green); line-height: 1.4;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            padding: 0.25rem 0.5rem; border-left: 2px solid var(--accent-green); background: rgba(0, 255, 136, 0.04);
        }

        .council-card__meta { display: flex; gap: 0.75rem; align-items: center; margin-bottom: 0.4rem; font-size: 0.7rem; color: var(--text-secondary); }
        .meta-item { display: flex; align-items: center; gap: 0.2rem; }
        .meta-icon { font-size: 0.75rem; }
        .meta-item--chairman { color: #f5a623; }

        .stage-badge {
            font-size: 0.6rem; padding: 2px 8px; border-radius: var(--radius-sm); font-weight: 600;
            text-transform: uppercase; letter-spacing: 0.05em; border: 1px solid; flex-shrink: 0;
        }
        .stage-badge[data-stage="responding"] { color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .stage-badge[data-stage="discussing"] { color: #a78bfa; border-color: #a78bfa; }
        .stage-badge[data-stage="reviewing"] { color: var(--accent-magenta); border-color: var(--accent-magenta); }
        .stage-badge[data-stage="synthesizing"] { color: #f5a623; border-color: #f5a623; }
        .stage-badge[data-stage="complete"] { color: var(--accent-green); border-color: var(--accent-green); }
        .stage-badge[data-stage="idle"] { color: var(--text-tertiary); border-color: var(--border); }

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
    protected readonly hideTestData = signal(true);

    protected readonly hasTestCouncils = computed(() =>
        this.councilService.councils().some((c) => TEST_COUNCIL_RE.test(c.name)),
    );

    protected readonly cards = computed<CouncilCard[]>(() => {
        const councils = this.councilService.councils();
        const agents = this.agentService.agents();
        const launches = this.lastLaunches();

        const agentMap: Record<string, string> = {};
        for (const a of agents) {
            agentMap[a.id] = a.name;
        }

        return councils.map((council) => {
            const launch = launches[council.id] ?? null;
            return {
                council,
                memberCount: council.agentIds.length,
                memberNames: council.agentIds.map((id) => agentMap[id] ?? id.slice(0, 8)),
                chairmanName: council.chairmanAgentId ? (agentMap[council.chairmanAgentId] ?? null) : null,
                lastLaunch: launch,
                synthesisSummary: launch?.synthesis ? truncate(launch.synthesis, 120) : null,
            };
        });
    });

    protected readonly filteredCards = computed(() => {
        const all = this.cards();
        if (!this.hideTestData()) return all;
        return all.filter((c) => !TEST_COUNCIL_RE.test(c.council.name));
    });

    async ngOnInit(): Promise<void> {
        await Promise.all([
            this.councilService.loadCouncils(),
            this.agentService.loadAgents(),
        ]);
        this.loadLastLaunches();
    }

    protected toggleTestFilter(): void {
        this.hideTestData.update((v) => !v);
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

function truncate(text: string, maxLen: number): string {
    const oneLine = text.replace(/\n/g, ' ').trim();
    return oneLine.length <= maxLen ? oneLine : oneLine.slice(0, maxLen - 1) + '\u2026';
}

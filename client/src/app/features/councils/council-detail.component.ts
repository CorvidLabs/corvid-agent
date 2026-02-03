import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CouncilService } from '../../core/services/council.service';
import { AgentService } from '../../core/services/agent.service';
import { ProjectService } from '../../core/services/project.service';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import type { Council, CouncilLaunch } from '../../core/models/council.model';

@Component({
    selector: 'app-council-detail',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, RelativeTimePipe, FormsModule],
    template: `
        @if (council(); as c) {
            <div class="page">
                <div class="page__header">
                    <div>
                        <h2>{{ c.name }}</h2>
                        <p class="page__desc">{{ c.description }}</p>
                    </div>
                    <div class="page__actions">
                        <a class="btn btn--secondary" [routerLink]="['/councils', c.id, 'edit']">Edit</a>
                        <button class="btn btn--danger" (click)="onDelete()">Delete</button>
                    </div>
                </div>

                <div class="detail__info">
                    <dl>
                        <dt>Members</dt>
                        <dd>{{ c.agentIds.length }} agent{{ c.agentIds.length !== 1 ? 's' : '' }}</dd>
                        <dt>Chairman</dt>
                        <dd>{{ chairmanName() || 'None' }}</dd>
                        <dt>Discussion Rounds</dt>
                        <dd>{{ c.discussionRounds }}</dd>
                        <dt>Created</dt>
                        <dd>{{ c.createdAt | relativeTime }}</dd>
                    </dl>
                </div>

                <div class="detail__members">
                    <h3>Members</h3>
                    <div class="member-list">
                        @for (name of memberNames(); track name) {
                            <span class="member-badge">{{ name }}</span>
                        }
                    </div>
                </div>

                <div class="detail__launch">
                    <h3>Launch Council</h3>
                    <div class="launch-form">
                        <select
                            class="launch-select"
                            [(ngModel)]="selectedProjectId"
                            aria-label="Select a project"
                        >
                            <option value="" disabled>Select project...</option>
                            @for (project of projectService.projects(); track project.id) {
                                <option [value]="project.id">{{ project.name }}</option>
                            }
                        </select>
                        <textarea
                            class="launch-textarea"
                            [(ngModel)]="launchPrompt"
                            placeholder="Enter the prompt for the council..."
                            rows="4"
                            aria-label="Council prompt"
                        ></textarea>
                        <button
                            class="btn btn--primary"
                            [disabled]="!selectedProjectId || !launchPrompt || launching()"
                            (click)="onLaunch()"
                        >{{ launching() ? 'Launching...' : 'Launch Council' }}</button>
                    </div>
                </div>

                <div class="detail__launches">
                    <h3>Past Launches</h3>
                    @if (launches().length === 0) {
                        <p class="detail__empty">No launches yet.</p>
                    } @else {
                        <div class="launches-list">
                            @for (launch of launches(); track launch.id) {
                                <a class="launch-row" [routerLink]="['/council-launches', launch.id]">
                                    <span class="launch-row__prompt">{{ launch.prompt.length > 80 ? launch.prompt.slice(0, 80) + '...' : launch.prompt }}</span>
                                    <span class="launch-row__stage" [attr.data-stage]="launch.stage">{{ launch.stage }}</span>
                                    <span class="launch-row__sessions">{{ launch.sessionIds.length }} sessions</span>
                                    <span class="launch-row__time">{{ launch.createdAt | relativeTime }}</span>
                                </a>
                            }
                        </div>
                    }
                </div>
            </div>
        } @else {
            <div class="page"><p>Loading...</p></div>
        }
    `,
    styles: `
        .page { padding: 1.5rem; }
        .page__header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; }
        .page__header h2 { margin: 0; color: var(--text-primary); }
        .page__desc { margin: 0.25rem 0 0; color: var(--text-secondary); }
        .page__actions { display: flex; gap: 0.5rem; }
        .btn {
            padding: 0.5rem 1rem; border-radius: var(--radius); font-size: 0.8rem; font-weight: 600;
            cursor: pointer; border: 1px solid; text-decoration: none; font-family: inherit;
            text-transform: uppercase; letter-spacing: 0.05em; transition: background 0.15s, box-shadow 0.15s;
        }
        .btn--primary { background: transparent; color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .btn--primary:hover:not(:disabled) { background: var(--accent-cyan-dim); box-shadow: var(--glow-cyan); }
        .btn--primary:disabled { opacity: 0.3; cursor: not-allowed; }
        .btn--secondary { background: transparent; color: var(--text-secondary); border-color: var(--border-bright); }
        .btn--secondary:hover { background: var(--bg-hover); color: var(--text-primary); }
        .btn--danger { background: transparent; color: var(--accent-red); border-color: var(--accent-red); }
        .btn--danger:hover { background: var(--accent-red-dim); }
        .detail__info dl { display: grid; grid-template-columns: auto 1fr; gap: 0.25rem 1rem; }
        .detail__info dt { font-weight: 600; color: var(--text-secondary); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.03em; }
        .detail__info dd { margin: 0; color: var(--text-primary); }
        .detail__members { margin-top: 1.5rem; }
        .detail__members h3 { margin: 0 0 0.75rem; color: var(--text-primary); }
        .member-list { display: flex; flex-wrap: wrap; gap: 0.5rem; }
        .member-badge {
            padding: 0.25rem 0.75rem; background: var(--bg-surface); border: 1px solid var(--border-bright);
            border-radius: var(--radius); font-size: 0.8rem; color: var(--text-primary);
        }
        .detail__launch { margin-top: 2rem; }
        .detail__launch h3 { margin: 0 0 0.75rem; color: var(--text-primary); }
        .launch-form { display: flex; flex-direction: column; gap: 0.5rem; max-width: 600px; }
        .launch-select, .launch-textarea {
            padding: 0.5rem; border: 1px solid var(--border-bright); border-radius: var(--radius);
            font-size: 0.85rem; font-family: inherit; background: var(--bg-input); color: var(--text-primary);
        }
        .launch-select:focus, .launch-textarea:focus { border-color: var(--accent-cyan); box-shadow: var(--glow-cyan); outline: none; }
        .launch-textarea { resize: vertical; min-height: 80px; }
        .detail__launches { margin-top: 2rem; }
        .detail__launches h3 { margin: 0 0 0.75rem; color: var(--text-primary); }
        .detail__empty { color: var(--text-secondary); font-size: 0.85rem; }
        .launches-list { display: flex; flex-direction: column; gap: 0.5rem; }
        .launch-row {
            display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem;
            background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius);
            text-decoration: none; color: inherit; transition: border-color 0.2s;
        }
        .launch-row:hover { border-color: var(--accent-cyan); }
        .launch-row__prompt { flex: 1; font-size: 0.85rem; color: var(--text-primary); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .launch-row__stage {
            font-size: 0.7rem; padding: 2px 8px; border-radius: var(--radius-sm); font-weight: 600;
            text-transform: uppercase; letter-spacing: 0.05em; border: 1px solid;
            background: var(--bg-raised); color: var(--text-secondary);
        }
        .launch-row__stage[data-stage="responding"] { color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .launch-row__stage[data-stage="discussing"] { color: #a78bfa; border-color: #a78bfa; }
        .launch-row__stage[data-stage="reviewing"] { color: var(--accent-magenta); border-color: var(--accent-magenta); }
        .launch-row__stage[data-stage="synthesizing"] { color: #f5a623; border-color: #f5a623; }
        .launch-row__stage[data-stage="complete"] { color: var(--accent-green); border-color: var(--accent-green); }
        .launch-row__sessions { font-size: 0.75rem; color: var(--text-tertiary); white-space: nowrap; }
        .launch-row__time { font-size: 0.75rem; color: var(--text-tertiary); white-space: nowrap; }
    `,
})
export class CouncilDetailComponent implements OnInit {
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly councilService = inject(CouncilService);
    private readonly agentService = inject(AgentService);
    protected readonly projectService = inject(ProjectService);

    protected readonly council = signal<Council | null>(null);
    protected readonly launches = signal<CouncilLaunch[]>([]);
    protected readonly memberNames = signal<string[]>([]);
    protected readonly chairmanName = signal('');
    protected readonly launching = signal(false);
    protected selectedProjectId = '';
    protected launchPrompt = '';

    private agentNameMap: Record<string, string> = {};

    async ngOnInit(): Promise<void> {
        const id = this.route.snapshot.paramMap.get('id');
        if (!id) return;

        await this.agentService.loadAgents();
        this.projectService.loadProjects();

        for (const a of this.agentService.agents()) {
            this.agentNameMap[a.id] = a.name;
        }

        const council = await this.councilService.getCouncil(id);
        this.council.set(council);
        this.memberNames.set(council.agentIds.map((aid) => this.agentNameMap[aid] ?? aid.slice(0, 8)));
        this.chairmanName.set(council.chairmanAgentId ? (this.agentNameMap[council.chairmanAgentId] ?? '') : '');

        const launches = await this.councilService.getCouncilLaunches(id);
        this.launches.set(launches);
    }

    async onDelete(): Promise<void> {
        const c = this.council();
        if (!c) return;
        await this.councilService.deleteCouncil(c.id);
        this.router.navigate(['/councils']);
    }

    async onLaunch(): Promise<void> {
        const c = this.council();
        if (!c || !this.selectedProjectId || !this.launchPrompt) return;

        this.launching.set(true);
        try {
            const result = await this.councilService.launchCouncil(c.id, this.selectedProjectId, this.launchPrompt);
            this.router.navigate(['/council-launches', result.launchId]);
        } finally {
            this.launching.set(false);
        }
    }
}

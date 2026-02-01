import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ProjectService } from '../../core/services/project.service';
import { SessionService } from '../../core/services/session.service';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import type { Project } from '../../core/models/project.model';
import type { Session } from '../../core/models/session.model';

@Component({
    selector: 'app-project-detail',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, StatusBadgeComponent, RelativeTimePipe],
    template: `
        @if (project(); as p) {
            <div class="page">
                <div class="page__header">
                    <div>
                        <h2>{{ p.name }}</h2>
                        <p class="page__desc">{{ p.description }}</p>
                    </div>
                    <div class="page__actions">
                        <a class="btn btn--secondary" [routerLink]="['/projects', p.id, 'edit']">Edit</a>
                        <button class="btn btn--danger" (click)="onDelete()">Delete</button>
                    </div>
                </div>

                <div class="detail__info">
                    <dl>
                        <dt>Working Directory</dt>
                        <dd><code>{{ p.workingDir }}</code></dd>
                        <dt>Created</dt>
                        <dd>{{ p.createdAt | relativeTime }}</dd>
                    </dl>
                </div>

                @if (p.claudeMd) {
                    <div class="detail__section">
                        <h3>CLAUDE.md</h3>
                        <pre class="detail__code">{{ p.claudeMd }}</pre>
                    </div>
                }

                <div class="detail__section">
                    <div class="detail__section-header">
                        <h3>Sessions</h3>
                        <a class="btn btn--primary btn--sm" [routerLink]="['/sessions', 'new']"
                           [queryParams]="{ projectId: p.id }">New Session</a>
                    </div>
                    @if (sessions().length === 0) {
                        <p class="empty">No sessions yet.</p>
                    } @else {
                        @for (session of sessions(); track session.id) {
                            <div class="session-row">
                                <a [routerLink]="['/sessions', session.id]">{{ session.name || session.id }}</a>
                                <app-status-badge [status]="session.status" />
                                <span class="session-row__time">{{ session.updatedAt | relativeTime }}</span>
                            </div>
                        }
                    }
                </div>
            </div>
        } @else {
            <div class="page">
                <p>Loading...</p>
            </div>
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
        .btn--primary:hover { background: var(--accent-cyan-dim); box-shadow: var(--glow-cyan); }
        .btn--secondary { background: transparent; color: var(--text-secondary); border-color: var(--border-bright); }
        .btn--secondary:hover { background: var(--bg-hover); color: var(--text-primary); }
        .btn--danger { background: transparent; color: var(--accent-red); border-color: var(--accent-red); }
        .btn--danger:hover { background: var(--accent-red-dim); }
        .btn--sm { padding: 0.375rem 0.75rem; font-size: 0.75rem; }
        .detail__info dl { display: grid; grid-template-columns: auto 1fr; gap: 0.25rem 1rem; }
        .detail__info dt { font-weight: 600; color: var(--text-secondary); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.03em; }
        .detail__info dd { margin: 0; color: var(--text-primary); }
        code { background: var(--bg-raised); color: var(--accent-green); padding: 2px 6px; border-radius: var(--radius-sm); font-size: 0.8rem; border: 1px solid var(--border); }
        .detail__section { margin-top: 2rem; }
        .detail__section h3 { margin: 0 0 0.75rem; color: var(--text-primary); }
        .detail__section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
        .detail__section-header h3 { margin: 0; }
        .detail__code {
            background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius);
            padding: 1rem; font-size: 0.8rem; overflow-x: auto; white-space: pre-wrap; color: var(--accent-green);
        }
        .empty { color: var(--text-tertiary); }
        .session-row { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0; border-bottom: 1px solid var(--border); }
        .session-row a { color: var(--accent-cyan); text-decoration: none; }
        .session-row a:hover { text-shadow: 0 0 8px rgba(0, 229, 255, 0.3); }
        .session-row__time { margin-left: auto; font-size: 0.75rem; color: var(--text-tertiary); }
    `,
})
export class ProjectDetailComponent implements OnInit {
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly projectService = inject(ProjectService);
    private readonly sessionService = inject(SessionService);

    protected readonly project = signal<Project | null>(null);
    protected readonly sessions = signal<Session[]>([]);

    async ngOnInit(): Promise<void> {
        const id = this.route.snapshot.paramMap.get('id');
        if (!id) return;

        const project = await this.projectService.getProject(id);
        this.project.set(project);

        await this.sessionService.loadSessions(id);
        this.sessions.set(this.sessionService.sessions());
    }

    async onDelete(): Promise<void> {
        const p = this.project();
        if (!p) return;
        await this.projectService.deleteProject(p.id);
        this.router.navigate(['/projects']);
    }
}

import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { ProjectService } from '../../core/services/project.service';
import { SessionService } from '../../core/services/session.service';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import type { Project } from '../../core/models/project.model';
import type { Session } from '../../core/models/session.model';
import { PageShellComponent } from '../../shared/components/page-shell.component';

@Component({
    selector: 'app-project-detail',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, MatButtonModule, StatusBadgeComponent, SkeletonComponent, RelativeTimePipe, PageShellComponent],
    template: `
        @if (project(); as p) {
            <app-page-shell [title]="p.name" icon="projects" [subtitle]="p.description"
                [breadcrumbs]="[{label: 'Projects', route: '/agents/projects'}, {label: p.name}]">
                <ng-container actions>
                    <a mat-stroked-button [routerLink]="['/agents/projects', p.id, 'edit']">Edit</a>
                    <button mat-stroked-button color="warn" (click)="onDelete()">Delete</button>
                </ng-container>

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
                        <a mat-flat-button color="primary" [routerLink]="['/sessions', 'new']"
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
            </app-page-shell>
        } @else {
            <app-page-shell title="Loading..." icon="projects">
                <app-skeleton variant="card" [count]="1" />
                <app-skeleton variant="table" [count]="3" />
            </app-page-shell>
        }
    `,
    styles: `
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
            padding: var(--space-4); font-size: 0.8rem; overflow-x: auto; white-space: pre-wrap; color: var(--accent-green);
        }
        .empty { color: var(--text-tertiary); }
        .session-row { display: flex; align-items: center; gap: 0.75rem; padding: var(--space-2) 0; border-bottom: 1px solid var(--border); }
        .session-row a { color: var(--accent-cyan); text-decoration: none; }
        .session-row a:hover { text-shadow: 0 0 8px var(--accent-cyan-glow); }
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

        try {
            const project = await this.projectService.getProject(id);
            this.project.set(project);
        } catch {
            this.router.navigate(['/agents/projects']);
            return;
        }

        await this.sessionService.loadSessions(id).catch(() => {});
        this.sessions.set(this.sessionService.sessions());
    }

    async onDelete(): Promise<void> {
        const p = this.project();
        if (!p) return;
        await this.projectService.deleteProject(p.id);
        this.router.navigate(['/agents/projects']);
    }
}

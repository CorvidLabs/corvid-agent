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
        .page__header h2 { margin: 0; }
        .page__desc { margin: 0.25rem 0 0; color: #64748b; }
        .page__actions { display: flex; gap: 0.5rem; }
        .btn { padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.85rem; font-weight: 600; cursor: pointer; border: none; text-decoration: none; }
        .btn--primary { background: #3b82f6; color: #fff; }
        .btn--secondary { background: #e2e8f0; color: #475569; }
        .btn--danger { background: #ef4444; color: #fff; }
        .btn--sm { padding: 0.375rem 0.75rem; font-size: 0.8rem; }
        .detail__info dl { display: grid; grid-template-columns: auto 1fr; gap: 0.25rem 1rem; }
        .detail__info dt { font-weight: 600; color: #475569; font-size: 0.85rem; }
        .detail__info dd { margin: 0; }
        code { background: #f1f5f9; padding: 2px 6px; border-radius: 3px; font-size: 0.85rem; }
        .detail__section { margin-top: 2rem; }
        .detail__section h3 { margin: 0 0 0.75rem; }
        .detail__section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
        .detail__section-header h3 { margin: 0; }
        .detail__code { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 1rem; font-size: 0.8rem; overflow-x: auto; white-space: pre-wrap; }
        .empty { color: #64748b; }
        .session-row { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0; border-bottom: 1px solid #f1f5f9; }
        .session-row a { color: #3b82f6; text-decoration: none; }
        .session-row__time { margin-left: auto; font-size: 0.8rem; color: #94a3b8; }
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

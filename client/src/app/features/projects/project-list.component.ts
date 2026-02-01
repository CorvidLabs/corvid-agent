import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProjectService } from '../../core/services/project.service';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';

@Component({
    selector: 'app-project-list',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, RelativeTimePipe],
    template: `
        <div class="page">
            <div class="page__header">
                <h2>Projects</h2>
                <a class="btn btn--primary" routerLink="/projects/new">New Project</a>
            </div>

            @if (projectService.loading()) {
                <p>Loading...</p>
            } @else if (projectService.projects().length === 0) {
                <p class="empty">No projects yet. Create one to get started.</p>
            } @else {
                <div class="list" role="list">
                    @for (project of projectService.projects(); track project.id) {
                        <a
                            class="list__item"
                            role="listitem"
                            [routerLink]="['/projects', project.id]">
                            <div class="list__item-main">
                                <h3 class="list__item-title">{{ project.name }}</h3>
                                <p class="list__item-desc">{{ project.description }}</p>
                            </div>
                            <div class="list__item-meta">
                                <span class="list__item-path">{{ project.workingDir }}</span>
                                <span class="list__item-time">{{ project.updatedAt | relativeTime }}</span>
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
        .btn--primary:hover { background: #2563eb; }
        .empty { color: #64748b; }
        .list { display: flex; flex-direction: column; gap: 0.5rem; }
        .list__item {
            display: flex; justify-content: space-between; align-items: center;
            padding: 1rem; background: #fff; border: 1px solid #e2e8f0;
            border-radius: 8px; text-decoration: none; color: inherit;
            transition: border-color 0.15s;
        }
        .list__item:hover { border-color: #3b82f6; }
        .list__item-title { margin: 0 0 0.25rem; font-size: 1rem; }
        .list__item-desc { margin: 0; color: #64748b; font-size: 0.85rem; }
        .list__item-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 0.25rem; font-size: 0.8rem; color: #94a3b8; }
        .list__item-path { font-family: monospace; }
    `,
})
export class ProjectListComponent implements OnInit {
    protected readonly projectService = inject(ProjectService);

    ngOnInit(): void {
        this.projectService.loadProjects();
    }
}

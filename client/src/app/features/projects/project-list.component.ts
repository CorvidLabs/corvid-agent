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
        .list__item:hover { border-color: var(--accent-green); box-shadow: 0 0 12px rgba(0, 255, 136, 0.08); }
        .list__item-title { margin: 0 0 0.25rem; font-size: 0.95rem; color: var(--text-primary); }
        .list__item-desc { margin: 0; color: var(--text-secondary); font-size: 0.8rem; }
        .list__item-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 0.25rem; font-size: 0.75rem; color: var(--text-tertiary); }
        .list__item-path { color: var(--accent-green); opacity: 0.7; }
    `,
})
export class ProjectListComponent implements OnInit {
    protected readonly projectService = inject(ProjectService);

    ngOnInit(): void {
        this.projectService.loadProjects();
    }
}

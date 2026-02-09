import { Component, ChangeDetectionStrategy, inject, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { WorkTaskService } from '../../core/services/work-task.service';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import type { WorkTask } from '../../core/models/work-task.model';

@Component({
    selector: 'app-work-task-list',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, RelativeTimePipe],
    template: `
        <div class="tasks">
            <div class="tasks__header">
                <h2>Work Tasks</h2>
                <div class="tasks__filters">
                    <button
                        class="filter-btn"
                        [class.filter-btn--active]="activeFilter() === 'all'"
                        (click)="setFilter('all')"
                    >All ({{ allTasks().length }})</button>
                    <button
                        class="filter-btn"
                        [class.filter-btn--active]="activeFilter() === 'active'"
                        (click)="setFilter('active')"
                    >Active ({{ activeTasks().length }})</button>
                    <button
                        class="filter-btn"
                        [class.filter-btn--active]="activeFilter() === 'completed'"
                        (click)="setFilter('completed')"
                    >Completed ({{ completedTasks().length }})</button>
                    <button
                        class="filter-btn"
                        [class.filter-btn--active]="activeFilter() === 'failed'"
                        (click)="setFilter('failed')"
                    >Failed ({{ failedTasks().length }})</button>
                </div>
            </div>

            @if (taskService.loading()) {
                <p class="loading">Loading work tasks...</p>
            } @else if (filteredTasks().length === 0) {
                <div class="empty">
                    <p>No {{ activeFilter() === 'all' ? '' : activeFilter() + ' ' }}work tasks found.</p>
                </div>
            } @else {
                <div class="task-list">
                    @for (task of filteredTasks(); track task.id) {
                        <div class="task-card" [attr.data-status]="task.status">
                            <div class="task-card__header">
                                <span class="task-status" [attr.data-status]="task.status">{{ task.status }}</span>
                                <span class="task-time">{{ task.createdAt | relativeTime }}</span>
                            </div>
                            <p class="task-desc">{{ task.description }}</p>
                            <div class="task-meta">
                                @if (task.branchName) {
                                    <span class="task-branch">{{ task.branchName }}</span>
                                }
                                @if (task.prUrl) {
                                    <a class="task-pr" [href]="task.prUrl" target="_blank" rel="noopener">View PR</a>
                                }
                                @if (task.sessionId) {
                                    <a class="task-session" [routerLink]="['/sessions', task.sessionId]">Session</a>
                                }
                                @if (task.iterationCount > 0) {
                                    <span class="task-iterations">{{ task.iterationCount }} iteration{{ task.iterationCount > 1 ? 's' : '' }}</span>
                                }
                            </div>
                            @if (task.error) {
                                <div class="task-error">{{ task.error }}</div>
                            }
                            @if (task.summary) {
                                <div class="task-summary">{{ task.summary }}</div>
                            }
                        </div>
                    }
                </div>
            }
        </div>
    `,
    styles: `
        .tasks { padding: 1.5rem; }
        .tasks__header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 0.75rem;
            margin-bottom: 1.5rem;
        }
        .tasks__header h2 { margin: 0; color: var(--text-primary); }
        .loading { color: var(--text-secondary); }

        .tasks__filters {
            display: flex;
            gap: 0.35rem;
        }
        .filter-btn {
            padding: 0.35rem 0.65rem;
            background: var(--bg-raised);
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            color: var(--text-secondary);
            font-size: 0.7rem;
            font-family: inherit;
            cursor: pointer;
            transition: border-color 0.15s, color 0.15s;
        }
        .filter-btn:hover { border-color: var(--border-bright); color: var(--text-primary); }
        .filter-btn--active { border-color: var(--accent-cyan); color: var(--accent-cyan); background: var(--accent-cyan-dim); }

        .empty {
            text-align: center;
            padding: 3rem;
            color: var(--text-tertiary);
        }

        .task-list {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
        }

        .task-card {
            background: var(--bg-surface);
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
            padding: 1rem;
            transition: border-color 0.2s;
        }
        .task-card:hover { border-color: var(--border-bright); }
        .task-card[data-status="running"],
        .task-card[data-status="branching"],
        .task-card[data-status="validating"] {
            border-left: 3px solid var(--accent-cyan);
        }
        .task-card[data-status="completed"] {
            border-left: 3px solid var(--accent-green);
        }
        .task-card[data-status="failed"] {
            border-left: 3px solid var(--accent-red);
        }
        .task-card[data-status="pending"] {
            border-left: 3px solid var(--accent-amber);
        }

        .task-card__header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 0.5rem;
        }

        .task-status {
            font-size: 0.65rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            padding: 2px 8px;
            border-radius: var(--radius-sm);
            border: 1px solid;
        }
        .task-status[data-status="pending"] { color: var(--accent-amber); background: var(--accent-amber-dim); border-color: var(--accent-amber); }
        .task-status[data-status="branching"],
        .task-status[data-status="running"],
        .task-status[data-status="validating"] { color: var(--accent-cyan); background: var(--accent-cyan-dim); border-color: var(--accent-cyan); }
        .task-status[data-status="completed"] { color: var(--accent-green); background: var(--accent-green-dim); border-color: var(--accent-green); }
        .task-status[data-status="failed"] { color: var(--accent-red); background: var(--accent-red-dim); border-color: var(--accent-red); }

        .task-time {
            font-size: 0.65rem;
            color: var(--text-tertiary);
        }

        .task-desc {
            margin: 0 0 0.5rem;
            font-size: 0.8rem;
            color: var(--text-secondary);
            line-height: 1.5;
        }

        .task-meta {
            display: flex;
            gap: 0.5rem;
            flex-wrap: wrap;
            align-items: center;
        }
        .task-branch {
            font-size: 0.65rem;
            color: var(--accent-magenta);
            background: var(--accent-magenta-dim);
            padding: 2px 6px;
            border-radius: var(--radius-sm);
            font-family: monospace;
        }
        .task-pr {
            font-size: 0.65rem;
            color: var(--accent-green);
            text-decoration: none;
            border: 1px solid var(--accent-green);
            padding: 2px 6px;
            border-radius: var(--radius-sm);
        }
        .task-pr:hover { background: var(--accent-green-dim); }
        .task-session {
            font-size: 0.65rem;
            color: var(--accent-cyan);
            text-decoration: none;
            border: 1px solid var(--accent-cyan);
            padding: 2px 6px;
            border-radius: var(--radius-sm);
        }
        .task-session:hover { background: var(--accent-cyan-dim); }
        .task-iterations {
            font-size: 0.6rem;
            color: var(--text-tertiary);
        }

        .task-error {
            margin-top: 0.5rem;
            padding: 0.5rem;
            background: var(--accent-red-dim);
            border: 1px solid var(--accent-red);
            border-radius: var(--radius);
            color: var(--accent-red);
            font-size: 0.7rem;
            font-family: monospace;
            white-space: pre-wrap;
            max-height: 100px;
            overflow-y: auto;
        }

        .task-summary {
            margin-top: 0.5rem;
            padding: 0.5rem;
            background: var(--bg-raised);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            color: var(--text-secondary);
            font-size: 0.7rem;
            line-height: 1.5;
            max-height: 120px;
            overflow-y: auto;
        }
    `,
})
export class WorkTaskListComponent implements OnInit, OnDestroy {
    protected readonly taskService = inject(WorkTaskService);
    readonly activeFilter = signal<'all' | 'active' | 'completed' | 'failed'>('all');

    readonly allTasks = computed(() => this.taskService.tasks());

    readonly activeTasks = computed(() =>
        this.taskService.tasks().filter((t) =>
            ['pending', 'branching', 'running', 'validating'].includes(t.status),
        ),
    );

    readonly completedTasks = computed(() =>
        this.taskService.tasks().filter((t) => t.status === 'completed'),
    );

    readonly failedTasks = computed(() =>
        this.taskService.tasks().filter((t) => t.status === 'failed'),
    );

    readonly filteredTasks = computed(() => {
        switch (this.activeFilter()) {
            case 'active': return this.activeTasks();
            case 'completed': return this.completedTasks();
            case 'failed': return this.failedTasks();
            default: return this.allTasks();
        }
    });

    ngOnInit(): void {
        this.taskService.loadTasks();
        this.taskService.startListening();
    }

    ngOnDestroy(): void {
        this.taskService.stopListening();
    }

    protected setFilter(filter: 'all' | 'active' | 'completed' | 'failed'): void {
        this.activeFilter.set(filter);
    }
}

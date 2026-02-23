import { Component, ChangeDetectionStrategy, inject, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { WorkTaskService } from '../../core/services/work-task.service';
import { AgentService } from '../../core/services/agent.service';
import { NotificationService } from '../../core/services/notification.service';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';

@Component({
    selector: 'app-work-task-list',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, FormsModule, RelativeTimePipe],
    template: `
        <div class="tasks">
            <div class="tasks__header">
                <h2>Work Tasks</h2>
                <button class="create-btn" (click)="showCreateForm.set(!showCreateForm())">
                    {{ showCreateForm() ? 'Cancel' : '+ New Task' }}
                </button>
            </div>

            @if (showCreateForm()) {
                <div class="create-form">
                    <div class="create-form__row">
                        <select class="form-select" [(ngModel)]="createAgentId">
                            <option value="" disabled>Select agent...</option>
                            @for (agent of agentService.agents(); track agent.id) {
                                <option [value]="agent.id">{{ agent.name }}</option>
                            }
                        </select>
                        <textarea class="form-textarea" [(ngModel)]="createDescription" placeholder="Describe the task..." rows="2"></textarea>
                        <button class="btn btn--primary" [disabled]="!createAgentId || !createDescription || creating()" (click)="onCreateTask()">
                            {{ creating() ? 'Creating...' : 'Create' }}
                        </button>
                    </div>
                </div>
            }

            <div class="tasks__filter-row">
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
                                <span class="task-agent">{{ getAgentName(task.agentId) }}</span>
                                <span class="task-time">{{ task.createdAt | relativeTime }}</span>
                            </div>
                            <p class="task-desc">{{ task.description }}</p>
                            @if (task.status === 'running' || task.status === 'branching' || task.status === 'validating') {
                                <div class="task-progress">
                                    <div class="task-progress__bar">
                                        <div class="task-progress__fill" [attr.data-status]="task.status"></div>
                                    </div>
                                </div>
                            }
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
                            @if (task.status === 'running' || task.status === 'branching' || task.status === 'validating') {
                                <div class="task-actions">
                                    <button class="action-btn action-btn--cancel" (click)="onCancel(task.id)">Cancel</button>
                                </div>
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
            margin-bottom: 1rem;
        }
        .tasks__header h2 { margin: 0; color: var(--text-primary); }
        .create-btn {
            padding: 0.5rem 1rem; border-radius: var(--radius); font-size: 0.8rem; font-weight: 600;
            cursor: pointer; border: 1px solid var(--accent-cyan); background: var(--accent-cyan-dim);
            color: var(--accent-cyan); font-family: inherit; text-transform: uppercase; letter-spacing: 0.05em;
        }
        .create-form { background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem; margin-bottom: 1rem; }
        .create-form__row { display: flex; gap: 0.5rem; align-items: flex-start; }
        .form-select, .form-textarea { padding: 0.5rem; border: 1px solid var(--border-bright); border-radius: var(--radius); font-size: 0.85rem; font-family: inherit; background: var(--bg-input); color: var(--text-primary); }
        .form-select { min-width: 150px; }
        .form-textarea { flex: 1; resize: vertical; min-height: 2.5em; line-height: 1.5; }
        .form-select:focus, .form-textarea:focus { border-color: var(--accent-cyan); outline: none; }
        .btn { padding: 0.5rem 1rem; border-radius: var(--radius); font-size: 0.8rem; font-weight: 600; cursor: pointer; border: 1px solid; font-family: inherit; text-transform: uppercase; letter-spacing: 0.05em; }
        .btn--primary { border-color: var(--accent-cyan); background: var(--accent-cyan-dim); color: var(--accent-cyan); }
        .btn--primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .tasks__filter-row { margin-bottom: 1rem; }
        .loading { color: var(--text-secondary); }
        .task-agent { font-size: 0.65rem; color: var(--accent-cyan); font-weight: 600; }
        .task-progress { margin: 0.35rem 0; }
        .task-progress__bar { height: 4px; background: var(--bg-raised); border-radius: 2px; overflow: hidden; }
        .task-progress__fill { height: 100%; border-radius: 2px; animation: progress-pulse 1.5s ease-in-out infinite; }
        .task-progress__fill[data-status="branching"] { width: 30%; background: var(--accent-cyan); }
        .task-progress__fill[data-status="running"] { width: 60%; background: var(--accent-cyan); }
        .task-progress__fill[data-status="validating"] { width: 85%; background: var(--accent-green); }
        @keyframes progress-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .task-actions { margin-top: 0.5rem; }
        .action-btn { padding: 0.25rem 0.6rem; font-size: 0.65rem; font-weight: 600; font-family: inherit; cursor: pointer; border-radius: var(--radius-sm); text-transform: uppercase; }
        .action-btn--cancel { background: transparent; color: var(--accent-red); border: 1px solid var(--accent-red); }
        .action-btn--cancel:hover { background: var(--accent-red-dim); }

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
    protected readonly agentService = inject(AgentService);
    private readonly notify = inject(NotificationService);

    readonly activeFilter = signal<'all' | 'active' | 'completed' | 'failed'>('all');
    readonly showCreateForm = signal(false);
    readonly creating = signal(false);
    protected createAgentId = '';
    protected createDescription = '';

    private agentNameCache: Record<string, string> = {};

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

    async ngOnInit(): Promise<void> {
        await Promise.all([
            this.taskService.loadTasks(),
            this.agentService.loadAgents(),
        ]);
        this.taskService.startListening();
        for (const a of this.agentService.agents()) {
            this.agentNameCache[a.id] = a.name;
        }
    }

    ngOnDestroy(): void {
        this.taskService.stopListening();
    }

    protected setFilter(filter: 'all' | 'active' | 'completed' | 'failed'): void {
        this.activeFilter.set(filter);
    }

    protected getAgentName(agentId: string): string {
        return this.agentNameCache[agentId] ?? agentId.slice(0, 8);
    }

    protected async onCreateTask(): Promise<void> {
        if (!this.createAgentId || !this.createDescription) return;
        this.creating.set(true);
        try {
            await this.taskService.createTask({
                agentId: this.createAgentId,
                description: this.createDescription,
            });
            this.notify.success('Work task created');
            this.createAgentId = '';
            this.createDescription = '';
            this.showCreateForm.set(false);
        } catch (e) {
            this.notify.error('Failed to create work task', String(e));
        } finally {
            this.creating.set(false);
        }
    }

    protected async onCancel(taskId: string): Promise<void> {
        try {
            await this.taskService.cancelTask(taskId);
            this.notify.success('Work task cancelled');
        } catch (e) {
            this.notify.error('Failed to cancel task', String(e));
        }
    }
}

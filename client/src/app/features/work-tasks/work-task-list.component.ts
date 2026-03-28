import { Component, ChangeDetectionStrategy, inject, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { WorkTaskService } from '../../core/services/work-task.service';
import { AgentService } from '../../core/services/agent.service';
import { NotificationService } from '../../core/services/notification.service';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import { DurationPipe } from '../../shared/pipes/duration.pipe';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { WorkTask } from '../../core/models/work-task.model';
import { WorkTaskDetailComponent } from './work-task-detail.component';

@Component({
    selector: 'app-work-task-list',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, FormsModule, RelativeTimePipe, DurationPipe, EmptyStateComponent, SkeletonComponent, WorkTaskDetailComponent],
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

            <div class="tasks__filter-row sticky-toolbar">
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
                <div class="tasks__search-row">
                    <input class="search-input" type="text" placeholder="Search tasks..."
                           [value]="searchQuery()" (input)="searchQuery.set($any($event.target).value)" />
                    @if (agentOptions().length > 1) {
                        <select class="agent-filter-select" [value]="agentFilter()" (change)="agentFilter.set($any($event.target).value)">
                            <option value="">All agents</option>
                            @for (opt of agentOptions(); track opt.id) {
                                <option [value]="opt.id">{{ opt.name }}</option>
                            }
                        </select>
                    }
                    @if (searchQuery() || agentFilter()) {
                        <button class="clear-filters-btn" (click)="searchQuery.set(''); agentFilter.set('')">Clear</button>
                    }
                </div>
            </div>

            @if (taskService.loading()) {
                <app-skeleton variant="table" [count]="5" />
            } @else if (taskService.tasks().length === 0) {
                <app-empty-state
                    icon="  ____\n |    |\n | /\\ |\n |/  \\|\n |____|"
                    title="No work tasks yet."
                    description="Work tasks are agent-driven code changes — branch, implement, validate, PR."
                    actionLabel="+ Create a work task"
                    actionAriaLabel="Create your first agent work task"
                    [actionClick]="toggleCreateForm" />
            } @else if (filteredTasks().length === 0) {
                <div class="empty">
                    <p>No {{ activeFilter() === 'all' ? '' : activeFilter() + ' ' }}work tasks found.</p>
                </div>
            } @else {
                <div class="task-list stagger-rows">
                    @for (task of filteredTasks(); track task.id) {
                        <div class="task-card" [attr.data-status]="getDisplayStatus(task)">
                            <div class="task-card__header">
                                @if (isInterrupted(task)) {
                                    <span class="task-status" data-status="interrupted">interrupted</span>
                                } @else {
                                    <span class="task-status" [attr.data-status]="task.status">
                                        @if (task.status === 'completed') {
                                            <span class="status-icon status-icon--ok" aria-hidden="true"></span>
                                        }
                                        @if (task.status === 'failed') {
                                            <span class="status-icon status-icon--fail" aria-hidden="true"></span>
                                        }
                                        {{ task.status }}
                                    </span>
                                }
                                <span class="task-agent">{{ getAgentName(task.agentId) }}</span>
                                @if (task.completedAt || isActiveStatus(task.status)) {
                                    <span class="task-duration" [class.task-duration--active]="isActiveStatus(task.status)">{{ task.createdAt | duration:task.completedAt }}</span>
                                }
                                <span class="task-time">{{ task.createdAt | relativeTime }}</span>
                            </div>
                            <p class="task-desc">{{ task.description }}</p>
                            @if (isActiveStatus(task.status) || task.status === 'completed' || task.status === 'failed') {
                                <div class="pipeline-stages">
                                    @for (stage of pipelineStages; track stage.key) {
                                        <div class="pipeline-stage"
                                             [attr.data-state]="getStageState(task, stage.key)"
                                             [title]="stage.label">
                                            <div class="pipeline-stage__dot"></div>
                                            <span class="pipeline-stage__label">{{ stage.label }}</span>
                                        </div>
                                        @if (!$last) {
                                            <div class="pipeline-connector" [attr.data-state]="getConnectorState(task, stage.key)"></div>
                                        }
                                    }
                                </div>
                            }
                            <div class="task-meta">
                                @if (task.branchName) {
                                    <a class="task-branch" [href]="getBranchUrl(task)" [title]="task.branchName" target="_blank" rel="noopener">{{ truncateBranch(task.branchName) }}</a>
                                }
                                @if (task.prUrl) {
                                    <a class="task-pr" [href]="task.prUrl" target="_blank" rel="noopener">
                                        @if (task.status === 'completed') {
                                            <span class="status-icon status-icon--ok" aria-hidden="true"></span>
                                        }
                                        View PR
                                    </a>
                                }
                                @if (task.sessionId) {
                                    <a class="task-session" [routerLink]="['/sessions', task.sessionId]">Session</a>
                                }
                                @if (task.iterationCount > 0) {
                                    <span class="task-iterations">
                                        @if (task.status === 'failed' && !isInterrupted(task)) {
                                            <span class="status-icon status-icon--fail" aria-hidden="true"></span>
                                        }
                                        {{ task.iterationCount }} iteration{{ task.iterationCount > 1 ? 's' : '' }}
                                    </span>
                                }
                            </div>
                            @if (task.error) {
                                <div class="task-error-wrapper">
                                    @if (isErrorExpanded(task.id)) {
                                        <div class="task-error task-error--expanded" [class.task-error--interrupted]="isInterrupted(task)">
                                            <div class="task-error__content">{{ task.error }}</div>
                                        </div>
                                        <button class="error-toggle" (click)="toggleError(task.id)">Hide details</button>
                                    } @else {
                                        <div class="task-error task-error--collapsed" [class.task-error--interrupted]="isInterrupted(task)">
                                            {{ getErrorFirstLine(task.error) }}
                                        </div>
                                        @if (hasMultipleLines(task.error)) {
                                            <button class="error-toggle" (click)="toggleError(task.id)">Show details</button>
                                        }
                                    }
                                </div>
                            }
                            @if (task.summary) {
                                <div class="task-summary">{{ task.summary }}</div>
                            }
                            @if (task.status === 'running' || task.status === 'branching' || task.status === 'validating') {
                                <div class="task-actions">
                                    <button class="action-btn action-btn--cancel" (click)="onCancel(task.id)">Cancel</button>
                                </div>
                            }
                            @if (task.status === 'failed') {
                                <div class="task-actions">
                                    <button class="action-btn action-btn--retry" (click)="onRetry(task.id)" [disabled]="retrying().has(task.id)">
                                        {{ retrying().has(task.id) ? 'Retrying...' : 'Retry' }}
                                    </button>
                                </div>
                            }
                            @if (task.sessionId || task.prUrl) {
                                <button class="detail-toggle" (click)="toggleDetail(task.id); $event.stopPropagation()">
                                    {{ isDetailExpanded(task.id) ? 'Hide Logs & Diff' : 'View Logs & Diff' }}
                                </button>
                            }
                            @if (isDetailExpanded(task.id)) {
                                <app-work-task-detail [task]="task" />
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
        .create-form { background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem; margin-bottom: 1rem; animation: expandReveal 0.25s ease-out; }
        .create-form__row { display: flex; gap: 0.5rem; align-items: flex-start; }
        .form-select, .form-textarea { padding: 0.5rem; border: 1px solid var(--border-bright); border-radius: var(--radius); font-size: 0.85rem; font-family: inherit; background: var(--bg-input); color: var(--text-primary); }
        .form-select { min-width: 150px; }
        .form-textarea { flex: 1; resize: vertical; min-height: 2.5em; line-height: 1.5; }
        .form-select, .form-textarea { transition: border-color var(--transition-fast), box-shadow var(--transition-base); }
        .form-select:focus, .form-textarea:focus { border-color: var(--accent-cyan); box-shadow: var(--glow-cyan); outline: none; }
        .btn { padding: 0.5rem 1rem; border-radius: var(--radius); font-size: 0.8rem; font-weight: 600; cursor: pointer; border: 1px solid; font-family: inherit; text-transform: uppercase; letter-spacing: 0.05em; }
        .btn--primary { border-color: var(--accent-cyan); background: var(--accent-cyan-dim); color: var(--accent-cyan); }
        .btn--primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .tasks__filter-row { margin-bottom: 1rem; }
        .loading { color: var(--text-secondary); }
        .task-agent { font-size: 0.65rem; color: var(--accent-cyan); font-weight: 600; }
        /* Pipeline stage indicator */
        .pipeline-stages {
            display: flex; align-items: center; margin: 0.5rem 0; gap: 0;
        }
        .pipeline-stage {
            display: flex; flex-direction: column; align-items: center; gap: 2px; flex-shrink: 0;
        }
        .pipeline-stage__dot {
            width: 10px; height: 10px; border-radius: 50%;
            border: 2px solid var(--border); background: var(--bg-raised);
            transition: all 0.3s ease;
        }
        .pipeline-stage__label {
            font-size: 0.5rem; color: var(--text-tertiary); text-transform: uppercase;
            letter-spacing: 0.04em; white-space: nowrap;
        }
        .pipeline-stage[data-state="done"] .pipeline-stage__dot {
            border-color: var(--accent-green); background: var(--accent-green);
        }
        .pipeline-stage[data-state="done"] .pipeline-stage__label { color: var(--accent-green); }
        .pipeline-stage[data-state="active"] .pipeline-stage__dot {
            border-color: var(--accent-cyan); background: var(--accent-cyan);
            animation: stage-pulse 1.5s ease-in-out infinite;
        }
        .pipeline-stage[data-state="active"] .pipeline-stage__label { color: var(--accent-cyan); font-weight: 600; }
        .pipeline-stage[data-state="failed"] .pipeline-stage__dot {
            border-color: var(--accent-red); background: var(--accent-red);
        }
        .pipeline-stage[data-state="failed"] .pipeline-stage__label { color: var(--accent-red); }
        .pipeline-connector {
            flex: 1; height: 2px; background: var(--border); min-width: 8px;
            margin: 0 2px; margin-bottom: 12px; transition: background 0.3s ease;
        }
        .pipeline-connector[data-state="done"] { background: var(--accent-green); }
        .pipeline-connector[data-state="active"] {
            background: linear-gradient(90deg, var(--accent-cyan), var(--border));
        }
        @keyframes stage-pulse { 0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(0, 229, 255, 0.4); } 50% { opacity: 0.7; box-shadow: 0 0 6px 2px rgba(0, 229, 255, 0.2); } }
        .task-actions { margin-top: 0.5rem; }
        .action-btn { padding: 0.25rem 0.6rem; font-size: 0.65rem; font-weight: 600; font-family: inherit; cursor: pointer; border-radius: var(--radius-sm); text-transform: uppercase; }
        .action-btn--cancel { background: transparent; color: var(--accent-red); border: 1px solid var(--accent-red); }
        .action-btn--cancel:hover { background: var(--accent-red-dim); }
        .action-btn--retry { background: transparent; color: var(--accent-cyan); border: 1px solid var(--accent-cyan); }
        .action-btn--retry:hover { background: var(--accent-cyan-dim); }
        .action-btn--retry:disabled { opacity: 0.5; cursor: not-allowed; }

        .detail-toggle {
            display: inline-block; margin-top: 0.5rem; padding: 0.25rem 0.6rem;
            background: var(--bg-raised); border: 1px solid var(--border); border-radius: var(--radius-sm);
            color: var(--text-tertiary); font-size: 0.6rem; font-weight: 600; font-family: inherit;
            cursor: pointer; text-transform: uppercase; letter-spacing: 0.05em; transition: all 0.15s;
        }
        .detail-toggle:hover { border-color: var(--accent-cyan); color: var(--accent-cyan); }

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
        .filter-btn--active { border-color: var(--accent-cyan); color: var(--accent-cyan); background: var(--accent-cyan-dim); box-shadow: 0 0 8px rgba(0, 229, 255, 0.12); }

        .tasks__search-row {
            display: flex; gap: 0.5rem; align-items: center; margin-top: 0.5rem;
        }
        .search-input {
            flex: 1; padding: 0.4rem 0.65rem; font-size: 0.75rem; font-family: inherit;
            background: var(--bg-input); color: var(--text-primary);
            border: 1px solid var(--border); border-radius: var(--radius-sm);
            transition: border-color 0.15s, box-shadow 0.15s; min-width: 0;
        }
        .search-input:focus { border-color: var(--accent-cyan); box-shadow: var(--glow-cyan); outline: none; }
        .search-input::placeholder { color: var(--text-tertiary); }
        .agent-filter-select {
            padding: 0.4rem 0.5rem; font-size: 0.7rem; font-family: inherit;
            background: var(--bg-input); color: var(--text-primary);
            border: 1px solid var(--border); border-radius: var(--radius-sm);
            cursor: pointer; min-width: 120px;
        }
        .agent-filter-select:focus { border-color: var(--accent-cyan); outline: none; }
        .clear-filters-btn {
            padding: 0.35rem 0.6rem; font-size: 0.6rem; font-weight: 600; font-family: inherit;
            text-transform: uppercase; letter-spacing: 0.05em;
            background: transparent; border: 1px solid var(--border);
            border-radius: var(--radius-sm); color: var(--text-tertiary);
            cursor: pointer; white-space: nowrap; transition: all 0.15s;
        }
        .clear-filters-btn:hover { border-color: var(--accent-cyan); color: var(--accent-cyan); }

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
            transition: border-color 0.2s, transform 0.2s ease, box-shadow 0.25s ease;
        }
        .task-card:hover { border-color: var(--border-bright); transform: translateY(-1px); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25); }
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
        .task-card[data-status="interrupted"] {
            border-left: 3px solid var(--accent-orange);
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
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }
        .task-status[data-status="pending"] { color: var(--accent-amber); background: var(--accent-amber-dim); border-color: var(--accent-amber); }
        .task-status[data-status="branching"],
        .task-status[data-status="running"],
        .task-status[data-status="validating"] { color: var(--accent-cyan); background: var(--accent-cyan-dim); border-color: var(--accent-cyan); }
        .task-status[data-status="completed"] { color: var(--accent-green); background: var(--accent-green-dim); border-color: var(--accent-green); }
        .task-status[data-status="failed"] { color: var(--accent-red); background: var(--accent-red-dim); border-color: var(--accent-red); }
        .task-status[data-status="interrupted"] { color: var(--accent-orange); background: var(--accent-orange-dim); border-color: var(--accent-orange); }

        .status-icon { font-style: normal; }
        .status-icon--ok::before { content: '\\2713'; }
        .status-icon--fail::before { content: '\\2717'; }

        .task-duration {
            font-size: 0.6rem;
            color: var(--text-tertiary);
            background: var(--bg-raised);
            padding: 1px 6px;
            border-radius: var(--radius-sm);
            border: 1px solid var(--border);
            font-family: var(--font-mono, monospace);
        }
        .task-duration--active {
            color: var(--accent-cyan);
            border-color: var(--accent-cyan);
            animation: progress-pulse 1.5s ease-in-out infinite;
        }
        .task-time {
            font-size: 0.65rem;
            color: var(--text-tertiary);
            display: inline-flex;
            align-items: center;
            gap: 0.35rem;
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
            text-decoration: none;
            max-width: 250px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            display: inline-block;
        }
        .task-branch:hover { text-decoration: underline; }
        .task-pr {
            font-size: 0.65rem;
            color: var(--accent-green);
            text-decoration: none;
            border: 1px solid var(--accent-green);
            padding: 2px 6px;
            border-radius: var(--radius-sm);
            display: inline-flex;
            align-items: center;
            gap: 3px;
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
            display: inline-flex;
            align-items: center;
            gap: 3px;
        }

        .task-error-wrapper { margin-top: 0.5rem; }

        .task-error {
            padding: 0.5rem;
            background: var(--accent-red-dim);
            border: 1px solid var(--accent-red);
            border-radius: var(--radius);
            color: var(--accent-red);
            font-size: 0.7rem;
            font-family: monospace;
        }
        .task-error--interrupted {
            background: var(--accent-orange-dim);
            border-color: var(--accent-orange);
            color: var(--accent-orange);
        }
        .task-error--collapsed {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .task-error--expanded {
            white-space: pre-wrap;
            max-height: 300px;
            overflow-y: auto;
        }
        .task-error--expanded .task-error__content {
            background: var(--bg-deep);
            border-radius: var(--radius-sm);
            padding: 0.5rem;
        }
        .error-toggle {
            display: inline-block;
            margin-top: 0.25rem;
            padding: 0;
            background: none;
            border: none;
            color: var(--text-tertiary);
            font-size: 0.6rem;
            font-family: inherit;
            cursor: pointer;
            text-decoration: underline;
        }
        .error-toggle:hover { color: var(--text-secondary); }

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

        @media (max-width: 767px) {
            .tasks { padding: 1rem; }
            .tasks__header { flex-direction: column; align-items: flex-start; gap: 0.5rem; }
            .create-form__row { flex-direction: column; }
            .form-select { min-width: 100%; }
            .task-card__header { flex-wrap: wrap; gap: 0.35rem; }
            .task-meta { flex-direction: column; gap: 0.25rem; }
            .tasks__filters { flex-wrap: wrap; }
            .tasks__search-row { flex-wrap: wrap; }
            .agent-filter-select { min-width: 100%; }
            .pipeline-stage__label { font-size: 0.45rem; }
            .pipeline-stage__dot { width: 8px; height: 8px; }
        }
        @media (max-width: 480px) {
            .tasks { padding: 0.75rem; }
            .pipeline-stage__label { display: none; }
        }
    `,
})
export class WorkTaskListComponent implements OnInit, OnDestroy {
    protected readonly taskService = inject(WorkTaskService);
    protected readonly agentService = inject(AgentService);
    private readonly notify = inject(NotificationService);

    readonly activeFilter = signal<'all' | 'active' | 'completed' | 'failed'>('all');
    readonly searchQuery = signal('');
    readonly agentFilter = signal('');
    readonly showCreateForm = signal(false);
    readonly toggleCreateForm = (): void => { this.showCreateForm.set(true); };
    readonly creating = signal(false);
    readonly retrying = signal<Set<string>>(new Set());
    protected createAgentId = '';
    protected createDescription = '';

    protected readonly pipelineStages = [
        { key: 'branching', label: 'Branch' },
        { key: 'running', label: 'Implement' },
        { key: 'validating', label: 'Validate' },
        { key: 'completed', label: 'Done' },
    ] as const;

    private readonly stageOrder = ['pending', 'queued', 'branching', 'running', 'validating', 'completed'];

    private agentNameCache: Record<string, string> = {};
    private expandedErrors = new Set<string>();
    private expandedDetails = new Set<string>();

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

    readonly agentOptions = computed(() => {
        const seen = new Map<string, string>();
        for (const t of this.taskService.tasks()) {
            if (!seen.has(t.agentId)) seen.set(t.agentId, this.getAgentName(t.agentId));
        }
        return Array.from(seen.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
    });

    readonly filteredTasks = computed(() => {
        let tasks: WorkTask[];
        switch (this.activeFilter()) {
            case 'active': tasks = this.activeTasks(); break;
            case 'completed': tasks = this.completedTasks(); break;
            case 'failed': tasks = this.failedTasks(); break;
            default: tasks = this.allTasks();
        }
        const agent = this.agentFilter();
        if (agent) tasks = tasks.filter((t) => t.agentId === agent);
        const query = this.searchQuery().toLowerCase().trim();
        if (query) tasks = tasks.filter((t) =>
            t.description.toLowerCase().includes(query) ||
            (t.branchName?.toLowerCase().includes(query) ?? false) ||
            (t.error?.toLowerCase().includes(query) ?? false) ||
            (t.summary?.toLowerCase().includes(query) ?? false)
        );
        return tasks;
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
        this.setSmartDefaultFilter();
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

    protected isActiveStatus(status: string): boolean {
        return ['pending', 'branching', 'running', 'validating'].includes(status);
    }

    protected isInterrupted(task: WorkTask): boolean {
        return task.status === 'failed' && task.error?.includes('Interrupted by server restart') === true;
    }

    protected getDisplayStatus(task: WorkTask): string {
        return this.isInterrupted(task) ? 'interrupted' : task.status;
    }

    protected getStageState(task: WorkTask, stageKey: string): 'pending' | 'active' | 'done' | 'failed' {
        const taskIdx = this.stageOrder.indexOf(task.status);
        const stageIdx = this.stageOrder.indexOf(stageKey);

        if (task.status === 'failed') {
            // Find which stage it failed at — show stages before as done, current as failed
            const failedAt = Math.max(taskIdx, this.stageOrder.indexOf('branching'));
            if (stageIdx < failedAt) return 'done';
            if (stageKey === 'completed') return 'pending';
            // The stage it was on when it failed
            if (stageIdx === failedAt || (task.iterationCount > 0 && stageKey === 'validating')) return 'failed';
            return 'pending';
        }

        if (stageIdx < taskIdx) return 'done';
        if (stageKey === task.status) return task.status === 'completed' ? 'done' : 'active';
        return 'pending';
    }

    protected getConnectorState(task: WorkTask, fromStageKey: string): 'pending' | 'active' | 'done' {
        const taskIdx = this.stageOrder.indexOf(task.status);
        const fromIdx = this.stageOrder.indexOf(fromStageKey);

        if (task.status === 'completed') return fromIdx < this.stageOrder.indexOf('completed') ? 'done' : 'pending';
        if (task.status === 'failed') return fromIdx < taskIdx ? 'done' : 'pending';
        if (fromIdx === taskIdx - 1) return 'active';
        if (fromIdx < taskIdx) return 'done';
        return 'pending';
    }

    protected truncateBranch(name: string): string {
        if (name.length <= 30) return name;
        return '...' + name.slice(-27);
    }

    protected getBranchUrl(task: WorkTask): string {
        if (!task.branchName) return '#';
        const repo = task.projectId || 'CorvidLabs/corvid-agent';
        return `https://github.com/${repo}/tree/${encodeURIComponent(task.branchName)}`;
    }

    protected getDuration(task: WorkTask): string {
        if (!task.completedAt) return '';
        const ms = new Date(task.completedAt).getTime() - new Date(task.createdAt).getTime();
        if (ms < 0) return '';
        const seconds = Math.floor(ms / 1000);
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        return `${hours}h ${remainingMinutes}m`;
    }

    protected getErrorFirstLine(error: string): string {
        const firstLine = error.split('\n')[0];
        return firstLine.length > 120 ? firstLine.slice(0, 117) + '...' : firstLine;
    }

    protected hasMultipleLines(error: string): boolean {
        return error.includes('\n') || error.length > 120;
    }

    protected isErrorExpanded(taskId: string): boolean {
        return this.expandedErrors.has(taskId);
    }

    protected toggleError(taskId: string): void {
        if (this.expandedErrors.has(taskId)) {
            this.expandedErrors.delete(taskId);
        } else {
            this.expandedErrors.add(taskId);
        }
    }

    protected isDetailExpanded(taskId: string): boolean {
        return this.expandedDetails.has(taskId);
    }

    protected toggleDetail(taskId: string): void {
        if (this.expandedDetails.has(taskId)) {
            this.expandedDetails.delete(taskId);
        } else {
            this.expandedDetails.add(taskId);
        }
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

    protected async onRetry(taskId: string): Promise<void> {
        this.retrying.update((s) => new Set(s).add(taskId));
        try {
            await this.taskService.retryTask(taskId);
            this.notify.success('Work task retried');
        } catch (e) {
            this.notify.error('Failed to retry task', String(e));
        } finally {
            this.retrying.update((s) => {
                const next = new Set(s);
                next.delete(taskId);
                return next;
            });
        }
    }

    private setSmartDefaultFilter(): void {
        if (this.activeTasks().length > 0) {
            this.activeFilter.set('active');
        } else if (this.completedTasks().length > 0) {
            this.activeFilter.set('completed');
        }
    }
}

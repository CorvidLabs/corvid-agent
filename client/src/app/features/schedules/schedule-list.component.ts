import { Component, ChangeDetectionStrategy, inject, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SlicePipe } from '@angular/common';
import { ScheduleService } from '../../core/services/schedule.service';
import { AgentService } from '../../core/services/agent.service';
import { NotificationService } from '../../core/services/notification.service';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import type { AgentSchedule, ScheduleExecution, ScheduleAction, ScheduleActionType, ScheduleApprovalPolicy } from '../../core/models/schedule.model';

@Component({
    selector: 'app-schedule-list',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, FormsModule, SlicePipe, RelativeTimePipe],
    template: `
        <div class="schedules">
            <div class="schedules__header">
                <h2>Automation Schedules</h2>
                <button class="create-btn" (click)="showCreateForm.set(!showCreateForm())">
                    {{ showCreateForm() ? 'Cancel' : '+ New Schedule' }}
                </button>
            </div>

            <!-- Pending Approvals Banner -->
            @if (scheduleService.pendingApprovals().length > 0) {
                <div class="approvals-banner">
                    <h3>Pending Approvals ({{ scheduleService.pendingApprovals().length }})</h3>
                    @for (exec of scheduleService.pendingApprovals(); track exec.id) {
                        <div class="approval-card">
                            <div class="approval-info">
                                <span class="approval-type" [attr.data-type]="exec.actionType">{{ exec.actionType }}</span>
                                <span class="approval-desc">{{ exec.actionInput['description'] ?? exec.actionType }}</span>
                            </div>
                            <div class="approval-actions">
                                <button class="approve-btn" (click)="resolveApproval(exec.id, true)">Approve</button>
                                <button class="deny-btn" (click)="resolveApproval(exec.id, false)">Deny</button>
                            </div>
                        </div>
                    }
                </div>
            }

            <!-- Create Form -->
            @if (showCreateForm()) {
                <div class="create-form">
                    <h3>Create Schedule</h3>
                    <div class="form-grid">
                        <div class="form-field">
                            <label>Agent</label>
                            <select [(ngModel)]="formAgentId" class="form-select">
                                <option value="">Select agent...</option>
                                @for (agent of agentService.agents(); track agent.id) {
                                    <option [value]="agent.id">{{ agent.name }}</option>
                                }
                            </select>
                        </div>
                        <div class="form-field">
                            <label>Name</label>
                            <input [(ngModel)]="formName" class="form-input" placeholder="e.g. Daily PR Review" />
                        </div>
                        <div class="form-field span-2">
                            <label>Description</label>
                            <input [(ngModel)]="formDescription" class="form-input" placeholder="What this schedule does..." />
                        </div>
                        <div class="form-field">
                            <label>Schedule Type</label>
                            <div class="schedule-type-toggle">
                                <button
                                    class="type-btn"
                                    [class.type-btn--active]="formScheduleType() === 'cron'"
                                    (click)="formScheduleType.set('cron')"
                                >Cron</button>
                                <button
                                    class="type-btn"
                                    [class.type-btn--active]="formScheduleType() === 'interval'"
                                    (click)="formScheduleType.set('interval')"
                                >Interval</button>
                            </div>
                        </div>
                        <div class="form-field">
                            @if (formScheduleType() === 'cron') {
                                <label>Cron Expression</label>
                                <input [(ngModel)]="formCron" class="form-input mono" placeholder="0 9 * * 1-5" />
                                <span class="form-hint">min hour dom mon dow (e.g. weekdays at 9am)</span>
                            } @else {
                                <label>Interval (minutes)</label>
                                <input type="number" [(ngModel)]="formIntervalMin" class="form-input" min="1" placeholder="60" />
                            }
                        </div>
                        <div class="form-field">
                            <label>Approval Policy</label>
                            <select [(ngModel)]="formApprovalPolicy" class="form-select">
                                <option value="owner_approve">Owner Approve (recommended)</option>
                                <option value="auto">Auto (no approval needed)</option>
                                <option value="council_approve">Council Approve (all actions)</option>
                            </select>
                        </div>
                        <div class="form-field">
                            <label>Max Executions</label>
                            <input type="number" [(ngModel)]="formMaxExec" class="form-input" min="1" placeholder="Unlimited" />
                        </div>
                    </div>

                    <!-- Actions -->
                    <h4>Actions</h4>
                    @for (action of formActions(); track $index) {
                        <div class="action-row">
                            <select [(ngModel)]="action.type" class="form-select action-type-select">
                                @for (at of actionTypes; track at.value) {
                                    <option [value]="at.value">{{ at.label }}</option>
                                }
                            </select>
                            @if (action.type === 'star_repo' || action.type === 'fork_repo' || action.type === 'review_prs' || action.type === 'github_suggest') {
                                <input [(ngModel)]="action.reposStr" class="form-input" placeholder="owner/repo, owner/repo2" />
                            }
                            @if (action.type === 'work_task' || action.type === 'github_suggest') {
                                <input [(ngModel)]="action.description" class="form-input" placeholder="Description..." />
                            }
                            @if (action.type === 'send_message') {
                                <input [(ngModel)]="action.toAgentId" class="form-input" placeholder="Agent ID" />
                                <input [(ngModel)]="action.message" class="form-input" placeholder="Message..." />
                            }
                            <button class="remove-action-btn" (click)="removeAction($index)">×</button>
                        </div>
                    }
                    <button class="add-action-btn" (click)="addAction()">+ Add Action</button>

                    <div class="form-buttons">
                        <button class="save-btn" [disabled]="creating()" (click)="create()">
                            {{ creating() ? 'Creating...' : 'Create Schedule' }}
                        </button>
                    </div>
                </div>
            }

            <!-- Filters -->
            <div class="schedules__filters">
                <button
                    class="filter-btn"
                    [class.filter-btn--active]="activeFilter() === 'all'"
                    (click)="activeFilter.set('all')"
                >All ({{ scheduleService.schedules().length }})</button>
                <button
                    class="filter-btn"
                    [class.filter-btn--active]="activeFilter() === 'active'"
                    (click)="activeFilter.set('active')"
                >Active ({{ activeCount() }})</button>
                <button
                    class="filter-btn"
                    [class.filter-btn--active]="activeFilter() === 'paused'"
                    (click)="activeFilter.set('paused')"
                >Paused ({{ pausedCount() }})</button>
            </div>

            @if (scheduleService.loading()) {
                <p class="loading">Loading schedules...</p>
            } @else if (filteredSchedules().length === 0) {
                <div class="empty">
                    <p>No {{ activeFilter() === 'all' ? '' : activeFilter() + ' ' }}schedules found.</p>
                    <p class="empty-hint">Create a schedule to automate agent tasks like PR reviews, repo starring, and more.</p>
                </div>
            } @else {
                <div class="schedule-list">
                    @for (schedule of filteredSchedules(); track schedule.id) {
                        <div class="schedule-card" [attr.data-status]="schedule.status"
                            [class.schedule-card--expanded]="expandedScheduleId() === schedule.id"
                            (click)="toggleSchedule(schedule.id)">
                            <div class="schedule-card__header">
                                <div class="schedule-card__title">
                                    <span class="schedule-status" [attr.data-status]="schedule.status">{{ schedule.status }}</span>
                                    <h3>{{ schedule.name }}</h3>
                                    <span class="expand-indicator">{{ expandedScheduleId() === schedule.id ? '\u25B2' : '\u25BC' }}</span>
                                </div>
                                <div class="schedule-card__actions">
                                    @if (schedule.status === 'active') {
                                        <button class="action-btn" (click)="toggleStatus(schedule, 'paused'); $event.stopPropagation()">Pause</button>
                                    } @else if (schedule.status === 'paused') {
                                        <button class="action-btn action-btn--resume" (click)="toggleStatus(schedule, 'active'); $event.stopPropagation()">Resume</button>
                                    }
                                    <button class="action-btn action-btn--danger" (click)="deleteSchedule(schedule); $event.stopPropagation()">Delete</button>
                                </div>
                            </div>
                            @if (schedule.description) {
                                <p class="schedule-desc">{{ schedule.description }}</p>
                            }
                            <div class="schedule-meta">
                                <div class="meta-item">
                                    <span class="meta-label">Timing</span>
                                    <span class="meta-value mono">{{ schedule.cronExpression || (schedule.intervalMs ? 'Every ' + (schedule.intervalMs / 60000) + 'min' : 'N/A') }}</span>
                                </div>
                                <div class="meta-item">
                                    <span class="meta-label">Executions</span>
                                    <span class="meta-value">{{ schedule.executionCount }}{{ schedule.maxExecutions ? ' / ' + schedule.maxExecutions : '' }}</span>
                                </div>
                                <div class="meta-item">
                                    <span class="meta-label">Approval</span>
                                    <span class="meta-value approval-badge" [attr.data-policy]="schedule.approvalPolicy">{{ schedule.approvalPolicy }}</span>
                                </div>
                                @if (schedule.nextRunAt) {
                                    <div class="meta-item">
                                        <span class="meta-label">Next Run</span>
                                        <span class="meta-value">{{ schedule.nextRunAt | relativeTime }}</span>
                                    </div>
                                }
                                @if (schedule.lastRunAt) {
                                    <div class="meta-item">
                                        <span class="meta-label">Last Run</span>
                                        <span class="meta-value">{{ schedule.lastRunAt | relativeTime }}</span>
                                    </div>
                                }
                            </div>
                            <div class="schedule-actions-list">
                                @for (action of schedule.actions; track $index) {
                                    <span class="action-tag" [attr.data-type]="action.type">
                                        {{ action.type }}
                                        @if (action.repos && action.repos.length) { ({{ action.repos.join(', ') }}) }
                                    </span>
                                }
                            </div>
                            @if (expandedScheduleId() === schedule.id) {
                                <div class="schedule-execs" (click)="$event.stopPropagation()">
                                    @if (loadingExecs()) {
                                        <p class="loading-execs">Loading executions...</p>
                                    } @else if (scheduleExecs().length === 0) {
                                        <p class="no-execs">No executions yet.</p>
                                    } @else {
                                        <h4 class="execs-heading">Execution History</h4>
                                        @for (exec of scheduleExecs(); track exec.id) {
                                            <div class="exec-row exec-row--clickable" [attr.data-status]="exec.status" (click)="toggleExecution(exec.id)">
                                                <span class="exec-type">{{ exec.actionType }}</span>
                                                <span class="exec-status" [attr.data-status]="exec.status">{{ exec.status }}</span>
                                                <span class="exec-time">{{ exec.startedAt | relativeTime }}</span>
                                                @if (exec.result && expandedExecId() !== exec.id) {
                                                    <span class="exec-result">{{ exec.result | slice:0:100 }}</span>
                                                }
                                                @if (exec.sessionId) {
                                                    <a class="exec-link" [routerLink]="['/sessions', exec.sessionId]" (click)="$event.stopPropagation()">Session</a>
                                                }
                                            </div>
                                            @if (expandedExecId() === exec.id && exec.result) {
                                                <div class="exec-detail">
                                                    <pre class="exec-detail__result">{{ exec.result }}</pre>
                                                </div>
                                            }
                                        }
                                    }
                                </div>
                            }
                        </div>
                    }
                </div>
            }

            <!-- Execution History -->
            @if (scheduleService.executions().length > 0) {
                <div class="exec-section">
                    <h3>Recent Executions</h3>
                    <div class="exec-list">
                        @for (exec of scheduleService.executions().slice(0, 20); track exec.id) {
                            <div class="exec-row exec-row--clickable" [attr.data-status]="exec.status" (click)="toggleExecution(exec.id)">
                                <span class="exec-type">{{ exec.actionType }}</span>
                                <span class="exec-status" [attr.data-status]="exec.status">{{ exec.status }}</span>
                                <span class="exec-time">{{ exec.startedAt | relativeTime }}</span>
                                @if (exec.result && expandedExecId() !== exec.id) {
                                    <span class="exec-result">{{ exec.result | slice:0:100 }}</span>
                                }
                                @if (exec.sessionId) {
                                    <a class="exec-link" [routerLink]="['/sessions', exec.sessionId]" (click)="$event.stopPropagation()">Session</a>
                                }
                            </div>
                            @if (expandedExecId() === exec.id && exec.result) {
                                <div class="exec-detail">
                                    <pre class="exec-detail__result">{{ exec.result }}</pre>
                                </div>
                            }
                        }
                    </div>
                </div>
            }
        </div>
    `,
    styles: `
        .schedules{padding:1.5rem;max-width:1100px}
        .schedules__header{display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem}
        .schedules__header h2{margin:0;color:var(--text-primary)} .loading{color:var(--text-secondary)}
        .create-btn,.save-btn{padding:.5rem 1rem;background:var(--accent-cyan-dim);color:var(--accent-cyan);border:1px solid var(--accent-cyan);border-radius:var(--radius);font-size:.75rem;font-weight:600;cursor:pointer;font-family:inherit}
        .create-btn:hover,.save-btn:hover:not(:disabled){background:rgba(0,229,255,.2)} .save-btn:disabled{opacity:.5;cursor:not-allowed}
        .approvals-banner{background:var(--accent-amber-dim);border:1px solid var(--accent-amber);border-radius:var(--radius-lg);padding:1rem;margin-bottom:1.25rem}
        .approvals-banner h3{margin:0 0 .75rem;color:var(--accent-amber);font-size:.8rem}
        .approval-card{display:flex;align-items:center;justify-content:space-between;padding:.5rem;background:var(--bg-surface);border-radius:var(--radius);margin-bottom:.5rem}
        .approval-info{display:flex;gap:.5rem;align-items:center}
        .approval-type{font-size:.65rem;font-weight:700;text-transform:uppercase;padding:2px 6px;border-radius:var(--radius-sm);background:var(--accent-magenta-dim);color:var(--accent-magenta)}
        .approval-desc{font-size:.75rem;color:var(--text-secondary)} .approval-actions{display:flex;gap:.35rem}
        .approve-btn,.deny-btn{padding:.3rem .75rem;border-radius:var(--radius);font-size:.7rem;font-weight:600;cursor:pointer;font-family:inherit}
        .approve-btn{background:var(--accent-green-dim);color:var(--accent-green);border:1px solid var(--accent-green)}
        .deny-btn{background:var(--accent-red-dim);color:var(--accent-red);border:1px solid var(--accent-red)}
        .create-form{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1.25rem;margin-bottom:1.25rem}
        .create-form h3{margin:0 0 1rem;color:var(--text-primary);font-size:.85rem} .create-form h4{margin:1rem 0 .5rem;color:var(--text-secondary);font-size:.75rem}
        .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:.75rem} .span-2{grid-column:span 2}
        .form-field{display:flex;flex-direction:column;gap:.25rem} .form-field label{font-size:.65rem;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.05em}
        .form-input,.form-select{padding:.45rem;background:var(--bg-input);border:1px solid var(--border-bright);border-radius:var(--radius);color:var(--text-primary);font-size:.8rem;font-family:inherit}
        .form-input:focus,.form-select:focus{border-color:var(--accent-cyan);outline:none} .form-hint{font-size:.6rem;color:var(--text-tertiary)} .mono{font-family:monospace}
        .schedule-type-toggle{display:flex;gap:.35rem}
        .type-btn,.filter-btn{padding:.35rem .65rem;background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-secondary);font-size:.7rem;cursor:pointer;font-family:inherit}
        .type-btn--active,.filter-btn--active{border-color:var(--accent-cyan);color:var(--accent-cyan);background:var(--accent-cyan-dim)}
        .action-row{display:flex;gap:.5rem;align-items:center;margin-bottom:.5rem} .action-type-select{min-width:140px}
        .remove-action-btn{padding:.25rem .5rem;background:var(--accent-red-dim);color:var(--accent-red);border:1px solid var(--accent-red);border-radius:var(--radius-sm);cursor:pointer;font-size:.9rem;font-family:inherit;line-height:1}
        .add-action-btn{padding:.35rem .75rem;background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius);color:var(--text-secondary);font-size:.7rem;cursor:pointer;font-family:inherit;margin-top:.25rem}
        .form-buttons{margin-top:1rem} .save-btn{text-transform:uppercase}
        .schedules__filters{display:flex;gap:.35rem;margin-bottom:1rem}
        .empty{text-align:center;padding:3rem;color:var(--text-tertiary)} .empty-hint{font-size:.75rem;margin-top:.5rem}
        .schedule-list{display:flex;flex-direction:column;gap:.75rem}
        .schedule-card{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1rem}
        .schedule-card[data-status="active"]{border-left:3px solid var(--accent-green)}
        .schedule-card[data-status="paused"]{border-left:3px solid var(--accent-amber)}
        .schedule-card[data-status="failed"]{border-left:3px solid var(--accent-red)}
        .schedule-card__header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.5rem}
        .schedule-card__title{display:flex;align-items:center;gap:.5rem} .schedule-card__title h3{margin:0;font-size:.9rem;color:var(--text-primary)}
        .schedule-card__actions{display:flex;gap:.35rem}
        .schedule-status{font-size:.6rem;font-weight:700;text-transform:uppercase;padding:2px 8px;border-radius:var(--radius-sm);border:1px solid}
        .schedule-status[data-status="active"]{color:var(--accent-green);background:var(--accent-green-dim);border-color:var(--accent-green)}
        .schedule-status[data-status="paused"]{color:var(--accent-amber);background:var(--accent-amber-dim);border-color:var(--accent-amber)}
        .schedule-status[data-status="failed"]{color:var(--accent-red);background:var(--accent-red-dim);border-color:var(--accent-red)}
        .action-btn{padding:.3rem .6rem;background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-secondary);font-size:.65rem;cursor:pointer;font-family:inherit}
        .action-btn--resume{border-color:var(--accent-green);color:var(--accent-green)}
        .action-btn--danger{border-color:var(--accent-red);color:var(--accent-red)}
        .schedule-desc{margin:0 0 .5rem;font-size:.75rem;color:var(--text-secondary)}
        .schedule-meta{display:flex;flex-wrap:wrap;gap:1rem;margin-bottom:.5rem}
        .meta-item{display:flex;flex-direction:column;gap:.1rem} .meta-label{font-size:.55rem;color:var(--text-tertiary);text-transform:uppercase}
        .meta-value{font-size:.75rem;color:var(--text-primary);font-weight:600}
        .approval-badge[data-policy="auto"]{color:var(--accent-green)} .approval-badge[data-policy="owner_approve"]{color:var(--accent-cyan)}
        .schedule-actions-list{display:flex;gap:.35rem;flex-wrap:wrap}
        .action-tag{font-size:.6rem;padding:2px 6px;border-radius:var(--radius-sm);background:var(--bg-raised);color:var(--text-secondary);border:1px solid var(--border)}
        .action-tag[data-type="star_repo"]{color:var(--accent-amber);border-color:var(--accent-amber)}
        .action-tag[data-type="review_prs"]{color:var(--accent-cyan);border-color:var(--accent-cyan)}
        .action-tag[data-type="work_task"]{color:var(--accent-green);border-color:var(--accent-green)}
        .exec-section{margin-top:2rem;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1.25rem}
        .exec-section h3{margin:0 0 .75rem;color:var(--text-primary);font-size:.85rem} .exec-list{display:flex;flex-direction:column;gap:.35rem}
        .exec-row{display:flex;align-items:center;gap:.5rem;padding:.5rem;background:var(--bg-raised);border-radius:var(--radius);font-size:.7rem}
        .exec-type{font-weight:600;color:var(--text-secondary);min-width:100px}
        .exec-status{font-size:.6rem;font-weight:700;text-transform:uppercase;padding:1px 6px;border-radius:var(--radius-sm)}
        .exec-status[data-status="running"]{color:var(--accent-cyan);background:var(--accent-cyan-dim)}
        .exec-status[data-status="completed"]{color:var(--accent-green);background:var(--accent-green-dim)}
        .exec-status[data-status="failed"]{color:var(--accent-red);background:var(--accent-red-dim)}
        .exec-status[data-status="awaiting_approval"]{color:var(--accent-amber);background:var(--accent-amber-dim)}
        .exec-time{color:var(--text-tertiary);font-size:.65rem} .exec-result{color:var(--text-secondary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .exec-link{font-size:.65rem;color:var(--accent-cyan);text-decoration:none;border:1px solid var(--accent-cyan);padding:1px 6px;border-radius:var(--radius-sm)}
        .schedule-card{cursor:pointer;transition:border-color .15s}
        .schedule-card--expanded{border-color:var(--accent-cyan)}
        .expand-indicator{font-size:.55rem;color:var(--text-tertiary);margin-left:.25rem}
        .exec-row--clickable{cursor:pointer;transition:background .15s}
        .exec-row--clickable:hover{background:var(--bg-hover)}
        .schedule-execs{margin-top:.75rem;border-top:1px solid var(--border);padding-top:.75rem}
        .execs-heading{margin:0 0 .5rem;color:var(--text-secondary);font-size:.7rem;text-transform:uppercase;letter-spacing:.04em}
        .loading-execs,.no-execs{font-size:.7rem;color:var(--text-tertiary);margin:0}
        .exec-detail{padding:.5rem;background:var(--bg-base);border-radius:var(--radius);margin-top:.25rem;margin-bottom:.35rem}
        .exec-detail__result{margin:0;font-size:.7rem;color:var(--text-secondary);white-space:pre-wrap;word-break:break-word;max-height:300px;overflow-y:auto}
        @media(max-width:768px){.form-grid{grid-template-columns:1fr}.span-2{grid-column:span 1}.action-row{flex-direction:column}.schedule-meta{flex-direction:column;gap:.5rem}}
    `,
})
export class ScheduleListComponent implements OnInit, OnDestroy {
    protected readonly scheduleService = inject(ScheduleService);
    protected readonly agentService = inject(AgentService);
    private readonly notifications = inject(NotificationService);

    readonly activeFilter = signal<'all' | 'active' | 'paused'>('all');
    readonly showCreateForm = signal(false);
    readonly creating = signal(false);
    readonly formScheduleType = signal<'cron' | 'interval'>('cron');

    readonly expandedScheduleId = signal<string | null>(null);
    readonly expandedExecId = signal<string | null>(null);
    readonly scheduleExecs = signal<ScheduleExecution[]>([]);
    readonly loadingExecs = signal(false);

    // Form fields
    formAgentId = '';
    formName = '';
    formDescription = '';
    formCron = '';
    formIntervalMin = 60;
    formApprovalPolicy: ScheduleApprovalPolicy = 'owner_approve';
    formMaxExec: number | null = null;

    readonly formActions = signal<Array<{
        type: ScheduleActionType;
        reposStr?: string;
        description?: string;
        toAgentId?: string;
        message?: string;
    }>>([]);

    readonly actionTypes = [
        { value: 'star_repo', label: 'Star Repos' },
        { value: 'fork_repo', label: 'Fork Repos' },
        { value: 'review_prs', label: 'Review PRs' },
        { value: 'work_task', label: 'Work Task (PR)' },
        { value: 'github_suggest', label: 'GitHub Suggestions' },
        { value: 'send_message', label: 'Send Message' },
        { value: 'council_launch', label: 'Council Launch' },
    ];

    readonly activeCount = computed(() =>
        this.scheduleService.schedules().filter((s) => s.status === 'active').length,
    );
    readonly pausedCount = computed(() =>
        this.scheduleService.schedules().filter((s) => s.status === 'paused').length,
    );

    readonly filteredSchedules = computed(() => {
        const filter = this.activeFilter();
        const all = this.scheduleService.schedules();
        if (filter === 'all') return all;
        return all.filter((s) => s.status === filter);
    });

    ngOnInit(): void {
        this.scheduleService.loadSchedules();
        this.scheduleService.loadExecutions();
        this.scheduleService.startListening();
        this.agentService.loadAgents();
    }

    ngOnDestroy(): void {
        this.scheduleService.stopListening();
    }

    addAction(): void {
        this.formActions.update((actions) => [...actions, { type: 'review_prs' as ScheduleActionType }]);
    }

    removeAction(index: number): void {
        this.formActions.update((actions) => actions.filter((_, i) => i !== index));
    }

    async create(): Promise<void> {
        if (!this.formAgentId || !this.formName || this.formActions().length === 0) {
            this.notifications.error('Please fill in agent, name, and at least one action');
            return;
        }

        this.creating.set(true);
        try {
            const actions: ScheduleAction[] = this.formActions().map((a) => ({
                type: a.type,
                repos: a.reposStr?.split(',').map((r) => r.trim()).filter(Boolean),
                description: a.description,
                toAgentId: a.toAgentId,
                message: a.message,
            }));

            await this.scheduleService.createSchedule({
                agentId: this.formAgentId,
                name: this.formName,
                description: this.formDescription || undefined,
                cronExpression: this.formScheduleType() === 'cron' ? this.formCron : undefined,
                intervalMs: this.formScheduleType() === 'interval' ? this.formIntervalMin * 60000 : undefined,
                actions,
                approvalPolicy: this.formApprovalPolicy,
                maxExecutions: this.formMaxExec ?? undefined,
            });

            this.notifications.success('Schedule created');
            this.showCreateForm.set(false);
            this.resetForm();
        } catch (err) {
            this.notifications.error('Failed to create schedule');
        } finally {
            this.creating.set(false);
        }
    }

    async toggleStatus(schedule: AgentSchedule, status: 'active' | 'paused'): Promise<void> {
        try {
            await this.scheduleService.updateSchedule(schedule.id, { status });
            this.notifications.success(`Schedule ${status === 'active' ? 'resumed' : 'paused'}`);
        } catch {
            this.notifications.error('Failed to update schedule');
        }
    }

    async deleteSchedule(schedule: AgentSchedule): Promise<void> {
        if (!confirm(`Delete schedule "${schedule.name}"?`)) return;
        try {
            await this.scheduleService.deleteSchedule(schedule.id);
            this.notifications.success('Schedule deleted');
        } catch {
            this.notifications.error('Failed to delete schedule');
        }
    }

    async toggleSchedule(scheduleId: string): Promise<void> {
        if (this.expandedScheduleId() === scheduleId) {
            this.expandedScheduleId.set(null);
            return;
        }
        this.expandedScheduleId.set(scheduleId);
        this.expandedExecId.set(null);
        this.loadingExecs.set(true);
        try {
            const execs = await this.scheduleService.getScheduleExecutions(scheduleId);
            this.scheduleExecs.set(execs);
        } catch {
            this.scheduleExecs.set([]);
        } finally {
            this.loadingExecs.set(false);
        }
    }

    toggleExecution(execId: string): void {
        this.expandedExecId.set(this.expandedExecId() === execId ? null : execId);
    }

    async resolveApproval(executionId: string, approved: boolean): Promise<void> {
        try {
            await this.scheduleService.resolveApproval(executionId, approved);
            this.notifications.success(approved ? 'Execution approved' : 'Execution denied');
        } catch {
            this.notifications.error('Failed to resolve approval');
        }
    }

    private resetForm(): void {
        this.formAgentId = '';
        this.formName = '';
        this.formDescription = '';
        this.formCron = '';
        this.formIntervalMin = 60;
        this.formApprovalPolicy = 'owner_approve';
        this.formMaxExec = null;
        this.formActions.set([]);
    }
}

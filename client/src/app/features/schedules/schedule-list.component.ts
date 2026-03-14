import { Component, ChangeDetectionStrategy, inject, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SlicePipe } from '@angular/common';
import { ScheduleService } from '../../core/services/schedule.service';
import { AgentService } from '../../core/services/agent.service';
import { NotificationService } from '../../core/services/notification.service';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import type { AgentSchedule, ScheduleExecution, ScheduleAction, ScheduleActionType, ScheduleApprovalPolicy, ScheduleTriggerEvent } from '../../core/models/schedule.model';
import { SkeletonComponent } from '../../shared/components/skeleton.component';

@Component({
    selector: 'app-schedule-list',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, FormsModule, SlicePipe, RelativeTimePipe, EmptyStateComponent, SkeletonComponent],
    template: `
        <div class="schedules">
            <div class="schedules__header">
                <h2>Automation Schedules</h2>
                <button class="create-btn" (click)="showCreateForm.set(!showCreateForm())">
                    {{ showCreateForm() ? 'Cancel' : '+ New Schedule' }}
                </button>
            </div>

            <!-- Execution Stats Summary -->
            @if (execStats().total > 0) {
                <div class="exec-stats">
                    <div class="exec-stats__item">
                        <span class="exec-stats__value">{{ execStats().total }}</span>
                        <span class="exec-stats__label">Total Runs</span>
                    </div>
                    <div class="exec-stats__item exec-stats__item--success">
                        <span class="exec-stats__value">{{ execStats().successRate }}%</span>
                        <span class="exec-stats__label">Success Rate</span>
                    </div>
                    <div class="exec-stats__item">
                        <span class="exec-stats__value">{{ execStats().completed }}</span>
                        <span class="exec-stats__label">Completed</span>
                    </div>
                    <div class="exec-stats__item exec-stats__item--fail">
                        <span class="exec-stats__value">{{ execStats().failed }}</span>
                        <span class="exec-stats__label">Failed</span>
                    </div>
                    <div class="exec-stats__item">
                        <span class="exec-stats__value">{{ execStats().running }}</span>
                        <span class="exec-stats__label">Running</span>
                    </div>
                    <div class="exec-stats__bar">
                        <div class="exec-stats__bar-fill exec-stats__bar-fill--success" [style.width.%]="execStats().successRate"></div>
                        <div class="exec-stats__bar-fill exec-stats__bar-fill--fail" [style.width.%]="execStats().failRate"></div>
                    </div>
                </div>
            }

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
                                <button class="type-btn" [class.type-btn--active]="formScheduleType() === 'cron'" (click)="formScheduleType.set('cron')">Cron</button>
                                <button class="type-btn" [class.type-btn--active]="formScheduleType() === 'interval'" (click)="formScheduleType.set('interval')">Interval</button>
                            </div>
                        </div>
                        <div class="form-field">
                            @if (formScheduleType() === 'cron') {
                                <label>Cron Expression</label>
                                <input [(ngModel)]="formCron" class="form-input mono" placeholder="0 9 * * 1-5" />
                                <span class="form-hint" [class.form-hint--active]="cronPreview()">{{ cronPreview() || 'min hour dom mon dow (e.g. 0 9 * * 1-5 = weekdays at 9am)' }}</span>
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
                    <h4>Actions</h4>
                    @for (action of formActions(); track $index) {
                        <div class="action-row">
                            <select [(ngModel)]="action.type" class="form-select action-type-select">
                                @for (at of actionTypes; track at.value) { <option [value]="at.value">{{ at.label }}</option> }
                            </select>
                            @if (action.type === 'star_repo' || action.type === 'fork_repo' || action.type === 'review_prs' || action.type === 'github_suggest') {
                                <input [(ngModel)]="action.reposStr" class="form-input" placeholder="owner/repo, owner/repo2" />
                            }
                            @if (action.type === 'work_task' || action.type === 'codebase_review' || action.type === 'dependency_audit' || action.type === 'improvement_loop' || action.type === 'github_suggest' || action.type === 'custom') {
                                <input [(ngModel)]="action.projectId" class="form-input" placeholder="Project ID (optional)" />
                            }
                            @if (action.type === 'work_task' || action.type === 'github_suggest' || action.type === 'codebase_review' || action.type === 'dependency_audit') {
                                <input [(ngModel)]="action.description" class="form-input" placeholder="Description..." />
                            }
                            @if (action.type === 'council_launch') {
                                <input [(ngModel)]="action.councilId" class="form-input" placeholder="Council ID" />
                                <input [(ngModel)]="action.projectId" class="form-input" placeholder="Project ID" />
                                <input [(ngModel)]="action.description" class="form-input" placeholder="Prompt / Description..." />
                            }
                            @if (action.type === 'send_message') {
                                <input [(ngModel)]="action.toAgentId" class="form-input" placeholder="Agent ID" />
                                <input [(ngModel)]="action.message" class="form-input" placeholder="Message..." />
                            }
                            @if (action.type === 'review_prs') { <input type="number" [(ngModel)]="action.maxPrs" class="form-input" placeholder="Max PRs (default 5)" min="1" max="50" style="max-width:140px" /> }
                            @if (action.type === 'github_suggest') { <label class="form-checkbox"><input type="checkbox" [(ngModel)]="action.autoCreatePr" /> Auto-create PRs</label> }
                            @if (action.type === 'improvement_loop') {
                                <input type="number" [(ngModel)]="action.maxImprovementTasks" class="form-input" placeholder="Max tasks (1-5)" min="1" max="5" style="max-width:140px" />
                                <input [(ngModel)]="action.focusArea" class="form-input" placeholder="Focus area (e.g. type safety)" />
                            }
                            @if (action.type === 'custom') { <textarea [(ngModel)]="action.prompt" class="form-input" placeholder="Custom prompt..." rows="2"></textarea> }
                            <button class="remove-action-btn" (click)="removeAction($index)">&times;</button>
                        </div>
                    }
                    <button class="add-action-btn" (click)="addAction()">+ Add Action</button>
                    <h4>Event Triggers (optional)</h4>
                    @for (trigger of formTriggerEvents(); track $index) {
                        <div class="action-row">
                            <select [(ngModel)]="trigger.source" class="form-select" style="min-width:140px">
                                <option value="github_webhook">GitHub Webhook</option>
                                <option value="github_poll">GitHub Poll</option>
                            </select>
                            <input [(ngModel)]="trigger.event" class="form-input" placeholder="Event type (e.g. issue_comment)" />
                            <input [(ngModel)]="trigger.repo" class="form-input" placeholder="Repo filter (optional, owner/name)" />
                            <button class="remove-action-btn" (click)="removeTriggerEvent($index)">&times;</button>
                        </div>
                    }
                    <button class="add-action-btn" (click)="addTriggerEvent()">+ Add Trigger Event</button>
                    <div class="form-buttons">
                        <button class="save-btn" [disabled]="creating()" (click)="create()">{{ creating() ? 'Creating...' : 'Create Schedule' }}</button>
                    </div>
                </div>
            }

            @if (scheduleService.loading()) {
                <app-skeleton variant="table" [count]="5" />
            } @else if (scheduleService.schedules().length === 0) {
                <app-empty-state
                    icon="  _____\n |     |\n | :00 |\n |_____|\n   ||"
                    title="No schedules yet."
                    description="Schedules run agent tasks automatically on a cron or interval."
                    actionLabel="+ Create a schedule"
                    actionAriaLabel="Create your first automation schedule"
                    [actionClick]="toggleCreateForm" />
            } @else if (noFilteredSchedules()) {
                <div class="empty">
                    <p>No matching schedules found.</p>
                </div>
            } @else {
                @for (group of statusGroups(); track group.status) {
                    @if (group.schedules.length > 0) {
                        <div class="status-group">
                            <button class="status-group__header" (click)="toggleGroup(group.status)" [attr.data-status]="group.status">
                                <span class="status-group__indicator">{{ collapsedGroups()[group.status] ? '&#9654;' : '&#9660;' }}</span>
                                <span class="status-group__label" [attr.data-status]="group.status">{{ group.label }}</span>
                                <span class="status-group__count">{{ group.schedules.length }}</span>
                            </button>
                            @if (!collapsedGroups()[group.status]) {
                                <div class="schedule-list">
                                    @for (schedule of group.schedules; track schedule.id) {
                                        <div class="schedule-card" [attr.data-status]="schedule.status" [class.schedule-card--expanded]="expandedScheduleId() === schedule.id" (click)="toggleSchedule(schedule.id)">
                                            <div class="schedule-card__header">
                                                <div class="schedule-card__title">
                                                    <span class="schedule-status" [attr.data-status]="schedule.status">{{ schedule.status }}</span>
                                                    <h3>{{ schedule.name }}</h3>
                                                    <span class="expand-indicator">{{ expandedScheduleId() === schedule.id ? '&#9650;' : '&#9660;' }}</span>
                                                </div>
                                                <div class="schedule-card__actions">
                                                    @if (schedule.status === 'active') {
                                                        <button class="action-btn action-btn--run" (click)="triggerNow(schedule); $event.stopPropagation()" [disabled]="triggering() === schedule.id">{{ triggering() === schedule.id ? 'Running...' : 'Run Now' }}</button>
                                                        <button class="action-btn" (click)="toggleStatus(schedule, 'paused'); $event.stopPropagation()">Pause</button>
                                                    } @else if (schedule.status === 'paused') {
                                                        <button class="action-btn action-btn--resume" (click)="toggleStatus(schedule, 'active'); $event.stopPropagation()">Resume</button>
                                                    }
                                                    <button class="action-btn action-btn--edit" (click)="startEditCron(schedule); $event.stopPropagation()">Edit</button>
                                                    <button class="action-btn action-btn--danger" (click)="deleteSchedule(schedule); $event.stopPropagation()">Delete</button>
                                                </div>
                                            </div>
                                            @if (getRecentDots(schedule.id).length > 0) {
                                                <div class="exec-dots" [title]="'Last ' + getRecentDots(schedule.id).length + ' executions'">
                                                    <span class="exec-dots__label">History</span>
                                                    @for (dot of getRecentDots(schedule.id); track $index) {
                                                        <span class="exec-dot" [attr.data-status]="dot.status" [title]="dot.actionType + ' - ' + dot.status"></span>
                                                    }
                                                </div>
                                            }
                                            @if (schedule.description) { <p class="schedule-desc">{{ schedule.description }}</p> }
                                            @if (editingCronId() === schedule.id) {
                                                <div class="cron-editor" (click)="$event.stopPropagation()">
                                                    <div class="cron-editor__row">
                                                        <input [(ngModel)]="editCronValue" class="form-input mono cron-editor__input" placeholder="0 9 * * 1-5" />
                                                        <button class="action-btn action-btn--run" (click)="saveCron(schedule)">Save</button>
                                                        <button class="action-btn" (click)="editingCronId.set(null)">Cancel</button>
                                                    </div>
                                                    <span class="form-hint form-hint--active">{{ cronToHuman(editCronValue) || 'min hour dom mon dow' }}</span>
                                                </div>
                                            }
                                            <div class="schedule-meta">
                                                <div class="meta-item"><span class="meta-label">Agent</span><span class="meta-value">{{ getAgentName(schedule.agentId) }}</span></div>
                                                <div class="meta-item"><span class="meta-label">Timing</span><span class="meta-value mono">{{ cronToHuman(schedule.cronExpression) || (schedule.intervalMs ? 'Every ' + (schedule.intervalMs / 60000) + 'min' : 'N/A') }}</span></div>
                                                <div class="meta-item"><span class="meta-label">Executions</span><span class="meta-value">{{ schedule.executionCount }}{{ schedule.maxExecutions ? ' / ' + schedule.maxExecutions : '' }}</span></div>
                                                <div class="meta-item"><span class="meta-label">Approval</span><span class="meta-value approval-badge" [attr.data-policy]="schedule.approvalPolicy">{{ schedule.approvalPolicy }}</span></div>
                                                @if (schedule.nextRunAt) { <div class="meta-item"><span class="meta-label">Next Run</span><span class="meta-value">{{ schedule.nextRunAt | relativeTime }}</span></div> }
                                                @if (schedule.lastRunAt) { <div class="meta-item"><span class="meta-label">Last Run</span><span class="meta-value">{{ schedule.lastRunAt | relativeTime }}</span></div> }
                                            </div>
                                            @if (getLastResult(schedule.id); as lastResult) {
                                                <div class="last-result" [attr.data-status]="lastResult.status">
                                                    <span class="last-result__status" [attr.data-status]="lastResult.status">{{ lastResult.status }}</span>
                                                    <span class="last-result__text">{{ lastResult.result | slice:0:120 }}{{ (lastResult.result?.length ?? 0) > 120 ? '...' : '' }}</span>
                                                </div>
                                            }
                                            <div class="schedule-actions-list">
                                                @for (action of schedule.actions; track $index) {
                                                    <span class="action-tag" [attr.data-type]="action.type">{{ action.type }}@if (action.repos && action.repos.length) { ({{ action.repos.join(', ') }}) }</span>
                                                }
                                                @if (schedule.triggerEvents && schedule.triggerEvents.length > 0) {
                                                    <span class="action-tag" data-type="trigger">{{ schedule.triggerEvents.length }} event trigger{{ schedule.triggerEvents.length > 1 ? 's' : '' }}</span>
                                                }
                                            </div>
                                            @if (expandedScheduleId() === schedule.id) {
                                                <div class="schedule-execs" (click)="$event.stopPropagation()">
                                                    @if (loadingExecs()) { <p class="loading-execs">Loading executions...</p> }
                                                    @else if (scheduleExecs().length === 0) { <p class="no-execs">No executions yet.</p> }
                                                    @else {
                                                        <h4 class="execs-heading">Execution History</h4>
                                                        @for (exec of scheduleExecs(); track exec.id) {
                                                            <div class="exec-row exec-row--clickable" [attr.data-status]="exec.status" (click)="toggleExecution(exec.id)">
                                                                <span class="exec-type">{{ exec.actionType }}</span>
                                                                <span class="exec-status" [attr.data-status]="exec.status">{{ exec.status }}</span>
                                                                <span class="exec-time">{{ exec.startedAt | relativeTime }}</span>
                                                                @if (exec.result && expandedExecId() !== exec.id) { <span class="exec-result">{{ exec.result | slice:0:100 }}</span> }
                                                                @if (exec.status === 'running') { <button class="action-btn action-btn--danger" (click)="cancelExecution(exec.id); $event.stopPropagation()">Cancel</button> }
                                                                @if (exec.sessionId) { <a class="exec-link" [routerLink]="['/sessions', exec.sessionId]" (click)="$event.stopPropagation()">Session</a> }
                                                            </div>
                                                            @if (expandedExecId() === exec.id && exec.result) { <div class="exec-detail"><pre class="exec-detail__result">{{ exec.result }}</pre></div> }
                                                        }
                                                    }
                                                </div>
                                            }
                                        </div>
                                    }
                                </div>
                            }
                        </div>
                    }
                }
            }

            @if (scheduleService.executions().length > 0) {
                <div class="exec-section">
                    <h3>Recent Executions</h3>
                    <div class="exec-list">
                        @for (exec of scheduleService.executions().slice(0, 20); track exec.id) {
                            <div class="exec-row exec-row--clickable" [attr.data-status]="exec.status" (click)="toggleExecution(exec.id)">
                                <span class="exec-type">{{ exec.actionType }}</span>
                                <span class="exec-status" [attr.data-status]="exec.status">{{ exec.status }}</span>
                                <span class="exec-time">{{ exec.startedAt | relativeTime }}</span>
                                @if (exec.result && expandedExecId() !== exec.id) { <span class="exec-result">{{ exec.result | slice:0:100 }}</span> }
                                @if (exec.status === 'running') { <button class="action-btn action-btn--danger" (click)="cancelExecution(exec.id); $event.stopPropagation()">Cancel</button> }
                                @if (exec.sessionId) { <a class="exec-link" [routerLink]="['/sessions', exec.sessionId]" (click)="$event.stopPropagation()">Session</a> }
                            </div>
                            @if (expandedExecId() === exec.id && exec.result) { <div class="exec-detail"><pre class="exec-detail__result">{{ exec.result }}</pre></div> }
                        }
                    </div>
                </div>
            }
        </div>
    `,
    styles: `.schedules{padding:1.5rem;max-width:1100px}.schedules__header{display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem}.schedules__header h2{margin:0;color:var(--text-primary)}.loading{color:var(--text-secondary)}
.exec-stats{display:flex;flex-wrap:wrap;gap:1rem;align-items:center;padding:.75rem 1rem;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);margin-bottom:1.25rem}
.exec-stats__item{display:flex;flex-direction:column;gap:.1rem}.exec-stats__value{font-size:1rem;font-weight:700;color:var(--text-primary)}.exec-stats__label{font-size:.55rem;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.05em}
.exec-stats__item--success .exec-stats__value{color:var(--accent-green)}.exec-stats__item--fail .exec-stats__value{color:var(--accent-red)}
.exec-stats__bar{flex:1;min-width:100px;height:6px;background:var(--bg-raised);border-radius:3px;overflow:hidden;display:flex;margin-left:auto}
.exec-stats__bar-fill--success{background:var(--accent-green);transition:width .3s}.exec-stats__bar-fill--fail{background:var(--accent-red);transition:width .3s}
.create-btn,.save-btn{padding:.5rem 1rem;background:var(--accent-cyan-dim);color:var(--accent-cyan);border:1px solid var(--accent-cyan);border-radius:var(--radius);font-size:.75rem;font-weight:600;cursor:pointer}
.create-btn:hover,.save-btn:hover:not(:disabled){background:rgba(0,229,255,.2)}.save-btn:disabled{opacity:.5;cursor:not-allowed}
.approvals-banner{background:var(--accent-amber-dim);border:1px solid var(--accent-amber);border-radius:var(--radius-lg);padding:1rem;margin-bottom:1.25rem}.approvals-banner h3{margin:0 0 .75rem;color:var(--accent-amber);font-size:.8rem}
.approval-card{display:flex;align-items:center;justify-content:space-between;padding:.5rem;background:var(--bg-surface);border-radius:var(--radius);margin-bottom:.5rem}.approval-info{display:flex;gap:.5rem;align-items:center}
.approval-type{font-size:.65rem;font-weight:700;text-transform:uppercase;padding:2px 6px;border-radius:var(--radius-sm);background:var(--accent-magenta-dim);color:var(--accent-magenta)}.approval-desc{font-size:.75rem;color:var(--text-secondary)}.approval-actions{display:flex;gap:.35rem}
.approve-btn,.deny-btn{padding:.3rem .75rem;border-radius:var(--radius);font-size:.7rem;font-weight:600;cursor:pointer}.approve-btn{background:var(--accent-green-dim);color:var(--accent-green);border:1px solid var(--accent-green)}.deny-btn{background:var(--accent-red-dim);color:var(--accent-red);border:1px solid var(--accent-red)}
.create-form{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1.25rem;margin-bottom:1.25rem}.create-form h3{margin:0 0 1rem;color:var(--text-primary);font-size:.85rem}.create-form h4{margin:1rem 0 .5rem;color:var(--text-secondary);font-size:.75rem}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}.span-2{grid-column:span 2}.form-field{display:flex;flex-direction:column;gap:.25rem}.form-field label{font-size:.65rem;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.05em}
.form-input,.form-select{padding:.45rem;background:var(--bg-input);border:1px solid var(--border-bright);border-radius:var(--radius);color:var(--text-primary);font-size:.8rem}.form-input:focus,.form-select:focus{border-color:var(--accent-cyan);outline:none}
.form-hint{font-size:.6rem;color:var(--text-tertiary)}.form-hint--active{color:var(--accent-cyan)}.mono{font-family:monospace}.schedule-type-toggle{display:flex;gap:.35rem}
.type-btn{padding:.35rem .65rem;background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-secondary);font-size:.7rem;cursor:pointer}.type-btn--active{border-color:var(--accent-cyan);color:var(--accent-cyan);background:var(--accent-cyan-dim)}
.action-row{display:flex;gap:.5rem;align-items:center;margin-bottom:.5rem}.action-type-select{min-width:140px}
.remove-action-btn{padding:.25rem .5rem;background:var(--accent-red-dim);color:var(--accent-red);border:1px solid var(--accent-red);border-radius:var(--radius-sm);cursor:pointer;font-size:.9rem;line-height:1}
.add-action-btn{padding:.35rem .75rem;background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius);color:var(--text-secondary);font-size:.7rem;cursor:pointer;margin-top:.25rem}
.form-checkbox{display:flex;align-items:center;gap:.35rem;font-size:.75rem;color:var(--text-secondary);cursor:pointer;white-space:nowrap}.form-buttons{margin-top:1rem}.save-btn{text-transform:uppercase}
.empty{text-align:center;padding:3rem;color:var(--text-tertiary)}.empty-hint{font-size:.75rem;margin-top:.5rem}
.status-group{margin-bottom:1.25rem}.status-group__header{display:flex;align-items:center;gap:.5rem;width:100%;padding:.5rem .75rem;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius);cursor:pointer;margin-bottom:.5rem}
.status-group__indicator{font-size:.55rem;color:var(--text-tertiary);width:.75rem}.status-group__label{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em}
.status-group__label[data-status="active"]{color:var(--accent-green)}.status-group__label[data-status="paused"]{color:var(--accent-amber)}.status-group__label[data-status="failed"]{color:var(--accent-red)}.status-group__label[data-status="completed"]{color:var(--text-tertiary)}
.status-group__count{font-size:.65rem;color:var(--text-tertiary);margin-left:auto}
.schedule-list{display:flex;flex-direction:column;gap:.75rem}.schedule-card{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1rem;cursor:pointer}
.schedule-card[data-status="active"]{border-left:3px solid var(--accent-green)}.schedule-card[data-status="paused"]{border-left:3px solid var(--accent-amber)}.schedule-card[data-status="failed"]{border-left:3px solid var(--accent-red)}.schedule-card--expanded{border-color:var(--accent-cyan)}
.schedule-card__header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.5rem}.schedule-card__title{display:flex;align-items:center;gap:.5rem}.schedule-card__title h3{margin:0;font-size:.9rem;color:var(--text-primary)}.schedule-card__actions{display:flex;gap:.35rem}
.schedule-status{font-size:.6rem;font-weight:700;text-transform:uppercase;padding:2px 8px;border-radius:var(--radius-sm);border:1px solid}
.schedule-status[data-status="active"]{color:var(--accent-green);background:var(--accent-green-dim);border-color:var(--accent-green)}.schedule-status[data-status="paused"]{color:var(--accent-amber);background:var(--accent-amber-dim);border-color:var(--accent-amber)}.schedule-status[data-status="failed"]{color:var(--accent-red);background:var(--accent-red-dim);border-color:var(--accent-red)}
.action-btn{padding:.3rem .6rem;background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-secondary);font-size:.65rem;cursor:pointer}
.action-btn--run{border-color:var(--accent-cyan);color:var(--accent-cyan)}.action-btn--run:disabled{opacity:.5;cursor:not-allowed}.action-btn--resume{border-color:var(--accent-green);color:var(--accent-green)}.action-btn--danger{border-color:var(--accent-red);color:var(--accent-red)}.action-btn--edit{border-color:var(--accent-amber);color:var(--accent-amber)}
.exec-dots{display:flex;align-items:center;gap:3px;margin-bottom:.5rem}.exec-dots__label{font-size:.5rem;color:var(--text-tertiary);text-transform:uppercase;margin-right:4px}
.exec-dot{width:8px;height:8px;border-radius:50%;display:inline-block}.exec-dot[data-status="completed"],.exec-dot[data-status="approved"]{background:var(--accent-green)}.exec-dot[data-status="failed"]{background:var(--accent-red)}.exec-dot[data-status="cancelled"]{background:var(--text-tertiary)}.exec-dot[data-status="running"]{background:var(--accent-cyan);animation:dot-pulse 1.5s ease-in-out infinite}.exec-dot[data-status="awaiting_approval"]{background:var(--accent-amber)}.exec-dot[data-status="denied"]{background:var(--accent-red);opacity:.6}
@keyframes dot-pulse{0%,100%{opacity:1}50%{opacity:.4}}
.last-result{display:flex;align-items:center;gap:.5rem;padding:.35rem .5rem;margin-bottom:.5rem;background:var(--bg-raised);border-radius:var(--radius);border-left:2px solid var(--border)}
.last-result[data-status="completed"]{border-left-color:var(--accent-green)}.last-result[data-status="failed"]{border-left-color:var(--accent-red)}
.last-result__status{font-size:.55rem;font-weight:700;text-transform:uppercase;padding:1px 5px;border-radius:var(--radius-sm)}.last-result__status[data-status="completed"]{color:var(--accent-green);background:var(--accent-green-dim)}.last-result__status[data-status="failed"]{color:var(--accent-red);background:var(--accent-red-dim)}
.last-result__text{font-size:.65rem;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cron-editor{padding:.5rem;margin-bottom:.5rem;background:var(--bg-raised);border-radius:var(--radius);border:1px solid var(--accent-amber)}.cron-editor__row{display:flex;gap:.35rem;align-items:center}.cron-editor__input{flex:1;max-width:200px}
.schedule-desc{margin:0 0 .5rem;font-size:.75rem;color:var(--text-secondary)}.schedule-meta{display:flex;flex-wrap:wrap;gap:1rem;margin-bottom:.5rem}.meta-item{display:flex;flex-direction:column;gap:.1rem}.meta-label{font-size:.55rem;color:var(--text-tertiary);text-transform:uppercase}.meta-value{font-size:.75rem;color:var(--text-primary);font-weight:600}
.approval-badge[data-policy="auto"]{color:var(--accent-green)}.approval-badge[data-policy="owner_approve"]{color:var(--accent-cyan)}.schedule-actions-list{display:flex;gap:.35rem;flex-wrap:wrap}
.action-tag{font-size:.6rem;padding:2px 6px;border-radius:var(--radius-sm);background:var(--bg-raised);color:var(--text-secondary);border:1px solid var(--border)}.action-tag[data-type="star_repo"]{color:var(--accent-amber);border-color:var(--accent-amber)}.action-tag[data-type="review_prs"]{color:var(--accent-cyan);border-color:var(--accent-cyan)}.action-tag[data-type="work_task"]{color:var(--accent-green);border-color:var(--accent-green)}
.exec-section{margin-top:2rem;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1.25rem}.exec-section h3{margin:0 0 .75rem;color:var(--text-primary);font-size:.85rem}.exec-list{display:flex;flex-direction:column;gap:.35rem}
.exec-row{display:flex;align-items:center;gap:.5rem;padding:.5rem;background:var(--bg-raised);border-radius:var(--radius);font-size:.7rem}.exec-type{font-weight:600;color:var(--text-secondary);min-width:100px}.exec-status{font-size:.6rem;font-weight:700;text-transform:uppercase;padding:1px 6px;border-radius:var(--radius-sm)}
.exec-status[data-status="running"]{color:var(--accent-cyan);background:var(--accent-cyan-dim)}.exec-status[data-status="completed"]{color:var(--accent-green);background:var(--accent-green-dim)}.exec-status[data-status="failed"]{color:var(--accent-red);background:var(--accent-red-dim)}.exec-status[data-status="cancelled"]{color:var(--text-tertiary)}.exec-status[data-status="awaiting_approval"]{color:var(--accent-amber);background:var(--accent-amber-dim)}
.exec-time{color:var(--text-tertiary);font-size:.65rem}.exec-result{color:var(--text-secondary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.exec-link{font-size:.65rem;color:var(--accent-cyan);text-decoration:none;border:1px solid var(--accent-cyan);padding:1px 6px;border-radius:var(--radius-sm)}
.expand-indicator{font-size:.55rem;color:var(--text-tertiary);margin-left:.25rem}.exec-row--clickable{cursor:pointer}.exec-row--clickable:hover{background:var(--bg-hover)}
.schedule-execs{margin-top:.75rem;border-top:1px solid var(--border);padding-top:.75rem}.execs-heading{margin:0 0 .5rem;color:var(--text-secondary);font-size:.7rem;text-transform:uppercase;letter-spacing:.04em}.loading-execs,.no-execs{font-size:.7rem;color:var(--text-tertiary);margin:0}
.exec-detail{padding:.5rem;background:var(--bg-base);border-radius:var(--radius);margin-top:.25rem;margin-bottom:.35rem}.exec-detail__result{margin:0;font-size:.7rem;color:var(--text-secondary);white-space:pre-wrap;word-break:break-word;max-height:300px;overflow-y:auto}
@media(max-width:768px){.form-grid{grid-template-columns:1fr}.span-2{grid-column:span 1}.action-row{flex-direction:column}.schedule-meta{flex-direction:column;gap:.5rem}}`,
})
export class ScheduleListComponent implements OnInit, OnDestroy {
    protected readonly scheduleService = inject(ScheduleService);
    protected readonly agentService = inject(AgentService);
    private readonly notifications = inject(NotificationService);
    readonly showCreateForm = signal(false);
    readonly toggleCreateForm = (): void => { this.showCreateForm.set(true); };
    readonly creating = signal(false);
    readonly formScheduleType = signal<'cron' | 'interval'>('cron');
    readonly triggering = signal<string | null>(null);
    readonly expandedScheduleId = signal<string | null>(null);
    readonly expandedExecId = signal<string | null>(null);
    readonly scheduleExecs = signal<ScheduleExecution[]>([]);
    readonly loadingExecs = signal(false);
    readonly collapsedGroups = signal<Record<string, boolean>>({});
    readonly editingCronId = signal<string | null>(null);
    editCronValue = '';
    formAgentId = '';
    formName = '';
    formDescription = '';
    formCron = '';
    formIntervalMin = 60;
    formApprovalPolicy: ScheduleApprovalPolicy = 'owner_approve';
    formMaxExec: number | null = null;
    readonly formActions = signal<Array<{ type: ScheduleActionType; reposStr?: string; description?: string; toAgentId?: string; message?: string; projectId?: string; councilId?: string; maxPrs?: number; autoCreatePr?: boolean; prompt?: string; maxImprovementTasks?: number; focusArea?: string }>>([]);
    readonly formTriggerEvents = signal<Array<{ source: 'github_webhook' | 'github_poll'; event: string; repo?: string }>>([]);
    readonly actionTypes = [
        { value: 'star_repo', label: 'Star Repos' }, { value: 'fork_repo', label: 'Fork Repos' }, { value: 'review_prs', label: 'Review PRs' }, { value: 'work_task', label: 'Work Task (PR)' },
        { value: 'github_suggest', label: 'GitHub Suggestions' }, { value: 'send_message', label: 'Send Message' }, { value: 'council_launch', label: 'Council Launch' },
        { value: 'codebase_review', label: 'Codebase Review' }, { value: 'dependency_audit', label: 'Dependency Audit' }, { value: 'improvement_loop', label: 'Improvement Loop' },
        { value: 'memory_maintenance', label: 'Memory Maintenance' }, { value: 'reputation_attestation', label: 'Reputation Attestation' }, { value: 'custom', label: 'Custom (Prompt)' },
    ];
    readonly cronPreview = computed(() => this.cronToHuman(this.formCron));
    private agentNameMap: Record<string, string> = {};
    readonly execStats = computed(() => {
        const execs = this.scheduleService.executions();
        const total = execs.length;
        const completed = execs.filter((e) => e.status === 'completed' || e.status === 'approved').length;
        const failed = execs.filter((e) => e.status === 'failed').length;
        const running = execs.filter((e) => e.status === 'running').length;
        const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;
        const failRate = total > 0 ? Math.round((failed / total) * 100) : 0;
        return { total, completed, failed, running, successRate, failRate };
    });
    readonly executionsBySchedule = computed(() => {
        const map: Record<string, ScheduleExecution[]> = {};
        for (const exec of this.scheduleService.executions()) {
            if (!map[exec.scheduleId]) map[exec.scheduleId] = [];
            if (map[exec.scheduleId].length < 10) map[exec.scheduleId].push(exec);
        }
        return map;
    });
    readonly statusGroups = computed(() => {
        const all = this.scheduleService.schedules();
        const sorted = [...all].sort((a, b) => this.cronHour(a.cronExpression) - this.cronHour(b.cronExpression));
        return [
            { status: 'active', label: 'Active', schedules: sorted.filter((s) => s.status === 'active') },
            { status: 'paused', label: 'Paused', schedules: sorted.filter((s) => s.status === 'paused') },
            { status: 'failed', label: 'Failed', schedules: sorted.filter((s) => s.status === 'failed') },
            { status: 'completed', label: 'Completed', schedules: sorted.filter((s) => s.status === 'completed') },
        ];
    });
    readonly noFilteredSchedules = computed(() =>
        this.statusGroups().every(g => g.schedules.length === 0),
    );
    async ngOnInit(): Promise<void> {
        this.scheduleService.loadSchedules(); this.scheduleService.loadExecutions(); this.scheduleService.startListening();
        await this.agentService.loadAgents();
        for (const a of this.agentService.agents()) { this.agentNameMap[a.id] = a.name; }
    }
    ngOnDestroy(): void { this.scheduleService.stopListening(); }
    protected getAgentName(agentId: string): string { return this.agentNameMap[agentId] ?? agentId.slice(0, 8); }
    protected getRecentDots(scheduleId: string): ScheduleExecution[] { return this.executionsBySchedule()[scheduleId] ?? []; }
    protected getLastResult(scheduleId: string): ScheduleExecution | null {
        const execs = this.executionsBySchedule()[scheduleId];
        if (!execs?.length) return null;
        return execs.find((e) => e.result && (e.status === 'completed' || e.status === 'failed')) ?? null;
    }
    protected toggleGroup(status: string): void { this.collapsedGroups.update((g) => ({ ...g, [status]: !g[status] })); }
    protected startEditCron(schedule: AgentSchedule): void { this.editingCronId.set(schedule.id); this.editCronValue = schedule.cronExpression ?? ''; }
    protected async saveCron(schedule: AgentSchedule): Promise<void> {
        const value = this.editCronValue.trim();
        if (!value) return;
        try { await this.scheduleService.updateSchedule(schedule.id, { cronExpression: value }); this.notifications.success('Schedule timing updated'); this.editingCronId.set(null); }
        catch { this.notifications.error('Failed to update schedule'); }
    }
    protected cronToHuman(expr: string | null | undefined): string {
        if (!expr) return '';
        const parts = expr.trim().split(/\s+/);
        if (parts.length !== 5) return expr;
        const [min, hour, dom, mon, dow] = parts;
        const dowNames: Record<string, string> = { '0': 'Sun', '1': 'Mon', '2': 'Tue', '3': 'Wed', '4': 'Thu', '5': 'Fri', '6': 'Sat', '7': 'Sun' };
        const monNames: Record<string, string> = { '1': 'Jan', '2': 'Feb', '3': 'Mar', '4': 'Apr', '5': 'May', '6': 'Jun', '7': 'Jul', '8': 'Aug', '9': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec' };
        const formatTime = (h: string, m: string): string => {
            if (h === '*' && m === '*') return 'every minute';
            if (h === '*') return `every hour at :${m.padStart(2, '0')}`;
            if (m === '*') return `every minute of hour ${h}`;
            const hr = parseInt(h, 10); const mn = parseInt(m, 10);
            if (!Number.isFinite(hr) || !Number.isFinite(mn)) return `${h} ${m}`;
            const ampm = hr >= 12 ? 'PM' : 'AM'; const h12 = hr === 0 ? 12 : hr > 12 ? hr - 12 : hr;
            return `${h12}:${m.padStart(2, '0')} ${ampm}`;
        };
        const formatDow = (d: string): string => {
            if (d === '*') return '';
            if (d.includes('-')) { const [a, b] = d.split('-'); return (dowNames[a] ?? a) + '\u2013' + (dowNames[b] ?? b); }
            if (d.includes(',')) return d.split(',').map((v) => dowNames[v] ?? v).join(', ');
            return dowNames[d] ?? d;
        };
        const time = formatTime(hour, min); const dayOfWeek = formatDow(dow);
        const dayOfMonth = dom !== '*' ? `day ${dom}` : '';
        const month = mon !== '*' ? (monNames[mon] ?? `month ${mon}`) : '';
        const pieces = [time]; if (dayOfWeek) pieces.push(dayOfWeek); if (dayOfMonth) pieces.push(dayOfMonth); if (month) pieces.push(`in ${month}`);
        return pieces.join(', ');
    }
    addAction(): void { this.formActions.update((actions) => [...actions, { type: 'review_prs' as ScheduleActionType }]); }
    removeAction(index: number): void { this.formActions.update((actions) => actions.filter((_, i) => i !== index)); }
    addTriggerEvent(): void { this.formTriggerEvents.update((events) => [...events, { source: 'github_webhook' as const, event: '' }]); }
    removeTriggerEvent(index: number): void { this.formTriggerEvents.update((events) => events.filter((_, i) => i !== index)); }
    async create(): Promise<void> {
        if (!this.formAgentId || !this.formName || this.formActions().length === 0) { this.notifications.error('Please fill in agent, name, and at least one action'); return; }
        this.creating.set(true);
        try {
            const actions: ScheduleAction[] = this.formActions().map((a) => ({ type: a.type, repos: a.reposStr?.split(',').map((r) => r.trim()).filter(Boolean), description: a.description, toAgentId: a.toAgentId, message: a.message, projectId: a.projectId || undefined, councilId: a.councilId || undefined, maxPrs: a.maxPrs || undefined, autoCreatePr: a.autoCreatePr || undefined, prompt: a.prompt || undefined, maxImprovementTasks: a.maxImprovementTasks || undefined, focusArea: a.focusArea || undefined }));
            const triggerEvents: ScheduleTriggerEvent[] = this.formTriggerEvents().filter((t) => t.event.trim()).map((t) => ({ source: t.source, event: t.event.trim(), repo: t.repo?.trim() || undefined }));
            await this.scheduleService.createSchedule({ agentId: this.formAgentId, name: this.formName, description: this.formDescription || undefined, cronExpression: this.formScheduleType() === 'cron' ? this.formCron : undefined, intervalMs: this.formScheduleType() === 'interval' ? this.formIntervalMin * 60000 : undefined, actions, approvalPolicy: this.formApprovalPolicy, maxExecutions: this.formMaxExec ?? undefined, triggerEvents: triggerEvents.length > 0 ? triggerEvents : undefined });
            this.notifications.success('Schedule created'); this.showCreateForm.set(false); this.resetForm();
        } catch (err) { this.notifications.error('Failed to create schedule'); } finally { this.creating.set(false); }
    }
    async triggerNow(schedule: AgentSchedule): Promise<void> {
        this.triggering.set(schedule.id);
        try { await this.scheduleService.triggerNow(schedule.id); this.notifications.success(`Schedule "${schedule.name}" triggered`); }
        catch { this.notifications.error('Failed to trigger schedule'); } finally { this.triggering.set(null); }
    }
    async toggleStatus(schedule: AgentSchedule, status: 'active' | 'paused'): Promise<void> {
        try { await this.scheduleService.updateSchedule(schedule.id, { status }); this.notifications.success(`Schedule ${status === 'active' ? 'resumed' : 'paused'}`); }
        catch { this.notifications.error('Failed to update schedule'); }
    }
    async deleteSchedule(schedule: AgentSchedule): Promise<void> {
        if (!confirm(`Delete schedule "${schedule.name}"?`)) return;
        try { await this.scheduleService.deleteSchedule(schedule.id); this.notifications.success('Schedule deleted'); }
        catch { this.notifications.error('Failed to delete schedule'); }
    }
    async toggleSchedule(scheduleId: string): Promise<void> {
        if (this.expandedScheduleId() === scheduleId) { this.expandedScheduleId.set(null); return; }
        this.expandedScheduleId.set(scheduleId); this.expandedExecId.set(null); this.loadingExecs.set(true);
        try { const execs = await this.scheduleService.getScheduleExecutions(scheduleId); this.scheduleExecs.set(execs); }
        catch { this.scheduleExecs.set([]); } finally { this.loadingExecs.set(false); }
    }
    toggleExecution(execId: string): void { this.expandedExecId.set(this.expandedExecId() === execId ? null : execId); }
    async cancelExecution(executionId: string): Promise<void> {
        try { await this.scheduleService.cancelExecution(executionId); this.notifications.success('Execution cancelled'); }
        catch { this.notifications.error('Failed to cancel execution'); }
    }
    async resolveApproval(executionId: string, approved: boolean): Promise<void> {
        try { await this.scheduleService.resolveApproval(executionId, approved); this.notifications.success(approved ? 'Execution approved' : 'Execution denied'); }
        catch { this.notifications.error('Failed to resolve approval'); }
    }
    private cronHour(expr: string | null | undefined): number { if (!expr) return 99; const parts = expr.trim().split(/\s+/); if (parts.length < 2) return 99; const h = parseInt(parts[1], 10); return isNaN(h) ? 99 : h; }
    private resetForm(): void { this.formAgentId = ''; this.formName = ''; this.formDescription = ''; this.formCron = ''; this.formIntervalMin = 60; this.formApprovalPolicy = 'owner_approve'; this.formMaxExec = null; this.formActions.set([]); this.formTriggerEvents.set([]); }
}

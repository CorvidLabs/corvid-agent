import {
    Component,
    ChangeDetectionStrategy,
    inject,
    signal,
    computed,
    OnInit,
    OnDestroy,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import { CronHumanPipe } from '../../shared/pipes/cron-human.pipe';
import { DurationPipe } from '../../shared/pipes/duration.pipe';
import { ScheduleService } from '../../core/services/schedule.service';
import type { AgentSchedule, ScheduleExecution, ScheduleExecutionStatus } from '../../core/models/schedule.model';

type AutomationSection = 'schedules' | 'approvals' | 'history';

const EXEC_STATUS_LABELS: Record<ScheduleExecutionStatus, string> = {
    running: 'Running',
    completed: 'Completed',
    failed: 'Failed',
    cancelled: 'Cancelled',
    awaiting_approval: 'Awaiting Approval',
    approved: 'Approved',
    denied: 'Denied',
};

@Component({
    selector: 'app-settings-automation',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        MatButtonModule,
        MatButtonToggleModule,
        SkeletonComponent,
        EmptyStateComponent,
        RelativeTimePipe,
        CronHumanPipe,
        DurationPipe,
    ],
    template: `
        <div class="automation">
            <div class="automation__nav" aria-label="Automation sections">
                <mat-button-toggle-group [value]="section()" (change)="section.set($event.value)" hideSingleSelectionIndicator>
                    <mat-button-toggle value="schedules">Schedules</mat-button-toggle>
                    <mat-button-toggle value="approvals">
                        Approvals
                        @if (pendingApprovals().length > 0) {
                            <span class="badge badge--warn">{{ pendingApprovals().length }}</span>
                        }
                    </mat-button-toggle>
                    <mat-button-toggle value="history">History</mat-button-toggle>
                </mat-button-toggle-group>
            </div>

            <div class="automation__content">
                @switch (section()) {
                    @case ('schedules') {
                        @if (scheduleService.loading()) {
                            <app-skeleton variant="line" [count]="4" />
                        } @else if (scheduleService.schedules().length === 0) {
                            <app-empty-state
                                icon="[~]"
                                title="No Schedules"
                                description="No automated schedules configured. Create a schedule via the API to get started." />
                        } @else {
                            <div class="list" role="list">
                                @for (sched of scheduleService.schedules(); track sched.id) {
                                    <div class="list__item" role="listitem">
                                        <div class="list__item-header">
                                            <div class="list__item-title">
                                                {{ sched.name }}
                                                <span class="badge" [class]="scheduleStatusClass(sched.status)">
                                                    {{ sched.status }}
                                                </span>
                                                @if (sched.approvalPolicy !== 'auto') {
                                                    <span class="badge badge--dim">{{ sched.approvalPolicy }}</span>
                                                }
                                            </div>
                                            <div class="list__item-actions">
                                                @if (sched.status === 'active') {
                                                    <button mat-stroked-button (click)="pauseSchedule(sched)" class="action-btn action-btn--warn">Pause</button>
                                                } @else if (sched.status === 'paused') {
                                                    <button mat-stroked-button (click)="resumeSchedule(sched)" class="action-btn action-btn--ok">Resume</button>
                                                }
                                                <button mat-stroked-button (click)="triggerNow(sched)" class="action-btn">Run now</button>
                                            </div>
                                        </div>
                                        <div class="list__item-meta">
                                            @if (sched.cronExpression) {
                                                <span class="meta-chip">{{ sched.cronExpression | cronHuman }}</span>
                                            } @else if (sched.intervalMs) {
                                                <span class="meta-chip">Every {{ intervalLabel(sched.intervalMs) }}</span>
                                            }
                                            <span class="meta-chip meta-chip--dim">
                                                {{ sched.executionCount }} run{{ sched.executionCount !== 1 ? 's' : '' }}
                                                @if (sched.maxExecutions) { / {{ sched.maxExecutions }} max }
                                            </span>
                                            @if (sched.lastRunAt) {
                                                <span class="meta-chip meta-chip--dim">Last: {{ sched.lastRunAt | relativeTime }}</span>
                                            }
                                            @if (sched.nextRunAt && sched.status === 'active') {
                                                <span class="meta-chip meta-chip--accent">Next: {{ sched.nextRunAt | relativeTime }}</span>
                                            }
                                        </div>
                                        @if (sched.description) {
                                            <div class="list__item-desc">{{ sched.description }}</div>
                                        }
                                    </div>
                                }
                            </div>
                        }
                    }

                    @case ('approvals') {
                        @if (pendingApprovals().length === 0) {
                            <app-empty-state
                                icon="[✓]"
                                title="No Pending Approvals"
                                description="All scheduled actions have been approved or are running automatically." />
                        } @else {
                            <div class="list" role="list">
                                @for (exec of pendingApprovals(); track exec.id) {
                                    <div class="list__item list__item--approval" role="listitem">
                                        <div class="list__item-header">
                                            <div class="list__item-title">
                                                {{ exec.actionType }}
                                                <span class="badge badge--warn">awaiting approval</span>
                                            </div>
                                            <div class="list__item-actions">
                                                <button mat-flat-button color="primary" (click)="approve(exec)" class="action-btn action-btn--ok">Approve</button>
                                                <button mat-stroked-button (click)="deny(exec)" class="action-btn action-btn--danger">Deny</button>
                                            </div>
                                        </div>
                                        <div class="list__item-meta">
                                            <span class="meta-chip meta-chip--dim">Started {{ exec.startedAt | relativeTime }}</span>
                                            @if (hasInputKeys(exec.actionInput)) {
                                                <span class="meta-chip meta-chip--dim">{{ summaryInput(exec.actionInput) }}</span>
                                            }
                                        </div>
                                    </div>
                                }
                            </div>
                        }
                    }

                    @case ('history') {
                        @if (historyLoading()) {
                            <app-skeleton variant="line" [count]="5" />
                        } @else if (scheduleService.executions().length === 0) {
                            <app-empty-state
                                icon="[—]"
                                title="No Execution History"
                                description="No scheduled executions yet. History appears here after the first run." />
                        } @else {
                            <div class="list" role="list">
                                @for (exec of scheduleService.executions(); track exec.id) {
                                    <div class="list__item" role="listitem">
                                        <div class="list__item-header">
                                            <div class="list__item-title">
                                                {{ exec.actionType }}
                                                <span class="badge" [class]="execStatusClass(exec.status)">
                                                    {{ execStatusLabel(exec.status) }}
                                                </span>
                                            </div>
                                            @if (exec.costUsd > 0) {
                                                <div class="list__item-cost">{{ '$' + exec.costUsd.toFixed(4) }}</div>
                                            }
                                        </div>
                                        <div class="list__item-meta">
                                            <span class="meta-chip meta-chip--dim">{{ exec.startedAt | relativeTime }}</span>
                                            <span class="meta-chip meta-chip--dim">
                                                {{ exec.startedAt | duration : exec.completedAt }}
                                            </span>
                                        </div>
                                        @if (exec.result) {
                                            <div class="list__item-result">{{ exec.result }}</div>
                                        }
                                    </div>
                                }
                            </div>
                        }
                    }
                }
            </div>
        </div>
    `,
    styles: `
        .automation {
            display: flex;
            flex-direction: column;
            height: 100%;
        }
        .automation__nav {
            padding: var(--space-2) clamp(var(--space-3), 2vw, var(--space-5));
            border-bottom: 1px solid var(--border-subtle);
            background: rgba(12, 13, 20, 0.15);
            overflow-x: auto;
            scrollbar-width: none;
            flex-shrink: 0;
            border-radius: var(--radius-lg) var(--radius-lg) 0 0;
            margin-bottom: var(--space-5);
        }
        .automation__nav::-webkit-scrollbar { display: none; }
        .automation__content { flex: 1; overflow-y: auto; }
        .list { display: flex; flex-direction: column; gap: 0.75rem; }
        .list__item {
            background: var(--bg-surface);
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
            padding: 1rem 1.25rem;
        }
        .list__item--approval { border-color: var(--accent-amber); }
        .list__item-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 1rem;
            margin-bottom: 0.5rem;
        }
        .list__item-title {
            font-size: 0.9rem;
            font-weight: 600;
            color: var(--text-primary);
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 0.4rem;
        }
        .list__item-actions { display: flex; gap: 0.5rem; flex-shrink: 0; }
        .list__item-meta { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.4rem; }
        .list__item-desc { font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.4rem; }
        .list__item-result {
            font-size: 0.8rem;
            color: var(--text-secondary);
            margin-top: 0.5rem;
            font-style: italic;
            white-space: pre-wrap;
            overflow: hidden;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
        }
        .list__item-cost { font-size: 0.8rem; color: var(--text-tertiary); flex-shrink: 0; }
        .meta-chip {
            font-size: 0.75rem;
            color: var(--text-secondary);
            background: var(--bg-raised);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-sm);
            padding: 2px 8px;
        }
        .meta-chip--dim { color: var(--text-tertiary); }
        .meta-chip--accent { color: var(--accent-cyan); border-color: var(--accent-cyan); background: var(--accent-cyan-dim); }
        .badge {
            font-size: 0.68rem;
            font-weight: 700;
            padding: 2px 8px;
            border-radius: var(--radius-sm);
            text-transform: uppercase;
            letter-spacing: 0.04em;
            border: 1px solid transparent;
        }
        .badge--active { background: var(--accent-green-dim); color: var(--accent-green); border-color: var(--accent-green); }
        .badge--paused { background: var(--accent-amber-dim); color: var(--accent-amber); border-color: var(--accent-amber); }
        .badge--warn { background: var(--accent-amber-dim); color: var(--accent-amber); border-color: var(--accent-amber); }
        .badge--completed { background: var(--bg-raised); color: var(--text-tertiary); border-color: var(--border); }
        .badge--failed { background: rgba(255, 77, 79, 0.12); color: var(--accent-red); border-color: var(--accent-red); }
        .badge--running { background: var(--accent-cyan-dim); color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .badge--dim { background: var(--bg-raised); color: var(--text-tertiary); border-color: var(--border); }
        .action-btn { font-size: 0.78rem !important; padding: 0 10px !important; height: 30px !important; min-height: unset !important; }
        .action-btn--ok { color: var(--accent-green) !important; border-color: var(--accent-green) !important; }
        .action-btn--warn { color: var(--accent-amber) !important; border-color: var(--accent-amber) !important; }
        .action-btn--danger { color: var(--accent-red) !important; border-color: var(--accent-red) !important; }
    `,
})
export class SettingsAutomationComponent implements OnInit, OnDestroy {
    protected readonly scheduleService = inject(ScheduleService);

    readonly section = signal<AutomationSection>('schedules');
    readonly historyLoading = signal(false);

    readonly pendingApprovals = computed(() =>
        this.scheduleService.executions().filter((e) => e.status === 'awaiting_approval'),
    );

    ngOnInit(): void {
        this.scheduleService.startListening();
        void this.scheduleService.loadSchedules();
        void this.loadHistory();
    }

    ngOnDestroy(): void {
        this.scheduleService.stopListening();
    }

    private async loadHistory(): Promise<void> {
        this.historyLoading.set(true);
        try {
            await this.scheduleService.loadExecutions(undefined, 20);
        } finally {
            this.historyLoading.set(false);
        }
    }

    scheduleStatusClass(status: AgentSchedule['status']): string {
        const map: Record<AgentSchedule['status'], string> = {
            active: 'badge badge--active',
            paused: 'badge badge--paused',
            completed: 'badge badge--completed',
            failed: 'badge badge--failed',
        };
        return map[status] ?? 'badge badge--dim';
    }

    execStatusClass(status: ScheduleExecutionStatus): string {
        const map: Partial<Record<ScheduleExecutionStatus, string>> = {
            running: 'badge badge--running',
            completed: 'badge badge--completed',
            failed: 'badge badge--failed',
            cancelled: 'badge badge--dim',
            awaiting_approval: 'badge badge--warn',
        };
        return map[status] ?? 'badge badge--dim';
    }

    execStatusLabel(status: ScheduleExecutionStatus): string {
        return EXEC_STATUS_LABELS[status] ?? status;
    }

    intervalLabel(ms: number): string {
        if (ms < 60_000) return `${ms / 1000}s`;
        if (ms < 3_600_000) return `${ms / 60_000}m`;
        if (ms < 86_400_000) return `${ms / 3_600_000}h`;
        return `${ms / 86_400_000}d`;
    }

    hasInputKeys(input: Record<string, unknown>): boolean {
        return Object.keys(input).length > 0;
    }

    summaryInput(input: Record<string, unknown>): string {
        return Object.keys(input)
            .slice(0, 2)
            .map((k) => `${k}: ${String(input[k]).slice(0, 30)}`)
            .join(', ');
    }

    async pauseSchedule(sched: AgentSchedule): Promise<void> {
        await this.scheduleService.updateSchedule(sched.id, { status: 'paused' });
    }

    async resumeSchedule(sched: AgentSchedule): Promise<void> {
        await this.scheduleService.updateSchedule(sched.id, { status: 'active' });
    }

    async triggerNow(sched: AgentSchedule): Promise<void> {
        await this.scheduleService.triggerNow(sched.id);
    }

    async approve(exec: ScheduleExecution): Promise<void> {
        await this.scheduleService.resolveApproval(exec.id, true);
    }

    async deny(exec: ScheduleExecution): Promise<void> {
        await this.scheduleService.resolveApproval(exec.id, false);
    }
}

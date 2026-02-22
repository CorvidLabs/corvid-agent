import { Component, ChangeDetectionStrategy, inject, OnInit, OnDestroy, computed, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { ProjectService } from '../../core/services/project.service';
import { AgentService } from '../../core/services/agent.service';
import { SessionService } from '../../core/services/session.service';
import { CouncilService } from '../../core/services/council.service';
import { WorkTaskService } from '../../core/services/work-task.service';
import { ScheduleService } from '../../core/services/schedule.service';
import { WebSocketService } from '../../core/services/websocket.service';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import { ApiService } from '../../core/services/api.service';
import type { ServerWsMessage } from '../../core/models/ws-message.model';
import type { Agent } from '../../core/models/agent.model';
import type { Session } from '../../core/models/session.model';
import { firstValueFrom } from 'rxjs';

interface OverviewData {
    totalSessions: number;
    totalCostUsd: number;
    totalAlgoSpent: number;
    totalTurns: number;
    totalCreditsConsumed: number;
    activeSessions: number;
    totalAgents: number;
    totalProjects: number;
    workTasks: Record<string, number>;
    agentMessages: number;
    algochatMessages: number;
    todaySpending: { algoMicro: number; apiCostUsd: number };
}

interface AgentSummary {
    agent: Agent;
    balance: number;
    runningSessions: number;
    lastActive: string | null;
}

interface ActivityEvent {
    type: 'session_started' | 'session_completed' | 'session_error' | 'work_task' | 'council';
    label: string;
    detail: string;
    timestamp: string;
    link: string;
    status?: string;
}

@Component({
    selector: 'app-dashboard',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, DecimalPipe, StatusBadgeComponent, RelativeTimePipe],
    template: `
        <div class="dashboard">
            <!-- Top Metrics Row -->
            <div class="metrics-row">
                <div class="metric-card">
                    <span class="metric-card__label">Total Agents</span>
                    <span class="metric-card__value">{{ agentService.agents().length }}</span>
                    <a class="metric-card__link" routerLink="/agents">View all</a>
                </div>
                <div class="metric-card">
                    <span class="metric-card__label">Active Sessions</span>
                    <span class="metric-card__value metric-card__value--active">{{ runningSessions().length }}</span>
                    <a class="metric-card__link" routerLink="/sessions">View all</a>
                </div>
                <div class="metric-card">
                    <span class="metric-card__label">Total Projects</span>
                    <span class="metric-card__value">{{ projectService.projects().length }}</span>
                    <a class="metric-card__link" routerLink="/projects">View all</a>
                </div>
                <div class="metric-card metric-card--highlight">
                    <span class="metric-card__label">API Cost (Today)</span>
                    <span class="metric-card__value metric-card__value--usd">\${{ (overview()?.todaySpending?.apiCostUsd ?? 0) | number:'1.2-4' }}</span>
                </div>
                @if (algochatStatus(); as status) {
                    @if (status.enabled && status.address !== 'local') {
                        <div class="metric-card">
                            <span class="metric-card__label">ALGO Balance</span>
                            <span class="metric-card__value metric-card__value--algo">{{ (status.balance / 1000000) | number:'1.2-4' }}</span>
                            <span class="metric-card__sub">{{ status.network }}</span>
                        </div>
                    }
                }
                <div class="metric-card">
                    <span class="metric-card__label">Credits Used</span>
                    <span class="metric-card__value">{{ overview()?.totalCreditsConsumed ?? 0 }}</span>
                </div>
                <div class="metric-card">
                    <span class="metric-card__label">Work Tasks</span>
                    <span class="metric-card__value metric-card__value--work">{{ activeWorkTaskCount() }}</span>
                    <a class="metric-card__link" routerLink="/work-tasks">View all</a>
                </div>
                <div class="metric-card">
                    <span class="metric-card__label">Total Sessions</span>
                    <span class="metric-card__value">{{ overview()?.totalSessions ?? sessionService.sessions().length }}</span>
                </div>
            </div>

            <!-- Agent Activity Grid -->
            @if (agentSummaries().length > 0) {
                <div class="section">
                    <div class="section__header">
                        <h3>Agent Activity</h3>
                        <a class="section__link" routerLink="/agents">View all agents</a>
                    </div>
                    <div class="agent-grid">
                        @for (summary of agentSummaries(); track summary.agent.id) {
                            <a class="agent-card" [routerLink]="['/agents', summary.agent.id]">
                                <div class="agent-card__top">
                                    <div class="agent-card__info">
                                        <span class="agent-card__name">{{ summary.agent.name }}</span>
                                        <span class="agent-card__model">{{ summary.agent.model || 'default' }}</span>
                                    </div>
                                    <span
                                        class="agent-card__status"
                                        [attr.data-status]="summary.runningSessions > 0 ? 'busy' : 'idle'">
                                        {{ summary.runningSessions > 0 ? 'Busy' : 'Idle' }}
                                    </span>
                                </div>
                                <div class="agent-card__stats">
                                    <div class="agent-card__stat">
                                        <span class="agent-card__stat-value">{{ summary.runningSessions }}</span>
                                        <span class="agent-card__stat-label">Running</span>
                                    </div>
                                    <div class="agent-card__stat">
                                        <span class="agent-card__stat-value agent-card__stat-value--algo">{{ (summary.balance / 1000000) | number:'1.2-4' }}</span>
                                        <span class="agent-card__stat-label">ALGO</span>
                                    </div>
                                    <div class="agent-card__stat">
                                        <span class="agent-card__stat-value--time">{{ summary.lastActive | relativeTime }}</span>
                                        <span class="agent-card__stat-label">Last Active</span>
                                    </div>
                                </div>
                                <div class="agent-card__actions">
                                    <button class="agent-card__btn" (click)="startChat(summary.agent.id, $event)">Chat</button>
                                    <button class="agent-card__btn" (click)="startWorkTask(summary.agent.id, $event)">Work Task</button>
                                </div>
                            </a>
                        }
                    </div>
                </div>
            }

            <div class="two-col">
                <!-- Recent Activity Feed -->
                <div class="section section--feed">
                    <div class="section__header">
                        <h3>Recent Activity</h3>
                    </div>
                    @if (activityFeed().length === 0) {
                        <p class="empty">No recent activity.</p>
                    } @else {
                        <div class="activity-feed">
                            @for (event of activityFeed(); track $index) {
                                <a class="activity-item" [routerLink]="event.link">
                                    <span class="activity-item__icon" [attr.data-type]="event.type">
                                        @switch (event.type) {
                                            @case ('session_started') { &gt; }
                                            @case ('session_completed') { &check; }
                                            @case ('session_error') { ! }
                                            @case ('work_task') { &gt;&gt; }
                                            @case ('council') { &amp; }
                                        }
                                    </span>
                                    <div class="activity-item__body">
                                        <span class="activity-item__label">{{ event.label }}</span>
                                        <span class="activity-item__detail">{{ event.detail }}</span>
                                    </div>
                                    <span class="activity-item__time">{{ event.timestamp | relativeTime }}</span>
                                </a>
                            }
                        </div>
                    }
                </div>

                <!-- Right Column: Quick Actions + System Status -->
                <div class="right-col">
                    <!-- Quick Actions -->
                    <div class="section section--actions">
                        <h3>Quick Actions</h3>
                        <div class="quick-actions">
                            <button class="action-btn" (click)="navigateTo('/sessions/new')">+ New Conversation</button>
                            <button class="action-btn" (click)="navigateTo('/councils')">Launch Council</button>
                            <button class="action-btn" (click)="navigateTo('/work-tasks')">Create Work Task</button>
                            <button
                                class="action-btn action-btn--selftest"
                                [disabled]="selfTestRunning()"
                                (click)="runSelfTest()">
                                {{ selfTestRunning() ? 'Running...' : 'Run Self-Test' }}
                            </button>
                        </div>
                    </div>

                    <!-- System Status -->
                    <div class="section section--status">
                        <h3>System Status</h3>
                        <div class="status-list">
                            <div class="status-row">
                                <span class="status-row__label">WebSocket</span>
                                <span
                                    class="status-row__indicator"
                                    [attr.data-ok]="wsService.connected()">
                                    {{ wsService.connected() ? 'Connected' : 'Disconnected' }}
                                </span>
                            </div>
                            <div class="status-row">
                                <span class="status-row__label">AlgoChat</span>
                                @if (algochatStatus(); as status) {
                                    <span
                                        class="status-row__indicator"
                                        [attr.data-ok]="status.enabled">
                                        {{ status.enabled ? (status.address === 'local' ? 'Local Mode' : status.network) : 'Disabled' }}
                                    </span>
                                } @else {
                                    <span class="status-row__indicator" data-ok="false">Loading...</span>
                                }
                            </div>
                            <div class="status-row">
                                <span class="status-row__label">Active Schedules</span>
                                <span class="status-row__value">{{ activeScheduleCount() }}</span>
                            </div>
                            <div class="status-row">
                                <span class="status-row__label">Active Councils</span>
                                <span class="status-row__value">{{ activeCouncilLaunches().length }}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Active Councils -->
                    @if (activeCouncilLaunches().length > 0) {
                        <div class="section">
                            <h3>Active Councils</h3>
                            @for (launch of activeCouncilLaunches(); track launch.id) {
                                <div class="running-item">
                                    <a [routerLink]="['/council-launches', launch.id]">{{ launch.prompt.length > 50 ? launch.prompt.slice(0, 50) + '...' : launch.prompt }}</a>
                                    <span class="stage-badge" [attr.data-stage]="launch.stage">{{ launch.stage }}</span>
                                </div>
                            }
                        </div>
                    }
                </div>
            </div>
        </div>
    `,
    styles: `
        .dashboard {
            padding: 1.25rem;
            overflow-y: auto;
            height: 100%;
        }

        /* Metrics Row */
        .metrics-row {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
            gap: 0.75rem;
            margin-bottom: 1.5rem;
        }
        .metric-card {
            background: var(--bg-surface);
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
            padding: 0.75rem 1rem;
            display: flex;
            flex-direction: column;
            gap: 0.2rem;
            transition: border-color 0.15s;
        }
        .metric-card:hover { border-color: var(--border-bright); }
        .metric-card--highlight { border-color: var(--accent-amber, #ffc107); border-style: dashed; }
        .metric-card__label {
            font-size: 0.6rem; color: var(--text-tertiary); text-transform: uppercase;
            letter-spacing: 0.08em; font-weight: 600;
        }
        .metric-card__value {
            font-size: 1.5rem; font-weight: 700; color: var(--accent-cyan);
        }
        .metric-card__value--usd { color: var(--accent-green); }
        .metric-card__value--algo { color: var(--accent-magenta); }
        .metric-card__value--active { color: var(--accent-amber, #ffc107); }
        .metric-card__value--work { color: var(--accent-cyan); }
        .metric-card__link { font-size: 0.65rem; color: var(--accent-cyan); text-decoration: none; opacity: 0.7; }
        .metric-card__link:hover { opacity: 1; text-decoration: underline; }
        .metric-card__sub { font-size: 0.6rem; color: var(--text-tertiary); text-transform: uppercase; }

        /* Sections */
        .section {
            background: var(--bg-surface);
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
            padding: 1rem 1.25rem;
            margin-bottom: 1.25rem;
        }
        .section h3 { margin: 0 0 0.75rem; color: var(--text-primary); font-size: 0.85rem; }
        .section__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
        .section__header h3 { margin: 0; }
        .section__link { font-size: 0.7rem; color: var(--accent-cyan); text-decoration: none; }
        .section__link:hover { text-decoration: underline; }
        .empty { color: var(--text-tertiary); font-size: 0.8rem; }

        /* Agent Activity Grid */
        .agent-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
            gap: 0.75rem;
        }
        .agent-card {
            display: block;
            background: var(--bg-raised);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            padding: 0.75rem;
            text-decoration: none;
            color: inherit;
            cursor: pointer;
            transition: border-color 0.15s, box-shadow 0.15s;
        }
        .agent-card:hover { border-color: var(--accent-cyan); box-shadow: 0 0 12px rgba(0, 229, 255, 0.08); }
        .agent-card__top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem; }
        .agent-card__info { display: flex; flex-direction: column; gap: 0.1rem; }
        .agent-card__name { font-weight: 700; font-size: 0.85rem; color: var(--text-primary); }
        .agent-card__model { font-size: 0.65rem; color: var(--text-tertiary); font-family: var(--font-mono, monospace); }
        .agent-card__status {
            font-size: 0.6rem; font-weight: 700; padding: 2px 8px; border-radius: var(--radius-sm);
            text-transform: uppercase; letter-spacing: 0.06em; border: 1px solid;
        }
        .agent-card__status[data-status="busy"] { color: var(--accent-green); border-color: var(--accent-green); background: rgba(0, 255, 136, 0.08); }
        .agent-card__status[data-status="idle"] { color: var(--text-tertiary); border-color: var(--border); background: var(--bg-surface); }
        .agent-card__stats { display: flex; gap: 1rem; margin-bottom: 0.5rem; }
        .agent-card__stat { display: flex; flex-direction: column; gap: 0.1rem; }
        .agent-card__stat-value { font-size: 0.95rem; font-weight: 700; color: var(--accent-cyan); }
        .agent-card__stat-value--algo { font-size: 0.85rem; font-weight: 700; color: var(--accent-green); }
        .agent-card__stat-value--time { font-size: 0.75rem; color: var(--text-secondary); }
        .agent-card__stat-label { font-size: 0.55rem; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.06em; }
        .agent-card__actions { display: flex; gap: 0.35rem; }
        .agent-card__btn {
            padding: 0.25rem 0.6rem; font-size: 0.65rem; font-weight: 600; font-family: inherit;
            text-transform: uppercase; letter-spacing: 0.05em; cursor: pointer;
            background: transparent; border: 1px solid var(--border-bright); border-radius: var(--radius-sm);
            color: var(--text-secondary); transition: all 0.15s;
        }
        .agent-card__btn:hover { border-color: var(--accent-cyan); color: var(--accent-cyan); background: var(--accent-cyan-dim); }

        /* Two Column Layout */
        .two-col {
            display: grid;
            grid-template-columns: 1fr 340px;
            gap: 1.25rem;
            align-items: start;
        }

        /* Activity Feed */
        .activity-feed { display: flex; flex-direction: column; }
        .activity-item {
            display: flex; align-items: center; gap: 0.75rem;
            padding: 0.5rem 0; border-bottom: 1px solid var(--border);
            text-decoration: none; color: inherit; transition: background 0.1s;
        }
        .activity-item:last-child { border-bottom: none; }
        .activity-item:hover { background: var(--bg-hover); }
        .activity-item__icon {
            width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;
            font-size: 0.7rem; font-weight: 700; border-radius: 50%; flex-shrink: 0;
            background: var(--bg-raised); border: 1px solid var(--border); color: var(--text-secondary);
        }
        .activity-item__icon[data-type="session_started"] { color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .activity-item__icon[data-type="session_completed"] { color: var(--accent-green); border-color: var(--accent-green); }
        .activity-item__icon[data-type="session_error"] { color: var(--accent-red); border-color: var(--accent-red); }
        .activity-item__icon[data-type="work_task"] { color: var(--accent-magenta); border-color: var(--accent-magenta); }
        .activity-item__icon[data-type="council"] { color: var(--accent-amber, #ffc107); border-color: var(--accent-amber, #ffc107); }
        .activity-item__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.1rem; }
        .activity-item__label { font-size: 0.8rem; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .activity-item__detail { font-size: 0.7rem; color: var(--text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .activity-item__time { font-size: 0.65rem; color: var(--text-tertiary); flex-shrink: 0; }

        /* Right Column */
        .right-col { display: flex; flex-direction: column; gap: 1.25rem; }
        .right-col .section { margin-bottom: 0; }

        /* Quick Actions */
        .quick-actions { display: flex; flex-direction: column; gap: 0.5rem; }
        .action-btn {
            padding: 0.5rem 0.85rem; border-radius: var(--radius); font-size: 0.75rem; font-weight: 600;
            cursor: pointer; border: 1px solid var(--accent-cyan); background: rgba(0, 229, 255, 0.06);
            color: var(--accent-cyan); font-family: inherit; text-transform: uppercase; letter-spacing: 0.05em;
            transition: background 0.15s; text-align: left;
        }
        .action-btn:hover:not(:disabled) { background: rgba(0, 229, 255, 0.12); }
        .action-btn--selftest { border-color: var(--accent-magenta); color: var(--accent-magenta); background: rgba(255, 0, 128, 0.06); }
        .action-btn--selftest:hover:not(:disabled) { background: rgba(255, 0, 128, 0.12); }
        .action-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        /* System Status */
        .status-list { display: flex; flex-direction: column; gap: 0.25rem; }
        .status-row {
            display: flex; justify-content: space-between; align-items: center;
            padding: 0.35rem 0; border-bottom: 1px solid var(--border); font-size: 0.8rem;
        }
        .status-row:last-child { border-bottom: none; }
        .status-row__label { color: var(--text-secondary); }
        .status-row__indicator { font-weight: 600; font-size: 0.75rem; }
        .status-row__indicator[data-ok="true"] { color: var(--accent-green); }
        .status-row__indicator[data-ok="false"] { color: var(--accent-red); }
        .status-row__value { font-weight: 600; color: var(--text-primary); }

        /* Running items */
        .running-item { display: flex; align-items: center; gap: 0.75rem; padding: 0.4rem 0; border-bottom: 1px solid var(--border); }
        .running-item:last-child { border-bottom: none; }
        .running-item a { color: var(--accent-cyan); text-decoration: none; font-size: 0.8rem; }
        .running-item a:hover { text-decoration: underline; }
        .stage-badge {
            font-size: 0.6rem; padding: 2px 8px; border-radius: var(--radius-sm); font-weight: 600;
            text-transform: uppercase; letter-spacing: 0.05em; border: 1px solid;
            background: var(--bg-raised); color: var(--text-secondary); flex-shrink: 0;
        }
        .stage-badge[data-stage="responding"] { color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .stage-badge[data-stage="reviewing"] { color: var(--accent-magenta); border-color: var(--accent-magenta); }
        .stage-badge[data-stage="synthesizing"] { color: #f5a623; border-color: #f5a623; }
        .stage-badge[data-stage="complete"] { color: var(--accent-green); border-color: var(--accent-green); }

        @media (max-width: 768px) {
            .dashboard { padding: 1rem; }
            .metrics-row { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
            .agent-grid { grid-template-columns: 1fr; }
            .two-col { grid-template-columns: 1fr; }
        }
    `,
})
export class DashboardComponent implements OnInit, OnDestroy {
    protected readonly projectService = inject(ProjectService);
    protected readonly agentService = inject(AgentService);
    protected readonly sessionService = inject(SessionService);
    protected readonly councilService = inject(CouncilService);
    protected readonly workTaskService = inject(WorkTaskService);
    protected readonly scheduleService = inject(ScheduleService);
    protected readonly wsService = inject(WebSocketService);
    private readonly apiService = inject(ApiService);
    private readonly router = inject(Router);

    protected readonly algochatStatus = this.sessionService.algochatStatus;
    protected readonly runningSessions = computed(() =>
        this.sessionService.sessions().filter((s) => s.status === 'running'),
    );
    protected readonly activeCouncilLaunches = signal<import('../../core/models/council.model').CouncilLaunch[]>([]);

    protected readonly overview = signal<OverviewData | null>(null);
    protected readonly agentSummaries = signal<AgentSummary[]>([]);
    protected readonly selfTestRunning = signal(false);

    protected readonly activeWorkTaskCount = computed(() => {
        const tasks = this.overview()?.workTasks;
        if (!tasks) return 0;
        return (tasks['pending'] ?? 0) + (tasks['running'] ?? 0) + (tasks['branching'] ?? 0) + (tasks['validating'] ?? 0);
    });

    protected readonly activeScheduleCount = computed(() =>
        this.scheduleService.schedules().filter((s) => s.status === 'active').length,
    );

    protected readonly activityFeed = computed<ActivityEvent[]>(() => {
        const sessions = this.sessionService.sessions();
        const agents = this.agentService.agents();
        const agentMap = new Map(agents.map((a) => [a.id, a.name]));

        const events: ActivityEvent[] = [];

        // Session events
        for (const session of sessions.slice(0, 30)) {
            const agentName = agentMap.get(session.agentId ?? '') ?? 'Unknown';
            if (session.status === 'running') {
                events.push({
                    type: 'session_started',
                    label: `Session started`,
                    detail: `${agentName} — ${session.name || session.initialPrompt?.slice(0, 40) || session.id.slice(0, 8)}`,
                    timestamp: session.updatedAt || session.createdAt,
                    link: `/sessions/${session.id}`,
                    status: session.status,
                });
            } else if (session.status === 'stopped' || session.status === 'idle') {
                events.push({
                    type: 'session_completed',
                    label: `Session completed`,
                    detail: `${agentName} — ${session.name || session.id.slice(0, 8)}`,
                    timestamp: session.updatedAt || session.createdAt,
                    link: `/sessions/${session.id}`,
                    status: session.status,
                });
            } else if (session.status === 'error') {
                events.push({
                    type: 'session_error',
                    label: `Session error`,
                    detail: `${agentName} — ${session.name || session.id.slice(0, 8)}`,
                    timestamp: session.updatedAt || session.createdAt,
                    link: `/sessions/${session.id}`,
                    status: session.status,
                });
            }
        }

        // Work task events
        for (const task of this.workTaskService.tasks().slice(0, 10)) {
            const agentName = agentMap.get(task.agentId) ?? 'Unknown';
            events.push({
                type: 'work_task',
                label: `Work task: ${task.status}`,
                detail: `${agentName} — ${task.description.slice(0, 50)}`,
                timestamp: task.completedAt || task.createdAt,
                link: `/work-tasks`,
                status: task.status,
            });
        }

        // Sort by timestamp descending and take top 15
        return events
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 15);
    });

    private unsubscribeWs: (() => void) | null = null;

    ngOnInit(): void {
        this.projectService.loadProjects();
        this.agentService.loadAgents().then(() => this.loadAgentSummaries());
        this.sessionService.loadSessions();
        this.sessionService.loadAlgoChatStatus();
        this.councilService.loadCouncils();
        this.scheduleService.loadSchedules();
        this.workTaskService.loadTasks();
        this.loadActiveCouncilLaunches();
        this.loadOverview();

        this.unsubscribeWs = this.wsService.onMessage((msg: ServerWsMessage) => {
            if (msg.type === 'agent_balance') {
                this.agentSummaries.update((summaries) =>
                    summaries.map((s) =>
                        s.agent.id === msg.agentId ? { ...s, balance: msg.balance } : s,
                    ),
                );
            }
            if (msg.type === 'session_status') {
                // Refresh sessions to update the feed
                this.sessionService.loadSessions();
            }
        });
    }

    ngOnDestroy(): void {
        this.unsubscribeWs?.();
    }

    protected navigateTo(path: string): void {
        this.router.navigate([path]);
    }

    protected startChat(agentId: string, event: Event): void {
        event.preventDefault();
        event.stopPropagation();
        this.router.navigate(['/sessions/new'], { queryParams: { agentId } });
    }

    protected startWorkTask(agentId: string, event: Event): void {
        event.preventDefault();
        event.stopPropagation();
        this.router.navigate(['/work-tasks'], { queryParams: { agentId } });
    }

    protected async runSelfTest(): Promise<void> {
        this.selfTestRunning.set(true);
        try {
            const result = await firstValueFrom(
                this.apiService.post<{ sessionId: string }>('/selftest/run', { testType: 'all' }),
            );
            if (result.sessionId) {
                this.router.navigate(['/sessions', result.sessionId]);
            }
        } catch {
            // Error handled by interceptor
        } finally {
            this.selfTestRunning.set(false);
        }
    }

    private async loadOverview(): Promise<void> {
        try {
            const overview = await firstValueFrom(
                this.apiService.get<OverviewData>('/analytics/overview'),
            );
            this.overview.set(overview);
        } catch {
            // Analytics may not be available
        }
    }

    private async loadAgentSummaries(): Promise<void> {
        const agents = this.agentService.agents();
        if (agents.length === 0) return;

        const sessions = this.sessionService.sessions();

        const summaries: AgentSummary[] = await Promise.all(
            agents.map(async (agent) => {
                let balance = 0;
                try {
                    const balanceInfo = await this.agentService.getBalance(agent.id);
                    balance = balanceInfo.balance;
                } catch {
                    // Agent may not have a wallet
                }

                const agentSessions = sessions.filter((s) => s.agentId === agent.id);
                const runningSessions = agentSessions.filter((s) => s.status === 'running').length;
                const lastSession = agentSessions.sort(
                    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
                )[0];

                return {
                    agent,
                    balance,
                    runningSessions,
                    lastActive: lastSession?.updatedAt ?? null,
                };
            }),
        );

        this.agentSummaries.set(summaries);
    }

    private async loadActiveCouncilLaunches(): Promise<void> {
        try {
            const launches = await this.councilService.getAllLaunches();
            this.activeCouncilLaunches.set(
                launches.filter((l) => l.stage !== 'complete'),
            );
        } catch {
            // Non-critical
        }
    }
}

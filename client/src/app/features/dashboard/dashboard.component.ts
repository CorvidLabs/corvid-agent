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
import { AbsoluteTimePipe } from '../../shared/pipes/absolute-time.pipe';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { WelcomeWizardComponent } from './welcome-wizard.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import type { ServerWsMessage } from '@shared/ws-protocol';
import type { FlockAgent } from '@shared/types/flock-directory';
import type { Agent } from '../../core/models/agent.model';
import type { AgentMessage } from '../../core/models/agent-message.model';
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
    reputationScore: number | null;
    capabilities: string[];
}

interface ActivityEvent {
    type: 'session_started' | 'session_completed' | 'session_error' | 'work_task' | 'council' | 'agent_message';
    label: string;
    detail: string;
    timestamp: string;
    link: string;
    status?: string;
}

@Component({
    selector: 'app-dashboard',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, DecimalPipe, StatusBadgeComponent, RelativeTimePipe, AbsoluteTimePipe, WelcomeWizardComponent, SkeletonComponent],
    template: `
        @if (showWelcome()) {
            <app-welcome-wizard (agentCreated)="onWizardComplete()" />
        } @else if (loading()) {
            <div class="dashboard">
                <app-skeleton variant="card" [count]="8" />
            </div>
        } @else {
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
                                        <span
                                            class="agent-card__provider-badge"
                                            [attr.data-provider]="summary.agent.provider || 'anthropic'">
                                            {{ summary.agent.provider || 'anthropic' }}{{ summary.agent.model ? ' / ' + summary.agent.model : '' }}
                                        </span>
                                        @if (summary.reputationScore !== null) {
                                            <div class="agent-card__reputation">
                                                <span class="agent-card__rep-score" [attr.data-level]="summary.reputationScore >= 70 ? 'high' : summary.reputationScore >= 30 ? 'mid' : 'low'">
                                                    {{ summary.reputationScore }}
                                                </span>
                                                <span class="agent-card__rep-label">Rep</span>
                                            </div>
                                        }
                                        @if (summary.capabilities.length > 0) {
                                            <div class="agent-card__capabilities">
                                                @for (cap of summary.capabilities.slice(0, 3); track cap) {
                                                    <span class="agent-card__cap-pill">{{ cap }}</span>
                                                }
                                                @if (summary.capabilities.length > 3) {
                                                    <span class="agent-card__cap-more">+{{ summary.capabilities.length - 3 }}</span>
                                                }
                                            </div>
                                        }
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
                                        <span class="agent-card__stat-value--time" [title]="summary.lastActive | absoluteTime">{{ summary.lastActive | relativeTime }}</span>
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

            <!-- Flock Directory Browser -->
            @if (flockAgents().length > 0) {
                <div class="section">
                    <div class="section__header">
                        <h3>Flock Directory</h3>
                        @if (flockStats(); as stats) {
                            <span class="flock-stats">{{ stats.active }} active agents</span>
                        }
                    </div>
                    <div class="flock-grid">
                        @for (agent of flockAgents(); track agent.id) {
                            <div class="flock-card">
                                <div class="flock-card__top">
                                    <span class="flock-card__name">{{ agent.name }}</span>
                                    <span class="flock-card__score" [attr.data-level]="agent.reputationScore >= 70 ? 'high' : agent.reputationScore >= 30 ? 'mid' : 'low'">
                                        {{ agent.reputationScore }}
                                    </span>
                                </div>
                                @if (agent.description) {
                                    <p class="flock-card__desc">{{ agent.description.length > 60 ? agent.description.slice(0, 60) + '...' : agent.description }}</p>
                                }
                                <div class="flock-card__caps">
                                    @for (cap of agent.capabilities.slice(0, 2); track cap) {
                                        <span class="flock-card__cap">{{ cap }}</span>
                                    }
                                </div>
                                <div class="flock-card__footer">
                                    <span class="flock-card__status" [attr.data-status]="agent.status">{{ agent.status }}</span>
                                    <button class="flock-card__connect-btn" (click)="navigateTo('/agents')">Connect</button>
                                </div>
                            </div>
                        }
                    </div>
                </div>
            }

            @if (agentSummaries().length >= 2) {
                <div class="section">
                    <div class="section__header">
                        <h3>Agent Comparison</h3>
                    </div>
                    <div class="comparison-table">
                        <div class="comparison-table__header">
                            <span>Agent</span>
                            <span>Reputation</span>
                            <span>Sessions</span>
                            <span>Balance</span>
                            <span>Status</span>
                        </div>
                        @for (summary of agentSummaries(); track summary.agent.id) {
                            <a class="comparison-table__row" [routerLink]="['/agents', summary.agent.id]">
                                <span class="comparison-table__name">{{ summary.agent.name }}</span>
                                <span class="comparison-table__rep">
                                    @if (summary.reputationScore !== null) {
                                        <span class="comparison-table__rep-bar">
                                            <span class="comparison-table__rep-fill" [style.width.%]="summary.reputationScore" [attr.data-level]="summary.reputationScore >= 70 ? 'high' : summary.reputationScore >= 30 ? 'mid' : 'low'"></span>
                                        </span>
                                        <span class="comparison-table__rep-val">{{ summary.reputationScore }}</span>
                                    } @else {
                                        <span class="comparison-table__na">—</span>
                                    }
                                </span>
                                <span class="comparison-table__sessions">
                                    <span class="comparison-table__sessions-val">{{ summary.runningSessions }}</span>
                                    <span class="comparison-table__sessions-label">active</span>
                                </span>
                                <span class="comparison-table__balance">{{ (summary.balance / 1000000) | number:'1.2-4' }}</span>
                                <span class="comparison-table__status" [attr.data-status]="summary.runningSessions > 0 ? 'busy' : 'idle'">
                                    {{ summary.runningSessions > 0 ? 'Busy' : 'Idle' }}
                                </span>
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
                        <div class="empty-activity">
                            <p class="empty-activity__title">No recent activity</p>
                            <p class="empty-activity__hint">Start a conversation, create a work task, or launch a council to see activity here.</p>
                        </div>
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
                                            @case ('agent_message') { @ }
                                        }
                                    </span>
                                    <div class="activity-item__body">
                                        <span class="activity-item__label">{{ event.label }}</span>
                                        <span class="activity-item__detail">{{ event.detail }}</span>
                                    </div>
                                    <span class="activity-item__time" [title]="event.timestamp | absoluteTime">{{ event.timestamp | relativeTime }}</span>
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
                            @if (serverVersion()) {
                                <div class="status-row">
                                    <span class="status-row__label">Version</span>
                                    <span class="status-row__value status-row__value--version">v{{ serverVersion() }}</span>
                                </div>
                            }
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
        }
    `,
    styles: `
        .dashboard { padding: 1.25rem; overflow-y: auto; height: 100%; }
        .metrics-row { display: grid; grid-template-columns: repeat(auto-fill,minmax(140px,1fr)); gap: .75rem; margin-bottom: 1.5rem; }
        .metric-card {
            background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-lg);
            padding: .75rem 1rem; display: flex; flex-direction: column; gap: .2rem; transition: border-color .15s;
        }
        .metric-card:hover { border-color: var(--border-bright); }
        .metric-card--highlight { border-color: var(--accent-amber,#ffc107); border-style: dashed; }
        .metric-card__label { font-size: .6rem; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: .08em; font-weight: 600; }
        .metric-card__value { font-size: 1.5rem; font-weight: 700; color: var(--accent-cyan); }
        .metric-card__value--usd { color: var(--accent-green); }
        .metric-card__value--algo { color: var(--accent-magenta); }
        .metric-card__value--active { color: var(--accent-amber,#ffc107); }
        .metric-card__link { font-size: .65rem; color: var(--accent-cyan); text-decoration: none; opacity: .7; }
        .metric-card__link:hover { opacity: 1; text-decoration: underline; }
        .metric-card__sub { font-size: .6rem; color: var(--text-tertiary); text-transform: uppercase; }
        .section {
            background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-lg);
            padding: 1rem 1.25rem; margin-bottom: 1.25rem;
        }
        .section h3 { margin: 0 0 .75rem; color: var(--text-primary); font-size: .85rem; }
        .section__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: .75rem; }
        .section__header h3 { margin: 0; }
        .section__link { font-size: .7rem; color: var(--accent-cyan); text-decoration: none; }
        .section__link:hover { text-decoration: underline; }
        .empty-activity { text-align: center; padding: 2rem 1rem; }
        .empty-activity__title { color: var(--text-secondary); font-size: .85rem; font-weight: 600; margin: 0 0 .35rem; }
        .empty-activity__hint { color: var(--text-tertiary); font-size: .75rem; margin: 0; line-height: 1.5; }
        .agent-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(260px,1fr)); gap: .75rem; }
        .agent-card {
            display: block; background: var(--bg-raised); border: 1px solid var(--border);
            border-radius: var(--radius); padding: .75rem; text-decoration: none;
            color: inherit; cursor: pointer; transition: border-color .15s,box-shadow .15s;
        }
        .agent-card:hover { border-color: var(--accent-cyan); box-shadow: 0 0 12px rgba(0,229,255,.08); }
        .agent-card__top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: .5rem; }
        .agent-card__info { display: flex; flex-direction: column; gap: .1rem; }
        .agent-card__name { font-weight: 700; font-size: .85rem; color: var(--text-primary); }
        .agent-card__provider-badge {
            font-size: .55rem; font-family: var(--font-mono,monospace); font-weight: 600;
            padding: 1px 6px; border-radius: var(--radius-sm); border: 1px solid;
            text-transform: uppercase; letter-spacing: .05em;
        }
        .agent-card__provider-badge[data-provider="anthropic"] { color: #d4a574; border-color: rgba(212,165,116,.4); }
        .agent-card__provider-badge[data-provider="openai"] { color: #74d4a5; border-color: rgba(116,212,165,.4); }
        .agent-card__provider-badge[data-provider="ollama"] { color: #a5a5ff; border-color: rgba(165,165,255,.4); }
        .agent-card__status {
            font-size: .6rem; font-weight: 700; padding: 2px 8px; border-radius: var(--radius-sm);
            text-transform: uppercase; letter-spacing: .06em; border: 1px solid;
        }
        .agent-card__status[data-status="busy"] { color: var(--accent-green); border-color: var(--accent-green); background: rgba(0,255,136,.08); }
        .agent-card__status[data-status="idle"] { color: var(--text-tertiary); border-color: var(--border); background: var(--bg-surface); }
        .agent-card__stats { display: flex; gap: 1rem; margin-bottom: .5rem; }
        .agent-card__stat { display: flex; flex-direction: column; gap: .1rem; }
        .agent-card__stat-value { font-size: .95rem; font-weight: 700; color: var(--accent-cyan); }
        .agent-card__stat-value--algo { font-size: .85rem; font-weight: 700; color: var(--accent-green); }
        .agent-card__stat-value--time { font-size: .75rem; color: var(--text-secondary); }
        .agent-card__stat-label { font-size: .55rem; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: .06em; }
        .agent-card__actions { display: flex; gap: .35rem; }
        .agent-card__btn {
            padding: .25rem .6rem; font-size: .65rem; font-weight: 600; font-family: inherit;
            text-transform: uppercase; letter-spacing: .05em; cursor: pointer;
            background: transparent; border: 1px solid var(--border-bright); border-radius: var(--radius-sm);
            color: var(--text-secondary); transition: all .15s;
        }
        .agent-card__btn:hover { border-color: var(--accent-cyan); color: var(--accent-cyan); background: var(--accent-cyan-dim); }
        .two-col { display: grid; grid-template-columns: 1fr 340px; gap: 1.25rem; align-items: start; }
        .activity-feed { display: flex; flex-direction: column; }
        .activity-item {
            display: flex; align-items: center; gap: .75rem;
            padding: .5rem 0; border-bottom: 1px solid var(--border);
            text-decoration: none; color: inherit; transition: background .1s;
        }
        .activity-item:last-child { border-bottom: none; }
        .activity-item:hover { background: var(--bg-hover); }
        .activity-item__icon {
            width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;
            font-size: .7rem; font-weight: 700; border-radius: 50%; flex-shrink: 0;
            background: var(--bg-raised); border: 1px solid var(--border); color: var(--text-secondary);
        }
        .activity-item__icon[data-type="session_started"] { color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .activity-item__icon[data-type="session_completed"] { color: var(--accent-green); border-color: var(--accent-green); }
        .activity-item__icon[data-type="session_error"] { color: var(--accent-red); border-color: var(--accent-red); }
        .activity-item__icon[data-type="work_task"] { color: var(--accent-magenta); border-color: var(--accent-magenta); }
        .activity-item__icon[data-type="council"] { color: var(--accent-amber,#ffc107); border-color: var(--accent-amber,#ffc107); }
        .activity-item__icon[data-type="agent_message"] { color: var(--accent-magenta); border-color: var(--accent-magenta); }
        .activity-item__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: .1rem; }
        .activity-item__label { font-size: .8rem; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .activity-item__detail { font-size: .7rem; color: var(--text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .activity-item__time { font-size: .65rem; color: var(--text-tertiary); flex-shrink: 0; }
        .right-col { display: flex; flex-direction: column; gap: 1.25rem; }
        .right-col .section { margin-bottom: 0; }
        .quick-actions { display: flex; flex-direction: column; gap: .5rem; }
        .action-btn {
            padding: .5rem .85rem; border-radius: var(--radius); font-size: .75rem; font-weight: 600;
            cursor: pointer; border: 1px solid var(--accent-cyan); background: rgba(0,229,255,.06);
            color: var(--accent-cyan); font-family: inherit; text-transform: uppercase; letter-spacing: .05em;
            transition: background .15s; text-align: left;
        }
        .action-btn:hover:not(:disabled) { background: rgba(0,229,255,.12); }
        .action-btn--selftest { border-color: var(--accent-magenta); color: var(--accent-magenta); background: rgba(255,0,128,.06); }
        .action-btn--selftest:hover:not(:disabled) { background: rgba(255,0,128,.12); }
        .action-btn:disabled { opacity: .5; cursor: not-allowed; }
        .status-list { display: flex; flex-direction: column; gap: .25rem; }
        .status-row {
            display: flex; justify-content: space-between; align-items: center;
            padding: .35rem 0; border-bottom: 1px solid var(--border); font-size: .8rem;
        }
        .status-row:last-child { border-bottom: none; }
        .status-row__label { color: var(--text-secondary); }
        .status-row__indicator { font-weight: 600; font-size: .75rem; }
        .status-row__indicator[data-ok="true"] { color: var(--accent-green); }
        .status-row__indicator[data-ok="false"] { color: var(--accent-red); }
        .status-row__value { font-weight: 600; color: var(--text-primary); }
        .status-row__value--version { font-family: var(--font-mono,monospace); font-size: .75rem; color: var(--text-tertiary); }
        .running-item { display: flex; align-items: center; gap: .75rem; padding: .4rem 0; border-bottom: 1px solid var(--border); }
        .running-item:last-child { border-bottom: none; }
        .running-item a { color: var(--accent-cyan); text-decoration: none; font-size: .8rem; }
        .running-item a:hover { text-decoration: underline; }
        .stage-badge {
            font-size: .6rem; padding: 2px 8px; border-radius: var(--radius-sm); font-weight: 600;
            text-transform: uppercase; letter-spacing: .05em; border: 1px solid;
            background: var(--bg-raised); color: var(--text-secondary); flex-shrink: 0;
        }
        .stage-badge[data-stage="responding"] { color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .stage-badge[data-stage="reviewing"] { color: var(--accent-magenta); border-color: var(--accent-magenta); }
        .stage-badge[data-stage="synthesizing"] { color: var(--accent-gold); border-color: var(--accent-gold); }
        .stage-badge[data-stage="complete"] { color: var(--accent-green); border-color: var(--accent-green); }
        .agent-card__reputation { display: flex; align-items: center; gap: .25rem; margin-top: .15rem; }
        .agent-card__rep-score {
            font-size: .75rem; font-weight: 700; font-family: var(--font-mono,monospace);
            padding: 1px 5px; border-radius: var(--radius-sm); border: 1px solid;
        }
        .agent-card__rep-score[data-level="high"] { color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .agent-card__rep-score[data-level="mid"] { color: var(--accent-amber,#ffc107); border-color: var(--accent-amber,#ffc107); }
        .agent-card__rep-score[data-level="low"] { color: var(--accent-red); border-color: var(--accent-red); }
        .agent-card__rep-label { font-size: .55rem; color: var(--text-tertiary); text-transform: uppercase; }
        .agent-card__capabilities { display: flex; flex-wrap: wrap; gap: .25rem; margin-top: .35rem; }
        .agent-card__cap-pill {
            font-size: .55rem; padding: 1px 6px; border-radius: 9999px;
            background: rgba(0,229,255,.08); border: 1px solid rgba(0,229,255,.2);
            color: var(--accent-cyan); text-transform: lowercase; font-weight: 500;
        }
        .agent-card__cap-more { font-size: .55rem; padding: 1px 6px; color: var(--text-tertiary); font-weight: 500; }
        .flock-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(200px,1fr)); gap: .75rem; }
        .flock-card {
            background: var(--bg-raised); border: 1px solid var(--border);
            border-radius: var(--radius); padding: .75rem; transition: border-color .15s;
        }
        .flock-card:hover { border-color: var(--accent-magenta); }
        .flock-card__top { display: flex; justify-content: space-between; align-items: center; margin-bottom: .35rem; }
        .flock-card__name { font-weight: 700; font-size: .8rem; color: var(--text-primary); }
        .flock-card__score {
            font-size: .75rem; font-weight: 700; font-family: var(--font-mono,monospace);
            padding: 1px 5px; border-radius: var(--radius-sm); border: 1px solid;
        }
        .flock-card__score[data-level="high"] { color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .flock-card__score[data-level="mid"] { color: var(--accent-amber,#ffc107); border-color: var(--accent-amber,#ffc107); }
        .flock-card__score[data-level="low"] { color: var(--accent-red); border-color: var(--accent-red); }
        .flock-card__desc { font-size: .7rem; color: var(--text-tertiary); margin: 0 0 .4rem; line-height: 1.4; }
        .flock-card__caps { display: flex; gap: .25rem; margin-bottom: .5rem; }
        .flock-card__cap {
            font-size: .55rem; padding: 1px 6px; border-radius: 9999px;
            background: rgba(255,0,128,.08); border: 1px solid rgba(255,0,128,.2);
            color: var(--accent-magenta); text-transform: lowercase; font-weight: 500;
        }
        .flock-card__footer { display: flex; justify-content: space-between; align-items: center; }
        .flock-card__status { font-size: .6rem; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; }
        .flock-card__status[data-status="active"] { color: var(--accent-green); }
        .flock-card__status[data-status="inactive"] { color: var(--text-tertiary); }
        .flock-card__connect-btn {
            padding: .2rem .5rem; font-size: .6rem; font-weight: 600; font-family: inherit;
            text-transform: uppercase; letter-spacing: .05em; cursor: pointer;
            background: transparent; border: 1px solid var(--accent-magenta); border-radius: var(--radius-sm);
            color: var(--accent-magenta); transition: all .15s;
        }
        .flock-card__connect-btn:hover { background: rgba(255,0,128,.1); }
        .flock-stats { font-size: .7rem; color: var(--text-tertiary); }
        .comparison-table { border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
        .comparison-table__header, .comparison-table__row {
            display: grid; grid-template-columns: 2fr 2fr 1fr 1fr .75fr; padding: .5rem 1rem;
        }
        .comparison-table__header {
            background: var(--bg-raised); font-size: .7rem; font-weight: 600;
            text-transform: uppercase; letter-spacing: .05em; color: var(--text-secondary);
        }
        .comparison-table__row {
            border-top: 1px solid var(--border); font-size: .8rem; color: var(--text-primary);
            text-decoration: none; transition: background .1s; align-items: center;
        }
        .comparison-table__row:hover { background: var(--bg-hover); }
        .comparison-table__name { font-weight: 600; color: var(--accent-cyan); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .comparison-table__rep { display: flex; align-items: center; gap: .5rem; }
        .comparison-table__rep-bar { flex: 1; height: 6px; background: var(--bg-raised); border-radius: 3px; overflow: hidden; max-width: 80px; }
        .comparison-table__rep-fill { height: 100%; border-radius: 3px; min-width: 1px; transition: width .3s; }
        .comparison-table__rep-fill[data-level="high"] { background: var(--accent-cyan); }
        .comparison-table__rep-fill[data-level="mid"] { background: var(--accent-amber,#ffc107); }
        .comparison-table__rep-fill[data-level="low"] { background: var(--accent-red); }
        .comparison-table__rep-val { font-size: .75rem; font-weight: 700; font-family: var(--font-mono,monospace); color: var(--text-primary); }
        .comparison-table__na { color: var(--text-tertiary); font-size: .75rem; }
        .comparison-table__sessions { display: flex; align-items: center; gap: .25rem; }
        .comparison-table__sessions-val { font-weight: 700; color: var(--accent-cyan); }
        .comparison-table__sessions-label { font-size: .6rem; color: var(--text-tertiary); text-transform: uppercase; }
        .comparison-table__balance { color: var(--accent-green); font-family: var(--font-mono,monospace); font-size: .8rem; }
        .comparison-table__status {
            font-size: .6rem; font-weight: 700; padding: 2px 8px; border-radius: var(--radius-sm);
            text-transform: uppercase; letter-spacing: .06em; border: 1px solid; text-align: center;
        }
        .comparison-table__status[data-status="busy"] { color: var(--accent-green); border-color: var(--accent-green); background: rgba(0,255,136,.08); }
        .comparison-table__status[data-status="idle"] { color: var(--text-tertiary); border-color: var(--border); background: var(--bg-surface); }
        @media (max-width:768px) {
            .dashboard { padding: 1rem; }
            .metrics-row { grid-template-columns: repeat(auto-fill,minmax(120px,1fr)); }
            .agent-grid,.two-col { grid-template-columns: 1fr; }
            .quick-actions { flex-direction: row; flex-wrap: wrap; }
            .action-btn { flex: 1 1 calc(50% - .25rem); min-width: 0; text-align: center; }
        }
        @media (max-width:480px) {
            .dashboard { padding: .75rem; }
            .metrics-row { grid-template-columns: repeat(2,1fr); gap: .5rem; }
            .metric-card { padding: .5rem .75rem; }
            .metric-card__value { font-size: 1.2rem; }
            .section { padding: .75rem; }
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
    private readonly notify = inject(NotificationService);

    protected readonly algochatStatus = this.sessionService.algochatStatus;
    protected readonly showWelcome = computed(() =>
        this.agentService.agents().length === 0 && !this.wizardDismissed(),
    );
    private readonly wizardDismissed = signal(false);
    protected readonly runningSessions = computed(() =>
        this.sessionService.sessions().filter((s) => s.status === 'running'),
    );
    protected readonly activeCouncilLaunches = signal<import('../../core/models/council.model').CouncilLaunch[]>([]);

    protected readonly overview = signal<OverviewData | null>(null);
    protected readonly agentSummaries = signal<AgentSummary[]>([]);
    protected readonly selfTestRunning = signal(false);
    protected readonly loading = signal(true);
    protected readonly serverVersion = signal<string | null>(null);
    protected readonly flockAgents = signal<FlockAgent[]>([]);
    protected readonly flockStats = signal<{ total: number; active: number } | null>(null);
    protected readonly agentMessages = signal<AgentMessage[]>([]);

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

        // Agent message events
        for (const msg of this.agentMessages().slice(0, 10)) {
            const fromName = agentMap.get(msg.fromAgentId) ?? msg.fromAgentId.slice(0, 8);
            const toName = agentMap.get(msg.toAgentId) ?? msg.toAgentId.slice(0, 8);
            events.push({
                type: 'agent_message',
                label: `Message: ${msg.status}`,
                detail: `${fromName} → ${toName}`,
                timestamp: msg.completedAt || msg.createdAt,
                link: `/agents/${msg.toAgentId}`,
                status: msg.status,
            });
        }

        // Sort by timestamp descending and take top 15
        return events
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 15);
    });

    private unsubscribeWs: (() => void) | null = null;

    ngOnInit(): void {
        const loads = [
            this.projectService.loadProjects(),
            this.agentService.loadAgents().then(() => this.loadAgentSummaries()),
            this.sessionService.loadSessions(),
            this.sessionService.loadAlgoChatStatus(),
            this.councilService.loadCouncils(),
            this.scheduleService.loadSchedules(),
            this.workTaskService.loadTasks(),
            this.loadActiveCouncilLaunches(),
            this.loadOverview(),
            this.loadServerVersion(),
            this.loadFlockDirectory(),
            this.agentService.loadAgents().then(() => this.loadAgentMessages()),
        ];
        Promise.allSettled(loads).then(() => this.loading.set(false));

        this.unsubscribeWs = this.wsService.onMessage((msg: ServerWsMessage) => {
            if (msg.type === 'agent_balance') {
                this.agentSummaries.update((summaries) =>
                    summaries.map((s) =>
                        s.agent.id === msg.agentId ? { ...s, balance: msg.balance } : s,
                    ),
                );
            }
            if (msg.type === 'agent_message_update') {
                this.loadAgentMessages();
            }
            if (msg.type === 'session_status') {
                // Update session status in-place; only full-refresh on lifecycle changes
                const status = (msg as { status: string }).status;
                if (status === 'idle' || status === 'error' || status === 'stopped' || status === 'running') {
                    this.sessionService.loadSessions();
                }
            }
        });
    }

    ngOnDestroy(): void {
        this.unsubscribeWs?.();
    }

    protected onWizardComplete(): void {
        this.wizardDismissed.set(true);
        this.agentService.loadAgents().then(() => this.loadAgentSummaries());
        this.loadOverview();
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
        this.notify.info('Self-test running...');
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

        // Fetch flock directory agents to enrich summaries
        let flockAgentMap = new Map<string, FlockAgent>();
        try {
            const flockResult = await firstValueFrom(
                this.apiService.get<{ agents: FlockAgent[] }>('/flock-directory/agents'),
            );
            for (const fa of flockResult.agents) {
                flockAgentMap.set(fa.name.toLowerCase(), fa);
            }
        } catch {
            // Flock directory may not be available
        }

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

                const flockAgent = flockAgentMap.get(agent.name.toLowerCase());

                return {
                    agent,
                    balance,
                    runningSessions,
                    lastActive: lastSession?.updatedAt ?? null,
                    reputationScore: flockAgent?.reputationScore ?? null,
                    capabilities: flockAgent?.capabilities ?? [],
                };
            }),
        );

        this.agentSummaries.set(summaries);
    }

    private async loadServerVersion(): Promise<void> {
        try {
            const health = await firstValueFrom(
                this.apiService.get<{ version?: string }>('/health'),
            );
            if (health.version) this.serverVersion.set(health.version);
        } catch {
            // Non-critical
        }
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

    private async loadFlockDirectory(): Promise<void> {
        try {
            const [agentsResult, stats] = await Promise.all([
                firstValueFrom(this.apiService.get<{ agents: FlockAgent[]; total: number }>('/flock-directory/search?sortBy=reputation&sortOrder=desc&limit=6&status=active')),
                firstValueFrom(this.apiService.get<{ total: number; active: number }>('/flock-directory/stats')),
            ]);
            this.flockAgents.set(agentsResult.agents);
            this.flockStats.set(stats);
        } catch {
            // Flock directory may not be available
        }
    }

    private async loadAgentMessages(): Promise<void> {
        try {
            const agents = this.agentService.agents();
            const allMessages: AgentMessage[] = [];
            for (const agent of agents.slice(0, 5)) {
                const messages = await this.agentService.getMessages(agent.id);
                allMessages.push(...messages);
            }
            // Deduplicate by id
            const unique = [...new Map(allMessages.map(m => [m.id, m])).values()];
            this.agentMessages.set(unique.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 20));
        } catch {
            // Non-critical
        }
    }
}

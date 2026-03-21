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
import { WidgetLayoutService, type WidgetId } from '../../core/services/widget-layout.service';
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

interface SpendingDay { date: string; algo_micro: number; api_cost_usd: number; }
interface SessionCostDay { date: string; session_count: number; cost_usd: number; turns: number; }
interface SpendingData { spending: SpendingDay[]; sessionCosts: SessionCostDay[]; days: number; }
interface AgentSessionStat { agent_id: string; agent_name: string; session_count: number; total_cost: number; total_turns: number; }
interface SessionStats { byAgent: AgentSessionStat[]; bySource: { source: string; count: number }[]; byStatus: { status: string; count: number }[]; }

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
            <!-- Top bar: view mode + customize toggle -->
            <div class="dash-toolbar">
                <span class="dash-toolbar__title">Dashboard</span>
                <div class="dash-toolbar__right">
                    <div class="view-toggle">
                        <button class="view-toggle__btn"
                                [class.view-toggle__btn--active]="layoutService.viewMode() === 'simple'"
                                (click)="layoutService.setViewMode('simple')">Simple</button>
                        <button class="view-toggle__btn"
                                [class.view-toggle__btn--active]="layoutService.viewMode() === 'developer'"
                                (click)="layoutService.setViewMode('developer')">Developer</button>
                    </div>
                    <button class="customize-btn" (click)="layoutService.customizing.set(!layoutService.customizing())">
                        {{ layoutService.customizing() ? 'Done' : 'Customize' }}
                    </button>
                </div>
            </div>

            <!-- Customize panel (slide-down) -->
            @if (layoutService.customizing()) {
                <div class="customize-panel">
                    <div class="customize-panel__header">
                        <span class="customize-panel__title">Dashboard Widgets</span>
                        <button class="customize-panel__reset" (click)="layoutService.resetToDefaults()">Reset to defaults</button>
                    </div>
                    <p class="customize-panel__hint">Drag to reorder. Toggle visibility.</p>
                    <div class="customize-list">
                        @for (widget of layoutService.widgets(); track widget.id; let i = $index) {
                            <div class="customize-item"
                                 draggable="true"
                                 (dragstart)="onCustomizeDragStart($event, i)"
                                 (dragover)="onCustomizeDragOver($event, i)"
                                 (drop)="onCustomizeDrop($event, i)"
                                 (dragend)="dragIndex.set(-1)"
                                 [class.customize-item--dragging]="dragIndex() === i"
                                 [class.customize-item--hidden]="!widget.visible">
                                <span class="customize-item__handle">&#x2630;</span>
                                <span class="customize-item__label">{{ widget.label }}</span>
                                <button class="customize-item__toggle"
                                        (click)="layoutService.toggleWidget(widget.id)"
                                        [attr.data-visible]="widget.visible">
                                    {{ widget.visible ? 'ON' : 'OFF' }}
                                </button>
                            </div>
                        }
                    </div>
                </div>
            }

            <!-- Widget grid: render visible widgets in order -->
            <div class="widget-grid">
                @for (widget of layoutService.visibleWidgets(); track widget.id; let i = $index) {
                    <div class="widget"
                         [attr.data-widget]="widget.id"
                         [class.widget--full]="isFullWidth(widget.id)"
                         draggable="true"
                         (dragstart)="onWidgetDragStart($event, i)"
                         (dragover)="onWidgetDragOver($event, i)"
                         (drop)="onWidgetDrop($event, i)"
                         (dragend)="widgetDragIndex.set(-1)"
                         [class.widget--drag-over]="widgetDragOver() === i && widgetDragIndex() !== i">

                        <!-- metrics -->
                        @if (widget.id === 'metrics') {
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
                        }

                        <!-- agents -->
                        @if (widget.id === 'agents') {
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
                                                        <span class="agent-card__provider-badge" [attr.data-provider]="summary.agent.provider || 'anthropic'">
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
                                                    <span class="agent-card__status" [attr.data-status]="summary.runningSessions > 0 ? 'busy' : 'idle'">
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
                            } @else {
                                <div class="simple-hero">
                                    <h2 class="simple-hero__title">What do you want to build?</h2>
                                    <p class="simple-hero__desc">Pick an agent and start a conversation.</p>
                                    <button class="simple-hero__btn" (click)="navigateTo('/sessions/new')">+ Start a Conversation</button>
                                </div>
                            }
                        }

                        <!-- spending-chart -->
                        @if (widget.id === 'spending-chart') {
                            <div class="section">
                                <div class="section__header">
                                    <h3>Spending Trend</h3>
                                    <div class="chart-controls">
                                        <button class="chart-btn" [class.chart-btn--active]="spendingDays() === 7" (click)="loadSpending(7)">7d</button>
                                        <button class="chart-btn" [class.chart-btn--active]="spendingDays() === 14" (click)="loadSpending(14)">14d</button>
                                        <button class="chart-btn" [class.chart-btn--active]="spendingDays() === 30" (click)="loadSpending(30)">30d</button>
                                    </div>
                                </div>
                                @if (spendingBars().length > 0) {
                                    <div class="bar-chart">
                                        <div class="bar-chart__bars">
                                            @for (bar of spendingBars(); track bar.date) {
                                                <div class="bar-chart__col" [title]="bar.date + ': $' + bar.value.toFixed(4)">
                                                    <div class="bar-chart__bar bar-chart__bar--spending" [style.height.%]="bar.pct"></div>
                                                    <span class="bar-chart__label">{{ bar.dateShort }}</span>
                                                </div>
                                            }
                                        </div>
                                    </div>
                                } @else {
                                    <p class="empty-chart">No spending data</p>
                                }
                            </div>
                        }

                        <!-- session-chart -->
                        @if (widget.id === 'session-chart') {
                            <div class="section">
                                <div class="section__header">
                                    <h3>Sessions Breakdown</h3>
                                </div>
                                @if (sessionStats()) {
                                    <div class="chart-duo">
                                        <!-- Sessions by status: donut-style ring -->
                                        <div class="ring-chart">
                                            <div class="ring-chart__visual">
                                                <svg viewBox="0 0 36 36" class="ring-chart__svg">
                                                    @for (seg of statusSegments(); track seg.status; let i = $index) {
                                                        <circle class="ring-chart__segment"
                                                            [attr.data-status]="seg.status"
                                                            cx="18" cy="18" r="15.9"
                                                            fill="none"
                                                            stroke-width="3"
                                                            [attr.stroke-dasharray]="seg.dashArray"
                                                            [attr.stroke-dashoffset]="seg.dashOffset"
                                                        />
                                                    }
                                                </svg>
                                                <span class="ring-chart__center">{{ totalSessionCount() }}</span>
                                            </div>
                                            <div class="ring-chart__legend">
                                                @for (seg of statusSegments(); track seg.status) {
                                                    <div class="ring-chart__legend-item">
                                                        <span class="ring-chart__dot" [attr.data-status]="seg.status"></span>
                                                        <span class="ring-chart__legend-label">{{ seg.status }}</span>
                                                        <span class="ring-chart__legend-val">{{ seg.count }}</span>
                                                    </div>
                                                }
                                            </div>
                                        </div>
                                        <!-- Sessions by source: horizontal bars -->
                                        <div class="source-bars">
                                            <h4 class="source-bars__title">By Source</h4>
                                            @for (entry of sessionStats()!.bySource; track entry.source) {
                                                <div class="source-bar-row">
                                                    <span class="source-bar-row__label" [attr.data-source]="entry.source">{{ entry.source }}</span>
                                                    <div class="source-bar-row__track">
                                                        <div class="source-bar-row__fill" [attr.data-source]="entry.source" [style.width.%]="sourceBarPct(entry.count)"></div>
                                                    </div>
                                                    <span class="source-bar-row__val">{{ entry.count }}</span>
                                                </div>
                                            }
                                        </div>
                                    </div>
                                } @else {
                                    <p class="empty-chart">Loading session data...</p>
                                }
                            </div>
                        }

                        <!-- agent-usage-chart -->
                        @if (widget.id === 'agent-usage-chart') {
                            <div class="section">
                                <div class="section__header">
                                    <h3>Agent Usage</h3>
                                </div>
                                @if (sessionStats() && sessionStats()!.byAgent.length > 0) {
                                    <div class="usage-chart">
                                        @for (agent of sessionStats()!.byAgent.slice(0, 6); track agent.agent_id) {
                                            <div class="usage-row">
                                                <span class="usage-row__name">{{ agent.agent_name || 'Unknown' }}</span>
                                                <div class="usage-row__bar-wrap">
                                                    <div class="usage-row__sessions" [style.width.%]="agentBarPct(agent.session_count, 'sessions')"></div>
                                                    <div class="usage-row__cost" [style.width.%]="agentBarPct(agent.total_cost, 'cost')"></div>
                                                </div>
                                                <div class="usage-row__vals">
                                                    <span class="usage-row__val usage-row__val--sessions">{{ agent.session_count }}s</span>
                                                    <span class="usage-row__val usage-row__val--cost">\${{ agent.total_cost | number:'1.2-2' }}</span>
                                                </div>
                                            </div>
                                        }
                                        <div class="usage-legend">
                                            <span class="usage-legend__item usage-legend__item--sessions">Sessions</span>
                                            <span class="usage-legend__item usage-legend__item--cost">Cost</span>
                                        </div>
                                    </div>
                                } @else {
                                    <p class="empty-chart">No agent usage data yet</p>
                                }
                            </div>
                        }

                        <!-- activity -->
                        @if (widget.id === 'activity') {
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
                        }

                        <!-- quick-actions -->
                        @if (widget.id === 'quick-actions') {
                            <div class="section section--actions">
                                <h3>Quick Actions</h3>
                                <div class="quick-actions">
                                    <button class="action-btn" (click)="navigateTo('/sessions/new')">+ New Conversation</button>
                                    <button class="action-btn" (click)="navigateTo('/councils')">Launch Council</button>
                                    <button class="action-btn" (click)="navigateTo('/work-tasks')">Create Work Task</button>
                                    <button class="action-btn action-btn--selftest" [disabled]="selfTestRunning()" (click)="runSelfTest()">
                                        {{ selfTestRunning() ? 'Running...' : 'Run Self-Test' }}
                                    </button>
                                </div>
                            </div>
                        }

                        <!-- system-status -->
                        @if (widget.id === 'system-status') {
                            <div class="section section--status">
                                <h3>System Status</h3>
                                <div class="status-list">
                                    <div class="status-row">
                                        <span class="status-row__label">WebSocket</span>
                                        <span class="status-row__indicator" [attr.data-ok]="wsService.connected()">
                                            {{ wsService.connected() ? 'Connected' : 'Disconnected' }}
                                        </span>
                                    </div>
                                    <div class="status-row">
                                        <span class="status-row__label">AlgoChat</span>
                                        @if (algochatStatus(); as status) {
                                            <span class="status-row__indicator" [attr.data-ok]="status.enabled">
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
                                @if (activeCouncilLaunches().length > 0) {
                                    <div class="councils-sub">
                                        <h4>Active Councils</h4>
                                        @for (launch of activeCouncilLaunches(); track launch.id) {
                                            <div class="running-item">
                                                <a [routerLink]="['/council-launches', launch.id]">{{ launch.prompt.length > 50 ? launch.prompt.slice(0, 50) + '...' : launch.prompt }}</a>
                                                <span class="stage-badge" [attr.data-stage]="launch.stage">{{ launch.stage }}</span>
                                            </div>
                                        }
                                    </div>
                                }
                            </div>
                        }

                        <!-- flock -->
                        @if (widget.id === 'flock') {
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
                        }

                        <!-- comparison -->
                        @if (widget.id === 'comparison') {
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
                                                        <span class="comparison-table__na">--</span>
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
                        }
                    </div>
                }
            </div>
        </div>
        }
    `,
    styles: `
        .dashboard { padding: 1.25rem; overflow-y: auto; height: 100%; }

        /* Toolbar */
        .dash-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; gap: .5rem; flex-wrap: wrap; }
        .dash-toolbar__title { font-size: 1.1rem; font-weight: 700; color: var(--text-primary); margin: 0; }
        .dash-toolbar__right { display: flex; gap: .5rem; align-items: center; }
        .view-toggle {
            display: flex; gap: .25rem;
            background: var(--bg-surface); border: 1px solid var(--border);
            border-radius: var(--radius); padding: .15rem; width: fit-content;
        }
        .view-toggle__btn {
            padding: .35rem .75rem; border: none; border-radius: var(--radius-sm);
            font-size: .7rem; font-weight: 600; font-family: inherit;
            background: transparent; color: var(--text-tertiary); cursor: pointer;
            text-transform: uppercase; letter-spacing: .06em; transition: all .15s;
        }
        .view-toggle__btn--active {
            background: rgba(0,229,255,.1); color: var(--accent-cyan);
            border: 1px solid rgba(0,229,255,.2);
        }
        .view-toggle__btn:hover:not(.view-toggle__btn--active) { color: var(--text-secondary); }

        .customize-btn {
            padding: .35rem .85rem; border-radius: var(--radius); font-size: .7rem;
            font-weight: 600; font-family: inherit; cursor: pointer;
            border: 1px solid var(--accent-magenta); color: var(--accent-magenta);
            background: rgba(255,0,170,.06); text-transform: uppercase; letter-spacing: .05em;
            transition: all .15s;
        }
        .customize-btn:hover { background: rgba(255,0,170,.12); }

        /* Customize panel */
        .customize-panel {
            background: var(--bg-surface); border: 1px solid var(--accent-magenta);
            border-radius: var(--radius-lg); padding: 1rem 1.25rem; margin-bottom: 1.25rem;
        }
        .customize-panel__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: .35rem; }
        .customize-panel__title { font-size: .85rem; font-weight: 700; color: var(--text-primary); }
        .customize-panel__reset {
            font-size: .65rem; font-family: inherit; background: none; border: 1px solid var(--border);
            border-radius: var(--radius-sm); padding: .2rem .5rem; color: var(--text-secondary);
            cursor: pointer; transition: all .15s;
        }
        .customize-panel__reset:hover { border-color: var(--accent-cyan); color: var(--accent-cyan); }
        .customize-panel__hint { font-size: .7rem; color: var(--text-tertiary); margin: 0 0 .75rem; }

        .customize-list { display: flex; flex-direction: column; gap: .25rem; }
        .customize-item {
            display: flex; align-items: center; gap: .5rem;
            padding: .4rem .6rem; border-radius: var(--radius-sm);
            border: 1px solid var(--border); background: var(--bg-raised);
            cursor: grab; transition: all .15s;
        }
        .customize-item:active { cursor: grabbing; }
        .customize-item--dragging { opacity: .4; border-color: var(--accent-cyan); }
        .customize-item--hidden { opacity: .5; }
        .customize-item__handle { font-size: .75rem; color: var(--text-tertiary); user-select: none; }
        .customize-item__label { flex: 1; font-size: .75rem; color: var(--text-primary); font-weight: 600; }
        .customize-item__toggle {
            padding: .15rem .45rem; font-size: .6rem; font-weight: 700; font-family: inherit;
            border-radius: var(--radius-sm); cursor: pointer; text-transform: uppercase;
            letter-spacing: .05em; transition: all .15s;
        }
        .customize-item__toggle[data-visible="true"] {
            background: rgba(0,255,136,.1); border: 1px solid var(--accent-green); color: var(--accent-green);
        }
        .customize-item__toggle[data-visible="false"] {
            background: var(--bg-surface); border: 1px solid var(--border); color: var(--text-tertiary);
        }

        /* Widget grid */
        .widget-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; align-items: start; }
        .widget--full { grid-column: 1 / -1; }
        .widget { transition: outline .15s; border-radius: var(--radius-lg); }
        .widget--drag-over { outline: 2px dashed var(--accent-cyan); outline-offset: 4px; }
        .widget[draggable="true"] { cursor: grab; }
        .widget[draggable="true"]:active { cursor: grabbing; }

        /* Metrics */
        .metrics-row { display: grid; grid-template-columns: repeat(auto-fill,minmax(140px,1fr)); gap: .75rem; }
        .metric-card {
            padding: .75rem 1rem; display: flex; flex-direction: column; gap: .2rem; transition: border-color .15s;
            background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-lg);
        }
        .metric-card:hover { border-color: var(--border-bright); }
        .metric-card--highlight { border-color: var(--accent-amber,#ffc107); border-style: dashed; }
        .metric-card__label { font-size: .6rem; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: .08em; font-weight: 600; }
        .metric-card__value { font-size: 1.5rem; font-weight: 700; color: var(--accent-cyan); }
        .metric-card__value--usd { color: var(--accent-green); }
        .metric-card__value--algo { color: var(--accent-magenta); }
        .metric-card__value--active { color: var(--accent-amber,#ffc107); }
        .metric-card__value--work { color: var(--accent-amber,#ffc107); }
        .metric-card__link { font-size: .65rem; color: var(--accent-cyan); text-decoration: none; opacity: .7; }
        .metric-card__link:hover { opacity: 1; text-decoration: underline; }
        .metric-card__sub { font-size: .6rem; color: var(--text-tertiary); text-transform: uppercase; }

        /* Sections */
        .section, .simple-hero {
            background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-lg);
            padding: 1rem 1.25rem;
        }
        .section h3 { margin: 0 0 .75rem; color: var(--text-primary); font-size: .85rem; }
        .section__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: .75rem; }
        .section__header h3 { margin: 0; }
        .section__link { font-size: .7rem; color: var(--accent-cyan); text-decoration: none; }
        .section__link:hover { text-decoration: underline; }

        /* Simple hero */
        .simple-hero { text-align: center; padding: 2rem; }
        .simple-hero__title { margin: 0 0 .5rem; font-size: 1.2rem; font-weight: 700; color: var(--text-primary); }
        .simple-hero__desc { margin: 0 0 1.25rem; font-size: .8rem; color: var(--text-tertiary); max-width: 400px; margin-left: auto; margin-right: auto; }
        .simple-hero__btn {
            padding: .6rem 1.5rem; border-radius: var(--radius); font-size: .8rem; font-weight: 600;
            font-family: inherit; border: 1px solid var(--accent-cyan); color: var(--accent-cyan);
            background: rgba(0,229,255,.06); cursor: pointer; text-transform: uppercase; letter-spacing: .05em; transition: all .15s;
        }
        .simple-hero__btn:hover { background: rgba(0,229,255,.14); box-shadow: 0 0 16px rgba(0,229,255,.15); }

        /* Creator hero */
        .creator-hero {
            background: var(--bg-surface); border: 1px solid var(--accent-cyan);
            border-radius: var(--radius-lg); padding: 2rem; text-align: center;
            margin-bottom: 1.25rem;
            background-image: radial-gradient(ellipse at top, rgba(0,229,255,.04) 0%, transparent 60%);
        }
        .creator-hero__title { margin: 0 0 .5rem; font-size: 1.4rem; font-weight: 700; color: var(--text-primary); }
        .creator-hero__desc { margin: 0 0 1.25rem; font-size: .85rem; color: var(--text-tertiary); max-width: 480px; margin-left: auto; margin-right: auto; }
        .creator-hero__prompts { display: flex; flex-wrap: wrap; justify-content: center; gap: .5rem; margin-bottom: 1.25rem; }
        .creator-hero__prompt-btn {
            padding: .45rem .85rem; border-radius: 9999px; font-size: .75rem; font-weight: 500;
            font-family: inherit; border: 1px solid var(--border-bright); color: var(--text-secondary);
            background: var(--bg-raised); cursor: pointer; transition: all .15s;
        }
        .creator-hero__prompt-btn:hover {
            border-color: var(--accent-cyan); color: var(--accent-cyan);
            background: rgba(0,229,255,.06); box-shadow: 0 0 12px rgba(0,229,255,.1);
        }
        .creator-hero__start-btn {
            padding: .65rem 1.75rem; border-radius: var(--radius); font-size: .85rem; font-weight: 600;
            font-family: inherit; border: 1px solid var(--accent-cyan); color: var(--accent-cyan);
            background: rgba(0,229,255,.08); cursor: pointer; text-transform: uppercase; letter-spacing: .05em;
            transition: all .15s;
        }
        .creator-hero__start-btn:hover { background: rgba(0,229,255,.16); box-shadow: 0 0 20px rgba(0,229,255,.15); }

        /* Agent grid */
        .agent-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(260px,1fr)); gap: .75rem; }
        .agent-card {
            display: block; background: var(--bg-raised); border: 1px solid var(--border);
            border-radius: var(--radius); padding: .75rem; text-decoration: none;
            color: inherit; cursor: pointer; transition: border-color .15s,box-shadow .15s;
        }
        .agent-card:hover { border-color: var(--accent-cyan); box-shadow: 0 0 12px rgba(0,229,255,.08); }
        .agent-card__top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: .5rem; }
        .agent-card__info, .agent-card__stat { display: flex; flex-direction: column; gap: .1rem; }
        .agent-card__name { font-weight: 700; font-size: .85rem; color: var(--text-primary); }
        .agent-card__provider-badge {
            font-size: .55rem; font-family: var(--font-mono,monospace); font-weight: 600;
            padding: 1px 6px; border-radius: var(--radius-sm); border: 1px solid;
            text-transform: uppercase; letter-spacing: .05em;
        }
        .agent-card__provider-badge[data-provider="anthropic"] { color: #d4a574; border-color: #d4a57466; }
        .agent-card__provider-badge[data-provider="openai"] { color: #74d4a5; border-color: #74d4a566; }
        .agent-card__provider-badge[data-provider="ollama"] { color: #a5a5ff; border-color: #a5a5ff66; }
        .agent-card__status, .comparison-table__status {
            font-size: .6rem; font-weight: 700; padding: 2px 8px; border-radius: var(--radius-sm);
            text-transform: uppercase; letter-spacing: .06em; border: 1px solid;
        }
        [data-status="busy"] { color: var(--accent-green); border-color: var(--accent-green); background: rgba(0,255,136,.08); }
        [data-status="idle"] { color: var(--text-tertiary); border-color: var(--border); background: var(--bg-surface); }
        .agent-card__stats { display: flex; gap: 1rem; margin-bottom: .5rem; }
        .agent-card__stat-value, .agent-card__stat-value--algo { font-weight: 700; }
        .agent-card__stat-value { font-size: .95rem; color: var(--accent-cyan); }
        .agent-card__stat-value--algo { font-size: .85rem; color: var(--accent-green); }
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
        .agent-card__reputation { display: flex; align-items: center; gap: .25rem; margin-top: .15rem; }
        .agent-card__rep-score, .flock-card__score, .comparison-table__rep-val {
            font-size: .75rem; font-weight: 700; font-family: var(--font-mono,monospace);
        }
        .agent-card__rep-score, .flock-card__score { padding: 1px 5px; border-radius: var(--radius-sm); border: 1px solid; }
        [data-level="high"] { color: var(--accent-cyan); border-color: var(--accent-cyan); }
        [data-level="mid"] { color: var(--accent-amber,#ffc107); border-color: var(--accent-amber,#ffc107); }
        [data-level="low"] { color: var(--accent-red); border-color: var(--accent-red); }
        .agent-card__rep-label { font-size: .55rem; color: var(--text-tertiary); text-transform: uppercase; }
        .agent-card__capabilities { display: flex; flex-wrap: wrap; gap: .25rem; margin-top: .35rem; }
        .agent-card__cap-pill, .flock-card__cap {
            font-size: .55rem; padding: 1px 6px; border-radius: 9999px;
            text-transform: lowercase; font-weight: 500;
        }
        .agent-card__cap-pill { background: rgba(0,229,255,.08); border: 1px solid rgba(0,229,255,.2); color: var(--accent-cyan); }
        .agent-card__cap-more { font-size: .55rem; padding: 1px 6px; color: var(--text-tertiary); font-weight: 500; }

        /* Bar charts (vertical) */
        .bar-chart { padding: .25rem 0; }
        .bar-chart__bars { display: flex; align-items: flex-end; gap: 2px; height: 120px; }
        .bar-chart__col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; min-width: 0; }
        .bar-chart__bar {
            width: 100%; min-height: 2px; border-radius: 2px 2px 0 0;
            transition: height .3s;
        }
        .bar-chart__bar--spending {
            background: linear-gradient(180deg, var(--accent-green), rgba(0,255,136,.3));
        }
        .bar-chart__label { font-size: .5rem; color: var(--text-tertiary); margin-top: .25rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
        .empty-chart { font-size: .75rem; color: var(--text-tertiary); text-align: center; padding: 2rem 0; }

        /* Chart controls */
        .chart-controls { display: flex; gap: .25rem; }
        .chart-btn {
            padding: .2rem .5rem; background: var(--bg-raised); border: 1px solid var(--border);
            border-radius: var(--radius-sm); color: var(--text-secondary); font-size: .6rem;
            font-family: inherit; cursor: pointer; transition: all .15s;
        }
        .chart-btn:hover { border-color: var(--border-bright); color: var(--text-primary); }
        .chart-btn--active { border-color: var(--accent-cyan); color: var(--accent-cyan); background: rgba(0,229,255,.08); }

        /* Ring (donut) chart */
        .chart-duo { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }
        .ring-chart { display: flex; align-items: center; gap: .75rem; }
        .ring-chart__visual { position: relative; width: 90px; height: 90px; flex-shrink: 0; }
        .ring-chart__svg { width: 100%; height: 100%; transform: rotate(-90deg); }
        .ring-chart__segment { transition: stroke-dasharray .3s, stroke-dashoffset .3s; }
        .ring-chart__segment[data-status="running"] { stroke: var(--accent-cyan); }
        .ring-chart__segment[data-status="stopped"] { stroke: var(--text-tertiary); }
        .ring-chart__segment[data-status="idle"] { stroke: var(--accent-amber,#ffc107); }
        .ring-chart__segment[data-status="error"] { stroke: var(--accent-red); }
        .ring-chart__segment[data-status="completed"] { stroke: var(--accent-green); }
        .ring-chart__center {
            position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
            font-size: 1.1rem; font-weight: 700; color: var(--text-primary);
        }
        .ring-chart__legend { display: flex; flex-direction: column; gap: .2rem; }
        .ring-chart__legend-item { display: flex; align-items: center; gap: .35rem; font-size: .7rem; }
        .ring-chart__dot {
            width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
        }
        .ring-chart__dot[data-status="running"] { background: var(--accent-cyan); }
        .ring-chart__dot[data-status="stopped"] { background: var(--text-tertiary); }
        .ring-chart__dot[data-status="idle"] { background: var(--accent-amber,#ffc107); }
        .ring-chart__dot[data-status="error"] { background: var(--accent-red); }
        .ring-chart__dot[data-status="completed"] { background: var(--accent-green); }
        .ring-chart__legend-label { color: var(--text-secondary); text-transform: capitalize; }
        .ring-chart__legend-val { color: var(--text-primary); font-weight: 700; margin-left: auto; }

        /* Source bars */
        .source-bars__title { margin: 0 0 .5rem; font-size: .75rem; color: var(--text-primary); font-weight: 600; }
        .source-bar-row { display: flex; align-items: center; gap: .5rem; margin-bottom: .35rem; }
        .source-bar-row__label { width: 60px; flex-shrink: 0; font-size: .65rem; color: var(--text-secondary); text-transform: capitalize; }
        .source-bar-row__track { flex: 1; height: 12px; background: var(--bg-raised); border-radius: 2px; overflow: hidden; }
        .source-bar-row__fill {
            height: 100%; border-radius: 2px; min-width: 2px; transition: width .3s;
        }
        .source-bar-row__fill[data-source="schedule"] { background: var(--source-schedule); }
        .source-bar-row__fill[data-source="poll"], .source-bar-row__fill[data-source="mention_poll"] { background: var(--source-poll); }
        .source-bar-row__fill[data-source="manual"], .source-bar-row__fill[data-source="web"] { background: var(--source-manual); }
        .source-bar-row__fill[data-source="work_task"] { background: var(--source-work); }
        .source-bar-row__val { width: 30px; flex-shrink: 0; font-size: .65rem; color: var(--text-primary); font-weight: 600; text-align: right; }

        /* Agent usage chart */
        .usage-chart { display: flex; flex-direction: column; gap: .4rem; }
        .usage-row { display: flex; align-items: center; gap: .5rem; }
        .usage-row__name { width: 80px; flex-shrink: 0; font-size: .7rem; color: var(--accent-cyan); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .usage-row__bar-wrap { flex: 1; display: flex; flex-direction: column; gap: 2px; }
        .usage-row__sessions, .usage-row__cost { height: 8px; border-radius: 2px; min-width: 2px; transition: width .3s; }
        .usage-row__sessions { background: linear-gradient(90deg, rgba(0,229,255,.3), var(--accent-cyan)); }
        .usage-row__cost { background: linear-gradient(90deg, rgba(0,255,136,.3), var(--accent-green)); }
        .usage-row__vals { display: flex; flex-direction: column; gap: 1px; width: 50px; flex-shrink: 0; }
        .usage-row__val { font-size: .55rem; font-weight: 600; text-align: right; }
        .usage-row__val--sessions { color: var(--accent-cyan); }
        .usage-row__val--cost { color: var(--accent-green); }
        .usage-legend { display: flex; gap: 1rem; margin-top: .35rem; justify-content: center; }
        .usage-legend__item { font-size: .6rem; color: var(--text-tertiary); }
        .usage-legend__item::before { content: ''; display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: .25rem; vertical-align: middle; }
        .usage-legend__item--sessions::before { background: var(--accent-cyan); }
        .usage-legend__item--cost::before { background: var(--accent-green); }

        /* Activity feed */
        .empty-activity { text-align: center; padding: 2rem 1rem; }
        .empty-activity__title { color: var(--text-secondary); font-size: .85rem; font-weight: 600; margin: 0 0 .35rem; }
        .empty-activity__hint { color: var(--text-tertiary); font-size: .75rem; margin: 0; line-height: 1.5; }
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
        .activity-item__icon[data-type="work_task"], .activity-item__icon[data-type="agent_message"] { color: var(--accent-magenta); border-color: var(--accent-magenta); }
        .activity-item__icon[data-type="council"] { color: var(--accent-amber,#ffc107); border-color: var(--accent-amber,#ffc107); }
        .activity-item__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: .1rem; }
        .activity-item__label, .activity-item__detail, .comparison-table__name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .activity-item__label { font-size: .8rem; font-weight: 600; color: var(--text-primary); }
        .activity-item__detail { font-size: .7rem; color: var(--text-tertiary); }
        .activity-item__time { font-size: .65rem; color: var(--text-tertiary); flex-shrink: 0; }

        /* Quick actions */
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

        /* System status */
        .status-list { display: flex; flex-direction: column; gap: .25rem; }
        .status-row { display: flex; justify-content: space-between; align-items: center; padding: .35rem 0; border-bottom: 1px solid var(--border); font-size: .8rem; }
        .status-row:last-child { border-bottom: none; }
        .status-row__label { color: var(--text-secondary); }
        .status-row__indicator { font-weight: 600; font-size: .75rem; }
        .status-row__indicator[data-ok="true"] { color: var(--accent-green); }
        .status-row__indicator[data-ok="false"] { color: var(--accent-red); }
        .status-row__value { font-weight: 600; color: var(--text-primary); }
        .status-row__value--version { font-family: var(--font-mono,monospace); font-size: .75rem; color: var(--text-tertiary); }
        .councils-sub { margin-top: .75rem; border-top: 1px solid var(--border); padding-top: .5rem; }
        .councils-sub h4 { margin: 0 0 .5rem; font-size: .75rem; color: var(--text-primary); }
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

        /* Flock directory */
        .flock-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(200px,1fr)); gap: .75rem; }
        .flock-card {
            background: var(--bg-raised); border: 1px solid var(--border);
            border-radius: var(--radius); padding: .75rem; transition: border-color .15s;
        }
        .flock-card:hover { border-color: var(--accent-magenta); }
        .flock-card__top { display: flex; justify-content: space-between; align-items: center; margin-bottom: .35rem; }
        .flock-card__name { font-weight: 700; font-size: .8rem; color: var(--text-primary); }
        .flock-card__desc { font-size: .7rem; color: var(--text-tertiary); margin: 0 0 .4rem; line-height: 1.4; }
        .flock-card__caps { display: flex; gap: .25rem; margin-bottom: .5rem; }
        .flock-card__cap { background: rgba(255,0,128,.08); border: 1px solid rgba(255,0,128,.2); color: var(--accent-magenta); }
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

        /* Comparison table */
        .comparison-table { border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
        .comparison-table__header, .comparison-table__row { display: grid; grid-template-columns: 2fr 2fr 1fr 1fr .75fr; padding: .5rem 1rem; align-items: center; }
        .comparison-table__header { background: var(--bg-raised); font-size: .7rem; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--text-secondary); }
        .comparison-table__row { border-top: 1px solid var(--border); font-size: .8rem; color: var(--text-primary); text-decoration: none; transition: background .1s; }
        .comparison-table__row:hover { background: var(--bg-hover); }
        .comparison-table__name { font-weight: 600; color: var(--accent-cyan); }
        .comparison-table__rep { display: flex; align-items: center; gap: .5rem; }
        .comparison-table__rep-bar { flex: 1; height: 6px; background: var(--bg-raised); border-radius: 3px; overflow: hidden; max-width: 80px; }
        .comparison-table__rep-fill { height: 100%; border-radius: 3px; min-width: 1px; transition: width .3s; }
        .comparison-table__rep-fill[data-level="high"] { background: var(--accent-cyan); }
        .comparison-table__rep-fill[data-level="mid"] { background: var(--accent-amber,#ffc107); }
        .comparison-table__rep-fill[data-level="low"] { background: var(--accent-red); }
        .comparison-table__rep-val { color: var(--text-primary); }
        .comparison-table__na { color: var(--text-tertiary); font-size: .75rem; }
        .comparison-table__sessions { display: flex; align-items: center; gap: .25rem; }
        .comparison-table__sessions-val { font-weight: 700; color: var(--accent-cyan); }
        .comparison-table__sessions-label { font-size: .6rem; color: var(--text-tertiary); text-transform: uppercase; }
        .comparison-table__balance { color: var(--accent-green); font-family: var(--font-mono,monospace); font-size: .8rem; }
        .comparison-table__status { text-align: center; }

        /* Responsive */
        @media (max-width:768px) {
            .dashboard { padding: 1rem; }
            .widget-grid { grid-template-columns: 1fr; }
            .metrics-row { grid-template-columns: repeat(auto-fill,minmax(120px,1fr)); }
            .agent-grid { grid-template-columns: 1fr; }
            .chart-duo { grid-template-columns: 1fr; }
            .quick-actions { flex-direction: row; flex-wrap: wrap; }
            .action-btn { flex: 1 1 calc(50% - .25rem); min-width: 0; text-align: center; }
        }
        @media (max-width:480px) {
            .dashboard { padding: .75rem; }
            .metrics-row { grid-template-columns: repeat(2,1fr); gap: .5rem; }
            .metric-card { padding: .5rem .75rem; }
            .metric-card__value { font-size: 1.2rem; }
            .section { padding: .75rem; }
            .creator-hero { padding: 1.25rem; }
            .creator-hero__title { font-size: 1.1rem; }
            .creator-hero__prompts { flex-direction: column; }
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

    protected readonly layoutService = inject(WidgetLayoutService);

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

    // Analytics data
    protected readonly spendingData = signal<SpendingData | null>(null);
    protected readonly sessionStats = signal<SessionStats | null>(null);
    protected readonly spendingDays = signal(14);

    // Drag state for customize panel
    protected readonly dragIndex = signal(-1);
    // Drag state for widget grid
    protected readonly widgetDragIndex = signal(-1);
    protected readonly widgetDragOver = signal(-1);

    protected readonly promptSuggestions = [
        'Build me a portfolio website',
        'Create a REST API for my project',
        'Help me debug my application',
        'Set up a CI/CD pipeline',
    ];

    protected readonly activeWorkTaskCount = computed(() => {
        const tasks = this.overview()?.workTasks;
        if (!tasks) return 0;
        return (tasks['pending'] ?? 0) + (tasks['running'] ?? 0) + (tasks['branching'] ?? 0) + (tasks['validating'] ?? 0);
    });

    protected readonly activeScheduleCount = computed(() =>
        this.scheduleService.schedules().filter((s) => s.status === 'active').length,
    );

    // Spending chart bars (vertical)
    protected readonly spendingBars = computed(() => {
        const data = this.spendingData();
        if (!data) return [];
        const dateMap = new Map<string, number>();
        for (const d of data.spending) dateMap.set(d.date, (dateMap.get(d.date) ?? 0) + d.api_cost_usd);
        for (const d of data.sessionCosts) dateMap.set(d.date, (dateMap.get(d.date) ?? 0) + d.cost_usd);
        const entries = Array.from(dateMap.entries()).map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
        const max = Math.max(...entries.map((e) => e.value), 0.001);
        return entries.map((e) => ({
            date: e.date,
            dateShort: e.date.slice(5),
            value: e.value,
            pct: (e.value / max) * 100,
        }));
    });

    // Session status ring chart segments
    protected readonly statusSegments = computed(() => {
        const stats = this.sessionStats();
        if (!stats) return [];
        const total = stats.byStatus.reduce((sum, e) => sum + e.count, 0);
        if (total === 0) return [];
        const circumference = 100;
        let offset = 0;
        return stats.byStatus.map((entry) => {
            const pct = (entry.count / total) * circumference;
            const seg = {
                status: entry.status,
                count: entry.count,
                dashArray: `${pct} ${circumference - pct}`,
                dashOffset: `${-offset}`,
            };
            offset += pct;
            return seg;
        });
    });

    protected readonly totalSessionCount = computed(() => {
        const stats = this.sessionStats();
        if (!stats) return 0;
        return stats.byStatus.reduce((sum, e) => sum + e.count, 0);
    });

    // Max source count for bar scaling
    private readonly maxSourceCount = computed(() => {
        const stats = this.sessionStats();
        if (!stats) return 1;
        return Math.max(...stats.bySource.map((e) => e.count), 1);
    });

    protected readonly activityFeed = computed<ActivityEvent[]>(() => {
        const sessions = this.sessionService.sessions();
        const agents = this.agentService.agents();
        const agentMap = new Map(agents.map((a) => [a.id, a.name]));

        const events: ActivityEvent[] = [];

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

        return events
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 15);
    });

    private unsubscribeWs: (() => void) | null = null;

    /** Which widgets should span full width */
    protected isFullWidth(id: WidgetId): boolean {
        return id === 'metrics' || id === 'agents' || id === 'flock' || id === 'comparison';
    }

    protected sourceBarPct(count: number): number {
        return (count / this.maxSourceCount()) * 100;
    }

    protected agentBarPct(value: number, type: 'sessions' | 'cost'): number {
        const stats = this.sessionStats();
        if (!stats || stats.byAgent.length === 0) return 0;
        const max = type === 'sessions'
            ? Math.max(...stats.byAgent.map((a) => a.session_count), 1)
            : Math.max(...stats.byAgent.map((a) => a.total_cost), 0.001);
        return (value / max) * 100;
    }

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
            this.loadSpendingData(),
            this.loadSessionStats(),
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

    protected startChatWithPrompt(prompt: string): void {
        const firstAgent = this.agentSummaries()[0]?.agent;
        if (firstAgent) {
            this.router.navigate(['/sessions/new'], { queryParams: { agentId: firstAgent.id, prompt } });
        } else {
            this.router.navigate(['/sessions/new'], { queryParams: { prompt } });
        }
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

    // Customize panel drag handlers
    protected onCustomizeDragStart(event: DragEvent, index: number): void {
        this.dragIndex.set(index);
        event.dataTransfer?.setData('text/plain', String(index));
    }

    protected onCustomizeDragOver(event: DragEvent, index: number): void {
        event.preventDefault();
    }

    protected onCustomizeDrop(event: DragEvent, toIndex: number): void {
        event.preventDefault();
        const fromIndex = this.dragIndex();
        if (fromIndex >= 0 && fromIndex !== toIndex) {
            this.layoutService.moveWidget(fromIndex, toIndex);
        }
        this.dragIndex.set(-1);
    }

    // Widget grid drag handlers
    protected onWidgetDragStart(event: DragEvent, index: number): void {
        this.widgetDragIndex.set(index);
        event.dataTransfer?.setData('text/plain', String(index));
    }

    protected onWidgetDragOver(event: DragEvent, index: number): void {
        event.preventDefault();
        this.widgetDragOver.set(index);
    }

    protected onWidgetDrop(event: DragEvent, toIndex: number): void {
        event.preventDefault();
        const fromIndex = this.widgetDragIndex();
        if (fromIndex >= 0 && fromIndex !== toIndex) {
            // Map visible widget indices back to full widget list indices
            const visibleWidgets = this.layoutService.visibleWidgets();
            const allWidgets = this.layoutService.widgets();
            const fromId = visibleWidgets[fromIndex]?.id;
            const toId = visibleWidgets[toIndex]?.id;
            const fromAll = allWidgets.findIndex((w) => w.id === fromId);
            const toAll = allWidgets.findIndex((w) => w.id === toId);
            if (fromAll >= 0 && toAll >= 0) {
                this.layoutService.moveWidget(fromAll, toAll);
            }
        }
        this.widgetDragIndex.set(-1);
        this.widgetDragOver.set(-1);
    }

    // Spending chart day range switcher
    protected loadSpending(days: number): void {
        this.spendingDays.set(days);
        this.loadSpendingData();
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

    private async loadSpendingData(): Promise<void> {
        try {
            const data = await firstValueFrom(
                this.apiService.get<SpendingData>(`/analytics/spending?days=${this.spendingDays()}`),
            );
            this.spendingData.set(data);
        } catch {
            // Non-critical
        }
    }

    private async loadSessionStats(): Promise<void> {
        try {
            const stats = await firstValueFrom(
                this.apiService.get<SessionStats>('/analytics/sessions'),
            );
            this.sessionStats.set(stats);
        } catch {
            // Non-critical
        }
    }

    private async loadAgentSummaries(): Promise<void> {
        const agents = this.agentService.agents();
        if (agents.length === 0) return;

        const sessions = this.sessionService.sessions();

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
            const unique = [...new Map(allMessages.map(m => [m.id, m])).values()];
            this.agentMessages.set(unique.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 20));
        } catch {
            // Non-critical
        }
    }
}

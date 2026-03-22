import { Component, ChangeDetectionStrategy, inject, OnInit, OnDestroy, computed, signal, HostListener } from '@angular/core';
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
import { GuidedTourService } from '../../core/services/guided-tour.service';
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
                <div class="dash-toolbar__left">
                    <span class="dash-toolbar__title">Dashboard</span>
                    <span class="connection-badge" [attr.data-status]="connectionState()">
                        <span class="connection-badge__dot"></span>
                        <span class="connection-badge__label">{{ connectionLabel() }}</span>
                    </span>
                    @if (lastRefresh()) {
                        <span class="dash-toolbar__updated">Updated {{ lastRefresh() | relativeTime }}</span>
                    }
                </div>
                <div class="dash-toolbar__right">
                    <div class="view-toggle">
                        <button class="view-toggle__btn"
                                [class.view-toggle__btn--active]="layoutService.viewMode() === 'simple'"
                                (click)="layoutService.setViewMode('simple')"
                                title="Simplified view for everyday use">Simple</button>
                        <button class="view-toggle__btn"
                                [class.view-toggle__btn--active]="layoutService.viewMode() === 'developer'"
                                (click)="layoutService.setViewMode('developer')"
                                title="Full dashboard with metrics, charts, and developer tools">Developer</button>
                    </div>
                    @if (layoutService.viewMode() === 'developer') {
                        <button class="customize-btn" (click)="layoutService.customizing.set(!layoutService.customizing())">
                            {{ layoutService.customizing() ? 'Done' : 'Customize' }}
                        </button>
                    }
                </div>
            </div>

            <!-- Customize panel (developer mode only) -->
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

            <!-- Simple mode hero prompt -->
            @if (layoutService.viewMode() === 'simple') {
                <div class="simple-prompt">
                    <h2 class="simple-prompt__title">What would you like to build?</h2>
                    <p class="simple-prompt__desc">Start a conversation with your agent to build something new, or check on active sessions below.</p>
                    <div class="simple-prompt__actions">
                        <button class="simple-prompt__btn simple-prompt__btn--primary" (click)="navigateTo('/sessions/new')">Start a Conversation</button>
                        <button class="simple-prompt__btn" (click)="navigateTo('/chat')">Open Chat</button>
                    </div>
                </div>
            }

            <!-- Widget grid: render visible widgets in order -->
            <div class="widget-grid stagger-children">
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

                        @if (widgetRefreshing()[widget.id]) {
                            <div class="widget-refreshing">
                                <app-skeleton [variant]="widget.id === 'metrics' ? 'card' : 'line'" [count]="3" />
                            </div>
                        }

                        <!-- metrics -->
                        @if (widget.id === 'metrics') {
                            <div class="metrics-row stagger-scale">
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
                                    <a class="metric-card__link" routerLink="/agents/projects">View all</a>
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
                                    <a class="metric-card__link" routerLink="/sessions/work-tasks">View all</a>
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
                                        <div class="section__header-actions">
                                            <a class="section__link" routerLink="/agents">View all agents</a>
                                            <button class="section__refresh" [class.section__refresh--spinning]="widgetRefreshing()['agents']" (click)="refreshWidget('agents')" title="Refresh">&#x21bb;</button>
                                        </div>
                                    </div>
                                    <div class="agent-grid">
                                        @for (summary of agentSummaries(); track summary.agent.id) {
                                            <a class="agent-card" [routerLink]="['/agents', summary.agent.id]">
                                                <div class="agent-card__top">
                                                    <div class="agent-card__info">
                                                        <div class="agent-card__name-row">
                                                            <span class="agent-card__health-dot" [attr.data-health]="getAgentHealth(summary)"></span>
                                                            <span class="agent-card__name">{{ summary.agent.name }}</span>
                                                        </div>
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

                        <!-- active-sessions -->
                        @if (widget.id === 'active-sessions') {
                            <div class="section">
                                <div class="section__header">
                                    <h3>Active Sessions</h3>
                                    <div class="section__header-actions">
                                        <a class="section__link" routerLink="/sessions">View all sessions</a>
                                        <button class="section__refresh" [class.section__refresh--spinning]="widgetRefreshing()['active-sessions']" (click)="refreshWidget('active-sessions')" title="Refresh">&#x21bb;</button>
                                    </div>
                                </div>
                                @if (runningSessions().length === 0) {
                                    <div class="empty-state">
                                        <p class="empty-state__title">No active sessions</p>
                                        <p class="empty-state__hint">Start a conversation or work task to see live sessions here.</p>
                                        <div class="empty-state__actions">
                                            <a class="empty-state__link" routerLink="/sessions/new">New conversation</a>
                                            <a class="empty-state__link" routerLink="/work-tasks">Create work task</a>
                                        </div>
                                    </div>
                                } @else {
                                    <div class="session-list">
                                        @for (session of runningSessions().slice(0, 8); track session.id) {
                                            <a class="session-item" [routerLink]="['/sessions', session.id]">
                                                <span class="session-item__dot"></span>
                                                <div class="session-item__body">
                                                    <span class="session-item__label">{{ session.name || session.initialPrompt?.slice(0, 60) || 'Session' }}{{ !session.name && (session.initialPrompt?.length ?? 0) > 60 ? '...' : '' }}</span>
                                                    <span class="session-item__detail">{{ getAgentName(session.agentId) }} &middot; {{ session.source }}</span>
                                                </div>
                                                <span class="session-item__time" [title]="session.createdAt | absoluteTime">{{ session.createdAt | relativeTime }}</span>
                                            </a>
                                        }
                                        @if (runningSessions().length > 8) {
                                            <a class="session-list__more" routerLink="/sessions">+ {{ runningSessions().length - 8 }} more</a>
                                        }
                                    </div>
                                }
                            </div>
                        }

                        <!-- spending-chart -->
                        @if (widget.id === 'spending-chart') {
                            @if (widgetErrors()['spending-chart']) {
                                <div class="widget-error">
                                    <span class="widget-error__icon">!</span>
                                    <span class="widget-error__msg">{{ widgetErrors()['spending-chart'] }}</span>
                                    <button class="widget-error__retry" (click)="refreshWidget('spending-chart')">Retry</button>
                                </div>
                            } @else {
                            <div class="section">
                                <div class="section__header">
                                    <h3>Spending Trend</h3>
                                    <div class="section__header-actions">
                                        <div class="chart-controls">
                                            <button class="chart-btn" [class.chart-btn--active]="spendingDays() === 7" (click)="loadSpending(7)">7d</button>
                                            <button class="chart-btn" [class.chart-btn--active]="spendingDays() === 14" (click)="loadSpending(14)">14d</button>
                                            <button class="chart-btn" [class.chart-btn--active]="spendingDays() === 30" (click)="loadSpending(30)">30d</button>
                                        </div>
                                        <button class="section__refresh" [class.section__refresh--spinning]="widgetRefreshing()['spending-chart']" (click)="refreshWidget('spending-chart')" title="Refresh">&#x21bb;</button>
                                    </div>
                                </div>
                                @if (spendingBars().length > 0) {
                                    <div class="spending-summary">
                                        <span class="spending-summary__total">\${{ spendingTotal().toFixed(2) }}</span>
                                        <span class="spending-summary__label">total over {{ spendingDays() }}d</span>
                                        <span class="spending-summary__avg">\${{ spendingDailyAvg().toFixed(4) }}/day avg</span>
                                    </div>
                                    <div class="bar-chart">
                                        <div class="bar-chart__bars">
                                            @for (bar of spendingBars(); track bar.date) {
                                                <div class="bar-chart__col bar-chart__col--hoverable"
                                                     (mouseenter)="hoveredBar.set(bar)"
                                                     (mouseleave)="hoveredBar.set(null)">
                                                    <div class="bar-chart__tooltip" [class.bar-chart__tooltip--visible]="hoveredBar() === bar">
                                                        <span class="bar-chart__tooltip-date">{{ bar.date }}</span>
                                                        <span class="bar-chart__tooltip-val">\${{ bar.value.toFixed(4) }}</span>
                                                        <span class="bar-chart__tooltip-cum">cumulative: \${{ bar.cumulative.toFixed(2) }}</span>
                                                    </div>
                                                    <div class="bar-chart__bar bar-chart__bar--spending" [style.height.%]="bar.pct"></div>
                                                    <span class="bar-chart__label">{{ bar.dateShort }}</span>
                                                </div>
                                            }
                                        </div>
                                    </div>
                                } @else {
                                    <div class="empty-state">
                                        <p class="empty-state__title">No spending data yet</p>
                                        <p class="empty-state__hint">Spending will appear here once your agents start running sessions.</p>
                                        <a class="empty-state__link" routerLink="/sessions/new">Start a conversation</a>
                                    </div>
                                }
                            </div>
                            }
                        }

                        <!-- session-chart -->
                        @if (widget.id === 'session-chart') {
                            @if (widgetErrors()['session-chart']) {
                                <div class="widget-error">
                                    <span class="widget-error__icon">!</span>
                                    <span class="widget-error__msg">{{ widgetErrors()['session-chart'] }}</span>
                                    <button class="widget-error__retry" (click)="refreshWidget('session-chart')">Retry</button>
                                </div>
                            } @else {
                            <div class="section">
                                <div class="section__header">
                                    <h3>Sessions Breakdown</h3>
                                    <button class="section__refresh" [class.section__refresh--spinning]="widgetRefreshing()['session-chart']" (click)="refreshWidget('session-chart')" title="Refresh">&#x21bb;</button>
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
                                                            (mouseenter)="hoveredSegment.set(seg)"
                                                            (mouseleave)="hoveredSegment.set(null)"
                                                        />
                                                    }
                                                </svg>
                                                @if (hoveredSegment()) {
                                                    <span class="ring-chart__tooltip">{{ hoveredSegment()!.status }}: {{ hoveredSegment()!.count }}</span>
                                                } @else {
                                                    <span class="ring-chart__center">{{ totalSessionCount() }}</span>
                                                }
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
                                    <div class="empty-state">
                                        <p class="empty-state__title">No session data yet</p>
                                        <p class="empty-state__hint">Session breakdowns will appear after your first conversation.</p>
                                        <a class="empty-state__link" routerLink="/sessions/new">Start a conversation</a>
                                    </div>
                                }
                            </div>
                            }
                        }

                        <!-- agent-usage-chart -->
                        @if (widget.id === 'agent-usage-chart') {
                            @if (widgetErrors()['agent-usage-chart']) {
                                <div class="widget-error">
                                    <span class="widget-error__icon">!</span>
                                    <span class="widget-error__msg">{{ widgetErrors()['agent-usage-chart'] }}</span>
                                    <button class="widget-error__retry" (click)="refreshWidget('agent-usage-chart')">Retry</button>
                                </div>
                            } @else {
                            <div class="section">
                                <div class="section__header">
                                    <h3>Agent Usage</h3>
                                    <button class="section__refresh" [class.section__refresh--spinning]="widgetRefreshing()['agent-usage-chart']" (click)="refreshWidget('agent-usage-chart')" title="Refresh">&#x21bb;</button>
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
                                    <div class="empty-state">
                                        <p class="empty-state__title">No agent usage data yet</p>
                                        <p class="empty-state__hint">Usage breakdown by agent will appear after sessions run.</p>
                                        <a class="empty-state__link" routerLink="/agents">View agents</a>
                                    </div>
                                }
                            </div>
                            }
                        }

                        <!-- activity -->
                        @if (widget.id === 'activity') {
                            @if (widgetErrors()['activity']) {
                                <div class="widget-error">
                                    <span class="widget-error__icon">!</span>
                                    <span class="widget-error__msg">{{ widgetErrors()['activity'] }}</span>
                                    <button class="widget-error__retry" (click)="refreshWidget('activity')">Retry</button>
                                </div>
                            } @else {
                            <div class="section section--feed">
                                <div class="section__header">
                                    <h3>Recent Activity</h3>
                                    <button class="section__refresh" [class.section__refresh--spinning]="widgetRefreshing()['activity']" (click)="refreshWidget('activity')" title="Refresh">&#x21bb;</button>
                                </div>
                                @if (activityFeed().length === 0) {
                                    <div class="empty-state">
                                        <p class="empty-state__title">No recent activity</p>
                                        <p class="empty-state__hint">Start a conversation, create a work task, or launch a council to see activity here.</p>
                                        <div class="empty-state__actions">
                                            <a class="empty-state__link" routerLink="/sessions/new">New conversation</a>
                                            <a class="empty-state__link" routerLink="/work-tasks">Create work task</a>
                                        </div>
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
                        }

                        <!-- quick-actions -->
                        @if (widget.id === 'quick-actions') {
                            <div class="section section--actions">
                                <h3>Quick Actions</h3>
                                <div class="quick-actions">
                                    <button class="action-btn" (click)="navigateTo('/sessions/new')">+ New Conversation</button>
                                    <button class="action-btn" (click)="navigateTo('/sessions/councils')">Launch Council</button>
                                    <button class="action-btn" (click)="navigateTo('/sessions/work-tasks')">Create Work Task</button>
                                    <button class="action-btn action-btn--selftest" [disabled]="selfTestRunning()" (click)="runSelfTest()">
                                        {{ selfTestRunning() ? 'Running...' : 'Run Self-Test' }}
                                    </button>
                                </div>
                            </div>
                        }

                        <!-- system-status -->
                        @if (widget.id === 'system-status') {
                            @if (widgetErrors()['system-status']) {
                                <div class="widget-error">
                                    <span class="widget-error__icon">!</span>
                                    <span class="widget-error__msg">{{ widgetErrors()['system-status'] }}</span>
                                    <button class="widget-error__retry" (click)="refreshWidget('system-status')">Retry</button>
                                </div>
                            } @else {
                            <div class="section section--status">
                                <div class="section__header">
                                    <h3>System Status</h3>
                                    <button class="section__refresh" [class.section__refresh--spinning]="widgetRefreshing()['system-status']" (click)="refreshWidget('system-status')" title="Refresh">&#x21bb;</button>
                                </div>
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
                                        <h4>Active Councils ({{ activeCouncilLaunches().length }})</h4>
                                        @for (launch of activeCouncilLaunches().slice(0, 10); track launch.id) {
                                            <div class="running-item">
                                                <a [routerLink]="['/sessions/council-launches', launch.id]">{{ launch.prompt.length > 50 ? launch.prompt.slice(0, 50) + '...' : launch.prompt }}</a>
                                                <span class="stage-badge" [attr.data-stage]="launch.stage">{{ launch.stage }}</span>
                                            </div>
                                        }
                                    </div>
                                }
                            </div>
                            }
                        }

                        <!-- flock -->
                        @if (widget.id === 'flock') {
                            @if (flockAgents().length > 0) {
                                <div class="section">
                                    <div class="section__header">
                                        <h3>Flock Directory</h3>
                                        <div class="section__header-actions">
                                            @if (flockStats(); as stats) {
                                                <span class="flock-stats">{{ stats.active }} active agents</span>
                                            }
                                            <button class="section__refresh" [class.section__refresh--spinning]="widgetRefreshing()['flock']" (click)="refreshWidget('flock')" title="Refresh">&#x21bb;</button>
                                        </div>
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
                                        <button class="section__refresh" [class.section__refresh--spinning]="widgetRefreshing()['comparison']" (click)="refreshWidget('comparison')" title="Refresh">&#x21bb;</button>
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
    styleUrl: './dashboard.component.css',
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
    private readonly tourService = inject(GuidedTourService);

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

    // Per-widget error + refresh state
    protected readonly widgetErrors = signal<Record<string, string>>({});
    protected readonly widgetRefreshing = signal<Record<string, boolean>>({});

    // Chart hover tooltips
    protected readonly hoveredBar = signal<{ date: string; dateShort: string; value: number; pct: number; cumulative: number } | null>(null);
    protected readonly hoveredSegment = signal<{ status: string; count: number } | null>(null);

    // Last refresh timestamp
    protected readonly lastRefresh = signal<string | null>(null);


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

    // Connection state for the toolbar badge
    protected readonly connectionState = computed(() => {
        if (this.wsService.serverRestarting()) return 'reconnecting';
        return this.wsService.connected() ? 'connected' : 'disconnected';
    });
    protected readonly connectionLabel = computed(() => {
        switch (this.connectionState()) {
            case 'connected': return 'Live';
            case 'reconnecting': return 'Reconnecting…';
            case 'disconnected': return 'Offline';
        }
    });

    protected readonly activeWorkTaskCount = computed(() => {
        const tasks = this.overview()?.workTasks;
        if (!tasks) return 0;
        return (tasks['pending'] ?? 0) + (tasks['running'] ?? 0) + (tasks['branching'] ?? 0) + (tasks['validating'] ?? 0);
    });

    protected readonly activeScheduleCount = computed(() =>
        this.scheduleService.schedules().filter((s) => s.status === 'active').length,
    );

    // Spending chart bars (vertical) with cumulative totals
    protected readonly spendingBars = computed(() => {
        const data = this.spendingData();
        if (!data) return [];
        const dateMap = new Map<string, number>();
        for (const d of data.spending) dateMap.set(d.date, (dateMap.get(d.date) ?? 0) + d.api_cost_usd);
        for (const d of data.sessionCosts) dateMap.set(d.date, (dateMap.get(d.date) ?? 0) + d.cost_usd);
        const entries = Array.from(dateMap.entries()).map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
        const max = Math.max(...entries.map((e) => e.value), 0.001);
        let cumulative = 0;
        return entries.map((e) => {
            cumulative += e.value;
            return {
                date: e.date,
                dateShort: e.date.slice(5),
                value: e.value,
                pct: (e.value / max) * 100,
                cumulative,
            };
        });
    });

    protected readonly spendingTotal = computed(() =>
        this.spendingBars().reduce((sum, b) => sum + b.value, 0),
    );

    protected readonly spendingDailyAvg = computed(() => {
        const bars = this.spendingBars();
        return bars.length > 0 ? this.spendingTotal() / bars.length : 0;
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
        return id === 'metrics' || id === 'agents' || id === 'active-sessions' || id === 'flock' || id === 'comparison';
    }

    /** Returns 'green' (active now), 'yellow' (active within 24h), 'red' (inactive >24h) */
    protected getAgentHealth(summary: AgentSummary): string {
        if (summary.runningSessions > 0) return 'green';
        if (!summary.lastActive) return 'red';
        const hoursAgo = (Date.now() - new Date(summary.lastActive).getTime()) / (1000 * 60 * 60);
        if (hoursAgo < 24) return 'yellow';
        return 'red';
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

    @HostListener('document:keydown', ['$event'])
    handleKeyboard(event: KeyboardEvent): void {
        // Ignore if typing in an input/textarea
        const tag = (event.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

        switch (event.key.toLowerCase()) {
            case 'r':
                if (!event.ctrlKey && !event.metaKey) {
                    event.preventDefault();
                    this.refreshAll();
                }
                break;
            case '1':
                if (!event.ctrlKey && !event.metaKey) {
                    this.layoutService.setViewMode('simple');
                }
                break;
            case '2':
                if (!event.ctrlKey && !event.metaKey) {
                    this.layoutService.setViewMode('developer');
                }
                break;
        }
    }

    protected async refreshAll(): Promise<void> {
        this.notify.info('Refreshing dashboard...');
        const loads = [
            this.loadOverview(),
            this.agentService.loadAgents().then(() => this.loadAgentSummaries()),
            this.sessionService.loadSessions(),
            this.sessionService.loadAlgoChatStatus(),
            this.loadSpendingData(),
            this.loadSessionStats(),
            this.loadActiveCouncilLaunches(),
            this.loadServerVersion(),
            this.loadFlockDirectory(),
            this.loadAgentMessages(),
        ];
        await Promise.allSettled(loads);
        this.lastRefresh.set(new Date().toISOString());
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
        Promise.allSettled(loads).then(() => {
            this.loading.set(false);
            this.lastRefresh.set(new Date().toISOString());
            // Auto-start guided tour on first visit when agents exist
            if (!this.tourService.isCompleted && this.agentService.agents().length > 0 && !this.showWelcome()) {
                setTimeout(() => this.tourService.startTour(), 800);
            }
        });

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
        this.agentService.loadAgents().then(() => {
            this.loadAgentSummaries();
            // Start guided tour after first agent is created (slight delay for DOM to render)
            if (!this.tourService.isCompleted) {
                setTimeout(() => this.tourService.startTour(), 600);
            }
        });
        this.loadOverview();
    }

    protected getAgentName(agentId: string | null): string {
        if (!agentId) return 'Agent';
        const agent = this.agentService.agents().find((a) => a.id === agentId);
        return agent?.name ?? 'Agent';
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
        this.router.navigate(['/sessions/work-tasks'], { queryParams: { agentId } });
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

    // Per-widget refresh
    protected async refreshWidget(widgetId: WidgetId): Promise<void> {
        this.widgetRefreshing.update((r) => ({ ...r, [widgetId]: true }));
        this.widgetErrors.update((e) => { const copy = { ...e }; delete copy[widgetId]; return copy; });
        try {
            switch (widgetId) {
                case 'metrics': await this.loadOverview(); break;
                case 'agents': await this.agentService.loadAgents().then(() => this.loadAgentSummaries()); break;
                case 'active-sessions': await this.sessionService.loadSessions(); break;
                case 'spending-chart': await this.loadSpendingData(); break;
                case 'session-chart': case 'agent-usage-chart': await this.loadSessionStats(); break;
                case 'activity': await Promise.all([this.sessionService.loadSessions(), this.workTaskService.loadTasks(), this.loadAgentMessages()]); break;
                case 'system-status': await Promise.all([this.loadServerVersion(), this.loadActiveCouncilLaunches()]); break;
                case 'flock': await this.loadFlockDirectory(); break;
                case 'comparison': await this.agentService.loadAgents().then(() => this.loadAgentSummaries()); break;
            }
        } catch (err) {
            this.widgetErrors.update((e) => ({ ...e, [widgetId]: 'Failed to load data' }));
        } finally {
            this.widgetRefreshing.update((r) => ({ ...r, [widgetId]: false }));
        }
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

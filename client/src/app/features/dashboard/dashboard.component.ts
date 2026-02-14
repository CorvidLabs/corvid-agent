import { Component, ChangeDetectionStrategy, inject, OnInit, OnDestroy, computed, signal, ElementRef } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { ProjectService } from '../../core/services/project.service';
import { AgentService } from '../../core/services/agent.service';
import { SessionService } from '../../core/services/session.service';
import { CouncilService } from '../../core/services/council.service';
import { WebSocketService } from '../../core/services/websocket.service';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { TerminalChatComponent, type TerminalMessage, type ToolEvent } from '../../shared/components/terminal-chat.component';
import { ApiService } from '../../core/services/api.service';
import type { ServerWsMessage } from '../../core/models/ws-message.model';
import type { Agent } from '../../core/models/agent.model';
import { COMMAND_DEFS, type CommandDef } from '../../../../../shared/command-defs';
import { firstValueFrom } from 'rxjs';

interface AgentSummary {
    agent: Agent;
    balance: number;
    messageCount: number;
}

@Component({
    selector: 'app-dashboard',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, DecimalPipe, StatusBadgeComponent, TerminalChatComponent],
    template: `
        <!-- Mobile tab switcher -->
        <div class="dashboard__mobile-tabs">
            <button
                class="mobile-tab"
                [class.mobile-tab--active]="mobileTab() === 'chat'"
                (click)="mobileTab.set('chat')"
            >Chat</button>
            <button
                class="mobile-tab"
                [class.mobile-tab--active]="mobileTab() === 'overview'"
                (click)="mobileTab.set('overview')"
            >Overview</button>
        </div>

        <div class="dashboard">
            <!-- LEFT PANEL: Chat -->
            <div
                class="dashboard__left"
                [class.dashboard__left--hidden]="panelMode() === 'overview-only'"
                [class.dashboard__left--full]="panelMode() === 'chat-only'"
                [class.dashboard__left--custom]="customLeftWidth() !== null && panelMode() === 'both'"
                [style.width.px]="panelMode() === 'both' && customLeftWidth() !== null ? customLeftWidth() : null"
                [class.mobile-hidden]="mobileTab() !== 'chat'"
            >
                @if (algochatStatus(); as status) {
                    <div class="panel-status">
                        @if (status.address === 'local') {
                            <span class="local-badge">Local</span>
                        } @else if (status.enabled) {
                            <span class="network-badge" [class.network-badge--localnet]="status.network === 'localnet'" [class.network-badge--testnet]="status.network === 'testnet'" [class.network-badge--mainnet]="status.network === 'mainnet'">{{ status.network }}</span>
                            <span class="algo-balance" [class.algo-balance--low]="status.balance < 1000000">{{ status.balance / 1000000 | number:'1.2-4' }} ALGO</span>
                        } @else {
                            <span class="panel-status__disabled">AlgoChat off</span>
                        }
                        <span class="panel-status__convos">{{ status.activeConversations }} convos</span>
                    </div>
                }

                @if (isLocalChat()) {
                    @if (agentService.agents().length === 0) {
                        <p class="panel-status__empty">Create an agent to start chatting.</p>
                    } @else {
                        <div class="chat-controls">
                            <select
                                class="chat-select"
                                [value]="selectedProjectId()"
                                (change)="onProjectSelect($event)"
                                aria-label="Select a project"
                            >
                                <option value="" disabled>Select project...</option>
                                @for (project of projectService.projects(); track project.id) {
                                    <option [value]="project.id">{{ project.name }}</option>
                                }
                            </select>
                            <select
                                class="chat-select"
                                [value]="selectedAgentId()"
                                (change)="onAgentSelect($event)"
                                aria-label="Select an agent"
                            >
                                <option value="" disabled>Select agent...</option>
                                @for (agent of agentService.agents(); track agent.id) {
                                    <option [value]="agent.id">{{ agent.name }}</option>
                                }
                            </select>
                            @if (agentBalance() > 0 && selectedAgentId()) {
                                <span class="chat-balance">{{ agentBalance() / 1000000 | number:'1.4-4' }} ALGO</span>
                            }
                            @if (selectedAgentId()) {
                                <button
                                    class="chat-tip-btn"
                                    (click)="tipAgent()"
                                    aria-label="Tip agent 0.1 ALGO"
                                >{{ tipped() ? 'Tipped!' : 'Tip 0.1' }}</button>
                            }
                        </div>
                        <app-terminal-chat
                            [messages]="chatMessages()"
                            [streamBuffer]="streamBuffer()"
                            [streamDone]="streamDone()"
                            [thinking]="thinking()"
                            [toolEvents]="toolEvents()"
                            [inputDisabled]="!selectedAgentId()"
                            [commandDefs]="commandDefs"
                            [agentNames]="chatAgentNames()"
                            (messageSent)="onChatMessage($event)"
                            (rewardSent)="tipAgent()"
                        />
                    }
                } @else {
                    <div class="panel-status__empty">
                        <p>AlgoChat is not enabled. Configure ALGOCHAT_MNEMONIC in .env to start chatting.</p>
                    </div>
                }
            </div>

            <!-- DIVIDER -->
            <div
                class="dashboard__divider"
                (mousedown)="onDividerMouseDown($event)"
                (dblclick)="resetDivider()"
            >
                <button
                    class="divider__btn"
                    (click)="togglePanel('left'); $event.stopPropagation()"
                    [attr.aria-label]="panelMode() === 'overview-only' ? 'Show Chat' : 'Hide Chat'"
                    [attr.title]="panelMode() === 'overview-only' ? 'Show Chat' : 'Hide Chat'"
                >{{ panelMode() === 'overview-only' ? '\u25B6 Chat' : '\u25C0 Chat' }}</button>
                <span class="divider__grip">\u22EE</span>
                <button
                    class="divider__btn"
                    (click)="togglePanel('right'); $event.stopPropagation()"
                    [attr.aria-label]="panelMode() === 'chat-only' ? 'Show Overview' : 'Hide Overview'"
                    [attr.title]="panelMode() === 'chat-only' ? 'Show Overview' : 'Hide Overview'"
                >{{ panelMode() === 'chat-only' ? 'Stats \u25C0' : 'Stats \u25B6' }}</button>
            </div>

            <!-- RIGHT PANEL: Overview -->
            <div
                class="dashboard__right"
                [class.dashboard__right--hidden]="panelMode() === 'chat-only'"
                [class.mobile-hidden]="mobileTab() !== 'overview'"
            >
                <!-- Summary Cards -->
                <div class="dashboard__cards">
                    <div class="card">
                        <h3 class="card__title">Projects</h3>
                        <p class="card__count">{{ projectService.projects().length }}</p>
                        <a class="card__link" routerLink="/projects">View all</a>
                    </div>
                    <div class="card">
                        <h3 class="card__title">Agents</h3>
                        <p class="card__count">{{ agentService.agents().length }}</p>
                        <a class="card__link" routerLink="/agents">View all</a>
                    </div>
                    <div class="card">
                        <h3 class="card__title">Councils</h3>
                        <p class="card__count">{{ councilService.councils().length }}</p>
                        <a class="card__link" routerLink="/councils">View all</a>
                    </div>
                    <div class="card">
                        <h3 class="card__title">Conversations</h3>
                        <p class="card__count">{{ sessionService.sessions().length }}</p>
                        <a class="card__link" routerLink="/sessions">View all</a>
                    </div>
                    <div class="card">
                        <h3 class="card__title">Running</h3>
                        <p class="card__count">{{ runningSessions().length }}</p>
                    </div>
                </div>

                <!-- Quick Actions -->
                <div class="dashboard__actions">
                    <button class="action-btn" (click)="navigateTo('/sessions/new')">+ Conversation</button>
                    <button class="action-btn" (click)="navigateTo('/councils')">Launch Council</button>
                    <button class="action-btn" (click)="navigateTo('/work-tasks')">Work Tasks</button>
                    <button
                        class="action-btn action-btn--selftest"
                        [disabled]="selfTestRunning()"
                        (click)="runSelfTest()"
                    >{{ selfTestRunning() ? 'Running...' : 'Self-Test' }}</button>
                </div>

                <!-- Usage Stats -->
                <div class="dashboard__spending">
                    <h3>Usage</h3>
                    <div class="spending-grid">
                        <div class="spending-item">
                            <span class="spending-item__value">{{ totalMessages() }}</span>
                            <span class="spending-item__label">Total Messages</span>
                        </div>
                        <div class="spending-item">
                            <span class="spending-item__value">{{ algochatAgentCount() }}</span>
                            <span class="spending-item__label">AlgoChat Enabled</span>
                        </div>
                        <div class="spending-item">
                            <span class="spending-item__value">{{ (totalAgentAlgoMicro() / 1000000).toFixed(2) }}</span>
                            <span class="spending-item__label">Agent ALGO (localnet)</span>
                        </div>
                        @if (walletBalance(); as wallet) {
                            <div class="spending-item">
                                <span class="spending-item__value">{{ (wallet.balance / 1000000).toFixed(2) }}</span>
                                <span class="spending-item__label">Wallet ({{ wallet.network }})</span>
                            </div>
                        }
                        <div class="spending-item spending-item--link" (click)="goToConversation()">
                            <span class="spending-item__value">{{ conversations().length }}</span>
                            <span class="spending-item__label">Conversations</span>
                        </div>
                    </div>
                </div>

                <!-- Agent Cards -->
                @if (agentSummaries().length > 0) {
                    <div class="dashboard__agents">
                        <h3>Agents</h3>
                        <div class="agents-grid">
                            @for (summary of agentSummaries(); track summary.agent.id) {
                                <a class="agent-card" [routerLink]="['/agents', summary.agent.id]">
                                    <div class="agent-card__header">
                                        <span class="agent-card__name">{{ summary.agent.name }}</span>
                                        <div class="agent-card__badges">
                                            @if (summary.agent.algochatEnabled) {
                                                <span class="agent-badge agent-badge--algochat">AlgoChat</span>
                                            }
                                            @if (summary.agent.algochatAuto) {
                                                <span class="agent-badge agent-badge--auto">Auto</span>
                                            }
                                        </div>
                                    </div>
                                    <div class="agent-card__stats">
                                        <div class="agent-stat">
                                            <span class="agent-stat__value" [class.agent-stat__value--zero]="summary.balance === 0">{{ (summary.balance / 1000000).toFixed(4) }}</span>
                                            <span class="agent-stat__label">ALGO (localnet)</span>
                                        </div>
                                        <div class="agent-stat">
                                            <span class="agent-stat__value">{{ summary.messageCount }}</span>
                                            <span class="agent-stat__label">Messages</span>
                                        </div>
                                        <div class="agent-stat">
                                            <span class="agent-stat__value agent-stat__value--model">{{ summary.agent.model || 'default' }}</span>
                                            <span class="agent-stat__label">Model</span>
                                        </div>
                                    </div>
                                    @if (summary.agent.walletAddress) {
                                        <div class="agent-card__wallet">
                                            <code>{{ summary.agent.walletAddress.slice(0, 8) }}...{{ summary.agent.walletAddress.slice(-4) }}</code>
                                        </div>
                                    }
                                    @if (summary.agent.description) {
                                        <div class="agent-card__desc">{{ summary.agent.description }}</div>
                                    }
                                </a>
                            }
                        </div>
                    </div>
                }

                <!-- Active Councils -->
                @if (activeCouncilLaunches().length > 0) {
                    <div class="dashboard__running">
                        <h3>Active Councils</h3>
                        @for (launch of activeCouncilLaunches(); track launch.id) {
                            <div class="running-session">
                                <a [routerLink]="['/council-launches', launch.id]">{{ launch.prompt.length > 60 ? launch.prompt.slice(0, 60) + '...' : launch.prompt }}</a>
                                <span class="stage-badge" [attr.data-stage]="launch.stage">{{ launch.stage }}</span>
                            </div>
                        }
                    </div>
                }

                <!-- Active Sessions -->
                @if (runningSessions().length > 0) {
                    <div class="dashboard__running">
                        <h3>Active Conversations</h3>
                        @for (session of runningSessions(); track session.id) {
                            <div class="running-session">
                                <a [routerLink]="['/sessions', session.id]">{{ session.name || session.id }}</a>
                                <app-status-badge [status]="session.status" />
                            </div>
                        }
                    </div>
                }
            </div>
        </div>
    `,
    styles: `
        :host {
            display: flex;
            flex-direction: column;
            height: 100%;
        }

        /* Mobile tab switcher */
        .dashboard__mobile-tabs {
            display: none;
            gap: 0;
            background: var(--bg-surface);
            border-bottom: 1px solid var(--border);
            flex-shrink: 0;
        }
        .mobile-tab {
            flex: 1;
            padding: 0.6rem 1rem;
            background: transparent;
            color: var(--text-secondary);
            border: none;
            border-bottom: 2px solid transparent;
            font-family: inherit;
            font-size: 0.85rem;
            font-weight: 600;
            cursor: pointer;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            transition: color 0.15s, border-color 0.15s;
        }
        .mobile-tab:hover { color: var(--text-primary); }
        .mobile-tab--active {
            color: var(--accent-cyan);
            border-bottom-color: var(--accent-cyan);
        }

        /* Main layout */
        .dashboard {
            display: flex;
            flex: 1;
            min-height: 0;
            overflow: hidden;
        }

        /* Left panel — uses flex-grow/shrink with clamped widths */
        .dashboard__left {
            flex: 45 0 0px;
            min-width: 360px;
            max-width: 600px;
            display: flex;
            flex-direction: column;
            padding: 1rem;
            overflow: hidden;
            opacity: 1;
            transition: opacity 0.2s ease;
        }
        .dashboard__left--hidden {
            flex: 0 0 0px;
            min-width: 0;
            max-width: 0;
            opacity: 0;
            pointer-events: none;
            padding: 0;
        }
        .dashboard__left--full {
            flex: 1 0 0px;
            max-width: none;
        }
        .dashboard__left--custom { flex: 0 0 auto; min-width: 280px; max-width: 80%; }
        .dashboard__left app-terminal-chat {
            flex: 1;
            min-height: 0;
            display: flex;
            flex-direction: column;
        }

        /* Panel status bar */
        .panel-status {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0.5rem 0.75rem;
            margin-bottom: 0.75rem;
            background: var(--bg-surface);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            flex-shrink: 0;
        }
        .panel-status__convos { font-size: 0.75rem; color: var(--text-tertiary); margin-left: auto; }
        .panel-status__disabled { font-size: 0.75rem; color: var(--text-tertiary); }
        .panel-status__empty { color: var(--text-secondary); padding: 1rem; font-size: 0.85rem; }

        /* Divider */
        .dashboard__divider {
            flex: 0 0 10px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 6px;
            background: var(--bg-surface);
            border-left: 1px solid var(--border);
            border-right: 1px solid var(--border);
            cursor: col-resize;
            user-select: none;
            padding: 8px 0;
        }
        .dashboard__divider:hover { border-color: var(--accent-cyan); background: rgba(0, 229, 255, 0.04); }
        .divider__btn {
            display: flex; align-items: center; justify-content: center;
            background: var(--bg-raised); border: 1px solid var(--border); border-radius: var(--radius-sm);
            color: var(--text-tertiary); font-size: 0.55rem; font-family: inherit; font-weight: 600;
            cursor: pointer; padding: 3px 2px; white-space: nowrap;
            transition: color 0.15s, border-color 0.15s, background 0.15s;
            writing-mode: vertical-lr; text-orientation: mixed;
        }
        .divider__btn:hover { color: var(--accent-cyan); border-color: var(--accent-cyan); background: rgba(0, 229, 255, 0.05); }
        .divider__grip { color: var(--text-tertiary); font-size: 0.8rem; opacity: 0.5; line-height: 1; }
        .dashboard__divider:hover .divider__grip { opacity: 1; color: var(--accent-cyan); }

        /* Right panel */
        .dashboard__right {
            flex: 55 1 0px;
            min-width: 0;
            overflow-y: auto;
            padding: 1rem 1.25rem;
            opacity: 1;
            transition: opacity 0.2s ease;
        }
        .dashboard__right--hidden {
            flex: 0 0 0px;
            min-width: 0;
            max-width: 0;
            opacity: 0;
            pointer-events: none;
            padding: 0;
            overflow: hidden;
        }
        .dashboard__right h3 {
            color: var(--text-primary);
            margin: 0 0 0.75rem;
        }

        /* Summary cards */
        .dashboard__cards {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
            gap: 0.75rem;
            margin-bottom: 1.25rem;
        }
        .card {
            background: var(--bg-surface);
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
            padding: 0.75rem;
            transition: border-color 0.2s, box-shadow 0.2s;
        }
        .card:hover { border-color: var(--border-bright); }
        .card__title { margin: 0 0 0.25rem; font-size: 0.65rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.08em; }
        .card__count { margin: 0 0 0.25rem; font-size: 1.5rem; font-weight: 700; color: var(--accent-cyan); }
        .card__link { font-size: 0.7rem; color: var(--accent-cyan); text-decoration: none; opacity: 0.8; }
        .card__link:hover { opacity: 1; text-decoration: underline; }

        /* Quick actions */
        .dashboard__actions {
            display: flex;
            gap: 0.5rem;
            flex-wrap: wrap;
            margin-bottom: 1.25rem;
        }
        .action-btn {
            padding: 0.45rem 0.85rem;
            border-radius: var(--radius);
            font-size: 0.75rem;
            font-weight: 600;
            cursor: pointer;
            border: 1px solid var(--accent-cyan);
            background: rgba(0, 229, 255, 0.06);
            color: var(--accent-cyan);
            font-family: inherit;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            transition: background 0.15s;
            white-space: nowrap;
        }
        .action-btn:hover:not(:disabled) { background: rgba(0, 229, 255, 0.12); }
        .action-btn--selftest {
            border-color: var(--accent-magenta);
            color: var(--accent-magenta);
            background: rgba(255, 0, 128, 0.06);
        }
        .action-btn--selftest:hover:not(:disabled) { background: rgba(255, 0, 128, 0.12); }
        .action-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        /* Spending summary */
        .dashboard__spending {
            margin-bottom: 1.25rem;
            background: var(--bg-surface);
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
            padding: 0.75rem 1rem;
        }
        .dashboard__spending h3 { margin: 0 0 0.5rem; }
        .spending-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); gap: 0.75rem; }
        .spending-item { display: flex; flex-direction: column; gap: 0.15rem; }
        .spending-item__value { font-size: 1rem; font-weight: 700; color: var(--accent-green); }
        .spending-item__label { font-size: 0.6rem; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.06em; }
        .spending-item--link { cursor: pointer; }
        .spending-item--link:hover { opacity: 0.7; }

        /* Agent cards */
        .dashboard__agents { margin-bottom: 1.25rem; }
        .agents-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
            gap: 0.75rem;
        }
        .agent-card {
            display: block;
            background: var(--bg-surface);
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
            padding: 0.75rem;
            transition: border-color 0.2s, box-shadow 0.2s;
            text-decoration: none;
            color: inherit;
            cursor: pointer;
        }
        .agent-card:hover { border-color: var(--accent-cyan); box-shadow: 0 0 12px rgba(0, 229, 255, 0.1); }
        .agent-card__header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; }
        .agent-card__name { font-weight: 700; font-size: 0.85rem; color: var(--text-primary); }
        .agent-card__badges { display: flex; gap: 0.35rem; }
        .agent-badge { font-size: 0.6rem; font-weight: 700; padding: 2px 6px; border-radius: var(--radius-sm); text-transform: uppercase; letter-spacing: 0.06em; }
        .agent-badge--algochat { color: var(--accent-magenta); background: rgba(255, 0, 170, 0.08); border: 1px solid rgba(255, 0, 170, 0.25); }
        .agent-badge--auto { color: var(--accent-green); background: rgba(0, 255, 136, 0.08); border: 1px solid rgba(0, 255, 136, 0.25); }
        .agent-card__stats { display: flex; gap: 1rem; margin-bottom: 0.35rem; }
        .agent-stat { display: flex; flex-direction: column; gap: 0.1rem; }
        .agent-stat__value { font-size: 1rem; font-weight: 700; color: var(--accent-cyan); }
        .agent-stat__value--zero { color: var(--text-tertiary); text-shadow: none; }
        .agent-stat__value--model { font-size: 0.65rem; font-weight: 600; color: var(--text-secondary); text-shadow: none; font-family: var(--font-mono, monospace); line-height: 1.6; }
        .agent-stat__label { font-size: 0.55rem; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.06em; }
        .agent-card__wallet { margin-bottom: 0.25rem; }
        .agent-card__wallet code { font-size: 0.6rem; padding: 1px 5px; color: var(--text-tertiary); background: var(--bg-raised); border: 1px solid var(--border); border-radius: var(--radius-sm); }
        .agent-card__desc { font-size: 0.7rem; color: var(--text-tertiary); line-height: 1.4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        code { background: var(--bg-raised); color: var(--accent-magenta); padding: 2px 6px; border-radius: var(--radius-sm); font-size: 0.8rem; border: 1px solid var(--border); }
        .local-badge { display: inline-block; background: var(--accent-cyan-dim); color: var(--accent-cyan); padding: 2px 8px; border-radius: var(--radius-sm); font-size: 0.7rem; font-weight: 600; border: 1px solid rgba(0, 229, 255, 0.3); letter-spacing: 0.05em; }
        .network-badge { display: inline-block; padding: 2px 8px; border-radius: var(--radius-sm); font-size: 0.7rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; border: 1px solid; }
        .network-badge--localnet { color: #f5a623; background: rgba(245, 166, 35, 0.1); border-color: rgba(245, 166, 35, 0.4); }
        .network-badge--testnet { color: #4a90d9; background: rgba(74, 144, 217, 0.1); border-color: rgba(74, 144, 217, 0.4); }
        .network-badge--mainnet { color: #50e3c2; background: rgba(80, 227, 194, 0.1); border-color: rgba(80, 227, 194, 0.4); }
        .algo-balance { font-weight: 700; color: var(--accent-green); font-size: 0.8rem; }
        .algo-balance--low { color: var(--accent-red, #ff4d4f); }

        .chat-controls { margin-bottom: 0.5rem; display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; flex-shrink: 0; }
        .chat-select { padding: 0.4rem; border: 1px solid var(--border-bright); border-radius: var(--radius); font-size: 0.8rem; font-family: inherit; min-width: 140px; background: var(--bg-input); color: var(--text-primary); }
        .chat-select:focus { border-color: var(--accent-cyan); box-shadow: var(--glow-cyan); outline: none; }
        .chat-balance { font-size: 0.75rem; color: var(--accent-green); font-weight: 600; padding: 0.35rem 0.6rem; background: rgba(80, 227, 194, 0.08); border: 1px solid rgba(80, 227, 194, 0.2); border-radius: var(--radius); }
        .chat-tip-btn { padding: 0.35rem 0.6rem; background: transparent; color: var(--accent-green); border: 1px solid var(--accent-green); border-radius: var(--radius); font-size: 0.7rem; font-family: inherit; font-weight: 600; cursor: pointer; text-transform: uppercase; letter-spacing: 0.05em; transition: background 0.15s; white-space: nowrap; }
        .chat-tip-btn:hover { background: rgba(80, 227, 194, 0.1); }
        .dashboard__running { margin-bottom: 1.25rem; }
        .running-session { display: flex; align-items: center; gap: 0.75rem; padding: 0.4rem 0; border-bottom: 1px solid var(--border); }
        .running-session a { color: var(--accent-cyan); text-decoration: none; font-size: 0.85rem; }
        .running-session a:hover { text-shadow: 0 0 8px rgba(0, 229, 255, 0.3); }
        .stage-badge {
            font-size: 0.65rem; padding: 2px 8px; border-radius: var(--radius-sm); font-weight: 600;
            text-transform: uppercase; letter-spacing: 0.05em; border: 1px solid;
            background: var(--bg-raised); color: var(--text-secondary);
        }
        .stage-badge[data-stage="responding"] { color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .stage-badge[data-stage="reviewing"] { color: var(--accent-magenta); border-color: var(--accent-magenta); }
        .stage-badge[data-stage="synthesizing"] { color: #f5a623; border-color: #f5a623; }
        .stage-badge[data-stage="complete"] { color: var(--accent-green); border-color: var(--accent-green); }

        @media (max-width: 768px) {
            .dashboard__mobile-tabs { display: flex; }
            .dashboard { flex-direction: column; }
            .dashboard__divider { display: none; }
            .dashboard__left, .dashboard__left--hidden, .dashboard__left--full, .dashboard__left--custom,
            .dashboard__right, .dashboard__right--hidden {
                flex: 1 1 auto; min-width: 0; max-width: none;
                opacity: 1; pointer-events: auto; transition: none;
            }
            .dashboard__left--custom { width: auto !important; }
            .dashboard__left { padding: 0.5rem 0; }
            .dashboard__right { padding: 1rem 1.25rem; overflow-y: auto; }
            .mobile-hidden { display: none !important; }
        }
    `,
})
export class DashboardComponent implements OnInit, OnDestroy {
    protected readonly projectService = inject(ProjectService);
    protected readonly agentService = inject(AgentService);
    protected readonly sessionService = inject(SessionService);
    protected readonly councilService = inject(CouncilService);
    private readonly wsService = inject(WebSocketService);
    private readonly apiService = inject(ApiService);
    private readonly router = inject(Router);

    protected readonly algochatStatus = this.sessionService.algochatStatus;
    protected readonly runningSessions = computed(() =>
        this.sessionService.sessions().filter((s) => s.status === 'running')
    );
    protected readonly activeCouncilLaunches = signal<import('../../core/models/council.model').CouncilLaunch[]>([]);

    protected readonly isLocalChat = computed(() => {
        const status = this.algochatStatus();
        return status?.enabled ?? false;
    });

    protected readonly selectedProjectId = signal('');
    protected readonly selectedAgentId = signal('');
    protected readonly chatMessages = signal<TerminalMessage[]>([]);
    protected readonly streamBuffer = signal('');
    protected readonly streamDone = signal(false);
    protected readonly thinking = signal(false);
    protected readonly toolEvents = signal<ToolEvent[]>([]);
    protected readonly tipped = signal(false);
    protected readonly agentBalance = signal(0);
    protected readonly chatSessionId = signal<string | null>(null);
    protected readonly selfTestRunning = signal(false);
    protected readonly agentSummaries = signal<AgentSummary[]>([]);
    protected readonly commandDefs: CommandDef[] = COMMAND_DEFS;
    protected readonly chatAgentNames = computed(() =>
        this.agentService.agents().map((a) => a.name),
    );

    // Two-panel layout signals
    protected readonly panelMode = signal<'both' | 'chat-only' | 'overview-only'>('both');
    protected readonly mobileTab = signal<'chat' | 'overview'>('chat');
    protected readonly customLeftWidth = signal<number | null>(null);

    // Computed usage stats from already-loaded data
    protected readonly totalMessages = computed(() =>
        this.agentSummaries().reduce((sum, s) => sum + s.messageCount, 0),
    );
    protected readonly totalAgentAlgoMicro = computed(() =>
        this.agentSummaries().reduce((sum, s) => sum + s.balance, 0),
    );
    protected readonly algochatAgentCount = computed(() =>
        this.agentService.agents().filter((a) => a.algochatEnabled).length,
    );
    protected readonly walletBalance = computed(() => {
        const status = this.algochatStatus();
        if (!status?.enabled || status.address === 'local') return null;
        return { network: status.network, balance: status.balance };
    });
    protected readonly conversations = signal<{ id: string; sessionId: string | null }[]>([]);

    private readonly el = inject(ElementRef);
    private unsubscribeWs: (() => void) | null = null;
    private dragCleanup: (() => void) | null = null;

    ngOnInit(): void {
        this.projectService.loadProjects();
        this.agentService.loadAgents().then(() => this.loadAgentSummaries());
        this.sessionService.loadSessions();
        this.sessionService.loadAlgoChatStatus();
        this.councilService.loadCouncils();
        this.loadActiveCouncilLaunches();
        this.loadConversations();

        // Restore session from sessionStorage if available
        const savedAgentId = sessionStorage.getItem('dashboard_agentId');
        const savedSessionId = sessionStorage.getItem('dashboard_sessionId');
        if (savedAgentId) {
            this.selectedAgentId.set(savedAgentId);
            if (savedSessionId) {
                this.chatSessionId.set(savedSessionId);
                this.loadChatHistory(savedSessionId);
            }
        }

        this.unsubscribeWs = this.wsService.onMessage((msg: ServerWsMessage) => {
            if (msg.type === 'algochat_message') {
                // Skip inbound messages — already added optimistically in onChatMessage()
                if (msg.direction === 'inbound') return;
                this.chatMessages.update((msgs) => [
                    ...msgs,
                    {
                        content: msg.content,
                        direction: msg.direction,
                        timestamp: new Date(),
                    },
                ]);
            }
            if (msg.type === 'agent_balance') {
                if (msg.agentId === this.selectedAgentId()) {
                    this.agentBalance.set(msg.balance);
                }
                // Update agent summaries with new balance
                this.agentSummaries.update((summaries) =>
                    summaries.map((s) =>
                        s.agent.id === msg.agentId ? { ...s, balance: msg.balance } : s,
                    ),
                );
            }
            if (msg.type === 'chat_stream' && msg.agentId === this.selectedAgentId()) {
                if (msg.done) {
                    this.streamDone.set(true);
                    // The final message event will add the complete message
                    this.streamBuffer.set('');
                } else {
                    this.streamBuffer.update((buf) => buf + msg.chunk);
                    this.streamDone.set(false);
                }
            }
            if (msg.type === 'chat_tool_use' && msg.agentId === this.selectedAgentId()) {
                this.toolEvents.update((events) => [
                    ...events,
                    { toolName: msg.toolName, input: msg.input, timestamp: new Date() },
                ]);
            }
            if (msg.type === 'chat_thinking' && msg.agentId === this.selectedAgentId()) {
                this.thinking.set(msg.active);
            }
            if (msg.type === 'chat_session' && msg.agentId === this.selectedAgentId()) {
                this.chatSessionId.set(msg.sessionId);
                sessionStorage.setItem('dashboard_sessionId', msg.sessionId);
            }
        });
    }

    ngOnDestroy(): void {
        this.unsubscribeWs?.();
        this.dragCleanup?.();
    }

    protected onProjectSelect(event: Event): void {
        const select = event.target as HTMLSelectElement;
        this.selectedProjectId.set(select.value);
    }

    protected onAgentSelect(event: Event): void {
        const select = event.target as HTMLSelectElement;
        this.selectedAgentId.set(select.value);
        this.chatMessages.set([]);
        this.streamBuffer.set('');
        this.streamDone.set(false);
        this.thinking.set(false);
        this.toolEvents.set([]);
        this.agentBalance.set(0);
        this.chatSessionId.set(null);

        sessionStorage.setItem('dashboard_agentId', select.value);
        sessionStorage.removeItem('dashboard_sessionId');

        // Load balance for the selected agent
        if (select.value) {
            this.agentService.getBalance(select.value).then((info) => {
                this.agentBalance.set(info.balance);
            }).catch(() => {
                // Reset to 0 on failure so the UI doesn't show a stale balance
                this.agentBalance.set(0);
            });
        }
    }

    protected onChatMessage(content: string): void {
        const agentId = this.selectedAgentId();
        if (!agentId) return;

        const projectId = this.selectedProjectId() || undefined;
        this.streamBuffer.set('');
        this.streamDone.set(false);
        this.toolEvents.set([]);

        // Show the user's message immediately in chat
        this.chatMessages.update((msgs) => [
            ...msgs,
            { content, direction: 'inbound' as const, timestamp: new Date() },
        ]);

        this.wsService.sendChatMessage(agentId, content, projectId);
    }

    protected tipAgent(): void {
        const agentId = this.selectedAgentId();
        if (!agentId) return;

        this.wsService.sendReward(agentId, 100_000); // 0.1 ALGO
        this.tipped.set(true);
        setTimeout(() => this.tipped.set(false), 2000);
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
            // Error will be visible in the console
        } finally {
            this.selfTestRunning.set(false);
        }
    }

    protected navigateTo(path: string): void {
        this.router.navigate([path]);
    }

    protected togglePanel(side: 'left' | 'right'): void {
        const current = this.panelMode();
        if (side === 'left') {
            this.panelMode.set(current === 'overview-only' ? 'both' : 'overview-only');
        } else {
            this.panelMode.set(current === 'chat-only' ? 'both' : 'chat-only');
        }
    }

    protected resetDivider(): void {
        this.customLeftWidth.set(null);
        this.panelMode.set('both');
    }

    protected onDividerMouseDown(event: MouseEvent): void {
        // Ignore if clicking a button
        if ((event.target as HTMLElement).closest('button')) return;
        if (this.panelMode() !== 'both') return;

        event.preventDefault();
        const host = this.el.nativeElement as HTMLElement;
        host.classList.add('dragging');

        const onMove = (e: MouseEvent) => {
            const container = host.querySelector('.dashboard') as HTMLElement;
            if (!container) return;
            const rect = container.getBoundingClientRect();
            const x = e.clientX - rect.left;
            // Clamp between 280px and 80% of container
            const max = rect.width * 0.8;
            const clamped = Math.max(280, Math.min(x, max));
            this.customLeftWidth.set(clamped);
        };

        const onUp = () => {
            host.classList.remove('dragging');
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            this.dragCleanup = null;
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        this.dragCleanup = onUp;
    }

    private async loadConversations(): Promise<void> {
        try {
            const convos = await firstValueFrom(
                this.apiService.post<{ id: string; sessionId: string | null }[]>('/algochat/conversations', {}),
            );
            this.conversations.set(convos);
        } catch { /* non-critical */ }
    }

    protected goToConversation(): void {
        const convos = this.conversations();
        if (convos.length === 1 && convos[0].sessionId) {
            this.router.navigate(['/sessions', convos[0].sessionId]);
        } else if (convos.length > 0) {
            this.router.navigate(['/sessions']);
        }
    }

    private async loadAgentSummaries(): Promise<void> {
        const agents = this.agentService.agents();
        if (agents.length === 0) return;

        const summaries: AgentSummary[] = await Promise.all(
            agents.map(async (agent) => {
                let balance = 0;
                let messageCount = 0;
                try {
                    const balanceInfo = await this.agentService.getBalance(agent.id);
                    balance = balanceInfo.balance;
                } catch {
                    // Agent may not have a wallet
                }
                try {
                    const messages = await this.agentService.getMessages(agent.id);
                    messageCount = messages.length;
                } catch {
                    // Messages may not be available
                }
                return { agent, balance, messageCount };
            }),
        );

        this.agentSummaries.set(summaries);
    }

    private async loadActiveCouncilLaunches(): Promise<void> {
        try {
            const launches = await this.councilService.getAllLaunches();
            this.activeCouncilLaunches.set(
                launches.filter((l) => l.stage !== 'complete')
            );
        } catch {
            // Non-critical — dashboard still works without council data
        }
    }

    private async loadChatHistory(sessionId: string): Promise<void> {
        try {
            const messages = await this.sessionService.getMessages(sessionId);
            const terminalMessages: TerminalMessage[] = messages.map((m) => ({
                content: m.content,
                direction: (m.role === 'user' ? 'inbound' : 'outbound') as 'inbound' | 'outbound',
                timestamp: new Date(m.timestamp),
            }));
            this.chatMessages.set(terminalMessages);
        } catch {
            // Session may no longer exist
            sessionStorage.removeItem('dashboard_sessionId');
        }
    }
}
